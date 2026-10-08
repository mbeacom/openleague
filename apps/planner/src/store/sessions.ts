/**
 * Sessions and their owned drills, mirroring lib/actions/practice-sessions.ts,
 * practice-session-drills.ts and practice-plan-import.ts (ADR-0020, 3a).
 * Every stored session is a valid plan document, so it always exports.
 */
import { z } from "zod";
import type { PlayData, PracticeSessionView, SessionItem, SessionRow } from "@/types/practice-planner";
import { MAX_BLOCK_LABEL_LENGTH, MAX_ROW_STAFF, VALIDATION_CONSTRAINTS } from "@/types/practice-planner";
import { parsePlan, serializePlan, type PlanBlockInput, type PlanDrillInput } from "@/lib/plan-document";
import { createEmptyPlayData, parseStoredPlayData } from "@/lib/utils/play-data";
import { drillTags, toPlayFocus, toPlayGoalies } from "@/lib/utils/drill-tags";
import { toAgeGroups } from "@/lib/utils/age-groups";
import { readTeamProfile, toTeamMark } from "@/lib/utils/team-mark";
import {
    BLOCK_ROW_FIELDS_ERROR,
    BLOCK_STATION_ERROR,
    normalizeGroups,
    sessionRowsError,
    sessionWallMinutes,
    settleInheritedTiming,
    withRotationMinutes,
} from "@/lib/utils/session-timeline";
import {
    BLOCK_HAS_NO_DRILL_MESSAGE,
    BLOCK_LABEL_MESSAGE,
    CONTROL_CHARS,
    DRILL_NEEDS_PLAY_MESSAGE,
    MAX_ROW_INSTRUCTIONS_LENGTH,
    PLAY_DURATION_INT_MESSAGE,
    PLAY_DURATION_MAX_MESSAGE,
    PLAY_DURATION_MIN_MESSAGE,
    ROTATE_MINUTES_MESSAGE,
    ROW_INSTRUCTIONS_MESSAGE,
    ROW_KIND_MESSAGE,
    TRANSITION_MINUTES_MESSAGE,
    isBlockKind,
    isBlockRow,
    toBlockLabel,
    toRotateEveryMinutes,
    toRowKind,
    toTransitionMinutes,
    withStoredTiming,
    type SessionRowInput,
    type StoredTiming,
} from "@/lib/utils/session-rows";
import { SESSION_DRILL_REJECTED_MESSAGE, duplicateSessionTitle, type SavedDrillId } from "@/lib/utils/session-drill-ids";
import {
    ROW_STAFF_LIMIT_MESSAGE,
    STAFF_ADMIN_MESSAGE,
    STAFF_KEY_MAX,
    STAFF_KEY_MESSAGE,
    STAFF_OFFICIAL_ID_FORMAT_MESSAGE,
    STAFF_OFFICIAL_MESSAGE,
    STAFF_ONE_LINK_MESSAGE,
    STAFF_USER_ID_FORMAT_MESSAGE,
    cleanStaffName,
    sessionStaffError,
    staffNameKey,
    staffNames,
    type SessionStaffInput,
} from "@/lib/utils/session-staff";
import { cleanPracticeEquipment, practiceEquipmentError, readPracticeEquipment } from "@/lib/utils/equipment-needs";
import type { EquipmentCountItem } from "@/types/practice-planner";
import { LOCAL_AUTHOR_NAME, LOCAL_TEAM_ID } from "../config";
import { META_TEAM_PROFILE } from "./records";
import type { RepoTx, StoredPlay, StoredSession, StoredSessionRow, StoredStaffMember } from "./records";
import { StoreRefusal, attempt, checkedAgeGroups, checkedGoalieCount, drillText, ok, thumbnailOrNull, writablePlayData, write, type StoreContext } from "./shared";
import type { LocalPlannerStore, LocalSessionDrill, LocalSessionSave } from "./types";

export const SESSION_NOT_ON_DEVICE_MESSAGE = "This practice isn't on this device.";
const SESSION_NOT_FOUND = "Practice session not found";

export type SessionOps = Pick<
    LocalPlannerStore,
    | "listSessions"
    | "getSessionView"
    | "getSessionForEdit"
    | "createSession"
    | "updateSession"
    | "saveSessionDrill"
    | "copySessionDrillToLibrary"
    | "duplicatePracticeSession"
    | "deletePracticeSession"
    | "importPlan"
>;

function validDate(date: Date): Date {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new StoreRefusal("Valid date is required");
    return date;
}

/** A save row with its timing resolved: sent, else stored (update), else the default. A block row never runs with the previous one. */
type ResolvedRow = SessionRowInput & { runsWithPrevious: boolean; stays: boolean; rotateEveryMinutes: number | null };

/** Checks the payload's shape before the transaction starts. */
function checkRows(plays: LocalSessionDrill[]): void {
    if (new Set(plays.map((p) => p.clientKey)).size !== plays.length) throw new StoreRefusal("Each drill needs a unique key");
    const sequences = plays.map((p) => p.sequence).sort((a, b) => a - b);
    if (sequences.some((sequence, index) => sequence !== index)) {
        throw new StoreRefusal("Drill sequences must run 0, 1, 2… with no gaps or repeats");
    }
    // Hosted's row schema, rule for rule and in its words (practiceSessionPlayInputSchema):
    // the fields first, then the drill / block rules. Checked on the rows as sent, before
    // resolveRows fills or settles anything, so a value a block row must not carry is refused.
    for (const row of plays) {
        const sent: Partial<Record<"kind" | "playId" | "runsWithPrevious" | "stays" | "rotateEveryMinutes", unknown>> = row;
        if (sent.kind !== undefined && toRowKind(sent.kind) !== sent.kind) throw new StoreRefusal(ROW_KIND_MESSAGE);
        if (!Number.isInteger(row.duration)) throw new StoreRefusal(PLAY_DURATION_INT_MESSAGE);
        if (row.duration < 1) throw new StoreRefusal(PLAY_DURATION_MIN_MESSAGE);
        if (row.duration > VALIDATION_CONSTRAINTS.MAX_DURATION) throw new StoreRefusal(PLAY_DURATION_MAX_MESSAGE);
        if ((row.instructions ?? "").trim().length > MAX_ROW_INSTRUCTIONS_LENGTH) throw new StoreRefusal(ROW_INSTRUCTIONS_MESSAGE);
        if (isBlockRow(row)) {
            if ((row.label ?? "").replace(CONTROL_CHARS, "").trim().length > MAX_BLOCK_LABEL_LENGTH) throw new StoreRefusal(BLOCK_LABEL_MESSAGE);
            if (sent.rotateEveryMinutes != null && toRotateEveryMinutes(sent.rotateEveryMinutes) === null) throw new StoreRefusal(ROTATE_MINUTES_MESSAGE);
            // A payload built outside the editor may still carry drill fields on a block row.
            if (sent.playId != null) throw new StoreRefusal(BLOCK_HAS_NO_DRILL_MESSAGE);
            if (sent.runsWithPrevious === true) throw new StoreRefusal(BLOCK_STATION_ERROR);
            if (sent.stays === true || sent.rotateEveryMinutes != null) throw new StoreRefusal(BLOCK_ROW_FIELDS_ERROR);
        } else {
            if (row.rotateEveryMinutes != null && toRotateEveryMinutes(row.rotateEveryMinutes) === null) {
                throw new StoreRefusal(ROTATE_MINUTES_MESSAGE);
            }
            if (!row.playId) throw new StoreRefusal(DRILL_NEEDS_PLAY_MESSAGE);
        }
    }
}

/**
 * As updatePracticeSession: each drill's timing is the one sent, else the stored
 * row's (absent = unchanged), and inherited timing that no longer fits gives way.
 */
function resolveRows(plays: LocalSessionDrill[], stored: StoredTiming[]): ResolvedRow[] {
    const resolved = withStoredTiming(plays, stored).map((row) => ({ ...row, runsWithPrevious: isBlockRow(row) ? false : row.runsWithPrevious }));
    return settleInheritedTiming(resolved, plays);
}

/**
 * Hosted's rules on the resolved rows (updatePracticeSession): station, block and rotation rules, then the wall time
 * with the gap. Returns the rows to store, as hosted writes them: a rotating station lasts M (spec R3).
 */
function checkTimeline(rows: ResolvedRow[], duration: number, transitionMinutes: number): ResolvedRow[] {
    const ruleError = sessionRowsError(rows);
    if (ruleError) throw new StoreRefusal(ruleError);
    const wall = sessionWallMinutes(rows, transitionMinutes);
    if (wall > duration) throw new StoreRefusal(`Practice timeline (${wall} min) exceeds session duration (${duration} min)`);
    return withRotationMinutes(rows);
}

/** Hosted's rule: 0–5 whole minutes; undefined passes through, meaning unchanged. */
function checkedTransition(value: number | undefined): number | undefined {
    if (value === undefined) return undefined;
    if (toTransitionMinutes(value) !== value) throw new StoreRefusal(TRANSITION_MINUTES_MESSAGE);
    return value;
}

/** Hosted's id format for a link (its Zod cuid check). */
const linkIdSchema = z.string().cuid();
const isLinkId = (value: unknown): boolean => linkIdSchema.safeParse(value).success;

/**
 * Hosted's staff rules in its words (the row and staff schemas, then
 * sessionStaffError, then the link check), on the payload as sent. This
 * planner keeps typed names only, so a link is refused as hosted refuses one it
 * can't verify. Returns the list to store, or undefined when the save sends
 * none (absent = unchanged).
 */
function checkStaff(input: LocalSessionSave): StoredStaffMember[] | undefined {
    for (const row of input.plays) {
        if (row.staff && row.staff.length > MAX_ROW_STAFF) throw new StoreRefusal(ROW_STAFF_LIMIT_MESSAGE);
        if (row.staff?.some((key) => key.length < 1 || key.length > STAFF_KEY_MAX)) throw new StoreRefusal(STAFF_KEY_MESSAGE);
    }
    if (input.staff === undefined) return undefined;
    // Any link that isn't null or absent counts, "" included. A malformed id gets hosted's
    // format message (its cuid check); a well-formed one can't be verified here (no team).
    const official = (member: SessionStaffInput) => member.teamOfficialId != null;
    const admin = (member: SessionStaffInput) => member.userId != null;
    for (const member of input.staff) {
        if (official(member) && !isLinkId(member.teamOfficialId)) throw new StoreRefusal(STAFF_OFFICIAL_ID_FORMAT_MESSAGE);
        if (admin(member) && !isLinkId(member.userId)) throw new StoreRefusal(STAFF_USER_ID_FORMAT_MESSAGE);
    }
    if (input.staff.some((member) => official(member) && admin(member))) throw new StoreRefusal(STAFF_ONE_LINK_MESSAGE);
    const error = sessionStaffError(input.staff, input.plays);
    if (error) throw new StoreRefusal(error);
    if (input.staff.some(official)) throw new StoreRefusal(STAFF_OFFICIAL_MESSAGE);
    if (input.staff.some(admin)) throw new StoreRefusal(STAFF_ADMIN_MESSAGE);
    return input.staff.map((member) => ({ id: member.key, name: cleanStaffName(member.name) }));
}

/**
 * Hosted's equipment rules (practice equipment spec R3, R7) in its words, on
 * the payload as sent. Returns the list to store, or undefined when the save
 * sends none (absent = unchanged).
 */
function checkEquipment(input: LocalSessionSave): EquipmentCountItem[] | undefined {
    if (input.equipment === undefined) return undefined;
    const error = practiceEquipmentError(input.equipment);
    if (error) throw new StoreRefusal(error);
    return cleanPracticeEquipment(input.equipment);
}

/**
 * Each row's staff to store (spec R3, R7). A sent list: the row's keys as sent,
 * nobody when it sends none. Absent: the stored row with the same id keeps its
 * staff. A row's id is the editor's clientKey and survives every save, so this
 * follows a row however it moved.
 */
function withRowStaff(rows: StoredSessionRow[], plays: LocalSessionDrill[], sent: StoredStaffMember[] | undefined, existing?: StoredSession): StoredSessionRow[] {
    if (sent) {
        const byKey = new Map(plays.map((row) => [row.clientKey, row.staff]));
        return rows.map((row) => ({ ...row, staff: [...(byKey.get(row.id) ?? [])] }));
    }
    // Legacy records read with defaults: a session or row stored before practice staff has none.
    const listed = new Set((existing?.staff ?? []).map((member) => member.id));
    const stored = new Map((existing?.rows ?? []).map((row) => [row.id, row.staff ?? []]));
    return rows.map((row) => ({ ...row, staff: (stored.get(row.id) ?? []).filter((key) => listed.has(key)) }));
}

/** A stored session's drill timing, for withStoredTiming (absent = unchanged). */
function storedTiming(session: StoredSession): StoredTiming[] {
    return session.rows.map((row) => ({ playId: row.playId, stays: row.stays ?? false, rotateEveryMinutes: row.rotateEveryMinutes ?? null }));
}

/** Synchronous, so it can run inside a transaction: the session must be a valid plan document. */
function assertExportable(
    meta: { title: string; duration: number; goaliesAttending?: number | null; transitionMinutes?: number; staff?: StoredStaffMember[]; equipment?: EquipmentCountItem[] },
    rows: StoredSessionRow[],
    plays: Map<string, StoredPlay>,
    at: Date,
): void {
    const doc = serializePlan(
        {
            title: meta.title,
            durationMinutes: meta.duration,
            date: null,
            startTime: null,
            goaliesAttending: meta.goaliesAttending ?? null,
            transitionMinutes: meta.transitionMinutes ?? 0,
            staff: meta.staff?.map((member) => member.name),
            equipment: meta.equipment,
            drills: rows.map((row): PlanDrillInput | PlanBlockInput => {
                const kind = toRowKind(row.kind);
                if (isBlockKind(kind)) {
                    return {
                        kind,
                        sequence: row.sequence,
                        duration: row.duration,
                        runsWithPrevious: false,
                        instructions: row.instructions,
                        label: row.label ?? null,
                        staff: staffNames(row.staff, meta.staff),
                    };
                }
                const play = row.playId ? plays.get(row.playId) : undefined;
                const parsed = parseStoredPlayData(play?.playData);
                return {
                    sequence: row.sequence,
                    duration: row.duration,
                    runsWithPrevious: row.runsWithPrevious,
                    instructions: row.instructions,
                    name: play?.name ?? "",
                    description: play?.description ?? null,
                    ...drillTags(play),
                    ageGroups: toAgeGroups(play?.ageGroups),
                    stays: row.stays ?? false,
                    rotateEveryMinutes: row.rotateEveryMinutes ?? null,
                    staff: staffNames(row.staff, meta.staff),
                    playData: parsed.ok ? parsed.data : null,
                };
            }),
        },
        "openleague-static",
        at,
    );
    const result = parsePlan(doc);
    if (!result.ok) throw new StoreRefusal(result.error.issues?.[0] ?? result.error.message, result.error.issues);
}

function cloneInto(source: StoredPlay, sessionId: string, id: string, at: Date): StoredPlay {
    return {
        ...source,
        id,
        isTemplate: false,
        sessionId,
        sourcePlayId: source.sourcePlayId ?? source.id,
        createdAt: at,
        updatedAt: at,
    };
}

/** Keep an owned copy (once), clone a library play or a repeated copy, reject anything else. */
async function materialize(tx: RepoTx, ctx: StoreContext, sessionId: string, items: ResolvedRow[], at: Date) {
    const kept = new Set<string>();
    const plays = new Map<string, StoredPlay>();
    const rows: StoredSessionRow[] = [];
    const mapping: SavedDrillId[] = [];
    for (const item of items) {
        if (isBlockRow(item)) {
            rows.push({
                id: item.clientKey,
                playId: null,
                kind: item.kind,
                label: toBlockLabel(item.label),
                sequence: item.sequence,
                duration: item.duration,
                instructions: item.instructions,
                runsWithPrevious: false,
                stays: false,
                rotateEveryMinutes: null,
            });
            continue;
        }
        const play = await tx.getPlay(item.playId);
        if (!play) throw new StoreRefusal(SESSION_DRILL_REJECTED_MESSAGE);
        let owned: StoredPlay;
        if (play.sessionId === sessionId && !kept.has(play.id)) {
            owned = play;
        } else if (play.sessionId === sessionId || (play.sessionId === null && play.isTemplate)) {
            owned = cloneInto(play, sessionId, ctx.newId(), at);
            await tx.putPlay(owned);
        } else {
            throw new StoreRefusal(SESSION_DRILL_REJECTED_MESSAGE);
        }
        kept.add(owned.id);
        plays.set(owned.id, owned);
        rows.push({
            id: item.clientKey,
            playId: owned.id,
            kind: "drill",
            label: null,
            sequence: item.sequence,
            duration: item.duration,
            instructions: item.instructions,
            runsWithPrevious: item.runsWithPrevious,
            stays: item.stays,
            rotateEveryMinutes: item.rotateEveryMinutes,
        });
        mapping.push({ clientKey: item.clientKey, playId: owned.id });
    }
    rows.sort((a, b) => a.sequence - b.sequence);
    return { rows, plays, mapping };
}

function sessionMeta(input: LocalSessionSave): { title: string; date: Date; duration: number } {
    return { title: input.title.replace(CONTROL_CHARS, "").trim(), date: validDate(input.date), duration: input.duration };
}

async function readSession(ctx: StoreContext, id: string): Promise<{ session: StoredSession; plays: Map<string, StoredPlay> } | null> {
    return ctx.repo.read(async (tx) => {
        const session = await tx.getSession(id);
        if (!session) return null;
        const owned = await tx.sessionPlays(id);
        return { session, plays: new Map(owned.map((p) => [p.id, p])) };
    });
}

function sortedRows(session: StoredSession): StoredSessionRow[] {
    return [...session.rows].sort((a, b) => a.sequence - b.sequence);
}

export function createSessionOps(ctx: StoreContext): SessionOps {
    return {
        listSessions: () =>
            attempt("Failed to load practices. Please try again.", async () => {
                const sessions = await ctx.repo.read((tx) => tx.allSessions());
                return ok(
                    sessions
                        .map((s) => ({ id: s.id, title: s.title, date: s.date, duration: s.duration, drillCount: s.rows.filter((row) => !isBlockKind(row.kind)).length, updatedAt: s.updatedAt }))
                        .sort((a, b) => b.date.getTime() - a.date.getTime() || b.updatedAt.getTime() - a.updatedAt.getTime()),
                );
            }),

        getSessionView: (id) =>
            attempt("Failed to load the practice. Please try again.", async () => {
                const found = await readSession(ctx, id);
                if (!found) return { success: false, error: SESSION_NOT_ON_DEVICE_MESSAGE };
                const { session, plays } = found;
                // The device's "Your team" (spec R4); none: no team name and no mark, as before.
                const profile = readTeamProfile(await ctx.repo.read((tx) => tx.getMeta(META_TEAM_PROFILE)));
                const view: PracticeSessionView = {
                    id: session.id,
                    title: session.title,
                    date: session.date.toISOString(),
                    duration: session.duration,
                    isShared: false,
                    createdByName: LOCAL_AUTHOR_NAME,
                    teamId: LOCAL_TEAM_ID,
                    teamName: profile?.name ?? "",
                    teamMark: profile ? toTeamMark(profile, LOCAL_TEAM_ID) : null,
                    venueId: null,
                    venueName: null,
                    venueTimezone: null,
                    surfaceId: null,
                    surfaceName: null,
                    segmentId: null,
                    segmentName: null,
                    segmentKind: null,
                    startAt: null,
                    goaliesAttending: session.goaliesAttending ?? null,
                    transitionMinutes: session.transitionMinutes ?? 0,
                    // Legacy sessions read as no staff (spec R7).
                    staff: (session.staff ?? []).map((member) => ({ id: member.id, name: member.name })),
                    // Legacy sessions read as none (practice equipment spec R7).
                    equipment: readPracticeEquipment(session.equipment ?? []),
                    plays: sortedRows(session).flatMap((row): SessionRow[] => {
                        const kind = toRowKind(row.kind);
                        if (isBlockKind(kind)) {
                            return [{ id: row.id, kind, label: row.label ?? null, sequence: row.sequence, duration: row.duration, instructions: row.instructions || null, runsWithPrevious: false, staff: row.staff ?? [] }];
                        }
                        const play = row.playId ? plays.get(row.playId) : undefined;
                        if (!play) return [];
                        const parsed = parseStoredPlayData(play.playData);
                        if (!parsed.ok) console.error(`Unreadable playData (play ${play.id}):`, parsed.error);
                        return [
                            {
                                id: row.id,
                                sequence: row.sequence,
                                duration: row.duration,
                                instructions: row.instructions || null,
                                runsWithPrevious: row.runsWithPrevious,
                                // Legacy rows read as not rotating (spec R7).
                                stays: row.stays ?? false,
                                rotateEveryMinutes: row.rotateEveryMinutes ?? null,
                                staff: row.staff ?? [],
                                play: {
                                    id: play.id,
                                    name: play.name,
                                    description: play.description,
                                    thumbnail: play.thumbnail,
                                    ...drillTags(play),
                                    ageGroups: toAgeGroups(play.ageGroups),
                                    playData: parsed.ok ? parsed.data : null,
                                },
                            },
                        ];
                    }),
                };
                return ok(view);
            }),

        getSessionForEdit: (id) =>
            attempt("Failed to load the practice. Please try again.", async () => {
                const found = await readSession(ctx, id);
                if (!found) return { success: false, error: SESSION_NOT_ON_DEVICE_MESSAGE };
                const { session, plays } = found;
                const editorPlays: SessionItem[] = sortedRows(session).flatMap((row): SessionItem[] => {
                    const kind = toRowKind(row.kind);
                    if (isBlockKind(kind)) {
                        return [{ id: row.id, kind, label: row.label ?? "", sequence: row.sequence, duration: row.duration, instructions: row.instructions, runsWithPrevious: false, staff: row.staff ?? [] }];
                    }
                    const play = row.playId ? plays.get(row.playId) : undefined;
                    if (!play) return [];
                    const parsed = parseStoredPlayData(play.playData);
                    if (!parsed.ok) console.error(`Unreadable playData (play ${play.id}):`, parsed.error);
                    return [
                        {
                            id: row.id,
                            playId: play.id,
                            name: play.name,
                            description: play.description ?? "",
                            sequence: row.sequence,
                            runsWithPrevious: row.runsWithPrevious,
                            duration: row.duration,
                            instructions: row.instructions,
                            // Legacy rows read as not rotating (spec R7).
                            stays: row.stays ?? false,
                            rotateEveryMinutes: row.rotateEveryMinutes ?? null,
                            staff: row.staff ?? [],
                            ...drillTags(play),
                            ageGroups: toAgeGroups(play.ageGroups),
                            ...(parsed.ok ? { playData: parsed.data } : { playData: createEmptyPlayData(), playDataUnreadable: true }),
                            thumbnail: play.thumbnail ?? "",
                        },
                    ];
                });
                return ok({
                    sessionId: session.id,
                    initialData: {
                        id: session.id,
                        title: session.title,
                        date: session.date,
                        duration: session.duration,
                        isShared: false,
                        goaliesAttending: session.goaliesAttending ?? null,
                        transitionMinutes: session.transitionMinutes ?? 0,
                        staff: (session.staff ?? []).map((member) => ({ id: member.id, name: member.name })),
                        equipment: readPracticeEquipment(session.equipment ?? []),
                        plays: normalizeGroups(editorPlays),
                    },
                });
            }),

        createSession: (input) =>
            attempt("Failed to create practice session. Please try again.", async () => {
                const meta = sessionMeta(input);
                checkRows(input.plays);
                const staff = checkStaff(input);
                // A create without equipment stores none.
                const equipment = checkEquipment(input) ?? [];
                const goaliesAttending = checkedGoalieCount(input.goaliesAttending) ?? null;
                const transitionMinutes = checkedTransition(input.transitionMinutes) ?? 0;
                // A create has nothing stored: absent timing takes the defaults.
                const resolved = checkTimeline(resolveRows(input.plays, []), meta.duration, transitionMinutes);
                const saved = await write(ctx, async (tx) => {
                    const at = ctx.now();
                    const id = ctx.newId();
                    const { rows: materialized, plays, mapping } = await materialize(tx, ctx, id, resolved, at);
                    const rows = withRowStaff(materialized, input.plays, staff);
                    // A create without staff stores none.
                    const sessionStaff = staff ?? [];
                    assertExportable({ ...meta, goaliesAttending, transitionMinutes, staff: sessionStaff, equipment }, rows, plays, at);
                    await tx.putSession({ id, ...meta, goaliesAttending, transitionMinutes, staff: sessionStaff, equipment, rows, createdAt: at, updatedAt: at });
                    return { id, plays: mapping };
                });
                return ok(saved);
            }),

        updateSession: (id, input) =>
            attempt("Failed to update practice session. Please try again.", async () => {
                const meta = sessionMeta(input);
                checkRows(input.plays);
                const staff = checkStaff(input);
                const sentEquipment = checkEquipment(input);
                const count = checkedGoalieCount(input.goaliesAttending);
                const sentGap = checkedTransition(input.transitionMinutes);
                const saved = await write(ctx, async (tx) => {
                    const existing = await tx.getSession(id);
                    if (!existing) throw new StoreRefusal(SESSION_NOT_FOUND);
                    // Absent = unchanged: an editor opened before a field existed autosaves without it.
                    const goaliesAttending = count === undefined ? (existing.goaliesAttending ?? null) : count;
                    const transitionMinutes = sentGap ?? existing.transitionMinutes ?? 0;
                    const resolved = checkTimeline(resolveRows(input.plays, storedTiming(existing)), meta.duration, transitionMinutes);
                    const at = ctx.now();
                    const { rows: materialized, plays, mapping } = await materialize(tx, ctx, id, resolved, at);
                    const rows = withRowStaff(materialized, input.plays, staff, existing);
                    // Absent = unchanged: the stored list stays (a legacy session has none).
                    const sessionStaff = staff ?? existing.staff ?? [];
                    // Absent = unchanged (practice equipment spec R3); a legacy session has none.
                    const equipment = sentEquipment ?? existing.equipment ?? [];
                    assertExportable({ ...meta, goaliesAttending, transitionMinutes, staff: sessionStaff, equipment }, rows, plays, at);
                    await tx.putSession({ ...existing, ...meta, goaliesAttending, transitionMinutes, staff: sessionStaff, equipment, rows, updatedAt: at });
                    // Drop-only cleanup: copies this session referenced before and no longer does.
                    // A copy the drill dialog made but the editor hasn't sent is never touched here.
                    const referenced = new Set(rows.flatMap((row) => (row.playId ? [row.playId] : [])));
                    for (const playId of new Set(existing.rows.flatMap((row) => (row.playId ? [row.playId] : [])))) {
                        if (referenced.has(playId)) continue;
                        const play = await tx.getPlay(playId);
                        if (play?.sessionId === id) await tx.deletePlay(playId);
                    }
                    return { id, plays: mapping };
                });
                return ok(saved);
            }),

        saveSessionDrill: (input) =>
            attempt("Failed to save drill. Please try again.", async () => {
                const text = drillText(input.name, input.description);
                const playData = writablePlayData(input.playData);
                const thumbnail = thumbnailOrNull(input.thumbnail);
                // Absent = unchanged (owned), inherited (fork) or none (new drill). Checked here: nothing
                // but repo calls may run inside the transaction.
                const sentAgeGroups = input.ageGroups === undefined ? undefined : checkedAgeGroups(input.ageGroups);
                const playId = await write(ctx, async (tx) => {
                    const session = await tx.getSession(input.sessionId);
                    if (!session) throw new StoreRefusal(SESSION_NOT_FOUND);
                    const at = ctx.now();
                    const fields = { ...text, thumbnail, playData, updatedAt: at };
                    // Absent = unchanged: only tags the caller sends replace the stored ones.
                    const sent = {
                        ...(input.focus !== undefined && { focus: toPlayFocus(input.focus) }),
                        ...(input.goalies !== undefined && { goalies: toPlayGoalies(input.goalies) }),
                        ...(sentAgeGroups !== undefined && { ageGroups: sentAgeGroups }),
                    };
                    if (!input.playId) {
                        const created: StoredPlay = { id: ctx.newId(), ...fields, ...drillTags(sent), ageGroups: sentAgeGroups ?? [], isTemplate: false, sessionId: session.id, sourcePlayId: null, createdAt: at };
                        await tx.putPlay(created);
                        return created.id;
                    }
                    const play = await tx.getPlay(input.playId);
                    if (!play) throw new StoreRefusal(SESSION_DRILL_REJECTED_MESSAGE);
                    if (play.sessionId === session.id) {
                        await tx.putPlay({ ...play, ...fields, ...sent });
                        return play.id;
                    }
                    if (play.sessionId !== null || !play.isTemplate) throw new StoreRefusal(SESSION_DRILL_REJECTED_MESSAGE);
                    const forked: StoredPlay = {
                        id: ctx.newId(),
                        ...fields,
                        // A fork inherits the library drill's tags and ages unless new ones were sent.
                        ...drillTags({ ...drillTags(play), ...sent }),
                        ageGroups: sentAgeGroups ?? toAgeGroups(play.ageGroups),
                        isTemplate: false,
                        sessionId: session.id,
                        sourcePlayId: play.sourcePlayId ?? play.id,
                        createdAt: at,
                    };
                    await tx.putPlay(forked);
                    return forked.id;
                });
                return ok({ playId });
            }),

        copySessionDrillToLibrary: (input) =>
            attempt("Failed to add drill to the library. Please try again.", async () => {
                const playId = await write(ctx, async (tx) => {
                    const play = await tx.getPlay(input.playId);
                    if (!play || play.sessionId === null) throw new StoreRefusal("Drill not found in this session");
                    const at = ctx.now();
                    const copy: StoredPlay = { ...play, id: ctx.newId(), isTemplate: true, sessionId: null, sourcePlayId: null, createdAt: at, updatedAt: at };
                    await tx.putPlay(copy);
                    return copy.id;
                });
                return ok({ playId });
            }),

        duplicatePracticeSession: (input) =>
            attempt("Failed to duplicate practice session. Please try again.", async () => {
                const date = validDate(input.date);
                const id = await write(ctx, async (tx) => {
                    const source = await tx.getSession(input.id);
                    if (!source) throw new StoreRefusal(SESSION_NOT_FOUND);
                    const at = ctx.now();
                    const newId = ctx.newId();
                    const plays = new Map<string, StoredPlay>();
                    const rows: StoredSessionRow[] = [];
                    // Staff (spec R5): new ids, each row's staff moved onto them.
                    const staffIds = new Map((source.staff ?? []).map((member) => [member.id, ctx.newId()]));
                    const staff = (source.staff ?? []).map((member) => ({ id: staffIds.get(member.id) as string, name: member.name }));
                    const copiedStaff = (row: StoredSessionRow) =>
                        (row.staff ?? []).flatMap((key) => {
                            const copied = staffIds.get(key);
                            return copied ? [copied] : [];
                        });
                    for (const row of sortedRows(source)) {
                        if (!row.playId) {
                            // A block row has no drill to clone.
                            rows.push({ ...row, id: ctx.newId(), staff: copiedStaff(row) });
                            continue;
                        }
                        const play = await tx.getPlay(row.playId);
                        if (!play) throw new StoreRefusal(SESSION_DRILL_REJECTED_MESSAGE);
                        const copy = cloneInto(play, newId, ctx.newId(), at);
                        await tx.putPlay(copy);
                        plays.set(copy.id, copy);
                        rows.push({ ...row, id: ctx.newId(), playId: copy.id, staff: copiedStaff(row) });
                    }
                    const meta = {
                        title: duplicateSessionTitle(source.title),
                        date,
                        duration: source.duration,
                        goaliesAttending: source.goaliesAttending ?? null,
                        transitionMinutes: source.transitionMinutes ?? 0,
                        staff,
                        equipment: [...(source.equipment ?? [])],
                    };
                    assertExportable(meta, rows, plays, at);
                    await tx.putSession({ id: newId, ...meta, rows, createdAt: at, updatedAt: at });
                    return newId;
                });
                return ok({ id });
            }),

        deletePracticeSession: (input) =>
            attempt("Failed to delete practice session. Please try again.", async () => {
                await write(ctx, async (tx) => {
                    const session = await tx.getSession(input.id);
                    if (!session) throw new StoreRefusal(SESSION_NOT_FOUND);
                    for (const play of await tx.sessionPlays(input.id)) await tx.deletePlay(play.id);
                    await tx.deleteSession(input.id);
                });
                return ok({ id: input.id });
            }),

        importPlan: (plan, options) =>
            attempt("Failed to import the plan. Please try again.", async () => {
                // Parse again: the caller's object may not have come through parsePlan.
                const parsed = parsePlan(plan);
                if (!parsed.ok) throw new StoreRefusal(parsed.error.message, parsed.error.issues);
                const date = validDate(options.date);
                // Diagrams are cleaned and drawn before the transaction (IndexedDB can't wait on other work), keyed by row.
                const prepared = new Map<number, { playData: PlayData; thumbnail: string | null }>();
                // Stored thumbnails wait for the diagram font, once, so they never bake in the fallback.
                if (parsed.plan.session.drills.some((entry) => entry.kind === "drill")) await ctx.beforeStoredDraw();
                for (const entry of parsed.plan.session.drills) {
                    if (entry.kind !== "drill") continue;
                    const playData = writablePlayData(entry.drill.playData);
                    prepared.set(entry.sequence, { playData, thumbnail: ctx.makeThumbnail(playData) });
                }
                const sessionId = await write(ctx, async (tx) => {
                    const at = ctx.now();
                    const id = ctx.newId();
                    // Staff (spec R5, R6): typed names; parsePlan checked every row's names are on the list.
                    const staff = parsed.plan.session.staff.map((name) => ({ id: ctx.newId(), name }));
                    const staffByName = new Map(staff.map((member) => [staffNameKey(member.name), member.id]));
                    const rowStaff = (names: string[]) =>
                        names.flatMap((name) => {
                            const key = staffByName.get(staffNameKey(name));
                            return key === undefined ? [] : [key];
                        });
                    const rows: StoredSessionRow[] = [];
                    for (const entry of parsed.plan.session.drills) {
                        if (entry.kind !== "drill") {
                            rows.push({
                                id: ctx.newId(), playId: null, kind: entry.kind, label: entry.label, sequence: entry.sequence,
                                duration: entry.durationMinutes, instructions: entry.instructions, runsWithPrevious: false, stays: false, rotateEveryMinutes: null,
                                staff: rowStaff(entry.staff),
                            });
                            continue;
                        }
                        const ready = prepared.get(entry.sequence);
                        if (!ready) throw new Error(`No prepared diagram for row ${entry.sequence}`);
                        const base = {
                            name: entry.drill.name,
                            description: entry.drill.description || null,
                            thumbnail: ready.thumbnail,
                            playData: ready.playData,
                            focus: entry.drill.focus,
                            goalies: entry.drill.goalies,
                            ageGroups: entry.drill.ageGroups,
                            sourcePlayId: null,
                            createdAt: at,
                            updatedAt: at,
                        };
                        const owned: StoredPlay = { id: ctx.newId(), ...base, isTemplate: false, sessionId: id };
                        await tx.putPlay(owned);
                        rows.push({
                            id: ctx.newId(), playId: owned.id, kind: "drill", label: null, sequence: entry.sequence, duration: entry.durationMinutes,
                            instructions: entry.instructions, runsWithPrevious: entry.runsWithPrevious, stays: entry.stays, rotateEveryMinutes: entry.rotateEveryMinutes,
                            staff: rowStaff(entry.staff),
                        });
                        if (options.addToLibrary) {
                            await tx.putPlay({ id: ctx.newId(), ...base, isTemplate: true, sessionId: null });
                        }
                    }
                    await tx.putSession({
                        id,
                        title: parsed.plan.session.title,
                        date,
                        duration: parsed.plan.session.durationMinutes,
                        goaliesAttending: parsed.plan.session.goaliesAttending,
                        transitionMinutes: parsed.plan.session.transitionMinutes,
                        staff,
                        equipment: parsed.plan.session.equipment,
                        rows,
                        createdAt: at,
                        updatedAt: at,
                    });
                    return id;
                });
                return ok({ sessionId });
            }),
    };
}
