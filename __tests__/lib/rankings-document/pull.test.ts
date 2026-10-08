import { describe, expect, it } from "vitest";
import {
    decodeSchedulePull,
    encodeSchedulePull,
    MAX_PULL_FRAGMENT_LENGTH,
    MAX_PULL_GAMES,
    MAX_PULL_UNPARSED,
    PULL_NEWER_MESSAGE,
    PULL_TOO_LARGE_MESSAGE,
    PULL_UNREADABLE_MESSAGE,
    schedulePullHost,
    schedulePullSource,
    SchedulePullTooLargeError,
    SCHEDULE_PULL_FORMAT,
} from "@/lib/rankings-document";
import { base64UrlEncode, deflateRaw } from "@/lib/plan-document/link";
import { parseSchedule } from "@/lib/ratings/import";
import { fictionalPull, fictionalSchedule } from "./pull-fixtures";

async function encodeRaw(value: unknown): Promise<string> {
    return base64UrlEncode(await deflateRaw(new TextEncoder().encode(JSON.stringify(value))));
}

const WIRE = {
    f: SCHEDULE_PULL_FORMAT,
    v: 1,
    src: "https://league.example.org/schedule",
    at: "2026-10-07T12:00:00.000Z",
    t: [
        ["901", "Riverside M1"],
        ["902", "Lakeview M2"],
    ],
    r: ["Rink A"],
    g: [["2026-09-26", "15:40", "901", "902", 4, 9, 0]],
    u: [],
};

describe("schedule pull codec", () => {
    it("round-trips a 190-game schedule well under the fragment cap", async () => {
        const pull = fictionalPull();
        const value = await encodeSchedulePull(pull);
        expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(value.length).toBeLessThan(MAX_PULL_FRAGMENT_LENGTH / 2);
        const result = await decodeSchedulePull(value);
        expect(result).toEqual({ ok: true, pull });
    });

    it("keeps a capped sample of unread lines, clipped", async () => {
        const long = `905 ${"x".repeat(500)}`;
        const unparsed = [long, ...Array.from({ length: 60 }, (_, i) => `9${String(i).padStart(2, "0")} Stray`)];
        const pull = fictionalPull({ ...fictionalSchedule(4), unparsed });
        const result = await decodeSchedulePull(await encodeSchedulePull(pull));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.pull.schedule.unparsed).toHaveLength(MAX_PULL_UNPARSED);
        expect(result.pull.schedule.unparsed[0].length).toBeLessThanOrEqual(120);
    });

    it("refuses to encode past the game cap", async () => {
        const schedule = fictionalSchedule(MAX_PULL_GAMES + 1);
        await expect(encodeSchedulePull(fictionalPull(schedule))).rejects.toBeInstanceOf(SchedulePullTooLargeError);
    });

    it("rejects an oversized fragment before decoding it", async () => {
        const result = await decodeSchedulePull("A".repeat(MAX_PULL_FRAGMENT_LENGTH + 1));
        expect(result).toEqual({ ok: false, code: "too-large", message: PULL_TOO_LARGE_MESSAGE });
    });

    it("rejects a payload that inflates past the JSON cap", async () => {
        // Highly compressible: a short fragment that would inflate to megabytes.
        const bomb = await encodeRaw({ ...WIRE, u: ["x".repeat(4_000_000)] });
        expect(bomb.length).toBeLessThan(MAX_PULL_FRAGMENT_LENGTH);
        const result = await decodeSchedulePull(bomb);
        expect(result.ok).toBe(false);
        expect(!result.ok && result.code).toBe("too-large");
    });

    it.each([
        ["empty", ""],
        ["not base64url", "not*base64"],
        ["not deflate", "AAAAAAAA"],
    ])("rejects a malformed fragment safely (%s)", async (_label, value) => {
        expect(await decodeSchedulePull(value)).toEqual({ ok: false, code: "unreadable", message: PULL_UNREADABLE_MESSAGE });
    });

    it.each([
        ["another format", { ...WIRE, f: "openleague.plan" }],
        ["an older version", { ...WIRE, v: 0 }],
        ["a non-https source", { ...WIRE, src: "http://league.example.org/" }],
        ["a game with an unknown team", { ...WIRE, g: [["2026-09-26", "15:40", "901", "999", 4, 9, 0]] }],
        ["a team playing itself", { ...WIRE, g: [["2026-09-26", "15:40", "901", "901", 4, 9, 0]] }],
        ["goals out of range", { ...WIRE, g: [["2026-09-26", "15:40", "901", "902", 400, 9, 0]] }],
        ["one goal missing", { ...WIRE, g: [["2026-09-26", "15:40", "901", "902", 4, null, 0]] }],
        ["a bad date", { ...WIRE, g: [["26/09/2026", "15:40", "901", "902", 4, 9, 0]] }],
        ["a bad time", { ...WIRE, g: [["2026-09-26", "3:40pm", "901", "902", 4, 9, 0]] }],
        ["a rink index out of range", { ...WIRE, g: [["2026-09-26", "15:40", "901", "902", 4, 9, 5]] }],
        ["a short game tuple", { ...WIRE, g: [["2026-09-26", "15:40", "901", "902"]] }],
        ["a bad team number", { ...WIRE, t: [["9001", "Riverside M1"]] }],
        ["a duplicate team", { ...WIRE, t: [["901", "A"], ["901", "B"]] }],
        ["a missing array", { ...WIRE, g: undefined }],
    ])("rejects %s", async (_label, wire) => {
        expect(await decodeSchedulePull(await encodeRaw(wire))).toEqual({ ok: false, code: "unreadable", message: PULL_UNREADABLE_MESSAGE });
    });

    it("tells a newer version apart from an unreadable one", async () => {
        expect(await decodeSchedulePull(await encodeRaw({ ...WIRE, v: 2 }))).toEqual({ ok: false, code: "newer-version", message: PULL_NEWER_MESSAGE });
    });

    it("reads a minimal valid wire payload", async () => {
        const result = await decodeSchedulePull(await encodeRaw(WIRE));
        expect(result.ok && result.pull.schedule.games).toEqual([
            { date: "2026-09-26", time: "15:40", home: "901", away: "902", homeGoals: 4, awayGoals: 9, rink: "Rink A" },
        ]);
    });
});

describe("schedulePullSource", () => {
    it("reads back through parseSchedule to the same games and teams", () => {
        const pull = fictionalPull();
        // A season year that differs from the dates: the source carries each date's year.
        const parsed = parseSchedule(schedulePullSource(pull), { seasonYear: 2030 });
        expect(parsed.games).toEqual(pull.schedule.games);
        expect(parsed.teams).toEqual(pull.schedule.teams);
        expect(parsed.unparsed).toEqual([]);
    });

    it("lists the unread lines again and never pairs them into a game", () => {
        const pull = fictionalPull({ ...fictionalSchedule(3), unparsed: ["951 Stray Team", "952 Other Stray"] });
        const parsed = parseSchedule(schedulePullSource(pull), { seasonYear: 2026 });
        expect(parsed.games).toEqual(pull.schedule.games);
        expect(parsed.unparsed).toEqual(["951 Stray Team", "952 Other Stray"]);
    });

    it("escapes markup in names", () => {
        const schedule = fictionalSchedule(1);
        schedule.teams[0] = { ...schedule.teams[0], name: "<b>Riverside</b> & Co" };
        const source = schedulePullSource(fictionalPull(schedule));
        expect(source).not.toContain("<b>");
        expect(parseSchedule(source, { seasonYear: 2026 }).teams[0].name).toBe("<b>Riverside</b> & Co");
    });

    it("names the host", () => {
        expect(schedulePullHost(fictionalPull())).toBe("league.example.org");
    });
});
