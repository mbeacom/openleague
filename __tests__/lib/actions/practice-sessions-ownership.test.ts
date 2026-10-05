import { beforeEach, describe, expect, it, vi } from "vitest";

// Clone ids are generated before insert; a per-test counter keeps them readable.
const playIds = vi.hoisted(() => ({ next: 0 }));
vi.mock("@/lib/services/play-ids", () => ({ newPlayId: () => `cclone${playIds.next++}xxxxxxxxxxxxxxxxxx` }));

const { mockAuth, models, mockPrisma } = vi.hoisted(() => {
    const models = {
        play: { findMany: vi.fn(), createManyAndReturn: vi.fn(), deleteMany: vi.fn() },
        practiceSession: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
        practiceSessionPlay: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
        practiceSessionPlayStaff: { findMany: vi.fn(), createMany: vi.fn() },
        teamMember: { findFirst: vi.fn() },
        event: { findUnique: vi.fn(), delete: vi.fn() },
    };
    return {
        models,
        mockAuth: {
            requireTeamAdmin: vi.fn(),
            requireTeamMember: vi.fn(),
            requireLeagueRole: vi.fn(),
        },
        mockPrisma: {
            $transaction: vi.fn(async (fn: (tx: typeof models) => unknown) => fn(models)),
            ...models,
        },
    };
});

vi.mock("@/lib/auth/session", () => mockAuth);
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email/templates", () => ({ sendPracticePlanNotifications: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/services/venue-reservations", () => ({
    assignVenueReservation: vi.fn(),
    createVenueReservation: vi.fn(),
    VenueReservationConflictError: class VenueReservationConflictError extends Error {
        conflicts: unknown[] = [];
    },
    VenueReservationLifecycleError: class VenueReservationLifecycleError extends Error {},
}));

import { createPracticeSession, updatePracticeSession } from "@/lib/actions/practice-sessions";
import { ROTATION_PLACEMENT_ERROR, ROTATION_TOO_FEW_ERROR } from "@/lib/utils/session-timeline";
import { toSessionRowInputs } from "@/lib/utils/session-rows";
import { STALE_EDITOR_MESSAGE } from "@/lib/utils/validation";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { SessionItem } from "@/types/practice-planner";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const USER = "cuserxxxxxxxxxxxxxxxxxxxx";
const SESSION = "csessionxxxxxxxxxxxxxxxxx";
const LIB = "clibraryxxxxxxxxxxxxxxxxx";
const OWNED = "cownedxxxxxxxxxxxxxxxxxxx";
const FOREIGN = "cforeignxxxxxxxxxxxxxxxxx";
const OTHER_TEAM_PLAY = "cotherteamplayxxxxxxxxxx";
const LEGACY = "clegacyxxxxxxxxxxxxxxxxxx";

type Row = { teamId?: string; id: string; name: string; isTemplate: boolean; sessionId: string | null; sourcePlayId: string | null };
let rows: Row[] = [];

function input(plays: Array<{ playId: string; clientKey: string }>) {
    return {
        title: "Tuesday",
        date: new Date("2026-04-07T22:00:00.000Z"),
        duration: 60,
        teamId: TEAM,
        plays: plays.map((p, sequence) => ({ ...p, sequence, duration: 10, instructions: "" })),
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    rows = [
        { id: LIB, name: "Library drill", isTemplate: true, sessionId: null, sourcePlayId: null },
        { id: OWNED, name: "Owned drill", isTemplate: false, sessionId: SESSION, sourcePlayId: LIB },
        { id: LEGACY, name: "Legacy drill", isTemplate: false, sessionId: null, sourcePlayId: null },
        { id: OTHER_TEAM_PLAY, name: "Other team", isTemplate: true, sessionId: null, sourcePlayId: null, teamId: "cotherteamxxxxxxxxxxxxxxx" },
        { id: FOREIGN, name: "Other session", isTemplate: false, sessionId: "cothersessionxxxxxxxxxxxx", sourcePlayId: null },
    ];
    mockAuth.requireTeamAdmin.mockResolvedValue(USER);
    models.teamMember.findFirst.mockResolvedValue({ id: "cmemberxxxxxxxxxxxxxxxxxx" });
    models.practiceSession.create.mockResolvedValue({ id: SESSION, title: "Tuesday", date: new Date() });
    models.practiceSession.findUnique.mockResolvedValue({ id: SESSION, teamId: TEAM, isShared: false, venueReservationId: null });
    models.practiceSession.update.mockResolvedValue({ id: SESSION, title: "Tuesday", date: new Date() });
    models.practiceSessionPlay.findMany.mockResolvedValue([]);
    models.practiceSessionPlayStaff.findMany.mockResolvedValue([]);
    models.practiceSessionPlay.deleteMany.mockResolvedValue({ count: 0 });
    models.practiceSessionPlay.createMany.mockResolvedValue({ count: 0 });
    models.play.deleteMany.mockResolvedValue({ count: 0 });
    // Honors where.teamId like the database: rows below belong to TEAM unless marked.
    models.play.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] }; teamId?: string } }) =>
        rows.filter((r) => where.id.in.includes(r.id) && (where.teamId === undefined || (r.teamId ?? TEAM) === where.teamId)).map((r) => ({ ...r, description: null, thumbnail: null, playData: {} })));
    playIds.next = 0;
    // Echo the generated id: the helper matches returned rows by id.
    models.play.createManyAndReturn.mockImplementation(async ({ data }: { data: Array<{ id: string; name: string; sourcePlayId: string; sessionId: string }> }) =>
        data.map((d) => ({ id: d.id, name: d.name, sourcePlayId: d.sourcePlayId, sessionId: d.sessionId })));
});

describe("createPracticeSession owns its drills", () => {
    it("clones a library drill and returns the clientKey mapping", async () => {
        const result = await createPracticeSession(input([{ playId: LIB, clientKey: "k1" }]));

        expect(result).toMatchObject({ success: true, data: { plays: [{ clientKey: "k1", playId: "cclone0xxxxxxxxxxxxxxxxxx" }] } });
        expect(models.practiceSessionPlay.createMany.mock.calls[0][0].data).toEqual([
            { sessionId: SESSION, playId: "cclone0xxxxxxxxxxxxxxxxxx", kind: "drill", label: null, sequence: 0, runsWithPrevious: false, stays: false, rotateEveryMinutes: null, duration: 10, instructions: null },
        ]);
    });
});

describe("updatePracticeSession owns its drills", () => {
    it("converts a legacy library reference and cleans up after rewriting", async () => {
        models.practiceSessionPlay.findMany.mockResolvedValue([{ playId: LIB }]);
        const result = await updatePracticeSession({ id: SESSION, ...input([{ playId: LIB, clientKey: "k1" }]) });

        expect(result).toMatchObject({ success: true, data: { plays: [{ clientKey: "k1", playId: "cclone0xxxxxxxxxxxxxxxxxx" }] } });
        const created = models.practiceSession.update.mock.calls[0][0].data.plays.create;
        expect(created.map((p: { playId: string }) => p.playId)).toEqual(["cclone0xxxxxxxxxxxxxxxxxx"]);
        expect(models.play.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ sessionId: SESSION, sessions: { none: {} } }),
        }));
        expect(models.play.deleteMany.mock.invocationCallOrder[0])
            .toBeGreaterThan(models.practiceSession.update.mock.invocationCallOrder[0]);
    });

    it("leaves no session play pointing at a library play (I2)", async () => {
        models.practiceSessionPlay.findMany.mockResolvedValue([{ playId: LIB }]);
        await updatePracticeSession({
            id: SESSION,
            ...input([{ playId: OWNED, clientKey: "a" }, { playId: LIB, clientKey: "b" }, { playId: OWNED, clientKey: "c" }]),
        });
        const created: Array<{ playId: string }> = models.practiceSession.update.mock.calls[0][0].data.plays.create;
        const owned = new Set([OWNED, ...(await Promise.all(models.play.createManyAndReturn.mock.results.map((r) => r.value)))
            .flat()
            .map((r: { id: string }) => r.id)]);
        expect(created.every((p) => owned.has(p.playId))).toBe(true);
        expect(created.some((p) => p.playId === LIB)).toBe(false);
    });

    it("keeps an owned drill without cloning", async () => {
        await updatePracticeSession({ id: SESSION, ...input([{ playId: OWNED, clientKey: "k1" }]) });
        expect(models.play.createManyAndReturn).not.toHaveBeenCalled();
    });

    it("rejects another session's copy before touching session plays", async () => {
        const result = await updatePracticeSession({ id: SESSION, ...input([{ playId: FOREIGN, clientKey: "k1" }]) });

        expect(result).toEqual({ success: false, error: "One or more drills not found or do not belong to this session" });
        expect(models.practiceSessionPlay.deleteMany).not.toHaveBeenCalled();
        expect(models.practiceSession.update).not.toHaveBeenCalled();
    });

    it("reads previous references before deleting session plays", async () => {
        await updatePracticeSession({ id: SESSION, ...input([{ playId: OWNED, clientKey: "k1" }]) });
        // The stored-timing read comes first now; pin materializeSessionDrills's own read.
        const references = models.practiceSessionPlay.findMany.mock.calls.findIndex(
            ([args]) => Object.keys(args.select).join(",") === "playId",
        );
        expect(references).toBeGreaterThanOrEqual(0);
        expect(models.practiceSessionPlay.findMany.mock.invocationCallOrder[references])
            .toBeLessThan(models.practiceSessionPlay.deleteMany.mock.invocationCallOrder[0]);
    });

    it("converts a legacy unowned non-template play the session already references", async () => {
        models.practiceSessionPlay.findMany.mockResolvedValue([{ playId: LEGACY }]);
        const result = await updatePracticeSession({ id: SESSION, ...input([{ playId: LEGACY, clientKey: "k1" }]) });
        expect(result).toMatchObject({ success: true, data: { plays: [{ clientKey: "k1", playId: "cclone0xxxxxxxxxxxxxxxxxx" }] } });
    });

    it("rejects a play of another team without a destructive write", async () => {
        const result = await updatePracticeSession({ id: SESSION, ...input([{ playId: OTHER_TEAM_PLAY, clientKey: "k1" }]) });
        expect(result).toEqual({ success: false, error: "One or more drills not found or do not belong to this session" });
        expect(models.practiceSessionPlay.deleteMany).not.toHaveBeenCalled();
        expect(models.practiceSession.update).not.toHaveBeenCalled();
        expect(models.play.deleteMany).not.toHaveBeenCalled();
        expect(models.play.createManyAndReturn).not.toHaveBeenCalled();
    });

    it("rejects a payload whose clientKeys repeat", async () => {
        const result = await updatePracticeSession({
            id: SESSION,
            ...input([{ playId: OWNED, clientKey: "same" }, { playId: LIB, clientKey: "same" }]),
        });
        expect(result).toMatchObject({ success: false, error: "Invalid input" });
    });
});

describe("goalie count (goaltender-aware drills)", () => {
    it("createPracticeSession stores the count, or null when none is sent", async () => {
        await createPracticeSession({ ...input([]), goaliesAttending: 2 });
        expect(models.practiceSession.create.mock.calls[0][0].data.goaliesAttending).toBe(2);
        await createPracticeSession(input([]));
        expect(models.practiceSession.create.mock.calls[1][0].data.goaliesAttending).toBeNull();
    });

    it("updatePracticeSession writes a sent count, clears on null, and leaves it alone when omitted (older tabs' autosave)", async () => {
        const update = (extra: Record<string, unknown> = {}) => updatePracticeSession({ id: SESSION, ...input([]), ...extra });
        await update({ goaliesAttending: 1 });
        expect(models.practiceSession.update.mock.calls[0][0].data.goaliesAttending).toBe(1);
        await update({ goaliesAttending: null });
        expect(models.practiceSession.update.mock.calls[1][0].data.goaliesAttending).toBeNull();
        await update();
        expect(models.practiceSession.update.mock.calls[2][0].data).not.toHaveProperty("goaliesAttending");
    });

    it("rejects a count outside 0–10 without writing", async () => {
        const result = await createPracticeSession({ ...input([]), goaliesAttending: 11 });
        expect(result.success).toBe(false);
        expect(models.practiceSession.create).not.toHaveBeenCalled();
    });
});

describe("practice timing rows (spec R2, R3, R5)", () => {
    // One row as a client sends it (kind and timing optional, as older clients omit them).
    type SaveRow = NonNullable<Parameters<typeof createPracticeSession>[0]["plays"]>[number];
    const save = (plays: SaveRow[], extra: { transitionMinutes?: number } = {}) => ({ ...input([]), plays, ...extra });
    const ROWS = [
        { kind: "warmup", clientKey: "kw", sequence: 0, duration: 8, instructions: "Laps", label: "" },
        { playId: LIB, clientKey: "k1", sequence: 1, duration: 10, instructions: "", stays: false, rotateEveryMinutes: null },
        { kind: "break", clientKey: "kb", sequence: 2, duration: 2, instructions: "", label: "Water" },
        { playId: LIB, clientKey: "k2", sequence: 3, duration: 10, instructions: "", stays: false, rotateEveryMinutes: null },
    ] satisfies SaveRow[];
    type Written = { kind: string; playId: string | null; label: string | null };

    it("create writes block rows with no play, and maps each drill row to its own copy by key", async () => {
        const result = await createPracticeSession(save(ROWS, { transitionMinutes: 1 }));
        expect(result).toMatchObject({ success: true, data: { plays: [{ clientKey: "k1" }, { clientKey: "k2" }] } });
        expect(models.practiceSession.create.mock.calls[0][0].data.transitionMinutes).toBe(1);
        const written: Written[] = models.practiceSessionPlay.createMany.mock.calls[0][0].data;
        expect(written.map((row) => [row.kind, row.playId])).toEqual([
            ["warmup", null],
            ["drill", "cclone0xxxxxxxxxxxxxxxxxx"],
            ["break", null],
            ["drill", "cclone1xxxxxxxxxxxxxxxxxx"],
        ]);
        expect(written[0]).toMatchObject({ label: null, instructions: "Laps", stays: false, rotateEveryMinutes: null, runsWithPrevious: false });
        expect(written[2]).toMatchObject({ label: "Water" });
    });

    it("create writes a session with only blocks, and defaults the gap to 0", async () => {
        await createPracticeSession(save([ROWS[0]]));
        expect(models.practiceSession.create.mock.calls[0][0].data.transitionMinutes).toBe(0);
        expect(models.practiceSessionPlay.createMany.mock.calls[0][0].data).toHaveLength(1);
    });

    it("update writes the gap only when it is sent", async () => {
        await updatePracticeSession({ id: SESSION, ...save([], { transitionMinutes: 3 }) });
        expect(models.practiceSession.update.mock.calls[0][0].data.transitionMinutes).toBe(3);
        await updatePracticeSession({ id: SESSION, ...save([]) });
        expect(models.practiceSession.update.mock.calls[1][0].data).not.toHaveProperty("transitionMinutes");
    });

    it("update keeps a drill's stored rotation and stays when an older client leaves them out", async () => {
        models.practiceSessionPlay.findMany.mockResolvedValue([{ playId: OWNED, stays: false, rotateEveryMinutes: 5 }]);
        const result = await updatePracticeSession({
            id: SESSION,
            ...save([
                { playId: OWNED, clientKey: "k1", sequence: 0, duration: 5, instructions: "" },
                { playId: LIB, clientKey: "k2", sequence: 1, duration: 5, instructions: "", runsWithPrevious: true },
            ]),
        });
        expect(result.success).toBe(true);
        expect(models.practiceSessionPlay.findMany.mock.calls[0][0]).toMatchObject({
            where: { sessionId: SESSION },
            select: { playId: true, stays: true, rotateEveryMinutes: true },
        });
        const created: Array<{ rotateEveryMinutes: number | null; stays: boolean }> = models.practiceSession.update.mock.calls[0][0].data.plays.create;
        expect(created.map((row) => [row.rotateEveryMinutes, row.stays])).toEqual([[5, false], [null, false]]);
    });

    it("update checks the plan against the stored gap when the save leaves the gap out", async () => {
        models.practiceSession.findUnique.mockResolvedValue({ id: SESSION, teamId: TEAM, isShared: false, venueReservationId: null, transitionMinutes: 5 });
        const tight = [0, 1, 2].map((sequence): SaveRow => ({ playId: LIB, clientKey: `k${sequence}`, sequence, duration: 18, instructions: "", stays: false, rotateEveryMinutes: null }));
        // 3 × 18 = 54, plus two 5-minute gaps = 64
        expect(await updatePracticeSession({ id: SESSION, ...save(tight) })).toEqual({
            success: false,
            error: "Practice timeline (64 min) exceeds session duration (60 min)",
        });
        expect(models.practiceSession.update).not.toHaveBeenCalled();
    });

    it("rejects a rotation that can't run and a block inside a station block, writing nothing", async () => {
        const rotation = await createPracticeSession(save([
            { playId: LIB, clientKey: "k1", sequence: 0, duration: 10, instructions: "", stays: false, rotateEveryMinutes: 5 },
            { playId: LIB, clientKey: "k2", sequence: 1, duration: 10, instructions: "", runsWithPrevious: true, stays: true, rotateEveryMinutes: null },
        ]));
        expect(rotation).toEqual({ success: false, error: ROTATION_TOO_FEW_ERROR });
        const block = await createPracticeSession(save([
            { playId: LIB, clientKey: "k1", sequence: 0, duration: 10, instructions: "" },
            { kind: "break", clientKey: "kb", sequence: 1, duration: 2, instructions: "", runsWithPrevious: true },
        ]));
        expect(block.success).toBe(false);
        expect(models.practiceSession.create).not.toHaveBeenCalled();
    });

    it("writes each rotating station's minutes as the editor shows them, on create and update", async () => {
        const rotating = (durations: number[]): SaveRow[] => [
            { playId: LIB, clientKey: "k1", sequence: 0, duration: durations[0], instructions: "", stays: false, rotateEveryMinutes: 5 },
            { playId: LIB, clientKey: "k2", sequence: 1, duration: durations[1], instructions: "", runsWithPrevious: true, stays: false, rotateEveryMinutes: null },
            { playId: LIB, clientKey: "k3", sequence: 2, duration: durations[2], instructions: "", runsWithPrevious: true, stays: true, rotateEveryMinutes: null },
        ];
        expect((await createPracticeSession(save(rotating([12, 7, 3])))).success).toBe(true);
        const created: Array<{ duration: number }> = models.practiceSessionPlay.createMany.mock.calls[0][0].data;
        expect(created.map((row) => row.duration)).toEqual([5, 5, 10]);
        expect((await updatePracticeSession({ id: SESSION, ...save(rotating([9, 9, 9])) })).success).toBe(true);
        const updated: Array<{ duration: number }> = models.practiceSession.update.mock.calls[0][0].data.plays.create;
        expect(updated.map((row) => row.duration)).toEqual([5, 5, 10]);
    });

    it("never treats a stored block row as an orphaned drill", async () => {
        models.practiceSessionPlay.findMany.mockResolvedValue([{ playId: null, kind: "warmup" }, { playId: OWNED, kind: "drill" }]);
        await updatePracticeSession({ id: SESSION, ...save([], { transitionMinutes: 0 }) });
        expect(models.play.deleteMany.mock.calls[0][0].where.id).toEqual({ in: [OWNED] });
    });
});

describe("a stale editor can't drop warm-ups and breaks", () => {
    type SaveRow = NonNullable<Parameters<typeof updatePracticeSession>[0]["plays"]>[number];
    const update = (plays: SaveRow[]) => updatePracticeSession({ id: SESSION, ...input([]), plays });
    const stored = (rows: Array<{ playId: string | null; kind: string; stays?: boolean; rotateEveryMinutes?: number | null }>) =>
        models.practiceSessionPlay.findMany.mockResolvedValue(rows.map((row) => ({ stays: false, rotateEveryMinutes: null, ...row })));
    // An editor from before block rows: no kind, no stays, no rotation.
    const legacy = (playId: string, clientKey: string, sequence: number, extra: Partial<SaveRow> = {}): SaveRow =>
        ({ playId, clientKey, sequence, duration: 10, instructions: "", ...extra });

    it("rejects a save without row kinds when the practice has a block row, inside the transaction, deleting nothing", async () => {
        stored([{ playId: null, kind: "warmup" }, { playId: OWNED, kind: "drill" }]);
        const result = await update([legacy(OWNED, "k1", 0)]);
        expect(result).toEqual({ success: false, error: STALE_EDITOR_MESSAGE });
        expect(STALE_EDITOR_MESSAGE).toBe("This page is out of date. Reload to keep your warm-ups and breaks.");
        expect(models.practiceSessionPlay.findMany.mock.calls[0][0].select).toMatchObject({ kind: true });
        expect(mockPrisma.$transaction.mock.invocationCallOrder[0])
            .toBeLessThan(models.practiceSessionPlay.findMany.mock.invocationCallOrder[0]);
        expect(models.practiceSessionPlay.deleteMany).not.toHaveBeenCalled();
        expect(models.practiceSession.update).not.toHaveBeenCalled();
    });

    it("reads a row whose kind is present but undefined as an older client's", async () => {
        stored([{ playId: null, kind: "warmup" }, { playId: OWNED, kind: "drill" }]);
        const result = await update([legacy(OWNED, "k1", 0, { kind: undefined })]);
        expect(result).toEqual({ success: false, error: STALE_EDITOR_MESSAGE });
        expect(models.practiceSessionPlay.deleteMany).not.toHaveBeenCalled();
    });

    it("rejects an older editor's empty list when the practice has block rows, deleting nothing", async () => {
        stored([{ playId: null, kind: "warmup" }]);
        const result = await update([]);
        expect(result).toEqual({ success: false, error: STALE_EDITOR_MESSAGE });
        expect(models.practiceSessionPlay.deleteMany).not.toHaveBeenCalled();
        expect(models.practiceSession.update).not.toHaveBeenCalled();
    });

    it("saves the current editor's empty list (it always sends the gap): the coach cleared everything", async () => {
        stored([{ playId: null, kind: "warmup" }]);
        const result = await updatePracticeSession({ id: SESSION, ...input([]), plays: [], transitionMinutes: 0 });
        expect(result.success).toBe(true);
        expect(models.practiceSessionPlay.deleteMany).toHaveBeenCalledWith({ where: { sessionId: SESSION } });
        expect(models.practiceSession.update.mock.calls[0][0].data.plays).toBeUndefined();
    });

    it("saves an older editor's empty list when the practice has no block rows", async () => {
        stored([{ playId: OWNED, kind: "drill" }]);
        const result = await update([]);
        expect(result.success).toBe(true);
        expect(models.practiceSession.update).toHaveBeenCalledTimes(1);
    });

    it("saves a payload without row kinds as today when the practice has no block rows", async () => {
        stored([{ playId: OWNED, kind: "drill" }]);
        const result = await update([legacy(OWNED, "k1", 0)]);
        expect(result.success).toBe(true);
        expect(models.practiceSession.update).toHaveBeenCalledTimes(1);
    });

    it("saves the current editor's payload, which always carries each row's kind", async () => {
        stored([{ playId: null, kind: "warmup" }, { playId: OWNED, kind: "drill" }]);
        const items: SessionItem[] = [
            { id: "kw", kind: "warmup", label: "", sequence: 0, duration: 8, instructions: "", runsWithPrevious: false },
            { id: "k1", playId: OWNED, name: "Owned drill", sequence: 1, runsWithPrevious: false, duration: 10, instructions: "", playData: createEmptyPlayData() },
        ];
        const plays = toSessionRowInputs(items);
        expect(plays.every((row) => Object.hasOwn(row, "kind"))).toBe(true);
        const result = await update(plays);
        expect(result.success).toBe(true);
        const created: Array<{ kind: string }> = models.practiceSession.update.mock.calls[0][0].data.plays.create;
        expect(created.map((row) => row.kind)).toEqual(["warmup", "drill"]);
    });
});

describe("inherited timing that no longer fits is settled, not rejected (spec R3)", () => {
    type SaveRow = NonNullable<Parameters<typeof updatePracticeSession>[0]["plays"]>[number];
    const update = (plays: SaveRow[]) => updatePracticeSession({ id: SESSION, ...input([]), plays });
    const row = (playId: string, clientKey: string, sequence: number, extra: Partial<SaveRow> = {}): SaveRow =>
        ({ kind: "drill", playId, clientKey, sequence, duration: 10, instructions: "", ...extra });
    const written = () => {
        const created: Array<{ rotateEveryMinutes: number | null; stays: boolean }> = models.practiceSession.update.mock.calls[0][0].data.plays.create;
        return created.map((r) => [r.rotateEveryMinutes, r.stays]);
    };

    it("drops an inherited rotation when its block lost its stations", async () => {
        models.practiceSessionPlay.findMany.mockResolvedValue([{ playId: OWNED, kind: "drill", stays: false, rotateEveryMinutes: 5 }]);
        const result = await update([row(OWNED, "k1", 0)]);
        expect(result.success).toBe(true);
        expect(written()).toEqual([[null, false]]);
    });

    it("drops an inherited rotation on a drill that is no longer first in its block", async () => {
        models.practiceSessionPlay.findMany.mockResolvedValue([{ playId: OWNED, kind: "drill", stays: false, rotateEveryMinutes: 5 }]);
        const result = await update([
            row(LIB, "k0", 0, { stays: false, rotateEveryMinutes: null }),
            row(OWNED, "k1", 1, { runsWithPrevious: true }),
        ]);
        expect(result.success).toBe(true);
        expect(written()).toEqual([[null, false], [null, false]]);
    });

    it("lets an inherited stays give way to a rotation the client sent", async () => {
        models.practiceSessionPlay.findMany.mockResolvedValue([{ playId: OWNED, kind: "drill", stays: true, rotateEveryMinutes: null }]);
        const result = await update([
            row(LIB, "k0", 0, { stays: false, rotateEveryMinutes: 5 }),
            row(OWNED, "k1", 1, { runsWithPrevious: true, rotateEveryMinutes: null }),
        ]);
        expect(result.success).toBe(true);
        expect(written()).toEqual([[5, false], [null, false]]);
    });

    it("still rejects timing the client sent that can't run, writing nothing", async () => {
        const tooFew = await update([
            row(LIB, "k0", 0, { stays: false, rotateEveryMinutes: 5 }),
            row(OWNED, "k1", 1, { runsWithPrevious: true, stays: true, rotateEveryMinutes: null }),
        ]);
        expect(tooFew).toEqual({ success: false, error: ROTATION_TOO_FEW_ERROR });
        const placement = await update([
            row(LIB, "k0", 0, { stays: false, rotateEveryMinutes: null }),
            row(OWNED, "k1", 1, { runsWithPrevious: true, stays: false, rotateEveryMinutes: 5 }),
        ]);
        expect(placement).toEqual({ success: false, error: ROTATION_PLACEMENT_ERROR });
        expect(models.practiceSessionPlay.deleteMany).not.toHaveBeenCalled();
        expect(models.practiceSession.update).not.toHaveBeenCalled();
    });
});
