/**
 * Reading a chosen plan file (ADR-0020), shared by the hosted import page and
 * the static planner. Size first, then the shared envelope reader (ADR-0022),
 * which accepts a bare plan or a wrapped one and hands it to parsePlan.
 * Reads JSON, YAML, TOML or JSONC (lib/document-formats). Never throws.
 */
import { ENVELOPE_OVERHEAD_BYTES, type DocumentError } from "@/lib/document-envelope";
import { readAnyDocumentText } from "@/lib/document-formats";
import { FILE_TOO_LARGE_MESSAGE, MAX_PLAN_FILE_BYTES, NOT_A_PLAN_MESSAGE, PLAN_FORMAT, type ParsePlanResult, type PlanError } from "./document";

/** The envelope's errors in the plan reader's codes; messages and issues pass through. */
function toPlanError(error: DocumentError): PlanError {
    const code: PlanError["code"] =
        error.code === "not-a-document" || error.code === "wrong-kind"
            ? "not-a-plan"
            : error.code === "newer-envelope" || error.code === "unknown-kind" || error.code === "newer-version"
              ? "newer-version"
              : "invalid";
    return { code, message: error.message, ...(error.issues ? { issues: error.issues } : {}) };
}

export async function readPlanFile(file: File): Promise<ParsePlanResult> {
    // No plan, bare or wrapped, is larger than this: refuse without reading it.
    if (file.size > MAX_PLAN_FILE_BYTES + ENVELOPE_OVERHEAD_BYTES) {
        return { ok: false, error: { code: "invalid", message: FILE_TOO_LARGE_MESSAGE } };
    }
    let text: string;
    try {
        text = await file.text();
    } catch {
        return { ok: false, error: { code: "not-a-plan", message: NOT_A_PLAN_MESSAGE } };
    }
    const result = await readAnyDocumentText(text, file.name, undefined, { kind: PLAN_FORMAT });
    return result.ok ? { ok: true, plan: result.document.payload } : { ok: false, error: toPlanError(result.error) };
}
