import { describe, expect, it } from "vitest";
import {
    FILE_TOO_LARGE_MESSAGE,
    MAX_PLAN_FILE_BYTES,
    NOT_A_PLAN_MESSAGE,
    PLAN_FORMAT,
    readPlanFile,
    serializePlan,
} from "@/lib/plan-document";
import { DOCUMENT_ENVELOPE_FORMAT, ENVELOPE_OVERHEAD_BYTES, NEWER_ENVELOPE_MESSAGE, UNKNOWN_KIND_MESSAGE, serializeDocument, wrapDocument } from "@/lib/document-envelope";
import { RANKINGS_FORMAT, createRankingsDocument } from "@/lib/rankings-document";
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
const META = { id: "0b7c1f0e-5a3e-4c1e-9a47-6f0d7b2f8a11", updatedAt: "2026-10-07T18:04:00.000Z", generator: "openleague-static" } as const;

describe("readPlanFile", () => {
    it("parses a plan file", async () => {
        const result = await readPlanFile(new File([JSON.stringify(PLAN)], "tuesday.olplan.json"));
        expect(result.ok && result.plan.session.title).toBe("Tuesday Skills");
    });

    it("refuses a file over the plan's limit that isn't a wrapped plan", async () => {
        const result = await readPlanFile(new File(["a".repeat(MAX_PLAN_FILE_BYTES + 1)], "big.json"));
        expect(result).toEqual({ ok: false, error: { code: "invalid", message: FILE_TOO_LARGE_MESSAGE } });
    });

    it("refuses a file over the plan's limit plus the envelope's without reading it", async () => {
        const file = new File(["a".repeat(MAX_PLAN_FILE_BYTES + ENVELOPE_OVERHEAD_BYTES + 1)], "big.json");
        file.text = () => Promise.reject(new Error("read"));
        expect(await readPlanFile(file)).toEqual({ ok: false, error: { code: "invalid", message: FILE_TOO_LARGE_MESSAGE } });
    });

    it("says a non-JSON file isn't a plan", async () => {
        const result = await readPlanFile(new File(["not json"], "notes.txt"));
        expect(result).toEqual({ ok: false, error: { code: "not-a-plan", message: NOT_A_PLAN_MESSAGE } });
    });

    it("reads a wrapped plan file to the bare plan", async () => {
        const text = serializeDocument(wrapDocument(PLAN_FORMAT, PLAN, META));
        expect(await readPlanFile(new File([text], "tuesday.olplan.json"))).toEqual({ ok: true, plan: PLAN });
    });

    it("says a rankings file, bare or wrapped, isn't a plan", async () => {
        const rankings = createRankingsDocument({ title: "Fall Pre-season" });
        const notAPlan = { ok: false, error: { code: "not-a-plan", message: NOT_A_PLAN_MESSAGE } };
        expect(await readPlanFile(new File([JSON.stringify(rankings)], "fall.rankings.json"))).toEqual(notAPlan);
        expect(await readPlanFile(new File([serializeDocument(wrapDocument(RANKINGS_FORMAT, rankings, META))], "fall.rankings.json"))).toEqual(notAPlan);
    });

    it("reports a newer envelope or an unknown kind as needing a newer version", async () => {
        const newer = JSON.stringify({ format: DOCUMENT_ENVELOPE_FORMAT, envelope: 2 });
        const future = JSON.stringify({
            ...wrapDocument(PLAN_FORMAT, PLAN, META),
            kind: "openleague.goalie-rotation",
            payload: { format: "openleague.goalie-rotation", version: 1 },
        });
        expect(await readPlanFile(new File([newer], "x.json"))).toEqual({ ok: false, error: { code: "newer-version", message: NEWER_ENVELOPE_MESSAGE } });
        expect(await readPlanFile(new File([future], "x.json"))).toEqual({ ok: false, error: { code: "newer-version", message: UNKNOWN_KIND_MESSAGE } });
    });

    it("treats a file that can't be read as not a plan, without throwing", async () => {
        const unreadable = { size: 10, text: () => Promise.reject(new Error("read failed")) } as unknown as File;
        await expect(readPlanFile(unreadable)).resolves.toEqual({ ok: false, error: { code: "not-a-plan", message: NOT_A_PLAN_MESSAGE } });
    });
});
