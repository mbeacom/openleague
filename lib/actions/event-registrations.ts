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
  type EventRegistrationInput,
  type EventRegistrationCommandInput,
  type SetEventCheckInInput,
  type RemoveEventRegistrationInput,
} from "@/lib/utils/validation";
import {
  countCommittedSlotSpots,
  isSerializationError,
  SlotCapacityError,
} from "@/lib/utils/event-capacity";
import { canViewSignupEvent } from "@/lib/utils/event-access";
import { formatDateTime } from "@/lib/utils/date";
import {
  sendEventRegistrationConfirmationEmail,
  sendEventRegistrationRemovedEmail,
} from "@/lib/email/templates";

export type RegisterForEventResult = {
  registrationIds: string[];
  status: "CONFIRMED";
  requiresPayment: boolean;
};

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
  revalidatePath(`/events/${event.id}`);
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
            venue: { select: { slug: true } },
            hostLeague: { select: { slug: true, name: true } },
            hostOrganization: { select: { name: true } },
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
    if (event.registrationOpensAt && now < event.registrationOpensAt) {
      return { success: false, error: "Registration hasn't opened yet for this event." };
    }
    if (event.registrationClosesAt && now > event.registrationClosesAt) {
      return { success: false, error: "Registration has closed for this event." };
    }

    const unitAmount = slot.priceAmount ?? 0;
    const isPaid = unitAmount > 0;
    if (isPaid && !event.acceptsManualPayment) {
      // Online checkout arrives with the payments story; manual is the fallback.
      return {
        success: false,
        error: "Online payment for this event isn't available yet — contact the organizer.",
      };
    }

    // Reject duplicates within the request itself before touching the database.
    const requestedNames = validated.participants.map((participant) =>
      normalizeParticipantName(participant.name)
    );
    if (new Set(requestedNames).size !== requestedNames.length) {
      return { success: false, error: "Each participant can only be registered once per slot." };
    }

    const registrationIds = await prisma.$transaction(
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

        if (slot.capacity != null) {
          const taken = await countCommittedSlotSpots(tx, slot.id);
          if (taken + validated.participants.length > slot.capacity) {
            throw new SlotCapacityError(Math.max(0, slot.capacity - taken));
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
              status: "CONFIRMED",
              confirmedAt: now,
              unitAmount,
              currency: slot.priceCurrency,
              manualPaymentStatus: isPaid ? "UNPAID" : "NOT_REQUIRED",
            },
            select: { id: true },
          });
          created.push(registration.id);
        }
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

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
        unitAmount: true,
        payment: { select: { status: true } },
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

    await prisma.eventRegistration.update({
      where: { id: registration.id },
      data: { status: "CANCELED", canceledAt: now, canceledById: userId },
    });

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

/** The current user's signup-event registrations across all hosts. */
export async function getMyEventRegistrations() {
  const userId = await requireUserId();
  return prisma.eventRegistration.findMany({
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
          venue: { select: { name: true } },
          hostOrganization: { select: { name: true } },
          hostLeague: { select: { name: true } },
          hostTeam: { select: { name: true } },
        },
      },
      payment: { select: { status: true, receiptUrl: true } },
    },
  });
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
