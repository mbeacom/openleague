/**
 * Reads a snake chart (spec, Import): a "Program" header row (colour per column)
 * and a "Strength" header row (str/mid/weak), then one row per program whose cells
 * hold team numbers. Continuation rows (a program with more teams than one row)
 * have no program cell. Accepts the table's HTML or a tab-separated paste of it.
 * A page can hold several tables, one per age division: each "Program" row starts
 * a division, and the result is scoped to one of them (see `SnakeChartOptions`).
 */
import { decodeEntities, looksLikeHtml } from "./html";

export interface ParsedSnakeTeam {
    number: string;
    name: string | null;
    startingBracket: string;
}

export interface SnakeDivision {
    /** The table's heading cell (an age division, e.g. "8U"), or "Chart N" without one. */
    name: string;
    teams: ParsedSnakeTeam[];
    /** Starting brackets holding at least one of this division's teams, in column order. */
    brackets: string[];
}

export interface ParsedSnakeChart {
    /** The chosen division's teams. */
    teams: ParsedSnakeTeam[];
    /**
     * The chosen division's starting brackets that hold at least one team, in the chart's
     * left-to-right column order. This, not the team numbers, is the bracket order:
     * numbers needn't follow it (spec, Context).
     */
    brackets: string[];
    unparsed: string[];
    /** Every table on the page, in page order. */
    divisions?: SnakeDivision[];
    /** The index into `divisions` that `teams` and `brackets` come from. */
    division?: number;
}

export interface SnakeChartOptions {
    /** Use this division (an index into `divisions`) instead of choosing one. */
    division?: number;
    /** The schedule's team numbers: chooses the division holding most of them. */
    scheduleTeams?: Iterable<string>;
}

interface Row {
    /** The row's leading label cell, or null for a continuation row. */
    label: string | null;
    /** Positional data cells after the label. */
    cells: Array<{ text: string; title: string | null }>;
    /** The row's leading empty cells were dropped (a copied continuation row): align it to the last column. */
    alignRight?: boolean;
}

const STRENGTH: Record<string, string> = { str: "Strong", strong: "Strong", mid: "Mid", middle: "Mid", weak: "Weak" };
const NUMBER = /^\d{3}$/;

/**
 * "RED" or "LIGHT BLUE" (a copy carries the page's CSS uppercasing) reads as the HTML's "Red"
 * or "Light Blue", word by word; short or repeated-letter words such as "AA", "A1" and "B" stay.
 */
function programName(text: string): string {
    return text
        .split(" ")
        .map((word) => (/^[A-Z]{3,}$/.test(word) && !/^(.)\1+$/.test(word) ? word[0] + word.slice(1).toLowerCase() : word))
        .join(" ");
}

const stripTags = (html: string) => decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

function htmlRows(html: string): Row[] {
    const rows: Row[] = [];
    for (const tr of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const cells = [...tr[1].matchAll(/<(t[hd])\b([^>]*)>([\s\S]*?)<\/\1>/gi)].map((m) => ({
            kind: m[1].toLowerCase(),
            text: stripTags(m[3]),
            title: (() => {
                const t = /\btitle\s*=\s*"([^"]*)"/i.exec(m[2]);
                return t ? decodeEntities(t[1]).trim() || null : null;
            })(),
        }));
        if (cells.length === 0) continue;
        if (cells[0].kind === "th") rows.push({ label: cells[0].text, cells: cells.slice(1).map(({ text, title }) => ({ text, title })) });
        else rows.push({ label: null, cells: cells.map(({ text, title }) => ({ text, title })) });
    }
    return rows;
}

/**
 * A copied table puts each row on a line, cells tab-separated. A browser's copy drops the
 * empty cells that lead a continuation row ("131\t" for a team in the fifth of six columns),
 * so a line that starts with a team number is a continuation row aligned to the last column.
 */
function textRows(text: string): Row[] {
    return text
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map((line) => {
            const cells = line.split("\t").map((cell) => cell.replace(/\s+/g, " ").trim());
            if (NUMBER.test(cells[0])) return { label: null, cells: cells.map((cell) => ({ text: cell, title: null })), alignRight: true };
            return { label: cells[0], cells: cells.slice(1).map((cell) => ({ text: cell, title: null })) };
        });
}

interface Division extends SnakeDivision {
    columns: string[];
}

export function parseSnakeChart(input: string, options: SnakeChartOptions = {}): ParsedSnakeChart {
    const rows = looksLikeHtml(input) ? htmlRows(input) : textRows(input);
    const divisions: Division[] = [];
    const unparsed: string[] = [];
    let colours: string[] = [];
    let labels: string[] = [];
    let heading: string | null = null;
    for (const row of rows) {
        const label = row.label?.toLowerCase() ?? null;
        if (label === "program") {
            colours = row.cells.map((cell) => programName(cell.text));
            labels = [];
            divisions.push({ name: heading || `Chart ${divisions.length + 1}`, teams: [], brackets: [], columns: [] });
            heading = null;
            continue;
        }
        const current = divisions.at(-1);
        if (label === "strength") {
            labels = row.cells.map((cell, k) => `${colours[k] ?? ""} ${STRENGTH[cell.text.toLowerCase()] ?? cell.text}`.trim());
            for (const bracket of labels) if (current && bracket && !current.columns.includes(bracket)) current.columns.push(bracket);
            continue;
        }
        if (!row.cells.some((cell) => NUMBER.test(cell.text))) {
            // A table's first header row ("8U … 1 2 3 Teams") names the division below it.
            if (row.label) heading = row.label;
            continue;
        }
        const offset = row.alignRight ? Math.max(0, labels.length - row.cells.length) : 0;
        row.cells.forEach((cell, k) => {
            if (!NUMBER.test(cell.text)) return;
            const bracket = labels[k + offset];
            if (!bracket || !current) {
                unparsed.push(cell.text);
                return;
            }
            current.teams.push({ number: cell.text, name: cell.title, startingBracket: bracket });
        });
    }
    for (const division of divisions) {
        const used = new Set(division.teams.map((team) => team.startingBracket));
        division.brackets = division.columns.filter((bracket) => used.has(bracket));
    }
    const chosen = chooseDivision(divisions, options);
    const picked = divisions[chosen];
    return {
        teams: picked?.teams ?? [],
        brackets: picked?.brackets ?? [],
        unparsed,
        divisions: divisions.map(({ name, teams, brackets }) => ({ name, teams, brackets })),
        division: picked ? chosen : undefined,
    };
}

/** The asked-for division; else the one holding most of the schedule's teams; else the first. */
function chooseDivision(divisions: readonly SnakeDivision[], options: SnakeChartOptions): number {
    if (options.division !== undefined && Number.isInteger(options.division) && options.division >= 0 && options.division < divisions.length) return options.division;
    let best = 0;
    if (options.scheduleTeams) {
        const wanted = new Set(options.scheduleTeams);
        let bestCount = 0;
        divisions.forEach((division, index) => {
            const count = division.teams.filter((team) => wanted.has(team.number)).length;
            if (count > bestCount) [best, bestCount] = [index, count];
        });
    }
    return best;
}
