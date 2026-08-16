import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  mockRequireUserId,
  mockRequireLeagueRole,
  mockGetUserLeagueRole,
  mockIsTeamAdmin,
  mockCheckRateLimit,
  mockGetClientIp,
  mockPrisma,
  tx,
} = vi.hoisted(() => {
  const tx = {
    teamGearNeed: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    teamGearNeedLine: { update: vi.fn(), updateMany: vi.fn() },
    gearCatalogItem: { findMany: vi.fn(), findFirst: vi.fn() },
    gearActivity: { create: vi.fn() },
    gearWishlist: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    gearWishlistItem: { update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    gearPledge: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    gearPledgeReceipt: { aggregate: vi.fn(), create: vi.fn() },
    gearPoolStock: { findFirst: vi.fn(), update: vi.fn() },
    gearStorageLocation: { findFirst: vi.fn() },
    gearUnit: { findMany: vi.fn(), create: vi.fn() },
    gearInventoryMovement: { create: vi.fn() },
    notificationOutbox: { createMany: vi.fn() },
    leagueUser: { findMany: vi.fn() },
    teamMember: { findMany: vi.fn() },
  };
  return {
    tx,
    mockRequireUserId: vi.fn(),
    mockRequireLeagueRole: vi.fn(),
    mockGetUserLeagueRole: vi.fn(),
    mockIsTeamAdmin: vi.fn(),
    mockCheckRateLimit: vi.fn(),
    mockGetClientIp: vi.fn(),
    mockPrisma: {
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      team: { findFirst: vi.fn(), findMany: vi.fn() },
      teamMember: { findMany: vi.fn() },
      teamGearNeed: { findFirst: vi.fn(), findMany: vi.fn() },
      gearWishlist: { findFirst: vi.fn() },
      gearPledge: { findFirst: vi.fn() },
    },
  };
});

vi.mock("@/lib/auth/session", () => ({
  requireUserId: (...args: unknown[]) => mockRequireUserId(...args),
  requireLeagueRole: (...args: unknown[]) => mockRequireLeagueRole(...args),
  getUserLeagueRole: (...args: unknown[]) => mockGetUserLeagueRole(...args),
  isTeamAdmin: (...args: unknown[]) => mockIsTeamAdmin(...args),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/utils/durable-rate-limit", () => ({
  RATE_LIMITS: { GEAR_PLEDGE_PER_IP: { limit: 10, windowSec: 3600 } },
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: (...args: unknown[]) => mockGetClientIp(...args),
  rateLimitMessage: () => "Too many requests — try again in 1 minute.",
}));

import {
  createTeamGearNeed,
  getGearNeedDetail,
  submitTeamGearNeed,
} from "@/lib/actions/gear-needs";
import {
  getPublicGearWishlist,
  rotateGearWishlistShareToken,
} from "@/lib/actions/gear-wishlist";
import {
  createPublicGearPledge,
  receiveGearPledge,
} from "@/lib/actions/gear-pledges";

const LEAGUE_ID = "cllllllllllllllllllllllll";
const TEAM_ID = "cttttttttttttttttttttttt";
const NEED_ID = "cnnnnnnnnnnnnnnnnnnnnnnn";
const CATALOG_ID = "ccccccccccccccccccccccccc";
const LOCATION_ID = "clocccccccccccccccccccccc";
const STOCK_ID = "cstockkkkkkkkkkkkkkkkkkkkk";
const WISHLIST_ID = "cwwwwwwwwwwwwwwwwwwwwwwww";
const WISHLIST_ITEM_ID = "cwiiiiiiiiiiiiiiiiiiiiiii";
const PLEDGE_ID = "cpppppppppppppppppppppppp";
const USER_ID = "cuuuuuuuuuuuuuuuuuuuuuuuu";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUserId.mockResolvedValue(USER_ID);
  mockRequireLeagueRole.mockResolvedValue(USER_ID);
  mockGetUserLeagueRole.mockResolvedValue("TEAM_ADMIN");
  mockIsTeamAdmin.mockResolvedValue(true);
  mockPrisma.team.findFirst.mockResolvedValue({ id: TEAM_ID });
  mockCheckRateLimit.mockResolvedValue({ allowed: true });
  mockGetClientIp.mockResolvedValue("203.0.113.42");
  tx.gearActivity.create.mockResolvedValue({});
  tx.gearInventoryMovement.create.mockResolvedValue({});
  tx.leagueUser.findMany.mockResolvedValue([{ userId: USER_ID }]);
  tx.teamMember.findMany.mockResolvedValue([{ userId: USER_ID }]);
  tx.gearWishlistItem.update.mockResolvedValue({});
  tx.gearPledge.updateMany.mockResolvedValue({ count: 1 });
});

describe("Layer 4 gear actions", () => {
  it("scopes free-text and catalog-backed need lines and creates no reservation", async () => {
    tx.gearCatalogItem.findMany.mockResolvedValue([
      { id: CATALOG_ID, name: "Official Helmet", category: "Safety", size: "Youth", trackingMode: "POOLED" },
    ]);
    tx.teamGearNeed.create.mockResolvedValue({ id: NEED_ID, version: 0 });

    const result = await createTeamGearNeed({
      leagueId: LEAGUE_ID,
      teamId: TEAM_ID,
      title: "Spring equipment",
      lines: [
        { catalogItemId: CATALOG_ID, nameSnapshot: "Client supplied", requestedQty: 3 },
        { nameSnapshot: "Tape rolls", categorySnapshot: "Supplies", requestedQty: 8 },
      ],
    });

    expect(result).toEqual({ success: true, data: { id: NEED_ID, version: 0 } });
    expect(tx.teamGearNeed.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        leagueId: LEAGUE_ID,
        teamId: TEAM_ID,
        lines: { create: expect.arrayContaining([
          expect.objectContaining({ catalogItemId: CATALOG_ID, nameSnapshot: "Official Helmet", trackingMode: "POOLED" }),
          expect.objectContaining({ catalogItemId: null, nameSnapshot: "Tape rolls", categorySnapshot: "Supplies" }),
        ]) },
      }),
    }));
    expect((tx as Record<string, unknown>).gearReservation).toBeUndefined();
  });

  it("guards need submission by state and scopes detail reads to the requested league", async () => {
    tx.teamGearNeed.findFirst.mockResolvedValue({
      id: NEED_ID, leagueId: LEAGUE_ID, teamId: TEAM_ID, status: "SUBMITTED", version: 2,
      createdById: USER_ID, lines: [],
    });

    const transition = await submitTeamGearNeed({
      leagueId: LEAGUE_ID, needId: NEED_ID, expectedVersion: 2,
    });
    expect(transition).toEqual({
      success: false,
      error: "This gear need cannot transition from submitted to submitted.",
    });
    expect(tx.teamGearNeed.updateMany).not.toHaveBeenCalled();

    mockPrisma.teamGearNeed.findFirst.mockResolvedValue({
      id: NEED_ID, teamId: TEAM_ID, title: "Need", notes: null, status: "DRAFT", version: 0,
      submittedAt: null, approvedAt: null, fulfilledAt: null, canceledAt: null, createdAt: new Date("2026-01-01"),
      team: { name: "Scoped Team" }, lines: [],
    });
    await getGearNeedDetail(LEAGUE_ID, NEED_ID);
    expect(mockPrisma.teamGearNeed.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: NEED_ID, leagueId: LEAGUE_ID }),
    }));
  });

  it("submits only from draft and atomically queues the league-admin notification", async () => {
    tx.teamGearNeed.findFirst.mockResolvedValue({
      id: NEED_ID, leagueId: LEAGUE_ID, teamId: TEAM_ID, status: "DRAFT", version: 2,
      createdById: USER_ID, lines: [],
    });
    tx.teamGearNeed.updateMany.mockResolvedValue({ count: 1 });

    const result = await submitTeamGearNeed({
      leagueId: LEAGUE_ID, needId: NEED_ID, expectedVersion: 2,
    });

    expect(result).toEqual(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ status: "SUBMITTED", version: 3 }),
    }));
    expect(tx.teamGearNeed.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: NEED_ID, version: 2, status: "DRAFT" },
    }));
    expect(tx.notificationOutbox.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        eventType: "gear.need.submitted",
        aggregateType: "NEED",
        aggregateId: NEED_ID,
        dedupeKey: `gear.need.submitted:${NEED_ID}:${USER_ID}`,
      })],
    }));
  });

  it("returns only public wishlist data with the association name and rejects unpublished tokens", async () => {
    mockPrisma.gearWishlist.findFirst.mockResolvedValue({
      league: { name: "Open League" },
      title: "Community gear drive",
      description: "Help our players",
      items: [{
        id: WISHLIST_ITEM_ID, nameSnapshot: "Helmet", categorySnapshot: "Safety", sizeSnapshot: "Youth",
        description: null, targetQty: 5, pledgedQty: 6, receivedQty: 1,
      }],
    });
    const projection = await getPublicGearWishlist("t".repeat(32));
    expect(projection).toEqual({
      associationName: "Open League",
      title: "Community gear drive",
      description: "Help our players",
      items: [expect.objectContaining({ id: WISHLIST_ITEM_ID, remainingQty: 0 })],
    });
    expect(projection).not.toHaveProperty("leagueId");
    expect(projection).not.toHaveProperty("shareToken");

    mockPrisma.gearWishlist.findFirst.mockResolvedValue(null);
    await expect(getPublicGearWishlist("t".repeat(32))).resolves.toBeNull();
    expect(mockPrisma.gearWishlist.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "PUBLISHED" }),
    }));
  });

  it("rotates a wishlist token with optimistic version protection and transactional outbox", async () => {
    tx.gearWishlist.findUnique.mockResolvedValue({
      id: WISHLIST_ID, status: "PUBLISHED", version: 4,
    });
    tx.gearWishlist.updateMany.mockResolvedValue({ count: 1 });

    const result = await rotateGearWishlistShareToken({
      leagueId: LEAGUE_ID, expectedVersion: 4,
    });

    expect(result.success).toBe(true);
    expect(tx.gearWishlist.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: WISHLIST_ID, version: 4, status: "PUBLISHED" },
      data: expect.objectContaining({ version: { increment: 1 } }),
    }));
    expect(tx.gearActivity.create).toHaveBeenCalled();
    expect(tx.leagueUser.findMany).toHaveBeenCalled();
  });

  it("handles honeypot, idempotency, and rate limits without creating a pledge", async () => {
    const common = {
      wishlistToken: "t".repeat(32), wishlistItemId: WISHLIST_ITEM_ID, donorName: "Donor",
      quantity: 1, idempotencyKey: "i".repeat(16),
    };
    await expect(createPublicGearPledge({ ...common, website: "spam" })).resolves.toEqual({
      success: true, data: { id: null, status: "PLEDGED" },
    });
    expect(mockPrisma.gearPledge.findFirst).not.toHaveBeenCalled();

    await expect(createPublicGearPledge(common)).resolves.toEqual({
      success: false, error: "Contact consent is required to submit a pledge.",
    });

    mockPrisma.gearPledge.findFirst.mockResolvedValue({ id: PLEDGE_ID, status: "PLEDGED" });
    await expect(createPublicGearPledge({ ...common, contactConsent: true })).resolves.toEqual({
      success: true, data: { id: PLEDGE_ID, status: "PLEDGED" },
    });

    mockPrisma.gearPledge.findFirst.mockResolvedValue(null);
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 60 });
    await expect(createPublicGearPledge({ ...common, contactConsent: true })).resolves.toEqual({
      success: false, error: "Too many requests — try again in 1 minute.",
    });
  });

  it("records pooled pledge receipt stock, ledger activity, and outbox atomically", async () => {
    tx.gearPledge.findFirst.mockResolvedValue({
      id: PLEDGE_ID, quantity: 2, wishlistItem: { id: WISHLIST_ITEM_ID, catalogItemId: CATALOG_ID },
    });
    tx.gearPledgeReceipt.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });
    tx.gearPoolStock.findFirst.mockResolvedValue({
      id: STOCK_ID, catalogItemId: CATALOG_ID, locationId: LOCATION_ID, condition: "GOOD",
    });
    tx.gearPledgeReceipt.create.mockResolvedValue({ id: "creceipt00000000000000001" });

    const result = await receiveGearPledge({
      leagueId: LEAGUE_ID, pledgeId: PLEDGE_ID, poolStockId: STOCK_ID, quantity: 2,
    });
    expect(result.success).toBe(true);
    expect(tx.gearPoolStock.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ quantityOnHand: { increment: 2 } }),
    }));
    expect(tx.gearInventoryMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "RECEIPT", poolStockId: STOCK_ID }),
    }));
    expect(tx.notificationOutbox.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        eventType: "gear.pledge.received",
        aggregateType: "PLEDGE",
        aggregateId: PLEDGE_ID,
      })],
    }));
  });

  it("creates a tagged unit, receipt, movement, and activity for every unique asset tag", async () => {
    tx.gearPledge.findFirst.mockResolvedValue({
      id: PLEDGE_ID, quantity: 2, wishlistItem: { id: WISHLIST_ITEM_ID, catalogItemId: CATALOG_ID },
    });
    tx.gearPledgeReceipt.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });
    tx.gearCatalogItem.findFirst.mockResolvedValue({ id: CATALOG_ID });
    tx.gearStorageLocation.findFirst.mockResolvedValue({ id: LOCATION_ID });
    tx.gearUnit.findMany.mockResolvedValue([]);
    tx.gearUnit.create
      .mockResolvedValueOnce({ id: "cunit111111111111111111111" })
      .mockResolvedValueOnce({ id: "cunit222222222222222222222" });
    tx.gearPledgeReceipt.create
      .mockResolvedValueOnce({ id: "creceipt1111111111111111111" })
      .mockResolvedValueOnce({ id: "creceipt2222222222222222222" });

    const result = await receiveGearPledge({
      leagueId: LEAGUE_ID, pledgeId: PLEDGE_ID, catalogItemId: CATALOG_ID,
      assetTags: [" tag 1 ", "tag 2"], locationId: LOCATION_ID, condition: "GOOD", quantity: 2,
    });
    expect(result.success).toBe(true);
    expect(tx.gearUnit.create).toHaveBeenCalledTimes(2);
    expect(tx.gearUnit.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ assetTag: "TAG1", currentLocationId: LOCATION_ID }),
    }));
    expect(tx.gearPledgeReceipt.create).toHaveBeenCalledTimes(2);
    expect(tx.gearInventoryMovement.create).toHaveBeenCalledTimes(2);
    expect(tx.gearActivity.create).toHaveBeenCalledTimes(3);
    expect(tx.notificationOutbox.createMany).toHaveBeenCalled();

    const duplicate = await receiveGearPledge({
      leagueId: LEAGUE_ID, pledgeId: PLEDGE_ID, catalogItemId: CATALOG_ID,
      assetTags: ["tag 1", "TAG1"], locationId: LOCATION_ID, condition: "GOOD", quantity: 2,
    });
    expect(duplicate).toEqual({ success: false, error: "Each received asset tag must be unique." });
  });
});
