import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  mockRequireEventManager,
  mockGetCurrentUserId,
  mockCanViewSignupEvent,
  mockTeamsEmail,
  mockCreateVenueReservation,
  mockAssignVenueReservation,
  mockTransitionVenueReservation,
  mockPrisma,
} = vi.hoisted(() => ({
  mockRequireEventManager: vi.fn(),
  mockGetCurrentUserId: vi.fn(),
  mockCanViewSignupEvent: vi.fn(),
  mockTeamsEmail: vi.fn(),
  mockCreateVenueReservation: vi.fn(),
  mockAssignVenueReservation: vi.fn(),
  mockTransitionVenueReservation: vi.fn(),
  mockPrisma: {
    $transaction: vi.fn(async (ops: unknown) =>
      typeof ops === "function" ? ops(mockPrisma) : Promise.all(ops as Promise<unknown>[])),
    signupEvent: { findUnique: vi.fn(), update: vi.fn() },
    eventTeam: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    eventTeamAssignment: { upsert: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), delete: vi.fn() },
    eventRegistration: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    eventGame: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    eventGameParticipant: { deleteMany: vi.fn(), createMany: vi.fn() },
    iceSurface: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
    venueReservation: undefined as unknown as Record<string, ReturnType<typeof vi.fn>>,
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

vi.mock("@/lib/utils/event-access", () => ({
  canViewSignupEvent: (...args: unknown[]) => mockCanViewSignupEvent(...args),
}));

vi.mock("@/lib/actions/venue-organizations", () => ({}));
vi.mock("@/lib/services/venue-reservations", () => ({
  assignVenueReservation: (...args: unknown[]) => mockAssignVenueReservation(...args),
  createVenueReservation: (...args: unknown[]) => mockCreateVenueReservation(...args),
  transitionVenueReservation: (...args: unknown[]) => mockTransitionVenueReservation(...args),
  VenueReservationConflictError: class extends Error {
    conflicts: unknown[];
    constructor(conflicts: unknown[]) {
      super("conflict");
      this.conflicts = conflicts;
    }
  },
  VenueReservationLifecycleError: class extends Error {},
}));

import {
  assignToEventTeam,
  publishEventTeams,
  setGameRotation,
  upsertEventGame,
  deleteEventGame,
  getPublicEventGames,
  getMyEventAssignments,
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
    mockPrisma.venueReservation = undefined as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockRequireEventManager.mockResolvedValue("admin-1");
    mockPrisma.eventTeam.findUnique.mockResolvedValue({
      id: TEAM_RED,
      name: "Red",
      eventId: EVENT_ID,
      event: { id: EVENT_ID, title: "Mite Night", teamsPublishedAt: null },
    });
  });

  it("reassigns participants in a single delete-then-create transaction (moves them)", async () => {
    mockPrisma.eventRegistration.findMany.mockResolvedValue([
      { id: "creg000000001", registrant: { email: "a@example.com", name: "A" } },
      { id: "creg000000002", registrant: { email: "b@example.com", name: "B" } },
    ]);

    const result = await assignToEventTeam({
      eventTeamId: TEAM_RED,
      registrationIds: ["creg000000001", "creg000000002"],
    });

    expect(result).toEqual({ success: true, data: { assigned: 2 } });
    // Old assignments are cleared, then the new team's rows created in bulk —
    // no per-registration upsert roundtrips.
    expect(mockPrisma.eventTeamAssignment.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.eventTeamAssignment.deleteMany).toHaveBeenCalledWith({
      where: { registrationId: { in: ["creg000000001", "creg000000002"] } },
    });
    expect(mockPrisma.eventTeamAssignment.createMany).toHaveBeenCalledWith({
      data: [
        { registrationId: "creg000000001", eventTeamId: TEAM_RED, assignedById: "admin-1" },
        { registrationId: "creg000000002", eventTeamId: TEAM_RED, assignedById: "admin-1" },
      ],
    });
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
    expect(mockPrisma.eventTeamAssignment.createMany).not.toHaveBeenCalled();
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

    await assignToEventTeam({ eventTeamId: TEAM_RED, registrationIds: ["creg000000001"] });

    expect(mockTeamsEmail).toHaveBeenCalledWith(
      expect.objectContaining({ isInitialPublish: false, eventTitle: "Mite Night" })
    );
  });
});

describe("setGameRotation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.venueReservation = undefined as unknown as Record<string, ReturnType<typeof vi.fn>>;
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

describe("EventGame / parent-signup publication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.venueReservation = undefined as unknown as Record<string, ReturnType<typeof vi.fn>>;
    mockRequireEventManager.mockResolvedValue("admin-1");
    mockGetCurrentUserId.mockResolvedValue(null);
    mockCanViewSignupEvent.mockResolvedValue(true);
    mockPrisma.signupEvent.findUnique.mockResolvedValue({
      id: EVENT_ID,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      linkToken: null,
      teamsPublishedAt: new Date(),
      ageClassification: "U8",
    });
    mockPrisma.eventGame.findMany.mockResolvedValue([]);
  });

  it("threads a single reservation through a published EventGame and its parent signup event", async () => {
    mockPrisma.eventTeam.findMany.mockResolvedValue([
      { id: TEAM_RED, eventId: EVENT_ID },
      { id: TEAM_WHITE, eventId: EVENT_ID },
    ]);
    mockPrisma.eventGame.create.mockResolvedValue({ id: GAME_ID });

    await upsertEventGame({
      eventId: EVENT_ID,
      name: "Championship",
      homeTeamId: TEAM_RED,
      awayTeamId: TEAM_WHITE,
      startAt: gameStart,
      endAt: gameEnd,
      venueId: "clvenue0000000000000001",
      reservationId: "clreservation0000000001",
    });

    expect(mockPrisma.eventGame.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          venueReservationId: "clreservation0000000001",
        }),
      }),
    );
  });

  it("rejects a cross-event update before mutating the foreign game", async () => {
    mockPrisma.eventTeam.findMany.mockResolvedValue([
      { id: TEAM_RED, eventId: EVENT_ID },
      { id: TEAM_WHITE, eventId: EVENT_ID },
    ]);
    mockPrisma.eventGame.findFirst.mockResolvedValue(null);

    const result = await upsertEventGame({
      eventId: EVENT_ID,
      gameId: GAME_ID,
      homeTeamId: TEAM_RED,
      awayTeamId: TEAM_WHITE,
      startAt: gameStart,
      endAt: gameEnd,
    });

    expect(result).toEqual({ success: false, error: "Game not found for this event" });
    expect(mockPrisma.eventGame.update).not.toHaveBeenCalled();
  });

  it("gives a partial-window child game its own reservation and excludes the parent claim", async () => {
    mockPrisma.venueReservation = { findUnique: vi.fn(), findFirst: vi.fn() };
    const parentReservation = {
      id: "clparentreservation0000001",
      venueId: "clvenue0000000000000001",
      surfaceId: null,
      segmentId: null,
      startsAt: gameStart,
      endsAt: gameEnd,
    };
    mockPrisma.signupEvent.findUnique.mockResolvedValue({
      id: EVENT_ID,
      status: "PUBLISHED",
      venueId: parentReservation.venueId,
      startAt: gameStart,
      endAt: gameEnd,
      timezone: "America/New_York",
      hostOrganizationId: "clorg000000000000000001",
      hostLeagueId: null,
      hostTeamId: null,
      venueReservation: parentReservation,
    });
    mockPrisma.eventTeam.findMany.mockResolvedValue([
      { id: TEAM_RED, eventId: EVENT_ID },
      { id: TEAM_WHITE, eventId: EVENT_ID },
    ]);
    mockPrisma.eventGame.create.mockResolvedValue({ id: GAME_ID });
    mockCreateVenueReservation.mockResolvedValue({ id: "clchildreservation000001" });

    const result = await upsertEventGame({
      eventId: EVENT_ID,
      homeTeamId: TEAM_RED,
      awayTeamId: TEAM_WHITE,
      startAt: new Date(gameStart.getTime() + 15 * 60 * 1000),
      endAt: new Date(gameEnd.getTime() - 15 * 60 * 1000),
      venueId: parentReservation.venueId,
    });

    expect(result.success).toBe(true);
    expect(mockCreateVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ excludeReservationIds: [parentReservation.id] }),
    );
    expect(mockAssignVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        targetType: "EVENT_GAME",
        targetId: GAME_ID,
        excludeReservationIds: [parentReservation.id],
      }),
    );
    expect(mockAssignVenueReservation).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetType: "SIGNUP_EVENT" }),
    );
  });

  it("keeps draft games non-occupying after rechecking the parent in the transaction", async () => {
    mockPrisma.venueReservation = { findUnique: vi.fn(), findFirst: vi.fn() };
    mockPrisma.signupEvent.findUnique.mockResolvedValue({
      id: EVENT_ID,
      status: "DRAFT",
      venueId: "clvenue0000000000000001",
      startAt: gameStart,
      endAt: gameEnd,
      timezone: "America/New_York",
      hostOrganizationId: "clorg000000000000000001",
      hostLeagueId: null,
      hostTeamId: null,
      venueReservation: null,
    });
    mockPrisma.eventTeam.findMany.mockResolvedValue([
      { id: TEAM_RED, eventId: EVENT_ID },
      { id: TEAM_WHITE, eventId: EVENT_ID },
    ]);
    mockPrisma.eventGame.create.mockResolvedValue({ id: GAME_ID });

    const result = await upsertEventGame({
      eventId: EVENT_ID,
      homeTeamId: TEAM_RED,
      awayTeamId: TEAM_WHITE,
      startAt: gameStart,
      endAt: gameEnd,
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.eventGame.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ venueReservationId: null }),
      }),
    );
    expect(mockCreateVenueReservation).not.toHaveBeenCalled();
    expect(mockAssignVenueReservation).not.toHaveBeenCalled();
  });

  it("loses the save race when the parent is canceled before the transaction reads it", async () => {
    mockPrisma.venueReservation = { findUnique: vi.fn(), findFirst: vi.fn() };
    const parent = {
      id: EVENT_ID,
      status: "DRAFT",
      venueId: "clvenue0000000000000001",
      startAt: gameStart,
      endAt: gameEnd,
      timezone: "America/New_York",
      hostOrganizationId: "clorg000000000000000001",
      hostLeagueId: null,
      hostTeamId: null,
      venueReservation: null,
    };
    mockPrisma.signupEvent.findUnique
      .mockResolvedValueOnce(parent)
      .mockResolvedValueOnce({ ...parent, status: "CANCELED" });
    mockPrisma.eventTeam.findMany.mockResolvedValue([
      { id: TEAM_RED, eventId: EVENT_ID },
      { id: TEAM_WHITE, eventId: EVENT_ID },
    ]);

    const result = await upsertEventGame({
      eventId: EVENT_ID,
      homeTeamId: TEAM_RED,
      awayTeamId: TEAM_WHITE,
      startAt: gameStart,
      endAt: gameEnd,
    });

    expect(result).toEqual({
      success: false,
      error: "Games cannot be saved for a canceled event.",
    });
    expect(mockPrisma.eventGame.create).not.toHaveBeenCalled();
    expect(mockCreateVenueReservation).not.toHaveBeenCalled();
  });

  it("detaches confirmed inventory before deleting its game", async () => {
    mockPrisma.venueReservation = { findUnique: vi.fn(), findFirst: vi.fn() };
    mockPrisma.eventGame.findUnique.mockResolvedValue({
      id: GAME_ID,
      eventId: EVENT_ID,
      venueReservationId: "clreservation0000000001",
    });
    mockPrisma.eventGame.findFirst.mockResolvedValue({
      id: GAME_ID,
      eventId: EVENT_ID,
      venueReservationId: "clreservation0000000001",
      event: {
        id: EVENT_ID,
        hostOrganizationId: "clorg000000000000000001",
        hostLeagueId: null,
        hostTeamId: null,
      },
    });
    mockPrisma.venueReservation.findUnique.mockResolvedValue({
      id: "clreservation0000000001",
      status: "CONFIRMED",
      signupEvents: [],
      eventGames: [{ id: GAME_ID }],
    });

    const result = await deleteEventGame({ gameId: GAME_ID });

    expect(result.success).toBe(true);
    expect(mockTransitionVenueReservation).not.toHaveBeenCalled();
    expect(mockPrisma.eventGame.delete).toHaveBeenCalledWith({ where: { id: GAME_ID } });
  });

  it("keeps the public selector published-only and privacy-safe", async () => {
    mockPrisma.eventGame.findMany.mockResolvedValue([
      {
        id: GAME_ID,
        name: "Final",
        status: "SCHEDULED",
        startAt: gameStart,
        endAt: gameEnd,
        homeScore: 4,
        awayScore: 2,
        surface: { name: "Rink A" },
        segment: { id: "clsegment0000000000001", name: "Half" },
        homeTeam: { name: "Arrows", colorHex: "#fff" },
        awayTeam: { name: "Blizzards", colorHex: "#000" },
      },
    ]);

    const result = await getPublicEventGames(EVENT_ID);

    expect(result).toEqual([
      expect.objectContaining({
        id: GAME_ID,
        homeScore: null,
        awayScore: null,
      }),
    ]);
    expect(JSON.stringify(result)).not.toMatch(/registrant|guardian|payment|invitation|audit/i);
  });

  it("does not duplicate a participant's primary game when the rotation list references the same booking", async () => {
    mockGetCurrentUserId.mockResolvedValue("user-1");
    mockPrisma.signupEvent.findUnique.mockResolvedValue({
      id: EVENT_ID,
      teamsPublishedAt: new Date(),
    });
    mockPrisma.eventRegistration.findMany.mockResolvedValue([
      {
        id: "creg00000000000000001",
        participantName: "Skater One",
        isFloater: false,
        teamAssignment: {
          eventTeam: { id: TEAM_RED, name: "Red", colorHex: "#f00" },
        },
        gameParticipations: [
          {
            eventTeam: { name: "Red" },
            game: {
              id: GAME_ID,
              name: "Red vs White",
              startAt: gameStart,
              endAt: gameEnd,
              segment: null,
              homeTeam: { name: "Red" },
              awayTeam: { name: "White" },
            },
          },
        ],
      },
    ]);
    mockPrisma.eventGame.findMany.mockResolvedValue([
      {
        id: GAME_ID,
        name: "Red vs White",
        startAt: gameStart,
        endAt: gameEnd,
        segment: null,
        homeTeamId: TEAM_RED,
        awayTeamId: TEAM_WHITE,
        homeTeam: { name: "Red" },
        awayTeam: { name: "White" },
      },
    ]);

    const result = await getMyEventAssignments(EVENT_ID);

    expect(result).toHaveLength(1);
    expect(result?.[0].games).toHaveLength(1);
    expect(result?.[0].games[0]).toEqual(
      expect.objectContaining({
        id: GAME_ID,
        name: "Red vs White",
      }),
    );
  });
});
