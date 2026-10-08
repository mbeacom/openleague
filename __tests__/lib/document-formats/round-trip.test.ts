/**
 * Config-format exports: every format carries the same document. Each round
 * trip is encode → readAnyDocumentText → the kind's parsed document, compared
 * with the JSON reading of the same document (nulls TOML leaves out return as
 * the schema's defaults).
 */
import { describe, expect, it } from "vitest";
import { readDocumentText } from "@/lib/document-envelope";
import { DOCUMENT_FORMATS, encodeDocument, fileNameForFormat, readAnyDocumentText, type DocumentFormat } from "@/lib/document-formats";
import { PLAN_FORMAT, planFileName, serializePlan, type PlanDocument, type PlanSessionInput } from "@/lib/plan-document";
import { RANKINGS_FORMAT, rankingsFileName, type RankingsDocument } from "@/lib/rankings-document";
import type { PlayData } from "@/types/practice-planner";
import { sampleRankingsDoc } from "../../apps/planner/rankings-fixtures";

const NOW = new Date("2026-10-07T18:00:00.000Z");

const BOARD: PlayData = {
    version: 2,
    players: [
        { id: "p1", position: { x: 50.5, y: 40 }, role: "F", label: "F1", color: "#1976D2" },
        { id: "p2", position: { x: 120, y: 60.25 }, role: "G", label: "", color: "#0D47A1" },
    ],
    drawings: [
        { id: "d1", action: "skate", path: "curve", end: "arrow", points: [{ x: 10, y: 10 }, { x: 20.5, y: 22 }, { x: 31, y: 18 }], color: "#000000", strokeWidth: 2 },
        { id: "d2", action: "pass", path: "straight", end: "none", points: [{ x: 5, y: 5 }, { x: 15, y: 25 }], color: "#D32F2F", strokeWidth: 1.5 },
    ],
    equipment: [
        { id: "e1", kind: "net", position: { x: 11, y: 42.5 }, rotation: 90 },
        { id: "e2", kind: "cone", position: { x: 60, y: 30 }, rotation: 0 },
    ],
    annotations: [{ id: "a1", text: "Stop: \"go\" # not a comment", position: { x: 70, y: 70 }, fontSize: 14, color: "#2E7D32" }],
    area: { kind: "custom", rect: { x: 0, y: 0, w: 100, h: 85 } },
};

/** Stations, blocks, staff, diagrams, and strings each format could mistake for something else. */
function richPlanInput(): PlanSessionInput {
    return {
        title: "Riverside 912: true / null / 1e5 😀",
        durationMinutes: 90,
        date: "2026-10-07",
        startTime: "18:30",
        goaliesAttending: 2,
        transitionMinutes: 1,
        staff: ["Coach A", "Coach B"],
        drills: [
            { kind: "warmup", sequence: 0, duration: 10, runsWithPrevious: false, instructions: "Line 1\r\nLine 2\tTabbed", label: "Dynamic warm-up", staff: ["Coach A"] },
            {
                sequence: 1,
                duration: 12,
                runsWithPrevious: false,
                instructions: "Station 1: 007",
                name: "Breakout",
                description: "yes\nno\non\noff",
                focus: "skaters",
                goalies: "required",
                ageGroups: ["u10", "u12"],
                rotateEveryMinutes: 4,
                staff: ["Coach A"],
                playData: BOARD,
            },
            { sequence: 2, duration: 12, runsWithPrevious: true, instructions: null, name: "Net front", description: null, stays: true, staff: ["Coach B"], playData: BOARD },
            { sequence: 3, duration: 12, runsWithPrevious: true, instructions: "", name: "~", description: "- not a list", playData: null },
            { kind: "break", sequence: 4, duration: 3, runsWithPrevious: false, instructions: null, label: null },
            { sequence: 5, duration: 15, runsWithPrevious: false, instructions: "[not a table]", name: "Scrimmage", description: "key = value", playData: BOARD },
            { kind: "cooldown", sequence: 6, duration: 5, runsWithPrevious: false, instructions: "'single' and \"double\"", label: "Stretch" },
        ],
    };
}

function richPlan(): PlanDocument {
    return serializePlan(richPlanInput(), "openleague-static", NOW);
}

/** The document as the JSON reader sees it: what every other format must equal. */
function canonical<T>(doc: object, kind: typeof PLAN_FORMAT | typeof RANKINGS_FORMAT): T {
    const result = readDocumentText(JSON.stringify(doc), undefined, { kind } as never);
    if (!result.ok) throw new Error(`fixture doesn't read: ${JSON.stringify(result.error)}`);
    return result.document.payload as T;
}

function richRankings(): RankingsDocument {
    return sampleRankingsDoc({
        meta: { title: "Fall: true # null", ageGroup: "10U", seasonLabel: "2026-27", source: null },
        teams: [
            { number: "007", name: "Riverside 912", startingBracket: "Red Strong", excluded: false },
            { number: "902", name: "Lakeview: M2", startingBracket: null, excluded: true },
            { number: "1e5", name: "Hilltop - M1", startingBracket: "White Strong", excluded: false },
            { number: "904", name: "Brookside \"B\"", startingBracket: "White Strong", excluded: false },
        ],
        games: [
            { date: "2026-09-20", time: "09:00", home: "007", away: "902", homeGoals: 3, awayGoals: 0, status: "final", rink: "Rink A" },
            { date: "2026-09-21", time: null, home: "902", away: "1e5", homeGoals: 4, awayGoals: 1, status: "final", rink: null },
            { date: "2026-10-12", time: "08:00", home: "1e5", away: "904", homeGoals: null, awayGoals: null, status: "scheduled", rink: "Rink B" },
        ],
        myTeam: "1e5",
        bracketOrder: ["Red Strong", "White Strong"],
        sources: { schedule: { url: "https://example.org/schedule?a=1&b=2", lastReadAt: "2026-10-07T12:00:00.000Z" }, snakeChart: { url: "https://example.org/snake", lastReadAt: null } },
    });
}

describe("round trip per format", () => {
    it("the rich plan fixture really holds stations, blocks, staff and diagrams", () => {
        const plan = canonical<PlanDocument>(richPlan(), PLAN_FORMAT);
        const kinds = plan.session.drills.map((row) => row.kind);
        expect(kinds).toEqual(["warmup", "drill", "drill", "drill", "break", "drill", "cooldown"]);
        const station = plan.session.drills[1];
        expect(station.kind === "drill" && station.rotateEveryMinutes).toBe(4);
        expect(plan.session.drills[2].kind === "drill" && plan.session.drills[2].runsWithPrevious).toBe(true);
        expect(plan.session.staff).toEqual(["Coach A", "Coach B"]);
        const drill = plan.session.drills[1];
        expect(drill.kind === "drill" && drill.drill.playData.area).toEqual({ kind: "custom", rect: { x: 0, y: 0, w: 100, h: 85 } });
        expect(drill.kind === "drill" && [drill.drill.focus, drill.drill.goalies, drill.drill.ageGroups]).toEqual(["skaters", "required", ["u10", "u12"]]);
        // Nulls the TOML mapping must restore.
        expect(plan.session.drills[4].kind !== "drill" && plan.session.drills[4].label).toBeNull();
        expect(plan.session.drills[2].kind === "drill" && plan.session.drills[2].rotateEveryMinutes).toBeNull();
    });

    it.each(DOCUMENT_FORMATS)("a rich plan reads back identically from %s", async (format: DocumentFormat) => {
        const doc = richPlan();
        const text = await encodeDocument(doc, format);
        const result = await readAnyDocumentText(text, fileNameForFormat(planFileName(doc.session.title), format), undefined, { kind: PLAN_FORMAT });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.document.payload).toEqual(canonical(doc, PLAN_FORMAT));
        expect(result.document.wrapped).toBe(false);
    });

    it.each(DOCUMENT_FORMATS)("a rich rankings document reads back identically from %s", async (format: DocumentFormat) => {
        const doc = richRankings();
        const text = await encodeDocument(doc, format);
        const result = await readAnyDocumentText(text, fileNameForFormat(rankingsFileName(doc), format), undefined, { kind: RANKINGS_FORMAT });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.document.payload).toEqual(canonical(doc, RANKINGS_FORMAT));
    });

    it.each(DOCUMENT_FORMATS)("a %s file reads back with no file name (content sniffing)", async (format: DocumentFormat) => {
        const doc = richPlan();
        const result = await readAnyDocumentText(await encodeDocument(doc, format), null, undefined, { kind: PLAN_FORMAT });
        expect(result.ok && result.document.payload).toEqual(canonical(doc, PLAN_FORMAT));
    });

    it("JSON is exactly the plain export, so existing files and readers are unchanged", async () => {
        const doc = richRankings();
        expect(await encodeDocument(doc, "json")).toBe(`${JSON.stringify(doc, null, 2)}\n`);
    });

    it("an envelope round-trips in every format too (readers accept both forms)", async () => {
        const plan = richPlan();
        const wrapped = {
            format: "openleague.document",
            envelope: 1,
            kind: PLAN_FORMAT,
            version: 1,
            id: "1b4e28ba-2fa1-41d2-883f-0016d3cca427",
            updatedAt: "2026-10-07T18:00:00.000Z",
            generator: "openleague-static",
            payload: plan,
        };
        for (const format of DOCUMENT_FORMATS) {
            const result = await readAnyDocumentText(await encodeDocument(wrapped, format), `x.olplan${format === "json" ? ".json" : `.${format}`}`, undefined, { kind: PLAN_FORMAT });
            expect(result.ok && result.document.wrapped).toBe(true);
            expect(result.ok && result.document.payload).toEqual(canonical(plan, PLAN_FORMAT));
        }
    });
});

describe("headers", () => {
    it("JSONC, YAML and TOML say what the file is and how to open it, never a name or data", async () => {
        const doc = richPlan();
        for (const format of ["jsonc", "yaml", "toml"] as const) {
            const text = await encodeDocument(doc, format);
            const header = text.split("\n").filter((line) => line.startsWith("//") || line.startsWith("#")).join("\n");
            expect(header).toContain("openleague.practice-plan, version 1");
            expect(header).toContain("Import plan");
            for (const secret of ["Riverside", "Coach A", "Breakout", "2026-10-07"]) expect(header).not.toContain(secret);
        }
        const rankings = await encodeDocument(richRankings(), "jsonc");
        expect(rankings.startsWith("// OpenLeague rankings file (openleague.rankings, version 1)")).toBe(true);
    });
});
