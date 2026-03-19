/**
 * CSV export utilities with proper RFC 4180 escaping.
 */

/**
 * Escape a single CSV field value.
 * Wraps in double quotes if the value contains commas, quotes, or newlines.
 */
export function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // Escape embedded double quotes by doubling them
  const escaped = str.replace(/"/g, '""');
  // Wrap in quotes if field contains comma, quote, newline, or carriage return
  if (escaped.includes(",") || escaped.includes('"') || escaped.includes("\n") || escaped.includes("\r")) {
    return `"${escaped}"`;
  }
  return escaped;
}

/**
 * Convert an array of values to a single CSV row string.
 */
export function toCsvRow(fields: (string | number | null | undefined)[]): string {
  return fields.map(escapeCsvField).join(",");
}

/**
 * Convert headers and rows into a complete CSV string with UTF-8 BOM.
 * The BOM ensures Excel opens the file correctly with UTF-8 encoding.
 */
export function toCsvContent(
  headers: string[],
  rows: (string | number | null | undefined)[][]
): string {
  const lines = [toCsvRow(headers), ...rows.map(toCsvRow)];
  // UTF-8 BOM + CRLF line endings per RFC 4180
  return "\uFEFF" + lines.join("\r\n");
}
