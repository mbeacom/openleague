"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { sendEventNotifications } from "@/lib/email/templates";
import { findGameConflicts } from "@/lib/utils/game-conflicts";
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
    const phaseId = validated.phaseId || null;

    if (surfaceId) {
      const surface = await prisma.iceSurface.findFirst({
        where: { id: surfaceId, venueId: venueId ?? undefined, isActive: true },
        select: { id: true },
      });
      if (!surface) {
        return { success: false, error: "Select an active surface at the chosen venue" };
      }
    }

    // Venue availability (FR-012/013): warn and require an explicit,
    // recorded override to proceed.
    let conflictsOverridden = false;
    if (venueId) {
      const conflicts = await findGameConflicts({
        venueId,
        surfaceId,
        startAt: validated.startAt,
        endAt: validated.endAt,
      });
      if (conflicts.length > 0 && !validated.overrideConflicts) {
        return conflictFailure(conflicts);
      }
      conflictsOverridden = conflicts.length > 0;
    }

    const timezone = await resolveGameTimezone(validated.timezone || undefined, venueId);

    const game = await prisma.$transaction(async (tx) => {
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
          surfaceUsage: validated.surfaceUsage ?? null,
          zoneLabel: validated.zoneLabel || null,
          locationText: validated.locationText || null,
          notes: validated.notes || null,
          homeTeamId: validated.homeTeamId,
          awayTeamId: validated.awayTeamId,
          createdById: userId,
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
          locationText: true,
          homeTeamId: true,
          awayTeamId: true,
        },
      });

      if (validated.publish) {
        await createGameEventWithRsvps(tx, { ...created, leagueId: season.leagueId });
      }

      return created;
    });

    revalidatePath(`/seasons/${validated.seasonId}`);
    revalidatePath("/seasons");
    revalidatePath("/calendar");
    return { success: true, data: { id: game.id, conflictsOverridden } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid game details", details: error.issues };
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
    if (existing.status === "CANCELED") {
      return { success: false, error: "Canceled games cannot be edited" };
    }
    const { userId } = await requireGameScheduler(
      existing.seasonId,
      existing.homeTeamId,
      existing.awayTeamId
    );

    const startAt = validated.startAt ?? existing.startAt;
    const endAt = validated.endAt ?? existing.endAt;
    if (endAt <= startAt) {
      return { success: false, error: "End time must be after the start time" };
    }
    const venueId =
      validated.venueId === undefined ? existing.venueId : validated.venueId || null;
    const surfaceId =
      validated.surfaceId === undefined ? existing.surfaceId : validated.surfaceId || null;

    if (surfaceId && surfaceId !== existing.surfaceId) {
      const surface = await prisma.iceSurface.findFirst({
        where: { id: surfaceId, venueId: venueId ?? undefined, isActive: true },
        select: { id: true },
      });
      if (!surface) {
        return { success: false, error: "Select an active surface at the chosen venue" };
      }
    }

    let conflictsOverridden = false;
    if (venueId) {
      const conflicts = await findGameConflicts({
        venueId,
        surfaceId,
        startAt,
        endAt,
        excludeSeasonGameId: existing.id,
        excludeEventId: existing.eventId ?? undefined,
      });
      if (conflicts.length > 0 && !validated.overrideConflicts) {
        return conflictFailure(conflicts);
      }
      conflictsOverridden = conflicts.length > 0;
    }

    const timezone = validated.timezone || existing.timezone;

    await prisma.$transaction(async (tx) => {
      await tx.seasonGame.update({
        where: { id: existing.id },
        data: {
          startAt,
          endAt,
          timezone,
          venueId,
          surfaceId,
          ...(validated.phaseId !== undefined && { phaseId: validated.phaseId || null }),
          ...(validated.surfaceUsage !== undefined && { surfaceUsage: validated.surfaceUsage }),
          ...(validated.zoneLabel !== undefined && { zoneLabel: validated.zoneLabel || null }),
          ...(validated.locationText !== undefined && {
            locationText: validated.locationText || null,
          }),
          ...(validated.notes !== undefined && { notes: validated.notes || null }),
          ...(conflictsOverridden && {
            conflictOverriddenById: userId,
            conflictOverriddenAt: new Date(),
          }),
        },
      });

      // Reschedules propagate to the linked calendar Event; RSVPs are
      // retained and members re-notified (FR-010/011).
      if (existing.eventId) {
        const venue = venueId
          ? await tx.venue.findUnique({ where: { id: venueId }, select: { name: true } })
          : null;
        await tx.event.update({
          where: { id: existing.eventId },
          data: {
            startAt,
            endAt,
            timezone,
            venueId,
            location:
              venue?.name ||
              (validated.locationText === undefined
                ? existing.locationText
                : validated.locationText) ||
              "TBD",
          },
        });
      }
    });

    if (existing.eventId) {
      sendEventNotifications(existing.eventId, "updated").catch((notifyError) => {
        console.error("Failed to send game reschedule notifications:", notifyError);
      });
    }

    revalidatePath(`/seasons/${existing.seasonId}`);
    revalidatePath("/calendar");
    return { success: true, data: { id: existing.id, conflictsOverridden } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid game details", details: error.issues };
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
      select: { id: true, seasonId: true, homeTeamId: true, awayTeamId: true, eventId: true, status: true },
    });
    if (!existing) {
      return { success: false, error: "Game not found" };
    }
    if (existing.status === "CANCELED") {
      return { success: true, data: { id: existing.id } };
    }
    await requireGameScheduler(existing.seasonId, existing.homeTeamId, existing.awayTeamId);

    if (existing.eventId) {
      sendEventNotifications(existing.eventId, "cancelled").catch((notifyError) => {
        console.error("Failed to send game cancellation notifications:", notifyError);
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.seasonGame.update({
        where: { id: existing.id },
        data: { status: "CANCELED", eventId: null },
      });
      if (existing.eventId) {
        await tx.event.delete({ where: { id: existing.eventId } }).catch(() => undefined);
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
      select: { id: true, seasonId: true, status: true },
    });
    if (!existing) {
      return { success: false, error: "Game not found" };
    }
    if (existing.status !== "DRAFT") {
      return { success: false, error: "Only draft games can be deleted — cancel published games instead" };
    }
    await requireSeasonManager(existing.seasonId);
    await prisma.seasonGame.delete({ where: { id: existing.id } });
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
): Promise<ActionResult<{ published: number; failed: number }>> {
  try {
    const validated = publishSeasonGamesSchema.parse(input);
    const { season } = await requireSeasonManager(validated.seasonId);

    const drafts = await prisma.seasonGame.findMany({
      where: {
        seasonId: validated.seasonId,
        status: "DRAFT",
        ...(validated.gameIds ? { id: { in: validated.gameIds } } : {}),
      },
      select: {
        id: true,
        startAt: true,
        endAt: true,
        timezone: true,
        venueId: true,
        locationText: true,
        homeTeamId: true,
        awayTeamId: true,
      },
      orderBy: { startAt: "asc" },
    });

    let published = 0;
    let failed = 0;
    for (const draft of drafts) {
      try {
        await prisma.$transaction(async (tx) => {
          await createGameEventWithRsvps(tx, { ...draft, leagueId: season.leagueId });
        });
        published += 1;
      } catch (publishError) {
        console.error(`Failed to publish game ${draft.id}:`, publishError);
        failed += 1;
      }
    }

    revalidatePath(`/seasons/${validated.seasonId}`);
    revalidatePath("/seasons");
    revalidatePath("/calendar");
    return { success: true, data: { published, failed } };
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

    const levels = [
      game.homeTeam.division?.ageClassification,
      game.awayTeam.division?.ageClassification,
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
    const conflicts = await findGameConflicts({
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
