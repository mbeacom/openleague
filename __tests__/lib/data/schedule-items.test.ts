import { describe, expect, it } from "vitest";

import { deduplicateAssociationScheduleItems } from "@/lib/data/schedule-items";
import type { AssociationScheduleItemView } from "@/types/association-operations";

const startsAt = new Date("2026-09-07T10:00:00.000Z");

function scheduleItem(
  overrides: Partial<AssociationScheduleItemView> = {},
): AssociationScheduleItemView {
  return {
    id: "item-1",
    canonicalScheduleId: "",
    venueReservationId: null,
    source: "event",
    sourceId: "recurring-source-1",
    title: "Weekly skate",
    startsAt,
    endsAt: new Date("2026-09-07T11:00:00.000Z"),
    timezone: "UTC",
    venueId: "venue-1",
    surfaceId: "surface-1",
    segmentId: null,
    href: null,
    ...overrides,
  };
}

describe("deduplicateAssociationScheduleItems", () => {
  it("keeps unlinked recurring occurrences with the same source ID distinct", () => {
    const secondStart = new Date("2026-09-14T10:00:00.000Z");

    const result = deduplicateAssociationScheduleItems([
      scheduleItem(),
      scheduleItem({
        id: "item-2",
        startsAt: secondStart,
        endsAt: new Date("2026-09-14T11:00:00.000Z"),
      }),
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.canonicalScheduleId)).toEqual([
      `event:recurring-source-1:${startsAt.toISOString()}`,
      `event:recurring-source-1:${secondStart.toISOString()}`,
    ]);
  });

  it("deduplicates linked reservation aliases regardless of source identity", () => {
    const result = deduplicateAssociationScheduleItems([
      scheduleItem({
        venueReservationId: "reservation-1",
        source: "venueReservation",
        sourceId: "reservation-1",
        title: "Reserved venue time",
      }),
      scheduleItem({
        id: "game-1",
        venueReservationId: "reservation-1",
        source: "seasonGame",
        sourceId: "game-1",
        title: "Hawks vs Otters",
      }),
    ]);

    expect(result).toEqual([
      expect.objectContaining({
        source: "seasonGame",
        canonicalScheduleId: "reservation:reservation-1",
      }),
    ]);
  });

  // T021: a practice and its participant-facing Event alias sharing one
  // VenueReservation must collapse to a single canonical row, with the
  // practice (domain activity) winning over the bare Event alias -- this is
  // the exact linkage the not-yet-built T032 practice-session flow is meant
  // to establish (see __tests__/lib/actions/practice-sessions.test.ts).
  it("keeps practice metadata and the participant Event RSVP href regardless of input order", () => {
    const aliases = [
      scheduleItem({
        id: "event-alias-1",
        venueReservationId: "reservation-2",
        source: "event",
        sourceId: "event-alias-1",
        title: "Practice (roster view)",
        href: "/events/event-alias-1",
      }),
      scheduleItem({
        id: "practice-1",
        venueReservationId: "reservation-2",
        source: "practice",
        sourceId: "practice-1",
        title: "Team practice",
        href: "/practice-planner/practice-1",
      }),
    ];

    for (const result of [
      deduplicateAssociationScheduleItems(aliases),
      deduplicateAssociationScheduleItems([...aliases].reverse()),
    ]) {
      expect(result).toEqual([
        expect.objectContaining({
          source: "practice",
          canonicalScheduleId: "reservation:reservation-2",
          title: "Team practice",
          href: "/events/event-alias-1",
        }),
      ]);
    }
  });

  it("collapses more than two aliases of the same reservation to the single highest-priority source, in either input order", () => {
    const aliases = [
      scheduleItem({
        id: "res-alias",
        venueReservationId: "reservation-3",
        source: "venueReservation",
        sourceId: "reservation-3",
      }),
      scheduleItem({
        id: "event-alias",
        venueReservationId: "reservation-3",
        source: "event",
        sourceId: "event-alias",
      }),
      scheduleItem({
        id: "signup-alias",
        venueReservationId: "reservation-3",
        source: "signupEvent",
        sourceId: "signup-alias",
      }),
      scheduleItem({
        id: "eventgame-alias",
        venueReservationId: "reservation-3",
        source: "eventGame",
        sourceId: "eventgame-alias",
      }),
      scheduleItem({
        id: "seasongame-alias",
        venueReservationId: "reservation-3",
        source: "seasonGame",
        sourceId: "seasongame-alias",
      }),
    ];

    const forward = deduplicateAssociationScheduleItems(aliases);
    const reversed = deduplicateAssociationScheduleItems([...aliases].reverse());

    for (const result of [forward, reversed]) {
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          source: "seasonGame",
          canonicalScheduleId: "reservation:reservation-3",
        }),
      );
    }
  });

  it("collapses two fully identical unlinked occurrences (same source, sourceId, and start time) to one row", () => {
    const result = deduplicateAssociationScheduleItems([
      scheduleItem({ id: "dup-a" }),
      scheduleItem({ id: "dup-b" }),
    ]);

    expect(result).toHaveLength(1);
  });

  it("sorts canonical items by start time, then by canonical schedule ID as a stable tiebreaker for same-instant items", () => {
    const sameInstant = new Date("2026-09-21T09:00:00.000Z");
    const earlier = new Date("2026-09-20T09:00:00.000Z");

    const result = deduplicateAssociationScheduleItems([
      scheduleItem({ id: "z-item", source: "event", sourceId: "zzz", startsAt: sameInstant }),
      scheduleItem({ id: "a-item", source: "event", sourceId: "aaa", startsAt: sameInstant }),
      scheduleItem({ id: "earliest-item", source: "event", sourceId: "earliest", startsAt: earlier }),
    ]);

    expect(result.map((item) => item.canonicalScheduleId)).toEqual([
      `event:earliest:${earlier.toISOString()}`,
      `event:aaa:${sameInstant.toISOString()}`,
      `event:zzz:${sameInstant.toISOString()}`,
    ]);
  });
});
