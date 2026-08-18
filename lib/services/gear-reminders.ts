import { NotificationOutboxStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { queueGearOutboxForRecipients } from "@/lib/services/gear-outbox";

/** Reservations read per database round trip. */
export const GEAR_REMINDER_PAGE_SIZE = 100;
/** Reservations a single run will process before deferring the rest. */
export const GEAR_REMINDER_BUDGET = 500;
/** Pending reminder rows re-examined for staleness per run. */
export const GEAR_REMINDER_CANCEL_LIMIT = 500;
const CUSTODY_REMINDER_SWEEP_ID = "custody-reminders";

export type GearReminderResult = {
  dueSoon: number;
  overdue: number;
  /** Reservations whose reminder could not be queued; the run continued. */
  failed: number;
  scanned: number;
  /** True when the budget was exhausted before the backlog was. */
  truncated: boolean;
};

export type GearReminderCancellationResult = {
  inspected: number;
  canceled: number;
};

const CUSTODY_REMINDER_EVENTS = ["gear.reservation.due_soon", "gear.reservation.overdue"] as const;
type CustodyReminderEvent = (typeof CUSTODY_REMINDER_EVENTS)[number];

function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function payloadDueDate(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const data = (payload as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  const dueDate = (data as { dueDate?: unknown }).dueDate;
  return typeof dueDate === "string" ? dueDate : null;
}

/**
 * Materializes reminder rows, not email sends. The date in occurrenceKey makes
 * repeat cron invocations idempotent while allowing one overdue reminder per
 * calendar day until a reservation is returned.
 *
 * The scan is paged and budgeted: overdue reservations stay overdue until
 * somebody returns the gear, so the candidate set only grows, and an unbounded
 * `findMany` would eventually read an entire league's history into memory on
 * every cron tick. Each reservation is queued in its own transaction so one bad
 * row — a deleted team, a constraint violation — costs that one reminder rather
 * than every reminder behind it.
 */
export async function queueGearCustodyReminders(now = new Date()): Promise<GearReminderResult> {
  const today = utcDay(now);
  const dueSoonEnd = new Date(today);
  dueSoonEnd.setUTCDate(dueSoonEnd.getUTCDate() + 3);

  const result: GearReminderResult = {
    dueSoon: 0,
    overdue: 0,
    failed: 0,
    scanned: 0,
    truncated: false,
  };

  // A durable, optimistic cursor gives later reservations a turn on the next
  // cron run instead of repeatedly spending the budget on the earliest rows.
  const sweep = await prisma.gearReminderSweep.upsert({
    where: { id: CUSTODY_REMINDER_SWEEP_ID },
    create: { id: CUSTODY_REMINDER_SWEEP_ID },
    update: {},
    select: { cursorId: true, version: true },
  });
  let cursor = sweep.cursorId ?? undefined;
  let nextCursor: string | null = sweep.cursorId;

  const persistSweep = async (cursorId: string | null) => {
    await prisma.gearReminderSweep.updateMany({
      where: { id: CUSTODY_REMINDER_SWEEP_ID, version: sweep.version },
      data: { cursorId, version: { increment: 1 } },
    });
  };

  while (result.scanned < GEAR_REMINDER_BUDGET) {
    const take = Math.min(GEAR_REMINDER_PAGE_SIZE, GEAR_REMINDER_BUDGET - result.scanned);
    const page = await prisma.gearReservation.findMany({
      where: {
        status: "FULFILLED",
        custodyStartedAt: { not: null },
        OR: [
          { approvedEndDate: { lte: dueSoonEnd } },
          { approvedEndDate: null, requestedEndDate: { lte: dueSoonEnd } },
        ],
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: {
        id: true,
        leagueId: true,
        teamId: true,
        requestedById: true,
        requestedEndDate: true,
        approvedEndDate: true,
      },
      orderBy: { id: "asc" },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (page.length === 0) {
      // We reached the end of this pass. Reset only with the version captured at
      // the start so concurrent runs cannot move a newer cursor backwards.
      if (sweep.cursorId) await persistSweep(null);
      return result;
    }

    for (const reservation of page) {
      result.scanned += 1;
      const dueDate = reservation.approvedEndDate ?? reservation.requestedEndDate;
      const isOverdue = dueDate < today;
      const eventType: CustodyReminderEvent = isOverdue
        ? "gear.reservation.overdue"
        : "gear.reservation.due_soon";
      const reminderDay = isOverdue ? today : dueDate;

      try {
        await prisma.$transaction(async (tx) => {
          const teamAdmins = await tx.teamMember.findMany({
            where: { teamId: reservation.teamId, role: "ADMIN" },
            select: { userId: true },
          });
          await queueGearOutboxForRecipients(tx, {
            leagueId: reservation.leagueId,
            eventType,
            aggregateType: "RESERVATION",
            aggregateId: reservation.id,
            occurrenceKey: `${eventType}:${isoDay(reminderDay)}`,
            payload: {
              kind: "GEAR_RESERVATION",
              data: { reservationId: reservation.id, dueDate: isoDay(dueDate) },
            },
          }, [
            ...teamAdmins.map((membership) => membership.userId),
            ...(reservation.requestedById ? [reservation.requestedById] : []),
          ]);
        });
        if (isOverdue) result.overdue += 1;
        else result.dueSoon += 1;
      } catch (error) {
        result.failed += 1;
        console.error("Gear custody reminder could not be queued", {
          reservationId: reservation.id,
          eventType,
          error: error instanceof Error ? error.message : "unknown error",
        });
      }
    }

    cursor = page[page.length - 1]?.id;
    nextCursor = cursor;
    if (page.length < take) {
      await persistSweep(null);
      return result;
    }
  }

  // The budget ran out with candidates left; persist the forward position for
  // the next run. A lost optimistic update is harmless: all occurrences are
  // still idempotent and a later sweep will revisit them.
  await persistSweep(nextCursor);
  result.truncated = true;
  return result;
}

/**
 * Cancels custody reminders that were queued for a state the reservation is no
 * longer in — gear returned, dates changed, or a due-soon notice overtaken by
 * an overdue one.
 *
 * Only `PENDING` rows are eligible, via compare-and-set: a row a worker already
 * claimed, sent, or dead-lettered is left exactly as it is, because canceling a
 * message that has already reached somebody's inbox only makes the record lie.
 */
export async function cancelStaleGearCustodyReminders(
  now = new Date(),
): Promise<GearReminderCancellationResult> {
  const today = utcDay(now);
  const pending = await prisma.notificationOutbox.findMany({
    where: {
      status: NotificationOutboxStatus.PENDING,
      aggregateType: "RESERVATION",
      eventType: { in: [...CUSTODY_REMINDER_EVENTS] },
    },
    select: { id: true, eventType: true, aggregateId: true, payload: true },
    orderBy: { createdAt: "asc" },
    take: GEAR_REMINDER_CANCEL_LIMIT,
  });

  if (pending.length === 0) return { inspected: 0, canceled: 0 };

  const reservations = await prisma.gearReservation.findMany({
    where: { id: { in: [...new Set(pending.map((row) => row.aggregateId))] } },
    select: {
      id: true,
      status: true,
      custodyStartedAt: true,
      requestedEndDate: true,
      approvedEndDate: true,
    },
  });
  const byId = new Map(reservations.map((reservation) => [reservation.id, reservation]));

  let canceled = 0;
  for (const row of pending) {
    const reservation = byId.get(row.aggregateId);
    let reason: string | null = null;

    if (!reservation) {
      reason = "reservation no longer exists";
    } else if (reservation.status !== "FULFILLED" || !reservation.custodyStartedAt) {
      reason = `reservation is ${reservation.status.toLowerCase()}, no gear is in custody`;
    } else {
      const dueDate = reservation.approvedEndDate ?? reservation.requestedEndDate;
      const isOverdue = dueDate < today;
      if (payloadDueDate(row.payload) !== isoDay(dueDate)) {
        reason = "reservation due date changed";
      } else if (row.eventType === "gear.reservation.due_soon" && isOverdue) {
        reason = "superseded by an overdue reminder";
      } else if (row.eventType === "gear.reservation.overdue" && !isOverdue) {
        reason = "reservation is no longer overdue";
      }
    }

    if (!reason) continue;

    const updated = await prisma.notificationOutbox.updateMany({
      where: { id: row.id, status: NotificationOutboxStatus.PENDING },
      data: {
        status: NotificationOutboxStatus.CANCELED,
        lockedAt: null,
        lastError: `canceled: ${reason}`.slice(0, 300),
      },
    });
    canceled += updated.count;
  }

  return { inspected: pending.length, canceled };
}
