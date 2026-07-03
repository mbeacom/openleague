import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { EVENT_WAITLIST_CLAIM_HOURS } from "@/lib/env";
import { countCommittedSlotSpots, isSerializationError } from "@/lib/utils/event-capacity";
import { resolvePhaseEligibility, type PhaseForEligibility } from "@/lib/utils/event-phases";
import { sendWaitlistOfferEmail } from "@/lib/email/templates";
import { formatDateTime } from "@/lib/utils/date";

/**
 * Waitlist promotion (research R5). Offers spots to eligible WAITLISTED
 * entries in FIFO order whenever capacity frees up: synchronously after
 * cancels/removals/capacity increases, and from the 10-minute cron sweep
 * (offer expiry + phase-open backfill). Correctness never depends on the
 * cron — expired offers stop counting as committed spots lazily.
 */

const MAX_PROMOTIONS_PER_SWEEP = 50;

type PromotedEntry = {
  registrationId: string;
  registrantEmail: string;
  participantName: string;
  slotName: string;
  eventId: string;
  eventTitle: string;
  offerExpiresAt: Date;
};

function computeOfferExpiry(eventStartAt: Date, now: Date): Date {
  const claim = new Date(now.getTime() + EVENT_WAITLIST_CLAIM_HOURS * 60 * 60 * 1000);
  return claim < eventStartAt ? claim : eventStartAt;
}

/**
 * Promote the next eligible waitlisted entries for a slot, up to the slot's
 * free capacity. Each promotion runs in its own Serializable transaction so
 * it cannot race concurrent registrations into overselling. Returns the
 * number of offers issued. Offer emails are sent best-effort after commit.
 */
export async function promoteNextWaitlistEntriesForSlot(slotId: string): Promise<number> {
  const slot = await prisma.signupSlot.findUnique({
    where: { id: slotId },
    select: {
      id: true,
      name: true,
      capacity: true,
      waitlistEnabled: true,
      event: {
        select: {
          id: true,
          title: true,
          status: true,
          startAt: true,
          registrationClosesAt: true,
          hostOrganizationId: true,
          hostLeagueId: true,
          hostTeamId: true,
          phases: {
            select: {
              id: true,
              name: true,
              opensAt: true,
              audience: true,
              divisions: { select: { id: true } },
              teams: { select: { id: true } },
            },
          },
        },
      },
    },
  });
  if (!slot || !slot.event) return 0;

  const { event } = slot;
  const now = new Date();
  if (event.status !== "PUBLISHED") return 0;
  if (now >= event.startAt) return 0;
  if (event.registrationClosesAt && now > event.registrationClosesAt) return 0;

  const promoted: PromotedEntry[] = [];
  const eligibilityCache = new Map<string, boolean>();

  for (let i = 0; i < MAX_PROMOTIONS_PER_SWEEP; i += 1) {
    let entry: PromotedEntry | null = null;
    try {
      entry = await prisma.$transaction(
        async (tx) => {
          if (slot.capacity != null) {
            const committed = await countCommittedSlotSpots(tx, slot.id);
            if (committed >= slot.capacity) {
              return null;
            }
          }

          const candidates = await tx.eventRegistration.findMany({
            where: { slotId: slot.id, status: "WAITLISTED" },
            orderBy: { waitlistJoinedAt: "asc" },
            take: 20,
            select: {
              id: true,
              participantName: true,
              registrantId: true,
              registrant: { select: { email: true } },
            },
          });

          for (const candidate of candidates) {
            let eligible = eligibilityCache.get(candidate.registrantId);
            if (eligible === undefined) {
              eligible = (
                await resolvePhaseEligibility(
                  tx,
                  { ...event, phases: event.phases as PhaseForEligibility[] },
                  candidate.registrantId,
                  now
                )
              ).eligibleNow;
              eligibilityCache.set(candidate.registrantId, eligible);
            }
            if (!eligible) continue;

            const offerExpiresAt = computeOfferExpiry(event.startAt, now);
            const claimed = await tx.eventRegistration.updateMany({
              where: { id: candidate.id, status: "WAITLISTED" },
              data: { status: "OFFERED", offerExpiresAt },
            });
            if (claimed.count === 1) {
              return {
                registrationId: candidate.id,
                registrantEmail: candidate.registrant.email,
                participantName: candidate.participantName,
                slotName: slot.name,
                eventId: event.id,
                eventTitle: event.title,
                offerExpiresAt,
              };
            }
          }
          return null;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (error) {
      if (isSerializationError(error)) {
        // Concurrent registration traffic won the race — the next sweep retries.
        break;
      }
      throw error;
    }

    if (!entry) break;
    promoted.push(entry);
  }

  // Notifications are best-effort; a mail failure must not undo the offers.
  for (const entry of promoted) {
    try {
      await sendWaitlistOfferEmail({
        to: entry.registrantEmail,
        participantName: entry.participantName,
        eventTitle: entry.eventTitle,
        slotName: entry.slotName,
        claimByFormatted: formatDateTime(entry.offerExpiresAt),
        eventId: entry.eventId,
      });
    } catch (emailError) {
      console.error("Failed to send waitlist offer email:", emailError);
    }
  }

  return promoted.length;
}

/**
 * Cron sweep: expire lapsed offers, then run promotion for every slot that
 * still has waitlisted entries on published, upcoming events (this also
 * covers phase-open backfill). Returns counts for observability.
 */
export async function sweepEventWaitlists(): Promise<{ expired: number; offered: number }> {
  const now = new Date();

  const expired = await prisma.eventRegistration.updateMany({
    where: { status: "OFFERED", offerExpiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });

  const slots = await prisma.signupSlot.findMany({
    where: {
      registrations: { some: { status: "WAITLISTED" } },
      event: {
        status: "PUBLISHED",
        startAt: { gt: now },
      },
    },
    select: { id: true },
    take: 200,
  });

  let offered = 0;
  for (const slot of slots) {
    offered += await promoteNextWaitlistEntriesForSlot(slot.id);
  }

  return { expired: expired.count, offered };
}
