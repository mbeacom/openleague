import { describe, expect, it } from "vitest";
import {
  allocationIsConsistent,
  allocationRemainingForReturn,
  allocationStatusQuantitiesValid,
  availablePoolQuantity,
  canAllocatePoolStock,
  canTransitionAllocation,
  canTransitionReservation,
  canTransitionUnit,
  datesOverlap,
  hasExactlyOneNotificationRecipient,
  isRetryablePrismaConflict,
  isActiveTaggedAllocationStatus,
  normalizeGearAssetTag,
  normalizeGearKey,
  taggedAllocationWindowsConflict,
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

  it("requires an immutable outbox row to retain exactly one recipient target", () => {
    expect(hasExactlyOneNotificationRecipient({ userId: "user" })).toBe(true);
    expect(hasExactlyOneNotificationRecipient({ email: "user@example.com" })).toBe(true);
    expect(hasExactlyOneNotificationRecipient({ userId: "user", email: "user@example.com" })).toBe(false);
    expect(hasExactlyOneNotificationRecipient({})).toBe(false);
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
