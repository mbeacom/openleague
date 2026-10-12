/**
 * File text for a connector save, in the format the file's own name names
 * (storage connectors plan, Ruling 10): a linked `.yaml`, `.toml` or `.jsonc`
 * file is saved back in its format, anything else as JSON. The encoding itself
 * is lib/document-formats', so every connector writes what Download writes.
 */
import { serializeDocument, type DocumentEnvelope } from "@/lib/document-envelope";
import { DocumentEncodeError, FormatModuleLoadError, decodeDocumentText, encodeDocument, formatFromFileName, type DocumentFormat } from "@/lib/document-formats";
import type { ConnectorError } from "./connector";

export const FORMAT_WRITER_LOAD_FAILED_MESSAGE = "Couldn't load the writer for this file type. Check your connection and try again.";

export type EncodeResult = { ok: true; text: string } | { ok: false; error: Extract<ConnectorError, { code: "unwritable" }> };

const formatOf = (fileName: string): DocumentFormat => formatFromFileName(fileName) ?? "json";

async function encode(value: object, format: DocumentFormat): Promise<EncodeResult> {
    try {
        return { ok: true, text: await encodeDocument(value, format) };
    } catch (error) {
        if (error instanceof DocumentEncodeError) return { ok: false, error: { code: "unwritable", message: error.message } };
        if (error instanceof FormatModuleLoadError) return { ok: false, error: { code: "unwritable", message: FORMAT_WRITER_LOAD_FAILED_MESSAGE } };
        throw error;
    }
}

/** The envelope as the text of a file called `fileName`. */
export async function documentFileText(envelope: DocumentEnvelope, fileName: string): Promise<EncodeResult> {
    const format = formatOf(fileName);
    return format === "json" ? { ok: true, text: serializeDocument(envelope) } : encode(envelope, format);
}

/**
 * Text written for a file called `fromName`, rewritten for `toName` when the
 * two names name different formats (a save picker the coach typed another
 * extension into). The text is always the app's own output, so it decodes.
 */
export async function reencodeForFile(text: string, fromName: string, toName: string): Promise<EncodeResult> {
    const from = formatOf(fromName);
    const to = formatOf(toName);
    if (from === to) return { ok: true, text };
    let value: unknown;
    if (from === "json") {
        value = JSON.parse(text);
    } else {
        let decoded;
        try {
            decoded = await decodeDocumentText(text, from);
        } catch (error) {
            if (error instanceof FormatModuleLoadError) return { ok: false, error: { code: "unwritable", message: FORMAT_WRITER_LOAD_FAILED_MESSAGE } };
            throw error;
        }
        if (!decoded.ok) return { ok: false, error: { code: "unwritable", message: decoded.message } };
        value = decoded.value;
    }
    return encode(value as object, to);
}
