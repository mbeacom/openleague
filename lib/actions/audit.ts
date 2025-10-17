"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { verifyLeagueAccess, LeagueAccessLevel } from "@/lib/utils/security";
import { sanitizeErrorForLogging } from "@/lib/utils/error-handling";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

// Validation schemas
const getAuditLogsSchema = z.object({
  leagueId: z.string().cuid("Invalid league ID format"),
  page: z.number().int().positive().optional().default(1),
  limit: z.number().int().positive().max(100).optional().default(50),
  action: z.string().optional(),
  severity: z.enum(["info", "warning", "error"]).optional(),
  userEmail: z.string().optional(),
});

export type GetAuditLogsInput = z.infer<typeof getAuditLogsSchema>;

export interface AuditLogEntry {
  id: string;
  action: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  leagueId?: string;
  teamId?: string;
  resourceId?: string;
  resourceType?: string;
  details?: Record<string, unknown>;
  severity: "info" | "warning" | "error";
  createdAt: Date;
}

/**
 * Get audit logs for a league (league admin only)
 */
export async function getAuditLogsAction(
  input: GetAuditLogsInput
): Promise<ActionResult<{
  logs: AuditLogEntry[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}>> {
  try {
    const userId = await requireUserId();
    const validated = getAuditLogsSchema.parse(input);

    // Verify user has league admin access
    const accessCheck = await verifyLeagueAccess(
      validated.leagueId,
      LeagueAccessLevel.LEAGUE_ADMIN,
      userId
    );

    if (!accessCheck.hasAccess) {
      return {
        success: false,
        error: "Unauthorized - you must be a league admin to view audit logs",
      };
    }

    // Build filters
    const where: {
      leagueId?: string;
      action?: string;
      severity?: string;
      user?: { email?: { contains: string; mode: "insensitive" } | { contains: string; mode: "insensitive" } };
    } = {
      leagueId: validated.leagueId,
    };

    if (validated.action) {
      where.action = validated.action;
    }

    if (validated.severity) {
      where.severity = validated.severity;
    }

    if (validated.userEmail) {
      where.user = {
        email: { contains: validated.userEmail, mode: "insensitive" },
      };
    }

    // Get total count for pagination
    const totalCount = await prisma.auditLog.count({ where });

    // Calculate pagination
    const totalPages = Math.ceil(totalCount / validated.limit);
    const skip = (validated.page - 1) * validated.limit;

    // Get audit logs with user information
    const auditLogs = await prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: validated.limit,
    });

    // Transform to response format
    const logs: AuditLogEntry[] = auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      userId: log.userId,
      userEmail: log.user.email,
      userName: log.user.name || undefined,
      leagueId: log.leagueId || undefined,
      teamId: log.teamId || undefined,
      resourceId: log.resourceId || undefined,
      resourceType: log.resourceType || undefined,
      details: (log.details as Record<string, unknown>) || undefined,
      severity: log.severity as "info" | "warning" | "error",
      createdAt: log.createdAt,
    }));

    return {
      success: true,
      data: {
        logs,
        totalCount,
        page: validated.page,
        limit: validated.limit,
        totalPages,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors = error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join(", ");
      return {
        success: false,
        error: `Validation failed: ${fieldErrors}`,
        details: error.issues,
      };
    }

    console.error("Error getting audit logs:", sanitizeErrorForLogging(error));
    return {
      success: false,
      error: "Failed to get audit logs. Please try again.",
    };
  }
}

/**
 * Get unique audit actions for a league (for filter dropdown)
 */
export async function getAuditActionsForLeague(
  leagueId: string
): Promise<string[]> {
  try {
    const userId = await requireUserId();

    // Verify user has league admin access
    const accessCheck = await verifyLeagueAccess(
      leagueId,
      LeagueAccessLevel.LEAGUE_ADMIN,
      userId
    );

    if (!accessCheck.hasAccess) {
      return [];
    }

    const actions = await prisma.auditLog.findMany({
      where: { leagueId },
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    });

    return actions.map((a) => a.action);
  } catch (error) {
    console.error("Error getting audit actions:", sanitizeErrorForLogging(error));
    return [];
  }
}
