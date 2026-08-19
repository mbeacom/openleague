import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  mockRequireUserId,
  mockRequireGearPermission,
  mockGetUserLeagueRole,
  mockIsTeamAdmin,
  mockCheckRateLimit,
  mockGetClientIp,
  mockPrisma,
  tx,
} = vi.hoisted(() => {
  const tx = {
    teamGearNeed: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    teamGearNeedCommand: { findUnique: vi.fn(), create: vi.fn() },
    teamGearNeedLine: { update: vi.fn(), updateMany: vi.fn() },
    gearCatalogItem: { findMany: vi.fn(), findFirst: vi.fn() },
    gearActivity: { create: vi.fn() },
    gearWishlist: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    gearWishlistItem: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    gearPledge: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    gearPledgeReceipt: { aggregate: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    gearPledgeReceiptCommand: { findUnique: vi.fn(), create: vi.fn() },
    gearPoolStock: { findFirst: vi.fn(), upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    gearStorageLocation: { findFirst: vi.fn() },
    gearUnit: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    gearInventoryMovement: { create: vi.fn() },
    notificationOutbox: { createMany: vi.fn() },
    user: { findMany: vi.fn() },
    leagueUser: { findMany: vi.fn() },
    teamMember: { findMany: vi.fn() },
  };
  return {
    tx,
    mockRequireUserId: vi.fn(),
    mockRequireGearPermission: vi.fn(),
    mockGetUserLeagueRole: vi.fn(),
    mockIsTeamAdmin: vi.fn(),
    mockCheckRateLimit: vi.fn(),
    mockGetClientIp: vi.fn(),
    mockPrisma: {
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      team: { findFirst: vi.fn(), findMany: vi.fn() },
      teamMember: { findMany: vi.fn() },
      teamGearNeed: { findFirst: vi.fn(), findMany: vi.fn() },
      teamGearNeedCommand: { findUnique: vi.fn() },
      gearWishlist: { findFirst: vi.fn() },
      gearPledge: { findFirst: vi.fn(), findMany: vi.fn() },
      gearPledgeReceiptCommand: { findUnique: vi.fn() },
    },
  };
});

vi.mock("@/lib/auth/session", () => ({
  requireUserId: (...args: unknown[]) => mockRequireUserId(...args),
  // Still mocked: the need and reservation actions in this suite continue to
  // guard on the legacy league role.
  requireLeagueRole: (...args: unknown[]) => mockRequireGearPermission(...args),
  getUserLeagueRole: (...args: unknown[]) => mockGetUserLeagueRole(...args),
  isTeamAdmin: (...args: unknown[]) => mockIsTeamAdmin(...args),
}));
// Wishlist and pledge actions now authorize through the permission matrix, so
// association role grants reach them. Same mock target: authorized resolves to
// the acting user, unauthorized throws.
vi.mock("@/lib/utils/permissions", () => ({
  requirePermissionForLeague: (...args: unknown[]) => mockRequireGearPermission(...args),
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
  getGearNeedsContext,
  submitTeamGearNeed,
} from "@/lib/actions/gear-needs";
import {
  getPublicGearWishlist,
  rotateGearWishlistShareToken,
  saveGearWishlist,
} from "@/lib/actions/gear-wishlist";
import {
  createPublicGearPledge,
  correctGearPledgeReceipt,
  getGearPledgeAdminContext,
  redactGearPledgePii,
  receiveGearPledge,
} from "@/lib/actions/gear-pledges";
import { queueGearOutboxForRecipients } from "@/lib/services/gear-outbox";

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
  mockRequireGearPermission.mockResolvedValue(USER_ID);
  mockGetUserLeagueRole.mockResolvedValue("TEAM_ADMIN");
  mockIsTeamAdmin.mockResolvedValue(true);
  mockPrisma.team.findFirst.mockResolvedValue({ id: TEAM_ID });
  mockPrisma.teamMember.findMany.mockResolvedValue([]);
  mockCheckRateLimit.mockResolvedValue({ allowed: true });
  mockGetClientIp.mockResolvedValue("203.0.113.42");
  tx.gearActivity.create.mockResolvedValue({});
  tx.gearInventoryMovement.create.mockResolvedValue({});
  tx.leagueUser.findMany.mockResolvedValue([{ userId: USER_ID }]);
  tx.teamMember.findMany.mockResolvedValue([{ userId: USER_ID }]);
  tx.user.findMany.mockResolvedValue([{ id: USER_ID, email: "admin@example.com" }]);
  tx.gearWishlistItem.update.mockResolvedValue({});
  tx.gearPledge.updateMany.mockResolvedValue({ count: 1 });
  tx.gearPledgeReceiptCommand.findUnique.mockResolvedValue(null);
  tx.gearPledgeReceiptCommand.create.mockResolvedValue({ id: "creceipt-command000000001" });
  tx.teamGearNeedCommand.findUnique.mockResolvedValue(null);
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
      idempotencyKey: "n".repeat(16),
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
    expect(tx.teamGearNeedCommand.create).toHaveBeenCalledWith({
      data: {
        leagueId: LEAGUE_ID,
        teamId: TEAM_ID,
        idempotencyKey: "n".repeat(16),
        needId: NEED_ID,
      },
    });
    expect((tx as Record<string, unknown>).gearReservation).toBeUndefined();
  });

  it("replays a persisted league/team-scoped create-need command without creating another draft", async () => {
    tx.teamGearNeedCommand.findUnique.mockResolvedValue({
      need: { id: NEED_ID, version: 2 },
    });

    await expect(createTeamGearNeed({
      leagueId: LEAGUE_ID,
      teamId: TEAM_ID,
      idempotencyKey: "n".repeat(16),
      title: "Spring equipment",
      lines: [{ nameSnapshot: "Tape", requestedQty: 1 }],
    })).resolves.toEqual({ success: true, data: { id: NEED_ID, version: 2 } });
    expect(tx.teamGearNeed.create).not.toHaveBeenCalled();
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

  it("derives need operation capabilities from current team and league roles", async () => {
    mockPrisma.teamMember.findMany.mockResolvedValue([{ team: { id: TEAM_ID, name: "Scoped Team" } }]);
    mockPrisma.teamGearNeed.findMany.mockResolvedValue([
      {
        id: NEED_ID, teamId: TEAM_ID, title: "Need", notes: null, status: "DRAFT", version: 0,
        submittedAt: null, approvedAt: null, fulfilledAt: null, canceledAt: null, createdAt: new Date("2026-01-01"),
        team: { name: "Scoped Team" }, lines: [],
      },
    ]);

    const teamContext = await getGearNeedsContext(LEAGUE_ID);
    expect(teamContext?.needs[0]).toMatchObject({
      canSubmit: true, canCancel: true, canApprove: false, canFulfill: false,
      capabilities: { canSubmit: true, canCancel: true, canApprove: false, canFulfill: false },
    });

    mockGetUserLeagueRole.mockResolvedValue("LEAGUE_ADMIN");
    mockPrisma.team.findMany.mockResolvedValue([{ id: TEAM_ID, name: "Scoped Team" }]);
    mockPrisma.teamMember.findMany.mockResolvedValue([]);
    mockPrisma.teamGearNeed.findMany.mockResolvedValue([
      {
        id: NEED_ID, teamId: TEAM_ID, title: "Need", notes: null, status: "SUBMITTED", version: 1,
        submittedAt: new Date("2026-01-02"), approvedAt: null, fulfilledAt: null, canceledAt: null,
        createdAt: new Date("2026-01-01"), team: { name: "Scoped Team" }, lines: [],
      },
    ]);

    const leagueContext = await getGearNeedsContext(LEAGUE_ID);
    expect(leagueContext?.needs[0]).toMatchObject({
      canSubmit: false, canCancel: false, canApprove: true, canFulfill: false,
      capabilities: { canSubmit: false, canCancel: false, canApprove: true, canFulfill: false },
    });
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
        dedupeKey: `gear.need.submitted:${NEED_ID}:v3:user:${USER_ID}`,
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

  it("recycles an archived projection into a fresh campaign with a rotated token and reset items", async () => {
    tx.gearWishlist.findUnique.mockResolvedValue({
      id: WISHLIST_ID,
      shareToken: "old-token",
      status: "ARCHIVED",
      version: 7,
      items: [{ id: "colditem00000000000000000", normalizedKey: "old", targetQty: 1, pledgedQty: 1, receivedQty: 1, isActive: false }],
    });
    tx.gearCatalogItem.findMany.mockResolvedValue([]);
    tx.gearWishlist.updateMany.mockResolvedValue({ count: 1 });
    tx.gearWishlistItem.updateMany.mockResolvedValue({ count: 1 });
    tx.gearWishlistItem.create.mockResolvedValue({ id: WISHLIST_ITEM_ID });

    const result = await saveGearWishlist({
      leagueId: LEAGUE_ID,
      expectedVersion: 7,
      title: "Autumn drive",
      description: "New campaign",
      publish: true,
      items: [{ nameSnapshot: "New helmet", targetQty: 5 }],
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.shareToken).not.toBe("old-token");
    expect(tx.gearWishlist.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: WISHLIST_ID, version: 7, status: "ARCHIVED" },
      data: expect.objectContaining({ status: "PUBLISHED", archivedAt: null }),
    }));
    expect(tx.gearWishlistItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { isActive: false },
    }));
    expect(tx.gearWishlistItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ leagueId: LEAGUE_ID, wishlistId: WISHLIST_ID, nameSnapshot: "New helmet" }),
    }));
  });

  it("keeps distinct outbox occurrences while deduplicating recipients within each occurrence", async () => {
    const outboxTx = {
      notificationOutbox: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      user: { findMany: vi.fn().mockResolvedValue([{ id: USER_ID, email: "admin@example.com" }]) },
    };
    const event = {
      leagueId: LEAGUE_ID,
      eventType: "gear.wishlist.published",
      aggregateType: "WISHLIST" as const,
      aggregateId: WISHLIST_ID,
      payload: { kind: "GEAR_WISHLIST" as const, data: { wishlistId: WISHLIST_ID } },
    };
    await queueGearOutboxForRecipients(outboxTx as never, { ...event, occurrenceKey: "v1" }, [USER_ID, USER_ID]);
    await queueGearOutboxForRecipients(outboxTx as never, { ...event, occurrenceKey: "v2" }, [USER_ID]);

    expect(outboxTx.notificationOutbox.createMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: [expect.objectContaining({ dedupeKey: `gear.wishlist.published:${WISHLIST_ID}:v1:user:${USER_ID}` })],
    }));
    expect(outboxTx.notificationOutbox.createMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: [expect.objectContaining({ dedupeKey: `gear.wishlist.published:${WISHLIST_ID}:v2:user:${USER_ID}` })],
    }));
  });

  it("handles honeypot, idempotency, and rate limits without creating a pledge", async () => {
    const common = {
      wishlistToken: "t".repeat(32), wishlistItemId: WISHLIST_ITEM_ID, donorName: "Donor",
      donorEmail: "donor@example.com", quantity: 1, idempotencyKey: "i".repeat(16),
    };
    await expect(createPublicGearPledge({ ...common, website: "spam" })).resolves.toEqual({
      success: false, error: "Unable to submit the pledge. Please try again.",
    });
    expect(mockPrisma.gearPledge.findFirst).not.toHaveBeenCalled();

    await expect(createPublicGearPledge({ ...common, donorEmail: "" })).resolves.toMatchObject({
      success: false, error: "Please correct the highlighted pledge fields.",
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
    expect(mockCheckRateLimit.mock.calls.at(-1)?.[0]).not.toContain("t".repeat(32));
    expect(mockCheckRateLimit.mock.calls.at(-1)?.[2]).toEqual({ failOpen: false });
  });

  it("caps public pledges at the current outstanding target in the serializable transaction", async () => {
    mockPrisma.gearPledge.findFirst.mockResolvedValue(null);
    tx.gearWishlistItem.findFirst.mockResolvedValue({
      id: WISHLIST_ITEM_ID,
      targetQty: 5,
      pledgedQty: 4,
      receivedQty: 0,
      wishlist: { leagueId: LEAGUE_ID },
    });
    tx.gearPledge.findUnique.mockResolvedValue(null);
    tx.gearWishlistItem.update.mockResolvedValue({
      id: WISHLIST_ITEM_ID,
      targetQty: 5,
      pledgedQty: 4,
      receivedQty: 0,
      wishlist: { leagueId: LEAGUE_ID },
    });

    const result = await createPublicGearPledge({
      wishlistToken: "t".repeat(32),
      wishlistItemId: WISHLIST_ITEM_ID,
      donorName: "Donor",
      donorPhone: "555-0100",
      contactConsent: true,
      quantity: 2,
      idempotencyKey: "q".repeat(16),
    });

    expect(result).toEqual({ success: false, error: "Pledge quantity exceeds the remaining wishlist target." });
    expect(tx.gearWishlistItem.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { pledgedQty: { increment: 0 } },
    }));
    expect(tx.gearPledge.create).not.toHaveBeenCalled();
  });

  it("fails closed for anonymous pledges without a trusted client address", async () => {
    mockPrisma.gearPledge.findFirst.mockResolvedValue(null);
    mockGetClientIp.mockResolvedValue(null);

    await expect(createPublicGearPledge({
      wishlistToken: "t".repeat(32),
      wishlistItemId: WISHLIST_ITEM_ID,
      donorName: "Donor",
      donorPhone: "555-0100",
      contactConsent: true,
      quantity: 1,
      idempotencyKey: "a".repeat(16),
    })).resolves.toEqual({
      success: false,
      error: "Unable to submit the pledge. Please try again.",
    });
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it("records pooled pledge receipt stock, ledger activity, and outbox atomically", async () => {
    tx.gearPledge.findFirst.mockResolvedValue({
      id: PLEDGE_ID, version: 0, quantity: 2, wishlistItem: { id: WISHLIST_ITEM_ID, catalogItemId: CATALOG_ID },
    });
    tx.gearPledgeReceipt.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });
    tx.gearPoolStock.findFirst.mockResolvedValue({
      id: STOCK_ID, catalogItemId: CATALOG_ID, locationId: LOCATION_ID, condition: "GOOD",
    });
    tx.gearPledgeReceipt.create.mockResolvedValue({ id: "creceipt00000000000000001" });

    const result = await receiveGearPledge({
      leagueId: LEAGUE_ID, pledgeId: PLEDGE_ID, poolStockId: STOCK_ID, quantity: 2,
      expectedVersion: 0, idempotencyKey: "r".repeat(16),
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

  it("returns a saved receipt command on retry without touching inventory again", async () => {
    const input = {
      leagueId: LEAGUE_ID, pledgeId: PLEDGE_ID, poolStockId: STOCK_ID, quantity: 2,
      expectedVersion: 2, idempotencyKey: "z".repeat(16),
    };
    tx.gearPledgeReceiptCommand.findUnique.mockResolvedValue({
      payloadHash: createHash("sha256").update(JSON.stringify({
        leagueId: LEAGUE_ID,
        pledgeId: PLEDGE_ID,
        expectedVersion: 2,
        poolStockId: STOCK_ID,
        catalogItemId: null,
        locationId: null,
        condition: null,
        quantity: 2,
        notes: null,
        assetTags: [],
      })).digest("hex"),
      resultingStatus: "RECEIVED",
      resultingVersion: 3,
      receipts: [{ id: "creceipt00000000000000001" }],
    });

    const result = await receiveGearPledge(input);

    expect(result).toEqual({
      success: true,
      data: {
        receiptId: "creceipt00000000000000001",
        receiptIds: ["creceipt00000000000000001"],
        pledgeStatus: "RECEIVED",
        pledgeVersion: 3,
      },
    });
    expect(tx.gearPoolStock.update).not.toHaveBeenCalled();
    expect(tx.gearPledgeReceipt.create).not.toHaveBeenCalled();
  });

  it("rejects a receipt operation key replayed with a different payload", async () => {
    tx.gearPledgeReceiptCommand.findUnique.mockResolvedValue({
      payloadHash: "different",
      resultingStatus: "RECEIVED",
      resultingVersion: 3,
      receipts: [{ id: "creceipt00000000000000001" }],
    });

    await expect(receiveGearPledge({
      leagueId: LEAGUE_ID, pledgeId: PLEDGE_ID, poolStockId: STOCK_ID, quantity: 2,
      expectedVersion: 2, idempotencyKey: "z".repeat(16),
    })).resolves.toEqual({
      success: false,
      error: "This receipt operation key was already used with different details.",
    });
  });

  it("creates a first pooled stock receipt through its catalog-location-condition composite", async () => {
    tx.gearPledge.findFirst.mockResolvedValue({
      id: PLEDGE_ID, version: 0, quantity: 1, wishlistItem: { id: WISHLIST_ITEM_ID, catalogItemId: CATALOG_ID },
    });
    tx.gearPledgeReceipt.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });
    tx.gearCatalogItem.findFirst.mockResolvedValue({ id: CATALOG_ID });
    tx.gearStorageLocation.findFirst.mockResolvedValue({ id: LOCATION_ID });
    tx.gearPoolStock.upsert.mockResolvedValue({
      id: STOCK_ID, catalogItemId: CATALOG_ID, locationId: LOCATION_ID, condition: "FAIR",
    });
    tx.gearPledgeReceipt.create.mockResolvedValue({ id: "creceipt00000000000000001" });

    await expect(receiveGearPledge({
      leagueId: LEAGUE_ID, pledgeId: PLEDGE_ID, catalogItemId: CATALOG_ID,
      locationId: LOCATION_ID, condition: "FAIR", quantity: 1,
      expectedVersion: 0, idempotencyKey: "n".repeat(16),
    })).resolves.toMatchObject({ success: true });
    expect(tx.gearPoolStock.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { leagueId_catalogItemId_locationId_condition: {
        leagueId: LEAGUE_ID, catalogItemId: CATALOG_ID, locationId: LOCATION_ID, condition: "FAIR",
      } },
    }));
  });

  it("compensates a receipt without mutating its history and returns the pledge to pledged", async () => {
    tx.gearPledgeReceipt.findFirst.mockResolvedValue({
      id: "creceipt00000000000000001",
      pledgeId: PLEDGE_ID,
      catalogItemId: CATALOG_ID,
      poolStockId: STOCK_ID,
      gearUnitId: null,
      quantity: 2,
      correction: null,
      pledge: {
        status: "RECEIVED",
        version: 3,
        wishlistItem: { id: WISHLIST_ITEM_ID, receivedQty: 2 },
      },
    });
    tx.gearPoolStock.updateMany.mockResolvedValue({ count: 1 });
    tx.gearPledgeReceipt.create.mockResolvedValue({ id: "ccorrection000000000000001" });

    const result = await correctGearPledgeReceipt({
      leagueId: LEAGUE_ID,
      pledgeId: PLEDGE_ID,
      receiptId: "creceipt00000000000000001",
      expectedVersion: 3,
      reason: "Duplicate entry",
    });

    expect(result).toMatchObject({ success: true, data: { pledgeStatus: "PLEDGED", pledgeVersion: 4 } });
    expect(tx.gearPledgeReceipt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        correctionOfReceiptId: "creceipt00000000000000001",
        correctionReason: "Duplicate entry",
      }),
    }));
    expect(tx.gearInventoryMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "ADJUSTMENT", direction: "DECREASE" }),
    }));
  });

  it("redacts terminal pledge PII and omits redacted values from admin projections", async () => {
    tx.gearPledge.findFirst.mockResolvedValue({
      id: PLEDGE_ID,
      leagueId: LEAGUE_ID,
      wishlistItemId: WISHLIST_ITEM_ID,
      status: "RECEIVED",
      version: 3,
      piiRedactionStatus: "PENDING",
    });
    tx.gearPledge.updateMany.mockResolvedValue({ count: 1 });

    await expect(redactGearPledgePii({
      leagueId: LEAGUE_ID, pledgeId: PLEDGE_ID, expectedVersion: 3,
    })).resolves.toEqual({ success: true, data: { id: PLEDGE_ID, version: 4 } });
    expect(tx.gearPledge.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ donorName: null, donorEmail: null, donorPhone: null, note: null }),
    }));

    mockPrisma.gearPledge.findMany.mockResolvedValue([{
      id: PLEDGE_ID, version: 4, wishlistItemId: WISHLIST_ITEM_ID,
      donorName: "Donor", donorEmail: "donor@example.com", donorPhone: "555-0100",
      contactConsentAt: new Date(), status: "RECEIVED", quantity: 1, note: "private",
      expiresAt: null, receivedAt: new Date(), piiRedactionStatus: "REDACTED", piiRedactedAt: new Date(),
      createdAt: new Date(), wishlistItem: { nameSnapshot: "Helmet", categorySnapshot: null, sizeSnapshot: null },
      receipts: [],
    }]);
    await expect(getGearPledgeAdminContext(LEAGUE_ID)).resolves.toEqual([
      expect.objectContaining({ donorName: null, donorEmail: null, donorPhone: null, note: null }),
    ]);
  });

  it("creates a tagged unit, receipt, movement, and activity for every unique asset tag", async () => {
    tx.gearPledge.findFirst.mockResolvedValue({
      id: PLEDGE_ID, version: 0, quantity: 2, wishlistItem: { id: WISHLIST_ITEM_ID, catalogItemId: CATALOG_ID },
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
      expectedVersion: 0, idempotencyKey: "r".repeat(16),
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
      expectedVersion: 0, idempotencyKey: "s".repeat(16),
    });
    expect(duplicate).toEqual({ success: false, error: "Each received asset tag must be unique." });
  });
});
