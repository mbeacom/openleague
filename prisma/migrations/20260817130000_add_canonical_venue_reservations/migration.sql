-- Additive canonical venue occupancy foundation (ADR-0007).
-- Application writes continue to use Prisma exclusively; these checks defend
-- invariants that PostgreSQL can enforce at the storage boundary.

BEGIN;

CREATE TYPE "VenueScheduleBlockIntent" AS ENUM (
  'OFFERING',
  'VENUE_ACTIVITY',
  'CLOSURE',
  'INFORMATION'
);
CREATE TYPE "VenueReservationStatus" AS ENUM (
  'HELD',
  'CONFIRMED',
  'RELEASED',
  'CANCELED',
  'COMPLETED'
);
CREATE TYPE "VenueReservationUsageStatus" AS ENUM (
  'PENDING',
  'USED',
  'UNUSED'
);

ALTER TYPE "IceTimeRequestStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_ACCEPTED' AFTER 'ACCEPTED';

-- Do not install an INFORMATION default: older application versions omit this
-- column, and silently classifying their closures/activities as non-occupying
-- would make rollback unsafe. Existing rows and omitted writes instead use the
-- same deterministic legacy-field derivation.
ALTER TABLE "venue_schedule_blocks"
  ADD COLUMN "intent" "VenueScheduleBlockIntent";

UPDATE "venue_schedule_blocks"
SET "intent" = CASE
  WHEN "registrationMode" = 'REQUEST_REQUIRED' THEN 'OFFERING'::"VenueScheduleBlockIntent"
  WHEN "activityType" = 'CLOSURE' THEN 'CLOSURE'::"VenueScheduleBlockIntent"
  ELSE 'VENUE_ACTIVITY'::"VenueScheduleBlockIntent"
END;

CREATE FUNCTION "derive_venue_schedule_block_intent"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."intent" IS NULL THEN
    NEW."intent" := CASE
      WHEN NEW."registrationMode" = 'REQUEST_REQUIRED' THEN 'OFFERING'::"VenueScheduleBlockIntent"
      WHEN NEW."activityType" = 'CLOSURE' THEN 'CLOSURE'::"VenueScheduleBlockIntent"
      ELSE 'VENUE_ACTIVITY'::"VenueScheduleBlockIntent"
    END;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW."intent" IS NOT DISTINCT FROM OLD."intent" AND (
      NEW."registrationMode" IS DISTINCT FROM OLD."registrationMode"
      OR NEW."activityType" IS DISTINCT FROM OLD."activityType"
    ) THEN
      NEW."intent" := CASE
        WHEN NEW."registrationMode" = 'REQUEST_REQUIRED' THEN 'OFFERING'::"VenueScheduleBlockIntent"
        WHEN NEW."activityType" = 'CLOSURE' THEN 'CLOSURE'::"VenueScheduleBlockIntent"
        ELSE 'VENUE_ACTIVITY'::"VenueScheduleBlockIntent"
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "venue_schedule_blocks_intent_trigger"
BEFORE INSERT OR UPDATE OF "intent", "registrationMode", "activityType"
ON "venue_schedule_blocks"
FOR EACH ROW EXECUTE FUNCTION "derive_venue_schedule_block_intent"();

ALTER TABLE "venue_schedule_blocks"
  ALTER COLUMN "intent" SET NOT NULL;

ALTER TABLE "ice_time_requests"
  ADD COLUMN "approvedStartAt" TIMESTAMP(3),
  ADD COLUMN "approvedEndAt" TIMESTAMP(3),
  ADD COLUMN "approvedSurfaceId" TEXT,
  ADD COLUMN "approvedSegmentId" TEXT,
  ADD CONSTRAINT "ice_time_requests_approved_interval_check"
    CHECK (
      ("approvedStartAt" IS NULL AND "approvedEndAt" IS NULL)
      OR (
        "approvedStartAt" IS NOT NULL
        AND "approvedEndAt" IS NOT NULL
        AND "approvedEndAt" > "approvedStartAt"
      )
    ),
  ADD CONSTRAINT "ice_time_requests_approved_segment_surface_check"
    CHECK ("approvedSegmentId" IS NULL OR "approvedSurfaceId" IS NOT NULL);

CREATE TABLE "venue_reservations" (
  "id" TEXT NOT NULL,
  "status" "VenueReservationStatus" NOT NULL,
  "usageStatus" "VenueReservationUsageStatus" NOT NULL DEFAULT 'PENDING',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
  "heldUntil" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "venueId" TEXT NOT NULL,
  "surfaceId" TEXT,
  "segmentId" TEXT,
  "ownerLeagueId" TEXT,
  "ownerTeamId" TEXT,
  "ownerVenueOrganizationId" TEXT,
  "sourceRequestId" TEXT,
  "offeringBlockId" TEXT,
  "sourceScheduleBlockId" TEXT,
  "createdById" TEXT NOT NULL,
  "assignedById" TEXT,

  CONSTRAINT "venue_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "venue_reservations_interval_check"
    CHECK ("endsAt" > "startsAt"),
  CONSTRAINT "venue_reservations_exactly_one_owner_check"
    CHECK (
      num_nonnulls(
        "ownerLeagueId",
        "ownerTeamId",
        "ownerVenueOrganizationId"
      ) = 1
    ),
  CONSTRAINT "venue_reservations_segment_requires_surface_check"
    CHECK ("segmentId" IS NULL OR "surfaceId" IS NOT NULL),
  CONSTRAINT "venue_reservations_hold_expiration_check"
    CHECK ("status" <> 'HELD' OR "heldUntil" IS NOT NULL),
  CONSTRAINT "venue_reservations_lifecycle_timestamp_check"
    CHECK (
      ("status" <> 'CONFIRMED' OR "confirmedAt" IS NOT NULL)
      AND ("status" <> 'RELEASED' OR "releasedAt" IS NOT NULL)
      AND ("status" <> 'CANCELED' OR "canceledAt" IS NOT NULL)
      AND ("status" <> 'COMPLETED' OR ("confirmedAt" IS NOT NULL AND "completedAt" IS NOT NULL))
    )
);

-- Existing accepted requests predate explicit approval snapshots. Preserve their
-- deterministic requested occurrence and the offering's space so both old and
-- new application versions produce the same canonical reservation input.
UPDATE "ice_time_requests" request
SET
  "approvedStartAt" = request."requestedStartAt",
  "approvedEndAt" = request."requestedEndAt",
  "approvedSurfaceId" = block."surfaceId",
  "approvedSegmentId" = block."segmentId"
FROM "venue_schedule_blocks" block
WHERE request."scheduleBlockId" = block."id"
  AND request."status" = 'ACCEPTED'
  AND request."approvedStartAt" IS NULL
  AND request."approvedEndAt" IS NULL;

CREATE TABLE "venue_reservation_transitions" (
  "id" TEXT NOT NULL,
  "previousStatus" "VenueReservationStatus",
  "nextStatus" "VenueReservationStatus" NOT NULL,
  "reason" TEXT,
  "snapshot" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reservationId" TEXT NOT NULL,
  "actorId" TEXT,
  CONSTRAINT "venue_reservation_transitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venue_reservation_overrides" (
  "id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "candidateSnapshot" JSONB NOT NULL,
  "conflictingReservationIds" TEXT[] NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reservationId" TEXT NOT NULL,
  "actorId" TEXT,
  CONSTRAINT "venue_reservation_overrides_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "venue_reservation_overrides_reason_check"
    CHECK (length(btrim("reason")) > 0)
);

ALTER TABLE "Event" ADD COLUMN "venueReservationId" TEXT;
ALTER TABLE "practice_sessions" ADD COLUMN "venueReservationId" TEXT;
ALTER TABLE "season_games" ADD COLUMN "venueReservationId" TEXT;
ALTER TABLE "game_proposal_entries" ADD COLUMN "venueReservationId" TEXT;
ALTER TABLE "signup_events" ADD COLUMN "venueReservationId" TEXT;
ALTER TABLE "event_games" ADD COLUMN "venueReservationId" TEXT;

CREATE UNIQUE INDEX "venue_reservations_sourceRequestId_key"
  ON "venue_reservations"("sourceRequestId");
CREATE UNIQUE INDEX "venue_reservations_sourceScheduleBlockId_startsAt_key"
  ON "venue_reservations"("sourceScheduleBlockId", "startsAt");
CREATE INDEX "venue_reservations_venueId_startsAt_endsAt_idx"
  ON "venue_reservations"("venueId", "startsAt", "endsAt");
CREATE INDEX "venue_reservations_surfaceId_startsAt_endsAt_idx"
  ON "venue_reservations"("surfaceId", "startsAt", "endsAt");
CREATE INDEX "venue_reservations_segmentId_startsAt_endsAt_idx"
  ON "venue_reservations"("segmentId", "startsAt", "endsAt");
CREATE INDEX "venue_reservations_ownerLeagueId_status_startsAt_idx"
  ON "venue_reservations"("ownerLeagueId", "status", "startsAt");
CREATE INDEX "venue_reservations_ownerTeamId_status_startsAt_idx"
  ON "venue_reservations"("ownerTeamId", "status", "startsAt");
CREATE INDEX "venue_reservations_ownerVenueOrganizationId_status_startsAt_idx"
  ON "venue_reservations"("ownerVenueOrganizationId", "status", "startsAt");
CREATE INDEX "venue_reservations_status_heldUntil_idx"
  ON "venue_reservations"("status", "heldUntil");
CREATE INDEX "venue_reservation_transitions_reservationId_occurredAt_idx"
  ON "venue_reservation_transitions"("reservationId", "occurredAt");
CREATE INDEX "venue_reservation_overrides_reservationId_occurredAt_idx"
  ON "venue_reservation_overrides"("reservationId", "occurredAt");
CREATE INDEX "ice_time_requests_approvedSurfaceId_idx"
  ON "ice_time_requests"("approvedSurfaceId");
CREATE INDEX "ice_time_requests_approvedSegmentId_idx"
  ON "ice_time_requests"("approvedSegmentId");

CREATE UNIQUE INDEX "Event_venueReservationId_key" ON "Event"("venueReservationId");
CREATE INDEX "Event_venueReservationId_idx" ON "Event"("venueReservationId");
CREATE UNIQUE INDEX "practice_sessions_venueReservationId_key" ON "practice_sessions"("venueReservationId");
CREATE INDEX "practice_sessions_venueReservationId_idx" ON "practice_sessions"("venueReservationId");
CREATE UNIQUE INDEX "season_games_venueReservationId_key" ON "season_games"("venueReservationId");
CREATE INDEX "season_games_venueReservationId_idx" ON "season_games"("venueReservationId");
CREATE UNIQUE INDEX "game_proposal_entries_venueReservationId_key" ON "game_proposal_entries"("venueReservationId");
CREATE INDEX "game_proposal_entries_venueReservationId_idx" ON "game_proposal_entries"("venueReservationId");
CREATE UNIQUE INDEX "signup_events_venueReservationId_key" ON "signup_events"("venueReservationId");
CREATE INDEX "signup_events_venueReservationId_idx" ON "signup_events"("venueReservationId");
CREATE UNIQUE INDEX "event_games_venueReservationId_key" ON "event_games"("venueReservationId");
CREATE INDEX "event_games_venueReservationId_idx" ON "event_games"("venueReservationId");

ALTER TABLE "ice_time_requests"
  ADD CONSTRAINT "ice_time_requests_approvedSurfaceId_fkey"
    FOREIGN KEY ("approvedSurfaceId") REFERENCES "ice_surfaces"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ice_time_requests_approvedSegmentId_fkey"
    FOREIGN KEY ("approvedSegmentId") REFERENCES "surface_segments"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "venue_reservations"
  ADD CONSTRAINT "venue_reservations_venueId_fkey"
    FOREIGN KEY ("venueId") REFERENCES "venues"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "venue_reservations_surfaceId_fkey"
    FOREIGN KEY ("surfaceId") REFERENCES "ice_surfaces"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "venue_reservations_segmentId_fkey"
    FOREIGN KEY ("segmentId") REFERENCES "surface_segments"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "venue_reservations_ownerLeagueId_fkey"
    FOREIGN KEY ("ownerLeagueId") REFERENCES "leagues"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "venue_reservations_ownerTeamId_fkey"
    FOREIGN KEY ("ownerTeamId") REFERENCES "Team"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "venue_reservations_ownerVenueOrganizationId_fkey"
    FOREIGN KEY ("ownerVenueOrganizationId") REFERENCES "venue_organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "venue_reservations_sourceRequestId_fkey"
    FOREIGN KEY ("sourceRequestId") REFERENCES "ice_time_requests"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "venue_reservations_offeringBlockId_fkey"
    FOREIGN KEY ("offeringBlockId") REFERENCES "venue_schedule_blocks"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "venue_reservations_sourceScheduleBlockId_fkey"
    FOREIGN KEY ("sourceScheduleBlockId") REFERENCES "venue_schedule_blocks"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "venue_reservations_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "venue_reservations_assignedById_fkey"
    FOREIGN KEY ("assignedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "venue_reservation_transitions"
  ADD CONSTRAINT "venue_reservation_transitions_reservationId_fkey"
    FOREIGN KEY ("reservationId") REFERENCES "venue_reservations"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "venue_reservation_transitions_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "venue_reservation_overrides"
  ADD CONSTRAINT "venue_reservation_overrides_reservationId_fkey"
    FOREIGN KEY ("reservationId") REFERENCES "venue_reservations"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "venue_reservation_overrides_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "Event"
  ADD CONSTRAINT "Event_venueReservationId_fkey"
    FOREIGN KEY ("venueReservationId") REFERENCES "venue_reservations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "practice_sessions"
  ADD CONSTRAINT "practice_sessions_venueReservationId_fkey"
    FOREIGN KEY ("venueReservationId") REFERENCES "venue_reservations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "season_games"
  ADD CONSTRAINT "season_games_venueReservationId_fkey"
    FOREIGN KEY ("venueReservationId") REFERENCES "venue_reservations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "game_proposal_entries"
  ADD CONSTRAINT "game_proposal_entries_venueReservationId_fkey"
    FOREIGN KEY ("venueReservationId") REFERENCES "venue_reservations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "signup_events"
  ADD CONSTRAINT "signup_events_venueReservationId_fkey"
    FOREIGN KEY ("venueReservationId") REFERENCES "venue_reservations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_games"
  ADD CONSTRAINT "event_games_venueReservationId_fkey"
    FOREIGN KEY ("venueReservationId") REFERENCES "venue_reservations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Cross-table ancestry cannot be expressed as PostgreSQL CHECK constraints.
-- These triggers are a final storage-boundary defense; application writes still
-- use Prisma and perform the same checks inside their transactions.
CREATE FUNCTION "validate_venue_reservation_ancestry"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."surfaceId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "ice_surfaces"
    WHERE "id" = NEW."surfaceId" AND "venueId" = NEW."venueId"
  ) THEN
    RAISE EXCEPTION 'venue reservation surface does not belong to venue'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."segmentId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "surface_segments"
    WHERE "id" = NEW."segmentId" AND "surfaceId" = NEW."surfaceId"
  ) THEN
    RAISE EXCEPTION 'venue reservation segment does not belong to surface'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."ownerVenueOrganizationId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "venues"
    WHERE "id" = NEW."venueId"
      AND "organizationId" = NEW."ownerVenueOrganizationId"
  ) THEN
    RAISE EXCEPTION 'venue reservation organization owner does not own venue'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."ownerLeagueId" IS NOT NULL AND NOT (
    EXISTS (
      SELECT 1 FROM "venues"
      WHERE "id" = NEW."venueId" AND "leagueId" = NEW."ownerLeagueId"
    )
    OR EXISTS (
      SELECT 1 FROM "venue_relationships"
      WHERE "venueId" = NEW."venueId"
        AND "targetType" = 'LEAGUE'
        AND "leagueId" = NEW."ownerLeagueId"
        AND "teamId" IS NULL
        AND "status" = 'ACTIVE'
        AND ("expiresAt" IS NULL OR "expiresAt" > CURRENT_TIMESTAMP)
    )
  ) THEN
    RAISE EXCEPTION 'venue reservation league owner has no active venue relationship'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."ownerTeamId" IS NOT NULL AND NOT (
    EXISTS (
      SELECT 1 FROM "venues"
      WHERE "id" = NEW."venueId" AND "teamId" = NEW."ownerTeamId"
    )
    OR EXISTS (
      SELECT 1 FROM "venue_relationships"
      WHERE "venueId" = NEW."venueId"
        AND "targetType" = 'TEAM'
        AND "teamId" = NEW."ownerTeamId"
        AND "leagueId" IS NULL
        AND "status" = 'ACTIVE'
        AND ("expiresAt" IS NULL OR "expiresAt" > CURRENT_TIMESTAMP)
    )
  ) THEN
    RAISE EXCEPTION 'venue reservation team owner has no active venue relationship'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."sourceRequestId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "ice_time_requests" request
    LEFT JOIN "Team" requester_team
      ON requester_team."id" = request."requesterTeamId"
    WHERE request."id" = NEW."sourceRequestId"
      AND request."venueId" = NEW."venueId"
      AND request."status" IN ('ACCEPTED', 'PARTIALLY_ACCEPTED')
      AND request."scheduleBlockId" = NEW."offeringBlockId"
      AND request."approvedStartAt" = NEW."startsAt"
      AND request."approvedEndAt" = NEW."endsAt"
      AND request."approvedSurfaceId" IS NOT DISTINCT FROM NEW."surfaceId"
      AND request."approvedSegmentId" IS NOT DISTINCT FROM NEW."segmentId"
      AND request."requestedStartAt" <= NEW."startsAt"
      AND request."requestedEndAt" >= NEW."endsAt"
      AND (
        (
          request."requesterTeamId" IS NOT NULL
          AND NEW."ownerTeamId" = request."requesterTeamId"
          AND (
            request."requesterLeagueId" IS NULL
            OR requester_team."leagueId" = request."requesterLeagueId"
          )
        )
        OR (
          request."requesterTeamId" IS NULL
          AND request."requesterLeagueId" IS NOT NULL
          AND NEW."ownerLeagueId" = request."requesterLeagueId"
        )
        OR (
          request."requesterTeamId" IS NULL
          AND request."requesterLeagueId" IS NULL
          AND NEW."ownerVenueOrganizationId" IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM "venues" request_venue
            WHERE request_venue."id" = request."venueId"
              AND request_venue."organizationId" =
                NEW."ownerVenueOrganizationId"
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'venue reservation source request approval or owner does not match'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."offeringBlockId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "venue_schedule_blocks"
    WHERE "id" = NEW."offeringBlockId"
      AND "venueId" = NEW."venueId"
      AND "intent" = 'OFFERING'
  ) THEN
    RAISE EXCEPTION 'venue reservation offering block is not an offering at venue'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."sourceScheduleBlockId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "venue_schedule_blocks"
    WHERE "id" = NEW."sourceScheduleBlockId"
      AND "venueId" = NEW."venueId"
      AND "intent" IN ('VENUE_ACTIVITY', 'CLOSURE')
  ) THEN
    RAISE EXCEPTION 'venue reservation source schedule block is not occupying at venue'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."sourceRequestId" IS NOT NULL
    AND NEW."offeringBlockId" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM "ice_time_requests"
      WHERE "id" = NEW."sourceRequestId"
        AND "scheduleBlockId" = NEW."offeringBlockId"
    )
  THEN
    RAISE EXCEPTION 'venue reservation request does not belong to offering block'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "venue_reservations_ancestry_trigger"
BEFORE INSERT OR UPDATE OF "venueId", "surfaceId", "segmentId",
  "ownerLeagueId", "ownerTeamId", "ownerVenueOrganizationId",
  "sourceRequestId", "offeringBlockId", "sourceScheduleBlockId",
  "startsAt", "endsAt"
ON "venue_reservations"
FOR EACH ROW EXECUTE FUNCTION "validate_venue_reservation_ancestry"();

CREATE FUNCTION "validate_ice_time_request_approval_ancestry"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "venue_schedule_blocks" block
    WHERE block."id" = NEW."scheduleBlockId"
      AND block."venueId" = NEW."venueId"
  ) THEN
    RAISE EXCEPTION 'ice time request block does not belong to request venue'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."approvedSurfaceId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "ice_surfaces"
    WHERE "id" = NEW."approvedSurfaceId" AND "venueId" = NEW."venueId"
  ) THEN
    RAISE EXCEPTION 'approved surface does not belong to request venue'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."approvedSegmentId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "surface_segments"
    WHERE "id" = NEW."approvedSegmentId"
      AND "surfaceId" = NEW."approvedSurfaceId"
  ) THEN
    RAISE EXCEPTION 'approved segment does not belong to approved surface'
      USING ERRCODE = '23514';
  END IF;

  IF (
    NEW."approvedStartAt" IS NOT NULL
    OR NEW."status" IN ('ACCEPTED', 'PARTIALLY_ACCEPTED')
  ) AND (
    NEW."approvedSurfaceId" IS NOT NULL
    OR NEW."approvedSegmentId" IS NOT NULL
  ) AND NOT EXISTS (
    SELECT 1
    FROM "venue_schedule_blocks" block
    WHERE block."id" = NEW."scheduleBlockId"
      AND block."venueId" = NEW."venueId"
      AND (
        block."surfaceId" IS NULL
        OR (
          NEW."approvedSurfaceId" = block."surfaceId"
          AND (
            block."segmentId" IS NULL
            OR NEW."approvedSegmentId" = block."segmentId"
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'approved space widens or leaves requested space'
      USING ERRCODE = '23514';
  END IF;

  IF (
    NEW."approvedStartAt" IS NOT NULL
    OR NEW."status" IN ('ACCEPTED', 'PARTIALLY_ACCEPTED')
  ) AND NEW."approvedSurfaceId" IS NULL AND EXISTS (
    SELECT 1
    FROM "venue_schedule_blocks" block
    WHERE block."id" = NEW."scheduleBlockId"
      AND block."surfaceId" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'approved space widens requested surface to venue'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ice_time_requests_approval_ancestry_trigger"
BEFORE INSERT OR UPDATE OF "scheduleBlockId", "venueId", "status",
  "approvedStartAt", "approvedEndAt", "approvedSurfaceId", "approvedSegmentId"
ON "ice_time_requests"
FOR EACH ROW EXECUTE FUNCTION "validate_ice_time_request_approval_ancestry"();

CREATE FUNCTION "validate_venue_schedule_block_ancestry"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."surfaceId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "ice_surfaces"
    WHERE "id" = NEW."surfaceId" AND "venueId" = NEW."venueId"
  ) THEN
    RAISE EXCEPTION 'venue schedule block surface does not belong to venue'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."segmentId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "surface_segments"
    WHERE "id" = NEW."segmentId" AND "surfaceId" = NEW."surfaceId"
  ) THEN
    RAISE EXCEPTION 'venue schedule block segment does not belong to surface'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "venue_schedule_blocks_ancestry_trigger"
BEFORE INSERT OR UPDATE OF "venueId", "surfaceId", "segmentId"
ON "venue_schedule_blocks"
FOR EACH ROW EXECUTE FUNCTION "validate_venue_schedule_block_ancestry"();

-- Reservation transitions and overrides are audit history. Restrictive parent
-- FKs preserve them, while storage-boundary triggers reject mutation/deletion
-- even if a future application path bypasses the append-only Prisma API.
CREATE FUNCTION "prevent_venue_reservation_history_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "venue_reservation_transitions_append_only_trigger"
BEFORE UPDATE OR DELETE ON "venue_reservation_transitions"
FOR EACH ROW EXECUTE FUNCTION "prevent_venue_reservation_history_mutation"();

CREATE TRIGGER "venue_reservation_overrides_append_only_trigger"
BEFORE UPDATE OR DELETE ON "venue_reservation_overrides"
FOR EACH ROW EXECUTE FUNCTION "prevent_venue_reservation_history_mutation"();

-- Reservations are lifecycle records, not disposable rows. Releasing,
-- canceling, or correcting one must append history instead of deleting it.
CREATE TRIGGER "venue_reservations_delete_guard_trigger"
BEFORE DELETE ON "venue_reservations"
FOR EACH ROW EXECUTE FUNCTION "prevent_venue_reservation_history_mutation"();

COMMIT;
