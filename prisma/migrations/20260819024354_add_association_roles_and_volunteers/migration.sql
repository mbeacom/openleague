-- CreateEnum
CREATE TYPE "AssociationRole" AS ENUM ('ASSOCIATION_ADMIN', 'SCHEDULER', 'REGISTRAR', 'TREASURER', 'COMMUNICATIONS_LEAD', 'TEAM_MANAGER', 'COACH', 'VOLUNTEER_COORDINATOR', 'EVENT_MANAGER', 'EQUIPMENT_MANAGER');

-- CreateEnum
CREATE TYPE "AssociationRoleScopeType" AS ENUM ('ASSOCIATION', 'DIVISION', 'TEAM', 'SEASON', 'EVENT', 'SIGNUP_EVENT');

-- CreateEnum
CREATE TYPE "AssociationRoleGrantState" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "VolunteerNeedStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "VolunteerAssignmentStatus" AS ENUM ('INVITED', 'ACCEPTED', 'DECLINED', 'CANCELED', 'COMPLETED', 'MISSED');

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "associationDivisionId" TEXT,
ADD COLUMN     "associationEventId" TEXT,
ADD COLUMN     "associationRole" "AssociationRole",
ADD COLUMN     "associationScopeType" "AssociationRoleScopeType",
ADD COLUMN     "associationSeasonId" TEXT,
ADD COLUMN     "associationSignupEventId" TEXT;

-- CreateTable
CREATE TABLE "association_role_grants" (
    "id" TEXT NOT NULL,
    "role" "AssociationRole" NOT NULL,
    "scopeType" "AssociationRoleScopeType" NOT NULL,
    "state" "AssociationRoleGrantState" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "grantedById" TEXT,
    "revokedById" TEXT,
    "leagueId" TEXT NOT NULL,
    "divisionId" TEXT,
    "teamId" TEXT,
    "seasonId" TEXT,
    "eventId" TEXT,
    "signupEventId" TEXT,

    CONSTRAINT "association_role_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_needs" (
    "id" TEXT NOT NULL,
    "roleLabel" TEXT NOT NULL,
    "description" TEXT,
    "capacity" INTEGER NOT NULL,
    "acceptedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "VolunteerNeedStatus" NOT NULL DEFAULT 'OPEN',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "canceledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "leagueId" TEXT NOT NULL,
    "divisionId" TEXT,
    "teamId" TEXT,
    "eventId" TEXT,
    "signupEventId" TEXT,
    "createdById" TEXT,

    CONSTRAINT "volunteer_needs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_assignments" (
    "id" TEXT NOT NULL,
    "status" "VolunteerAssignmentStatus" NOT NULL DEFAULT 'INVITED',
    "invitedEmail" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "needId" TEXT NOT NULL,
    "userId" TEXT,
    "assignedById" TEXT,

    CONSTRAINT "volunteer_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "association_role_grants_leagueId_state_role_idx" ON "association_role_grants"("leagueId", "state", "role");

-- CreateIndex
CREATE INDEX "association_role_grants_userId_state_idx" ON "association_role_grants"("userId", "state");

-- CreateIndex
CREATE INDEX "association_role_grants_leagueId_teamId_state_idx" ON "association_role_grants"("leagueId", "teamId", "state");

-- CreateIndex
CREATE INDEX "volunteer_needs_leagueId_status_startAt_idx" ON "volunteer_needs"("leagueId", "status", "startAt");

-- CreateIndex
CREATE INDEX "volunteer_needs_leagueId_teamId_status_idx" ON "volunteer_needs"("leagueId", "teamId", "status");

-- CreateIndex
CREATE INDEX "volunteer_assignments_needId_status_idx" ON "volunteer_assignments"("needId", "status");

-- CreateIndex
CREATE INDEX "volunteer_assignments_userId_status_idx" ON "volunteer_assignments"("userId", "status");

-- RenameForeignKey
ALTER TABLE "gear_allocations" RENAME CONSTRAINT "gear_allocations_gearUnitId_fkey" TO "gear_allocations_leagueId_gearUnitId_fkey";

-- RenameForeignKey
ALTER TABLE "gear_allocations" RENAME CONSTRAINT "gear_allocations_poolStockId_fkey" TO "gear_allocations_leagueId_poolStockId_fkey";

-- RenameForeignKey
ALTER TABLE "gear_allocations" RENAME CONSTRAINT "gear_allocations_reservationLineId_fkey" TO "gear_allocations_leagueId_reservationLineId_fkey";

-- RenameForeignKey
ALTER TABLE "gear_handoffs" RENAME CONSTRAINT "gear_handoffs_allocationId_fkey" TO "gear_handoffs_leagueId_allocationId_fkey";

-- RenameForeignKey
ALTER TABLE "gear_handoffs" RENAME CONSTRAINT "gear_handoffs_reservationId_fkey" TO "gear_handoffs_leagueId_reservationId_fkey";

-- RenameForeignKey
ALTER TABLE "gear_inventory_movements" RENAME CONSTRAINT "gear_inventory_movements_afterLocationId_fkey" TO "gear_inventory_movements_leagueId_afterLocationId_fkey";

-- RenameForeignKey
ALTER TABLE "gear_inventory_movements" RENAME CONSTRAINT "gear_inventory_movements_allocationId_fkey" TO "gear_inventory_movements_leagueId_allocationId_fkey";

-- RenameForeignKey
ALTER TABLE "gear_inventory_movements" RENAME CONSTRAINT "gear_inventory_movements_beforeLocationId_fkey" TO "gear_inventory_movements_leagueId_beforeLocationId_fkey";

-- RenameForeignKey
ALTER TABLE "gear_inventory_movements" RENAME CONSTRAINT "gear_inventory_movements_gearUnitId_fkey" TO "gear_inventory_movements_leagueId_gearUnitId_fkey";

-- RenameForeignKey
ALTER TABLE "gear_inventory_movements" RENAME CONSTRAINT "gear_inventory_movements_handoffId_fkey" TO "gear_inventory_movements_leagueId_handoffId_fkey";

-- RenameForeignKey
ALTER TABLE "gear_inventory_movements" RENAME CONSTRAINT "gear_inventory_movements_pledgeReceiptId_fkey" TO "gear_inventory_movements_leagueId_pledgeReceiptId_fkey";

-- RenameForeignKey
ALTER TABLE "gear_inventory_movements" RENAME CONSTRAINT "gear_inventory_movements_poolStockId_fkey" TO "gear_inventory_movements_leagueId_poolStockId_fkey";

-- RenameForeignKey
ALTER TABLE "gear_pledge_receipts" RENAME CONSTRAINT "gear_pledge_receipts_catalogItemId_fkey" TO "gear_pledge_receipts_leagueId_catalogItemId_fkey";

-- RenameForeignKey
ALTER TABLE "gear_pledge_receipts" RENAME CONSTRAINT "gear_pledge_receipts_correctionOfReceiptId_fkey" TO "gear_pledge_receipts_leagueId_correctionOfReceiptId_fkey";

-- RenameForeignKey
ALTER TABLE "gear_pledge_receipts" RENAME CONSTRAINT "gear_pledge_receipts_gearUnitId_fkey" TO "gear_pledge_receipts_leagueId_gearUnitId_fkey";

-- RenameForeignKey
ALTER TABLE "gear_pledge_receipts" RENAME CONSTRAINT "gear_pledge_receipts_pledgeId_fkey" TO "gear_pledge_receipts_leagueId_pledgeId_fkey";

-- RenameForeignKey
ALTER TABLE "gear_pledge_receipts" RENAME CONSTRAINT "gear_pledge_receipts_poolStockId_fkey" TO "gear_pledge_receipts_leagueId_poolStockId_fkey";

-- RenameForeignKey
ALTER TABLE "gear_pledges" RENAME CONSTRAINT "gear_pledges_wishlistItemId_fkey" TO "gear_pledges_leagueId_wishlistItemId_fkey";

-- RenameForeignKey
ALTER TABLE "gear_pool_stocks" RENAME CONSTRAINT "gear_pool_stocks_catalogItemId_fkey" TO "gear_pool_stocks_leagueId_catalogItemId_fkey";

-- RenameForeignKey
ALTER TABLE "gear_pool_stocks" RENAME CONSTRAINT "gear_pool_stocks_locationId_fkey" TO "gear_pool_stocks_leagueId_locationId_fkey";

-- RenameForeignKey
ALTER TABLE "gear_reservation_lines" RENAME CONSTRAINT "gear_reservation_lines_catalogItemId_fkey" TO "gear_reservation_lines_leagueId_catalogItemId_fkey";

-- RenameForeignKey
ALTER TABLE "gear_reservation_lines" RENAME CONSTRAINT "gear_reservation_lines_needLineId_fkey" TO "gear_reservation_lines_leagueId_needLineId_fkey";

-- RenameForeignKey
ALTER TABLE "gear_reservation_lines" RENAME CONSTRAINT "gear_reservation_lines_reservationId_fkey" TO "gear_reservation_lines_leagueId_reservationId_fkey";

-- RenameForeignKey
ALTER TABLE "gear_reservations" RENAME CONSTRAINT "gear_reservations_teamId_fkey" TO "gear_reservations_leagueId_teamId_fkey";

-- RenameForeignKey
ALTER TABLE "gear_units" RENAME CONSTRAINT "gear_units_catalogItemId_fkey" TO "gear_units_leagueId_catalogItemId_fkey";

-- RenameForeignKey
ALTER TABLE "gear_units" RENAME CONSTRAINT "gear_units_currentLocationId_fkey" TO "gear_units_leagueId_currentLocationId_fkey";

-- RenameForeignKey
ALTER TABLE "gear_wishlist_items" RENAME CONSTRAINT "gear_wishlist_items_catalogItemId_fkey" TO "gear_wishlist_items_leagueId_catalogItemId_fkey";

-- RenameForeignKey
ALTER TABLE "gear_wishlist_items" RENAME CONSTRAINT "gear_wishlist_items_wishlistId_fkey" TO "gear_wishlist_items_leagueId_wishlistId_fkey";

-- RenameForeignKey
ALTER TABLE "team_gear_need_lines" RENAME CONSTRAINT "team_gear_need_lines_catalogItemId_fkey" TO "team_gear_need_lines_leagueId_catalogItemId_fkey";

-- RenameForeignKey
ALTER TABLE "team_gear_need_lines" RENAME CONSTRAINT "team_gear_need_lines_needId_fkey" TO "team_gear_need_lines_leagueId_needId_fkey";

-- RenameForeignKey
ALTER TABLE "team_gear_needs" RENAME CONSTRAINT "team_gear_needs_teamId_fkey" TO "team_gear_needs_leagueId_teamId_fkey";

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_associationDivisionId_fkey" FOREIGN KEY ("associationDivisionId") REFERENCES "divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_associationSeasonId_fkey" FOREIGN KEY ("associationSeasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_associationEventId_fkey" FOREIGN KEY ("associationEventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_associationSignupEventId_fkey" FOREIGN KEY ("associationSignupEventId") REFERENCES "signup_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "association_role_grants" ADD CONSTRAINT "association_role_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "association_role_grants" ADD CONSTRAINT "association_role_grants_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "association_role_grants" ADD CONSTRAINT "association_role_grants_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "association_role_grants" ADD CONSTRAINT "association_role_grants_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "association_role_grants" ADD CONSTRAINT "association_role_grants_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "association_role_grants" ADD CONSTRAINT "association_role_grants_leagueId_teamId_fkey" FOREIGN KEY ("leagueId", "teamId") REFERENCES "Team"("leagueId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "association_role_grants" ADD CONSTRAINT "association_role_grants_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "association_role_grants" ADD CONSTRAINT "association_role_grants_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "association_role_grants" ADD CONSTRAINT "association_role_grants_signupEventId_fkey" FOREIGN KEY ("signupEventId") REFERENCES "signup_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_needs" ADD CONSTRAINT "volunteer_needs_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_needs" ADD CONSTRAINT "volunteer_needs_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_needs" ADD CONSTRAINT "volunteer_needs_leagueId_teamId_fkey" FOREIGN KEY ("leagueId", "teamId") REFERENCES "Team"("leagueId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_needs" ADD CONSTRAINT "volunteer_needs_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_needs" ADD CONSTRAINT "volunteer_needs_signupEventId_fkey" FOREIGN KEY ("signupEventId") REFERENCES "signup_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_needs" ADD CONSTRAINT "volunteer_needs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_assignments" ADD CONSTRAINT "volunteer_assignments_needId_fkey" FOREIGN KEY ("needId") REFERENCES "volunteer_needs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_assignments" ADD CONSTRAINT "volunteer_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_assignments" ADD CONSTRAINT "volunteer_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "gear_pledge_receipt_commands_leagueId_pledgeId_idempotencyKey_k" RENAME TO "gear_pledge_receipt_commands_leagueId_pledgeId_idempotencyK_key";

-- RenameIndex
ALTER INDEX "gear_pool_stocks_leagueId_catalogItemId_locationId_condition_ke" RENAME TO "gear_pool_stocks_leagueId_catalogItemId_locationId_conditio_key";

-- RenameIndex
ALTER INDEX "gear_reservations_leagueId_requestedStartDate_requestedEndDate_" RENAME TO "gear_reservations_leagueId_requestedStartDate_requestedEndD_idx";

-- ---------------------------------------------------------------------------
-- Hand-authored invariants (feature 007 US3). Prisma cannot express any of
-- these, and every one of them is load-bearing for "unlisted combinations fail
-- closed": the capability layer trusts that a grant row names exactly one
-- scope, and that the named scope agrees with scopeType.
-- ---------------------------------------------------------------------------

-- A grant names exactly one scope, and it is the one scopeType declares.
-- ASSOCIATION is the only scope with no narrower target: it is bounded by the
-- required leagueId that every row already carries.
ALTER TABLE "association_role_grants"
  ADD CONSTRAINT "association_role_grants_scope_matches_type_check"
  CHECK (
    CASE "scopeType"
      WHEN 'ASSOCIATION'  THEN num_nonnulls("divisionId", "teamId", "seasonId", "eventId", "signupEventId") = 0
      WHEN 'DIVISION'     THEN "divisionId"    IS NOT NULL AND num_nonnulls("teamId", "seasonId", "eventId", "signupEventId") = 0
      WHEN 'TEAM'         THEN "teamId"        IS NOT NULL AND num_nonnulls("divisionId", "seasonId", "eventId", "signupEventId") = 0
      WHEN 'SEASON'       THEN "seasonId"      IS NOT NULL AND num_nonnulls("divisionId", "teamId", "eventId", "signupEventId") = 0
      WHEN 'EVENT'        THEN "eventId"       IS NOT NULL AND num_nonnulls("divisionId", "teamId", "seasonId", "signupEventId") = 0
      WHEN 'SIGNUP_EVENT' THEN "signupEventId" IS NOT NULL AND num_nonnulls("divisionId", "teamId", "seasonId", "eventId") = 0
    END
  );

-- A revoked grant records when it was revoked; an active one never does.
ALTER TABLE "association_role_grants"
  ADD CONSTRAINT "association_role_grants_revocation_timestamp_check"
  CHECK (("state" = 'REVOKED') = ("revokedAt" IS NOT NULL));

-- Uniqueness applies to ACTIVE grants only. Revoked rows are history: without
-- the partial predicate, revoking a responsibility would permanently prevent
-- granting it again. One index per scope kind because Postgres treats NULLs as
-- distinct, so a single index over the nullable scope columns would not dedupe.
CREATE UNIQUE INDEX "association_role_grants_active_association_key"
  ON "association_role_grants" ("userId", "role", "leagueId")
  WHERE "state" = 'ACTIVE' AND "scopeType" = 'ASSOCIATION';

CREATE UNIQUE INDEX "association_role_grants_active_division_key"
  ON "association_role_grants" ("userId", "role", "divisionId")
  WHERE "state" = 'ACTIVE' AND "scopeType" = 'DIVISION';

CREATE UNIQUE INDEX "association_role_grants_active_team_key"
  ON "association_role_grants" ("userId", "role", "teamId")
  WHERE "state" = 'ACTIVE' AND "scopeType" = 'TEAM';

CREATE UNIQUE INDEX "association_role_grants_active_season_key"
  ON "association_role_grants" ("userId", "role", "seasonId")
  WHERE "state" = 'ACTIVE' AND "scopeType" = 'SEASON';

CREATE UNIQUE INDEX "association_role_grants_active_event_key"
  ON "association_role_grants" ("userId", "role", "eventId")
  WHERE "state" = 'ACTIVE' AND "scopeType" = 'EVENT';

CREATE UNIQUE INDEX "association_role_grants_active_signup_event_key"
  ON "association_role_grants" ("userId", "role", "signupEventId")
  WHERE "state" = 'ACTIVE' AND "scopeType" = 'SIGNUP_EVENT';

-- Volunteer needs: a positive capacity, a real interval, and an accepted count
-- that can never exceed capacity. The last one is what makes the conditional
-- updateMany in acceptVolunteerAssignment a safe capacity gate rather than an
-- optimistic guess — the database refuses an overfill even under a race.
ALTER TABLE "volunteer_needs"
  ADD CONSTRAINT "volunteer_needs_capacity_check" CHECK ("capacity" > 0),
  ADD CONSTRAINT "volunteer_needs_interval_check" CHECK ("endAt" > "startAt"),
  ADD CONSTRAINT "volunteer_needs_accepted_within_capacity_check"
    CHECK ("acceptedCount" >= 0 AND "acceptedCount" <= "capacity");

-- An assignment names a known user or an invited email address, never both and
-- never neither.
ALTER TABLE "volunteer_assignments"
  ADD CONSTRAINT "volunteer_assignments_subject_check"
  CHECK (num_nonnulls("userId", "invitedEmail") = 1);

-- One live slot per person per need. DECLINED and CANCELED rows are excluded so
-- somebody who declined can be invited again.
CREATE UNIQUE INDEX "volunteer_assignments_live_user_key"
  ON "volunteer_assignments" ("needId", "userId")
  WHERE "userId" IS NOT NULL AND "status" IN ('INVITED', 'ACCEPTED', 'COMPLETED');

CREATE UNIQUE INDEX "volunteer_assignments_live_email_key"
  ON "volunteer_assignments" ("needId", "invitedEmail")
  WHERE "invitedEmail" IS NOT NULL AND "status" IN ('INVITED', 'ACCEPTED', 'COMPLETED');
