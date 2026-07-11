import { describe, it, expect } from "vitest";
import type { CalendarItem } from "@/types/events";
import {
  calendarItemDayKey,
  calendarItemKey,
  calendarScopeKey,
  calendarSourceLabel,
  formatItemTimeRange,
  groupItemsByDay,
  hashString,
  itemColorScopeKey,
  itemScopeKeys,
} from "@/components/features/calendar/calendar-view-utils";

function makeItem(overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    id: "item-1",
    source: "event",
    title: "vs Ice Hawks",
    startAt: "2026-07-11T23:30:00.000Z",
    endAt: null,
    scope: { teamId: "team-1", teamName: "Bantam A" },
    href: "/events/item-1",
    eventType: "GAME",
    ...overrides,
  };
}

describe("calendar-view-utils", () => {
  describe("calendarItemDayKey", () => {
    it("buckets zoned items into the item's own calendar day", () => {
      // 23:30Z on Jul 11 is 19:30 in New York (Jul 11) but Jul 12 in Tokyo.
      const nyItem = makeItem({ timezone: "America/New_York" });
      const tokyoItem = makeItem({ timezone: "Asia/Tokyo" });

      expect(calendarItemDayKey(nyItem)).toBe("2026-07-11");
      expect(calendarItemDayKey(tokyoItem)).toBe("2026-07-12");
    });

    it("falls back to the viewer-local day for zoneless or invalid zones", () => {
      const local = new Date("2026-07-11T23:30:00.000Z");
      const pad = (value: number) => String(value).padStart(2, "0");
      const expected = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;

      expect(calendarItemDayKey(makeItem())).toBe(expected);
      expect(calendarItemDayKey(makeItem({ timezone: "Not/AZone" }))).toBe(expected);
    });
  });

  describe("groupItemsByDay", () => {
    it("groups items preserving feed order within each day", () => {
      const first = makeItem({ id: "a", timezone: "America/New_York" });
      const second = makeItem({
        id: "b",
        startAt: "2026-07-11T23:45:00.000Z",
        timezone: "America/New_York",
      });
      const nextDay = makeItem({
        id: "c",
        startAt: "2026-07-12T15:00:00.000Z",
        timezone: "America/New_York",
      });

      const grouped = groupItemsByDay([first, second, nextDay]);

      expect(grouped.get("2026-07-11")?.map((item) => item.id)).toEqual(["a", "b"]);
      expect(grouped.get("2026-07-12")?.map((item) => item.id)).toEqual(["c"]);
    });
  });

  describe("scope keys", () => {
    it("emits one key per scope dimension", () => {
      const item = makeItem({
        scope: { teamId: "t1", leagueId: "l1", venueId: "v1" },
      });
      expect(itemScopeKeys(item)).toEqual(["team:t1", "league:l1", "venue:v1"]);
    });

    it("colors by the most specific scope: team, then venue, then league", () => {
      expect(itemColorScopeKey(makeItem({ scope: { teamId: "t1", leagueId: "l1" } }))).toBe(
        "team:t1"
      );
      expect(itemColorScopeKey(makeItem({ scope: { venueId: "v1", leagueId: "l1" } }))).toBe(
        "venue:v1"
      );
      expect(itemColorScopeKey(makeItem({ scope: { leagueId: "l1" } }))).toBe("league:l1");
      expect(itemColorScopeKey(makeItem({ scope: {} }))).toBeNull();
    });

    it("calendarScopeKey matches the item key format", () => {
      expect(calendarScopeKey({ kind: "team", id: "t1" })).toBe("team:t1");
    });
  });

  describe("calendarItemKey", () => {
    it("distinguishes recurring occurrences sharing a block id", () => {
      const a = makeItem({ id: "block", source: "venue-block" });
      const b = makeItem({
        id: "block",
        source: "venue-block",
        startAt: "2026-07-18T23:30:00.000Z",
      });
      expect(calendarItemKey(a)).not.toBe(calendarItemKey(b));
    });
  });

  describe("formatItemTimeRange", () => {
    it("renders start–end in the item's zone", () => {
      const item = makeItem({
        timezone: "America/New_York",
        endAt: "2026-07-12T01:00:00.000Z",
      });
      const range = formatItemTimeRange(item);
      expect(range).toContain("7:30");
      expect(range).toContain("9:00");
      expect(range).toContain("–");
    });

    it("renders only the start when endAt is null", () => {
      const item = makeItem({ timezone: "America/New_York" });
      expect(formatItemTimeRange(item)).not.toContain("–");
    });
  });

  describe("calendarSourceLabel", () => {
    it("labels each source", () => {
      expect(calendarSourceLabel(makeItem())).toBe("Game");
      expect(
        calendarSourceLabel(makeItem({ source: "practice", eventType: undefined }))
      ).toBe("Practice plan");
      expect(calendarSourceLabel(makeItem({ source: "signup", eventType: "TRYOUT" }))).toBe(
        "Tryout signup"
      );
      expect(
        calendarSourceLabel(makeItem({ source: "venue-block", eventType: "OPEN_SKATE" }))
      ).toBe("Open skate");
    });
  });

  describe("hashString", () => {
    it("is deterministic and non-negative", () => {
      expect(hashString("team:t1")).toBe(hashString("team:t1"));
      expect(hashString("team:t1")).toBeGreaterThanOrEqual(0);
      expect(hashString("team:t1")).not.toBe(hashString("team:t2"));
    });
  });
});
