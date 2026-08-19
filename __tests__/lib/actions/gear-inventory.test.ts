import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { mockRequireGearPermission, mockPrisma, tx } = vi.hoisted(() => {
  const tx = {
    gearCatalogItem: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), count: vi.fn() },
    gearStorageLocation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    gearPoolStock: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn(), upsert: vi.fn(), count: vi.fn() },
    gearAllocation: { aggregate: vi.fn(), count: vi.fn() },
    gearUnit: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    gearInventoryMovement: { create: vi.fn(), count: vi.fn() },
    gearActivity: { create: vi.fn() },
  };
  return {
    tx,
    mockRequireGearPermission: vi.fn(),
    mockPrisma: { $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)) },
  };
});

// Gear actions authorize through the permission matrix (which honours
// association role grants), not the legacy league role, so the guard mocked
// here is requirePermissionForLeague. Behaviour asserted below is unchanged:
// authorized resolves to the acting user, unauthorized throws.
vi.mock("@/lib/utils/permissions", () => ({
  requirePermissionForLeague: (...args: unknown[]) => mockRequireGearPermission(...args),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

import {
  adjustGearPoolStock,
  archiveGearCatalogItem,
  createGearCatalogItem,
  createGearUnit,
  unretireGearUnit,
  updateGearUnit,
} from "@/lib/actions/gear-inventory";
import { revalidatePath } from "next/cache";

const LEAGUE_ID = "cllllllllllllllllllllllll";
const CATALOG_ID = "caaaaaaaaaaaaaaaaaaaaaaaa";
const LOCATION_ID = "cbbbbbbbbbbbbbbbbbbbbbbbb";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireGearPermission.mockResolvedValue("cuserrrrrrrrrrrrrrrrrrrrr");
  tx.gearCatalogItem.create.mockResolvedValue({ id: CATALOG_ID });
  tx.gearCatalogItem.findFirst.mockResolvedValue({ id: CATALOG_ID, trackingMode: "INDIVIDUAL" });
  tx.gearStorageLocation.findFirst.mockResolvedValue({ id: LOCATION_ID });
  tx.gearUnit.create.mockResolvedValue({ id: "cunittttttttttttttttttttt" });
  tx.gearActivity.create.mockResolvedValue({});
  tx.gearInventoryMovement.create.mockResolvedValue({});
  tx.gearPoolStock.count.mockResolvedValue(0);
  tx.gearUnit.count.mockResolvedValue(0);
  tx.gearInventoryMovement.count.mockResolvedValue(0);
  tx.gearAllocation.count.mockResolvedValue(0);
});

describe("gear inventory actions", () => {
  it("requires a league admin before creating catalog items", async () => {
    mockRequireGearPermission.mockRejectedValue(new Error("Unauthorized"));

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
        direction: "DECREASE",
        beforeLocationId: LOCATION_ID,
        afterLocationId: null,
        beforeCondition: "GOOD",
        afterCondition: null,
      }),
    }));
  });

  it("refuses to archive catalog items with pooled stock or immutable history", async () => {
    tx.gearCatalogItem.findFirst.mockResolvedValue({ id: CATALOG_ID });
    tx.gearPoolStock.count.mockResolvedValue(1);

    const result = await archiveGearCatalogItem({ leagueId: LEAGUE_ID, catalogItemId: CATALOG_ID });

    expect(result).toEqual({
      success: false,
      error: "Catalog items with stock, active units, commitments, or inventory history cannot be archived.",
    });
    expect(tx.gearCatalogItem.update).not.toHaveBeenCalled();
  });

  it("rejects stale tagged-unit edits using the expected version", async () => {
    tx.gearUnit.findFirst.mockResolvedValue({ id: "cunittttttttttttttttttttt", status: "AVAILABLE", version: 3 });
    tx.gearUnit.updateMany.mockResolvedValue({ count: 0 });

    const result = await updateGearUnit({
      leagueId: LEAGUE_ID,
      unitId: "cunittttttttttttttttttttt",
      expectedVersion: 3,
      assetTag: "TAG42",
    });

    expect(result).toEqual({
      success: false,
      error: "Inventory changed while saving. Please review the latest inventory and try again.",
    });
    expect(tx.gearUnit.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ leagueId: LEAGUE_ID, version: 3 }),
    }));
  });

  it("returns retired tagged units through a new receipt and activity record", async () => {
    tx.gearUnit.findFirst.mockResolvedValue({ id: "cunittttttttttttttttttttt", status: "RETIRED", version: 4 });
    tx.gearUnit.updateMany.mockResolvedValue({ count: 1 });

    const result = await unretireGearUnit({
      leagueId: LEAGUE_ID,
      unitId: "cunittttttttttttttttttttt",
      expectedVersion: 4,
      destinationLocationId: LOCATION_ID,
      condition: "GOOD",
      notes: "Inspection cleared the unit.",
    });

    expect(result.success).toBe(true);
    expect(tx.gearUnit.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ version: 4 }),
      data: expect.objectContaining({ status: "AVAILABLE", currentLocationId: LOCATION_ID }),
    }));
    expect(tx.gearInventoryMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "RECEIPT", direction: "INCREASE", gearUnitId: "cunittttttttttttttttttttt" }),
    }));
    expect(tx.gearActivity.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "unretired" }),
    }));
  });
});
