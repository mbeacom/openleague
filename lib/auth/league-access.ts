import type { LeagueRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { isUserIdString, parseId } from "@/lib/utils/ids";

/**
 * League membership helpers for server code (Server Components, route
 * handlers and server actions). This module deliberately has no "use server"
 * directive: its exports take a user id or a transaction client from the
 * caller, so they must not be callable from the browser.
 */

const LEAGUE_ROLE_RANK: Record<LeagueRole, number> = {
  MEMBER: 1,
  TEAM_ADMIN: 2,
  LEAGUE_ADMIN: 3,
};

/**
 * League-identity sync (Tier 3 canonical rule): every TeamMember of a
 * league-linked team must have an explicit LeagueUser row. Call this wherever
 * a TeamMember row is created for a league team (invitation acceptance,
 * migrateTeamToLeague, team-joins-league transitions).
 *
 * Idempotent: creates the row when missing, upgrades the role when the
 * requested role outranks the existing one, and never downgrades.
 */
export async function ensureLeagueUser(
  tx: Prisma.TransactionClient,
  userId: string,
  leagueId: string,
  role: LeagueRole = "MEMBER"
): Promise<void> {
  const existing = await tx.leagueUser.findUnique({
    where: { userId_leagueId: { userId, leagueId } },
    select: { id: true, role: true },
  });

  if (!existing) {
    await tx.leagueUser.create({
      data: { userId, leagueId, role },
    });
    return;
  }

  if (LEAGUE_ROLE_RANK[role] > LEAGUE_ROLE_RANK[existing.role]) {
    await tx.leagueUser.update({
      where: { id: existing.id },
      data: { role },
    });
  }
}

/**
 * Whether the user (the session user when `userId` is omitted) is a
 * LEAGUE_ADMIN of the league.
 */
export async function verifyLeagueAdmin(leagueId: string, userId?: string): Promise<boolean> {
  if (!parseId(leagueId) || (userId !== undefined && !isUserIdString(userId))) {
    return false;
  }

  try {
    const currentUserId = userId || await requireUserId();

    const leagueUser = await prisma.leagueUser.findFirst({
      where: {
        leagueId,
        userId: currentUserId,
        role: "LEAGUE_ADMIN",
      },
    });

    return !!leagueUser;
  } catch {
    return false;
  }
}

/**
 * Whether the user (the session user when `userId` is omitted) can administer
 * the team within the league: a league admin, or an admin of that team.
 */
export async function verifyTeamAdminInLeague(
  teamId: string,
  leagueId: string,
  userId?: string
): Promise<boolean> {
  if (!parseId(teamId) || !parseId(leagueId) || (userId !== undefined && !isUserIdString(userId))) {
    return false;
  }

  try {
    const currentUserId = userId || await requireUserId();

    // Check if user is league admin (has access to all teams)
    const isLeagueAdmin = await verifyLeagueAdmin(leagueId, currentUserId);
    if (isLeagueAdmin) return true;

    // Check if user is admin of the specific team
    const teamMember = await prisma.teamMember.findFirst({
      where: {
        teamId,
        userId: currentUserId,
        role: "ADMIN",
        team: {
          leagueId,
        },
      },
      select: { id: true },
    });

    return !!teamMember;
  } catch {
    return false;
  }
}

/**
 * Whether the user belongs to the (active) league.
 */
export async function hasLeagueAccess(userId: string, leagueId: string): Promise<boolean> {
  if (!isUserIdString(userId) || !parseId(leagueId)) {
    return false;
  }

  try {
    const leagueUser = await prisma.leagueUser.findFirst({
      where: {
        leagueId,
        userId,
        league: {
          isActive: true,
        },
      },
    });

    return !!leagueUser;
  } catch {
    return false;
  }
}
