/** Practice staff in createPracticeSession / updatePracticeSession (spec R2, R3, R4). */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Staff ids are generated before insert; a per-test counter keeps them readable.
const playIds = vi.hoisted(() => ({ next: 0 }));
vi.mock("@/lib/services/play-ids", () => ({ newPlayId: () => `cnew${playIds.next++}xxxxxxxxxxxxxxxxxxxx` }));

const { mockAuth, models, mockPrisma } = vi.hoisted(() => {
    const models = {
        play: { findMany: vi.fn(), createManyAndReturn: vi.fn(), deleteMany: vi.fn() },
        practiceSession: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
        practiceSessionPlay: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
        practiceSessionStaff: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
        practiceSessionPlayStaff: { findMany: vi.fn(), createMany: vi.fn() },
        teamOfficial: { findMany: vi.fn() },
        teamMember: { findFirst: vi.fn(), findMany: vi.fn() },
        event: { findUnique: vi.fn(), delete: vi.fn() },
    };
    return {
        models,
        mockAuth: { requireTeamAdmin: vi.fn(), requireTeamMember: vi.fn(), requireLeagueRole: vi.fn() },
        mockPrisma: { $transaction: vi.fn(async (fn: (tx: typeof models) => unknown) => fn(models)), ...models },
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
import {
    ROW_STAFF_DUPLICATE_MESSAGE,
    ROW_STAFF_UNKNOWN_MESSAGE,
    STAFF_ADMIN_MESSAGE,
    STAFF_NAME_TAKEN_MESSAGE,
    STAFF_OFFICIAL_MESSAGE,
} from "@/lib/utils/session-staff";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const USER = "cuserxxxxxxxxxxxxxxxxxxxx";
const SESSION = "csessionxxxxxxxxxxxxxxxxx";
const OWNED = "cownedxxxxxxxxxxxxxxxxxxx";
const OFFICIAL = "cofficialxxxxxxxxxxxxxxxx";
const ADMIN = "cadminxxxxxxxxxxxxxxxxxxx";
const STORED = "cstoredstaffxxxxxxxxxxxxx";
const id = (n: number) => `cnew${n}xxxxxxxxxxxxxxxxxxxx`;

/** A warm-up then an owned drill, as the current editor sends them. */
function rows(staff: [string[]?, string[]?] = []) {
    return [
        { kind: "warmup", clientKey: "kw", sequence: 0, duration: 8, instructions: "", label: null, ...(staff[0] && { staff: staff[0] }) },
        { kind: "drill", playId: OWNED, clientKey: "k1", sequence: 1, duration: 10, instructions: "", runsWithPrevious: false, stays: false, rotateEveryMinutes: null, ...(staff[1] && { staff: staff[1] }) },
    ];
}

type SaveInput = Parameters<typeof createPracticeSession>[0];

/** A save as the client sends it (rows and staff as raw payload, which the action parses). */
function save(extra: Record<string, unknown> = {}): SaveInput {
    return { title: "Tuesday", date: new Date("2026-10-06T22:00:00.000Z"), duration: 60, teamId: TEAM, transitionMinutes: 0, plays: rows(), ...extra } as SaveInput;
}

/** The rows as written, read back by sequence (writeRowStaff). */
const WRITTEN = [{ id: "crow0", sequence: 0 }, { id: "crow1", sequence: 1 }];

beforeEach(() => {
    vi.clearAllMocks();
    playIds.next = 0;
    mockAuth.requireTeamAdmin.mockResolvedValue(USER);
    models.teamMember.findFirst.mockResolvedValue({ id: "cmemberxxxxxxxxxxxxxxxxxx" });
    models.teamMember.findMany.mockResolvedValue([]);
    models.teamOfficial.findMany.mockResolvedValue([]);
    models.practiceSession.create.mockResolvedValue({ id: SESSION, title: "Tuesday", date: new Date() });
    models.practiceSession.findUnique.mockResolvedValue({ id: SESSION, teamId: TEAM, isShared: false, venueReservationId: null, transitionMinutes: 0 });
    models.practiceSession.update.mockResolvedValue({ id: SESSION, title: "Tuesday", date: new Date() });
    models.practiceSessionPlay.deleteMany.mockResolvedValue({ count: 2 });
    models.practiceSessionPlay.createMany.mockResolvedValue({ count: 2 });
    models.practiceSessionPlay.findMany.mockImplementation(async (args: { where: { sequence?: { in: number[] }; kind?: unknown } }) => {
        if (args.where.sequence) return WRITTEN.filter((row) => args.where.sequence?.in.includes(row.sequence));
        // The stored block rows (readCarriedRowStaff): one warm-up, as rows() sends.
        if (args.where.kind) return [{ sequence: 0, kind: "warmup" }];
        return [{ playId: null, kind: "warmup", stays: false, rotateEveryMinutes: null }, { playId: OWNED, kind: "drill", stays: false, rotateEveryMinutes: null }];
    });
    models.practiceSessionStaff.findMany.mockResolvedValue([]);
    models.practiceSessionStaff.deleteMany.mockResolvedValue({ count: 0 });
    models.practiceSessionStaff.createMany.mockResolvedValue({ count: 0 });
    models.practiceSessionPlayStaff.findMany.mockResolvedValue([]);
    models.practiceSessionPlayStaff.createMany.mockResolvedValue({ count: 0 });
    models.play.deleteMany.mockResolvedValue({ count: 0 });
    models.play.findMany.mockResolvedValue([
        { id: OWNED, teamId: TEAM, name: "Breakout", isTemplate: false, sessionId: SESSION, sourcePlayId: null, description: null, thumbnail: null, playData: {} },
    ]);
});

const staffWritten = () => models.practiceSessionStaff.createMany.mock.calls[0]?.[0].data;
const assignmentsWritten = () => models.practiceSessionPlayStaff.createMany.mock.calls[0]?.[0].data;

describe("createPracticeSession with staff (spec R3)", () => {
    it("writes the list in order and each row's assignments, keys mapped to new ids, rows found by sequence", async () => {
        const result = await createPracticeSession(save({
            staff: [{ key: "k-lee", name: "Coach Lee" }, { key: "k-sam", name: " Sam " }],
            plays: rows([["k-sam"], ["k-lee", "k-sam"]]),
        }));
        expect(result.success).toBe(true);
        expect(staffWritten()).toEqual([
            { id: id(0), sessionId: SESSION, name: "Coach Lee", position: 0, teamOfficialId: null, userId: null },
            { id: id(1), sessionId: SESSION, name: "Sam", position: 1, teamOfficialId: null, userId: null },
        ]);
        // Returned so the editor swaps its keys to the stored ids (Task 7).
        expect(result.success && result.data.staff).toEqual([{ key: "k-lee", id: id(0) }, { key: "k-sam", id: id(1) }]);
        expect(assignmentsWritten()).toEqual([
            { playRowId: "crow0", staffId: id(1), position: 0 },
            { playRowId: "crow1", staffId: id(0), position: 0 },
            { playRowId: "crow1", staffId: id(1), position: 1 },
        ]);
    });

    it("stores no staff when the create sends none", async () => {
        const result = await createPracticeSession(save());
        expect(result.success && result.data.staff).toEqual([]);
        expect(models.practiceSessionStaff.createMany).not.toHaveBeenCalled();
        expect(models.practiceSessionPlayStaff.createMany).not.toHaveBeenCalled();
    });
});

describe("updatePracticeSession: checks after authentication and authorization (spec R3, R4)", () => {
    it("checks nothing about staff for a caller who isn't a team admin", async () => {
        mockAuth.requireTeamAdmin.mockRejectedValue(new Error("Unauthorized: Only team admins can perform this action"));
        const result = await updatePracticeSession({ id: SESSION, ...save({ staff: [{ key: OFFICIAL, name: "Coach Lee", teamOfficialId: OFFICIAL }] }) });
        expect(result).toEqual({ success: false, error: "Unauthorized: Only team admins can perform this action" });
        expect(models.teamOfficial.findMany).not.toHaveBeenCalled();
    });

    it("refuses an official who isn't an active or invited official of this team, before rewriting anything", async () => {
        const result = await updatePracticeSession({ id: SESSION, ...save({ staff: [{ key: OFFICIAL, name: "Coach Lee", teamOfficialId: OFFICIAL }] }) });
        expect(result).toEqual({ success: false, error: STAFF_OFFICIAL_MESSAGE });
        expect(models.teamOfficial.findMany).toHaveBeenCalledWith({
            where: { id: { in: [OFFICIAL] }, teamId: TEAM, status: { in: ["ACTIVE", "INVITED"] } },
            select: { id: true },
        });
        expect(models.practiceSessionPlay.deleteMany).not.toHaveBeenCalled();
    });

    it("refuses a user who isn't an admin of this team", async () => {
        const result = await updatePracticeSession({ id: SESSION, ...save({ staff: [{ key: "k", name: "Pat", userId: ADMIN }] }) });
        expect(result).toEqual({ success: false, error: STAFF_ADMIN_MESSAGE });
        expect(models.teamMember.findMany).toHaveBeenCalledWith({
            where: { userId: { in: [ADMIN] }, teamId: TEAM, role: "ADMIN" },
            select: { userId: true },
        });
    });

    it("keeps the links of an active official and an admin", async () => {
        models.teamOfficial.findMany.mockResolvedValue([{ id: OFFICIAL }]);
        models.teamMember.findMany.mockResolvedValue([{ userId: ADMIN }]);
        const result = await updatePracticeSession({ id: SESSION, ...save({
            staff: [{ key: "k-lee", name: "Coach Lee", teamOfficialId: OFFICIAL }, { key: "k-pat", name: "Pat", userId: ADMIN }],
        }) });
        expect(result.success).toBe(true);
        expect(staffWritten().map((row: { teamOfficialId: string | null; userId: string | null }) => [row.teamOfficialId, row.userId])).toEqual([[OFFICIAL, null], [null, ADMIN]]);
    });

    it("refuses names that differ only in case, a row run by someone off the list, and a person twice on a row", async () => {
        const refused = async (extra: Record<string, unknown>) => (await updatePracticeSession({ id: SESSION, ...save(extra) })).success === false;
        const error = async (extra: Record<string, unknown>) => {
            const result = await updatePracticeSession({ id: SESSION, ...save(extra) });
            return result.success ? null : result.error;
        };
        expect(await error({ staff: [{ key: "a", name: "Sam" }, { key: "b", name: "SAM" }] })).toBe(STAFF_NAME_TAKEN_MESSAGE);
        expect(await error({ staff: [{ key: "a", name: "Sam" }], plays: rows([["z"]]) })).toBe(ROW_STAFF_UNKNOWN_MESSAGE);
        expect(await error({ staff: [{ key: "a", name: "Sam" }], plays: rows([["a", "a"]]) })).toBe(ROW_STAFF_DUPLICATE_MESSAGE);
        expect(await refused({ staff: Array.from({ length: 13 }, (_, i) => ({ key: `k${i}`, name: `Coach ${i}` })) })).toBe(true);
        expect(models.practiceSessionPlay.deleteMany).not.toHaveBeenCalled();
    });

    it("shows a name clash the database catches (the lower(name) index) as the name message", async () => {
        models.practiceSessionStaff.createMany.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
        const result = await updatePracticeSession({ id: SESSION, ...save({ staff: [{ key: "a", name: "Straße" }] }) });
        expect(result).toEqual({ success: false, error: STAFF_NAME_TAKEN_MESSAGE });
    });

    it("refuses before writing a pair JavaScript lowercases apart but PostgreSQL's lower() treats as one", async () => {
        // "İlker".toLowerCase() is "i̇lker" (i + combining dot); staffNameKey folds it, as the lower("name") index does.
        for (const pair of [
            [{ key: "a", name: "İlker" }, { key: "b", name: "ilker" }],
            [{ key: "a", name: "ΟΔΟΣ" }, { key: "b", name: "οδοσ" }],
        ]) {
            expect(pair[0].name.toLowerCase()).not.toBe(pair[1].name.toLowerCase());
            expect(await updatePracticeSession({ id: SESSION, ...save({ staff: pair }) })).toEqual({ success: false, error: STAFF_NAME_TAKEN_MESSAGE });
            expect(await createPracticeSession(save({ staff: pair }))).toEqual({ success: false, error: STAFF_NAME_TAKEN_MESSAGE });
        }
        expect(models.practiceSessionStaff.createMany).not.toHaveBeenCalled();
    });
});

describe("updatePracticeSession: writing a sent list (spec R3)", () => {
    it("keeps a stored person's id, gives a new person a new id, and replaces the list whole", async () => {
        models.practiceSessionStaff.findMany.mockResolvedValue([{ id: STORED }]);
        const result = await updatePracticeSession({ id: SESSION, ...save({
            staff: [{ key: STORED, name: "Coach Lee" }, { key: "k-new", name: "Sam" }],
            plays: rows([[STORED], ["k-new"]]),
        }) });
        expect(result.success && result.data.staff).toEqual([{ key: STORED, id: STORED }, { key: "k-new", id: id(0) }]);
        expect(models.practiceSessionStaff.findMany).toHaveBeenCalledWith({ where: { sessionId: SESSION }, select: { id: true } });
        expect(models.practiceSessionStaff.deleteMany).toHaveBeenCalledWith({ where: { sessionId: SESSION } });
        expect(staffWritten().map((row: { id: string }) => row.id)).toEqual([STORED, id(0)]);
        expect(models.practiceSessionStaff.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(models.practiceSessionStaff.createMany.mock.invocationCallOrder[0]);
        expect(assignmentsWritten()).toEqual([
            { playRowId: "crow0", staffId: STORED, position: 0 },
            { playRowId: "crow1", staffId: id(0), position: 0 },
        ]);
    });

    it("clears the list and every assignment with an explicit []", async () => {
        const result = await updatePracticeSession({ id: SESSION, ...save({ staff: [] }) });
        expect(result.success && result.data.staff).toEqual([]);
        expect(models.practiceSessionStaff.deleteMany).toHaveBeenCalledWith({ where: { sessionId: SESSION } });
        expect(models.practiceSessionStaff.createMany).not.toHaveBeenCalled();
        expect(models.practiceSessionPlayStaff.createMany).not.toHaveBeenCalled();
        expect(models.practiceSessionPlayStaff.findMany).not.toHaveBeenCalled();
    });

    it("gives a row without staff nobody when the save sends a list", async () => {
        await updatePracticeSession({ id: SESSION, ...save({ staff: [{ key: "a", name: "Sam" }] }) });
        expect(staffWritten()).toHaveLength(1);
        expect(models.practiceSessionPlayStaff.createMany).not.toHaveBeenCalled();
    });
});

describe("updatePracticeSession without staff: unchanged across the row rewrite (spec R3, Review Focus 1)", () => {
    const stored = [
        { staffId: "cstaffsam", playRowId: "cold0", playRow: { playId: null, kind: "warmup", sequence: 0 } },
        { staffId: "cstafflee", playRowId: "cold1", playRow: { playId: OWNED, kind: "drill", sequence: 1 } },
        { staffId: "cstaffsam", playRowId: "cold1", playRow: { playId: OWNED, kind: "drill", sequence: 1 } },
    ];

    it("keeps the stored list and carries each row's assignments to the new rows: a drill by its play, a block by its place", async () => {
        models.practiceSessionPlayStaff.findMany.mockResolvedValue(stored);
        // An editor built before practice staff: no `staff` on the session; stray row keys are ignored.
        const result = await updatePracticeSession({ id: SESSION, ...save({ plays: rows([["stray"]]) }) });
        expect(result.success).toBe(true);
        // Nothing was sent, so there is no key to map.
        expect(result.success && result.data.staff).toEqual([]);
        expect(models.practiceSessionStaff.deleteMany).not.toHaveBeenCalled();
        expect(models.practiceSessionStaff.createMany).not.toHaveBeenCalled();
        expect(models.practiceSessionPlayStaff.findMany).toHaveBeenCalledWith({
            where: { playRow: { sessionId: SESSION } },
            orderBy: { position: "asc" },
            select: { staffId: true, playRowId: true, playRow: { select: { playId: true, kind: true, sequence: true } } },
        });
        expect(assignmentsWritten()).toEqual([
            { playRowId: "crow0", staffId: "cstaffsam", position: 0 },
            { playRowId: "crow1", staffId: "cstafflee", position: 0 },
            { playRowId: "crow1", staffId: "cstaffsam", position: 1 },
        ]);
    });

    it("reads the assignments before the rows are deleted (the delete cascades them)", async () => {
        models.practiceSessionPlayStaff.findMany.mockResolvedValue(stored);
        await updatePracticeSession({ id: SESSION, ...save() });
        expect(models.practiceSessionPlayStaff.findMany.mock.invocationCallOrder[0])
            .toBeLessThan(models.practiceSessionPlay.deleteMany.mock.invocationCallOrder[0]);
        expect(models.practiceSessionPlayStaff.createMany.mock.invocationCallOrder[0])
            .toBeGreaterThan(models.practiceSession.update.mock.invocationCallOrder[0]);
    });

    it("drops the blocks' staff when the block kinds changed, and still carries the drill", async () => {
        models.practiceSessionPlayStaff.findMany.mockResolvedValue(stored);
        const plays = rows();
        plays[0] = { ...plays[0], kind: "break" };
        await updatePracticeSession({ id: SESSION, ...save({ plays }) });
        expect(assignmentsWritten()).toEqual([
            { playRowId: "crow1", staffId: "cstafflee", position: 0 },
            { playRowId: "crow1", staffId: "cstaffsam", position: 1 },
        ]);
    });

    it("drops the blocks' staff when an older editor deleted a block of the same kind, never moving it to the block that stayed", async () => {
        models.practiceSessionPlayStaff.findMany.mockResolvedValue(stored);
        const readRows = models.practiceSessionPlay.findMany.getMockImplementation()!;
        // Stored: a warm-up at 0 (Sam runs it) and a second warm-up at 2. The save keeps one warm-up:
        // its place can't say which of the two it is.
        models.practiceSessionPlay.findMany.mockImplementation(async (args: { where: { kind?: unknown } }) =>
            args.where.kind ? [{ sequence: 0, kind: "warmup" }, { sequence: 2, kind: "warmup" }] : readRows(args));
        await updatePracticeSession({ id: SESSION, ...save() });
        expect(models.practiceSessionPlay.findMany).toHaveBeenCalledWith({
            where: { sessionId: SESSION, kind: { not: "drill" } },
            orderBy: { sequence: "asc" },
            select: { sequence: true, kind: true },
        });
        expect(assignmentsWritten()).toEqual([
            { playRowId: "crow1", staffId: "cstafflee", position: 0 },
            { playRowId: "crow1", staffId: "cstaffsam", position: 1 },
        ]);
    });

    it("reads one table and writes nothing when nothing was assigned", async () => {
        await updatePracticeSession({ id: SESSION, ...save() });
        expect(models.practiceSessionPlayStaff.createMany).not.toHaveBeenCalled();
        expect(models.practiceSessionPlay.findMany).not.toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ kind: { not: "drill" } }) }));
    });
});
