"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { revalidatePath } from "next/cache";
import { buildRoundRobin, type ProposedGame } from "@/lib/utils/round-robin";
import { findBookingConflicts } from "@/lib/utils/availability";
import { FALLBACK_TIME_ZONE } from "@/lib/utils/date";
import {
  generateRoundRobinSchema,
  type GenerateRoundRobinInput,
} from "@/lib/utils/validation";
import { requireSeasonManager, type ActionResult } from "@/lib/actions/seasons";
import type { GameConflictView } from "@/types/seasons";

export type GenerationPreviewGame = ProposedGame & {
  homeTeamName: string;
  awayTeamName: string;
  conflicts: GameConflictView[];
};

export type GenerationPreview = {
  games: GenerationPreviewGame[];
  totalPairings: number;
  unslottedCount: number;
};

/**
 * Shared by preview and generation so the preview always matches what gets
 * created (FR-016): the same deterministic buildRoundRobin output, with
 * venue conflicts flagged per game when a default venue is set.
 */
async function computeGeneration(input: GenerateRoundRobinInput): Promise<{
  preview: GenerationPreview;
  proposed: ProposedGame[];
  timezone: string;
  validated: ReturnType<typeof generateRoundRobinSchema.parse>;
}> {
  const validated = generateRoundRobinSchema.parse(input);
  const { season } = await requireSeasonManager(validated.seasonId);

  // Teams must belong to the season's scope (league teams, or the owning
  // standalone team's administered set is enforced at game level).
  if (season.leagueId) {
    const count = await prisma.team.count({
      where: { id: { in: validated.teamIds }, leagueId: season.leagueId },
    });
    if (count !== validated.teamIds.length) {
      throw new Error("All teams must belong to this season's league");
    }
  }

  const defaultVenueId = validated.defaultVenueId || null;
  const venue = defaultVenueId
    ? await prisma.venue.findUnique({
        where: { id: defaultVenueId },
        select: { timezone: true },
      })
    : null;
  const timezone = venue?.timezone || FALLBACK_TIME_ZONE;

  const result = buildRoundRobin({
    teamIds: validated.teamIds,
    rounds: validated.rounds,
    startDate: validated.startDate,
    endDate: validated.endDate,
    eligibleDays: validated.eligibleDays,
    startTime: validated.startTime,
    gameDurationMinutes: validated.gameDurationMinutes,
    timezone,
    defaultVenueId,
  });

  const teams = await prisma.team.findMany({
    where: { id: { in: validated.teamIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(teams.map((t) => [t.id, t.name]));

  const games: GenerationPreviewGame[] = await Promise.all(
    result.games.map(async (game) => ({
      ...game,
      homeTeamName: nameById.get(game.homeTeamId) ?? "Home",
      awayTeamName: nameById.get(game.awayTeamId) ?? "Away",
      // Conflicts are surfaced in the review step, never silently discarded
      // (US2 scenario 6 — fixes the legacy behavior).
      // Generated games carry no surface/segment: the candidate is
      // venue-wide, so any booking at the venue conflicts.
      conflicts: game.venueId
        ? await findBookingConflicts({
            venueId: game.venueId,
            startAt: game.startAt,
            endAt: game.endAt,
          })
        : [],
    }))
  );

  const totalPairings =
    ((validated.teamIds.length * (validated.teamIds.length - 1)) / 2) * validated.rounds;

  return {
    preview: { games, totalPairings, unslottedCount: result.unslottedCount },
    proposed: result.games,
    timezone,
    validated,
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
): Promise<ActionResult<{ createdIds: string[]; unslottedCount: number }>> {
  try {
    const { preview, proposed, timezone, validated } = await computeGeneration(input);
    const { userId } = await requireSeasonManager(validated.seasonId);
    const phaseId = validated.phaseId || null;

    const createdIds = await prisma.$transaction(async (tx) => {
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
            homeTeamId: game.homeTeamId,
            awayTeamId: game.awayTeamId,
            createdById: userId,
          },
          select: { id: true },
        });
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
      data: { createdIds, unslottedCount: preview.unslottedCount },
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
