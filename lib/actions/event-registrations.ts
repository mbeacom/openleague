"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireEventManager, requireUserId } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/actions/venue-organizations";
import {
  eventRegistrationSchema,
  eventRegistrationCommandSchema,
  setEventCheckInSchema,
  removeEventRegistrationSchema,
  setManualPaymentStatusSchema,
  refundEventRegistrationSchema,
  type EventRegistrationInput,
  type EventRegistrationCommandInput,
  type SetEventCheckInInput,
  type RemoveEventRegistrationInput,
  type SetManualPaymentStatusInput,
  type RefundEventRegistrationInput,
} from "@/lib/utils/validation";
import {
  countCommittedSlotSpots,
  isSerializationError,
  SlotCapacityError,
} from "@/lib/utils/event-capacity";
import { canViewSignupEvent } from "@/lib/utils/event-access";
import { resolvePhaseEligibility } from "@/lib/utils/event-phases";
import { promoteNextWaitlistEntriesForSlot } from "@/lib/utils/event-waitlist";
import { logSignupEventActivity } from "@/lib/utils/event-activity";
import { formatDateTime } from "@/lib/utils/date";
import { EVENT_WAITLIST_CLAIM_HOURS } from "@/lib/env";
import { EVENT_HOLD_WINDOW_MS } from "@/lib/utils/event-capacity";
import {
  StripeDisabledError,
  computeApplicationFee,
  createRegistrationCheckoutSession,
  expireCheckoutSession,
  isStripeEnabled,
  refundPaymentIntent,
} from "@/lib/payments/stripe";
import {
  sendEventRegistrationConfirmationEmail,
  sendEventRegistrationRemovedEmail,
  sendWaitlistOfferEmail,
} from "@/lib/email/templates";

export type RegisterForEventResult = {
  registrationIds: string[];
  status: "CONFIRMED" | "WAITLISTED" | "PENDING_PAYMENT";
  requiresPayment: boolean;
  checkoutUrl?: string;
};

type EventMerchant = {
  kind: "organization" | "league";
  id: string;
  stripeAccountId: string;
  platformFeeBps: number | null;
};

/** Resolve the onboarded merchant (rink org or league) for an event, if any. */
function resolveEventMerchant(event: {
  hostOrganization: {
    id: string;
    stripeAccountId: string | null;
    stripeChargesEnabled: boolean;
    platformFeeBps: number | null;
  } | null;
  hostLeague: {
    id: string;
    stripeAccountId: string | null;
    stripeChargesEnabled: boolean;
    platformFeeBps: number | null;
  } | null;
}): EventMerchant | null {
  const org = event.hostOrganization;
  if (org?.stripeAccountId && org.stripeChargesEnabled) {
    return {
      kind: "organization",
      id: org.id,
      stripeAccountId: org.stripeAccountId,
      platformFeeBps: org.platformFeeBps,
    };
  }
  const league = event.hostLeague;
  if (league?.stripeAccountId && league.stripeChargesEnabled) {
    return {
      kind: "league",
      id: league.id,
      stripeAccountId: league.stripeAccountId,
      platformFeeBps: league.platformFeeBps,
    };
  }
  return null;
}

const ACTIVE_STATUSES = ["CONFIRMED", "PENDING_PAYMENT", "WAITLISTED", "OFFERED"] as const;

function normalizeParticipantName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function manualPaymentNote(event: {
  venmoHandle: string | null;
  zelleHandle: string | null;
  cashAppHandle: string | null;
  paymentPhone: string | null;
  paymentInstructions: string | null;
}): string | undefined {
  const methods = [
    event.venmoHandle ? `Venmo ${event.venmoHandle}` : null,
    event.cashAppHandle ? `Cash App ${event.cashAppHandle}` : null,
    event.zelleHandle ? `Zelle ${event.zelleHandle}` : null,
    event.paymentPhone ? `phone ${event.paymentPhone}` : null,
  ].filter(Boolean);
  const parts = [
    methods.length > 0 ? `Pay via ${methods.join(", ")}` : null,
    event.paymentInstructions,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(". ") : undefined;
}

function revalidateEventRegistrationPaths(event: {
  id: string;
  venue?: { slug: string | null } | null;
  hostLeague?: { slug: string | null } | null;
}) {
  revalidatePath(`/signups/${event.id}`);
  revalidatePath(`/signup-events/${event.id}`);
  revalidatePath("/my-registrations");
  if (event.venue?.slug) {
    revalidatePath(`/rinks/${event.venue.slug}/schedule`);
  }
  if (event.hostLeague?.slug) {
    revalidatePath(`/associations/${event.hostLeague.slug}/events`);
  }
}

/**
 * Register one or more named participants into a slot. Capacity is enforced
 * per slot inside a Serializable transaction (confirmed + held pending +
 * un-expired offers), so concurrent registrations can never oversell.
 *
 * Free slots confirm instantly. Priced slots confirm with an "unpaid" manual
 * payment status when the event accepts manual payment (Venmo/Zelle/Cash App/
 * cash); online checkout ships with the payments story.
 */
export async function registerForSignupEvent(
  input: EventRegistrationInput
): Promise<ActionResult<RegisterForEventResult>> {
  try {
    const validated = eventRegistrationSchema.parse(input);
    const userId = await requireUserId();

    const slot = await prisma.signupSlot.findFirst({
      where: { id: validated.slotId, eventId: validated.eventId },
      select: {
        id: true,
        name: true,
        capacity: true,
        priceAmount: true,
        priceCurrency: true,
        waitlistEnabled: true,
        event: {
          select: {
            id: true,
            title: true,
            status: true,
            visibility: true,
            linkToken: true,
            startAt: true,
            timezone: true,
            registrationOpensAt: true,
            registrationClosesAt: true,
            acceptsOnlinePayment: true,
            acceptsManualPayment: true,
            venmoHandle: true,
            zelleHandle: true,
            cashAppHandle: true,
            paymentPhone: true,
            paymentInstructions: true,
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
            venue: { select: { slug: true } },
            hostLeague: {
              select: {
                id: true,
                slug: true,
                name: true,
                stripeAccountId: true,
                stripeChargesEnabled: true,
                platformFeeBps: true,
              },
            },
            hostOrganization: {
              select: {
                id: true,
                name: true,
                stripeAccountId: true,
                stripeChargesEnabled: true,
                platformFeeBps: true,
              },
            },
            hostTeam: { select: { name: true } },
          },
        },
      },
    });
    if (!slot) {
      return { success: false, error: "Signup slot not found" };
    }
    const event = slot.event;

    if (event.status !== "PUBLISHED") {
      return { success: false, error: "This event is not open for registration." };
    }
    const allowed = await canViewSignupEvent(
      { id: event.id, status: event.status, visibility: event.visibility, linkToken: event.linkToken },
      { userId, linkToken: validated.linkToken }
    );
    if (!allowed) {
      return { success: false, error: "You don't have access to this event." };
    }

    const now = new Date();
    if (now >= event.startAt) {
      return { success: false, error: "Registration has closed — this event has already started." };
    }
    if (event.registrationClosesAt && now > event.registrationClosesAt) {
      return { success: false, error: "Registration has closed for this event." };
    }

    // Opening: phases govern when they exist; otherwise the event-level window.
    let joinWaitlistInstead = false;
    if (event.phases.length > 0) {
      const eligibility = await resolvePhaseEligibility(prisma, event, userId, now);
      if (!eligibility.eligibleNow) {
        if (!slot.waitlistEnabled) {
          return {
            success: false,
            error: eligibility.nextOpensAt
              ? `Registration isn't open for you yet — the next window opens ${formatDateTime(eligibility.nextOpensAt)}.`
              : "Registration isn't open for you for this event.",
          };
        }
        joinWaitlistInstead = true;
      }
    } else if (event.registrationOpensAt && now < event.registrationOpensAt) {
      return { success: false, error: "Registration hasn't opened yet for this event." };
    }

    const unitAmount = slot.priceAmount ?? 0;
    const isPaid = unitAmount > 0;

    // Payment method resolution for priced slots (waitlist joins pay at claim
    // time instead). Explicit choice wins; otherwise manual keeps its historic
    // default, with online as the fallback for online-only events.
    const merchant = isPaid ? resolveEventMerchant(event) : null;
    const onlineAvailable = isPaid && event.acceptsOnlinePayment && isStripeEnabled() && merchant !== null;
    const manualAvailable = isPaid && event.acceptsManualPayment;
    let payOnline = false;
    if (isPaid && !joinWaitlistInstead) {
      if (validated.paymentMethod === "ONLINE") {
        if (!onlineAvailable) {
          return { success: false, error: "Online payment isn't available for this event." };
        }
        payOnline = true;
      } else if (validated.paymentMethod === "MANUAL") {
        if (!manualAvailable) {
          return { success: false, error: "This event doesn't accept manual payment — pay online instead." };
        }
      } else if (!manualAvailable) {
        if (!onlineAvailable) {
          return {
            success: false,
            error: "The organizer hasn't finished setting up payment collection for this event.",
          };
        }
        payOnline = true;
      }
      if (payOnline && validated.participants.length > 1) {
        return {
          success: false,
          error:
            "Online payment supports one participant per checkout — sign each participant up separately, or choose a manual payment method.",
        };
      }
    }
    const applicationFeeAmount = payOnline && merchant
      ? computeApplicationFee(unitAmount, merchant.platformFeeBps)
      : 0;

    // Reject duplicates within the request itself before touching the database.
    const requestedNames = validated.participants.map((participant) =>
      normalizeParticipantName(participant.name)
    );
    if (new Set(requestedNames).size !== requestedNames.length) {
      return { success: false, error: "Each participant can only be registered once per slot." };
    }

    const { registrationIds, waitlisted } = await prisma.$transaction(
      async (tx) => {
        // Duplicate guard: same registrant + same participant name + same slot,
        // considering only active registrations.
        const existing = await tx.eventRegistration.findMany({
          where: {
            slotId: slot.id,
            registrantId: userId,
            status: { in: [...ACTIVE_STATUSES] },
          },
          select: { participantName: true },
        });
        const existingNames = new Set(
          existing.map((registration) => normalizeParticipantName(registration.participantName))
        );
        const duplicate = validated.participants.find((participant) =>
          existingNames.has(normalizeParticipantName(participant.name))
        );
        if (duplicate) {
          throw new DuplicateParticipantError(duplicate.name);
        }

        // Full slots fall through to the waitlist (whole batch — never a
        // partial confirm) when the slot allows it.
        let toWaitlist = joinWaitlistInstead;
        if (!toWaitlist && slot.capacity != null) {
          const taken = await countCommittedSlotSpots(tx, slot.id);
          if (taken + validated.participants.length > slot.capacity) {
            if (!slot.waitlistEnabled) {
              throw new SlotCapacityError(Math.max(0, slot.capacity - taken));
            }
            toWaitlist = true;
          }
        }

        const created: string[] = [];
        for (const participant of validated.participants) {
          const registration = await tx.eventRegistration.create({
            data: {
              eventId: event.id,
              slotId: slot.id,
              registrantId: userId,
              participantName: participant.name,
              participantEmail: participant.email || null,
              participantPhone: participant.phone || null,
              notes: participant.notes || null,
              playerId: participant.playerId || null,
              status: toWaitlist ? "WAITLISTED" : payOnline ? "PENDING_PAYMENT" : "CONFIRMED",
              confirmedAt: toWaitlist || payOnline ? null : now,
              waitlistJoinedAt: toWaitlist ? now : null,
              unitAmount,
              currency: slot.priceCurrency,
              // Manual payment is owed on confirmation; online confirms via webhook.
              manualPaymentStatus: !toWaitlist && !payOnline && isPaid ? "UNPAID" : "NOT_REQUIRED",
              payment:
                !toWaitlist && payOnline && merchant
                  ? {
                      create: {
                        status: "REQUIRES_PAYMENT",
                        amount: unitAmount,
                        currency: slot.priceCurrency,
                        applicationFeeAmount,
                        stripeAccountId: merchant.stripeAccountId,
                        organizationId: merchant.kind === "organization" ? merchant.id : null,
                        leagueId: merchant.kind === "league" ? merchant.id : null,
                      },
                    }
                  : undefined,
            },
            select: { id: true },
          });
          created.push(registration.id);
        }
        return { registrationIds: created, waitlisted: toWaitlist };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    if (waitlisted) {
      revalidateEventRegistrationPaths(event);
      return {
        success: true,
        data: { registrationIds, status: "WAITLISTED", requiresPayment: false },
      };
    }

    // Online payment: hold reserved above — send the registrant to Checkout.
    // The webhook confirms on verified payment; abandoning releases the hold.
    if (payOnline && merchant) {
      const registrationId = registrationIds[0];
      try {
        const registrant = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true },
        });
        const checkout = await createRegistrationCheckoutSession({
          connectedAccountId: merchant.stripeAccountId,
          registrationId,
          productName: `${slot.name} — ${event.title}`,
          productDescription: "Event registration",
          unitAmount,
          currency: slot.priceCurrency,
          quantity: 1,
          applicationFeeAmount,
          customerEmail: registrant?.email,
          successPath: `/signups/${event.id}?registration=success`,
          cancelPath: `/signups/${event.id}?registration=canceled`,
          // Match the app-level hold window so late payments cannot overbook.
          expiresInSeconds: Math.floor(EVENT_HOLD_WINDOW_MS / 1000),
          metadata: { eventRegistrationId: registrationId, eventId: event.id },
        });

        await prisma.payment.update({
          where: { eventRegistrationId: registrationId },
          data: { stripeCheckoutSessionId: checkout.id },
        });

        revalidateEventRegistrationPaths(event);
        return {
          success: true,
          data: {
            registrationIds,
            status: "PENDING_PAYMENT",
            requiresPayment: true,
            checkoutUrl: checkout.url ?? undefined,
          },
        };
      } catch (stripeError) {
        // Roll back the pending hold if checkout could not be created.
        await prisma.eventRegistration.update({
          where: { id: registrationId },
          data: { status: "EXPIRED", payment: { update: { status: "CANCELED" } } },
        });
        if (stripeError instanceof StripeDisabledError) {
          return { success: false, error: stripeError.message };
        }
        console.error("Failed to create event checkout session:", stripeError);
        return { success: false, error: "Could not start checkout. Please try again." };
      }
    }

    // Best-effort confirmation email — a mail failure must not fail the
    // committed registration.
    try {
      const registrant = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      if (registrant?.email) {
        await sendEventRegistrationConfirmationEmail({
          to: registrant.email,
          participantNames: validated.participants.map((participant) => participant.name),
          eventTitle: event.title,
          slotName: slot.name,
          hostName:
            event.hostOrganization?.name ?? event.hostLeague?.name ?? event.hostTeam?.name ?? "the organizer",
          startAtFormatted: formatDateTime(event.startAt),
          eventId: event.id,
          amountTotal: unitAmount * validated.participants.length,
          currency: slot.priceCurrency,
          manualPaymentNote: isPaid ? manualPaymentNote(event) : undefined,
        });
      }
    } catch (emailError) {
      console.error("Failed to send event registration confirmation email:", emailError);
    }

    revalidateEventRegistrationPaths(event);
    return {
      success: true,
      data: { registrationIds, status: "CONFIRMED", requiresPayment: isPaid },
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    if (error instanceof DuplicateParticipantError) {
      return {
        success: false,
        error: `${error.participantName} is already registered for this slot.`,
      };
    }
    if (error instanceof SlotCapacityError) {
      return {
        success: false,
        error:
          error.remaining === 0
            ? "This slot just filled up."
            : `Only ${error.remaining} spot${error.remaining === 1 ? "" : "s"} left in this slot.`,
      };
    }
    if (isSerializationError(error)) {
      return { success: false, error: "This slot is filling up fast — please try again." };
    }
    console.error("Failed to register for signup event:", error);
    return { success: false, error: "Failed to register for this event." };
  }
}

class DuplicateParticipantError extends Error {
  constructor(public readonly participantName: string) {
    super("Duplicate participant");
    this.name = "DuplicateParticipantError";
  }
}

/**
 * Cancel the registrant's own registration, honoring the event's cancellation
 * cutoff. Paid-online confirmed registrations must be refunded by an organizer.
 */
export async function cancelMyEventRegistration(
  input: EventRegistrationCommandInput
): Promise<ActionResult<{ registrationId: string; status: string }>> {
  try {
    const { registrationId } = eventRegistrationCommandSchema.parse(input);
    const userId = await requireUserId();

    const registration = await prisma.eventRegistration.findFirst({
      where: { id: registrationId, registrantId: userId },
      select: {
        id: true,
        status: true,
        slotId: true,
        unitAmount: true,
        payment: { select: { status: true, stripeCheckoutSessionId: true, stripeAccountId: true } },
        event: {
          select: {
            id: true,
            startAt: true,
            cancellationCutoffAt: true,
            venue: { select: { slug: true } },
            hostLeague: { select: { slug: true } },
          },
        },
      },
    });
    if (!registration) {
      return { success: false, error: "Registration not found" };
    }
    if (!ACTIVE_STATUSES.includes(registration.status as (typeof ACTIVE_STATUSES)[number])) {
      return { success: false, error: "This registration is no longer active." };
    }
    if (registration.payment?.status === "PAID") {
      return {
        success: false,
        error: "This is a paid registration — contact the organizer to request a refund.",
      };
    }

    const now = new Date();
    const cutoff = registration.event.cancellationCutoffAt ?? registration.event.startAt;
    if (now > cutoff) {
      return {
        success: false,
        error: "The cancellation window for this event has passed — contact the organizer.",
      };
    }

    // For a pending online hold, expire the open Checkout Session first so the
    // stale URL cannot be paid and resurrect a canceled registration.
    const payment = registration.payment;
    if (payment?.stripeCheckoutSessionId && payment.stripeAccountId && payment.status !== "PAID") {
      try {
        await expireCheckoutSession(payment.stripeCheckoutSessionId, payment.stripeAccountId);
      } catch (expireError) {
        console.error("Failed to expire event checkout session on cancel:", expireError);
      }
    }

    await prisma.eventRegistration.update({
      where: { id: registration.id },
      data: {
        status: "CANCELED",
        canceledAt: now,
        canceledById: userId,
        payment: payment && payment.status !== "PAID" ? { update: { status: "CANCELED" } } : undefined,
      },
    });

    // A canceled confirmation/hold frees a committed spot — cascade an offer.
    if (["CONFIRMED", "PENDING_PAYMENT", "OFFERED"].includes(registration.status)) {
      try {
        await promoteNextWaitlistEntriesForSlot(registration.slotId);
      } catch (promotionError) {
        console.error("Waitlist promotion after cancel failed:", promotionError);
      }
    }

    revalidateEventRegistrationPaths(registration.event);
    return { success: true, data: { registrationId: registration.id, status: "CANCELED" } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    console.error("Failed to cancel event registration:", error);
    return { success: false, error: "Failed to cancel this registration." };
  }
}

/**
 * The current user's signup-event registrations across all hosts, with the
 * live queue position attached to waitlisted entries.
 */
export async function getMyEventRegistrations() {
  const userId = await requireUserId();
  const registrations = await prisma.eventRegistration.findMany({
    where: { registrantId: userId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      status: true,
      participantName: true,
      unitAmount: true,
      currency: true,
      manualPaymentStatus: true,
      checkedInAt: true,
      waitlistJoinedAt: true,
      offerExpiresAt: true,
      createdAt: true,
      slot: { select: { id: true, name: true } },
      event: {
        select: {
          id: true,
          title: true,
          status: true,
          startAt: true,
          endAt: true,
          timezone: true,
          locationText: true,
          cancellationCutoffAt: true,
          venue: { select: { name: true } },
          hostOrganization: { select: { name: true } },
          hostLeague: { select: { name: true } },
          hostTeam: { select: { name: true } },
        },
      },
      payment: { select: { status: true, receiptUrl: true } },
    },
  });

  return Promise.all(
    registrations.map(async (registration) => {
      if (registration.status !== "WAITLISTED" || !registration.waitlistJoinedAt) {
        return { ...registration, waitlistPosition: null };
      }
      const ahead = await prisma.eventRegistration.count({
        where: {
          slotId: registration.slot.id,
          status: "WAITLISTED",
          waitlistJoinedAt: { lt: registration.waitlistJoinedAt },
        },
      });
      return { ...registration, waitlistPosition: ahead + 1 };
    })
  );
}

export type EventRoster = Awaited<ReturnType<typeof getEventRoster>>;

/** Organizer roster: per-slot registrations with payment and check-in state. */
export async function getEventRoster(input: { eventId: string }) {
  await requireEventManager(input.eventId);

  const slots = await prisma.signupSlot.findMany({
    where: { eventId: input.eventId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      capacity: true,
      priceAmount: true,
      priceCurrency: true,
      waitlistEnabled: true,
      registrations: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          status: true,
          participantName: true,
          participantEmail: true,
          participantPhone: true,
          notes: true,
          isFloater: true,
          unitAmount: true,
          currency: true,
          manualPaymentStatus: true,
          waitlistJoinedAt: true,
          offerExpiresAt: true,
          confirmedAt: true,
          checkedInAt: true,
          createdAt: true,
          registrant: { select: { id: true, name: true, email: true } },
          player: { select: { id: true, name: true, team: { select: { name: true } } } },
          payment: { select: { status: true, amount: true, refundedAmount: true } },
        },
      },
    },
  });

  return slots.map((slot) => {
    const active = slot.registrations.filter((registration) =>
      (ACTIVE_STATUSES as readonly string[]).includes(registration.status)
    );
    return {
      ...slot,
      counts: {
        confirmed: active.filter((registration) => registration.status === "CONFIRMED").length,
        pending: active.filter((registration) => registration.status === "PENDING_PAYMENT").length,
        waitlisted: active.filter((registration) => registration.status === "WAITLISTED").length,
        offered: active.filter((registration) => registration.status === "OFFERED").length,
      },
    };
  });
}

/** Organizer: toggle event-day check-in for a confirmed registration. */
export async function setEventCheckIn(
  input: SetEventCheckInInput
): Promise<ActionResult<{ registrationId: string; checkedInAt: Date | null }>> {
  try {
    const validated = setEventCheckInSchema.parse(input);

    const registration = await prisma.eventRegistration.findUnique({
      where: { id: validated.registrationId },
      select: { id: true, eventId: true, status: true },
    });
    if (!registration) {
      return { success: false, error: "Registration not found" };
    }
    const userId = await requireEventManager(registration.eventId);

    if (registration.status !== "CONFIRMED") {
      return { success: false, error: "Only confirmed participants can be checked in." };
    }

    const updated = await prisma.eventRegistration.update({
      where: { id: registration.id },
      data: validated.checkedIn
        ? { checkedInAt: new Date(), checkedInById: userId }
        : { checkedInAt: null, checkedInById: null },
      select: { id: true, checkedInAt: true },
    });

    revalidatePath(`/signup-events/${registration.eventId}`);
    return { success: true, data: { registrationId: updated.id, checkedInAt: updated.checkedInAt } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return { success: false, error: error.message };
    }
    console.error("Failed to set event check-in:", error);
    return { success: false, error: "Failed to update check-in." };
  }
}

/**
 * Organizer removal of a registration. The registrant is notified; the freed
 * spot returns to availability.
 */
export async function removeEventRegistration(
  input: RemoveEventRegistrationInput
): Promise<ActionResult<{ registrationId: string }>> {
  try {
    const validated = removeEventRegistrationSchema.parse(input);

    const registration = await prisma.eventRegistration.findUnique({
      where: { id: validated.registrationId },
      select: {
        id: true,
        eventId: true,
        slotId: true,
        status: true,
        participantName: true,
        registrant: { select: { email: true } },
        event: {
          select: {
            id: true,
            title: true,
            venue: { select: { slug: true } },
            hostLeague: { select: { slug: true } },
          },
        },
      },
    });
    if (!registration) {
      return { success: false, error: "Registration not found" };
    }
    const userId = await requireEventManager(registration.eventId);

    if (!ACTIVE_STATUSES.includes(registration.status as (typeof ACTIVE_STATUSES)[number])) {
      return { success: false, error: "This registration is no longer active." };
    }

    await prisma.eventRegistration.update({
      where: { id: registration.id },
      data: { status: "CANCELED", canceledAt: new Date(), canceledById: userId },
    });

    await logSignupEventActivity({
      eventId: registration.eventId,
      actorId: userId,
      action: "registration.removed",
      summary: `Removed ${registration.participantName}'s registration`,
      details: { registrationId: registration.id, reason: validated.reason },
    });

    try {
      if (registration.registrant.email) {
        await sendEventRegistrationRemovedEmail({
          to: registration.registrant.email,
          participantName: registration.participantName,
          eventTitle: registration.event.title,
          reason: validated.reason,
        });
      }
    } catch (emailError) {
      console.error("Failed to send registration removal email:", emailError);
    }

    if (["CONFIRMED", "PENDING_PAYMENT", "OFFERED"].includes(registration.status)) {
      try {
        await promoteNextWaitlistEntriesForSlot(registration.slotId);
      } catch (promotionError) {
        console.error("Waitlist promotion after removal failed:", promotionError);
      }
    }

    revalidateEventRegistrationPaths(registration.event);
    return { success: true, data: { registrationId: registration.id } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return { success: false, error: error.message };
    }
    console.error("Failed to remove event registration:", error);
    return { success: false, error: "Failed to remove this registration." };
  }
}

/**
 * Claim a waitlist offer. The OFFERED row already holds the spot (it counts
 * as committed), so claiming is a conditional status flip — no capacity race.
 * Priced slots confirm with manual-payment tracking; online checkout arrives
 * with the payments story.
 */
export async function claimWaitlistOffer(
  input: EventRegistrationCommandInput
): Promise<ActionResult<{ registrationId: string; status: string; checkoutUrl?: string }>> {
  try {
    const { registrationId } = eventRegistrationCommandSchema.parse(input);
    const userId = await requireUserId();

    const registration = await prisma.eventRegistration.findFirst({
      where: { id: registrationId, registrantId: userId },
      select: {
        id: true,
        status: true,
        offerExpiresAt: true,
        unitAmount: true,
        participantName: true,
        slot: { select: { name: true, priceCurrency: true } },
        event: {
          select: {
            id: true,
            title: true,
            startAt: true,
            acceptsOnlinePayment: true,
            acceptsManualPayment: true,
            venmoHandle: true,
            zelleHandle: true,
            cashAppHandle: true,
            paymentPhone: true,
            paymentInstructions: true,
            venue: { select: { slug: true } },
            hostLeague: {
              select: {
                id: true,
                slug: true,
                name: true,
                stripeAccountId: true,
                stripeChargesEnabled: true,
                platformFeeBps: true,
              },
            },
            hostOrganization: {
              select: {
                id: true,
                name: true,
                stripeAccountId: true,
                stripeChargesEnabled: true,
                platformFeeBps: true,
              },
            },
            hostTeam: { select: { name: true } },
          },
        },
      },
    });
    if (!registration) {
      return { success: false, error: "Registration not found" };
    }
    if (registration.status !== "OFFERED") {
      return { success: false, error: "This offer is no longer available." };
    }

    const now = new Date();
    if (!registration.offerExpiresAt || registration.offerExpiresAt <= now) {
      return { success: false, error: "This offer has expired — you're back on the waitlist queue for the next opening." };
    }

    const isPaid = registration.unitAmount > 0;

    // Online-only events collect payment before confirming the claim: the
    // OFFERED hold becomes a PENDING_PAYMENT hold and the webhook confirms.
    if (isPaid && !registration.event.acceptsManualPayment) {
      const merchant = resolveEventMerchant(registration.event);
      if (!registration.event.acceptsOnlinePayment || !isStripeEnabled() || !merchant) {
        return {
          success: false,
          error: "Payment collection isn't available for this event — contact the organizer.",
        };
      }

      const originalOfferExpiresAt = registration.offerExpiresAt;
      const applicationFeeAmount = computeApplicationFee(registration.unitAmount, merchant.platformFeeBps);
      // This row's createdAt is the WAITLIST JOIN time, so the count's
      // createdAt-based hold window would lapse immediately. Keep the payment
      // hold committed by carrying the deadline in offerExpiresAt (see
      // countCommittedSlotSpots), matched to the checkout expiry below.
      const paymentHoldDeadline = new Date(now.getTime() + EVENT_HOLD_WINDOW_MS);
      const held = await prisma.eventRegistration.updateMany({
        where: { id: registration.id, status: "OFFERED", offerExpiresAt: { gt: now } },
        data: { status: "PENDING_PAYMENT", offerExpiresAt: paymentHoldDeadline },
      });
      if (held.count === 0) {
        return { success: false, error: "This offer is no longer available." };
      }

      try {
        await prisma.payment.create({
          data: {
            status: "REQUIRES_PAYMENT",
            amount: registration.unitAmount,
            currency: registration.slot.priceCurrency,
            applicationFeeAmount,
            stripeAccountId: merchant.stripeAccountId,
            eventRegistrationId: registration.id,
            organizationId: merchant.kind === "organization" ? merchant.id : null,
            leagueId: merchant.kind === "league" ? merchant.id : null,
          },
        });
        const registrant = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true },
        });
        const checkout = await createRegistrationCheckoutSession({
          connectedAccountId: merchant.stripeAccountId,
          registrationId: registration.id,
          productName: `${registration.slot.name} — ${registration.event.title}`,
          productDescription: "Event registration (waitlist claim)",
          unitAmount: registration.unitAmount,
          currency: registration.slot.priceCurrency,
          quantity: 1,
          applicationFeeAmount,
          customerEmail: registrant?.email,
          successPath: `/signups/${registration.event.id}?registration=success`,
          cancelPath: `/my-registrations?registration=canceled`,
          expiresInSeconds: Math.floor(EVENT_HOLD_WINDOW_MS / 1000),
          metadata: { eventRegistrationId: registration.id, eventId: registration.event.id },
        });
        await prisma.payment.update({
          where: { eventRegistrationId: registration.id },
          data: { stripeCheckoutSessionId: checkout.id },
        });

        revalidateEventRegistrationPaths(registration.event);
        return {
          success: true,
          data: {
            registrationId: registration.id,
            status: "PENDING_PAYMENT",
            checkoutUrl: checkout.url ?? undefined,
          },
        };
      } catch (stripeError) {
        // Restore the offer so the claimant can retry within their window.
        await prisma.$transaction([
          prisma.payment.deleteMany({ where: { eventRegistrationId: registration.id } }),
          prisma.eventRegistration.update({
            where: { id: registration.id },
            data: { status: "OFFERED", offerExpiresAt: originalOfferExpiresAt },
          }),
        ]);
        if (stripeError instanceof StripeDisabledError) {
          return { success: false, error: stripeError.message };
        }
        console.error("Failed to create claim checkout session:", stripeError);
        return { success: false, error: "Could not start checkout. Please try again." };
      }
    }

    const claimed = await prisma.eventRegistration.updateMany({
      where: { id: registration.id, status: "OFFERED", offerExpiresAt: { gt: now } },
      data: {
        status: "CONFIRMED",
        confirmedAt: now,
        offerExpiresAt: null,
        manualPaymentStatus: isPaid ? "UNPAID" : "NOT_REQUIRED",
      },
    });
    if (claimed.count === 0) {
      return { success: false, error: "This offer is no longer available." };
    }

    try {
      const registrant = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      if (registrant?.email) {
        await sendEventRegistrationConfirmationEmail({
          to: registrant.email,
          participantNames: [registration.participantName],
          eventTitle: registration.event.title,
          slotName: registration.slot.name,
          hostName:
            registration.event.hostOrganization?.name ??
            registration.event.hostLeague?.name ??
            registration.event.hostTeam?.name ??
            "the organizer",
          startAtFormatted: formatDateTime(registration.event.startAt),
          eventId: registration.event.id,
          amountTotal: registration.unitAmount,
          currency: registration.slot.priceCurrency,
          manualPaymentNote: isPaid ? manualPaymentNote(registration.event) : undefined,
        });
      }
    } catch (emailError) {
      console.error("Failed to send claim confirmation email:", emailError);
    }

    revalidateEventRegistrationPaths(registration.event);
    return { success: true, data: { registrationId: registration.id, status: "CONFIRMED" } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    console.error("Failed to claim waitlist offer:", error);
    return { success: false, error: "Failed to claim this offer." };
  }
}

/** Decline a waitlist offer; the spot cascades to the next entry in order. */
export async function declineWaitlistOffer(
  input: EventRegistrationCommandInput
): Promise<ActionResult<{ registrationId: string }>> {
  try {
    const { registrationId } = eventRegistrationCommandSchema.parse(input);
    const userId = await requireUserId();

    const registration = await prisma.eventRegistration.findFirst({
      where: { id: registrationId, registrantId: userId },
      select: {
        id: true,
        status: true,
        slotId: true,
        event: {
          select: { id: true, venue: { select: { slug: true } }, hostLeague: { select: { slug: true } } },
        },
      },
    });
    if (!registration) {
      return { success: false, error: "Registration not found" };
    }
    if (registration.status !== "OFFERED" && registration.status !== "WAITLISTED") {
      return { success: false, error: "There is no waitlist entry to decline." };
    }

    const wasOffered = registration.status === "OFFERED";
    await prisma.eventRegistration.update({
      where: { id: registration.id },
      data: { status: "CANCELED", canceledAt: new Date(), canceledById: userId, offerExpiresAt: null },
    });

    if (wasOffered) {
      try {
        await promoteNextWaitlistEntriesForSlot(registration.slotId);
      } catch (promotionError) {
        console.error("Waitlist promotion after decline failed:", promotionError);
      }
    }

    revalidateEventRegistrationPaths(registration.event);
    return { success: true, data: { registrationId: registration.id } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    console.error("Failed to decline waitlist offer:", error);
    return { success: false, error: "Failed to decline this offer." };
  }
}

/**
 * Organizer override: offer a spot to a specific waitlisted entry out of
 * FIFO order. Capacity is still enforced — no oversell, even manually.
 */
export async function promoteWaitlistEntry(
  input: EventRegistrationCommandInput
): Promise<ActionResult<{ registrationId: string; offerExpiresAt: Date }>> {
  try {
    const { registrationId } = eventRegistrationCommandSchema.parse(input);

    const registration = await prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: {
        id: true,
        eventId: true,
        status: true,
        participantName: true,
        registrant: { select: { email: true } },
        slot: { select: { id: true, name: true, capacity: true } },
        event: {
          select: {
            id: true,
            title: true,
            startAt: true,
            venue: { select: { slug: true } },
            hostLeague: { select: { slug: true } },
          },
        },
      },
    });
    if (!registration) {
      return { success: false, error: "Registration not found" };
    }
    await requireEventManager(registration.eventId);

    if (registration.status !== "WAITLISTED") {
      return { success: false, error: "Only waitlisted entries can be offered a spot." };
    }

    const now = new Date();
    if (now >= registration.event.startAt) {
      return { success: false, error: "This event has already started." };
    }
    const offerExpiresAt = (() => {
      const claim = new Date(now.getTime() + EVENT_WAITLIST_CLAIM_HOURS * 60 * 60 * 1000);
      return claim < registration.event.startAt ? claim : registration.event.startAt;
    })();

    await prisma.$transaction(
      async (tx) => {
        if (registration.slot.capacity != null) {
          const committed = await countCommittedSlotSpots(tx, registration.slot.id);
          if (committed >= registration.slot.capacity) {
            throw new SlotCapacityError(0);
          }
        }
        const claimed = await tx.eventRegistration.updateMany({
          where: { id: registration.id, status: "WAITLISTED" },
          data: { status: "OFFERED", offerExpiresAt },
        });
        if (claimed.count === 0) {
          throw new Error("Entry is no longer waitlisted");
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    await logSignupEventActivity({
      eventId: registration.eventId,
      actorId: await requireUserId(),
      action: "waitlist.promoted",
      summary: `Offered a ${registration.slot.name} spot to ${registration.participantName} (manual promotion)`,
      details: { registrationId: registration.id },
    });

    try {
      if (registration.registrant.email) {
        await sendWaitlistOfferEmail({
          to: registration.registrant.email,
          participantName: registration.participantName,
          eventTitle: registration.event.title,
          slotName: registration.slot.name,
          claimByFormatted: formatDateTime(offerExpiresAt),
          eventId: registration.event.id,
        });
      }
    } catch (emailError) {
      console.error("Failed to send manual offer email:", emailError);
    }

    revalidateEventRegistrationPaths(registration.event);
    return { success: true, data: { registrationId: registration.id, offerExpiresAt } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return { success: false, error: error.message };
    }
    if (error instanceof SlotCapacityError) {
      return { success: false, error: "This slot is full — increase its capacity before offering more spots." };
    }
    if (error instanceof Error && error.message === "Entry is no longer waitlisted") {
      return { success: false, error: "This entry is no longer on the waitlist." };
    }
    if (isSerializationError(error)) {
      return { success: false, error: "The slot is busy — please try again." };
    }
    console.error("Failed to promote waitlist entry:", error);
    return { success: false, error: "Failed to offer this spot." };
  }
}

/**
 * Organizer bookkeeping for manual (Venmo/Zelle/Cash App/cash) payments.
 * Only applies to priced registrations without an online payment.
 */
export async function setManualPaymentStatus(
  input: SetManualPaymentStatusInput
): Promise<ActionResult<{ registrationId: string; status: string }>> {
  try {
    const validated = setManualPaymentStatusSchema.parse(input);

    const registration = await prisma.eventRegistration.findUnique({
      where: { id: validated.registrationId },
      select: {
        id: true,
        eventId: true,
        status: true,
        unitAmount: true,
        payment: { select: { id: true } },
      },
    });
    if (!registration) {
      return { success: false, error: "Registration not found" };
    }
    const userId = await requireEventManager(registration.eventId);

    if (registration.unitAmount <= 0) {
      return { success: false, error: "This registration is free — there is nothing to mark paid." };
    }
    if (registration.payment) {
      return { success: false, error: "This registration was paid online — use Refund instead." };
    }
    if (registration.status !== "CONFIRMED") {
      return { success: false, error: "Only confirmed registrations carry a payment status." };
    }

    await prisma.eventRegistration.update({
      where: { id: registration.id },
      data: { manualPaymentStatus: validated.status, manualPaymentMarkedById: userId },
    });

    await logSignupEventActivity({
      eventId: registration.eventId,
      actorId: userId,
      action: "payment.marked",
      summary: `Marked a manual payment ${validated.status.toLowerCase()}`,
      details: { registrationId: registration.id, status: validated.status },
    });

    revalidatePath(`/signup-events/${registration.eventId}`);
    return { success: true, data: { registrationId: registration.id, status: validated.status } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return { success: false, error: error.message };
    }
    console.error("Failed to set manual payment status:", error);
    return { success: false, error: "Failed to update the payment status." };
  }
}

/**
 * Organizer refund of an online event payment (full refund). Reverses the
 * charge on the host's connected account, marks the registration REFUNDED,
 * and cascades the freed spot to the waitlist.
 */
export async function refundEventRegistration(
  input: RefundEventRegistrationInput
): Promise<ActionResult<{ registrationId: string; status: string }>> {
  try {
    const validated = refundEventRegistrationSchema.parse(input);

    const registration = await prisma.eventRegistration.findUnique({
      where: { id: validated.registrationId },
      select: {
        id: true,
        eventId: true,
        slotId: true,
        status: true,
        event: {
          select: { id: true, venue: { select: { slug: true } }, hostLeague: { select: { slug: true } } },
        },
        payment: {
          select: {
            id: true,
            status: true,
            amount: true,
            refundedAmount: true,
            stripePaymentIntentId: true,
            stripeAccountId: true,
          },
        },
      },
    });
    if (!registration) {
      return { success: false, error: "Registration not found" };
    }
    const userId = await requireEventManager(registration.eventId);

    const payment = registration.payment;
    const refundable = payment?.status === "PAID" || payment?.status === "PARTIALLY_REFUNDED";
    if (!payment || !refundable || !payment.stripePaymentIntentId || !payment.stripeAccountId) {
      return { success: false, error: "This registration has no captured online payment to refund." };
    }

    const remaining = payment.amount - payment.refundedAmount;
    if (remaining <= 0) {
      return { success: false, error: "This payment has already been fully refunded." };
    }

    // Claim the payment so concurrent refund requests cannot double-refund.
    const claim = await prisma.payment.updateMany({
      where: { id: payment.id, status: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
      data: { status: "PROCESSING" },
    });
    if (claim.count === 0) {
      return { success: false, error: "This registration is already being refunded." };
    }

    try {
      await refundPaymentIntent({
        paymentIntentId: payment.stripePaymentIntentId,
        connectedAccountId: payment.stripeAccountId,
        amount: payment.refundedAmount > 0 ? remaining : undefined,
        refundApplicationFee: true,
        idempotencyKey: `refund-full:${registration.id}`,
      });
    } catch (stripeError) {
      // Release the claim so the organizer can retry.
      await prisma.payment.update({ where: { id: payment.id }, data: { status: payment.status } });
      if (stripeError instanceof StripeDisabledError) {
        return { success: false, error: stripeError.message };
      }
      console.error("Failed to refund event payment:", stripeError);
      return { success: false, error: "Stripe refused the refund. Please try again." };
    }

    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: "REFUNDED", refundedAmount: payment.amount, refundedAt: new Date() },
      }),
      prisma.eventRegistration.update({
        where: { id: registration.id },
        data: { status: "REFUNDED", canceledAt: new Date(), canceledById: userId },
      }),
    ]);

    await logSignupEventActivity({
      eventId: registration.eventId,
      actorId: userId,
      action: "payment.refunded",
      summary: "Refunded an online payment",
      details: { registrationId: registration.id, amountCents: payment.amount, reason: validated.reason },
    });

    // The refunded spot frees capacity — offer it to the waitlist.
    try {
      await promoteNextWaitlistEntriesForSlot(registration.slotId);
    } catch (promotionError) {
      console.error("Waitlist promotion after refund failed:", promotionError);
    }

    revalidateEventRegistrationPaths(registration.event);
    return { success: true, data: { registrationId: registration.id, status: "REFUNDED" } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return { success: false, error: error.message };
    }
    console.error("Failed to refund event registration:", error);
    return { success: false, error: "Failed to refund this registration." };
  }
}
