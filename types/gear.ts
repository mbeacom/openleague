export const GEAR_TRACKING_MODES = ["POOLED", "INDIVIDUAL"] as const;
export type GearTrackingMode = (typeof GEAR_TRACKING_MODES)[number];

export const GEAR_CONDITIONS = ["NEW", "EXCELLENT", "GOOD", "FAIR", "POOR", "DAMAGED"] as const;
export type GearCondition = (typeof GEAR_CONDITIONS)[number];

export const GEAR_UNIT_STATUSES = ["AVAILABLE", "RESERVED", "CHECKED_OUT", "MAINTENANCE", "RETIRED", "LOST"] as const;
export type GearUnitStatus = (typeof GEAR_UNIT_STATUSES)[number];

export const GEAR_RESERVATION_STATUSES = [
  "DRAFT",
  "REQUESTED",
  "APPROVED",
  "DECLINED",
  "CANCELED",
  "FULFILLED",
  "CLOSED",
] as const;
export type GearReservationStatus = (typeof GEAR_RESERVATION_STATUSES)[number];

export const GEAR_ALLOCATION_STATUSES = [
  "PENDING",
  "ALLOCATED",
  "PICKED_UP",
  "PARTIALLY_RETURNED",
  "RETURNED",
  "RELEASED",
] as const;
export type GearAllocationStatus = (typeof GEAR_ALLOCATION_STATUSES)[number];

export const GEAR_INVENTORY_DIRECTIONS = ["INCREASE", "DECREASE", "NEUTRAL"] as const;
export type GearInventoryDirection = (typeof GEAR_INVENTORY_DIRECTIONS)[number];

export type GearPoolAvailability = {
  quantityOnHand: number;
  allocatedQuantity: number;
};

export type GearAllocationQuantities = {
  allocatedQty: number;
  pickedUpQty: number;
  returnedQty: number;
  releasedQty: number;
};

export type GearCatalogItemDto = {
  id: string;
  leagueId: string;
  normalizedKey: string;
  name: string;
  category: string;
  size: string | null;
  trackingMode: GearTrackingMode;
  isActive: boolean;
};

export type GearReservationWindow = {
  startDate: string;
  endDate: string;
};

export type TaggedAllocationWindow = GearReservationWindow & {
  status: GearAllocationStatus;
};

export type NotificationRecipient = {
  email: string;
  userId?: string | null;
};

export type GearActivityDetails = {
  action: string;
  summary?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type GearNotificationPayload = {
  kind: "GEAR_RESERVATION" | "GEAR_ALLOCATION" | "GEAR_NEED" | "GEAR_PLEDGE" | "GEAR_WISHLIST";
  data: Record<string, string | number | boolean | null>;
};

export type NotificationOutboxRecipientSnapshot = {
  email: string;
  userId: string | null;
  redactedAt: Date | null;
};
