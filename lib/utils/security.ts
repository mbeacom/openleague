/**
 * Security utilities for league-level data isolation and access control
 */

import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { sanitizeErrorForLogging } from "./error-handling";

/**
 * League access levels for permission checking
 */
export enum LeagueAccessLevel {
    NONE = 0,
    MEMBER = 1,
    TEAM_ADMIN = 2,
    LEAGUE_ADMIN = 3,
}

/**
 * Audit action types for logging
 */
export enum AuditAction {
    // League management
    LEAGUE_CREATED = "league_created",
    LEAGUE_UPDATED = "league_updated",
    LEAGUE_DELETED = "league_deleted",

    // Team management
    TEAM_CREATED = "team_created",
    TEAM_UPDATED = "team_updated",
    TEAM_DELETED = "team_deleted",
    TEAM_MIGRATED = "team_migrated",

    // Division management
    DIVISION_CREATED = "division_created",
    DIVISION_UPDATED = "division_updated",
    DIVISION_DELETED = "division_deleted",
    TEAM_ASSIGNED_TO_DIVISION = "team_assigned_to_division",

    // Player management
    PLAYER_ADDED = "player_added",
    PLAYER_UPDATED = "player_updated",
    PLAYER_TRANSFERRED = "player_transferred",
    PLAYER_REMOVED = "player_removed",

    // Event management
    EVENT_CREATED = "event_created",
    EVENT_UPDATED = "event_updated",
    EVENT_DELETED = "event_deleted",
    INTER_TEAM_GAME_CREATED = "inter_team_game_created",

    // User management
    USER_ROLE_ASSIGNED = "user_role_assigned",
    USER_ROLE_REMOVED = "user_role_removed",
    USER_INVITED = "user_invited",

    // Communication
    MESSAGE_SENT = "message_sent",
    ANNOUNCEMENT_SENT = "announcement_sent",

    // Data access
    DATA_EXPORTED = "data_exported",
    REPORT_GENERATED = "report_generated",

    // Security events
    UNAUTHORIZED_ACCESS_ATTEMPT = "unauthorized_access_attempt",
    PERMISSION_DENIED = "permission_denied",
}

/**
 * Audit log entry interface
 */
export interface AuditLogEntry {
    action: AuditAction;
    userId: string;
    leagueId?: string;
    teamId?: string;
    resourceId?: string;
    resourceType?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    timestamp: Date;
}

/**
 * Get user's access level for a specific league
 */
export async function getUserLeagueAccessLevel(
    userId: string,
    leagueId: string
): Promise<LeagueAccessLevel> {
    try {
        // Check if user is league admin
        const leagueUser = await prisma.leagueUser.findFirst({
            where: {
                userId,
                leagueId,
                league: { isActive: true },
            },
            select: { role: true },
        });

        if (leagueUser?.role === "LEAGUE_ADMIN") {
            return LeagueAccessLevel.LEAGUE_ADMIN;
        }

        if (leagueUser?.role === "TEAM_ADMIN") {
            return LeagueAccessLevel.TEAM_ADMIN;
        }

        if (leagueUser?.role === "MEMBER") {
            return LeagueAccessLevel.MEMBER;
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

        if (teamAdminCount > 0) {
            return LeagueAccessLevel.TEAM_ADMIN;
        }

        // Check if user is member of any team in the league
        const teamMemberCount = await prisma.teamMember.count({
            where: {
                userId,
                team: {
                    leagueId,
                    isActive: true,
                },
            },
        });

        if (teamMemberCount > 0) {
            return LeagueAccessLevel.MEMBER;
        }

        return LeagueAccessLevel.NONE;
    } catch (error) {
        console.error("Error checking league access level:", sanitizeErrorForLogging(error));
        return LeagueAccessLevel.NONE;
    }
}

/**
 * Verify user has minimum required access level for a league
 */
export async function verifyLeagueAccess(
    leagueId: string,
    requiredLevel: LeagueAccessLevel,
    userId?: string
): Promise<{ hasAccess: boolean; userId: string; accessLevel: LeagueAccessLevel }> {
    try {
        const currentUserId = userId || await requireUserId();
        const accessLevel = await getUserLeagueAccessLevel(currentUserId, leagueId);

        const hasAccess = accessLevel >= requiredLevel;

        // Log unauthorized access attempts
        if (!hasAccess) {
            await logAuditEvent({
                action: AuditAction.UNAUTHORIZED_ACCESS_ATTEMPT,
                userId: currentUserId,
                leagueId,
                details: {
                    requiredLevel: LeagueAccessLevel[requiredLevel],
                    userLevel: LeagueAccessLevel[accessLevel],
                },
                timestamp: new Date(),
            });
        }

        return {
            hasAccess,
            userId: currentUserId,
            accessLevel,
        };
    } catch (error) {
        console.error("Error verifying league access:", sanitizeErrorForLogging(error));
        return {
            hasAccess: false,
            userId: userId || "",
            accessLevel: LeagueAccessLevel.NONE,
        };
    }
}

/**
 * Verify user has access to a specific team within a league
 */
export async function verifyTeamAccess(
    teamId: string,
    leagueId: string,
    requiredLevel: LeagueAccessLevel,
    userId?: string
): Promise<{ hasAccess: boolean; userId: string; accessLevel: LeagueAccessLevel }> {
    try {
        const currentUserId = userId || await requireUserId();

        // First check league-level access
        const leagueAccess = await verifyLeagueAccess(leagueId, LeagueAccessLevel.MEMBER, currentUserId);

        if (!leagueAccess.hasAccess) {
            return leagueAccess;
        }

        // If user is league admin, they have access to all teams
        if (leagueAccess.accessLevel === LeagueAccessLevel.LEAGUE_ADMIN) {
            return {
                hasAccess: true,
                userId: currentUserId,
                accessLevel: LeagueAccessLevel.LEAGUE_ADMIN,
            };
        }

        // Check team-specific access
        const teamMember = await prisma.teamMember.findFirst({
            where: {
                userId: currentUserId,
                teamId,
                team: {
                    leagueId,
                    isActive: true,
                },
            },
            select: { role: true },
        });

        let teamAccessLevel = LeagueAccessLevel.NONE;

        if (teamMember?.role === "ADMIN") {
            teamAccessLevel = LeagueAccessLevel.TEAM_ADMIN;
        } else if (teamMember?.role === "MEMBER") {
            teamAccessLevel = LeagueAccessLevel.MEMBER;
        }

        const hasAccess = teamAccessLevel >= requiredLevel;

        // Log unauthorized access attempts
        if (!hasAccess) {
            await logAuditEvent({
                action: AuditAction.UNAUTHORIZED_ACCESS_ATTEMPT,
                userId: currentUserId,
                leagueId,
                teamId,
                details: {
                    requiredLevel: LeagueAccessLevel[requiredLevel],
                    userLevel: LeagueAccessLevel[teamAccessLevel],
                },
                timestamp: new Date(),
            });
        }

        return {
            hasAccess,
            userId: currentUserId,
            accessLevel: teamAccessLevel,
        };
    } catch (error) {
        console.error("Error verifying team access:", sanitizeErrorForLogging(error));
        return {
            hasAccess: false,
            userId: userId || "",
            accessLevel: LeagueAccessLevel.NONE,
        };
    }
}

/**
 * Ensure league data isolation by validating that a resource belongs to the specified league
 */
export async function validateLeagueDataIsolation(
    resourceType: "team" | "player" | "event" | "division",
    resourceId: string,
    expectedLeagueId: string
): Promise<boolean> {
    try {
        let actualLeagueId: string | null = null;

        switch (resourceType) {
            case "team":
                const team = await prisma.team.findUnique({
                    where: { id: resourceId },
                    select: { leagueId: true },
                });
                actualLeagueId = team?.leagueId || null;
                break;

            case "player":
                const player = await prisma.player.findUnique({
                    where: { id: resourceId },
                    select: { leagueId: true },
                });
                actualLeagueId = player?.leagueId || null;
                break;

            case "event":
                const event = await prisma.event.findUnique({
                    where: { id: resourceId },
                    select: { leagueId: true },
                });
                actualLeagueId = event?.leagueId || null;
                break;

            case "division":
                const division = await prisma.division.findUnique({
                    where: { id: resourceId },
                    select: { leagueId: true },
                });
                actualLeagueId = division?.leagueId || null;
                break;
        }

        return actualLeagueId === expectedLeagueId;
    } catch (error) {
        console.error("Error validating league data isolation:", sanitizeErrorForLogging(error));
        return false;
    }
}

/**
 * Determine severity level based on audit action
 */
function getAuditSeverity(action: AuditAction): "info" | "warning" | "error" {
    if (action.includes("UNAUTHORIZED") || action.includes("DENIED")) {
        return "error";
    }
    if (action.includes("DELETED") || action.includes("REMOVED")) {
        return "warning";
    }
    return "info";
}

/**
 * Log audit event to database for persistent audit trail
 */
export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
    try {
        const severity = getAuditSeverity(entry.action);

        // Write to database for persistent storage
        await prisma.auditLog.create({
            data: {
                action: entry.action,
                userId: entry.userId,
                leagueId: entry.leagueId,
                teamId: entry.teamId,
                resourceId: entry.resourceId,
                resourceType: entry.resourceType,
                details: entry.details ? JSON.parse(JSON.stringify(entry.details)) : undefined,
                ipAddress: entry.ipAddress,
                userAgent: entry.userAgent,
                severity,
            },
        });

        // Also log to console for immediate visibility in development
        if (process.env.NODE_ENV === "development") {
            const logEntry = {
                timestamp: entry.timestamp.toISOString(),
                action: entry.action,
                userId: entry.userId,
                leagueId: entry.leagueId,
                severity,
            };

            if (severity === "error") {
                console.warn("AUDIT [SECURITY]:", JSON.stringify(logEntry));
            } else {
                console.info("AUDIT [ACTION]:", JSON.stringify(logEntry));
            }
        }
    } catch (error) {
        // Never let audit logging failures break the main application flow
        // Log to console as fallback
        console.error("Failed to log audit event to database:", sanitizeErrorForLogging(error));
        console.warn("AUDIT [FALLBACK]:", JSON.stringify(entry));
    }
}

/**
 * Validate input data to prevent injection attacks and ensure data integrity
 */
export function validateLeagueOperationData(data: Record<string, unknown>): {
    isValid: boolean;
    errors: string[];
} {
    const errors: string[] = [];

    // Check for null bytes and control characters
    const checkString = (value: unknown, fieldName: string) => {
        if (typeof value === "string") {
            if (value.includes("\0")) {
                errors.push(`${fieldName} contains null bytes`);
            }

            // Check for dangerous control characters
            if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value)) {
                errors.push(`${fieldName} contains dangerous control characters`);
            }

            // Check for potential SQL injection patterns (basic check)
            const sqlPatterns = [
                /union\s+select/i,
                /drop\s+table/i,
                /delete\s+from/i,
                /insert\s+into/i,
                /update\s+set/i,
            ];

            if (sqlPatterns.some(pattern => pattern.test(value))) {
                errors.push(`${fieldName} contains potentially dangerous SQL patterns`);
            }
        }
    };

    // Recursively check all string values
    const checkObject = (obj: Record<string, unknown>, prefix = "") => {
        for (const [key, value] of Object.entries(obj)) {
            const fieldName = prefix ? `${prefix}.${key}` : key;

            if (typeof value === "string") {
                checkString(value, fieldName);
            } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                checkObject(value as Record<string, unknown>, fieldName);
            } else if (Array.isArray(value)) {
                value.forEach((item, index) => {
                    if (typeof item === "string") {
                        checkString(item, `${fieldName}[${index}]`);
                    } else if (typeof item === "object" && item !== null) {
                        checkObject(item as Record<string, unknown>, `${fieldName}[${index}]`);
                    }
                });
            }
        }
    };

    checkObject(data);

    return {
        isValid: errors.length === 0,
        errors,
    };
}

/**
 * Rate limiting for league operations to prevent abuse
 */
const operationCounts = new Map<string, { count: number; resetTime: number }>();

export function checkLeagueOperationRateLimit(
    userId: string,
    operation: string,
    maxOperations = 100,
    windowMs = 60 * 60 * 1000 // 1 hour
): boolean {
    const key = `${userId}:${operation}`;
    const now = Date.now();

    const current = operationCounts.get(key);

    if (!current || now > current.resetTime) {
        // Reset or initialize counter
        operationCounts.set(key, {
            count: 1,
            resetTime: now + windowMs,
        });
        return true;
    }

    if (current.count >= maxOperations) {
        return false;
    }

    current.count++;
    return true;
}

/**
 * Clean up expired rate limit entries
 */
export function cleanupRateLimitEntries(): void {
    const now = Date.now();

    for (const [key, value] of operationCounts.entries()) {
        if (now > value.resetTime) {
            operationCounts.delete(key);
        }
    }
}

// Clean up rate limit entries every 5 minutes
if (typeof setInterval !== "undefined") {
    setInterval(cleanupRateLimitEntries, 5 * 60 * 1000);
}