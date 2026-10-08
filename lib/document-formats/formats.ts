/**
 * The file encodings a portable document can be saved in (config-format
 * exports spec). One data model, several encodings: JSON stays the default
 * and the canonical form; YAML, TOML and JSONC carry the same bare document.
 * Pure and portable (ADR-0020).
 */

export const DOCUMENT_FORMATS = ["json", "yaml", "toml", "jsonc"] as const;
export type DocumentFormat = (typeof DOCUMENT_FORMATS)[number];

export const DEFAULT_DOCUMENT_FORMAT: DocumentFormat = "json";

export interface DocumentFormatInfo {
    format: DocumentFormat;
    /** Shown in menus and messages. */
    label: string;
    /** The extension a saved file ends with (after the kind's own part, e.g. `.olplan`). */
    extension: string;
    /** Every extension read as this format on open. */
    extensions: readonly string[];
    mimeType: string;
}

/**
 * JSONC has no registered media type, and a file with comments isn't valid
 * `application/json`, so it is saved as plain text: storage providers preview
 * it, and the reader trusts the extension and content, never the type.
 */
export const DOCUMENT_FORMAT_INFO: { readonly [F in DocumentFormat]: DocumentFormatInfo } = {
    json: { format: "json", label: "JSON", extension: ".json", extensions: [".json"], mimeType: "application/json" },
    yaml: { format: "yaml", label: "YAML", extension: ".yaml", extensions: [".yaml", ".yml"], mimeType: "application/yaml" },
    toml: { format: "toml", label: "TOML", extension: ".toml", extensions: [".toml"], mimeType: "application/toml" },
    jsonc: { format: "jsonc", label: "JSONC", extension: ".jsonc", extensions: [".jsonc"], mimeType: "text/plain;charset=utf-8" },
};

/** The `accept` for a file input that opens portable documents in any format. */
export const DOCUMENT_FILE_ACCEPT = [
    ".json",
    ".jsonc",
    ".yaml",
    ".yml",
    ".toml",
    "application/json",
    "application/yaml",
    "application/toml",
].join(",");

/** The format a file name's extension names, or null when it names none of them. */
export function formatFromFileName(fileName: string | null | undefined): DocumentFormat | null {
    const name = (fileName ?? "").trim().toLowerCase();
    for (const format of DOCUMENT_FORMATS) {
        if (DOCUMENT_FORMAT_INFO[format].extensions.some((extension) => name.endsWith(extension))) return format;
    }
    return null;
}

/**
 * A kind's JSON file name in another format: `drills.olplan.json` →
 * `drills.olplan.yaml`. Names that don't end in `.json` get the extension added.
 */
export function fileNameForFormat(jsonFileName: string, format: DocumentFormat): string {
    const base = jsonFileName.toLowerCase().endsWith(".json") ? jsonFileName.slice(0, -".json".length) : jsonFileName;
    return `${base}${DOCUMENT_FORMAT_INFO[format].extension}`;
}

const TOML_FIRST_LINE = /^(?:\[|[A-Za-z0-9_-]+\s*=|"[^"\n]*"\s*=|'[^'\n]*'\s*=)/;

/**
 * Content sniffing, for a name with no known extension (a cloud file, a
 * renamed download): `{` is JSON (or JSONC when it doesn't parse as JSON),
 * a leading comment is JSONC, a `[table]` or `key = value` first line is TOML,
 * and anything else is YAML, last, because YAML accepts almost any text.
 */
export function sniffFormat(text: string): DocumentFormat {
    const trimmed = text.replace(/^﻿/, "").trimStart();
    if (trimmed.startsWith("{")) {
        try {
            JSON.parse(trimmed);
            return "json";
        } catch {
            return "jsonc";
        }
    }
    if (trimmed.startsWith("//") || trimmed.startsWith("/*")) return "jsonc";
    const firstLine = trimmed
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line !== "" && !line.startsWith("#"));
    if (firstLine !== undefined && TOML_FIRST_LINE.test(firstLine)) return "toml";
    return "yaml";
}

/** By extension, then by content. */
export function detectFormat(fileName: string | null | undefined, text: string): DocumentFormat {
    return formatFromFileName(fileName) ?? sniffFormat(text);
}
