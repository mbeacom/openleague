import { prisma } from "@/lib/db/prisma";
import { sendLeagueMessageEmail } from "@/lib/email/templates";
import { randomBytes } from "crypto";

export interface NotificationPreferences {
  leagueMessages: boolean;
  leagueAnnouncements: boolean;
  eventNotifications: boolean;
  rsvpReminders: boolean;
  teamInvitations: boolean;
  emailEnabled: boolean;
  urgentOnly: boolean;
  batchDelivery: boolean;
}

export class NotificationService {
  /**
   * Get or create notification preferences for a user in a league
   */
  async getNotificationPreferences(
    userId: string,
    leagueId?: string
  ): Promise<NotificationPreferences> {
    const preferences = await prisma.notificationPreference.findFirst({
      where: {
        userId,
        leagueId: leagueId ?? null,
      },
    });

    if (preferences) {
      return {
        leagueMessages: preferences.leagueMessages,
        leagueAnnouncements: preferences.leagueAnnouncements,
        eventNotifications: preferences.eventNotifications,
        rsvpReminders: preferences.rsvpReminders,
        teamInvitations: preferences.teamInvitations,
        emailEnabled: preferences.emailEnabled,
        urgentOnly: preferences.urgentOnly,
        batchDelivery: preferences.batchDelivery,
      };
    }

    // Return default preferences if none exist
    return {
      leagueMessages: true,
      leagueAnnouncements: true,
      eventNotifications: true,
      rsvpReminders: true,
      teamInvitations: true,
      emailEnabled: true,
      urgentOnly: false,
      batchDelivery: false,
    };
  }

  /**
   * Update notification preferences for a user
   */
  async updateNotificationPreferences(
    userId: string,
    preferences: Partial<NotificationPreferences>,
    leagueId?: string
  ): Promise<void> {
    const unsubscribeToken = randomBytes(32).toString("hex");

    await prisma.notificationPreference.upsert({
      where: {
        userId_leagueId: {
          userId,
          leagueId: leagueId ?? (null as unknown as string),
        },
      },
      update: {
        ...preferences,
        updatedAt: new Date(),
      },
      create: {
        userId,
        leagueId: leagueId ?? null,
        unsubscribeToken,
        ...preferences,
      },
    });
  }

  /**
   * Check if a user should receive a specific type of notification
   */
  async shouldReceiveNotification(
    userId: string,
    notificationType: keyof NotificationPreferences,
    priority: "LOW" | "NORMAL" | "HIGH" | "URGENT",
    leagueId?: string
  ): Promise<boolean> {
    const preferences = await this.getNotificationPreferences(userId, leagueId);

    // Check if emails are enabled
    if (!preferences.emailEnabled) {
      return false;
    }

    // Check if user only wants urgent messages
    if (preferences.urgentOnly && priority !== "URGENT" && priority !== "HIGH") {
      return false;
    }

    // Check specific notification type preference
    return preferences[notificationType];
  }

  /**
   * Send immediate notification or add to batch based on user preferences
   */
  async sendOrBatchNotification(
    userId: string,
    subject: string,
    content: string,
    priority: "LOW" | "NORMAL" | "HIGH" | "URGENT",
    notificationType: keyof NotificationPreferences,
    leagueId?: string,
    messageId?: string
  ): Promise<void> {
    // Check if user should receive this notification
    const shouldReceive = await this.shouldReceiveNotification(
      userId,
      notificationType,
      priority,
      leagueId
    );

    if (!shouldReceive) {
      return;
    }

    const preferences = await this.getNotificationPreferences(userId, leagueId);

    // Send immediately for urgent/high priority or if batching is disabled
    if (priority === "URGENT" || priority === "HIGH" || !preferences.batchDelivery) {
      await this.sendImmediateNotification(userId, subject, content, priority, leagueId);
      return;
    }

    // Add to batch for non-urgent messages
    await this.addToBatch(userId, subject, content, priority, leagueId, messageId);
  }

  /**
   * Send immediate notification
   */
  private async sendImmediateNotification(
    userId: string,
    subject: string,
    content: string,
    priority: "LOW" | "NORMAL" | "HIGH" | "URGENT",
    leagueId?: string
  ): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    if (!user) {
      throw new Error("User not found");
    }

    let leagueName = "openleague";
    if (leagueId) {
      const league = await prisma.league.findUnique({
        where: { id: leagueId },
        select: { name: true },
      });
      leagueName = league?.name || leagueName;
    }

    // Send email using existing templates
    await sendLeagueMessageEmail({
      recipients: [{ email: user.email, name: user.name, userId }],
      leagueName,
      senderName: "System",
      subject,
      content,
      priority,
      leagueId,
    });
  }

  /**
   * Add notification to batch for later delivery
   */
  private async addToBatch(
    userId: string,
    subject: string,
    content: string,
    priority: "LOW" | "NORMAL" | "HIGH" | "URGENT",
    leagueId?: string,
    messageId?: string
  ): Promise<void> {
    if (!leagueId) {
      // Can't batch notifications without a league context
      await this.sendImmediateNotification(userId, subject, content, priority);
      return;
    }

    // Calculate next batch delivery time (daily at 8 AM)
    const now = new Date();
    const scheduledAt = new Date();
    scheduledAt.setHours(8, 0, 0, 0); // 8 AM

    // If it's already past 8 AM today, schedule for tomorrow
    if (now.getHours() >= 8) {
      scheduledAt.setDate(scheduledAt.getDate() + 1);
    }

    // Find or create batch for this user and scheduled time
    let batch = await prisma.notificationBatch.findFirst({
      where: {
        userId,
        leagueId,
        scheduledAt,
        status: "PENDING",
      },
    });

    if (!batch) {
      batch = await prisma.notificationBatch.create({
        data: {
          userId,
          leagueId,
          scheduledAt,
          status: "PENDING",
        },
      });
    }

    // Add message to batch
    await prisma.batchedMessage.create({
      data: {
        batchId: batch.id,
        subject,
        content,
        priority,
        messageId,
      },
    });
  }

  /**
   * Process pending notification batches (should be called by cron job)
   */
  async processPendingBatches(): Promise<void> {
    const now = new Date();

    const pendingBatches = await prisma.notificationBatch.findMany({
      where: {
        status: "PENDING",
        scheduledAt: {
          lte: now,
        },
      },
      include: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
        league: {
          select: {
            name: true,
          },
        },
        messages: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    for (const batch of pendingBatches) {
      try {
        await this.sendBatchedNotifications(batch);

        // Mark batch as sent
        await prisma.notificationBatch.update({
          where: { id: batch.id },
          data: {
            status: "SENT",
            sentAt: new Date(),
          },
        });
      } catch (error) {
        console.error(`Failed to send batch ${batch.id}:`, error);
        // Batch will remain pending and be retried next time
      }
    }
  }

  /**
   * Send batched notifications as a digest email
   */
  private async sendBatchedNotifications(batch: {
    id: string;
    userId: string;
    leagueId: string;
    messages: Array<{ subject: string; content: string }>;
    user: { email: string; name: string | null };
    league: { name: string };
  }): Promise<void> {
    if (batch.messages.length === 0) {
      return;
    }

    const subject = `League Digest - ${batch.messages.length} updates from ${batch.league.name}`;

    let content = `Here's your daily digest of updates from ${batch.league.name}:\n\n`;

    batch.messages.forEach((message, index) => {
      content += `${index + 1}. ${message.subject}\n`;
      content += `${message.content}\n\n`;
      content += "---\n\n";
    });

    content += `You received this digest because you have batched delivery enabled for ${batch.league.name}. `;
    content += "You can change your notification preferences in your account settings.";

    await sendLeagueMessageEmail({
      recipients: [{ email: batch.user.email, name: batch.user.name, userId: batch.userId }],
      leagueName: batch.league.name,
      senderName: "League Digest",
      subject,
      content,
      priority: "NORMAL",
      leagueId: batch.leagueId,
    });
  }

  /**
   * Generate unsubscribe token for a user
   */
  async generateUnsubscribeToken(userId: string, leagueId?: string): Promise<string> {
    const token = randomBytes(32).toString("hex");

    await prisma.notificationPreference.upsert({
      where: {
        userId_leagueId: {
          userId,
          leagueId: leagueId ?? (null as unknown as string),
        },
      },
      update: {
        unsubscribeToken: token,
      },
      create: {
        userId,
        leagueId: leagueId ?? null,
        unsubscribeToken: token,
        // Default preferences
        leagueMessages: true,
        leagueAnnouncements: true,
        eventNotifications: true,
        rsvpReminders: true,
        teamInvitations: true,
        emailEnabled: true,
        urgentOnly: false,
        batchDelivery: false,
      },
    });

    return token;
  }

  /**
   * Handle unsubscribe request
   */
  async handleUnsubscribe(token: string): Promise<{ success: boolean; leagueName?: string }> {
    const preference = await prisma.notificationPreference.findUnique({
      where: { unsubscribeToken: token },
      include: {
        league: {
          select: { name: true },
        },
      },
    });

    if (!preference) {
      return { success: false };
    }

    // Disable all email notifications
    await prisma.notificationPreference.update({
      where: { id: preference.id },
      data: {
        emailEnabled: false,
        updatedAt: new Date(),
      },
    });

    return {
      success: true,
      leagueName: preference.league?.name,
    };
  }
}

// Export singleton instance
export const notificationService = new NotificationService();