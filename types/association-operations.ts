/**
 * Association operations view contracts.
 *
 * VenueReservation is named explicitly throughout this module to preserve the
 * boundary from the existing GearReservation custody workflow.
 */
export const VENUE_RESERVATION_VIEW_STATUSES = [
  "HELD",
  "CONFIRMED",
  "RELEASED",
  "CANCELED",
  "COMPLETED",
] as const;
export type VenueReservationViewStatus =
  (typeof VENUE_RESERVATION_VIEW_STATUSES)[number];

export type VenueReservationUsageViewStatus = "PENDING" | "USED" | "UNUSED";
export type VenueReservationOwnerType =
  | "ASSOCIATION"
  | "TEAM"
  | "VENUE_ORGANIZATION";

export interface VenueReservationOwnerView {
  type: VenueReservationOwnerType;
  id: string;
  name: string;
}

export interface VenueReservationSpaceView {
  venueId: string;
  venueName: string;
  surfaceId: string | null;
  surfaceName: string | null;
  segmentId: string | null;
  segmentName: string | null;
}

export interface VenueReservationView {
  id: string;
  canonicalScheduleId: `reservation:${string}`;
  status: VenueReservationViewStatus;
  usageStatus: VenueReservationUsageViewStatus;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  space: VenueReservationSpaceView;
  owner: VenueReservationOwnerView;
  sourceRequestId: string | null;
  offeringBlockId: string | null;
  heldUntil: Date | null;
  assigned: boolean;
}

export interface PublicVenueReservationOccupancyView {
  startsAt: Date;
  endsAt: Date;
}

export interface VenueReservationConflictView {
  id: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  venueId: string;
  surfaceId: string | null;
  segmentId: string | null;
  status: "HELD" | "CONFIRMED" | "COMPLETED";
  owner?: VenueReservationOwnerView;
  sourceRequestId?: string | null;
}

export type VenueReservationScheduleSource =
  | "venueReservation"
  | "event"
  | "seasonGame"
  | "eventGame"
  | "signupEvent"
  | "practice";

export interface AssociationScheduleItemView {
  id: string;
  canonicalScheduleId: string;
  venueReservationId: string | null;
  source: VenueReservationScheduleSource;
  sourceId: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
  venueId: string | null;
  surfaceId: string | null;
  segmentId: string | null;
  /** Participant-facing Event/RSVP destination when one exists. */
  href?: string | null;
  eventType?: string | null;
  location?: string | null;
  opponent?: string | null;
  notes?: string | null;
  updatedAt?: Date | null;
  teamId?: string | null;
  teamName?: string | null;
  divisionName?: string | null;
  homeTeam?: { id: string; name: string } | null;
  awayTeam?: { id: string; name: string } | null;
  venueName?: string | null;
  leagueId?: string | null;
  leagueName?: string | null;
}

export interface AssociationOperationsSummaryView {
  pendingVenueRequestCount: number;
  unassignedVenueReservationCount: number;
  conflictCount: number;
  volunteerShortageCount: number;
  urgentGearNeedCount: number;
  overdueGearCustodyCount: number;
  gearOutboxBacklogged: boolean;
}

export interface AssociationUtilizationView {
  reservedMinutes: number;
  assignedMinutes: number;
  usedMinutes: number;
  unusedMinutes: number;
  releasedMinutes: number;
  canceledMinutes: number;
}
