/** The portable team file (practice logo spec R4a): reading, refusing and naming it. */
import { describe, expect, it } from "vitest";
import {
    INVALID_TEAM_FILE_MESSAGE,
    MAX_TEAM_PROFILE_FILE_BYTES,
    NEWER_TEAM_FILE_MESSAGE,
    NOT_A_TEAM_FILE_MESSAGE,
    TEAM_FILE_TOO_LARGE_MESSAGE,
    TEAM_PROFILE_FORMAT,
    createTeamProfileDocument,
    parseTeamProfileDocument,
    readTeamProfileFile,
    serializeTeamProfileDocument,
    teamProfileFileName,
} from "@/lib/team-profile-document";
import { serializeDocument, wrapDocument } from "@/lib/document-envelope";
import { encodeDocument } from "@/lib/document-formats";
import { NOT_A_PLAN_MESSAGE, readPlanFile } from "@/lib/plan-document";
import { NOT_RANKINGS_MESSAGE, createRankingsDocument, readRankingsFile, serializeRankings } from "@/lib/rankings-document";
import { TEAM_COLOR_MESSAGE, TEAM_LOGO_INVALID_MESSAGE, TEAM_NAME_REQUIRED_MESSAGE } from "@/lib/utils/team-mark";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TEAM = { name: "Ice Hawks", logo: { dataUrl: PNG, width: 1, height: 1 }, primaryColor: "#9B1B30", secondaryColor: null };
const NOW = new Date("2026-11-15T14:00:00.000Z");
const DOC = createTeamProfileDocument(TEAM, NOW);

const file = (text: string, name = "ice-hawks.team.json") => new File([text], name, { type: "application/json" });
const withTeam = (team: Record<string, unknown>) => JSON.stringify({ ...DOC, team: { ...DOC.team, ...team } });

describe("the team file", () => {
    it("round-trips the saved team through a file", async () => {
        expect(DOC).toEqual({ format: TEAM_PROFILE_FORMAT, version: 1, exportedAt: NOW.toISOString(), team: TEAM });
        expect(await readTeamProfileFile(file(serializeTeamProfileDocument(DOC)))).toEqual({ ok: true, doc: DOC });
    });

    it("reads a wrapped team file, and a TOML one that leaves out the empty color", async () => {
        const wrapped = serializeDocument(wrapDocument(TEAM_PROFILE_FORMAT, DOC, { id: "0b7c1f0e-5a3e-4c1e-9a47-6f0d7b2f8a11", updatedAt: NOW.toISOString(), generator: "openleague-static" }));
        expect(await readTeamProfileFile(file(wrapped))).toEqual({ ok: true, doc: DOC });
        const toml = await encodeDocument(DOC, "toml");
        expect(toml).not.toContain("secondaryColor");
        expect(await readTeamProfileFile(file(toml, "ice-hawks.team.toml"))).toEqual({ ok: true, doc: DOC });
    });

    it("keeps only known fields and normalizes the name and colors", () => {
        const result = parseTeamProfileDocument({ ...JSON.parse(withTeam({ name: "  Ice   Hawks ", primaryColor: "#9b1b30", roster: ["x"] })), extra: true });
        expect(result).toEqual({ ok: true, doc: DOC });
    });

    it("holds the team to the Your team dialog's rules", () => {
        const refused = (team: Record<string, unknown>) => parseTeamProfileDocument(JSON.parse(withTeam(team)));
        expect(refused({ name: " " })).toEqual({ ok: false, error: { code: "invalid", message: INVALID_TEAM_FILE_MESSAGE, issues: [`team.name: ${TEAM_NAME_REQUIRED_MESSAGE}`] } });
        expect(refused({ secondaryColor: "red" })).toEqual({ ok: false, error: { code: "invalid", message: INVALID_TEAM_FILE_MESSAGE, issues: [`team.secondaryColor: ${TEAM_COLOR_MESSAGE}`] } });
        expect(refused({ logo: { dataUrl: "data:image/png;base64,AAAA", width: 1, height: 1 } })).toEqual({
            ok: false,
            error: { code: "invalid", message: INVALID_TEAM_FILE_MESSAGE, issues: [`team.logo: ${TEAM_LOGO_INVALID_MESSAGE}`] },
        });
        expect(parseTeamProfileDocument({ format: TEAM_PROFILE_FORMAT, version: 1 })).toMatchObject({ ok: false, error: { code: "invalid" } });
        expect(parseTeamProfileDocument({ ...DOC, exportedAt: "yesterday" })).toMatchObject({ ok: false, error: { code: "invalid" } });
    });

    it("refuses a newer version with its own message", async () => {
        expect(await readTeamProfileFile(file(JSON.stringify({ ...DOC, version: 2 })))).toEqual({ ok: false, error: { code: "newer-version", message: NEWER_TEAM_FILE_MESSAGE } });
    });

    it("refuses other files, and other readers refuse a team file", async () => {
        const rankings = serializeRankings(createRankingsDocument({ title: "Fall" }));
        expect(await readTeamProfileFile(file(rankings, "fall.rankings.json"))).toEqual({ ok: false, error: { code: "not-a-team-file", message: NOT_A_TEAM_FILE_MESSAGE } });
        expect(await readTeamProfileFile(file("{}"))).toEqual({ ok: false, error: { code: "not-a-team-file", message: NOT_A_TEAM_FILE_MESSAGE } });
        const team = serializeTeamProfileDocument(DOC);
        expect(await readPlanFile(file(team))).toEqual({ ok: false, error: { code: "not-a-plan", message: NOT_A_PLAN_MESSAGE } });
        expect(await readRankingsFile(file(team))).toEqual({ ok: false, error: { code: "not-rankings", message: NOT_RANKINGS_MESSAGE } });
    });

    it("refuses an oversized file without reading it", async () => {
        expect(await readTeamProfileFile(file("a".repeat(MAX_TEAM_PROFILE_FILE_BYTES + 1)))).toEqual({ ok: false, error: { code: "invalid", message: TEAM_FILE_TOO_LARGE_MESSAGE } });
    });

    it("names the file after the team", () => {
        expect(teamProfileFileName({ name: "Ice Hawks 12U" })).toBe("ice-hawks-12u.team.json");
        expect(teamProfileFileName({ name: "Équipe Été" })).toBe("equipe-ete.team.json");
        expect(teamProfileFileName({ name: "!!!" })).toBe("team.team.json");
    });
});
