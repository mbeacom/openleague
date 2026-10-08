import { describe, expect, it } from "vitest";
import {
    MAX_RANKINGS_FILE_BYTES,
    NOT_RANKINGS_MESSAGE,
    RANKINGS_FILE_TOO_LARGE_MESSAGE,
    RANKINGS_FORMAT,
    createRankingsDocument,
    readRankingsFile,
    serializeRankings,
} from "@/lib/rankings-document";
import { INVALID_ENVELOPE_MESSAGE, serializeDocument, wrapDocument } from "@/lib/document-envelope";
import { PLAN_FORMAT, serializePlan } from "@/lib/plan-document";

const RANKINGS = createRankingsDocument({ title: "Fall Pre-season" });
const META = { id: "0b7c1f0e-5a3e-4c1e-9a47-6f0d7b2f8a11", updatedAt: "2026-10-07T18:04:00.000Z", generator: "openleague-static" } as const;

describe("readRankingsFile", () => {
    it("reads a bare rankings file", async () => {
        expect(await readRankingsFile(new File([serializeRankings(RANKINGS)], "fall.rankings.json"))).toEqual({ ok: true, doc: RANKINGS });
    });

    it("reads a wrapped rankings file to the bare document", async () => {
        const text = serializeDocument(wrapDocument(RANKINGS_FORMAT, RANKINGS, META));
        expect(await readRankingsFile(new File([text], "fall.rankings.json"))).toEqual({ ok: true, doc: RANKINGS });
    });

    it("refuses an oversized file", async () => {
        const result = await readRankingsFile(new File(["a".repeat(MAX_RANKINGS_FILE_BYTES + 1)], "big.json"));
        expect(result).toEqual({ ok: false, error: { code: "invalid", message: RANKINGS_FILE_TOO_LARGE_MESSAGE } });
    });

    it("says a non-JSON file or a plan isn't a rankings file", async () => {
        const plan = serializePlan({ title: "Tuesday Skills", durationMinutes: 60, date: null, startTime: null, drills: [] }, "openleague-static");
        const notRankings = { ok: false, error: { code: "not-rankings", message: NOT_RANKINGS_MESSAGE } };
        expect(await readRankingsFile(new File(["not json"], "notes.txt"))).toEqual(notRankings);
        expect(await readRankingsFile(new File([serializeDocument(wrapDocument(PLAN_FORMAT, plan, META))], "plan.olplan.json"))).toEqual(notRankings);
    });

    it("reports a damaged envelope as invalid", async () => {
        const text = JSON.stringify({ ...wrapDocument(RANKINGS_FORMAT, RANKINGS, META), id: "nope" });
        expect(await readRankingsFile(new File([text], "fall.rankings.json"))).toMatchObject({
            ok: false,
            error: { code: "invalid", message: INVALID_ENVELOPE_MESSAGE },
        });
    });

    it("treats a file that can't be read as not a rankings file, without throwing", async () => {
        const unreadable = { size: 10, text: () => Promise.reject(new Error("read failed")) } as unknown as File;
        await expect(readRankingsFile(unreadable)).resolves.toEqual({ ok: false, error: { code: "not-rankings", message: NOT_RANKINGS_MESSAGE } });
    });
});
