import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { mockRequireLeagueRole, mockPrisma, tx } = vi.hoisted(() => {
  const tx = {
    gearCatalogItem: { create: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
    gearStorageLocation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    gearPoolStock: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
    gearAllocation: { aggregate: vi.fn(), count: vi.fn() },
    gearUnit: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), count: vi.fn() },
    gearInventoryMovement: { create: vi.fn(), count: vi.fn() },
    gearActivity: { create: vi.fn() },
  };
  return {
    tx,
    mockRequireLeagueRole: vi.fn(),
    mockPrisma: { $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)) },
  };
});

vi.mock("@/lib/auth/session", () => ({
  requireLeagueRole: (...args: unknown[]) => mockRequireLeagueRole(...args),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

import {
  adjustGearPoolStock,
  createGearCatalogItem,
  createGearUnit,
} from "@/lib/actions/gear-inventory";
import { revalidatePath } from "next/cache";

const LEAGUE_ID = "cllllllllllllllllllllllll";
const CATALOG_ID = "caaaaaaaaaaaaaaaaaaaaaaaa";
const LOCATION_ID = "cbbbbbbbbbbbbbbbbbbbbbbbb";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireLeagueRole.mockResolvedValue("cuserrrrrrrrrrrrrrrrrrrrr");
  tx.gearCatalogItem.create.mockResolvedValue({ id: CATALOG_ID });
  tx.gearCatalogItem.findFirst.mockResolvedValue({ id: CATALOG_ID, trackingMode: "INDIVIDUAL" });
  tx.gearStorageLocation.findFirst.mockResolvedValue({ id: LOCATION_ID });
  tx.gearUnit.create.mockResolvedValue({ id: "cunittttttttttttttttttttt" });
  tx.gearActivity.create.mockResolvedValue({});
  tx.gearInventoryMovement.create.mockResolvedValue({});
});

describe("gear inventory actions", () => {
  it("requires a league admin before creating catalog items", async () => {
    mockRequireLeagueRole.mockRejectedValue(new Error("Unauthorized"));

    const result = await createGearCatalogItem({
      leagueId: LEAGUE_ID,
      name: "Youth Helmet",
      category: "Safety",
      trackingMode: "POOLED",
    });

    expect(result).toEqual({ success: false, error: "League admin access is required." });
    expect(tx.gearCatalogItem.create).not.toHaveBeenCalled();
  });

  it("creates a catalog activity record in the same transaction", async () => {
    const result = await createGearCatalogItem({
      leagueId: LEAGUE_ID,
      name: "Youth Helmet",
      category: "Safety",
      trackingMode: "POOLED",
    });

    expect(result.success).toBe(true);
    expect(tx.gearCatalogItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ leagueId: LEAGUE_ID, normalizedKey: "youth helmet safety" }),
    }));
    expect(tx.gearActivity.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entityType: "CATALOG_ITEM", entityId: CATALOG_ID, action: "created" }),
    }));
    expect(revalidatePath).toHaveBeenCalledWith(`/league/${LEAGUE_ID}/gear`);
  });

  it("normalizes an individually tagged unit and records receipt movement and activity", async () => {
    const result = await createGearUnit({
      leagueId: LEAGUE_ID,
      catalogItemId: CATALOG_ID,
      currentLocationId: LOCATION_ID,
      assetTag: " tag 42 ",
      currentCondition: "GOOD",
    });

    expect(result.success).toBe(true);
    expect(tx.gearUnit.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ assetTag: "TAG42", currentLocationId: LOCATION_ID }),
    }));
    expect(tx.gearInventoryMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "RECEIPT", gearUnitId: "cunittttttttttttttttttttt" }),
    }));
    expect(tx.gearActivity.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entityType: "UNIT", action: "created" }),
    }));
  });

  it("rejects a negative pooled-stock adjustment before it creates a movement", async () => {
    tx.gearCatalogItem.findFirst.mockResolvedValue({ id: CATALOG_ID, trackingMode: "POOLED" });
    tx.gearPoolStock.findUnique.mockResolvedValue({ id: "cstockkkkkkkkkkkkkkkkkkkkk", quantityOnHand: 2, version: 3 });

    const result = await adjustGearPoolStock({
      leagueId: LEAGUE_ID,
      catalogItemId: CATALOG_ID,
      locationId: LOCATION_ID,
      condition: "GOOD",
      quantityDelta: -3,
      expectedVersion: 3,
    });

    expect(result).toEqual({ success: false, error: "Inventory cannot fall below zero." });
    expect(tx.gearInventoryMovement.create).not.toHaveBeenCalled();
  });

  it("records a valid reduction as a positive outbound movement", async () => {
    tx.gearCatalogItem.findFirst.mockResolvedValue({ id: CATALOG_ID, trackingMode: "POOLED" });
    tx.gearPoolStock.findUnique.mockResolvedValue({ id: "cstockkkkkkkkkkkkkkkkkkkkk", quantityOnHand: 5, version: 3 });
    tx.gearAllocation.aggregate.mockResolvedValue({ _sum: { allocatedQty: 0, releasedQty: 0 } });
    tx.gearPoolStock.updateMany.mockResolvedValue({ count: 1 });

    const result = await adjustGearPoolStock({
      leagueId: LEAGUE_ID,
      catalogItemId: CATALOG_ID,
      locationId: LOCATION_ID,
      condition: "GOOD",
      quantityDelta: -2,
      expectedVersion: 3,
    });

    expect(result.success).toBe(true);
    expect(tx.gearInventoryMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        quantity: 2,
        beforeLocationId: LOCATION_ID,
        afterLocationId: null,
      }),
    }));
  });
});
