import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireLeagueRole,
  mockPrisma,
} = vi.hoisted(() => ({
  mockRequireLeagueRole: vi.fn(),
  mockPrisma: {
    season: { findUnique: vi.fn() },
    team: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    division: { findFirst: vi.fn() },
    seasonGame: { findMany: vi.fn() },
    placementDecision: { findMany: vi.fn(), create: vi.fn() },
    seasonTeamPlacement: { findMany: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireLeagueRole: (...args: unknown[]) => mockRequireLeagueRole(...args),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getPlacementBoard, recordPlacement } from "@/lib/actions/placements";

const SEASON_ID = "clseason000000000000001";
const TEAM_ID = "clteam000000000000000001";
const DIVISION_ID = "cldivision00000000000001";
const LEAGUE_ID = "clleague0000000000000001";
const USER_ID = "cluser000000000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireLeagueRole.mockResolvedValue(USER_ID);
  mockPrisma.season.findUnique.mockResolvedValue({ id: SEASON_ID, leagueId: LEAGUE_ID });
  mockPrisma.team.findMany.mockResolvedValue([
    {
      id: TEAM_ID,
      name: "North Stars",
      division: { id: "clcurrent000000000000001", name: "Current division", ageClassification: "U18" },
    },
  ]);
  mockPrisma.team.findFirst.mockResolvedValue({ id: TEAM_ID });
  mockPrisma.division.findFirst.mockResolvedValue({ id: DIVISION_ID });
  mockPrisma.seasonGame.findMany.mockResolvedValue([]);
  mockPrisma.placementDecision.findMany.mockResolvedValue([]);
  mockPrisma.placementDecision.create.mockResolvedValue({ id: "cldecision000000000001" });
  mockPrisma.seasonTeamPlacement.findMany.mockResolvedValue([]);
  mockPrisma.seasonTeamPlacement.upsert.mockResolvedValue({ id: "clplacement000000000001" });
  mockPrisma.team.update.mockResolvedValue({ id: TEAM_ID });
  mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => unknown) =>
    callback(mockPrisma)
  );
});

describe("placement history", () => {
  it("reads the season-specific placement instead of the team's current division default", async () => {
    mockPrisma.seasonTeamPlacement.findMany.mockResolvedValue([
      {
        seasonId: SEASON_ID,
        teamId: TEAM_ID,
        divisionId: DIVISION_ID,
        divisionName: "2026 Peewee",
        teamNameSnapshot: "North Stars",
        rank: 1,
        privateNote: "Placed here for this season only",
      },
    ]);

    const result = await getPlacementBoard({ seasonId: SEASON_ID });

    expect(mockPrisma.seasonTeamPlacement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ seasonId: SEASON_ID }),
      }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0]).toEqual(
        expect.objectContaining({
          divisionId: DIVISION_ID,
          divisionName: "2026 Peewee",
          rank: 1,
          privateNote: "Placed here for this season only",
        }),
      );
    }
  });

  it("appends history for one season without mutating the team's global division default", async () => {
    mockPrisma.placementDecision.findMany.mockResolvedValue([{ teamId: TEAM_ID, rank: 3, privateNote: "Old note" }]);

    const result = await recordPlacement({
      seasonId: SEASON_ID,
      teamId: TEAM_ID,
      divisionId: DIVISION_ID,
      rank: 2,
      privateNote: "New season placement",
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.seasonTeamPlacement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ seasonId_teamId: { seasonId: SEASON_ID, teamId: TEAM_ID } }),
        create: expect.objectContaining({ seasonId: SEASON_ID, teamId: TEAM_ID, divisionId: DIVISION_ID }),
        update: expect.objectContaining({ divisionId: DIVISION_ID }),
      }),
    );
    expect(mockPrisma.team.update).not.toHaveBeenCalled();
  });

  it("keeps an explicit unassigned placement from falling back to the current division", async () => {
    mockPrisma.seasonTeamPlacement.findMany.mockResolvedValue([{
      seasonId: SEASON_ID,
      teamId: TEAM_ID,
      divisionId: null,
      divisionNameSnapshot: null,
      teamNameSnapshot: "North Stars",
      rank: null,
      privateNote: null,
      division: null,
    }]);

    const result = await getPlacementBoard({ seasonId: SEASON_ID });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0]).toEqual(expect.objectContaining({
        divisionId: null,
        divisionName: null,
        scoresGated: false,
      }));
    }
  });

  it("uses the season's moved division classification for score display", async () => {
    mockPrisma.seasonTeamPlacement.findMany.mockResolvedValue([{
      seasonId: SEASON_ID,
      teamId: TEAM_ID,
      divisionId: DIVISION_ID,
      divisionNameSnapshot: "Mite",
      teamNameSnapshot: "North Stars",
      rank: null,
      privateNote: null,
      division: { name: "Mite", ageClassification: "U8" },
    }]);

    const result = await getPlacementBoard({ seasonId: SEASON_ID });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0]).toEqual(expect.objectContaining({
        divisionId: DIVISION_ID,
        divisionName: "Mite",
        scoresGated: true,
      }));
    }
  });
});
