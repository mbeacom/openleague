"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { parseOptionalId } from "@/lib/utils/ids";
import {
  getUserLeagueRole,
  isTeamAdmin,
  requireLeagueRole,
  requireTeamAdmin,
  requireTeamMember,
  requireUserId,
} from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { requireSeasonManager, requireSeasonViewer } from "@/lib/auth/season-access";
import {
  createSeasonSchema,
  updateSeasonSchema,
  seasonCommandSchema,
  createSeasonPhaseSchema,
  updateSeasonPhaseSchema,
  phaseCommandSchema,
  type CreateSeasonInput,
  type UpdateSeasonInput,
  type CreateSeasonPhaseInput,
  type UpdateSeasonPhaseInput,
} from "@/lib/utils/validation";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

export async function createSeason(
  input: CreateSeasonInput
): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    const validated = createSeasonSchema.parse(input);
    const leagueId = validated.leagueId || null;
    const teamId = validated.teamId || null;

    const userId = leagueId
      ? await requireLeagueRole(leagueId, "LEAGUE_ADMIN")
      : await requireTeamAdmin(teamId as string);

    const season = await prisma.season.create({
      data: {
        name: validated.name,
        description: validated.description || null,
        startDate: validated.startDate,
        endDate: validated.endDate,
        scheduleVisibility: validated.scheduleVisibility,
        leagueId,
        teamId,
        createdById: userId,
      },
      select: { id: true, name: true },
    });

    revalidatePath("/seasons");
    return { success: true, data: season };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid season details", details: error.issues };
    }
    console.error("Error creating season:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create season",
    };
  }
}

export async function updateSeason(
  input: UpdateSeasonInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = updateSeasonSchema.parse(input);
    await requireSeasonManager(validated.seasonId);

    await prisma.season.update({
      where: { id: validated.seasonId },
      data: {
        ...(validated.name !== undefined && { name: validated.name }),
        ...(validated.description !== undefined && { description: validated.description || null }),
        ...(validated.startDate !== undefined && { startDate: validated.startDate }),
        ...(validated.endDate !== undefined && { endDate: validated.endDate }),
        ...(validated.format !== undefined && { format: validated.format }),
        ...(validated.formatRounds !== undefined && { formatRounds: validated.formatRounds }),
        ...(validated.scheduleVisibility !== undefined && {
          scheduleVisibility: validated.scheduleVisibility,
        }),
      },
    });

    revalidatePath("/seasons");
    revalidatePath(`/seasons/${validated.seasonId}`);
    return { success: true, data: { id: validated.seasonId } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid season details", details: error.issues };
    }
    console.error("Error updating season:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update season",
    };
  }
}

/** Archiving hides a season from default views; games are untouched (FR-001). */
export async function archiveSeason(input: {
  seasonId: string;
}): Promise<ActionResult<{ id: string }>> {
  return setSeasonArchived(input, new Date());
}

export async function unarchiveSeason(input: {
  seasonId: string;
}): Promise<ActionResult<{ id: string }>> {
  return setSeasonArchived(input, null);
}

async function setSeasonArchived(
  input: { seasonId: string },
  archivedAt: Date | null
): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = seasonCommandSchema.parse(input);
    await requireSeasonManager(validated.seasonId);
    await prisma.season.update({
      where: { id: validated.seasonId },
      data: { archivedAt },
    });
    revalidatePath("/seasons");
    revalidatePath(`/seasons/${validated.seasonId}`);
    return { success: true, data: { id: validated.seasonId } };
  } catch (error) {
    console.error("Error archiving season:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update season",
    };
  }
}

export async function createSeasonPhase(
  input: CreateSeasonPhaseInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = createSeasonPhaseSchema.parse(input);
    const { season } = await requireSeasonManager(validated.seasonId);

    if (validated.startDate < season.startDate || validated.endDate > season.endDate) {
      return { success: false, error: "Phase dates must fall within the season dates" };
    }

    const phase = await prisma.seasonPhase.create({
      data: {
        seasonId: validated.seasonId,
        name: validated.name,
        type: validated.type,
        sortOrder: validated.sortOrder,
        startDate: validated.startDate,
        endDate: validated.endDate,
        format: validated.format ?? null,
        formatRounds: validated.formatRounds ?? null,
      },
      select: { id: true },
    });

    revalidatePath(`/seasons/${validated.seasonId}`);
    return { success: true, data: phase };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid phase details", details: error.issues };
    }
    console.error("Error creating phase:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create phase",
    };
  }
}

export async function updateSeasonPhase(
  input: UpdateSeasonPhaseInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = updateSeasonPhaseSchema.parse(input);
    const phase = await prisma.seasonPhase.findUnique({
      where: { id: validated.phaseId },
      select: { id: true, seasonId: true },
    });
    if (!phase) {
      return { success: false, error: "Phase not found" };
    }
    const { season } = await requireSeasonManager(phase.seasonId);

    if (
      (validated.startDate && validated.startDate < season.startDate) ||
      (validated.endDate && validated.endDate > season.endDate)
    ) {
      return { success: false, error: "Phase dates must fall within the season dates" };
    }

    await prisma.seasonPhase.update({
      where: { id: validated.phaseId },
      data: {
        ...(validated.name !== undefined && { name: validated.name }),
        ...(validated.type !== undefined && { type: validated.type }),
        ...(validated.sortOrder !== undefined && { sortOrder: validated.sortOrder }),
        ...(validated.startDate !== undefined && { startDate: validated.startDate }),
        ...(validated.endDate !== undefined && { endDate: validated.endDate }),
        ...(validated.format !== undefined && { format: validated.format }),
        ...(validated.formatRounds !== undefined && { formatRounds: validated.formatRounds }),
      },
    });

    revalidatePath(`/seasons/${phase.seasonId}`);
    return { success: true, data: { id: validated.phaseId } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid phase details", details: error.issues };
    }
    console.error("Error updating phase:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update phase",
    };
  }
}

/** Phases are deletable only while empty — games must be moved or removed first. */
export async function deleteSeasonPhase(input: {
  phaseId: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = phaseCommandSchema.parse(input);
    const phase = await prisma.seasonPhase.findUnique({
      where: { id: validated.phaseId },
      select: { id: true, seasonId: true, _count: { select: { games: true } } },
    });
    if (!phase) {
      return { success: false, error: "Phase not found" };
    }
    await requireSeasonManager(phase.seasonId);
    if (phase._count.games > 0) {
      return { success: false, error: "Move or remove this phase's games before deleting it" };
    }
    await prisma.seasonPhase.delete({ where: { id: validated.phaseId } });
    revalidatePath(`/seasons/${phase.seasonId}`);
    return { success: true, data: { id: validated.phaseId } };
  } catch (error) {
    console.error("Error deleting phase:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete phase",
    };
  }
}

/**
 * Seasons visible to the current user for a league or standalone team
 * context. Archived seasons are excluded unless requested.
 */
export async function getSeasons(params: {
  leagueId?: string;
  teamId?: string;
  includeArchived?: boolean;
}) {
  // A missing or non-object argument means "no explicit context".
  const context: { leagueId?: unknown; teamId?: unknown; includeArchived?: unknown } =
    params !== null && typeof params === "object" && !Array.isArray(params) ? params : {};
  const includeArchived = Boolean(context.includeArchived);
  const parsedLeagueId = parseOptionalId(context.leagueId);
  const parsedTeamId = parseOptionalId(context.teamId);
  if (parsedLeagueId === null) {
    throw new Error("Unauthorized: You are not a member of this league");
  }
  if (parsedTeamId === null) {
    throw new Error("Unauthorized: You are not a member of this team");
  }

  const userId = await requireUserId();
  const leagueId = parsedLeagueId ?? null;
  const teamId = parsedTeamId ?? null;

  if (leagueId) {
    await requireLeagueRole(leagueId, "MEMBER");
  } else if (teamId) {
    await requireTeamMember(teamId);
  } else {
    // No explicit context: list seasons for every team/league the user belongs to.
    const memberships = await prisma.teamMember.findMany({
      where: { userId },
      select: { teamId: true, team: { select: { leagueId: true } } },
    });
    const teamIds = memberships.map((m) => m.teamId);
    const leagueIds = [
      ...new Set(memberships.map((m) => m.team.leagueId).filter((id): id is string => Boolean(id))),
    ];
    return prisma.season.findMany({
      where: {
        ...(includeArchived ? {} : { archivedAt: null }),
        OR: [{ teamId: { in: teamIds } }, { leagueId: { in: leagueIds } }],
      },
      include: {
        league: { select: { name: true, sport: true } },
        team: { select: { name: true, sport: true } },
        _count: { select: { games: true } },
      },
      orderBy: { startDate: "desc" },
    });
  }

  return prisma.season.findMany({
    where: {
      ...(leagueId ? { leagueId } : { teamId }),
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    include: {
      league: { select: { name: true, sport: true } },
      team: { select: { name: true, sport: true } },
      _count: { select: { games: true } },
    },
    orderBy: { startDate: "desc" },
  });
}

/** Full season detail: phases, games (with teams/venues), owner sport. */
export async function getSeasonDetail(seasonId: string) {
  const { season, userId } = await requireSeasonViewer(seasonId);
  const canViewPrivatePlacementNotes = season.leagueId
    ? (await getUserLeagueRole(userId, season.leagueId)) === "LEAGUE_ADMIN"
    : Boolean(season.teamId && await isTeamAdmin(userId, season.teamId));

  return prisma.season.findUnique({
    where: { id: seasonId },
    include: {
      league: { select: { id: true, name: true, sport: true } },
      team: { select: { id: true, name: true, sport: true } },
      phases: { orderBy: [{ sortOrder: "asc" }, { startDate: "asc" }] },
      teamPlacements: {
        orderBy: [{ rank: "asc" }, { teamNameSnapshot: "asc" }],
        select: {
          teamId: true,
          divisionId: true,
          divisionNameSnapshot: true,
          teamNameSnapshot: true,
          rank: true,
          ...(canViewPrivatePlacementNotes ? { privateNote: true } : {}),
          division: { select: { ageClassification: true } },
        },
      },
      games: {
        include: {
          homeTeam: { select: { id: true, name: true } },
          awayTeam: { select: { id: true, name: true } },
          venue: { select: { id: true, name: true } },
          surface: { select: { id: true, name: true } },
          segment: { select: { id: true, name: true } },
        },
        orderBy: { startAt: "asc" },
      },
    },
  });
}
