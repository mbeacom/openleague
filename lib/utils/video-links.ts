/**
 * Video links on drills (practice video links spec R2, R3): the data shape,
 * the https-only parser that recognizes YouTube, Vimeo, Google Drive and
 * OneDrive links and normalizes them, the strict write schema, the lenient
 * read and the labels every view shows.
 *
 * Links only: nothing here fetches, resolves or checks a link, and no view
 * built on it makes a request to a provider until the viewer opens a video.
 * Validation is syntactic. The allowlist decides how a link is recognized and
 * shown, never whether it is safe, which is why every view shows the host.
 *
 * Portable (ADR-0020): imports only zod, so both deployables, the server
 * actions and the plan document share it. Never import @prisma/client, next/*
 * or the planner types here (types/practice-planner.ts imports this module's
 * types).
 */
import { z } from "zod";

export const VIDEO_PROVIDERS = ["youtube", "vimeo", "drive", "onedrive", "link"] as const;
export type VideoProvider = (typeof VIDEO_PROVIDERS)[number];

export interface VideoLink {
    /** Normalized https URL. The only field a reader must trust. */
    url: string;
    /** Derived from url on every read and write; stored for readers that only display. */
    provider: VideoProvider;
    /** Whole seconds from 0 to 86_399; YouTube and Vimeo only. Absent = from the start. */
    startSec?: number;
    /** 1-80 characters once cleaned (control characters removed, whitespace collapsed). */
    title?: string;
}

export const MAX_DRILL_VIDEOS = 5;
export const VIDEO_TITLE_MAX = 80;
export const VIDEO_URL_MAX = 500;
export const MAX_VIDEO_START_SEC = 86_399;

export const VIDEO_REQUIRED_MESSAGE = "Paste a video link";
export const VIDEO_HTTPS_MESSAGE = "Use an https link";
export const VIDEO_CREDENTIALS_MESSAGE = "Remove the user name and password from the link";
export const VIDEO_PORT_MESSAGE = "Links with a port number aren't accepted";
export const VIDEO_IP_HOST_MESSAGE = "Use a link with a site name, not an IP address";
export const VIDEO_PUBLIC_HOST_MESSAGE = "Use a link to a public website";
export const VIDEO_URL_LENGTH_MESSAGE = `Links must be at most ${VIDEO_URL_MAX} characters`;
export const VIDEO_TITLE_LENGTH_MESSAGE = `Titles must be at most ${VIDEO_TITLE_MAX} characters`;
export const VIDEO_START_MESSAGE = "Start must be a time like 1:30";
export const VIDEO_ENTRY_MESSAGE = "This video link can't be read";
export const VIDEO_GUIDANCE_TEXT = "Link to videos you're allowed to share. Anyone who opens this plan can follow the link.";

export const drillVideoLimitMessage = (max: number = MAX_DRILL_VIDEOS) => `Up to ${max} videos per drill`;

export const VIDEO_PROVIDER_NAMES: Record<VideoProvider, string> = {
    youtube: "YouTube",
    vimeo: "Vimeo",
    drive: "Google Drive",
    onedrive: "OneDrive",
    link: "Link",
};

const FALLBACK_TITLES: Record<VideoProvider, string> = {
    youtube: "YouTube video",
    vimeo: "Vimeo video",
    drive: "Google Drive video",
    onedrive: "OneDrive video",
    link: "Video link",
};

/** "That YouTube link doesn't point to a video": a known host whose path isn't a video (a channel, a playlist, a folder). */
export const notAVideoMessage = (provider: Exclude<VideoProvider, "link">) => `That ${VIDEO_PROVIDER_NAMES[provider]} link doesn't point to a video`;

export type ParsedVideoUrl = { ok: true; link: VideoLink } | { ok: false; message: string };

// ---------------------------------------------------------------------------
// Start times
// ---------------------------------------------------------------------------

const clampStart = (sec: number): number | undefined => (sec > 0 ? Math.min(MAX_VIDEO_START_SEC, Math.floor(sec)) : undefined);

/** A link's `t=` / `start=` value: "90", "90s", "1m30s", "1h2m3s". Unreadable or zero = from the start. */
export function parseVideoStart(raw: string | null | undefined): number | undefined {
    const value = (raw ?? "").trim().toLowerCase();
    if (/^\d+$/.test(value)) return clampStart(Number(value));
    const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
    if (!match || !value) return undefined;
    const [, h = "0", m = "0", s = "0"] = match;
    return clampStart(Number(h) * 3600 + Number(m) * 60 + Number(s));
}

/** The editor's start field: "1:30", "1:02:03" or plain seconds; empty = from the start. */
export function parseVideoStartInput(raw: string): { ok: true; value: number | undefined } | { ok: false; message: string } {
    const value = raw.trim();
    if (!value) return { ok: true, value: undefined };
    let seconds: number;
    if (/^\d+$/.test(value)) {
        seconds = Number(value);
    } else {
        const match = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(value);
        if (!match) return { ok: false, message: VIDEO_START_MESSAGE };
        const [, h, m, s] = match;
        if (Number(s) > 59 || (h !== undefined && Number(m) > 59)) return { ok: false, message: VIDEO_START_MESSAGE };
        seconds = Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s);
    }
    if (seconds > MAX_VIDEO_START_SEC) return { ok: false, message: VIDEO_START_MESSAGE };
    return { ok: true, value: seconds > 0 ? seconds : undefined };
}

/** "1:30", or "1:02:03" past an hour. */
export function formatVideoStart(sec: number): string {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = String(sec % 60).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtube-nocookie.com"]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d+$/;
const VIMEO_HASH = /^[0-9a-f]+$/i;
const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;
const TRACKING_PARAMS = new Set(["si", "feature", "pp"]);
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

const isOneDriveHost = (host: string) => host === "onedrive.live.com" || host === "1drv.ms" || host.endsWith(".sharepoint.com");

/** Removes `si`, `feature`, `pp` and `utm_*`, touching the query only when one is there (so normalizing twice changes nothing). */
function stripTracking(url: URL): void {
    const keys = [...url.searchParams.keys()];
    if (!keys.some((key) => TRACKING_PARAMS.has(key) || key.startsWith("utm_"))) return;
    for (const key of new Set(keys)) {
        if (TRACKING_PARAMS.has(key) || key.startsWith("utm_")) url.searchParams.delete(key);
    }
}

function segments(url: URL): string[] {
    return url.pathname.split("/").filter(Boolean);
}

function youtubeId(url: URL, host: string): string | null {
    const parts = segments(url);
    if (host === "youtu.be") return parts.length === 1 ? parts[0] : null;
    if (parts.length === 1 && parts[0] === "watch") return url.searchParams.get("v");
    if (parts.length === 2 && ["shorts", "live", "embed"].includes(parts[0])) return parts[1];
    return null;
}

function vimeoParts(url: URL, host: string): { id: string; hash: string | null } | null {
    const parts = segments(url);
    if (host === "player.vimeo.com") {
        if (parts.length !== 2 || parts[0] !== "video") return null;
        return { id: parts[1], hash: url.searchParams.get("h") };
    }
    if (parts.length === 1) return { id: parts[0], hash: url.searchParams.get("h") };
    if (parts.length === 2) return { id: parts[0], hash: parts[1] };
    return null;
}

function driveId(url: URL): string | null {
    const parts = segments(url);
    if (parts[0] === "file" && parts[1] === "d" && parts.length >= 3) return parts[2];
    if (parts.length === 1 && parts[0] === "open") return url.searchParams.get("id");
    return null;
}

function finish(url: string, provider: VideoProvider, startSec?: number): ParsedVideoUrl {
    if (url.length > VIDEO_URL_MAX) return { ok: false, message: VIDEO_URL_LENGTH_MESSAGE };
    return { ok: true, link: { url, provider, ...(startSec !== undefined ? { startSec } : {}) } };
}

/**
 * Parses and normalizes one pasted or stored link (spec R3). https only; no
 * credentials, port or IP-literal host. A recognized host with a path that
 * isn't a video is refused, never kept as a plain link. Idempotent.
 */
export function parseVideoUrl(raw: string): ParsedVideoUrl {
    const input = raw.trim();
    if (!input) return { ok: false, message: VIDEO_REQUIRED_MESSAGE };
    if (!/^https:\/\//i.test(input)) return { ok: false, message: VIDEO_HTTPS_MESSAGE };

    let url: URL;
    try {
        url = new URL(input);
    } catch {
        return { ok: false, message: VIDEO_HTTPS_MESSAGE };
    }
    if (url.protocol !== "https:") return { ok: false, message: VIDEO_HTTPS_MESSAGE };
    if (url.username || url.password) return { ok: false, message: VIDEO_CREDENTIALS_MESSAGE };
    // The URL parser already drops the default port (443), so any port left is a non-default one.
    if (url.port !== "") return { ok: false, message: VIDEO_PORT_MESSAGE };

    // The URL parser lowercases the host and turns numeric forms (3221225994, 0xC0.0.2.10) into dotted IPv4.
    const host = url.hostname.replace(/\.$/, "");
    if (host.startsWith("[") || IPV4.test(host)) return { ok: false, message: VIDEO_IP_HOST_MESSAGE };
    if (!host.includes(".")) return { ok: false, message: VIDEO_PUBLIC_HOST_MESSAGE };

    if (YOUTUBE_HOSTS.has(host)) {
        const id = youtubeId(url, host);
        if (!id || !YOUTUBE_ID.test(id)) return { ok: false, message: notAVideoMessage("youtube") };
        const start = parseVideoStart(url.searchParams.get("t") ?? url.searchParams.get("start"));
        return finish(`https://www.youtube.com/watch?v=${id}`, "youtube", start);
    }

    if (VIMEO_HOSTS.has(host)) {
        const parts = vimeoParts(url, host);
        if (!parts || !VIMEO_ID.test(parts.id) || (parts.hash !== null && !VIMEO_HASH.test(parts.hash))) {
            return { ok: false, message: notAVideoMessage("vimeo") };
        }
        // Vimeo carries the start in the fragment (#t=1m30s); read it before the fragment is dropped.
        const start = parseVideoStart(new URLSearchParams(url.hash.slice(1)).get("t"));
        return finish(`https://vimeo.com/${parts.id}${parts.hash ? `/${parts.hash}` : ""}`, "vimeo", start);
    }

    if (host === "drive.google.com") {
        const id = driveId(url);
        if (!id || !DRIVE_ID.test(id)) return { ok: false, message: notAVideoMessage("drive") };
        const resourceKey = url.searchParams.get("resourcekey");
        const query = resourceKey ? `?${new URLSearchParams({ resourcekey: resourceKey })}` : "";
        return finish(`https://drive.google.com/file/d/${id}/view${query}`, "drive");
    }

    url.hash = "";
    url.hostname = host;
    stripTracking(url);
    return finish(url.toString(), isOneDriveHost(host) ? "onedrive" : "link");
}

// ---------------------------------------------------------------------------
// Entries: normalize, write schema, lenient read
// ---------------------------------------------------------------------------

const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u0080-\u009F​-‍⁠﻿]/g;

/** A title on one line: control and zero-width characters removed, whitespace collapsed, trimmed. */
export function cleanVideoTitle(title: string): string {
    return title.replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();
}

type NormalizedEntry = { ok: true; link: VideoLink } | { ok: false; message: string; path?: (string | number)[] };

/**
 * One stored or edited entry, normalized: the URL re-parsed (its provider
 * re-derived, never trusted), an explicit start kept over the URL's and
 * dropped where it can't apply, the title cleaned. `lenientTitle` (the read
 * path) cuts an over-long title instead of refusing the entry.
 */
export function normalizeVideoLink(entry: unknown, { lenientTitle = false }: { lenientTitle?: boolean } = {}): NormalizedEntry {
    if (typeof entry !== "object" || entry === null) return { ok: false, message: VIDEO_ENTRY_MESSAGE };
    const { url, startSec, title } = entry as { url?: unknown; startSec?: unknown; title?: unknown };
    if (typeof url !== "string") return { ok: false, message: VIDEO_ENTRY_MESSAGE, path: ["url"] };
    const parsed = parseVideoUrl(url);
    if (!parsed.ok) return { ok: false, message: parsed.message, path: ["url"] };

    const link: VideoLink = { url: parsed.link.url, provider: parsed.link.provider };
    if (startSec !== undefined && startSec !== null) {
        if (typeof startSec !== "number" || !Number.isInteger(startSec) || startSec < 0 || startSec > MAX_VIDEO_START_SEC) {
            return { ok: false, message: VIDEO_START_MESSAGE, path: ["startSec"] };
        }
    }
    const start = typeof startSec === "number" ? startSec || undefined : parsed.link.startSec;
    if (start !== undefined && (link.provider === "youtube" || link.provider === "vimeo")) link.startSec = start;

    if (title !== undefined && title !== null) {
        if (typeof title !== "string") return { ok: false, message: VIDEO_ENTRY_MESSAGE, path: ["title"] };
        let cleaned = cleanVideoTitle(title);
        if (cleaned.length > VIDEO_TITLE_MAX) {
            if (!lenientTitle) return { ok: false, message: VIDEO_TITLE_LENGTH_MESSAGE, path: ["title"] };
            cleaned = cleaned.slice(0, VIDEO_TITLE_MAX).trim();
        }
        if (cleaned) link.title = cleaned;
    }
    return { ok: true, link };
}

/**
 * The strict write schema for a list of at most `max` links (spec R3, R12):
 * an invalid entry is a field error at its path. A provider that disagrees
 * with the URL is not an error: writers correct it (normalizeVideoLinks).
 * Validation only, no transform, so input and output types stay the same.
 */
export function videoLinksSchema(max: number) {
    return z
        .array(
            z
                .object({
                    url: z.string(),
                    provider: z.enum(VIDEO_PROVIDERS),
                    startSec: z.number().optional(),
                    title: z.string().optional(),
                })
                .superRefine((entry, ctx) => {
                    const result = normalizeVideoLink(entry);
                    if (!result.ok) ctx.addIssue({ code: "custom", message: result.message, path: result.path ?? [] });
                }),
        )
        .max(max, drillVideoLimitMessage(max));
}

/**
 * Write path: the list normalized, `undefined` when there is none (writers
 * omit the key), or `null` when an entry fails, so the caller keeps the raw
 * list and the schema reports the field error.
 */
export function normalizeVideoLinks(list: readonly unknown[] | undefined): VideoLink[] | undefined | null {
    if (!list || list.length === 0) return undefined;
    const links: VideoLink[] = [];
    for (const entry of list) {
        const result = normalizeVideoLink(entry);
        if (!result.ok) return null;
        links.push(result.link);
    }
    return links;
}

/**
 * Read path (spec R3): videos are advisory and never make a drill or plan
 * unreadable. An unparseable entry is dropped and logged, the rest are kept
 * normalized, and only the first `max` are kept. `undefined` = none. The log
 * names the reason, never the value: a refused link may carry credentials or
 * a private share token.
 */
export function readVideoLinks(raw: unknown, max: number): VideoLink[] | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (!Array.isArray(raw)) {
        console.error(`Dropping an unreadable video list (${typeof raw}).`);
        return undefined;
    }
    const links: VideoLink[] = [];
    for (const entry of raw) {
        const result = normalizeVideoLink(entry, { lenientTitle: true });
        if (result.ok) links.push(result.link);
        else console.error(`Dropping an unreadable video link: ${result.message}${result.path ? ` (${result.path.join(".")})` : ""}`);
    }
    return links.length > 0 ? links.slice(0, max) : undefined;
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/** The coach's title, else "YouTube video", "Vimeo video", "Google Drive video", "OneDrive video" or "Video link". */
export function videoDisplayTitle(link: VideoLink): string {
    return link.title || FALLBACK_TITLES[link.provider];
}

/** The destination's host without `www.` (youtube.com, drive.google.com, example.org), so a link's target is always visible. */
export function videoHost(link: VideoLink): string {
    try {
        return new URL(link.url).hostname.replace(/^www\./, "");
    } catch {
        return link.url;
    }
}

/** The Open link's address: the start applied (`&t=90` on YouTube, `#t=90s` on Vimeo). */
export function videoOpenUrl(link: VideoLink): string {
    if (!link.startSec) return link.url;
    if (link.provider === "youtube") return `${link.url}&t=${link.startSec}`;
    if (link.provider === "vimeo") return `${link.url}#t=${link.startSec}s`;
    return link.url;
}

/** "2 videos", "1 video". */
export const videoCountLabel = (count: number) => (count === 1 ? "1 video" : `${count} videos`);
