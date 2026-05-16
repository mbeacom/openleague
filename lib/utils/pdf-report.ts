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

  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

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
  return value
    .normalize("NFKD")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?")
    .replace(/([\\()])/g, "\\$1");
}

function wrapLine(line: string, maxLength: number): string[] {
  if (line.length <= maxLength) return [line];

  const wrapped: string[] = [];
  let remaining = line;

  while (remaining.length > maxLength) {
    wrapped.push(remaining.slice(0, maxLength));
    remaining = remaining.slice(maxLength);
  }

  if (remaining.length > 0) {
    wrapped.push(remaining);
  }

  return wrapped;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}