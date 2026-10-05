import { describe, it, expect, vi, beforeEach } from "vitest";
import { IDS, MALFORMED_IDS, nonStringIdArguments } from "@/__tests__/helpers/prisma-recorder";

const recorder = await vi.hoisted(async () => {
  const { createPrismaRecorder } = await import("@/__tests__/helpers/prisma-recorder");
  return createPrismaRecorder();
});

vi.mock("@/lib/db/prisma", () => ({ prisma: recorder.prisma }));
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "cluser00000000000000000001" } })),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

import {
  isTeamAdmin,
  isTeamMember,
  getUserLeagueRole,
  canUserCreateLeagueGames,
  getUserVenueStaffRole,
  requireVenueScheduleManager,
  requireVenueContentManager,
  requireVenueProfileManager,
} from "@/lib/auth/session";
import { getUserLeagueAccessLevel, verifyLeagueAccess, LeagueAccessLevel } from "@/lib/utils/security";
import { hasPermission, Permission } from "@/lib/utils/permissions";
import { hasCapability, grantsAllowGearAction, loadActiveGrants, Capability } from "@/lib/auth/capabilities";
import { parseId, parseOptionalId, parseSlug } from "@/lib/utils/validation";

beforeEach(() => {
  recorder.reset();
});

function expectNoQueries() {
  expect(recorder.calls).toEqual([]);
  expect(nonStringIdArguments(recorder.calls)).toEqual([]);
}

describe("shared id parsers", () => {
  it("accepts a cuid and rejects everything else", () => {
    expect(parseId(IDS.team)).toBe(IDS.team);
    for (const [, value] of MALFORMED_IDS) {
      expect(parseId(value)).toBeNull();
    }
  });

  it("treats a missing optional id as absent and a malformed one as invalid", () => {
    expect(parseOptionalId(undefined)).toBeUndefined();
    expect(parseOptionalId(null)).toBeUndefined();
    expect(parseOptionalId(IDS.team)).toBe(IDS.team);
    expect(parseOptionalId({ not: "x" })).toBeNull();
  });

  it("accepts lowercase hyphenated slugs only", () => {
    expect(parseSlug("north-rink")).toBe("north-rink");
    expect(parseSlug("North Rink")).toBeNull();
    expect(parseSlug({ not: "x" })).toBeNull();
  });
});

describe.each(MALFORMED_IDS)("auth helpers with %s as the id", (_label, bad) => {
  it("isTeamAdmin / isTeamMember return false without querying", async () => {
    expect(await isTeamAdmin(IDS.user, bad as string)).toBe(false);
    expect(await isTeamMember(IDS.user, bad as string)).toBe(false);
    expectNoQueries();
  });

  it("getUserLeagueRole returns null without querying", async () => {
    expect(await getUserLeagueRole(IDS.user, bad as string)).toBeNull();
    expectNoQueries();
  });

  it("canUserCreateLeagueGames returns false without querying", async () => {
    expect(await canUserCreateLeagueGames(IDS.user, bad as string)).toBe(false);
    expectNoQueries();
  });

  it("canUserCreateLeagueGames returns false even when an admin role is supplied", async () => {
    expect(await canUserCreateLeagueGames(IDS.user, bad as string, "LEAGUE_ADMIN")).toBe(false);
    expect(await canUserCreateLeagueGames(IDS.user, bad as string, "TEAM_ADMIN")).toBe(false);
    expectNoQueries();
  });

  it("getUserVenueStaffRole returns null for a malformed organization id", async () => {
    expect(await getUserVenueStaffRole(IDS.user, bad as string, IDS.venue)).toBeNull();
    expectNoQueries();
  });

  it("getUserVenueStaffRole returns null for a malformed venue id", async () => {
    if (bad === undefined) return; // undefined means an organization-wide check
    expect(await getUserVenueStaffRole(IDS.user, IDS.org, bad as string)).toBeNull();
    expectNoQueries();
  });

  it("getUserLeagueAccessLevel returns NONE without querying", async () => {
    expect(await getUserLeagueAccessLevel(IDS.user, bad as string)).toBe(LeagueAccessLevel.NONE);
    expectNoQueries();
  });

  it("verifyLeagueAccess refuses without querying", async () => {
    const result = await verifyLeagueAccess(bad as string, LeagueAccessLevel.MEMBER);
    expect(result.hasAccess).toBe(false);
    expectNoQueries();
  });

  it("hasPermission returns false for a malformed league id", async () => {
    expect(await hasPermission(IDS.user, bad as string, Permission.VIEW_LEAGUE)).toBe(false);
    expectNoQueries();
  });

  it("hasPermission returns false for a malformed team id", async () => {
    if (bad === undefined) return; // undefined means no team was supplied
    expect(
      await hasPermission(IDS.user, IDS.league, Permission.MANAGE_GEAR_INVENTORY, bad as string)
    ).toBe(false);
    expectNoQueries();
  });

  it("hasCapability returns false without querying", async () => {
    expect(
      await hasCapability({ userId: IDS.user, leagueId: bad as string, capability: Capability.MANAGE_PUBLIC_CONTENT })
    ).toBe(false);
    expectNoQueries();
  });

  it("hasCapability returns false for a malformed target team id", async () => {
    if (bad === undefined) return;
    expect(
      await hasCapability({
        userId: IDS.user,
        leagueId: IDS.league,
        capability: Capability.MANAGE_PUBLIC_CONTENT,
        teamId: bad as string,
      })
    ).toBe(false);
    expectNoQueries();
  });

  it("loadActiveGrants and grantsAllowGearAction return nothing without querying", async () => {
    expect(await loadActiveGrants(IDS.user, bad as string)).toEqual([]);
    expect(
      await grantsAllowGearAction({ userId: IDS.user, leagueId: bad as string, action: "MANAGE_INVENTORY" })
    ).toBe(false);
    expectNoQueries();
  });
});

describe("canUserCreateLeagueGames", () => {
  it("returns false for an empty user id even when an admin role is supplied", async () => {
    expect(await canUserCreateLeagueGames("", IDS.league, "LEAGUE_ADMIN")).toBe(false);
    expect(await canUserCreateLeagueGames("", "bad", "LEAGUE_ADMIN")).toBe(false);
    expectNoQueries();
  });

  it("allows a supplied admin role for well-formed ids without querying", async () => {
    expect(await canUserCreateLeagueGames(IDS.user, IDS.league, "LEAGUE_ADMIN")).toBe(true);
    expectNoQueries();
  });
});

describe("exact membership lookups", () => {
  it("isTeamAdmin reads the single membership row by its compound key", async () => {
    recorder.mock("teamMember", "findUnique").mockResolvedValue({ role: "ADMIN" });
    expect(await isTeamAdmin(IDS.user, IDS.team)).toBe(true);
    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0]).toMatchObject({
      model: "teamMember",
      method: "findUnique",
      args: [{ where: { userId_teamId: { userId: IDS.user, teamId: IDS.team } } }],
    });
  });

  it("isTeamAdmin is false for a plain member", async () => {
    recorder.mock("teamMember", "findUnique").mockResolvedValue({ role: "MEMBER" });
    expect(await isTeamAdmin(IDS.user, IDS.team)).toBe(false);
    expect(await isTeamMember(IDS.user, IDS.team)).toBe(true);
  });

  it("getUserLeagueRole reads the membership row by its compound key", async () => {
    recorder.mock("leagueUser", "findUnique").mockResolvedValue({ role: "LEAGUE_ADMIN", league: { isActive: true } });
    expect(await getUserLeagueRole(IDS.user, IDS.league)).toBe("LEAGUE_ADMIN");
    expect(recorder.calls[0]).toMatchObject({
      model: "leagueUser",
      method: "findUnique",
      args: [{ where: { userId_leagueId: { userId: IDS.user, leagueId: IDS.league } } }],
    });
  });

  it("getUserLeagueRole returns null for an inactive league", async () => {
    recorder.mock("leagueUser", "findUnique").mockResolvedValue({ role: "LEAGUE_ADMIN", league: { isActive: false } });
    expect(await getUserLeagueRole(IDS.user, IDS.league)).toBeNull();
  });
});

describe("venue staff checks require the venue to belong to the organization", () => {
  it("refuses an organization-wide staffer for a venue in another organization", async () => {
    recorder.mock("venueStaff", "findMany").mockResolvedValue([{ role: "OWNER" }]);
    recorder.mock("venue", "findUnique").mockResolvedValue({ organizationId: IDS.org2 });

    expect(await getUserVenueStaffRole(IDS.user, IDS.org, IDS.venue)).toBeNull();
    await expect(requireVenueScheduleManager(IDS.org, IDS.venue)).rejects.toThrow(/Unauthorized/);
    await expect(requireVenueContentManager(IDS.org, IDS.venue)).rejects.toThrow(/Unauthorized/);
    await expect(requireVenueProfileManager(IDS.org, IDS.venue)).rejects.toThrow(/Unauthorized/);
  });

  it("refuses when the venue does not exist", async () => {
    recorder.mock("venueStaff", "findMany").mockResolvedValue([{ role: "OWNER" }]);
    recorder.mock("venue", "findUnique").mockResolvedValue(null);
    expect(await getUserVenueStaffRole(IDS.user, IDS.org, IDS.venue)).toBeNull();
  });

  it("allows staff for a venue in their own organization", async () => {
    recorder.mock("venueStaff", "findMany").mockResolvedValue([{ role: "OWNER" }]);
    recorder.mock("venue", "findUnique").mockResolvedValue({ organizationId: IDS.org });
    expect(await getUserVenueStaffRole(IDS.user, IDS.org, IDS.venue)).toBe("OWNER");
    await expect(requireVenueScheduleManager(IDS.org, IDS.venue)).resolves.toBe(IDS.user);
  });

  it("still supports organization-wide checks without a venue", async () => {
    recorder.mock("venueStaff", "findMany").mockResolvedValue([{ role: "MANAGER" }]);
    expect(await getUserVenueStaffRole(IDS.user, IDS.org)).toBe("MANAGER");
  });
});
