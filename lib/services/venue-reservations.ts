import {
  VenueReservationStatus,
  VenueReservationUsageStatus,
  type Prisma,
} from "@prisma/client";
import {
  assertAssociationOperationsNotificationEvent,
  type AssociationOperationsNotificationEventType,
} from "@/lib/services/association-operations-notification-registry";
import {
  approvedSpaceWithinRequestedSpace,
  findVenueReservationWriteConflicts,
  type VenueReservationConflict,
} from "@/lib/services/venue-reservation-availability";
import { expandRecurrenceWindow } from "@/lib/utils/venue-schedule";

type Tx = Prisma.TransactionClient;

export class VenueReservationConflictError extends Error {
  constructor(readonly conflicts: VenueReservationConflict[]) {
    super("That venue space is no longer available.");
    this.name = "VenueReservationConflictError";
  }
}

export class VenueReservationLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VenueReservationLifecycleError";
  }
}

function canonicalConflictIds(conflicts: readonly VenueReservationConflict[]): string[] {
  return conflicts
    .filter((conflict) => !conflict.source || conflict.source === "venueReservation")
    .map(({ id }) => id);
}

function legacyConflictReferences(conflicts: readonly VenueReservationConflict[]) {
  return conflicts
    .filter((conflict) => conflict.source && conflict.source !== "venueReservation")
    .map((conflict) => ({
      id: conflict.id,
      source: conflict.source,
      title: conflict.title ?? null,
    }));
}

export function assertGenericRescheduleAllowed(
  reservation: { sourceRequestId: string | null },
): void {
  if (reservation.sourceRequestId) {
    throw new VenueReservationLifecycleError(
      "Request-backed reservations cannot be generically rescheduled. Venue staff must cancel or amend the approved request and approve a new request.",
    );
  }
}

export type VenueReservationOwnerInput = {
  ownerLeagueId?: string | null;
  ownerTeamId?: string | null;
  ownerVenueOrganizationId?: string | null;
};

export type CreateVenueReservationServiceInput =
  VenueReservationOwnerInput & {
    venueId: string;
    surfaceId?: string | null;
    segmentId?: string | null;
    startsAt: Date;
    endsAt: Date;
    timezone: string;
    status?: "HELD" | "CONFIRMED";
    heldUntil?: Date | null;
    sourceRequestId?: string | null;
    offeringBlockId?: string | null;
    sourceScheduleBlockId?: string | null;
    actorId: string;
    venueWideReason?: string | null;
    overrideConflicts?: boolean;
    overrideReason?: string | null;
    excludeReservationIds?: readonly string[];
  };

async function assertVenueAncestry(
  tx: Tx,
  input: {
    venueId: string;
    surfaceId?: string | null;
    segmentId?: string | null;
  },
): Promise<VenueContext> {
  const venue = await tx.venue.findUnique({
    where: { id: input.venueId },
    select: {
      id: true,
      isActive: true,
      organizationId: true,
      leagueId: true,
      teamId: true,
      timezone: true,
    },
  });
  if (!venue?.isActive) {
    throw new VenueReservationLifecycleError("Active venue not found.");
  }

  if (input.surfaceId) {
    const surface = await tx.iceSurface.findFirst({
      where: { id: input.surfaceId, venueId: input.venueId, isActive: true },
      select: { id: true },
    });
    if (!surface) {
      throw new VenueReservationLifecycleError(
        "The selected surface does not belong to the venue.",
      );
    }
  }

  if (input.segmentId) {
    if (!input.surfaceId) {
      throw new VenueReservationLifecycleError(
        "A segment reservation requires a surface.",
      );
    }
    const segment = await tx.surfaceSegment.findFirst({
      where: {
        id: input.segmentId,
        surfaceId: input.surfaceId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!segment) {
      throw new VenueReservationLifecycleError(
        "The selected segment does not belong to the surface.",
      );
    }
  }
  return venue;
}

function assertOneOwner(owner: VenueReservationOwnerInput): void {
  const owners = [
    owner.ownerLeagueId,
    owner.ownerTeamId,
    owner.ownerVenueOrganizationId,
  ].filter(Boolean);
  if (owners.length !== 1) {
    throw new VenueReservationLifecycleError(
      "Exactly one venue reservation owner is required.",
    );
  }
}

type ReservationOwner = {
  ownerLeagueId: string | null;
  ownerTeamId: string | null;
  ownerVenueOrganizationId: string | null;
};

type VenueContext = {
  id: string;
  organizationId: string | null;
  leagueId: string | null;
  teamId: string | null;
  timezone: string;
};

async function assertOwnerExists(
  tx: Tx,
  owner: VenueReservationOwnerInput,
): Promise<{ teamLeagueId: string | null }> {
  if (owner.ownerLeagueId) {
    const league = await tx.league.findUnique({
      where: { id: owner.ownerLeagueId },
      select: { id: true },
    });
    if (!league) {
      throw new VenueReservationLifecycleError(
        "The reservation owner league was not found.",
      );
    }
    return { teamLeagueId: null };
  }
  if (owner.ownerTeamId) {
    const team = await tx.team.findUnique({
      where: { id: owner.ownerTeamId },
      select: { leagueId: true },
    });
    if (!team) {
      throw new VenueReservationLifecycleError(
        "The reservation owner team was not found.",
      );
    }
    return { teamLeagueId: team.leagueId };
  }

  const organization = await tx.venueOrganization.findUnique({
    where: { id: owner.ownerVenueOrganizationId! },
    select: { id: true },
  });
  if (!organization) {
    throw new VenueReservationLifecycleError(
      "The reservation owner venue organization was not found.",
    );
  }
  return { teamLeagueId: null };
}

async function hasVenueStaffAuthorization(
  tx: Tx,
  input: {
    actorId: string;
    organizationId: string | null;
    venueId: string;
    roles: readonly (
      | "OWNER"
      | "MANAGER"
      | "SCHEDULER"
      | "REQUEST_MANAGER"
      | "CONTENT_EDITOR"
    )[];
  },
): Promise<boolean> {
  if (!input.organizationId) return false;
  return Boolean(await tx.venueStaff.findFirst({
    where: {
      userId: input.actorId,
      organizationId: input.organizationId,
      status: "ACTIVE",
      role: { in: [...input.roles] },
      OR: [{ venueId: null }, { venueId: input.venueId }],
    },
    select: { id: true },
  }));
}

async function hasOwnerAuthorization(
  tx: Tx,
  owner: ReservationOwner,
  actorId: string,
  venueId: string,
): Promise<boolean> {
  if (owner.ownerLeagueId) {
    return Boolean(await tx.leagueUser.findFirst({
      where: {
        userId: actorId,
        leagueId: owner.ownerLeagueId,
        role: "LEAGUE_ADMIN",
      },
      select: { id: true },
    }));
  }
  if (owner.ownerTeamId) {
    return Boolean(await tx.teamMember.findFirst({
      where: { userId: actorId, teamId: owner.ownerTeamId, role: "ADMIN" },
      select: { id: true },
    }));
  }
  if (owner.ownerVenueOrganizationId) {
    return hasVenueStaffAuthorization(tx, {
      actorId,
      organizationId: owner.ownerVenueOrganizationId,
      venueId,
      roles: ["OWNER", "MANAGER", "SCHEDULER"],
    });
  }
  return false;
}

async function assertOwnerVenueEligibility(
  tx: Tx,
  owner: VenueReservationOwnerInput,
  venue: VenueContext,
): Promise<void> {
  if (
    (owner.ownerLeagueId && venue.leagueId === owner.ownerLeagueId)
    || (owner.ownerTeamId && venue.teamId === owner.ownerTeamId)
    || (
      owner.ownerVenueOrganizationId
      && venue.organizationId === owner.ownerVenueOrganizationId
    )
  ) {
    return;
  }

  const relationship = owner.ownerLeagueId || owner.ownerTeamId
    ? await tx.venueRelationship.findFirst({
        where: {
          venueId: venue.id,
          status: "ACTIVE",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          ...(owner.ownerLeagueId
            ? {
                targetType: "LEAGUE",
                leagueId: owner.ownerLeagueId,
                teamId: null,
              }
            : {
                targetType: "TEAM",
                teamId: owner.ownerTeamId!,
                leagueId: null,
              }),
        },
        select: { id: true },
      })
    : null;
  if (!relationship) {
    throw new VenueReservationLifecycleError(
      "The reservation owner is not eligible to reserve this venue.",
    );
  }
}

async function reservationLeagueId(
  tx: Tx,
  owner: VenueReservationOwnerInput,
): Promise<string | null> {
  if (owner.ownerLeagueId) return owner.ownerLeagueId;
  if (!owner.ownerTeamId) return null;
  const team = await tx.team.findUnique({
    where: { id: owner.ownerTeamId },
    select: { leagueId: true },
  });
  return team?.leagueId ?? null;
}

async function queueAssociationEventForLeagueAdmins(
  tx: Tx,
  input: {
    leagueId: string | null;
    eventType: AssociationOperationsNotificationEventType;
    aggregateType: "VENUE_REQUEST" | "VENUE_RESERVATION";
    aggregateId: string;
    occurrenceKey: string;
    payload: {
      kind: "VENUE_REQUEST" | "VENUE_RESERVATION";
      data: Record<string, string | number | boolean | null>;
    };
  },
): Promise<void> {
  if (!input.leagueId) return;
  const validated = assertAssociationOperationsNotificationEvent(input);
  const recipients = await tx.leagueUser.findMany({
    where: { leagueId: input.leagueId, role: "LEAGUE_ADMIN" },
    select: { user: { select: { id: true, email: true } } },
  });
  if (recipients.length === 0) return;

  await tx.notificationOutbox.createMany({
    data: recipients.map(({ user }) => ({
      leagueId: input.leagueId!,
      recipientUserId: user.id,
      recipientEmail: user.email.trim().toLowerCase(),
      eventType: validated.type,
      aggregateType: validated.aggregateType,
      aggregateId: validated.aggregateId,
      payload: input.payload,
      dedupeKey: `${validated.type}:${validated.aggregateId}:${input.occurrenceKey}:user:${user.id}`,
    })),
    skipDuplicates: true,
  });
}

async function assertCreateAuthorizationAndSources(
  tx: Tx,
  input: CreateVenueReservationServiceInput,
  venue: VenueContext,
  teamLeagueId: string | null,
): Promise<void> {
  await assertOwnerVenueEligibility(tx, input, venue);

  const owner: ReservationOwner = {
    ownerLeagueId: input.ownerLeagueId ?? null,
    ownerTeamId: input.ownerTeamId ?? null,
    ownerVenueOrganizationId: input.ownerVenueOrganizationId ?? null,
  };
  const ownerAuthorized = await hasOwnerAuthorization(
    tx,
    owner,
    input.actorId,
    input.venueId,
  );
  const venueAuthorized = await hasVenueStaffAuthorization(tx, {
    actorId: input.actorId,
    organizationId: venue.organizationId,
    venueId: input.venueId,
    roles: input.sourceRequestId
      ? ["OWNER", "MANAGER", "REQUEST_MANAGER"]
      : input.sourceScheduleBlockId
        ? ["OWNER", "MANAGER", "SCHEDULER", "CONTENT_EDITOR"]
      : ["OWNER", "MANAGER", "SCHEDULER"],
  });
  if (
    input.sourceRequestId
      ? !venueAuthorized
      : !ownerAuthorized && !venueAuthorized
  ) {
    throw new VenueReservationLifecycleError(
      "The actor is not authorized to create this venue reservation.",
    );
  }

  let offering: {
    id: string;
    venueId: string;
    surfaceId: string | null;
    segmentId: string | null;
    startsAt: Date;
    endsAt: Date;
    recurrenceRule: string | null;
    recurrenceEndDate: Date | null;
  } | null = null;
  if (input.offeringBlockId) {
    offering = await tx.venueScheduleBlock.findFirst({
      where: {
        id: input.offeringBlockId,
        venueId: input.venueId,
        status: "PUBLISHED",
        intent: "OFFERING",
      },
      select: {
        id: true,
        venueId: true,
        surfaceId: true,
        segmentId: true,
        startsAt: true,
        endsAt: true,
        recurrenceRule: true,
        recurrenceEndDate: true,
      },
    });
    const offeringOccurrences = offering
      ? offering.recurrenceRule
        ? expandRecurrenceWindow(
            {
              startAt: offering.startsAt,
              endAt: offering.endsAt,
              recurrenceRule: offering.recurrenceRule,
              recurrenceEndAt: offering.recurrenceEndDate,
              timezone: venue.timezone,
            },
            input.startsAt,
            input.endsAt,
          )
        : [{ startAt: offering.startsAt, endAt: offering.endsAt }]
      : [];
    const offeringContainsInterval = offeringOccurrences.some(
      (occurrence) =>
        occurrence.startAt <= input.startsAt && occurrence.endAt >= input.endsAt,
    );
    const offeringContainsSpace = offering
      ? approvedSpaceWithinRequestedSpace(
          {
            surfaceId: offering.surfaceId,
            segmentId: offering.segmentId,
          },
          {
            surfaceId: input.surfaceId ?? null,
            segmentId: input.segmentId ?? null,
          },
        )
      : false;
    if (
      !offering
      || !offeringContainsInterval
      || !offeringContainsSpace
    ) {
      throw new VenueReservationLifecycleError(
        "The offering does not contain the venue reservation.",
      );
    }
  }

  if (input.sourceScheduleBlockId) {
    const sourceBlock = await tx.venueScheduleBlock.findFirst({
      where: {
        id: input.sourceScheduleBlockId,
        venueId: input.venueId,
        status: "PUBLISHED",
        intent: { notIn: ["OFFERING", "INFORMATION"] },
      },
      select: { id: true },
    });
    if (!sourceBlock) {
      throw new VenueReservationLifecycleError(
        "The source schedule block does not match the venue reservation.",
      );
    }
  }

  if (!input.sourceRequestId) return;
  if (!input.offeringBlockId) {
    throw new VenueReservationLifecycleError(
      "A source request requires its offering.",
    );
  }
  const request = await tx.iceTimeRequest.findUnique({
    where: { id: input.sourceRequestId },
    select: {
      status: true,
      venueId: true,
      scheduleBlockId: true,
      approvedStartAt: true,
      approvedEndAt: true,
      approvedSurfaceId: true,
      approvedSegmentId: true,
      requestedStartAt: true,
      requestedEndAt: true,
      requesterTeamId: true,
      requesterLeagueId: true,
      venueReservation: { select: { id: true } },
    },
  });
  const requesterOwnsReservation = input.ownerTeamId
    ? request?.requesterTeamId === input.ownerTeamId
      && (
        request.requesterLeagueId === null
        || request.requesterLeagueId === teamLeagueId
      )
    : input.ownerLeagueId
      ? request?.requesterLeagueId === input.ownerLeagueId
        && request.requesterTeamId === null
      : input.ownerVenueOrganizationId
        ? request?.requesterLeagueId === null
          && request.requesterTeamId === null
          && venue.organizationId === input.ownerVenueOrganizationId
        : false;
  if (
    !request
    || !["ACCEPTED", "PARTIALLY_ACCEPTED"].includes(request.status)
    || request.venueId !== input.venueId
    || request.scheduleBlockId !== offering?.id
    || request.approvedStartAt?.getTime() !== input.startsAt.getTime()
    || request.approvedEndAt?.getTime() !== input.endsAt.getTime()
    || request.approvedSurfaceId !== (input.surfaceId ?? null)
    || request.approvedSegmentId !== (input.segmentId ?? null)
    || request.requestedStartAt > input.startsAt
    || request.requestedEndAt < input.endsAt
    || request.venueReservation
    || !requesterOwnsReservation
  ) {
    throw new VenueReservationLifecycleError(
      "The source request does not match the venue reservation.",
    );
  }
}

export async function createVenueReservation(
  tx: Tx,
  input: CreateVenueReservationServiceInput,
) {
  if (input.endsAt <= input.startsAt) {
    throw new VenueReservationLifecycleError(
      "Venue reservation end time must be after its start time.",
    );
  }
  assertOneOwner(input);
  const venue = await assertVenueAncestry(tx, input);
  if (input.timezone !== venue.timezone) {
    throw new VenueReservationLifecycleError(
      "Venue reservation timezone must match the venue timezone.",
    );
  }
  const { teamLeagueId } = await assertOwnerExists(tx, input);

  const status = input.status ?? "CONFIRMED";
  if (status === "HELD" && !input.heldUntil) {
    throw new VenueReservationLifecycleError(
      "Held venue reservations require an expiration time.",
    );
  }
  if (
    (input.surfaceId === null || input.surfaceId === undefined)
    && !input.venueWideReason?.trim()
  ) {
    throw new VenueReservationLifecycleError(
      "Venue-wide reservations require a reason.",
    );
  }
  await assertCreateAuthorizationAndSources(tx, input, venue, teamLeagueId);

  if (
    input.surfaceId === null || input.surfaceId === undefined
  ) {
    const venueManagerAuthorized = await hasVenueStaffAuthorization(tx, {
      actorId: input.actorId,
      organizationId: venue.organizationId,
      venueId: input.venueId,
      roles: input.sourceScheduleBlockId
        ? ["OWNER", "MANAGER", "SCHEDULER", "CONTENT_EDITOR"]
        : ["OWNER", "MANAGER"],
    });
    if (!venueManagerAuthorized) {
      throw new VenueReservationLifecycleError(
        "Venue-wide reservations require venue-manager authorization.",
      );
    }
  }

  const conflicts = await findVenueReservationWriteConflicts(tx, {
    venueId: input.venueId,
    surfaceId: input.surfaceId,
    segmentId: input.segmentId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    excludeReservationIds: input.excludeReservationIds,
    excludeBlockId: input.sourceScheduleBlockId ?? undefined,
    excludeRequestId: input.sourceRequestId ?? undefined,
  });
  if (
    conflicts.length > 0
    && (!input.overrideConflicts || !input.overrideReason?.trim())
  ) {
    throw new VenueReservationConflictError(conflicts);
  }
  if (conflicts.length > 0) {
    const venueManagerAuthorized = await hasVenueStaffAuthorization(tx, {
      actorId: input.actorId,
      organizationId: venue.organizationId,
      venueId: input.venueId,
      roles: ["OWNER", "MANAGER"],
    });
    if (!venueManagerAuthorized) {
      throw new VenueReservationLifecycleError(
        "Conflict overrides require venue-manager authorization.",
      );
    }
  }

  const now = new Date();
  const leagueId = await reservationLeagueId(tx, input);
  const reservation = await tx.venueReservation.create({
    data: {
      status,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      timezone: venue.timezone,
      heldUntil: status === "HELD" ? input.heldUntil : null,
      confirmedAt: status === "CONFIRMED" ? now : null,
      venueId: input.venueId,
      surfaceId: input.surfaceId ?? null,
      segmentId: input.segmentId ?? null,
      ownerLeagueId: input.ownerLeagueId ?? null,
      ownerTeamId: input.ownerTeamId ?? null,
      ownerVenueOrganizationId: input.ownerVenueOrganizationId ?? null,
      sourceRequestId: input.sourceRequestId ?? null,
      offeringBlockId: input.offeringBlockId ?? null,
      sourceScheduleBlockId: input.sourceScheduleBlockId ?? null,
      createdById: input.actorId,
      transitions: {
        create: {
          previousStatus: null,
          nextStatus: status,
          actorId: input.actorId,
          reason: "Venue reservation created",
          snapshot: {
            venueId: input.venueId,
            surfaceId: input.surfaceId ?? null,
            segmentId: input.segmentId ?? null,
            startsAt: input.startsAt.toISOString(),
            endsAt: input.endsAt.toISOString(),
          },
        },
      },
      ...(conflicts.length > 0
        ? {
            overrides: {
              create: {
                actorId: input.actorId,
                reason: input.overrideReason!.trim(),
                candidateSnapshot: {
                  venueId: input.venueId,
                  surfaceId: input.surfaceId ?? null,
                  segmentId: input.segmentId ?? null,
                  startsAt: input.startsAt.toISOString(),
                  endsAt: input.endsAt.toISOString(),
                   legacyConflicts: legacyConflictReferences(conflicts),
                },
                conflictingReservationIds: canonicalConflictIds(conflicts),
              },
            },
          }
        : {}),
    },
  });

  await tx.auditLog.create({
    data: {
      action: "VENUE_RESERVATION_CREATED",
      userId: input.actorId,
      leagueId,
      teamId: input.ownerTeamId ?? null,
      resourceId: reservation.id,
      resourceType: "VenueReservation",
      details: {
        status,
        venueId: input.venueId,
        conflictOverrideCount: conflicts.length,
        venueWideReason: input.venueWideReason?.trim() ?? null,
      },
    },
  });

  if (status === "CONFIRMED") {
    await queueAssociationEventForLeagueAdmins(tx, {
      leagueId,
      eventType: "association.venue_reservation.confirmed",
      aggregateType: "VENUE_RESERVATION",
      aggregateId: reservation.id,
      occurrenceKey: `confirmed:${now.toISOString()}`,
      payload: {
        kind: "VENUE_RESERVATION",
        data: { venueReservationId: reservation.id },
      },
    });
  }

  return reservation;
}

const ALLOWED_TRANSITIONS: Record<
  VenueReservationStatus,
  readonly VenueReservationStatus[]
> = {
  HELD: ["CONFIRMED", "RELEASED", "CANCELED"],
  CONFIRMED: ["RELEASED", "CANCELED", "COMPLETED"],
  RELEASED: [],
  CANCELED: [],
  COMPLETED: [],
};

export async function transitionVenueReservation(
  tx: Tx,
  input: {
    reservationId: string;
    nextStatus: VenueReservationStatus;
    actorId: string;
    reason: string;
    usageStatus?: VenueReservationUsageStatus;
    allowAssignedDisposition?: boolean;
    overrideConflicts?: boolean;
    overrideReason?: string;
    snapshot?: Prisma.InputJsonValue;
  },
) {
  const reservation = await tx.venueReservation.findUnique({
    where: { id: input.reservationId },
    include: {
      events: {
        select: {
          id: true,
          teamId: true,
          type: true,
          venueId: true,
          startAt: true,
          endAt: true,
        },
      },
      seasonGames: { select: { id: true } },
      eventGames: { select: { id: true } },
      signupEvents: { select: { id: true } },
      practiceSessions: {
        select: {
          id: true,
          teamId: true,
          venueId: true,
          startAt: true,
          duration: true,
        },
      },
      venue: { select: { organizationId: true } },
    },
  });
  if (!reservation) {
    throw new VenueReservationLifecycleError("Venue reservation not found.");
  }
  assertOneOwner(reservation);
  if (!input.reason.trim()) {
    throw new VenueReservationLifecycleError(
      "A reservation transition requires a reason.",
    );
  }
  const ownerAuthorized = await hasOwnerAuthorization(
    tx,
    reservation,
    input.actorId,
    reservation.venueId,
  );
  const venueAuthorized = await hasVenueStaffAuthorization(tx, {
    actorId: input.actorId,
    organizationId: reservation.venue.organizationId,
    venueId: reservation.venueId,
    roles: ["OWNER", "MANAGER", "SCHEDULER", "REQUEST_MANAGER"],
  });
  if (!ownerAuthorized && !venueAuthorized) {
    throw new VenueReservationLifecycleError(
      "The actor is not authorized to transition this venue reservation.",
    );
  }
  if (!ALLOWED_TRANSITIONS[reservation.status].includes(input.nextStatus)) {
    throw new VenueReservationLifecycleError(
      `Cannot move a venue reservation from ${reservation.status} to ${input.nextStatus}.`,
    );
  }

  let confirmationConflicts: VenueReservationConflict[] = [];
  if (reservation.status === "HELD" && input.nextStatus === "CONFIRMED") {
    const now = new Date();
    if (!reservation.heldUntil || reservation.heldUntil <= now) {
      throw new VenueReservationLifecycleError(
        "This venue reservation hold has expired.",
      );
    }
    confirmationConflicts = await findVenueReservationWriteConflicts(tx, {
      venueId: reservation.venueId,
      surfaceId: reservation.surfaceId,
      segmentId: reservation.segmentId,
      startsAt: reservation.startsAt,
      endsAt: reservation.endsAt,
      excludeReservationId: reservation.id,
      now,
    });
    if (
      confirmationConflicts.length > 0
      && (!input.overrideConflicts || !input.overrideReason?.trim())
    ) {
      throw new VenueReservationConflictError(confirmationConflicts);
    }
    if (confirmationConflicts.length > 0) {
      const mayOverride = await hasVenueStaffAuthorization(tx, {
        actorId: input.actorId,
        organizationId: reservation.venue.organizationId,
        venueId: reservation.venueId,
        roles: ["OWNER", "MANAGER"],
      });
      if (!mayOverride) {
        throw new VenueReservationLifecycleError(
          "Conflict overrides require exact venue-manager authorization.",
        );
      }
    }
  }

  const assigned =
    reservation.events.length
    + reservation.seasonGames.length
    + reservation.eventGames.length
    + reservation.signupEvents.length
    + reservation.practiceSessions.length
    > 0;
  if (
    assigned
    && ["RELEASED", "CANCELED"].includes(input.nextStatus)
    && !input.allowAssignedDisposition
  ) {
    throw new VenueReservationLifecycleError(
      "Resolve linked activities before releasing or canceling this venue reservation.",
    );
  }

  const now = new Date();
  const updated = await tx.venueReservation.update({
    where: { id: reservation.id },
    data: {
      status: input.nextStatus,
      usageStatus: input.usageStatus,
      heldUntil: input.nextStatus === "CONFIRMED" ? null : reservation.heldUntil,
      confirmedAt:
        input.nextStatus === "CONFIRMED"
          ? now
          : reservation.confirmedAt,
      releasedAt: input.nextStatus === "RELEASED" ? now : null,
      canceledAt: input.nextStatus === "CANCELED" ? now : null,
      completedAt: input.nextStatus === "COMPLETED" ? now : null,
      transitions: {
        create: {
          previousStatus: reservation.status,
          nextStatus: input.nextStatus,
          actorId: input.actorId,
          reason: input.reason.trim(),
          snapshot: input.snapshot,
        },
      },
      ...(confirmationConflicts.length > 0
        ? {
            overrides: {
              create: {
                actorId: input.actorId,
                reason: input.overrideReason!.trim(),
                candidateSnapshot: {
                  venueId: reservation.venueId,
                  surfaceId: reservation.surfaceId,
                  segmentId: reservation.segmentId,
                  startsAt: reservation.startsAt.toISOString(),
                  endsAt: reservation.endsAt.toISOString(),
                  legacyConflicts: legacyConflictReferences(confirmationConflicts),
                },
                conflictingReservationIds: canonicalConflictIds(confirmationConflicts),
              },
            },
          }
        : {}),
    },
  });

  const leagueId = await reservationLeagueId(tx, reservation);
  await tx.auditLog.create({
    data: {
      action: `VENUE_RESERVATION_${input.nextStatus}`,
      userId: input.actorId,
      leagueId,
      teamId: reservation.ownerTeamId,
      resourceId: reservation.id,
      resourceType: "VenueReservation",
      details: { previousStatus: reservation.status, reason: input.reason },
    },
  });

  if (input.nextStatus === "RELEASED" || input.nextStatus === "CANCELED") {
    await queueAssociationEventForLeagueAdmins(tx, {
      leagueId,
      eventType:
        input.nextStatus === "RELEASED"
          ? "association.venue_reservation.released"
          : "association.venue_reservation.canceled",
      aggregateType: "VENUE_RESERVATION",
      aggregateId: reservation.id,
      occurrenceKey: `${input.nextStatus.toLowerCase()}:${now.toISOString()}`,
      payload: {
        kind: "VENUE_RESERVATION",
        data: { venueReservationId: reservation.id },
      },
    });
  }

  return updated;
}

type AssignmentScope = {
  leagueId: string | null;
  teamIds: string[];
  organizationId: string | null;
  authorization:
    | { type: "LEAGUE"; id: string }
    | { type: "TEAM"; id: string }
    | { type: "ORGANIZATION"; id: string };
};

async function assertAssignmentScope(
  tx: Tx,
  reservation: ReservationOwner & { venueId: string },
  scope: AssignmentScope,
  actorId: string,
): Promise<void> {
  if (
    reservation.ownerVenueOrganizationId
    && scope.authorization.type !== "ORGANIZATION"
  ) {
    throw new VenueReservationLifecycleError(
      "Venue-organization-owned public request reservations cannot be assigned to association or team activities.",
    );
  }
  const ownerMatches = reservation.ownerLeagueId
    ? scope.leagueId === reservation.ownerLeagueId
    : reservation.ownerTeamId
      ? scope.teamIds.includes(reservation.ownerTeamId)
      : scope.organizationId === reservation.ownerVenueOrganizationId;
  if (!ownerMatches) {
    throw new VenueReservationLifecycleError(
      "The assignment target is outside the reservation owner's scope.",
    );
  }
  const hasReservationOwnerAuthorization = await hasOwnerAuthorization(
    tx,
    reservation,
    actorId,
    reservation.venueId,
  );
  if (!hasReservationOwnerAuthorization) {
    throw new VenueReservationLifecycleError(
      "The actor is not authorized for the reservation owner.",
    );
  }

  // A league-owned reservation is association inventory. The verified
  // league-level scheduling authority established above may assign it to any
  // target whose reloaded ancestry resolves to that same league. Team-owned
  // inventory deliberately continues through the exact-team check below.
  if (
    reservation.ownerLeagueId
    && scope.leagueId === reservation.ownerLeagueId
  ) {
    return;
  }

  let targetAuthorized = false;
  if (scope.authorization.type === "LEAGUE") {
    targetAuthorized = Boolean(await tx.leagueUser.findFirst({
      where: {
        userId: actorId,
        leagueId: scope.authorization.id,
        role: "LEAGUE_ADMIN",
      },
      select: { id: true },
    }));
  } else if (scope.authorization.type === "TEAM") {
    targetAuthorized = Boolean(await tx.teamMember.findFirst({
      where: {
        userId: actorId,
        teamId: scope.authorization.id,
        role: "ADMIN",
      },
      select: { id: true },
    }));
  } else {
    targetAuthorized = await hasVenueStaffAuthorization(tx, {
      actorId,
      organizationId: scope.authorization.id,
      venueId: reservation.venueId,
      roles: ["OWNER", "MANAGER", "SCHEDULER"],
    });
  }
  if (!targetAuthorized) {
    throw new VenueReservationLifecycleError(
      "The actor is not authorized for the assignment target.",
    );
  }
}

export async function assignVenueReservation(
  tx: Tx,
  input: {
    reservationId: string;
    targetType:
      | "SEASON_GAME"
      | "PRACTICE"
      | "EVENT"
      | "SIGNUP_EVENT"
      | "EVENT_GAME";
    targetId: string;
    actorId: string;
    excludeReservationIds?: readonly string[];
    overrideConflicts?: boolean;
    overrideReason?: string | null;
  },
) {
  const reservation = await tx.venueReservation.findUnique({
    where: { id: input.reservationId },
    include: {
      events: {
        select: {
          id: true,
          teamId: true,
          type: true,
          venueId: true,
          startAt: true,
          endAt: true,
        },
      },
      seasonGames: { select: { id: true, eventId: true } },
      eventGames: { select: { id: true, eventId: true } },
      signupEvents: { select: { id: true } },
      practiceSessions: {
        select: {
          id: true,
          teamId: true,
          venueId: true,
          startAt: true,
          duration: true,
        },
      },
      proposalEntries: { select: { id: true } },
    },
  });
  if (!reservation || reservation.status !== "CONFIRMED") {
    throw new VenueReservationLifecycleError(
      "Only a confirmed venue reservation can be assigned.",
    );
  }
  assertOneOwner(reservation);

  const totalLinkCount =
    reservation.events.length
    + reservation.seasonGames.length
    + reservation.eventGames.length
    + reservation.signupEvents.length
    + reservation.practiceSessions.length
    + reservation.proposalEntries.length;
  let assignmentConflicts: Awaited<
    ReturnType<typeof findVenueReservationWriteConflicts>
  > = [];
  let conflictsChecked = false;
  const checkAssignmentConflicts = async () => {
    if (conflictsChecked) return;
    conflictsChecked = true;
    assignmentConflicts = await findVenueReservationWriteConflicts(tx, {
      venueId: reservation.venueId,
      surfaceId: reservation.surfaceId,
      segmentId: reservation.segmentId,
      startsAt: reservation.startsAt,
      endsAt: reservation.endsAt,
      excludeReservationIds: [
        reservation.id,
        ...(input.excludeReservationIds ?? []),
      ],
      ...(input.targetType === "EVENT" ? { excludeEventId: input.targetId } : {}),
      ...(input.targetType === "SEASON_GAME"
        ? { excludeSeasonGameId: input.targetId }
        : {}),
      ...(input.targetType === "EVENT_GAME"
        ? { excludeEventGameId: input.targetId }
        : {}),
      ...(input.targetType === "PRACTICE"
        ? { excludePracticeId: input.targetId }
        : {}),
    });
    if (
      assignmentConflicts.length > 0
      && (!input.overrideConflicts || !input.overrideReason?.trim())
    ) {
      throw new VenueReservationConflictError(assignmentConflicts);
    }
    if (assignmentConflicts.length > 0) {
      const venue = await tx.venue.findUnique({
        where: { id: reservation.venueId },
        select: { organizationId: true },
      });
      const mayOverride = await hasVenueStaffAuthorization(tx, {
        actorId: input.actorId,
        organizationId: venue?.organizationId ?? null,
        venueId: reservation.venueId,
        roles: ["OWNER", "MANAGER"],
      });
      if (!mayOverride) {
        throw new VenueReservationLifecycleError(
          "Conflict overrides require exact venue-manager authorization.",
        );
      }
    }
  };
  const targetSpaceMatches = (target: {
    surfaceId: string | null;
    segmentId: string | null;
  }) =>
    reservation.surfaceId === null
    || (
      target.surfaceId === reservation.surfaceId
      && (
        reservation.segmentId === null
        || target.segmentId === reservation.segmentId
      )
    );

  switch (input.targetType) {
    case "EVENT": {
      const event = await tx.event.findUnique({
        where: { id: input.targetId },
        include: {
          team: { select: { leagueId: true } },
          homeTeam: { select: { leagueId: true } },
          awayTeam: { select: { leagueId: true } },
          seasonGame: {
            select: { id: true, venueReservationId: true },
          },
        },
      });
      if (!event) {
        throw new VenueReservationLifecycleError("Event not found.");
      }
      if (
        event.venueReservationId
        && event.venueReservationId !== reservation.id
      ) {
        throw new VenueReservationLifecycleError(
          "The Event is linked to another venue reservation.",
        );
      }
      const eventTeamLeagueIds = [
        event.team.leagueId,
        event.homeTeam?.leagueId,
        event.awayTeam?.leagueId,
      ];
      const eventLeagueId = event.leagueId ?? event.team.leagueId;
      if (
        eventTeamLeagueIds.some(
          (id) => id !== undefined && id !== eventLeagueId,
        )
      ) {
        throw new VenueReservationLifecycleError(
          "The Event has inconsistent owner ancestry.",
        );
      }
      await assertAssignmentScope(tx, reservation, {
        leagueId: eventLeagueId,
        teamIds: [event.teamId, event.homeTeamId, event.awayTeamId].filter(
          (id): id is string => Boolean(id),
        ),
        organizationId: null,
        authorization: { type: "TEAM", id: event.teamId },
      }, input.actorId);
      const isLinkedSeasonGameAlias =
        !!event.seasonGame
        && reservation.seasonGames.some(
          ({ id }) => id === event.seasonGame!.id,
        )
        && event.seasonGame.venueReservationId === reservation.id;
      const isLinkedPracticeAlias =
        event.type === "PRACTICE"
        && reservation.practiceSessions.length === 1
        && reservation.practiceSessions[0].teamId === event.teamId
        && reservation.practiceSessions[0].venueId === reservation.venueId
        && reservation.practiceSessions[0].startAt?.getTime()
          === reservation.startsAt.getTime()
        && reservation.practiceSessions[0].startAt!.getTime()
          + reservation.practiceSessions[0].duration * 60_000
          === reservation.endsAt.getTime()
        && reservation.seasonGames.length === 0
        && reservation.eventGames.length === 0
        && reservation.signupEvents.length === 0
        && reservation.proposalEntries.length === 0;
      const isIdempotent = event.venueReservationId === reservation.id;
      const allowedLinkCount =
        (isIdempotent ? 1 : 0)
        + (isLinkedSeasonGameAlias || isLinkedPracticeAlias ? 1 : 0);
      if (
        event.venueId !== reservation.venueId
        || event.startAt.getTime() !== reservation.startsAt.getTime()
        || event.endAt?.getTime() !== reservation.endsAt.getTime()
        || totalLinkCount !== allowedLinkCount
      ) {
        throw new VenueReservationLifecycleError(
          "The Event does not match the venue reservation.",
        );
      }
      await checkAssignmentConflicts();
      if (isIdempotent) break;
      await tx.event.update({
        where: { id: event.id },
        data: { venueReservationId: reservation.id },
      });
      break;
    }
    case "SEASON_GAME": {
      const game = await tx.seasonGame.findUnique({
        where: { id: input.targetId },
        include: {
          season: { select: { leagueId: true, teamId: true } },
          homeTeam: { select: { leagueId: true } },
          awayTeam: { select: { leagueId: true } },
        },
      });
      if (!game) {
        throw new VenueReservationLifecycleError("Season game not found.");
      }
      if (
        game.venueReservationId
        && game.venueReservationId !== reservation.id
      ) {
        throw new VenueReservationLifecycleError(
          "The season game is linked to another venue reservation.",
        );
      }
      const gameLeagueId =
        game.season.leagueId
        ?? (
          game.homeTeam.leagueId === game.awayTeam.leagueId
            ? game.homeTeam.leagueId
            : null
        );
      if (
        game.homeTeam.leagueId !== gameLeagueId
        || game.awayTeam.leagueId !== gameLeagueId
      ) {
        throw new VenueReservationLifecycleError(
          "The season game has inconsistent owner ancestry.",
        );
      }
      const targetAuthorization = game.season.leagueId
        ? { type: "LEAGUE" as const, id: game.season.leagueId }
        : {
            type: "TEAM" as const,
            id: game.season.teamId ?? game.homeTeamId,
          };
      await assertAssignmentScope(tx, reservation, {
        leagueId: gameLeagueId,
        teamIds: [game.homeTeamId, game.awayTeamId],
        organizationId: null,
        authorization: targetAuthorization,
      }, input.actorId);
      const isLinkedEventAlias =
        !!game.eventId
        && reservation.events.some(({ id }) => id === game.eventId)
        && game.eventId !== null;
      const isIdempotent = game.venueReservationId === reservation.id;
      const allowedLinkCount =
        (isIdempotent ? 1 : 0) + (isLinkedEventAlias ? 1 : 0);
      if (
        game.venueId !== reservation.venueId
        || game.startAt.getTime() !== reservation.startsAt.getTime()
        || game.endAt.getTime() !== reservation.endsAt.getTime()
        || !targetSpaceMatches(game)
        || totalLinkCount !== allowedLinkCount
      ) {
        throw new VenueReservationLifecycleError(
          "The season game does not match the venue reservation.",
        );
      }
      await checkAssignmentConflicts();
      if (isIdempotent) break;
      await tx.seasonGame.update({
        where: { id: game.id },
        data: { venueReservationId: reservation.id },
      });
      break;
    }
    case "PRACTICE": {
      const practice = await tx.practiceSession.findUnique({
        where: { id: input.targetId },
        include: { team: { select: { leagueId: true } } },
      });
      if (!practice) {
        throw new VenueReservationLifecycleError("Practice not found.");
      }
      if (
        practice.venueReservationId
        && practice.venueReservationId !== reservation.id
      ) {
        throw new VenueReservationLifecycleError(
          "The practice is linked to another venue reservation.",
        );
      }
      await assertAssignmentScope(tx, reservation, {
        leagueId: practice.team.leagueId,
        teamIds: [practice.teamId],
        organizationId: null,
        authorization: { type: "TEAM", id: practice.teamId },
      }, input.actorId);
      const isIdempotent = practice.venueReservationId === reservation.id;
      const isLinkedEventAlias =
        reservation.events.length === 1
        && reservation.events[0].type === "PRACTICE"
        && reservation.events[0].teamId === practice.teamId
        && reservation.events[0].venueId === reservation.venueId
        && reservation.events[0].startAt.getTime()
          === reservation.startsAt.getTime()
        && reservation.events[0].endAt?.getTime()
          === reservation.endsAt.getTime()
        && reservation.seasonGames.length === 0
        && reservation.eventGames.length === 0
        && reservation.signupEvents.length === 0
        && reservation.proposalEntries.length === 0;
      const practiceEnd = practice?.startAt
        ? new Date(practice.startAt.getTime() + practice.duration * 60_000)
        : null;
      if (
        practice.venueId !== reservation.venueId
        || practice.startAt?.getTime() !== reservation.startsAt.getTime()
        || practiceEnd?.getTime() !== reservation.endsAt.getTime()
        || !targetSpaceMatches(practice)
        || totalLinkCount !==
          (isIdempotent ? 1 : 0) + (isLinkedEventAlias ? 1 : 0)
      ) {
        throw new VenueReservationLifecycleError(
          "The practice does not match the venue reservation.",
        );
      }
      await checkAssignmentConflicts();
      if (isIdempotent) break;
      await tx.practiceSession.update({
        where: { id: practice.id },
        data: { venueReservationId: reservation.id },
      });
      break;
    }
    case "SIGNUP_EVENT": {
      const event = await tx.signupEvent.findUnique({
        where: { id: input.targetId },
        include: {
          surfaces: { select: { id: true } },
          hostTeam: { select: { leagueId: true } },
        },
      });
      if (!event) {
        throw new VenueReservationLifecycleError("Signup event not found.");
      }
      if (
        event.venueReservationId
        && event.venueReservationId !== reservation.id
      ) {
        throw new VenueReservationLifecycleError(
          "The signup event is linked to another venue reservation.",
        );
      }
      if (
        [
          event.hostOrganizationId,
          event.hostLeagueId,
          event.hostTeamId,
        ].filter(Boolean).length !== 1
      ) {
        throw new VenueReservationLifecycleError(
          "The signup event has invalid owner ancestry.",
        );
      }
      const signupScope: AssignmentScope = event.hostOrganizationId
        ? {
            leagueId: null,
            teamIds: [],
            organizationId: event.hostOrganizationId,
            authorization: {
              type: "ORGANIZATION",
              id: event.hostOrganizationId,
            },
          }
        : event.hostLeagueId
          ? {
              leagueId: event.hostLeagueId,
              teamIds: [],
              organizationId: null,
              authorization: { type: "LEAGUE", id: event.hostLeagueId },
            }
          : {
              leagueId: event.hostTeam?.leagueId ?? null,
              teamIds: event.hostTeamId ? [event.hostTeamId] : [],
              organizationId: null,
              authorization: { type: "TEAM", id: event.hostTeamId! },
            };
      await assertAssignmentScope(tx, reservation, signupScope, input.actorId);
      const isLinkedEventGameAlias =
        reservation.eventGames.length === 1
        && reservation.eventGames[0].eventId === input.targetId;
      const isIdempotent = event.venueReservationId === reservation.id;
      const allowedLinkCount =
        (isIdempotent ? 1 : 0) + (isLinkedEventGameAlias ? 1 : 0);
      const surfaceMatches =
        reservation.surfaceId === null
        || event.surfaces.some(({ id }) => id === reservation.surfaceId);
      if (
        event.venueId !== reservation.venueId
        || event.startAt.getTime() !== reservation.startsAt.getTime()
        || event.endAt.getTime() !== reservation.endsAt.getTime()
        || !surfaceMatches
        || totalLinkCount !== allowedLinkCount
      ) {
        throw new VenueReservationLifecycleError(
          "The signup event does not match the venue reservation.",
        );
      }
      await checkAssignmentConflicts();
      if (isIdempotent) break;
      await tx.signupEvent.update({
        where: { id: event.id },
        data: { venueReservationId: reservation.id },
      });
      break;
    }
    case "EVENT_GAME": {
      const game = await tx.eventGame.findUnique({
        where: { id: input.targetId },
        include: {
          event: {
            include: { hostTeam: { select: { leagueId: true } } },
          },
        },
      });
      if (!game) {
        throw new VenueReservationLifecycleError("Event game not found.");
      }
      if (
        game.venueReservationId
        && game.venueReservationId !== reservation.id
      ) {
        throw new VenueReservationLifecycleError(
          "The event game is linked to another venue reservation.",
        );
      }
      if (
        [
          game.event.hostOrganizationId,
          game.event.hostLeagueId,
          game.event.hostTeamId,
        ].filter(Boolean).length !== 1
      ) {
        throw new VenueReservationLifecycleError(
          "The event game has invalid owner ancestry.",
        );
      }
      const eventGameScope: AssignmentScope = game.event.hostOrganizationId
        ? {
            leagueId: null,
            teamIds: [],
            organizationId: game.event.hostOrganizationId,
            authorization: {
              type: "ORGANIZATION",
              id: game.event.hostOrganizationId,
            },
          }
        : game.event.hostLeagueId
          ? {
              leagueId: game.event.hostLeagueId,
              teamIds: [],
              organizationId: null,
              authorization: {
                type: "LEAGUE",
                id: game.event.hostLeagueId,
              },
            }
          : {
              leagueId: game.event.hostTeam?.leagueId ?? null,
              teamIds: game.event.hostTeamId
                ? [game.event.hostTeamId]
                : [],
              organizationId: null,
              authorization: {
                type: "TEAM",
                id: game.event.hostTeamId!,
              },
            };
      await assertAssignmentScope(
        tx,
        reservation,
        eventGameScope,
        input.actorId,
      );
      const isLinkedSignupEventAlias =
        reservation.signupEvents.length === 1
        && reservation.signupEvents[0].id === game.eventId;
      const isIdempotent = game.venueReservationId === reservation.id;
      const allowedLinkCount =
        (isIdempotent ? 1 : 0) + (isLinkedSignupEventAlias ? 1 : 0);
      if (
        game.event.venueId !== reservation.venueId
        || game.startAt.getTime() !== reservation.startsAt.getTime()
        || game.endAt.getTime() !== reservation.endsAt.getTime()
        || !targetSpaceMatches(game)
        || totalLinkCount !== allowedLinkCount
      ) {
        throw new VenueReservationLifecycleError(
          "The event game does not match the venue reservation.",
        );
      }
      await checkAssignmentConflicts();
      if (isIdempotent) break;
      await tx.eventGame.update({
        where: { id: game.id },
        data: { venueReservationId: reservation.id },
      });
      break;
    }
  }

  const updated = await tx.venueReservation.update({
    where: { id: reservation.id },
    data: {
      assignedById: input.actorId,
      ...(assignmentConflicts.length > 0
        ? {
            overrides: {
              create: {
                actorId: input.actorId,
                reason: input.overrideReason!.trim(),
                candidateSnapshot: {
                  venueId: reservation.venueId,
                  surfaceId: reservation.surfaceId,
                  segmentId: reservation.segmentId,
                  startsAt: reservation.startsAt.toISOString(),
                  endsAt: reservation.endsAt.toISOString(),
                  targetType: input.targetType,
                  targetId: input.targetId,
                  legacyConflicts: legacyConflictReferences(assignmentConflicts),
                },
                conflictingReservationIds: canonicalConflictIds(assignmentConflicts),
              },
            },
          }
        : {}),
    },
  });
  const leagueId = await reservationLeagueId(tx, reservation);
  await tx.auditLog.create({
    data: {
      action: "VENUE_RESERVATION_ASSIGNED",
      userId: input.actorId,
      leagueId,
      teamId: reservation.ownerTeamId,
      resourceId: reservation.id,
      resourceType: "VenueReservation",
      details: {
        targetType: input.targetType,
        targetId: input.targetId,
        conflictOverrideCount: assignmentConflicts.length,
      },
    },
  });

  if (input.targetType === "PRACTICE") {
    await queueAssociationEventForLeagueAdmins(tx, {
      leagueId,
      eventType: "association.venue_reservation.assigned.practice",
      aggregateType: "VENUE_RESERVATION",
      aggregateId: reservation.id,
      occurrenceKey: `practice:${input.targetId}`,
      payload: {
        kind: "VENUE_RESERVATION",
        data: { venueReservationId: reservation.id },
      },
    });
  }
  return {
    ...updated,
    conflictsOverridden: assignmentConflicts.length > 0,
  };
}
