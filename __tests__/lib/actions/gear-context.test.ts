import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireUserId, mockPrisma } = vi.hoisted(() => ({
  mockRequireUserId: vi.fn(),
  mockPrisma: {
    leagueUser: { findFirst: vi.fn() },
    gearStorageLocation: { findMany: vi.fn() },
    gearCatalogItem: { findMany: vi.fn() },
    gearPoolStock: { findMany: vi.fn() },
    gearUnit: { findMany: vi.fn() },
    gearReservation: { findMany: vi.fn() },
    gearInventoryMovement: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth/session", () => ({ requireUserId: () => mockRequireUserId() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

import { getGearInventoryContext } from "@/lib/actions/gear-context";

const LEAGUE_ID = "cllllllllllllllllllllllll";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUserId.mockResolvedValue("cuserrrrrrrrrrrrrrrrrrrrr");
  mockPrisma.gearStorageLocation.findMany.mockResolvedValue([]);
  mockPrisma.gearCatalogItem.findMany.mockResolvedValue([]);
  mockPrisma.gearPoolStock.findMany.mockResolvedValue([]);
  mockPrisma.gearUnit.findMany.mockResolvedValue([]);
  mockPrisma.gearReservation.findMany.mockResolvedValue([]);
  mockPrisma.gearInventoryMovement.findMany.mockResolvedValue([]);
});

describe("gear inventory context", () => {
  it("returns null outside the requested league", async () => {
    mockPrisma.leagueUser.findFirst.mockResolvedValue(null);
    await expect(getGearInventoryContext(LEAGUE_ID)).resolves.toBeNull();
    expect(mockPrisma.gearPoolStock.findMany).not.toHaveBeenCalled();
  });

  it("redacts private storage notes and admin activity for league members", async () => {
    mockPrisma.leagueUser.findFirst.mockResolvedValue({
      role: "MEMBER",
      league: { id: LEAGUE_ID, name: "Metro" },
    });
    mockPrisma.gearStorageLocation.findMany.mockResolvedValue([
      { id: "clocationxxxxxxxxxxxxxxxx", name: "Locker", address: null, privateNotes: null, isActive: true },
    ]);

    const result = await getGearInventoryContext(LEAGUE_ID);

    expect(result?.canManageInventory).toBe(false);
    expect(result?.locations[0]).not.toHaveProperty("privateNotes");
    expect(result?.locations[0]).not.toHaveProperty("address");
    expect(mockPrisma.gearStorageLocation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { leagueId: LEAGUE_ID },
      select: expect.objectContaining({ address: false, privateNotes: false }),
    }));
    expect(mockPrisma.gearInventoryMovement.findMany).not.toHaveBeenCalled();
  });

  it("does not serialize sensitive unit lifecycle fields to a member Flight payload", async () => {
    mockPrisma.leagueUser.findFirst.mockResolvedValue({
      role: "MEMBER",
      league: { id: LEAGUE_ID, name: "Metro" },
    });
    mockPrisma.gearUnit.findMany.mockResolvedValue([{
      id: "cunittttttttttttttttttttt",
      catalogItemId: "caaaaaaaaaaaaaaaaaaaaaaaa",
      assetTag: "TAG42",
      serialNumber: "SERIAL-PRIVATE",
      status: "AVAILABLE",
      currentCondition: "GOOD",
      currentLocationId: "clocationxxxxxxxxxxxxxxxx",
      acquiredAt: new Date("2026-01-01T00:00:00.000Z"),
      retiredAt: new Date("2026-02-01T00:00:00.000Z"),
      version: 7,
      notes: "Private service record",
      catalogItem: { name: "Helmet" },
      currentLocation: { name: "Locker" },
    }]);

    const result = await getGearInventoryContext(LEAGUE_ID);
    const serialized = JSON.stringify(result);

    expect(result?.units[0]).not.toHaveProperty("serialNumber");
    expect(result?.units[0]).not.toHaveProperty("acquiredAt");
    expect(result?.units[0]).not.toHaveProperty("retiredAt");
    expect(result?.units[0]).not.toHaveProperty("notes");
    expect(result?.units[0]).not.toHaveProperty("version");
    expect(serialized).not.toContain("SERIAL-PRIVATE");
    expect(serialized).not.toContain("Private service record");
  });

  it("returns paginated, searchable movement identity only to administrators", async () => {
    mockPrisma.leagueUser.findFirst.mockResolvedValue({
      role: "LEAGUE_ADMIN",
      league: { id: LEAGUE_ID, name: "Metro" },
    });
    mockPrisma.gearInventoryMovement.findMany.mockResolvedValue([{
      id: "cmovementxxxxxxxxxxxxxxxx",
      type: "ADJUSTMENT",
      direction: "DECREASE",
      quantity: 1,
      poolStockId: null,
      gearUnitId: "cunittttttttttttttttttttt",
      beforeCondition: "GOOD",
      afterCondition: null,
      occurredAt: new Date("2026-03-01T12:34:56.789Z"),
      notes: "Inspection failed",
      beforeLocation: { name: "Locker" },
      afterLocation: null,
      poolStock: null,
      gearUnit: { assetTag: "TAG42", catalogItem: { name: "Helmet" } },
      recordedBy: { name: "Alex Admin" },
    }]);

    const result = await getGearInventoryContext(LEAGUE_ID, {
      activityPage: 2,
      activitySearch: "helmet",
    });

    expect(mockPrisma.gearInventoryMovement.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 20,
      take: 21,
      where: expect.objectContaining({ leagueId: LEAGUE_ID }),
    }));
    expect(result?.recentActivity).toMatchObject({
      page: 2,
      search: "helmet",
      items: [{
        catalogName: "Helmet",
        assetTag: "TAG42",
        direction: "DECREASE",
        beforeCondition: "GOOD",
        actorName: "Alex Admin",
        occurredAt: "2026-03-01T12:34:56.789Z",
      }],
    });
  });
});
