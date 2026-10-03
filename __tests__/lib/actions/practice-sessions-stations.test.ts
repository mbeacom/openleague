import { beforeEach, describe, expect, it, vi } from "vitest";

// Clone ids are generated before insert; a per-test counter keeps them readable.
const playIds = vi.hoisted(() => ({ next: 0 }));
vi.mock("@/lib/services/play-ids", () => ({ newPlayId: () => `cclone${playIds.next++}xxxxxxxxxxxxxxxxxx` }));

const { mockAuth, models, mockPrisma } = vi.hoisted(() => {
    const models = {
        play: { findMany: vi.fn(), createManyAndReturn: vi.fn(), deleteMany: vi.fn() },
        practiceSession: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
        practiceSessionPlay: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
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

import { createPracticeSession, getPracticeSessionById, updatePracticeSession } from "@/lib/actions/practice-sessions";
import { FIRST_DRILL_STATION_ERROR, STATION_GROUP_CAP_ERROR } from "@/lib/utils/session-timeline";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const USER = "cuserxxxxxxxxxxxxxxxxxxxx";
const SESSION = "csessionxxxxxxxxxxxxxxxxx";
const LIB = "clibraryxxxxxxxxxxxxxxxxx";

type Drill = { duration?: number; runsWithPrevious?: boolean; sequence?: number };

/** A session payload; a drill without runsWithPrevious is sent the way a pre-2b client sends it. */
function input(duration: number, drills: Drill[]) {
    return {
        title: "Tuesday",
        date: new Date("2026-04-07T22:00:00.000Z"),
        duration,
        teamId: TEAM,
        plays: drills.map((drill, index) => ({
            playId: LIB,
            clientKey: `k${index}`,
            sequence: drill.sequence ?? index,
            duration: drill.duration ?? 15,
            instructions: "",
            ...(drill.runsWithPrevious === undefined ? {} : { runsWithPrevious: drill.runsWithPrevious }),
        })),
    };
}

const STATIONS: Drill[] = [{ runsWithPrevious: false }, { runsWithPrevious: true }, { runsWithPrevious: true }];
const SEQUENTIAL: Drill[] = [{}, {}, {}];

type Row = { sequence: number; runsWithPrevious: boolean };

beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.requireTeamAdmin.mockResolvedValue(USER);
    models.teamMember.findFirst.mockResolvedValue({ id: "cmemberxxxxxxxxxxxxxxxxxx" });
    models.practiceSession.create.mockResolvedValue({ id: SESSION, title: "Tuesday", date: new Date() });
    models.practiceSession.findUnique.mockResolvedValue({ id: SESSION, teamId: TEAM, isShared: false, venueReservationId: null });
    models.practiceSession.update.mockResolvedValue({ id: SESSION, title: "Tuesday", date: new Date() });
    models.practiceSessionPlay.findMany.mockResolvedValue([]);
    models.practiceSessionPlay.deleteMany.mockResolvedValue({ count: 0 });
    models.practiceSessionPlay.createMany.mockResolvedValue({ count: 0 });
    models.play.deleteMany.mockResolvedValue({ count: 0 });
    models.play.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.includes(LIB)
            ? [{ id: LIB, teamId: TEAM, name: "Library drill", isTemplate: true, sessionId: null, sourcePlayId: null, description: null, thumbnail: null, playData: {} }]
            : []);
    playIds.next = 0;
    models.play.createManyAndReturn.mockImplementation(async ({ data }: { data: Array<{ id: string; name: string; sourcePlayId: string; sessionId: string }> }) =>
        data.map((d) => ({ id: d.id, name: d.name, sourcePlayId: d.sourcePlayId, sessionId: d.sessionId })));
});

describe("createPracticeSession with stations (2b)", () => {
    it("accepts three 15-minute stations in a 20-minute session and persists the flags", async () => {
        const result = await createPracticeSession(input(20, STATIONS));

        expect(result.success).toBe(true);
        const rows: Row[] = models.practiceSessionPlay.createMany.mock.calls[0][0].data;
        expect(rows.map((row) => [row.sequence, row.runsWithPrevious])).toEqual([[0, false], [1, true], [2, true]]);
    });

    it("rejects the same three drills run one after another", async () => {
        const result = await createPracticeSession(input(20, SEQUENTIAL));

        expect(result).toEqual({ success: false, error: "Practice timeline (45 min) exceeds session duration (20 min)" });
        expect(models.practiceSession.create).not.toHaveBeenCalled();
    });

    it("keeps an existing sequential session valid: wall time equals the sum, and an old client's drills save as sequential", async () => {
        const result = await createPracticeSession(input(45, SEQUENTIAL));

        expect(result.success).toBe(true);
        const rows: Row[] = models.practiceSessionPlay.createMany.mock.calls[0][0].data;
        expect(rows.map((row) => row.runsWithPrevious)).toEqual([false, false, false]);
    });

    it("groups by sequence, not by payload order", async () => {
        const result = await createPracticeSession(input(20, [
            { sequence: 2, runsWithPrevious: true },
            { sequence: 1, runsWithPrevious: true },
            { sequence: 0, runsWithPrevious: false },
        ]));

        expect(result.success).toBe(true);
    });

    it("rejects a first drill (by sequence) that runs with a previous one", async () => {
        const result = await createPracticeSession(input(60, [
            { sequence: 1, runsWithPrevious: false },
            { sequence: 0, runsWithPrevious: true },
        ]));

        expect(result).toEqual({ success: false, error: FIRST_DRILL_STATION_ERROR });
        expect(models.practiceSession.create).not.toHaveBeenCalled();
    });

    it("accepts a block of four and rejects a fifth station", async () => {
        const four: Drill[] = [{}, { runsWithPrevious: true }, { runsWithPrevious: true }, { runsWithPrevious: true }];
        expect((await createPracticeSession(input(60, four))).success).toBe(true);

        const result = await createPracticeSession(input(60, [...four, { runsWithPrevious: true }]));
        expect(result).toEqual({ success: false, error: STATION_GROUP_CAP_ERROR });
    });
});

describe("updatePracticeSession with stations (2b)", () => {
    it("writes runsWithPrevious through the nested create", async () => {
        const result = await updatePracticeSession({ id: SESSION, ...input(20, STATIONS) });

        expect(result.success).toBe(true);
        const created: Row[] = models.practiceSession.update.mock.calls[0][0].data.plays.create;
        expect(created.map((row) => row.runsWithPrevious)).toEqual([false, true, true]);
    });

    it("rejects an over-long sequential timeline before any write", async () => {
        const result = await updatePracticeSession({ id: SESSION, ...input(20, SEQUENTIAL) });

        expect(result).toEqual({ success: false, error: "Practice timeline (45 min) exceeds session duration (20 min)" });
        expect(models.practiceSessionPlay.deleteMany).not.toHaveBeenCalled();
        expect(models.practiceSession.update).not.toHaveBeenCalled();
    });
});

describe("updatePracticeSession rejects an invalid station timeline before any write (2b)", () => {
    function expectNoWrites() {
        expect(models.practiceSessionPlay.deleteMany).not.toHaveBeenCalled();
        expect(models.practiceSessionPlay.createMany).not.toHaveBeenCalled();
        expect(models.play.deleteMany).not.toHaveBeenCalled();
        expect(models.play.createManyAndReturn).not.toHaveBeenCalled();
        expect(models.practiceSession.update).not.toHaveBeenCalled();
    }

    it("rejects a first drill (by sequence) that runs with a previous one", async () => {
        const result = await updatePracticeSession({ id: SESSION, ...input(60, [
            { sequence: 1, runsWithPrevious: false },
            { sequence: 0, runsWithPrevious: true },
        ]) });

        expect(result).toEqual({ success: false, error: FIRST_DRILL_STATION_ERROR });
        expectNoWrites();
    });

    it("rejects a five-drill block", async () => {
        const five: Drill[] = [{}, ...Array.from({ length: 4 }, () => ({ runsWithPrevious: true }))];
        const result = await updatePracticeSession({ id: SESSION, ...input(60, five) });

        expect(result).toEqual({ success: false, error: STATION_GROUP_CAP_ERROR });
        expectNoWrites();
    });

    it("rejects a station block whose wall time (its longest drill) exceeds the session", async () => {
        const result = await updatePracticeSession({ id: SESSION, ...input(20, [
            { duration: 10 },
            { duration: 25, runsWithPrevious: true },
            { duration: 5, runsWithPrevious: true },
        ]) });

        expect(result).toEqual({ success: false, error: "Practice timeline (25 min) exceeds session duration (20 min)" });
        expectNoWrites();
    });
});

describe("getPracticeSessionById (2b)", () => {
    it("reads each drill's station flag and the booked segment's kind", async () => {
        models.practiceSession.findUnique.mockResolvedValue({
            id: SESSION, title: "Tuesday", date: new Date(), duration: 20, isShared: false, teamId: TEAM,
            createdAt: new Date(), updatedAt: new Date(),
            venueId: null, venue: null, surfaceId: null, surface: null,
            segmentId: "csegmentxxxxxxxxxxxxxxxxx", segment: { name: "Half A", kind: "HALF" }, startAt: null,
            plays: [
                { id: "r0", sequence: 0, duration: 15, instructions: null, runsWithPrevious: false, play: { id: LIB, name: "A", description: null, thumbnail: null, playData: createEmptyPlayData() } },
                { id: "r1", sequence: 1, duration: 15, instructions: null, runsWithPrevious: true, play: { id: LIB, name: "B", description: null, thumbnail: null, playData: createEmptyPlayData() } },
            ],
        });

        const result = await getPracticeSessionById({ id: SESSION, teamId: TEAM });

        expect(result).toMatchObject({
            success: true,
            data: { segmentKind: "HALF", plays: [{ runsWithPrevious: false }, { runsWithPrevious: true }] },
        });
        const select = models.practiceSession.findUnique.mock.calls[0][0].select;
        expect(select.plays.select.runsWithPrevious).toBe(true);
        expect(select.segment).toEqual({ select: { name: true, kind: true } });
    });
});
