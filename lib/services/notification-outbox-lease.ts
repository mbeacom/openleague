import {
  NotificationOutboxStatus,
  type NotificationOutbox,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export const OUTBOX_STALE_LOCK_MS = 10 * 60 * 1_000;

export async function recoverStaleOutboxLocks(
  eventTypes: readonly string[],
  now = new Date(),
): Promise<number> {
  if (eventTypes.length === 0) return 0;
  const result = await prisma.notificationOutbox.updateMany({
    where: {
      eventType: { in: [...eventTypes] },
      status: NotificationOutboxStatus.PROCESSING,
      lockedAt: {
        lt: new Date(now.getTime() - OUTBOX_STALE_LOCK_MS),
      },
    },
    data: {
      status: NotificationOutboxStatus.PENDING,
      lockedAt: null,
      scheduledAt: now,
    },
  });
  return result.count;
}

export async function claimDueOutboxRows(
  eventTypes: readonly string[],
  limit: number,
  maxBatchSize: number,
  now = new Date(),
): Promise<NotificationOutbox[]> {
  if (eventTypes.length === 0) return [];
  const boundedLimit = Math.min(Math.max(1, limit), maxBatchSize);
  const candidates = await prisma.notificationOutbox.findMany({
    where: {
      eventType: { in: [...eventTypes] },
      status: NotificationOutboxStatus.PENDING,
      scheduledAt: { lte: now },
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    take: boundedLimit,
    select: { id: true },
  });

  const rows: NotificationOutbox[] = [];
  for (const candidate of candidates) {
    const claimed = await prisma.notificationOutbox.updateMany({
      where: {
        id: candidate.id,
        eventType: { in: [...eventTypes] },
        status: NotificationOutboxStatus.PENDING,
        scheduledAt: { lte: now },
      },
      data: {
        status: NotificationOutboxStatus.PROCESSING,
        lockedAt: now,
        lastAttemptAt: now,
        attempts: { increment: 1 },
      },
    });
    if (claimed.count !== 1) continue;
    const row = await prisma.notificationOutbox.findUnique({
      where: { id: candidate.id },
    });
    if (row) rows.push(row);
  }
  return rows;
}
