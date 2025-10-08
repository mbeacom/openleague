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

    const leaguePreferences = await Promise.all(
      leagueUsers.map(async (leagueUser) => {
        const preferences = await notificationService.getNotificationPreferences(
          userId,
          leagueUser.leagueId
        );
        return {
          leagueId: leagueUser.leagueId,
          leagueName: leagueUser.league.name,
          preferences,
        };
      })
    );

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
 * Process pending notification batches (for cron job)
 */
export async function processPendingNotificationBatches(): Promise<ActionResult<{ processed: number }>> {
  try {
    // This should only be called by system/cron, but we'll add basic protection
    const userId = await requireUserId();
    
    // Only allow system admin or specific service account to call this
    // For now, we'll just log the attempt
    console.log(`Notification batch processing requested by user: ${userId}`);

    await notificationService.processPendingBatches();

    return {
      success: true,
      data: { processed: 1 }, // We don't track the exact count for now
    };
  } catch (error) {
    console.error("Error processing notification batches:", error);
    return {
      success: false,
      error: "Failed to process notification batches",
    };
  }
}