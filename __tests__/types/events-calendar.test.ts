import { describe, it, expect } from "vitest";
import {
  deriveCalendarScopes,
  calendarItemMatchesScope,
  type CalendarItem,
} from "@/types/events";

function makeItem(overrides: Partial<CalendarItem>): CalendarItem {
  return {
    id: "item-1",
    source: "event",
    title: "Test item",
    startAt: "2026-07-11T18:00:00.000Z",
    endAt: null,
    scope: {},
    href: "/events/item-1",
    ...overrides,
  };
}

describe("deriveCalendarScopes", () => {
  it("returns unique team/league/venue scopes ordered by kind then name", () => {
    const items: CalendarItem[] = [
      makeItem({
        id: "a",
        scope: { teamId: "t1", teamName: "Zebras", leagueId: "l1", leagueName: "Metro League" },
      }),
      makeItem({ id: "b", scope: { teamId: "t2", teamName: "Aces" } }),
      makeItem({ id: "c", source: "venue-block", scope: { venueId: "v1", venueName: "Ice Barn" } }),
      // Duplicate team scope must not produce a second option.
      makeItem({ id: "d", source: "practice", scope: { teamId: "t1", teamName: "Zebras" } }),
    ];

    expect(deriveCalendarScopes(items)).toEqual([
      { kind: "team", id: "t2", name: "Aces" },
      { kind: "team", id: "t1", name: "Zebras" },
      { kind: "league", id: "l1", name: "Metro League" },
      { kind: "venue", id: "v1", name: "Ice Barn" },
    ]);
  });

  it("returns an empty list for items without scopes", () => {
    expect(deriveCalendarScopes([makeItem({ scope: {} })])).toEqual([]);
  });
});

describe("calendarItemMatchesScope", () => {
  const item = makeItem({
    scope: { teamId: "t1", teamName: "Zebras", leagueId: "l1", leagueName: "Metro League" },
  });

  it("matches by the scope kind's id", () => {
    expect(calendarItemMatchesScope(item, { kind: "team", id: "t1" })).toBe(true);
    expect(calendarItemMatchesScope(item, { kind: "league", id: "l1" })).toBe(true);
    expect(calendarItemMatchesScope(item, { kind: "venue", id: "v1" })).toBe(false);
  });

  it("does not match a different id of the same kind", () => {
    expect(calendarItemMatchesScope(item, { kind: "team", id: "t2" })).toBe(false);
  });
});
