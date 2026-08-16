import { NotificationOutboxStatus, type NotificationOutbox } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { sendGearNotificationEmail } from "@/lib/email/templates";

export const GEAR_OUTBOX_BATCH_SIZE = 50;
export const GEAR_OUTBOX_MAX_ATTEMPTS = 5;
const STALE_LOCK_MS = 10 * 60 * 1_000;

export type GearOutboxRunResult = {
  claimed: number;
  sent: number;
  retried: number;
  deadLettered: number;
  suppressed: number;
  recoveredLocks: number;
};

function retryDelayMs(attempts: number): number {
  return Math.min(60 * 60 * 1_000, 60 * 1_000 * 2 ** Math.max(0, attempts - 1));
}

function sanitizeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "Notification delivery failed";
  return message
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[redacted]")
    .replace(/\b[a-f0-9]{24,}\b/gi, "[redacted]")
    .slice(0, 300);
}

/**
 * Returns any messages held by a worker that stopped before it could complete.
 * Claiming remains compare-and-set, so recovering a lock never takes a message
 * currently owned by an active worker.
 */
export async function recoverStaleGearOutboxLocks(now = new Date()): Promise<number> {
  const staleBefore = new Date(now.getTime() - STALE_LOCK_MS);
  const result = await prisma.notificationOutbox.updateMany({
    where: {
      status: NotificationOutboxStatus.PROCESSING,
      lockedAt: { lt: staleBefore },
    },
    data: {
      status: NotificationOutboxStatus.PENDING,
      lockedAt: null,
      scheduledAt: now,
    },
  });
  return result.count;
}

/**
 * Claims due messages one row at a time with a status compare-and-set. Prisma
 * cannot express SKIP LOCKED portably here; this is safe under concurrent cron
 * invocations because only the worker whose update changes one row owns it.
 */
export async function claimDueGearOutbox(
  limit = GEAR_OUTBOX_BATCH_SIZE,
  now = new Date(),
): Promise<NotificationOutbox[]> {
  const boundedLimit = Math.min(Math.max(1, limit), GEAR_OUTBOX_BATCH_SIZE);
  const candidates = await prisma.notificationOutbox.findMany({
    where: {
      status: NotificationOutboxStatus.PENDING,
      scheduledAt: { lte: now },
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    take: boundedLimit * 3,
    select: { id: true },
  });

  const claimed: NotificationOutbox[] = [];
  for (const candidate of candidates) {
    if (claimed.length === boundedLimit) break;
    const updated = await prisma.notificationOutbox.updateMany({
      where: {
        id: candidate.id,
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
    if (updated.count !== 1) continue;

    const row = await prisma.notificationOutbox.findUnique({ where: { id: candidate.id } });
    if (row) claimed.push(row);
  }
  return claimed;
}

async function recipientFor(row: NotificationOutbox): Promise<{
  email: string;
  name: string | null;
  shouldSend: boolean;
}> {
  if (row.recipientEmail) {
    return { email: row.recipientEmail, name: null, shouldSend: true };
  }
  if (!row.recipientUserId) {
    throw new Error("Outbox recipient is missing");
  }

  const user = await prisma.user.findUnique({
    where: { id: row.recipientUserId },
    select: {
      email: true,
      name: true,
    },
  });
  if (!user) throw new Error("Outbox recipient is unavailable");

  const preferences = await prisma.notificationPreference.findMany({
    where: {
      userId: row.recipientUserId,
      OR: [{ leagueId: row.leagueId }, { leagueId: null }],
    },
    select: { leagueId: true, emailEnabled: true, gearNotifications: true },
  });
  const scoped = preferences.find((preference) => preference.leagueId === row.leagueId);
  const global = preferences.find((preference) => preference.leagueId === null);
  const preference = scoped ?? global;
  return {
    email: user.email,
    name: user.name,
    shouldSend: preference ? preference.emailEnabled && preference.gearNotifications : true,
  };
}

async function markSent(row: NotificationOutbox, now: Date, suppressed = false): Promise<void> {
  await prisma.notificationOutbox.updateMany({
    where: { id: row.id, status: NotificationOutboxStatus.PROCESSING, lockedAt: row.lockedAt },
    data: {
      status: NotificationOutboxStatus.SENT,
      sentAt: now,
      lockedAt: null,
      lastError: suppressed ? "suppressed by notification preference" : null,
    },
  });
}

async function markFailure(row: NotificationOutbox, error: unknown, now: Date): Promise<"retry" | "dead-letter"> {
  const deadLetter = row.attempts >= GEAR_OUTBOX_MAX_ATTEMPTS;
  const result = await prisma.notificationOutbox.updateMany({
    where: { id: row.id, status: NotificationOutboxStatus.PROCESSING, lockedAt: row.lockedAt },
    data: deadLetter
      ? {
          status: NotificationOutboxStatus.FAILED,
          failedAt: now,
          lockedAt: null,
          lastError: sanitizeFailure(error),
        }
      : {
          status: NotificationOutboxStatus.PENDING,
          scheduledAt: new Date(now.getTime() + retryDelayMs(row.attempts)),
          lockedAt: null,
          lastError: sanitizeFailure(error),
        },
  });
  if (result.count === 0) return "retry";
  return deadLetter ? "dead-letter" : "retry";
}

export async function processGearOutbox(limit = GEAR_OUTBOX_BATCH_SIZE): Promise<GearOutboxRunResult> {
  const now = new Date();
  const recoveredLocks = await recoverStaleGearOutboxLocks(now);
  const rows = await claimDueGearOutbox(limit, now);
  const result: GearOutboxRunResult = {
    claimed: rows.length,
    sent: 0,
    retried: 0,
    deadLettered: 0,
    suppressed: 0,
    recoveredLocks,
  };

  for (const row of rows) {
    try {
      const recipient = await recipientFor(row);
      if (!recipient.shouldSend) {
        await markSent(row, new Date(), true);
        result.suppressed += 1;
        continue;
      }
      await sendGearNotificationEmail({
        email: recipient.email,
        name: recipient.name,
        leagueId: row.leagueId,
        eventType: row.eventType,
        payload: row.payload,
      });
      await markSent(row, new Date());
      result.sent += 1;
    } catch (error) {
      const outcome = await markFailure(row, error, new Date());
      if (outcome === "dead-letter") result.deadLettered += 1;
      else result.retried += 1;
      console.error("Gear outbox delivery failed", {
        outboxId: row.id,
        eventType: row.eventType,
        attempts: row.attempts,
      });
    }
  }
  return result;
}
