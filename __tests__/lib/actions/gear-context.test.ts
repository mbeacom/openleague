import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireUserId, mockPrisma } = vi.hoisted(() => ({
  mockRequireUserId: vi.fn(),
  mockPrisma: {
    leagueUser: { findFirst: vi.fn() },
    gearStorageLocation: { findMany: vi.fn() },
    gearCatalogItem: { findMany: vi.fn() },
    gearPoolStock: { findMany: vi.fn() },
    gearUnit: { findMany: vi.fn() },
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
    expect(mockPrisma.gearStorageLocation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { leagueId: LEAGUE_ID },
      select: expect.objectContaining({ privateNotes: false }),
    }));
    expect(mockPrisma.gearInventoryMovement.findMany).not.toHaveBeenCalled();
  });
});
