import { prisma } from "@/lib/db/prisma";
import { queueGearOutboxForRecipients } from "@/lib/services/gear-outbox";

export type GearReminderResult = { dueSoon: number; overdue: number };

function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Materializes reminder rows, not email sends. The date in aggregateId makes
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
        requestedEndDate: { gte: today, lte: dueSoonEnd },
      },
      select: { id: true, leagueId: true, teamId: true, requestedById: true, requestedEndDate: true },
    }),
    prisma.gearReservation.findMany({
      where: {
        status: "FULFILLED",
        requestedEndDate: { lt: today },
      },
      select: { id: true, leagueId: true, teamId: true, requestedById: true, requestedEndDate: true },
    }),
  ]);

  await prisma.$transaction(async (tx) => {
    for (const reservation of [...dueSoon, ...overdue]) {
      const teamAdmins = await tx.teamMember.findMany({
        where: { teamId: reservation.teamId, role: "ADMIN" },
        select: { userId: true },
      });
      const isOverdue = reservation.requestedEndDate < today;
      const eventType = isOverdue ? "gear.reservation.overdue" : "gear.reservation.due_soon";
      const reminderDay = isOverdue ? today : reservation.requestedEndDate;
      await queueGearOutboxForRecipients(tx, {
        leagueId: reservation.leagueId,
        eventType,
        aggregateType: "RESERVATION",
        aggregateId: `${reservation.id}:${reminderDay.toISOString().slice(0, 10)}`,
        payload: { reservationId: reservation.id, dueDate: reservation.requestedEndDate.toISOString().slice(0, 10) },
      }, [
        ...teamAdmins.map((membership) => membership.userId),
        ...(reservation.requestedById ? [reservation.requestedById] : []),
      ]);
    }
  });

  return { dueSoon: dueSoon.length, overdue: overdue.length };
}
