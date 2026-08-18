import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireTeamAdmin,
  mockRequireLeagueRole,
  mockFindBookingConflicts,
  mockFindReservationConflicts,
  mockPrisma,
} = vi.hoisted(() => {
  const tx = {
    gameProposal: { findUnique: vi.fn(), updateMany: vi.fn() },
    gameProposalEntry: { create: vi.fn(), updateMany: vi.fn() },
    season: { findUnique: vi.fn(), findFirst: vi.fn() },
    seasonPhase: { findFirst: vi.fn() },
    seasonGame: { create: vi.fn(), updateMany: vi.fn() },
    event: { create: vi.fn(), updateMany: vi.fn() },
    team: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findMany: vi.fn() },
    teamMember: { findMany: vi.fn(), findFirst: vi.fn() },
    venue: { findUnique: vi.fn() },
    venueRelationship: { findFirst: vi.fn() },
    venueStaff: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
    venueReservation: undefined as
      | undefined
      | {
          findUnique: ReturnType<typeof vi.fn>;
          update: ReturnType<typeof vi.fn>;
        },
  };
  return {
    mockRequireTeamAdmin: vi.fn(),
    mockRequireLeagueRole: vi.fn(),
    mockFindBookingConflicts: vi.fn(),
    mockFindReservationConflicts: vi.fn(),
    mockPrisma: {
      gameProposal: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
      gameProposalEntry: { create: vi.fn(), updateMany: vi.fn() },
      season: { findUnique: vi.fn(), findFirst: vi.fn() },
      seasonPhase: { findFirst: vi.fn() },
      seasonGame: tx.seasonGame,
      event: tx.event,
      team: tx.team,
      teamMember: tx.teamMember,
      venue: tx.venue,
      venueRelationship: tx.venueRelationship,
      venueStaff: tx.venueStaff,
      auditLog: tx.auditLog,
      venueReservation: tx.venueReservation,
      $transaction: vi.fn(
        async (callback: (transaction: typeof tx) => unknown) =>
          callback(mockPrisma),
      ),
    },
  };
});

vi.mock("@/lib/auth/session", () => ({
  requireTeamAdmin: (...args: unknown[]) => mockRequireTeamAdmin(...args),
  requireLeagueRole: (...args: unknown[]) => mockRequireLeagueRole(...args),
  requireUserId: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/utils/availability", () => ({
  findBookingConflicts: (...args: unknown[]) => mockFindBookingConflicts(...args),
}));
vi.mock("@/lib/services/venue-reservation-availability", () => ({
  findVenueReservationWriteConflicts: (...args: unknown[]) =>
    mockFindReservationConflicts(...args),
}));
vi.mock("@/lib/email/templates", () => ({
  sendEventNotifications: vi.fn(() => Promise.resolve()),
  sendGameProposalNotifications: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/actions/season-games", () => ({
  createGameEventWithRsvps: vi.fn(),
}));

import { acceptGameProposal } from "@/lib/actions/game-proposals";

const PROPOSAL_ID = "clproposal000000000001";
const LEAGUE_ID = "clleague0000000000000001";
const SEASON_ID = "clseason000000000000001";
const VENUE_ID = "clvenue00000000000000001";
const TEAM_A = "clteam00000000000000001";
const TEAM_B = "clteam00000000000000002";
const RESERVATION_ID = "clreservation0000000001";
const USER_ID = "cluser000000000000000001";
const EVENT_ID = "clevent0000000000000001";
const GAME_ID = "clgame000000000000000001";

let activeReservationAliases: string[];

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.venueReservation = undefined;
  activeReservationAliases = ["proposal-entry"];
  mockRequireTeamAdmin.mockResolvedValue(USER_ID);
  mockRequireLeagueRole.mockResolvedValue(USER_ID);
  mockFindBookingConflicts.mockResolvedValue([]);
  mockFindReservationConflicts.mockResolvedValue([]);
  mockPrisma.gameProposal.findUnique.mockResolvedValue({
    id: PROPOSAL_ID,
    status: "PENDING",
    leagueId: LEAGUE_ID,
    proposingTeamId: TEAM_A,
    receivingTeamId: TEAM_B,
    seasonId: SEASON_ID,
    entries: [
      {
        id: "entry-1",
        kind: "PROPOSE",
        startAt: new Date("2026-09-05T22:00:00.000Z"),
        endAt: new Date("2026-09-05T23:30:00.000Z"),
        venueId: VENUE_ID,
        note: null,
        actorTeamId: TEAM_A,
        createdAt: new Date("2026-08-17T00:00:00.000Z"),
        venueReservationId: RESERVATION_ID,
      },
    ],
  });
  mockPrisma.gameProposal.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.gameProposalEntry.updateMany.mockImplementation(async () => {
    activeReservationAliases = activeReservationAliases.filter(
      (alias) => alias !== "proposal-entry",
    );
    return { count: 1 };
  });
  mockPrisma.season.findUnique.mockResolvedValue({ id: SEASON_ID });
  mockPrisma.season.findFirst.mockResolvedValue({ id: SEASON_ID });
  mockPrisma.seasonPhase.findFirst.mockResolvedValue({ id: "clphase000000000000001" });
  mockPrisma.venue.findUnique.mockResolvedValue({ name: "North Rink", timezone: "America/New_York" });
  mockPrisma.team.findUniqueOrThrow.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    name: where.id === TEAM_A ? "Arrows" : "Blizzards",
  }));
  mockPrisma.teamMember.findMany.mockResolvedValue([{ userId: "p1" }, { userId: "p2" }]);
  mockPrisma.teamMember.findFirst.mockResolvedValue({ id: "membership-1" });
  mockPrisma.seasonGame.create.mockImplementation(async () => {
    activeReservationAliases.push("season-game");
    return { id: GAME_ID };
  });
  mockPrisma.event.create.mockImplementation(async () => {
    activeReservationAliases.push("event");
    return { id: EVENT_ID };
  });
});

describe("reservation-backed proposal acceptance", () => {
  it("threads one reservation into the accepted game and its participant Event", async () => {
    const result = await acceptGameProposal({
      proposalId: PROPOSAL_ID,
      reservationId: RESERVATION_ID,
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.gameProposalEntry.updateMany).toHaveBeenCalledWith({
      where: {
        proposalId: PROPOSAL_ID,
        venueReservationId: RESERVATION_ID,
      },
      data: { venueReservationId: null },
    });
    expect(mockPrisma.gameProposalEntry.create).toHaveBeenCalledWith({
      data: expect.not.objectContaining({
        venueReservationId: expect.anything(),
      }),
    });
    expect(mockPrisma.seasonGame.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          venueReservationId: RESERVATION_ID,
        }),
      }),
    );
    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          venueReservationId: RESERVATION_ID,
          rsvps: {
            create: [
              { userId: "p1", status: "NO_RESPONSE" },
              { userId: "p2", status: "NO_RESPONSE" },
            ],
          },
        }),
      }),
    );
    expect(activeReservationAliases).toEqual(["season-game", "event"]);
  });

  it("atomically assigns proposer-owned inventory when both exact teams consent", async () => {
    const reservation = {
      id: RESERVATION_ID,
      status: "CONFIRMED",
      usageStatus: "PENDING",
      venueId: VENUE_ID,
      surfaceId: null,
      segmentId: null,
      startsAt: new Date("2026-09-05T22:00:00.000Z"),
      endsAt: new Date("2026-09-05T23:30:00.000Z"),
      ownerLeagueId: null,
      ownerTeamId: TEAM_A,
      ownerVenueOrganizationId: null,
      ownerTeam: { leagueId: LEAGUE_ID },
      venue: {
        id: VENUE_ID,
        isActive: true,
        timezone: "America/New_York",
        organizationId: null,
        leagueId: null,
        teamId: TEAM_A,
      },
      events: [],
      seasonGames: [],
      eventGames: [],
      signupEvents: [],
      practiceSessions: [],
      proposalEntries: [],
    };
    mockPrisma.venueReservation = {
      findUnique: vi.fn().mockResolvedValue(reservation),
      update: vi.fn().mockResolvedValue(reservation),
    };
    mockPrisma.team.findMany.mockResolvedValue([
      { id: TEAM_A, leagueId: LEAGUE_ID },
      { id: TEAM_B, leagueId: LEAGUE_ID },
    ]);
    mockPrisma.team.findUnique.mockResolvedValue({
      id: TEAM_A,
      leagueId: LEAGUE_ID,
    });
    mockPrisma.team.findUniqueOrThrow.mockImplementation(
      async ({ where }: { where: { id: string } }) => ({
        name: where.id === TEAM_A ? "Arrows" : "Blizzards",
      }),
    );
    mockPrisma.seasonGame.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.event.updateMany.mockResolvedValue({ count: 1 });

    const result = await acceptGameProposal({
      proposalId: PROPOSAL_ID,
      reservationId: RESERVATION_ID,
    });

    expect(result).toEqual({ success: true, data: { gameId: GAME_ID } });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.seasonGame.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: GAME_ID,
        proposalId: PROPOSAL_ID,
        homeTeamId: TEAM_A,
        awayTeamId: TEAM_B,
        venueReservationId: null,
      }),
      data: { venueReservationId: RESERVATION_ID },
    });
    expect(mockPrisma.event.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: EVENT_ID,
        teamId: TEAM_A,
        homeTeamId: TEAM_A,
        awayTeamId: TEAM_B,
        leagueId: LEAGUE_ID,
        venueReservationId: null,
      }),
      data: { venueReservationId: RESERVATION_ID },
    });
    expect(mockPrisma.venueReservation.update).toHaveBeenCalledWith({
      where: { id: RESERVATION_ID },
      data: { assignedById: USER_ID },
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "VENUE_RESERVATION_ASSIGNED",
        userId: USER_ID,
        leagueId: LEAGUE_ID,
        teamId: TEAM_A,
        details: expect.objectContaining({
          proposalId: PROPOSAL_ID,
          consentTeamIds: [TEAM_A, TEAM_B],
        }),
      }),
    });
  });

  it("rejects inventory owned by a team outside the exact proposal", async () => {
    const outsideTeamId = "clteam00000000000000003";
    mockPrisma.venueReservation = {
      findUnique: vi.fn().mockResolvedValue({
        id: RESERVATION_ID,
        status: "CONFIRMED",
        venueId: VENUE_ID,
        surfaceId: null,
        segmentId: null,
        startsAt: new Date("2026-09-05T22:00:00.000Z"),
        endsAt: new Date("2026-09-05T23:30:00.000Z"),
        ownerLeagueId: null,
        ownerTeamId: outsideTeamId,
        ownerVenueOrganizationId: null,
        ownerTeam: { leagueId: LEAGUE_ID },
        venue: {
          id: VENUE_ID,
          isActive: true,
          timezone: "America/New_York",
          organizationId: null,
          leagueId: null,
          teamId: outsideTeamId,
        },
        events: [],
        seasonGames: [],
        eventGames: [],
        signupEvents: [],
        practiceSessions: [],
        proposalEntries: [],
      }),
      update: vi.fn(),
    };
    mockPrisma.team.findUnique.mockResolvedValue({
      id: outsideTeamId,
      leagueId: LEAGUE_ID,
    });

    const result = await acceptGameProposal({
      proposalId: PROPOSAL_ID,
      reservationId: RESERVATION_ID,
    });

    expect(result).toEqual({
      success: false,
      error: "The selected venue reservation is outside the proposal's league/team scope or does not match its slot.",
    });
    expect(mockPrisma.seasonGame.create).not.toHaveBeenCalled();
    expect(mockPrisma.event.create).not.toHaveBeenCalled();
  });

  it("rejects a proposal owner that is no longer eligible for the venue", async () => {
    mockPrisma.venueReservation = {
      findUnique: vi.fn().mockResolvedValue({
        id: RESERVATION_ID,
        status: "CONFIRMED",
        venueId: VENUE_ID,
        surfaceId: null,
        segmentId: null,
        startsAt: new Date("2026-09-05T22:00:00.000Z"),
        endsAt: new Date("2026-09-05T23:30:00.000Z"),
        ownerLeagueId: null,
        ownerTeamId: TEAM_A,
        ownerVenueOrganizationId: null,
        ownerTeam: { leagueId: LEAGUE_ID },
        venue: {
          id: VENUE_ID,
          isActive: true,
          timezone: "America/New_York",
          organizationId: null,
          leagueId: null,
          teamId: null,
        },
        events: [],
        seasonGames: [],
        eventGames: [],
        signupEvents: [],
        practiceSessions: [],
        proposalEntries: [],
      }),
      update: vi.fn(),
    };
    mockPrisma.team.findUnique.mockResolvedValue({
      id: TEAM_A,
      leagueId: LEAGUE_ID,
    });
    mockPrisma.venueRelationship.findFirst.mockResolvedValue(null);

    const result = await acceptGameProposal({
      proposalId: PROPOSAL_ID,
      reservationId: RESERVATION_ID,
    });

    expect(result).toEqual({
      success: false,
      error: "The selected venue reservation is outside the proposal's league/team scope or does not match its slot.",
    });
    expect(mockPrisma.seasonGame.create).not.toHaveBeenCalled();
  });

  it("rejects assignment unless the terms and acceptance come from the two proposal teams", async () => {
    mockPrisma.gameProposal.findUnique.mockResolvedValue({
      ...(await mockPrisma.gameProposal.findUnique()),
      entries: [{
        id: "entry-1",
        kind: "PROPOSE",
        startAt: new Date("2026-09-05T22:00:00.000Z"),
        endAt: new Date("2026-09-05T23:30:00.000Z"),
        venueId: VENUE_ID,
        note: null,
        actorTeamId: "clteam00000000000000003",
        createdAt: new Date("2026-08-17T00:00:00.000Z"),
        venueReservationId: RESERVATION_ID,
      }],
    });

    const result = await acceptGameProposal({
      proposalId: PROPOSAL_ID,
      reservationId: RESERVATION_ID,
    });

    expect(result).toEqual({
      success: false,
      error: "Reservation assignment requires verified consent from both proposal teams.",
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.gameProposal.updateMany).not.toHaveBeenCalled();
  });
});
