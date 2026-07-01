"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
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
import { findScheduleConflicts, type ScheduleBlockRange } from "@/lib/utils/venue-schedule";

type VenueContext = {
  id: string;
  organizationId: string | null;
  slug: string | null;
};

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
  input: VenueScheduleBlockInput
): Promise<ActionResult<{ scheduleBlockId: string; status: string }>> {
  try {
    const validated = venueScheduleBlockSchema.parse(input);
    const userId = await requireVenueScheduleManager(validated.organizationId, validated.venueId);
    const venue = await ensureVenueContext(validated.organizationId, validated.venueId);
    const conflicts = await getScheduleConflicts(validated.venueId, {
      startAt: validated.startsAt,
      endAt: validated.endsAt,
      surfaceId: validated.surfaceId || null,
      activityType: validated.activityType,
    });

    if (validated.status !== "DRAFT" && conflicts.length > 0) {
      return { success: false, error: "Schedule block conflicts with an existing published block." };
    }

    const block = await prisma.venueScheduleBlock.create({
      data: scheduleBlockData(validated, userId),
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
    return { success: false, error: "Failed to create schedule block." };
  }
}

export async function updateScheduleBlock(
  input: VenueScheduleBlockInput & { scheduleBlockId: string }
): Promise<ActionResult<{ scheduleBlockId: string; status: string }>> {
  try {
    const command = scheduleBlockIdSchema.parse(input);
    const validated = venueScheduleBlockSchema.parse(input);
    const userId = await requireVenueScheduleManager(validated.organizationId, validated.venueId);
    const venue = await ensureVenueContext(validated.organizationId, validated.venueId);
    const conflicts = await getScheduleConflicts(
      validated.venueId,
      {
        startAt: validated.startsAt,
        endAt: validated.endsAt,
        surfaceId: validated.surfaceId || null,
        activityType: validated.activityType,
      },
      command.scheduleBlockId
    );

    if (validated.status !== "DRAFT" && conflicts.length > 0) {
      return { success: false, error: "Schedule block conflicts with an existing published block." };
    }

    const block = await prisma.venueScheduleBlock.update({
      where: { id: command.scheduleBlockId, venueId: validated.venueId },
      data: {
        ...scheduleBlockUpdateData(validated),
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
          // Confirmed registrations (quantities only) to compute remaining spots.
          registrations: {
            where: { status: "CONFIRMED" },
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
        venue: { select: { organizationId: true, slug: true } },
      },
    });

    if (!block || block.venue.organizationId !== validated.organizationId) {
      return { success: false, error: "Schedule block not found" };
    }

    if (status === "PUBLISHED") {
      const conflicts = await getScheduleConflicts(
        validated.venueId,
        {
          startAt: block.startsAt,
          endAt: block.endsAt,
          surfaceId: block.surfaceId,
          activityType: block.activityType,
        },
        block.id
      );
      if (conflicts.length > 0) {
        return { success: false, error: "Schedule block conflicts with an existing published block." };
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

async function getScheduleConflicts(
  venueId: string,
  candidate: ScheduleBlockRange,
  excludeId?: string
) {
  const ranges = await prisma.venueScheduleBlock.findMany({
    where: {
      venueId,
      ...(candidate.surfaceId ? { OR: [{ surfaceId: candidate.surfaceId }, { surfaceId: null }] } : {}),
      status: { in: ["PUBLISHED"] },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startsAt: { lt: candidate.endAt },
      endsAt: { gt: candidate.startAt },
    },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      status: true,
      activityType: true,
      surfaceId: true,
    },
  });

  return findScheduleConflicts(candidate, ranges.map((range) => ({
    id: range.id,
    startAt: range.startsAt,
    endAt: range.endsAt,
    status: range.status,
    activityType: range.activityType,
    surfaceId: range.surfaceId,
  })));
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
