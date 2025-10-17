/**
 * Permission management utilities for league and team operations
 */

import { prisma } from "@/lib/db/prisma";
import { LeagueAccessLevel, logAuditEvent, AuditAction } from "./security";
import { sanitizeErrorForLogging } from "./error-handling";

/**
 * Permission definitions for different operations
 */
export enum Permission {
    // League management
    CREATE_LEAGUE = "create_league",
    UPDATE_LEAGUE = "update_league",
    DELETE_LEAGUE = "delete_league",
    VIEW_LEAGUE = "view_league",

    // Team management
    CREATE_TEAM = "create_team",
    UPDATE_TEAM = "update_team",
    DELETE_TEAM = "delete_team",
    VIEW_TEAM = "view_team",
    MIGRATE_TEAM = "migrate_team",

    // Division management
    CREATE_DIVISION = "create_division",
    UPDATE_DIVISION = "update_division",
    DELETE_DIVISION = "delete_division",
    ASSIGN_TEAM_TO_DIVISION = "assign_team_to_division",

    // Player management
    ADD_PLAYER = "add_player",
    UPDATE_PLAYER = "update_player",
    REMOVE_PLAYER = "remove_player",
    TRANSFER_PLAYER = "transfer_player",
    VIEW_PLAYER_DETAILS = "view_player_details",
    VIEW_EMERGENCY_CONTACTS = "view_emergency_contacts",

    // Event management
    CREATE_EVENT = "create_event",
    UPDATE_EVENT = "update_event",
    DELETE_EVENT = "delete_event",
    CREATE_INTER_TEAM_GAME = "create_inter_team_game",

    // Communication
    SEND_LEAGUE_MESSAGE = "send_league_message",
    SEND_LEAGUE_ANNOUNCEMENT = "send_league_announcement",
    SEND_TEAM_MESSAGE = "send_team_message",

    // User management
    ASSIGN_LEAGUE_ROLE = "assign_league_role",
    ASSIGN_TEAM_ROLE = "assign_team_role",
    INVITE_USER = "invite_user",

    // Reporting and data
    EXPORT_LEAGUE_DATA = "export_league_data",
    EXPORT_TEAM_DATA = "export_team_data",
    VIEW_LEAGUE_REPORTS = "view_league_reports",
    VIEW_FINANCIAL_REPORTS = "view_financial_reports",
}

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
    ],
});

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

        // For team-specific permissions, verify team access if teamId is provided
        if (hasBasePermission && teamId && isTeamSpecificPermission(permission)) {
            return await hasTeamSpecificPermission(userId, leagueId, teamId, permission, accessLevel);
        }

        return hasBasePermission;
    } catch (error) {
        console.error("Error checking permission:", sanitizeErrorForLogging(error));
        return false;
    }
}

/**
 * Check if a permission is team-specific
 */
function isTeamSpecificPermission(permission: Permission): boolean {
    const teamSpecificPermissions = [
        Permission.UPDATE_TEAM,
        Permission.DELETE_TEAM,
        Permission.ADD_PLAYER,
        Permission.UPDATE_PLAYER,
        Permission.REMOVE_PLAYER,
        Permission.CREATE_EVENT,
        Permission.UPDATE_EVENT,
        Permission.DELETE_EVENT,
        Permission.SEND_TEAM_MESSAGE,
        Permission.EXPORT_TEAM_DATA,
    ];

    return teamSpecificPermissions.includes(permission);
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