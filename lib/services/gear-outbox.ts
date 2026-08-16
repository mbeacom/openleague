import type { Prisma } from "@prisma/client";
import type { GearNotificationPayload, NotificationRecipient } from "@/types/gear";
import { assertGearNotificationEvent } from "@/lib/services/gear-notification-registry";
import {
  normalizeRecipientEmail,
  recipientIdentitySegment,
} from "@/lib/services/gear-recipient-identity";

type GearTransaction = Prisma.TransactionClient;

export type GearOutboxEvent = {
  leagueId: string;
  /**
   * Must name an entry in the gear notification registry. This stays `string`
   * rather than the registry's union because producers compose it from a status
   * (`gear.need.${status.toLowerCase()}`); the constraint is therefore enforced
   * at runtime, inside the producer's own transaction, where a violation rolls
   * the mutation back instead of persisting a message nobody can deliver.
   */
  eventType: string;
  /** Stable identifier for this specific occurrence, not merely its aggregate. */
  occurrenceKey: string;
  aggregateType: "NEED" | "PLEDGE" | "WISHLIST" | "RESERVATION" | "ALLOCATION";
  aggregateId: string;
  payload: GearNotificationPayload;
};

function normalizedEmail(email: string): string {
  return normalizeRecipientEmail(email);
}

/**
 * Writes fully addressed outbox rows inside the caller's transaction. Email is
 * captured at enqueue time so delivery is independent of later account changes.
 *
 * The dedupe key names the recipient by account id or, for recipients without
 * one, by keyed digest — never by address. See `gear-recipient-identity`.
 */
export async function queueGearOutbox(
  tx: GearTransaction,
  event: GearOutboxEvent,
  recipients: readonly NotificationRecipient[],
): Promise<void> {
  // Validate against the same registry the worker reads, so a contract break is
  // a failed mutation now rather than a dead-lettered message hours later.
  const validated = assertGearNotificationEvent({
    eventType: event.eventType,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    payload: event.payload,
  });
  const payload = validated.payload;

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
      dedupeKey: `${event.eventType}:${event.aggregateId}:${event.occurrenceKey}:${recipientIdentitySegment(recipient)}`,
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
