import { describe, expect, it } from "vitest";
import {
    FILE_TOO_LARGE_MESSAGE,
    MAX_PLAN_FILE_BYTES,
    NOT_A_PLAN_MESSAGE,
    readPlanFile,
    serializePlan,
} from "@/lib/plan-document";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const PLAN = serializePlan(
    {
        title: "Tuesday Skills",
        durationMinutes: 60,
        date: "2026-10-06",
        startTime: "19:00",
        drills: [{ sequence: 0, duration: 10, runsWithPrevious: false, instructions: null, name: "Breakout", description: null, playData: createEmptyPlayData() }],
    },
    "openleague-static",
);

describe("readPlanFile", () => {
    it("parses a plan file", async () => {
        const result = await readPlanFile(new File([JSON.stringify(PLAN)], "tuesday.olplan.json"));
        expect(result.ok && result.plan.session.title).toBe("Tuesday Skills");
    });

    it("refuses an oversized file before reading it", async () => {
        const result = await readPlanFile(new File(["a".repeat(MAX_PLAN_FILE_BYTES + 1)], "big.json"));
        expect(result).toEqual({ ok: false, error: { code: "invalid", message: FILE_TOO_LARGE_MESSAGE } });
    });

    it("says a non-JSON file isn't a plan", async () => {
        const result = await readPlanFile(new File(["not json"], "notes.txt"));
        expect(result).toEqual({ ok: false, error: { code: "not-a-plan", message: NOT_A_PLAN_MESSAGE } });
    });
});
