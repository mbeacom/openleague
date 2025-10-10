import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";

/**
 * Get the current user session
 * Returns null if user is not authenticated
 */
export async function getSession() {
  return await auth();
}

/**
 * Require authentication for a route
 * Redirects to login page if user is not authenticated
 * Returns the session if user is authenticated
 */
export async function requireAuth() {
  const session = await getSession();

  if (!session || !session.user) {
    redirect("/login");
  }

  return session;
}

/**
 * Get the current user ID
 * Returns null if user is not authenticated
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user?.id ?? null;
}

/**
 * Require user ID for a route
 * Redirects to login page if user is not authenticated
 * Returns the user ID if user is authenticated
 */
export async function requireUserId(): Promise<string> {
  const session = await requireAuth();
  return session.user.id;
}

/**
 * Check if user is an admin of the specified team
 * Returns true if user has ADMIN role for the team
 */
export async function isTeamAdmin(userId: string, teamId: string): Promise<boolean> {
  const count = await prisma.teamMember.count({
    where: {
      userId,
      teamId,
      role: "ADMIN",
    },
  });

  return count > 0;
}

/**
 * Check if user is a member of the specified team (any role)
 * Returns true if user belongs to the team
 */
export async function isTeamMember(userId: string, teamId: string): Promise<boolean> {
  const count = await prisma.teamMember.count({
    where: {
      userId,
      teamId,
    },
  });

  return count > 0;
}

/**
 * Require user to be an admin of the specified team
 * Throws error if user is not authenticated or not an admin
 */
export async function requireTeamAdmin(teamId: string): Promise<string> {
  const userId = await requireUserId();

  const isAdmin = await isTeamAdmin(userId, teamId);
  if (!isAdmin) {
    throw new Error("Unauthorized: Only team admins can perform this action");
  }

  return userId;
}

/**
 * Require user to be a member of the specified team
 * Throws error if user is not authenticated or not a member
 */
export async function requireTeamMember(teamId: string): Promise<string> {
  const userId = await requireUserId();

  const isMember = await isTeamMember(userId, teamId);
  if (!isMember) {
    throw new Error("Unauthorized: You are not a member of this team");
  }

  return userId;
}

/**
 * Get user's role in a specific team
 * Returns null if user is not a member of the team
 */
export async function getUserTeamRole(userId: string, teamId: string): Promise<"ADMIN" | "MEMBER" | null> {
  const member = await prisma.teamMember.findUnique({
    where: {
      userId_teamId: {
        userId,
        teamId,
      },
    },
    select: {
      role: true,
    },
  });

  return member?.role ?? null;
}

/**
 * Check if user can create inter-team games in a league
 * Returns true if user is a league admin or admin of any team in the league
 */
export async function canUserCreateLeagueGames(
  userId: string,
  leagueId: string,
  leagueRole?: "LEAGUE_ADMIN" | "TEAM_ADMIN" | "MEMBER"
): Promise<boolean> {
  // If league role is provided and is LEAGUE_ADMIN or TEAM_ADMIN, they can create games
  if (leagueRole === "LEAGUE_ADMIN" || leagueRole === "TEAM_ADMIN") {
    return true;
  }

  // Check if user is admin of any team in the league
  const teamAdminCount = await prisma.teamMember.count({
    where: {
      userId,
      role: "ADMIN",
      team: {
        leagueId,
        isActive: true,
      },
    },
  });

  return teamAdminCount > 0;
}

/**
 * Check if a user is approved
 * Returns true if the user account is approved
 */
export async function isUserApproved(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { approved: true },
  });

  return user?.approved ?? false;
}

/**
 * Check if a user has admin privileges (system-wide)
 * For now, this checks if user is a LEAGUE_ADMIN in any league
 * In future, could add a separate system admin role
 *
 * Uses findFirst for better performance than count
 */
export async function isSystemAdmin(userId: string): Promise<boolean> {
  const admin = await prisma.leagueUser.findFirst({
    where: {
      userId,
      role: "LEAGUE_ADMIN",
    },
    select: {
      id: true,
    },
  });

  return !!admin;
}

/**
 * Require system admin privileges
 * Returns the session if user is a system admin
 * Throws an error if not authenticated or not an admin
 */
export async function requireSystemAdmin() {
  const session = await requireAuth();

  const isAdmin = await isSystemAdmin(session.user.id);
  if (!isAdmin) {
    throw new Error("Unauthorized: Admin access required");
  }

  return session;
}
