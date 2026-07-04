import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { mockRequireEventManager, mockGetCurrentUserId, mockTeamsEmail, mockPrisma } = vi.hoisted(() => ({
  mockRequireEventManager: vi.fn(),
  mockGetCurrentUserId: vi.fn(),
  mockTeamsEmail: vi.fn(),
  mockPrisma: {
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
    signupEvent: { findUnique: vi.fn(), update: vi.fn() },
    eventTeam: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    eventTeamAssignment: { upsert: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), delete: vi.fn() },
    eventRegistration: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    eventGame: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    eventGameParticipant: { deleteMany: vi.fn(), createMany: vi.fn() },
    iceSurface: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireEventManager: (...args: unknown[]) => mockRequireEventManager(...args),
  getCurrentUserId: (...args: unknown[]) => mockGetCurrentUserId(...args),
  isEventManager: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/email/templates", () => ({
  sendEventTeamsUpdateEmail: (...args: unknown[]) => mockTeamsEmail(...args),
}));

vi.mock("@/lib/actions/venue-organizations", () => ({}));

import {
  assignToEventTeam,
  publishEventTeams,
  setGameRotation,
} from "@/lib/actions/event-teams";

const EVENT_ID = "cldevent0000000000000001";
const TEAM_RED = "cldteamred00000000000001";
const TEAM_WHITE = "cldteamwhite000000000001";
const GAME_ID = "cldgame00000000000000001";
const hour = 60 * 60 * 1000;
const gameStart = new Date(Date.now() + 7 * 24 * hour);
const gameEnd = new Date(gameStart.getTime() + hour);

describe("assignToEventTeam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireEventManager.mockResolvedValue("admin-1");
    mockPrisma.eventTeam.findUnique.mockResolvedValue({
      id: TEAM_RED,
      name: "Red",
      eventId: EVENT_ID,
      event: { id: EVENT_ID, title: "Mite Night", teamsPublishedAt: null },
    });
  });

  it("upserts one primary assignment per participant (reassignment moves them)", async () => {
    mockPrisma.eventRegistration.findMany.mockResolvedValue([
      { id: "creg000000001", registrant: { email: "a@example.com", name: "A" } },
      { id: "creg000000002", registrant: { email: "b@example.com", name: "B" } },
    ]);
    mockPrisma.eventTeamAssignment.upsert.mockResolvedValue({});

    const result = await assignToEventTeam({
      eventTeamId: TEAM_RED,
      registrationIds: ["creg000000001", "creg000000002"],
    });

    expect(result).toEqual({ success: true, data: { assigned: 2 } });
    expect(mockPrisma.eventTeamAssignment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { registrationId: "creg000000001" },
        update: { eventTeamId: TEAM_RED, assignedById: "admin-1" },
      })
    );
    // Teams not posted yet — no notifications.
    expect(mockTeamsEmail).not.toHaveBeenCalled();
  });

  it("rejects unconfirmed or foreign registrations", async () => {
    mockPrisma.eventRegistration.findMany.mockResolvedValue([
      { id: "creg000000001", registrant: { email: "a@example.com", name: "A" } },
    ]);

    const result = await assignToEventTeam({
      eventTeamId: TEAM_RED,
      registrationIds: ["creg000000001", "cregwaitlisted001"],
    });

    expect(result.success).toBe(false);
    expect(mockPrisma.eventTeamAssignment.upsert).not.toHaveBeenCalled();
  });

  it("notifies affected families when teams are already posted", async () => {
    mockPrisma.eventTeam.findUnique.mockResolvedValue({
      id: TEAM_RED,
      name: "Red",
      eventId: EVENT_ID,
      event: { id: EVENT_ID, title: "Mite Night", teamsPublishedAt: new Date() },
    });
    mockPrisma.eventRegistration.findMany.mockResolvedValue([
      { id: "creg000000001", registrant: { email: "a@example.com", name: "A" } },
    ]);
    mockPrisma.eventTeamAssignment.upsert.mockResolvedValue({});

    await assignToEventTeam({ eventTeamId: TEAM_RED, registrationIds: ["creg000000001"] });

    expect(mockTeamsEmail).toHaveBeenCalledWith(
      expect.objectContaining({ isInitialPublish: false, eventTitle: "Mite Night" })
    );
  });
});

describe("setGameRotation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireEventManager.mockResolvedValue("admin-1");
    mockPrisma.eventGame.findUnique.mockResolvedValue({
      id: GAME_ID,
      eventId: EVENT_ID,
      startAt: gameStart,
      endAt: gameEnd,
      homeTeamId: TEAM_RED,
      awayTeamId: TEAM_WHITE,
    });
  });

  it("lets a floater rotate onto either side of any game", async () => {
    mockPrisma.eventRegistration.findMany.mockResolvedValue([
      {
        id: "cregfloater0001",
        participantName: "Mite 3 Floater",
        isFloater: true,
        teamAssignment: { eventTeamId: "some-other-team" },
        gameParticipations: [
          { game: { startAt: gameStart, endAt: gameEnd, name: "Other overlapping game" } },
        ],
      },
    ]);

    const result = await setGameRotation({
      gameId: GAME_ID,
      entries: [{ registrationId: "cregfloater0001", eventTeamId: TEAM_WHITE }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // Floaters never warn — rotating through games is their whole job.
      expect(result.data.warnings).toEqual([]);
    }
    expect(mockPrisma.eventGameParticipant.createMany).toHaveBeenCalledWith({
      data: [{ gameId: GAME_ID, registrationId: "cregfloater0001", eventTeamId: TEAM_WHITE }],
    });
  });

  it("warns when a non-floater is double-booked into overlapping games", async () => {
    mockPrisma.eventRegistration.findMany.mockResolvedValue([
      {
        id: "creghouse00001",
        participantName: "House Kid",
        isFloater: false,
        teamAssignment: { eventTeamId: TEAM_RED },
        gameParticipations: [
          { game: { startAt: gameStart, endAt: gameEnd, name: "South half game" } },
        ],
      },
    ]);

    const result = await setGameRotation({
      gameId: GAME_ID,
      entries: [{ registrationId: "creghouse00001", eventTeamId: TEAM_RED }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.warnings.join(" ")).toContain("overlapping game");
    }
    // Warnings are soft — the rotation is still applied (organizer's call).
    expect(mockPrisma.eventGameParticipant.createMany).toHaveBeenCalled();
  });

  it("warns when a non-floater rotates onto a team other than their primary", async () => {
    mockPrisma.eventRegistration.findMany.mockResolvedValue([
      {
        id: "creghouse00001",
        participantName: "House Kid",
        isFloater: false,
        teamAssignment: { eventTeamId: TEAM_RED },
        gameParticipations: [],
      },
    ]);

    const result = await setGameRotation({
      gameId: GAME_ID,
      entries: [{ registrationId: "creghouse00001", eventTeamId: TEAM_WHITE }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.warnings.join(" ")).toContain("isn't flagged as a floater");
    }
  });

  it("rejects sides that are not one of the game's two teams", async () => {
    const result = await setGameRotation({
      gameId: GAME_ID,
      entries: [{ registrationId: "cldreg000000000000000001", eventTeamId: "cldteamblue0000000000001" }],
    });

    expect(result).toEqual({
      success: false,
      error: "Rotation entries must skate for one of this game's two teams.",
    });
  });
});

describe("publishEventTeams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireEventManager.mockResolvedValue("admin-1");
    mockPrisma.signupEvent.findUnique
      .mockResolvedValueOnce({ id: EVENT_ID, title: "Mite Night", teamsPublishedAt: null })
      // logSignupEventActivity host lookup
      .mockResolvedValue({ hostLeagueId: "league-1", hostTeamId: null });
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it("posts teams and notifies each family once", async () => {
    mockPrisma.eventTeamAssignment.findMany.mockResolvedValue([
      { registration: { registrant: { email: "family@example.com", name: "Family" } } },
      { registration: { registrant: { email: "family@example.com", name: "Family" } } },
      { registration: { registrant: { email: "other@example.com", name: "Other" } } },
    ]);
    mockPrisma.signupEvent.update.mockResolvedValue({});

    const result = await publishEventTeams({ eventId: EVENT_ID });

    expect(result).toEqual({ success: true, data: { eventId: EVENT_ID, notified: 2 } });
    expect(mockPrisma.signupEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { teamsPublishedAt: expect.any(Date) } })
    );
    const recipients = mockTeamsEmail.mock.calls[0][0].recipients;
    expect(recipients).toHaveLength(2);
  });

  it("refuses to post before anyone is assigned", async () => {
    mockPrisma.eventTeamAssignment.findMany.mockResolvedValue([]);

    const result = await publishEventTeams({ eventId: EVENT_ID });

    expect(result).toEqual({ success: false, error: "Assign participants to teams before posting." });
    expect(mockPrisma.signupEvent.update).not.toHaveBeenCalled();
  });
});
