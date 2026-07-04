import { Prisma } from "@prisma/client";
import type { prisma } from "@/lib/db/prisma";

/**
 * Shared slot-capacity primitives for signup events. Mirrors the proven 003
 * schedule-block capacity engine, re-scoped to per-slot counting with waitlist
 * offers included as committed spots.
 */

export type PrismaClientLike = Prisma.TransactionClient | typeof prisma;

/** PENDING_PAYMENT registrations only hold a spot for this long. */
export const EVENT_HOLD_WINDOW_MS = 30 * 60 * 1000;

/** Thrown inside the reservation transaction when a slot is at capacity. */
export class SlotCapacityError extends Error {
  constructor(public readonly remaining: number) {
    super("Slot at capacity");
    this.name = "SlotCapacityError";
  }
}

/** True for Prisma serialization/write-conflict failures worth surfacing as "try again". */
export function isSerializationError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2034" || error.code === "P2028")
  );
}

/**
 * Count spots committed to a slot: CONFIRMED, actively-held PENDING_PAYMENT
 * (inside the hold window), and un-expired OFFERED waitlist promotions. Lazy
 * expiry: lapsed holds/offers stop counting even before the cron sweep flips
 * their status.
 *
 * PENDING_PAYMENT holds count when EITHER the row was created inside the hold
 * window (fresh registrations) OR `offerExpiresAt` is in the future — claimed
 * waitlist offers re-use their original row (whose `createdAt` is the waitlist
 * join time, long past), so their payment-hold deadline lives in
 * `offerExpiresAt` instead.
 */
export async function countCommittedSlotSpots(
  client: PrismaClientLike,
  slotId: string,
  excludeRegistrationId?: string
): Promise<number> {
  const now = new Date();
  const holdCutoff = new Date(now.getTime() - EVENT_HOLD_WINDOW_MS);
  return client.eventRegistration.count({
    where: {
      slotId,
      id: excludeRegistrationId ? { not: excludeRegistrationId } : undefined,
      OR: [
        { status: "CONFIRMED" },
        {
          status: "PENDING_PAYMENT",
          OR: [{ createdAt: { gte: holdCutoff } }, { offerExpiresAt: { gt: now } }],
        },
        { status: "OFFERED", offerExpiresAt: { gt: now } },
      ],
    },
  });
}
