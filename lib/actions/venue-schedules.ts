"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireVenueScheduleManager } from "@/lib/auth/session";
import { logVenueActivity, type ActionResult } from "@/lib/actions/venue-organizations";
import { publicPublishedVenueWhere } from "@/lib/utils/public-venues";
import {
  createIceSurfaceSchema,
  updateIceSurfaceSchema,
  venueOperatingHourSchema,
  venueScheduleBlockSchema,
  type CreateIceSurfaceInput,
  type UpdateIceSurfaceInput,
  type VenueOperatingHourInput,
  type VenueScheduleBlockInput,
} from "@/lib/utils/validation";
import { findBookingConflicts } from "@/lib/utils/availability";
import { expandRecurrenceWindow } from "@/lib/utils/venue-schedule";
import type { BookingConflict, VenueBookingView } from "@/types/segments";

type VenueContext = {
  id: string;
  organizationId: string | null;
  slug: string | null;
};

/**
 * Friendly, user-facing failure raised inside actions; its message is safe
 * to return to the client (arbitrary thrown errors map to a generic
 * fallback instead).
 */
class ScheduleActionError extends Error {}

/**
 * Optional segment reference for schedule blocks (feature 006). Kept
 * alongside — not inside — `venueScheduleBlockSchema` so existing callers
 * without a segment keep working; empty string and null both mean
 * "whole surface".
 */
const blockSegmentInputSchema = z.object({
  segmentId: z
    .union([z.string().cuid("Invalid segment ID format"), z.literal(""), z.null()])
    .optional(),
});

/** Conservative expansion caps for recurring-block conflict checks. */
const MAX_RECURRENCE_CONFLICT_OCCURRENCES = 8;
const RECURRENCE_HORIZON_MS = 366 * 24 * 60 * 60 * 1000;

const scheduleBlockIdSchema = venueScheduleBlockSchema.extend({
  scheduleBlockId: createIceSurfaceSchema.shape.venueId,
});

const scheduleBlockCommandSchema = createIceSurfaceSchema.pick({
  organizationId: true,
  venueId: true,
}).extend({
  scheduleBlockId: createIceSurfaceSchema.shape.venueId,
});

const surfaceCommandSchema = createIceSurfaceSchema.pick({
  organizationId: true,
  venueId: true,
}).extend({
  surfaceId: updateIceSurfaceSchema.shape.surfaceId,
});

const operatingHourCommandSchema = createIceSurfaceSchema.pick({
  organizationId: true,
  venueId: true,
}).extend({
  operatingHourId: createIceSurfaceSchema.shape.venueId,
});

export async function getVenueScheduleAdminData(
  organizationId: string,
  venueId: string
): Promise<
  ActionResult<{
    venueId: string;
    surfaces: Array<{
      id: string;
      name: string;
      surfaceType: string;
      isActive: boolean;
      isDefault: boolean;
      displayOrder: number;
    }>;
    operatingHours: Array<{
      id: string;
      dayOfWeek: number;
      opensAt: string;
      closesAt: string;
      status: string;
      surfaceId: string | null;
    }>;
    scheduleBlocks: Array<{
      id: string;
      title: string;
      startsAt: Date;
      endsAt: Date;
      activityType: string;
      status: string;
      surfaceId: string | null;
    }>;
  }>
> {
  try {
    await requireVenueScheduleManager(organizationId, venueId);
    await ensureVenueContext(organizationId, venueId);

    const [surfaces, operatingHours, scheduleBlocks] = await Promise.all([
      prisma.iceSurface.findMany({
        where: { venueId },
        select: {
          id: true,
          name: true,
          surfaceType: true,
          isActive: true,
          isDefault: true,
          displayOrder: true,
        },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      }),
      prisma.venueOperatingHour.findMany({
        where: { venueId },
        select: {
          id: true,
          dayOfWeek: true,
          opensAt: true,
          closesAt: true,
          status: true,
          surfaceId: true,
        },
        orderBy: [{ dayOfWeek: "asc" }, { opensAt: "asc" }],
      }),
      prisma.venueScheduleBlock.findMany({
        where: { venueId, status: { not: "ARCHIVED" } },
        select: {
          id: true,
          title: true,
          startsAt: true,
          endsAt: true,
          activityType: true,
          status: true,
          surfaceId: true,
        },
        orderBy: { startsAt: "asc" },
      }),
    ]);

    return { success: true, data: { venueId, surfaces, operatingHours, scheduleBlocks } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to load venue schedule data." };
  }
}

export async function createIceSurface(
  input: CreateIceSurfaceInput
): Promise<ActionResult<{ surfaceId: string; venueId: string }>> {
  try {
    const validated = createIceSurfaceSchema.parse(input);
    const userId = await requireVenueScheduleManager(validated.organizationId, validated.venueId);
    await ensureVenueContext(validated.organizationId, validated.venueId);

    const surface = await prisma.iceSurface.create({
      data: {
        venueId: validated.venueId,
        name: validated.name,
        surfaceType: validated.surfaceType,
        capacity: validated.capacity ?? null,
        isDefault: validated.isDefault,
        isActive: validated.isActive,
        displayOrder: validated.displayOrder,
        notes: validated.notes || null,
      },
      select: { id: true, venueId: true, name: true },
    });

    await logVenueActivity({
      venueId: validated.venueId,
      actorId: userId,
      action: "ICE_SURFACE_CREATED",
      resourceType: "IceSurface",
      resourceId: surface.id,
      summary: `Created surface ${surface.name}`,
    });
    revalidateVenueSchedule(validated.organizationId, validated.venueId);

    return { success: true, data: { surfaceId: surface.id, venueId: surface.venueId } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to create ice surface." };
  }
}

export async function updateIceSurface(
  input: UpdateIceSurfaceInput
): Promise<ActionResult<{ surfaceId: string; venueId: string }>> {
  try {
    const validated = updateIceSurfaceSchema.parse(input);
    const userId = await requireVenueScheduleManager(validated.organizationId, validated.venueId);
    await ensureVenueContext(validated.organizationId, validated.venueId);

    const surface = await prisma.iceSurface.update({
      where: { id: validated.surfaceId, venueId: validated.venueId },
      data: {
        name: validated.name,
        surfaceType: validated.surfaceType,
        capacity: validated.capacity ?? null,
        isDefault: validated.isDefault,
        isActive: validated.isActive,
        displayOrder: validated.displayOrder,
        notes: validated.notes || null,
      },
      select: { id: true, venueId: true, name: true },
    });

    await logVenueActivity({
      venueId: validated.venueId,
      actorId: userId,
      action: "ICE_SURFACE_UPDATED",
      resourceType: "IceSurface",
      resourceId: surface.id,
      summary: `Updated surface ${surface.name}`,
    });
    revalidateVenueSchedule(validated.organizationId, validated.venueId);

    return { success: true, data: { surfaceId: surface.id, venueId: surface.venueId } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to update ice surface." };
  }
}

export async function archiveIceSurface(input: {
  organizationId: string;
  venueId: string;
  surfaceId: string;
}): Promise<ActionResult<{ surfaceId: string; venueId: string }>> {
  try {
    const validated = surfaceCommandSchema.parse(input);
    const userId = await requireVenueScheduleManager(validated.organizationId, validated.venueId);
    await ensureVenueContext(validated.organizationId, validated.venueId);

    const existing = await prisma.iceSurface.findFirst({
      where: { id: validated.surfaceId, venueId: validated.venueId },
      select: { id: true },
    });
    if (!existing) {
      return { success: false, error: "Surface not found" };
    }

    // FR-007: archiving a surface with future bookings is refused with the
    // list. Calendar Events are venue-wide (they never reference a surface),
    // so the four surface-capable sources are checked.
    const futureBookings = await findFutureSurfaceBookings(validated.surfaceId);
    if (futureBookings.length > 0) {
      return {
        success: false,
        error:
          "This surface has upcoming bookings and cannot be archived. Move or cancel them first.",
        details: { futureBookings },
      };
    }

    const surface = await prisma.iceSurface.update({
      where: { id: validated.surfaceId, venueId: validated.venueId },
      data: { isActive: false },
      select: { id: true, venueId: true },
    });

    await logVenueActivity({
      venueId: validated.venueId,
      actorId: userId,
      action: "ICE_SURFACE_ARCHIVED",
      resourceType: "IceSurface",
      resourceId: surface.id,
      summary: "Archived ice surface",
    });
    revalidateVenueSchedule(validated.organizationId, validated.venueId);

    return { success: true, data: { surfaceId: surface.id, venueId: surface.venueId } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to archive ice surface." };
  }
}

export async function setOperatingHours(
  input: VenueOperatingHourInput
): Promise<ActionResult<{ operatingHourId: string; venueId: string }>> {
  try {
    const validated = venueOperatingHourSchema.parse(input);
    const userId = await requireVenueScheduleManager(validated.organizationId, validated.venueId);
    await ensureVenueContext(validated.organizationId, validated.venueId);

    const conflict = await prisma.venueOperatingHour.findFirst({
      where: {
        venueId: validated.venueId,
        surfaceId: validated.surfaceId || null,
        dayOfWeek: validated.dayOfWeek,
        ...(validated.effectiveEndDate
          ? { effectiveStartDate: { lte: validated.effectiveEndDate } }
          : {}),
        OR: [
          { effectiveEndDate: null },
          { effectiveEndDate: { gte: validated.effectiveStartDate } },
        ],
      },
      select: { id: true },
    });

    if (conflict) {
      return { success: false, error: "Operating hours overlap an existing rule for this day and surface." };
    }

    const operatingHour = await prisma.venueOperatingHour.create({
      data: {
        venueId: validated.venueId,
        surfaceId: validated.surfaceId || null,
        dayOfWeek: validated.dayOfWeek,
        opensAt: validated.opensAt,
        closesAt: validated.closesAt,
        effectiveStartDate: validated.effectiveStartDate,
        effectiveEndDate: validated.effectiveEndDate ?? null,
        status: validated.status,
        label: validated.label || null,
        notes: validated.notes || null,
      },
      select: { id: true, venueId: true },
    });

    await logVenueActivity({
      venueId: validated.venueId,
      actorId: userId,
      action: "OPERATING_HOURS_SET",
      resourceType: "VenueOperatingHour",
      resourceId: operatingHour.id,
      summary: "Set operating hours",
    });
    revalidateVenueSchedule(validated.organizationId, validated.venueId);

    return { success: true, data: { operatingHourId: operatingHour.id, venueId: operatingHour.venueId } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to set operating hours." };
  }
}

export async function updateOperatingHours(
  input: VenueOperatingHourInput & { operatingHourId: string }
): Promise<ActionResult<{ operatingHourId: string; venueId: string }>> {
  try {
    const command = operatingHourCommandSchema.parse(input);
    const validated = venueOperatingHourSchema.parse(input);
    const userId = await requireVenueScheduleManager(validated.organizationId, validated.venueId);
    await ensureVenueContext(validated.organizationId, validated.venueId);

    const operatingHour = await prisma.venueOperatingHour.update({
      where: { id: command.operatingHourId, venueId: validated.venueId },
      data: {
        surfaceId: validated.surfaceId || null,
        dayOfWeek: validated.dayOfWeek,
        opensAt: validated.opensAt,
        closesAt: validated.closesAt,
        effectiveStartDate: validated.effectiveStartDate,
        effectiveEndDate: validated.effectiveEndDate ?? null,
        status: validated.status,
        label: validated.label || null,
        notes: validated.notes || null,
      },
      select: { id: true, venueId: true },
    });

    await logVenueActivity({
      venueId: validated.venueId,
      actorId: userId,
      action: "OPERATING_HOURS_UPDATED",
      resourceType: "VenueOperatingHour",
      resourceId: operatingHour.id,
      summary: "Updated operating hours",
    });
    revalidateVenueSchedule(validated.organizationId, validated.venueId);

    return { success: true, data: { operatingHourId: operatingHour.id, venueId: operatingHour.venueId } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to update operating hours." };
  }
}

export async function deleteOperatingHours(input: {
  organizationId: string;
  venueId: string;
  operatingHourId: string;
}): Promise<ActionResult<{ operatingHourId: string }>> {
  try {
    const validated = operatingHourCommandSchema.parse(input);
    const userId = await requireVenueScheduleManager(validated.organizationId, validated.venueId);
    await ensureVenueContext(validated.organizationId, validated.venueId);

    await prisma.venueOperatingHour.delete({
      where: { id: validated.operatingHourId, venueId: validated.venueId },
    });

    await logVenueActivity({
      venueId: validated.venueId,
      actorId: userId,
      action: "OPERATING_HOURS_DELETED",
      resourceType: "VenueOperatingHour",
      resourceId: validated.operatingHourId,
      summary: "Deleted operating hours",
    });
    revalidateVenueSchedule(validated.organizationId, validated.venueId);

    return { success: true, data: { operatingHourId: validated.operatingHourId } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to delete operating hours." };
  }
}

export async function createScheduleBlock(
  input: VenueScheduleBlockInput & { segmentId?: string | null }
): Promise<ActionResult<{ scheduleBlockId: string; status: string }>> {
  try {
    const validated = venueScheduleBlockSchema.parse(input);
    const rawSegment = blockSegmentInputSchema.parse(input);
    const userId = await requireVenueScheduleManager(validated.organizationId, validated.venueId);
    const venue = await ensureVenueContext(validated.organizationId, validated.venueId);
    const segmentId = await resolveBlockSegment(
      validated.venueId,
      validated.surfaceId || null,
      rawSegment.segmentId || null
    );
    const conflicts = await getBlockConflicts({
      venueId: validated.venueId,
      surfaceId: validated.surfaceId || null,
      segmentId,
      startsAt: validated.startsAt,
      endsAt: validated.endsAt,
      recurrenceRule: validated.recurrenceRule || null,
      recurrenceEndDate: validated.recurrenceEndDate ?? null,
    });

    if (validated.status !== "DRAFT" && conflicts.length > 0) {
      return {
        success: false,
        error: "Schedule block conflicts with existing bookings at this venue.",
        details: { conflicts },
      };
    }

    const block = await prisma.venueScheduleBlock.create({
      data: { ...scheduleBlockData(validated, userId), segmentId },
      select: { id: true, status: true },
    });

    await logVenueActivity({
      venueId: validated.venueId,
      actorId: userId,
      action: "SCHEDULE_BLOCK_CREATED",
      resourceType: "VenueScheduleBlock",
      resourceId: block.id,
      summary: `Created schedule block ${validated.title}`,
    });
    revalidateSchedulePaths(validated.organizationId, validated.venueId, venue.slug);

    return { success: true, data: { scheduleBlockId: block.id, status: block.status } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    if (error instanceof ScheduleActionError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to create schedule block." };
  }
}

export async function updateScheduleBlock(
  input: VenueScheduleBlockInput & { scheduleBlockId: string; segmentId?: string | null }
): Promise<ActionResult<{ scheduleBlockId: string; status: string }>> {
  try {
    const command = scheduleBlockIdSchema.parse(input);
    const validated = venueScheduleBlockSchema.parse(input);
    const rawSegment = blockSegmentInputSchema.parse(input);
    const userId = await requireVenueScheduleManager(validated.organizationId, validated.venueId);
    const venue = await ensureVenueContext(validated.organizationId, validated.venueId);
    const segmentId = await resolveBlockSegment(
      validated.venueId,
      validated.surfaceId || null,
      rawSegment.segmentId || null
    );
    const conflicts = await getBlockConflicts(
      {
        venueId: validated.venueId,
        surfaceId: validated.surfaceId || null,
        segmentId,
        startsAt: validated.startsAt,
        endsAt: validated.endsAt,
        recurrenceRule: validated.recurrenceRule || null,
        recurrenceEndDate: validated.recurrenceEndDate ?? null,
      },
      command.scheduleBlockId
    );

    if (validated.status !== "DRAFT" && conflicts.length > 0) {
      return {
        success: false,
        error: "Schedule block conflicts with existing bookings at this venue.",
        details: { conflicts },
      };
    }

    const block = await prisma.venueScheduleBlock.update({
      where: { id: command.scheduleBlockId, venueId: validated.venueId },
      data: {
        ...scheduleBlockUpdateData(validated),
        segmentId,
        updatedById: userId,
      },
      select: { id: true, status: true },
    });

    await logVenueActivity({
      venueId: validated.venueId,
      actorId: userId,
      action: "SCHEDULE_BLOCK_UPDATED",
      resourceType: "VenueScheduleBlock",
      resourceId: block.id,
      summary: `Updated schedule block ${validated.title}`,
    });
    revalidateSchedulePaths(validated.organizationId, validated.venueId, venue.slug);

    return { success: true, data: { scheduleBlockId: block.id, status: block.status } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    if (error instanceof ScheduleActionError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to update schedule block." };
  }
}

export async function publishScheduleBlock(input: {
  organizationId: string;
  venueId: string;
  scheduleBlockId: string;
}): Promise<ActionResult<{ scheduleBlockId: string; status: string }>> {
  return setScheduleBlockStatus(input, "PUBLISHED", "SCHEDULE_BLOCK_PUBLISHED");
}

export async function cancelScheduleBlock(input: {
  organizationId: string;
  venueId: string;
  scheduleBlockId: string;
}): Promise<ActionResult<{ scheduleBlockId: string; status: string }>> {
  return setScheduleBlockStatus(input, "CANCELED", "SCHEDULE_BLOCK_CANCELED");
}

interface PublicVenueScheduleFilters {
  skillLevelIds?: string[];
}

export async function getPublicVenueSchedule(slug: string, filters: PublicVenueScheduleFilters = {}) {
  const now = new Date();
  const skillLevelWhere = filters.skillLevelIds?.length
    ? { skillLevels: { some: { id: { in: filters.skillLevelIds } } } }
    : {};

  return prisma.venue.findFirst({
    where: {
      ...publicPublishedVenueWhere,
      slug,
    },
    select: {
      id: true,
      name: true,
      timezone: true,
      organizationId: true,
      scheduleBlocks: {
        where: {
          status: "PUBLISHED",
          visibility: "PUBLIC",
          startsAt: { gte: now },
          ...skillLevelWhere,
        },
        select: {
          id: true,
          title: true,
          description: true,
          activityType: true,
          audience: true,
          startsAt: true,
          endsAt: true,
          capacity: true,
          priceAmount: true,
          priceCurrency: true,
          priceLabel: true,
          registrationMode: true,
          externalRegistrationUrl: true,
          surface: {
            select: {
              id: true,
              name: true,
            },
          },
          skillLevels: {
            select: {
              id: true,
              label: true,
              discipline: true,
            },
          },
          // Confirmed + actively-held pending registrations, matching the
          // capacity enforced at registration time, so "spots remaining" is
          // consistent with what a registrant can actually reserve.
          registrations: {
            where: {
              OR: [
                { status: "CONFIRMED" },
                { status: "PENDING", createdAt: { gte: new Date(now.getTime() - 30 * 60 * 1000) } },
              ],
            },
            select: { quantity: true },
          },
        },
        orderBy: { startsAt: "asc" },
      },
      lessonOfferings: {
        where: { status: "PUBLISHED", registrationMode: "SELF_REGISTER", ...skillLevelWhere },
        select: {
          id: true,
          title: true,
          description: true,
          lessonType: true,
          instructorName: true,
          priceAmount: true,
          priceCurrency: true,
          durationMinutes: true,
          availabilityDescription: true,
          skillLevels: { select: { id: true, label: true, discipline: true } },
        },
        orderBy: { title: "asc" },
      },
    },
  });
}

async function setScheduleBlockStatus(
  input: { organizationId: string; venueId: string; scheduleBlockId: string },
  status: "PUBLISHED" | "CANCELED",
  action: string
): Promise<ActionResult<{ scheduleBlockId: string; status: string }>> {
  try {
    const validated = scheduleBlockCommandSchema.parse(input);
    const userId = await requireVenueScheduleManager(validated.organizationId, validated.venueId);
    const block = await prisma.venueScheduleBlock.findFirst({
      where: { id: validated.scheduleBlockId, venueId: validated.venueId },
      select: {
        id: true,
        venueId: true,
        startsAt: true,
        endsAt: true,
        status: true,
        activityType: true,
        surfaceId: true,
        segmentId: true,
        recurrenceRule: true,
        recurrenceEndDate: true,
        venue: { select: { organizationId: true, slug: true } },
      },
    });

    if (!block || block.venue.organizationId !== validated.organizationId) {
      return { success: false, error: "Schedule block not found" };
    }

    if (status === "PUBLISHED") {
      const conflicts = await getBlockConflicts(
        {
          venueId: validated.venueId,
          surfaceId: block.surfaceId,
          segmentId: block.segmentId,
          startsAt: block.startsAt,
          endsAt: block.endsAt,
          recurrenceRule: block.recurrenceRule,
          recurrenceEndDate: block.recurrenceEndDate,
        },
        block.id
      );
      if (conflicts.length > 0) {
        return {
          success: false,
          error: "Schedule block conflicts with existing bookings at this venue.",
          details: { conflicts },
        };
      }
    }

    const updated = await prisma.venueScheduleBlock.update({
      where: { id: block.id, venueId: validated.venueId },
      data: { status, updatedById: userId },
      select: { id: true, status: true },
    });

    await logVenueActivity({
      venueId: validated.venueId,
      actorId: userId,
      action,
      resourceType: "VenueScheduleBlock",
      resourceId: updated.id,
      summary: `${status === "PUBLISHED" ? "Published" : "Canceled"} schedule block`,
    });
    revalidateSchedulePaths(validated.organizationId, validated.venueId, block.venue.slug);

    return { success: true, data: { scheduleBlockId: updated.id, status: updated.status } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to update schedule block status." };
  }
}

async function ensureVenueContext(organizationId: string, venueId: string): Promise<VenueContext> {
  const venue = await prisma.venue.findFirst({
    where: {
      id: venueId,
      organizationId,
    },
    select: {
      id: true,
      organizationId: true,
      slug: true,
    },
  });

  if (!venue) {
    throw new Error("Venue not found");
  }

  return venue;
}

/**
 * Validate an optional block segment reference: the segment must exist on
 * the selected surface (which must belong to the venue) and be active.
 * Returns the persisted `segmentId` (null = whole surface / venue-wide).
 */
async function resolveBlockSegment(
  venueId: string,
  surfaceId: string | null,
  segmentId: string | null
): Promise<string | null> {
  if (!segmentId) return null;
  if (!surfaceId) {
    throw new ScheduleActionError("Select a surface before choosing a segment.");
  }

  const segment = await prisma.surfaceSegment.findFirst({
    where: { id: segmentId, surfaceId, surface: { venueId } },
    select: { id: true, isActive: true },
  });

  if (!segment) {
    throw new ScheduleActionError("Segment not found on the selected surface.");
  }
  if (!segment.isActive) {
    throw new ScheduleActionError("That segment is deactivated and cannot be booked.");
  }
  return segment.id;
}

type BlockConflictCandidate = {
  venueId: string;
  surfaceId: string | null;
  segmentId: string | null;
  startsAt: Date;
  endsAt: Date;
  recurrenceRule: string | null;
  recurrenceEndDate: Date | null;
};

/**
 * Unified conflict check for a schedule block (FR-010): every occurrence is
 * run through the five-source availability engine. Recurring blocks check
 * their first MAX_RECURRENCE_CONFLICT_OCCURRENCES expanded occurrences and
 * the results are aggregated/deduped. Hard-block semantics are preserved by
 * the callers: drafts save freely; publishing (or saving as published)
 * refuses while conflicts exist.
 */
async function getBlockConflicts(
  candidate: BlockConflictCandidate,
  excludeBlockId?: string
): Promise<BookingConflict[]> {
  const occurrences = expandCandidateOccurrences(candidate);

  const conflictLists = await Promise.all(
    occurrences.map((occurrence) =>
      findBookingConflicts({
        venueId: candidate.venueId,
        surfaceId: candidate.surfaceId,
        segmentId: candidate.segmentId,
        startAt: occurrence.startAt,
        endAt: occurrence.endAt,
        excludeBlockId,
      })
    )
  );

  const seen = new Set<string>();
  const conflicts: BookingConflict[] = [];
  for (const list of conflictLists) {
    for (const conflict of list) {
      const key = `${conflict.source}:${conflict.title}:${conflict.startAt.getTime()}:${conflict.endAt?.getTime() ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      conflicts.push(conflict);
    }
  }
  return conflicts.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/**
 * Candidate occurrences to conflict-check. Non-recurring blocks are their
 * own single occurrence; recurring blocks expand within the recurrence
 * window (capped). Unsupported recurrence rules fall back to the base range
 * so block creation never regresses on free-text rules.
 */
function expandCandidateOccurrences(
  candidate: BlockConflictCandidate
): Array<{ startAt: Date; endAt: Date }> {
  const base = { startAt: candidate.startsAt, endAt: candidate.endsAt };
  if (!candidate.recurrenceRule) return [base];

  try {
    const horizon = new Date(candidate.startsAt.getTime() + RECURRENCE_HORIZON_MS);
    const occurrences = expandRecurrenceWindow(
      {
        startAt: candidate.startsAt,
        endAt: candidate.endsAt,
        recurrenceRule: candidate.recurrenceRule,
        recurrenceEndAt: candidate.recurrenceEndDate,
      },
      candidate.startsAt,
      horizon
    ).slice(0, MAX_RECURRENCE_CONFLICT_OCCURRENCES);
    return occurrences.length > 0 ? occurrences : [base];
  } catch {
    return [base];
  }
}

/**
 * Future bookings that reference a surface, across the four surface-capable
 * sources (SeasonGame, EventGame, VenueScheduleBlock, PracticeSession) —
 * calendar Events are venue-wide and never reference a surface. Inclusion
 * filters mirror the availability engine; recurring blocks count only while
 * they still have a future occurrence (reported once, at that occurrence).
 */
async function findFutureSurfaceBookings(
  surfaceId: string,
  now: Date = new Date()
): Promise<VenueBookingView[]> {
  const horizon = new Date(now.getTime() + RECURRENCE_HORIZON_MS);

  const [seasonGames, eventGames, blocks, practices] = await Promise.all([
    prisma.seasonGame.findMany({
      where: {
        surfaceId,
        status: { in: ["SCHEDULED", "COMPLETED"] },
        endAt: { gt: now },
      },
      select: {
        id: true,
        startAt: true,
        endAt: true,
        surfaceId: true,
        segmentId: true,
        segment: { select: { name: true } },
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
    }),
    prisma.eventGame.findMany({
      where: {
        surfaceId,
        status: { not: "CANCELED" },
        event: { status: "PUBLISHED" },
        endAt: { gt: now },
      },
      select: {
        id: true,
        name: true,
        startAt: true,
        endAt: true,
        surfaceId: true,
        segmentId: true,
        segment: { select: { name: true } },
        event: { select: { title: true } },
      },
    }),
    prisma.venueScheduleBlock.findMany({
      where: {
        surfaceId,
        status: "PUBLISHED",
        OR: [
          { endsAt: { gt: now } },
          {
            recurrenceRule: { not: null },
            OR: [{ recurrenceEndDate: null }, { recurrenceEndDate: { gt: now } }],
          },
        ],
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        surfaceId: true,
        segmentId: true,
        segment: { select: { name: true } },
        recurrenceRule: true,
        recurrenceEndDate: true,
      },
    }),
    prisma.practiceSession.findMany({
      where: { surfaceId, startAt: { gte: now } },
      select: {
        id: true,
        title: true,
        startAt: true,
        duration: true,
        surfaceId: true,
        segmentId: true,
        segment: { select: { name: true } },
      },
    }),
  ]);

  const bookings: VenueBookingView[] = [];

  for (const game of seasonGames) {
    bookings.push({
      id: game.id,
      source: "seasonGame",
      title: `${game.homeTeam.name} vs ${game.awayTeam.name}`,
      startAt: game.startAt,
      endAt: game.endAt,
      surfaceId: game.surfaceId,
      segmentId: game.segmentId,
      segmentName: game.segment?.name ?? null,
    });
  }

  for (const game of eventGames) {
    bookings.push({
      id: game.id,
      source: "eventGame",
      title: `${game.name ?? "Game"} — ${game.event.title}`,
      startAt: game.startAt,
      endAt: game.endAt,
      surfaceId: game.surfaceId,
      segmentId: game.segmentId,
      segmentName: game.segment?.name ?? null,
    });
  }

  for (const block of blocks) {
    const occurrence = nextFutureBlockOccurrence(block, now, horizon);
    if (!occurrence) continue;
    bookings.push({
      id: block.id,
      source: "scheduleBlock",
      title: block.title,
      startAt: occurrence.startAt,
      endAt: occurrence.endAt,
      surfaceId: block.surfaceId,
      segmentId: block.segmentId,
      segmentName: block.segment?.name ?? null,
    });
  }

  for (const practice of practices) {
    if (!practice.startAt) continue; // narrows nullable column; query excludes
    bookings.push({
      id: practice.id,
      source: "practice",
      title: `Practice — ${practice.title}`,
      startAt: practice.startAt,
      endAt: new Date(practice.startAt.getTime() + practice.duration * 60_000),
      surfaceId: practice.surfaceId,
      segmentId: practice.segmentId,
      segmentName: practice.segment?.name ?? null,
    });
  }

  return bookings.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/**
 * The first occurrence of a block that ends after `now` (non-recurring
 * blocks are their own single occurrence). Unsupported recurrence rules
 * fall back to the base range.
 */
function nextFutureBlockOccurrence(
  block: {
    startsAt: Date;
    endsAt: Date;
    recurrenceRule: string | null;
    recurrenceEndDate: Date | null;
  },
  now: Date,
  horizon: Date
): { startAt: Date; endAt: Date } | null {
  if (!block.recurrenceRule) {
    return block.endsAt > now ? { startAt: block.startsAt, endAt: block.endsAt } : null;
  }
  try {
    const occurrences = expandRecurrenceWindow(
      {
        startAt: block.startsAt,
        endAt: block.endsAt,
        recurrenceRule: block.recurrenceRule,
        recurrenceEndAt: block.recurrenceEndDate,
      },
      now,
      horizon
    );
    return occurrences[0] ?? null;
  } catch {
    return block.endsAt > now ? { startAt: block.startsAt, endAt: block.endsAt } : null;
  }
}

function scheduleBlockData(
  validated: ReturnType<typeof venueScheduleBlockSchema.parse>,
  userId: string
): Prisma.VenueScheduleBlockUncheckedCreateInput {
  return {
    venueId: validated.venueId,
    surfaceId: validated.surfaceId || null,
    title: validated.title,
    description: validated.description || null,
    activityType: validated.activityType,
    audience: validated.audience,
    visibility: validated.visibility,
    status: validated.status,
    startsAt: validated.startsAt,
    endsAt: validated.endsAt,
    recurrenceRule: validated.recurrenceRule || null,
    recurrenceStartDate: validated.recurrenceStartDate ?? null,
    recurrenceEndDate: validated.recurrenceEndDate ?? null,
    capacity: validated.capacity ?? null,
    priceAmount: validated.priceAmount ?? null,
    priceCurrency: validated.priceCurrency,
    priceLabel: validated.priceLabel || null,
    registrationMode: validated.registrationMode,
    externalRegistrationUrl: validated.externalRegistrationUrl || null,
    createdById: userId,
  };
}

function scheduleBlockUpdateData(
  validated: ReturnType<typeof venueScheduleBlockSchema.parse>
): Prisma.VenueScheduleBlockUncheckedUpdateInput {
  return {
    venueId: validated.venueId,
    surfaceId: validated.surfaceId || null,
    title: validated.title,
    description: validated.description || null,
    activityType: validated.activityType,
    audience: validated.audience,
    visibility: validated.visibility,
    status: validated.status,
    startsAt: validated.startsAt,
    endsAt: validated.endsAt,
    recurrenceRule: validated.recurrenceRule || null,
    recurrenceStartDate: validated.recurrenceStartDate ?? null,
    recurrenceEndDate: validated.recurrenceEndDate ?? null,
    capacity: validated.capacity ?? null,
    priceAmount: validated.priceAmount ?? null,
    priceCurrency: validated.priceCurrency,
    priceLabel: validated.priceLabel || null,
    registrationMode: validated.registrationMode,
    externalRegistrationUrl: validated.externalRegistrationUrl || null,
  };
}

function revalidateVenueSchedule(organizationId: string, venueId: string) {
  revalidatePath(`/venue-admin/${organizationId}/venues/${venueId}/surfaces`);
  revalidatePath(`/venue-admin/${organizationId}/venues/${venueId}/schedule`);
}

function revalidateSchedulePaths(organizationId: string, venueId: string, slug?: string | null) {
  revalidateVenueSchedule(organizationId, venueId);
  if (slug) {
    revalidatePath(`/rinks/${slug}`);
    revalidatePath(`/rinks/${slug}/schedule`);
  }
}
