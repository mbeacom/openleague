"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { parseId } from "@/lib/utils/ids";
import {
  getUserLeagueRole,
  requireTeamMember,
  requireUserId,
  requireVenueRequestManager,
} from "@/lib/auth/session";
import type { ActionResult } from "@/lib/actions/venue-organizations";
import {
  submitIceTimeRequestSchema,
  type SubmitIceTimeRequestInput,
} from "@/lib/utils/validation";
import {
  sendIceTimeRequestDecisionEmail,
  sendIceTimeRequestSubmittedEmail,
} from "@/lib/email/templates";
import {
  transitionVenueReservation,
  VenueReservationConflictError,
  VenueReservationLifecycleError,
} from "@/lib/services/venue-reservations";
import { runVenueReservationTransaction } from "@/lib/services/venue-reservation-transaction";
import { getWholeSurfaceDefaultLabel } from "@/lib/utils/segment-presets";
import { expandRecurrenceWindow } from "@/lib/utils/venue-schedule";
import {
  assertVenueRequestManagerInTransaction,
  decideIceTimeRequestInTransaction,
  decisionSchema,
} from "@/lib/services/ice-time-request-decision";

const requestCommandSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID format"),
  venueId: z.string().cuid("Invalid venue ID format"),
  requestId: z.string().cuid("Invalid request ID format"),
  linkedActivityDisposition: z.enum(["UNASSIGN"]).optional(),
});

const annotationSchema = requestCommandSchema.pick({
  organizationId: true,
  venueId: true,
  requestId: true,
}).extend({
  decisionMessage: z.string().trim().min(1).max(1000),
});

export async function submitIceTimeRequest(
  input: SubmitIceTimeRequestInput
): Promise<ActionResult<{ requestId: string; status: string }>> {
  try {
    const validated = submitIceTimeRequestSchema.parse(input);
    const userId = await requireUserId();

    if (validated.requesterTeamId) {
      await requireTeamMember(validated.requesterTeamId);
    }

    if (validated.requesterLeagueId) {
      const role = await getUserLeagueRole(userId, validated.requesterLeagueId);
      if (!role) {
        return { success: false, error: "You are not authorized to request ice for that league" };
      }
    }

    const block = await prisma.venueScheduleBlock.findFirst({
      where: {
        id: validated.scheduleBlockId,
        venueId: validated.venueId,
        status: "PUBLISHED",
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        title: true,
        registrationMode: true,
        recurrenceRule: true,
        recurrenceEndDate: true,
        venue: {
          select: {
            id: true,
            name: true,
            organizationId: true,
            slug: true,
            timezone: true,
          },
        },
      },
    });

    if (!block) {
      return { success: false, error: "Available ice block not found" };
    }

    if (block.registrationMode !== "REQUEST_REQUIRED") {
      return { success: false, error: "That ice block is not accepting ice time requests" };
    }

    const offeringOccurrences = block.recurrenceRule
      ? expandRecurrenceWindow(
          {
            startAt: block.startsAt,
            endAt: block.endsAt,
            recurrenceRule: block.recurrenceRule,
            recurrenceEndAt: block.recurrenceEndDate,
            timezone: block.venue.timezone,
          },
          validated.requestedStartAt,
          validated.requestedEndAt,
        )
      : [{ startAt: block.startsAt, endAt: block.endsAt }];
    const requestedWithinOffering = offeringOccurrences.some(
      (occurrence) =>
        validated.requestedStartAt >= occurrence.startAt
        && validated.requestedEndAt <= occurrence.endAt,
    );
    if (!requestedWithinOffering) {
      return { success: false, error: "Requested time must be within the published available ice block" };
    }

    const request = await prisma.iceTimeRequest.create({
      data: {
        scheduleBlockId: block.id,
        venueId: block.venue.id,
        requesterUserId: userId,
        requesterTeamId: validated.requesterTeamId || null,
        requesterLeagueId: validated.requesterLeagueId || null,
        requesterOrganizationName: validated.requesterOrganizationName || null,
        contactName: validated.contactName,
        contactEmail: validated.contactEmail,
        contactPhone: validated.contactPhone || null,
        requestedStartAt: validated.requestedStartAt,
        requestedEndAt: validated.requestedEndAt,
        notes: validated.notes || null,
        status: "SUBMITTED",
      },
      select: { id: true, status: true },
    });

    const organizationId = block.venue.organizationId;
    const managerEmails = await getRequestManagerEmails(organizationId);
    if (organizationId && managerEmails.length > 0) {
      await sendIceTimeRequestSubmittedEmail({
        managerEmails,
        venueName: block.venue.name,
        scheduleTitle: block.title,
        contactName: validated.contactName,
        contactEmail: validated.contactEmail,
        requestId: request.id,
        organizationId,
        venueId: block.venue.id,
      });
    }

    revalidateRequestPaths(block.venue.organizationId, block.venue.id, block.venue.slug);
    return { success: true, data: { requestId: request.id, status: request.status } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to submit ice time request." };
  }
}

export async function decideIceTimeRequest(
  input: z.input<typeof decisionSchema>
): Promise<ActionResult<{
  requestId: string;
  status: string;
  decidedAt: Date | null;
  reservationId: string | null;
  notificationIds: string[];
}>> {
  try {
    const validated = decisionSchema.parse(input);
    const userId = await requireVenueRequestManager(validated.organizationId, validated.venueId);
    const decision = await runVenueReservationTransaction((tx) =>
      decideIceTimeRequestInTransaction(tx, validated, userId));

    if (!decision.success) {
      return { success: false, error: decision.error };
    }

    const { request, updated } = decision;

    if (
      validated.status !== "UNDER_REVIEW"
      && decision.notificationIds.length === 0
      && !decision.idempotentDecision
    ) {
      await sendIceTimeRequestDecisionEmail({
        contactEmail: request.contactEmail,
        venueName: request.venue.name,
        status: updated.status as "ACCEPTED" | "PARTIALLY_ACCEPTED" | "DECLINED",
        decisionMessage: validated.decisionMessage || null,
      });
    }

    revalidateRequestPaths(validated.organizationId, validated.venueId, request.venue.slug);
    if (decision.notificationLeagueId) {
      revalidatePath(`/league/${decision.notificationLeagueId}/operations`);
      revalidatePath(
        `/league/${decision.notificationLeagueId}/venue-reservations`,
      );
    }
    if (request.requesterTeamId) revalidatePath(`/teams/${request.requesterTeamId}`);
    return {
      success: true,
      data: {
        requestId: updated.id,
        status: updated.status,
        decidedAt: updated.decidedAt,
        reservationId: decision.reservationId,
        notificationIds: decision.notificationIds,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    if (error instanceof VenueReservationConflictError || error instanceof VenueReservationLifecycleError) {
      return { success: false, error: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return {
        success: false,
        error: "That ice time was updated by another manager. Please review the queue and try again.",
      };
    }
    return { success: false, error: "Failed to update ice time request." };
  }
}

export async function cancelIceTimeRequest(
  input: z.input<typeof requestCommandSchema>
): Promise<ActionResult<{ requestId: string; status: string }>> {
  return setRequestStatus(input, "CANCELED");
}

export async function expireIceTimeRequest(
  input: z.input<typeof requestCommandSchema>
): Promise<ActionResult<{ requestId: string; status: string }>> {
  return setRequestStatus(input, "EXPIRED");
}

export async function annotateIceTimeRequest(
  input: z.input<typeof annotationSchema>,
): Promise<ActionResult<{ requestId: string; decisionMessage: string }>> {
  try {
    const validated = annotationSchema.parse(input);
    const actorId = await requireVenueRequestManager(
      validated.organizationId,
      validated.venueId,
    );
    const updated = await runVenueReservationTransaction(async (tx) => {
      await assertVenueRequestManagerInTransaction(tx, {
        actorId,
        organizationId: validated.organizationId,
        venueId: validated.venueId,
      });
      const request = await tx.iceTimeRequest.findFirst({
        where: {
          id: validated.requestId,
          venueId: validated.venueId,
          venue: { organizationId: validated.organizationId },
        },
        select: { id: true, venue: { select: { slug: true } } },
      });
      if (!request) return null;
      const row = await tx.iceTimeRequest.update({
        where: { id: request.id },
        data: {
          decisionMessage: validated.decisionMessage,
          decidedById: actorId,
        },
        select: { id: true, decisionMessage: true },
      });
      return { ...row, slug: request.venue.slug };
    });
    if (!updated?.decisionMessage) {
      return { success: false, error: "Ice time request not found" };
    }
    revalidateRequestPaths(
      validated.organizationId,
      validated.venueId,
      updated.slug,
    );
    return {
      success: true,
      data: {
        requestId: updated.id,
        decisionMessage: updated.decisionMessage,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    if (error instanceof VenueReservationLifecycleError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to annotate ice time request." };
  }
}

export async function getVenueRequestQueue(
  organizationId: string,
  venueId: string
): Promise<
  ActionResult<{
    venueId: string;
    venueName: string;
    timezone: string;
    surfaceOptions: Array<{
      id: string;
      name: string;
      wholeLabel: string;
      segments: Array<{ id: string; name: string }>;
    }>;
    requests: Array<{
      id: string;
      contactName: string;
      contactEmail: string;
      status: string;
      timezone: string;
      requestedStartAt: Date;
      requestedEndAt: Date;
      approvedStartAt: Date | null;
      approvedEndAt: Date | null;
      requestedSurfaceId: string | null;
      requestedSurfaceName: string | null;
      requestedSegmentId: string | null;
      requestedSegmentName: string | null;
      approvedSurfaceId: string | null;
      approvedSurfaceName: string | null;
      approvedSegmentId: string | null;
      approvedSegmentName: string | null;
      reservation: {
        id: string;
        status: string;
        venueName: string;
        surfaceName: string | null;
        segmentName: string | null;
      } | null;
    }>;
  }>
> {
  try {
    const parsedOrganizationId = parseId(organizationId);
    const parsedVenueId = parseId(venueId);
    if (!parsedOrganizationId || !parsedVenueId) {
      return { success: false, error: "Failed to load request queue." };
    }
    organizationId = parsedOrganizationId;
    venueId = parsedVenueId;

    await requireVenueRequestManager(organizationId, venueId);
    const venue = await prisma.venue.findFirst({
      where: {
        id: venueId,
        organizationId,
      },
      select: {
        id: true,
        name: true,
        timezone: true,
        surfaces: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            surfaceType: true,
            wholeLabel: true,
            segments: {
              where: { isActive: true },
              select: { id: true, name: true },
              orderBy: [{ createdAt: "asc" }, { name: "asc" }],
            },
          },
          orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
        },
      },
    });

    if (!venue) {
      return { success: false, error: "Venue not found" };
    }

    const requests = await (prisma.iceTimeRequest.findMany as any)({
      where: {
        venueId,
        venue: { organizationId },
      },
      select: {
        id: true,
        contactName: true,
        contactEmail: true,
        status: true,
        venue: { select: { timezone: true } },
        requestedStartAt: true,
        requestedEndAt: true,
        approvedStartAt: true,
        approvedEndAt: true,
        approvedSurfaceId: true,
        approvedSegmentId: true,
        approvedSurface: { select: { name: true } },
        approvedSegment: { select: { name: true } },
        scheduleBlock: {
          select: {
            surfaceId: true,
            segmentId: true,
            surface: { select: { name: true } },
            segment: { select: { name: true } },
          },
        },
        venueReservation: {
          select: {
            id: true,
            status: true,
            venue: { select: { name: true } },
            surface: { select: { name: true } },
            segment: { select: { name: true } },
          },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }).then((rows: any[]) => rows.map(({
      venueReservation,
      venue: requestVenue,
      scheduleBlock,
      approvedSurface,
      approvedSegment,
      ...request
    }) => ({
      ...request,
      timezone: requestVenue.timezone,
      requestedSurfaceId: scheduleBlock?.surfaceId ?? null,
      requestedSurfaceName: scheduleBlock?.surface?.name ?? null,
      requestedSegmentId: scheduleBlock?.segmentId ?? null,
      requestedSegmentName: scheduleBlock?.segment?.name ?? null,
      approvedSurfaceName: approvedSurface?.name ?? null,
      approvedSegmentName: approvedSegment?.name ?? null,
      reservation: venueReservation
        ? {
            id: venueReservation.id,
            status: venueReservation.status,
            venueName: venueReservation.venue.name,
            surfaceName: venueReservation.surface?.name ?? null,
            segmentName: venueReservation.segment?.name ?? null,
          }
        : null,
    })));

    return {
      success: true,
      data: {
        venueId,
        venueName: venue.name,
        timezone: venue.timezone,
        surfaceOptions: venue.surfaces.map((surface) => ({
          id: surface.id,
          name: surface.name,
          wholeLabel:
            surface.wholeLabel ?? getWholeSurfaceDefaultLabel(surface.surfaceType),
          segments: surface.segments.map((segment) => ({
            id: segment.id,
            name: segment.name,
          })),
        })),
        requests,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to load request queue." };
  }
}

async function setRequestStatus(
  input: z.input<typeof requestCommandSchema>,
  status: "CANCELED" | "EXPIRED"
): Promise<ActionResult<{ requestId: string; status: string }>> {
  try {
    const validated = requestCommandSchema.parse(input);
    const actorId = await requireVenueRequestManager(
      validated.organizationId,
      validated.venueId,
    );
    const updated = await runVenueReservationTransaction(async (tx) => {
      await assertVenueRequestManagerInTransaction(tx, {
        actorId,
        organizationId: validated.organizationId,
        venueId: validated.venueId,
      });
      const request = await tx.iceTimeRequest.findFirst({
        where: {
          id: validated.requestId,
          venueId: validated.venueId,
          venue: { organizationId: validated.organizationId },
        },
        select: {
          id: true,
          status: true,
          venue: { select: { slug: true } },
          venueReservation: { select: { id: true, status: true } },
        },
      });
      if (!request) return null;
      if (request.status === status) {
        return { id: request.id, status: request.status, slug: request.venue.slug };
      }
      if (
        ["DECLINED", "CANCELED", "EXPIRED"].includes(request.status)
      ) {
        throw new VenueReservationLifecycleError(
          "This ice time request already has a different final status.",
        );
      }
      if (
        request.venueReservation
        && ["CONFIRMED", "HELD"].includes(request.venueReservation.status)
      ) {
        if (validated.linkedActivityDisposition === "UNASSIGN") {
          const linked = await tx.venueReservation.findUnique({
            where: { id: request.venueReservation.id },
            select: {
              events: { select: { id: true, type: true } },
              seasonGames: { select: { id: true } },
              eventGames: { select: { id: true } },
              signupEvents: { select: { id: true } },
              proposalEntries: { select: { id: true } },
            },
          });
          const unsupportedLinks =
            (linked?.seasonGames.length ?? 0)
            + (linked?.eventGames.length ?? 0)
            + (linked?.signupEvents.length ?? 0)
            + (linked?.proposalEntries.length ?? 0);
          if (
            unsupportedLinks > 0
            || linked?.events.some(({ type }) => type !== "PRACTICE")
          ) {
            throw new VenueReservationLifecycleError(
              "Use the linked activity workflow to dispose of non-practice assignments.",
            );
          }
          const linkedWhere = {
            venueReservationId: request.venueReservation.id,
          };
          await Promise.all([
            tx.event.deleteMany({
              where: { ...linkedWhere, type: "PRACTICE" },
            }),
            tx.practiceSession.updateMany({
              where: linkedWhere,
              data: {
                venueReservationId: null,
                venueId: null,
                surfaceId: null,
                segmentId: null,
                startAt: null,
                conflictOverriddenById: null,
                conflictOverriddenAt: null,
              },
            }),
          ]);
        }
        await transitionVenueReservation(tx, {
          reservationId: request.venueReservation.id,
          nextStatus: "RELEASED",
          actorId,
          reason: `Source ice time request ${status.toLowerCase()}`,
          allowAssignedDisposition: false,
        });
      }
      const row = await tx.iceTimeRequest.update({
        where: { id: request.id },
        data: { status },
        select: { id: true, status: true },
      });
      return { ...row, slug: request.venue.slug };
    });
    if (!updated) return { success: false, error: "Ice time request not found" };
    revalidateRequestPaths(validated.organizationId, validated.venueId, updated.slug);
    return { success: true, data: { requestId: updated.id, status: updated.status } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    if (error instanceof VenueReservationLifecycleError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to update ice time request." };
  }
}

async function findManagedRequest(organizationId: string, venueId: string, requestId: string) {
  return prisma.iceTimeRequest.findFirst({
    where: {
      id: requestId,
      venueId,
      venue: { organizationId },
    },
    select: {
      id: true,
      contactEmail: true,
      scheduleBlockId: true,
      requestedStartAt: true,
      requestedEndAt: true,
      venue: {
        select: {
          id: true,
          name: true,
          organizationId: true,
          slug: true,
        },
      },
    },
  });
}

async function getRequestManagerEmails(organizationId: string | null): Promise<string[]> {
  if (!organizationId) {
    return [];
  }

  const staff = await prisma.venueStaff.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      role: { in: ["OWNER", "MANAGER", "REQUEST_MANAGER"] },
    },
    select: {
      user: { select: { email: true } },
    },
  });

  return staff.map((member) => member.user.email);
}

function revalidateRequestPaths(organizationId: string | null, venueId: string, slug?: string | null) {
  if (organizationId) {
    revalidatePath(`/venue-admin/${organizationId}/venues/${venueId}/requests`);
  }
  if (slug) {
    revalidatePath(`/rinks/${slug}/schedule`);
  }
  revalidatePath(`/venues/${venueId}/schedule`);
  revalidatePath("/operations");
  revalidatePath("/venue-reservations");
}
