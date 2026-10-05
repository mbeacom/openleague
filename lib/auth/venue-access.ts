import { prisma } from "@/lib/db/prisma";
import { isUserIdString, parseId } from "@/lib/utils/ids";

/**
 * Venue visibility check for server code. Not a server action: it takes the
 * user id from its caller, so it lives outside the "use server" modules.
 *
 * PUBLIC venues are visible to everyone; TEAM and LEAGUE venues to members of
 * the owning team or league.
 */
export async function canUserAccessVenue(
  userId: string,
  venue: { visibility: string; teamId: string | null; leagueId: string | null }
): Promise<boolean> {
  if (venue.visibility === "PUBLIC") return true;
  if (!isUserIdString(userId)) return false;

  if (venue.visibility === "TEAM" && venue.teamId) {
    const teamId = parseId(venue.teamId);
    if (!teamId) return false;
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId, teamId } },
    });
    return !!membership;
  }

  if (venue.visibility === "LEAGUE" && venue.leagueId) {
    const leagueId = parseId(venue.leagueId);
    if (!leagueId) return false;
    const leagueUser = await prisma.leagueUser.findUnique({
      where: { userId_leagueId: { userId, leagueId } },
    });
    return !!leagueUser;
  }

  return false;
}
