/** The portable drill file (#523): writing, reading and refusing it. */
import { describe, expect, it } from "vitest";
import {
    DRILLS_FILE_TOO_LARGE_MESSAGE,
    DRILLS_FORMAT,
    INVALID_DRILLS_FILE_MESSAGE,
    MAX_DRILLS_FILE_BYTES,
    MAX_FILE_DRILLS,
    NEWER_DRILLS_FILE_MESSAGE,
    NOT_A_DRILLS_FILE_MESSAGE,
    createDrillsDocument,
    drillsFileName,
    parseDrillsDocument,
    readDrillsFile,
    serializeDrillsDocument,
} from "@/lib/drill-document";
import { serializeDocument, wrapDocument } from "@/lib/document-envelope";
import { encodeDocument } from "@/lib/document-formats";
import { NOT_A_PLAN_MESSAGE, readPlanFile } from "@/lib/plan-document";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const NOW = new Date("2026-11-15T15:00:00.000Z");
const BREAKOUT = { name: "Breakout", description: "D to D, up the wall.", focus: "skaters" as const, goalies: "none" as const, ageGroups: ["u10" as const], playData: createEmptyPlayData() };
const WARMUP = { name: "Goalie Warm-Up", description: null, playData: null };
const DOC = createDrillsDocument([BREAKOUT, WARMUP], "openleague-static", NOW);

const file = (text: string, name = "2-drills.drills.json") => new File([text], name, { type: "application/json" });

describe("the drill file", () => {
    it("writes each drill's content only, with defaults for missing tags", () => {
        expect(DOC.format).toBe(DRILLS_FORMAT);
        expect(DOC.exportedAt).toBe(NOW.toISOString());
        expect(DOC.drills.map((drill) => [drill.name, drill.focus, drill.goalies, drill.ageGroups])).toEqual([
            ["Breakout", "skaters", "none", ["u10"]],
            ["Goalie Warm-Up", "team", "optional", []],
        ]);
        expect(Object.keys(DOC.drills[0]).sort()).toEqual(["ageGroups", "description", "focus", "goalies", "name", "playData"]);
    });

    it("round-trips through a file, wrapped or not, and through TOML", async () => {
        expect(await readDrillsFile(file(serializeDrillsDocument(DOC)))).toEqual({ ok: true, doc: DOC });
        const wrapped = serializeDocument(wrapDocument(DRILLS_FORMAT, DOC, { id: "0b7c1f0e-5a3e-4c1e-9a47-6f0d7b2f8a11", updatedAt: NOW.toISOString(), generator: "openleague-hosted" }));
        expect(await readDrillsFile(file(wrapped))).toEqual({ ok: true, doc: DOC });
        const toml = await encodeDocument(DOC, "toml");
        expect(await readDrillsFile(file(toml, "2-drills.drills.toml"))).toEqual({ ok: true, doc: DOC });
    });

    it("drops unknown keys", () => {
        const raw = JSON.parse(serializeDrillsDocument(DOC));
        raw.team = "Metro Blades";
        raw.drills[0].id = "cplay123";
        raw.drills[0].thumbnail = "data:image/png;base64,AA==";
        expect(parseDrillsDocument(raw)).toEqual({ ok: true, doc: DOC });
    });

    it("refuses a newer version, an empty or oversized list, and a nameless drill", () => {
        const raw = () => JSON.parse(serializeDrillsDocument(DOC));
        expect(parseDrillsDocument({ ...raw(), version: 2 })).toEqual({ ok: false, error: { code: "newer-version", message: NEWER_DRILLS_FILE_MESSAGE } });
        expect(parseDrillsDocument({ ...raw(), drills: [] })).toMatchObject({ ok: false, error: { code: "invalid", message: INVALID_DRILLS_FILE_MESSAGE } });
        const many = raw();
        many.drills = Array.from({ length: MAX_FILE_DRILLS + 1 }, () => many.drills[0]);
        expect(parseDrillsDocument(many)).toMatchObject({ ok: false, error: { code: "invalid" } });
        const nameless = raw();
        nameless.drills[1].name = " ";
        expect(parseDrillsDocument(nameless)).toMatchObject({ ok: false, error: { code: "invalid", issues: [expect.stringMatching(/^drills\.1\.name: /)] } });
        expect(() => createDrillsDocument([], "openleague-static")).toThrow(RangeError);
    });

    it("refuses other files, and the plan reader refuses a drill file", async () => {
        expect(await readDrillsFile(file("{}"))).toEqual({ ok: false, error: { code: "not-a-drills-file", message: NOT_A_DRILLS_FILE_MESSAGE } });
        expect(await readPlanFile(file(serializeDrillsDocument(DOC)))).toEqual({ ok: false, error: { code: "not-a-plan", message: NOT_A_PLAN_MESSAGE } });
        expect(await readDrillsFile(file("a".repeat(MAX_DRILLS_FILE_BYTES + 1)))).toEqual({ ok: false, error: { code: "invalid", message: DRILLS_FILE_TOO_LARGE_MESSAGE } });
    });

    it("names the file after one drill, or counts several", () => {
        expect(drillsFileName(createDrillsDocument([BREAKOUT], "openleague-static", NOW))).toBe("breakout.drills.json");
        expect(drillsFileName(DOC)).toBe("2-drills.drills.json");
    });
});
