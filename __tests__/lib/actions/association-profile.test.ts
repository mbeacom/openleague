import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockLeague,
  mockTeam,
  mockRedirect,
  mockTransaction,
  mockRequireUserId,
  mockHasCapability,
} = vi.hoisted(() => ({
  mockLeague: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  mockTeam: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  mockRedirect: { findFirst: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  mockTransaction: vi.fn(),
  mockRequireUserId: vi.fn(),
  mockHasCapability: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    league: mockLeague,
    team: mockTeam,
    publicSlugRedirect: mockRedirect,
    $transaction: mockTransaction,
  },
}));

vi.mock("@/lib/auth/session", () => ({ requireUserId: mockRequireUserId }));
vi.mock("@/lib/auth/capabilities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/capabilities")>();
  return { ...actual, hasCapability: mockHasCapability };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  getPublicAssociationProfile,
  resolveActiveAssociation,
  resolvePublicAssociation,
  setAssociationProfilePublished,
  updateAssociationProfile,
  updateAssociationSlug,
  updateTeamPublicProfile,
} from "@/lib/actions/association-profile";

const LEAGUE = "clfleague0000000000000001";
const TEAM = "clfteam00000000000000001";

describe("association public profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUserId.mockResolvedValue("admin-1");
    mockHasCapability.mockResolvedValue(true);
    mockLeague.findUnique.mockResolvedValue({ slug: "metro" });
    mockLeague.findFirst.mockResolvedValue(null);
    mockRedirect.findFirst.mockResolvedValue(null);
    // The action reads the team, then checks whether the incoming slug is
    // already taken — both via team.findFirst. Answer by query shape so the
    // collision check does not match the team being renamed.
    mockTeam.findFirst.mockImplementation(({ where }: { where: { id?: string; slug?: string } }) =>
      Promise.resolve(where.slug ? null : { id: TEAM, slug: "blades" }),
    );
    mockTransaction.mockImplementation(async (fn: unknown) =>
      typeof fn === "function"
        ? (fn as (c: unknown) => unknown)({
            league: mockLeague,
            team: mockTeam,
            publicSlugRedirect: mockRedirect,
          })
        : undefined,
    );
  });

  describe("editing", () => {
    it("saves only the fields the caller sent", async () => {
      const result = await updateAssociationProfile({
        leagueId: LEAGUE,
        publicDescription: "A youth hockey association",
      });

      expect(result.success).toBe(true);
      const data = mockLeague.update.mock.calls[0][0].data;
      // A partial form submit must not null the fields it omitted.
      expect(data).toEqual({ publicDescription: "A youth hockey association" });
    });

    it("refuses a caller without association administration", async () => {
      mockHasCapability.mockResolvedValue(false);

      const result = await updateAssociationProfile({ leagueId: LEAGUE, publicPhone: "555" });

      expect(result.success).toBe(false);
      expect(mockLeague.update).not.toHaveBeenCalled();
    });

    it("rejects a malformed brand colour", async () => {
      const result = await updateAssociationProfile({
        leagueId: LEAGUE,
        brandPrimaryColor: "red",
      });

      expect(result.success).toBe(false);
      expect(mockLeague.update).not.toHaveBeenCalled();
    });
  });

  describe("publishing", () => {
    it("publishes and stamps the moment", async () => {
      const result = await setAssociationProfilePublished({ leagueId: LEAGUE, publish: true });

      expect(result.success).toBe(true);
      expect(mockLeague.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ profileStatus: "PUBLISHED" }),
        }),
      );
      expect(mockLeague.update.mock.calls[0][0].data.publishedAt).toBeInstanceOf(Date);
    });

    it("refuses to publish without a public address", async () => {
      // The database enforces this too; the action turns it into an
      // instruction rather than a constraint error.
      mockLeague.findUnique.mockResolvedValue({ slug: null });

      const result = await setAssociationProfilePublished({ leagueId: LEAGUE, publish: true });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toMatch(/public address/);
      expect(mockLeague.update).not.toHaveBeenCalled();
    });
  });

  describe("renaming the slug", () => {
    it("retires the old slug in the same transaction that frees it", async () => {
      const result = await updateAssociationSlug({ leagueId: LEAGUE, slug: "metro-hockey" });

      expect(result.success).toBe(true);
      // One transaction: a shared link never points at nothing, because the
      // window where neither the league nor a redirect answers does not exist.
      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockRedirect.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ slug: "metro", leagueId: LEAGUE }),
        }),
      );
      expect(mockLeague.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { slug: "metro-hockey" } }),
      );
    });

    it("clears any retirement of the incoming slug so it cannot self-redirect", async () => {
      await updateAssociationSlug({ leagueId: LEAGUE, slug: "metro-hockey" });

      expect(mockRedirect.deleteMany).toHaveBeenCalledWith({
        where: { slug: "metro-hockey", teamId: null },
      });
    });

    it("refuses a slug another association already uses", async () => {
      mockLeague.findFirst.mockResolvedValue({ id: "other-league" });

      const result = await updateAssociationSlug({ leagueId: LEAGUE, slug: "taken" });

      expect(result.success).toBe(false);
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("refuses a slug retired by another association", async () => {
      // A retired slug is as taken as a live one: reusing it would hijack
      // somebody else's old links.
      mockRedirect.findFirst.mockResolvedValue({ id: "redirect-1" });

      const result = await updateAssociationSlug({ leagueId: LEAGUE, slug: "someone-elses-old" });

      expect(result.success).toBe(false);
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("rejects a slug with unsafe characters", async () => {
      for (const bad of ["Metro Hockey", "metro_hockey", "-metro", "metro--hockey", "ab"]) {
        const result = await updateAssociationSlug({ leagueId: LEAGUE, slug: bad });
        expect(result.success, `${bad} should be rejected`).toBe(false);
      }
    });

    it("is a no-op when the slug has not changed", async () => {
      const result = await updateAssociationSlug({ leagueId: LEAGUE, slug: "metro" });

      expect(result.success).toBe(true);
      expect(mockTransaction).not.toHaveBeenCalled();
    });
  });

  describe("team profiles", () => {
    it("retires the old team slug on rename", async () => {
      const result = await updateTeamPublicProfile({
        leagueId: LEAGUE,
        teamId: TEAM,
        slug: "metro-blades",
      });

      expect(result.success).toBe(true);
      expect(mockRedirect.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ slug: "blades", teamId: TEAM }),
        }),
      );
      expect(mockRedirect.deleteMany).toHaveBeenCalledWith({
        where: {
          leagueId: LEAGUE,
          slug: "metro-blades",
          teamId: TEAM,
        },
      });
    });

    it("refuses a slug retired by another team in the association", async () => {
      mockRedirect.findFirst.mockResolvedValue({ id: "other-team:metro-blades" });

      const result = await updateTeamPublicProfile({
        leagueId: LEAGUE,
        teamId: TEAM,
        slug: "metro-blades",
      });

      expect(result.success).toBe(false);
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("refuses to publish a team without an address", async () => {
      mockTeam.findFirst.mockReset();
      mockTeam.findFirst.mockResolvedValue({ id: TEAM, slug: null });

      const result = await updateTeamPublicProfile({
        leagueId: LEAGUE,
        teamId: TEAM,
        publish: true,
      });

      expect(result.success).toBe(false);
    });

    it("refuses a team from another association", async () => {
      mockTeam.findFirst.mockReset();
      mockTeam.findFirst.mockResolvedValue(null);

      const result = await updateTeamPublicProfile({
        leagueId: LEAGUE,
        teamId: TEAM,
        publicDescription: "x",
      });

      expect(result.success).toBe(false);
      expect(mockTeam.update).not.toHaveBeenCalled();
    });
  });

  describe("resolving a public slug", () => {
    it("returns the association directly when the slug is current", async () => {
      mockLeague.findFirst.mockResolvedValue({ id: LEAGUE, slug: "metro" });

      const resolved = await resolvePublicAssociation("metro");

      expect(resolved).toEqual({ id: LEAGUE, canonicalSlug: "metro", redirected: false });
      // Only published, active associations resolve.
      expect(mockLeague.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ profileStatus: "PUBLISHED", isActive: true }),
        }),
      );
    });

    it("follows a retirement to whatever the association is called today", async () => {
      mockLeague.findFirst.mockResolvedValue(null);
      mockRedirect.findFirst.mockResolvedValue({
        league: { id: LEAGUE, slug: "metro-hockey", profileStatus: "PUBLISHED", isActive: true },
      });

      const resolved = await resolvePublicAssociation("old-metro");

      // The redirect stores the target id, not a slug, so a second rename does
      // not strand the first old link and there are no chains to walk.
      expect(resolved).toEqual({
        id: LEAGUE,
        canonicalSlug: "metro-hockey",
        redirected: true,
      });
    });

    it("does not resolve a retirement whose association was unpublished", async () => {
      mockLeague.findFirst.mockResolvedValue(null);
      mockRedirect.findFirst.mockResolvedValue({
        league: { id: LEAGUE, slug: "metro", profileStatus: "UNPUBLISHED", isActive: true },
      });

      await expect(resolvePublicAssociation("old-metro")).resolves.toBeNull();
      await expect(resolveActiveAssociation("old-metro")).resolves.toEqual({
        id: LEAGUE,
        canonicalSlug: "metro",
        redirected: true,
      });
    });

    it("returns nothing for an unknown slug", async () => {
      mockLeague.findFirst.mockResolvedValue(null);
      mockRedirect.findFirst.mockResolvedValue(null);

      await expect(resolvePublicAssociation("nope")).resolves.toBeNull();
      await expect(getPublicAssociationProfile("nope")).resolves.toBeNull();
    });

    it("reads the public profile without a session", async () => {
      mockLeague.findFirst.mockResolvedValue({ id: LEAGUE, slug: "metro" });

      await getPublicAssociationProfile("metro");

      // The public readers must never require authentication.
      expect(mockRequireUserId).not.toHaveBeenCalled();
    });
  });
});
