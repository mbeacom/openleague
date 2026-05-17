import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetLeagueStatistics,
  mockLogAuditEvent,
  mockPrisma,
  mockRequireUserId,
  mockRevalidatePath,
  mockTx,
  mockValidateLeagueDataIsolation,
  mockValidateLeagueOperationData,
  mockVerifyLeagueAccess,
} = vi.hoisted(() => {
  const mockTx = {
    division: {
      update: vi.fn(),
    },
    event: {
      updateMany: vi.fn(),
    },
    league: {
      create: vi.fn(),
    },
    player: {
      updateMany: vi.fn(),
    },
    team: {
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };

  return {
    mockGetLeagueStatistics: vi.fn(),
    mockLogAuditEvent: vi.fn(),
    mockPrisma: {
      $transaction: vi.fn(async (callback: (tx: typeof mockTx) => unknown) => callback(mockTx)),
      division: {
        count: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      event: {
        count: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn(),
      },
      league: {
        create: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      leagueUser: {
        findFirst: vi.fn(),
      },
      player: {
        count: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn(),
      },
      team: {
        count: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      teamMember: {
        findFirst: vi.fn(),
      },
    },
    mockRequireUserId: vi.fn(),
    mockRevalidatePath: vi.fn(),
    mockTx,
    mockValidateLeagueDataIsolation: vi.fn(),
    mockValidateLeagueOperationData: vi.fn(),
    mockVerifyLeagueAccess: vi.fn(),
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

vi.mock("@/lib/auth/session", () => ({
  requireUserId: (...args: unknown[]) => mockRequireUserId(...args),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/services/league-statistics", () => ({
  getLeagueStatistics: (...args: unknown[]) => mockGetLeagueStatistics(...args),
}));

vi.mock("@/lib/utils/security", () => ({
  AuditAction: {
    LEAGUE_CREATED: "league_created",
    LEAGUE_UPDATED: "league_updated",
    TEAM_CREATED: "team_created",
    TEAM_MIGRATED: "team_migrated",
  },
  LeagueAccessLevel: {
    NONE: 0,
    MEMBER: 1,
    TEAM_ADMIN: 2,
    LEAGUE_ADMIN: 3,
  },
  logAuditEvent: (...args: unknown[]) => mockLogAuditEvent(...args),
  validateLeagueDataIsolation: (...args: unknown[]) => mockValidateLeagueDataIsolation(...args),
  validateLeagueOperationData: (...args: unknown[]) => mockValidateLeagueOperationData(...args),
  verifyLeagueAccess: (...args: unknown[]) => mockVerifyLeagueAccess(...args),
}));

import {
  addTeamToLeague,
  assignTeamToDivision,
  createDivision,
  createLeague,
  deleteDivision,
  getLeagueStatisticsData,
  getLeagueTeamsPaginated,
  migrateTeamToLeague,
} from "@/lib/actions/league";

const USER_ID = "user-1";
const LEAGUE_ID = "clleague00000000000000000";
const TEAM_ID = "clteam000000000000000000";
const DIVISION_ID = "cldiv0000000000000000000";

const validLeagueInput = {
  name: "Metro Hockey",
  sport: "HOCKEY" as const,
  contactEmail: "Commish@Example.com",
  contactPhone: "555-0100",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUserId.mockResolvedValue(USER_ID);
  mockValidateLeagueOperationData.mockReturnValue({ isValid: true, errors: [] });
  mockValidateLeagueDataIsolation.mockResolvedValue(true);
  mockVerifyLeagueAccess.mockResolvedValue({
    hasAccess: true,
    userId: USER_ID,
    accessLevel: 3,
  });
});

describe("league Server Actions", () => {
  describe("createLeague", () => {
    it("creates a league, bootstraps the creator as LEAGUE_ADMIN, logs audit, and revalidates dashboard paths", async () => {
      mockPrisma.league.create.mockResolvedValue({
        id: LEAGUE_ID,
        name: "Metro Hockey",
        sport: "HOCKEY",
      });

      const result = await createLeague(validLeagueInput);

      expect(result).toEqual({
        success: true,
        data: { id: LEAGUE_ID, name: "Metro Hockey", sport: "HOCKEY" },
      });
      expect(mockPrisma.league.create).toHaveBeenCalledWith({
        data: {
          name: "Metro Hockey",
          sport: "HOCKEY",
          contactEmail: "commish@example.com",
          contactPhone: "555-0100",
          users: {
            create: {
              userId: USER_ID,
              role: "LEAGUE_ADMIN",
            },
          },
        },
        select: {
          id: true,
          name: true,
          sport: true,
        },
      });
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "league_created",
          userId: USER_ID,
          leagueId: LEAGUE_ID,
          details: { leagueName: "Metro Hockey", sport: "HOCKEY" },
        }),
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith("/");
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard");
    });

    it("rejects suspicious league input before writing to the database", async () => {
      mockValidateLeagueOperationData.mockReturnValueOnce({
        isValid: false,
        errors: ["name contains potentially dangerous SQL patterns"],
      });

      const result = await createLeague({
        ...validLeagueInput,
        name: "League'; DROP TABLE teams; --",
      });

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining("Invalid input data"),
      });
      expect(mockPrisma.league.create).not.toHaveBeenCalled();
      expect(mockLogAuditEvent).not.toHaveBeenCalled();
    });

    it("rethrows auth redirects instead of returning a generic create failure", async () => {
      mockRequireUserId.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/login"));

      await expect(createLeague(validLeagueInput)).rejects.toThrow("NEXT_REDIRECT:/login");

      expect(mockPrisma.league.create).not.toHaveBeenCalled();
      expect(mockLogAuditEvent).not.toHaveBeenCalled();
    });
  });

  describe("migrateTeamToLeague", () => {
    it("migrates a standalone team in one transaction, backfills leagueId onto dependent records, logs audit, and revalidates", async () => {
      mockPrisma.teamMember.findFirst.mockResolvedValue({
        id: "team-member-1",
        team: {
          id: TEAM_ID,
          name: "Sharks",
          sport: "HOCKEY",
          season: "Winter 2026",
          isActive: true,
          leagueId: null,
        },
      });
      mockTx.league.create.mockResolvedValue({ id: LEAGUE_ID, name: "Metro Hockey" });
      mockTx.team.update.mockResolvedValue({ id: TEAM_ID, name: "Sharks" });
      mockTx.event.updateMany.mockResolvedValue({ count: 12 });
      mockTx.player.updateMany.mockResolvedValue({ count: 18 });

      const result = await migrateTeamToLeague({
        teamId: TEAM_ID,
        leagueData: validLeagueInput,
      });

      expect(result).toEqual({
        success: true,
        data: {
          league: { id: LEAGUE_ID, name: "Metro Hockey" },
          team: { id: TEAM_ID, name: "Sharks" },
        },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockTx.league.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: "Metro Hockey",
          sport: "HOCKEY",
          users: { create: { userId: USER_ID, role: "LEAGUE_ADMIN" } },
        }),
        select: { id: true, name: true },
      });
      expect(mockTx.team.update).toHaveBeenCalledWith({
        where: { id: TEAM_ID },
        data: { leagueId: LEAGUE_ID },
        select: { id: true, name: true },
      });
      expect(mockTx.event.updateMany).toHaveBeenCalledWith({
        where: { teamId: TEAM_ID },
        data: { leagueId: LEAGUE_ID },
      });
      expect(mockTx.player.updateMany).toHaveBeenCalledWith({
        where: { teamId: TEAM_ID },
        data: { leagueId: LEAGUE_ID },
      });
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "team_migrated",
          userId: USER_ID,
          leagueId: LEAGUE_ID,
          teamId: TEAM_ID,
          details: {
            teamName: "Sharks",
            leagueName: "Metro Hockey",
            sport: "HOCKEY",
            season: "Winter 2026",
            backfilledEvents: 12,
            backfilledPlayers: 18,
          },
        }),
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith("/");
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard");
    });

    it("does not migrate a team when the user is not a team admin", async () => {
      mockPrisma.teamMember.findFirst.mockResolvedValue(null);

      const result = await migrateTeamToLeague({
        teamId: TEAM_ID,
        leagueData: validLeagueInput,
      });

      expect(result).toEqual({
        success: false,
        error: "Unauthorized - you must be an admin of this team",
      });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockLogAuditEvent).not.toHaveBeenCalled();
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it("does not migrate a team that already belongs to a league", async () => {
      mockPrisma.teamMember.findFirst.mockResolvedValue({
        id: "team-member-1",
        team: {
          id: TEAM_ID,
          name: "Sharks",
          sport: "HOCKEY",
          season: "Winter 2026",
          isActive: true,
          leagueId: LEAGUE_ID,
        },
      });

      const result = await migrateTeamToLeague({
        teamId: TEAM_ID,
        leagueData: validLeagueInput,
      });

      expect(result).toEqual({
        success: false,
        error: "Team is already part of a league",
      });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("addTeamToLeague", () => {
    it("requires league-admin access before creating a league team", async () => {
      mockVerifyLeagueAccess.mockResolvedValueOnce({
        hasAccess: false,
        userId: USER_ID,
        accessLevel: 1,
      });

      const result = await addTeamToLeague({
        leagueId: LEAGUE_ID,
        name: "Wolves",
        sport: "HOCKEY",
        season: "Winter 2026",
      });

      expect(result).toEqual({
        success: false,
        error: "Unauthorized - you must be a league admin",
      });
      expect(mockPrisma.league.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.team.create).not.toHaveBeenCalled();
    });

    it("validates division ownership and creates a team scoped to the league", async () => {
      mockPrisma.league.findFirst.mockResolvedValue({ id: LEAGUE_ID, isActive: true });
      mockPrisma.team.create.mockResolvedValue({
        id: TEAM_ID,
        name: "Wolves",
        sport: "HOCKEY",
        season: "Winter 2026",
      });

      const result = await addTeamToLeague({
        leagueId: LEAGUE_ID,
        name: "Wolves",
        sport: "HOCKEY",
        season: "Winter 2026",
        divisionId: DIVISION_ID,
      });

      expect(result.success).toBe(true);
      expect(mockValidateLeagueDataIsolation).toHaveBeenCalledWith(
        "division",
        DIVISION_ID,
        LEAGUE_ID,
      );
      expect(mockPrisma.team.create).toHaveBeenCalledWith({
        data: {
          name: "Wolves",
          sport: "HOCKEY",
          season: "Winter 2026",
          leagueId: LEAGUE_ID,
          divisionId: DIVISION_ID,
          members: { create: { userId: USER_ID, role: "ADMIN" } },
        },
        select: { id: true, name: true, sport: true, season: true },
      });
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "team_created",
          leagueId: LEAGUE_ID,
          teamId: TEAM_ID,
        }),
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith("/");
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard");
      expect(mockRevalidatePath).toHaveBeenCalledWith(`/league/${LEAGUE_ID}`);
    });

    it("does not create a team when the requested division fails league data isolation", async () => {
      mockPrisma.league.findFirst.mockResolvedValue({ id: LEAGUE_ID, isActive: true });
      mockValidateLeagueDataIsolation.mockResolvedValueOnce(false);

      const result = await addTeamToLeague({
        leagueId: LEAGUE_ID,
        name: "Wolves",
        sport: "HOCKEY",
        season: "Winter 2026",
        divisionId: DIVISION_ID,
      });

      expect(result).toEqual({
        success: false,
        error: "Division not found or does not belong to this league",
      });
      expect(mockValidateLeagueDataIsolation).toHaveBeenCalledWith(
        "division",
        DIVISION_ID,
        LEAGUE_ID,
      );
      expect(mockPrisma.team.create).not.toHaveBeenCalled();
      expect(mockLogAuditEvent).not.toHaveBeenCalled();
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });
  });

  describe("division management", () => {
    it("prevents duplicate active division names within a league", async () => {
      mockPrisma.leagueUser.findFirst.mockResolvedValue({ id: "league-user-1" });
      mockPrisma.league.findFirst.mockResolvedValue({ id: LEAGUE_ID, isActive: true });
      mockPrisma.division.findFirst.mockResolvedValue({ id: DIVISION_ID, name: "12U" });

      const result = await createDivision({
        leagueId: LEAGUE_ID,
        name: "12U",
        ageGroup: "12U",
        skillLevel: "AA",
      });

      expect(result).toEqual({
        success: false,
        error: "A division with this name already exists in the league",
      });
      expect(mockPrisma.division.create).not.toHaveBeenCalled();
    });

    it("removes team assignments before soft-deleting a division", async () => {
      mockPrisma.leagueUser.findFirst.mockResolvedValue({ id: "league-user-1" });
      mockPrisma.division.findFirst.mockResolvedValue({
        id: DIVISION_ID,
        teams: [{ id: TEAM_ID }],
      });
      mockTx.team.updateMany.mockResolvedValue({ count: 1 });
      mockTx.division.update.mockResolvedValue({ id: DIVISION_ID, isActive: false });

      const result = await deleteDivision({ id: DIVISION_ID, leagueId: LEAGUE_ID });

      expect(result).toEqual({ success: true, data: { id: DIVISION_ID } });
      expect(mockTx.team.updateMany).toHaveBeenCalledWith({
        where: { divisionId: DIVISION_ID, isActive: true },
        data: { divisionId: null },
      });
      expect(mockTx.division.update).toHaveBeenCalledWith({
        where: { id: DIVISION_ID },
        data: { isActive: false },
      });
      expect(mockTx.team.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        mockTx.division.update.mock.invocationCallOrder[0],
      );
    });

    it("does not assign a team to a division from a different league", async () => {
      mockPrisma.leagueUser.findFirst.mockResolvedValue({ id: "league-user-1" });
      mockPrisma.team.findFirst.mockResolvedValue({ id: TEAM_ID, leagueId: LEAGUE_ID });
      mockPrisma.division.findFirst.mockResolvedValue(null);

      const result = await assignTeamToDivision({
        teamId: TEAM_ID,
        divisionId: DIVISION_ID,
        leagueId: LEAGUE_ID,
      });

      expect(result).toEqual({
        success: false,
        error: "Division not found or does not belong to this league",
      });
      expect(mockPrisma.team.update).not.toHaveBeenCalled();
    });
  });

  describe("league QA data access", () => {
    it("applies membership checks, filters, and pagination when listing league teams", async () => {
      mockPrisma.leagueUser.findFirst.mockResolvedValue({ id: "league-user-1" });
      mockPrisma.team.count.mockResolvedValue(25);
      mockPrisma.team.findMany.mockResolvedValue([
        {
          id: TEAM_ID,
          name: "Wolves",
          sport: "HOCKEY",
          season: "Winter 2026",
          divisionId: DIVISION_ID,
          _count: { players: 18, events: 12 },
        },
      ]);

      const result = await getLeagueTeamsPaginated({
        leagueId: LEAGUE_ID,
        page: 2,
        limit: 10,
        search: "wol",
        sport: "HOCKEY",
        season: "Winter 2026",
        divisionId: DIVISION_ID,
      });

      const expectedWhere = {
        leagueId: LEAGUE_ID,
        isActive: true,
        name: { contains: "wol", mode: "insensitive" },
        sport: "HOCKEY",
        season: "Winter 2026",
        divisionId: DIVISION_ID,
      };
      expect(mockPrisma.team.count).toHaveBeenCalledWith({ where: expectedWhere });
      expect(mockPrisma.team.findMany).toHaveBeenCalledWith({
        where: expectedWhere,
        skip: 10,
        take: 10,
        select: {
          id: true,
          name: true,
          sport: true,
          season: true,
          divisionId: true,
          _count: { select: { players: true, events: true } },
        },
        orderBy: [{ name: "asc" }],
      });
      expect(result).toEqual({
        success: true,
        data: {
          teams: [
            {
              id: TEAM_ID,
              name: "Wolves",
              sport: "HOCKEY",
              season: "Winter 2026",
              divisionId: DIVISION_ID,
              _count: { players: 18, events: 12 },
            },
          ],
          pagination: { page: 2, limit: 10, total: 25, totalPages: 3 },
        },
      });
    });

    it("blocks league statistics for users without league membership", async () => {
      mockPrisma.leagueUser.findFirst.mockResolvedValue(null);

      const result = await getLeagueStatisticsData(LEAGUE_ID);

      expect(result).toEqual({
        success: false,
        error: "Unauthorized - you are not a member of this league",
      });
      expect(mockGetLeagueStatistics).not.toHaveBeenCalled();
    });
  });
});
