/**
 * Reading a chosen team file. Size first, then the shared envelope reader
 * (ADR-0022), which accepts a bare or wrapped team file and hands it to
 * parseTeamProfileDocument. Reads JSON, YAML, TOML or JSONC
 * (lib/document-formats). Never throws.
 */
import { ENVELOPE_OVERHEAD_BYTES, type DocumentError } from "@/lib/document-envelope";
import { fileSource, readAnyDocumentText } from "@/lib/document-formats";
import {
    MAX_TEAM_PROFILE_FILE_BYTES,
    NOT_A_TEAM_FILE_MESSAGE,
    TEAM_FILE_TOO_LARGE_MESSAGE,
    TEAM_PROFILE_FORMAT,
    type ParseTeamProfileResult,
    type TeamProfileFileError,
} from "./document";

/** The envelope's errors in the team file reader's codes; messages and issues pass through. */
function toTeamProfileFileError(error: DocumentError): TeamProfileFileError {
    const code: TeamProfileFileError["code"] =
        error.code === "not-a-document" || error.code === "wrong-kind"
            ? "not-a-team-file"
            : error.code === "newer-envelope" || error.code === "unknown-kind" || error.code === "newer-version"
              ? "newer-version"
              : "invalid";
    return { code, message: error.message, ...(error.issues ? { issues: error.issues } : {}) };
}

export async function readTeamProfileFile(file: File): Promise<ParseTeamProfileResult> {
    // No team file, bare or wrapped, is larger than this: refuse without reading it.
    if (file.size > MAX_TEAM_PROFILE_FILE_BYTES + ENVELOPE_OVERHEAD_BYTES) {
        return { ok: false, error: { code: "invalid", message: TEAM_FILE_TOO_LARGE_MESSAGE } };
    }
    let text: string;
    try {
        text = await file.text();
    } catch {
        return { ok: false, error: { code: "not-a-team-file", message: NOT_A_TEAM_FILE_MESSAGE } };
    }
    const result = await readAnyDocumentText(text, file.name, fileSource(file), { kind: TEAM_PROFILE_FORMAT });
    return result.ok ? { ok: true, doc: result.document.payload } : { ok: false, error: toTeamProfileFileError(result.error) };
}
