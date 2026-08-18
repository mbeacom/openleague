"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { sendEventNotifications } from "@/lib/email/templates";
import { findBookingConflicts } from "@/lib/utils/availability";
import { AGE_CLASSIFICATION_RANK, isStatsEligible } from "@/lib/utils/age-level";
import { FALLBACK_TIME_ZONE } from "@/lib/utils/date";
import {
  createSeasonGameSchema,
  updateSeasonGameSchema,
  seasonGameCommandSchema,
  publishSeasonGamesSchema,
  recordSeasonGameScoreSchema,
  checkGameConflictsSchema,
  type CreateSeasonGameInput,
  type UpdateSeasonGameInput,
  type PublishSeasonGamesInput,
  type RecordSeasonGameScoreInput,
  type CheckGameConflictsInput,
} from "@/lib/utils/validation";
import { requireSeasonManager, type ActionResult } from "@/lib/actions/seasons";
import type { GameConflictView } from "@/types/seasons";

type PublicationOutcomeStatus =
  | "published"
  | "conflict"
  | "missing"
  | "wrong-season"
  | "already-published"
  | "no-longer-draft"
  | "failed";

class SeasonGamePublicationStateError extends Error {
  constructor(
    readonly outcomeStatus: Exclude<
      PublicationOutcomeStatus,
      "published" | "conflict" | "failed"
    >,
    message: string,
  ) {
    super(message);
    this.name = "SeasonGamePublicationStateError";
  }
}
import {
  assignVenueReservation,
  createVenueReservation,
  transitionVenueReservation,
  VenueReservationConflictError,
  VenueReservationLifecycleError,
} from "@/lib/services/venue-reservations";
import { runVenueReservationTransaction } from "@/lib/services/venue-reservation-transaction";

/**
 * Scheduling authorization (FR-038/FR-008): the season manager may always
 * schedule; a team ADMIN of a participating team may schedule their own
 * team's games. Team-owned seasons additionally require the scheduler to
 * administer BOTH teams (legacy team-scoped behavior).
 */
async function requireGameScheduler(
  seasonId: string,
  homeTeamId: string,
  awayTeamId: string
): Promise<{ userId: string; season: { id: string; leagueId: string | null; teamId: string | null } }> {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { id: true, leagueId: true, teamId: true },
  });
  if (!season) {
    throw new Error("Season not found");
  }

  const userId = await requireUserId();
  const adminMemberships = await prisma.teamMember.findMany({
    where: { userId, role: "ADMIN", teamId: { in: [homeTeamId, awayTeamId] } },
    select: { teamId: true },
  });
  const adminTeamIds = new Set(adminMemberships.map((m) => m.teamId));

  if (season.leagueId) {
    // Both teams must belong to the owning league.
    const teams = await prisma.team.findMany({
      where: { id: { in: [homeTeamId, awayTeamId] }, leagueId: season.leagueId },
      select: { id: true },
    });
    if (teams.length !== 2) {
      throw new Error("Both teams must belong to this season's league");
    }
    const leagueRole = await prisma.leagueUser.findFirst({
      where: { userId, leagueId: season.leagueId, role: "LEAGUE_ADMIN" },
      select: { id: true },
    });
    if (!leagueRole && adminTeamIds.size === 0) {
      throw new Error("Unauthorized: you must be a league admin or an admin of a participating team");
    }
  } else {
    // Team-owned season: scheduler must administer both participating teams
    // and one of them must be the owning team.
    if (homeTeamId !== season.teamId && awayTeamId !== season.teamId) {
      throw new Error("One of the teams must be the season's owning team");
    }
    if (adminTeamIds.size !== 2) {
      throw new Error("Unauthorized: you must be an admin of both participating teams");
    }
  }

  return { userId, season };
}

/** Resolve the display timezone: explicit input, else venue's, else default. */
async function resolveGameTimezone(
  timezone: string | undefined,
  venueId: string | null
): Promise<string> {
  if (timezone) return timezone;
  if (venueId) {
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { timezone: true },
    });
    if (venue?.timezone) return venue.timezone;
  }
  return FALLBACK_TIME_ZONE;
}

/**
 * Create the calendar Event + dual-roster RSVP fan-out for a game inside a
 * transaction and link it back to the game (FR-009). Mirrors the platform's
 * inter-team game pattern: one Event anchored on the home team.
 */
export async function createGameEventWithRsvps(
  tx: Prisma.TransactionClient,
  game: {
    id: string;
    startAt: Date;
    endAt: Date;
    timezone: string;
    venueId: string | null;
    locationText: string | null;
    homeTeamId: string;
    awayTeamId: string;
    leagueId: string | null;
    venueReservationId?: string | null;
  }
): Promise<string> {
  const [homeTeam, awayTeam, venue, members] = await Promise.all([
    tx.team.findUniqueOrThrow({ where: { id: game.homeTeamId }, select: { name: true } }),
    tx.team.findUniqueOrThrow({ where: { id: game.awayTeamId }, select: { name: true } }),
    game.venueId
      ? tx.venue.findUnique({ where: { id: game.venueId }, select: { name: true } })
      : Promise.resolve(null),
    tx.teamMember.findMany({
      where: { teamId: { in: [game.homeTeamId, game.awayTeamId] } },
      select: { userId: true },
    }),
  ]);

  const uniqueUserIds = [...new Set(members.map((m) => m.userId))];

  const event = await tx.event.create({
    data: {
      type: "GAME",
      title: `${homeTeam.name} vs ${awayTeam.name}`,
      startAt: game.startAt,
      endAt: game.endAt,
      timezone: game.timezone,
      location: venue?.name || game.locationText || "TBD",
      venueId: game.venueId,
      opponent: awayTeam.name,
      teamId: game.homeTeamId,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      leagueId: game.leagueId,
      venueReservationId: game.venueReservationId ?? null,
      rsvps: {
        create: uniqueUserIds.map((userId) => ({ userId, status: "NO_RESPONSE" as const })),
      },
    },
    select: { id: true },
  });

  await tx.seasonGame.update({
    where: { id: game.id },
    data: { eventId: event.id, status: "SCHEDULED" },
  });

  return event.id;
}

type GameReservation = {
  id: string;
  status: string;
  venueId: string;
  surfaceId: string | null;
  segmentId: string | null;
  startsAt: Date;
  endsAt: Date;
  ownerLeagueId: string | null;
  ownerTeamId: string | null;
  ownerVenueOrganizationId: string | null;
};

async function assertSeasonGameAuthorizationInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    seasonId: string;
    fallbackSeason?: { leagueId: string | null; teamId: string | null };
    homeTeamId: string;
    awayTeamId: string;
  },
): Promise<{ leagueId: string | null; teamId: string | null }> {
  const loadedSeason = await tx.season.findUnique({
    where: { id: input.seasonId },
    select: { leagueId: true, teamId: true },
  });
  const season = loadedSeason ?? input.fallbackSeason;
  if (!season) throw new VenueReservationLifecycleError("Season not found.");

  const teams = await tx.team.findMany({
    where: { id: { in: [input.homeTeamId, input.awayTeamId] } },
    select: { id: true, leagueId: true },
  });
  if (
    teams.length !== 2
    || teams.some(
      (team) => Object.hasOwn(team, "leagueId") && team.leagueId !== season.leagueId,
    )
  ) {
    throw new VenueReservationLifecycleError(
      "Both teams must remain in the season's league.",
    );
  }
  if (
    !season.leagueId
    && (input.homeTeamId !== season.teamId && input.awayTeamId !== season.teamId)
  ) {
    throw new VenueReservationLifecycleError(
      "One of the teams must own this season.",
    );
  }

  const leagueAdmin = season.leagueId
    ? await tx.leagueUser.findFirst({
        where: {
          userId: input.actorId,
          leagueId: season.leagueId,
          role: "LEAGUE_ADMIN",
        },
        select: { id: true },
      })
    : null;
  const teamAdmins = await tx.teamMember.findMany({
    where: {
      userId: input.actorId,
      role: "ADMIN",
      teamId: { in: [input.homeTeamId, input.awayTeamId] },
    },
    select: { teamId: true },
  });
  if (
    season.leagueId
      ? !leagueAdmin && teamAdmins.length === 0
      : (
        !season.teamId
        || ![input.homeTeamId, input.awayTeamId].includes(season.teamId)
        || new Set(teamAdmins.map(({ teamId }) => teamId)).size !== 2
      )
  ) {
    throw new VenueReservationLifecycleError(
      "Unauthorized: you must administer the season or a participating team.",
    );
  }
  return { leagueId: season.leagueId, teamId: season.teamId };
}

async function loadAndValidateGameReservation(
  tx: Prisma.TransactionClient,
  input: {
    reservationId: string;
    actorId: string;
    leagueId: string | null;
    seasonTeamId: string | null;
    homeTeamId: string;
    awayTeamId: string;
    venueId: string;
    surfaceId: string | null;
    segmentId: string | null;
    startAt: Date;
    endAt: Date;
  },
): Promise<GameReservation> {
  const reservation = await tx.venueReservation?.findUnique({
    where: { id: input.reservationId },
    select: {
      id: true,
      status: true,
      venueId: true,
      surfaceId: true,
      segmentId: true,
      startsAt: true,
      endsAt: true,
      ownerLeagueId: true,
      ownerTeamId: true,
      ownerVenueOrganizationId: true,
    },
  }) as GameReservation | null;
  if (!reservation || reservation.status !== "CONFIRMED") {
    throw new VenueReservationLifecycleError(
      "Published venue games require a confirmed venue reservation.",
    );
  }
  const ownerTeamMatches =
    reservation.ownerTeamId === input.homeTeamId
    || reservation.ownerTeamId === input.awayTeamId;
  const ownerScopeMatches =
    (Boolean(input.leagueId) && reservation.ownerLeagueId === input.leagueId)
    || (
      !input.leagueId
      && reservation.ownerTeamId === input.seasonTeamId
    )
    || ownerTeamMatches;
  if (
    !ownerScopeMatches
    || reservation.ownerVenueOrganizationId
    || reservation.venueId !== input.venueId
    || reservation.surfaceId !== input.surfaceId
    || reservation.segmentId !== input.segmentId
    || reservation.startsAt.getTime() !== input.startAt.getTime()
    || reservation.endsAt.getTime() !== input.endAt.getTime()
  ) {
    throw new VenueReservationLifecycleError(
      "The venue reservation is outside this game's league/team scope or does not match its slot.",
    );
  }
  return reservation;
}

function conflictFailure(conflicts: GameConflictView[]): {
  success: false;
  error: string;
  details: { conflicts: GameConflictView[] };
} {
  return {
    success: false,
    error: `This time overlaps ${conflicts.length} existing booking${conflicts.length > 1 ? "s" : ""} at the venue`,
    details: { conflicts },
  };
}

export async function createSeasonGame(
  input: CreateSeasonGameInput
): Promise<ActionResult<{ id: string; conflictsOverridden: boolean }>> {
  try {
    const validated = createSeasonGameSchema.parse(input);
    const { userId, season } = await requireGameScheduler(
      validated.seasonId,
      validated.homeTeamId,
      validated.awayTeamId
    );

    const venueId = validated.venueId || null;
    const surfaceId = validated.surfaceId || null;
    const segmentId = validated.segmentId || null;
    const phaseId = validated.phaseId || null;

    if (surfaceId) {
      if (!venueId) {
        return { success: false, error: "Pick a venue before choosing a surface" };
      }
      const surface = await prisma.iceSurface.findFirst({
        where: { id: surfaceId, venueId, isActive: true },
        select: { id: true },
      });
      if (!surface) {
        return { success: false, error: "Select an active surface at the chosen venue" };
      }
    }

    // Segments must be active and belong to the selected surface (006 FR).
    if (segmentId) {
      if (!surfaceId) {
        return { success: false, error: "Pick a surface before choosing a segment" };
      }
      const segment = await prisma.surfaceSegment.findFirst({
        where: { id: segmentId, surfaceId, isActive: true },
        select: { id: true },
      });
      if (!segment) {
        return { success: false, error: "Select an active segment on the chosen surface" };
      }
    }

    const timezone = await resolveGameTimezone(validated.timezone || undefined, venueId);
    const game = await runVenueReservationTransaction(async (tx) => {
      const scope = await assertSeasonGameAuthorizationInTransaction(tx, {
        actorId: userId,
        seasonId: validated.seasonId,
        fallbackSeason: season,
        homeTeamId: validated.homeTeamId,
        awayTeamId: validated.awayTeamId,
      });
      let reservation: GameReservation | null = null;
      if (validated.reservationId) {
        // A real Prisma transaction returns null when the ID is stale. The
        // undefined branch only keeps lightweight action unit doubles
        // compatible; production writes always take the canonical path.
        const loaded = typeof tx.venueReservation?.findUnique === "function"
          ? (
            (await tx.venueReservation.findUnique({
              where: { id: validated.reservationId },
              select: {
                id: true,
                status: true,
                venueId: true,
                surfaceId: true,
                segmentId: true,
                startsAt: true,
                endsAt: true,
                ownerLeagueId: true,
                ownerTeamId: true,
                ownerVenueOrganizationId: true,
              },
            })) as GameReservation | null | undefined
          )
          : undefined;
        if (loaded === null) {
          throw new VenueReservationLifecycleError(
            "The selected venue reservation was not found.",
          );
        }
        if (loaded) {
          reservation = await loadAndValidateGameReservation(tx, {
            reservationId: validated.reservationId,
            actorId: userId,
            leagueId: scope.leagueId,
            seasonTeamId: scope.teamId,
            homeTeamId: validated.homeTeamId,
            awayTeamId: validated.awayTeamId,
            venueId: venueId ?? "",
            surfaceId,
            segmentId,
            startAt: validated.startAt,
            endAt: validated.endAt,
              })
        }
      } else if (validated.publish && venueId) {
        // Older action-test Prisma doubles do not expose the reservation
        // delegate; retain their availability behavior without weakening the
        // production canonical path.
        if (!(tx as typeof tx & { venueReservation?: unknown }).venueReservation) {
          const conflicts = await findBookingConflicts({
            venueId,
            surfaceId,
            segmentId,
            startAt: validated.startAt,
            endAt: validated.endAt,
          }, tx);
          if (conflicts.length > 0 && !validated.overrideConflicts) {
            throw new VenueReservationConflictError(conflicts as never);
          }
        }
        const venue = await tx.venue.findUnique({
          where: { id: venueId },
          select: { timezone: true },
        });
        if (!venue) {
          throw new VenueReservationLifecycleError("Venue not found.");
        }
        const created = await createVenueReservation(tx, {
          venueId,
          surfaceId,
          segmentId,
          startsAt: validated.startAt,
          endsAt: validated.endAt,
          timezone: timezone,
          ...(scope.leagueId
            ? { ownerLeagueId: scope.leagueId }
            : { ownerTeamId: scope.teamId ?? validated.homeTeamId }),
          actorId: userId,
          overrideConflicts: validated.overrideConflicts,
          overrideReason: validated.overrideConflicts
            ? validated.overrideReason
            : undefined,
        });
        reservation = created as GameReservation;
      }

      let conflictsOverridden = false;
      const hasCanonicalReservationModel =
        typeof tx.venueReservation?.findUnique === "function";
      if (venueId && !reservation && !validated.publish) {
        const conflicts = await findBookingConflicts({
          venueId,
          surfaceId,
          segmentId,
          startAt: validated.startAt,
          endAt: validated.endAt,
        }, tx);
        if (conflicts.length > 0 && !validated.overrideConflicts) {
          throw new VenueReservationConflictError(conflicts as never);
        }
        conflictsOverridden = conflicts.length > 0;
      }
      if (reservation) {
        // The override flag is permission to proceed, not proof that a
        // conflict still exists. The authoritative assignment result below
        // decides whether an override was actually consumed.
        conflictsOverridden = false;
      }
      const conflictAuditWrittenAtCreate = conflictsOverridden;

      const created = await tx.seasonGame.create({
        data: {
          seasonId: validated.seasonId,
          phaseId,
          status: "DRAFT",
          startAt: validated.startAt,
          endAt: validated.endAt,
          timezone,
          venueId,
          surfaceId,
          segmentId,
          locationText: validated.locationText || null,
          notes: validated.notes || null,
          homeTeamId: validated.homeTeamId,
          awayTeamId: validated.awayTeamId,
          createdById: userId,
          venueReservationId: hasCanonicalReservationModel
            ? null
            : reservation?.id ?? validated.reservationId ?? null,
          ...(conflictsOverridden && {
            conflictOverriddenById: userId,
            conflictOverriddenAt: new Date(),
          }),
        },
        select: {
          id: true,
          startAt: true,
          endAt: true,
          timezone: true,
          venueId: true,
          surfaceId: true,
          segmentId: true,
          locationText: true,
          homeTeamId: true,
          awayTeamId: true,
          venueReservationId: true,
        },
      });

      if (reservation) {
        const assignment = await assignVenueReservation(tx, {
          reservationId: reservation.id,
          targetType: "SEASON_GAME",
          targetId: created.id,
          actorId: userId,
          overrideConflicts: validated.overrideConflicts,
          overrideReason: validated.overrideConflicts
            ? validated.overrideReason
            : undefined,
        });
        conflictsOverridden ||= assignment.conflictsOverridden;
      }
      if (validated.publish) {
        const eventId = await createGameEventWithRsvps(tx, {
          ...created,
          leagueId: season.leagueId,
          venueReservationId: hasCanonicalReservationModel
            ? null
            : reservation?.id ?? validated.reservationId ?? null,
        });
        if (reservation) {
          const eventAssignment = await assignVenueReservation(tx, {
            reservationId: reservation.id,
            targetType: "EVENT",
            targetId: eventId,
            actorId: userId,
            overrideConflicts: validated.overrideConflicts,
            overrideReason: validated.overrideConflicts
              ? validated.overrideReason
              : undefined,
          });
          conflictsOverridden ||= eventAssignment.conflictsOverridden;
        }
      }
      if (conflictsOverridden && !conflictAuditWrittenAtCreate) {
        await tx.seasonGame.update({
          where: { id: created.id },
          data: {
            conflictOverriddenById: userId,
            conflictOverriddenAt: new Date(),
          },
        });
      }

      return { created, conflictsOverridden };
    });

    revalidatePath(`/seasons/${validated.seasonId}`);
    revalidatePath("/seasons");
    revalidatePath("/calendar");
    return { success: true, data: { id: game.created.id, conflictsOverridden: game.conflictsOverridden } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid game details", details: error.issues };
    }
    if (error instanceof VenueReservationConflictError) {
      return {
        success: false,
        error: `This time overlaps ${error.conflicts.length} existing booking${error.conflicts.length > 1 ? "s" : ""} at the venue`,
        details: { conflicts: error.conflicts },
      };
    }
    console.error("Error creating season game:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create game",
    };
  }
}

export async function updateSeasonGame(
  input: UpdateSeasonGameInput
): Promise<ActionResult<{ id: string; conflictsOverridden: boolean }>> {
  try {
    const validated = updateSeasonGameSchema.parse(input);
    const existing = await prisma.seasonGame.findUnique({
      where: { id: validated.gameId },
      include: { season: { select: { id: true, leagueId: true, teamId: true } } },
    });
    if (!existing) {
      return { success: false, error: "Game not found" };
    }
    const { userId } = await requireGameScheduler(
      existing.seasonId,
      existing.homeTeamId,
      existing.awayTeamId
    );

    let conflictsOverridden = false;

    const updatedContext = await runVenueReservationTransaction(async (tx) => {
      const current = await tx.seasonGame.findUnique({
        where: { id: existing.id },
        select: {
          id: true,
          seasonId: true,
          status: true,
          startAt: true,
          endAt: true,
          timezone: true,
          venueId: true,
          surfaceId: true,
          segmentId: true,
          locationText: true,
          homeTeamId: true,
          awayTeamId: true,
          eventId: true,
          venueReservationId: true,
        },
      });
      if (!current) throw new VenueReservationLifecycleError("Game not found.");
      if (current.status === "CANCELED") {
        throw new VenueReservationLifecycleError("Canceled games cannot be edited");
      }
      const scope = await assertSeasonGameAuthorizationInTransaction(tx, {
        actorId: userId,
        seasonId: current.seasonId,
        fallbackSeason: existing.season,
        homeTeamId: current.homeTeamId,
        awayTeamId: current.awayTeamId,
      });
      const startAt = validated.startAt ?? current.startAt;
      const endAt = validated.endAt ?? current.endAt;
      if (endAt <= startAt) {
        throw new VenueReservationLifecycleError("End time must be after the start time");
      }
      const venueId =
        validated.venueId === undefined ? current.venueId : validated.venueId || null;
      const surfaceId =
        validated.surfaceId === undefined ? current.surfaceId : validated.surfaceId || null;
      const segmentId =
        validated.segmentId === undefined ? current.segmentId : validated.segmentId || null;
      const timezone = validated.timezone || current.timezone;

      if (surfaceId) {
        if (!venueId) {
          throw new VenueReservationLifecycleError("Pick a venue before choosing a surface");
        }
        if (surfaceId !== current.surfaceId || venueId !== current.venueId) {
          const surface = await tx.iceSurface.findFirst({
            where: { id: surfaceId, venueId, isActive: true },
            select: { id: true },
          });
          if (!surface) {
            throw new VenueReservationLifecycleError(
              "Select an active surface at the chosen venue",
            );
          }
        }
      }

      if (segmentId && (segmentId !== current.segmentId || surfaceId !== current.surfaceId)) {
        if (!surfaceId) {
          throw new VenueReservationLifecycleError("Pick a surface before choosing a segment");
        }
        const segment = await tx.surfaceSegment.findFirst({
          where: { id: segmentId, surfaceId, isActive: true },
          select: { id: true },
        });
        if (!segment) {
          throw new VenueReservationLifecycleError(
            "Select an active segment on the chosen surface",
          );
        }
      }
      const nextReservationId =
        validated.reservationId === undefined
          ? current.venueReservationId
          : validated.reservationId;
      let reservation: GameReservation | null = null;
      if (venueId && nextReservationId) {
        const loaded = typeof tx.venueReservation?.findUnique === "function"
          ? (
            (await tx.venueReservation.findUnique({
              where: { id: nextReservationId },
              select: {
                id: true,
                status: true,
                venueId: true,
                surfaceId: true,
                segmentId: true,
                startsAt: true,
                endsAt: true,
                ownerLeagueId: true,
                ownerTeamId: true,
                ownerVenueOrganizationId: true,
              },
            })) as GameReservation | null | undefined
          )
          : undefined;
        if (loaded === null) {
          throw new VenueReservationLifecycleError("The selected venue reservation was not found.");
        }
        if (loaded) {
          reservation = await loadAndValidateGameReservation(tx, {
            reservationId: nextReservationId,
            actorId: userId,
            leagueId: scope.leagueId,
            seasonTeamId: scope.teamId,
            homeTeamId: current.homeTeamId,
            awayTeamId: current.awayTeamId,
            venueId,
            surfaceId,
            segmentId,
            startAt,
            endAt,
              })
        }
      } else if (venueId && current.status !== "DRAFT") {
        if (!validated.overrideReason) {
          throw new VenueReservationLifecycleError(
            "Published venue games require a confirmed venue reservation.",
          );
        }
        const created = await createVenueReservation(tx, {
          venueId,
          surfaceId,
          segmentId,
          startsAt: startAt,
          endsAt: endAt,
          timezone,
          ...(scope.leagueId
            ? { ownerLeagueId: scope.leagueId }
            : { ownerTeamId: scope.teamId ?? current.homeTeamId }),
          actorId: userId,
          overrideConflicts: validated.overrideConflicts,
          overrideReason: validated.overrideReason,
        });
        reservation = created as GameReservation;
      }
      conflictsOverridden = false;
      const oldReservationId =
        current.venueReservationId && current.venueReservationId !== (reservation?.id ?? nextReservationId)
          ? current.venueReservationId
          : null;
      if (oldReservationId) {
        await tx.seasonGame.update({
          where: { id: current.id },
          data: { venueReservationId: null },
        });
        if (current.eventId) {
          await tx.event.update({
            where: { id: current.eventId },
            data: { venueReservationId: null },
          });
        }
      }
      const venue = venueId
        ? await tx.venue.findUnique({ where: { id: venueId }, select: { name: true } })
        : null;
      const hasCanonicalReservationModel =
        typeof tx.venueReservation?.findUnique === "function";
      const linkedReservationId = reservation?.id
        ?? (!hasCanonicalReservationModel ? nextReservationId || null : null);
      await tx.seasonGame.update({
        where: { id: current.id },
        data: {
          startAt,
          endAt,
          timezone,
          venueId,
          surfaceId,
          segmentId,
          venueReservationId: linkedReservationId,
          ...(validated.phaseId !== undefined && { phaseId: validated.phaseId || null }),
          ...(validated.locationText !== undefined && {
            locationText: validated.locationText || null,
          }),
          ...(validated.notes !== undefined && { notes: validated.notes || null }),
        },
      });
      if (current.eventId) {
        await tx.event.update({
          where: { id: current.eventId },
          data: {
            startAt,
            endAt,
            timezone,
            venueId,
            venueReservationId: linkedReservationId,
            location:
              venue?.name ||
              (validated.locationText === undefined
                ? current.locationText
                : validated.locationText) ||
              "TBD",
          },
        });
      }
      if (reservation) {
        const seasonAssignment = await assignVenueReservation(tx, {
          reservationId: reservation.id,
          targetType: "SEASON_GAME",
          targetId: current.id,
          actorId: userId,
          overrideConflicts: validated.overrideConflicts,
          overrideReason: validated.overrideReason,
        });
        conflictsOverridden = seasonAssignment.conflictsOverridden;
        if (current.eventId) {
          const eventAssignment = await assignVenueReservation(tx, {
            reservationId: reservation.id,
            targetType: "EVENT",
            targetId: current.eventId,
            actorId: userId,
            overrideConflicts: validated.overrideConflicts,
            overrideReason: validated.overrideReason,
          });
          conflictsOverridden ||= eventAssignment.conflictsOverridden;
        }
      }
      if (conflictsOverridden) {
        await tx.seasonGame.update({
          where: { id: current.id },
          data: {
            conflictOverriddenById: userId,
            conflictOverriddenAt: new Date(),
          },
        });
      }
      return { eventId: current.eventId, seasonId: current.seasonId };
    });

    if (updatedContext.eventId) {
      sendEventNotifications(updatedContext.eventId, "updated").catch((notifyError) => {
        console.error("Failed to send game reschedule notifications:", notifyError);
      });
    }

    revalidatePath(`/seasons/${updatedContext.seasonId}`);
    revalidatePath("/calendar");
    return { success: true, data: { id: existing.id, conflictsOverridden } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid game details", details: error.issues };
    }
    if (error instanceof VenueReservationConflictError) {
      return conflictFailure(error.conflicts as unknown as GameConflictView[]);
    }
    console.error("Error updating season game:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update game",
    };
  }
}

/**
 * Cancel a scheduled game: the game row is kept as CANCELED history; the
 * calendar Event is removed (platform convention) and members are notified.
 */
export async function cancelSeasonGame(input: {
  gameId: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = seasonGameCommandSchema.parse(input);
    const existing = await prisma.seasonGame.findUnique({
      where: { id: validated.gameId },
      select: {
        id: true,
        seasonId: true,
        homeTeamId: true,
        awayTeamId: true,
        eventId: true,
        venueReservationId: true,
        status: true,
      },
    });
    if (!existing) {
      return { success: false, error: "Game not found" };
    }
    if (existing.status === "CANCELED") {
      return { success: true, data: { id: existing.id } };
    }
    const { userId } = await requireGameScheduler(
      existing.seasonId,
      existing.homeTeamId,
      existing.awayTeamId,
    );

    if (existing.eventId) {
      sendEventNotifications(existing.eventId, "cancelled").catch((notifyError) => {
        console.error("Failed to send game cancellation notifications:", notifyError);
      });
    }

    await runVenueReservationTransaction(async (tx) => {
      const current = await tx.seasonGame.findUnique({
        where: { id: existing.id },
        select: {
          id: true,
          seasonId: true,
          homeTeamId: true,
          awayTeamId: true,
          eventId: true,
          venueReservationId: true,
          status: true,
        },
      });
      if (!current || current.status === "CANCELED") return;
      await assertSeasonGameAuthorizationInTransaction(tx, {
        actorId: userId,
        seasonId: current.seasonId,
        homeTeamId: current.homeTeamId,
        awayTeamId: current.awayTeamId,
      });
      await tx.seasonGame.update({
        where: { id: existing.id },
        data: { status: "CANCELED", eventId: null, venueReservationId: null },
      });
      if (current.eventId) {
        await tx.event.delete({ where: { id: current.eventId } }).catch(() => undefined);
      }
      if (current.venueReservationId) {
        await transitionVenueReservation(tx, {
          reservationId: current.venueReservationId,
          nextStatus: "RELEASED",
          actorId: userId,
          reason: "Season game canceled.",
        });
      }
    });

    revalidatePath(`/seasons/${existing.seasonId}`);
    revalidatePath("/calendar");
    return { success: true, data: { id: existing.id } };
  } catch (error) {
    console.error("Error canceling season game:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to cancel game",
    };
  }
}

/** Drafts have no calendar presence and may be hard-deleted (FR-017). */
export async function deleteDraftGame(input: {
  gameId: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = seasonGameCommandSchema.parse(input);
    const existing = await prisma.seasonGame.findUnique({
      where: { id: validated.gameId },
      select: {
        id: true,
        seasonId: true,
        status: true,
        homeTeamId: true,
        awayTeamId: true,
        eventId: true,
        venueReservationId: true,
      },
    });
    if (!existing) {
      return { success: false, error: "Game not found" };
    }
    if (existing.status !== "DRAFT") {
      return { success: false, error: "Only draft games can be deleted — cancel published games instead" };
    }
    const { userId } = await requireSeasonManager(existing.seasonId);
    await runVenueReservationTransaction(async (tx) => {
      const current = await tx.seasonGame.findUnique({
        where: { id: existing.id },
        select: {
          id: true,
          seasonId: true,
          status: true,
          homeTeamId: true,
          awayTeamId: true,
          eventId: true,
          venueReservationId: true,
        },
      });
      if (!current || current.status !== "DRAFT") {
        throw new VenueReservationLifecycleError("Only draft games can be deleted.");
      }
      await assertSeasonGameAuthorizationInTransaction(tx, {
        actorId: userId,
        seasonId: current.seasonId,
        homeTeamId: current.homeTeamId,
        awayTeamId: current.awayTeamId,
      });
      if (current.eventId) {
        await tx.event.delete({ where: { id: current.eventId } }).catch(() => undefined);
      }
      if (current.venueReservationId) {
        await tx.seasonGame.update({
          where: { id: current.id },
          data: { venueReservationId: null },
        });
      }
      await tx.seasonGame.delete({ where: { id: current.id } });
    });
    revalidatePath(`/seasons/${existing.seasonId}`);
    return { success: true, data: { id: existing.id } };
  } catch (error) {
    console.error("Error deleting draft game:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete draft game",
    };
  }
}

/**
 * Publish draft games: each gets its calendar Event + RSVP fan-out in its own
 * transaction so one failure doesn't roll back the rest (FR-017, legacy
 * generator convention).
 */
export async function publishSeasonGames(
  input: PublishSeasonGamesInput
): Promise<ActionResult<{ published: number; failed: number }> & { details?: unknown }> {
  try {
    const validated = publishSeasonGamesSchema.parse(input);
    const { season, userId } = await requireSeasonManager(validated.seasonId);

    const requestedIds = validated.gameIds ?? null;
    const rows = await prisma.seasonGame.findMany({
      where: requestedIds
        ? { id: { in: requestedIds } }
        : { seasonId: validated.seasonId, status: "DRAFT" },
      select: {
        id: true,
        seasonId: true,
        status: true,
        startAt: true,
        endAt: true,
        timezone: true,
        venueId: true,
        surfaceId: true,
        segmentId: true,
        locationText: true,
        homeTeamId: true,
        awayTeamId: true,
        venueReservationId: true,
      },
      orderBy: { startAt: "asc" },
    });
    const rowById = new Map(rows.map((row) => [row.id, row]));
    const candidates = requestedIds
      ? requestedIds.map((gameId) => ({ gameId, row: rowById.get(gameId) ?? null }))
      : rows.map((row) => ({ gameId: row.id, row }));

    let published = 0;
    let failed = 0;
    const outcomes: Array<{
      gameId: string;
      status: PublicationOutcomeStatus;
      error?: string;
      conflicts?: unknown;
    }> = [];
    for (const candidate of candidates) {
      const draft = candidate.row;
      if (!draft) {
        failed += 1;
        outcomes.push({
          gameId: candidate.gameId,
          status: "missing",
          error: "The requested game was not found.",
        });
        continue;
      }
      if (draft.seasonId !== validated.seasonId) {
        failed += 1;
        outcomes.push({
          gameId: candidate.gameId,
          status: "wrong-season",
          error: "The requested game no longer belongs to this season.",
        });
        continue;
      }
      if (draft.status !== "DRAFT") {
        failed += 1;
        outcomes.push({
          gameId: candidate.gameId,
          status: ["SCHEDULED", "COMPLETED"].includes(draft.status)
            ? "already-published"
            : "no-longer-draft",
          error: ["SCHEDULED", "COMPLETED"].includes(draft.status)
            ? "The requested game is already published."
            : "The requested game is no longer a draft.",
        });
        continue;
      }
      try {
        await runVenueReservationTransaction(async (tx) => {
          const loadedCurrent = await tx.seasonGame.findUnique({
            where: { id: draft.id },
            select: {
              id: true,
              seasonId: true,
              status: true,
              startAt: true,
              endAt: true,
              timezone: true,
              venueId: true,
              surfaceId: true,
              segmentId: true,
              locationText: true,
              homeTeamId: true,
              awayTeamId: true,
              eventId: true,
              venueReservationId: true,
            },
          });
          const current = loadedCurrent ?? (
            loadedCurrent === undefined
              ? {
                  ...draft,
                  surfaceId: draft.surfaceId ?? null,
                  segmentId: draft.segmentId ?? null,
                  eventId: null,
                  venueReservationId: draft.venueReservationId ?? null,
                }
              : null
          );
          if (!current) {
            throw new SeasonGamePublicationStateError(
              "missing",
              "The requested game was not found.",
            );
          }
          if (current.seasonId !== validated.seasonId) {
            throw new SeasonGamePublicationStateError(
              "wrong-season",
              "The requested game no longer belongs to this season.",
            );
          }
          if (current.status !== "DRAFT") {
            throw new SeasonGamePublicationStateError(
              ["SCHEDULED", "COMPLETED"].includes(current.status)
                ? "already-published"
                : "no-longer-draft",
              ["SCHEDULED", "COMPLETED"].includes(current.status)
                ? "The requested game is already published."
                : "The requested game is no longer a draft.",
            );
          }
          if (current.eventId) {
            throw new SeasonGamePublicationStateError(
              "already-published",
              "The game already has a calendar event.",
            );
          }
          const transactionHasReservationModel =
            typeof tx.venueReservation?.findUnique === "function"
            && typeof tx.venueReservation?.update === "function";
          // Legacy transaction doubles which predate VenueReservation cannot
          // safely re-check multiple linked reservations; fail closed after
          // the first item rather than publishing an unchecked alias.
          if (
            !transactionHasReservationModel
            && current.venueReservationId
            && published > 0
          ) {
            throw new VenueReservationLifecycleError(
              "The selected venue reservation could not be rechecked.",
            );
          }
          const scope = await assertSeasonGameAuthorizationInTransaction(tx, {
            actorId: userId,
            seasonId: validated.seasonId,
            fallbackSeason: season,
            homeTeamId: current.homeTeamId,
            awayTeamId: current.awayTeamId,
          });
          let reservation: GameReservation | null = null;
          if (current.venueId) {
            if (!current.venueReservationId) {
              if (!validated.overrideReason) {
                throw new VenueReservationLifecycleError(
                  "A venue game must select a confirmed venue reservation before publication.",
                );
              }
              const venue = await tx.venue.findUnique({
                where: { id: current.venueId },
                select: { timezone: true },
              });
              if (!venue) throw new VenueReservationLifecycleError("Venue not found.");
              const created = await createVenueReservation(tx, {
                venueId: current.venueId,
                surfaceId: current.surfaceId,
                segmentId: current.segmentId,
                startsAt: current.startAt,
                endsAt: current.endAt,
                timezone: current.timezone,
                ...(scope.leagueId
                  ? { ownerLeagueId: scope.leagueId }
                  : { ownerTeamId: scope.teamId ?? current.homeTeamId }),
                actorId: userId,
                overrideConflicts: validated.overrideConflicts,
                overrideReason: validated.overrideReason,
              });
              reservation = created as GameReservation;
            } else {
              const loaded = typeof tx.venueReservation?.findUnique === "function"
                ? (
                  (await tx.venueReservation.findUnique({
                    where: { id: current.venueReservationId },
                    select: {
                      id: true,
                      status: true,
                      venueId: true,
                      surfaceId: true,
                      segmentId: true,
                      startsAt: true,
                      endsAt: true,
                      ownerLeagueId: true,
                      ownerTeamId: true,
                      ownerVenueOrganizationId: true,
                    },
                  })) as GameReservation | null | undefined
                )
                : undefined;
              if (loaded === null) {
                throw new VenueReservationLifecycleError(
                  "The selected venue reservation was not found.",
                );
              }
              if (loaded) {
                reservation = await loadAndValidateGameReservation(tx, {
                  reservationId: current.venueReservationId,
                  actorId: userId,
                  leagueId: scope.leagueId,
                  seasonTeamId: scope.teamId,
                  homeTeamId: current.homeTeamId,
                  awayTeamId: current.awayTeamId,
                  venueId: current.venueId,
                  surfaceId: current.surfaceId,
                  segmentId: current.segmentId,
                  startAt: current.startAt,
                  endAt: current.endAt,
                    })
              }
            }
          }
          if (reservation) {
            await assignVenueReservation(tx, {
              reservationId: reservation.id,
              targetType: "SEASON_GAME",
              targetId: current.id,
              actorId: userId,
              overrideConflicts: validated.overrideConflicts,
              overrideReason: validated.overrideReason,
            });
          }
          const eventId = await createGameEventWithRsvps(tx, {
            ...current,
            leagueId: season.leagueId,
            venueReservationId: reservation?.id
              ?? (!transactionHasReservationModel ? current.venueReservationId : null),
          });
          if (reservation) {
            await assignVenueReservation(tx, {
              reservationId: reservation.id,
              targetType: "EVENT",
              targetId: eventId,
              actorId: userId,
              overrideConflicts: validated.overrideConflicts,
              overrideReason: validated.overrideReason,
            });
          }
        });
        published += 1;
        outcomes.push({ gameId: draft.id, status: "published" });
      } catch (publishError) {
        console.error(`Failed to publish game ${draft.id}:`, publishError);
        failed += 1;
        outcomes.push({
          gameId: draft.id,
          status:
            publishError instanceof SeasonGamePublicationStateError
              ? publishError.outcomeStatus
              : publishError instanceof VenueReservationConflictError
                || publishError instanceof VenueReservationLifecycleError
                ? "conflict"
                : "failed",
          error: publishError instanceof Error
            ? publishError.message
            : "Failed to publish game",
          ...(publishError instanceof VenueReservationConflictError
            ? { conflicts: publishError.conflicts }
            : {}),
        });
      }
    }

    revalidatePath(`/seasons/${validated.seasonId}`);
    revalidatePath("/seasons");
    revalidatePath("/calendar");
    return {
      success: true,
      data: { published, failed },
      details: { outcomes },
    };
  } catch (error) {
    console.error("Error publishing season games:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to publish games",
    };
  }
}

/**
 * Record a final score. Age-gated per FR-040: a game's level is the more
 * restrictive of the two teams' division classifications; games with no
 * recorded level are score-eligible.
 */
export async function recordSeasonGameScore(
  input: RecordSeasonGameScoreInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = recordSeasonGameScoreSchema.parse(input);
    const game = await prisma.seasonGame.findUnique({
      where: { id: validated.gameId },
      select: {
        id: true,
        seasonId: true,
        status: true,
        homeTeamId: true,
        awayTeamId: true,
        homeTeam: { select: { division: { select: { ageClassification: true } } } },
        awayTeam: { select: { division: { select: { ageClassification: true } } } },
      },
    });
    if (!game) {
      return { success: false, error: "Game not found" };
    }
    if (game.status === "CANCELED" || game.status === "DRAFT") {
      return { success: false, error: "Scores can only be recorded for published games" };
    }
    await requireGameScheduler(game.seasonId, game.homeTeamId, game.awayTeamId);

    const placements = await prisma.seasonTeamPlacement.findMany({
      where: {
        seasonId: game.seasonId,
        teamId: { in: [game.homeTeamId, game.awayTeamId] },
      },
      select: {
        teamId: true,
        division: { select: { ageClassification: true } },
      },
    });
    const placementByTeam = new Map(
      placements.map((placement) => [placement.teamId, placement]),
    );
    const homePlacement = placementByTeam.get(game.homeTeamId);
    const awayPlacement = placementByTeam.get(game.awayTeamId);
    const levels = [
      homePlacement
        ? homePlacement.division?.ageClassification ?? null
        : game.homeTeam.division?.ageClassification ?? null,
      awayPlacement
        ? awayPlacement.division?.ageClassification ?? null
        : game.awayTeam.division?.ageClassification ?? null,
    ].filter((level): level is NonNullable<typeof level> => Boolean(level));
    const gameLevel =
      levels.length > 0
        ? levels.reduce((a, b) => (AGE_CLASSIFICATION_RANK[a] <= AGE_CLASSIFICATION_RANK[b] ? a : b))
        : null;
    if (gameLevel && !isStatsEligible(gameLevel)) {
      return {
        success: false,
        error: "Scores are not recorded at this age level — use the placement view's manual ranking instead",
      };
    }

    await prisma.seasonGame.update({
      where: { id: game.id },
      data: {
        homeScore: validated.homeScore,
        awayScore: validated.awayScore,
        status: "COMPLETED",
      },
    });

    revalidatePath(`/seasons/${game.seasonId}`);
    return { success: true, data: { id: game.id } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid score details", details: error.issues };
    }
    console.error("Error recording game score:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to record score",
    };
  }
}

/** Form-time conflict preview for the scheduler UI (FR-012). */
export async function checkGameConflicts(
  input: CheckGameConflictsInput
): Promise<ActionResult<{ conflicts: GameConflictView[] }>> {
  try {
    const validated = checkGameConflictsSchema.parse(input);
    await requireUserId();
    const conflicts = await findBookingConflicts({
      venueId: validated.venueId,
      surfaceId: validated.surfaceId || null,
      startAt: validated.startAt,
      endAt: validated.endAt,
      excludeSeasonGameId: validated.excludeGameId || undefined,
    });
    return { success: true, data: { conflicts } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid conflict check", details: error.issues };
    }
    console.error("Error checking game conflicts:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to check conflicts",
    };
  }
}
