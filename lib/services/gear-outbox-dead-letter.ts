import { NotificationOutboxStatus, type NotificationOutbox } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireLeagueRole } from "@/lib/auth/session";
import { parseGearNotificationEvent } from "@/lib/services/gear-notification-registry";
import { GEAR_OUTBOX_MAX_ATTEMPTS } from "@/lib/services/gear-outbox-worker";
import { maskDedupeKeyForDisplay } from "@/lib/services/gear-recipient-identity";

/**
 * Operator tooling for the gear notification dead-letter queue.
 *
 * A dead letter is a message a recipient was supposed to receive and did not.
 * Reading or resending one is therefore an administrative action over other
 * people's mail: every entry point here authorizes against the league that owns
 * the message and writes an audit record, and inspection masks addresses so a
 * routine queue review is not a way to harvest a league's contact list.
 */

export const GEAR_DEAD_LETTER_PAGE_SIZE = 50;
export const GEAR_DEAD_LETTER_MAX_REDRIVE = 100;

export type GearDeadLetterAuditAction =
  | "gear.outbox.dead_letter.inspected"
  | "gear.outbox.dead_letter.redriven"
  | "gear.outbox.dead_letter.replayed";

export type GearDeadLetter = {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  /** Masked; the full address is deliberately not returned to an inspector. */
  recipient: string;
  recipientUserId: string | null;
  attempts: number;
  /** Attempts already burned against the retry budget, for triage at a glance. */
  attemptsRemaining: number;
  lastError: string | null;
  lastAttemptAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
  /** Whether this message could ever succeed if resent unchanged. */
  deliverable: boolean;
  contractViolation: string | null;
};

export type GearDeadLetterPage = {
  entries: GearDeadLetter[];
  total: number;
  /** Dead letters that fail the registry contract and must not be redriven. */
  undeliverable: number;
};

export type GearRedriveOutcome =
  | "REDRIVEN"
  | "NOT_FOUND"
  | "NOT_DEAD_LETTERED"
  | "UNDELIVERABLE_CONTRACT";

export type GearRedriveResult = {
  redriven: number;
  outcomes: Array<{ id: string; outcome: GearRedriveOutcome; detail?: string }>;
};

export type GearReplayResult = {
  replayedFrom: string;
  outboxId: string;
  /**
   * Masked for display. A key written by the current enqueue path carries an
   * opaque identity and is returned verbatim; one inherited from a legacy row
   * may still embed the recipient's address, which must not leave the service.
   */
  dedupeKey: string;
};

/** `a***@example.com` — enough to recognize a recipient, not enough to contact them. */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const head = local.slice(0, 1);
  return `${head}${"*".repeat(Math.max(2, local.length - 1))}@${domain}`;
}

function contractStatus(row: Pick<NotificationOutbox, "eventType" | "aggregateType" | "aggregateId" | "payload">) {
  const parsed = parseGearNotificationEvent({
    eventType: row.eventType,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    payload: row.payload,
  });
  return parsed.ok
    ? { deliverable: true, contractViolation: null }
    : { deliverable: false, contractViolation: `${parsed.reason}: ${parsed.diagnostic}` };
}

async function recordAudit(input: {
  action: GearDeadLetterAuditAction;
  userId: string;
  leagueId: string;
  resourceId?: string;
  details: Record<string, unknown>;
  severity?: "info" | "warning";
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        userId: input.userId,
        leagueId: input.leagueId,
        resourceId: input.resourceId ?? null,
        resourceType: "notification_outbox",
        details: input.details as never,
        severity: input.severity ?? "info",
      },
    });
  } catch (error) {
    // Losing the audit row must not undo a completed operator action, but a
    // silent loss would be worse: it is surfaced in the server log instead.
    console.error("Failed to record gear dead-letter audit entry", {
      action: input.action,
      leagueId: input.leagueId,
      error: error instanceof Error ? error.message : "unknown error",
    });
  }
}

/**
 * Lists dead-lettered gear notifications for one league, newest failure first,
 * annotated with whether resending them could ever work.
 */
export async function inspectGearDeadLetters(input: {
  leagueId: string;
  limit?: number;
  cursor?: string;
}): Promise<GearDeadLetterPage> {
  const userId = await requireLeagueRole(input.leagueId, "LEAGUE_ADMIN");
  const take = Math.min(Math.max(1, input.limit ?? GEAR_DEAD_LETTER_PAGE_SIZE), GEAR_DEAD_LETTER_PAGE_SIZE);

  const where = {
    leagueId: input.leagueId,
    status: NotificationOutboxStatus.FAILED,
    eventType: { startsWith: "gear." },
  };

  const [rows, total] = await Promise.all([
    prisma.notificationOutbox.findMany({
      where,
      orderBy: [{ failedAt: "desc" }, { createdAt: "desc" }],
      take,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    }),
    prisma.notificationOutbox.count({ where }),
  ]);

  const entries = rows.map((row) => {
    const contract = contractStatus(row);
    return {
      id: row.id,
      eventType: row.eventType,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      recipient: maskEmail(row.recipientEmail),
      recipientUserId: row.recipientUserId,
      attempts: row.attempts,
      attemptsRemaining: Math.max(0, GEAR_OUTBOX_MAX_ATTEMPTS - row.attempts),
      lastError: row.lastError,
      lastAttemptAt: row.lastAttemptAt,
      failedAt: row.failedAt,
      createdAt: row.createdAt,
      ...contract,
    };
  });

  await recordAudit({
    action: "gear.outbox.dead_letter.inspected",
    userId,
    leagueId: input.leagueId,
    details: { returned: entries.length, total },
  });

  return {
    entries,
    total,
    undeliverable: entries.filter((entry) => !entry.deliverable).length,
  };
}

/**
 * Returns dead letters to the queue for another delivery attempt.
 *
 * The attempt counter is reset so the redriven message gets a full retry budget
 * against whatever was fixed, while `lastError` is preserved and the prior
 * attempt count is written to the audit log — the history of why a message
 * failed outlives the decision to try again.
 *
 * Messages that violate the event registry are refused rather than requeued:
 * they would fail again on the first attempt, and the queue would learn nothing.
 */
export async function redriveGearDeadLetters(input: {
  leagueId: string;
  outboxIds: readonly string[];
  reason?: string;
  now?: Date;
}): Promise<GearRedriveResult> {
  const userId = await requireLeagueRole(input.leagueId, "LEAGUE_ADMIN");
  const now = input.now ?? new Date();
  const ids = [...new Set(input.outboxIds)].slice(0, GEAR_DEAD_LETTER_MAX_REDRIVE);

  const outcomes: GearRedriveResult["outcomes"] = [];
  let redriven = 0;

  // Scoped by leagueId so an id from another league reads as NOT_FOUND rather
  // than confirming a message exists somewhere the caller cannot administer.
  const rows = await prisma.notificationOutbox.findMany({
    where: { id: { in: ids }, leagueId: input.leagueId },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      outcomes.push({ id, outcome: "NOT_FOUND" });
      continue;
    }
    if (row.status !== NotificationOutboxStatus.FAILED) {
      outcomes.push({ id, outcome: "NOT_DEAD_LETTERED", detail: row.status });
      continue;
    }
    const contract = contractStatus(row);
    if (!contract.deliverable) {
      outcomes.push({ id, outcome: "UNDELIVERABLE_CONTRACT", detail: contract.contractViolation ?? undefined });
      continue;
    }

    const updated = await prisma.notificationOutbox.updateMany({
      where: { id, status: NotificationOutboxStatus.FAILED },
      data: {
        status: NotificationOutboxStatus.PENDING,
        scheduledAt: now,
        attempts: 0,
        lockedAt: null,
        failedAt: null,
      },
    });
    if (updated.count !== 1) {
      outcomes.push({ id, outcome: "NOT_DEAD_LETTERED", detail: "changed concurrently" });
      continue;
    }

    redriven += 1;
    outcomes.push({ id, outcome: "REDRIVEN" });
    await recordAudit({
      action: "gear.outbox.dead_letter.redriven",
      userId,
      leagueId: input.leagueId,
      resourceId: id,
      severity: "warning",
      details: {
        eventType: row.eventType,
        aggregateId: row.aggregateId,
        previousAttempts: row.attempts,
        previousError: row.lastError,
        failedAt: row.failedAt,
        reason: input.reason ?? null,
      },
    });
  }

  return { redriven, outcomes };
}

/**
 * Re-sends a message that already reached a terminal state, as a *new* outbox
 * row.
 *
 * A replay is not a retry: the original occurrence keeps its record and its
 * dedupe key, and the copy gets a `replay:<n>` suffix so the at-most-one-row-per
 * -occurrence guarantee still holds and a second replay cannot silently
 * collapse into the first.
 */
export async function replayGearNotification(input: {
  leagueId: string;
  outboxId: string;
  reason: string;
  now?: Date;
}): Promise<GearReplayResult> {
  const userId = await requireLeagueRole(input.leagueId, "LEAGUE_ADMIN");
  const now = input.now ?? new Date();

  const source = await prisma.notificationOutbox.findFirst({
    where: { id: input.outboxId, leagueId: input.leagueId },
  });
  if (!source) throw new Error("Notification not found in this league");

  const contract = contractStatus(source);
  if (!contract.deliverable) {
    throw new Error(`Notification cannot be replayed: ${contract.contractViolation}`);
  }

  const priorReplays = await prisma.notificationOutbox.count({
    where: { leagueId: input.leagueId, dedupeKey: { startsWith: `${source.dedupeKey}:replay:` } },
  });
  const dedupeKey = `${source.dedupeKey}:replay:${priorReplays + 1}`;

  const replay = await prisma.notificationOutbox.create({
    data: {
      leagueId: source.leagueId,
      recipientUserId: source.recipientUserId,
      recipientEmail: source.recipientEmail,
      eventType: source.eventType,
      aggregateType: source.aggregateType,
      aggregateId: source.aggregateId,
      payload: source.payload as never,
      dedupeKey,
      scheduledAt: now,
      status: NotificationOutboxStatus.PENDING,
    },
    select: { id: true },
  });

  await recordAudit({
    action: "gear.outbox.dead_letter.replayed",
    userId,
    leagueId: input.leagueId,
    resourceId: replay.id,
    severity: "warning",
    details: {
      replayedFrom: source.id,
      eventType: source.eventType,
      aggregateId: source.aggregateId,
      sourceStatus: source.status,
      sourceAttempts: source.attempts,
      sourceError: source.lastError,
      reason: input.reason,
    },
  });

  return { replayedFrom: source.id, outboxId: replay.id, dedupeKey: maskDedupeKeyForDisplay(dedupeKey) };
}
