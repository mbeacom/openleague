/**
 * Shared event types for calendar and event management
 */

export interface Event {
  id: string;
  type: "GAME" | "PRACTICE";
  title: string;
  startAt: string; // ISO string from server component
  location: string;
  opponent: string | null;
  notes?: string | null;
}

export type EventType = "GAME" | "PRACTICE";
