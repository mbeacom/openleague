/**
 * One entry point for opening a portable document in any format: detect the
 * format (extension, then content), decode it to plain data, and hand that,
 * as JSON, to the shared envelope reader (ADR-0022), which applies the kind's
 * own size limit, version rules and schema. Never throws.
 *
 * Size, twice: the raw text is held to the same limit readDocumentText uses
 * before anything is parsed or a library loaded, and the decoded data is
 * measured again as canonical JSON, the form the hosted import sends.
 */
import {
    DOCUMENT_KINDS,
    DOCUMENT_TOO_LARGE_MESSAGE,
    ENVELOPE_OVERHEAD_BYTES,
    NOT_A_DOCUMENT_MESSAGE,
    readDocumentText,
    type DocumentKind,
    type DocumentSource,
    type ExpectKind,
    type ReadDocumentResult,
} from "@/lib/document-envelope";
import { FORMAT_LOAD_FAILED_MESSAGE, FormatModuleLoadError, decodeDocumentText } from "./codecs";
import { detectFormat } from "./formats";

export const SELF_REFERENCE_MESSAGE = "This file refers to itself (a YAML alias inside its own anchor) and can't be opened.";
export const NON_FINITE_NUMBER_MESSAGE = "This file has a number OpenLeague can't keep (infinity, not-a-number, or too large) and can't be opened.";

/** Thrown from a JSON replacer or reviver when it meets a number JSON can't hold. */
class NonFiniteNumberError extends Error {}

/** Refuses NaN and ±Infinity, which JSON.stringify would quietly write as null. */
function finiteOnly(_key: string, value: unknown): unknown {
    if (typeof value === "number" && !Number.isFinite(value)) throw new NonFiniteNumberError();
    return value;
}

const LARGEST_KIND_BYTES = Math.max(...Object.values(DOCUMENT_KINDS).map((entry) => entry.maxBytes));

const byteLength = (text: string) => new TextEncoder().encode(text).byteLength;

/** Reads `text` in any supported format. `fileName` picks the format when its extension is known. */
export async function readAnyDocumentText(text: string, fileName: string | null | undefined, source?: DocumentSource): Promise<ReadDocumentResult>;
export async function readAnyDocumentText<K extends DocumentKind>(
    text: string,
    fileName: string | null | undefined,
    source: DocumentSource | undefined,
    expect: ExpectKind<K>,
): Promise<ReadDocumentResult<K>>;
export async function readAnyDocumentText(
    text: string,
    fileName: string | null | undefined,
    source?: DocumentSource,
    expect?: ExpectKind<DocumentKind>,
): Promise<ReadDocumentResult> {
    const read = (json: string) => (expect ? readDocumentText(json, source, expect) : readDocumentText(json, source));
    const entry = expect ? DOCUMENT_KINDS[expect.kind] : null;
    // The same pre-parse ceiling as readDocumentText: refused before detection or any library.
    if (byteLength(text) > (entry?.maxBytes ?? LARGEST_KIND_BYTES) + ENVELOPE_OVERHEAD_BYTES) {
        return { ok: false, error: { code: "too-large", message: entry?.tooLargeMessage ?? DOCUMENT_TOO_LARGE_MESSAGE } };
    }
    const nonFinite: ReadDocumentResult = { ok: false, error: { code: "not-a-document", message: NON_FINITE_NUMBER_MESSAGE } };
    const format = detectFormat(fileName, text);
    if (format === "json") {
        // A number too large for a double (1e999) parses as Infinity and would be stored as null.
        try {
            JSON.parse(text, finiteOnly);
        } catch (error) {
            if (error instanceof NonFiniteNumberError) return nonFinite;
            // Malformed JSON: the envelope reader gives the kind's own message.
        }
        return read(text);
    }

    let decoded;
    try {
        decoded = await decodeDocumentText(text, format);
    } catch (error) {
        const message = error instanceof FormatModuleLoadError ? FORMAT_LOAD_FAILED_MESSAGE : (entry?.notThisKindMessage ?? NOT_A_DOCUMENT_MESSAGE);
        return { ok: false, error: { code: "not-a-document", message } };
    }
    if (!decoded.ok) return { ok: false, error: { code: "not-a-document", message: decoded.message } };
    // TOML dates become their own text here (TomlDate.toJSON); an empty file is null.
    // Every number must be finite (YAML .nan / .inf, TOML nan / inf, JSONC 1e999), checked as it is serialized.
    let json: string;
    try {
        json = JSON.stringify(decoded.value ?? null, finiteOnly);
    } catch (error) {
        if (error instanceof NonFiniteNumberError) return nonFinite;
        // A YAML anchor that contains its own alias decodes to a cycle.
        return { ok: false, error: { code: "not-a-document", message: SELF_REFERENCE_MESSAGE } };
    }
    return read(json);
}
