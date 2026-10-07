/**
 * Reading a chosen rankings file. Size first, then the shared envelope reader
 * (ADR-0022), which accepts bare or wrapped rankings and hands them to
 * parseRankings. Never throws.
 */
import { ENVELOPE_OVERHEAD_BYTES, readDocumentText, type DocumentError } from "@/lib/document-envelope";
import { MAX_RANKINGS_FILE_BYTES, RANKINGS_FILE_TOO_LARGE_MESSAGE, RANKINGS_FORMAT, type ParseRankingsResult, type RankingsError } from "./document";

/** The envelope's errors in the rankings reader's codes; messages and issues pass through. */
function toRankingsError(error: DocumentError): RankingsError {
    const code: RankingsError["code"] =
        error.code === "not-a-document" || error.code === "wrong-kind"
            ? "not-rankings"
            : error.code === "newer-envelope" || error.code === "unknown-kind" || error.code === "newer-version"
              ? "newer-version"
              : "invalid";
    return { code, message: error.message, ...(error.issues ? { issues: error.issues } : {}) };
}

export async function readRankingsFile(file: File): Promise<ParseRankingsResult> {
    // No rankings file, bare or wrapped, is larger than this: refuse without reading it.
    if (file.size > MAX_RANKINGS_FILE_BYTES + ENVELOPE_OVERHEAD_BYTES) {
        return { ok: false, error: { code: "invalid", message: RANKINGS_FILE_TOO_LARGE_MESSAGE } };
    }
    const result = readDocumentText(await file.text(), undefined, { kind: RANKINGS_FORMAT });
    return result.ok ? { ok: true, doc: result.document.payload } : { ok: false, error: toRankingsError(result.error) };
}
