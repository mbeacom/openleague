import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockItem, mockTeam, mockLeague, mockRequireUserId, mockHasCapability } = vi.hoisted(
  () => ({
    mockItem: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    mockTeam: { findFirst: vi.fn() },
    mockLeague: { findFirst: vi.fn() },
    mockRequireUserId: vi.fn(),
    mockHasCapability: vi.fn(),
  }),
);

vi.mock("@/lib/db/prisma", () => ({
  prisma: { publicContentItem: mockItem, team: mockTeam, league: mockLeague },
}));
vi.mock("@/lib/auth/session", () => ({ requireUserId: mockRequireUserId }));
vi.mock("@/lib/auth/capabilities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/capabilities")>();
  return { ...actual, hasCapability: mockHasCapability };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  archivePublicContent,
  createPublicContent,
  getPublicContentItem,
  listPublicAssociationContent,
  updatePublicContent,
} from "@/lib/actions/public-content";

const LEAGUE = "clfleague0000000000000001";
const TEAM = "clfteam00000000000000001";
const ITEM = "clfitem00000000000000001";
const NOW = new Date("2026-06-01T12:00:00Z");

describe("public content", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mockRequireUserId.mockResolvedValue("editor-1");
    mockHasCapability.mockResolvedValue(true);
    mockItem.findFirst.mockResolvedValue(null);
    mockItem.create.mockResolvedValue({ id: ITEM });
    mockTeam.findFirst.mockResolvedValue({ id: TEAM });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const base = {
    leagueId: LEAGUE,
    slug: "season-opens",
    title: "  Season opens  ",
    body: "  Bring skates.  ",
  };

  describe("creating", () => {
    it("publishes immediately when no date is given", async () => {
      const result = await createPublicContent(base);

      expect(result.success).toBe(true);
      const data = mockItem.create.mock.calls[0][0].data;
      expect(data.status).toBe("PUBLISHED");
      expect(data.publishedAt).toEqual(NOW);
      // Stored as written, trimmed: React escapes at render, so escaping here
      // would show entities literally.
      expect(data.title).toBe("Season opens");
      expect(data.body).toBe("Bring skates.");
    });

    it("schedules a future date without publishing it", async () => {
      const future = new Date("2026-07-01T00:00:00Z");

      await createPublicContent({ ...base, publishAt: future });

      const data = mockItem.create.mock.calls[0][0].data;
      expect(data.status).toBe("SCHEDULED");
      expect(data.publishAt).toEqual(future);
      expect(data.publishedAt).toBeNull();
    });

    it("gates on the content capability, scoped to the team when given", async () => {
      await createPublicContent({ ...base, teamId: TEAM });

      expect(mockHasCapability).toHaveBeenCalledWith(
        expect.objectContaining({ capability: "manage_public_content", teamId: TEAM }),
      );
    });

    it("refuses a caller without the capability", async () => {
      mockHasCapability.mockResolvedValue(false);

      const result = await createPublicContent(base);

      expect(result.success).toBe(false);
      expect(mockItem.create).not.toHaveBeenCalled();
    });

    it("refuses a team from another association", async () => {
      mockTeam.findFirst.mockResolvedValue(null);

      const result = await createPublicContent({ ...base, teamId: TEAM });

      expect(result.success).toBe(false);
      expect(mockItem.create).not.toHaveBeenCalled();
    });

    it("refuses a slug already used in this association", async () => {
      mockItem.findFirst.mockResolvedValue({ id: "other" });

      const result = await createPublicContent(base);

      expect(result.success).toBe(false);
      expect(mockItem.create).not.toHaveBeenCalled();
    });

    it("rejects an unsafe slug", async () => {
      for (const bad of ["Season Opens", "season_opens", "-season", "ab"]) {
        const result = await createPublicContent({ ...base, slug: bad });
        expect(result.success, `${bad} should be rejected`).toBe(false);
      }
    });
  });

  describe("updating", () => {
    beforeEach(() => {
      mockItem.findUnique.mockResolvedValue({
        id: ITEM,
        leagueId: LEAGUE,
        teamId: null,
        status: "PUBLISHED",
        publishedAt: new Date("2026-05-01T00:00:00Z"),
      });
    });

    it("keeps the original publication moment when rescheduling", async () => {
      await updatePublicContent({ itemId: ITEM, publishAt: new Date("2026-05-15T00:00:00Z") });

      const data = mockItem.update.mock.calls[0][0].data;
      // Moving a published post's date should not rewrite when it first went out.
      expect(data.publishedAt).toEqual(new Date("2026-05-01T00:00:00Z"));
      expect(data.status).toBe("PUBLISHED");
    });

    it("moves a published post back to scheduled when dated forward", async () => {
      await updatePublicContent({ itemId: ITEM, publishAt: new Date("2026-09-01T00:00:00Z") });

      const data = mockItem.update.mock.calls[0][0].data;
      expect(data.status).toBe("SCHEDULED");
      expect(data.publishedAt).toBeNull();
    });

    it("refuses to edit an archived post", async () => {
      mockItem.findUnique.mockResolvedValue({
        id: ITEM,
        leagueId: LEAGUE,
        teamId: null,
        status: "ARCHIVED",
        publishedAt: null,
      });

      const result = await updatePublicContent({ itemId: ITEM, title: "New" });

      expect(result.success).toBe(false);
      expect(mockItem.update).not.toHaveBeenCalled();
    });

    it("checks the capability against the post's own team", async () => {
      mockItem.findUnique.mockResolvedValue({
        id: ITEM,
        leagueId: LEAGUE,
        teamId: TEAM,
        status: "PUBLISHED",
        publishedAt: NOW,
      });

      await updatePublicContent({ itemId: ITEM, title: "New" });

      expect(mockHasCapability).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: TEAM }),
      );
    });
  });

  describe("archiving", () => {
    it("stamps the archive moment", async () => {
      mockItem.findUnique.mockResolvedValue({
        id: ITEM, leagueId: LEAGUE, teamId: null, status: "PUBLISHED",
      });

      const result = await archivePublicContent(ITEM);

      expect(result.success).toBe(true);
      expect(mockItem.update.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ status: "ARCHIVED" }),
      );
    });

    it("is idempotent", async () => {
      mockItem.findUnique.mockResolvedValue({
        id: ITEM, leagueId: LEAGUE, teamId: null, status: "ARCHIVED",
      });

      const result = await archivePublicContent(ITEM);

      expect(result.success).toBe(true);
      expect(mockItem.update).not.toHaveBeenCalled();
    });
  });

  describe("public reads", () => {
    it("returns only public, unarchived items whose time has come", async () => {
      mockItem.findMany.mockResolvedValue([]);

      await listPublicAssociationContent(LEAGUE);

      const where = mockItem.findMany.mock.calls[0][0].where;
      expect(where).toEqual(
        expect.objectContaining({
          leagueId: LEAGUE,
          visibility: "PUBLIC",
          status: { in: ["PUBLISHED", "SCHEDULED"] },
          publishAt: { lte: NOW },
          archivedAt: null,
        }),
      );
    });

    it("never selects the author, so a volunteer's name stays off the page", async () => {
      mockItem.findMany.mockResolvedValue([]);

      await listPublicAssociationContent(LEAGUE);

      const select = mockItem.findMany.mock.calls[0][0].select;
      expect(select.author).toBeUndefined();
      expect(select.authorId).toBeUndefined();
      expect(select.visibility).toBeUndefined();
    });

    it("reads a single item without a session", async () => {
      mockLeague.findFirst.mockResolvedValue({ id: LEAGUE, name: "Metro", slug: "metro" });
      mockItem.findFirst.mockResolvedValue({ id: ITEM, slug: "season-opens" });

      const result = await getPublicContentItem("metro", "season-opens");

      expect(result?.item.id).toBe(ITEM);
      expect(mockRequireUserId).not.toHaveBeenCalled();
    });

    it("returns nothing when the association is not published", async () => {
      mockLeague.findFirst.mockResolvedValue(null);

      await expect(getPublicContentItem("metro", "season-opens")).resolves.toBeNull();
      expect(mockItem.findFirst).not.toHaveBeenCalled();
    });

    it("does not surface a members-only item to the public reader", async () => {
      mockLeague.findFirst.mockResolvedValue({ id: LEAGUE, name: "Metro", slug: "metro" });
      mockItem.findFirst.mockResolvedValue(null);

      await getPublicContentItem("metro", "members-only-post");

      expect(mockItem.findFirst.mock.calls[0][0].where).toEqual(
        expect.objectContaining({ visibility: "PUBLIC" }),
      );
    });
  });
});
