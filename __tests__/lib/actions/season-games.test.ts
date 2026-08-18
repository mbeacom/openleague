import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireUserId,
  mockRequireSeasonManager,
  mockFindBookingConflicts,
  mockAssignVenueReservation,
  mockCreateVenueReservation,
  mockPrisma,
} = vi.hoisted(() => {
  const tx = {
    season: { findUnique: vi.fn() },
    seasonGame: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
    seasonTeamPlacement: { findMany: vi.fn() },
    team: { findMany: vi.fn(), findUniqueOrThrow: vi.fn(), findUnique: vi.fn() },
    teamMember: { findMany: vi.fn() },
    leagueUser: { findFirst: vi.fn() },
    venue: { findUnique: vi.fn() },
    event: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    venueReservation: { findUnique: vi.fn() },
  };
  return {
    mockRequireUserId: vi.fn(),
    mockRequireSeasonManager: vi.fn(),
    mockFindBookingConflicts: vi.fn(),
    mockAssignVenueReservation: vi.fn(),
    mockCreateVenueReservation: vi.fn(),
    mockPrisma: {
      season: { ...tx.season, update: vi.fn() },
      seasonPhase: { findUnique: vi.fn(), update: vi.fn() },
      seasonGame: tx.seasonGame,
      seasonTeamPlacement: tx.seasonTeamPlacement,
      team: tx.team,
      teamMember: tx.teamMember,
      leagueUser: tx.leagueUser,
      venue: tx.venue,
      event: tx.event,
      venueReservation: tx.venueReservation,
      $transaction: vi.fn(
        async (callback: (transaction: typeof tx) => unknown) => callback(tx),
      ),
    },
  };
});

vi.mock("@/lib/auth/session", () => ({
  requireUserId: (...args: unknown[]) => mockRequireUserId(...args),
}));

vi.mock("@/lib/actions/seasons", () => ({
  requireSeasonManager: (...args: unknown[]) => mockRequireSeasonManager(...args),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/utils/availability", () => ({
  findBookingConflicts: (...args: unknown[]) => mockFindBookingConflicts(...args),
}));
vi.mock("@/lib/services/venue-reservations", () => ({
  assignVenueReservation: (...args: unknown[]) => mockAssignVenueReservation(...args),
  createVenueReservation: (...args: unknown[]) => mockCreateVenueReservation(...args),
  transitionVenueReservation: vi.fn(),
  VenueReservationConflictError: class extends Error {
    conflicts: unknown[];
    constructor(conflicts: unknown[]) {
      super("conflict");
      this.conflicts = conflicts;
    }
  },
  VenueReservationLifecycleError: class extends Error {},
}));
vi.mock("@/lib/email/templates", () => ({
  sendEventNotifications: vi.fn(() => Promise.resolve()),
}));

import {
  createSeasonGame,
  deleteDraftGame,
  publishSeasonGames,
  recordSeasonGameScore,
  updateSeasonGame,
} from "@/lib/actions/season-games";

const SEASON_ID = "clseason000000000000001";
const LEAGUE_ID = "clleague0000000000000001";
const TEAM_A = "clteam00000000000000001";
const TEAM_B = "clteam00000000000000002";
const USER_ID = "cluser000000000000000001";
const VENUE_ID = "clvenue00000000000000001";
const RESERVATION_ID = "clreservation0000000001";
const GAME_ID = "clgame000000000000000001";
const EVENT_ID = "clevent0000000000000001";

const baseGame = {
  seasonId: SEASON_ID,
  homeTeamId: TEAM_A,
  awayTeamId: TEAM_B,
  startAt: "2026-09-05T22:00:00.000Z",
  endAt: "2026-09-05T23:30:00.000Z",
  venueId: VENUE_ID,
  publish: true,
  overrideConflicts: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUserId.mockResolvedValue(USER_ID);
  mockRequireSeasonManager.mockResolvedValue({
    season: { id: SEASON_ID, leagueId: LEAGUE_ID, teamId: null },
    userId: USER_ID,
  });
  mockFindBookingConflicts.mockResolvedValue([]);
  mockAssignVenueReservation.mockResolvedValue({ conflictsOverridden: false });
  mockCreateVenueReservation.mockResolvedValue({ id: RESERVATION_ID });
  mockPrisma.seasonGame.findUnique.mockResolvedValue(undefined);
  if (!mockPrisma.venueReservation.findUnique) {
    mockPrisma.venueReservation.findUnique = vi.fn();
  }
  mockPrisma.venueReservation.findUnique.mockResolvedValue(undefined);
  mockPrisma.season.findUnique.mockResolvedValue({ id: SEASON_ID, leagueId: LEAGUE_ID, teamId: null });
  mockPrisma.team.findMany.mockResolvedValue([{ id: TEAM_A }, { id: TEAM_B }]);
  mockPrisma.leagueUser.findFirst.mockResolvedValue({ id: "cleagueuser000000000001" });
  mockPrisma.venue.findUnique.mockResolvedValue({ timezone: "America/New_York" });
  mockPrisma.team.findUniqueOrThrow.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    name: where.id === TEAM_A ? "Arrows" : "Blizzards",
  }));
  mockPrisma.teamMember.findMany.mockResolvedValue([
    { userId: "p1" },
    { userId: "p1" },
    { userId: "p2" },
  ]);
  mockPrisma.seasonGame.create.mockResolvedValue({
    id: GAME_ID,
    seasonId: SEASON_ID,
    status: "DRAFT",
    startAt: new Date(baseGame.startAt),
    endAt: new Date(baseGame.endAt),
    timezone: "America/New_York",
    venueId: VENUE_ID,
    locationText: null,
    homeTeamId: TEAM_A,
    awayTeamId: TEAM_B,
  });
  mockPrisma.event.create.mockResolvedValue({ id: EVENT_ID });
  mockPrisma.seasonGame.findMany.mockResolvedValue([]);
  mockPrisma.seasonGame.update.mockResolvedValue({ id: GAME_ID });
  mockPrisma.seasonTeamPlacement.findMany.mockResolvedValue([]);
});

describe("season game conflict override audit", () => {
  const existingUpdateGame = {
    id: GAME_ID,
    seasonId: SEASON_ID,
    status: "SCHEDULED",
    startAt: new Date(baseGame.startAt),
    endAt: new Date(baseGame.endAt),
    timezone: "America/New_York",
    venueId: VENUE_ID,
    surfaceId: null,
    segmentId: null,
    locationText: null,
    notes: null,
    homeTeamId: TEAM_A,
    awayTeamId: TEAM_B,
    eventId: null,
    venueReservationId: RESERVATION_ID,
  };

  beforeEach(() => {
    mockPrisma.seasonGame.findUnique
      .mockResolvedValueOnce({
        ...existingUpdateGame,
        season: { id: SEASON_ID, leagueId: LEAGUE_ID, teamId: null },
      })
      .mockResolvedValue(existingUpdateGame);
    mockPrisma.venueReservation.findUnique.mockResolvedValue({
      id: RESERVATION_ID,
      status: "CONFIRMED",
      venueId: VENUE_ID,
      surfaceId: null,
      segmentId: null,
      startsAt: existingUpdateGame.startAt,
      endsAt: existingUpdateGame.endAt,
      ownerLeagueId: LEAGUE_ID,
      ownerTeamId: null,
      ownerVenueOrganizationId: null,
    });
  });

  it("does not record a false override when the canonical check finds no conflict", async () => {
    const result = await updateSeasonGame({
      gameId: GAME_ID,
      overrideConflicts: true,
      overrideReason: "Submitted for review",
    });

    expect(result).toEqual({ success: true, data: { id: GAME_ID, conflictsOverridden: false } });
    expect(mockPrisma.seasonGame.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({
        conflictOverriddenById: expect.anything(),
        conflictOverriddenAt: expect.anything(),
      }),
    }));
  });

  it("records an override only when the in-transaction assignment reports a conflict", async () => {
    mockAssignVenueReservation.mockResolvedValueOnce({ conflictsOverridden: true });

    const result = await updateSeasonGame({
      gameId: GAME_ID,
      overrideConflicts: true,
      overrideReason: "Venue manager approved the overlap",
    });

    expect(result).toEqual({ success: true, data: { id: GAME_ID, conflictsOverridden: true } });
    expect(mockPrisma.seasonGame.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        conflictOverriddenById: USER_ID,
        conflictOverriddenAt: expect.any(Date),
      }),
    }));
  });

  it("rejects a concurrent cancellation reloaded inside the serializable callback", async () => {
    mockPrisma.seasonGame.findUnique
      .mockReset()
      .mockResolvedValueOnce({
        ...existingUpdateGame,
        season: { id: SEASON_ID, leagueId: LEAGUE_ID, teamId: null },
      })
      .mockResolvedValueOnce({ ...existingUpdateGame, status: "CANCELED" });

    const result = await updateSeasonGame({
      gameId: GAME_ID,
      notes: "This write must lose to cancellation",
      overrideConflicts: false,
    });

    expect(result).toEqual(expect.objectContaining({
      success: false,
      error: "Canceled games cannot be edited",
    }));
    expect(mockPrisma.seasonGame.update).not.toHaveBeenCalled();
  });

  it("derives omitted slot values from the transaction reload, not a stale snapshot", async () => {
    const transactionStart = new Date("2026-09-12T20:00:00.000Z");
    const transactionEnd = new Date("2026-09-12T21:30:00.000Z");
    mockPrisma.seasonGame.findUnique
      .mockReset()
      .mockResolvedValueOnce({
        ...existingUpdateGame,
        venueId: null,
        venueReservationId: null,
        season: { id: SEASON_ID, leagueId: LEAGUE_ID, teamId: null },
      })
      .mockResolvedValueOnce({
        ...existingUpdateGame,
        startAt: transactionStart,
        endAt: transactionEnd,
        venueId: null,
        venueReservationId: null,
      });

    const result = await updateSeasonGame({
      gameId: GAME_ID,
      notes: "Keep the concurrent slot",
      overrideConflicts: false,
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.seasonGame.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        startAt: transactionStart,
        endAt: transactionEnd,
        venueId: null,
        notes: "Keep the concurrent slot",
      }),
    }));
  });

  describe("season placement score eligibility", () => {
    const scoredGame = {
      id: GAME_ID,
      seasonId: SEASON_ID,
      status: "SCHEDULED",
      homeTeamId: TEAM_A,
      awayTeamId: TEAM_B,
      homeTeam: { division: { ageClassification: "U8" } },
      awayTeam: { division: { ageClassification: "U18" } },
    };

    beforeEach(() => {
      mockPrisma.seasonGame.findUnique.mockReset().mockResolvedValue(scoredGame);
    });

    it("treats an explicit null season placement as unclassified instead of falling back", async () => {
      mockPrisma.seasonTeamPlacement.findMany.mockResolvedValue([
        { teamId: TEAM_A, division: null },
        { teamId: TEAM_B, division: null },
      ]);

      const result = await recordSeasonGameScore({
        gameId: GAME_ID,
        homeScore: 2,
        awayScore: 1,
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.seasonGame.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ homeScore: 2, awayScore: 1, status: "COMPLETED" }),
      }));
    });

    it("uses a moved season division instead of the team's current division", async () => {
      mockPrisma.seasonGame.findUnique.mockResolvedValue({
        ...scoredGame,
        homeTeam: { division: { ageClassification: "U18" } },
      });
      mockPrisma.seasonTeamPlacement.findMany.mockResolvedValue([
        { teamId: TEAM_A, division: { ageClassification: "U8" } },
      ]);

      const result = await recordSeasonGameScore({
        gameId: GAME_ID,
        homeScore: 2,
        awayScore: 1,
      });

      expect(result).toEqual(expect.objectContaining({
        success: false,
        error: expect.stringContaining("Scores are not recorded"),
      }));
      expect(mockPrisma.seasonGame.update).not.toHaveBeenCalled();
    });
  });

  it("does not record a false override while creating when the conflict cleared", async () => {
    mockPrisma.seasonGame.findUnique.mockReset().mockResolvedValue(undefined);
    mockPrisma.venueReservation.findUnique.mockResolvedValue({
      id: RESERVATION_ID,
      status: "CONFIRMED",
      venueId: VENUE_ID,
      surfaceId: null,
      segmentId: null,
      startsAt: new Date(baseGame.startAt),
      endsAt: new Date(baseGame.endAt),
      ownerLeagueId: LEAGUE_ID,
      ownerTeamId: null,
      ownerVenueOrganizationId: null,
    });
    mockAssignVenueReservation.mockResolvedValue({ conflictsOverridden: false });

    const result = await createSeasonGame({
      ...baseGame,
      publish: false,
      reservationId: RESERVATION_ID,
      overrideConflicts: true,
      overrideReason: "Conflict shown during preview",
    });

    expect(result).toEqual({
      success: true,
      data: { id: GAME_ID, conflictsOverridden: false },
    });
    expect(mockPrisma.seasonGame.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          conflictOverriddenById: expect.anything(),
          conflictOverriddenAt: expect.anything(),
        }),
      }),
    );
    expect(mockPrisma.seasonGame.update).not.toHaveBeenCalled();
  });
});

describe("shared SeasonGame/Event reservation", () => {
  it("threads one reservation through the SeasonGame and participant Event, while fan-out keeps RSVP rows unique", async () => {
    // This test covers the legacy transaction double, which intentionally
    // lacks the canonical reservation model.
    mockPrisma.venueReservation.findUnique = undefined as never;
    const result = await createSeasonGame({
      ...baseGame,
      reservationId: RESERVATION_ID,
    });

    expect(result.success).toBe(true);
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
  });
});

describe("bulk publication", () => {
  it("rechecks every draft at publish time and reports per-item outcomes", async () => {
    mockPrisma.seasonGame.findMany.mockResolvedValue([
      {
        id: GAME_ID,
        seasonId: SEASON_ID,
        status: "DRAFT",
        startAt: new Date(baseGame.startAt),
        endAt: new Date(baseGame.endAt),
        timezone: "America/New_York",
        venueId: VENUE_ID,
        locationText: null,
        homeTeamId: TEAM_A,
        awayTeamId: TEAM_B,
        venueReservationId: RESERVATION_ID,
      },
      {
        id: "clgame0000000000000002",
        seasonId: SEASON_ID,
        status: "DRAFT",
        startAt: new Date("2026-09-06T22:00:00.000Z"),
        endAt: new Date("2026-09-06T23:30:00.000Z"),
        timezone: "America/New_York",
        venueId: VENUE_ID,
        locationText: null,
        homeTeamId: TEAM_B,
        awayTeamId: TEAM_A,
        venueReservationId: "clreservation0000000002",
      },
    ]);

    const result = await publishSeasonGames({ seasonId: SEASON_ID });

    expect(result).toMatchObject({
      success: true,
      data: { published: 1, failed: 1 },
      details: {
        outcomes: [
          { gameId: GAME_ID, status: "published" },
          { gameId: "clgame0000000000000002", status: "conflict" },
        ],
      },
    });
    expect(mockPrisma.event.create).toHaveBeenCalledTimes(1);
  });

  it("returns one ordered outcome for every explicitly requested game id", async () => {
    const missingId = "clgame0000000000000002";
    const wrongSeasonId = "clgame0000000000000003";
    const publishedId = "clgame0000000000000004";
    const canceledId = "clgame0000000000000005";
    const draftId = "clgame0000000000000006";
    const venueLess = (id: string, seasonId: string, status: string) => ({
      id,
      seasonId,
      status,
      startAt: new Date(baseGame.startAt),
      endAt: new Date(baseGame.endAt),
      timezone: "America/New_York",
      venueId: null,
      surfaceId: null,
      segmentId: null,
      locationText: "Community room",
      homeTeamId: TEAM_A,
      awayTeamId: TEAM_B,
      venueReservationId: null,
    });
    mockPrisma.seasonGame.findMany.mockResolvedValue([
      venueLess(wrongSeasonId, "clseason000000000000099", "DRAFT"),
      venueLess(publishedId, SEASON_ID, "SCHEDULED"),
      venueLess(canceledId, SEASON_ID, "CANCELED"),
      venueLess(draftId, SEASON_ID, "DRAFT"),
    ]);

    const result = await publishSeasonGames({
      seasonId: SEASON_ID,
      gameIds: [missingId, wrongSeasonId, publishedId, canceledId, draftId],
    });

    expect(result).toMatchObject({
      success: true,
      data: { published: 1, failed: 4 },
      details: {
        outcomes: [
          { gameId: missingId, status: "missing" },
          { gameId: wrongSeasonId, status: "wrong-season" },
          { gameId: publishedId, status: "already-published" },
          { gameId: canceledId, status: "no-longer-draft" },
          { gameId: draftId, status: "published" },
        ],
      },
    });
  });

  it("reports a game moved after selection instead of silently omitting it", async () => {
      const draft = {
        id: GAME_ID,
        seasonId: SEASON_ID,
        status: "DRAFT",
        startAt: new Date(baseGame.startAt),
        endAt: new Date(baseGame.endAt),
        timezone: "America/New_York",
        venueId: null,
        surfaceId: null,
        segmentId: null,
        locationText: null,
        homeTeamId: TEAM_A,
        awayTeamId: TEAM_B,
        venueReservationId: null,
      };
      mockPrisma.seasonGame.findMany.mockResolvedValue([draft]);
      mockPrisma.seasonGame.findUnique.mockResolvedValue({
        ...draft,
        seasonId: "clseason000000000000099",
        eventId: null,
      });

      const result = await publishSeasonGames({
        seasonId: SEASON_ID,
        gameIds: [GAME_ID],
      });

      expect(result).toMatchObject({
        success: true,
        data: { published: 0, failed: 1 },
        details: {
          outcomes: [{ gameId: GAME_ID, status: "wrong-season" }],
        },
    });
  });
});

describe("draft reservation lifecycle", () => {
  it("detaches confirmed inventory without releasing it when deleting a draft", async () => {
    mockPrisma.season.findUnique.mockResolvedValue({
      leagueId: LEAGUE_ID,
      teamId: null,
    });
    mockPrisma.seasonGame.findUnique.mockResolvedValue({
      id: GAME_ID,
      seasonId: SEASON_ID,
      status: "DRAFT",
      homeTeamId: TEAM_A,
      awayTeamId: TEAM_B,
      eventId: null,
      venueReservationId: RESERVATION_ID,
    });

    const result = await deleteDraftGame({ gameId: GAME_ID });

    expect(result).toEqual({ success: true, data: { id: GAME_ID } });
    expect(mockPrisma.seasonGame.update).toHaveBeenCalledWith({
      where: { id: GAME_ID },
      data: { venueReservationId: null },
    });
    expect(mockPrisma.seasonGame.delete).toHaveBeenCalledWith({
      where: { id: GAME_ID },
    });
  });
});
