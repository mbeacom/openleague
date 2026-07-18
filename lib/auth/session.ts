import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import type { VenueStaffRole } from "@prisma/client";

export const VENUE_PROFILE_ROLES = ["OWNER", "MANAGER"] as const satisfies VenueStaffRole[];
export const VENUE_STAFF_ADMIN_ROLES = ["OWNER", "MANAGER"] as const satisfies VenueStaffRole[];
export const VENUE_SCHEDULE_ROLES = ["OWNER", "MANAGER", "SCHEDULER"] as const satisfies VenueStaffRole[];
export const VENUE_REQUEST_ROLES = ["OWNER", "MANAGER", "REQUEST_MANAGER"] as const satisfies VenueStaffRole[];
export const VENUE_CONTENT_ROLES = ["OWNER", "MANAGER", "CONTENT_EDITOR"] as const satisfies VenueStaffRole[];
export const VENUE_VIEW_ROLES = [
  "OWNER",
  "MANAGER",
  "SCHEDULER",
  "CONTENT_EDITOR",
  "REQUEST_MANAGER",
  "VIEWER",
] as const satisfies VenueStaffRole[];

const venueRoleRank: Record<VenueStaffRole, number> = {
  VIEWER: 1,
  CONTENT_EDITOR: 2,
  REQUEST_MANAGER: 2,
  SCHEDULER: 2,
  MANAGER: 3,
  OWNER: 4,
};

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

type AuthSession = Awaited<ReturnType<typeof getSession>>;

async function resolveUserIdFromSession(session: AuthSession): Promise<string | null> {
  const userId = session?.user?.id;
  if (typeof userId === "string" && userId.trim()) {
    return userId;
  }

  const email = session?.user?.email?.trim();
  if (!email) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  return user?.id ?? null;
}

export async function requireUserIdFromSession(session: AuthSession): Promise<string> {
  const userId = await resolveUserIdFromSession(session);

  if (!userId) {
    console.warn("Authenticated session is missing a resolvable user id; redirecting to login.");
    redirect("/login");
  }

  return userId;
}

/**
 * Get the current user ID
 * Returns null if user is not authenticated
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getSession();
  return resolveUserIdFromSession(session);
}

/**
 * Require user ID for a route
 * Redirects to login page if user is not authenticated
 * Returns the user ID if user is authenticated
 */
export async function requireUserId(): Promise<string> {
  const session = await requireAuth();
  return requireUserIdFromSession(session);
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
 * The set of team IDs a user may VIEW, unioned from two links:
 *  - TeamMember rows (the user belongs to the team directly), and
 *  - PlayerGuardian rows (the user guards a Player rostered on the team).
 *
 * A guardian of a Player on team T may view team T's events and calendar at
 * MEMBER-level detail even without a TeamMember row. This is strictly additive
 * to direct membership and never widens beyond the guarded child's own team(s).
 *
 * Both links are scoped to active teams, mirroring getViewerMemberships and
 * getNeedsRsvp: view access is only granted while the team is active.
 */
export async function getViewableTeamIds(userId: string): Promise<string[]> {
  const [memberships, guardianships] = await Promise.all([
    prisma.teamMember.findMany({
      where: { userId, team: { isActive: true } },
      select: { teamId: true },
    }),
    prisma.playerGuardian.findMany({
      where: { userId, player: { team: { isActive: true } } },
      select: { player: { select: { teamId: true } } },
    }),
  ]);

  const teamIds = new Set<string>();
  for (const membership of memberships) teamIds.add(membership.teamId);
  for (const guardianship of guardianships) teamIds.add(guardianship.player.teamId);
  return [...teamIds];
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
 * Get user's league role if they belong to the league
 */
export async function getUserLeagueRole(
  userId: string,
  leagueId: string
): Promise<"LEAGUE_ADMIN" | "TEAM_ADMIN" | "MEMBER" | null> {
  try {
    const leagueUser = await prisma.leagueUser.findFirst({
      where: {
        userId,
        leagueId,
        league: { isActive: true },
      },
      select: { role: true },
    });

    return leagueUser?.role || null;
  } catch (error) {
    console.error("Error getting user league role:", error);
    return null;
  }
}

/**
 * Require user to have a specific league role
 */
export async function requireLeagueRole(
  leagueId: string,
  requiredRole: "LEAGUE_ADMIN" | "TEAM_ADMIN" | "MEMBER"
): Promise<string> {
  const userId = await requireUserId();

  const userRole = await getUserLeagueRole(userId, leagueId);

  if (!userRole) {
    throw new Error("Unauthorized: You are not a member of this league");
  }

  // Define role hierarchy
  const roleHierarchy = {
    "MEMBER": 1,
    "TEAM_ADMIN": 2,
    "LEAGUE_ADMIN": 3,
  };

  if (roleHierarchy[userRole] < roleHierarchy[requiredRole]) {
    throw new Error(`Unauthorized: ${requiredRole} role required`);
  }

  return userId;
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
 * Check if a user is a LEAGUE_ADMIN of ANY league.
 * This is not a system-wide admin role — it grants the broadest privilege the
 * app currently has (formerly misnamed `isSystemAdmin`).
 *
 * Uses findFirst for better performance than count
 */
export async function isAnyLeagueAdmin(userId: string): Promise<boolean> {
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
 * Check whether a user is a PLATFORM administrator — the true system-wide role
 * used to gate cross-tenant operations (approving/rejecting signups, listing
 * every user). This is deliberately NOT "LEAGUE_ADMIN of any league": that was
 * self-grantable by creating a throwaway league (privilege escalation).
 *
 * A user is a platform admin if either:
 *  - their User.isPlatformAdmin column is true, or
 *  - their email is in the PLATFORM_ADMIN_EMAILS allowlist (comma-separated).
 *
 * The env allowlist is a non-self-grantable bootstrap so a self-hosted operator
 * can designate the first platform admin(s) without a manual DB write.
 */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPlatformAdmin: true, email: true },
  });
  if (!user) return false;
  if (user.isPlatformAdmin) return true;

  const allowlist = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(user.email.toLowerCase());
}

/**
 * Require PLATFORM admin privileges (see isPlatformAdmin).
 * Returns the session if the check passes.
 * Throws an error if not authenticated or not a platform admin.
 */
export async function requireSystemAdmin() {
  const session = await requireAuth();
  const userId = await requireUserIdFromSession(session);

  const isAdmin = await isPlatformAdmin(userId);
  if (!isAdmin) {
    throw new Error("Unauthorized: Admin access required");
  }

  return session;
}

/**
 * Return the highest active venue staff role a user has for an organization or specific venue.
 * Organization-wide staff rows have a null venueId and apply to every venue in the organization.
 */
export async function getUserVenueStaffRole(
  userId: string,
  organizationId: string,
  venueId?: string
): Promise<VenueStaffRole | null> {
  const memberships = await prisma.venueStaff.findMany({
    where: {
      userId,
      organizationId,
      status: "ACTIVE",
      organization: {
        status: { in: ["DRAFT", "ACTIVE"] },
      },
      OR: venueId ? [{ venueId: null }, { venueId }] : undefined,
    },
    select: {
      role: true,
    },
  });

  const highestRole = memberships
    .map((membership) => membership.role)
    .sort((left, right) => venueRoleRank[right] - venueRoleRank[left])[0];

  return highestRole ?? null;
}

export async function hasVenueStaffRole(
  userId: string,
  organizationId: string,
  allowedRoles: readonly VenueStaffRole[],
  venueId?: string
): Promise<boolean> {
  const role = await getUserVenueStaffRole(userId, organizationId, venueId);
  return role ? allowedRoles.includes(role) : false;
}

export async function isVenueStaffMember(
  userId: string,
  organizationId: string,
  venueId?: string
): Promise<boolean> {
  return hasVenueStaffRole(userId, organizationId, VENUE_VIEW_ROLES, venueId);
}

export async function requireVenueStaffRole(
  organizationId: string,
  allowedRoles: readonly VenueStaffRole[],
  venueId?: string
): Promise<string> {
  const userId = await requireUserId();
  const allowed = await hasVenueStaffRole(userId, organizationId, allowedRoles, venueId);

  if (!allowed) {
    throw new Error("Unauthorized: You do not have permission to manage this venue");
  }

  return userId;
}

export async function requireVenueProfileManager(
  organizationId: string,
  venueId?: string
): Promise<string> {
  return requireVenueStaffRole(organizationId, VENUE_PROFILE_ROLES, venueId);
}

export async function requireVenueScheduleManager(
  organizationId: string,
  venueId?: string
): Promise<string> {
  return requireVenueStaffRole(organizationId, VENUE_SCHEDULE_ROLES, venueId);
}

export async function requireVenueRequestManager(
  organizationId: string,
  venueId?: string
): Promise<string> {
  return requireVenueStaffRole(organizationId, VENUE_REQUEST_ROLES, venueId);
}

export async function requireVenueContentManager(
  organizationId: string,
  venueId?: string
): Promise<string> {
  return requireVenueStaffRole(organizationId, VENUE_CONTENT_ROLES, venueId);
}

/**
 * The hosting entity of a signup event — exactly one id is set.
 */
export type SignupEventHost = {
  organizationId?: string | null;
  leagueId?: string | null;
  teamId?: string | null;
};

/**
 * Check whether a user is an admin of a signup event's hosting entity:
 * venue organization staff with scheduling rights, league admin, or team admin.
 */
export async function isSignupEventHostAdmin(userId: string, host: SignupEventHost): Promise<boolean> {
  if (host.organizationId) {
    return hasVenueStaffRole(userId, host.organizationId, VENUE_SCHEDULE_ROLES);
  }
  if (host.leagueId) {
    const role = await getUserLeagueRole(userId, host.leagueId);
    return role === "LEAGUE_ADMIN";
  }
  if (host.teamId) {
    return isTeamAdmin(userId, host.teamId);
  }
  return false;
}

/**
 * Require the user to be an admin of the hosting entity (used for event
 * creation and manager grants — stricter than per-event management).
 */
export async function requireSignupEventHostAdmin(host: SignupEventHost): Promise<string> {
  const userId = await requireUserId();
  const allowed = await isSignupEventHostAdmin(userId, host);

  if (!allowed) {
    throw new Error("Unauthorized: You do not have permission to manage events for this host");
  }

  return userId;
}

/**
 * Check whether a user can manage a signup event: host-entity admin (implicit)
 * or holder of a per-event EventManager grant.
 */
export async function isEventManager(userId: string, eventId: string): Promise<boolean> {
  const event = await prisma.signupEvent.findUnique({
    where: { id: eventId },
    select: { hostOrganizationId: true, hostLeagueId: true, hostTeamId: true },
  });

  if (!event) {
    return false;
  }

  const hostAdmin = await isSignupEventHostAdmin(userId, {
    organizationId: event.hostOrganizationId,
    leagueId: event.hostLeagueId,
    teamId: event.hostTeamId,
  });
  if (hostAdmin) {
    return true;
  }

  const grant = await prisma.eventManager.findUnique({
    where: { eventId_userId: { eventId, userId } },
    select: { id: true },
  });

  return !!grant;
}

/**
 * Require event management rights for a signup event.
 * Returns the authenticated user's id.
 */
export async function requireEventManager(eventId: string): Promise<string> {
  const userId = await requireUserId();
  const allowed = await isEventManager(userId, eventId);

  if (!allowed) {
    throw new Error("Unauthorized: You do not have permission to manage this event");
  }

  return userId;
}
