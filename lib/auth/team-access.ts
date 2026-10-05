import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { parseId } from "@/lib/utils/ids";

/**
 * Team-in-league checks used by Server Components (route aliases). These are
 * not server actions, so they live outside the "use server" modules.
 */

/**
 * Verify that an active team belongs to an active league.
 */
export async function isActiveTeamInLeague(teamId: string, leagueId: string): Promise<boolean> {
  const parsedTeamId = parseId(teamId);
  const parsedLeagueId = parseId(leagueId);
  if (!parsedTeamId || !parsedLeagueId) return false;

  const team = await prisma.team.findFirst({
    where: {
      id: parsedTeamId,
      leagueId: parsedLeagueId,
      isActive: true,
      league: { isActive: true },
    },
    select: { id: true },
  });

  return !!team;
}

/**
 * Verify that the current user can safely follow a league-scoped team alias.
 * Prevents redirect-vs-404 probing of team/league relationships by requiring
 * either direct team membership or active league membership before redirecting.
 */
export async function canAccessActiveTeamInLeague(teamId: string, leagueId: string): Promise<boolean> {
  const parsedTeamId = parseId(teamId);
  const parsedLeagueId = parseId(leagueId);
  if (!parsedTeamId || !parsedLeagueId) return false;

  const userId = await requireUserId();

  const team = await prisma.team.findFirst({
    where: {
      id: parsedTeamId,
      leagueId: parsedLeagueId,
      isActive: true,
      league: { isActive: true },
    },
    select: {
      members: {
        where: { userId },
        select: { id: true },
        take: 1,
      },
      league: {
        select: {
          users: {
            where: { userId },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });

  return !!team && (team.members.length > 0 || (team.league?.users.length ?? 0) > 0);
}
