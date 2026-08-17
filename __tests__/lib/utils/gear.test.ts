import { describe, expect, it } from "vitest";
import {
  allocationIsConsistent,
  allocationRemainingForReturn,
  allocationStatusQuantitiesValid,
  activeAllocationQuantity,
  activeAllocationTotal,
  allocationConsumesCapacityForWindow,
  availablePoolQuantity,
  canAllocatePoolStock,
  canTransitionAllocation,
  canTransitionReservation,
  canTransitionUnit,
  datesOverlap,
  hasExactlyOneNotificationRecipient,
  isValidInventoryMovementDirection,
  isRetryablePrismaConflict,
  isActiveTaggedAllocationStatus,
  isOutstandingAllocationOverdue,
  normalizeGearAssetTag,
  normalizeGearKey,
  taggedAllocationWindowsConflict,
  poolAvailabilityConflict,
  taggedUnitAvailabilityConflict,
} from "@/lib/utils/gear";

describe("gear utilities", () => {
  it("normalizes tenant-scoped catalog keys and asset tags predictably", () => {
    expect(normalizeGearKey("  Youth   Helmet ")).toBe("youth helmet");
    expect(normalizeGearAssetTag(" tag  42 ")).toBe("TAG42");
  });

  it("treats inclusive date-only reservation windows as overlapping", () => {
    expect(
      datesOverlap(
        { startDate: "2026-09-01", endDate: "2026-09-03" },
        { startDate: "2026-09-03", endDate: "2026-09-05" },
      ),
    ).toBe(true);
    expect(
      datesOverlap(
        { startDate: "2026-09-01", endDate: "2026-09-02" },
        { startDate: "2026-09-03", endDate: "2026-09-05" },
      ),
    ).toBe(false);
  });

  it("calculates available pool inventory without allowing over-allocation", () => {
    const stock = { quantityOnHand: 8, allocatedQuantity: 3 };
    expect(availablePoolQuantity(stock)).toBe(5);
    expect(canAllocatePoolStock(stock, 5)).toBe(true);
    expect(canAllocatePoolStock(stock, 6)).toBe(false);
    expect(canAllocatePoolStock(stock, 0)).toBe(false);
  });

  it("releases capacity as quantities are returned or released", () => {
    expect(activeAllocationQuantity({ allocatedQty: 6, pickedUpQty: 6, returnedQty: 2, releasedQty: 0 })).toBe(4);
    expect(activeAllocationQuantity({ allocatedQty: 6, pickedUpQty: 0, returnedQty: 0, releasedQty: 6 })).toBe(0);
    expect(activeAllocationTotal([
      { allocatedQty: 4, pickedUpQty: 4, returnedQty: 1, releasedQty: 0 },
      { allocatedQty: 2, pickedUpQty: 0, returnedQty: 0, releasedQty: 1 },
    ])).toBe(4);
  });

  it("keeps outstanding custody committed past its planned end date", () => {
    const window = { startDate: "2026-09-10", endDate: "2026-09-12" };
    expect(allocationConsumesCapacityForWindow({
      status: "PICKED_UP",
      allocatedQty: 2,
      pickedUpQty: 2,
      returnedQty: 0,
      releasedQty: 0,
      effectiveStartDate: new Date("2026-09-01"),
      effectiveEndDate: new Date("2026-09-03"),
    }, window)).toBe(true);
    expect(allocationConsumesCapacityForWindow({
      status: "ALLOCATED",
      allocatedQty: 2,
      pickedUpQty: 0,
      returnedQty: 0,
      releasedQty: 0,
      effectiveStartDate: new Date("2026-09-01"),
      effectiveEndDate: new Date("2026-09-03"),
    }, window)).toBe(false);
  });

  it("marks only outstanding custody overdue after the effective end date", () => {
    const finalDay = new Date("2026-09-03T00:00:00.000Z");
    const allocation = { status: "PICKED_UP" as const, effectiveEndDate: finalDay };
    expect(isOutstandingAllocationOverdue(allocation, finalDay)).toBe(false);
    expect(isOutstandingAllocationOverdue(allocation, new Date("2026-09-04T00:00:00.000Z"))).toBe(true);
    expect(isOutstandingAllocationOverdue({
      status: "ALLOCATED",
      effectiveEndDate: finalDay,
    }, new Date("2026-09-04T00:00:00.000Z"))).toBe(false);
  });

  it("returns user-safe pool, tagged, and overdue availability conflicts", () => {
    expect(poolAvailabilityConflict({ quantityOnHand: 2, allocatedQuantity: 2 }, 1)?.code).toBe("INSUFFICIENT_POOL_STOCK");
    expect(taggedUnitAvailabilityConflict("MAINTENANCE", false)?.code).toBe("TAGGED_UNIT_UNAVAILABLE");
    expect(taggedUnitAvailabilityConflict("CHECKED_OUT", true)?.code).toBe("OVERDUE_CUSTODY");
    expect(taggedUnitAvailabilityConflict("AVAILABLE", false)).toBeNull();
  });

  it("guards allocation quantity accounting", () => {
    expect(
      allocationIsConsistent({ allocatedQty: 4, pickedUpQty: 3, returnedQty: 1, releasedQty: 1 }),
    ).toBe(true);
    expect(allocationRemainingForReturn({ allocatedQty: 4, pickedUpQty: 3, returnedQty: 1, releasedQty: 1 })).toBe(2);
    expect(
      allocationIsConsistent({ allocatedQty: 4, pickedUpQty: 3, returnedQty: 4, releasedQty: 0 }),
    ).toBe(false);
  });

  it("enforces status-aware terminal allocation reconciliation", () => {
    expect(
      allocationStatusQuantitiesValid("PARTIALLY_RETURNED", {
        allocatedQty: 4,
        pickedUpQty: 4,
        returnedQty: 1,
        releasedQty: 0,
      }),
    ).toBe(true);
    expect(
      allocationStatusQuantitiesValid("RETURNED", {
        allocatedQty: 4,
        pickedUpQty: 3,
        returnedQty: 3,
        releasedQty: 1,
      }),
    ).toBe(true);
    expect(
      allocationStatusQuantitiesValid("RETURNED", {
        allocatedQty: 4,
        pickedUpQty: 3,
        returnedQty: 2,
        releasedQty: 1,
      }),
    ).toBe(false);
    expect(
      allocationStatusQuantitiesValid("RELEASED", {
        allocatedQty: 4,
        pickedUpQty: 1,
        returnedQty: 1,
        releasedQty: 3,
      }),
    ).toBe(false);
  });

  it("blocks overlapping active or pending tagged allocations but permits separate windows", () => {
    const pending = { status: "PENDING" as const, startDate: "2026-09-01", endDate: "2026-09-03" };
    expect(isActiveTaggedAllocationStatus(pending.status)).toBe(true);
    expect(
      taggedAllocationWindowsConflict(pending, {
        status: "ALLOCATED",
        startDate: "2026-09-03",
        endDate: "2026-09-05",
      }),
    ).toBe(true);
    expect(
      taggedAllocationWindowsConflict(pending, {
        status: "RETURNED",
        startDate: "2026-09-01",
        endDate: "2026-09-03",
      }),
    ).toBe(false);
    expect(
      taggedAllocationWindowsConflict(pending, {
        status: "ALLOCATED",
        startDate: "2026-09-04",
        endDate: "2026-09-05",
      }),
    ).toBe(false);
  });

  it("requires an immutable outbox row to retain a delivery-email snapshot", () => {
    expect(hasExactlyOneNotificationRecipient({ email: "user@example.com" })).toBe(true);
    expect(hasExactlyOneNotificationRecipient({ userId: "user", email: "user@example.com" })).toBe(true);
    expect(hasExactlyOneNotificationRecipient({ email: "   " })).toBe(false);
  });

  it("requires an explicit signed direction for every inventory movement", () => {
    expect(isValidInventoryMovementDirection("ADJUSTMENT", "INCREASE")).toBe(true);
    expect(isValidInventoryMovementDirection("ADJUSTMENT", "DECREASE")).toBe(true);
    expect(isValidInventoryMovementDirection("ADJUSTMENT", "NEUTRAL")).toBe(false);
    expect(isValidInventoryMovementDirection("TRANSFER", "NEUTRAL")).toBe(true);
    expect(isValidInventoryMovementDirection("ALLOCATION", "INCREASE")).toBe(false);
  });

  it("permits only legal workflow transitions", () => {
    expect(canTransitionReservation("REQUESTED", "APPROVED")).toBe(true);
    expect(canTransitionReservation("CLOSED", "APPROVED")).toBe(false);
    expect(canTransitionAllocation("ALLOCATED", "PICKED_UP")).toBe(true);
    expect(canTransitionAllocation("RELEASED", "PICKED_UP")).toBe(false);
    expect(canTransitionUnit("AVAILABLE", "RESERVED")).toBe(true);
    expect(canTransitionUnit("RETIRED", "AVAILABLE")).toBe(false);
  });

  it("recognizes Prisma serialization conflicts as retryable", () => {
    expect(isRetryablePrismaConflict({ code: "P2034" })).toBe(true);
    expect(isRetryablePrismaConflict({ code: "P2002" })).toBe(false);
  });
});
