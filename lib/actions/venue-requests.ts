"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
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
  createVenueReservation,
  transitionVenueReservation,
  VenueReservationConflictError,
  VenueReservationLifecycleError,
} from "@/lib/services/venue-reservations";
import {
  approvedSpaceWithinRequestedSpace,
  findLegacyAcceptedRequestConflicts,
} from "@/lib/services/venue-reservation-availability";
import { runVenueReservationTransaction } from "@/lib/services/venue-reservation-transaction";
import { assertAssociationOperationsNotificationEvent } from "@/lib/services/association-operations-notification-registry";
import { getWholeSurfaceDefaultLabel } from "@/lib/utils/segment-presets";
import { expandRecurrenceWindow } from "@/lib/utils/venue-schedule";

const requestCommandSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID format"),
  venueId: z.string().cuid("Invalid venue ID format"),
  requestId: z.string().cuid("Invalid request ID format"),
  linkedActivityDisposition: z.enum(["UNASSIGN"]).optional(),
});

const decisionSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID format"),
  venueId: z.string().cuid("Invalid venue ID format"),
  requestId: z.string().cuid("Invalid request ID format"),
  status: z.enum(["UNDER_REVIEW", "ACCEPTED", "PARTIALLY_ACCEPTED", "DECLINED"]),
  approvedStartAt: z.coerce.date().optional(),
  approvedEndAt: z.coerce.date().optional(),
  approvedSurfaceId: z.string().cuid().nullable().optional(),
  approvedSegmentId: z.string().cuid().nullable().optional(),
  intentionalVenueWideClaim: z.boolean().default(false),
  decisionMessage: z.string().max(1000).optional(),
  overrideConflicts: z.boolean().default(false),
  overrideReason: z.string().max(1000).optional(),
}).superRefine((value, context) => {
  if (value.overrideConflicts && !value.overrideReason?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A reason is required to override conflicts",
      path: ["overrideReason"],
    });
  }
});

const annotationSchema = requestCommandSchema.pick({
  organizationId: true,
  venueId: true,
  requestId: true,
}).extend({
  decisionMessage: z.string().trim().min(1).max(1000),
});

async function assertVenueRequestManagerInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    organizationId: string;
    venueId: string;
  },
) {
  const staff = await tx.venueStaff.findFirst({
    where: {
      userId: input.actorId,
      organizationId: input.organizationId,
      status: "ACTIVE",
      role: { in: ["OWNER", "MANAGER", "REQUEST_MANAGER"] },
      OR: [{ venueId: null }, { venueId: input.venueId }],
    },
    select: { id: true },
  });
  if (!staff) {
    throw new VenueReservationLifecycleError(
      "You are not authorized to decide requests for this venue.",
    );
  }
}

async function assertVenueConflictOverrideInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    organizationId: string;
    venueId: string;
  },
) {
  const manager = await tx.venueStaff.findFirst({
    where: {
      userId: input.actorId,
      organizationId: input.organizationId,
      status: "ACTIVE",
      role: { in: ["OWNER", "MANAGER"] },
      OR: [{ venueId: null }, { venueId: input.venueId }],
    },
    select: { id: true },
  });
  if (!manager) {
    throw new VenueReservationLifecycleError(
      "Conflict overrides require venue-manager authorization.",
    );
  }
}

export type DecideIceTimeRequestTransactionHooks = {
  beforeCreateReservation?: () => Promise<void>;
};

export async function decideIceTimeRequestInTransaction(
  tx: Prisma.TransactionClient,
  validated: z.infer<typeof decisionSchema>,
  userId: string,
  hooks: DecideIceTimeRequestTransactionHooks = {},
) {
  await assertVenueRequestManagerInTransaction(tx, {
    actorId: userId,
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
      contactEmail: true,
      scheduleBlockId: true,
      requestedStartAt: true,
      requestedEndAt: true,
      requesterTeamId: true,
      requesterTeam: { select: { leagueId: true } },
      requesterLeagueId: true,
      requesterUserId: true,
      status: true,
      decidedAt: true,
      approvedStartAt: true,
      approvedEndAt: true,
      approvedSurfaceId: true,
      approvedSegmentId: true,
      venueReservation: {
        select: {
          id: true,
          status: true,
          startsAt: true,
          endsAt: true,
          surfaceId: true,
          segmentId: true,
        },
      },
      scheduleBlock: {
        select: { id: true, surfaceId: true, segmentId: true, intent: true },
      },
      venue: {
        select: {
          id: true,
          name: true,
          organizationId: true,
          slug: true,
          timezone: true,
          leagueId: true,
          team: { select: { leagueId: true } },
        },
      },
    },
  });

  if (!request) {
    return { success: false as const, error: "Ice time request not found" };
  }

  const approves = validated.status === "ACCEPTED"
    || validated.status === "PARTIALLY_ACCEPTED";
  const requestedSurfaceId = request.scheduleBlock?.surfaceId ?? null;
  const requestedSegmentId = request.scheduleBlock?.segmentId ?? null;
  const approvedStartAt = validated.approvedStartAt
    ?? (validated.status === "ACCEPTED" ? request.requestedStartAt : undefined);
  const approvedEndAt = validated.approvedEndAt
    ?? (validated.status === "ACCEPTED" ? request.requestedEndAt : undefined);
  // `null` is an intentional venue-wide / whole-surface selection. Only an
  // omitted field inherits the offered space.
  const approvedSurfaceId = validated.approvedSurfaceId === undefined
    ? requestedSurfaceId
    : validated.approvedSurfaceId;
  const approvedSegmentId = validated.approvedSegmentId === undefined
    ? requestedSegmentId
    : validated.approvedSegmentId;
  const exactInterval =
    approvedStartAt?.getTime() === request.requestedStartAt.getTime()
    && approvedEndAt?.getTime() === request.requestedEndAt.getTime();
  const exactSpace =
    approvedSurfaceId === requestedSurfaceId
    && approvedSegmentId === requestedSegmentId;
  const venueWideApproval = approves && approvedSurfaceId === null;
  const hasCompleteApprovalSnapshot =
    request.approvedStartAt !== null && request.approvedEndAt !== null;
  const approvalMatchesExistingSnapshot =
    hasCompleteApprovalSnapshot
    &&
    request.approvedStartAt?.getTime() === approvedStartAt?.getTime()
    && request.approvedEndAt?.getTime() === approvedEndAt?.getTime()
    && request.approvedSurfaceId === approvedSurfaceId
    && request.approvedSegmentId === approvedSegmentId;
  const nextStatus = approves
    ? exactInterval && exactSpace
      ? "ACCEPTED"
      : "PARTIALLY_ACCEPTED"
    : validated.status;
  const terminalStatuses = [
    "ACCEPTED",
    "PARTIALLY_ACCEPTED",
    "DECLINED",
  ] as const;
  const alreadyTerminal = terminalStatuses.includes(
    request.status as (typeof terminalStatuses)[number],
  );
  const idempotentApproval =
    approves
    && request.status === nextStatus
    && request.venueReservation?.status === "CONFIRMED"
    && request.approvedStartAt?.getTime() === approvedStartAt?.getTime()
    && request.approvedEndAt?.getTime() === approvedEndAt?.getTime()
    && request.approvedSurfaceId === approvedSurfaceId
    && request.approvedSegmentId === approvedSegmentId
    && request.venueReservation.startsAt.getTime()
      === approvedStartAt?.getTime()
    && request.venueReservation.endsAt.getTime()
      === approvedEndAt?.getTime()
    && request.venueReservation.surfaceId === approvedSurfaceId
    && request.venueReservation.segmentId === approvedSegmentId;
  const idempotentDecline =
    validated.status === "DECLINED"
    && request.status === "DECLINED"
    && request.venueReservation === null;
  const idempotentDecision = idempotentApproval || idempotentDecline;
  const legacyApprovalMaterialization =
    approves
    && request.venueReservation === null
    && ["ACCEPTED", "PARTIALLY_ACCEPTED"].includes(request.status)
    && request.status === nextStatus
    && (
      !hasCompleteApprovalSnapshot
      || approvalMatchesExistingSnapshot
    );
  const repairsLegacyApprovalSnapshot =
    legacyApprovalMaterialization && !hasCompleteApprovalSnapshot;
  if (
    ["CANCELED", "EXPIRED"].includes(request.status)
    || (
      alreadyTerminal
      && !idempotentDecision
      && !legacyApprovalMaterialization
    )
  ) {
    return {
      success: false as const,
      error:
        "This ice time request already has a different final decision.",
    };
  }

  let legacyAcceptedConflicts: Array<{ id: string }> = [];
  if (approves && !idempotentDecision) {
    if (
      !approvedStartAt
      || !approvedEndAt
      || approvedEndAt <= approvedStartAt
      || approvedStartAt < request.requestedStartAt
      || approvedEndAt > request.requestedEndAt
    ) {
      return { success: false as const, error: "Approved time must be within the original request" };
    }
    if (approvedSegmentId && !approvedSurfaceId) {
      return { success: false as const, error: "An approved segment requires an approved surface" };
    }
    if (!approvedSpaceWithinRequestedSpace(
      { surfaceId: requestedSurfaceId, segmentId: requestedSegmentId },
      { surfaceId: approvedSurfaceId ?? null, segmentId: approvedSegmentId ?? null },
    )) {
      return {
        success: false as const,
        error:
          "Approved space must stay within the requested venue, surface, and segment.",
      };
    }
    if (venueWideApproval && !validated.intentionalVenueWideClaim) {
      return {
        success: false as const,
        error:
          "Confirm the intentional venue-wide claim before approving without a surface.",
      };
    }
    if (venueWideApproval && !validated.overrideReason?.trim()) {
      return {
        success: false as const,
        error:
          "A reason is required for an intentional venue-wide claim.",
      };
    }
    if (request.scheduleBlock?.intent && request.scheduleBlock.intent !== "OFFERING") {
      return { success: false as const, error: "The source block is not a requestable offering" };
    }
    legacyAcceptedConflicts = await findLegacyAcceptedRequestConflicts(
      tx,
      {
        venueId: request.venue.id,
        surfaceId: approvedSurfaceId,
        segmentId: approvedSegmentId,
        startsAt: approvedStartAt,
        endsAt: approvedEndAt,
        excludeRequestId: request.id,
      },
    );
    if (legacyAcceptedConflicts.length > 0 && !validated.overrideConflicts) {
      return { success: false as const, error: "That ice time has already been accepted for another request" };
    }
    if (legacyAcceptedConflicts.length > 0) {
      await assertVenueConflictOverrideInTransaction(tx, {
        actorId: userId,
        organizationId: validated.organizationId,
        venueId: validated.venueId,
      });
    }
  }

  const decidedAt =
    validated.status === "UNDER_REVIEW" ? null : new Date();
  const updated = idempotentDecision
    || (legacyApprovalMaterialization && !repairsLegacyApprovalSnapshot)
    ? {
        id: request.id,
        status: request.status,
        decidedAt: request.decidedAt,
      }
    : await tx.iceTimeRequest.update({
        where: { id: request.id },
        data: repairsLegacyApprovalSnapshot
          ? {
              approvedStartAt,
              approvedEndAt,
              approvedSurfaceId,
              approvedSegmentId,
            }
          : {
              status: nextStatus,
              decisionMessage: validated.decisionMessage || null,
              decidedAt,
              decidedById: userId,
              ...(approves
                ? {
                    approvedStartAt,
                    approvedEndAt,
                    approvedSurfaceId,
                    approvedSegmentId,
                  }
                : {}),
            },
        select: { id: true, status: true, decidedAt: true },
      });

  let reservationId = request.venueReservation?.id ?? null;
  if (approves && !reservationId) {
    await hooks.beforeCreateReservation?.();

    const owner = request.requesterTeamId
      ? { ownerTeamId: request.requesterTeamId }
      : request.requesterLeagueId
        ? { ownerLeagueId: request.requesterLeagueId }
        : request.venue.organizationId
          ? { ownerVenueOrganizationId: request.venue.organizationId }
          : null;
    if (!owner) {
      throw new VenueReservationLifecycleError(
        "The venue must belong to a venue organization before approving a public request.",
      );
    }
    const reservation = await createVenueReservation(tx, {
      ...owner,
      venueId: request.venue.id,
      surfaceId: approvedSurfaceId,
      segmentId: approvedSegmentId,
      startsAt: approvedStartAt!,
      endsAt: approvedEndAt!,
      timezone: request.venue.timezone ?? "America/New_York",
      status: "CONFIRMED",
      sourceRequestId: request.id,
      offeringBlockId: request.scheduleBlockId,
      actorId: userId,
      venueWideReason: venueWideApproval
        ? validated.overrideReason?.trim()
        : undefined,
      overrideConflicts: validated.overrideConflicts,
      overrideReason:
        validated.overrideConflicts
          ? validated.overrideReason?.trim()
          : undefined,
    });
    reservationId = reservation?.id ?? null;
    if (
      reservationId
      && legacyAcceptedConflicts.length > 0
      && validated.overrideReason?.trim()
    ) {
      await tx.venueReservationOverride.create({
        data: {
          reservationId,
          actorId: userId,
          reason: validated.overrideReason.trim(),
          conflictingReservationIds: [],
          candidateSnapshot: {
            source: "LEGACY_ACCEPTED_REQUESTS",
            requestId: request.id,
            legacyAcceptedRequestIds: legacyAcceptedConflicts.map(({ id }) => id),
            venueId: request.venue.id,
            surfaceId: approvedSurfaceId,
            segmentId: approvedSegmentId,
            startsAt: approvedStartAt!.toISOString(),
            endsAt: approvedEndAt!.toISOString(),
          },
        },
      });
    }
  }

  const notificationIds: string[] = [];
  const notificationLeagueId =
    request.requesterLeagueId
    ?? request.requesterTeam?.leagueId
    ?? request.venue.leagueId
    ?? request.venue.team?.leagueId
    ?? null;
  if (validated.status !== "UNDER_REVIEW" && notificationLeagueId) {
    const eventType = nextStatus === "ACCEPTED"
      ? "association.venue_request.approved"
      : nextStatus === "PARTIALLY_ACCEPTED"
        ? "association.venue_request.partially_approved"
        : "association.venue_request.declined";
    const event = assertAssociationOperationsNotificationEvent({
      eventType,
      aggregateType: "VENUE_REQUEST",
      aggregateId: request.id,
      payload: { kind: "VENUE_REQUEST", data: { requestId: request.id } },
    });
    const dedupeKey = `${event.type}:${request.id}:${updated.status}`;
    const notification = await tx.notificationOutbox.upsert({
      where: {
        leagueId_dedupeKey: {
          leagueId: notificationLeagueId,
          dedupeKey,
        },
      },
      create: {
        leagueId: notificationLeagueId,
        recipientUserId: request.requesterUserId,
        recipientEmail: request.contactEmail.trim().toLowerCase(),
        eventType: event.type,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: { kind: "VENUE_REQUEST", data: { requestId: request.id } },
        dedupeKey,
      },
      update: {},
      select: { id: true },
    });
    notificationIds.push(notification.id);
  }

  return {
    success: true as const,
    request,
    updated,
    reservationId,
    notificationIds,
    notificationLeagueId,
    idempotentDecision,
  };
}

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
