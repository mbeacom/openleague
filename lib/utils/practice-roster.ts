/**
 * Practice roster (roster and suggestions spec R1–R4, R7–R11, R15): who a
 * coach expects at one practice, by position. The vocabulary, limits and
 * messages, the position rules, the counts and labels every view shows, the
 * paste parser, the privacy helpers and the save schema.
 *
 * Portable (ADR-0020): imports only zod and the age-group module, so both
 * deployables, the server actions, the static store and the plan document
 * share it. Never import @prisma/client, React or the DOM here.
 */
import { z } from "zod";
import { ageGroupSchema, toAgeGroup, type AgeGroup } from "@/lib/utils/age-groups";

// ---------------------------------------------------------------------------
// Vocabulary and limits
// ---------------------------------------------------------------------------

export const ROSTER_BUILTIN_ROLES = ["S", "F", "D", "G"] as const;
/** S skater, F forward, D defense, G goalie (R3). */
export type RosterBuiltinRole = (typeof ROSTER_BUILTIN_ROLES)[number];
/** The one position that counts as a goalie. Custom positions are always skaters (R3). */
export const GOALIE_ROLE: RosterBuiltinRole = "G";

export const ROSTER_ROLE_LABELS: Record<RosterBuiltinRole, string> = {
    S: "Skater",
    F: "Forward",
    D: "Defense",
    G: "Goalie",
};

const ROLE_COUNT_NOUNS: Record<RosterBuiltinRole, [singular: string, plural: string]> = {
    S: ["skater", "skaters"],
    F: ["forward", "forwards"],
    D: ["defense", "defense"],
    G: ["goalie", "goalies"],
};

/** Words a pasted line or a team position may use for each built-in position (R8, R9). */
const ROLE_WORDS: Record<RosterBuiltinRole, readonly string[]> = {
    S: ["s", "skater"],
    F: ["f", "fwd", "forward", "c", "center", "centre", "w", "wing", "winger", "lw", "rw"],
    D: ["d", "def", "defense", "defence", "defenseman", "defenceman"],
    G: ["g", "goalie", "goaltender", "goalkeeper", "keeper"],
};

export const MAX_ROSTER_PLAYERS = 40;
export const ROSTER_NAME_MAX = 40;
export const ROSTER_NUMBER_MAX_DIGITS = 3;
export const MAX_CUSTOM_ROSTER_ROLES = 3;
export const CUSTOM_ROSTER_ROLE_MAX = 12;
/** A key: a stored id or an editor key, as long as a row's clientKey may be. */
export const ROSTER_KEY_MAX = 64;

export const ROSTER_LIMIT_MESSAGE = `A practice roster can list at most ${MAX_ROSTER_PLAYERS} players`;
export const ROSTER_NAME_LENGTH_MESSAGE = `A player's name must be at most ${ROSTER_NAME_MAX} characters`;
export const ROSTER_NUMBER_MESSAGE = `A jersey number must be 1 to ${ROSTER_NUMBER_MAX_DIGITS} digits`;
export const ROSTER_KEY_MESSAGE = `A roster key must be 1 to ${ROSTER_KEY_MAX} characters`;
export const ROSTER_KEY_DUPLICATE_MESSAGE = "Each roster player needs a unique key";
export const ROSTER_PLAYER_TWICE_MESSAGE = "A team player is on the practice roster twice";
export const ROSTER_PLAYER_TEAM_MESSAGE = "A roster player isn't on this team";
/** The static planner has no team roster to link to. */
export const ROSTER_NO_TEAM_LINK_MESSAGE = "This planner can't link roster players to a team";
export const ROSTER_INVALID_MESSAGE = "The practice roster is invalid";
export const CUSTOM_ROLE_REQUIRED_MESSAGE = "Give the position a name";
export const CUSTOM_ROLE_LENGTH_MESSAGE = `A position name must be at most ${CUSTOM_ROSTER_ROLE_MAX} characters`;
export const CUSTOM_ROLE_TAKEN_MESSAGE = "That position is already on the list";
export const CUSTOM_ROLE_LIMIT_MESSAGE = `A roster can have at most ${MAX_CUSTOM_ROSTER_ROLES} custom positions`;

export const NO_PLAYERS_LABEL = "No players yet";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** One player on a practice roster (R4). `playerId` is hosted only: a Player of the practice's team. */
export interface RosterPlayer {
    key: string;
    /** "" = not given */
    name: string;
    /** "" or 1–3 digits */
    number: string;
    /** A position on the roster's list (a built-in code or a custom label). */
    role: string;
    playerId?: string | null;
}

/** A practice's roster (R1): its own age group, the positions in use, and the players. */
export interface PracticeRoster {
    ageGroup: AgeGroup | null;
    roles: string[];
    players: RosterPlayer[];
}

/** A team player the hosted picker offers (R8). Never a contact, birth date or membership field. */
export interface RosterOption {
    playerId: string;
    name: string;
    /** "" when the team has none */
    number: string;
    /** The free-text team position, used only to suggest a role. */
    position: string | null;
}

// ---------------------------------------------------------------------------
// Cleaning
// ---------------------------------------------------------------------------

const CONTROL = /[\u0000-\u001F\u007F-\u009F​-‍⁠﻿]/g;

/** One line of text: control and zero-width characters removed, whitespace runs made one space, trimmed. */
export function cleanRosterText(value: string): string {
    return value.replace(CONTROL, " ").replace(/\s+/g, " ").trim();
}

export function cleanRosterName(value: string): string {
    return cleanRosterText(value);
}

/** A jersey number as stored: digits only after an optional "#", else "". */
export function toRosterNumber(value: unknown): string {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) return toRosterNumber(String(value));
    if (typeof value !== "string") return "";
    const digits = value.trim().replace(/^#/, "");
    return new RegExp(`^\\d{1,${ROSTER_NUMBER_MAX_DIGITS}}$`).test(digits) ? digits : "";
}

const builtinKey = (value: string) => value.trim().toLowerCase();

export function isBuiltinRosterRole(value: unknown): value is RosterBuiltinRole {
    return (ROSTER_BUILTIN_ROLES as readonly unknown[]).includes(value);
}

/** The built-in position a word names (a code, a label or a common word), else null. */
export function builtinRoleForWord(word: string): RosterBuiltinRole | null {
    const key = builtinKey(word);
    for (const role of ROSTER_BUILTIN_ROLES) {
        if (ROLE_WORDS[role].includes(key) || ROSTER_ROLE_LABELS[role].toLowerCase() === key) return role;
    }
    return null;
}

/** A built-in code or label ("G", "Goalie"): a custom position can't take it. Other words (wing, center) can. */
export function isBuiltinRosterName(word: string): boolean {
    const key = builtinKey(word);
    return ROSTER_BUILTIN_ROLES.some((role) => role.toLowerCase() === key || ROSTER_ROLE_LABELS[role].toLowerCase() === key);
}

// ---------------------------------------------------------------------------
// Positions (R3)
// ---------------------------------------------------------------------------

/** 6U, 8U and none: Skater/Goalie. 10U and older: Forward/Defense/Goalie. */
export function defaultRosterRoles(ageGroup: AgeGroup | null): string[] {
    return ageGroup === null || ageGroup === "u6" || ageGroup === "u8" ? ["S", "G"] : ["F", "D", "G"];
}

export function emptyRoster(ageGroup: AgeGroup | null = null): PracticeRoster {
    return { ageGroup, roles: defaultRosterRoles(ageGroup), players: [] };
}

/** Why a custom position can't be added to `roles`, or null. */
export function customRosterRoleError(label: string, roles: readonly string[]): string | null {
    const clean = cleanRosterText(label);
    if (!clean) return CUSTOM_ROLE_REQUIRED_MESSAGE;
    if (clean.length > CUSTOM_ROSTER_ROLE_MAX) return CUSTOM_ROLE_LENGTH_MESSAGE;
    if (isBuiltinRosterName(clean) || roles.some((role) => role.toLowerCase() === clean.toLowerCase())) return CUSTOM_ROLE_TAKEN_MESSAGE;
    if (roles.filter((role) => !isBuiltinRosterRole(role)).length >= MAX_CUSTOM_ROSTER_ROLES) return CUSTOM_ROLE_LIMIT_MESSAGE;
    return null;
}

/**
 * The positions in use, as every path stores them: built-ins S, F, D in that
 * order, then up to three valid custom positions in the order given, then G.
 * Goalie is always on, and at least one skater position (S when none is left).
 */
export function normalizeRosterRoles(roles: readonly unknown[]): string[] {
    const builtins = new Set<RosterBuiltinRole>();
    const custom: string[] = [];
    for (const raw of roles) {
        if (typeof raw !== "string") continue;
        if (isBuiltinRosterRole(raw)) {
            builtins.add(raw);
            continue;
        }
        const label = cleanRosterText(raw);
        if (isBuiltinRosterRole(label.toUpperCase()) && label.length === 1) {
            builtins.add(label.toUpperCase() as RosterBuiltinRole);
            continue;
        }
        if (customRosterRoleError(label, custom) === null) custom.push(label);
    }
    const skaters = (["S", "F", "D"] as const).filter((role) => builtins.has(role));
    const result = [...skaters, ...custom];
    if (result.length === 0) result.push("S");
    return [...result, GOALIE_ROLE];
}

/** The first skater position on the list: where a player whose position is off goes. */
export function firstSkaterRole(roles: readonly string[]): string {
    return roles.find((role) => role !== GOALIE_ROLE) ?? "S";
}

/** A position as the list spells it; Goalie stays Goalie; anything else is the first skater position. */
export function toRosterRole(role: unknown, roles: readonly string[]): string {
    if (role === GOALIE_ROLE) return GOALIE_ROLE;
    if (typeof role === "string") {
        const match = roles.find((known) => known === role || (!isBuiltinRosterRole(known) && known.toLowerCase() === cleanRosterText(role).toLowerCase()));
        if (match) return match;
    }
    return firstSkaterRole(roles);
}

/** Every player on a position the list has (toRosterRole). Returns the same players when nothing moves. */
export function remapRosterPlayers(players: readonly RosterPlayer[], roles: readonly string[]): RosterPlayer[] {
    let changed = false;
    const next = players.map((player) => {
        const role = toRosterRole(player.role, roles);
        if (role === player.role) return player;
        changed = true;
        return { ...player, role };
    });
    return changed ? next : (players as RosterPlayer[]);
}

const sameRoles = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((role, index) => role === b[index]);

/** A new age; the positions follow it only while they are still the previous age's default (R3). */
export function setRosterAgeGroup(roster: PracticeRoster, ageGroup: AgeGroup | null): PracticeRoster {
    if (!sameRoles(roster.roles, defaultRosterRoles(roster.ageGroup))) return { ...roster, ageGroup };
    const roles = defaultRosterRoles(ageGroup);
    return { ageGroup, roles, players: remapRosterPlayers(roster.players, roles) };
}

/** Turns a position on or off. Goalie and the last skater position never turn off (the same roster comes back). */
export function toggleRosterRole(roster: PracticeRoster, role: string): PracticeRoster {
    if (role === GOALIE_ROLE) return roster;
    const on = roster.roles.includes(role);
    if (on && roster.roles.filter((known) => known !== GOALIE_ROLE).length <= 1) return roster;
    const roles = normalizeRosterRoles(on ? roster.roles.filter((known) => known !== role) : [...roster.roles, role]);
    return { ...roster, roles, players: remapRosterPlayers(roster.players, roles) };
}

export function addCustomRosterRole(roster: PracticeRoster, label: string): { ok: true; roster: PracticeRoster } | { ok: false; error: string } {
    const error = customRosterRoleError(label, roster.roles);
    if (error) return { ok: false, error };
    return { ok: true, roster: { ...roster, roles: normalizeRosterRoles([...roster.roles, cleanRosterText(label)]) } };
}

export function rosterRoleLabel(role: string): string {
    return isBuiltinRosterRole(role) ? ROSTER_ROLE_LABELS[role] : role;
}

/** The team position text as a role on the list (R8). */
export function roleFromTeamPosition(position: string | null | undefined, roles: readonly string[]): string {
    if (position) {
        const words = position.toLowerCase().split(/[^a-z]+/).filter(Boolean);
        const whole = builtinRoleForWord(position);
        const found = whole ?? words.map(builtinRoleForWord).find((role): role is RosterBuiltinRole => role !== null) ?? null;
        if (found) return toRosterRole(found, roles);
    }
    return firstSkaterRole(roles);
}

// ---------------------------------------------------------------------------
// Counts and labels (R15)
// ---------------------------------------------------------------------------

export interface RosterCounts {
    skaters: number;
    goalies: number;
    total: number;
    byRole: Array<{ role: string; label: string; count: number }>;
}

export function rosterCounts(roster: PracticeRoster | null | undefined): RosterCounts {
    const roles = roster?.roles ?? [];
    const players = roster?.players ?? [];
    const byRole = roles.map((role) => ({ role, label: rosterRoleLabel(role), count: players.filter((player) => player.role === role).length }));
    const goalies = players.filter((player) => player.role === GOALIE_ROLE).length;
    return { skaters: players.length - goalies, goalies, total: players.length, byRole };
}

function countNoun(role: string, count: number): string {
    if (isBuiltinRosterRole(role)) return `${count} ${ROLE_COUNT_NOUNS[role][count === 1 ? 0 : 1]}`;
    return `${count} ${role}`;
}

/** "7 skaters · 1 goalie", "4 forwards · 3 defense · 1 goalie", or "No players yet". */
export function rosterCountsLabel(roster: PracticeRoster | null | undefined): string {
    const counts = rosterCounts(roster);
    if (counts.total === 0) return NO_PLAYERS_LABEL;
    return counts.byRole.map(({ role, count }) => countNoun(role, count)).join(" · ");
}

/** What one player shows as: "#7 Alex", "Alex", "#7", else the position and its place ("Skater 3"). */
export function rosterPlayerLabels(roster: PracticeRoster): string[] {
    const seen = new Map<string, number>();
    return roster.players.map((player) => {
        const place = (seen.get(player.role) ?? 0) + 1;
        seen.set(player.role, place);
        const number = player.number ? `#${player.number}` : "";
        const label = [number, player.name].filter(Boolean).join(" ");
        return label || `${rosterRoleLabel(player.role)} ${place}`;
    });
}

/** The bench sheet's list: each position in use with its players' labels, in roster order. */
export function rosterByRole(roster: PracticeRoster): Array<{ role: string; label: string; players: string[] }> {
    const labels = rosterPlayerLabels(roster);
    return roster.roles
        .map((role) => ({
            role,
            label: rosterRoleLabel(role),
            players: roster.players.flatMap((player, index) => (player.role === role ? [labels[index]] : [])),
        }))
        .filter((group) => group.players.length > 0);
}

/**
 * The bench sheet's roster lines (R15): "Roster: 7 skaters · 1 goalie", then,
 * only with names, one line per position ("Goalie: #30 Pat"). Null when the
 * practice has no players.
 */
export function rosterSheetLines(roster: PracticeRoster | null | undefined, includeNames: boolean): { counts: string; players: string[] } | null {
    if (!roster || roster.players.length === 0) return null;
    return {
        counts: `Roster: ${rosterCountsLabel(roster)}`,
        players: includeNames ? rosterByRole(roster).map((group) => `${group.label}: ${group.players.join(", ")}`) : [],
    };
}

// ---------------------------------------------------------------------------
// Privacy (R10)
// ---------------------------------------------------------------------------

/** Does any player carry a name or a number: the Export menu's checkbox shows only then. */
export function rosterHasNames(roster: PracticeRoster | null | undefined): boolean {
    return Boolean(roster?.players.some((player) => player.name || player.number));
}

/** Positions only: names, numbers and team links removed. */
export function rosterWithoutNames(roster: PracticeRoster): PracticeRoster {
    return { ...roster, players: roster.players.map((player) => ({ key: player.key, name: "", number: "", role: player.role, playerId: null })) };
}

// ---------------------------------------------------------------------------
// Paste a list (R9)
// ---------------------------------------------------------------------------

export type PastedPlayer = Pick<RosterPlayer, "name" | "number" | "role">;

function roleForToken(token: string, roles: readonly string[]): string | null {
    const custom = roles.find((role) => !isBuiltinRosterRole(role) && role.toLowerCase() === token.toLowerCase());
    if (custom) return custom;
    const builtin = builtinRoleForWord(token);
    return builtin ? toRosterRole(builtin, roles) : null;
}

const pasteTokens = (text: string) => cleanRosterText(text.replace(/[(),:]/g, " ").replace(/\s[-–—]+(?=\s)/g, " ")).split(" ").filter(Boolean);

/** The longest custom position whose words begin (or end) the line, ignoring case, with how many tokens it spans. */
function customRoleAt(tokens: readonly string[], roles: readonly string[], end: boolean): { role: string; length: number } | null {
    const lower = tokens.map((token) => token.toLowerCase());
    let best: { role: string; length: number } | null = null;
    for (const role of roles) {
        if (isBuiltinRosterRole(role)) continue;
        const words = pasteTokens(role).map((word) => word.toLowerCase());
        if (words.length === 0 || words.length > tokens.length || (best && words.length <= best.length)) continue;
        const slice = end ? lower.slice(tokens.length - words.length) : lower.slice(0, words.length);
        if (slice.every((word, index) => word === words[index])) best = { role, length: words.length };
    }
    return best;
}

/**
 * One player per line (or ";"-separated): the first 1–3 digit token (an
 * optional "#") is the number, a position at the start or the end is the
 * position (the longest custom position first, then a one-word position),
 * the rest is the name (cut to the limit). Players past the roster limit are
 * counted in `overflow`, not returned.
 */
export function parseRosterPaste(text: string, roles: readonly string[], existing: number): { players: PastedPlayer[]; overflow: number } {
    const room = Math.max(0, MAX_ROSTER_PLAYERS - existing);
    const players: PastedPlayer[] = [];
    let overflow = 0;
    for (const line of text.split(/[\n;]/)) {
        const tokens = pasteTokens(line);
        if (tokens.length === 0) continue;
        let role: string | null = null;
        const startCustom = customRoleAt(tokens, roles, false);
        const first = startCustom ? null : roleForToken(tokens[0], roles);
        if (startCustom) {
            role = startCustom.role;
            tokens.splice(0, startCustom.length);
        } else if (first) {
            role = first;
            tokens.shift();
        } else if (tokens.length > 1 || !/^#?\d+$/.test(tokens[0])) {
            // An end position must leave something before it.
            const endCustom = customRoleAt(tokens, roles, true);
            const last = roleForToken(tokens[tokens.length - 1], roles);
            if (endCustom && endCustom.length < tokens.length) {
                role = endCustom.role;
                tokens.splice(tokens.length - endCustom.length);
            } else if (last && tokens.length > 1) {
                role = last;
                tokens.pop();
            }
        }
        let number = "";
        const numberAt = tokens.findIndex((token) => toRosterNumber(token) !== "");
        if (numberAt >= 0) {
            number = toRosterNumber(tokens[numberAt]);
            tokens.splice(numberAt, 1);
        }
        if (players.length >= room) {
            overflow++;
            continue;
        }
        players.push({ name: tokens.join(" ").slice(0, ROSTER_NAME_MAX).trim(), number, role: role ?? firstSkaterRole(roles) });
    }
    return { players, overflow };
}

// ---------------------------------------------------------------------------
// Save schema (R7) and lenient reader
// ---------------------------------------------------------------------------

const ROSTER_NUMBER_PATTERN = new RegExp(`^\\d{0,${ROSTER_NUMBER_MAX_DIGITS}}$`);

/**
 * Name and number are checked against the stored-value rules in the roster's
 * refinement, and only for a player who isn't linked: a linked player stores
 * only the link (R6), its name and number are the team's, shown live. So a long
 * team name, or a rename after the practice was planned, never blocks a save.
 */
const rosterPlayerSchema = z.object({
    key: z.string({ message: ROSTER_KEY_MESSAGE }).min(1, ROSTER_KEY_MESSAGE).max(ROSTER_KEY_MAX, ROSTER_KEY_MESSAGE),
    name: z.string({ message: ROSTER_NAME_LENGTH_MESSAGE }).transform(cleanRosterName),
    number: z.string({ message: ROSTER_NUMBER_MESSAGE }).transform((value) => value.trim()),
    role: z.string().max(40),
    playerId: z.string().min(1).max(ROSTER_KEY_MAX).nullish(),
});

/**
 * A roster as a save sends it (hosted action and static store). Strict on
 * structure, limits, names and numbers; positions are normalized and each
 * player moved onto the list (R3), so a stray position never blocks a save.
 * A linked player's name and number are dropped (the save stores the link).
 */
export const practiceRosterSchema = z
    .object({
        ageGroup: ageGroupSchema.nullable(),
        roles: z.array(z.string().max(40)).max(10),
        players: z.array(rosterPlayerSchema).max(MAX_ROSTER_PLAYERS, ROSTER_LIMIT_MESSAGE),
    })
    .superRefine((roster, ctx) => {
        const keys = new Set<string>();
        const linked = new Set<string>();
        roster.players.forEach((player, index) => {
            if (keys.has(player.key)) ctx.addIssue({ code: "custom", path: ["players", index, "key"], message: ROSTER_KEY_DUPLICATE_MESSAGE });
            keys.add(player.key);
            if (player.playerId) {
                if (linked.has(player.playerId)) ctx.addIssue({ code: "custom", path: ["players", index, "playerId"], message: ROSTER_PLAYER_TWICE_MESSAGE });
                linked.add(player.playerId);
                return;
            }
            if (player.name.length > ROSTER_NAME_MAX) ctx.addIssue({ code: "custom", path: ["players", index, "name"], message: ROSTER_NAME_LENGTH_MESSAGE });
            if (!ROSTER_NUMBER_PATTERN.test(player.number)) ctx.addIssue({ code: "custom", path: ["players", index, "number"], message: ROSTER_NUMBER_MESSAGE });
        });
    })
    .transform((roster): PracticeRoster => {
        const roles = normalizeRosterRoles(roster.roles);
        return {
            ageGroup: roster.ageGroup,
            roles,
            players: roster.players.map((player) => ({
                key: player.key,
                name: player.playerId ? "" : player.name,
                number: player.playerId ? "" : player.number,
                role: toRosterRole(player.role, roles),
                playerId: player.playerId ?? null,
            })),
        };
    });

export type PracticeRosterInput = z.input<typeof practiceRosterSchema>;

/**
 * Lenient reader for a stored value (a device record, a database row set):
 * not an object reads as no roster; unknown values are repaired; players
 * that aren't objects are dropped; at most MAX_ROSTER_PLAYERS. Accepts `id`
 * for the key, as the static store keeps it.
 */
export function toPracticeRoster(value: unknown): PracticeRoster | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const raw = value as { ageGroup?: unknown; roles?: unknown; players?: unknown };
    const roles = normalizeRosterRoles(Array.isArray(raw.roles) ? raw.roles : []);
    const players = (Array.isArray(raw.players) ? raw.players : [])
        .filter((player): player is Record<string, unknown> => Boolean(player) && typeof player === "object" && !Array.isArray(player))
        .slice(0, MAX_ROSTER_PLAYERS)
        .map((player, index): RosterPlayer => {
            const key = typeof player.key === "string" ? player.key : typeof player.id === "string" ? player.id : `roster-${index}`;
            const playerId = typeof player.playerId === "string" && player.playerId ? player.playerId : null;
            return {
                key,
                // A linked player's name is the team's, read live and never stored: shown whole.
                name: typeof player.name === "string" ? (playerId ? cleanRosterName(player.name) : cleanRosterName(player.name).slice(0, ROSTER_NAME_MAX).trim()) : "",
                number: toRosterNumber(player.number),
                role: toRosterRole(player.role, roles),
                playerId,
            };
        });
    return { ageGroup: toAgeGroup(raw.ageGroup), roles, players };
}

/** A fresh editor key for a new player. */
export function newRosterKey(): string {
    return `roster-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
