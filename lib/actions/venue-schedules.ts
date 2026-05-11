"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireUserId, requireVenueScheduleManager } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
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
import { findScheduleConflicts, type ScheduleBlockRange } from "@/lib/utils/venue-schedule";

const OPEN_ENDED_OPERATING_HOURS_END = new Date("9999-12-31T23:59:59.999Z");

const archiveIceSurfaceSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID format"),
  venueId: z.string().cuid("Invalid venue ID format"),
  surfaceId: z.string().cuid("Invalid surface ID format"),
});

const scheduleBlockMutationSchema = venueScheduleBlockSchema.extend({
  scheduleBlockId: z.string().cuid("Invalid schedule block ID format"),
});

const scheduleBlockStatusMutationSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID format"),
  venueId: z.string().cuid("Invalid venue ID format"),
  scheduleBlockId: z.string().cuid("Invalid schedule block ID format"),
});

type ScheduleBlockMutationInput = VenueScheduleBlockInput & { scheduleBlockId: string };

interface ExistingScheduleBlock {
  id: string;
  surfaceId?: string | null;
  startsAt?: Date;
  endsAt?: Date;
  startAt?: Date;
  endAt?: Date;
  status?: string | null;
  activityType?: string | null;
}

export async function getVenueScheduleAdminData(
  venueId: string
): Promise<ActionResult<{ venueId: string; surfaces: unknown[]; operatingHours: unknown[]; scheduleBlocks: unknown[] }>> {
  await requireUserId();

  const venue = await prisma.venue.findFirst({
    where: { id: venueId },
    select: {
      id: true,
      organizationId: true,
      surfaces: { orderBy: [{ displayOrder: "asc" }, { name: "asc" }] },
      operatingHours: { orderBy: [{ dayOfWeek: "asc" }, { opensAt: "asc" }] },
      scheduleBlocks: { orderBy: { startsAt: "asc" } },
    },
  });

  if (!venue?.organizationId) {
    return { success: false, error: "Venue schedule data was not found" };
  }

  await requireVenueScheduleManager(venue.organizationId, venue.id);

  return {
    success: true,
    data: {
      venueId: venue.id,
      surfaces: venue.surfaces,
      operatingHours: venue.operatingHours,
      scheduleBlocks: venue.scheduleBlocks,
    },
  };
}

export async function createIceSurface(input: CreateIceSurfaceInput): Promise<ActionResult<{ surfaceId: string }>> {
  try {
    const validated = createIceSurfaceSchema.parse(input);
    const userId = await requireVenueScheduleManager(validated.organizationId, validated.venueId);
    const venue = await getAuthorizedVenue(validated.organizationId, validated.venueId);
    if (!venue) {
      return { success: false, error: "Venue not found" };
    }

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
      summary: `Created ice surface ${surface.name}`,
    });

    revalidateVenueSchedulePaths(validated.organizationId, validated.venueId, venue.slug);

    return { success: true, data: { surfaceId: surface.id } };
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return { success: false, error: "Failed to create ice surface. Please try again." };
  }
}

export async function updateIceSurface(input: UpdateIceSurfaceInput): Promise<ActionResult<{ surfaceId: string }>> {
  try {
    const validated = updateIceSurfaceSchema.parse(input);
    const userId = await requireVenueScheduleManager(validated.organizationId, validated.venueId);
    const venue = await getAuthorizedVenue(validated.organizationId, validated.venueId);
    if (!venue) {
      return { success: false, error: "Venue not found" };
    }

    const surface = await prisma.iceSurface.update({
      where: { id: validated.surfaceId, venueId: validated.venueId } as Prisma.IceSurfaceWhereUniqueInput,
      data: {
        name: validated.name,
        surfaceType: validated.surfaceType,
        capacity: validated.capacity ?? null,
        isDefault: validated.isDefault,
        isActive: validated.isActive,
        displayOrder: validated.displayOrder,
        notes: validated.notes || null,
      },
      select: { id: true, name: true },
    });

    await logVenueActivity({
      venueId: validated.venueId,
      actorId: userId,
      action: "ICE_SURFACE_UPDATED",
      resourceType: "IceSurface",
      resourceId: surface.id,
      summary: `Updated ice surface ${surface.name}`,
    });

    revalidateVenueSchedulePaths(validated.organizationId, validated.venueId, venue.slug);

    return { success: true, data: { surfaceId: surface.id } };
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return { success: false, error: "Failed to update ice surface. Please try again." };
  }
}

export async function archiveIceSurface(input: z.input<typeof archiveIceSurfaceSchema>): Promise<ActionResult<{ surfaceId: string }>> {
  try {
    const validated = archiveIceSurfaceSchema.parse(input);
    const userId = await requireVenueScheduleManager(validated.organizationId, validated.venueId);
    const venue = await getAuthorizedVenue(validated.organizationId, validated.venueId);
    if (!venue) {
      return { success: false, error: "Venue not found" };
    }

    const surface = await prisma.iceSurface.update({
      where: { id: validated.surfaceId, venueId: validated.venueId } as Prisma.IceSurfaceWhereUniqueInput,
      data: { isActive: false },
      select: { id: true },
    });

    await logVenueActivity({
      venueId: validated.venueId,
      actorId: userId,
      action: "ICE_SURFACE_ARCHIVED",
      resourceType: "IceSurface",
      resourceId: surface.id,
      summary: "Archived ice surface",
    });

    revalidateVenueSchedulePaths(validated.organizationId, validated.venueId, venue.slug);

    return { success: true, data: { surfaceId: surface.id } };
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return { success: false, error: "Failed to archive ice surface. Please try again." };
  }
}

export async function setOperatingHours(input: VenueOperatingHourInput): Promise<ActionResult<{ operatingHourId: string }>> {
  try {
    const validated = venueOperatingHourSchema.parse(input);
    const userId = await requireVenueScheduleManager(validated.organizationId, validated.venueId);
    const venue = await getAuthorizedVenue(validated.organizationId, validated.venueId);
    if (!venue) {
      return { success: false, error: "Venue not found" };
    }

    const surfaceId = normalizeOptionalId(validated.surfaceId);
    const validSurface = await isVenueSurface(validated.venueId, surfaceId);
    if (!validSurface) {
      return { success: false, error: "Selected surface was not found for this venue" };
    }

    const effectiveEndDate = validated.effectiveEndDate ?? OPEN_ENDED_OPERATING_HOURS_END;
    const overlappingRule = await prisma.venueOperatingHour.findFirst({
      where: {
        venueId: validated.venueId,
        surfaceId,
        dayOfWeek: validated.dayOfWeek,
        effectiveStartDate: { lte: effectiveEndDate },
        OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: validated.effectiveStartDate } }],
      },
      select: { id: true },
    });

    if (overlappingRule) {
      return { success: false, error: "Operating hours already exist for this surface and date range" };
    }

    const operatingHour = await prisma.venueOperatingHour.create({
      data: {
        venueId: validated.venueId,
        surfaceId,
        dayOfWeek: validated.dayOfWeek,
        opensAt: validated.opensAt,
        closesAt: validated.closesAt,
        effectiveStartDate: validated.effectiveStartDate,
        effectiveEndDate: validated.effectiveEndDate ?? null,
        status: validated.status,
        label: validated.label || null,
        notes: validated.notes || null,
      },
      select: { id: true },
    });

    await logVenueActivity({
      venueId: validated.venueId,
      actorId: userId,
      action: "OPERATING_HOURS_SET",
      resourceType: "VenueOperatingHour",
      resourceId: operatingHour.id,
      summary: "Set venue operating hours",
    });

    revalidateVenueSchedulePaths(validated.organizationId, validated.venueId, venue.slug);

    return { success: true, data: { operatingHourId: operatingHour.id } };
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return { success: false, error: "Failed to set operating hours. Please try again." };
  }
}

export async function createScheduleBlock(input: VenueScheduleBlockInput): Promise<ActionResult<{ scheduleBlockId: string }>> {
  try {
    const validated = venueScheduleBlockSchema.parse(input);
    const userId = await requireVenueScheduleManager(validated.organizationId, validated.venueId);
    const venue = await getAuthorizedVenue(validated.organizationId, validated.venueId);
    if (!venue) {
      return { success: false, error: "Venue not found" };
    }

    const surfaceId = normalizeOptionalId(validated.surfaceId);
    const validSurface = await isVenueSurface(validated.venueId, surfaceId);
    if (!validSurface) {
      return { success: false, error: "Selected surface was not found for this venue" };
    }

    const conflictError = await getScheduleConflictError(validated.venueId, surfaceId, validated.startsAt, validated.endsAt);
    if (conflictError) {
      return { success: false, error: conflictError };
    }

    const block = await prisma.venueScheduleBlock.create({
      data: buildScheduleBlockCreateData(validated, userId),
      select: { id: true, title: true },
    });

    await logVenueActivity({
      venueId: validated.venueId,
      actorId: userId,
      action: "SCHEDULE_BLOCK_CREATED",
      resourceType: "VenueScheduleBlock",
      resourceId: block.id,
      summary: `Created schedule block ${block.title}`,
    });

    revalidateVenueSchedulePaths(validated.organizationId, validated.venueId, venue.slug);

    return { success: true, data: { scheduleBlockId: block.id } };
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return { success: false, error: "Failed to create schedule block. Please try again." };
  }
}

export async function updateScheduleBlock(input: ScheduleBlockMutationInput): Promise<ActionResult<{ scheduleBlockId: string }>> {
  try {
    const validated = scheduleBlockMutationSchema.parse(input);
    const userId = await requireVenueScheduleManager(validated.organizationId, validated.venueId);
    const venue = await getAuthorizedVenue(validated.organizationId, validated.venueId);
    if (!venue) {
      return { success: false, error: "Venue not found" };
    }

    const existing = await prisma.venueScheduleBlock.findFirst({
      where: {
        id: validated.scheduleBlockId,
        venueId: validated.venueId,
        venue: { organizationId: validated.organizationId },
      },
      select: { id: true },
    });

    if (!existing) {
      return { success: false, error: "Schedule block not found" };
    }

    const surfaceId = normalizeOptionalId(validated.surfaceId);
    const validSurface = await isVenueSurface(validated.venueId, surfaceId);
    if (!validSurface) {
      return { success: false, error: "Selected surface was not found for this venue" };
    }

    const conflictError = await getScheduleConflictError(
      validated.venueId,
      surfaceId,
      validated.startsAt,
      validated.endsAt,
      [validated.scheduleBlockId]
    );
    if (conflictError) {
      return { success: false, error: conflictError };
    }

    const block = await prisma.venueScheduleBlock.update({
      where: { id: validated.scheduleBlockId },
      data: buildScheduleBlockUpdateData(validated, userId),
      select: { id: true, title: true },
    });

    await logVenueActivity({
      venueId: validated.venueId,
      actorId: userId,
      action: "SCHEDULE_BLOCK_UPDATED",
      resourceType: "VenueScheduleBlock",
      resourceId: block.id,
      summary: `Updated schedule block ${block.title}`,
    });

    revalidateVenueSchedulePaths(validated.organizationId, validated.venueId, venue.slug);

    return { success: true, data: { scheduleBlockId: block.id } };
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return { success: false, error: "Failed to update schedule block. Please try again." };
  }
}

export async function publishScheduleBlock(input: z.input<typeof scheduleBlockStatusMutationSchema>): Promise<ActionResult<{ scheduleBlockId: string }>> {
  return updateScheduleBlockStatus(input, "PUBLISHED", "SCHEDULE_BLOCK_PUBLISHED", "Published schedule block");
}

export async function cancelScheduleBlock(input: z.input<typeof scheduleBlockStatusMutationSchema>): Promise<ActionResult<{ scheduleBlockId: string }>> {
  return updateScheduleBlockStatus(input, "CANCELED", "SCHEDULE_BLOCK_CANCELED", "Canceled schedule block");
}

export async function getPublicVenueSchedule(slug: string) {
  if (!slug) {
    return null;
  }

  return prisma.venue.findFirst({
    where: {
      ...publicPublishedVenueWhere,
      slug,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      scheduleBlocks: {
        where: {
          status: "PUBLISHED",
          visibility: "PUBLIC",
        },
        orderBy: { startsAt: "asc" },
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
              surfaceType: true,
            },
          },
        },
      },
    },
  });
}

async function updateScheduleBlockStatus(
  input: z.input<typeof scheduleBlockStatusMutationSchema>,
  status: "PUBLISHED" | "CANCELED",
  action: string,
  summary: string
): Promise<ActionResult<{ scheduleBlockId: string }>> {
  try {
    const validated = scheduleBlockStatusMutationSchema.parse(input);
    const userId = await requireVenueScheduleManager(validated.organizationId, validated.venueId);
    const venue = await getAuthorizedVenue(validated.organizationId, validated.venueId);
    if (!venue) {
      return { success: false, error: "Venue not found" };
    }

    const existing = await prisma.venueScheduleBlock.findFirst({
      where: {
        id: validated.scheduleBlockId,
        venueId: validated.venueId,
        venue: { organizationId: validated.organizationId },
      },
      select: {
        id: true,
        surfaceId: true,
        startsAt: true,
        endsAt: true,
        status: true,
        activityType: true,
      },
    });

    if (!existing) {
      return { success: false, error: "Schedule block not found" };
    }

    if (status === "PUBLISHED") {
      const conflictError = await getScheduleConflictError(
        validated.venueId,
        existing.surfaceId ?? null,
        existing.startsAt,
        existing.endsAt,
        [validated.scheduleBlockId]
      );
      if (conflictError) {
        return { success: false, error: conflictError };
      }
    }

    const block = await prisma.venueScheduleBlock.update({
      where: { id: validated.scheduleBlockId },
      data: { status, updatedById: userId },
      select: { id: true },
    });

    await logVenueActivity({
      venueId: validated.venueId,
      actorId: userId,
      action,
      resourceType: "VenueScheduleBlock",
      resourceId: block.id,
      summary,
    });

    revalidateVenueSchedulePaths(validated.organizationId, validated.venueId, venue.slug);

    return { success: true, data: { scheduleBlockId: block.id } };
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return { success: false, error: "Failed to update schedule block status. Please try again." };
  }
}

async function getAuthorizedVenue(organizationId: string, venueId: string) {
  return prisma.venue.findFirst({
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
}

async function isVenueSurface(venueId: string, surfaceId: string | null): Promise<boolean> {
  if (!surfaceId) {
    return true;
  }

  const surface = await prisma.iceSurface.findFirst({
    where: {
      id: surfaceId,
      venueId,
      isActive: true,
    },
    select: { id: true },
  });

  return Boolean(surface);
}

async function getScheduleConflictError(
  venueId: string,
  surfaceId: string | null,
  startsAt: Date,
  endsAt: Date,
  ignoreIds: string[] = []
): Promise<string | null> {
  const where: Prisma.VenueScheduleBlockWhereInput = {
    venueId,
    surfaceId,
    status: { in: ["DRAFT", "PUBLISHED"] },
    startsAt: { lt: endsAt },
    endsAt: { gt: startsAt },
  };

  if (ignoreIds.length > 0) {
    where.id = { notIn: ignoreIds };
  }

  const existingBlocks = await prisma.venueScheduleBlock.findMany({
    where,
    select: {
      id: true,
      surfaceId: true,
      startsAt: true,
      endsAt: true,
      status: true,
      activityType: true,
    },
  });

  const conflicts = findScheduleConflicts(
    { startAt: startsAt, endAt: endsAt },
    existingBlocks.map(toScheduleRange),
    { ignoreIds }
  );

  return conflicts.length > 0 ? "Schedule block overlaps an existing published block" : null;
}

function buildScheduleBlockBaseData(
  validated: ReturnType<typeof venueScheduleBlockSchema.parse>,
): Omit<Prisma.VenueScheduleBlockUncheckedCreateInput, "createdById"> {
  return {
    venueId: validated.venueId,
    surfaceId: normalizeOptionalId(validated.surfaceId),
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

function buildScheduleBlockCreateData(
  validated: ReturnType<typeof venueScheduleBlockSchema.parse>,
  userId: string
): Prisma.VenueScheduleBlockUncheckedCreateInput {
  return {
    ...buildScheduleBlockBaseData(validated),
    createdById: userId,
  };
}

function buildScheduleBlockUpdateData(
  validated: ReturnType<typeof scheduleBlockMutationSchema.parse>,
  userId: string
): Prisma.VenueScheduleBlockUncheckedUpdateInput {
  return {
    ...buildScheduleBlockBaseData(validated),
    updatedById: userId,
  };
}

function toScheduleRange(block: ExistingScheduleBlock): ScheduleBlockRange {
  return {
    id: block.id,
    surfaceId: block.surfaceId ?? null,
    startAt: block.startsAt ?? block.startAt ?? new Date(0),
    endAt: block.endsAt ?? block.endAt ?? new Date(0),
    status: block.status,
    activityType: block.activityType,
  };
}

function normalizeOptionalId(value: string | null | undefined): string | null {
  return value || null;
}

function revalidateVenueSchedulePaths(organizationId: string, venueId: string, slug?: string | null) {
  revalidatePath(`/venue-admin/${organizationId}/venues/${venueId}/schedule`);
  revalidatePath(`/venue-admin/${organizationId}/venues/${venueId}/profile`);
  if (slug) {
    revalidatePath(`/rinks/${slug}`);
  }
}

function isRedirectError(error: unknown): error is Error {
  return error instanceof Error && error.message.includes("NEXT_REDIRECT");
}
