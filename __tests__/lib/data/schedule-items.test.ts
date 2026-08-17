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
});
