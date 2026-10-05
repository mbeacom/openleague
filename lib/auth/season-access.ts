import { prisma } from "@/lib/db/prisma";
import { requireLeagueRole, requireTeamAdmin, requireTeamMember } from "@/lib/auth/session";
import { parseId } from "@/lib/utils/ids";

/**
 * Season authorization helpers shared by the season server actions. Not
 * server actions themselves, so they live outside the "use server" modules.
 */

/**
 * Authorize management of a season by its owner: league seasons require
 * LEAGUE_ADMIN, standalone team seasons require team ADMIN (FR-038).
 */
export async function requireSeasonManager(seasonId: string) {
  const id = parseId(seasonId);
  if (!id) {
    throw new Error("Season not found");
  }
  const season = await prisma.season.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      leagueId: true,
      teamId: true,
      league: { select: { sport: true } },
      team: { select: { sport: true } },
    },
  });
  if (!season) {
    throw new Error("Season not found");
  }
  const userId = season.leagueId
    ? await requireLeagueRole(season.leagueId, "LEAGUE_ADMIN")
    : await requireTeamAdmin(season.teamId as string);
  return { season, userId };
}

/** Read access: any member of the owning league or team. */
export async function requireSeasonViewer(seasonId: string) {
  const id = parseId(seasonId);
  if (!id) {
    throw new Error("Season not found");
  }
  const season = await prisma.season.findUnique({
    where: { id },
    select: { id: true, leagueId: true, teamId: true },
  });
  if (!season) {
    throw new Error("Season not found");
  }
  const userId = season.leagueId
    ? await requireLeagueRole(season.leagueId, "MEMBER")
    : await requireTeamMember(season.teamId as string);
  return { season, userId };
}
