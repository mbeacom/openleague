import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { sendGearNotificationEmail, sendLeagueMessageEmail } from "@/lib/email/templates";
import {
  gearNotificationDefinition,
  type GearNotificationEvent,
  type GearNotificationPriority,
} from "@/lib/services/gear-notification-registry";
import { randomBytes } from "crypto";

export interface NotificationPreferences {
  leagueMessages: boolean;
  leagueAnnouncements: boolean;
  eventNotifications: boolean;
  rsvpReminders: boolean;
  teamInvitations: boolean;
  practicePlanNotifications: boolean;
  gearNotifications: boolean;
  emailEnabled: boolean;
  urgentOnly: boolean;
  batchDelivery: boolean;
}

export type NotificationPreferenceSource = "LEAGUE" | "GLOBAL" | "DEFAULT";

export interface ResolvedNotificationPreferences extends NotificationPreferences {
  source: NotificationPreferenceSource;
  hasLeagueOverride: boolean;
}

const defaultNotificationPreferences: NotificationPreferences = {
  leagueMessages: true,
  leagueAnnouncements: true,
  eventNotifications: true,
  rsvpReminders: true,
  teamInvitations: true,
  practicePlanNotifications: true,
  gearNotifications: true,
  emailEnabled: true,
  urgentOnly: false,
  batchDelivery: false,
};

function toNotificationPreferences(preferences: NotificationPreferences): NotificationPreferences {
  return {
    leagueMessages: preferences.leagueMessages,
    leagueAnnouncements: preferences.leagueAnnouncements,
    eventNotifications: preferences.eventNotifications,
    rsvpReminders: preferences.rsvpReminders,
    teamInvitations: preferences.teamInvitations,
    practicePlanNotifications: preferences.practicePlanNotifications,
    gearNotifications: preferences.gearNotifications,
    emailEnabled: preferences.emailEnabled,
    urgentOnly: preferences.urgentOnly,
    batchDelivery: preferences.batchDelivery,
  };
}

/** The addressee captured on the outbox row when the event was produced. */
/**
 * How the row was addressed *at enqueue time*. This is deliberately explicit
 * rather than inferred from `userId`, because `NotificationOutbox.recipientUser`
 * is `onDelete: SetNull`: deleting an account silently nulls `recipientUserId`
 * while the captured `recipientEmail` survives. Inferring "no account" from a
 * null id would therefore reclassify a deleted member as an anonymous external
 * donor and send them the snapshot address — the one thing that must not happen.
 */
export type GearNotificationAddressing = "ACCOUNT" | "EXTERNAL";

export type GearNotificationRecipient =
  | {
      /** Enqueued against a league account. */
      addressing: "ACCOUNT";
      /** Null once the account is deleted; the row survives with its captured email. */
      userId: string | null;
      /** False when the account no longer exists. Delivery is then terminal. */
      accountFound: boolean;
      email: string | null;
      name?: string | null;
      /** Set by the account-redaction path; a redacted row must never be delivered. */
      redactedAt: Date | null;
    }
  | {
      /**
       * Enqueued against a bare address that never had an account — a public
       * in-kind donor receiving a pledge acknowledgement they asked for.
       */
      addressing: "EXTERNAL";
      email: string | null;
      name?: string | null;
      redactedAt: Date | null;
    };

/** The outbox row's identity, so delivery can be correlated and de-duplicated. */
export interface GearNotificationIdempotency {
  outboxId: string;
  leagueId: string;
  /** Stable per (recipient, event occurrence); unique with leagueId. */
  dedupeKey: string;
  /** Distinguishes the first attempt from a retry of the same occurrence. */
  attempt: number;
  occurredAt: Date;
}

export interface GearNotificationDeliveryInput {
  recipient: GearNotificationRecipient;
  event: GearNotificationEvent;
  idempotency: GearNotificationIdempotency;
}

export type GearNotificationSuppressionReason =
  | "RECIPIENT_REDACTED"
  | "RECIPIENT_UNAVAILABLE"
  | "EMAIL_DISABLED"
  | "CATEGORY_DISABLED"
  | "URGENT_ONLY";

/**
 * Honest delivery outcomes. `DELIVERED` means a provider accepted the message;
 * `DEFERRED` means it is durably queued into a digest that has not been sent
 * yet; `SUPPRESSED` means it will never be sent, and why. Nothing here is
 * retryable — a retryable failure throws instead.
 */
export type GearNotificationDeliveryOutcome =
  | { status: "DELIVERED"; channel: "EMAIL"; detail: string | null }
  | { status: "DEFERRED"; channel: "DIGEST"; detail: string }
  | {
      status: "SUPPRESSED";
      channel: "NONE";
      reason: GearNotificationSuppressionReason;
      detail: string;
    };

function suppressed(
  reason: GearNotificationSuppressionReason,
  detail: string,
): GearNotificationDeliveryOutcome {
  return { status: "SUPPRESSED", channel: "NONE", reason, detail };
}

/**
 * Takes the full priority union rather than one event's narrowed literal, so
 * adding an `URGENT` gear event later does not silently change this rule.
 */
function bypassesDigest(priority: GearNotificationPriority): boolean {
  return priority === "URGENT" || priority === "HIGH";
}

export class NotificationService {
  /**
   * League rows override a global row. If neither exists, defaults are used.
   * This is the single resolver used by delivery workers and account settings.
   */
  async resolveNotificationPreferences(
    userId: string,
    leagueId?: string,
  ): Promise<ResolvedNotificationPreferences> {
    const rows = await prisma.notificationPreference.findMany({
      where: leagueId === undefined
        ? { userId, leagueId: null }
        : { userId, OR: [{ leagueId }, { leagueId: null }] },
    });
    const league = leagueId === undefined ? undefined : rows.find((row) => row.leagueId === leagueId);
    const global = rows.find((row) => row.leagueId === null);
    if (league) {
      return { ...toNotificationPreferences(league), source: "LEAGUE", hasLeagueOverride: true };
    }
    if (global) {
      return { ...toNotificationPreferences(global), source: "GLOBAL", hasLeagueOverride: false };
    }
    return { ...defaultNotificationPreferences, source: "DEFAULT", hasLeagueOverride: false };
  }

  /**
   * Returns the effective preferences without creating a synthetic override.
   */
  async getNotificationPreferences(
    userId: string,
    leagueId?: string
  ): Promise<NotificationPreferences> {
    return await this.resolveNotificationPreferences(userId, leagueId);
  }

  /**
   * Update notification preferences for a user
   */
  async updateNotificationPreferences(
    userId: string,
    preferences: Partial<NotificationPreferences>,
    leagueId?: string
  ): Promise<void> {
    // Global scope (leagueId=null) cannot use upsert: leagueId is nullable and
    // part of the @@unique constraint, and Prisma rejects null in the compound-
    // unique `where` input (PrismaClientValidationError at query build). Only the
    // league-scoped path — where leagueId is a real string — is upsert-safe.
    if (leagueId === undefined) {
      await this.upsertGlobalPreference(userId, {
        ...preferences,
        updatedAt: new Date(),
      });
      return;
    }

    const existingLeaguePreference = await prisma.notificationPreference.findFirst({
      where: { userId, leagueId },
      select: { id: true },
    });
    const inherited = existingLeaguePreference
      ? undefined
      : await this.resolveNotificationPreferences(userId, leagueId);

    await prisma.notificationPreference.upsert({
      where: {
        userId_leagueId: { userId, leagueId },
      },
      update: {
        ...preferences,
        updatedAt: new Date(),
      },
      create: {
        userId,
        leagueId,
        unsubscribeToken: randomBytes(32).toString("hex"),
        // A first league override must preserve every resolved global choice;
        // Prisma schema defaults would silently re-enable global opt-outs.
        ...(inherited ? toNotificationPreferences(inherited) : defaultNotificationPreferences),
        ...preferences,
      },
    });
  }

  /**
   * Find-then-write upsert for the user's global (leagueId=null) preference row.
   * Used where prisma.upsert() cannot be: null in a compound-unique `where`.
   */
  private async upsertGlobalPreference(
    userId: string,
    data: Partial<NotificationPreferences> & { updatedAt?: Date; unsubscribeToken?: string }
  ): Promise<void> {
    const existing = await prisma.notificationPreference.findFirst({
      where: { userId, leagueId: null },
      select: { id: true },
    });

    if (existing) {
      await prisma.notificationPreference.update({ where: { id: existing.id }, data });
      return;
    }

    try {
      await prisma.notificationPreference.create({
        data: {
          ...data,
          userId,
          leagueId: null,
          unsubscribeToken: data.unsubscribeToken ?? randomBytes(32).toString("hex"),
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const concurrent = await prisma.notificationPreference.findFirst({
        where: { userId, leagueId: null },
        select: { id: true },
      });
      if (!concurrent) throw error;
      await prisma.notificationPreference.update({ where: { id: concurrent.id }, data });
    }
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

  /** Adds an already-durable domain notification to the existing daily digest. */
  async queueDigestNotification(
    userId: string,
    leagueId: string,
    subject: string,
    content: string,
    priority: "LOW" | "NORMAL" | "HIGH" | "URGENT",
  ): Promise<void> {
    await this.addToBatch(userId, subject, content, priority, leagueId);
  }

  /**
   * Delivers one durable gear notification.
   *
   * This is the *only* place where gear delivery policy lives: preference
   * resolution, urgent-only and category gating, digest batching, and the
   * choice of provider are all decided here. The outbox worker owns claiming,
   * retries and status transitions and nothing else, so the two concerns can be
   * reasoned about — and tested — separately.
   *
   * Returns an honest outcome rather than a boolean: callers can tell a real
   * send apart from a digest deferral apart from a deliberate suppression, and
   * record that distinction durably. Infrastructure failures (provider errors,
   * database errors) throw, because those are retryable and the worker owns
   * retry policy.
   */
  async deliverGearNotification(
    input: GearNotificationDeliveryInput,
  ): Promise<GearNotificationDeliveryOutcome> {
    const { recipient, event, idempotency } = input;

    if (recipient.redactedAt) {
      return suppressed("RECIPIENT_REDACTED", "recipient contact details were redacted before delivery");
    }
    if (!recipient.email) {
      return suppressed("RECIPIENT_UNAVAILABLE", "no deliverable address remains for this recipient");
    }

    // Dispatch on the enqueue-time discriminant, never on whether a user id is
    // still present. A deleted member is `ACCOUNT` with a null id and therefore
    // cannot reach the external branch at all; that is the property that keeps
    // their captured address from being emailed as if they were a donor.
    if (recipient.addressing === "EXTERNAL") {
      // No account means no preference row to consult; the donor supplied this
      // address for exactly this transactional reply, so it is sent directly.
      await sendGearNotificationEmail({
        email: recipient.email,
        name: recipient.name ?? null,
        leagueId: idempotency.leagueId,
        copy: gearNotificationDefinition(event.type).email,
      });
      return { status: "DELIVERED", channel: "EMAIL", detail: "sent to unauthenticated recipient" };
    }

    // A row addressed to an account outlives that account: the FK is nulled on
    // delete and the captured address remains. Delivering it would send league
    // activity to someone who left, so this is terminal and never retried.
    const { userId } = recipient;
    if (!userId || !recipient.accountFound) {
      return suppressed("RECIPIENT_UNAVAILABLE", "the addressed account no longer exists");
    }

    const preferences = await this.resolveNotificationPreferences(userId, idempotency.leagueId);

    if (!preferences.emailEnabled) {
      return suppressed("EMAIL_DISABLED", "recipient disabled email notifications");
    }
    if (!preferences.gearNotifications) {
      return suppressed("CATEGORY_DISABLED", "recipient disabled gear notifications");
    }
    const isUrgent = bypassesDigest(event.priority);
    if (preferences.urgentOnly && !isUrgent) {
      return suppressed("URGENT_ONLY", "recipient receives urgent notifications only");
    }

    const definition = gearNotificationDefinition(event.type);

    if (preferences.batchDelivery && !isUrgent) {
      await this.queueDigestNotification(
        userId,
        idempotency.leagueId,
        definition.digest.subject,
        definition.digest.content,
        event.priority,
      );
      return {
        status: "DEFERRED",
        channel: "DIGEST",
        detail: "queued into the recipient's daily digest",
      };
    }

    await sendGearNotificationEmail({
      email: recipient.email,
      name: recipient.name ?? null,
      leagueId: idempotency.leagueId,
      copy: definition.email,
    });
    return { status: "DELIVERED", channel: "EMAIL", detail: null };
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

    // Global scope cannot use upsert (null in a compound-unique `where`); see
    // updateNotificationPreferences. Defaults below match a fresh row's schema
    // defaults and only apply on create.
    if (leagueId === undefined) {
      await this.upsertGlobalPreference(userId, { unsubscribeToken: token });
      return token;
    }

    await prisma.notificationPreference.upsert({
      where: {
        userId_leagueId: { userId, leagueId },
      },
      update: {
        unsubscribeToken: token,
      },
      create: {
        userId,
        leagueId,
        unsubscribeToken: token,
      },
    });

    return token;
  }

  /**
   * Batch generate unsubscribe tokens for multiple users
   * Optimized to avoid N+1 query problem when sending emails to many recipients
   */
  async batchGenerateUnsubscribeTokens(
    userIds: string[],
    leagueId?: string
  ): Promise<Map<string, string>> {
    if (userIds.length === 0) {
      return new Map();
    }

    // Fetch existing preferences in a single query
    const existingPreferences = await prisma.notificationPreference.findMany({
      where: {
        userId: { in: userIds },
        leagueId: leagueId ?? null,
      },
      select: {
        userId: true,
        unsubscribeToken: true,
      },
    });

    // Create a map of existing tokens
    const tokenMap = new Map<string, string>();
    const existingUserIds = new Set<string>();

    for (const pref of existingPreferences) {
      if (pref.unsubscribeToken) {
        tokenMap.set(pref.userId, pref.unsubscribeToken);
        existingUserIds.add(pref.userId);
      }
    }

    // Find users without tokens and generate new ones
    const usersNeedingTokens = userIds.filter(id => !existingUserIds.has(id));

    if (usersNeedingTokens.length > 0) {
      // Generate new tokens
      const newTokens = usersNeedingTokens.map(userId => ({
        userId,
        token: randomBytes(32).toString("hex"),
      }));

      // Batch create new preferences
      const createData = newTokens.map(({ userId, token }) => ({
        userId,
        leagueId: leagueId ?? null,
        unsubscribeToken: token,
        // Default preferences
        leagueMessages: true,
        leagueAnnouncements: true,
        eventNotifications: true,
        rsvpReminders: true,
        teamInvitations: true,
        practicePlanNotifications: true,
        emailEnabled: true,
        urgentOnly: false,
        batchDelivery: false,
      }));

      // Use createMany for batch insert (ignores duplicates with skipDuplicates)
      await prisma.notificationPreference.createMany({
        data: createData,
        skipDuplicates: true,
      });

      // Add new tokens to the map
      for (const { userId, token } of newTokens) {
        tokenMap.set(userId, token);
      }
    }

    // Handle users who had preferences but no tokens (update them)
    const usersWithPrefsButNoTokens = existingPreferences
      .filter(pref => !pref.unsubscribeToken)
      .map(pref => pref.userId);

    if (usersWithPrefsButNoTokens.length > 0) {
      // Generate and update tokens for these users
      for (const userId of usersWithPrefsButNoTokens) {
        const token = randomBytes(32).toString("hex");

        await prisma.notificationPreference.updateMany({
          where: {
            userId,
            leagueId: leagueId ?? null,
          },
          data: {
            unsubscribeToken: token,
          },
        });

        tokenMap.set(userId, token);
      }
    }

    return tokenMap;
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