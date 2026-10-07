/**
 * Reads a league schedule page that the user pasted or saved (spec R2). The page lists
 * `date · time · home · score · away · rink`, with cells on separate lines or tab-separated.
 * The score is one cell ("4 - 9") or three ("4", "-", "9"). A game with no score is
 * scheduled. Lines holding a team number that never formed a game are reported verbatim,
 * never dropped silently.
 */
import { htmlToText, looksLikeHtml } from "./html";

export interface ParsedGame {
    date: string;
    time: string | null;
    home: string;
    away: string;
    homeGoals: number | null;
    awayGoals: number | null;
    rink: string | null;
}

export interface ParsedSchedule {
    games: ParsedGame[];
    teams: Array<{ number: string; name: string }>;
    unparsed: string[];
}

const DATE = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/;
const TIME = /^(\d{1,2}):(\d{2})\s*([ap])\.?m\.?$/i;
const DATE_TIME = /^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+(\d{1,2}:\d{2}\s*[ap]\.?m\.?)$/i;
const TEAM = /^(\d{3})\s+(\S.*)$/;
const SCORE = /^(\d{1,2})\s*[-–]\s*(\d{1,2})$/;
const GOALS = /^\d{1,2}$/;
const DASH = /^[-–]$/;
const VERSUS = /^(vs\.?|v\.?|@|at)$/i;

/** Pre-season starts in late summer: from July on it's this year, else last year. */
export function defaultSeasonYear(now: Date): number {
    return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

const pad = (n: number) => String(n).padStart(2, "0");

function toIsoDate(token: string, seasonYear: number): string | null {
    const m = DATE.exec(token);
    if (!m) return null;
    const month = Number(m[1]);
    const day = Number(m[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    let year = m[3] ? Number(m[3]) : month >= 7 ? seasonYear : seasonYear + 1;
    if (year < 100) year += 2000;
    return `${year}-${pad(month)}-${pad(day)}`;
}

function toTime(token: string): string | null {
    const m = TIME.exec(token);
    if (!m) return null;
    let hour = Number(m[1]);
    const minute = Number(m[2]);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    const pm = m[3].toLowerCase() === "p";
    if (hour === 12) hour = pm ? 12 : 0;
    else if (pm) hour += 12;
    return `${pad(hour)}:${pad(minute)}`;
}

function tokenize(input: string): string[] {
    const text = looksLikeHtml(input) ? htmlToText(input) : input;
    const tokens: string[] = [];
    for (const raw of text.split(/\r?\n|\t/)) {
        const cell = raw.replace(/\s+/g, " ").trim();
        if (!cell) continue;
        const both = DATE_TIME.exec(cell);
        if (both) tokens.push(both[1], both[2]);
        else tokens.push(cell);
    }
    return tokens;
}

function isStructural(token: string): boolean {
    return DATE.test(token) || TIME.test(token) || DATE_TIME.test(token) || TEAM.test(token) || SCORE.test(token) || GOALS.test(token) || DASH.test(token) || VERSUS.test(token);
}

export function parseSchedule(input: string, options: { seasonYear: number }): ParsedSchedule {
    const tokens = tokenize(input);
    const games: ParsedGame[] = [];
    const names = new Map<string, string>();
    const used = new Set<number>();
    let date: string | null = null;
    let time: string | null = null;

    let i = 0;
    while (i < tokens.length) {
        const token = tokens[i];
        const isoDate = toIsoDate(token, options.seasonYear);
        if (isoDate) {
            date = isoDate;
            time = null;
            i++;
            continue;
        }
        const clock = toTime(token);
        if (clock) {
            time = clock;
            i++;
            continue;
        }
        const home = TEAM.exec(token);
        if (!home || !date) {
            i++;
            continue;
        }
        let j = i + 1;
        let homeGoals: number | null = null;
        let awayGoals: number | null = null;
        const single = SCORE.exec(tokens[j] ?? "");
        if (single) {
            homeGoals = Number(single[1]);
            awayGoals = Number(single[2]);
            j += 1;
        } else if (GOALS.test(tokens[j] ?? "") && DASH.test(tokens[j + 1] ?? "") && GOALS.test(tokens[j + 2] ?? "")) {
            homeGoals = Number(tokens[j]);
            awayGoals = Number(tokens[j + 2]);
            j += 3;
        } else if (VERSUS.test(tokens[j] ?? "")) {
            j += 1;
        }
        const away = TEAM.exec(tokens[j] ?? "");
        if (!away || away[1] === home[1]) {
            i++;
            continue;
        }
        let rink: string | null = null;
        const next = tokens[j + 1];
        let end = j + 1;
        if (next !== undefined && !isStructural(next)) {
            rink = next;
            end = j + 2;
        }
        for (let k = i; k < end; k++) used.add(k);
        if (!names.has(home[1])) names.set(home[1], home[2]);
        if (!names.has(away[1])) names.set(away[1], away[2]);
        games.push({ date, time, home: home[1], away: away[1], homeGoals, awayGoals, rink });
        i = end;
    }

    const unparsed: string[] = [];
    tokens.forEach((token, index) => {
        if (!used.has(index) && TEAM.test(token) && !unparsed.includes(token)) unparsed.push(token);
    });
    return { games, teams: [...names.entries()].map(([number, name]) => ({ number, name })), unparsed };
}
