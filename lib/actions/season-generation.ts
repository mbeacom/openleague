"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { revalidatePath } from "next/cache";
import { buildRoundRobin, type ProposedGame } from "@/lib/utils/round-robin";
import { findBookingConflicts } from "@/lib/utils/availability";
import { FALLBACK_TIME_ZONE } from "@/lib/utils/date";
import { assignVenueReservation } from "@/lib/services/venue-reservations";
import { runVenueReservationTransaction } from "@/lib/services/venue-reservation-transaction";
import {
  generateRoundRobinSchema,
  type GenerateRoundRobinInput,
} from "@/lib/utils/validation";
import { requireSeasonManager, type ActionResult } from "@/lib/actions/seasons";
import type { GameConflictView } from "@/types/seasons";

export type GenerationPreviewGame = ProposedGame & {
  homeTeamName: string;
  awayTeamName: string;
  venueReservationId: string | null;
  surfaceId: string | null;
  segmentId: string | null;
  conflicts: GameConflictView[];
};

export type GenerationPreview = {
  games: GenerationPreviewGame[];
  totalPairings: number;
  unslottedCount: number;
  unslottedPairings: Array<{
    homeTeamId: string;
    awayTeamId: string;
    round: number;
    reason: "DATE_RANGE" | "NO_RESERVATION";
  }>;
};

type GeneratedGame = ProposedGame & {
  venueReservationId: string | null;
  surfaceId: string | null;
  segmentId: string | null;
};

type ReservationInventoryRow = {
  id: string;
  status: string;
  usageStatus?: string;
  venueId: string;
  surfaceId: string | null;
  segmentId: string | null;
  startsAt: Date;
  endsAt: Date;
  ownerLeagueId: string | null;
  ownerTeamId: string | null;
  ownerVenueOrganizationId: string | null;
  seasonGames?: Array<{ id: string }>;
  events?: Array<{ id: string }>;
  eventGames?: Array<{ id: string }>;
  signupEvents?: Array<{ id: string }>;
  practiceSessions?: Array<{ id: string }>;
  proposalEntries?: Array<{ id: string }>;
};

function reservationMatchesSeason(
  reservation: ReservationInventoryRow,
  game: ProposedGame,
  season: { leagueId: string | null; teamId: string | null },
  teamIds: string[],
): boolean {
  if (
    reservation.status !== "CONFIRMED"
    || (reservation.usageStatus && reservation.usageStatus !== "PENDING")
    || reservation.ownerVenueOrganizationId
    || reservation.seasonGames?.length
    || reservation.events?.length
    || reservation.eventGames?.length
    || reservation.signupEvents?.length
    || reservation.practiceSessions?.length
    || reservation.proposalEntries?.length
  ) {
    return false;
  }

  if (season.leagueId && reservation.ownerLeagueId === season.leagueId) {
    return !reservation.ownerTeamId;
  }

  return (
    !reservation.ownerLeagueId
    && reservation.ownerTeamId !== null
    && teamIds.includes(reservation.ownerTeamId)
    && (game.homeTeamId === reservation.ownerTeamId || game.awayTeamId === reservation.ownerTeamId)
  );
}

async function loadReservationInventory(
  validated: ReturnType<typeof generateRoundRobinSchema.parse>,
  season: { leagueId: string | null; teamId: string | null },
): Promise<ReservationInventoryRow[]> {
  if (typeof prisma.venueReservation?.findMany !== "function") return [];

  const endExclusive = new Date(validated.endDate.getTime() + 86_400_000);
  const rows = await prisma.venueReservation.findMany({
    where: {
      status: "CONFIRMED",
      usageStatus: "PENDING",
      ...(validated.defaultVenueId ? { venueId: validated.defaultVenueId } : {}),
      startsAt: { gte: validated.startDate, lt: endExclusive },
      // Confirmed reservations are association/team inventory only.  The
      // relation filters keep already assigned aliases out of the generator.
      OR: season.leagueId
        ? [
            {
              ownerLeagueId: season.leagueId,
              ownerTeamId: null,
              ownerVenueOrganizationId: null,
            },
            {
              ownerTeamId: { in: validated.teamIds },
              ownerLeagueId: null,
              ownerVenueOrganizationId: null,
            },
          ]
        : [
            {
              ownerTeamId: { in: validated.teamIds },
              ownerLeagueId: null,
              ownerVenueOrganizationId: null,
            },
          ],
      seasonGames: { none: {} },
      events: { none: {} },
      eventGames: { none: {} },
      signupEvents: { none: {} },
      practiceSessions: { none: {} },
      proposalEntries: { none: {} },
    },
    select: {
      id: true,
      status: true,
      usageStatus: true,
      venueId: true,
      surfaceId: true,
      segmentId: true,
      startsAt: true,
      endsAt: true,
      ownerLeagueId: true,
      ownerTeamId: true,
      ownerVenueOrganizationId: true,
      seasonGames: { select: { id: true } },
      events: { select: { id: true } },
      eventGames: { select: { id: true } },
      signupEvents: { select: { id: true } },
      practiceSessions: { select: { id: true } },
      proposalEntries: { select: { id: true } },
    },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
  });

  return rows as ReservationInventoryRow[];
}

function assignInventoryToProposedGames(
  games: ProposedGame[],
  inventory: ReservationInventoryRow[],
  season: { leagueId: string | null; teamId: string | null },
  teamIds: string[],
  venueRequired: boolean,
): GeneratedGame[] {
  if (!venueRequired) {
    return games.map((game) => ({
      ...game,
      venueReservationId: null,
      surfaceId: null,
      segmentId: null,
    }));
  }

  const usedReservationIds = new Set<string>();
  return games.map((game) => {
    const reservation = inventory.find(
      (candidate) =>
        !usedReservationIds.has(candidate.id)
        && reservationMatchesSeason(candidate, game, season, teamIds)
    );

    if (!reservation) {
      return {
        ...game,
        venueId: null,
        venueReservationId: null,
        surfaceId: null,
        segmentId: null,
      };
    }

    usedReservationIds.add(reservation.id);
    return {
      ...game,
      startAt: reservation.startsAt,
      endAt: reservation.endsAt,
      venueId: reservation.venueId,
      venueReservationId: reservation.id,
      surfaceId: reservation.surfaceId,
      segmentId: reservation.segmentId,
    };
  });
}

/**
 * Shared by preview and generation so the preview always matches what gets
 * created (FR-016): the same deterministic buildRoundRobin output, with
 * venue conflicts flagged per game when a default venue is set.
 */
async function computeGeneration(input: GenerateRoundRobinInput): Promise<{
  preview: GenerationPreview;
  proposed: GeneratedGame[];
  timezone: string;
  validated: ReturnType<typeof generateRoundRobinSchema.parse>;
  userId: string;
}> {
  const validated = generateRoundRobinSchema.parse(input);
  const { season, userId } = await requireSeasonManager(validated.seasonId);

  // Teams must belong to the season's scope: league seasons require every
  // team to belong to the league; team-owned seasons mirror the game-level
  // rule (requireGameScheduler) — the owning team must participate and the
  // caller must administer every participating team.
  if (season.leagueId) {
    const count = await prisma.team.count({
      where: { id: { in: validated.teamIds }, leagueId: season.leagueId },
    });
    if (count !== validated.teamIds.length) {
      throw new Error("All teams must belong to this season's league");
    }
  } else {
    if (!season.teamId || !validated.teamIds.includes(season.teamId)) {
      throw new Error("The season's owning team must be included in the schedule");
    }
    // teamIds are schema-validated as distinct, so a count comparison is exact.
    const adminCount = await prisma.teamMember.count({
      where: { userId, role: "ADMIN", teamId: { in: validated.teamIds } },
    });
    if (adminCount !== validated.teamIds.length) {
      throw new Error("Unauthorized: you must be an admin of every participating team");
    }
  }

  // Placement is a season projection, not Team.divisionId. Use its rank as
  // the deterministic seed order when one exists, while retaining the
  // existing caller order for teams not yet backfilled.
  const placements =
    (await prisma.seasonTeamPlacement?.findMany({
      where: { seasonId: season.id, teamId: { in: validated.teamIds } },
      select: { teamId: true, rank: true },
    })) ?? [];
  const placementRankByTeam = new Map(
    placements.map((placement) => [placement.teamId, placement.rank ?? Number.MAX_SAFE_INTEGER]),
  );
  const orderedTeamIds = [...validated.teamIds].sort(
    (left, right) =>
      (placementRankByTeam.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (placementRankByTeam.get(right) ?? Number.MAX_SAFE_INTEGER) ||
      validated.teamIds.indexOf(left) - validated.teamIds.indexOf(right),
  );

  const defaultVenueId = validated.defaultVenueId || null;
  const venue = defaultVenueId
    ? await prisma.venue.findUnique({
        where: { id: defaultVenueId },
        select: { timezone: true },
      })
    : null;
  const timezone = venue?.timezone || FALLBACK_TIME_ZONE;

  const result = buildRoundRobin({
    teamIds: orderedTeamIds,
    rounds: validated.rounds,
    startDate: validated.startDate,
    endDate: validated.endDate,
    eligibleDays: validated.eligibleDays,
    startTime: validated.startTime,
    gameDurationMinutes: validated.gameDurationMinutes,
    timezone,
    defaultVenueId,
  });

  const inventory = await loadReservationInventory(validated, season);
  const generated = assignInventoryToProposedGames(
    result.games,
    inventory,
    season,
    validated.teamIds,
    Boolean(defaultVenueId),
  );

  const slotted = defaultVenueId
    ? generated.filter((game) => Boolean(game.venueReservationId))
    : generated;

  const teams = await prisma.team.findMany({
    where: { id: { in: validated.teamIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(teams.map((t) => [t.id, t.name]));

  const games: GenerationPreviewGame[] = await Promise.all(
    slotted.map(async (game) => ({
      ...game,
      homeTeamName: nameById.get(game.homeTeamId) ?? "Home",
      awayTeamName: nameById.get(game.awayTeamId) ?? "Away",
      // Conflicts are surfaced in the review step, never silently discarded
      // (US2 scenario 6 — fixes the legacy behavior).
      // Reservation-backed games carry their exact surface/segment scope;
      // venue-less games do not need an occupancy check.
      conflicts: game.venueReservationId
        ? (
          await findBookingConflicts({
            venueId: game.venueId!,
            surfaceId: game.surfaceId,
            segmentId: game.segmentId,
            startAt: game.startAt,
            endAt: game.endAt,
            excludeReservationIds: [game.venueReservationId],
          })
        )
        : [],
    }))
  );

  const totalPairings =
    ((validated.teamIds.length * (validated.teamIds.length - 1)) / 2) * validated.rounds;

  const reservationUnslotted = defaultVenueId
    ? generated
        .filter((game) => !game.venueReservationId)
        .map((game) => ({
          homeTeamId: game.homeTeamId,
          awayTeamId: game.awayTeamId,
          round: game.round,
          reason: "NO_RESERVATION" as const,
        }))
    : [];
  const dateUnslotted = result.unslottedPairings.map((pairing) => ({
    ...pairing,
    reason: "DATE_RANGE" as const,
  }));

  return {
    preview: {
      games,
      totalPairings,
      unslottedCount: dateUnslotted.length + reservationUnslotted.length,
      unslottedPairings: [...dateUnslotted, ...reservationUnslotted],
    },
    proposed: slotted,
    timezone,
    validated,
    userId,
  };
}

export async function previewRoundRobin(
  input: GenerateRoundRobinInput
): Promise<ActionResult<GenerationPreview>> {
  try {
    const { preview } = await computeGeneration(input);
    return { success: true, data: preview };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid generation settings", details: error.issues };
    }
    console.error("Error previewing round robin:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to preview schedule",
    };
  }
}

/**
 * Persist the previewed round-robin as DRAFT games (no calendar presence
 * until publish — FR-017) and record the honest format label (FR-006/007).
 */
export async function generateRoundRobin(
  input: GenerateRoundRobinInput
): Promise<ActionResult<{
  createdIds: string[];
  unslottedCount: number;
  unslottedPairings: GenerationPreview["unslottedPairings"];
}>> {
  try {
    const { preview, proposed, timezone, validated, userId } = await computeGeneration(input);
    const conflicted = preview.games.filter((game) => game.conflicts.length > 0);
    if (conflicted.length > 0) {
      return {
        success: false,
        error: "One or more generated games conflict with current venue occupancy",
        details: {
          conflicts: conflicted.map((game) => ({
            homeTeamId: game.homeTeamId,
            awayTeamId: game.awayTeamId,
            startAt: game.startAt,
            endAt: game.endAt,
            venueReservationId: game.venueReservationId,
            conflicts: game.conflicts,
          })),
        },
      };
    }
    const phaseId = validated.phaseId || null;

    // Object-level authz: requireSeasonManager (in computeGeneration) authorizes
    // the seasonId, but the caller-supplied phaseId is not covered by that check.
    // Without this, a legitimate admin of season A could pass a phaseId belonging
    // to another league's season B and overwrite its format/formatRounds.
    if (phaseId) {
      const phase = await prisma.seasonPhase.findUnique({
        where: { id: phaseId },
        select: { seasonId: true },
      });
      if (!phase || phase.seasonId !== validated.seasonId) {
        return { success: false, error: "Invalid phase for this season" };
      }
    }

    const createdIds = await runVenueReservationTransaction(async (tx) => {
      const ids: string[] = [];
      for (const game of proposed) {
        const created = await tx.seasonGame.create({
          data: {
            seasonId: validated.seasonId,
            phaseId,
            status: "DRAFT",
            startAt: game.startAt,
            endAt: game.endAt,
            timezone,
            venueId: game.venueId,
            surfaceId: game.surfaceId,
            segmentId: game.segmentId,
            venueReservationId:
              typeof tx.venueReservation?.findUnique === "function"
                ? null
                : game.venueReservationId,
            homeTeamId: game.homeTeamId,
            awayTeamId: game.awayTeamId,
            createdById: userId,
          },
          select: { id: true },
        });
        if (
          game.venueReservationId
          && typeof tx.venueReservation?.findUnique === "function"
        ) {
          await assignVenueReservation(tx, {
            reservationId: game.venueReservationId,
            targetType: "SEASON_GAME",
            targetId: created.id,
            actorId: userId,
          });
        }
        ids.push(created.id);
      }

      if (phaseId) {
        await tx.seasonPhase.update({
          where: { id: phaseId },
          data: { format: "ROUND_ROBIN", formatRounds: validated.rounds },
        });
      } else {
        await tx.season.update({
          where: { id: validated.seasonId },
          data: { format: "ROUND_ROBIN", formatRounds: validated.rounds },
        });
      }

      return ids;
    });

    revalidatePath(`/seasons/${validated.seasonId}`);
    return {
      success: true,
      data: {
        createdIds,
        unslottedCount: preview.unslottedCount,
        unslottedPairings: preview.unslottedPairings,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid generation settings", details: error.issues };
    }
    console.error("Error generating round robin:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate schedule",
    };
  }
}
