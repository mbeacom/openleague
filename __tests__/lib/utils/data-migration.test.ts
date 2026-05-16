import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    teamMember: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    leagueUser: {
      count: vi.fn(),
    },
    team: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    event: {
      count: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    player: {
      count: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mockPrisma,
}));

import {
  cleanupOrphanedData,
  ensureDataConsistency,
  getMigrationSuggestions,
  needsDataMigration,
} from "@/lib/utils/data-migration";

describe("data migration utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("needsDataMigration", () => {
    it("returns false without querying leagues when the user has no teams", async () => {
      mockPrisma.teamMember.count.mockResolvedValueOnce(0);

      await expect(needsDataMigration("user-1")).resolves.toBe(false);

      expect(mockPrisma.teamMember.count).toHaveBeenCalledWith({
        where: { userId: "user-1" },
      });
      expect(mockPrisma.leagueUser.count).not.toHaveBeenCalled();
    });

    it("returns true only when team memberships exist without league memberships", async () => {
      mockPrisma.teamMember.count.mockResolvedValueOnce(2);
      mockPrisma.leagueUser.count.mockResolvedValueOnce(0);

      await expect(needsDataMigration("user-1")).resolves.toBe(true);

      expect(mockPrisma.leagueUser.count).toHaveBeenCalledWith({
        where: { userId: "user-1" },
      });
    });

    it("returns false when the user already has a league relationship", async () => {
      mockPrisma.teamMember.count.mockResolvedValueOnce(2);
      mockPrisma.leagueUser.count.mockResolvedValueOnce(1);

      await expect(needsDataMigration("user-1")).resolves.toBe(false);
    });
  });

  describe("getMigrationSuggestions", () => {
    it("groups only admin-managed standalone teams by sport", async () => {
      mockPrisma.teamMember.findMany.mockResolvedValueOnce([
        {
          team: {
            id: "team-hockey-a",
            name: "Hockey A",
            sport: "HOCKEY",
            season: "Winter 2025",
            leagueId: null,
          },
        },
        {
          team: {
            id: "team-hockey-b",
            name: "Hockey B",
            sport: "HOCKEY",
            season: "Winter 2025",
            leagueId: null,
          },
        },
        {
          team: {
            id: "team-soccer",
            name: "Soccer Solo",
            sport: "SOCCER",
            season: "Spring 2025",
            leagueId: null,
          },
        },
        {
          team: {
            id: "team-migrated",
            name: "Already Migrated",
            sport: "HOCKEY",
            season: "Winter 2025",
            leagueId: "league-1",
          },
        },
      ]);

      const result = await getMigrationSuggestions("user-1");

      expect(mockPrisma.teamMember.findMany).toHaveBeenCalledWith({
        where: { userId: "user-1", role: "ADMIN" },
        select: {
          team: {
            select: {
              id: true,
              name: true,
              sport: true,
              season: true,
              leagueId: true,
            },
          },
        },
      });
      expect(result.canMigrate).toBe(true);
      expect(result.teamCount).toBe(3);
      expect(result.suggestions).toEqual([
        {
          type: "create_league",
          description: "Create a HOCKEY league with 2 teams",
          teams: [
            {
              id: "team-hockey-a",
              name: "Hockey A",
              sport: "HOCKEY",
              season: "Winter 2025",
            },
            {
              id: "team-hockey-b",
              name: "Hockey B",
              sport: "HOCKEY",
              season: "Winter 2025",
            },
          ],
        },
        {
          type: "keep_separate",
          description: "Keep Soccer Solo as a standalone team",
          teams: [
            {
              id: "team-soccer",
              name: "Soccer Solo",
              sport: "SOCCER",
              season: "Spring 2025",
            },
          ],
        },
      ]);
    });

    it("does not suggest migration when all administered teams already belong to leagues", async () => {
      mockPrisma.teamMember.findMany.mockResolvedValueOnce([
        {
          team: {
            id: "team-1",
            name: "Migrated Team",
            sport: "HOCKEY",
            season: "Winter 2025",
            leagueId: "league-1",
          },
        },
      ]);

      await expect(getMigrationSuggestions("user-1")).resolves.toEqual({
        canMigrate: false,
        teamCount: 0,
        suggestions: [],
      });
    });
  });

  describe("ensureDataConsistency", () => {
    it("does not touch events or players when the league has no teams", async () => {
      mockPrisma.team.findMany.mockResolvedValueOnce([]);

      await expect(ensureDataConsistency("league-1")).resolves.toBeUndefined();

      expect(mockPrisma.event.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.player.updateMany).not.toHaveBeenCalled();
    });

    it("backfills leagueId on only unlinked events and players for league teams", async () => {
      mockPrisma.team.findMany.mockResolvedValueOnce([
        { id: "team-1" },
        { id: "team-2" },
      ]);

      await ensureDataConsistency("league-1");

      const expectedWhere = {
        teamId: { in: ["team-1", "team-2"] },
        leagueId: null,
      };
      expect(mockPrisma.event.updateMany).toHaveBeenCalledWith({
        where: expectedWhere,
        data: { leagueId: "league-1" },
      });
      expect(mockPrisma.player.updateMany).toHaveBeenCalledWith({
        where: expectedWhere,
        data: { leagueId: "league-1" },
      });
    });
  });

  describe("cleanupOrphanedData", () => {
    it("returns zero counts and skips writes when there are no orphaned teams", async () => {
      mockPrisma.team.findMany.mockResolvedValueOnce([]);

      await expect(cleanupOrphanedData()).resolves.toEqual({
        teamsDeleted: 0,
        eventsDeleted: 0,
        playersDeleted: 0,
      });

      expect(mockPrisma.event.count).not.toHaveBeenCalled();
      expect(mockPrisma.event.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.team.updateMany).not.toHaveBeenCalled();
    });

    it("deletes dependent records before soft-deleting orphaned teams", async () => {
      mockPrisma.team.findMany.mockResolvedValueOnce([
        { id: "team-1" },
        { id: "team-2" },
      ]);
      mockPrisma.event.count.mockResolvedValueOnce(3);
      mockPrisma.player.count.mockResolvedValueOnce(27);
      mockPrisma.event.deleteMany.mockResolvedValueOnce({ count: 3 });
      mockPrisma.player.deleteMany.mockResolvedValueOnce({ count: 27 });
      mockPrisma.team.updateMany.mockResolvedValueOnce({ count: 2 });

      await expect(cleanupOrphanedData()).resolves.toEqual({
        teamsDeleted: 2,
        eventsDeleted: 3,
        playersDeleted: 27,
      });

      const orphanedTeamsWhere = { teamId: { in: ["team-1", "team-2"] } };
      expect(mockPrisma.event.count).toHaveBeenCalledWith({ where: orphanedTeamsWhere });
      expect(mockPrisma.player.count).toHaveBeenCalledWith({ where: orphanedTeamsWhere });
      expect(mockPrisma.event.deleteMany).toHaveBeenCalledWith({ where: orphanedTeamsWhere });
      expect(mockPrisma.player.deleteMany).toHaveBeenCalledWith({ where: orphanedTeamsWhere });
      expect(mockPrisma.team.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["team-1", "team-2"] } },
        data: { isActive: false },
      });

      expect(
        mockPrisma.event.deleteMany.mock.invocationCallOrder[0],
      ).toBeLessThan(mockPrisma.player.deleteMany.mock.invocationCallOrder[0]);
      expect(
        mockPrisma.player.deleteMany.mock.invocationCallOrder[0],
      ).toBeLessThan(mockPrisma.team.updateMany.mock.invocationCallOrder[0]);
    });
  });
});
