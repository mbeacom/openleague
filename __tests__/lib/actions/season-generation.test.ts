import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireSeasonManager,
  mockFindBookingConflicts,
  mockPrisma,
} = vi.hoisted(() => ({
  mockRequireSeasonManager: vi.fn(),
  mockFindBookingConflicts: vi.fn(),
  mockPrisma: {
    season: { findUnique: vi.fn(), update: vi.fn() },
    seasonPhase: { findUnique: vi.fn(), update: vi.fn() },
    team: { count: vi.fn(), findMany: vi.fn() },
    teamMember: { count: vi.fn() },
    venue: { findUnique: vi.fn() },
    venueReservation: { findMany: vi.fn() },
    seasonGame: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/actions/seasons", () => ({
  requireSeasonManager: (...args: unknown[]) => mockRequireSeasonManager(...args),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/utils/availability", () => ({
  findBookingConflicts: (...args: unknown[]) => mockFindBookingConflicts(...args),
}));

import { generateRoundRobin, previewRoundRobin } from "@/lib/actions/season-generation";

const SEASON_ID = "clseason000000000000001";
const LEAGUE_ID = "clleague0000000000000001";
const VENUE_ID = "clvenue00000000000000001";
const TEAM_A = "clteam00000000000000001";
const TEAM_B = "clteam00000000000000002";
const TEAM_C = "clteam00000000000000003";
const RESERVATION_ID = "clreservation0000000001";
const USER_ID = "cluser000000000000000001";

const baseInput = {
  seasonId: SEASON_ID,
  teamIds: [TEAM_A, TEAM_B],
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  eligibleDays: [6],
  startTime: "18:00",
  defaultVenueId: VENUE_ID,
  rounds: 1,
  gameDurationMinutes: 90,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSeasonManager.mockResolvedValue({
    season: { id: SEASON_ID, leagueId: LEAGUE_ID, teamId: null },
    userId: USER_ID,
  });
  mockPrisma.team.count.mockResolvedValue(2);
  mockPrisma.team.findMany.mockResolvedValue([
    { id: TEAM_A, name: "Arrows" },
    { id: TEAM_B, name: "Blizzards" },
  ]);
  mockPrisma.venue.findUnique.mockResolvedValue({ timezone: "America/New_York" });
  mockPrisma.venueReservation.findMany.mockResolvedValue([
    {
      id: RESERVATION_ID,
      venueId: VENUE_ID,
      startsAt: new Date("2026-09-05T22:00:00.000Z"),
      endsAt: new Date("2026-09-05T23:30:00.000Z"),
      status: "CONFIRMED",
      ownerLeagueId: LEAGUE_ID,
      ownerTeamId: null,
      ownerVenueOrganizationId: null,
      assignedById: null,
    },
  ]);
  mockPrisma.seasonGame.create.mockResolvedValue({ id: "clgame0000000000000001" });
  mockPrisma.season.update.mockResolvedValue({ id: SEASON_ID });
  mockPrisma.seasonPhase.update.mockResolvedValue({ id: "clphase000000000000001" });
  mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => unknown) =>
    callback(mockPrisma)
  );
});

describe("reservation-driven generation", () => {
  it("uses confirmed unassigned reservation inventory as the source of drafted games", async () => {
    mockFindBookingConflicts.mockResolvedValue([]);

    const result = await generateRoundRobin(baseInput);

    expect(mockPrisma.venueReservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          venueId: VENUE_ID,
          status: "CONFIRMED",
        }),
      }),
    );
    expect(mockPrisma.seasonGame.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          venueReservationId: RESERVATION_ID,
        }),
      }),
    );
    expect(result.success).toBe(true);
  });

  it("excludes only the selected reservation when previewing conflicts", async () => {
    mockFindBookingConflicts.mockResolvedValue([{
      source: "venueReservation",
      title: "Different reservation at the same time",
      startAt: new Date("2026-09-05T22:00:00.000Z"),
      endAt: new Date("2026-09-05T23:30:00.000Z"),
      surfaceId: null,
      segmentId: null,
      segmentName: null,
    }]);

    const result = await previewRoundRobin(baseInput);

    expect(mockFindBookingConflicts).toHaveBeenCalledWith(expect.objectContaining({
      excludeReservationIds: [RESERVATION_ID],
    }));
    expect(result).toMatchObject({
      success: true,
      data: {
        games: [
          expect.objectContaining({
            venueReservationId: RESERVATION_ID,
            conflicts: [expect.objectContaining({
              title: "Different reservation at the same time",
            })],
          }),
        ],
      },
    });
  });

  it("previews and persists only reservation-slotted games", async () => {
    mockFindBookingConflicts.mockResolvedValue([]);
    mockPrisma.team.count.mockResolvedValue(3);
    mockPrisma.team.findMany.mockResolvedValue([
      { id: TEAM_A, name: "Arrows" },
      { id: TEAM_B, name: "Blizzards" },
      { id: TEAM_C, name: "Comets" },
    ]);

    const input = {
      ...baseInput,
      teamIds: [TEAM_A, TEAM_B, TEAM_C],
    };
    const result = await previewRoundRobin(input);

    expect(result).toMatchObject({
      success: true,
      data: {
        totalPairings: 3,
        games: [
          expect.objectContaining({
            venueReservationId: RESERVATION_ID,
          }),
        ],
        unslottedCount: 2,
        unslottedPairings: [
          expect.objectContaining({ reason: "NO_RESERVATION" }),
          expect.objectContaining({ reason: "NO_RESERVATION" }),
        ],
      },
    });
    if (result.success) {
      expect(result.data.games).toHaveLength(1);
    }

    mockPrisma.seasonGame.create.mockClear();
    const generated = await generateRoundRobin(input);

    expect(generated).toMatchObject({
      success: true,
      data: {
        createdIds: ["clgame0000000000000001"],
        unslottedCount: 2,
      },
    });
    expect(mockPrisma.seasonGame.create).toHaveBeenCalledTimes(1);
  });

  it("allocates pairings to confirmed inventory even when legacy generated wall time differs", async () => {
    mockFindBookingConflicts.mockResolvedValue([]);
    mockPrisma.venueReservation.findMany.mockResolvedValue([{
      id: RESERVATION_ID,
      venueId: VENUE_ID,
      startsAt: new Date("2026-09-12T20:15:00.000Z"),
      endsAt: new Date("2026-09-12T21:45:00.000Z"),
      status: "CONFIRMED",
      usageStatus: "PENDING",
      ownerLeagueId: LEAGUE_ID,
      ownerTeamId: null,
      ownerVenueOrganizationId: null,
    }]);

    const result = await generateRoundRobin(baseInput);

    expect(result.success).toBe(true);
    expect(mockPrisma.seasonGame.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          startAt: new Date("2026-09-12T20:15:00.000Z"),
          endAt: new Date("2026-09-12T21:45:00.000Z"),
          venueReservationId: RESERVATION_ID,
        }),
      }),
    );
  });

  it("preserves explicitly venue-less generation without inventing reservations", async () => {
    mockFindBookingConflicts.mockResolvedValue([]);

    const result = await generateRoundRobin({
      ...baseInput,
      defaultVenueId: undefined,
    });

    expect(result).toMatchObject({
      success: true,
      data: { createdIds: ["clgame0000000000000001"], unslottedCount: 0 },
    });
    expect(mockPrisma.venueReservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ venueId: VENUE_ID }),
      }),
    );
    expect(mockPrisma.seasonGame.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          venueId: null,
          venueReservationId: null,
        }),
      }),
    );
  });

  it("does not assign team-owned inventory to a game that omits its owner", async () => {
    mockFindBookingConflicts.mockResolvedValue([]);
    mockPrisma.team.count.mockResolvedValue(3);
    mockPrisma.team.findMany.mockResolvedValue([
      { id: TEAM_A, name: "Arrows" },
      { id: TEAM_B, name: "Blizzards" },
      { id: TEAM_C, name: "Comets" },
    ]);
    mockPrisma.venueReservation.findMany.mockResolvedValue([
      {
        id: RESERVATION_ID,
        venueId: VENUE_ID,
        startsAt: new Date("2026-09-19T22:00:00.000Z"),
        endsAt: new Date("2026-09-19T23:30:00.000Z"),
        status: "CONFIRMED",
        usageStatus: "PENDING",
        ownerLeagueId: null,
        ownerTeamId: TEAM_C,
        ownerVenueOrganizationId: null,
      },
    ]);

    const result = await generateRoundRobin({
      ...baseInput,
      teamIds: [TEAM_A, TEAM_B, TEAM_C],
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.seasonGame.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.seasonGame.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          venueReservationId: RESERVATION_ID,
        }),
      }),
    );
    expect(result).toMatchObject({
      success: true,
      data: {
        createdIds: ["clgame0000000000000001"],
        unslottedCount: 2,
        unslottedPairings: expect.arrayContaining([
          expect.objectContaining({ reason: "NO_RESERVATION" }),
        ]),
      },
    });
  });
});

describe("publication-time recheck", () => {
  it("rechecks every generated game before materializing the draft set", async () => {
    mockFindBookingConflicts
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          source: "seasonGame",
          title: "Arrows vs Blizzards",
          startAt: new Date("2026-09-05T22:00:00.000Z"),
          endAt: new Date("2026-09-05T23:30:00.000Z"),
          surfaceId: null,
          segmentId: null,
          segmentName: null,
        },
      ]);

    const preview = await previewRoundRobin(baseInput);
    const result = await generateRoundRobin(baseInput);

    expect(preview.success).toBe(true);
    expect(mockFindBookingConflicts).toHaveBeenCalled();
    expect(mockPrisma.seasonGame.create).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });
});
