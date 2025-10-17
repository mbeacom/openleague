"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import {
    verifyLeagueAccess,
    validateLeagueOperationData,
    logAuditEvent,
    AuditAction,
    LeagueAccessLevel,
} from "@/lib/utils/security";
import {
    requirePermission,
    Permission,
    assignLeagueRole,
    removeLeagueRole,
    getLeagueUsersWithRoles,
    hasPermission,
    getUserPermissions,
} from "@/lib/utils/permissions";

export type ActionResult<T> =
    | { success: true; data: T }
    | { success: false; error: string; details?: unknown };

// Validation schemas
const assignLeagueRoleSchema = z.object({
    leagueId: z.string().cuid("Invalid league ID format"),
    targetUserId: z.string().cuid("Invalid user ID format"),
    role: z.enum(["LEAGUE_ADMIN", "TEAM_ADMIN", "MEMBER"], {
        message: "Role must be LEAGUE_ADMIN, TEAM_ADMIN, or MEMBER",
    }),
});

const removeLeagueRoleSchema = z.object({
    leagueId: z.string().cuid("Invalid league ID format"),
    targetUserId: z.string().cuid("Invalid user ID format"),
});

const assignTeamRoleSchema = z.object({
    leagueId: z.string().cuid("Invalid league ID format"),
    teamId: z.string().cuid("Invalid team ID format"),
    targetUserId: z.string().cuid("Invalid user ID format"),
    role: z.enum(["ADMIN", "MEMBER"], {
        message: "Role must be ADMIN or MEMBER",
    }),
});

const removeTeamRoleSchema = z.object({
    leagueId: z.string().cuid("Invalid league ID format"),
    teamId: z.string().cuid("Invalid team ID format"),
    targetUserId: z.string().cuid("Invalid user ID format"),
});

const getLeagueUsersSchema = z.object({
    leagueId: z.string().cuid("Invalid league ID format"),
});

const getUserPermissionsSchema = z.object({
    leagueId: z.string().cuid("Invalid league ID format"),
    targetUserId: z.string().cuid("Invalid user ID format").optional(),
});

// Type exports
export type AssignLeagueRoleInput = z.infer<typeof assignLeagueRoleSchema>;
export type RemoveLeagueRoleInput = z.infer<typeof removeLeagueRoleSchema>;
export type AssignTeamRoleInput = z.infer<typeof assignTeamRoleSchema>;
export type RemoveTeamRoleInput = z.infer<typeof removeTeamRoleSchema>;
export type GetLeagueUsersInput = z.infer<typeof getLeagueUsersSchema>;
export type GetUserPermissionsInput = z.infer<typeof getUserPermissionsSchema>;

/**
 * Assign a league role to a user
 */
export async function assignLeagueRoleAction(
    input: AssignLeagueRoleInput
): Promise<ActionResult<{ success: boolean }>> {
    try {
        const userId = await requireUserId();

        // Validate input data for security
        const dataValidation = validateLeagueOperationData(input);
        if (!dataValidation.isValid) {
            return {
                success: false,
                error: `Invalid input data: ${dataValidation.errors.join(", ")}`,
            };
        }

        const validated = assignLeagueRoleSchema.parse(input);

        // Use the permission utility function
        const result = await assignLeagueRole(
            userId,
            validated.targetUserId,
            validated.leagueId,
            validated.role
        );

        if (!result.success) {
            return {
                success: false,
                error: result.error || "Failed to assign role",
            };
        }

        // Revalidate relevant pages
        revalidatePath(`/league/${validated.leagueId}`);
        revalidatePath(`/league/${validated.leagueId}/settings`);

        return {
            success: true,
            data: { success: true },
        };
    } catch (error) {
        if (error instanceof z.ZodError) {
            const fieldErrors = error.issues.map(issue =>
                `${issue.path.join('.')}: ${issue.message}`
            ).join(', ');
            return {
                success: false,
                error: `Validation failed: ${fieldErrors}`,
                details: error.issues,
            };
        }

        console.error("Error assigning league role:", error);
        return {
            success: false,
            error: "Failed to assign league role. Please try again.",
        };
    }
}

/**
 * Remove a league role from a user
 */
export async function removeLeagueRoleAction(
    input: RemoveLeagueRoleInput
): Promise<ActionResult<{ success: boolean }>> {
    try {
        const userId = await requireUserId();

        // Validate input data for security
        const dataValidation = validateLeagueOperationData(input);
        if (!dataValidation.isValid) {
            return {
                success: false,
                error: `Invalid input data: ${dataValidation.errors.join(", ")}`,
            };
        }

        const validated = removeLeagueRoleSchema.parse(input);

        // Use the permission utility function
        const result = await removeLeagueRole(
            userId,
            validated.targetUserId,
            validated.leagueId
        );

        if (!result.success) {
            return {
                success: false,
                error: result.error || "Failed to remove role",
            };
        }

        // Revalidate relevant pages
        revalidatePath(`/league/${validated.leagueId}`);
        revalidatePath(`/league/${validated.leagueId}/settings`);

        return {
            success: true,
            data: { success: true },
        };
    } catch (error) {
        if (error instanceof z.ZodError) {
            const fieldErrors = error.issues.map(issue =>
                `${issue.path.join('.')}: ${issue.message}`
            ).join(', ');
            return {
                success: false,
                error: `Validation failed: ${fieldErrors}`,
                details: error.issues,
            };
        }

        console.error("Error removing league role:", error);
        return {
            success: false,
            error: "Failed to remove league role. Please try again.",
        };
    }
}

/**
 * Assign a team role to a user within a league context
 */
export async function assignTeamRoleAction(
    input: AssignTeamRoleInput
): Promise<ActionResult<{ success: boolean }>> {
    try {
        const userId = await requireUserId();

        // Validate input data for security
        const dataValidation = validateLeagueOperationData(input);
        if (!dataValidation.isValid) {
            return {
                success: false,
                error: `Invalid input data: ${dataValidation.errors.join(", ")}`,
            };
        }

        const validated = assignTeamRoleSchema.parse(input);

        // Verify user has permission to assign team roles
        await requirePermission(userId, validated.leagueId, Permission.ASSIGN_TEAM_ROLE, validated.teamId);

        // Verify team belongs to league
        const team = await prisma.team.findFirst({
            where: {
                id: validated.teamId,
                leagueId: validated.leagueId,
                isActive: true,
            },
            select: { id: true, name: true },
        });

        if (!team) {
            return {
                success: false,
                error: "Team not found or does not belong to this league",
            };
        }

        // Verify target user exists
        const targetUser = await prisma.user.findUnique({
            where: { id: validated.targetUserId },
            select: { id: true, email: true, name: true },
        });

        if (!targetUser) {
            return {
                success: false,
                error: "User not found",
            };
        }

        // Upsert team member role
        await prisma.teamMember.upsert({
            where: {
                userId_teamId: {
                    userId: validated.targetUserId,
                    teamId: validated.teamId,
                },
            },
            update: { role: validated.role },
            create: {
                userId: validated.targetUserId,
                teamId: validated.teamId,
                role: validated.role,
            },
        });

        // Log audit event
        await logAuditEvent({
            action: AuditAction.USER_ROLE_ASSIGNED,
            userId,
            leagueId: validated.leagueId,
            teamId: validated.teamId,
            details: {
                targetUserId: validated.targetUserId,
                targetUserEmail: targetUser.email,
                targetUserName: targetUser.name,
                teamName: team.name,
                role: validated.role,
                operation: "team_role_assignment",
            },
            timestamp: new Date(),
        });

        // Revalidate relevant pages
        revalidatePath(`/league/${validated.leagueId}`);
        revalidatePath(`/league/${validated.leagueId}/teams`);
        revalidatePath(`/league/${validated.leagueId}/teams/${validated.teamId}`);

        return {
            success: true,
            data: { success: true },
        };
    } catch (error) {
        if (error instanceof z.ZodError) {
            const fieldErrors = error.issues.map(issue =>
                `${issue.path.join('.')}: ${issue.message}`
            ).join(', ');
            return {
                success: false,
                error: `Validation failed: ${fieldErrors}`,
                details: error.issues,
            };
        }

        console.error("Error assigning team role:", error);
        return {
            success: false,
            error: "Failed to assign team role. Please try again.",
        };
    }
}

/**
 * Remove a team role from a user within a league context
 */
export async function removeTeamRoleAction(
    input: RemoveTeamRoleInput
): Promise<ActionResult<{ success: boolean }>> {
    try {
        const userId = await requireUserId();

        // Validate input data for security
        const dataValidation = validateLeagueOperationData(input);
        if (!dataValidation.isValid) {
            return {
                success: false,
                error: `Invalid input data: ${dataValidation.errors.join(", ")}`,
            };
        }

        const validated = removeTeamRoleSchema.parse(input);

        // Verify user has permission to remove team roles
        await requirePermission(userId, validated.leagueId, Permission.ASSIGN_TEAM_ROLE, validated.teamId);

        // Verify team belongs to league
        const team = await prisma.team.findFirst({
            where: {
                id: validated.teamId,
                leagueId: validated.leagueId,
                isActive: true,
            },
            select: { id: true, name: true },
        });

        if (!team) {
            return {
                success: false,
                error: "Team not found or does not belong to this league",
            };
        }

        // Get target user info for logging
        const targetUser = await prisma.user.findUnique({
            where: { id: validated.targetUserId },
            select: { email: true, name: true },
        });

        // Check if removing own admin role and if they're the only admin
        if (userId === validated.targetUserId) {
            const adminCount = await prisma.teamMember.count({
                where: {
                    teamId: validated.teamId,
                    role: "ADMIN",
                },
            });

            if (adminCount <= 1) {
                return {
                    success: false,
                    error: "Cannot remove the last team admin",
                };
            }
        }

        // Remove team member role
        await prisma.teamMember.delete({
            where: {
                userId_teamId: {
                    userId: validated.targetUserId,
                    teamId: validated.teamId,
                },
            },
        });

        // Log audit event
        await logAuditEvent({
            action: AuditAction.USER_ROLE_REMOVED,
            userId,
            leagueId: validated.leagueId,
            teamId: validated.teamId,
            details: {
                targetUserId: validated.targetUserId,
                targetUserEmail: targetUser?.email,
                targetUserName: targetUser?.name,
                teamName: team.name,
                operation: "team_role_removal",
            },
            timestamp: new Date(),
        });

        // Revalidate relevant pages
        revalidatePath(`/league/${validated.leagueId}`);
        revalidatePath(`/league/${validated.leagueId}/teams`);
        revalidatePath(`/league/${validated.leagueId}/teams/${validated.teamId}`);

        return {
            success: true,
            data: { success: true },
        };
    } catch (error) {
        if (error instanceof z.ZodError) {
            const fieldErrors = error.issues.map(issue =>
                `${issue.path.join('.')}: ${issue.message}`
            ).join(', ');
            return {
                success: false,
                error: `Validation failed: ${fieldErrors}`,
                details: error.issues,
            };
        }

        console.error("Error removing team role:", error);
        return {
            success: false,
            error: "Failed to remove team role. Please try again.",
        };
    }
}

/**
 * Get all users with their roles for a league
 */
export async function getLeagueUsersAction(
    input: GetLeagueUsersInput
): Promise<ActionResult<Array<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    joinedAt: Date;
}>>> {
    try {
        const userId = await requireUserId();
        const validated = getLeagueUsersSchema.parse(input);

        // Use the permission utility function
        const users = await getLeagueUsersWithRoles(userId, validated.leagueId);

        if (users === null) {
            return {
                success: false,
                error: "Unauthorized or league not found",
            };
        }

        return {
            success: true,
            data: users,
        };
    } catch (error) {
        if (error instanceof z.ZodError) {
            const fieldErrors = error.issues.map(issue =>
                `${issue.path.join('.')}: ${issue.message}`
            ).join(', ');
            return {
                success: false,
                error: `Validation failed: ${fieldErrors}`,
                details: error.issues,
            };
        }

        console.error("Error getting league users:", error);
        return {
            success: false,
            error: "Failed to get league users. Please try again.",
        };
    }
}

/**
 * Get user permissions for a league
 */
export async function getUserPermissionsAction(
    input: GetUserPermissionsInput
): Promise<ActionResult<{
    permissions: Permission[];
    accessLevel: LeagueAccessLevel;
}>> {
    try {
        const userId = await requireUserId();
        const validated = getUserPermissionsSchema.parse(input);

        // If targetUserId is provided, check if current user can view other user's permissions
        const targetUserId = validated.targetUserId || userId;

        if (targetUserId !== userId) {
            // Only league admins can view other users' permissions
            const accessCheck = await verifyLeagueAccess(validated.leagueId, LeagueAccessLevel.LEAGUE_ADMIN, userId);
            if (!accessCheck.hasAccess) {
                return {
                    success: false,
                    error: "Unauthorized - you can only view your own permissions",
                };
            }
        }

        // Get user permissions and access level
        const [permissions, { getUserLeagueAccessLevel }] = await Promise.all([
            getUserPermissions(targetUserId, validated.leagueId),
            import("@/lib/utils/security"),
        ]);

        const accessLevel = await getUserLeagueAccessLevel(targetUserId, validated.leagueId);

        return {
            success: true,
            data: {
                permissions,
                accessLevel,
            },
        };
    } catch (error) {
        if (error instanceof z.ZodError) {
            const fieldErrors = error.issues.map(issue =>
                `${issue.path.join('.')}: ${issue.message}`
            ).join(', ');
            return {
                success: false,
                error: `Validation failed: ${fieldErrors}`,
                details: error.issues,
            };
        }

        console.error("Error getting user permissions:", error);
        return {
            success: false,
            error: "Failed to get user permissions. Please try again.",
        };
    }
}

/**
 * Check if current user has a specific permission
 */
export async function checkPermissionAction(
    leagueId: string,
    permission: Permission,
    teamId?: string
): Promise<ActionResult<{ hasPermission: boolean }>> {
    try {
        const userId = await requireUserId();

        const hasAccess = await hasPermission(userId, leagueId, permission, teamId);

        return {
            success: true,
            data: { hasPermission: hasAccess },
        };
    } catch (error) {
        console.error("Error checking permission:", error);
        return {
            success: false,
            error: "Failed to check permission. Please try again.",
        };
    }
}

/**
 * Get team members with their roles for a specific team
 */
export async function getTeamMembersWithRoles(
    leagueId: string,
    teamId: string
): Promise<ActionResult<Array<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    joinedAt: Date;
}>>> {
    try {
        const userId = await requireUserId();

        // Verify user has access to view team members
        const accessCheck = await verifyLeagueAccess(leagueId, LeagueAccessLevel.MEMBER, userId);
        if (!accessCheck.hasAccess) {
            return {
                success: false,
                error: "Unauthorized - you are not a member of this league",
            };
        }

        // Verify team belongs to league
        const team = await prisma.team.findFirst({
            where: {
                id: teamId,
                leagueId,
                isActive: true,
            },
        });

        if (!team) {
            return {
                success: false,
                error: "Team not found or does not belong to this league",
            };
        }

        // Get team members with their roles
        const teamMembers = await prisma.teamMember.findMany({
            where: { teamId },
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
                { role: "asc" }, // ADMIN first
                { user: { name: "asc" } },
            ],
        });

        const members = teamMembers.map(tm => ({
            id: tm.user.id,
            email: tm.user.email,
            name: tm.user.name,
            role: tm.role,
            joinedAt: tm.joinedAt,
        }));

        return {
            success: true,
            data: members,
        };
    } catch (error) {
        console.error("Error getting team members with roles:", error);
        return {
            success: false,
            error: "Failed to get team members. Please try again.",
        };
    }
}