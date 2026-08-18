import {
  NotificationOutboxStatus,
  type NotificationOutbox,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { notificationService } from "@/lib/services/notification";
import {
  ASSOCIATION_OPERATIONS_NOTIFICATION_EVENT_TYPES,
  parseAssociationOperationsNotificationEvent,
} from "@/lib/services/association-operations-notification-registry";
import {
  claimDueOutboxRows,
  recoverStaleOutboxLocks,
} from "@/lib/services/notification-outbox-lease";
import { sanitizeFailure } from "@/lib/services/gear-outbox-worker";

export const ASSOCIATION_OPERATIONS_OUTBOX_BATCH_SIZE = 50;
export const ASSOCIATION_OPERATIONS_OUTBOX_MAX_ATTEMPTS = 5;

export type AssociationOperationsOutboxRunResult = {
  claimed: number;
  sent: number;
  suppressed: number;
  retried: number;
  deadLettered: number;
  rejected: number;
  recoveredLocks: number;
};

export async function claimDueAssociationOperationsOutbox(
  limit = ASSOCIATION_OPERATIONS_OUTBOX_BATCH_SIZE,
  now = new Date(),
): Promise<NotificationOutbox[]> {
  return claimDueOutboxRows(
    ASSOCIATION_OPERATIONS_NOTIFICATION_EVENT_TYPES,
    limit,
    ASSOCIATION_OPERATIONS_OUTBOX_BATCH_SIZE,
    now,
  );
}

async function settle(
  row: NotificationOutbox,
  data: Parameters<typeof prisma.notificationOutbox.updateMany>[0]["data"],
): Promise<void> {
  await prisma.notificationOutbox.updateMany({
    where: {
      id: row.id,
      status: NotificationOutboxStatus.PROCESSING,
      lockedAt: row.lockedAt,
      eventType: {
        in: [...ASSOCIATION_OPERATIONS_NOTIFICATION_EVENT_TYPES],
      },
    },
    data,
  });
}

export async function processAssociationOperationsOutbox(
  limit = ASSOCIATION_OPERATIONS_OUTBOX_BATCH_SIZE,
): Promise<AssociationOperationsOutboxRunResult> {
  const now = new Date();
  const recoveredLocks = await recoverStaleOutboxLocks(
    ASSOCIATION_OPERATIONS_NOTIFICATION_EVENT_TYPES,
    now,
  );
  const rows = await claimDueAssociationOperationsOutbox(limit, now);
  const result: AssociationOperationsOutboxRunResult = {
    claimed: rows.length,
    sent: 0,
    suppressed: 0,
    retried: 0,
    deadLettered: 0,
    rejected: 0,
    recoveredLocks,
  };

  for (const row of rows) {
    const parsed = parseAssociationOperationsNotificationEvent({
      eventType: row.eventType,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      payload: row.payload,
    });
    if (!parsed.ok) {
      await settle(row, {
        status: NotificationOutboxStatus.FAILED,
        failedAt: new Date(),
        lockedAt: null,
        lastError: `undeliverable: ${parsed.diagnostic}`.slice(0, 300),
      });
      result.rejected += 1;
      result.deadLettered += 1;
      continue;
    }

    try {
      if (!row.recipientUserId || row.recipientRedactedAt) {
        await settle(row, {
          status: NotificationOutboxStatus.CANCELED,
          lockedAt: null,
          lastError: "suppressed: RECIPIENT_UNAVAILABLE",
        });
        result.suppressed += 1;
        continue;
      }

      const shouldReceive = await notificationService.shouldReceiveNotification(
        row.recipientUserId,
        "eventNotifications",
        parsed.event.priority,
        row.leagueId,
      );
      if (!shouldReceive) {
        await settle(row, {
          status: NotificationOutboxStatus.CANCELED,
          lockedAt: null,
          lastError: "suppressed: PREFERENCES",
        });
        result.suppressed += 1;
        continue;
      }

      await notificationService.sendOrBatchNotification(
        row.recipientUserId,
        parsed.event.subject,
        parsed.event.content,
        parsed.event.priority,
        "eventNotifications",
        row.leagueId,
      );
      await settle(row, {
        status: NotificationOutboxStatus.SENT,
        sentAt: new Date(),
        lockedAt: null,
        lastError: null,
      });
      result.sent += 1;
    } catch (error) {
      const deadLettered =
        row.attempts >= ASSOCIATION_OPERATIONS_OUTBOX_MAX_ATTEMPTS;
      await settle(
        row,
        deadLettered
          ? {
              status: NotificationOutboxStatus.FAILED,
              failedAt: new Date(),
              lockedAt: null,
              lastError: sanitizeFailure(error),
            }
          : {
              status: NotificationOutboxStatus.PENDING,
              scheduledAt: new Date(Date.now() + 60_000 * 2 ** row.attempts),
              lockedAt: null,
              lastError: sanitizeFailure(error),
            },
      );
      if (deadLettered) result.deadLettered += 1;
      else result.retried += 1;
    }
  }

  return result;
}
