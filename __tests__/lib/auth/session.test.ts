import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuth, mockPrisma, mockRedirect } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockPrisma: {
    leagueUser: {
      findFirst: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    teamMember: {
      findMany: vi.fn(),
    },
    playerGuardian: {
      findMany: vi.fn(),
    },
  },
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("@/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
}));

import {
  getCurrentUserId,
  getViewableTeamIds,
  isPlatformAdmin,
  requireSystemAdmin,
  requireUserId,
} from "@/lib/auth/session";

describe("auth session helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the session user id without querying the database", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-1", email: "admin@example.com" },
    });

    await expect(getCurrentUserId()).resolves.toBe("user-1");

    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("resolves stale JWT sessions that have email but no user id", async () => {
    mockAuth.mockResolvedValue({
      user: { email: "admin@example.com" },
    });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-from-email" });

    await expect(requireUserId()).resolves.toBe("user-from-email");

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "admin@example.com" },
      select: { id: true },
    });
  });

  it("redirects when an authenticated session cannot be resolved to a user id", async () => {
    mockAuth.mockResolvedValue({
      user: { email: "missing@example.com" },
    });
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(requireUserId()).rejects.toThrow("NEXT_REDIRECT:/login");

    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("resolves stale JWT sessions before granting platform admin access", async () => {
    const session = { user: { email: "admin@example.com" } };
    mockAuth.mockResolvedValue(session);
    // First findUnique resolves the stale-JWT id; the second (isPlatformAdmin)
    // reads the platform-admin flag for that resolved id.
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-from-email",
      isPlatformAdmin: true,
      email: "admin@example.com",
    });

    await expect(requireSystemAdmin()).resolves.toBe(session);

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "admin@example.com" },
      select: { id: true },
    });
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-from-email" },
      select: { isPlatformAdmin: true, email: true },
    });
  });

  it("rejects a signed-in user who is not a platform admin", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1", email: "member@example.com" } });
    mockPrisma.user.findUnique.mockResolvedValue({
      isPlatformAdmin: false,
      email: "member@example.com",
    });

    await expect(requireSystemAdmin()).rejects.toThrow("Unauthorized");
  });

  it("honors the PLATFORM_ADMIN_EMAILS allowlist (case-insensitive)", async () => {
    const original = process.env.PLATFORM_ADMIN_EMAILS;
    process.env.PLATFORM_ADMIN_EMAILS = "boss@example.com, admin@example.com";
    mockPrisma.user.findUnique.mockResolvedValue({
      isPlatformAdmin: false,
      email: "Admin@Example.com",
    });

    await expect(isPlatformAdmin("user-1")).resolves.toBe(true);

    process.env.PLATFORM_ADMIN_EMAILS = original;
  });
});

describe("getViewableTeamIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("unions direct memberships with guardian-linked teams and excludes unrelated teams", async () => {
    mockPrisma.teamMember.findMany.mockResolvedValue([{ teamId: "team-member" }]);
    mockPrisma.playerGuardian.findMany.mockResolvedValue([
      { player: { teamId: "team-guardian" } },
    ]);

    const teamIds = await getViewableTeamIds("user-1");

    expect(teamIds).toContain("team-member");
    expect(teamIds).toContain("team-guardian");
    // Nothing the user has no membership or guardian link to leaks in.
    expect(teamIds).not.toContain("team-unrelated");
    expect(teamIds).toHaveLength(2);

    // Both links are scoped to active teams.
    expect(mockPrisma.teamMember.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", team: { isActive: true } },
      select: { teamId: true },
    });
    expect(mockPrisma.playerGuardian.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", player: { team: { isActive: true } } },
      select: { player: { select: { teamId: true } } },
    });
  });

  it("returns guardian-linked teams even when the user is not a direct member", async () => {
    mockPrisma.teamMember.findMany.mockResolvedValue([]);
    mockPrisma.playerGuardian.findMany.mockResolvedValue([
      { player: { teamId: "team-guardian" } },
    ]);

    await expect(getViewableTeamIds("guardian-only")).resolves.toEqual(["team-guardian"]);
  });

  it("dedupes a team reachable via both membership and guardianship", async () => {
    mockPrisma.teamMember.findMany.mockResolvedValue([{ teamId: "team-shared" }]);
    mockPrisma.playerGuardian.findMany.mockResolvedValue([
      { player: { teamId: "team-shared" } },
    ]);

    await expect(getViewableTeamIds("user-1")).resolves.toEqual(["team-shared"]);
  });
});
