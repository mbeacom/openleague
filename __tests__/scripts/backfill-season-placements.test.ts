import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    season: { findMany: vi.fn() },
    team: { findMany: vi.fn() },
    seasonTeamPlacement: { findUnique: vi.fn(), upsert: vi.fn() },
    $disconnect: vi.fn(),
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

import { backfillSeasonPlacements } from "@/scripts/backfill-season-placements";

const NOW = new Date("2026-08-17T12:00:00.000Z");
const LEAGUE_ID = "clleague0000000000000001";
const OLD_TEAM = "clteam00000000000000001";
const GAME_TEAM = "clteam00000000000000002";
const NEW_TEAM = "clteam00000000000000003";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.seasonTeamPlacement.findUnique.mockResolvedValue(null);
  mockPrisma.seasonTeamPlacement.upsert.mockResolvedValue({ id: "placement" });
});

describe("season placement backfill candidate history", () => {
  it("uses only decisions and season games for historical seasons after transfers/new teams", async () => {
    mockPrisma.season.findMany.mockResolvedValue([{
      id: "clseason000000000000001",
      leagueId: LEAGUE_ID,
      teamId: null,
      createdById: "creator-1",
      startDate: new Date("2024-09-01T00:00:00.000Z"),
      endDate: new Date("2025-03-01T00:00:00.000Z"),
      archivedAt: null,
      placements: [{
        id: "decision-1",
        teamId: OLD_TEAM,
        divisionId: "old-division",
        rank: 1,
        privateNote: "Historical",
        decidedById: "decider-1",
        team: { name: "Old Team Snapshot" },
        division: { name: "Old Division" },
      }],
      games: [{
        homeTeamId: OLD_TEAM,
        awayTeamId: GAME_TEAM,
        homeTeam: { name: "Old Team Snapshot" },
        awayTeam: { name: "Game Team Snapshot" },
      }],
    }]);
    mockPrisma.team.findMany.mockImplementation(
      async ({ where }: { where: { id?: { in: string[] }; leagueId?: string } }) => {
        if (where.leagueId) {
          return [
            { id: OLD_TEAM, name: "Transferred Team", divisionId: "new-division", division: { name: "New Division" } },
            { id: NEW_TEAM, name: "Expansion Team", divisionId: "new-division", division: { name: "New Division" } },
          ];
        }
        return [
          { id: OLD_TEAM, name: "Transferred Team", divisionId: "new-division", division: { name: "New Division" } },
          { id: GAME_TEAM, name: "Game Team", divisionId: "new-division", division: { name: "New Division" } },
        ].filter((team) => where.id?.in.includes(team.id));
      },
    );

    const report = await backfillSeasonPlacements({ now: NOW });

    expect(report.teamsScanned).toBe(2);
    expect(mockPrisma.team.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.seasonTeamPlacement.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ teamId: NEW_TEAM }),
      }),
    );
    expect(mockPrisma.seasonTeamPlacement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          teamId: OLD_TEAM,
          divisionId: "old-division",
          teamNameSnapshot: "Old Team Snapshot",
          divisionNameSnapshot: "Old Division",
        }),
      }),
    );
    expect(mockPrisma.seasonTeamPlacement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          teamId: GAME_TEAM,
          divisionId: null,
          teamNameSnapshot: "Game Team Snapshot",
          divisionNameSnapshot: null,
        }),
      }),
    );
  });

  it("adds current roster defaults only for a currently applicable season and stays idempotent", async () => {
    mockPrisma.season.findMany.mockResolvedValue([{
      id: "clseason000000000000002",
      leagueId: LEAGUE_ID,
      teamId: null,
      createdById: "creator-1",
      startDate: new Date("2026-08-01T00:00:00.000Z"),
      endDate: new Date("2027-03-01T00:00:00.000Z"),
      archivedAt: null,
      placements: [],
      games: [],
    }]);
    mockPrisma.team.findMany
      .mockResolvedValueOnce([{ id: NEW_TEAM }])
      .mockResolvedValueOnce([{
        id: NEW_TEAM,
        name: "Expansion Team",
        divisionId: "current-division",
        division: { name: "Current Division" },
      }]);
    mockPrisma.seasonTeamPlacement.findUnique.mockResolvedValue({ id: "existing" });

    const report = await backfillSeasonPlacements({ now: NOW });

    expect(report).toMatchObject({
      teamsScanned: 1,
      placementsCreated: 0,
      placementsAlreadyPresent: 1,
    });
    expect(mockPrisma.seasonTeamPlacement.upsert).not.toHaveBeenCalled();
  });
});
