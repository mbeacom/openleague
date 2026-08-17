import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuth, mockTx, mockPrisma, recordGearActivity, recordGearInventoryMovement } = vi.hoisted(() => {
  const transaction = {
    gearReservation: { findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    gearAllocation: { findFirst: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    gearReservationLine: { updateMany: vi.fn() },
    gearUnit: { findFirst: vi.fn(), updateMany: vi.fn() },
    teamMember: { findMany: vi.fn() },
    gearCatalogItem: { findMany: vi.fn() },
    teamGearNeedLine: { findMany: vi.fn() },
    gearHandoff: { create: vi.fn() },
  };
  return {
    mockAuth: {
      requireUserId: vi.fn(),
      requireLeagueRole: vi.fn(),
      getUserLeagueRole: vi.fn(),
      isTeamAdmin: vi.fn(),
    },
    mockTx: transaction,
    mockPrisma: { $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)) },
    recordGearActivity: vi.fn(),
    recordGearInventoryMovement: vi.fn(),
  };
});

describe("createGearReservation", () => {
  it("derives an item-backed line snapshot from trusted catalog data", async () => {
    const catalogItemId = "ccatalogiiiiiiiiiiiiiiiii";
    mockTx.gearCatalogItem.findMany.mockResolvedValue([{ id: catalogItemId, name: "Trusted helmet" }]);

    const result = await createGearReservation({
      leagueId: LEAGUE_ID,
      teamId: "cteeeeeeeeeeeeeeeeeeeeeee",
      requestedStartDate: "2026-09-01",
      requestedEndDate: "2026-09-03",
      custodianNameSnapshot: "Team custodian",
      lines: [{
        catalogItemId,
        nameSnapshot: "Client-controlled name",
        requestedQty: 1,
      }],
    });

    expect(result).toEqual({ success: true, data: { id: RESERVATION_ID } });
    expect(mockTx.gearReservation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        lines: {
          create: [expect.objectContaining({ nameSnapshot: "Trusted helmet" })],
        },
      }),
    }));
  });
});

describe("recordGearReturn", () => {
  function checkedOutTaggedAllocation() {
    return {
      id: ALLOCATION_ID,
      leagueId: LEAGUE_ID,
      status: "PICKED_UP",
      allocatedQty: 1,
      pickedUpQty: 1,
      returnedQty: 0,
      releasedQty: 0,
      version: 2,
      poolStockId: null,
      gearUnitId: "cguuuuuuuuuuuuuuuuuuuuuuuu",
      poolStock: null,
      gearUnit: {
        id: "cguuuuuuuuuuuuuuuuuuuuuuuu",
        version: 3,
        status: "CHECKED_OUT",
        currentCondition: "GOOD",
        currentLocationId: "clocationxxxxxxxxxxxxxxxx",
      },
      reservationLine: {
        reservationId: RESERVATION_ID,
        reservation: { custodianNameSnapshot: "Team custodian" },
      },
    };
  }

  it("returns a tagged unit to RESERVED when a later active allocation remains", async () => {
    mockTx.gearAllocation.findFirst.mockResolvedValue(checkedOutTaggedAllocation());
    mockTx.gearAllocation.count.mockResolvedValue(1);

    const result = await recordGearReturn({
      leagueId: LEAGUE_ID,
      allocationId: ALLOCATION_ID,
      expectedVersion: 2,
      quantity: 1,
      returnDisposition: "GOOD",
      condition: "GOOD",
    });

    expect(result).toEqual({ success: true, data: { id: ALLOCATION_ID } });
    expect(mockTx.gearUnit.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "RESERVED", currentCondition: "GOOD" }),
    }));
  });

  it("rejects a damaged condition paired with the good return disposition", async () => {
    mockTx.gearAllocation.findFirst.mockResolvedValue(checkedOutTaggedAllocation());

    await expect(recordGearReturn({
      leagueId: LEAGUE_ID,
      allocationId: ALLOCATION_ID,
      expectedVersion: 2,
      quantity: 1,
      returnDisposition: "GOOD",
      condition: "DAMAGED",
    })).resolves.toMatchObject({ success: false, error: expect.stringContaining("damaged disposition") });

    expect(mockTx.gearUnit.updateMany).not.toHaveBeenCalled();
  });
});

vi.mock("@/lib/auth/session", () => mockAuth);
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/gear-ledger", () => ({ recordGearActivity, recordGearInventoryMovement }));
vi.mock("@/lib/services/gear-outbox", () => ({
  queueGearOutboxForLeagueAdmins: vi.fn(),
  queueGearOutboxForRecipients: vi.fn(),
}));
vi.mock("@/lib/services/gear-transaction", () => ({
  GearConflictError: class GearConflictError extends Error {},
  gearTransactionOptions: {},
  withGearSerializableRetry: <T>(run: () => Promise<T>) => run(),
}));

import {
  cancelGearReservation,
  createGearReservation,
  recordGearPickup,
  recordGearReturn,
  releaseGearAllocation,
} from "@/lib/actions/gear-reservations";

const LEAGUE_ID = "cllllllllllllllllllllllll";
const RESERVATION_ID = "crrrrrrrrrrrrrrrrrrrrrrrr";
const ALLOCATION_ID = "caaaaaaaaaaaaaaaaaaaaaaaa";

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.requireUserId.mockResolvedValue("cuserrrrrrrrrrrrrrrrrrrrr");
  mockAuth.requireLeagueRole.mockResolvedValue("cuserrrrrrrrrrrrrrrrrrrrr");
  mockAuth.getUserLeagueRole.mockResolvedValue("LEAGUE_ADMIN");
  mockTx.gearAllocation.updateMany.mockResolvedValue({ count: 1 });
  mockTx.gearReservationLine.updateMany.mockResolvedValue({ count: 1 });
  mockTx.gearReservation.updateMany.mockResolvedValue({ count: 1 });
  mockTx.gearReservation.create.mockResolvedValue({ id: RESERVATION_ID });
  mockTx.gearCatalogItem.findMany.mockResolvedValue([]);
  mockTx.teamGearNeedLine.findMany.mockResolvedValue([]);
  mockTx.gearHandoff.create.mockResolvedValue({ id: "chhhhhhhhhhhhhhhhhhhhhhhh" });
  mockTx.teamMember.findMany.mockResolvedValue([]);
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
      type: "RELEASE",
      direction: "INCREASE",
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

describe("releaseGearAllocation", () => {
  function uncollectedAllocation() {
    return {
      id: ALLOCATION_ID,
      leagueId: LEAGUE_ID,
      status: "ALLOCATED",
      allocatedQty: 2,
      pickedUpQty: 0,
      returnedQty: 0,
      releasedQty: 0,
      version: 1,
      poolStockId: null,
      gearUnitId: "cguuuuuuuuuuuuuuuuuuuuuuuu",
      effectiveStartDate: new Date("2026-09-01"),
      effectiveEndDate: new Date("2026-09-03"),
      reservationLine: {
        reservationId: RESERVATION_ID,
        reservation: { custodianNameSnapshot: "Team custodian" },
      },
    };
  }

  function reconciledReservation(status: string) {
    return {
      id: RESERVATION_ID,
      status,
      version: 4,
      lines: [{
        id: "cliiiiiiiiiiiiiiiiiiiiiiii",
        allocations: [{
          status: "RELEASED",
          allocatedQty: 2,
          pickedUpQty: 0,
          returnedQty: 0,
          releasedQty: 2,
        }],
      }],
    };
  }

  it("reconciles line totals and closes the fulfilled parent reservation", async () => {
    mockTx.gearAllocation.findFirst.mockResolvedValue(uncollectedAllocation());
    mockTx.gearReservation.findFirst.mockResolvedValue(reconciledReservation("FULFILLED"));

    const result = await releaseGearAllocation({
      leagueId: LEAGUE_ID,
      allocationId: ALLOCATION_ID,
      expectedVersion: 1,
    });

    expect(result).toEqual({ success: true, data: { id: ALLOCATION_ID } });
    expect(mockTx.gearAllocation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ leagueId: LEAGUE_ID, id: ALLOCATION_ID, version: 1 }),
      data: expect.objectContaining({ status: "RELEASED", releasedQty: 2 }),
    }));
    expect(recordGearInventoryMovement).toHaveBeenCalledWith(mockTx, expect.objectContaining({
      type: "RELEASE",
      direction: "INCREASE",
      quantity: 2,
    }));
    expect(mockTx.gearReservationLine.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "cliiiiiiiiiiiiiiiiiiiiiiii", leagueId: LEAGUE_ID, reservationId: RESERVATION_ID }),
      data: { allocatedQty: 0 },
    }));
    expect(mockTx.gearReservation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: RESERVATION_ID, leagueId: LEAGUE_ID, status: "FULFILLED", version: 4 }),
      data: expect.objectContaining({ status: "CLOSED", custodyEndedAt: expect.any(Date) }),
    }));
  });

  it("reconciles line totals without closing a reservation that is not fulfilled", async () => {
    mockTx.gearAllocation.findFirst.mockResolvedValue(uncollectedAllocation());
    mockTx.gearReservation.findFirst.mockResolvedValue(reconciledReservation("APPROVED"));

    await expect(releaseGearAllocation({
      leagueId: LEAGUE_ID,
      allocationId: ALLOCATION_ID,
      expectedVersion: 1,
    })).resolves.toMatchObject({ success: true });

    expect(mockTx.gearReservationLine.updateMany).toHaveBeenCalled();
    expect(mockTx.gearReservation.updateMany).not.toHaveBeenCalled();
  });
});

describe("recordGearPickup", () => {
  function allocationDueOn(effectiveEndDate: Date) {
    return {
      id: ALLOCATION_ID,
      leagueId: LEAGUE_ID,
      status: "ALLOCATED",
      allocatedQty: 1,
      pickedUpQty: 0,
      returnedQty: 0,
      releasedQty: 0,
      version: 1,
      poolStockId: "cstockkkkkkkkkkkkkkkkkkkk",
      gearUnitId: null,
      poolStock: { id: "cstockkkkkkkkkkkkkkkkkkkk" },
      gearUnit: null,
      effectiveStartDate: new Date("2020-01-01"),
      effectiveEndDate,
      reservationLine: {
        reservationId: RESERVATION_ID,
        reservation: { custodianNameSnapshot: "Team custodian", teamId: "cteeeeeeeeeeeeeeeeeeeeeee", requestedById: null },
      },
    };
  }

  it("refuses checkout once the effective end date has passed", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    mockTx.gearAllocation.findFirst.mockResolvedValue(allocationDueOn(yesterday));

    await expect(recordGearPickup({
      leagueId: LEAGUE_ID,
      allocationId: ALLOCATION_ID,
      expectedVersion: 1,
      quantity: 1,
    })).resolves.toMatchObject({ success: false, error: expect.stringContaining("past its due date") });

    expect(mockTx.gearAllocation.updateMany).not.toHaveBeenCalled();
  });

  it("allows checkout on the final day of the window because the guard is date-only", async () => {
    mockTx.gearAllocation.findFirst.mockResolvedValue(allocationDueOn(new Date()));

    await expect(recordGearPickup({
      leagueId: LEAGUE_ID,
      allocationId: ALLOCATION_ID,
      expectedVersion: 1,
      quantity: 1,
    })).resolves.toMatchObject({ success: true });

    expect(mockTx.gearAllocation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "PICKED_UP", pickedUpQty: 1 }),
    }));
  });
});
