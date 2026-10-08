import { describe, expect, it } from "vitest";
import {
    MAX_RANKINGS_FILE_BYTES,
    MAX_TEAM_LOGO_PNG_BYTES,
    MAX_TEAM_LOGOS_TOTAL_BYTES,
    RANKINGS_TOO_LARGE_TO_SAVE_MESSAGE,
    TEAM_LOGO_INVALID_MESSAGE,
    TEAM_LOGOS_TOTAL_MESSAGE,
    TEAM_NOT_IN_RANKINGS_MESSAGE,
    mergeSchedule,
    parseRankings,
    serializeRankings,
    teamLogo,
    teamLogoBytes,
    withTeamLogo,
} from "@/lib/rankings-document";
import { logoPng } from "@/__tests__/helpers/logo-png";
import { sampleRankingsDoc } from "@/__tests__/apps/planner/rankings-fixtures";

/** A PNG stub whose IHDR declares width × height, padded to `bytes` decoded bytes. */
function paddedPng(width: number, height: number, bytes: number): string {
    const head = atob(logoPng(width, height).split(",")[1]);
    const body = head + "\0".repeat(Math.max(0, bytes - head.length));
    return `data:image/png;base64,${btoa(body)}`;
}

const logo = (side = 96) => ({ dataUrl: logoPng(side, side), width: side, height: side });

describe("team logos in the rankings document", () => {
    it("reads a document without logos exactly as before (additive under v1)", () => {
        const parsed = parseRankings(JSON.parse(serializeRankings(sampleRankingsDoc())));
        expect(parsed.ok).toBe(true);
        if (parsed.ok) expect(parsed.doc.teams.every((team) => !("logo" in team))).toBe(true);
    });

    it("round-trips a team logo through the file format", () => {
        const set = withTeamLogo(sampleRankingsDoc(), "902", logo());
        expect(set.ok).toBe(true);
        if (!set.ok) return;
        const parsed = parseRankings(JSON.parse(serializeRankings(set.doc)));
        expect(parsed.ok).toBe(true);
        if (parsed.ok) expect(teamLogo(parsed.doc, "902")).toEqual(logo());
    });

    it("refuses a logo larger than 128 px a side or 12 KB", () => {
        expect(withTeamLogo(sampleRankingsDoc(), "902", logo(129))).toEqual({ ok: false, error: TEAM_LOGO_INVALID_MESSAGE });
        const heavy = { dataUrl: paddedPng(64, 64, MAX_TEAM_LOGO_PNG_BYTES + 1), width: 64, height: 64 };
        expect(withTeamLogo(sampleRankingsDoc(), "902", heavy)).toEqual({ ok: false, error: TEAM_LOGO_INVALID_MESSAGE });
        const doc = { ...sampleRankingsDoc(), teams: sampleRankingsDoc().teams.map((team) => ({ ...team, logo: { dataUrl: "data:image/svg+xml;base64,AAAA", width: 1, height: 1 } })) };
        const parsed = parseRankings(doc);
        expect(parsed.ok).toBe(false);
    });

    it("refuses a logo whose declared size doesn't match its stored size", () => {
        expect(withTeamLogo(sampleRankingsDoc(), "902", { dataUrl: logoPng(64, 64), width: 32, height: 32 }).ok).toBe(false);
    });

    it("keeps every logo in one document within the shared budget", () => {
        const each = MAX_TEAM_LOGO_PNG_BYTES;
        const count = Math.floor(MAX_TEAM_LOGOS_TOTAL_BYTES / each) + 1;
        const teams = Array.from({ length: count }, (_, i) => ({
            number: `9${String(i).padStart(2, "0")}`,
            name: `Pinewood ${i}`,
            startingBracket: null,
            excluded: false,
            logo: { dataUrl: paddedPng(64, 64, each), width: 64, height: 64 },
        }));
        const over = parseRankings({ ...sampleRankingsDoc({ games: [], myTeam: null }), teams });
        expect(over.ok).toBe(false);
        if (!over.ok) expect(over.error.issues).toContain(`teams: ${TEAM_LOGOS_TOTAL_MESSAGE}`);

        const within = { ...sampleRankingsDoc({ games: [], myTeam: null }), teams: [...teams.slice(0, count - 1), { number: "999", name: "Pinewood Spare", startingBracket: null, excluded: false }] };
        const parsed = parseRankings(within);
        expect(parsed.ok).toBe(true);
        if (parsed.ok) {
            expect(teamLogoBytes(parsed.doc)).toBeLessThanOrEqual(MAX_TEAM_LOGOS_TOTAL_BYTES);
            // A full logo budget plus the largest game list (5,000 games) still fits the file cap.
            const games = Array.from({ length: 5000 }, (_, i) => ({
                date: "2026-09-20",
                time: "09:00",
                home: "900",
                away: "901",
                homeGoals: i % 10,
                awayGoals: 9,
                status: "final" as const,
                rink: "Rink A",
            }));
            const largest = parseRankings({ ...parsed.doc, games });
            expect(largest.ok).toBe(true);
            if (largest.ok) expect(serializeRankings(largest.doc).length).toBeLessThan(MAX_RANKINGS_FILE_BYTES);
            const one = withTeamLogo(parsed.doc, "999", { dataUrl: paddedPng(64, 64, each), width: 64, height: 64 });
            expect(one).toEqual({ ok: false, error: TEAM_LOGOS_TOTAL_MESSAGE });
        }
    });

    it("refuses a logo that would take the whole document past the file cap", () => {
        // Within the logo budget, but the document is already near the cap: the serialized file would not reopen.
        const base = sampleRankingsDoc();
        const room = MAX_RANKINGS_FILE_BYTES - new TextEncoder().encode(serializeRankings(base)).byteLength;
        const near = { ...base, snapshots: ["x".repeat(room - 1000)] };
        const full = { dataUrl: paddedPng(64, 64, MAX_TEAM_LOGO_PNG_BYTES), width: 64, height: 64 };
        expect(new TextEncoder().encode(serializeRankings(near)).byteLength).toBeLessThanOrEqual(MAX_RANKINGS_FILE_BYTES);
        expect(withTeamLogo(near, "902", full)).toEqual({ ok: false, error: RANKINGS_TOO_LARGE_TO_SAVE_MESSAGE });
        // Counted in UTF-8 bytes, not characters.
        const wide = { ...base, snapshots: ["é".repeat(Math.ceil(room / 2) - 100)] };
        expect(serializeRankings(wide).length).toBeLessThan(MAX_RANKINGS_FILE_BYTES);
        expect(withTeamLogo(wide, "902", full)).toEqual({ ok: false, error: RANKINGS_TOO_LARGE_TO_SAVE_MESSAGE });
        // Removing a logo is never refused.
        expect(withTeamLogo(near, "902", null).ok).toBe(true);
    });

    it("removes a logo, and refuses a team that isn't listed", () => {
        const set = withTeamLogo(sampleRankingsDoc(), "903", logo());
        if (!set.ok) throw new Error("expected a logo");
        const cleared = withTeamLogo(set.doc, "903", null);
        expect(cleared.ok && teamLogo(cleared.doc, "903")).toBeNull();
        expect(cleared.ok && "logo" in cleared.doc.teams[2]).toBe(false);
        expect(withTeamLogo(sampleRankingsDoc(), "999", logo())).toEqual({ ok: false, error: TEAM_NOT_IN_RANKINGS_MESSAGE });
    });

    it("keeps logos when results are merged in", () => {
        const set = withTeamLogo(sampleRankingsDoc(), "901", logo());
        if (!set.ok) throw new Error("expected a logo");
        const merged = mergeSchedule(set.doc, {
            games: [{ date: "2026-10-12", time: "08:00", home: "903", away: "904", homeGoals: 3, awayGoals: 1, rink: "Rink B" }],
            teams: [{ number: "905", name: "Pinewood M1" }],
            unparsed: [],
        });
        expect(teamLogo(merged.doc, "901")).toEqual(logo());
    });
});
