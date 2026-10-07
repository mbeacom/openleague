/**
 * Reads a snake chart (spec, Import): a "Program" header row (colour per column)
 * and a "Strength" header row (str/mid/weak), then one row per program whose cells
 * hold team numbers. Continuation rows (a program with more teams than one row)
 * have no program cell. Accepts the table's HTML or a tab-separated paste of it.
 * Header rows reset the columns, so a page with several age-group tables works.
 */
import { decodeEntities, looksLikeHtml } from "./html";

export interface ParsedSnakeTeam {
    number: string;
    name: string | null;
    startingBracket: string;
}

export interface ParsedSnakeChart {
    teams: ParsedSnakeTeam[];
    unparsed: string[];
}

interface Row {
    /** The row's leading label cell, or null for an HTML continuation row. */
    label: string | null;
    /** Positional data cells after the label. */
    cells: Array<{ text: string; title: string | null }>;
}

const STRENGTH: Record<string, string> = { str: "Strong", strong: "Strong", mid: "Mid", middle: "Mid", weak: "Weak" };
const NUMBER = /^\d{3}$/;

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

function textRows(text: string): Row[] {
    return text
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map((line) => {
            const cells = line.split("\t").map((cell) => cell.replace(/\s+/g, " ").trim());
            return { label: cells[0], cells: cells.slice(1).map((cell) => ({ text: cell, title: null })) };
        });
}

export function parseSnakeChart(input: string): ParsedSnakeChart {
    const rows = looksLikeHtml(input) ? htmlRows(input) : textRows(input);
    const teams: ParsedSnakeTeam[] = [];
    const unparsed: string[] = [];
    let colours: string[] = [];
    let labels: string[] = [];
    for (const row of rows) {
        const label = row.label?.toLowerCase() ?? null;
        if (label === "program") {
            colours = row.cells.map((cell) => cell.text);
            labels = [];
            continue;
        }
        if (label === "strength") {
            labels = row.cells.map((cell, k) => `${colours[k] ?? ""} ${STRENGTH[cell.text.toLowerCase()] ?? cell.text}`.trim());
            continue;
        }
        row.cells.forEach((cell, k) => {
            if (!NUMBER.test(cell.text)) return;
            const bracket = labels[k];
            if (!bracket) {
                unparsed.push(cell.text);
                return;
            }
            teams.push({ number: cell.text, name: cell.title, startingBracket: bracket });
        });
    }
    return { teams, unparsed };
}
