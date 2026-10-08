/**
 * The schedule handoff from the hosted "Fetch it for me" page to the static
 * rankings import (hosted league page fetch spec, ADR-0024). The hosted app
 * fetches and parses a league schedule page, then sends the parsed games and
 * teams (never the page's HTML) to the static app in a
 * `#/rankings/import?pull=…` fragment: versioned JSON, deflate-raw
 * compressed, base64url encoded, length-capped both ways.
 *
 * Pure and portable (ADR-0020): the hosted server, the hosted page and the
 * static app all import it.
 */
import { base64UrlDecode, base64UrlEncode, deflateRaw, inflateRaw, PlanLinkTooLargeError } from "@/lib/plan-document/link";
import type { ParsedGame, ParsedSchedule } from "@/lib/ratings/import";

export const SCHEDULE_PULL_FORMAT = "openleague.schedule-pull";
export const SCHEDULE_PULL_VERSION = 1;

/** The fragment value's hard cap, checked before anything is decoded. A 190-game page encodes to about 3 KB. */
export const MAX_PULL_FRAGMENT_LENGTH = 24_000;
/** The inflated JSON's cap: inflation stops as soon as it passes this. */
export const MAX_PULL_JSON_BYTES = 192 * 1024;
export const MAX_PULL_GAMES = 1_000;
export const MAX_PULL_TEAMS = 400;
export const MAX_PULL_RINKS = 100;
/** Lines the parser didn't understand: a sample travels so the preview can list them, not all of them. */
export const MAX_PULL_UNPARSED = 40;
export const MAX_PULL_TEXT = 120;
export const MAX_PULL_SOURCE_URL = 2_048;

export const PULL_TOO_LARGE_MESSAGE = "This schedule is too large to hand to the planner. Save the page and open it in the planner instead.";
export const PULL_UNREADABLE_MESSAGE = "The fetched schedule couldn't be read. Try fetching it again.";
export const PULL_NEWER_MESSAGE = "This schedule came from a newer version of OpenLeague. Reload the planner and fetch it again.";

export interface SchedulePull {
    /** The league page the schedule came from (https). */
    sourceUrl: string;
    /** When the hosted app fetched it (ISO 8601). */
    fetchedAt: string;
    schedule: ParsedSchedule;
}

export type SchedulePullReadResult =
    | { ok: true; pull: SchedulePull }
    | { ok: false; code: "too-large" | "unreadable" | "newer-version"; message: string };

export class SchedulePullTooLargeError extends Error {
    constructor(readonly size: number) {
        super(`Schedule pull is ${size} long`);
        this.name = "SchedulePullTooLargeError";
    }
}

/** Wire tuple: date, time, home, away, home goals, away goals, rink index (-1 for none). */
type WireGame = [string, string | null, string, string, number | null, number | null, number];

interface WirePull {
    f: typeof SCHEDULE_PULL_FORMAT;
    v: number;
    src: string;
    at: string;
    /** [number, name] */
    t: Array<[string, string]>;
    r: string[];
    g: WireGame[];
    u: string[];
}

const clip = (text: string) => (text.length > MAX_PULL_TEXT ? text.slice(0, MAX_PULL_TEXT) : text);

function toWire(pull: SchedulePull): WirePull {
    const { games, teams, unparsed } = pull.schedule;
    if (games.length > MAX_PULL_GAMES) throw new SchedulePullTooLargeError(games.length);
    if (teams.length > MAX_PULL_TEAMS) throw new SchedulePullTooLargeError(teams.length);
    const rinks: string[] = [];
    const rinkIndex = (rink: string | null) => {
        if (rink === null) return -1;
        const name = clip(rink);
        let at = rinks.indexOf(name);
        if (at === -1) {
            if (rinks.length >= MAX_PULL_RINKS) throw new SchedulePullTooLargeError(rinks.length + 1);
            at = rinks.push(name) - 1;
        }
        return at;
    };
    return {
        f: SCHEDULE_PULL_FORMAT,
        v: SCHEDULE_PULL_VERSION,
        src: pull.sourceUrl,
        at: pull.fetchedAt,
        t: teams.map((team) => [team.number, clip(team.name)]),
        g: games.map((game) => [game.date, game.time, game.home, game.away, game.homeGoals, game.awayGoals, rinkIndex(game.rink)]),
        r: rinks,
        u: unparsed.slice(0, MAX_PULL_UNPARSED).map(clip),
    };
}

/** The `pull` fragment value. Throws SchedulePullTooLargeError past any cap, including the fragment length. */
export async function encodeSchedulePull(pull: SchedulePull): Promise<string> {
    if (pull.sourceUrl.length > MAX_PULL_SOURCE_URL) throw new SchedulePullTooLargeError(pull.sourceUrl.length);
    const bytes = new TextEncoder().encode(JSON.stringify(toWire(pull)));
    if (bytes.byteLength > MAX_PULL_JSON_BYTES) throw new SchedulePullTooLargeError(bytes.byteLength);
    const value = base64UrlEncode(await deflateRaw(bytes));
    if (value.length > MAX_PULL_FRAGMENT_LENGTH) throw new SchedulePullTooLargeError(value.length);
    return value;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const TEAM_NUMBER = /^\d{3}$/;

const isText = (value: unknown, max = MAX_PULL_TEXT): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const isGoals = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 99;

function isHttpsUrl(value: unknown): value is string {
    if (!isText(value, MAX_PULL_SOURCE_URL)) return false;
    try {
        return new URL(value).protocol === "https:";
    } catch {
        return false;
    }
}

/** Strict: any shape it doesn't expect makes the whole pull unreadable. Null for unreadable. */
function fromWire(raw: unknown): SchedulePull | null {
    if (typeof raw !== "object" || raw === null) return null;
    const wire = raw as Partial<Record<keyof WirePull, unknown>>;
    if (!isHttpsUrl(wire.src) || !isText(wire.at, 40) || Number.isNaN(Date.parse(wire.at))) return null;
    const { t, r, g, u } = wire;
    if (!Array.isArray(t) || !Array.isArray(r) || !Array.isArray(g) || !Array.isArray(u)) return null;
    if (t.length > MAX_PULL_TEAMS || r.length > MAX_PULL_RINKS || g.length > MAX_PULL_GAMES || u.length > MAX_PULL_UNPARSED) return null;

    const teams: ParsedSchedule["teams"] = [];
    const numbers = new Set<string>();
    for (const entry of t) {
        if (!Array.isArray(entry) || entry.length !== 2) return null;
        const [number, name] = entry as unknown[];
        if (typeof number !== "string" || !TEAM_NUMBER.test(number) || numbers.has(number) || !isText(name)) return null;
        numbers.add(number);
        teams.push({ number, name });
    }
    if (!r.every((rink) => isText(rink))) return null;
    const rinks = r as string[];

    const games: ParsedGame[] = [];
    for (const entry of g) {
        if (!Array.isArray(entry) || entry.length !== 7) return null;
        const [date, time, home, away, homeGoals, awayGoals, rink] = entry as unknown[];
        if (typeof date !== "string" || !DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return null;
        if (time !== null && (typeof time !== "string" || !TIME.test(time))) return null;
        if (typeof home !== "string" || typeof away !== "string" || !numbers.has(home) || !numbers.has(away) || home === away) return null;
        const scored = homeGoals !== null || awayGoals !== null;
        if (scored && !(isGoals(homeGoals) && isGoals(awayGoals))) return null;
        if (typeof rink !== "number" || !Number.isInteger(rink) || rink < -1 || rink >= rinks.length) return null;
        games.push({
            date,
            time,
            home,
            away,
            homeGoals: scored ? (homeGoals as number) : null,
            awayGoals: scored ? (awayGoals as number) : null,
            rink: rink === -1 ? null : rinks[rink],
        });
    }
    if (!u.every((line) => isText(line))) return null;
    return { sourceUrl: wire.src, fetchedAt: wire.at, schedule: { games, teams, unparsed: u as string[] } };
}

/** The inverse of encodeSchedulePull. Never throws: every failure is a result worded for the planner. */
export async function decodeSchedulePull(value: string): Promise<SchedulePullReadResult> {
    const unreadable = { ok: false, code: "unreadable", message: PULL_UNREADABLE_MESSAGE } as const;
    if (value.length > MAX_PULL_FRAGMENT_LENGTH) return { ok: false, code: "too-large", message: PULL_TOO_LARGE_MESSAGE };
    if (value.length === 0) return unreadable;
    let raw: unknown;
    try {
        const inflated = await inflateRaw(base64UrlDecode(value), MAX_PULL_JSON_BYTES);
        raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(inflated)) as unknown;
    } catch (error) {
        if (error instanceof PlanLinkTooLargeError) return { ok: false, code: "too-large", message: PULL_TOO_LARGE_MESSAGE };
        return unreadable;
    }
    if (typeof raw !== "object" || raw === null || (raw as { f?: unknown }).f !== SCHEDULE_PULL_FORMAT) return unreadable;
    const version = (raw as { v?: unknown }).v;
    if (typeof version === "number" && Number.isInteger(version) && version > SCHEDULE_PULL_VERSION) {
        return { ok: false, code: "newer-version", message: PULL_NEWER_MESSAGE };
    }
    if (version !== SCHEDULE_PULL_VERSION) return unreadable;
    const pull = fromWire(raw);
    return pull ? { ok: true, pull } : unreadable;
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function displayTime(time: string): string {
    const [hour, minute] = time.split(":").map(Number);
    const suffix = hour >= 12 ? "pm" : "am";
    const twelve = hour % 12 === 0 ? 12 : hour % 12;
    return `${twelve}:${String(minute).padStart(2, "0")}${suffix}`;
}

function displayDate(date: string): string {
    const [year, month, day] = date.split("-").map(Number);
    return `${month}/${day}/${year}`;
}

/**
 * The pull as a page the static import already reads: one table row per game, cells in the
 * schedule page's order, dates with their year. parseSchedule reads it back to the same games
 * and teams, so the pulled schedule goes through the same preview, merge and re-read paths as a
 * pasted page. Unread lines come first, before any date, so they can't pair up into a game.
 */
export function schedulePullSource(pull: SchedulePull): string {
    const names = new Map(pull.schedule.teams.map((team) => [team.number, team.name]));
    const cell = (text: string) => `<td>${escapeHtml(text)}</td>`;
    const team = (number: string) => cell(`${number} ${names.get(number) ?? number}`);
    const rows = pull.schedule.games.map((game) => {
        const cells = [cell(displayDate(game.date))];
        if (game.time) cells.push(cell(displayTime(game.time)));
        cells.push(team(game.home));
        if (game.homeGoals !== null && game.awayGoals !== null) cells.push(cell(`${game.homeGoals} - ${game.awayGoals}`));
        cells.push(team(game.away));
        if (game.rink) cells.push(cell(game.rink));
        return `<tr>${cells.join("")}</tr>`;
    });
    const unread = pull.schedule.unparsed.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
    return `<div>${unread}</div><table>${rows.join("")}</table>`;
}

/** The host a pull came from, for labels. */
export function schedulePullHost(pull: SchedulePull): string {
    return new URL(pull.sourceUrl).host;
}
