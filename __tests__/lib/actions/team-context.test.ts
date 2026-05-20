import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockRequireUserId } = vi.hoisted(() => ({
  mockPrisma: {
    team: {
      findFirst: vi.fn(),
    },
    event: {
      findMany: vi.fn(),
    },
    player: {
      findMany: vi.fn(),
    },
    teamMember: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    practiceSession: {
      findMany: vi.fn(),
    },
    invitation: {
      findMany: vi.fn(),
    },
  },
  mockRequireUserId: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireUserId: (...args: unknown[]) => mockRequireUserId(...args),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mockPrisma,
}));

import {
  getTeamOverviewData,
  getTeamRosterDataById,
  isActiveTeamInLeague,
} from "@/lib/actions/team-context";

const USER_ID = "user-123";
const TEAM_ID = "clteam000000000000000000";
const LEAGUE_ID = "clleague00000000000000000";

function buildTeam(overrides: Record<string, unknown> = {}) {
  return {
    id: TEAM_ID,
    name: "Northside Wolves",
    sport: "HOCKEY",
    season: "Winter 2026",
    createdAt: new Date("2026-01-01T12:00:00.000Z"),
    members: [{ role: "ADMIN" }],
    league: null,
    division: null,
    _count: {
      players: 18,
      events: 7,
      members: 3,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUserId.mockResolvedValue(USER_ID);
});

describe("team context Server Actions", () => {
  describe("getTeamOverviewData", () => {
    it("returns a serialized overview for a direct team admin", async () => {
      mockPrisma.team.findFirst.mockResolvedValue(buildTeam());
      mockPrisma.event.findMany.mockResolvedValue([
        {
          id: "event-1",
          type: "GAME",
          title: "Wolves vs Bears",
          startAt: new Date("2026-02-01T18:30:00.000Z"),
          location: "Rink 1",
          opponent: "Bears",
        },
      ]);

      const result = await getTeamOverviewData(TEAM_ID);

      expect(result).toEqual({
        id: TEAM_ID,
        name: "Northside Wolves",
        sport: "HOCKEY",
        season: "Winter 2026",
        createdAt: "2026-01-01T12:00:00.000Z",
        role: "ADMIN",
        isAdmin: true,
        canOpenEventDetails: true,
        league: null,
        division: null,
        stats: {
          players: 18,
          events: 7,
          members: 3,
        },
        upcomingEvents: [
          {
            id: "event-1",
            type: "GAME",
            title: "Wolves vs Bears",
            startAt: "2026-02-01T18:30:00.000Z",
            location: "Rink 1",
            opponent: "Bears",
          },
        ],
      });
      expect(mockPrisma.team.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TEAM_ID, isActive: true },
        }),
      );
      expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            teamId: TEAM_ID,
            startAt: { gte: expect.any(Date) },
          },
          take: 5,
        }),
      );
    });

    it("allows league-admin overview access without exposing direct team-admin privileges", async () => {
      mockPrisma.team.findFirst.mockResolvedValue(
        buildTeam({
          members: [],
          league: {
            id: LEAGUE_ID,
            name: "Metro Hockey",
            isActive: true,
            users: [{ role: "LEAGUE_ADMIN" }],
          },
        }),
      );
      mockPrisma.event.findMany.mockResolvedValue([]);

      const result = await getTeamOverviewData(TEAM_ID);

      expect(result).toMatchObject({
        role: "LEAGUE_ADMIN",
        isAdmin: false,
        canOpenEventDetails: false,
        league: { id: LEAGUE_ID, name: "Metro Hockey" },
      });
    });

    it("returns null when the user has no direct or league access", async () => {
      mockPrisma.team.findFirst.mockResolvedValue(
        buildTeam({
          members: [],
          league: {
            id: LEAGUE_ID,
            name: "Metro Hockey",
            isActive: true,
            users: [],
          },
        }),
      );

      const result = await getTeamOverviewData(TEAM_ID);

      expect(result).toBeNull();
      expect(mockPrisma.event.findMany).not.toHaveBeenCalled();
    });
  });

  describe("getTeamRosterDataById", () => {
    it("fetches admin-only roster fields and invitations for a direct team admin", async () => {
      mockPrisma.team.findFirst.mockResolvedValue(buildTeam());
      mockPrisma.player.findMany.mockResolvedValue([
        {
          id: "player-1",
          name: "Alex Goalie",
          email: "alex@example.com",
          phone: null,
          emergencyContact: "Taylor",
          emergencyPhone: "555-0100",
          jerseyNumber: 30,
          usahMemberId: "USAH123",
        },
      ]);
      mockPrisma.teamMember.findMany.mockResolvedValue([
        {
          id: "member-1",
          role: "ADMIN",
          usahMemberId: "COACH123",
          user: { id: USER_ID, name: "Coach", email: "coach@example.com" },
        },
      ]);
      mockPrisma.invitation.findMany.mockResolvedValue([
        {
          id: "invite-1",
          email: "new@example.com",
          status: "PENDING",
          expiresAt: new Date("2026-03-01T00:00:00.000Z"),
          createdAt: new Date("2026-02-01T00:00:00.000Z"),
        },
      ]);

      const result = await getTeamRosterDataById(TEAM_ID);

      expect(result).toMatchObject({
        teamId: TEAM_ID,
        teamName: "Northside Wolves",
        isAdmin: true,
        invitations: [
          {
            id: "invite-1",
            email: "new@example.com",
            status: "PENDING",
            expiresAt: "2026-03-01T00:00:00.000Z",
            createdAt: "2026-02-01T00:00:00.000Z",
          },
        ],
      });
      expect(mockPrisma.player.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            emergencyContact: true,
            emergencyPhone: true,
            usahMemberId: true,
          }),
        }),
      );
      expect(mockPrisma.invitation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { teamId: TEAM_ID } }),
      );
    });

    it("does not expose admin-only roster fields or invitations to league-only admins", async () => {
      mockPrisma.team.findFirst.mockResolvedValue(
        buildTeam({
          members: [],
          league: {
            id: LEAGUE_ID,
            name: "Metro Hockey",
            isActive: true,
            users: [{ role: "LEAGUE_ADMIN" }],
          },
        }),
      );
      mockPrisma.player.findMany.mockResolvedValue([]);
      mockPrisma.teamMember.findMany.mockResolvedValue([]);

      const result = await getTeamRosterDataById(TEAM_ID);

      expect(result).toMatchObject({
        teamId: TEAM_ID,
        isAdmin: false,
        invitations: [],
      });
      expect(mockPrisma.player.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            emergencyContact: false,
            emergencyPhone: false,
            usahMemberId: false,
          }),
        }),
      );
      expect(mockPrisma.teamMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            usahMemberId: false,
          }),
        }),
      );
      expect(mockPrisma.invitation.findMany).not.toHaveBeenCalled();
    });
  });

  describe("isActiveTeamInLeague", () => {
    it("returns true when an active team belongs to an active league", async () => {
      mockPrisma.team.findFirst.mockResolvedValue({ id: TEAM_ID });

      await expect(isActiveTeamInLeague(TEAM_ID, LEAGUE_ID)).resolves.toBe(true);
      expect(mockPrisma.team.findFirst).toHaveBeenCalledWith({
        where: {
          id: TEAM_ID,
          leagueId: LEAGUE_ID,
          isActive: true,
          league: { isActive: true },
        },
        select: { id: true },
      });
    });

    it("returns false when the active team/league relationship is missing", async () => {
      mockPrisma.team.findFirst.mockResolvedValue(null);

      await expect(isActiveTeamInLeague(TEAM_ID, LEAGUE_ID)).resolves.toBe(false);
    });
  });
});
