import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuth, mockTx, mockPrisma, recordGearActivity, recordGearInventoryMovement } = vi.hoisted(() => {
  const transaction = {
    gearReservation: { findFirst: vi.fn(), updateMany: vi.fn() },
    gearAllocation: { updateMany: vi.fn(), count: vi.fn() },
    gearReservationLine: { updateMany: vi.fn() },
    gearUnit: { findFirst: vi.fn(), updateMany: vi.fn() },
  };
  return {
    mockAuth: { requireUserId: vi.fn(), getUserLeagueRole: vi.fn(), isTeamAdmin: vi.fn() },
    mockTx: transaction,
    mockPrisma: { $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)) },
    recordGearActivity: vi.fn(),
    recordGearInventoryMovement: vi.fn(),
  };
});

vi.mock("@/lib/auth/session", () => mockAuth);
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/gear-ledger", () => ({ recordGearActivity, recordGearInventoryMovement }));
vi.mock("@/lib/services/gear-transaction", () => ({
  GearConflictError: class GearConflictError extends Error {},
  gearTransactionOptions: {},
  withGearSerializableRetry: <T>(run: () => Promise<T>) => run(),
}));

import { cancelGearReservation } from "@/lib/actions/gear-reservations";

const LEAGUE_ID = "cllllllllllllllllllllllll";
const RESERVATION_ID = "crrrrrrrrrrrrrrrrrrrrrrrr";
const ALLOCATION_ID = "caaaaaaaaaaaaaaaaaaaaaaaa";

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.requireUserId.mockResolvedValue("cuserrrrrrrrrrrrrrrrrrrrr");
  mockAuth.getUserLeagueRole.mockResolvedValue("LEAGUE_ADMIN");
  mockTx.gearAllocation.updateMany.mockResolvedValue({ count: 1 });
  mockTx.gearReservationLine.updateMany.mockResolvedValue({ count: 1 });
  mockTx.gearReservation.updateMany.mockResolvedValue({ count: 1 });
  mockTx.gearAllocation.count.mockResolvedValue(0);
  mockTx.gearUnit.updateMany.mockResolvedValue({ count: 1 });
  mockTx.gearUnit.findFirst.mockResolvedValue({
    id: "cguuuuuuuuuuuuuuuuuuuuuuuu",
    version: 1,
  });
  mockTx.gearReservation.findFirst.mockResolvedValue({
    id: RESERVATION_ID,
    leagueId: LEAGUE_ID,
    teamId: "cteeeeeeeeeeeeeeeeeeeeeee",
    status: "APPROVED",
    version: 3,
    lines: [{
      id: "cliiiiiiiiiiiiiiiiiiiiiiii",
      allocations: [{
        id: ALLOCATION_ID,
        status: "ALLOCATED",
        poolStockId: null,
        gearUnitId: "cguuuuuuuuuuuuuuuuuuuuuuuu",
        allocatedQty: 2,
        pickedUpQty: 0,
        returnedQty: 0,
        releasedQty: 0,
        effectiveStartDate: new Date("2026-09-01"),
        effectiveEndDate: new Date("2026-09-03"),
        version: 1,
      }],
    }],
  });
});

describe("cancelGearReservation", () => {
  it("releases uncollected allocations, frees tagged projections, and records immutable history", async () => {
    const result = await cancelGearReservation({
      leagueId: LEAGUE_ID,
      reservationId: RESERVATION_ID,
      expectedVersion: 3,
    });

    expect(result).toEqual({ success: true, data: { id: RESERVATION_ID } });
    expect(mockTx.gearAllocation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ leagueId: LEAGUE_ID, id: ALLOCATION_ID }),
      data: expect.objectContaining({ status: "RELEASED", releasedQty: 2 }),
    }));
    expect(mockTx.gearUnit.updateMany).toHaveBeenCalled();
    expect(recordGearInventoryMovement).toHaveBeenCalledWith(mockTx, expect.objectContaining({
      type: "RELEASE", allocationId: ALLOCATION_ID, leagueId: LEAGUE_ID,
    }));
    expect(recordGearActivity).toHaveBeenCalledWith(mockTx, expect.objectContaining({
      entityType: "ALLOCATION", entityId: ALLOCATION_ID,
    }));
  });

  it("refuses cancellation while any equipment remains checked out", async () => {
    mockTx.gearReservation.findFirst.mockResolvedValueOnce({
      ...await mockTx.gearReservation.findFirst(),
      lines: [{
        id: "cliiiiiiiiiiiiiiiiiiiiiiii",
        allocations: [{
          id: ALLOCATION_ID,
          status: "PICKED_UP",
          poolStockId: null,
          gearUnitId: "cguuuuuuuuuuuuuuuuuuuuuuuu",
          allocatedQty: 1,
          pickedUpQty: 1,
          returnedQty: 0,
          releasedQty: 0,
          effectiveStartDate: new Date("2026-09-01"),
          effectiveEndDate: new Date("2026-09-03"),
          version: 1,
        }],
      }],
    });

    await expect(cancelGearReservation({
      leagueId: LEAGUE_ID,
      reservationId: RESERVATION_ID,
      expectedVersion: 3,
    })).resolves.toMatchObject({ success: false, error: expect.stringContaining("returned") });
    expect(mockTx.gearAllocation.updateMany).not.toHaveBeenCalled();
  });
});
