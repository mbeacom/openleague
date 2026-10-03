/**
 * Reading a chosen plan file (ADR-0020), shared by the hosted import page and
 * the static planner. Size first, then JSON, then parsePlan. Never throws.
 */
import { MAX_PLAN_FILE_BYTES, NOT_A_PLAN_MESSAGE, parsePlan, type ParsePlanResult } from "./document";

export const FILE_TOO_LARGE_MESSAGE = `This file is too large to be a practice plan (the limit is ${MAX_PLAN_FILE_BYTES / 1000} KB).`;

export async function readPlanFile(file: File): Promise<ParsePlanResult> {
    if (file.size > MAX_PLAN_FILE_BYTES) {
        return { ok: false, error: { code: "invalid", message: FILE_TOO_LARGE_MESSAGE } };
    }
    let raw: unknown;
    try {
        raw = JSON.parse(await file.text());
    } catch {
        return { ok: false, error: { code: "not-a-plan", message: NOT_A_PLAN_MESSAGE } };
    }
    return parsePlan(raw);
}
