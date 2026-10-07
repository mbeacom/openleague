/**
 * Reads a league schedule page that the user pasted or saved (spec R2). The page lists
 * `date · time · home · score · away · rink`, with cells on separate lines or tab-separated.
 * The score is one cell ("4 - 9") or three ("4", "-", "9"). A game with no score is
 * scheduled. Lines holding a team number that never formed a game are reported verbatim,
 * never dropped silently.
 *
 * A browser's plain-text copy of a page laid out with `<div>` cells (not a table) glues
 * neighbouring cells together: the time runs into the home team ("5:40pm901 Riverside M1"),
 * the away team runs into the rink ("902 Lakeview M2Rink A"), and an unplayed game is one
 * line ("8:00am901 Riverside M1902 Lakeview M2Rink A"). `unglue` separates them using only
 * what the same input proves: a team's name from a cell the score line delimits, and a rink
 * from the rest of a line whose team name is known. A team cell it can't split reliably
 * still counts (its number is certain) but is reported, without a guessed name or rink.
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
/** A time with a team cell run straight into it, as a plain-text copy produces. */
const TIME_TEAM = /^(\d{1,2}:\d{2}\s*[ap]\.?m\.?)\s*(\d{3}\s+\S.*)$/i;
const TEAM = /^(\d{3})\s+(\S.*)$/;
const SCORE = /^(\d{1,2})\s*[-–—−]\s*(\d{1,2})$/;
const GOALS = /^\d{1,2}$/;
const DASH = /^[-–—−]$/;
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
    // Validate against real calendar: construct date and check month/day round-trip
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
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

interface Tokens {
    tokens: string[];
    /** True when cells were found run together, so the input is a glued plain-text copy. */
    glued: boolean;
    /** The input was HTML: its cells are delimited by markup, so none is ever split. */
    html: boolean;
}

function tokenize(input: string): Tokens {
    const html = looksLikeHtml(input);
    const text = html ? htmlToText(input) : input;
    const tokens: string[] = [];
    let glued = false;
    for (const raw of text.split(/\r?\n|\t/)) {
        const cell = raw.replace(/\s+/g, " ").trim();
        if (!cell) continue;
        const both = DATE_TIME.exec(cell);
        const timeTeam = html ? null : TIME_TEAM.exec(cell);
        if (both) tokens.push(both[1], both[2]);
        else if (timeTeam) {
            tokens.push(timeTeam[1], timeTeam[2]);
            if (!/\s$/.test(timeTeam[1]) && cell[timeTeam[1].length] !== " ") glued = true;
        } else tokens.push(cell);
    }
    return { tokens, glued, html };
}

function isStructural(token: string): boolean {
    return DATE.test(token) || TIME.test(token) || DATE_TIME.test(token) || TEAM.test(token) || SCORE.test(token) || GOALS.test(token) || DASH.test(token) || VERSUS.test(token);
}

/** The length of the score (or "vs") starting at `i`, or 0 when there is none. */
function scoreLength(tokens: readonly string[], i: number): number {
    const token = tokens[i] ?? "";
    if (SCORE.test(token) || VERSUS.test(token)) return 1;
    if (GOALS.test(token) && DASH.test(tokens[i + 1] ?? "") && GOALS.test(tokens[i + 2] ?? "")) return 3;
    return 0;
}

const startsGame = (token: string | undefined) => token !== undefined && (DATE.test(token) || TIME.test(token));

/**
 * Where an unplayed game's home cell runs into its away cell: a three-digit number followed
 * by a space, right after a non-space. Inside a longer digit run only its last three digits
 * qualify ("M1902 Lakeview" → "902").
 */
function awayStarts(cell: string): number[] {
    const starts: number[] = [];
    for (const m of cell.matchAll(/\d{3}(?=\s+\S)/g)) {
        const at = m.index;
        if (at >= 4 && /\S/.test(cell[at - 1]) && !/\d/.test(cell[at + 3])) starts.push(at);
    }
    return starts;
}

interface Unglued {
    tokens: string[];
    /** Names proven by the input's structure, by team number. */
    names: Map<string, string>;
    /** Away cells whose name and rink couldn't be told apart. */
    unclear: Set<number>;
    /** In a glued copy, each away cell's rink as split from it: the next line is never a rink. */
    rinkAt: Map<number, string | null>;
}

function unglue({ tokens: input, glued: timeGlued, html }: Tokens): Unglued {
    if (html) return { tokens: input, names: new Map(), unclear: new Set(), rinkAt: new Map() };
    let glued = timeGlued;
    const names = new Map<string, string>();
    const learn = (cell: string) => {
        const team = TEAM.exec(cell);
        if (team && !names.has(team[1])) names.set(team[1], team[2]);
    };
    // A home cell that a score follows is delimited on both sides: its name is exact.
    input.forEach((token, i) => {
        if (startsGame(input[i - 1]) && TEAM.test(token) && scoreLength(input, i + 1) > 0) learn(token);
    });

    // An unplayed game's home and away cells on one line.
    const tokens: string[] = [];
    const awaySlots = new Set<number>();
    const unsplit: number[] = [];
    input.forEach((token, i) => {
        const home = TEAM.exec(token);
        const homeSlot = home && startsGame(input[i - 1]) && scoreLength(input, i + 1) === 0;
        if (!home || !homeSlot) {
            if (TEAM.test(token) && i > 0 && scoreLength(input, i - 1) > 0) awaySlots.add(tokens.length);
            else if (TEAM.test(token) && i >= 3 && scoreLength(input, i - 3) === 3) awaySlots.add(tokens.length);
            tokens.push(token);
            return;
        }
        const starts = awayStarts(token).filter((at) => token.slice(at, at + 3) !== home[1]);
        if (starts.length === 0) {
            tokens.push(token);
            return;
        }
        const known = names.get(home[1]);
        const byName = known === undefined ? [] : starts.filter((at) => token.slice(0, at).trimEnd() === `${home[1]} ${known}`);
        // In a copy that keeps cells apart, a team cell right after this one is the away team, so
        // this cell is whole ("901 Riverside 2016 Blue"). A glued copy puts a game on one line.
        if (!timeGlued && TEAM.test(input[i + 1] ?? "")) {
            tokens.push(token);
            return;
        }
        const byNumber = starts.filter((at) => names.has(token.slice(at, at + 3)));
        const at = byName.length === 1 ? byName[0] : starts.length === 1 ? starts[0] : byNumber.length === 1 ? byNumber[0] : -1;
        if (at === -1) {
            unsplit.push(tokens.length);
            tokens.push(token);
            return;
        }
        glued = true;
        const homeCell = token.slice(0, at).trimEnd();
        learn(homeCell);
        tokens.push(homeCell);
        awaySlots.add(tokens.length);
        tokens.push(token.slice(at));
    });

    // An away cell that a rink cell follows is delimited too; that rink is a known rink.
    const rinks = new Set<string>();
    const glueCandidates: number[] = [];
    for (const at of awaySlots) {
        const next = tokens[at + 1];
        if (!glued && next !== undefined && !isStructural(next)) {
            learn(tokens[at]);
            rinks.add(next);
        } else glueCandidates.push(at);
    }

    // An away cell run into its rink: split on a known name, else on a known rink, until stable.
    const splits = new Map<number, { cell: string; rink: string | null }>();
    let changed = true;
    while (changed) {
        changed = false;
        for (const at of glueCandidates) {
            if (splits.has(at)) continue;
            const team = TEAM.exec(tokens[at])!;
            const [number, rest] = [team[1], team[2]];
            const known = names.get(number);
            let split: { name: string; rink: string | null } | null = null;
            if (known !== undefined && rest === known) split = { name: known, rink: null };
            else if (known !== undefined && rest.startsWith(known)) split = { name: known, rink: rest.slice(known.length).trim() || null };
            else if (known === undefined) {
                const rink = [...rinks].filter((r) => rest.length > r.length && rest.endsWith(r)).sort((a, b) => b.length - a.length)[0];
                if (rink !== undefined) split = { name: rest.slice(0, rest.length - rink.length).trim(), rink };
            }
            if (!split || !split.name) continue;
            splits.set(at, { cell: `${number} ${split.name}`, rink: split.rink });
            if (split.rink !== null && !rinks.has(split.rink)) rinks.add(split.rink);
            if (known === undefined) names.set(number, split.name);
            changed = true;
        }
    }

    for (const [at, split] of splits) if (split.cell !== tokens[at]) glued = true;
    if (!glued) return { tokens, names, unclear: new Set(), rinkAt: new Map() };
    // Only a copy known to be glued makes an unsplit cell doubtful; a clean one is taken as is.
    const unclear = new Set<number>(unsplit);
    const rinkAt = new Map<number, string | null>();
    tokens.forEach((token, i) => {
        if (!glueCandidates.includes(i)) return;
        const split = splits.get(i);
        if (split) tokens[i] = split.cell;
        else unclear.add(i);
        rinkAt.set(i, split?.rink ?? null);
    });
    return { tokens, names, unclear, rinkAt };
}

export function parseSchedule(input: string, options: { seasonYear: number }): ParsedSchedule {
    const { tokens, names: proven, unclear, rinkAt } = unglue(tokenize(input));
    const games: ParsedGame[] = [];
    const names = new Map<string, string>();
    const used = new Set<number>();
    const doubtful: string[] = [];
    let date: string | null = null;
    let time: string | null = null;
    const nameOf = (index: number, team: RegExpExecArray) => {
        if (unclear.has(index)) {
            if (!doubtful.includes(tokens[index])) doubtful.push(tokens[index]);
            return;
        }
        if (!names.has(team[1])) names.set(team[1], proven.get(team[1]) ?? team[2]);
    };

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
        if (!home || !date || unclear.has(i)) {
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
        if (rinkAt.has(j)) rink = rinkAt.get(j)!;
        else if (next !== undefined && !isStructural(next)) {
            rink = next;
            end = j + 2;
        }
        for (let k = i; k < end; k++) used.add(k);
        nameOf(i, home);
        nameOf(j, away);
        games.push({ date, time, home: home[1], away: away[1], homeGoals, awayGoals, rink });
        time = null;
        i = end;
    }

    const unparsed: string[] = [];
    tokens.forEach((token, index) => {
        if (!used.has(index) && TEAM.test(token) && !unparsed.includes(token)) unparsed.push(token);
    });
    // A team seen only in cells that couldn't be split is listed by number alone.
    for (const game of games) {
        for (const number of [game.home, game.away]) if (!names.has(number)) names.set(number, proven.get(number) ?? number);
    }
    return { games, teams: [...names.entries()].map(([number, name]) => ({ number, name })), unparsed: [...unparsed, ...doubtful] };
}
