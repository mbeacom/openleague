/**
 * The bench sheet as a Word document (sub-project 4, ADR-0020). The only
 * module that imports `docx`, and export-bench-sheet.ts reaches it only through
 * import() on click, so neither the hosted nor the static main bundle carries
 * the library (ESLint and scripts/check-planner-build.ts enforce both halves).
 * `docx` escapes markup itself but writes characters XML 1.0 forbids verbatim, so
 * every user string goes through xmlSafe(); images come only from PNG data URIs.
 */
// eslint-disable-next-line no-restricted-imports -- the one module allowed to load docx; reached only through import()
import { Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { ROTATION_ALL, type RotationTable } from "@/lib/utils/session-timeline";
import type { BenchSheetModel } from "./bench-sheet-model";
import { DIAGRAM_UNAVAILABLE_TEXT, LEGEND_HEADING, NO_DRILLS_TEXT } from "./labels";
import { isPngDataUri, pngDataUriToBytes } from "./png";

export const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** US Letter portrait in twips, with 12 mm margins (680 twips). */
const PAGE = { size: { width: 12240, height: 15840 }, margin: { top: 680, right: 680, bottom: 680, left: 680 } };
/** The print diagram's 720×306 aspect, at a width that fits the text column. */
const DIAGRAM = { width: 680, height: 289 };
const SWATCH = { width: 30, height: 15 };
const LEAGUE_BLUE = "0D47A1";
const PENALTY_RED = "C62828";
const TABLE_HEADER_FILL = "E3F2FD";
const MONO = "Consolas";

interface RunStyle {
    bold?: boolean;
    italics?: boolean;
    font?: string;
    color?: string;
}

/** Strips the characters XML 1.0 forbids (C0 controls but tab/LF/CR, U+FFFE, U+FFFF); Word refuses a file containing them. */
function xmlSafe(text: string): string {
    return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "");
}

/** One run per line, joined by line breaks (\r\n or \n). */
function textRuns(text: string, style: RunStyle = {}): TextRun[] {
    return xmlSafe(text).split(/\r?\n/).map((line, index) => new TextRun({ ...style, text: line, break: index > 0 ? 1 : undefined }));
}

function picture(dataUri: string, size: { width: number; height: number }, rawAlt: string): ImageRun {
    const alt = xmlSafe(rawAlt);
    return new ImageRun({ type: "png", data: pngDataUriToBytes(dataUri), transformation: size, altText: { name: alt || "Symbol", title: alt, description: alt } });
}

function header(model: BenchSheetModel): Paragraph[] {
    return [
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: textRuns(model.title, { bold: true, color: LEAGUE_BLUE }) }),
        ...(model.teamName ? [new Paragraph({ children: textRuns(model.teamName, { bold: true }) })] : []),
        new Paragraph({ children: textRuns(model.when) }),
        ...(model.place ? [new Paragraph({ children: textRuns(model.place) })] : []),
        ...(model.gap ? [new Paragraph({ children: textRuns(model.gap) })] : []),
    ];
}

function cell(children: Array<Paragraph | Table>, isHeader = false): TableCell {
    return new TableCell({ children, shading: isHeader ? { fill: TABLE_HEADER_FILL } : undefined });
}

/** A station block's header and its stations: a plain block's and a rotation block's alike. */
function stationParagraphs(label: string, stations: readonly string[]): Paragraph[] {
    return [
        new Paragraph({ children: textRuns(label, { bold: true }) }),
        ...stations.map((station) => new Paragraph({ children: textRuns(`• ${station}`) })),
    ];
}

/** The timeline's Drill column is 8180 twips; the grid nested in it leaves room for the cell's margins. */
const GRID_WIDTH = 7900;
const GRID_START_WIDTH = 1300;

/** A rotation block's grid as a real table (spec R10): Start plus one column per station. */
function gridTable(grid: RotationTable): Table {
    const head = new TableRow({
        tableHeader: true,
        children: ["Start", ...grid.columns].map((label) => cell([new Paragraph({ children: textRuns(label, { bold: true, color: LEAGUE_BLUE }) })], true)),
    });
    const rows = grid.rows.map(
        (row) =>
            new TableRow({
                cantSplit: true,
                children: [
                    cell([new Paragraph({ children: textRuns(row.start, { font: MONO }) })]),
                    ...row.cells.map((value) => cell([new Paragraph({ children: textRuns(value, value === ROTATION_ALL ? {} : { bold: true }) })])),
                ],
            }),
    );
    // Explicit columns (twips): a narrow Start, the stations sharing the rest of the Drill cell.
    const stationWidth = Math.floor((GRID_WIDTH - GRID_START_WIDTH) / Math.max(1, grid.columns.length));
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [GRID_START_WIDTH, ...grid.columns.map(() => stationWidth)],
        rows: [head, ...rows],
    });
}

function timeline(model: BenchSheetModel): Array<Paragraph | Table> {
    const head = new TableRow({
        tableHeader: true,
        children: ["Start", "Min", "Drill"].map((label) => cell([new Paragraph({ children: textRuns(label, { bold: true, color: LEAGUE_BLUE }) })], true)),
    });
    const rows = model.timeline.map(
        (row) =>
            new TableRow({
                cantSplit: true,
                children: [
                    cell([new Paragraph({ children: textRuns(row.start, { font: MONO }) })]),
                    cell([new Paragraph({ children: textRuns(String(row.minutes)) })]),
                    cell(
                        row.stations
                            ? [
                                  ...stationParagraphs(row.label, row.stations),
                                  // Word wants a paragraph after a table in a cell.
                                  ...(row.kind === "rotation" ? [gridTable(row.grid), new Paragraph({ children: [] })] : []),
                              ]
                            : [new Paragraph({ children: textRuns(row.kind === "block" && row.note ? `${row.label} · ${row.note}` : row.label) })],
                    ),
                ],
            }),
    );
    return [
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: [1800, 900, 8180], rows: [head, ...rows] }),
        new Paragraph({ spacing: { before: 120 }, children: textRuns(model.planned, model.overTime ? { bold: true, color: PENALTY_RED } : {}) }),
    ];
}

function legend(model: BenchSheetModel): Paragraph[] {
    if (model.legend.length === 0) return [];
    return [
        new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240 }, children: textRuns(LEGEND_HEADING, { bold: true, color: LEAGUE_BLUE }) }),
        ...model.legend.map(
            (entry) =>
                new Paragraph({
                    children: [
                        ...(isPngDataUri(entry.image) ? [picture(entry.image, SWATCH, entry.label), new TextRun({ text: "  " })] : []),
                        ...textRuns(entry.label),
                    ],
                }),
        ),
    ];
}

/** Two drills per page: drills 1, 3, 5… start a page (so drills begin on page 2). */
function drills(model: BenchSheetModel): Paragraph[] {
    return model.drills.flatMap((drill, index) => {
        const startsPage = index % 2 === 0;
        const hasText = Boolean(drill.text); // "" is no text: gates keepNext and the text paragraph alike
        return [
            new Paragraph({
                heading: HeadingLevel.HEADING_2,
                pageBreakBefore: startsPage,
                keepNext: true,
                spacing: { before: startsPage ? 0 : 360 },
                children: textRuns(`${drill.number}. ${drill.name}`, { bold: true, color: LEAGUE_BLUE }),
            }),
            new Paragraph({
                keepNext: true,
                children: [
                    ...textRuns(`${drill.start} · ${drill.minutes} min`, { font: MONO }),
                    ...(drill.station ? [new TextRun({ text: "  " }), ...textRuns(drill.station, { bold: true })] : []),
                ],
            }),
            isPngDataUri(drill.diagram)
                ? new Paragraph({ keepNext: hasText, children: [picture(drill.diagram, DIAGRAM, `Diagram: ${drill.name}`)] })
                : new Paragraph({ keepNext: hasText, children: textRuns(DIAGRAM_UNAVAILABLE_TEXT, { italics: true }) }),
            ...(drill.text ? [new Paragraph({ children: textRuns(drill.text) })] : []),
        ];
    });
}

function benchSheetDocument(model: BenchSheetModel): Document {
    const body =
        model.timeline.length === 0
            ? [...header(model), new Paragraph({ children: textRuns(NO_DRILLS_TEXT, { bold: true }) })]
            : [...header(model), ...timeline(model), ...legend(model), ...drills(model)];
    return new Document({
        title: xmlSafe(model.title),
        creator: "OpenLeague",
        sections: [{ properties: { page: PAGE }, children: body }],
    });
}

/** The .docx bytes (a zip). */
export async function renderBenchSheetDocxBytes(model: BenchSheetModel): Promise<Uint8Array<ArrayBuffer>> {
    return new Uint8Array(await Packer.toArrayBuffer(benchSheetDocument(model)));
}

export async function renderBenchSheetDocx(model: BenchSheetModel): Promise<Blob> {
    return new Blob([await renderBenchSheetDocxBytes(model)], { type: DOCX_MIME_TYPE });
}
