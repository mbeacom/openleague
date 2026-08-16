import { prisma } from "@/lib/db/prisma";
import { queueGearOutboxForRecipients } from "@/lib/services/gear-outbox";

export type GearReminderResult = { dueSoon: number; overdue: number };

function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Materializes reminder rows, not email sends. The date in occurrenceKey makes
 * repeat cron invocations idempotent while allowing one overdue reminder per
 * calendar day until a reservation is returned.
 */
export async function queueGearCustodyReminders(now = new Date()): Promise<GearReminderResult> {
  const today = utcDay(now);
  const dueSoonEnd = new Date(today);
  dueSoonEnd.setUTCDate(dueSoonEnd.getUTCDate() + 3);
  const [dueSoon, overdue] = await Promise.all([
    prisma.gearReservation.findMany({
      where: {
        status: "FULFILLED",
        OR: [
          { approvedEndDate: { gte: today, lte: dueSoonEnd } },
          { approvedEndDate: null, requestedEndDate: { gte: today, lte: dueSoonEnd } },
        ],
      },
      select: { id: true, leagueId: true, teamId: true, requestedById: true, requestedEndDate: true, approvedEndDate: true },
    }),
    prisma.gearReservation.findMany({
      where: {
        status: "FULFILLED",
        OR: [
          { approvedEndDate: { lt: today } },
          { approvedEndDate: null, requestedEndDate: { lt: today } },
        ],
      },
      select: { id: true, leagueId: true, teamId: true, requestedById: true, requestedEndDate: true, approvedEndDate: true },
    }),
  ]);

  await prisma.$transaction(async (tx) => {
    for (const reservation of [...dueSoon, ...overdue]) {
      const teamAdmins = await tx.teamMember.findMany({
        where: { teamId: reservation.teamId, role: "ADMIN" },
        select: { userId: true },
      });
      const dueDate = reservation.approvedEndDate ?? reservation.requestedEndDate;
      const isOverdue = dueDate < today;
      const eventType = isOverdue ? "gear.reservation.overdue" : "gear.reservation.due_soon";
      const reminderDay = isOverdue ? today : dueDate;
      await queueGearOutboxForRecipients(tx, {
        leagueId: reservation.leagueId,
        eventType,
        aggregateType: "RESERVATION",
        aggregateId: reservation.id,
        occurrenceKey: `${eventType}:${reminderDay.toISOString().slice(0, 10)}`,
        payload: {
          kind: "GEAR_RESERVATION",
          data: { reservationId: reservation.id, dueDate: dueDate.toISOString().slice(0, 10) },
        },
      }, [
        ...teamAdmins.map((membership) => membership.userId),
        ...(reservation.requestedById ? [reservation.requestedById] : []),
      ]);
    }
  });

  return { dueSoon: dueSoon.length, overdue: overdue.length };
}
