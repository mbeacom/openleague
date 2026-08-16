import { describe, expect, it } from "vitest";
import {
  allocationIsConsistent,
  allocationRemainingForReturn,
  availablePoolQuantity,
  canAllocatePoolStock,
  canTransitionAllocation,
  canTransitionReservation,
  canTransitionUnit,
  datesOverlap,
  isRetryablePrismaConflict,
  normalizeGearAssetTag,
  normalizeGearKey,
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
