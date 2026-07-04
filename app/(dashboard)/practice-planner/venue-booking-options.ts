import { prisma } from "@/lib/db/prisma";
import { getAvailableVenues } from "@/lib/actions/venues";
import type { VenueBookingOption } from "@/components/features/practice-planner/PracticeSessionEditor";

/**
 * Venue/surface/segment option data for the practice editor's optional
 * "Ice Booking" section (feature 006, FR-019). Loaded server-side by the
 * new/edit practice pages, mirroring how the season detail page builds
 * surfacesByVenue/segmentsBySurface for GameForm.
 */
export interface VenueBookingOptions {
  venues: VenueBookingOption[];
  /** Active surfaces per venue id. */
  surfacesByVenue: Record<string, Array<{ id: string; name: string }>>;
  /** Active segments per surface id. */
  segmentsBySurface: Record<string, Array<{ id: string; name: string }>>;
  /** Display name of the implicit whole-surface option per surface ("Full ice"). */
  wholeLabelBySurface: Record<string, string>;
}

export async function getVenueBookingOptions(): Promise<VenueBookingOptions> {
  // Venues visible to the user (PUBLIC + their leagues/teams).
  const venueRows = await getAvailableVenues();
  const venues = venueRows.map((venue) => ({
    id: venue.id,
    name: venue.name,
    timezone: venue.timezone,
  }));

  const surfaces = venues.length
    ? await prisma.iceSurface.findMany({
        where: { venueId: { in: venues.map((venue) => venue.id) }, isActive: true },
        select: { id: true, name: true, venueId: true, wholeLabel: true },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      })
    : [];
  const surfacesByVenue: Record<string, Array<{ id: string; name: string }>> = {};
  const wholeLabelBySurface: Record<string, string> = {};
  for (const surface of surfaces) {
    (surfacesByVenue[surface.venueId] ??= []).push({ id: surface.id, name: surface.name });
    if (surface.wholeLabel) {
      wholeLabelBySurface[surface.id] = surface.wholeLabel;
    }
  }

  const segments = surfaces.length
    ? await prisma.surfaceSegment.findMany({
        where: { surfaceId: { in: surfaces.map((surface) => surface.id) }, isActive: true },
        select: { id: true, name: true, surfaceId: true },
        orderBy: { name: "asc" },
      })
    : [];
  const segmentsBySurface: Record<string, Array<{ id: string; name: string }>> = {};
  for (const segment of segments) {
    (segmentsBySurface[segment.surfaceId] ??= []).push({ id: segment.id, name: segment.name });
  }

  return { venues, surfacesByVenue, segmentsBySurface, wholeLabelBySurface };
}
