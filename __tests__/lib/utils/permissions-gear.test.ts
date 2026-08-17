import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst, getUserLeagueAccessLevel } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  getUserLeagueAccessLevel: vi.fn(),
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
  prisma: { teamMember: { findFirst } },
}));

import { hasPermission, Permission } from "@/lib/utils/permissions";

describe("team-scoped gear permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserLeagueAccessLevel.mockResolvedValue("TEAM_ADMIN");
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
