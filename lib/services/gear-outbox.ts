import type { Prisma } from "@prisma/client";

type GearTransaction = Prisma.TransactionClient;

export type GearOutboxEvent = {
  leagueId: string;
  eventType: string;
  aggregateType: "NEED" | "PLEDGE" | "WISHLIST";
  aggregateId: string;
  payload: Prisma.InputJsonValue;
};

export async function queueGearOutboxForRecipients(
  tx: GearTransaction,
  event: GearOutboxEvent,
  recipientUserIds: readonly string[],
): Promise<void> {
  const recipientIds = [...new Set(recipientUserIds)];
  if (recipientIds.length === 0) return;

  await tx.notificationOutbox.createMany({
    data: recipientIds.map((recipientUserId) => ({
      leagueId: event.leagueId,
      recipientUserId,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload,
      dedupeKey: `${event.eventType}:${event.aggregateId}:${recipientUserId}`,
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
