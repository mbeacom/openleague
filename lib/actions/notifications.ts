"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import {
  notificationService,
  type ResolvedNotificationPreferences,
} from "@/lib/services/notification";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

// Validation schemas
const updateNotificationPreferencesSchema = z.object({
  leagueId: z.string().cuid().optional(),
  preferences: z.object({
    leagueMessages: z.boolean().optional(),
    leagueAnnouncements: z.boolean().optional(),
    eventNotifications: z.boolean().optional(),
    rsvpReminders: z.boolean().optional(),
    teamInvitations: z.boolean().optional(),
    practicePlanNotifications: z.boolean().optional(),
    gearNotifications: z.boolean().optional(),
    emailEnabled: z.boolean().optional(),
    urgentOnly: z.boolean().optional(),
    batchDelivery: z.boolean().optional(),
  }),
});

const unsubscribeSchema = z.object({
  token: z.string().min(1, "Unsubscribe token is required"),
});

/**
 * Get notification preferences for the current user
 */
export async function getNotificationPreferences(
  leagueId?: string
): Promise<ActionResult<ResolvedNotificationPreferences>> {
  try {
    const userId = await requireUserId();

    const preferences = await notificationService.resolveNotificationPreferences(userId, leagueId);

    return {
      success: true,
      data: preferences,
    };
  } catch (error) {
    console.error("Error getting notification preferences:", error);
    return {
      success: false,
      error: "Failed to get notification preferences",
    };
  }
}

/**
 * Update notification preferences for the current user
 */
export async function updateNotificationPreferences(
  input: z.infer<typeof updateNotificationPreferencesSchema>
): Promise<ActionResult<{ updated: boolean; preferences: ResolvedNotificationPreferences }>> {
  try {
    const validated = updateNotificationPreferencesSchema.parse(input);
    const userId = await requireUserId();

    // If leagueId is provided, verify user has access to the league
    if (validated.leagueId) {
      const leagueUser = await prisma.leagueUser.findFirst({
        where: {
          userId,
          leagueId: validated.leagueId,
        },
      });

      if (!leagueUser) {
        return {
          success: false,
          error: "You don't have access to this league",
        };
      }
    }

    await notificationService.updateNotificationPreferences(
      userId,
      validated.preferences,
      validated.leagueId
    );
    const preferences = await notificationService.resolveNotificationPreferences(
      userId,
      validated.leagueId,
    );

    revalidatePath("/account");
    if (validated.leagueId) {
      revalidatePath(`/league/${validated.leagueId}/settings`);
    }

    return {
      success: true,
      data: { updated: true, preferences },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid input",
        details: error.issues,
      };
    }

    console.error("Error updating notification preferences:", error);
    return {
      success: false,
      error: "Failed to update notification preferences",
    };
  }
}

/**
 * Get all notification preferences for the current user across all leagues
 */
export async function getAllNotificationPreferences(): Promise<ActionResult<{
  global: ResolvedNotificationPreferences;
  leagues: Array<{
    leagueId: string;
    leagueName: string;
    preferences: ResolvedNotificationPreferences;
  }>;
}>> {
  try {
    const userId = await requireUserId();

    // Get global preferences
    const globalPreferences = await notificationService.resolveNotificationPreferences(userId);

    // Get league-specific preferences
    const leagueUsers = await prisma.leagueUser.findMany({
      where: { userId },
      include: {
        league: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const leaguePreferences = await Promise.all(leagueUsers.map(async (leagueUser) => ({
      leagueId: leagueUser.leagueId,
      leagueName: leagueUser.league.name,
      preferences: await notificationService.resolveNotificationPreferences(userId, leagueUser.leagueId),
    })));

    return {
      success: true,
      data: {
        global: globalPreferences,
        leagues: leaguePreferences,
      },
    };
  } catch (error) {
    console.error("Error getting all notification preferences:", error);
    return {
      success: false,
      error: "Failed to get notification preferences",
    };
  }
}

/**
 * Handle unsubscribe request (public endpoint, no auth required)
 */
export async function handleUnsubscribe(
  input: z.infer<typeof unsubscribeSchema>
): Promise<ActionResult<{ unsubscribed: boolean; leagueName?: string }>> {
  try {
    const validated = unsubscribeSchema.parse(input);

    const result = await notificationService.handleUnsubscribe(validated.token);

    if (!result.success) {
      return {
        success: false,
        error: "Invalid or expired unsubscribe token",
      };
    }

    return {
      success: true,
      data: {
        unsubscribed: true,
        leagueName: result.leagueName,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid input",
        details: error.issues,
      };
    }

    console.error("Error handling unsubscribe:", error);
    return {
      success: false,
      error: "Failed to process unsubscribe request",
    };
  }
}

/**
 * Generate unsubscribe token for the current user
 */
export async function generateUnsubscribeToken(
  leagueId?: string
): Promise<ActionResult<{ token: string }>> {
  try {
    const userId = await requireUserId();

    // If leagueId is provided, verify user has access to the league
    if (leagueId) {
      const leagueUser = await prisma.leagueUser.findFirst({
        where: {
          userId,
          leagueId,
        },
      });

      if (!leagueUser) {
        return {
          success: false,
          error: "You don't have access to this league",
        };
      }
    }

    const token = await notificationService.generateUnsubscribeToken(userId, leagueId);

    return {
      success: true,
      data: { token },
    };
  } catch (error) {
    console.error("Error generating unsubscribe token:", error);
    return {
      success: false,
      error: "Failed to generate unsubscribe token",
    };
  }
}

/**
 * NOTE: Batch processing is handled by the cron endpoint at /api/cron/notification-batches
 * which uses secret-based authentication. This server action has been removed to avoid
 * confusion and prevent incorrect usage that would fail auth (cron jobs have no user session).
 */