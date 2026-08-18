"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import {
  requireLeagueRole,
  requireTeamAdmin,
  requireUserId,
  requireVenueScheduleManager,
} from "@/lib/auth/session";
import type { ActionResult } from "@/lib/actions/venue-organizations";
import {
  assignVenueReservationSchema,
  venueReservationLifecycleSchema,
} from "@/lib/utils/validation";
import {
  assignVenueReservation as assignReservation,
  assertGenericRescheduleAllowed,
  createVenueReservation,
  transitionVenueReservation,
  VenueReservationConflictError,
  VenueReservationLifecycleError,
} from "@/lib/services/venue-reservations";
import {
  findVenueReservationAvailability,
  subtractVenueReservationOccupancy,
} from "@/lib/services/venue-reservation-availability";
import { runVenueReservationTransaction } from "@/lib/services/venue-reservation-transaction";
import { publicPublishedVenueWhere } from "@/lib/utils/public-venues";

const lifecycleSchema = venueReservationLifecycleSchema.extend({
  allowAssignedDisposition: z.boolean().optional(),
  linkedActivityDisposition: z.enum(["UNASSIGN"]).optional(),
  overrideReason: z.string().min(1).max(1000).optional(),
});

const rescheduleSchema = z.object({
  reservationId: z.string().cuid(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  reason: z.string().min(1).max(1000),
  overrideReason: z.string().min(1).max(1000).optional(),
}).refine((value) => value.endsAt > value.startsAt, {
  message: "End time must be after start time",
  path: ["endsAt"],
});

const unassignSchema = z.object({
  reservationId: z.string().cuid(),
  targetId: z.string().cuid(),
  targetType: z.enum(["SEASON_GAME", "PRACTICE", "EVENT", "SIGNUP_EVENT", "EVENT_GAME"]),
  reason: z.string().min(1).max(1000),
});
const availabilityInputSchema = z.object({
  venueId: z.string().cuid(),
  surfaceId: z.string().cuid().nullable().optional(),
  segmentId: z.string().cuid().nullable().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  excludeReservationId: z.string().cuid().optional(),
  includeOfferings: z.boolean().default(true),
  mode: z.enum(["PUBLIC", "STAFF"]),
}).refine((value) => value.endsAt > value.startsAt, {
  message: "End time must be after start time",
  path: ["endsAt"],
});

type ReservationSummary = {
  id: string;
  venueId: string;
  status: string;
  venue: { organizationId: string | null };
  ownerTeamId?: string | null;
  ownerLeagueId?: string | null;
  ownerVenueOrganizationId?: string | null;
};

async function loadReservation(reservationId: string): Promise<ReservationSummary | null> {
  return prisma.venueReservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      venueId: true,
      status: true,
      ownerTeamId: true,
      ownerLeagueId: true,
      ownerVenueOrganizationId: true,
      venue: { select: { organizationId: true } },
    },
  }) as Promise<ReservationSummary | null>;
}

async function authorizeVenueReservation(reservationId: string): Promise<{ actorId: string; reservation: ReservationSummary }> {
  const reservation = await loadReservation(reservationId);
  if (!reservation) throw new VenueReservationLifecycleError("Venue reservation not found.");
  try {
    if (reservation.ownerLeagueId) {
      return {
        actorId: await requireLeagueRole(
          reservation.ownerLeagueId,
          "LEAGUE_ADMIN",
        ),
        reservation,
      };
    }
    if (reservation.ownerTeamId) {
      return {
        actorId: await requireTeamAdmin(reservation.ownerTeamId),
        reservation,
      };
    }
  } catch {
    // Exact venue staff remain authorized by the service contract below.
  }
  return {
    actorId: await requireVenueScheduleManager(
      reservation.venue.organizationId!,
      reservation.venueId,
    ),
    reservation,
  };
}

async function authorizeVenueReservationAssignment(
  reservationId: string,
): Promise<{ actorId: string; reservation: ReservationSummary }> {
  const reservation = await loadReservation(reservationId);
  if (!reservation) throw new VenueReservationLifecycleError("Venue reservation not found.");

  if (reservation.ownerLeagueId) {
    const actorId = await requireLeagueRole(reservation.ownerLeagueId, "LEAGUE_ADMIN");
    return { actorId, reservation };
  }
  if (reservation.ownerTeamId) {
    const actorId = await requireTeamAdmin(reservation.ownerTeamId);
    return { actorId, reservation };
  }

  const actorId = await requireVenueScheduleManager(
    reservation.venue.organizationId!,
    reservation.venueId,
  );
  return { actorId, reservation };
}

function revalidateReservationPaths(reservation: ReservationSummary) {
  revalidatePath(`/venues/${reservation.venueId}/schedule`);
  revalidatePath(`/venue-admin/${reservation.venue.organizationId}/venues/${reservation.venueId}/requests`);
  revalidatePath("/operations");
  revalidatePath("/venue-reservations");
  if (reservation.ownerLeagueId) {
    revalidatePath(`/league/${reservation.ownerLeagueId}/operations`);
    revalidatePath(`/league/${reservation.ownerLeagueId}/venue-reservations`);
  }
  if (reservation.ownerTeamId) revalidatePath(`/teams/${reservation.ownerTeamId}`);
}

function actionError(error: unknown): ActionResult<never> {
  if (error instanceof VenueReservationConflictError || error instanceof VenueReservationLifecycleError) {
    return { success: false, error: error.message };
  }
  return { success: false, error: "Unable to update venue reservation." };
}

export async function assignVenueReservation(
  input: z.input<typeof assignVenueReservationSchema>,
): Promise<ActionResult<unknown>> {
  try {
    const validated = assignVenueReservationSchema.parse(input);
    const { actorId, reservation } = await authorizeVenueReservationAssignment(validated.reservationId);
    const result = await runVenueReservationTransaction(async (tx) => {
      const assigned = await assignReservation(tx, {
        reservationId: validated.reservationId,
        targetType: validated.targetType,
        targetId: validated.targetId,
        actorId,
        overrideConflicts: validated.overrideConflicts,
        overrideReason: validated.overrideConflicts
          ? validated.overrideReason
          : undefined,
      });
      if (validated.targetType !== "PRACTICE") return assigned;

      const [practice, canonicalReservation] = await Promise.all([
        tx.practiceSession.findUnique({
          where: { id: validated.targetId },
          include: { team: { select: { leagueId: true } } },
        }),
        tx.venueReservation.findUnique({
          where: { id: validated.reservationId },
          include: { venue: { select: { name: true } } },
        }),
      ]);
      if (!practice || !canonicalReservation) {
        throw new VenueReservationLifecycleError(
          "The practice assignment could not be reloaded.",
        );
      }

      const existingEvent = await tx.event.findUnique({
        where: { venueReservationId: canonicalReservation.id },
        select: { id: true, teamId: true, type: true },
      });
      if (
        existingEvent
        && (
          existingEvent.teamId !== practice.teamId
          || existingEvent.type !== "PRACTICE"
        )
      ) {
        throw new VenueReservationLifecycleError(
          "The reservation is linked to another participant activity.",
        );
      }
      const eventData = {
        type: "PRACTICE" as const,
        title: practice.title,
        startAt: canonicalReservation.startsAt,
        endAt: canonicalReservation.endsAt,
        timezone: canonicalReservation.timezone,
        location: canonicalReservation.venue.name,
        venueId: canonicalReservation.venueId,
        teamId: practice.teamId,
        leagueId: null,
        opponent: null,
        notes: null,
      };
      const event = existingEvent
        ? await tx.event.update({
            where: { id: existingEvent.id },
            data: eventData,
            select: { id: true },
          })
        : await tx.event.create({
            data: eventData,
            select: { id: true },
          });
      if (!existingEvent) {
        await assignReservation(tx, {
          reservationId: canonicalReservation.id,
          targetType: "EVENT",
          targetId: event.id,
          actorId,
        });
      }

      const members = await tx.teamMember.findMany({
        where: { teamId: practice.teamId },
        select: { userId: true },
      });
      const userIds = [...new Set(members.map(({ userId }) => userId))];
      if (userIds.length > 0) {
        await tx.rSVP.createMany({
          data: userIds.map((userId) => ({
            eventId: event.id,
            userId,
            status: "NO_RESPONSE" as const,
          })),
          skipDuplicates: true,
        });
      }
      return {
        reservation: assigned,
        primaryActivity: practice,
        participantEvent: event,
        rsvpCount: userIds.length,
        canonicalScheduleId: `reservation:${canonicalReservation.id}`,
      };
    });
    revalidateReservationPaths(reservation);
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

async function transition(
  input: z.input<typeof lifecycleSchema>,
  nextStatus: "RELEASED" | "CANCELED" | "COMPLETED",
  usageStatus?: "USED" | "UNUSED",
): Promise<ActionResult<unknown>> {
  try {
    const validated = lifecycleSchema.parse({ ...input, nextStatus, usageStatus: usageStatus ?? input.usageStatus });
    const { actorId, reservation } = await authorizeVenueReservation(validated.reservationId);
    const updated = await runVenueReservationTransaction(async (tx) => {
      const current = await tx.venueReservation.findUnique({
        where: { id: validated.reservationId },
        include: {
          events: { select: { id: true, type: true } },
          seasonGames: { select: { id: true } },
          eventGames: { select: { id: true } },
          signupEvents: { select: { id: true } },
          practiceSessions: { select: { id: true } },
          proposalEntries: { select: { id: true } },
        },
      });
      const assigned = current && (
        (current.events?.length ?? 0)
        + (current.seasonGames?.length ?? 0)
        + (current.eventGames?.length ?? 0)
        + (current.signupEvents?.length ?? 0)
        + (current.practiceSessions?.length ?? 0)
        + (current.proposalEntries?.length ?? 0)
      ) > 0;
      const disposition = validated.linkedActivityDisposition
        ?? (validated.allowAssignedDisposition ? "UNASSIGN" : undefined);
      if (
        assigned
        && ["RELEASED", "CANCELED"].includes(nextStatus)
        && !disposition
      ) {
        throw new VenueReservationLifecycleError(
          "Resolve linked activities before releasing or canceling this venue reservation.",
        );
      }
      if (
        assigned
        && ["RELEASED", "CANCELED"].includes(nextStatus)
        && disposition === "UNASSIGN"
      ) {
        const unsupportedLinks =
          (current?.seasonGames?.length ?? 0)
          + (current?.eventGames?.length ?? 0)
          + (current?.signupEvents?.length ?? 0)
          + (current?.proposalEntries?.length ?? 0);
        const hasNonPracticeEvent = current?.events?.some(
          ({ type }) => type !== "PRACTICE",
        );
        if (unsupportedLinks > 0 || hasNonPracticeEvent) {
          throw new VenueReservationLifecycleError(
            "Use the linked activity workflow to dispose of non-practice assignments.",
          );
        }
        const linkedWhere = {
          venueReservationId: validated.reservationId,
        };
        await Promise.all([
          // Participant Event deletion cascades its RSVP rows.
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
      return transitionVenueReservation(tx, {
        ...validated,
        nextStatus,
        usageStatus: usageStatus ?? validated.usageStatus,
        actorId,
        allowAssignedDisposition: false,
      });
    });
    revalidateReservationPaths(reservation);
    return { success: true, data: updated };
  } catch (error) {
    return actionError(error);
  }
}

export async function releaseVenueReservation(input: z.input<typeof lifecycleSchema>) {
  return transition(input, "RELEASED");
}

export async function cancelVenueReservation(input: z.input<typeof lifecycleSchema>) {
  return transition(input, "CANCELED");
}

export async function completeVenueReservation(input: z.input<typeof lifecycleSchema>) {
  return transition(input, "COMPLETED", "USED");
}

export async function markVenueReservationUnused(
  input: Omit<z.input<typeof lifecycleSchema>, "nextStatus" | "usageStatus">,
) {
  return transition(input as z.input<typeof lifecycleSchema>, "COMPLETED", "UNUSED");
}

export async function rescheduleVenueReservation(
  input: z.input<typeof rescheduleSchema>,
): Promise<ActionResult<unknown>> {
  try {
    const validated = rescheduleSchema.parse(input);
    const { actorId, reservation } = await authorizeVenueReservation(validated.reservationId);
    const replacement = await runVenueReservationTransaction(async (tx) => {
      const current = await tx.venueReservation.findUnique({
        where: { id: validated.reservationId },
        select: {
          id: true,
          status: true,
          venueId: true,
          surfaceId: true,
          segmentId: true,
          startsAt: true,
          endsAt: true,
          timezone: true,
          ownerLeagueId: true,
          ownerTeamId: true,
          ownerVenueOrganizationId: true,
          offeringBlockId: true,
          sourceRequestId: true,
        },
      });
      if (!current) throw new VenueReservationLifecycleError("Venue reservation not found.");
      assertGenericRescheduleAllowed(current);
      if (current.status !== "CONFIRMED") {
        throw new VenueReservationLifecycleError(
          "Only a confirmed venue reservation can be rescheduled.",
        );
      }
      await transitionVenueReservation(tx, {
        reservationId: current.id,
        nextStatus: "RELEASED",
        actorId,
        reason: validated.reason,
        allowAssignedDisposition: false,
      });
      return createVenueReservation(tx, {
        venueId: current.venueId,
        surfaceId: current.surfaceId,
        segmentId: current.segmentId,
        startsAt: validated.startsAt,
        endsAt: validated.endsAt,
        timezone: current.timezone,
        ownerLeagueId: current.ownerLeagueId,
        ownerTeamId: current.ownerTeamId,
        ownerVenueOrganizationId: current.ownerVenueOrganizationId,
        sourceRequestId: null,
        offeringBlockId: current.offeringBlockId,
        actorId,
        status: "CONFIRMED",
        overrideReason: validated.overrideReason,
      });
    });
    revalidateReservationPaths(reservation);
    return { success: true, data: replacement };
  } catch (error) {
    return actionError(error);
  }
}

export async function unassignVenueReservation(
  input: z.input<typeof unassignSchema>,
): Promise<ActionResult<{ reservationId: string; targetId: string }>> {
  try {
    const validated = unassignSchema.parse(input);
    const { actorId, reservation } =
      await authorizeVenueReservationAssignment(validated.reservationId);
    await runVenueReservationTransaction(async (tx) => {
      const current = await tx.venueReservation.findUnique({
        where: { id: validated.reservationId },
        select: {
          id: true,
          venueId: true,
          ownerLeagueId: true,
          ownerTeamId: true,
          ownerVenueOrganizationId: true,
        },
      });
      if (!current) {
        throw new VenueReservationLifecycleError(
          "Venue reservation not found.",
        );
      }
      const actorStillAuthorized = current.ownerLeagueId
        ? await tx.leagueUser.findFirst({
            where: {
              userId: actorId,
              leagueId: current.ownerLeagueId,
              role: "LEAGUE_ADMIN",
            },
            select: { id: true },
          })
        : current.ownerTeamId
          ? await tx.teamMember.findFirst({
              where: {
                userId: actorId,
                teamId: current.ownerTeamId,
                role: "ADMIN",
              },
              select: { id: true },
            })
          : await tx.venueStaff.findFirst({
              where: {
                userId: actorId,
                organizationId: current.ownerVenueOrganizationId!,
                status: "ACTIVE",
                role: { in: ["OWNER", "MANAGER", "SCHEDULER"] },
                OR: [{ venueId: null }, { venueId: current.venueId }],
              },
              select: { id: true },
            });
      if (!actorStillAuthorized) {
        throw new VenueReservationLifecycleError(
          "The actor is no longer authorized for this reservation owner.",
        );
      }

      if (validated.targetType === "PRACTICE") {
        const practice = await tx.practiceSession.findFirst({
          where: {
            id: validated.targetId,
            venueReservationId: validated.reservationId,
          },
          select: {
            id: true,
            teamId: true,
            venueId: true,
            startAt: true,
            duration: true,
          },
        });
        if (!practice) {
          throw new VenueReservationLifecycleError(
            "Reservation assignment not found.",
          );
        }
        const practiceEnd = practice.startAt
          ? new Date(practice.startAt.getTime() + practice.duration * 60_000)
          : null;
        await tx.event.deleteMany({
          where: {
            venueReservationId: validated.reservationId,
            type: "PRACTICE",
            teamId: practice.teamId,
            venueId: practice.venueId,
            ...(practice.startAt ? { startAt: practice.startAt } : {}),
            ...(practiceEnd ? { endAt: practiceEnd } : {}),
          },
        });
        await tx.practiceSession.update({
          where: { id: practice.id },
          data: {
            venueReservationId: null,
            venueId: null,
            surfaceId: null,
            segmentId: null,
            startAt: null,
            conflictOverriddenById: null,
            conflictOverriddenAt: null,
          },
        });
      } else {
      const delegates = {
        EVENT: "event",
        SEASON_GAME: "seasonGame",
        SIGNUP_EVENT: "signupEvent",
        EVENT_GAME: "eventGame",
      } as const;
      const delegate = (tx as unknown as Record<string, {
        updateMany?: (args: unknown) => Promise<{ count: number }>;
      }>)[delegates[validated.targetType]];
      // updateMany binds both IDs, so another tenant's target cannot be cleared.
      if (delegate?.updateMany) {
        const update = await delegate.updateMany({
          where: { id: validated.targetId, venueReservationId: validated.reservationId },
          data: { venueReservationId: null },
        });
        if (update.count === 0) throw new VenueReservationLifecycleError("Reservation assignment not found.");
      }
      }
      await tx.auditLog.create({
        data: {
          action: "VENUE_RESERVATION_UNASSIGNED",
          userId: actorId,
          leagueId: current.ownerLeagueId,
          teamId: current.ownerTeamId,
          resourceId: current.id,
          resourceType: "VenueReservation",
          details: {
            targetType: validated.targetType,
            targetId: validated.targetId,
            reason: validated.reason,
          },
        },
      });
    });
    revalidateReservationPaths(reservation);
    return { success: true, data: { reservationId: validated.reservationId, targetId: validated.targetId } };
  } catch (error) {
    return actionError(error) as ActionResult<{ reservationId: string; targetId: string }>;
  }
}

export async function checkVenueReservationAvailability(
  input: z.input<typeof availabilityInputSchema>,
): Promise<ActionResult<unknown>> {
  try {
    const validated = availabilityInputSchema.parse(input);
    const actorId = validated.mode === "STAFF" ? await requireUserId() : null;
    const result = await runVenueReservationTransaction(async (tx) => {
      const venue = validated.mode === "PUBLIC"
        ? await tx.venue.findFirst({
            where: {
              ...publicPublishedVenueWhere,
              id: validated.venueId,
            },
            select: { organizationId: true },
          })
        : await tx.venue.findUnique({
            where: { id: validated.venueId },
            select: { organizationId: true },
          });
      if (!venue) {
        throw new Error("Venue is not available in this view.");
      }

      const staff = actorId && venue.organizationId
        ? await tx.venueStaff.findFirst({
            where: {
              userId: actorId,
              organizationId: venue.organizationId,
              status: "ACTIVE",
              OR: [{ venueId: null }, { venueId: validated.venueId }],
            },
            select: { id: true, role: true },
          })
        : null;
      if (validated.mode === "STAFF" && !staff) {
        throw new Error("Venue staff access is required.");
      }

      const availability = await findVenueReservationAvailability(tx, {
        venueId: validated.venueId,
        surfaceId: validated.surfaceId,
        segmentId: validated.segmentId,
        startsAt: validated.startsAt,
        endsAt: validated.endsAt,
        excludeReservationId: validated.excludeReservationId,
        includeOfferings: validated.includeOfferings,
        offeringAccess: validated.mode,
      });
      if (validated.mode === "PUBLIC") {
        return {
          mode: validated.mode,
          offerings: availability.offerings,
          availableSlices: subtractVenueReservationOccupancy(
            {
              startsAt: validated.startsAt,
              endsAt: validated.endsAt,
            },
            availability.occupancy,
          ).remainingSlices,
          canOverride: false,
        };
      }

      return {
        mode: validated.mode,
        availability,
        canOverride: staff?.role === "OWNER" || staff?.role === "MANAGER",
      };
    });
    return {
      success: true,
      data: result.mode === "PUBLIC"
        ? {
            offerings: result.offerings,
            availableSlices: result.availableSlices,
            canOverride: false,
          }
        : {
            ...result.availability,
            canOverride: result.canOverride,
          },
    };
  } catch {
    return { success: false, error: "Unable to check venue availability." };
  }
}
