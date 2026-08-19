/**
 * Permission management utilities for league and team operations
 */

import { prisma } from "@/lib/db/prisma";
import { LeagueAccessLevel, logAuditEvent, AuditAction } from "./security";
import { sanitizeErrorForLogging } from "./error-handling";
import type { GearAction } from "@/lib/auth/capabilities";
import { Permission, TEAM_SCOPED_PERMISSIONS, type TeamScopedPermission } from "./permission-types";

/**
 * Permission definitions for different operations
 */
// Declared in a dependency-free module so client components and tests can use
// these values without pulling this file's dependency graph with them.
export { Permission, TEAM_SCOPED_PERMISSIONS };
export type { TeamScopedPermission };

/**
 * Permission matrix mapping access levels to permissions
 * Using lazy initialization to avoid forward reference issues
 */
const getPermissionMatrix = (): Record<LeagueAccessLevel, Permission[]> => ({
    [LeagueAccessLevel.NONE]: [],

    [LeagueAccessLevel.MEMBER]: [
        Permission.VIEW_LEAGUE,
        Permission.VIEW_TEAM,
        Permission.VIEW_PLAYER_DETAILS,
    ],

    [LeagueAccessLevel.TEAM_ADMIN]: [
        // Member permissions
        Permission.VIEW_LEAGUE,
        Permission.VIEW_TEAM,
        Permission.VIEW_PLAYER_DETAILS,

        // Team management
        Permission.UPDATE_TEAM,
        Permission.ADD_PLAYER,
        Permission.UPDATE_PLAYER,
        Permission.REMOVE_PLAYER,
        Permission.VIEW_EMERGENCY_CONTACTS,

        // Event management
        Permission.CREATE_EVENT,
        Permission.UPDATE_EVENT,
        Permission.DELETE_EVENT,

        // Communication
        Permission.SEND_TEAM_MESSAGE,
        Permission.INVITE_USER,

        // Reporting
        Permission.EXPORT_TEAM_DATA,
        Permission.CREATE_TEAM_GEAR_NEED,
        Permission.REQUEST_TEAM_GEAR,
    ],

    [LeagueAccessLevel.LEAGUE_ADMIN]: [
        // All lower level permissions
        Permission.VIEW_LEAGUE,
        Permission.VIEW_TEAM,
        Permission.VIEW_PLAYER_DETAILS,
        Permission.UPDATE_TEAM,
        Permission.ADD_PLAYER,
        Permission.UPDATE_PLAYER,
        Permission.REMOVE_PLAYER,
        Permission.VIEW_EMERGENCY_CONTACTS,
        Permission.CREATE_EVENT,
        Permission.UPDATE_EVENT,
        Permission.DELETE_EVENT,
        Permission.SEND_TEAM_MESSAGE,
        Permission.INVITE_USER,
        Permission.EXPORT_TEAM_DATA,

        // League management
        Permission.CREATE_LEAGUE,
        Permission.UPDATE_LEAGUE,
        Permission.DELETE_LEAGUE,

        // Team management
        Permission.CREATE_TEAM,
        Permission.DELETE_TEAM,
        Permission.MIGRATE_TEAM,
        Permission.TRANSFER_PLAYER,

        // Division management
        Permission.CREATE_DIVISION,
        Permission.UPDATE_DIVISION,
        Permission.DELETE_DIVISION,
        Permission.ASSIGN_TEAM_TO_DIVISION,

        // Event management
        Permission.CREATE_INTER_TEAM_GAME,

        // Communication
        Permission.SEND_LEAGUE_MESSAGE,
        Permission.SEND_LEAGUE_ANNOUNCEMENT,

        // User management
        Permission.ASSIGN_LEAGUE_ROLE,
        Permission.ASSIGN_TEAM_ROLE,

        // Reporting
        Permission.EXPORT_LEAGUE_DATA,
        Permission.VIEW_LEAGUE_REPORTS,
        Permission.VIEW_FINANCIAL_REPORTS,
        Permission.MANAGE_GEAR_INVENTORY,
        Permission.MANAGE_GEAR_WISHLIST,
        Permission.CREATE_TEAM_GEAR_NEED,
        Permission.REQUEST_TEAM_GEAR,
    ],
});

/**
 * Gear `Permission` values that a scoped association grant can supply.
 *
 * Deliberately a closed map rather than a predicate: adding a permission to the
 * grant path has to be a decision someone writes down here, not something a new
 * enum member inherits by accident.
 */
const GEAR_PERMISSION_ACTIONS: Partial<Record<Permission, GearAction>> = {
    [Permission.MANAGE_GEAR_INVENTORY]: "MANAGE_INVENTORY",
    [Permission.MANAGE_GEAR_WISHLIST]: "MANAGE_WISHLIST",
    [Permission.CREATE_TEAM_GEAR_NEED]: "TEAM_NEED_OR_REQUEST",
    [Permission.REQUEST_TEAM_GEAR]: "TEAM_NEED_OR_REQUEST",
};

/**
 * Last-resort authorization for gear work via an association role grant.
 *
 * Consulted only after the access-level matrix has declined, so a grant can add
 * authority but never remove or loosen an existing rule — including the
 * mandatory-teamId rule above, which `grantsAllowGearAction` re-checks.
 *
 * The import is lazy to match the rest of this module: `lib/auth/capabilities`
 * pulls in security helpers that transitively reach back here, and eager
 * resolution would reintroduce the cycle the other dynamic imports avoid.
 */
async function hasGearPermissionViaGrant(
    userId: string,
    leagueId: string,
    permission: Permission,
    teamId?: string
): Promise<boolean> {
    const action = GEAR_PERMISSION_ACTIONS[permission];
    if (!action) {
        return false;
    }

    try {
        const { grantsAllowGearAction } = await import("@/lib/auth/capabilities");
        return await grantsAllowGearAction({ userId, leagueId, action, teamId });
    } catch (error) {
        console.error("Error checking gear grant:", sanitizeErrorForLogging(error));
        return false;
    }
}

/**
 * Check if a user has a specific permission for a league
 */
export async function hasPermission(
    userId: string,
    leagueId: string,
    permission: Permission,
    teamId?: string
): Promise<boolean> {
    try {
        // Get user's access level for the league
        const { getUserLeagueAccessLevel } = await import("./security");
        const accessLevel = await getUserLeagueAccessLevel(userId, leagueId);

        // Check if the access level includes the required permission
        const allowedPermissions = getPermissionMatrix()[accessLevel] || [];
        const hasBasePermission = allowedPermissions.includes(permission);

        if (isTeamSpecificPermission(permission)) {
            // Team-specific operations are never league-wide by omission. League
            // admins still receive access to a supplied team through the exact
            // same scoped path as team admins.
            if (!teamId) {
                return false;
            }

            if (
                hasBasePermission &&
                (await hasTeamSpecificPermission(userId, leagueId, teamId, permission, accessLevel))
            ) {
                return true;
            }

            // Fall through: an equipment manager or team manager may hold this
            // team's gear rights through a scoped grant without being a team
            // admin. Non-gear permissions have no grant path and end at false.
            return hasGearPermissionViaGrant(userId, leagueId, permission, teamId);
        }

        if (hasBasePermission) {
            return true;
        }

        return hasGearPermissionViaGrant(userId, leagueId, permission, teamId);
    } catch (error) {
        console.error("Error checking permission:", sanitizeErrorForLogging(error));
        return false;
    }
}

/**
 * Check if a permission is team-specific
 */
export function isTeamSpecificPermission(permission: Permission): permission is TeamScopedPermission {
    return (TEAM_SCOPED_PERMISSIONS as readonly Permission[]).includes(permission);
}

export async function hasTeamPermission(
    userId: string,
    leagueId: string,
    permission: TeamScopedPermission,
    teamId: string,
): Promise<boolean> {
    return hasPermission(userId, leagueId, permission, teamId);
}

/**
 * Check team-specific permission
 */
async function hasTeamSpecificPermission(
    userId: string,
    leagueId: string,
    teamId: string,
    permission: Permission,
    leagueAccessLevel: LeagueAccessLevel
): Promise<boolean> {
    try {
        // League admins have access to all teams
        if (leagueAccessLevel === LeagueAccessLevel.LEAGUE_ADMIN) {
            return true;
        }

        // Check if user is admin of the specific team
        const teamMember = await prisma.teamMember.findFirst({
            where: {
                userId,
                teamId,
                role: "ADMIN",
                team: {
                    leagueId,
                    isActive: true,
                },
            },
        });

        return !!teamMember;
    } catch (error) {
        console.error("Error checking team-specific permission:", sanitizeErrorForLogging(error));
        return false;
    }
}

/**
 * Require a specific permission, throwing an error if not authorized
 */
export async function requirePermission(
    userId: string,
    leagueId: string,
    permission: Permission,
    teamId?: string
): Promise<void> {
    const hasAccess = await hasPermission(userId, leagueId, permission, teamId);

    if (!hasAccess) {
        // Log permission denied event
        await logAuditEvent({
            action: AuditAction.PERMISSION_DENIED,
            userId,
            leagueId,
            teamId,
            details: {
                permission,
                reason: "Insufficient permissions",
            },
            timestamp: new Date(),
        });

        throw new Error(`Permission denied: ${permission}`);
    }
}

/**
 * Session-aware guard with `requireLeagueRole`'s ergonomics, but routed through
 * the permission matrix so association role grants are honoured.
 *
 * Gear actions previously called `requireLeagueRole(leagueId, "LEAGUE_ADMIN")`
 * directly, which meant an equipment-manager grant authorized nothing in
 * practice — the grant bridge below was unreachable from the domain it exists
 * to serve. Swapping those guards for this one is what connects them.
 *
 * The thrown message keeps the `Unauthorized:` prefix because callers and pages
 * match on it to decide between a 404 and an error surface.
 */
export async function requirePermissionForLeague(
    leagueId: string,
    permission: Permission,
    teamId?: string
): Promise<string> {
    const { requireUserId } = await import("@/lib/auth/session");
    const userId = await requireUserId();

    try {
        // Reused rather than reimplemented so denials keep hitting the same
        // PERMISSION_DENIED audit path.
        await requirePermission(userId, leagueId, permission, teamId);
    } catch {
        throw new Error("Unauthorized: insufficient permissions for this action");
    }

    return userId;
}

/**
 * Get all permissions for a user in a league
 */
export async function getUserPermissions(
    userId: string,
    leagueId: string
): Promise<Permission[]> {
    try {
        const { getUserLeagueAccessLevel } = await import("./security");
        const accessLevel = await getUserLeagueAccessLevel(userId, leagueId);

        return getPermissionMatrix()[accessLevel] || [];
    } catch (error) {
        console.error("Error getting user permissions:", sanitizeErrorForLogging(error));
        return [];
    }
}

/**
 * Check if user can perform bulk operations (for rate limiting)
 */
export async function canPerformBulkOperation(
    userId: string,
    leagueId: string,
    operationType: "export" | "import" | "bulk_update" | "bulk_delete"
): Promise<boolean> {
    try {
        const { getUserLeagueAccessLevel, checkLeagueOperationRateLimit } = await import("./security");
        const accessLevel = await getUserLeagueAccessLevel(userId, leagueId);

        // Only league admins can perform bulk operations
        if (accessLevel !== LeagueAccessLevel.LEAGUE_ADMIN) {
            return false;
        }

        // Check rate limiting
        const rateLimitKey = `bulk_${operationType}`;
        const maxOperations = operationType === "export" ? 10 : 5; // More lenient for exports

        return checkLeagueOperationRateLimit(userId, rateLimitKey, maxOperations);
    } catch (error) {
        console.error("Error checking bulk operation permission:", sanitizeErrorForLogging(error));
        return false;
    }
}

/**
 * Assign league role to user with permission checking
 */
export async function assignLeagueRole(
    assignerId: string,
    targetUserId: string,
    leagueId: string,
    role: "LEAGUE_ADMIN" | "TEAM_ADMIN" | "MEMBER"
): Promise<{ success: boolean; error?: string }> {
    try {
        // Check if assigner has permission
        const hasAccess = await hasPermission(assignerId, leagueId, Permission.ASSIGN_LEAGUE_ROLE);

        if (!hasAccess) {
            await logAuditEvent({
                action: AuditAction.PERMISSION_DENIED,
                userId: assignerId,
                leagueId,
                details: {
                    operation: "assign_league_role",
                    targetUserId,
                    role,
                },
                timestamp: new Date(),
            });

            return { success: false, error: "Permission denied" };
        }

        // Check if target user exists
        const targetUser = await prisma.user.findUnique({
            where: { id: targetUserId },
            select: { id: true, email: true },
        });

        if (!targetUser) {
            return { success: false, error: "User not found" };
        }

        // Upsert league user role
        await prisma.leagueUser.upsert({
            where: {
                userId_leagueId: {
                    userId: targetUserId,
                    leagueId,
                },
            },
            update: { role },
            create: {
                userId: targetUserId,
                leagueId,
                role,
            },
        });

        // Log the role assignment
        await logAuditEvent({
            action: AuditAction.USER_ROLE_ASSIGNED,
            userId: assignerId,
            leagueId,
            details: {
                targetUserId,
                targetUserEmail: targetUser.email,
                role,
                operation: "league_role_assignment",
            },
            timestamp: new Date(),
        });

        return { success: true };
    } catch (error) {
        console.error("Error assigning league role:", sanitizeErrorForLogging(error));
        return { success: false, error: "Failed to assign role" };
    }
}

/**
 * Remove league role from user with permission checking
 */
export async function removeLeagueRole(
    removerId: string,
    targetUserId: string,
    leagueId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        // Check if remover has permission
        const hasAccess = await hasPermission(removerId, leagueId, Permission.ASSIGN_LEAGUE_ROLE);

        if (!hasAccess) {
            await logAuditEvent({
                action: AuditAction.PERMISSION_DENIED,
                userId: removerId,
                leagueId,
                details: {
                    operation: "remove_league_role",
                    targetUserId,
                },
                timestamp: new Date(),
            });

            return { success: false, error: "Permission denied" };
        }

        // Prevent removing own admin role if they're the only admin
        if (removerId === targetUserId) {
            const adminCount = await prisma.leagueUser.count({
                where: {
                    leagueId,
                    role: "LEAGUE_ADMIN",
                },
            });

            if (adminCount <= 1) {
                return { success: false, error: "Cannot remove the last league admin" };
            }
        }

        // Get target user info for logging
        const targetUser = await prisma.user.findUnique({
            where: { id: targetUserId },
            select: { email: true },
        });

        // Remove league role
        await prisma.leagueUser.delete({
            where: {
                userId_leagueId: {
                    userId: targetUserId,
                    leagueId,
                },
            },
        });

        // Log the role removal
        await logAuditEvent({
            action: AuditAction.USER_ROLE_REMOVED,
            userId: removerId,
            leagueId,
            details: {
                targetUserId,
                targetUserEmail: targetUser?.email,
                operation: "league_role_removal",
            },
            timestamp: new Date(),
        });

        return { success: true };
    } catch (error) {
        console.error("Error removing league role:", sanitizeErrorForLogging(error));
        return { success: false, error: "Failed to remove role" };
    }
}

/**
 * Get users with their roles for a league (for admin interface)
 */
export async function getLeagueUsersWithRoles(
    requesterId: string,
    leagueId: string
): Promise<Array<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    joinedAt: Date;
}> | null> {
    try {
        // Check if requester has permission to view league users
        const hasAccess = await hasPermission(requesterId, leagueId, Permission.VIEW_LEAGUE);

        if (!hasAccess) {
            await logAuditEvent({
                action: AuditAction.PERMISSION_DENIED,
                userId: requesterId,
                leagueId,
                details: {
                    operation: "view_league_users",
                },
                timestamp: new Date(),
            });

            return null;
        }

        const leagueUsers = await prisma.leagueUser.findMany({
            where: { leagueId },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        name: true,
                    },
                },
            },
            orderBy: [
                { role: "asc" }, // LEAGUE_ADMIN first
                { user: { name: "asc" } },
            ],
        });

        return leagueUsers.map(lu => ({
            id: lu.user.id,
            email: lu.user.email,
            name: lu.user.name,
            role: lu.role,
            joinedAt: lu.joinedAt,
        }));
    } catch (error) {
        console.error("Error getting league users with roles:", sanitizeErrorForLogging(error));
        return null;
    }
}