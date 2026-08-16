-- League-owned gear projections, immutable operational ledger, and notification
-- outbox. Application mutations use Prisma transactions; the constraints here
-- protect invariants that PostgreSQL can enforce locally.

CREATE TYPE "GearTrackingMode" AS ENUM ('POOLED', 'INDIVIDUAL');
CREATE TYPE "GearCondition" AS ENUM ('NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED');
CREATE TYPE "GearUnitStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'CHECKED_OUT', 'MAINTENANCE', 'RETIRED', 'LOST');
CREATE TYPE "GearNeedPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "GearNeedStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'FULFILLED', 'CANCELED');
CREATE TYPE "GearNeedLineStatus" AS ENUM ('OPEN', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELED');
CREATE TYPE "GearReservationStatus" AS ENUM ('DRAFT', 'REQUESTED', 'APPROVED', 'DECLINED', 'CANCELED', 'FULFILLED', 'CLOSED');
CREATE TYPE "GearAllocationStatus" AS ENUM ('PENDING', 'ALLOCATED', 'PICKED_UP', 'PARTIALLY_RETURNED', 'RETURNED', 'RELEASED');
CREATE TYPE "GearHandoffType" AS ENUM ('PICKUP', 'RETURN', 'TRANSFER', 'RECEIPT', 'ADJUSTMENT');
CREATE TYPE "GearReturnDisposition" AS ENUM ('GOOD', 'DAMAGED', 'LOST', 'CONSUMED');
CREATE TYPE "GearInventoryMovementType" AS ENUM ('RECEIPT', 'ALLOCATION', 'RELEASE', 'RETURN', 'TRANSFER', 'ADJUSTMENT', 'WRITE_OFF');
CREATE TYPE "GearWishlistStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "GearPledgeStatus" AS ENUM ('PLEDGED', 'RECEIVED', 'DECLINED', 'CANCELED', 'EXPIRED');
CREATE TYPE "GearActivityEntityType" AS ENUM ('CATALOG_ITEM', 'STORAGE_LOCATION', 'POOL_STOCK', 'UNIT', 'NEED', 'RESERVATION', 'ALLOCATION', 'HANDOFF', 'MOVEMENT', 'WISHLIST', 'PLEDGE');
CREATE TYPE "GearActivityActorKind" AS ENUM ('USER', 'SYSTEM', 'PUBLIC_DONOR');
CREATE TYPE "NotificationOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELED');
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE "gear_catalog_items" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "normalizedKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "size" TEXT,
  "brand" TEXT,
  "model" TEXT,
  "description" TEXT,
  "attributes" JSONB,
  "trackingMode" "GearTrackingMode" NOT NULL DEFAULT 'POOLED',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "gear_catalog_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gear_storage_locations" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "privateNotes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "gear_storage_locations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gear_pool_stocks" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "condition" "GearCondition" NOT NULL DEFAULT 'GOOD',
  "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "gear_pool_stocks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gear_pool_stocks_quantity_nonnegative" CHECK ("quantityOnHand" >= 0),
  CONSTRAINT "gear_pool_stocks_version_nonnegative" CHECK ("version" >= 0)
);

CREATE TABLE "gear_units" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "currentLocationId" TEXT,
  "assetTag" TEXT,
  "serialNumber" TEXT,
  "status" "GearUnitStatus" NOT NULL DEFAULT 'AVAILABLE',
  "currentCondition" "GearCondition" NOT NULL DEFAULT 'GOOD',
  "acquiredAt" DATE,
  "retiredAt" DATE,
  "notes" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "gear_units_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gear_units_version_nonnegative" CHECK ("version" >= 0)
);

CREATE TABLE "team_gear_needs" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "GearNeedStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "fulfilledAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  CONSTRAINT "team_gear_needs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "team_gear_needs_version_nonnegative" CHECK ("version" >= 0)
);

CREATE TABLE "team_gear_need_lines" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "needId" TEXT NOT NULL,
  "catalogItemId" TEXT,
  "nameSnapshot" TEXT NOT NULL,
  "categorySnapshot" TEXT,
  "sizeSnapshot" TEXT,
  "trackingMode" "GearTrackingMode",
  "requestedQty" INTEGER NOT NULL,
  "fulfilledQty" INTEGER NOT NULL DEFAULT 0,
  "canceledQty" INTEGER NOT NULL DEFAULT 0,
  "priority" "GearNeedPriority" NOT NULL DEFAULT 'NORMAL',
  "status" "GearNeedLineStatus" NOT NULL DEFAULT 'OPEN',
  "notes" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "team_gear_need_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "team_gear_need_lines_quantities_valid" CHECK (
    "requestedQty" > 0 AND "fulfilledQty" >= 0 AND "canceledQty" >= 0
    AND "fulfilledQty" + "canceledQty" <= "requestedQty"
  ),
  CONSTRAINT "team_gear_need_lines_version_nonnegative" CHECK ("version" >= 0)
);

CREATE TABLE "gear_reservations" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "status" "GearReservationStatus" NOT NULL DEFAULT 'DRAFT',
  "requestedStartDate" DATE NOT NULL,
  "requestedEndDate" DATE NOT NULL,
  "approvedStartDate" DATE,
  "approvedEndDate" DATE,
  "custodianNameSnapshot" TEXT NOT NULL,
  "custodianEmailSnapshot" TEXT,
  "custodianPhoneSnapshot" TEXT,
  "requestNotes" TEXT,
  "decisionNotes" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  "custodyStartedAt" TIMESTAMP(3),
  "custodyEndedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "requestedById" TEXT,
  "decidedById" TEXT,
  CONSTRAINT "gear_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gear_reservations_requested_dates_valid" CHECK ("requestedEndDate" >= "requestedStartDate"),
  CONSTRAINT "gear_reservations_approved_dates_valid" CHECK (
    "approvedStartDate" IS NULL OR "approvedEndDate" IS NULL OR "approvedEndDate" >= "approvedStartDate"
  ),
  CONSTRAINT "gear_reservations_version_nonnegative" CHECK ("version" >= 0)
);

CREATE TABLE "gear_reservation_lines" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "catalogItemId" TEXT,
  "needLineId" TEXT,
  "nameSnapshot" TEXT NOT NULL,
  "requestedQty" INTEGER NOT NULL,
  "approvedQty" INTEGER NOT NULL DEFAULT 0,
  "allocatedQty" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "gear_reservation_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gear_reservation_lines_quantities_valid" CHECK (
    "requestedQty" > 0 AND "approvedQty" >= 0 AND "allocatedQty" >= 0
    AND "allocatedQty" <= "approvedQty" AND "approvedQty" <= "requestedQty"
  )
);

CREATE TABLE "gear_allocations" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "reservationLineId" TEXT NOT NULL,
  "poolStockId" TEXT,
  "gearUnitId" TEXT,
  "status" "GearAllocationStatus" NOT NULL DEFAULT 'PENDING',
  "allocatedQty" INTEGER NOT NULL DEFAULT 0,
  "pickedUpQty" INTEGER NOT NULL DEFAULT 0,
  "returnedQty" INTEGER NOT NULL DEFAULT 0,
  "releasedQty" INTEGER NOT NULL DEFAULT 0,
  "effectiveStartDate" DATE,
  "effectiveEndDate" DATE,
  "version" INTEGER NOT NULL DEFAULT 0,
  "allocatedAt" TIMESTAMP(3),
  "pickedUpAt" TIMESTAMP(3),
  "returnedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "allocatedById" TEXT,
  CONSTRAINT "gear_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gear_allocations_exactly_one_source" CHECK (("poolStockId" IS NOT NULL) <> ("gearUnitId" IS NOT NULL)),
  CONSTRAINT "gear_allocations_quantities_valid" CHECK (
    "allocatedQty" >= 0 AND "pickedUpQty" >= 0 AND "returnedQty" >= 0 AND "releasedQty" >= 0
    AND "pickedUpQty" <= "allocatedQty"
    AND "returnedQty" <= "pickedUpQty"
    AND "releasedQty" <= "allocatedQty" - "pickedUpQty"
  ),
  CONSTRAINT "gear_allocations_tagged_unit_quantity" CHECK (
    "gearUnitId" IS NULL OR ("allocatedQty" <= 1 AND "pickedUpQty" <= 1 AND "returnedQty" <= 1 AND "releasedQty" <= 1)
  ),
  CONSTRAINT "gear_allocations_status_quantities_valid" CHECK (
    ("status" = 'PENDING' AND "allocatedQty" = 0 AND "pickedUpQty" = 0 AND "returnedQty" = 0 AND "releasedQty" = 0)
    OR ("status" = 'ALLOCATED' AND "allocatedQty" > 0 AND "pickedUpQty" = 0 AND "returnedQty" = 0 AND "releasedQty" = 0)
    OR ("status" = 'PICKED_UP' AND "allocatedQty" > 0 AND "pickedUpQty" > 0 AND "returnedQty" = 0 AND "releasedQty" = 0)
    OR ("status" = 'PARTIALLY_RETURNED' AND "pickedUpQty" > 0 AND "returnedQty" > 0 AND "returnedQty" < "pickedUpQty" AND "releasedQty" = 0)
    OR ("status" = 'RETURNED' AND "pickedUpQty" = "returnedQty" AND "returnedQty" + "releasedQty" = "allocatedQty")
    OR ("status" = 'RELEASED' AND "allocatedQty" > 0 AND "pickedUpQty" = 0 AND "returnedQty" = 0 AND "releasedQty" = "allocatedQty")
  ),
  CONSTRAINT "gear_allocations_tagged_unit_dates_valid" CHECK (
    "gearUnitId" IS NULL
    OR "status" NOT IN ('PENDING', 'ALLOCATED', 'PICKED_UP', 'PARTIALLY_RETURNED')
    OR ("effectiveStartDate" IS NOT NULL AND "effectiveEndDate" IS NOT NULL AND "effectiveEndDate" >= "effectiveStartDate")
  ),
  CONSTRAINT "gear_allocations_version_nonnegative" CHECK ("version" >= 0)
);

CREATE TABLE "gear_handoffs" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "reservationId" TEXT,
  "allocationId" TEXT,
  "type" "GearHandoffType" NOT NULL,
  "returnDisposition" "GearReturnDisposition",
  "custodianNameSnapshot" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "handledById" TEXT,
  CONSTRAINT "gear_handoffs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gear_wishlists" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "shareToken" TEXT NOT NULL,
  "status" "GearWishlistStatus" NOT NULL DEFAULT 'DRAFT',
  "title" TEXT NOT NULL,
  "description" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0,
  "publishedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "gear_wishlists_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gear_wishlists_version_nonnegative" CHECK ("version" >= 0)
);

CREATE TABLE "gear_wishlist_items" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "wishlistId" TEXT NOT NULL,
  "catalogItemId" TEXT,
  "normalizedKey" TEXT NOT NULL,
  "nameSnapshot" TEXT NOT NULL,
  "categorySnapshot" TEXT,
  "sizeSnapshot" TEXT,
  "description" TEXT,
  "targetQty" INTEGER NOT NULL,
  "pledgedQty" INTEGER NOT NULL DEFAULT 0,
  "receivedQty" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "gear_wishlist_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gear_wishlist_items_quantities_valid" CHECK (
    "targetQty" > 0 AND "pledgedQty" >= 0 AND "receivedQty" >= 0
  )
);

CREATE TABLE "gear_pledges" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "wishlistItemId" TEXT NOT NULL,
  "donorName" TEXT NOT NULL,
  "donorEmail" TEXT,
  "donorPhone" TEXT,
  "contactConsentAt" TIMESTAMP(3),
  "status" "GearPledgeStatus" NOT NULL DEFAULT 'PLEDGED',
  "quantity" INTEGER NOT NULL,
  "note" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "gear_pledges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gear_pledges_quantity_positive" CHECK ("quantity" > 0)
);

CREATE TABLE "gear_pledge_receipts" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "pledgeId" TEXT NOT NULL,
  "catalogItemId" TEXT,
  "poolStockId" TEXT,
  "gearUnitId" TEXT,
  "quantity" INTEGER NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gear_pledge_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gear_pledge_receipts_exactly_one_inventory_target" CHECK (("poolStockId" IS NOT NULL) <> ("gearUnitId" IS NOT NULL)),
  CONSTRAINT "gear_pledge_receipts_quantity_positive" CHECK ("quantity" > 0)
);

CREATE TABLE "gear_activity" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "entityType" "GearActivityEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorKind" "GearActivityActorKind" NOT NULL,
  "details" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorUserId" TEXT,
  CONSTRAINT "gear_activity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gear_inventory_movements" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "type" "GearInventoryMovementType" NOT NULL,
  "poolStockId" TEXT,
  "gearUnitId" TEXT,
  "allocationId" TEXT,
  "handoffId" TEXT,
  "pledgeReceiptId" TEXT,
  "quantity" INTEGER NOT NULL,
  "beforeLocationId" TEXT,
  "afterLocationId" TEXT,
  "beforeCondition" "GearCondition",
  "afterCondition" "GearCondition",
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordedById" TEXT,
  CONSTRAINT "gear_inventory_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gear_inventory_movements_exactly_one_inventory_target" CHECK (("poolStockId" IS NOT NULL) <> ("gearUnitId" IS NOT NULL)),
  CONSTRAINT "gear_inventory_movements_quantity_positive" CHECK ("quantity" > 0)
);

CREATE TABLE "notification_outbox" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "recipientUserId" TEXT,
  "recipientEmail" TEXT,
  "eventType" TEXT NOT NULL,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "status" "NotificationOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_outbox_exactly_one_recipient" CHECK (("recipientUserId" IS NOT NULL) <> ("recipientEmail" IS NOT NULL)),
  CONSTRAINT "notification_outbox_attempts_nonnegative" CHECK ("attempts" >= 0)
);

CREATE UNIQUE INDEX "gear_catalog_items_leagueId_normalizedKey_key" ON "gear_catalog_items"("leagueId", "normalizedKey");
CREATE UNIQUE INDEX "Team_leagueId_id_key" ON "Team"("leagueId", "id");
CREATE UNIQUE INDEX "gear_catalog_items_leagueId_id_key" ON "gear_catalog_items"("leagueId", "id");
CREATE INDEX "gear_catalog_items_leagueId_isActive_idx" ON "gear_catalog_items"("leagueId", "isActive");
CREATE UNIQUE INDEX "gear_storage_locations_leagueId_normalizedName_key" ON "gear_storage_locations"("leagueId", "normalizedName");
CREATE UNIQUE INDEX "gear_storage_locations_leagueId_id_key" ON "gear_storage_locations"("leagueId", "id");
CREATE INDEX "gear_storage_locations_leagueId_isActive_idx" ON "gear_storage_locations"("leagueId", "isActive");
CREATE UNIQUE INDEX "gear_pool_stocks_leagueId_catalogItemId_locationId_condition_key" ON "gear_pool_stocks"("leagueId", "catalogItemId", "locationId", "condition");
CREATE UNIQUE INDEX "gear_pool_stocks_leagueId_id_key" ON "gear_pool_stocks"("leagueId", "id");
CREATE INDEX "gear_pool_stocks_leagueId_catalogItemId_idx" ON "gear_pool_stocks"("leagueId", "catalogItemId");
CREATE INDEX "gear_pool_stocks_leagueId_locationId_idx" ON "gear_pool_stocks"("leagueId", "locationId");
CREATE UNIQUE INDEX "gear_units_leagueId_assetTag_key" ON "gear_units"("leagueId", "assetTag");
CREATE UNIQUE INDEX "gear_units_leagueId_id_key" ON "gear_units"("leagueId", "id");
CREATE INDEX "gear_units_leagueId_catalogItemId_status_idx" ON "gear_units"("leagueId", "catalogItemId", "status");
CREATE INDEX "gear_units_currentLocationId_idx" ON "gear_units"("currentLocationId");
CREATE INDEX "team_gear_needs_leagueId_teamId_status_idx" ON "team_gear_needs"("leagueId", "teamId", "status");
CREATE UNIQUE INDEX "team_gear_needs_leagueId_id_key" ON "team_gear_needs"("leagueId", "id");
CREATE INDEX "team_gear_need_lines_needId_status_idx" ON "team_gear_need_lines"("needId", "status");
CREATE UNIQUE INDEX "team_gear_need_lines_leagueId_id_key" ON "team_gear_need_lines"("leagueId", "id");
CREATE INDEX "team_gear_need_lines_catalogItemId_idx" ON "team_gear_need_lines"("catalogItemId");
CREATE INDEX "gear_reservations_leagueId_teamId_status_idx" ON "gear_reservations"("leagueId", "teamId", "status");
CREATE UNIQUE INDEX "gear_reservations_leagueId_id_key" ON "gear_reservations"("leagueId", "id");
CREATE INDEX "gear_reservations_leagueId_requestedStartDate_requestedEndDate_idx" ON "gear_reservations"("leagueId", "requestedStartDate", "requestedEndDate");
CREATE INDEX "gear_reservation_lines_reservationId_idx" ON "gear_reservation_lines"("reservationId");
CREATE UNIQUE INDEX "gear_reservation_lines_leagueId_id_key" ON "gear_reservation_lines"("leagueId", "id");
CREATE INDEX "gear_reservation_lines_needLineId_idx" ON "gear_reservation_lines"("needLineId");
CREATE INDEX "gear_allocations_leagueId_status_idx" ON "gear_allocations"("leagueId", "status");
CREATE UNIQUE INDEX "gear_allocations_leagueId_id_key" ON "gear_allocations"("leagueId", "id");
CREATE INDEX "gear_allocations_reservationLineId_idx" ON "gear_allocations"("reservationLineId");
CREATE INDEX "gear_allocations_poolStockId_idx" ON "gear_allocations"("poolStockId");
CREATE INDEX "gear_allocations_gearUnitId_idx" ON "gear_allocations"("gearUnitId");
ALTER TABLE "gear_allocations" ADD CONSTRAINT "gear_allocations_tagged_unit_active_window_excl"
  EXCLUDE USING gist (
    "gearUnitId" WITH =,
    daterange("effectiveStartDate", "effectiveEndDate", '[]') WITH &&
  )
  WHERE ("gearUnitId" IS NOT NULL AND "status" IN ('PENDING', 'ALLOCATED', 'PICKED_UP', 'PARTIALLY_RETURNED'));
CREATE INDEX "gear_handoffs_leagueId_occurredAt_idx" ON "gear_handoffs"("leagueId", "occurredAt");
CREATE UNIQUE INDEX "gear_handoffs_leagueId_id_key" ON "gear_handoffs"("leagueId", "id");
CREATE INDEX "gear_handoffs_reservationId_idx" ON "gear_handoffs"("reservationId");
CREATE INDEX "gear_handoffs_allocationId_idx" ON "gear_handoffs"("allocationId");
CREATE UNIQUE INDEX "gear_wishlists_leagueId_key" ON "gear_wishlists"("leagueId");
CREATE UNIQUE INDEX "gear_wishlists_leagueId_id_key" ON "gear_wishlists"("leagueId", "id");
CREATE UNIQUE INDEX "gear_wishlists_shareToken_key" ON "gear_wishlists"("shareToken");
CREATE INDEX "gear_wishlists_status_idx" ON "gear_wishlists"("status");
CREATE INDEX "gear_wishlist_items_wishlistId_isActive_idx" ON "gear_wishlist_items"("wishlistId", "isActive");
CREATE UNIQUE INDEX "gear_wishlist_items_leagueId_id_key" ON "gear_wishlist_items"("leagueId", "id");
CREATE INDEX "gear_wishlist_items_catalogItemId_idx" ON "gear_wishlist_items"("catalogItemId");
CREATE UNIQUE INDEX "gear_pledges_leagueId_idempotencyKey_key" ON "gear_pledges"("leagueId", "idempotencyKey");
CREATE UNIQUE INDEX "gear_pledges_leagueId_id_key" ON "gear_pledges"("leagueId", "id");
CREATE INDEX "gear_pledges_wishlistItemId_status_idx" ON "gear_pledges"("wishlistItemId", "status");
CREATE INDEX "gear_pledge_receipts_leagueId_receivedAt_idx" ON "gear_pledge_receipts"("leagueId", "receivedAt");
CREATE UNIQUE INDEX "gear_pledge_receipts_leagueId_id_key" ON "gear_pledge_receipts"("leagueId", "id");
CREATE INDEX "gear_pledge_receipts_pledgeId_idx" ON "gear_pledge_receipts"("pledgeId");
CREATE INDEX "gear_activity_leagueId_entityType_entityId_occurredAt_idx" ON "gear_activity"("leagueId", "entityType", "entityId", "occurredAt");
CREATE UNIQUE INDEX "gear_activity_leagueId_id_key" ON "gear_activity"("leagueId", "id");
CREATE INDEX "gear_inventory_movements_leagueId_occurredAt_idx" ON "gear_inventory_movements"("leagueId", "occurredAt");
CREATE UNIQUE INDEX "gear_inventory_movements_leagueId_id_key" ON "gear_inventory_movements"("leagueId", "id");
CREATE INDEX "gear_inventory_movements_poolStockId_idx" ON "gear_inventory_movements"("poolStockId");
CREATE INDEX "gear_inventory_movements_gearUnitId_idx" ON "gear_inventory_movements"("gearUnitId");
CREATE INDEX "gear_inventory_movements_allocationId_idx" ON "gear_inventory_movements"("allocationId");
CREATE UNIQUE INDEX "notification_outbox_leagueId_dedupeKey_key" ON "notification_outbox"("leagueId", "dedupeKey");
CREATE UNIQUE INDEX "notification_outbox_leagueId_id_key" ON "notification_outbox"("leagueId", "id");
CREATE INDEX "notification_outbox_status_scheduledAt_idx" ON "notification_outbox"("status", "scheduledAt");
CREATE INDEX "notification_outbox_leagueId_aggregateType_aggregateId_idx" ON "notification_outbox"("leagueId", "aggregateType", "aggregateId");

ALTER TABLE "gear_catalog_items" ADD CONSTRAINT "gear_catalog_items_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_storage_locations" ADD CONSTRAINT "gear_storage_locations_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_pool_stocks" ADD CONSTRAINT "gear_pool_stocks_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_pool_stocks" ADD CONSTRAINT "gear_pool_stocks_catalogItemId_fkey" FOREIGN KEY ("leagueId", "catalogItemId") REFERENCES "gear_catalog_items"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_pool_stocks" ADD CONSTRAINT "gear_pool_stocks_locationId_fkey" FOREIGN KEY ("leagueId", "locationId") REFERENCES "gear_storage_locations"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_units" ADD CONSTRAINT "gear_units_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_units" ADD CONSTRAINT "gear_units_catalogItemId_fkey" FOREIGN KEY ("leagueId", "catalogItemId") REFERENCES "gear_catalog_items"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_units" ADD CONSTRAINT "gear_units_currentLocationId_fkey" FOREIGN KEY ("leagueId", "currentLocationId") REFERENCES "gear_storage_locations"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_gear_needs" ADD CONSTRAINT "team_gear_needs_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_gear_needs" ADD CONSTRAINT "team_gear_needs_teamId_fkey" FOREIGN KEY ("leagueId", "teamId") REFERENCES "Team"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_gear_needs" ADD CONSTRAINT "team_gear_needs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "team_gear_need_lines" ADD CONSTRAINT "team_gear_need_lines_needId_fkey" FOREIGN KEY ("leagueId", "needId") REFERENCES "team_gear_needs"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_gear_need_lines" ADD CONSTRAINT "team_gear_need_lines_catalogItemId_fkey" FOREIGN KEY ("leagueId", "catalogItemId") REFERENCES "gear_catalog_items"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_reservations" ADD CONSTRAINT "gear_reservations_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_reservations" ADD CONSTRAINT "gear_reservations_teamId_fkey" FOREIGN KEY ("leagueId", "teamId") REFERENCES "Team"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_reservations" ADD CONSTRAINT "gear_reservations_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "gear_reservations" ADD CONSTRAINT "gear_reservations_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "gear_reservation_lines" ADD CONSTRAINT "gear_reservation_lines_reservationId_fkey" FOREIGN KEY ("leagueId", "reservationId") REFERENCES "gear_reservations"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_reservation_lines" ADD CONSTRAINT "gear_reservation_lines_catalogItemId_fkey" FOREIGN KEY ("leagueId", "catalogItemId") REFERENCES "gear_catalog_items"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_reservation_lines" ADD CONSTRAINT "gear_reservation_lines_needLineId_fkey" FOREIGN KEY ("leagueId", "needLineId") REFERENCES "team_gear_need_lines"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_allocations" ADD CONSTRAINT "gear_allocations_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_allocations" ADD CONSTRAINT "gear_allocations_reservationLineId_fkey" FOREIGN KEY ("leagueId", "reservationLineId") REFERENCES "gear_reservation_lines"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_allocations" ADD CONSTRAINT "gear_allocations_poolStockId_fkey" FOREIGN KEY ("leagueId", "poolStockId") REFERENCES "gear_pool_stocks"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_allocations" ADD CONSTRAINT "gear_allocations_gearUnitId_fkey" FOREIGN KEY ("leagueId", "gearUnitId") REFERENCES "gear_units"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_allocations" ADD CONSTRAINT "gear_allocations_allocatedById_fkey" FOREIGN KEY ("allocatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "gear_handoffs" ADD CONSTRAINT "gear_handoffs_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_handoffs" ADD CONSTRAINT "gear_handoffs_reservationId_fkey" FOREIGN KEY ("leagueId", "reservationId") REFERENCES "gear_reservations"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_handoffs" ADD CONSTRAINT "gear_handoffs_allocationId_fkey" FOREIGN KEY ("leagueId", "allocationId") REFERENCES "gear_allocations"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_handoffs" ADD CONSTRAINT "gear_handoffs_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "gear_wishlists" ADD CONSTRAINT "gear_wishlists_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_wishlist_items" ADD CONSTRAINT "gear_wishlist_items_wishlistId_fkey" FOREIGN KEY ("leagueId", "wishlistId") REFERENCES "gear_wishlists"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_wishlist_items" ADD CONSTRAINT "gear_wishlist_items_catalogItemId_fkey" FOREIGN KEY ("leagueId", "catalogItemId") REFERENCES "gear_catalog_items"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_pledges" ADD CONSTRAINT "gear_pledges_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_pledges" ADD CONSTRAINT "gear_pledges_wishlistItemId_fkey" FOREIGN KEY ("leagueId", "wishlistItemId") REFERENCES "gear_wishlist_items"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_pledge_receipts" ADD CONSTRAINT "gear_pledge_receipts_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_pledge_receipts" ADD CONSTRAINT "gear_pledge_receipts_pledgeId_fkey" FOREIGN KEY ("leagueId", "pledgeId") REFERENCES "gear_pledges"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_pledge_receipts" ADD CONSTRAINT "gear_pledge_receipts_catalogItemId_fkey" FOREIGN KEY ("leagueId", "catalogItemId") REFERENCES "gear_catalog_items"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_pledge_receipts" ADD CONSTRAINT "gear_pledge_receipts_poolStockId_fkey" FOREIGN KEY ("leagueId", "poolStockId") REFERENCES "gear_pool_stocks"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_pledge_receipts" ADD CONSTRAINT "gear_pledge_receipts_gearUnitId_fkey" FOREIGN KEY ("leagueId", "gearUnitId") REFERENCES "gear_units"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_activity" ADD CONSTRAINT "gear_activity_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_activity" ADD CONSTRAINT "gear_activity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "gear_inventory_movements" ADD CONSTRAINT "gear_inventory_movements_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_inventory_movements" ADD CONSTRAINT "gear_inventory_movements_poolStockId_fkey" FOREIGN KEY ("leagueId", "poolStockId") REFERENCES "gear_pool_stocks"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_inventory_movements" ADD CONSTRAINT "gear_inventory_movements_gearUnitId_fkey" FOREIGN KEY ("leagueId", "gearUnitId") REFERENCES "gear_units"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_inventory_movements" ADD CONSTRAINT "gear_inventory_movements_allocationId_fkey" FOREIGN KEY ("leagueId", "allocationId") REFERENCES "gear_allocations"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_inventory_movements" ADD CONSTRAINT "gear_inventory_movements_handoffId_fkey" FOREIGN KEY ("leagueId", "handoffId") REFERENCES "gear_handoffs"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_inventory_movements" ADD CONSTRAINT "gear_inventory_movements_pledgeReceiptId_fkey" FOREIGN KEY ("leagueId", "pledgeReceiptId") REFERENCES "gear_pledge_receipts"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_inventory_movements" ADD CONSTRAINT "gear_inventory_movements_beforeLocationId_fkey" FOREIGN KEY ("leagueId", "beforeLocationId") REFERENCES "gear_storage_locations"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_inventory_movements" ADD CONSTRAINT "gear_inventory_movements_afterLocationId_fkey" FOREIGN KEY ("leagueId", "afterLocationId") REFERENCES "gear_storage_locations"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_inventory_movements" ADD CONSTRAINT "gear_inventory_movements_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
