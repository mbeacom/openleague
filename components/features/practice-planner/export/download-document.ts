/** Saving a portable document (plan, rankings) in a chosen format (config-format exports spec). */
import { DOCUMENT_FORMAT_INFO, encodeDocument, fileNameForFormat, type DocumentFormat } from "@/lib/document-formats";
import { downloadBlob } from "./download";

/**
 * Encodes `doc` in `format` and downloads it as `jsonFileName` with the
 * format's extension. Returns the text written. Throws DocumentEncodeError when
 * the format can't hold the document, FormatModuleLoadError when its library
 * didn't load.
 */
export async function downloadDocumentFile(doc: object, jsonFileName: string, format: DocumentFormat): Promise<string> {
    const text = await encodeDocument(doc, format);
    downloadBlob(new Blob([text], { type: DOCUMENT_FORMAT_INFO[format].mimeType }), fileNameForFormat(jsonFileName, format));
    return text;
}
