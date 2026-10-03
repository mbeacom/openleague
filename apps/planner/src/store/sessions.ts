/**
 * Sessions and their owned drills, mirroring lib/actions/practice-sessions.ts,
 * practice-session-drills.ts and practice-plan-import.ts (ADR-0020, 3a).
 * Every stored session is a valid plan document, so it always exports.
 */
import type { PracticeSessionView, PlayInSession } from "@/types/practice-planner";
import { parsePlan, serializePlan } from "@/lib/plan-document";
import { createEmptyPlayData, parseStoredPlayData } from "@/lib/utils/play-data";
import { normalizeGroups, stationGroupError } from "@/lib/utils/session-timeline";
import { SESSION_DRILL_REJECTED_MESSAGE, duplicateSessionTitle, type SavedDrillId } from "@/lib/utils/session-drill-ids";
import { LOCAL_AUTHOR_NAME, LOCAL_TEAM_ID, LOCAL_TEAM_NAME } from "../config";
import type { RepoTx, StoredPlay, StoredSession, StoredSessionRow } from "./records";
import { StoreRefusal, attempt, drillText, ok, thumbnailOrNull, writablePlayData, write, type StoreContext } from "./shared";
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

const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

function validDate(date: Date): Date {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new StoreRefusal("Valid date is required");
    return date;
}

/** Checks the payload's shape before the transaction starts. */
function checkDrills(plays: LocalSessionDrill[]): void {
    if (new Set(plays.map((p) => p.clientKey)).size !== plays.length) throw new StoreRefusal("Each drill needs a unique key");
    const sequences = plays.map((p) => p.sequence).sort((a, b) => a - b);
    if (sequences.some((sequence, index) => sequence !== index)) {
        throw new StoreRefusal("Drill sequences must run 0, 1, 2… with no gaps or repeats");
    }
    const groupError = stationGroupError([...plays].sort((a, b) => a.sequence - b.sequence));
    if (groupError) throw new StoreRefusal(groupError);
}

/** Synchronous, so it can run inside a transaction: the session must be a valid plan document. */
function assertExportable(meta: { title: string; duration: number }, rows: StoredSessionRow[], plays: Map<string, StoredPlay>, at: Date): void {
    const doc = serializePlan(
        {
            title: meta.title,
            durationMinutes: meta.duration,
            date: null,
            startTime: null,
            drills: rows.map((row) => {
                const play = plays.get(row.playId);
                const parsed = parseStoredPlayData(play?.playData);
                return {
                    sequence: row.sequence,
                    duration: row.duration,
                    runsWithPrevious: row.runsWithPrevious,
                    instructions: row.instructions,
                    name: play?.name ?? "",
                    description: play?.description ?? null,
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
async function materialize(tx: RepoTx, ctx: StoreContext, sessionId: string, items: LocalSessionDrill[], at: Date) {
    const kept = new Set<string>();
    const plays = new Map<string, StoredPlay>();
    const rows: StoredSessionRow[] = [];
    const mapping: SavedDrillId[] = [];
    for (const item of items) {
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
            sequence: item.sequence,
            duration: item.duration,
            instructions: item.instructions,
            runsWithPrevious: item.runsWithPrevious,
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
                        .map((s) => ({ id: s.id, title: s.title, date: s.date, duration: s.duration, drillCount: s.rows.length, updatedAt: s.updatedAt }))
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
                    plays: sortedRows(session).flatMap((row) => {
                        const play = plays.get(row.playId);
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
                                play: {
                                    id: play.id,
                                    name: play.name,
                                    description: play.description,
                                    thumbnail: play.thumbnail,
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
                const editorPlays: PlayInSession[] = sortedRows(session).flatMap((row) => {
                    const play = plays.get(row.playId);
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
                        plays: normalizeGroups(editorPlays),
                    },
                });
            }),

        createSession: (input) =>
            attempt("Failed to create practice session. Please try again.", async () => {
                const meta = sessionMeta(input);
                checkDrills(input.plays);
                const saved = await write(ctx, async (tx) => {
                    const at = ctx.now();
                    const id = ctx.newId();
                    const { rows, plays, mapping } = await materialize(tx, ctx, id, input.plays, at);
                    assertExportable(meta, rows, plays, at);
                    await tx.putSession({ id, ...meta, rows, createdAt: at, updatedAt: at });
                    return { id, plays: mapping };
                });
                return ok(saved);
            }),

        updateSession: (id, input) =>
            attempt("Failed to update practice session. Please try again.", async () => {
                const meta = sessionMeta(input);
                checkDrills(input.plays);
                const saved = await write(ctx, async (tx) => {
                    const existing = await tx.getSession(id);
                    if (!existing) throw new StoreRefusal(SESSION_NOT_FOUND);
                    const at = ctx.now();
                    const { rows, plays, mapping } = await materialize(tx, ctx, id, input.plays, at);
                    assertExportable(meta, rows, plays, at);
                    await tx.putSession({ ...existing, ...meta, rows, updatedAt: at });
                    // Drop-only cleanup: copies this session referenced before and no longer does.
                    // A copy the drill dialog made but the editor hasn't sent is never touched here.
                    const referenced = new Set(rows.map((row) => row.playId));
                    for (const playId of new Set(existing.rows.map((row) => row.playId))) {
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
                    if (!input.playId) {
                        const created: StoredPlay = { id: ctx.newId(), ...fields, isTemplate: false, sessionId: session.id, sourcePlayId: null, createdAt: at };
                        await tx.putPlay(created);
                        return created.id;
                    }
                    const play = await tx.getPlay(input.playId);
                    if (!play) throw new StoreRefusal(SESSION_DRILL_REJECTED_MESSAGE);
                    if (play.sessionId === session.id) {
                        await tx.putPlay({ ...play, ...fields });
                        return play.id;
                    }
                    if (play.sessionId !== null || !play.isTemplate) throw new StoreRefusal(SESSION_DRILL_REJECTED_MESSAGE);
                    const forked: StoredPlay = {
                        id: ctx.newId(),
                        ...fields,
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
                        const play = await tx.getPlay(row.playId);
                        if (!play) throw new StoreRefusal(SESSION_DRILL_REJECTED_MESSAGE);
                        const copy = cloneInto(play, newId, ctx.newId(), at);
                        await tx.putPlay(copy);
                        plays.set(copy.id, copy);
                        rows.push({ ...row, id: ctx.newId(), playId: copy.id });
                    }
                    const meta = { title: duplicateSessionTitle(source.title), date, duration: source.duration };
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
                            sourcePlayId: null,
                            createdAt: at,
                            updatedAt: at,
                        };
                        const owned: StoredPlay = { id: ctx.newId(), ...base, isTemplate: false, sessionId: id };
                        await tx.putPlay(owned);
                        rows.push({
                            id: ctx.newId(),
                            playId: owned.id,
                            sequence: d.sequence,
                            duration: d.durationMinutes,
                            instructions: d.instructions,
                            runsWithPrevious: d.runsWithPrevious,
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
