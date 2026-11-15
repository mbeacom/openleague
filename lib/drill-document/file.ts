/**
 * Reading a chosen drill file. Size first, then the shared envelope reader
 * (ADR-0022), which accepts a bare or wrapped drill file and hands it to
 * parseDrillsDocument. Reads JSON, YAML, TOML or JSONC (lib/document-formats).
 * Never throws.
 */
import { ENVELOPE_OVERHEAD_BYTES, type DocumentError } from "@/lib/document-envelope";
import { fileSource, readAnyDocumentText } from "@/lib/document-formats";
import {
    DRILLS_FILE_TOO_LARGE_MESSAGE,
    DRILLS_FORMAT,
    MAX_DRILLS_FILE_BYTES,
    NOT_A_DRILLS_FILE_MESSAGE,
    type DrillsFileError,
    type ParseDrillsResult,
} from "./document";

/** The envelope's errors in the drill file reader's codes; messages and issues pass through. */
function toDrillsFileError(error: DocumentError): DrillsFileError {
    const code: DrillsFileError["code"] =
        error.code === "not-a-document" || error.code === "wrong-kind"
            ? "not-a-drills-file"
            : error.code === "newer-envelope" || error.code === "unknown-kind" || error.code === "newer-version"
              ? "newer-version"
              : "invalid";
    return { code, message: error.message, ...(error.issues ? { issues: error.issues } : {}) };
}

export async function readDrillsFile(file: File): Promise<ParseDrillsResult> {
    // No drill file, bare or wrapped, is larger than this: refuse without reading it.
    if (file.size > MAX_DRILLS_FILE_BYTES + ENVELOPE_OVERHEAD_BYTES) {
        return { ok: false, error: { code: "invalid", message: DRILLS_FILE_TOO_LARGE_MESSAGE } };
    }
    let text: string;
    try {
        text = await file.text();
    } catch {
        return { ok: false, error: { code: "not-a-drills-file", message: NOT_A_DRILLS_FILE_MESSAGE } };
    }
    const result = await readAnyDocumentText(text, file.name, fileSource(file), { kind: DRILLS_FORMAT });
    return result.ok ? { ok: true, doc: result.document.payload } : { ok: false, error: toDrillsFileError(result.error) };
}
