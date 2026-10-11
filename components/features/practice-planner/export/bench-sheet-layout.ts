/**
 * Bench sheet pagination, shared by the printed sheet, the HTML file and the
 * Word file so all three agree: how many drills follow the legend on page 1,
 * and the pages after it, two drills to a page. Pure, and it imports only
 * types, so the lazily loaded Word chunk stays free of React and MUI.
 */
import type { BenchSheetDrillItem, BenchSheetModel, BenchSheetTimelineRow } from "./bench-sheet-model";

/** Drills to a page after the first. */
export const DRILLS_PER_PAGE = 2;

/*
 * Page 1's height, estimated in body lines (about 5.3 mm: 14 px text). A US
 * Letter page inside 12 mm margins holds about 48 (A4 holds more, so Letter
 * is the bound). The estimate leans long: a drill pulled onto page 1 that
 * doesn't fit there pushes itself, and so its whole page, along by one.
 */
const PAGE_LINES = 48;
/** Slack for wrapping the estimate can't see. */
const SAFETY_LINES = 3;
const TITLE_LINES = 3;
const HEADER_GAP_LINES = 2;
/** A section heading plus its top margin (equipment, legend, the drills' top margin). */
const SECTION_LINES = 2;
/** Equipment and legend items run in three columns (the HTML file's CSS columns, the Word file's table). */
export const LIST_COLUMNS = 3;
/** A drill's heading and time line, and the space after it. */
const DRILL_FRAME_LINES = 4.5;
/** The diagram: 720×306 across the text column, at most 85 mm high. */
const DIAGRAM_LINES = 16;
/** Characters per line of a drill's text, and of a timeline cell (the Drill column is narrower). */
const TEXT_CHARS = 90;
const CELL_CHARS = 70;

function wrapped(text: string | null | undefined, chars: number): number {
    if (!text) return 0;
    return text.split(/\r?\n/).reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / chars)), 0);
}

function timelineRowLines(row: BenchSheetTimelineRow): number {
    if (row.kind === "rotation") return 1 + row.stations.length + 1 + row.grid.rows.length;
    if (row.stations) return 1 + row.stations.length;
    const note = row.kind === "block" ? row.note : null;
    return wrapped([row.label, note, row.runBy].filter(Boolean).join(" · "), CELL_CHARS);
}

export type BenchSheetLayoutInput = Pick<
    BenchSheetModel,
    "teamName" | "place" | "staff" | "roster" | "rosterPlayers" | "gap" | "timeline" | "equipment" | "legend" | "drills"
>;

/** What page 1 holds before any drill: the header, the timeline with its planned line, the equipment and the legend. */
export function firstPageLines(sheet: BenchSheetLayoutInput): number {
    const headerLines =
        TITLE_LINES +
        [sheet.teamName, sheet.place, sheet.staff, sheet.roster, sheet.gap].filter(Boolean).length +
        1 + // the date and time
        sheet.rosterPlayers.length +
        HEADER_GAP_LINES;
    const timelineLines = sheet.timeline.length === 0 ? 0 : 1 + sheet.timeline.reduce((sum, row) => sum + timelineRowLines(row), 0) + 1.5;
    const listLines = (items: readonly unknown[]) => (items.length === 0 ? 0 : SECTION_LINES + Math.ceil(items.length / LIST_COLUMNS));
    return headerLines + timelineLines + listLines(sheet.equipment) + listLines(sheet.legend);
}

/** One drill's height: its frame, its equipment line, its diagram (or the unavailable box) and its text. */
export function drillLines(drill: Pick<BenchSheetDrillItem, "equipment" | "text">): number {
    return DRILL_FRAME_LINES + (drill.equipment ? 1 : 0) + DIAGRAM_LINES + wrapped(drill.text, TEXT_CHARS);
}

/**
 * How many drills start on page 1 (0 to DRILLS_PER_PAGE): as many of the
 * first drills as fit under a short page 1. 0 keeps drills starting on page 2.
 * The printed sheet, the HTML file and the Word file all read this, so they
 * paginate alike.
 */
export function firstPageDrillCount(sheet: BenchSheetLayoutInput): number {
    let room = PAGE_LINES - SAFETY_LINES - firstPageLines(sheet) - SECTION_LINES;
    let count = 0;
    for (const drill of sheet.drills.slice(0, DRILLS_PER_PAGE)) {
        room -= drillLines(drill);
        if (room < 0) break;
        count++;
    }
    return count;
}

export interface BenchSheetPage<T> {
    items: T[];
    /** The page's first drill's index in `drills` */
    first: number;
    /** True for the drills that follow the legend on page 1 */
    onFirstPage: boolean;
}

/** The drills by page: the first `firstPageDrills` on page 1, then DRILLS_PER_PAGE to a fresh page. */
export function benchSheetPages<T>(drills: readonly T[], firstPageDrills: number): BenchSheetPage<T>[] {
    const lead = Math.max(0, Math.min(firstPageDrills, drills.length));
    const pages: BenchSheetPage<T>[] = lead > 0 ? [{ items: drills.slice(0, lead), first: 0, onFirstPage: true }] : [];
    for (let i = lead; i < drills.length; i += DRILLS_PER_PAGE) {
        pages.push({ items: drills.slice(i, i + DRILLS_PER_PAGE), first: i, onFirstPage: false });
    }
    return pages;
}
