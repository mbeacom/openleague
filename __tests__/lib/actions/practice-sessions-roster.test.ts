/** The practice roster in createPracticeSession / updatePracticeSession (roster spec R6, R7). */
import { beforeEach, describe, expect, it, vi } from "vitest";

const playIds = vi.hoisted(() => ({ next: 0 }));
vi.mock("@/lib/services/play-ids", () => ({ newPlayId: () => `cnew${playIds.next++}xxxxxxxxxxxxxxxxxxxx` }));

const { mockAuth, models, mockPrisma } = vi.hoisted(() => {
    const models = {
        play: { findMany: vi.fn(), createManyAndReturn: vi.fn(), deleteMany: vi.fn() },
        player: { findMany: vi.fn() },
        practiceSession: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
        practiceSessionPlay: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
        practiceSessionStaff: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
        practiceSessionPlayStaff: { findMany: vi.fn(), createMany: vi.fn() },
        practiceSessionRosterPlayer: { deleteMany: vi.fn(), createMany: vi.fn() },
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
import { ROSTER_PLAYER_TEAM_MESSAGE, ROSTER_PLAYER_TWICE_MESSAGE } from "@/lib/utils/practice-roster";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const USER = "cuserxxxxxxxxxxxxxxxxxxxx";
const SESSION = "csessionxxxxxxxxxxxxxxxxx";
const TEAM_PLAYER = "cplayeronexxxxxxxxxxxxxxx";

type SaveInput = Parameters<typeof createPracticeSession>[0];

function save(extra: Record<string, unknown> = {}): SaveInput {
    return { title: "Hilltop 8U", date: new Date("2026-10-08T22:00:00.000Z"), duration: 60, teamId: TEAM, transitionMinutes: 0, plays: [], ...extra } as SaveInput;
}

const ROSTER = {
    ageGroup: "u8",
    roles: ["S", "G"],
    players: [
        { key: "k1", name: " Alex ", number: "7", role: "S" },
        { key: "k2", name: "", number: "", role: "S" },
        { key: "k3", name: "Shown from team", number: "30", role: "G", playerId: TEAM_PLAYER },
    ],
};

beforeEach(() => {
    vi.clearAllMocks();
    playIds.next = 0;
    mockAuth.requireTeamAdmin.mockResolvedValue(USER);
    models.teamMember.findFirst.mockResolvedValue({ id: "cmemberxxxxxxxxxxxxxxxxxx" });
    models.teamMember.findMany.mockResolvedValue([]);
    models.teamOfficial.findMany.mockResolvedValue([]);
    models.player.findMany.mockResolvedValue([{ id: TEAM_PLAYER }]);
    models.practiceSession.create.mockResolvedValue({ id: SESSION, title: "Hilltop 8U", date: new Date() });
    models.practiceSession.findUnique.mockResolvedValue({ id: SESSION, teamId: TEAM, isShared: false, venueReservationId: null, transitionMinutes: 0 });
    models.practiceSession.update.mockResolvedValue({ id: SESSION, title: "Hilltop 8U", date: new Date() });
    models.practiceSessionPlay.findMany.mockResolvedValue([]);
    models.practiceSessionPlay.deleteMany.mockResolvedValue({ count: 0 });
    models.practiceSessionPlay.createMany.mockResolvedValue({ count: 0 });
    models.practiceSessionStaff.findMany.mockResolvedValue([]);
    models.practiceSessionPlayStaff.findMany.mockResolvedValue([]);
    models.practiceSessionRosterPlayer.deleteMany.mockResolvedValue({ count: 0 });
    models.practiceSessionRosterPlayer.createMany.mockResolvedValue({ count: 3 });
    models.play.findMany.mockResolvedValue([]);
    models.play.deleteMany.mockResolvedValue({ count: 0 });
});

const rosterUpdate = () => models.practiceSession.update.mock.calls.find((call) => "rosterRoles" in (call[0].data ?? {}))?.[0];

describe("createPracticeSession with a roster", () => {
    it("writes the positions and the players in order, a team player as a link only", async () => {
        const result = await createPracticeSession(save({ roster: ROSTER }));
        expect(result.success).toBe(true);
        expect(models.player.findMany).toHaveBeenCalledWith({ where: { id: { in: [TEAM_PLAYER] }, teamId: TEAM }, select: { id: true } });
        expect(rosterUpdate()).toEqual({ where: { id: SESSION }, data: { rosterAgeGroup: "u8", rosterRoles: ["S", "G"] } });
        expect(models.practiceSessionRosterPlayer.createMany).toHaveBeenCalledWith({
            data: [
                { sessionId: SESSION, position: 0, role: "S", playerId: null, name: "Alex", number: "7" },
                { sessionId: SESSION, position: 1, role: "S", playerId: null, name: null, number: null },
                { sessionId: SESSION, position: 2, role: "G", playerId: TEAM_PLAYER, name: null, number: null },
            ],
        });
    });

    it("stores no roster when the create sends none", async () => {
        await createPracticeSession(save());
        expect(models.practiceSessionRosterPlayer.createMany).not.toHaveBeenCalled();
        expect(rosterUpdate()).toBeUndefined();
    });

    it("refuses a player who isn't on the practice's team, before writing anything", async () => {
        models.player.findMany.mockResolvedValue([]);
        const result = await createPracticeSession(save({ roster: ROSTER }));
        expect(result).toMatchObject({ success: false, error: ROSTER_PLAYER_TEAM_MESSAGE });
        expect(models.practiceSession.create).not.toHaveBeenCalled();
        expect(models.practiceSessionRosterPlayer.createMany).not.toHaveBeenCalled();
    });

    it("refuses the same team player twice through the schema", async () => {
        const twice = { ...ROSTER, players: [ROSTER.players[2], { ...ROSTER.players[2], key: "k4" }] };
        const result = await createPracticeSession(save({ roster: twice }));
        expect(result.success).toBe(false);
        expect(JSON.stringify(result)).toContain(ROSTER_PLAYER_TWICE_MESSAGE);
        expect(models.practiceSession.create).not.toHaveBeenCalled();
    });

    it("authorizes before reading any team player", async () => {
        mockAuth.requireTeamAdmin.mockRejectedValue(new Error("Unauthorized: Team admin access required"));
        const result = await createPracticeSession(save({ roster: ROSTER }));
        expect(result.success).toBe(false);
        expect(models.player.findMany).not.toHaveBeenCalled();
    });
});

describe("updatePracticeSession with a roster", () => {
    const update = (extra: Record<string, unknown> = {}) => updatePracticeSession({ ...save(extra), id: SESSION } as Parameters<typeof updatePracticeSession>[0]);

    it("leaves the stored roster alone when the save sends none", async () => {
        const result = await update();
        expect(result.success).toBe(true);
        expect(models.practiceSessionRosterPlayer.deleteMany).not.toHaveBeenCalled();
        expect(rosterUpdate()).toBeUndefined();
    });

    it("replaces the roster whole when sent", async () => {
        await update({ roster: ROSTER });
        expect(models.practiceSessionRosterPlayer.deleteMany).toHaveBeenCalledWith({ where: { sessionId: SESSION } });
        expect(models.practiceSessionRosterPlayer.createMany).toHaveBeenCalled();
    });

    it("clears it on null", async () => {
        await update({ roster: null });
        expect(models.practiceSessionRosterPlayer.deleteMany).toHaveBeenCalledWith({ where: { sessionId: SESSION } });
        expect(rosterUpdate()).toEqual({ where: { id: SESSION }, data: { rosterAgeGroup: null, rosterRoles: [] } });
        expect(models.practiceSessionRosterPlayer.createMany).not.toHaveBeenCalled();
    });

    it("refuses a cross-team player", async () => {
        models.player.findMany.mockResolvedValue([]);
        const result = await update({ roster: ROSTER });
        expect(result).toMatchObject({ success: false, error: ROSTER_PLAYER_TEAM_MESSAGE });
        expect(models.practiceSessionRosterPlayer.deleteMany).not.toHaveBeenCalled();
    });
});
