import { z } from "zod";
import { Prisma } from "@prisma/client";
import {
  createVenueReservation,
  VenueReservationLifecycleError,
} from "@/lib/services/venue-reservations";
import {
  approvedSpaceWithinRequestedSpace,
  findLegacyAcceptedRequestConflicts,
} from "@/lib/services/venue-reservation-availability";
import { assertAssociationOperationsNotificationEvent } from "@/lib/services/association-operations-notification-registry";

/**
 * The ice-time request decision, run inside a caller-owned venue reservation
 * transaction. The `decideIceTimeRequest` server action authorizes the caller
 * from the session, parses the input and then calls this service; it is not a
 * server action itself.
 */

export const decisionSchema = z.object({
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

export async function assertVenueRequestManagerInTransaction(
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
