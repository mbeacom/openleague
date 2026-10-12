/** Drill video links (practice video links spec R2, R3): parsing, normalization and the write and read rules. */
import { describe, expect, it, vi } from "vitest";
import {
    MAX_DRILL_VIDEOS,
    MAX_VIDEO_START_SEC,
    VIDEO_HTTPS_MESSAGE,
    VIDEO_CREDENTIALS_MESSAGE,
    VIDEO_IP_HOST_MESSAGE,
    VIDEO_PORT_MESSAGE,
    VIDEO_PUBLIC_HOST_MESSAGE,
    VIDEO_REQUIRED_MESSAGE,
    VIDEO_TITLE_LENGTH_MESSAGE,
    VIDEO_URL_LENGTH_MESSAGE,
    VIDEO_URL_MAX,
    drillVideoLimitMessage,
    formatVideoStart,
    normalizeVideoLink,
    normalizeVideoLinks,
    notAVideoMessage,
    parseVideoStart,
    parseVideoStartInput,
    parseVideoUrl,
    readVideoLinks,
    videoDisplayTitle,
    videoHost,
    videoLinksSchema,
    videoOpenUrl,
    type VideoLink,
} from "@/lib/utils/video-links";

// Made-up ids only: an 11-character YouTube id, a numeric Vimeo id, a Drive file id.
const YT = "Ab3dE5fG7hJ";
const VIMEO = "123456789";
const HASH = "a1b2c3d4e5";
const DRIVE = "1FakeDriveFileId_abcdefghijk";

const ok = (raw: string) => {
    const result = parseVideoUrl(raw);
    if (!result.ok) throw new Error(`expected ${raw} to parse: ${result.message}`);
    return result.link;
};
const refused = (raw: string) => {
    const result = parseVideoUrl(raw);
    if (result.ok) throw new Error(`expected ${raw} to be refused`);
    return result.message;
};

describe("parseVideoUrl: accepted forms", () => {
    it.each([
        [`https://www.youtube.com/watch?v=${YT}`, { url: `https://www.youtube.com/watch?v=${YT}`, provider: "youtube" }],
        [`https://youtube.com/watch?v=${YT}&feature=share`, { url: `https://www.youtube.com/watch?v=${YT}`, provider: "youtube" }],
        [`https://m.youtube.com/watch?v=${YT}`, { url: `https://www.youtube.com/watch?v=${YT}`, provider: "youtube" }],
        [`https://music.youtube.com/watch?v=${YT}&si=abc`, { url: `https://www.youtube.com/watch?v=${YT}`, provider: "youtube" }],
        [`https://youtu.be/${YT}`, { url: `https://www.youtube.com/watch?v=${YT}`, provider: "youtube" }],
        [`https://youtu.be/${YT}?si=Xy12&t=90`, { url: `https://www.youtube.com/watch?v=${YT}`, provider: "youtube", startSec: 90 }],
        [`https://www.youtube.com/shorts/${YT}`, { url: `https://www.youtube.com/watch?v=${YT}`, provider: "youtube" }],
        [`https://www.youtube.com/live/${YT}?pp=xyz`, { url: `https://www.youtube.com/watch?v=${YT}`, provider: "youtube" }],
        [`https://www.youtube.com/embed/${YT}?start=75`, { url: `https://www.youtube.com/watch?v=${YT}`, provider: "youtube", startSec: 75 }],
        [`https://www.youtube-nocookie.com/embed/${YT}`, { url: `https://www.youtube.com/watch?v=${YT}`, provider: "youtube" }],
        [`https://WWW.YouTube.com/watch?v=${YT}#comments`, { url: `https://www.youtube.com/watch?v=${YT}`, provider: "youtube" }],
        [`https://vimeo.com/${VIMEO}`, { url: `https://vimeo.com/${VIMEO}`, provider: "vimeo" }],
        [`https://www.vimeo.com/${VIMEO}/${HASH}`, { url: `https://vimeo.com/${VIMEO}/${HASH}`, provider: "vimeo" }],
        [`https://player.vimeo.com/video/${VIMEO}?h=${HASH}`, { url: `https://vimeo.com/${VIMEO}/${HASH}`, provider: "vimeo" }],
        [`https://vimeo.com/${VIMEO}#t=1m30s`, { url: `https://vimeo.com/${VIMEO}`, provider: "vimeo", startSec: 90 }],
        [`https://drive.google.com/file/d/${DRIVE}/view?usp=sharing`, { url: `https://drive.google.com/file/d/${DRIVE}/view`, provider: "drive" }],
        [`https://drive.google.com/open?id=${DRIVE}`, { url: `https://drive.google.com/file/d/${DRIVE}/view`, provider: "drive" }],
        [
            `https://drive.google.com/file/d/${DRIVE}/preview?resourcekey=0-Fake_Key`,
            { url: `https://drive.google.com/file/d/${DRIVE}/view?resourcekey=0-Fake_Key`, provider: "drive" },
        ],
        ["https://1drv.ms/v/s!FakeShareToken", { url: "https://1drv.ms/v/s!FakeShareToken", provider: "onedrive" }],
        ["https://onedrive.live.com/?cid=FAKE&id=FAKE%21101&utm_source=x", { url: "https://onedrive.live.com/?cid=FAKE&id=FAKE%21101", provider: "onedrive" }],
        ["https://riverside-hockey.sharepoint.com/:v:/s/coaches/FakeToken", { url: "https://riverside-hockey.sharepoint.com/:v:/s/coaches/FakeToken", provider: "onedrive" }],
        ["https://example.org/drills/breakout.mp4?utm_campaign=fall#top", { url: "https://example.org/drills/breakout.mp4", provider: "link" }],
        ["  https://videos.example.net/watch/42  ", { url: "https://videos.example.net/watch/42", provider: "link" }],
    ])("%s", (raw, expected) => {
        expect(ok(raw)).toEqual(expected);
    });

    it("drops a start time for Drive, OneDrive and plain links", () => {
        expect(ok(`https://drive.google.com/file/d/${DRIVE}/view?t=90`).startSec).toBeUndefined();
        expect(ok("https://example.org/clip?t=90").startSec).toBeUndefined();
    });

    it("keeps a plain link's query apart from tracking parameters", () => {
        expect(ok("https://example.org/clip?id=7&si=abc&feature=x&utm_medium=y").url).toBe("https://example.org/clip?id=7");
    });

    it("is idempotent", () => {
        for (const raw of [
            `https://youtu.be/${YT}?t=1m30s`,
            `https://player.vimeo.com/video/${VIMEO}?h=${HASH}#t=20s`,
            `https://drive.google.com/open?id=${DRIVE}&resourcekey=0-k`,
            "https://onedrive.live.com/?cid=FAKE&id=FAKE%21101&si=1",
            "https://example.org/a b?q=1 2&utm_source=z",
        ]) {
            const first = ok(raw);
            const again = ok(first.url);
            expect(again.url).toBe(first.url);
            expect(again.provider).toBe(first.provider);
        }
    });
});

describe("parseVideoUrl: refusals", () => {
    it.each([
        ["", VIDEO_REQUIRED_MESSAGE],
        ["   ", VIDEO_REQUIRED_MESSAGE],
        [`http://www.youtube.com/watch?v=${YT}`, VIDEO_HTTPS_MESSAGE],
        ["javascript:alert(1)", VIDEO_HTTPS_MESSAGE],
        ["data:text/html,hi", VIDEO_HTTPS_MESSAGE],
        ["blob:https://example.org/1", VIDEO_HTTPS_MESSAGE],
        ["file:///tmp/clip.mp4", VIDEO_HTTPS_MESSAGE],
        ["//example.org/clip", VIDEO_HTTPS_MESSAGE],
        ["example.org/clip", VIDEO_HTTPS_MESSAGE],
        ["https://coach:secret@example.org/clip", VIDEO_CREDENTIALS_MESSAGE],
        ["https://example.org:8443/clip", VIDEO_PORT_MESSAGE],
        ["https://192.0.2.10/clip", VIDEO_IP_HOST_MESSAGE],
        ["https://[2001:db8::1]/clip", VIDEO_IP_HOST_MESSAGE],
        ["https://3221225994/clip", VIDEO_IP_HOST_MESSAGE],
        ["https://localhost/clip", VIDEO_PUBLIC_HOST_MESSAGE],
        [`https://example.org/${"a".repeat(VIDEO_URL_MAX)}`, VIDEO_URL_LENGTH_MESSAGE],
        ["https://www.youtube.com/@fictional-coaching-channel", notAVideoMessage("youtube")],
        ["https://www.youtube.com/playlist?list=PLfakefakefake", notAVideoMessage("youtube")],
        ["https://www.youtube.com/watch?v=short", notAVideoMessage("youtube")],
        [`https://youtu.be/${YT}x`, notAVideoMessage("youtube")],
        ["https://vimeo.com/channels/fictional", notAVideoMessage("vimeo")],
        [`https://vimeo.com/${VIMEO}/not-hex`, notAVideoMessage("vimeo")],
        ["https://drive.google.com/drive/folders/FakeFolder", notAVideoMessage("drive")],
    ])("%s", (raw, message) => {
        expect(refused(raw)).toBe(message);
    });

    it("accepts the default https port", () => {
        expect(ok("https://example.org:443/clip").url).toBe("https://example.org/clip");
    });

    it("names the provider in a wrong-path message", () => {
        expect(notAVideoMessage("youtube")).toBe("That YouTube link doesn't point to a video");
    });
});

describe("start times", () => {
    it.each([
        ["90", 90],
        ["90s", 90],
        ["1m30s", 90],
        ["1h2m3s", 3723],
        ["2m", 120],
        ["0", undefined],
        ["abc", undefined],
        ["", undefined],
        ["999999", MAX_VIDEO_START_SEC],
    ])("parseVideoStart(%s)", (raw, expected) => {
        expect(parseVideoStart(raw)).toBe(expected);
    });

    it("reads t= and start= on YouTube links", () => {
        expect(ok(`https://www.youtube.com/watch?v=${YT}&t=1h2m3s`).startSec).toBe(3723);
        expect(ok(`https://www.youtube.com/watch?v=${YT}&start=45`).startSec).toBe(45);
    });

    it.each([
        ["", { ok: true, value: undefined }],
        ["1:30", { ok: true, value: 90 }],
        ["0:05", { ok: true, value: 5 }],
        ["1:02:03", { ok: true, value: 3723 }],
        ["75", { ok: true, value: 75 }],
        ["1:75", { ok: false }],
        ["soon", { ok: false }],
        ["24:00:00", { ok: false }],
    ])("parseVideoStartInput(%s)", (raw, expected) => {
        expect(parseVideoStartInput(raw)).toMatchObject(expected);
    });

    it("formats m:ss and h:mm:ss", () => {
        expect(formatVideoStart(90)).toBe("1:30");
        expect(formatVideoStart(5)).toBe("0:05");
        expect(formatVideoStart(3723)).toBe("1:02:03");
    });
});

describe("normalizeVideoLink", () => {
    it("corrects a stored provider that disagrees with the URL", () => {
        const result = normalizeVideoLink({ url: `https://youtu.be/${YT}`, provider: "link" });
        expect(result).toEqual({ ok: true, link: { url: `https://www.youtube.com/watch?v=${YT}`, provider: "youtube" } });
    });

    it("prefers an explicit start, falls back to the URL's, and drops it where it can't apply", () => {
        expect(normalizeVideoLink({ url: `https://youtu.be/${YT}?t=10`, provider: "youtube", startSec: 30 })).toMatchObject({ link: { startSec: 30 } });
        expect(normalizeVideoLink({ url: `https://youtu.be/${YT}?t=10`, provider: "youtube" })).toMatchObject({ link: { startSec: 10 } });
        const drive = normalizeVideoLink({ url: `https://drive.google.com/file/d/${DRIVE}/view`, provider: "drive", startSec: 30 });
        expect(drive.ok && drive.link.startSec).toBeUndefined();
    });

    it("keeps the start when a stored link is normalized again (its URL no longer carries t=)", () => {
        const first = normalizeVideoLink({ url: `https://youtu.be/${YT}?t=90`, provider: "link" });
        expect(first).toMatchObject({ ok: true, link: { url: `https://www.youtube.com/watch?v=${YT}`, startSec: 90 } });
        const again = first.ok ? normalizeVideoLink(first.link) : first;
        expect(again).toEqual(first);
        const vimeo = normalizeVideoLink({ url: `https://vimeo.com/${VIMEO}#t=20s`, provider: "vimeo" });
        expect(vimeo.ok && normalizeVideoLink(vimeo.link)).toEqual(vimeo);
    });

    it("refuses a start outside 0 to 86 399 or not a whole number", () => {
        expect(normalizeVideoLink({ url: `https://youtu.be/${YT}`, provider: "youtube", startSec: 86_400 }).ok).toBe(false);
        expect(normalizeVideoLink({ url: `https://youtu.be/${YT}`, provider: "youtube", startSec: 1.5 }).ok).toBe(false);
    });

    it("cleans the title, omits a blank one and refuses one over 80 characters", () => {
        expect(normalizeVideoLink({ url: `https://youtu.be/${YT}`, provider: "youtube", title: "  Breakout\u0007   demo \n" })).toMatchObject({
            link: { title: "Breakout demo" },
        });
        const blank = normalizeVideoLink({ url: `https://youtu.be/${YT}`, provider: "youtube", title: "  " });
        expect(blank.ok && "title" in blank.link).toBe(false);
        expect(normalizeVideoLink({ url: `https://youtu.be/${YT}`, provider: "youtube", title: "x".repeat(81) })).toMatchObject({
            ok: false,
            message: VIDEO_TITLE_LENGTH_MESSAGE,
        });
    });

    it("refuses something that isn't an entry", () => {
        expect(normalizeVideoLink(null).ok).toBe(false);
        expect(normalizeVideoLink({ url: 42 }).ok).toBe(false);
    });
});

describe("the write schema", () => {
    const schema = videoLinksSchema(MAX_DRILL_VIDEOS);
    const link = (n: number): VideoLink => ({ url: `https://example.org/clip-${n}`, provider: "link" });

    it("accepts up to the limit and a provider that disagrees (corrected on write, never trusted)", () => {
        expect(schema.safeParse([1, 2, 3, 4, 5].map(link)).success).toBe(true);
        expect(schema.safeParse([{ url: `https://youtu.be/${YT}`, provider: "link" }]).success).toBe(true);
    });

    it("refuses a sixth link, a non-https link and an over-long title, at the entry's path", () => {
        const six = schema.safeParse([1, 2, 3, 4, 5, 6].map(link));
        expect(six.success).toBe(false);
        expect(!six.success && six.error.issues[0].message).toBe(drillVideoLimitMessage(MAX_DRILL_VIDEOS));

        const http = schema.safeParse([link(1), { url: "http://example.org/x", provider: "link" }]);
        expect(!http.success && http.error.issues[0]).toMatchObject({ message: VIDEO_HTTPS_MESSAGE, path: [1, "url"] });

        const title = schema.safeParse([{ ...link(1), title: "x".repeat(81) }]);
        expect(!title.success && title.error.issues[0]).toMatchObject({ message: VIDEO_TITLE_LENGTH_MESSAGE, path: [0, "title"] });
    });

    it("normalizeVideoLinks returns the normalized list, undefined for none, or null when an entry fails", () => {
        expect(normalizeVideoLinks([{ url: `https://youtu.be/${YT}?si=1`, provider: "link" }])).toEqual([
            { url: `https://www.youtube.com/watch?v=${YT}`, provider: "youtube" },
        ]);
        expect(normalizeVideoLinks([])).toBeUndefined();
        expect(normalizeVideoLinks(undefined)).toBeUndefined();
        expect(normalizeVideoLinks([{ url: "http://example.org", provider: "link" }])).toBeNull();
    });
});

describe("the lenient read", () => {
    it("drops unparseable entries (logged), keeps the rest and keeps the first 5", () => {
        const errors = vi.spyOn(console, "error").mockImplementation(() => {});
        const raw = [
            { url: "javascript:alert(1)", provider: "link" },
            ...[1, 2, 3, 4, 5, 6].map((n) => ({ url: `https://example.org/${n}`, provider: "youtube", title: "x".repeat(90) })),
        ];
        const read = readVideoLinks(raw, MAX_DRILL_VIDEOS);
        expect(read).toHaveLength(5);
        expect(read?.[0]).toEqual({ url: "https://example.org/1", provider: "link", title: "x".repeat(80) });
        expect(errors).toHaveBeenCalled();
        errors.mockRestore();
    });

    it("logs that an entry or list was dropped without logging the value, which may hold a private share token", () => {
        const errors = vi.spyOn(console, "error").mockImplementation(() => {});
        const secret = "https://user:hunter2@example.org/clip?token=PRIVATE-SHARE";
        readVideoLinks([{ url: secret, provider: "link" }], MAX_DRILL_VIDEOS);
        readVideoLinks({ url: secret }, MAX_DRILL_VIDEOS);
        expect(errors).toHaveBeenCalledTimes(2);
        const logged = JSON.stringify(errors.mock.calls);
        expect(logged).not.toContain("hunter2");
        expect(logged).not.toContain("PRIVATE-SHARE");
        errors.mockRestore();
    });

    it("reads a missing, null or empty list as none", () => {
        expect(readVideoLinks(undefined, 5)).toBeUndefined();
        expect(readVideoLinks(null, 5)).toBeUndefined();
        expect(readVideoLinks([], 5)).toBeUndefined();
    });
});

describe("display helpers", () => {
    it("applies the start time to the Open link", () => {
        expect(videoOpenUrl({ url: `https://www.youtube.com/watch?v=${YT}`, provider: "youtube", startSec: 90 })).toBe(
            `https://www.youtube.com/watch?v=${YT}&t=90`,
        );
        expect(videoOpenUrl({ url: `https://vimeo.com/${VIMEO}/${HASH}`, provider: "vimeo", startSec: 90 })).toBe(`https://vimeo.com/${VIMEO}/${HASH}#t=90s`);
        expect(videoOpenUrl({ url: "https://example.org/x", provider: "link" })).toBe("https://example.org/x");
    });

    it("shows the host without www and a provider fallback title", () => {
        expect(videoHost({ url: `https://www.youtube.com/watch?v=${YT}`, provider: "youtube" })).toBe("youtube.com");
        expect(videoHost({ url: `https://drive.google.com/file/d/${DRIVE}/view`, provider: "drive" })).toBe("drive.google.com");
        expect(videoDisplayTitle({ url: "https://example.org/x", provider: "link" })).toBe("Video link");
        expect(videoDisplayTitle({ url: "https://1drv.ms/v/x", provider: "onedrive" })).toBe("OneDrive video");
        expect(videoDisplayTitle({ url: "https://example.org/x", provider: "link", title: "Breakout demo" })).toBe("Breakout demo");
    });
});
