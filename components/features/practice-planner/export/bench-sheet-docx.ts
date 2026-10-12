/**
 * The bench sheet as a Word document (sub-project 4, ADR-0020). The only
 * module that imports `docx`, and export-bench-sheet.ts reaches it only through
 * import() on click, so neither the hosted nor the static main bundle carries
 * the library (ESLint and scripts/check-planner-build.ts enforce both halves).
 * `docx` escapes markup itself but writes characters XML 1.0 forbids verbatim, so
 * every user string goes through xmlSafe(); images come only from PNG data URIs.
 */
// eslint-disable-next-line no-restricted-imports -- the one module allowed to load docx; reached only through import()
import { BorderStyle, Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableBorders, TableCell, TableRow, TextRun, WidthType } from "docx";
import { ROTATION_ALL, type RotationTable } from "@/lib/utils/session-timeline";
import type { TeamPalette } from "@/lib/utils/team-palette";
import type { BenchSheetModel } from "./bench-sheet-model";
import { LIST_COLUMNS, benchSheetPages } from "./bench-sheet-layout";
import { DIAGRAM_UNAVAILABLE_TEXT, EQUIPMENT_HEADING, LEGEND_HEADING, NO_DRILLS_TEXT } from "./labels";
import { isPngDataUri, pngDataUriToBytes } from "./png";

export const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** US Letter portrait in twips, with 12 mm margins (680 twips). */
const PAGE = { size: { width: 12240, height: 15840 }, margin: { top: 680, right: 680, bottom: 680, left: 680 } };
/** The print diagram's 720×306 aspect, at a width that fits the text column. */
const DIAGRAM = { width: 680, height: 289 };
const SWATCH = { width: 30, height: 15 };
const PENALTY_RED = "C62828";
const MONO = "Consolas";
/** The header's bottom rule: 2¼ pt (eighths of a point), as the HTML file's 3 px. */
const HEADER_RULE_SIZE = 18;

/** Word's colors: RRGGBB without the "#". */
interface DocxColors {
    /** Headings and table-header text */
    ink: string;
    /** Table-header fill */
    tint: string;
    /** The header's bottom rule */
    accent: string;
}

const HEX6 = /^#[0-9A-F]{6}$/i;
/**
 * DEFAULT_TEAM_PALETTE's colors, in Word's form. Repeated here rather than
 * imported: team-palette.ts loads MUI, and this lazy chunk must not.
 */
const DEFAULT_COLORS: DocxColors = { ink: "0D47A1", tint: "E3F2FD", accent: "1976D2" };

/** The palette in Word's form; a color that is not #RRGGBB takes the default's. */
function docxColors(palette: TeamPalette): DocxColors {
    const word = (key: keyof DocxColors) => (HEX6.test(palette[key]) ? palette[key].slice(1).toUpperCase() : DEFAULT_COLORS[key]);
    return { ink: word("ink"), tint: word("tint"), accent: word("accent") };
}

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

function header(model: BenchSheetModel, colors: DocxColors): Paragraph[] {
    const lines = [
        // The mark opens the header block (practice logo spec R5), in its own paragraph so the
        // heading, and the Navigation pane or a table of contents built from it, stays text.
        ...(model.mark && isPngDataUri(model.mark.image)
            ? [new Paragraph({ keepNext: true, children: [picture(model.mark.image, { width: model.mark.width, height: model.mark.height }, model.mark.alt)] })]
            : []),
        new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: textRuns(model.title, { bold: true, color: colors.ink }),
        }),
    ];
    const details: Array<{ text: string; style?: RunStyle }> = [
        ...(model.teamName ? [{ text: model.teamName, style: { bold: true } }] : []),
        ...[model.when, model.place, model.staff, model.roster, ...model.rosterPlayers, model.gap].filter((line): line is string => Boolean(line)).map((text) => ({ text })),
    ];
    // The last line carries the header's rule, in the accent (the HTML file's header border).
    return [
        ...lines,
        ...details.map(
            ({ text, style }, index) =>
                new Paragraph({
                    children: textRuns(text, style),
                    ...(index === details.length - 1
                        ? { border: { bottom: { color: colors.accent, space: 4, style: BorderStyle.SINGLE, size: HEADER_RULE_SIZE } }, spacing: { after: 160 } }
                        : {}),
                }),
        ),
    ];
}

function cell(children: Array<Paragraph | Table>, headerFill?: string): TableCell {
    return new TableCell({ children, shading: headerFill ? { fill: headerFill } : undefined });
}

function headerCell(label: string, colors: DocxColors): TableCell {
    return cell([new Paragraph({ children: textRuns(label, { bold: true, color: colors.ink }) })], colors.tint);
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
function gridTable(grid: RotationTable, colors: DocxColors): Table {
    const head = new TableRow({
        tableHeader: true,
        children: ["Start", ...grid.columns].map((label) => headerCell(label, colors)),
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

function timeline(model: BenchSheetModel, colors: DocxColors): Array<Paragraph | Table> {
    const head = new TableRow({
        tableHeader: true,
        children: ["Start", "Min", "Drill"].map((label) => headerCell(label, colors)),
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
                                  ...(row.kind === "rotation" ? [gridTable(row.grid, colors), new Paragraph({ children: [] })] : []),
                              ]
                            : [new Paragraph({ children: textRuns([row.label, row.kind === "block" ? row.note : null, row.runBy].filter(Boolean).join(" · ")) })],
                    ),
                ],
            }),
    );
    return [
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: [1800, 900, 8180], rows: [head, ...rows] }),
        new Paragraph({ spacing: { before: 120 }, children: textRuns(model.planned, model.overTime ? { bold: true, color: PENALTY_RED } : {}) }),
    ];
}

/** The text column: the page less its margins (twips). */
const TEXT_WIDTH = PAGE.size.width - PAGE.margin.left - PAGE.margin.right;

/**
 * Items in LIST_COLUMNS borderless columns, filled down each column first as
 * the HTML file's CSS columns are, so the Word file is as tall as the page-1
 * estimate in bench-sheet-layout.ts assumes.
 */
function columns(items: readonly Paragraph[]): Table {
    const rowCount = Math.ceil(items.length / LIST_COLUMNS);
    const width = Math.floor(TEXT_WIDTH / LIST_COLUMNS);
    const rows = Array.from({ length: rowCount }, (_, row) =>
        new TableRow({
            cantSplit: true,
            children: Array.from({ length: LIST_COLUMNS }, (_, column) => {
                const item = items[column * rowCount + row];
                return new TableCell({ width: { size: width, type: WidthType.DXA }, children: [item ?? new Paragraph({ children: [] })] });
            }),
        }),
    );
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: Array.from({ length: LIST_COLUMNS }, () => width), borders: TableBorders.NONE, rows });
}

/** The practice's equipment (practice equipment spec R5): after the timeline, before the legend. */
function equipment(model: BenchSheetModel, colors: DocxColors): Array<Paragraph | Table> {
    if (model.equipment.length === 0) return [];
    return [
        new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240 }, children: textRuns(EQUIPMENT_HEADING, { bold: true, color: colors.ink }) }),
        columns(model.equipment.map((item) => new Paragraph({ children: textRuns(`• ${item}`) }))),
    ];
}

function legend(model: BenchSheetModel, colors: DocxColors): Array<Paragraph | Table> {
    if (model.legend.length === 0) return [];
    return [
        new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240 }, children: textRuns(LEGEND_HEADING, { bold: true, color: colors.ink }) }),
        columns(
            model.legend.map(
                (entry) =>
                    new Paragraph({
                        children: [
                            ...(isPngDataUri(entry.image) ? [picture(entry.image, SWATCH, entry.label), new TextRun({ text: "  " })] : []),
                            ...textRuns(entry.label),
                        ],
                    }),
            ),
        ),
    ];
}

/**
 * Drills that fit follow the legend on page 1 (model.firstPageDrills); then two
 * to a page, the first of each pair starting a fresh page.
 */
function drills(model: BenchSheetModel, colors: DocxColors): Paragraph[] {
    const startsPage = new Set(benchSheetPages(model.drills, model.firstPageDrills).filter((page) => !page.onFirstPage).map((page) => page.first));
    return model.drills.flatMap((drill, index) => {
        const breaks = startsPage.has(index);
        const hasText = Boolean(drill.text); // "" is no text: gates keepNext and the text paragraph alike
        return [
            new Paragraph({
                heading: HeadingLevel.HEADING_2,
                pageBreakBefore: breaks,
                keepNext: true,
                spacing: { before: breaks ? 0 : 360 },
                children: textRuns(`${drill.number}. ${drill.name}`, { bold: true, color: colors.ink }),
            }),
            new Paragraph({
                keepNext: true,
                children: [
                    ...textRuns(`${drill.start} · ${drill.minutes} min`, { font: MONO }),
                    ...(drill.station ? [new TextRun({ text: "  " }), ...textRuns(drill.station, { bold: true })] : []),
                ],
            }),
            ...(drill.equipment ? [new Paragraph({ keepNext: true, children: textRuns(drill.equipment) })] : []),
            isPngDataUri(drill.diagram)
                ? new Paragraph({ keepNext: hasText, children: [picture(drill.diagram, DIAGRAM, `Diagram: ${drill.name}`)] })
                : new Paragraph({ keepNext: hasText, children: textRuns(DIAGRAM_UNAVAILABLE_TEXT, { italics: true }) }),
            ...(drill.text ? [new Paragraph({ children: textRuns(drill.text) })] : []),
        ];
    });
}

function benchSheetDocument(model: BenchSheetModel): Document {
    const colors = docxColors(model.palette);
    const body =
        model.timeline.length === 0
            ? [...header(model, colors), new Paragraph({ children: textRuns(NO_DRILLS_TEXT, { bold: true }) }), ...equipment(model, colors)]
            : [...header(model, colors), ...timeline(model, colors), ...equipment(model, colors), ...legend(model, colors), ...drills(model, colors)];
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
