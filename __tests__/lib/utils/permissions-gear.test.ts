import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst, getUserLeagueAccessLevel, grantFindMany, teamFindFirst } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  getUserLeagueAccessLevel: vi.fn(),
  grantFindMany: vi.fn(),
  teamFindFirst: vi.fn(),
}));

vi.mock("@/lib/utils/security", () => ({
  AuditAction: { PERMISSION_DENIED: "PERMISSION_DENIED" },
  LeagueAccessLevel: {
    NONE: "NONE",
    MEMBER: "MEMBER",
    TEAM_ADMIN: "TEAM_ADMIN",
    LEAGUE_ADMIN: "LEAGUE_ADMIN",
  },
  getUserLeagueAccessLevel,
  logAuditEvent: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    teamMember: { findFirst },
    // Equipment-manager grants are consulted through the same hasPermission
    // entry point, so the gear tests need the grant resolver's surface too.
    associationRoleGrant: { findMany: grantFindMany },
    team: { findFirst: teamFindFirst },
  },
}));

import { hasPermission, Permission } from "@/lib/utils/permissions";

describe("team-scoped gear permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserLeagueAccessLevel.mockResolvedValue("TEAM_ADMIN");
    grantFindMany.mockResolvedValue([]);
    teamFindFirst.mockResolvedValue(null);
  });

  it("fails closed when a team-scoped gear permission omits teamId", async () => {
    await expect(
      hasPermission("user-1", "league-1", Permission.CREATE_TEAM_GEAR_NEED),
    ).resolves.toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("rejects team admins for a different team", async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      hasPermission("user-1", "league-1", Permission.REQUEST_TEAM_GEAR, "team-2"),
    ).resolves.toBe(false);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ teamId: "team-2" }),
      }),
    );
  });

  it("requires league admins to provide the team they act for", async () => {
    getUserLeagueAccessLevel.mockResolvedValue("LEAGUE_ADMIN");

    await expect(
      hasPermission("user-1", "league-1", Permission.REQUEST_TEAM_GEAR),
    ).resolves.toBe(false);
    await expect(
      hasPermission("user-1", "league-1", Permission.REQUEST_TEAM_GEAR, "team-2"),
    ).resolves.toBe(true);
  });
});

/**
 * Equipment-manager grants authorize gear work through the existing gear
 * Permission values and the existing hasPermission entry point. They do not get
 * a parallel checker, because the gear actions call hasPermission and would
 * never consult one (spec 007 US3 / contracts).
 *
 * Scope matrix (data-model.md §6):
 *   Association → inventory + wishlist, and team need/request for ANY team
 *   Division    → team need/request for teams currently in the division
 *   Team        → team need/request for that exact team
 *   Season/Event→ nothing; fails closed
 */
describe("equipment-manager gear delegation", () => {
  const equipmentGrant = (scopeType: string, extra: Record<string, unknown> = {}) => ({
    role: "EQUIPMENT_MANAGER",
    scopeType,
    leagueId: "league-1",
    divisionId: null,
    teamId: null,
    seasonId: null,
    eventId: null,
    signupEventId: null,
    ...extra,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // A plain member: every allowed result below comes from the grant alone.
    getUserLeagueAccessLevel.mockResolvedValue("MEMBER");
    findFirst.mockResolvedValue(null);
    teamFindFirst.mockResolvedValue(null);
    grantFindMany.mockResolvedValue([]);
  });

  describe("association scope", () => {
    beforeEach(() => {
      grantFindMany.mockResolvedValue([equipmentGrant("ASSOCIATION")]);
    });

    it("allows inventory and wishlist administration", async () => {
      await expect(
        hasPermission("user-1", "league-1", Permission.MANAGE_GEAR_INVENTORY),
      ).resolves.toBe(true);
      await expect(
        hasPermission("user-1", "league-1", Permission.MANAGE_GEAR_WISHLIST),
      ).resolves.toBe(true);
    });

    it("allows team need/request work for any team in the association", async () => {
      await expect(
        hasPermission("user-1", "league-1", Permission.CREATE_TEAM_GEAR_NEED, "team-7"),
      ).resolves.toBe(true);
      await expect(
        hasPermission("user-1", "league-1", Permission.REQUEST_TEAM_GEAR, "team-7"),
      ).resolves.toBe(true);
    });

    it("still requires the team to be named for team-scoped gear work", async () => {
      // Mandatory teamId: an association-wide gear grant does not make a
      // team-scoped permission league-wide by omission.
      await expect(
        hasPermission("user-1", "league-1", Permission.CREATE_TEAM_GEAR_NEED),
      ).resolves.toBe(false);
      await expect(
        hasPermission("user-1", "league-1", Permission.REQUEST_TEAM_GEAR),
      ).resolves.toBe(false);
    });

    it("grants no scheduling, finance, or administrative permission", async () => {
      for (const permission of [
        Permission.UPDATE_LEAGUE,
        Permission.CREATE_EVENT,
        Permission.VIEW_FINANCIAL_REPORTS,
        Permission.ASSIGN_LEAGUE_ROLE,
      ]) {
        await expect(
          hasPermission("user-1", "league-1", permission, "team-7"),
        ).resolves.toBe(false);
      }
    });
  });

  describe("division scope", () => {
    beforeEach(() => {
      grantFindMany.mockResolvedValue([
        equipmentGrant("DIVISION", { divisionId: "division-1" }),
      ]);
    });

    it("allows team need/request work for a team in the division", async () => {
      teamFindFirst.mockResolvedValue({ id: "team-1" });

      await expect(
        hasPermission("user-1", "league-1", Permission.CREATE_TEAM_GEAR_NEED, "team-1"),
      ).resolves.toBe(true);
    });

    it("refuses a team outside the division", async () => {
      teamFindFirst.mockResolvedValue(null);

      await expect(
        hasPermission("user-1", "league-1", Permission.CREATE_TEAM_GEAR_NEED, "team-9"),
      ).resolves.toBe(false);
    });

    it("does not confer inventory or wishlist administration", async () => {
      await expect(
        hasPermission("user-1", "league-1", Permission.MANAGE_GEAR_INVENTORY),
      ).resolves.toBe(false);
      await expect(
        hasPermission("user-1", "league-1", Permission.MANAGE_GEAR_WISHLIST),
      ).resolves.toBe(false);
    });
  });

  describe("team scope", () => {
    beforeEach(() => {
      grantFindMany.mockResolvedValue([equipmentGrant("TEAM", { teamId: "team-1" })]);
    });

    it("allows need/request work for the exact team", async () => {
      await expect(
        hasPermission("user-1", "league-1", Permission.REQUEST_TEAM_GEAR, "team-1"),
      ).resolves.toBe(true);
    });

    it("refuses any other team", async () => {
      await expect(
        hasPermission("user-1", "league-1", Permission.REQUEST_TEAM_GEAR, "team-2"),
      ).resolves.toBe(false);
    });

    it("does not confer inventory or wishlist administration", async () => {
      await expect(
        hasPermission("user-1", "league-1", Permission.MANAGE_GEAR_INVENTORY),
      ).resolves.toBe(false);
    });
  });

  describe("unsupported scopes fail closed", () => {
    it.each([
      ["SEASON", { seasonId: "season-1" }],
      ["EVENT", { eventId: "event-1" }],
      ["SIGNUP_EVENT", { signupEventId: "signup-1" }],
    ])("refuses every gear permission at %s scope", async (scopeType, extra) => {
      grantFindMany.mockResolvedValue([equipmentGrant(scopeType, extra)]);

      for (const permission of [
        Permission.MANAGE_GEAR_INVENTORY,
        Permission.MANAGE_GEAR_WISHLIST,
        Permission.CREATE_TEAM_GEAR_NEED,
        Permission.REQUEST_TEAM_GEAR,
      ]) {
        await expect(
          hasPermission("user-1", "league-1", permission, "team-1"),
        ).resolves.toBe(false);
      }
    });
  });

  describe("team-manager gear delegation", () => {
    it("allows only need/request work on the exact team", async () => {
      grantFindMany.mockResolvedValue([
        { ...equipmentGrant("TEAM", { teamId: "team-1" }), role: "TEAM_MANAGER" },
      ]);

      await expect(
        hasPermission("user-1", "league-1", Permission.CREATE_TEAM_GEAR_NEED, "team-1"),
      ).resolves.toBe(true);
      await expect(
        hasPermission("user-1", "league-1", Permission.REQUEST_TEAM_GEAR, "team-1"),
      ).resolves.toBe(true);
      await expect(
        hasPermission("user-1", "league-1", Permission.CREATE_TEAM_GEAR_NEED, "team-2"),
      ).resolves.toBe(false);
      await expect(
        hasPermission("user-1", "league-1", Permission.MANAGE_GEAR_INVENTORY),
      ).resolves.toBe(false);
    });
  });

  describe("non-gear roles get no gear access", () => {
    it.each(["SCHEDULER", "REGISTRAR", "TREASURER", "COMMUNICATIONS_LEAD", "COACH"])(
      "refuses gear permissions for %s",
      async (role) => {
        grantFindMany.mockResolvedValue([{ ...equipmentGrant("ASSOCIATION"), role }]);

        for (const permission of [
          Permission.MANAGE_GEAR_INVENTORY,
          Permission.MANAGE_GEAR_WISHLIST,
          Permission.CREATE_TEAM_GEAR_NEED,
          Permission.REQUEST_TEAM_GEAR,
        ]) {
          await expect(
            hasPermission("user-1", "league-1", permission, "team-1"),
          ).resolves.toBe(false);
        }
      },
    );
  });
});
