import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  join(
    process.cwd(),
    "prisma/migrations/20260817130000_add_canonical_venue_reservations/migration.sql",
  ),
  "utf8",
);
const venueContent = readFileSync(
  join(process.cwd(), "lib/actions/venue-content.ts"),
  "utf8",
);
const venueSchedules = readFileSync(
  join(process.cwd(), "lib/actions/venue-schedules.ts"),
  "utf8",
);

describe("canonical venue reservation migration parity", () => {
  it("keeps override conflict IDs required without inventing a database default", () => {
    expect(schema).toContain("conflictingReservationIds String[]");
    expect(migration).toContain('"conflictingReservationIds" TEXT[] NOT NULL');
    expect(migration).not.toMatch(/"conflictingReservationIds" TEXT\[\][^,\n]*DEFAULT/);
  });

  it("derives intent for legacy writers instead of defaulting to information", () => {
    expect(schema).toMatch(/intent\s+VenueScheduleBlockIntent\s*\n/);
    expect(schema).not.toMatch(
      /intent\s+VenueScheduleBlockIntent\s+@default\(INFORMATION\)/,
    );
    expect(migration).toContain('CREATE FUNCTION "derive_venue_schedule_block_intent"()');
    expect(migration).toContain('WHEN NEW."activityType" = \'CLOSURE\'');
    expect(migration).toContain('BEFORE INSERT OR UPDATE OF "intent"');
    expect(migration).not.toContain(
      'ADD COLUMN "intent" "VenueScheduleBlockIntent" NOT NULL DEFAULT',
    );
    expect(venueContent).toContain('intent: "VENUE_ACTIVITY"');
    expect(venueSchedules).toContain("intent: scheduleBlockIntent(validated)");
  });

  it("guards reservation, request, and block ancestry at the database boundary", () => {
    expect(migration).toContain('"venue_reservations_ancestry_trigger"');
    expect(migration).toContain('"ownerVenueOrganizationId"');
    expect(migration).toContain('"sourceRequestId"');
    expect(migration).toContain('"offeringBlockId"');
    expect(migration).toContain('"sourceScheduleBlockId"');
    expect(migration).toContain('request."approvedStartAt" = NEW."startsAt"');
    expect(migration).toContain(
      'request."approvedSurfaceId" IS NOT DISTINCT FROM NEW."surfaceId"',
    );
    expect(migration).toContain(
      'request."requesterTeamId" IS NOT NULL',
    );
    expect(migration).toContain(
      'request."requesterLeagueId" IS NULL',
    );
    expect(migration).toMatch(
      /request_venue\."organizationId"\s*=\s*NEW\."ownerVenueOrganizationId"/,
    );
    expect(migration).toContain(
      "venue reservation league owner has no active venue relationship",
    );
    expect(migration).toContain('"ice_time_requests_approval_ancestry_trigger"');
    expect(migration).toMatch(
      /block\."id" = NEW\."scheduleBlockId"[\s\S]*block\."venueId" = NEW\."venueId"/,
    );
    expect(migration).toContain('"venue_schedule_blocks_ancestry_trigger"');
  });

  it("enforces partial approval space containment at the database boundary", () => {
    expect(migration).toContain(
      "approved space widens or leaves requested space",
    );
    expect(migration).toContain(
      "approved space widens requested surface to venue",
    );
    expect(migration).toMatch(
      /block\."surfaceId" IS NULL[\s\S]*NEW\."approvedSurfaceId" = block\."surfaceId"[\s\S]*block\."segmentId" IS NULL[\s\S]*NEW\."approvedSegmentId" = block\."segmentId"/,
    );
    expect(migration).toContain(
      `NEW."status" IN ('ACCEPTED', 'PARTIALLY_ACCEPTED')`,
    );
    expect(migration).toMatch(
      /UPDATE OF "scheduleBlockId", "venueId", "status",[\s\S]*"approvedStartAt", "approvedEndAt"/,
    );
  });

  it("uses distinct offering and occupying-block provenance with occurrence uniqueness", () => {
    expect(schema).toContain(
      '@relation("VenueReservationScheduleBlockSource"',
    );
    expect(schema).toContain("@@unique([sourceScheduleBlockId, startsAt])");
    expect(migration).toContain(
      '"venue_reservations_sourceScheduleBlockId_startsAt_key"',
    );
    expect(migration).toContain(
      `"intent" IN ('VENUE_ACTIVITY', 'CLOSURE')`,
    );
  });

  it("makes transition and override history append-only and restricts parent deletion", () => {
    expect(schema).toMatch(
      /model VenueReservationTransition[\s\S]*?reservation\s+VenueReservation @relation\([^\n]*onDelete: Restrict[^\n]*onUpdate: Restrict\)/,
    );
    expect(schema).toMatch(
      /model VenueReservationOverride[\s\S]*?reservation\s+VenueReservation @relation\([^\n]*onDelete: Restrict[^\n]*onUpdate: Restrict\)/,
    );
    expect(migration).toMatch(
      /venue_reservation_transitions_reservationId_fkey[\s\S]*?ON DELETE RESTRICT/,
    );
    expect(migration).toMatch(
      /venue_reservation_overrides_reservationId_fkey[\s\S]*?ON DELETE RESTRICT/,
    );
    expect(migration).toContain(
      'CREATE TRIGGER "venue_reservation_transitions_append_only_trigger"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "venue_reservation_overrides_append_only_trigger"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "venue_reservations_delete_guard_trigger"',
    );
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON "venue_reservation_transitions"');
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON "venue_reservation_overrides"');
    expect(migration).toMatch(
      /venue_reservation_transitions_actorId_fkey[\s\S]*?ON DELETE RESTRICT ON UPDATE RESTRICT/,
    );
    expect(migration).toMatch(
      /venue_reservation_overrides_actorId_fkey[\s\S]*?ON DELETE RESTRICT ON UPDATE RESTRICT/,
    );
  });
});
