/**
 * Reading a chosen rankings file. Size first, then the shared envelope reader
 * (ADR-0022), which accepts bare or wrapped rankings and hands them to
 * parseRankings. Reads JSON, YAML, TOML or JSONC (lib/document-formats).
 * Never throws.
 */
import { ENVELOPE_OVERHEAD_BYTES, type DocumentError } from "@/lib/document-envelope";
import { fileSource, readAnyDocumentText } from "@/lib/document-formats";
import {
    MAX_RANKINGS_FILE_BYTES,
    NOT_RANKINGS_MESSAGE,
    RANKINGS_FILE_TOO_LARGE_MESSAGE,
    RANKINGS_FORMAT,
    type ParseRankingsResult,
    type RankingsDocument,
    type RankingsError,
} from "./document";

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

/** What a rankings file says about itself besides the document (ADR-0022). */
export interface RankingsFileIdentity {
    /** The envelope id; null for a bare file. */
    id: string | null;
    /** The envelope's updatedAt; for a bare file, the file's lastModified, else null (spec R2). */
    updatedAt: string | null;
    wrapped: boolean;
}

export type ReadRankingsFileDocumentResult = ({ ok: true; doc: RankingsDocument } & RankingsFileIdentity) | { ok: false; error: RankingsError };

/** readRankingsFile plus the file's identity: the envelope id and updatedAt, with the file's own time as the fallback. */
export async function readRankingsFileDocument(file: File): Promise<ReadRankingsFileDocumentResult> {
    // No rankings file, bare or wrapped, is larger than this: refuse without reading it.
    if (file.size > MAX_RANKINGS_FILE_BYTES + ENVELOPE_OVERHEAD_BYTES) {
        return { ok: false, error: { code: "invalid", message: RANKINGS_FILE_TOO_LARGE_MESSAGE } };
    }
    let text: string;
    try {
        text = await file.text();
    } catch {
        return { ok: false, error: { code: "not-rankings", message: NOT_RANKINGS_MESSAGE } };
    }
    const result = await readAnyDocumentText(text, file.name, fileSource(file), { kind: RANKINGS_FORMAT });
    if (!result.ok) return { ok: false, error: toRankingsError(result.error) };
    const { payload, id, updatedAt, wrapped } = result.document;
    return { ok: true, doc: payload, id, updatedAt, wrapped };
}

export async function readRankingsFile(file: File): Promise<ParseRankingsResult> {
    const result = await readRankingsFileDocument(file);
    return result.ok ? { ok: true, doc: result.doc } : result;
}
