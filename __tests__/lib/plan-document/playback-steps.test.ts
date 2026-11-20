/** Playback steps (ADR-0020 amendment 2026-11-20) survive every sharing path: plan file, plan link and drill file. */
import { describe, expect, it } from "vitest";
import { parsePlan, serializePlan, encodePlanLink, readPlanLink, type PlanSessionInput } from "@/lib/plan-document";
import { createDrillsDocument, parseDrillsDocument, serializeDrillsDocument } from "@/lib/drill-document";
import { drillRows } from "@/lib/utils/session-rows";
import { PLAY_DATA_VERSION, type PlayData } from "@/types/practice-planner";

const NOW = new Date("2026-11-20T15:00:00.000Z");
const STEPPED: PlayData = {
    version: PLAY_DATA_VERSION,
    players: [{ id: "a", role: "F", label: "A", position: { x: 20, y: 20 }, color: "#1976D2" }],
    drawings: [
        { id: "s1", action: "carry", path: "straight", end: "arrow", points: [{ x: 22, y: 20 }, { x: 60, y: 20 }], color: "#212121", strokeWidth: 3, step: 2 },
        { id: "s2", action: "skate", path: "straight", end: "arrow", points: [{ x: 60, y: 20 }, { x: 60, y: 60 }], color: "#212121", strokeWidth: 3, step: 1 },
        { id: "s3", action: "pass", path: "straight", end: "arrow", points: [{ x: 60, y: 60 }, { x: 90, y: 60 }], color: "#212121", strokeWidth: 3 },
    ],
    equipment: [],
    annotations: [],
};
const steps = (pd: PlayData) => pd.drawings.map((d) => d.step);

const input: PlanSessionInput = {
    title: "Steps night",
    durationMinutes: 30,
    date: null,
    startTime: null,
    drills: [{ sequence: 0, duration: 10, runsWithPrevious: false, instructions: null, name: "Angling", description: null, playData: STEPPED }],
};

describe("playback steps through sharing", () => {
    it("round-trip through a plan file", () => {
        const parsed = parsePlan(JSON.parse(JSON.stringify(serializePlan(input, "openleague-static", NOW))));
        if (!parsed.ok) throw new Error(parsed.error.message);
        expect(steps(drillRows(parsed.plan.session.drills)[0].drill.playData)).toEqual([2, 1, undefined]);
    });

    it("round-trip through a plan link", async () => {
        const result = await readPlanLink(await encodePlanLink(serializePlan(input, "openleague-hosted", NOW)));
        if (!result.ok) throw new Error(result.error.message);
        expect(steps(drillRows(result.plan.session.drills)[0].drill.playData)).toEqual([2, 1, undefined]);
    });

    it("round-trip through a drill file", () => {
        const doc = createDrillsDocument([{ name: "Angling", description: null, playData: STEPPED }], "openleague-static", NOW);
        const parsed = parseDrillsDocument(JSON.parse(serializeDrillsDocument(doc)));
        if (!parsed.ok) throw new Error(parsed.error.message);
        expect(steps(parsed.doc.drills[0].playData)).toEqual([2, 1, undefined]);
    });

    it("open a file with a bad step, keeping the drill without that step", () => {
        const raw = JSON.parse(JSON.stringify(serializePlan(input, "openleague-static", NOW)));
        raw.session.drills[0].drill.playData.drawings[0].step = 0;
        const error = console.error;
        console.error = () => {};
        try {
            const parsed = parsePlan(raw);
            if (!parsed.ok) throw new Error(parsed.error.message);
            expect(steps(drillRows(parsed.plan.session.drills)[0].drill.playData)).toEqual([undefined, 1, undefined]);
        } finally {
            console.error = error;
        }
    });
});
