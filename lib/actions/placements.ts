"use server";

import { z } from "zod";
import type { AgeClassification } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireLeagueRole } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { isStatsEligible } from "@/lib/utils/age-level";
import { STATS_MIN_AGE_LEVEL } from "@/lib/env";
import { rethrowIfNextRedirectError } from "@/lib/utils/next-errors";
import {
  createDivisionSchema,
  recordPlacementSchema,
  type RecordPlacementInput,
} from "@/lib/utils/validation";
import type { ActionResult } from "@/lib/actions/seasons";
import type { PlacementBoardRow } from "@/types/seasons";

const placementBoardQuerySchema = z.object({
  seasonId: z.string().cuid("Invalid season ID format"),
  phaseId: z.string().cuid("Invalid phase ID format").optional(),
});

/**
 * Resolve the season and require LEAGUE_ADMIN of its owning league.
 * Placement is a league-only workflow (FR-025).
 */
async function requirePlacementAdmin(seasonId: string): Promise<
  | { ok: true; season: { id: string; leagueId: string }; userId: string }
  | { ok: false; error: string }
> {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { id: true, leagueId: true },
  });
  if (!season) {
    return { ok: false, error: "Season not found" };
  }
  if (!season.leagueId) {
    return { ok: false, error: "Placement is available for league seasons" };
  }
  const userId = await requireLeagueRole(season.leagueId, "LEAGUE_ADMIN");
  return { ok: true, season: { id: season.id, leagueId: season.leagueId }, userId };
}

interface TeamGameStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  opponents: Set<string>;
}

/**
 * Placement board for a league season (FR-025/026): one row per active league
 * team (teams with zero games surface with gamesPlayed 0). Records (W/L/T) are
 * age-gated per the team's division classification — sub-threshold levels never
 * expose records and instead rely on manual rank + privateNote from the latest
 * PlacementDecision. privateNote is only ever returned by this league-admin-only
 * action.
 */
export async function getPlacementBoard(params: {
  seasonId: string;
  phaseId?: string;
}): Promise<ActionResult<PlacementBoardRow[]>> {
  try {
    const validated = placementBoardQuerySchema.parse(params);

    const access = await requirePlacementAdmin(validated.seasonId);
    if (!access.ok) {
      return { success: false, error: access.error };
    }
    const { season } = access;

    const [teams, games, decisions] = await Promise.all([
      prisma.team.findMany({
        where: { leagueId: season.leagueId, isActive: true },
        select: {
          id: true,
          name: true,
          division: { select: { id: true, name: true, ageClassification: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.seasonGame.findMany({
        where: {
          seasonId: season.id,
          status: "COMPLETED",
          ...(validated.phaseId ? { phaseId: validated.phaseId } : {}),
        },
        select: {
          homeTeamId: true,
          awayTeamId: true,
          homeScore: true,
          awayScore: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      }),
      prisma.placementDecision.findMany({
        where: { seasonId: season.id },
        orderBy: { createdAt: "desc" },
        select: { teamId: true, rank: true, privateNote: true },
      }),
    ]);

    // Aggregate completed games per team: games played, distinct opponent
    // names, and W/L/T where both scores were recorded.
    const statsByTeam = new Map<string, TeamGameStats>();
    const statsFor = (teamId: string): TeamGameStats => {
      let stats = statsByTeam.get(teamId);
      if (!stats) {
        stats = { gamesPlayed: 0, wins: 0, losses: 0, ties: 0, opponents: new Set() };
        statsByTeam.set(teamId, stats);
      }
      return stats;
    };
    for (const game of games) {
      const home = statsFor(game.homeTeamId);
      const away = statsFor(game.awayTeamId);
      home.gamesPlayed += 1;
      away.gamesPlayed += 1;
      home.opponents.add(game.awayTeam.name);
      away.opponents.add(game.homeTeam.name);
      if (game.homeScore !== null && game.awayScore !== null) {
        if (game.homeScore > game.awayScore) {
          home.wins += 1;
          away.losses += 1;
        } else if (game.homeScore < game.awayScore) {
          home.losses += 1;
          away.wins += 1;
        } else {
          home.ties += 1;
          away.ties += 1;
        }
      }
    }

    // Latest decision per team (decisions are ordered createdAt desc).
    const latestDecisionByTeam = new Map<string, { rank: number | null; privateNote: string | null }>();
    for (const decision of decisions) {
      if (!latestDecisionByTeam.has(decision.teamId)) {
        latestDecisionByTeam.set(decision.teamId, {
          rank: decision.rank,
          privateNote: decision.privateNote,
        });
      }
    }

    const rows: PlacementBoardRow[] = teams.map((team) => {
      const stats = statsByTeam.get(team.id);
      const level = team.division?.ageClassification ?? null;
      // FR-026: never expose records below the score-recording threshold.
      const scoresGated =
        level !== null && !isStatsEligible(level, STATS_MIN_AGE_LEVEL as AgeClassification);
      const decision = latestDecisionByTeam.get(team.id);
      return {
        teamId: team.id,
        teamName: team.name,
        divisionId: team.division?.id ?? null,
        divisionName: team.division?.name ?? null,
        gamesPlayed: stats?.gamesPlayed ?? 0,
        wins: scoresGated ? null : stats?.wins ?? 0,
        losses: scoresGated ? null : stats?.losses ?? 0,
        ties: scoresGated ? null : stats?.ties ?? 0,
        opponents: stats ? Array.from(stats.opponents) : [],
        rank: decision?.rank ?? null,
        privateNote: decision?.privateNote ?? null,
        scoresGated,
      };
    });

    return { success: true, data: rows };
  } catch (error) {
    rethrowIfNextRedirectError(error);
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid placement query", details: error.issues };
    }
    console.error("Error loading placement board:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load placement board",
    };
  }
}

/**
 * Record a placement decision (FR-027/028): appends an immutable
 * PlacementDecision (divisionId null = unassigned) and updates the team's
 * current division in the same transaction. History — played games and prior
 * decisions — is preserved.
 */
export async function recordPlacement(
  input: RecordPlacementInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = recordPlacementSchema.parse(input);

    const access = await requirePlacementAdmin(validated.seasonId);
    if (!access.ok) {
      return { success: false, error: access.error };
    }
    const { season, userId } = access;

    const team = await prisma.team.findFirst({
      where: { id: validated.teamId, leagueId: season.leagueId, isActive: true },
      select: { id: true },
    });
    if (!team) {
      return { success: false, error: "Team not found in this league" };
    }

    const divisionId = validated.divisionId ?? null;
    if (divisionId) {
      const division = await prisma.division.findFirst({
        where: { id: divisionId, leagueId: season.leagueId, isActive: true },
        select: { id: true },
      });
      if (!division) {
        return { success: false, error: "Division not found in this league" };
      }
    }

    const decision = await prisma.$transaction(async (tx) => {
      const created = await tx.placementDecision.create({
        data: {
          seasonId: season.id,
          teamId: team.id,
          divisionId,
          rank: validated.rank ?? null,
          privateNote: validated.privateNote ?? null,
          decidedById: userId,
        },
        select: { id: true },
      });
      await tx.team.update({
        where: { id: team.id },
        data: { divisionId },
      });
      return created;
    });

    revalidatePath(`/seasons/${season.id}/placement`);
    revalidatePath(`/seasons/${season.id}`);

    return { success: true, data: { id: decision.id } };
  } catch (error) {
    rethrowIfNextRedirectError(error);
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid placement details", details: error.issues };
    }
    console.error("Error recording placement:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to record placement",
    };
  }
}

/**
 * Create a division without leaving the placement view (FR-027). Thin
 * convenience over the standard division create with the same validation
 * and duplicate-name guard.
 */
export async function createDivisionInline(input: {
  leagueId: string;
  name: string;
  ageClassification?: string;
}): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    const validated = createDivisionSchema.parse(input);
    await requireLeagueRole(validated.leagueId, "LEAGUE_ADMIN");

    const league = await prisma.league.findFirst({
      where: { id: validated.leagueId, isActive: true },
      select: { id: true },
    });
    if (!league) {
      return { success: false, error: "League not found or inactive" };
    }

    const duplicate = await prisma.division.findFirst({
      where: { leagueId: validated.leagueId, name: validated.name, isActive: true },
      select: { id: true },
    });
    if (duplicate) {
      return {
        success: false,
        error: "A division with this name already exists in the league",
      };
    }

    const division = await prisma.division.create({
      data: {
        leagueId: validated.leagueId,
        name: validated.name,
        ageGroup: validated.ageGroup ?? null,
        skillLevel: validated.skillLevel ?? null,
        ageClassification: validated.ageClassification ?? null,
      },
      select: { id: true, name: true },
    });

    revalidatePath(`/league/${validated.leagueId}`);
    revalidatePath(`/league/${validated.leagueId}/teams`);

    return { success: true, data: division };
  } catch (error) {
    rethrowIfNextRedirectError(error);
    if (error instanceof z.ZodError) {
      const fieldErrors = error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join(", ");
      return {
        success: false,
        error: `Validation failed: ${fieldErrors}`,
        details: error.issues,
      };
    }
    console.error("Error creating division:", error);
    return {
      success: false,
      error: "Failed to create division. Please try again.",
    };
  }
}
