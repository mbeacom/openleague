"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import {
  requireVenueScheduleManager,
  VENUE_SCHEDULE_ROLES,
} from "@/lib/auth/session";
import { type ActionResult } from "@/lib/actions/venue-organizations";
import { logVenueActivity } from "@/lib/services/venue-activity";
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
import { findBookingConflicts, getVenueBookings } from "@/lib/utils/availability";
import { expandRecurrenceWindow } from "@/lib/utils/venue-schedule";
import type { BookingConflict, VenueBookingView } from "@/types/segments";
import {
  populateVenueOfferingAvailability,
  type VenueReservationOfferingWithAvailability,
} from "@/lib/services/venue-reservation-availability";
import {
  createVenueReservation,
  transitionVenueReservation,
  VenueReservationConflictError,
} from "@/lib/services/venue-reservations";
import { runVenueReservationTransaction } from "@/lib/services/venue-reservation-transaction";

type VenueContext = {
  id: string;
  organizationId: string | null;
  slug: string | null;
  timezone: string;
};

/**
 * Friendly, user-facing failure raised inside actions; its message is safe
 * to return to the client (arbitrary thrown errors map to a generic
 * fallback instead).
 */
class ScheduleActionError extends Error {}

async function assertVenueScheduleManagerInTransaction(
  tx: Prisma.TransactionClient,
  input: { userId: string; organizationId: string; venueId: string },
): Promise<void> {
  const membership = await tx.venueStaff.findFirst({
    where: {
      userId: input.userId,
      organizationId: input.organizationId,
      status: "ACTIVE",
      role: { in: [...VENUE_SCHEDULE_ROLES] },
      organization: { status: { in: ["DRAFT", "ACTIVE"] } },
      OR: [{ venueId: null }, { venueId: input.venueId }],
    },
    select: { id: true },
  });
  if (!membership) {
    throw new ScheduleActionError(
      "Unauthorized: You do not have permission to manage this venue",
    );
  }
}

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
    /** IANA zone the venue's schedule is displayed in. */
    timezone: string;
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
    availableIce: VenueReservationOfferingWithAvailability[];
  }>
> {
  try {
    await requireVenueScheduleManager(organizationId, venueId);
    const venue = await ensureVenueContext(organizationId, venueId);

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
          intent: true,
          status: true,
          registrationMode: true,
          surfaceId: true,
          segmentId: true,
          recurrenceRule: true,
          recurrenceEndDate: true,
          surface: { select: { name: true } },
        },
        orderBy: { startsAt: "asc" },
      }),
    ]);
    const availabilityFrom = new Date();
    const availabilityTo = new Date(
      availabilityFrom.getTime() + OFFERING_AVAILABILITY_HORIZON_MS,
    );
    const availableIce = await populateVenueOfferingAvailability(prisma, {
      venueId,
      offerings: expandRequestableOfferingOccurrences(
        scheduleBlocks.filter(
          (block) =>
            block.status === "PUBLISHED"
            && block.intent === "OFFERING"
            && block.registrationMode === "REQUEST_REQUIRED",
        ),
        venue.timezone,
        availabilityFrom,
        availabilityTo,
      ),
      now: availabilityFrom,
      mode: "STAFF",
    });

    return {
      success: true,
      data: {
        venueId,
        timezone: venue.timezone,
        surfaces,
        operatingHours,
        scheduleBlocks,
        availableIce,
      },
    };
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

    const outcome = await runVenueReservationTransaction(async (tx) => {
      const existing = await tx.iceSurface.findFirst({
        where: { id: validated.surfaceId, venueId: validated.venueId },
        select: { id: true },
      });
      if (!existing) return { kind: "missing" as const };

      if (!validated.isActive) {
        const futureBookings = await findFutureSurfaceBookings(
          { venueId: validated.venueId, surfaceId: validated.surfaceId },
          new Date(),
          tx,
        );
        if (futureBookings.length > 0) {
          return { kind: "blocked" as const, futureBookings };
        }
      }

      const surface = await tx.iceSurface.update({
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
      return { kind: "updated" as const, surface };
    });
    if (outcome.kind === "missing") {
      return { success: false, error: "Surface not found" };
    }
    if (outcome.kind === "blocked") {
      return {
        success: false,
        error:
          "This surface has upcoming bookings and cannot be deactivated. Move or cancel them first.",
        details: { futureBookings: outcome.futureBookings },
      };
    }
    const { surface } = outcome;

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

    const outcome = await runVenueReservationTransaction(async (tx) => {
      const existing = await tx.iceSurface.findFirst({
        where: { id: validated.surfaceId, venueId: validated.venueId },
        select: { id: true },
      });
      if (!existing) return { kind: "missing" as const };

      // Recheck and deactivate in one serializable transaction. A concurrent
      // reservation writer that read the surface as active forces one side to
      // retry rather than permitting a stale check followed by archival.
      const futureBookings = await findFutureSurfaceBookings(
        { venueId: validated.venueId, surfaceId: validated.surfaceId },
        new Date(),
        tx,
      );
      if (futureBookings.length > 0) {
        return { kind: "blocked" as const, futureBookings };
      }

      const surface = await tx.iceSurface.update({
        where: { id: validated.surfaceId, venueId: validated.venueId },
        data: { isActive: false },
        select: { id: true, venueId: true },
      });
      return { kind: "archived" as const, surface };
    });
    if (outcome.kind === "missing") {
      return { success: false, error: "Surface not found" };
    }
    if (outcome.kind === "blocked") {
      return {
        success: false,
        error:
          "This surface has upcoming bookings and cannot be archived. Move or cancel them first.",
        details: { futureBookings: outcome.futureBookings },
      };
    }
    const { surface } = outcome;

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
    const intent = scheduleBlockIntent(validated);
    if (
      intent !== "OFFERING"
      && intent !== "INFORMATION"
      && validated.recurrenceRule
      && !validated.recurrenceEndDate
    ) {
      throw new ScheduleActionError("Occupying recurring blocks must have an end date.");
    }
    if (
      (prisma as typeof prisma & { venueReservation?: unknown }).venueReservation
      && validated.status === "PUBLISHED"
      && intent !== "OFFERING"
      && intent !== "INFORMATION"
    ) {
      try {
        const block = await runVenueReservationTransaction(async (tx) => {
          const created = await tx.venueScheduleBlock.create({
            data: { ...scheduleBlockData(validated, userId), segmentId },
            select: { id: true, status: true },
          });
          await materializeScheduleBlockReservations(tx, {
            blockId: created.id,
            venueId: validated.venueId,
            organizationId: validated.organizationId,
            surfaceId: validated.surfaceId || null,
            segmentId,
            startsAt: validated.startsAt,
            endsAt: validated.endsAt,
            recurrenceRule: validated.recurrenceRule || null,
            recurrenceEndDate: validated.recurrenceEndDate ?? null,
            timezone: venue.timezone,
            actorId: userId,
          });
          return created;
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
        if (error instanceof VenueReservationConflictError) {
          return {
            success: false,
            error: "Schedule block conflicts with existing bookings at this venue.",
            details: { conflicts: error.conflicts },
          };
        }
        throw error;
      }
    }
    const conflicts = await getBlockConflicts({
      venueId: validated.venueId,
      surfaceId: validated.surfaceId || null,
      segmentId,
      startsAt: validated.startsAt,
      endsAt: validated.endsAt,
      recurrenceRule: validated.recurrenceRule || null,
      recurrenceEndDate: validated.recurrenceEndDate ?? null,
      timezone: venue.timezone,
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
    const intent = scheduleBlockIntent(validated);
    if (
      intent !== "OFFERING"
      && intent !== "INFORMATION"
      && validated.recurrenceRule
      && !validated.recurrenceEndDate
    ) {
      throw new ScheduleActionError("Occupying recurring blocks must have an end date.");
    }
    const canonicalReservations = (prisma as typeof prisma & { venueReservation?: unknown }).venueReservation;
    if (canonicalReservations) {
      try {
        const block = await runVenueReservationTransaction(async (tx) => {
          const currentBlock = await tx.venueScheduleBlock.findFirst({
            where: {
              id: command.scheduleBlockId,
              venueId: validated.venueId,
              venue: { organizationId: validated.organizationId },
            },
            select: {
              status: true,
              intent: true,
              recurrenceRule: true,
              recurrenceEndDate: true,
              venue: {
                select: {
                  organizationId: true,
                  slug: true,
                  timezone: true,
                },
              },
              reservationOccurrences: {
                select: {
                  id: true,
                  status: true,
                  venueId: true,
                  surfaceId: true,
                  segmentId: true,
                  startsAt: true,
                  endsAt: true,
                },
              },
            },
          });
          if (
            !currentBlock
            || currentBlock.venue.organizationId !== validated.organizationId
          ) {
            throw new ScheduleActionError("Schedule block not found");
          }
          await assertVenueScheduleManagerInTransaction(tx, {
            userId,
            organizationId: currentBlock.venue.organizationId,
            venueId: validated.venueId,
          });

          const updated = await tx.venueScheduleBlock.update({
            where: { id: command.scheduleBlockId, venueId: validated.venueId },
            data: {
              ...scheduleBlockUpdateData(validated),
              segmentId,
              updatedById: userId,
            },
            select: {
              id: true,
              venueId: true,
              surfaceId: true,
              segmentId: true,
              startsAt: true,
              endsAt: true,
              status: true,
              intent: true,
              recurrenceRule: true,
              recurrenceEndDate: true,
              venue: {
                select: {
                  organizationId: true,
                  slug: true,
                  timezone: true,
                },
              },
            },
          });
          const wasOccupyingPublished =
            currentBlock.status === "PUBLISHED"
            && isOccupyingScheduleIntent(currentBlock.intent);
          if (
            updated.status === "PUBLISHED"
            && isOccupyingScheduleIntent(updated.intent)
          ) {
            await materializeScheduleBlockReservations(tx, {
              blockId: updated.id,
              venueId: updated.venueId,
              organizationId: currentBlock.venue.organizationId,
              surfaceId: updated.surfaceId,
              segmentId: updated.segmentId,
              startsAt: updated.startsAt,
              endsAt: updated.endsAt,
              recurrenceRule: updated.recurrenceRule,
              recurrenceEndDate: updated.recurrenceEndDate,
              timezone: updated.venue.timezone,
              actorId: userId,
            });
          } else if (wasOccupyingPublished) {
            await cancelScheduleBlockReservations(tx, updated.id, userId);
          }
          return updated;
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
        if (error instanceof VenueReservationConflictError) {
          return {
            success: false,
            error: "Schedule block conflicts with existing bookings at this venue.",
            details: { conflicts: error.conflicts },
          };
        }
        throw error;
      }
    }

    const conflicts = await getBlockConflicts(
      {
        venueId: validated.venueId,
        surfaceId: validated.surfaceId || null,
        segmentId,
        startsAt: validated.startsAt,
        endsAt: validated.endsAt,
        recurrenceRule: validated.recurrenceRule || null,
        recurrenceEndDate: validated.recurrenceEndDate ?? null,
        timezone: venue.timezone,
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

const OFFERING_AVAILABILITY_HORIZON_MS = 366 * 24 * 60 * 60 * 1000;

type RequestableOfferingBlock = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  surfaceId: string | null;
  segmentId: string | null;
  recurrenceRule: string | null;
  recurrenceEndDate: Date | null;
  surface: { name: string } | null;
};

function expandRequestableOfferingOccurrences(
  blocks: RequestableOfferingBlock[],
  timeZone: string,
  from: Date,
  to: Date,
) {
  return blocks.flatMap((block) => {
    const occurrences = block.recurrenceRule
      ? expandRecurrenceWindow(
          {
            startAt: block.startsAt,
            endAt: block.endsAt,
            recurrenceRule: block.recurrenceRule,
            recurrenceEndAt: block.recurrenceEndDate,
            timezone: timeZone,
          },
          from,
          to,
        )
      : block.startsAt < to && block.endsAt > from
        ? [{ startAt: block.startsAt, endAt: block.endsAt }]
        : [];

    return occurrences.map((occurrence) => ({
      id: block.recurrenceRule
        ? `${block.id}:${occurrence.startAt.toISOString()}`
        : block.id,
      offeringBlockId: block.id,
      title: block.title,
      startsAt: occurrence.startAt,
      endsAt: occurrence.endAt,
      surfaceId: block.surfaceId,
      segmentId: block.segmentId,
      surfaceName: block.surface?.name ?? null,
    }));
  });
}

export async function getPublicVenueSchedule(slug: string, filters: PublicVenueScheduleFilters = {}) {
  const now = new Date();
  const availabilityEnd = new Date(
    now.getTime() + OFFERING_AVAILABILITY_HORIZON_MS,
  );
  const skillLevelWhere = filters.skillLevelIds?.length
    ? { skillLevels: { some: { id: { in: filters.skillLevelIds } } } }
    : {};

  const venue = await prisma.venue.findFirst({
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
          audience: "PUBLIC",
          startsAt: { lt: availabilityEnd },
          OR: [
            { recurrenceRule: null, endsAt: { gt: now } },
            {
              recurrenceRule: { not: null },
              OR: [
                { recurrenceEndDate: null },
                { recurrenceEndDate: { gte: now } },
              ],
            },
          ],
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
          intent: true,
          externalRegistrationUrl: true,
          surfaceId: true,
          segmentId: true,
          recurrenceRule: true,
          recurrenceEndDate: true,
          surface: {
            select: {
              id: true,
              name: true,
            },
          },
          segment: {
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
  if (!venue) return null;

  const requestableOfferings = expandRequestableOfferingOccurrences(
    venue.scheduleBlocks.filter(
      (block) =>
        block.registrationMode === "REQUEST_REQUIRED"
        && block.intent === "OFFERING",
    ),
    venue.timezone,
    now,
    availabilityEnd,
  );
  const availableIce = await populateVenueOfferingAvailability(prisma, {
    venueId: venue.id,
    offerings: requestableOfferings,
    now,
    mode: "PUBLIC",
  });

  return {
    ...venue,
    availableIce,
  };
}

async function setScheduleBlockStatus(
  input: { organizationId: string; venueId: string; scheduleBlockId: string },
  status: "PUBLISHED" | "CANCELED",
  action: string
): Promise<ActionResult<{ scheduleBlockId: string; status: string }>> {
  try {
    const validated = scheduleBlockCommandSchema.parse(input);
    const userId = await requireVenueScheduleManager(validated.organizationId, validated.venueId);
    const canonicalReservations = (prisma as typeof prisma & { venueReservation?: unknown })
      .venueReservation;

    if (canonicalReservations) {
      try {
        const result = await runVenueReservationTransaction(async (tx) => {
          const block = await tx.venueScheduleBlock.findFirst({
            where: {
              id: validated.scheduleBlockId,
              venueId: validated.venueId,
              venue: { organizationId: validated.organizationId },
            },
            select: {
              id: true,
              venueId: true,
              startsAt: true,
              endsAt: true,
              status: true,
              intent: true,
              surfaceId: true,
              segmentId: true,
              recurrenceRule: true,
              recurrenceEndDate: true,
              venue: {
                select: {
                  organizationId: true,
                  slug: true,
                  timezone: true,
                },
              },
              reservationOccurrences: {
                select: {
                  id: true,
                  status: true,
                  venueId: true,
                  surfaceId: true,
                  segmentId: true,
                  startsAt: true,
                  endsAt: true,
                },
              },
            },
          });
          if (!block || block.venue.organizationId !== validated.organizationId) {
            throw new ScheduleActionError("Schedule block not found");
          }
          await assertVenueScheduleManagerInTransaction(tx, {
            userId,
            organizationId: block.venue.organizationId,
            venueId: block.venueId,
          });
          if (
            status === "PUBLISHED"
            && isOccupyingScheduleIntent(block.intent)
            && block.recurrenceRule
            && !block.recurrenceEndDate
          ) {
            throw new ScheduleActionError("Occupying recurring blocks must have an end date.");
          }

          const updated = await tx.venueScheduleBlock.update({
            where: { id: block.id, venueId: validated.venueId },
            data: { status, updatedById: userId },
            select: { id: true, status: true },
          });

          if (status === "PUBLISHED" && isOccupyingScheduleIntent(block.intent)) {
            await materializeScheduleBlockReservations(tx, {
              blockId: block.id,
              venueId: block.venueId,
              organizationId: block.venue.organizationId,
              surfaceId: block.surfaceId,
              segmentId: block.segmentId,
              startsAt: block.startsAt,
              endsAt: block.endsAt,
              recurrenceRule: block.recurrenceRule,
              recurrenceEndDate: block.recurrenceEndDate,
              timezone: block.venue.timezone,
              actorId: userId,
            });
          } else if (
            status === "CANCELED"
            && block.status === "PUBLISHED"
            && isOccupyingScheduleIntent(block.intent)
          ) {
            await cancelScheduleBlockReservations(tx, block.id, userId);
          }

          return { updated, slug: block.venue.slug };
        });

        await logVenueActivity({
          venueId: validated.venueId,
          actorId: userId,
          action,
          resourceType: "VenueScheduleBlock",
          resourceId: result.updated.id,
          summary: `${status === "PUBLISHED" ? "Published" : "Canceled"} schedule block`,
        });
        revalidateSchedulePaths(validated.organizationId, validated.venueId, result.slug);
        return {
          success: true,
          data: {
            scheduleBlockId: result.updated.id,
            status: result.updated.status,
          },
        };
      } catch (error) {
        if (error instanceof VenueReservationConflictError) {
          return {
            success: false,
            error: "Schedule block conflicts with existing bookings at this venue.",
            details: { conflicts: error.conflicts },
          };
        }
        throw error;
      }
    }

    const block = await prisma.venueScheduleBlock.findFirst({
      where: { id: validated.scheduleBlockId, venueId: validated.venueId },
      select: {
        id: true,
        venueId: true,
        startsAt: true,
        endsAt: true,
        status: true,
        activityType: true,
        intent: true,
        surfaceId: true,
        segmentId: true,
        recurrenceRule: true,
        recurrenceEndDate: true,
        venue: { select: { organizationId: true, slug: true, timezone: true } },
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
          timezone: block.venue.timezone,
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
    if (error instanceof ScheduleActionError) {
      return { success: false, error: error.message };
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
      timezone: true,
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
  timezone: string;
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
        timezone: candidate.timezone,
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
  scope: { venueId: string; surfaceId: string },
  now: Date = new Date(),
  client: Prisma.TransactionClient = prisma as unknown as Prisma.TransactionClient,
): Promise<VenueBookingView[]> {
  const horizon = new Date(now.getTime() + RECURRENCE_HORIZON_MS);

  type CanonicalReservation = {
    id: string;
    startsAt: Date;
    endsAt: Date;
    surfaceId: string | null;
    segmentId: string | null;
    sourceScheduleBlock: { title: string } | null;
  };
  const canonicalReservations = (
    client as typeof client & {
      venueReservation?: {
        findMany?: (args: unknown) => Promise<CanonicalReservation[]>;
      };
    }
  ).venueReservation;

  const [reservations, seasonGames, eventGames, blocks, practices, requests] = await Promise.all([
    canonicalReservations?.findMany
      ? Promise.resolve(canonicalReservations.findMany({
          where: {
            venueId: scope.venueId,
            surfaceId: scope.surfaceId,
            status: { in: ["HELD", "CONFIRMED", "COMPLETED"] },
            endsAt: { gt: now },
            OR: [{ status: { not: "HELD" } }, { heldUntil: { gt: now } }],
          },
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            surfaceId: true,
            segmentId: true,
            sourceScheduleBlock: { select: { title: true } },
          },
          orderBy: { startsAt: "asc" },
        })).then((rows) => rows ?? [])
      : Promise.resolve([]),
    client.seasonGame.findMany({
      where: {
        venueId: scope.venueId,
        surfaceId: scope.surfaceId,
        venueReservationId: null,
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
    client.eventGame.findMany({
      where: {
        surfaceId: scope.surfaceId,
        venueReservationId: null,
        status: { not: "CANCELED" },
        event: { venueId: scope.venueId, status: "PUBLISHED" },
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
    client.venueScheduleBlock.findMany({
      where: {
        venueId: scope.venueId,
        surfaceId: scope.surfaceId,
        status: "PUBLISHED",
        intent: { in: ["OFFERING", "VENUE_ACTIVITY", "CLOSURE"] },
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
        venue: { select: { timezone: true } },
        reservationOccurrences: { select: { startsAt: true } },
      },
    }),
    client.practiceSession.findMany({
      where: {
        venueId: scope.venueId,
        surfaceId: scope.surfaceId,
        venueReservationId: null,
        startAt: { gte: now },
      },
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
    client.iceTimeRequest.findMany({
      where: {
        venueId: scope.venueId,
        status: { in: ["ACCEPTED", "PARTIALLY_ACCEPTED"] },
        venueReservation: null,
        OR: [
          {
            approvedStartAt: { not: null },
            approvedEndAt: { gt: now },
            approvedSurfaceId: scope.surfaceId,
          },
          {
            approvedStartAt: null,
            requestedEndAt: { gt: now },
            scheduleBlock: { surfaceId: scope.surfaceId },
          },
        ],
      },
      select: {
        id: true,
        requestedStartAt: true,
        requestedEndAt: true,
        approvedStartAt: true,
        approvedEndAt: true,
        approvedSurfaceId: true,
        approvedSegmentId: true,
        scheduleBlock: {
          select: { title: true, surfaceId: true, segmentId: true },
        },
      },
    }),
  ]);

  const bookings: VenueBookingView[] = [];

  for (const reservation of reservations) {
    bookings.push({
      id: reservation.id,
      source: "venueReservation",
      title: reservation.sourceScheduleBlock?.title ?? "Venue reservation",
      startAt: reservation.startsAt,
      endAt: reservation.endsAt,
      surfaceId: reservation.surfaceId,
      segmentId: reservation.segmentId,
      segmentName: null,
    });
  }

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
    const linkedOccurrenceStarts = new Set(
      (block.reservationOccurrences ?? []).map((reservation) => reservation.startsAt.getTime()),
    );
    const occurrence = nextFutureBlockOccurrence(block, now, horizon);
    if (!occurrence) continue;
    if (linkedOccurrenceStarts.has(occurrence.startAt.getTime())) continue;
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

  for (const request of requests) {
    const hasApprovalSnapshot =
      request.approvedStartAt !== null && request.approvedEndAt !== null;
    bookings.push({
      id: request.id,
      source: "iceTimeRequest" as VenueBookingView["source"],
      title: `Accepted request — ${request.scheduleBlock.title}`,
      startAt: request.approvedStartAt ?? request.requestedStartAt,
      endAt: request.approvedEndAt ?? request.requestedEndAt,
      surfaceId: hasApprovalSnapshot
        ? request.approvedSurfaceId
        : request.scheduleBlock.surfaceId,
      segmentId: hasApprovalSnapshot
        ? request.approvedSegmentId
        : request.scheduleBlock.segmentId,
      segmentName: null,
    });
  }

  const seen = new Set<string>();
  return bookings
    .filter((booking) => {
      const key = `${booking.source}:${booking.id}:${booking.startAt.getTime()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
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
    venue: { timezone: string };
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
        timezone: block.venue.timezone,
      },
      now,
      horizon
    );
    return occurrences[0] ?? null;
  } catch {
    return block.endsAt > now ? { startAt: block.startsAt, endAt: block.endsAt } : null;
  }
}

async function materializeScheduleBlockReservations(
  tx: Prisma.TransactionClient,
  input: {
    blockId: string;
    venueId: string;
    organizationId: string;
    surfaceId: string | null;
    segmentId: string | null;
    startsAt: Date;
    endsAt: Date;
    recurrenceRule: string | null;
    recurrenceEndDate: Date | null;
    timezone: string;
    actorId: string;
  },
): Promise<void> {
  const occurrences = input.recurrenceRule
    ? expandRecurrenceWindow(
        {
          startAt: input.startsAt,
          endAt: input.endsAt,
          recurrenceRule: input.recurrenceRule,
          recurrenceEndAt: input.recurrenceEndDate,
          timezone: input.timezone,
        },
        input.startsAt,
        input.recurrenceEndDate ?? input.endsAt,
      )
    : [{ startAt: input.startsAt, endAt: input.endsAt }];
  const desired = new Map(
    occurrences.map((occurrence) => [occurrence.startAt.getTime(), occurrence]),
  );
  const existing = await tx.venueReservation.findMany({
    where: { sourceScheduleBlockId: input.blockId },
    select: {
      id: true,
      venueId: true,
      surfaceId: true,
      segmentId: true,
      startsAt: true,
      endsAt: true,
      status: true,
    },
  });
  const existingByStart = new Map(
    existing.map((reservation) => [reservation.startsAt.getTime(), reservation]),
  );

  for (const reservation of existing) {
    const occurrence = desired.get(reservation.startsAt.getTime());
    const unchanged =
      occurrence
      && reservation.venueId === input.venueId
      && reservation.surfaceId === input.surfaceId
      && reservation.segmentId === input.segmentId
      && occurrence.endAt.getTime() === reservation.endsAt.getTime()
      && ["HELD", "CONFIRMED"].includes(reservation.status);
    if (unchanged) continue;
    if (reservation.status === "HELD" || reservation.status === "CONFIRMED") {
      await transitionVenueReservation(tx, {
        reservationId: reservation.id,
        nextStatus: "CANCELED",
        actorId: input.actorId,
        reason: "Schedule block occurrence replaced",
        allowAssignedDisposition: true,
      });
    }
    if (occurrence) {
      await tx.venueReservation.update({
        where: { id: reservation.id },
        data: { sourceScheduleBlockId: null },
      });
    }
  }

  for (const occurrence of desired.values()) {
    const previous = existingByStart.get(occurrence.startAt.getTime());
    const unchanged =
      previous
      && previous.venueId === input.venueId
      && previous.surfaceId === input.surfaceId
      && previous.segmentId === input.segmentId
      && occurrence.endAt.getTime() === previous.endsAt.getTime()
      && ["HELD", "CONFIRMED"].includes(previous.status);
    if (unchanged) continue;
    await createVenueReservation(tx, {
      venueId: input.venueId,
      surfaceId: input.surfaceId,
      segmentId: input.segmentId,
      startsAt: occurrence.startAt,
      endsAt: occurrence.endAt,
      timezone: input.timezone,
      ownerVenueOrganizationId: input.organizationId,
      sourceScheduleBlockId: input.blockId,
      actorId: input.actorId,
      venueWideReason: input.surfaceId
        ? null
        : "Venue schedule block venue-wide reservation",
    });
  }
}

function isOccupyingScheduleIntent(intent: string | null | undefined): boolean {
  return intent !== "OFFERING" && intent !== "INFORMATION";
}

async function cancelScheduleBlockReservations(
  tx: Prisma.TransactionClient,
  blockId: string,
  actorId: string,
): Promise<void> {
  const reservations = await tx.venueReservation.findMany({
    where: {
      sourceScheduleBlockId: blockId,
      status: { in: ["HELD", "CONFIRMED"] },
    },
    select: { id: true },
  });
  for (const reservation of reservations) {
    await transitionVenueReservation(tx, {
      reservationId: reservation.id,
      nextStatus: "CANCELED",
      actorId,
      reason: "Schedule block canceled",
      allowAssignedDisposition: true,
    });
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
    intent: scheduleBlockIntent(validated),
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
    intent: scheduleBlockIntent(validated),
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

function scheduleBlockIntent(
  validated: ReturnType<typeof venueScheduleBlockSchema.parse>,
): "OFFERING" | "VENUE_ACTIVITY" | "CLOSURE" | "INFORMATION" {
  if (validated.intent) return validated.intent;
  if (validated.registrationMode === "REQUEST_REQUIRED") return "OFFERING";
  if (validated.activityType === "CLOSURE") return "CLOSURE";
  return "VENUE_ACTIVITY";
}

/**
 * Data for the venue schedule board (FR-021/SC-006): every booking at the
 * venue over [from, to) from the five availability sources, plus the venue's
 * surfaces (with their active segments) and its non-archived schedule blocks
 * for the block CRUD dialogs.
 *
 * DRAFT blocks hold no availability, so `getVenueBookings` never returns
 * them; their occurrences overlapping the window are appended here so staff
 * can see, edit, and publish what they drafted (the client distinguishes
 * drafts via the returned `blocks` list). Recurring occurrences share the
 * block's id — key rows by id + startAt.
 */
export async function getVenueScheduleBoard(input: {
  organizationId: string;
  venueId: string;
  from: Date | string;
  to: Date | string;
}): Promise<
  ActionResult<{
    bookings: VenueBookingView[];
    surfaces: Array<{
      id: string;
      name: string;
      isActive: boolean;
      segments: Array<{ id: string; name: string }>;
    }>;
    blocks: Array<{
      id: string;
      title: string;
      description: string | null;
      activityType: string;
      audience: string;
      visibility: string;
      status: string;
      startsAt: Date;
      endsAt: Date;
      recurrenceRule: string | null;
      recurrenceStartDate: Date | null;
      recurrenceEndDate: Date | null;
      capacity: number | null;
      priceAmount: number | null;
      priceCurrency: string;
      priceLabel: string | null;
      registrationMode: string;
      externalRegistrationUrl: string | null;
      surfaceId: string | null;
      segmentId: string | null;
      segmentName: string | null;
    }>;
  }>
> {
  try {
    const validated = scheduleBlockCommandSchema
      .pick({ organizationId: true, venueId: true })
      .extend({
        from: z.coerce.date({ message: "Valid window start is required" }),
        to: z.coerce.date({ message: "Valid window end is required" }),
      })
      .refine((data) => data.to > data.from, { message: "Window end must be after start" })
      .parse(input);

    // Board windows are a week; cap generously so a bad caller can't request
    // an unbounded expansion of every recurring block at the venue.
    if (validated.to.getTime() - validated.from.getTime() > 35 * 24 * 60 * 60 * 1000) {
      return { success: false, error: "Schedule window is limited to 35 days." };
    }

    await requireVenueScheduleManager(validated.organizationId, validated.venueId);
    const venue = await ensureVenueContext(validated.organizationId, validated.venueId);

    const [bookings, surfaces, blockRows] = await Promise.all([
      getVenueBookings({
        venueId: validated.venueId,
        from: validated.from,
        to: validated.to,
      }),
      prisma.iceSurface.findMany({
        where: { venueId: validated.venueId },
        select: {
          id: true,
          name: true,
          isActive: true,
          segments: {
            where: { isActive: true },
            select: { id: true, name: true },
            orderBy: [{ createdAt: "asc" }, { name: "asc" }],
          },
        },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      }),
      prisma.venueScheduleBlock.findMany({
        where: { venueId: validated.venueId, status: { not: "ARCHIVED" } },
        select: {
          id: true,
          title: true,
          description: true,
          activityType: true,
          audience: true,
          visibility: true,
          status: true,
          startsAt: true,
          endsAt: true,
          recurrenceRule: true,
          recurrenceStartDate: true,
          recurrenceEndDate: true,
          capacity: true,
          priceAmount: true,
          priceCurrency: true,
          priceLabel: true,
          registrationMode: true,
          externalRegistrationUrl: true,
          surfaceId: true,
          segmentId: true,
          segment: { select: { name: true } },
        },
        orderBy: { startsAt: "asc" },
      }),
    ]);

    // Append DRAFT block occurrences overlapping the window (strict overlap,
    // matching the availability engine's semantics for published blocks).
    const draftViews: VenueBookingView[] = [];
    for (const block of blockRows) {
      if (block.status !== "DRAFT") continue;
      const base = {
        id: block.id,
        source: "scheduleBlock" as const,
        title: block.title,
        surfaceId: block.surfaceId,
        segmentId: block.segmentId,
        segmentName: block.segment?.name ?? null,
      };
      let occurrences: Array<{ startAt: Date; endAt: Date }>;
      if (block.recurrenceRule) {
        try {
          occurrences = expandRecurrenceWindow(
            {
              startAt: block.startsAt,
              endAt: block.endsAt,
              recurrenceRule: block.recurrenceRule,
              recurrenceEndAt: block.recurrenceEndDate,
              timezone: venue.timezone,
            },
            validated.from,
            validated.to
          );
        } catch {
          // Unsupported free-text rule: fall back to the base range so the
          // draft never silently vanishes from the board.
          occurrences = [{ startAt: block.startsAt, endAt: block.endsAt }];
        }
      } else {
        occurrences = [{ startAt: block.startsAt, endAt: block.endsAt }];
      }
      for (const occurrence of occurrences) {
        if (occurrence.startAt < validated.to && occurrence.endAt > validated.from) {
          draftViews.push({ ...base, startAt: occurrence.startAt, endAt: occurrence.endAt });
        }
      }
    }

    const allBookings = [...bookings, ...draftViews].sort(
      (a, b) => a.startAt.getTime() - b.startAt.getTime()
    );

    return {
      success: true,
      data: {
        bookings: allBookings,
        surfaces,
        blocks: blockRows.map(({ segment, ...block }) => ({
          ...block,
          segmentName: segment?.name ?? null,
        })),
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to load the venue schedule." };
  }
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
