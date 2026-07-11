// Pure client-safe helpers for the unified CalendarView (Tier 2 W1b).
// No prisma/server imports — these run inside 'use client' components.
import { TZDate } from "@date-fns/tz";
import type { CalendarItem, CalendarScopeOption } from "@/types/events";
import { isValidTimeZone } from "@/lib/utils/date";

const pad2 = (value: number) => String(value).padStart(2, "0");

/** Canonical `kind:id` key for a scope chip / hide-param entry. */
export function calendarScopeKey(scope: Pick<CalendarScopeOption, "kind" | "id">): string {
  return `${scope.kind}:${scope.id}`;
}

/** Every scope key an item belongs to (an event can be both team- and league-scoped). */
export function itemScopeKeys(item: CalendarItem): string[] {
  const keys: string[] = [];
  if (item.scope.teamId) keys.push(`team:${item.scope.teamId}`);
  if (item.scope.leagueId) keys.push(`league:${item.scope.leagueId}`);
  if (item.scope.venueId) keys.push(`venue:${item.scope.venueId}`);
  return keys;
}

/** Most specific scope drives the item's color: team, then venue, then league. */
export function itemColorScopeKey(item: CalendarItem): string | null {
  if (item.scope.teamId) return `team:${item.scope.teamId}`;
  if (item.scope.venueId) return `venue:${item.scope.venueId}`;
  if (item.scope.leagueId) return `league:${item.scope.leagueId}`;
  return null;
}

/** Display name of the item's most specific scope (mirrors itemColorScopeKey). */
export function itemScopeName(item: CalendarItem): string | null {
  return item.scope.teamName ?? item.scope.venueName ?? item.scope.leagueName ?? null;
}

/**
 * Feed identity / React key. Recurring venue blocks emit one item per
 * occurrence sharing the block id, so the key must include startAt.
 */
export function calendarItemKey(item: CalendarItem): string {
  return `${item.source}:${item.id}:${item.startAt}`;
}

function effectiveZone(item: CalendarItem): string | undefined {
  return item.timezone && isValidTimeZone(item.timezone) ? item.timezone : undefined;
}

/**
 * YYYY-MM-DD calendar-day bucket for an item: computed in the item's own IANA
 * zone when it carries one (the VenueScheduleBoard TZDate pattern), otherwise
 * in the viewer's local zone.
 */
export function calendarItemDayKey(item: CalendarItem): string {
  const start = new Date(item.startAt);
  const zone = effectiveZone(item);
  const zoned = zone ? new TZDate(start.getTime(), zone) : start;
  return `${zoned.getFullYear()}-${pad2(zoned.getMonth() + 1)}-${pad2(zoned.getDate())}`;
}

/** Group feed-ordered items into day buckets; buckets preserve startAt order. */
export function groupItemsByDay(items: CalendarItem[]): Map<string, CalendarItem[]> {
  const byDay = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const key = calendarItemDayKey(item);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(item);
    else byDay.set(key, [item]);
  }
  return byDay;
}

function formatTime(iso: string, zone: string | undefined): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    ...(zone ? { timeZone: zone } : {}),
  });
}

/** Wall-clock start time in the item's zone (viewer-local when zoneless). */
export function formatItemStartTime(item: CalendarItem): string {
  return formatTime(item.startAt, effectiveZone(item));
}

/** "9:00 AM – 10:30 AM", or just the start when the item has no end time. */
export function formatItemTimeRange(item: CalendarItem): string {
  const zone = effectiveZone(item);
  const start = formatTime(item.startAt, zone);
  return item.endAt ? `${start} – ${formatTime(item.endAt, zone)}` : start;
}

/** "OPEN_SKATE" -> "Open skate". */
function enumLabel(value: string): string {
  const words = value.split("_").join(" ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Human label for the item's source/subtype, shown in agenda rows. */
export function calendarSourceLabel(item: CalendarItem): string {
  switch (item.source) {
    case "event":
      return item.eventType ? enumLabel(item.eventType) : "Event";
    case "practice":
      return "Practice plan";
    case "signup":
      return item.eventType ? `${enumLabel(item.eventType)} signup` : "Signup";
    case "venue-block":
      return item.eventType ? enumLabel(item.eventType) : "Venue block";
  }
}

/**
 * Deterministic 32-bit hash (djb2 xor) so a scope keeps the same palette color
 * across months/feeds regardless of which other scopes are present.
 */
export function hashString(value: string): number {
  let hash = 5381;
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return hash >>> 0;
}
