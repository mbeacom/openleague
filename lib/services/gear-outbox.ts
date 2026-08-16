import type { Prisma } from "@prisma/client";
import type { GearNotificationPayload, NotificationRecipient } from "@/types/gear";
import { gearNotificationPayloadSchema } from "@/lib/utils/validation";

type GearTransaction = Prisma.TransactionClient;

export type GearOutboxEvent = {
  leagueId: string;
  eventType: string;
  /** Stable identifier for this specific occurrence, not merely its aggregate. */
  occurrenceKey: string;
  aggregateType: "NEED" | "PLEDGE" | "WISHLIST" | "RESERVATION" | "ALLOCATION";
  aggregateId: string;
  payload: GearNotificationPayload;
};

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Writes fully addressed outbox rows inside the caller's transaction. Email is
 * captured at enqueue time so delivery is independent of later account changes.
 */
export async function queueGearOutbox(
  tx: GearTransaction,
  event: GearOutboxEvent,
  recipients: readonly NotificationRecipient[],
): Promise<void> {
  const payload = gearNotificationPayloadSchema.parse(event.payload);
  const uniqueRecipients = new Map<string, NotificationRecipient>();
  for (const recipient of recipients) {
    const email = normalizedEmail(recipient.email);
    if (!email) continue;
    uniqueRecipients.set(recipient.userId ? `user:${recipient.userId}` : `email:${email}`, {
      email,
      userId: recipient.userId ?? null,
    });
  }
  if (uniqueRecipients.size === 0) return;

  await tx.notificationOutbox.createMany({
    data: [...uniqueRecipients.values()].map((recipient) => ({
      leagueId: event.leagueId,
      recipientUserId: recipient.userId ?? null,
      recipientEmail: recipient.email,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload,
      dedupeKey: `${event.eventType}:${event.aggregateId}:${event.occurrenceKey}:${recipient.userId ?? recipient.email}`,
    })),
    skipDuplicates: true,
  });
}

export async function queueGearOutboxForRecipients(
  tx: GearTransaction,
  event: GearOutboxEvent,
  recipientUserIds: readonly string[],
): Promise<void> {
  const recipientIds = [...new Set(recipientUserIds)];
  if (recipientIds.length === 0) return;

  const users = await tx.user.findMany({
    where: { id: { in: recipientIds } },
    select: { id: true, email: true },
  });
  await queueGearOutbox(tx, event, users.map((user) => ({
    userId: user.id,
    email: user.email,
  })));
}

/** Queues donor acknowledgement without placing donor contact data in payloads. */
export async function queueGearOutboxForEmail(
  tx: GearTransaction,
  event: GearOutboxEvent,
  email: string | null | undefined,
): Promise<void> {
  if (!email?.trim()) return;
  await queueGearOutbox(tx, event, [{ email }]);
}

/**
 * Queue an internal gear event for every league administrator while the
 * originating mutation is still transactional. Callers must provide a payload
 * that contains operational IDs and quantities only—never donor contact data.
 */
export async function queueGearOutboxForLeagueAdmins(
  tx: GearTransaction,
  event: GearOutboxEvent,
): Promise<void> {
  const administrators = await tx.leagueUser.findMany({
    where: { leagueId: event.leagueId, role: "LEAGUE_ADMIN" },
    select: { userId: true },
  });

  await queueGearOutboxForRecipients(tx, event, administrators.map(({ userId }) => userId));
}
