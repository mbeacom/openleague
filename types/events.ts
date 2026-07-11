/**
 * Shared event types for calendar and event management
 * Based on Prisma Event model
 */

// Base event type for simple event displays
export interface Event {
  id: string;
  type: "GAME" | "PRACTICE";
  title: string;
  startAt: string; // ISO string from server component
  location: string;
  opponent: string | null;
  notes?: string | null;
}

// League event with team relationships (for league calendar views)
export interface LeagueEvent extends Event {
  endAt: string | null; // ISO string, null for events without an end time
  team: {
    id: string;
    name: string;
  };
  homeTeam?: {
    id: string;
    name: string;
  } | null;
  awayTeam?: {
    id: string;
    name: string;
  } | null;
}

// Full event with RSVP data (for event detail pages)
export interface EventWithRSVPs extends LeagueEvent {
  rsvps: Array<{
    id: string;
    status: RSVPStatus;
    user: {
      id: string;
      name: string | null;
      email: string;
    };
    // Per-child response (identity graph, Tier 3). Absent/null on
    // self/household rows — existing consumers are unaffected.
    playerId?: string | null;
    player?: {
      id: string;
      name: string;
    } | null;
  }>;
}

export type EventType = "GAME" | "PRACTICE";

export type RSVPStatus = "GOING" | "NOT_GOING" | "MAYBE" | "NO_RESPONSE";

// ---------------------------------------------------------------------------
// Identity graph (Tier 3) — per-identity RSVP shapes.
// Shared contracts between lib/actions/rsvp.ts (X2), lib/data/dashboard.ts and
// the RSVP UI (X3). See docs/superpowers/specs/2026-07-11-tier3-identity-design.md.
// ---------------------------------------------------------------------------

/**
 * Who a pending/submitted RSVP is for: the viewer themself (self/household row,
 * RSVP.playerId null) or a linked player answered per child (RSVP.playerId set).
 */
export type RsvpTarget =
  | { kind: "self" }
  | { kind: "player"; playerId: string; playerName: string };

/**
 * One row in an event's attendance view. Player-level responses are listed
 * where they exist and user-level otherwise; a user row and their child rows
 * are distinct entries.
 */
export interface AttendanceEntry {
  kind: "user" | "player";
  name: string;
  status: RSVPStatus;
  /** Set on player entries: display name of the guardian/admin who answered. */
  respondedByName?: string;
}

/** Attendance counts keyed by status, deduplicated per entry (not per user). */
export type AttendanceCounts = Record<RSVPStatus, number>;

// Team type for calendar filtering
export interface TeamWithDivision {
  id: string;
  name: string;
  division?: {
    id: string;
    name: string;
  } | null;
}

// Division type for calendar filtering
export interface Division {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Unified calendar feed (Tier 2 W1)
//
// CalendarItem rows are produced server-side by
// `getUserCalendarItems` (lib/data/calendar.ts) with all dates ISO-serialized.
// The types and scope helpers below are pure and prisma-free so Client
// Components (CalendarView) can import them without pulling in server code.
// ---------------------------------------------------------------------------

export type CalendarSource = "event" | "practice" | "signup" | "venue-block";

export interface CalendarItemScope {
  teamId?: string;
  teamName?: string;
  leagueId?: string;
  leagueName?: string;
  venueId?: string;
  venueName?: string;
}

export interface CalendarItem {
  id: string;
  source: CalendarSource;
  title: string;
  startAt: string; // ISO string
  endAt: string | null; // ISO string, null when the source has no end time
  /** IANA zone the item's wall-clock times were entered in (when the source tracks one). */
  timezone?: string;
  scope: CalendarItemScope;
  /** Existing detail route for the item (e.g. /events/[id]). */
  href: string;
  /** Source-specific subtype: EventType, SignupEventCategory, or venue activity type. */
  eventType?: string;
}

export type CalendarScopeKind = "team" | "league" | "venue";

export interface CalendarScopeOption {
  kind: CalendarScopeKind;
  id: string;
  name: string;
}

/**
 * Distinct team/league/venue scopes present in a calendar feed, for overlay
 * filter chips. Ordered by kind (team, league, venue — alphabetical) then name.
 */
export function deriveCalendarScopes(items: CalendarItem[]): CalendarScopeOption[] {
  const kindOrder: Record<CalendarScopeKind, number> = { team: 0, league: 1, venue: 2 };
  const options = new Map<string, CalendarScopeOption>();

  for (const { scope } of items) {
    if (scope.teamId) {
      options.set(`team:${scope.teamId}`, {
        kind: "team",
        id: scope.teamId,
        name: scope.teamName ?? "Team",
      });
    }
    if (scope.leagueId) {
      options.set(`league:${scope.leagueId}`, {
        kind: "league",
        id: scope.leagueId,
        name: scope.leagueName ?? "League",
      });
    }
    if (scope.venueId) {
      options.set(`venue:${scope.venueId}`, {
        kind: "venue",
        id: scope.venueId,
        name: scope.venueName ?? "Venue",
      });
    }
  }

  return [...options.values()].sort(
    (a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.name.localeCompare(b.name)
  );
}

/** Whether a calendar item belongs to the given team/league/venue scope. */
export function calendarItemMatchesScope(
  item: CalendarItem,
  scope: Pick<CalendarScopeOption, "kind" | "id">
): boolean {
  switch (scope.kind) {
    case "team":
      return item.scope.teamId === scope.id;
    case "league":
      return item.scope.leagueId === scope.id;
    case "venue":
      return item.scope.venueId === scope.id;
  }
}
