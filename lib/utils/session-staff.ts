/**
 * Practice staff (spec R1–R4, R9–R11): who runs each row. One pure module for
 * the list's rules and messages, the names every reader shows, the editor's
 * list edits, the save inputs, the hosted save's row identity when staff is
 * absent, and the practice emails' "Your stations" line. No React, server or
 * DOM imports: both deployables, the server actions, the static store, the plan
 * document and the email templates share it. Rows hold staff keys, never names.
 */
import { MAX_ROW_STAFF, MAX_SESSION_STAFF, STAFF_NAME_MAX, type SessionRowKind, type SessionStaffMember } from "@/types/practice-planner";
import { CONTROL_CHARS, isBlockKind } from "@/lib/utils/session-rows";
import { buildSchedule, type TimelinePlay } from "@/lib/utils/session-timeline";
import { formatClockTime } from "@/lib/utils/date";

/** A staff key: a stored id or an editor key, as long as a row's clientKey may be. */
export const STAFF_KEY_MAX = 64;

export const STAFF_KEY_MESSAGE = `A staff key must be 1 to ${STAFF_KEY_MAX} characters`;
export const STAFF_NAME_REQUIRED_MESSAGE = "Staff name is required";
export const STAFF_NAME_LENGTH_MESSAGE = `Staff name must be at most ${STAFF_NAME_MAX} characters`;
export const STAFF_LIMIT_MESSAGE = `A practice can list at most ${MAX_SESSION_STAFF} staff`;
export const STAFF_KEY_DUPLICATE_MESSAGE = "Each staff member needs a unique key";
export const STAFF_NAME_TAKEN_MESSAGE = "Two staff members can't share a name";
/** A new practice can't pause staff the way an autosave does, so its create waits for the clash to be fixed. */
export const STAFF_CLASH_CREATE_MESSAGE = "Two staff members share a name. Rename one before creating the practice.";
export const STAFF_ONE_LINK_MESSAGE = "A staff member can be a team official or a team admin, not both";
export const STAFF_OFFICIAL_MESSAGE = "That team official isn't active on this team";
export const STAFF_ADMIN_MESSAGE = "That person isn't an admin of this team";
/** A link that isn't a well-formed id (hosted's Zod cuid check; the static store says the same). */
export const STAFF_OFFICIAL_ID_FORMAT_MESSAGE = "Invalid official ID format";
export const STAFF_USER_ID_FORMAT_MESSAGE = "Invalid user ID format";
/** Hosted: a linked official the team no longer has (removed while the editor was open). */
export const staffOfficialGoneMessage = (name: string) => `${name} is no longer on the team. Remove them from Staff, or reload.`;
/** Hosted: a linked admin the team no longer has as an admin (demoted while the editor was open). */
export const staffAdminGoneMessage = (name: string) => `${name} is no longer a team admin. Remove them from Staff, or reload.`;
export const ROW_STAFF_LIMIT_MESSAGE = `A row can be run by at most ${MAX_ROW_STAFF} staff`;
export const ROW_STAFF_DUPLICATE_MESSAGE = "A row lists the same staff member twice";
export const ROW_STAFF_UNKNOWN_MESSAGE = "A row is run by someone who isn't on the practice's staff";

/** C1 controls and zero-width characters (ZWSP, ZWNJ, ZWJ, word joiner, BOM): never part of a staff name. */
const STAFF_INVISIBLE_CHARS = /[\u0080-\u009F\u200B-\u200D\u2060\uFEFF]/g;

/**
 * A name as every write path stores it, on one line: control, C1 and
 * zero-width characters removed, then any run of whitespace (tabs and line
 * breaks included) made one space, then trimmed. Removed first, so a zero-width
 * character inside a word never becomes a space. Never cut: a long name is refused.
 */
export function cleanStaffName(name: string): string {
    return name.replace(CONTROL_CHARS, "").replace(STAFF_INVISIBLE_CHARS, "").replace(/\s+/g, " ").trim();
}

/**
 * Names are unique per practice ignoring case, as the database's lower("name")
 * index compares them. Every case-insensitive comparison of staff names goes
 * through this key. JavaScript's toLowerCase differs from PostgreSQL's lower()
 * on two known inputs, folded here so both refuse the same pairs: a final sigma
 * (JavaScript gives "ς", PostgreSQL "σ") and a dotted capital I (JavaScript
 * gives "i" plus a combining dot above, PostgreSQL "i").
 */
export function staffNameKey(name: string): string {
    return cleanStaffName(name).toLowerCase().replace(/ς/g, "σ").replace(/i\u0307/g, "i");
}

/** Has a name once cleaned: only named people are saved, offered on a row, or make Run by appear. */
export function isNamedStaff(member: { name: string }): boolean {
    return cleanStaffName(member.name).length > 0;
}

/**
 * A name the hosted picker offers: cleaned and cut to 60 characters (a team
 * official's name may be 100). Counts UTF-16 units, as every name check does,
 * and drops a surrogate pair that doesn't fit whole.
 */
export function toStaffName(value: string): string {
    return cleanStaffName(value).slice(0, STAFF_NAME_MAX).replace(/[\uD800-\uDBFF]$/, "").trim();
}

/** The list's first problem (count, keys, names), or null. */
export function staffListError(staff: ReadonlyArray<{ key: string; name: string }>): string | null {
    if (staff.length > MAX_SESSION_STAFF) return STAFF_LIMIT_MESSAGE;
    const keys = new Set<string>();
    const names = new Set<string>();
    for (const member of staff) {
        if (member.key.length < 1 || member.key.length > STAFF_KEY_MAX) return STAFF_KEY_MESSAGE;
        const name = cleanStaffName(member.name);
        if (name.length === 0) return STAFF_NAME_REQUIRED_MESSAGE;
        if (name.length > STAFF_NAME_MAX) return STAFF_NAME_LENGTH_MESSAGE;
        if (keys.has(member.key)) return STAFF_KEY_DUPLICATE_MESSAGE;
        keys.add(member.key);
        const key = staffNameKey(name);
        if (names.has(key)) return STAFF_NAME_TAKEN_MESSAGE;
        names.add(key);
    }
    return null;
}

/** One row's first problem: at most 4 people, no one twice, everyone on the list. */
export function rowStaffError(keys: readonly string[], known: ReadonlySet<string>): string | null {
    if (keys.length > MAX_ROW_STAFF) return ROW_STAFF_LIMIT_MESSAGE;
    if (new Set(keys).size !== keys.length) return ROW_STAFF_DUPLICATE_MESSAGE;
    return keys.every((key) => known.has(key)) ? null : ROW_STAFF_UNKNOWN_MESSAGE;
}

/**
 * A save's staff problem: the list, then each row in order. Hosted (after Zod)
 * and the static store share it. Only called when the save sends staff: a row
 * without `staff` then has nobody.
 */
export function sessionStaffError(
    staff: ReadonlyArray<{ key: string; name: string }>,
    rows: ReadonlyArray<{ staff?: readonly string[] }>,
): string | null {
    const listError = staffListError(staff);
    if (listError) return listError;
    const known = new Set(staff.map((member) => member.key));
    for (const row of rows) {
        const error = rowStaffError(row.staff ?? [], known);
        if (error) return error;
    }
    return null;
}

/** A row's names from the session's list by key, in the row's order (spec R11). An unknown key or an unnamed person is skipped. */
export function staffNames(
    keys: readonly string[] | undefined,
    staff: ReadonlyArray<{ id: string; name: string }> | undefined,
): string[] {
    if (!keys || keys.length === 0 || !staff || staff.length === 0) return [];
    const byId = new Map(staff.filter(isNamedStaff).map((member) => [member.id, member.name]));
    return keys.flatMap((key) => {
        const name = byId.get(key);
        return name ? [name] : [];
    });
}

/** "run by Coach Lee, Sam", or null when nobody runs the row. */
export function runByText(names: readonly string[]): string | null {
    return names.length > 0 ? `run by ${names.join(", ")}` : null;
}

/** " · run by Coach Lee, Sam" after a row on a timeline, or "". */
export function runBySuffix(names: readonly string[]): string {
    const text = runByText(names);
    return text ? ` · ${text}` : "";
}

/** "Run by Coach Lee, Sam" on a sidebar card, or null. */
export function runByLabel(names: readonly string[]): string | null {
    return names.length > 0 ? `Run by ${names.join(", ")}` : null;
}

/** "Staff: Coach Lee, Sam, Alex" in the bench sheet's header and the import preview, or null. Unnamed people are skipped. */
export function staffHeaderLabel(staff: ReadonlyArray<{ name: string }> | undefined): string | null {
    const named = (staff ?? []).filter(isNamedStaff);
    return named.length > 0 ? `Staff: ${named.map((member) => member.name).join(", ")}` : null;
}

/** The editor's confirm: "Remove Sam? They run 2 rows." */
export function removeStaffPrompt(name: string, rows: number): string {
    return `Remove ${name}? They run ${rows} ${rows === 1 ? "row" : "rows"}.`;
}

type Staffed = { staff?: string[] };

/** How many rows a staff member runs. */
export function assignmentCount(rows: readonly Staffed[], key: string): number {
    return rows.filter((row) => row.staff?.includes(key)).length;
}

/** Every row without this staff member. A row they didn't run keeps its object. */
export function withoutStaffMember<T extends Staffed>(rows: readonly T[], key: string): T[] {
    return rows.map((row) => {
        const keys = row.staff;
        return keys?.includes(key) ? { ...row, staff: keys.filter((other) => other !== key) } : row;
    });
}

/** True when two people's names are the same ignoring case (staffNameKey); unnamed people never clash. */
export function hasStaffNameClash(staff: ReadonlyArray<{ name: string }>): boolean {
    const keys = staff.filter(isNamedStaff).map((member) => staffNameKey(member.name));
    return new Set(keys).size !== keys.length;
}

/**
 * What the editor sends. The named staff, and each row's keys limited to them:
 * a typed person whose name is still empty isn't saved yet, so no row is sent
 * as run by them (an autosave never fails on a name being typed). While two
 * names clash, staff changes pause: no list is sent and no row carries staff
 * (absent = unchanged), so the stored list and every assignment stay as they
 * are while other edits keep saving; the first save after the clash is fixed
 * sends the whole list again.
 */
export function namedStaffPayload<T extends Staffed>(
    staff: readonly SessionStaffMember[],
    rows: readonly T[],
): { staff?: SessionStaffMember[]; rows: T[] } {
    if (hasStaffNameClash(staff)) {
        return {
            rows: rows.map((row) => {
                if (!("staff" in row)) return row;
                const { staff: _omitted, ...rest } = row;
                return rest as T;
            }),
        };
    }
    const named = staff.filter(isNamedStaff);
    if (named.length === staff.length) return { staff: [...staff], rows: [...rows] };
    const kept = new Set(named.map((member) => member.id));
    return {
        staff: named,
        rows: rows.map((row) => {
            const keys = row.staff;
            return keys?.some((key) => !kept.has(key)) ? { ...row, staff: keys.filter((key) => kept.has(key)) } : row;
        }),
    };
}

/** One staff member in a save (spec R3): `key` is the stored id or the editor's key. */
export interface SessionStaffInput {
    key: string;
    name: string;
    teamOfficialId?: string | null;
    userId?: string | null;
}

/** The editor's list as save inputs; a link is sent only when set. */
export function toSessionStaffInputs(staff: readonly SessionStaffMember[]): SessionStaffInput[] {
    return staff.map((member) => ({
        key: member.id,
        name: member.name,
        ...(member.teamOfficialId && { teamOfficialId: member.teamOfficialId }),
        ...(member.userId && { userId: member.userId }),
    }));
}

/** A hosted save's staff key and the id it is stored under (spec R3): createPracticeSession and updatePracticeSession return one per sent person. */
export type SavedStaffId = { key: string; id: string };

/**
 * Applies a save's staff key → id mapping (parity with applySavedPlayIds), so
 * a person added in this sitting keeps one id from their first save on. A
 * member whose id is a sent key takes the stored id, and every row's key
 * follows. A key the editor no longer holds (removed while the save was in
 * flight) is skipped: remove takes a key off the list and every row at once,
 * so the list and the rows can each be swapped on their own and still agree.
 * Returns the input arrays themselves, and each untouched member and row, when
 * nothing changes.
 */
export function applySavedStaffIds<T extends Staffed>(
    staff: SessionStaffMember[],
    rows: T[],
    saved: readonly SavedStaffId[] | undefined,
): { staff: SessionStaffMember[]; rows: T[] } {
    const byKey = new Map((saved ?? []).filter((entry) => entry.key !== entry.id).map((entry) => [entry.key, entry.id]));
    if (byKey.size === 0) return { staff, rows };
    let staffChanged = false;
    const nextStaff = staff.map((member) => {
        const id = byKey.get(member.id);
        if (id === undefined) return member;
        staffChanged = true;
        return { ...member, id };
    });
    let rowsChanged = false;
    const nextRows = rows.map((row) => {
        const keys = row.staff;
        if (!keys?.some((key) => byKey.has(key))) return row;
        rowsChanged = true;
        return { ...row, staff: keys.map((key) => byKey.get(key) ?? key) };
    });
    return { staff: staffChanged ? nextStaff : staff, rows: rowsChanged ? nextRows : rows };
}

/** A stored row's assignment, read before updatePracticeSession deletes the rows. */
export interface StoredRowStaff {
    playId: string | null;
    kind: SessionRowKind;
    sequence: number;
    /** In the row's order */
    staffIds: string[];
}

/** A stored block row (any kind but drill), staffed or not: carryRowStaff compares the layouts. */
export type StoredBlock = { sequence: number; kind: SessionRowKind };

/**
 * Absent staff = unchanged (spec R3) across updatePracticeSession's
 * delete-and-recreate of the rows (row ids don't survive it). The identity:
 * - a drill row: its owned play id (materializeSessionDrills keeps an owned
 *   copy's id, and a session's stored drill rows each have their own copy,
 *   the invariant withStoredTiming rests on);
 * - a block row: its place among the block rows, and only when the save keeps
 *   the stored block layout exactly: the new block rows' kinds, in sequence
 *   order, equal the stored block rows' kinds element by element, with the same
 *   count (drills may come and go around them). Any other layout (a block
 *   reordered, inserted or deleted by an older editor) drops every block's
 *   staff: a place can't tell which of two breaks survived, and staff must never
 *   land on a block they didn't run. Drills carry either way.
 * Returns each new row's staff ids by sequence; rows nobody runs are left out.
 */
export function carryRowStaff(
    stored: readonly StoredRowStaff[],
    storedBlocks: readonly StoredBlock[],
    next: ReadonlyArray<{ kind: SessionRowKind; playId: string | null; sequence: number }>,
): Array<{ sequence: number; staffIds: string[] }> {
    const ordered = [...next].sort((a, b) => a.sequence - b.sequence);
    const oldBlocks = [...storedBlocks].sort((a, b) => a.sequence - b.sequence);
    const newBlocks = ordered.filter((row) => isBlockKind(row.kind));
    const sameBlocks = newBlocks.length === oldBlocks.length && newBlocks.every((row, place) => row.kind === oldBlocks[place].kind);
    const byPlay = new Map<string, string[]>();
    const byBlockSequence = new Map<number, string[]>();
    for (const row of stored) {
        if (isBlockKind(row.kind)) byBlockSequence.set(row.sequence, row.staffIds);
        else if (row.playId && !byPlay.has(row.playId)) byPlay.set(row.playId, row.staffIds);
    }
    let place = 0;
    return ordered.flatMap((row) => {
        const carried = isBlockKind(row.kind)
            ? sameBlocks ? byBlockSequence.get(oldBlocks[place++].sequence) : undefined
            : row.playId ? byPlay.get(row.playId) : undefined;
        return carried && carried.length > 0 ? [{ sequence: row.sequence, staffIds: carried }] : [];
    });
}

/** The practice emails' label for the line below. */
export const YOUR_STATIONS_LABEL = "Your stations";

/** One row a recipient runs: its title and its block's start. */
export interface StationStart {
    title: string;
    startsAt: Date;
}

/**
 * The rows these staff ids run (spec R10), in schedule order. Starts come from
 * buildSchedule, as on the bench sheet: a station of a station block starts with
 * its block, and the gap between blocks is counted. Rows may come in any order:
 * buildSchedule orders them by sequence, so each row needs its stored sequence.
 */
export function yourStations<T extends TimelinePlay & { staff?: readonly string[] }>(
    rows: readonly T[],
    options: { start: Date; transitionMinutes: number; staffIds: ReadonlySet<string>; title: (row: T) => string },
): StationStart[] {
    return buildSchedule(rows, options.start, options.transitionMinutes).flatMap(({ group, startsAt }) =>
        group.stations
            .filter((row) => row.staff?.some((key) => options.staffIds.has(key)))
            .map((row) => ({ title: options.title(row), startsAt })),
    );
}

/** "Breakout (6:10 PM), Water break (6:25 PM)" in `timeZone`, or null when there is nothing to list. */
export function yourStationsText(stations: readonly StationStart[], timeZone: string): string | null {
    if (stations.length === 0) return null;
    return stations.map((station) => `${station.title} (${formatClockTime(station.startsAt, timeZone)})`).join(", ");
}
