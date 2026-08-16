import type { Prisma } from "@prisma/client";
import type { GearNotificationPayload } from "@/types/gear";
import { gearNotificationPayloadSchema } from "@/lib/utils/validation";

type GearTransaction = Prisma.TransactionClient;

export type GearOutboxEvent = {
  leagueId: string;
  eventType: string;
  /** Stable identifier for this specific occurrence, not merely its aggregate. */
  occurrenceKey: string;
  aggregateType: "NEED" | "PLEDGE" | "WISHLIST";
  aggregateId: string;
  payload: GearNotificationPayload;
};

export async function queueGearOutboxForRecipients(
  tx: GearTransaction,
  event: GearOutboxEvent,
  recipientUserIds: readonly string[],
): Promise<void> {
  const recipientIds = [...new Set(recipientUserIds)];
  if (recipientIds.length === 0) return;

  const recipients = await tx.user.findMany({
    where: { id: { in: recipientIds } },
    select: { id: true, email: true },
  });
  const payload = gearNotificationPayloadSchema.parse(event.payload);
  await tx.notificationOutbox.createMany({
    data: recipients.map((recipient) => ({
      leagueId: event.leagueId,
      recipientUserId: recipient.id,
      recipientEmail: recipient.email,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload,
      dedupeKey: `${event.eventType}:${event.aggregateId}:${event.occurrenceKey}:${recipient.id}`,
    })),
    skipDuplicates: true,
  });
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
