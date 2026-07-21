"use server";

import { prisma } from "@/lib/db/prisma";
import {
  hasVenueStaffRole,
  requireUserId,
  requireVenueProfileManager,
  VENUE_PROFILE_ROLES,
} from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import type { SurfaceType } from "@prisma/client";
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

    if (validated.organizationId) {
      await requireVenueProfileManager(validated.organizationId);
    }

    // Verify ownership authorization
    if (validated.visibility === "TEAM" && validated.teamId) {
      const membership = await prisma.teamMember.findUnique({
        where: { userId_teamId: { userId, teamId: validated.teamId } },
        select: { role: true },
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
        organizationId: validated.organizationId || null,
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

    if (validated.organizationId && validated.organizationId !== existing.organizationId) {
      await requireVenueProfileManager(validated.organizationId);
    }

    // If visibility is changing, validate authorization for the new scope
    if (validated.visibility === "TEAM" && validated.teamId && validated.teamId !== existing.teamId) {
      const membership = await prisma.teamMember.findUnique({
        where: { userId_teamId: { userId, teamId: validated.teamId } },
        select: { role: true },
      });
      if (!membership || membership.role !== "ADMIN") {
        return { success: false, error: "You must be a team admin to assign venues to that team" };
      }
    }
    if (validated.visibility === "LEAGUE" && validated.leagueId && validated.leagueId !== existing.leagueId) {
      const leagueUser = await prisma.leagueUser.findUnique({
        where: { userId_leagueId: { userId, leagueId: validated.leagueId } },
      });
      if (!leagueUser || leagueUser.role !== "LEAGUE_ADMIN") {
        return { success: false, error: "You must be a league admin to assign venues to that league" };
      }
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
        // Only write organizationId when the caller explicitly provided it.
        // The standard edit form never sends the field; writing
        // `validated.organizationId || null` unconditionally silently
        // detached org-owned venues from their organization on every save.
        ...(Object.prototype.hasOwnProperty.call(input, "organizationId")
          ? { organizationId: validated.organizationId || null }
          : {}),
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
          events: true,
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

  // Also get direct league memberships (for league-only users)
  const leagueUsers = await prisma.leagueUser.findMany({
    where: { userId },
    select: { leagueId: true },
  });

  const teamIds = memberships.map((m) => m.teamId);
  const leagueIdsFromTeams = memberships
    .map((m) => m.team.leagueId)
    .filter((id): id is string => id !== null);
  const leagueIdsFromDirect = leagueUsers.map((lu) => lu.leagueId);
  const leagueIds = [...new Set([...leagueIdsFromTeams, ...leagueIdsFromDirect])];

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
          ...(filters.surfaceType ? [{ surfaceType: filters.surfaceType as SurfaceType }] : []),
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
        ...(filters?.surfaceType ? [{ surfaceType: filters.surfaceType as SurfaceType }] : []),
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
    const userId = await requireUserId();

    // Verify the user has access to this venue before revealing scheduling details
    const venue = await prisma.venue.findUnique({
      where: { id: validated.venueId },
    });
    if (!venue) {
      return { success: false, error: "Venue not found" };
    }
    const hasAccess = await canUserAccessVenue(userId, venue);
    if (!hasAccess) {
      return { success: false, error: "You don't have access to this venue" };
    }

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
 *
 * Module-private: NOT exported. In a "use server" file every exported async
 * function is a client-callable RPC endpoint; exporting this leaked private
 * venue schedules (event titles, team names, times) to anyone. The only
 * caller is checkVenueAvailability below, which authenticates + authorizes.
 */
async function findVenueConflicts(
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

/**
 * Check if the current user can edit a given venue, and get upcoming events at it.
 * Used by venue detail and edit pages.
 */
export async function getVenuePageData(venueId: string): Promise<{
  venue: Awaited<ReturnType<typeof getVenue>>;
  canEdit: boolean;
  upcomingEvents: Array<{
    id: string;
    title: string;
    startAt: string;
    type: string;
    team: { name: string };
  }>;
} | null> {
  const userId = await requireUserId();
  const venue = await getVenue(venueId);
  if (!venue) return null;

  const canEdit = await canUserEditVenue(userId, venue);

  const upcomingEventsRaw = await prisma.event.findMany({
    where: {
      venueId,
      startAt: { gte: new Date() },
    },
    select: {
      id: true,
      title: true,
      startAt: true,
      type: true,
      team: { select: { name: true } },
    },
    orderBy: { startAt: "asc" },
    take: 10,
  });

  const upcomingEvents = upcomingEventsRaw.map((e) => ({
    ...e,
    startAt: e.startAt.toISOString(),
  }));

  return { venue, canEdit, upcomingEvents };
}

/**
 * Get the context needed for the new/edit venue form:
 * teams and leagues the user admins.
 * Returns null if the user has no admin access.
 */
export async function getVenueFormContext(): Promise<{
  teams: Array<{ id: string; name: string; leagueId: string | null }>;
  leagues: Array<{ id: string; name: string }>;
} | null> {
  const userId = await requireUserId();

  const [memberships, leagueUsers] = await Promise.all([
    prisma.teamMember.findMany({
      where: { userId, role: "ADMIN" },
      select: { team: { select: { id: true, name: true, leagueId: true } } },
    }),
    prisma.leagueUser.findMany({
      where: { userId, role: "LEAGUE_ADMIN" },
      select: { league: { select: { id: true, name: true } } },
    }),
  ]);

  if (memberships.length === 0 && leagueUsers.length === 0) return null;

  return {
    teams: memberships.map((m) => m.team),
    leagues: leagueUsers.map((lu) => lu.league),
  };
}

/**
 * Check access to the venues list page — returns isAdmin flag or null if no membership.
 */
export async function getVenuesPageAccess(): Promise<{ isAdmin: boolean } | null> {
  const userId = await requireUserId();

  const [membership, leagueUser] = await Promise.all([
    prisma.teamMember.findFirst({ where: { userId }, select: { role: true } }),
    prisma.leagueUser.findFirst({ where: { userId }, select: { role: true } }),
  ]);

  if (!membership && !leagueUser) return null;

  return {
    isAdmin: membership?.role === "ADMIN" || leagueUser?.role === "LEAGUE_ADMIN",
  };
}

// --- Helper functions ---

async function canUserEditVenue(
  userId: string,
  venue: {
    id: string;
    createdById: string;
    visibility: string;
    teamId: string | null;
    leagueId: string | null;
    organizationId?: string | null;
  }
): Promise<boolean> {
  // Creator can always edit
  if (venue.createdById === userId) return true;

  if (venue.organizationId) {
    const canManageVenue = await hasVenueStaffRole(
      userId,
      venue.organizationId,
      VENUE_PROFILE_ROLES,
      venue.id
    );
    if (canManageVenue) return true;
  }

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

export async function canUserAccessVenue(
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
