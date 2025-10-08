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
  }>;
}

export type EventType = "GAME" | "PRACTICE";

export type RSVPStatus = "GOING" | "NOT_GOING" | "MAYBE" | "NO_RESPONSE";

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
