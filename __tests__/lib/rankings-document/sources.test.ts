import { describe, expect, it } from "vitest";
import {
    MAX_SOURCE_URL_LENGTH,
    SOURCE_URL_MESSAGE,
    createRankingsDocument,
    pageAddressProblem,
    parseRankings,
    serializeRankings,
    withSource,
    type RankingsDocument,
} from "@/lib/rankings-document";

// Fictional addresses only (spec R6).
const SCHEDULE_URL = "https://league.example/schedule?division=8u";
const SNAKE_URL = "https://league.example/snake-chart";

function base(): RankingsDocument {
    return {
        ...createRankingsDocument({ title: "Fall Pre-season" }),
        teams: [
            { number: "901", name: "Riverside M1", startingBracket: null, excluded: false },
            { number: "902", name: "Lakeview M2", startingBracket: null, excluded: false },
        ],
    };
}

const raw = (doc: RankingsDocument, extra: Record<string, unknown> = {}) => ({ ...JSON.parse(serializeRankings(doc)), ...extra });

describe("rankings sources (v1, additive)", () => {
    it("opens a v1 file without sources exactly as before", () => {
        const doc = base();
        const result = parseRankings(raw(doc));
        expect(result).toEqual({ ok: true, doc });
        expect(result.ok && "sources" in result.doc).toBe(false);
    });

    it("keeps sources on a v1 file that has them", () => {
        const sources = {
            schedule: { url: SCHEDULE_URL, lastReadAt: "2026-10-01T18:30:00.000Z" },
            snakeChart: { url: SNAKE_URL, lastReadAt: null },
        };
        const result = parseRankings(raw(base(), { sources }));
        expect(result.ok && result.doc.sources).toEqual(sources);
        // And it survives a save and reopen.
        expect(result.ok && parseRankings(JSON.parse(serializeRankings(result.doc)))).toEqual(result);
    });

    it("accepts a source with only an address (set in Setup, never read)", () => {
        const result = parseRankings(raw(base(), { sources: { schedule: { url: SCHEDULE_URL } } }));
        expect(result.ok && result.doc.sources).toEqual({ schedule: { url: SCHEDULE_URL, lastReadAt: null } });
    });

    it.each([
        ["http", "http://league.example/schedule"],
        ["a script", "javascript:alert(1)"],
        ["a file", "file:///schedule.html"],
        ["not an address", "league schedule"],
        ["credentials", "https://user:secret@league.example/schedule"],
        ["too long", `https://league.example/${"a".repeat(MAX_SOURCE_URL_LENGTH)}`],
    ])("rejects a source address that is %s", (_label, url) => {
        const result = parseRankings(raw(base(), { sources: { schedule: { url, lastReadAt: null } } }));
        expect(result.ok).toBe(false);
        expect(!result.ok && result.error.code).toBe("invalid");
    });

    it("rejects a last read time that isn't a date and time", () => {
        const result = parseRankings(raw(base(), { sources: { schedule: { url: SCHEDULE_URL, lastReadAt: "last week" } } }));
        expect(result.ok).toBe(false);
    });

    it("strips unknown keys, at the top level and inside sources: how an older reader drops `sources`", () => {
        const result = parseRankings(
            raw(base(), {
                futureField: { anything: true },
                sources: { schedule: { url: SCHEDULE_URL, lastReadAt: null, pageText: "<html>never kept</html>" }, standings: { url: SNAKE_URL } },
            }),
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect("futureField" in result.doc).toBe(false);
        expect(result.doc.sources).toEqual({ schedule: { url: SCHEDULE_URL, lastReadAt: null } });
    });

    it("trims the stored address", () => {
        const result = parseRankings(raw(base(), { sources: { schedule: { url: `  ${SCHEDULE_URL}  ` } } }));
        expect(result.ok && result.doc.sources?.schedule?.url).toBe(SCHEDULE_URL);
    });
});

describe("pageAddressProblem", () => {
    it("allows an empty field and an https address", () => {
        expect(pageAddressProblem("")).toBeNull();
        expect(pageAddressProblem("  ")).toBeNull();
        expect(pageAddressProblem(SCHEDULE_URL)).toBeNull();
    });

    it("explains an address that isn't https", () => {
        expect(pageAddressProblem("http://league.example")).toBe(SOURCE_URL_MESSAGE);
    });
});

describe("withSource", () => {
    it("sets, keeps the read time of an unchanged address, resets it for a new one, and clears", () => {
        const read = withSource(base(), "schedule", SCHEDULE_URL, { readAt: "2026-10-01T18:30:00.000Z" });
        expect(read.sources).toEqual({ schedule: { url: SCHEDULE_URL, lastReadAt: "2026-10-01T18:30:00.000Z" } });
        expect(withSource(read, "schedule", ` ${SCHEDULE_URL} `).sources?.schedule?.lastReadAt).toBe("2026-10-01T18:30:00.000Z");
        expect(withSource(read, "schedule", `${SCHEDULE_URL}&page=2`).sources?.schedule?.lastReadAt).toBeNull();
        const both = withSource(read, "snakeChart", SNAKE_URL);
        expect(withSource(both, "schedule", "").sources).toEqual({ snakeChart: { url: SNAKE_URL, lastReadAt: null } });
        expect("sources" in withSource(read, "schedule", null)).toBe(false);
    });
});
