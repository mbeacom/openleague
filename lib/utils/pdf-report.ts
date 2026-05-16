/**
 * Dependency-free PDF report generation for simple tabular exports.
 *
 * This intentionally supports text-only reports. It keeps league exports usable
 * as real PDF files without introducing a heavyweight rendering dependency.
 */

interface SimplePdfReportInput {
  title: string;
  subtitle?: string[];
  lines: string[];
  generatedAt?: Date;
}

const PDF_PAGE_WIDTH = 612;
const PDF_PAGE_HEIGHT = 792;
const PDF_LEFT_MARGIN = 50;
const PDF_TOP_Y = 760;
const PDF_LINE_HEIGHT = 14;
const PDF_LINES_PER_PAGE = 49;
const PDF_MAX_LINE_LENGTH = 110;

const WIN_ANSI_SPECIAL_BYTES = new Map<string, number>([
  ["€", 0x80],
  ["‚", 0x82],
  ["ƒ", 0x83],
  ["„", 0x84],
  ["…", 0x85],
  ["†", 0x86],
  ["‡", 0x87],
  ["ˆ", 0x88],
  ["‰", 0x89],
  ["Š", 0x8a],
  ["‹", 0x8b],
  ["Œ", 0x8c],
  ["Ž", 0x8e],
  ["‘", 0x91],
  ["’", 0x92],
  ["“", 0x93],
  ["”", 0x94],
  ["•", 0x95],
  ["–", 0x96],
  ["—", 0x97],
  ["˜", 0x98],
  ["™", 0x99],
  ["š", 0x9a],
  ["›", 0x9b],
  ["œ", 0x9c],
  ["ž", 0x9e],
  ["Ÿ", 0x9f],
]);

export function generateSimplePdfReportBase64({
  title,
  subtitle = [],
  lines,
  generatedAt = new Date(),
}: SimplePdfReportInput): string {
  const reportLines = [
    title,
    ...subtitle,
    `Generated: ${generatedAt.toISOString()}`,
    "",
    ...lines,
  ].flatMap((line) => wrapLine(line, PDF_MAX_LINE_LENGTH));

  const pages = chunk(reportLines.length > 0 ? reportLines : [title], PDF_LINES_PER_PAGE);
  const objects: string[] = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");

  const pageObjectNumbers = pages.map((_, index) => 4 + index * 2);
  objects.push(
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((objectNumber) => `${objectNumber} 0 R`).join(" ")}] /Count ${pages.length} >>`
  );

  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");

  pages.forEach((pageLines, index) => {
    const pageObjectNumber = 4 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    const content = buildPageContent(pageLines);

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`
    );
    objects.push(`<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`);
  });

  return buildPdf(objects);
}

function buildPageContent(lines: string[]): string {
  const commands = [
    "BT",
    "/F1 10 Tf",
    `${PDF_LEFT_MARGIN} ${PDF_TOP_Y} Td`,
    `${PDF_LINE_HEIGHT} TL`,
  ];

  lines.forEach((line) => {
    commands.push(`(${escapePdfText(line)}) Tj`);
    commands.push("T*");
  });

  commands.push("ET");
  return commands.join("\n");
}

function buildPdf(objects: string[]): string {
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((body, index) => {
    const objectNumber = index + 1;
    offsets[objectNumber] = Buffer.byteLength(pdf, "utf8");
    pdf += `${objectNumber} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (let objectNumber = 1; objectNumber <= objects.length; objectNumber += 1) {
    pdf += `${String(offsets[objectNumber]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8").toString("base64");
}

function escapePdfText(value: string): string {
  return Array.from(value.normalize("NFC"), (char) => {
    const byte = getWinAnsiByte(char);

    if (byte !== null) {
      return escapePdfByte(byte);
    }

    const asciiFallback = getAsciiFallback(char);
    if (asciiFallback.length > 0) {
      return Array.from(asciiFallback, (fallbackChar) => escapePdfByte(fallbackChar.charCodeAt(0))).join("");
    }

    const codePoint = char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0") ?? "FFFD";
    return `[U+${codePoint}]`;
  }).join("");
}

function getWinAnsiByte(char: string): number | null {
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) return null;

  if (codePoint === 0x09 || (codePoint >= 0x20 && codePoint <= 0x7e)) {
    return codePoint;
  }

  if (codePoint >= 0xa0 && codePoint <= 0xff) {
    return codePoint;
  }

  return WIN_ANSI_SPECIAL_BYTES.get(char) ?? null;
}

function getAsciiFallback(char: string): string {
  return char
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .replace(/[^\x20-\x7E]/g, "");
}

function escapePdfByte(byte: number): string {
  if (byte === 0x5c || byte === 0x28 || byte === 0x29) {
    return `\\${String.fromCharCode(byte)}`;
  }

  if (byte >= 0x20 && byte <= 0x7e) {
    return String.fromCharCode(byte);
  }

  return `\\${byte.toString(8).padStart(3, "0")}`;
}

function wrapLine(line: string, maxLength: number): string[] {
  if (line.length <= maxLength) return [line];

  const wrapped: string[] = [];
  let remaining = line;

  while (remaining.length > maxLength) {
    const wrapAt = findWrapBoundary(remaining, maxLength);
    wrapped.push(remaining.slice(0, wrapAt).trimEnd());
    remaining = remaining.slice(wrapAt).trimStart();
  }

  if (remaining.length > 0) {
    wrapped.push(remaining);
  }

  return wrapped;
}

function findWrapBoundary(line: string, maxLength: number): number {
  const candidate = line.slice(0, maxLength + 1);
  const whitespaceMatches = Array.from(candidate.matchAll(/\s+/g))
    .filter((match) => (match.index ?? 0) > 0 && (match.index ?? 0) < maxLength);
  const lastWhitespace = whitespaceMatches.at(-1);

  return lastWhitespace?.index ?? maxLength;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}