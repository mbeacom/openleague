import { describe, expect, it } from "vitest";
import {
  assertValidRange,
  expandRecurrenceWindow,
  findScheduleConflicts,
  rangesOverlap,
} from "@/lib/utils/venue-schedule";

describe("venue schedule range helpers", () => {
  it("detects overlap but treats touching boundaries as available", () => {
    const first = {
      startAt: new Date("2026-01-01T10:00:00Z"),
      endAt: new Date("2026-01-01T11:00:00Z"),
    };

    expect(
      rangesOverlap(first, {
        startAt: new Date("2026-01-01T10:30:00Z"),
        endAt: new Date("2026-01-01T11:30:00Z"),
      })
    ).toBe(true);

    expect(
      rangesOverlap(first, {
        startAt: new Date("2026-01-01T11:00:00Z"),
        endAt: new Date("2026-01-01T12:00:00Z"),
      })
    ).toBe(false);
  });

  it("accepts midnight spans when the end date is the next day", () => {
    expect(() =>
      assertValidRange({
        startAt: new Date("2026-01-01T23:00:00Z"),
        endAt: new Date("2026-01-02T01:00:00Z"),
      })
    ).not.toThrow();
  });

  it("expands weekly recurrence windows by BYDAY", () => {
    const occurrences = expandRecurrenceWindow(
      {
        startAt: new Date("2026-01-05T10:00:00Z"),
        endAt: new Date("2026-01-05T11:00:00Z"),
        recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4",
      },
      new Date("2026-01-01T00:00:00Z"),
      new Date("2026-01-20T00:00:00Z")
    );

    expect(occurrences.map((occurrence) => occurrence.startAt.toISOString())).toEqual([
      "2026-01-05T10:00:00.000Z",
      "2026-01-07T10:00:00.000Z",
      "2026-01-12T10:00:00.000Z",
      "2026-01-14T10:00:00.000Z",
    ]);
  });

  it("marks closure overlaps with a closure conflict reason", () => {
    const conflicts = findScheduleConflicts(
      {
        startAt: new Date("2026-01-01T10:00:00Z"),
        endAt: new Date("2026-01-01T11:00:00Z"),
      },
      [
        {
          startAt: new Date("2026-01-01T09:00:00Z"),
          endAt: new Date("2026-01-01T12:00:00Z"),
          activityType: "CLOSURE",
          status: "PUBLISHED",
        },
      ]
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].reason).toBe("CLOSURE");
  });
});
