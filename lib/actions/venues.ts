"use server";

import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import {
  createVenueSchema,
  updateVenueSchema,
  venueAvailabilitySchema,
  type CreateVenueInput,
  type UpdateVenueInput,
  type VenueAvailabilityInput,
} from "@/lib/utils/validation";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

/**
 * Create a new venue
 */
export async function createVenue(
  input: CreateVenueInput
): Promise<
  ActionResult<{
    id: string;
    name: string;
    visibility: string;
  }>
> {
  try {
    const validated = createVenueSchema.parse(input);
    const userId = await requireUserId();

    // Verify ownership authorization
    if (validated.visibility === "TEAM" && validated.teamId) {
      const membership = await prisma.teamMember.findUnique({
        where: { userId_teamId: { userId, teamId: validated.teamId } },
      });
      if (!membership || membership.role !== "ADMIN") {
        return { success: false, error: "You must be a team admin to create team venues" };
      }
    }

    if (validated.visibility === "LEAGUE" && validated.leagueId) {
      const leagueUser = await prisma.leagueUser.findUnique({
        where: { userId_leagueId: { userId, leagueId: validated.leagueId } },
      });
      if (!leagueUser || leagueUser.role !== "LEAGUE_ADMIN") {
        return { success: false, error: "You must be a league admin to create league venues" };
      }
    }

    const venue = await prisma.venue.create({
      data: {
        name: validated.name,
        address: validated.address || null,
        city: validated.city || null,
        state: validated.state || null,
        zipCode: validated.zipCode || null,
        surfaceType: validated.surfaceType,
        capacity: validated.capacity ?? null,
        amenities: validated.amenities,
        phone: validated.phone || null,
        website: validated.website || null,
        notes: validated.notes || null,
        visibility: validated.visibility,
        teamId: validated.visibility === "TEAM" ? (validated.teamId || null) : null,
        leagueId: validated.visibility === "LEAGUE" ? (validated.leagueId || null) : null,
        createdById: userId,
      },
    });

    revalidatePath("/venues");

    return {
      success: true,
      data: { id: venue.id, name: venue.name, visibility: venue.visibility },
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to create venue. Please try again." };
  }
}

/**
 * Update an existing venue
 */
export async function updateVenue(
  input: UpdateVenueInput
): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    const validated = updateVenueSchema.parse(input);
    const userId = await requireUserId();

    // Verify the venue exists and user has permission
    const existing = await prisma.venue.findUnique({
      where: { id: validated.id },
    });
    if (!existing) {
      return { success: false, error: "Venue not found" };
    }

    const canEdit = await canUserEditVenue(userId, existing);
    if (!canEdit) {
      return { success: false, error: "You don't have permission to edit this venue" };
    }

    const venue = await prisma.venue.update({
      where: { id: validated.id },
      data: {
        name: validated.name,
        address: validated.address || null,
        city: validated.city || null,
        state: validated.state || null,
        zipCode: validated.zipCode || null,
        surfaceType: validated.surfaceType,
        capacity: validated.capacity ?? null,
        amenities: validated.amenities,
        phone: validated.phone || null,
        website: validated.website || null,
        notes: validated.notes || null,
        visibility: validated.visibility,
        teamId: validated.visibility === "TEAM" ? (validated.teamId || null) : null,
        leagueId: validated.visibility === "LEAGUE" ? (validated.leagueId || null) : null,
      },
    });

    revalidatePath("/venues");
    revalidatePath(`/venues/${venue.id}`);

    return { success: true, data: { id: venue.id, name: venue.name } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to update venue. Please try again." };
  }
}

/**
 * Delete a venue (soft-delete if events exist, hard-delete otherwise)
 */
export async function deleteVenue(
  venueId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const userId = await requireUserId();

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      include: { _count: { select: { events: true } } },
    });
    if (!venue) {
      return { success: false, error: "Venue not found" };
    }

    const canEdit = await canUserEditVenue(userId, venue);
    if (!canEdit) {
      return { success: false, error: "You don't have permission to delete this venue" };
    }

    if (venue._count.events > 0) {
      // Soft-delete: deactivate venue but keep it for historical event references
      await prisma.venue.update({
        where: { id: venueId },
        data: { isActive: false },
      });
    } else {
      await prisma.venue.delete({ where: { id: venueId } });
    }

    revalidatePath("/venues");
    return { success: true, data: { id: venueId } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to delete venue. Please try again." };
  }
}

/**
 * Get a single venue with upcoming events count
 */
export async function getVenue(venueId: string) {
  const userId = await requireUserId();

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    include: {
      team: { select: { id: true, name: true } },
      league: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      _count: {
        select: {
          events: {
            where: { startAt: { gte: new Date() } },
          },
        },
      },
    },
  });

  if (!venue) return null;

  // Check visibility access
  const hasAccess = await canUserAccessVenue(userId, venue);
  if (!hasAccess) return null;

  return venue;
}

/**
 * List venues the user can access, with optional filters
 */
export async function getAvailableVenues(filters?: {
  surfaceType?: string;
  city?: string;
  search?: string;
  includeInactive?: boolean;
}) {
  const userId = await requireUserId();

  // Get user's team and league memberships for visibility filtering
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    select: { teamId: true, team: { select: { leagueId: true } } },
  });

  const teamIds = memberships.map((m) => m.teamId);
  const leagueIds = memberships
    .map((m) => m.team.leagueId)
    .filter((id): id is string => id !== null);

  // Build visibility filter: PUBLIC + user's leagues + user's teams
  const visibilityFilter = [
    { visibility: "PUBLIC" as const },
    ...(leagueIds.length > 0
      ? [{ visibility: "LEAGUE" as const, leagueId: { in: leagueIds } }]
      : []),
    ...(teamIds.length > 0
      ? [{ visibility: "TEAM" as const, teamId: { in: teamIds } }]
      : []),
  ];

  if (filters?.search) {
    const venues = await prisma.venue.findMany({
      where: {
        AND: [
          { OR: visibilityFilter },
          ...(filters.includeInactive ? [] : [{ isActive: true }]),
          ...(filters.surfaceType ? [{ surfaceType: filters.surfaceType as "ICE" | "TURF" | "COURT" | "FIELD" | "OTHER" }] : []),
          ...(filters.city ? [{ city: { contains: filters.city, mode: "insensitive" as const } }] : []),
          {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" as const } },
              { address: { contains: filters.search, mode: "insensitive" as const } },
              { city: { contains: filters.search, mode: "insensitive" as const } },
            ],
          },
        ],
      },
      orderBy: { name: "asc" },
      include: {
        team: { select: { id: true, name: true } },
        league: { select: { id: true, name: true } },
      },
    });
    return venues;
  }

  const venues = await prisma.venue.findMany({
    where: {
      AND: [
        { OR: visibilityFilter },
        ...(filters?.includeInactive ? [] : [{ isActive: true }]),
        ...(filters?.surfaceType ? [{ surfaceType: filters.surfaceType as "ICE" | "TURF" | "COURT" | "FIELD" | "OTHER" }] : []),
        ...(filters?.city ? [{ city: { contains: filters.city, mode: "insensitive" as const } }] : []),
      ],
    },
    orderBy: { name: "asc" },
    include: {
      team: { select: { id: true, name: true } },
      league: { select: { id: true, name: true } },
    },
  });

  return venues;
}

/**
 * Check venue availability for a given time range.
 * Returns conflicting events if any.
 */
export async function checkVenueAvailability(
  input: VenueAvailabilityInput
): Promise<
  ActionResult<{
    available: boolean;
    conflicts: Array<{
      id: string;
      title: string;
      startAt: Date;
      endAt: Date | null;
      teamName: string;
    }>;
  }>
> {
  try {
    const validated = venueAvailabilitySchema.parse(input);
    await requireUserId();

    const conflicts = await findVenueConflicts(
      validated.venueId,
      validated.startAt,
      validated.endAt,
      validated.excludeEventId
    );

    return {
      success: true,
      data: {
        available: conflicts.length === 0,
        conflicts,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to check venue availability." };
  }
}

/**
 * Find conflicting events at a venue for a given time range.
 * Two events conflict when: newStart < existingEnd AND newEnd > existingStart
 */
export async function findVenueConflicts(
  venueId: string,
  startAt: Date,
  endAt: Date,
  excludeEventId?: string
): Promise<
  Array<{
    id: string;
    title: string;
    startAt: Date;
    endAt: Date | null;
    teamName: string;
  }>
> {
  const conflicts = await prisma.event.findMany({
    where: {
      venueId,
      ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
      // Overlap check: new event's start is before existing end, AND new event's end is after existing start
      AND: [
        {
          OR: [
            // Existing event has endAt: standard overlap check
            {
              endAt: { not: null },
              startAt: { lt: endAt },
            },
            // Existing event has no endAt: treat as point-in-time, conflict if within our range
            {
              endAt: null,
              startAt: { gte: startAt, lt: endAt },
            },
          ],
        },
        {
          OR: [
            { endAt: { gt: startAt } },
            { endAt: null, startAt: { gte: startAt } },
          ],
        },
      ],
    },
    select: {
      id: true,
      title: true,
      startAt: true,
      endAt: true,
      team: { select: { name: true } },
    },
    orderBy: { startAt: "asc" },
  });

  return conflicts.map((c) => ({
    id: c.id,
    title: c.title,
    startAt: c.startAt,
    endAt: c.endAt,
    teamName: c.team.name,
  }));
}

// --- Helper functions ---

async function canUserEditVenue(
  userId: string,
  venue: { createdById: string; visibility: string; teamId: string | null; leagueId: string | null }
): Promise<boolean> {
  // Creator can always edit
  if (venue.createdById === userId) return true;

  // Team admin can edit TEAM venues
  if (venue.visibility === "TEAM" && venue.teamId) {
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId, teamId: venue.teamId } },
    });
    if (membership?.role === "ADMIN") return true;
  }

  // League admin can edit LEAGUE venues
  if (venue.visibility === "LEAGUE" && venue.leagueId) {
    const leagueUser = await prisma.leagueUser.findUnique({
      where: { userId_leagueId: { userId, leagueId: venue.leagueId } },
    });
    if (leagueUser?.role === "LEAGUE_ADMIN") return true;
  }

  return false;
}

async function canUserAccessVenue(
  userId: string,
  venue: { visibility: string; teamId: string | null; leagueId: string | null }
): Promise<boolean> {
  if (venue.visibility === "PUBLIC") return true;

  if (venue.visibility === "TEAM" && venue.teamId) {
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId, teamId: venue.teamId } },
    });
    return !!membership;
  }

  if (venue.visibility === "LEAGUE" && venue.leagueId) {
    const leagueUser = await prisma.leagueUser.findUnique({
      where: { userId_leagueId: { userId, leagueId: venue.leagueId } },
    });
    return !!leagueUser;
  }

  return false;
}
