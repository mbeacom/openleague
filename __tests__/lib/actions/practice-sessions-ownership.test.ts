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

import { createPracticeSession, updatePracticeSession } from "@/lib/actions/practice-sessions";

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
            { sessionId: SESSION, playId: "cclone0xxxxxxxxxxxxxxxxxx", sequence: 0, runsWithPrevious: false, duration: 10, instructions: null },
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
        expect(models.practiceSessionPlay.findMany.mock.invocationCallOrder[0])
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
