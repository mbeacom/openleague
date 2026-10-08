/**
 * "Download as…": the rankings file in YAML, TOML or JSONC (config-format
 * exports spec). The plain export button stays JSON, the default; each
 * format's library loads on click.
 */
import { useState } from "react";
import { Alert, Button, Menu, MenuItem, Snackbar } from "@mui/material";
import { downloadDocumentFile } from "@/components/features/practice-planner/export/download-document";
import { ENVELOPE_OVERHEAD_BYTES } from "@/lib/document-envelope";
import { DOCUMENT_FORMAT_INFO, DocumentEncodeError, type DocumentFormat } from "@/lib/document-formats";
import { MAX_RANKINGS_FILE_BYTES, rankingsFileName, serializeRankings, type RankingsDocument } from "@/lib/rankings-document";

export const DOWNLOAD_AS_LABEL = "Download as…";
export const RANKINGS_FORMATS = ["json", "yaml", "toml", "jsonc"] as const satisfies readonly DocumentFormat[];
export const RANKINGS_FORMAT_FAILED_NOTICE = "Couldn't create the file. Check your connection and try again, or use Export rankings file (JSON).";

export const rankingsFormatLabel = (format: DocumentFormat) => `${DOCUMENT_FORMAT_INFO[format].label} (${DOCUMENT_FORMAT_INFO[format].extension})`;

const byteLength = (text: string) => new TextEncoder().encode(text).byteLength;

/**
 * Why the file just written in `format` couldn't be opened again, or null. The
 * reader holds bare JSON to MAX_RANKINGS_FILE_BYTES as written; any other
 * format to that plus ENVELOPE_OVERHEAD_BYTES as written, and then to
 * MAX_RANKINGS_FILE_BYTES once decoded and measured as compact JSON.
 */
export function rankingsReopenProblem(doc: RankingsDocument, written: string, format: DocumentFormat): string | null {
    const label = DOCUMENT_FORMAT_INFO[format].label;
    const tooLarge = `This ${label} file is too large to open again (the limit is ${MAX_RANKINGS_FILE_BYTES / 1_000_000} MB).`;
    if (format === "json") return byteLength(written) > MAX_RANKINGS_FILE_BYTES ? tooLarge : null;
    const fits = byteLength(written) <= MAX_RANKINGS_FILE_BYTES + ENVELOPE_OVERHEAD_BYTES && byteLength(JSON.stringify(doc)) <= MAX_RANKINGS_FILE_BYTES;
    if (fits) return null;
    // JSON is only worth suggesting when the plain export would open again.
    return byteLength(serializeRankings(doc)) <= MAX_RANKINGS_FILE_BYTES ? `${tooLarge} Export it as JSON instead.` : tooLarge;
}

export function RankingsFormatMenu({ doc }: { doc: RankingsDocument }) {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [notice, setNotice] = useState<{ severity: "warning" | "error"; text: string } | null>(null);

    const download = (format: DocumentFormat) => {
        setAnchor(null);
        downloadDocumentFile(doc, rankingsFileName(doc), format).then(
            (text) => {
                const problem = rankingsReopenProblem(doc, text, format);
                setNotice(problem ? { severity: "warning", text: problem } : null);
            },
            (error: unknown) => {
                console.error("Rankings file export failed:", error);
                setNotice({ severity: "error", text: error instanceof DocumentEncodeError ? error.message : RANKINGS_FORMAT_FAILED_NOTICE });
            },
        );
    };

    return (
        <>
            <Button
                sx={{ minHeight: 44 }}
                aria-haspopup="menu"
                aria-controls={anchor ? "rankings-format-menu" : undefined}
                aria-expanded={anchor ? "true" : undefined}
                onClick={(event) => setAnchor(event.currentTarget)}
            >
                {DOWNLOAD_AS_LABEL}
            </Button>
            <Menu id="rankings-format-menu" anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
                {RANKINGS_FORMATS.map((format) => (
                    <MenuItem key={format} sx={{ minHeight: 44 }} onClick={() => download(format)}>
                        {rankingsFormatLabel(format)}
                    </MenuItem>
                ))}
            </Menu>
            {notice && (
                <Snackbar open autoHideDuration={6000} onClose={() => setNotice(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
                    <Alert severity={notice.severity} variant="filled" onClose={() => setNotice(null)}>
                        {notice.text}
                    </Alert>
                </Snackbar>
            )}
        </>
    );
}
