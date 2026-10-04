/**
 * Sessions and their owned drills, mirroring lib/actions/practice-sessions.ts,
 * practice-session-drills.ts and practice-plan-import.ts (ADR-0020, 3a).
 * Every stored session is a valid plan document, so it always exports.
 */
import type { PracticeSessionView, SessionItem, SessionRow } from "@/types/practice-planner";
import { MAX_BLOCK_LABEL_LENGTH } from "@/types/practice-planner";
import { parsePlan, serializePlan } from "@/lib/plan-document";
import { createEmptyPlayData, parseStoredPlayData } from "@/lib/utils/play-data";
import { drillTags, toPlayFocus, toPlayGoalies } from "@/lib/utils/drill-tags";
import { normalizeGroups, sessionRowsError, sessionWallMinutes, settleInheritedTiming } from "@/lib/utils/session-timeline";
import {
    BLOCK_HAS_NO_DRILL_MESSAGE,
    BLOCK_LABEL_MESSAGE,
    CONTROL_CHARS,
    DRILL_NEEDS_PLAY_MESSAGE,
    ROTATE_MINUTES_MESSAGE,
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
import { LOCAL_AUTHOR_NAME, LOCAL_TEAM_ID, LOCAL_TEAM_NAME } from "../config";
import type { RepoTx, StoredPlay, StoredSession, StoredSessionRow } from "./records";
import { StoreRefusal, attempt, checkedGoalieCount, drillText, ok, thumbnailOrNull, writablePlayData, write, type StoreContext } from "./shared";
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
    // Hosted's row schema, rule for rule and in its words (practiceSessionPlayInputSchema).
    for (const row of plays) {
        if (isBlockRow(row)) {
            // A payload built outside the editor may still name a play on a block row.
            if ("playId" in row && row.playId != null) throw new StoreRefusal(BLOCK_HAS_NO_DRILL_MESSAGE);
            if ((row.label ?? "").replace(CONTROL_CHARS, "").trim().length > MAX_BLOCK_LABEL_LENGTH) throw new StoreRefusal(BLOCK_LABEL_MESSAGE);
        } else {
            if (!row.playId) throw new StoreRefusal(DRILL_NEEDS_PLAY_MESSAGE);
            if (row.rotateEveryMinutes != null && toRotateEveryMinutes(row.rotateEveryMinutes) === null) {
                throw new StoreRefusal(ROTATE_MINUTES_MESSAGE);
            }
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

/** Hosted's rules on the resolved rows (updatePracticeSession): station, block and rotation rules, then the wall time with the gap. */
function checkTimeline(rows: ResolvedRow[], duration: number, transitionMinutes: number): void {
    const ruleError = sessionRowsError(rows);
    if (ruleError) throw new StoreRefusal(ruleError);
    const wall = sessionWallMinutes(rows, transitionMinutes);
    if (wall > duration) throw new StoreRefusal(`Practice timeline (${wall} min) exceeds session duration (${duration} min)`);
}

/** Hosted's rule: 0–5 whole minutes; undefined passes through, meaning unchanged. */
function checkedTransition(value: number | undefined): number | undefined {
    if (value === undefined) return undefined;
    if (toTransitionMinutes(value) !== value) throw new StoreRefusal(TRANSITION_MINUTES_MESSAGE);
    return value;
}

/** A stored session's drill timing, for withStoredTiming (absent = unchanged). */
function storedTiming(session: StoredSession): StoredTiming[] {
    return session.rows.map((row) => ({ playId: row.playId, stays: row.stays ?? false, rotateEveryMinutes: row.rotateEveryMinutes ?? null }));
}

/** Synchronous, so it can run inside a transaction: the session must be a valid plan document. */
function assertExportable(
    meta: { title: string; duration: number; goaliesAttending?: number | null; transitionMinutes?: number },
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
            // The plan document has no block entries yet, so the export check covers the drill rows.
            drills: rows.filter((row) => !isBlockKind(row.kind)).map((row) => {
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
                const view: PracticeSessionView = {
                    id: session.id,
                    title: session.title,
                    date: session.date.toISOString(),
                    duration: session.duration,
                    isShared: false,
                    createdByName: LOCAL_AUTHOR_NAME,
                    teamId: LOCAL_TEAM_ID,
                    teamName: LOCAL_TEAM_NAME,
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
                    plays: sortedRows(session).flatMap((row): SessionRow[] => {
                        const kind = toRowKind(row.kind);
                        if (isBlockKind(kind)) {
                            return [{ id: row.id, kind, label: row.label ?? null, sequence: row.sequence, duration: row.duration, instructions: row.instructions || null, runsWithPrevious: false }];
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
                                play: {
                                    id: play.id,
                                    name: play.name,
                                    description: play.description,
                                    thumbnail: play.thumbnail,
                                    ...drillTags(play),
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
                        return [{ id: row.id, kind, label: row.label ?? "", sequence: row.sequence, duration: row.duration, instructions: row.instructions, runsWithPrevious: false }];
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
                            ...drillTags(play),
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
                        plays: normalizeGroups(editorPlays),
                    },
                });
            }),

        createSession: (input) =>
            attempt("Failed to create practice session. Please try again.", async () => {
                const meta = sessionMeta(input);
                checkRows(input.plays);
                const goaliesAttending = checkedGoalieCount(input.goaliesAttending) ?? null;
                const transitionMinutes = checkedTransition(input.transitionMinutes) ?? 0;
                // A create has nothing stored: absent timing takes the defaults.
                const resolved = resolveRows(input.plays, []);
                checkTimeline(resolved, meta.duration, transitionMinutes);
                const saved = await write(ctx, async (tx) => {
                    const at = ctx.now();
                    const id = ctx.newId();
                    const { rows, plays, mapping } = await materialize(tx, ctx, id, resolved, at);
                    assertExportable({ ...meta, goaliesAttending, transitionMinutes }, rows, plays, at);
                    await tx.putSession({ id, ...meta, goaliesAttending, transitionMinutes, rows, createdAt: at, updatedAt: at });
                    return { id, plays: mapping };
                });
                return ok(saved);
            }),

        updateSession: (id, input) =>
            attempt("Failed to update practice session. Please try again.", async () => {
                const meta = sessionMeta(input);
                checkRows(input.plays);
                const count = checkedGoalieCount(input.goaliesAttending);
                const sentGap = checkedTransition(input.transitionMinutes);
                const saved = await write(ctx, async (tx) => {
                    const existing = await tx.getSession(id);
                    if (!existing) throw new StoreRefusal(SESSION_NOT_FOUND);
                    // Absent = unchanged: an editor opened before a field existed autosaves without it.
                    const goaliesAttending = count === undefined ? (existing.goaliesAttending ?? null) : count;
                    const transitionMinutes = sentGap ?? existing.transitionMinutes ?? 0;
                    const resolved = resolveRows(input.plays, storedTiming(existing));
                    checkTimeline(resolved, meta.duration, transitionMinutes);
                    const at = ctx.now();
                    const { rows, plays, mapping } = await materialize(tx, ctx, id, resolved, at);
                    assertExportable({ ...meta, goaliesAttending, transitionMinutes }, rows, plays, at);
                    await tx.putSession({ ...existing, ...meta, goaliesAttending, transitionMinutes, rows, updatedAt: at });
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
                const playId = await write(ctx, async (tx) => {
                    const session = await tx.getSession(input.sessionId);
                    if (!session) throw new StoreRefusal(SESSION_NOT_FOUND);
                    const at = ctx.now();
                    const fields = { ...text, thumbnail, playData, updatedAt: at };
                    // Absent = unchanged: only tags the caller sends replace the stored ones.
                    const sent = {
                        ...(input.focus !== undefined && { focus: toPlayFocus(input.focus) }),
                        ...(input.goalies !== undefined && { goalies: toPlayGoalies(input.goalies) }),
                    };
                    if (!input.playId) {
                        const created: StoredPlay = { id: ctx.newId(), ...fields, ...drillTags(sent), isTemplate: false, sessionId: session.id, sourcePlayId: null, createdAt: at };
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
                        // A fork inherits the library drill's tags unless new ones were sent.
                        ...drillTags({ ...drillTags(play), ...sent }),
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
                    for (const row of sortedRows(source)) {
                        if (!row.playId) {
                            // A block row has no drill to clone.
                            rows.push({ ...row, id: ctx.newId() });
                            continue;
                        }
                        const play = await tx.getPlay(row.playId);
                        if (!play) throw new StoreRefusal(SESSION_DRILL_REJECTED_MESSAGE);
                        const copy = cloneInto(play, newId, ctx.newId(), at);
                        await tx.putPlay(copy);
                        plays.set(copy.id, copy);
                        rows.push({ ...row, id: ctx.newId(), playId: copy.id });
                    }
                    const meta = {
                        title: duplicateSessionTitle(source.title),
                        date,
                        duration: source.duration,
                        goaliesAttending: source.goaliesAttending ?? null,
                        transitionMinutes: source.transitionMinutes ?? 0,
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
                const drills = parsed.plan.session.drills.map((d) => {
                    const playData = writablePlayData(d.drill.playData);
                    return { d, playData, thumbnail: ctx.makeThumbnail(playData) };
                });
                const sessionId = await write(ctx, async (tx) => {
                    const at = ctx.now();
                    const id = ctx.newId();
                    const rows: StoredSessionRow[] = [];
                    for (const { d, playData, thumbnail } of drills) {
                        const base = {
                            name: d.drill.name,
                            description: d.drill.description || null,
                            thumbnail,
                            playData,
                            focus: d.drill.focus,
                            goalies: d.drill.goalies,
                            sourcePlayId: null,
                            createdAt: at,
                            updatedAt: at,
                        };
                        const owned: StoredPlay = { id: ctx.newId(), ...base, isTemplate: false, sessionId: id };
                        await tx.putPlay(owned);
                        rows.push({
                            id: ctx.newId(),
                            playId: owned.id,
                            kind: "drill",
                            label: null,
                            sequence: d.sequence,
                            duration: d.durationMinutes,
                            instructions: d.instructions,
                            runsWithPrevious: d.runsWithPrevious,
                            stays: false,
                            rotateEveryMinutes: null,
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
