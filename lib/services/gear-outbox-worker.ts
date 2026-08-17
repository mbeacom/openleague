import { NotificationOutboxStatus, type NotificationOutbox } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  parseGearNotificationEvent,
} from "@/lib/services/gear-notification-registry";
import { addressingFromDedupeKey } from "@/lib/services/gear-recipient-identity";
import { notificationService, type GearNotificationAddressing } from "@/lib/services/notification";

export const GEAR_OUTBOX_BATCH_SIZE = 50;
export const GEAR_OUTBOX_MAX_ATTEMPTS = 5;
const STALE_LOCK_MS = 10 * 60 * 1_000;
const GEAR_EVENT_TYPE_FILTER = { startsWith: "gear." } as const;

/** A pending backlog older than this means delivery is not keeping up. */
export const GEAR_OUTBOX_BACKLOG_AGE_MS = 30 * 60 * 1_000;
/** A pending depth above this means one cron slice can no longer drain it. */
export const GEAR_OUTBOX_BACKLOG_DEPTH = GEAR_OUTBOX_BATCH_SIZE * 10;

export type GearOutboxRunResult = {
  claimed: number;
  /** Handed to a provider or durably queued into a digest. */
  sent: number;
  /** Subset of `sent` that went to a digest rather than an inbox. */
  digested: number;
  retried: number;
  deadLettered: number;
  /** Deliberately not delivered (preferences, redaction, missing recipient). */
  suppressed: number;
  /** Subset of `deadLettered` rejected for violating the event registry contract. */
  rejected: number;
  /** Left pending so an earlier event for the same recipient+aggregate lands first. */
  skippedForOrdering: number;
  recoveredLocks: number;
};

function retryDelayMs(attempts: number): number {
  return Math.min(60 * 60 * 1_000, 60 * 1_000 * 2 ** Math.max(0, attempts - 1));
}

/**
 * Strips anything that could identify or contact a recipient from a provider or
 * database error before it is persisted to `lastError`, returned to operators
 * and written to audit rows.
 *
 * The address pattern deliberately does not require a dotted domain: provider
 * errors quote internal and malformed addresses too, and a partial match here
 * would persist exactly the contact data the outbox is meant to stop retaining.
 */
export function sanitizeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "Notification delivery failed";
  return message
    .replace(/[^\s@<>()[\]{}",;:]+@[^\s@<>()[\]{}",;]+/g, "[redacted]")
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
      eventType: GEAR_EVENT_TYPE_FILTER,
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

type OrderingCandidate = Pick<
  NotificationOutbox,
  "id" | "leagueId" | "aggregateType" | "aggregateId" | "recipientUserId" | "recipientEmail" | "eventType" | "createdAt"
>;

/**
 * The ordering domain: one recipient's view of one aggregate. Events are only
 * ordered relative to each other inside a domain — a wishlist archive has no
 * ordering relationship with an unrelated team's overdue gear, and forcing one
 * would serialize an entire league behind a single stuck row.
 */
function orderingKey(row: OrderingCandidate): string {
  const recipient = row.recipientUserId ? `user:${row.recipientUserId}` : `email:${row.recipientEmail}`;
  return `${row.leagueId}|${recipient}|${row.aggregateType}|${row.aggregateId}`;
}

function recipientMatch(row: OrderingCandidate) {
  return row.recipientUserId
    ? { recipientUserId: row.recipientUserId }
    : { recipientUserId: null, recipientEmail: row.recipientEmail };
}

/**
 * Whether a row was addressed to an account or to a bare address, decided from
 * the dedupe key rather than from `recipientUserId`.
 *
 * `recipientUserId` cannot answer this: the relation is `onDelete: SetNull`, so
 * deleting an account rewrites the row to look exactly like a donor who never
 * had one while the captured address survives. Trusting the id would reclassify
 * a departed member as an anonymous external recipient and send them that
 * snapshot. The dedupe key's identity segment is written at enqueue time and is
 * unaffected by the deletion.
 *
 * Ambiguity resolves to `ACCOUNT`, which suppresses rather than sends.
 */
function addressingOf(
  row: Pick<NotificationOutbox, "dedupeKey" | "recipientEmail">,
): GearNotificationAddressing {
  return addressingFromDedupeKey(row.dedupeKey, row.recipientEmail);
}

/**
 * True when an earlier event in the same ordering domain has not reached a
 * terminal state yet — including one waiting out a retry backoff. Delivering
 * past it would tell a recipient gear was returned before it was picked up.
 */
async function hasUnfinishedPredecessor(row: OrderingCandidate): Promise<boolean> {
  const predecessor = await prisma.notificationOutbox.findFirst({
    where: {
      id: { not: row.id },
      eventType: GEAR_EVENT_TYPE_FILTER,
      leagueId: row.leagueId,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      ...recipientMatch(row),
      status: { in: [NotificationOutboxStatus.PENDING, NotificationOutboxStatus.PROCESSING] },
      createdAt: { lt: row.createdAt },
    },
    select: { id: true },
  });
  return predecessor !== null;
}

export type GearOutboxClaim = {
  rows: NotificationOutbox[];
  skippedForOrdering: number;
};

/**
 * Claims due messages one row at a time with a status compare-and-set. Prisma
 * cannot express SKIP LOCKED portably here; this is safe under concurrent cron
 * invocations because only the worker whose update changes one row owns it.
 *
 * At most one message per ordering domain is claimed per run, and a message
 * whose predecessor is still in flight is left pending, so a recipient never
 * sees two events for the same aggregate out of order. Skipped rows are not
 * mutated — a later run picks them up once their predecessor settles.
 */
export async function claimDueGearOutbox(
  limit = GEAR_OUTBOX_BATCH_SIZE,
  now = new Date(),
): Promise<GearOutboxClaim> {
  const boundedLimit = Math.min(Math.max(1, limit), GEAR_OUTBOX_BATCH_SIZE);
  const candidates = await prisma.notificationOutbox.findMany({
    where: {
      eventType: GEAR_EVENT_TYPE_FILTER,
      status: NotificationOutboxStatus.PENDING,
      scheduledAt: { lte: now },
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    take: boundedLimit * 3,
    select: {
      id: true,
      leagueId: true,
      aggregateType: true,
      aggregateId: true,
      recipientUserId: true,
      recipientEmail: true,
      eventType: true,
      createdAt: true,
    },
  });

  const rows: NotificationOutbox[] = [];
  const claimedDomains = new Set<string>();
  let skippedForOrdering = 0;

  for (const candidate of candidates) {
    if (rows.length === boundedLimit) break;

    const domain = orderingKey(candidate);
    if (claimedDomains.has(domain)) {
      skippedForOrdering += 1;
      continue;
    }
    if (await hasUnfinishedPredecessor(candidate)) {
      skippedForOrdering += 1;
      continue;
    }

    const updated = await prisma.notificationOutbox.updateMany({
      where: {
        id: candidate.id,
        eventType: GEAR_EVENT_TYPE_FILTER,
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
    if (row) {
      rows.push(row);
      claimedDomains.add(domain);
    }
  }

  return { rows, skippedForOrdering };
}

async function markSent(row: NotificationOutbox, now: Date, detail: string | null = null): Promise<void> {
  await prisma.notificationOutbox.updateMany({
    where: {
      id: row.id,
      eventType: GEAR_EVENT_TYPE_FILTER,
      status: NotificationOutboxStatus.PROCESSING,
      lockedAt: row.lockedAt,
    },
    data: {
      status: NotificationOutboxStatus.SENT,
      sentAt: now,
      lockedAt: null,
      lastError: detail,
    },
  });
}

/**
 * A deliberate non-delivery is `CANCELED`, not `SENT`. Recording a suppression
 * as a send makes every downstream count — dashboards, backlog checks, the
 * dead-letter runbook — quietly wrong about what recipients actually received.
 */
async function markSuppressed(row: NotificationOutbox, reason: string): Promise<void> {
  await prisma.notificationOutbox.updateMany({
    where: {
      id: row.id,
      eventType: GEAR_EVENT_TYPE_FILTER,
      status: NotificationOutboxStatus.PROCESSING,
      lockedAt: row.lockedAt,
    },
    data: {
      status: NotificationOutboxStatus.CANCELED,
      lockedAt: null,
      lastError: `suppressed: ${reason}`.slice(0, 300),
    },
  });
}

/**
 * A row whose event is not in the registry, or whose payload no longer matches
 * it, can never succeed. Retrying it five times only delays the operator's
 * discovery, so it dead-letters on the first attempt carrying a diagnostic that
 * names the contract it broke.
 */
async function markContractViolation(
  row: NotificationOutbox,
  reason: string,
  diagnostic: string,
  now: Date,
): Promise<void> {
  await prisma.notificationOutbox.updateMany({
    where: {
      id: row.id,
      eventType: GEAR_EVENT_TYPE_FILTER,
      status: NotificationOutboxStatus.PROCESSING,
      lockedAt: row.lockedAt,
    },
    data: {
      status: NotificationOutboxStatus.FAILED,
      failedAt: now,
      lockedAt: null,
      lastError: `undeliverable (${reason}): ${diagnostic}`.slice(0, 300),
    },
  });
}

async function markFailure(row: NotificationOutbox, error: unknown, now: Date): Promise<"retry" | "dead-letter"> {
  const deadLetter = row.attempts >= GEAR_OUTBOX_MAX_ATTEMPTS;
  const result = await prisma.notificationOutbox.updateMany({
    where: {
      id: row.id,
      eventType: GEAR_EVENT_TYPE_FILTER,
      status: NotificationOutboxStatus.PROCESSING,
      lockedAt: row.lockedAt,
    },
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

/**
 * Claims and delivers one batch. The worker owns claiming, ordering, retries
 * and status transitions; every question about *whether and how* a recipient
 * hears about an event belongs to `NotificationService`.
 */
export async function processGearOutbox(limit = GEAR_OUTBOX_BATCH_SIZE): Promise<GearOutboxRunResult> {
  const now = new Date();
  const recoveredLocks = await recoverStaleGearOutboxLocks(now);
  const { rows, skippedForOrdering } = await claimDueGearOutbox(limit, now);
  const result: GearOutboxRunResult = {
    claimed: rows.length,
    sent: 0,
    digested: 0,
    retried: 0,
    deadLettered: 0,
    suppressed: 0,
    rejected: 0,
    skippedForOrdering,
    recoveredLocks,
  };

  for (const row of rows) {
    try {
      const parsed = parseGearNotificationEvent({
        eventType: row.eventType,
        aggregateType: row.aggregateType,
        aggregateId: row.aggregateId,
        payload: row.payload,
      });
      if (!parsed.ok) {
        await markContractViolation(row, parsed.reason, parsed.diagnostic, new Date());
        result.rejected += 1;
        result.deadLettered += 1;
        console.error("Gear outbox rejected an undeliverable message", {
          outboxId: row.id,
          eventType: row.eventType,
          reason: parsed.reason,
        });
        continue;
      }

      const addressing = addressingOf(row);
      // Only an account-addressed row has an id worth resolving; an external
      // row has no account to look up and no stored display name.
      const account = addressing === "ACCOUNT" && row.recipientUserId
        ? await prisma.user.findUnique({
            where: { id: row.recipientUserId },
            select: { name: true },
          })
        : null;

      const outcome = await notificationService.deliverGearNotification({
        recipient: addressing === "ACCOUNT"
          ? {
              addressing: "ACCOUNT",
              userId: row.recipientUserId,
              accountFound: account !== null,
              // The captured address is the target of record: it survives a
              // later account email change, which is the point of the outbox.
              // It does not survive deletion — see `accountFound`.
              email: row.recipientEmail,
              name: account?.name ?? null,
              redactedAt: row.recipientRedactedAt,
            }
          : {
              addressing: "EXTERNAL",
              email: row.recipientEmail,
              name: null,
              redactedAt: row.recipientRedactedAt,
            },
        event: parsed.event,
        idempotency: {
          outboxId: row.id,
          leagueId: row.leagueId,
          dedupeKey: row.dedupeKey,
          attempt: row.attempts,
          occurredAt: row.createdAt,
        },
      });

      if (outcome.status === "SUPPRESSED") {
        await markSuppressed(row, outcome.reason);
        result.suppressed += 1;
        continue;
      }

      await markSent(row, new Date(), outcome.detail);
      result.sent += 1;
      if (outcome.status === "DEFERRED") result.digested += 1;
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

export type GearOutboxHealth = {
  pending: number;
  processing: number;
  deadLettered: number;
  oldestPendingAgeMs: number | null;
  /** True when the queue needs an operator; see docs/GEAR_NOTIFICATIONS.md. */
  backlogged: boolean;
};

/**
 * A cheap snapshot for the cron response and for alerting. Delivery counts on
 * their own cannot distinguish "nothing to do" from "falling behind"; the age
 * of the oldest due row can.
 */
export async function getGearOutboxHealth(now = new Date()): Promise<GearOutboxHealth> {
  const [pending, processing, deadLettered, oldest] = await Promise.all([
    prisma.notificationOutbox.count({ where: { eventType: GEAR_EVENT_TYPE_FILTER, status: NotificationOutboxStatus.PENDING } }),
    prisma.notificationOutbox.count({ where: { eventType: GEAR_EVENT_TYPE_FILTER, status: NotificationOutboxStatus.PROCESSING } }),
    prisma.notificationOutbox.count({ where: { eventType: GEAR_EVENT_TYPE_FILTER, status: NotificationOutboxStatus.FAILED } }),
    prisma.notificationOutbox.findFirst({
      where: { eventType: GEAR_EVENT_TYPE_FILTER, status: NotificationOutboxStatus.PENDING, scheduledAt: { lte: now } },
      orderBy: { scheduledAt: "asc" },
      select: { scheduledAt: true },
    }),
  ]);

  const oldestPendingAgeMs = oldest ? Math.max(0, now.getTime() - oldest.scheduledAt.getTime()) : null;
  return {
    pending,
    processing,
    deadLettered,
    oldestPendingAgeMs,
    backlogged:
      pending > GEAR_OUTBOX_BACKLOG_DEPTH
      || (oldestPendingAgeMs !== null && oldestPendingAgeMs > GEAR_OUTBOX_BACKLOG_AGE_MS),
  };
}
