import type {
  GearAllocationQuantities,
  GearAllocationStatus,
  GearInventoryDirection,
  GearPoolAvailability,
  GearReservationStatus,
  GearReservationWindow,
  GearTrackingMode,
  NotificationRecipient,
  TaggedAllocationWindow,
  GearUnitStatus,
} from "@/types/gear";

const reservationTransitions: Record<GearReservationStatus, readonly GearReservationStatus[]> = {
  DRAFT: ["REQUESTED", "CANCELED"],
  REQUESTED: ["APPROVED", "DECLINED", "CANCELED"],
  APPROVED: ["FULFILLED", "CANCELED"],
  DECLINED: [],
  CANCELED: [],
  FULFILLED: ["CLOSED"],
  CLOSED: [],
};

const allocationTransitions: Record<GearAllocationStatus, readonly GearAllocationStatus[]> = {
  PENDING: ["ALLOCATED", "RELEASED"],
  ALLOCATED: ["PICKED_UP", "RELEASED"],
  PICKED_UP: ["PARTIALLY_RETURNED", "RETURNED"],
  PARTIALLY_RETURNED: ["RETURNED"],
  RETURNED: [],
  RELEASED: [],
};

const unitTransitions: Record<GearUnitStatus, readonly GearUnitStatus[]> = {
  AVAILABLE: ["RESERVED", "MAINTENANCE", "RETIRED", "LOST"],
  RESERVED: ["AVAILABLE", "CHECKED_OUT", "MAINTENANCE"],
  CHECKED_OUT: ["AVAILABLE", "MAINTENANCE", "LOST"],
  MAINTENANCE: ["AVAILABLE", "RETIRED"],
  RETIRED: [],
  LOST: [],
};

export function normalizeGearKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeGearAssetTag(value: string): string {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export function datesOverlap(left: GearReservationWindow, right: GearReservationWindow): boolean {
  return left.startDate <= right.endDate && right.startDate <= left.endDate;
}

export function availablePoolQuantity(stock: GearPoolAvailability): number {
  return Math.max(0, stock.quantityOnHand - stock.allocatedQuantity);
}

/**
 * Allocations continue to exist after a partial return, but only the portion
 * still outside stock should reserve capacity.
 */
export function activeAllocationQuantity(allocation: GearAllocationQuantities): number {
  return Math.max(0, allocation.allocatedQty - allocation.releasedQty - allocation.returnedQty);
}

export function activeAllocationTotal(allocations: GearAllocationQuantities[]): number {
  return allocations.reduce((total, allocation) => total + activeAllocationQuantity(allocation), 0);
}

type CapacityAllocation = GearAllocationQuantities & {
  status: GearAllocationStatus;
  effectiveStartDate?: Date | string | null;
  effectiveEndDate?: Date | string | null;
};

function dateOnly(value: Date | string): string {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

/**
 * Checked-out gear continues to consume capacity until it is reconciled, even
 * after its planned reservation window. Planned allocations only block overlap.
 */
export function allocationConsumesCapacityForWindow(
  allocation: CapacityAllocation,
  window: GearReservationWindow,
): boolean {
  if (activeAllocationQuantity(allocation) === 0) return false;
  if (["PICKED_UP", "PARTIALLY_RETURNED"].includes(allocation.status)) return true;
  if (!["PENDING", "ALLOCATED"].includes(allocation.status)) return false;
  if (!allocation.effectiveStartDate || !allocation.effectiveEndDate) return false;
  return datesOverlap(
    {
      startDate: dateOnly(allocation.effectiveStartDate),
      endDate: dateOnly(allocation.effectiveEndDate),
    },
    window,
  );
}

/** Date-only due dates become overdue only after the final effective date. */
export function isOutstandingAllocationOverdue(
  allocation: Pick<CapacityAllocation, "status" | "effectiveEndDate">,
  today = new Date(),
): boolean {
  return (
    ["PICKED_UP", "PARTIALLY_RETURNED"].includes(allocation.status) &&
    allocation.effectiveEndDate !== null &&
    allocation.effectiveEndDate !== undefined &&
    dateOnly(allocation.effectiveEndDate) < dateOnly(today)
  );
}

export function canAllocatePoolStock(stock: GearPoolAvailability, quantity: number): boolean {
  return Number.isSafeInteger(quantity) && quantity > 0 && quantity <= availablePoolQuantity(stock);
}

export function allocationRemainingForReturn(allocation: GearAllocationQuantities): number {
  return Math.max(0, allocation.pickedUpQty - allocation.returnedQty);
}

export function allocationIsConsistent(allocation: GearAllocationQuantities): boolean {
  const values = [
    allocation.allocatedQty,
    allocation.pickedUpQty,
    allocation.returnedQty,
    allocation.releasedQty,
  ];

  return (
    values.every((value) => Number.isSafeInteger(value) && value >= 0) &&
    allocation.pickedUpQty <= allocation.allocatedQty &&
    allocation.returnedQty <= allocation.pickedUpQty &&
    allocation.releasedQty <= allocation.allocatedQty - allocation.pickedUpQty
  );
}

export function allocationStatusQuantitiesValid(
  status: GearAllocationStatus,
  allocation: GearAllocationQuantities,
): boolean {
  if (!allocationIsConsistent(allocation)) {
    return false;
  }

  switch (status) {
    case "PENDING":
      return (
        allocation.allocatedQty === 0 &&
        allocation.pickedUpQty === 0 &&
        allocation.returnedQty === 0 &&
        allocation.releasedQty === 0
      );
    case "ALLOCATED":
      return allocation.allocatedQty > 0 && allocation.pickedUpQty === 0 && allocation.returnedQty === 0 && allocation.releasedQty === 0;
    case "PICKED_UP":
      return allocation.pickedUpQty > 0 && allocation.returnedQty === 0 && allocation.releasedQty === 0;
    case "PARTIALLY_RETURNED":
      return (
        allocation.pickedUpQty > 0 &&
        allocation.returnedQty > 0 &&
        allocation.returnedQty < allocation.pickedUpQty &&
        allocation.releasedQty === 0
      );
    case "RETURNED":
      return (
        allocation.pickedUpQty === allocation.returnedQty &&
        allocation.returnedQty + allocation.releasedQty === allocation.allocatedQty
      );
    case "RELEASED":
      return (
        allocation.allocatedQty > 0 &&
        allocation.pickedUpQty === 0 &&
        allocation.returnedQty === 0 &&
        allocation.releasedQty === allocation.allocatedQty
      );
  }
}

export function isActiveTaggedAllocationStatus(status: GearAllocationStatus): boolean {
  return ["PENDING", "ALLOCATED", "PICKED_UP", "PARTIALLY_RETURNED"].includes(status);
}

export function taggedAllocationWindowsConflict(
  candidate: TaggedAllocationWindow,
  existing: TaggedAllocationWindow,
): boolean {
  return (
    isActiveTaggedAllocationStatus(candidate.status) &&
    isActiveTaggedAllocationStatus(existing.status) &&
    datesOverlap(candidate, existing)
  );
}

export function hasExactlyOneNotificationRecipient(recipient: NotificationRecipient): boolean {
  return recipient.email.trim().length > 0;
}

export function isValidInventoryMovementDirection(
  type:
    | "RECEIPT"
    | "ALLOCATION"
    | "RELEASE"
    | "RETURN"
    | "TRANSFER"
    | "ADJUSTMENT"
    | "WRITE_OFF",
  direction: GearInventoryDirection,
): boolean {
  const expectedDirections = {
    RECEIPT: "INCREASE",
    ALLOCATION: "DECREASE",
    RELEASE: "INCREASE",
    RETURN: "INCREASE",
    TRANSFER: "NEUTRAL",
    ADJUSTMENT: undefined,
    WRITE_OFF: "DECREASE",
  } as const;

  const expected = expectedDirections[type];
  return expected ? direction === expected : direction === "INCREASE" || direction === "DECREASE";
}

export function canTransitionReservation(
  from: GearReservationStatus,
  to: GearReservationStatus,
): boolean {
  return reservationTransitions[from].includes(to);
}

export function canTransitionAllocation(from: GearAllocationStatus, to: GearAllocationStatus): boolean {
  return allocationTransitions[from].includes(to);
}

export function canTransitionUnit(from: GearUnitStatus, to: GearUnitStatus): boolean {
  return unitTransitions[from].includes(to);
}

export function requiresTaggedUnit(mode: GearTrackingMode): boolean {
  return mode === "INDIVIDUAL";
}

export type GearAvailabilityConflict = {
  code: "INSUFFICIENT_POOL_STOCK" | "TAGGED_UNIT_UNAVAILABLE" | "OVERDUE_CUSTODY";
  message: string;
  entityId?: string;
};

export function poolAvailabilityConflict(
  stock: GearPoolAvailability,
  requestedQuantity: number,
  entityId?: string,
): GearAvailabilityConflict | null {
  if (canAllocatePoolStock(stock, requestedQuantity)) return null;
  return {
    code: "INSUFFICIENT_POOL_STOCK",
    entityId,
    message: `Only ${availablePoolQuantity(stock)} matching item${availablePoolQuantity(stock) === 1 ? "" : "s"} are available.`,
  };
}

export function taggedUnitAvailabilityConflict(
  status: GearUnitStatus,
  hasOverdueCheckout: boolean,
  entityId?: string,
): GearAvailabilityConflict | null {
  if (hasOverdueCheckout) {
    return {
      code: "OVERDUE_CUSTODY",
      entityId,
      message: "This tagged item is still checked out past its due date.",
    };
  }
  if (status === "AVAILABLE" || status === "RESERVED") return null;
  return {
    code: "TAGGED_UNIT_UNAVAILABLE",
    entityId,
    message: "This tagged item is unavailable for the requested dates.",
  };
}

export function isRetryablePrismaConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: unknown; message?: unknown };
  return (
    candidate.code === "P2034" ||
    candidate.code === "40001" ||
    (typeof candidate.message === "string" &&
      /(serialization failure|could not serialize access)/i.test(candidate.message))
  );
}
