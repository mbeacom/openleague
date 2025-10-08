"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { notificationService, type NotificationPreferences } from "@/lib/services/notification";

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
): Promise<ActionResult<NotificationPreferences>> {
  try {
    const userId = await requireUserId();

    const preferences = await notificationService.getNotificationPreferences(userId, leagueId);

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
): Promise<ActionResult<{ updated: boolean }>> {
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

    revalidatePath("/settings");
    if (validated.leagueId) {
      revalidatePath(`/league/${validated.leagueId}/settings`);
    }

    return {
      success: true,
      data: { updated: true },
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
  global: NotificationPreferences;
  leagues: Array<{
    leagueId: string;
    leagueName: string;
    preferences: NotificationPreferences;
  }>;
}>> {
  try {
    const userId = await requireUserId();

    // Get global preferences
    const globalPreferences = await notificationService.getNotificationPreferences(userId);

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

    // Batch fetch all league preferences in a single query to avoid N+1 problem
    const leagueIds = leagueUsers.map(lu => lu.leagueId);
    const allPreferences = leagueIds.length > 0
      ? await prisma.notificationPreference.findMany({
          where: {
            userId,
            leagueId: { in: leagueIds },
          },
        })
      : [];

    // Create a map for O(1) lookup
    const preferencesMap = new Map(
      allPreferences.map(pref => [pref.leagueId!, pref])
    );

    // Build league preferences using the fetched data or defaults
    const leaguePreferences = leagueUsers.map((leagueUser) => {
      const pref = preferencesMap.get(leagueUser.leagueId);

      const preferences: NotificationPreferences = pref
        ? {
            leagueMessages: pref.leagueMessages,
            leagueAnnouncements: pref.leagueAnnouncements,
            eventNotifications: pref.eventNotifications,
            rsvpReminders: pref.rsvpReminders,
            teamInvitations: pref.teamInvitations,
            emailEnabled: pref.emailEnabled,
            urgentOnly: pref.urgentOnly,
            batchDelivery: pref.batchDelivery,
          }
        : {
            // Default preferences if none exist for this league
            leagueMessages: true,
            leagueAnnouncements: true,
            eventNotifications: true,
            rsvpReminders: true,
            teamInvitations: true,
            emailEnabled: true,
            urgentOnly: false,
            batchDelivery: false,
          };

      return {
        leagueId: leagueUser.leagueId,
        leagueName: leagueUser.league.name,
        preferences,
      };
    });

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