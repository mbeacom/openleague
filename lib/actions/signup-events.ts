"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import type { PhaseAudience } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { FALLBACK_TIME_ZONE } from "@/lib/utils/date";
import {
  getCurrentUserId,
  isEventManager,
  requireEventManager,
  requireSignupEventHostAdmin,
  requireUserId,
} from "@/lib/auth/session";
import type { ActionResult } from "@/lib/actions/venue-organizations";
import {
  createSignupEventSchema,
  updateSignupEventSchema,
  signupEventCommandSchema,
  cancelSignupEventSchema,
  type CreateSignupEventInput,
  type UpdateSignupEventInput,
  type SignupEventCommandInput,
  type CancelSignupEventInput,
} from "@/lib/utils/validation";
import { publicSignupEventSelect, type PublicSignupEvent } from "@/lib/utils/public-signup-events";
import { countCommittedSlotSpots } from "@/lib/utils/event-capacity";
import { canViewSignupEvent } from "@/lib/utils/event-access";
import { resolvePhaseEligibility } from "@/lib/utils/event-phases";
import { promoteNextWaitlistEntriesForSlot } from "@/lib/utils/event-waitlist";
import { isStripeEnabled } from "@/lib/payments/stripe";
import { sendSignupEventCanceledEmail, sendSignupEventUpdatedEmail } from "@/lib/email/templates";
import { logSignupEventActivity } from "@/lib/utils/event-activity";

const ACTIVE_REGISTRATION_STATUSES = ["CONFIRMED", "PENDING_PAYMENT", "OFFERED", "WAITLISTED"] as const;

function generateEventToken(): string {
  return randomBytes(32).toString("hex");
}

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "association";
}

function hostDisplayName(event: {
  hostOrganization?: { name: string } | null;
  hostLeague?: { name: string } | null;
  hostTeam?: { name: string } | null;
}): string {
  return (
    event.hostOrganization?.name ?? event.hostLeague?.name ?? event.hostTeam?.name ?? "the organizer"
  );
}

type ParsedPhase = {
  name: string;
  opensAt: Date;
  audience: PhaseAudience;
  sortOrder: number;
  divisionIds: string[];
  teamIds: string[];
};

function phaseCreateData(phases: ParsedPhase[]) {
  return phases.map((phase, index) => ({
    name: phase.name,
    opensAt: phase.opensAt,
    audience: phase.audience,
    sortOrder: phase.sortOrder ?? index,
    divisions: { connect: phase.divisionIds.map((id) => ({ id })) },
    teams: { connect: phase.teamIds.map((id) => ({ id })) },
  }));
}

function eventScalarData(validated: {
  title: string;
  description?: string;
  category: CreateSignupEventInput["category"];
  ageClassification: CreateSignupEventInput["ageClassification"];
  visibility: CreateSignupEventInput["visibility"];
  startAt: Date;
  endAt: Date;
  locationText?: string;
  registrationOpensAt?: Date;
  registrationClosesAt?: Date;
  cancellationCutoffAt?: Date;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  acceptsOnlinePayment: boolean;
  acceptsManualPayment: boolean;
  venmoHandle?: string;
  zelleHandle?: string;
  cashAppHandle?: string;
  paymentPhone?: string;
  paymentInstructions?: string;
  galleryEnabled: boolean;
  galleryVisibility: CreateSignupEventInput["galleryVisibility"];
  publicRoster: boolean;
}) {
  return {
    title: validated.title,
    description: validated.description || null,
    category: validated.category,
    ageClassification: validated.ageClassification,
    visibility: validated.visibility,
    startAt: validated.startAt,
    endAt: validated.endAt,
    locationText: validated.locationText || null,
    registrationOpensAt: validated.registrationOpensAt ?? null,
    registrationClosesAt: validated.registrationClosesAt ?? null,
    cancellationCutoffAt: validated.cancellationCutoffAt ?? null,
    contactName: validated.contactName || null,
    contactEmail: validated.contactEmail || null,
    contactPhone: validated.contactPhone || null,
    acceptsOnlinePayment: validated.acceptsOnlinePayment,
    acceptsManualPayment: validated.acceptsManualPayment,
    venmoHandle: validated.venmoHandle || null,
    zelleHandle: validated.zelleHandle || null,
    cashAppHandle: validated.cashAppHandle || null,
    paymentPhone: validated.paymentPhone || null,
    paymentInstructions: validated.paymentInstructions || null,
    galleryEnabled: validated.galleryEnabled,
    galleryVisibility: validated.galleryVisibility,
    publicRoster: validated.publicRoster,
  };
}

function revalidateEventPaths(event: {
  id: string;
  venue?: { slug: string | null } | null;
  hostLeague?: { slug: string | null } | null;
}) {
  revalidatePath("/signup-events");
  revalidatePath(`/signup-events/${event.id}`);
  revalidatePath("/events");
  revalidatePath(`/events/${event.id}`);
  if (event.venue?.slug) {
    revalidatePath(`/rinks/${event.venue.slug}`);
    revalidatePath(`/rinks/${event.venue.slug}/schedule`);
  }
  if (event.hostLeague?.slug) {
    revalidatePath(`/associations/${event.hostLeague.slug}/events`);
  }
}

/**
 * Create a signup event (DRAFT) with its slots and registration phases.
 * Only admins of the hosting entity may create events for it.
 */
export async function createSignupEvent(
  input: CreateSignupEventInput
): Promise<ActionResult<{ eventId: string }>> {
  try {
    const validated = createSignupEventSchema.parse(input);
    const userId = await requireSignupEventHostAdmin({
      organizationId: validated.hostOrganizationId,
      leagueId: validated.hostLeagueId,
      teamId: validated.hostTeamId,
    });

    let venueTimezone: string | undefined;
    if (validated.venueId) {
      const venue = await prisma.venue.findUnique({
        where: { id: validated.venueId },
        select: { id: true, timezone: true },
      });
      if (!venue) {
        return { success: false, error: "Venue not found" };
      }
      venueTimezone = venue.timezone;
    }
    // Prefer the zone the organizer's form parsed the wall-clock times against so
    // the stored instant round-trips; fall back to the venue's zone or a default.
    const timezone = validated.timezone ?? venueTimezone ?? FALLBACK_TIME_ZONE;

    const event = await prisma.signupEvent.create({
      data: {
        ...eventScalarData(validated),
        timezone,
        linkToken: validated.visibility === "LINK" ? generateEventToken() : null,
        hostOrganizationId: validated.hostOrganizationId || null,
        hostLeagueId: validated.hostLeagueId || null,
        hostTeamId: validated.hostTeamId || null,
        venueId: validated.venueId || null,
        createdById: userId,
        slots: {
          create: validated.slots.map((slot, index) => ({
            name: slot.name,
            description: slot.description || null,
            sortOrder: slot.sortOrder ?? index,
            capacity: slot.capacity ?? null,
            priceAmount: slot.priceAmount ?? null,
            waitlistEnabled: slot.waitlistEnabled,
          })),
        },
        phases: { create: phaseCreateData(validated.phases) },
      },
      select: { id: true },
    });

    revalidatePath("/signup-events");
    return { success: true, data: { eventId: event.id } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return { success: false, error: error.message };
    }
    console.error("Failed to create signup event:", error);
    return { success: false, error: "Failed to create the event." };
  }
}

/**
 * Update event details, slots, and phases. Material changes to a published
 * event (time or place) notify all active registrants. Slots with active
 * registrations are never deleted; capacity reductions never revoke existing
 * confirmations.
 */
export async function updateSignupEvent(
  input: UpdateSignupEventInput
): Promise<ActionResult<{ eventId: string; warnings: string[] }>> {
  try {
    const validated = updateSignupEventSchema.parse(input);
    await requireEventManager(validated.eventId);

    const existing = await prisma.signupEvent.findUnique({
      where: { id: validated.eventId },
      select: {
        id: true,
        status: true,
        startAt: true,
        endAt: true,
        venueId: true,
        locationText: true,
        visibility: true,
        linkToken: true,
        title: true,
        venue: { select: { slug: true } },
        hostLeague: { select: { slug: true, name: true } },
        hostOrganization: { select: { name: true } },
        hostTeam: { select: { name: true } },
        slots: { select: { id: true, capacity: true, _count: { select: { registrations: true } } } },
      },
    });
    if (!existing) {
      return { success: false, error: "Event not found" };
    }
    if (existing.status === "CANCELED") {
      return { success: false, error: "Canceled events cannot be edited." };
    }

    let timezoneUpdate: { timezone?: string } = {};
    if (validated.venueId && validated.venueId !== existing.venueId) {
      const venue = await prisma.venue.findUnique({
        where: { id: validated.venueId },
        select: { timezone: true },
      });
      if (!venue) {
        return { success: false, error: "Venue not found" };
      }
      timezoneUpdate = { timezone: venue.timezone };
    }
    // A client-supplied zone (what the form parsed times against) wins so the
    // stored instant round-trips to the wall-clock the organizer entered.
    if (validated.timezone) {
      timezoneUpdate = { timezone: validated.timezone };
    }

    const warnings: string[] = [];
    const existingSlotIds = new Set(existing.slots.map((slot) => slot.id));
    const incomingSlotIds = new Set(
      validated.slots.map((slot) => slot.id).filter((id): id is string => Boolean(id))
    );
    for (const id of incomingSlotIds) {
      if (!existingSlotIds.has(id)) {
        return { success: false, error: "One of the slots does not belong to this event." };
      }
    }

    const removableSlots = existing.slots.filter((slot) => !incomingSlotIds.has(slot.id));
    const blockedRemovals = removableSlots.filter((slot) => slot._count.registrations > 0);
    const deletableSlotIds = removableSlots
      .filter((slot) => slot._count.registrations === 0)
      .map((slot) => slot.id);
    if (blockedRemovals.length > 0) {
      warnings.push(
        "Some slots were kept because they already have registrations. Remove those registrations first to delete the slot."
      );
    }

    for (const slot of validated.slots) {
      if (!slot.id) continue;
      const current = existing.slots.find((existingSlot) => existingSlot.id === slot.id);
      if (current && slot.capacity != null && slot.capacity < current._count.registrations) {
        warnings.push(
          `Slot "${slot.name}" now has more registrations than its capacity — existing registrations are kept; new ones are blocked until spots free up.`
        );
      }
    }

    const materialChange =
      existing.status === "PUBLISHED" &&
      (existing.startAt.getTime() !== validated.startAt.getTime() ||
        existing.endAt.getTime() !== validated.endAt.getTime() ||
        (existing.venueId ?? null) !== (validated.venueId || null) ||
        (existing.locationText ?? "") !== (validated.locationText ?? ""));

    await prisma.$transaction(async (tx) => {
      await tx.signupEvent.update({
        where: { id: validated.eventId },
        data: {
          ...eventScalarData(validated),
          ...timezoneUpdate,
          // Moving into LINK visibility mints a token; other moves keep it inert.
          linkToken:
            validated.visibility === "LINK" && !existing.linkToken
              ? generateEventToken()
              : undefined,
          venueId: validated.venueId || null,
          updatedById: await requireUserId(),
        },
      });

      if (deletableSlotIds.length > 0) {
        await tx.signupSlot.deleteMany({ where: { id: { in: deletableSlotIds } } });
      }
      for (const [index, slot] of validated.slots.entries()) {
        const slotData = {
          name: slot.name,
          description: slot.description || null,
          sortOrder: slot.sortOrder ?? index,
          capacity: slot.capacity ?? null,
          priceAmount: slot.priceAmount ?? null,
          waitlistEnabled: slot.waitlistEnabled,
        };
        if (slot.id) {
          await tx.signupSlot.update({ where: { id: slot.id }, data: slotData });
        } else {
          await tx.signupSlot.create({ data: { ...slotData, eventId: validated.eventId } });
        }
      }

      // Phases carry no dependent rows — replace wholesale.
      await tx.eventRegistrationPhase.deleteMany({ where: { eventId: validated.eventId } });
      for (const phase of phaseCreateData(validated.phases)) {
        await tx.eventRegistrationPhase.create({ data: { ...phase, eventId: validated.eventId } });
      }
    });

    // A capacity increase frees spots — cascade waitlist offers for those slots.
    const increasedSlotIds = validated.slots
      .filter((slot) => {
        if (!slot.id) return false;
        const current = existing.slots.find((existingSlot) => existingSlot.id === slot.id);
        if (!current) return false;
        const oldCapacity = current.capacity;
        const newCapacity = slot.capacity ?? null;
        return oldCapacity != null && (newCapacity == null || newCapacity > oldCapacity);
      })
      .map((slot) => slot.id as string);
    for (const slotId of increasedSlotIds) {
      try {
        await promoteNextWaitlistEntriesForSlot(slotId);
      } catch (promotionError) {
        console.error("Waitlist promotion after capacity increase failed:", promotionError);
      }
    }

    if (materialChange) {
      const registrants = await prisma.eventRegistration.findMany({
        where: { eventId: validated.eventId, status: { in: [...ACTIVE_REGISTRATION_STATUSES] } },
        select: { registrant: { select: { email: true, name: true } } },
        distinct: ["registrantId"],
      });
      try {
        await sendSignupEventUpdatedEmail({
          recipients: registrants.map((registration) => registration.registrant),
          eventTitle: validated.title,
          hostName: hostDisplayName(existing),
          changeSummary: "The event time or location has changed — please review the updated details.",
          eventId: validated.eventId,
        });
      } catch (emailError) {
        console.error("Failed to send event update notifications:", emailError);
      }
    }

    revalidateEventPaths({ id: validated.eventId, venue: existing.venue, hostLeague: existing.hostLeague });
    return { success: true, data: { eventId: validated.eventId, warnings } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return { success: false, error: error.message };
    }
    console.error("Failed to update signup event:", error);
    return { success: false, error: "Failed to update the event." };
  }
}

/**
 * Publish a draft event. Validates payment readiness (online payments require
 * an onboarded merchant) and mints the public surfaces: LINK token and, for a
 * league's first PUBLIC event, the association's URL slug.
 */
export async function publishSignupEvent(
  input: SignupEventCommandInput
): Promise<ActionResult<{ eventId: string }>> {
  try {
    const { eventId } = signupEventCommandSchema.parse(input);
    await requireEventManager(eventId);

    const event = await prisma.signupEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        status: true,
        visibility: true,
        linkToken: true,
        acceptsOnlinePayment: true,
        acceptsManualPayment: true,
        hostTeamId: true,
        venue: { select: { slug: true } },
        hostOrganization: {
          select: { id: true, stripeAccountId: true, stripeChargesEnabled: true },
        },
        hostLeague: {
          select: { id: true, name: true, slug: true, stripeAccountId: true, stripeChargesEnabled: true },
        },
        slots: { select: { id: true, priceAmount: true } },
      },
    });
    if (!event) {
      return { success: false, error: "Event not found" };
    }
    if (event.status === "PUBLISHED") {
      return { success: false, error: "This event is already published." };
    }
    if (event.status === "CANCELED") {
      return { success: false, error: "Canceled events cannot be republished — duplicate the event instead." };
    }
    if (event.slots.length === 0) {
      return { success: false, error: "Add at least one signup slot before publishing." };
    }

    const hasPricedSlot = event.slots.some((slot) => (slot.priceAmount ?? 0) > 0);
    if (hasPricedSlot && !event.acceptsOnlinePayment && !event.acceptsManualPayment) {
      return { success: false, error: "Priced slots need at least one accepted payment method." };
    }
    if (event.acceptsOnlinePayment) {
      if (event.hostTeamId) {
        return {
          success: false,
          error: "Team-hosted events support manual payment methods only.",
        };
      }
      const merchant = event.hostOrganization ?? event.hostLeague;
      if (!isStripeEnabled() || !merchant?.stripeAccountId || !merchant.stripeChargesEnabled) {
        return {
          success: false,
          error: "Online payments aren't set up for this host yet — finish payment onboarding or switch to manual payment methods.",
        };
      }
    }

    // A league's first PUBLIC event mints the association's public URL slug.
    let leagueSlug = event.hostLeague?.slug ?? null;
    if (event.visibility === "PUBLIC" && event.hostLeague && !event.hostLeague.slug) {
      const base = slugifyName(event.hostLeague.name);
      let candidate = base;
      for (let suffix = 2; suffix < 50; suffix += 1) {
        const taken = await prisma.league.findUnique({ where: { slug: candidate }, select: { id: true } });
        if (!taken) break;
        candidate = `${base}-${suffix}`;
      }
      await prisma.league.update({ where: { id: event.hostLeague.id }, data: { slug: candidate } });
      leagueSlug = candidate;
    }

    await prisma.signupEvent.update({
      where: { id: eventId },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        linkToken: event.visibility === "LINK" && !event.linkToken ? generateEventToken() : undefined,
      },
    });

    await logSignupEventActivity({
      eventId,
      actorId: await requireUserId(),
      action: "published",
      summary: "Event published",
    });

    revalidateEventPaths({ id: eventId, venue: event.venue, hostLeague: { slug: leagueSlug } });
    return { success: true, data: { eventId } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return { success: false, error: error.message };
    }
    console.error("Failed to publish signup event:", error);
    return { success: false, error: "Failed to publish the event." };
  }
}

/**
 * Cancel an event. The record and its registrations are retained; all active
 * registrants are notified. Returns the count of captured online payments the
 * organizer still needs to refund.
 */
export async function cancelSignupEvent(
  input: CancelSignupEventInput
): Promise<ActionResult<{ eventId: string; paidRegistrations: number }>> {
  try {
    const validated = cancelSignupEventSchema.parse(input);
    await requireEventManager(validated.eventId);

    const event = await prisma.signupEvent.findUnique({
      where: { id: validated.eventId },
      select: {
        id: true,
        status: true,
        title: true,
        venue: { select: { slug: true } },
        hostLeague: { select: { slug: true, name: true } },
        hostOrganization: { select: { name: true } },
        hostTeam: { select: { name: true } },
      },
    });
    if (!event) {
      return { success: false, error: "Event not found" };
    }
    if (event.status === "CANCELED") {
      return { success: false, error: "This event is already canceled." };
    }

    const [registrants, paidRegistrations] = await Promise.all([
      prisma.eventRegistration.findMany({
        where: { eventId: event.id, status: { in: [...ACTIVE_REGISTRATION_STATUSES] } },
        select: { registrant: { select: { email: true, name: true } } },
        distinct: ["registrantId"],
      }),
      prisma.eventRegistration.count({
        where: { eventId: event.id, payment: { status: { in: ["PAID", "PARTIALLY_REFUNDED"] } } },
      }),
    ]);

    await prisma.signupEvent.update({
      where: { id: event.id },
      data: { status: "CANCELED", canceledAt: new Date() },
    });

    await logSignupEventActivity({
      eventId: event.id,
      actorId: await requireUserId(),
      action: "canceled",
      summary: validated.reason ? `Event canceled: ${validated.reason}` : "Event canceled",
      details: { paidRegistrations },
    });

    try {
      await sendSignupEventCanceledEmail({
        recipients: registrants.map((registration) => registration.registrant),
        eventTitle: event.title,
        hostName: hostDisplayName(event),
        reason: validated.reason,
      });
    } catch (emailError) {
      console.error("Failed to send event cancellation notifications:", emailError);
    }

    revalidateEventPaths({ id: event.id, venue: event.venue, hostLeague: event.hostLeague });
    return { success: true, data: { eventId: event.id, paidRegistrations } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return { success: false, error: error.message };
    }
    console.error("Failed to cancel signup event:", error);
    return { success: false, error: "Failed to cancel the event." };
  }
}

/**
 * Duplicate an event's structure (details, slots, phases, payment config) into
 * a fresh DRAFT — never registrations, invitations, teams, games, or media.
 */
export async function duplicateSignupEvent(
  input: SignupEventCommandInput
): Promise<ActionResult<{ eventId: string }>> {
  try {
    const { eventId } = signupEventCommandSchema.parse(input);
    const userId = await requireEventManager(eventId);

    const source = await prisma.signupEvent.findUnique({
      where: { id: eventId },
      include: {
        slots: true,
        phases: { include: { divisions: { select: { id: true } }, teams: { select: { id: true } } } },
      },
    });
    if (!source) {
      return { success: false, error: "Event not found" };
    }

    const copy = await prisma.signupEvent.create({
      data: {
        title: `${source.title} (copy)`,
        description: source.description,
        category: source.category,
        ageClassification: source.ageClassification,
        status: "DRAFT",
        visibility: source.visibility,
        linkToken: source.visibility === "LINK" ? generateEventToken() : null,
        startAt: source.startAt,
        endAt: source.endAt,
        timezone: source.timezone,
        locationText: source.locationText,
        registrationOpensAt: source.registrationOpensAt,
        registrationClosesAt: source.registrationClosesAt,
        cancellationCutoffAt: source.cancellationCutoffAt,
        contactName: source.contactName,
        contactEmail: source.contactEmail,
        contactPhone: source.contactPhone,
        acceptsOnlinePayment: source.acceptsOnlinePayment,
        acceptsManualPayment: source.acceptsManualPayment,
        venmoHandle: source.venmoHandle,
        zelleHandle: source.zelleHandle,
        cashAppHandle: source.cashAppHandle,
        paymentPhone: source.paymentPhone,
        paymentInstructions: source.paymentInstructions,
        galleryEnabled: source.galleryEnabled,
        galleryVisibility: source.galleryVisibility,
        publicRoster: source.publicRoster,
        hostOrganizationId: source.hostOrganizationId,
        hostLeagueId: source.hostLeagueId,
        hostTeamId: source.hostTeamId,
        venueId: source.venueId,
        createdById: userId,
        slots: {
          create: source.slots.map((slot) => ({
            name: slot.name,
            description: slot.description,
            sortOrder: slot.sortOrder,
            capacity: slot.capacity,
            priceAmount: slot.priceAmount,
            priceCurrency: slot.priceCurrency,
            waitlistEnabled: slot.waitlistEnabled,
          })),
        },
        phases: {
          create: source.phases.map((phase) => ({
            name: phase.name,
            opensAt: phase.opensAt,
            audience: phase.audience,
            sortOrder: phase.sortOrder,
            divisions: { connect: phase.divisions.map((division) => ({ id: division.id })) },
            teams: { connect: phase.teams.map((team) => ({ id: team.id })) },
          })),
        },
      },
      select: { id: true },
    });

    revalidatePath("/signup-events");
    return { success: true, data: { eventId: copy.id } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return { success: false, error: error.message };
    }
    console.error("Failed to duplicate signup event:", error);
    return { success: false, error: "Failed to duplicate the event." };
  }
}

/** Regenerate the shareable link for a LINK-visibility event; the old link dies immediately. */
export async function regenerateEventLink(
  input: SignupEventCommandInput
): Promise<ActionResult<{ linkToken: string }>> {
  try {
    const { eventId } = signupEventCommandSchema.parse(input);
    await requireEventManager(eventId);

    const event = await prisma.signupEvent.findUnique({
      where: { id: eventId },
      select: { visibility: true },
    });
    if (!event) {
      return { success: false, error: "Event not found" };
    }
    if (event.visibility !== "LINK") {
      return { success: false, error: "Only link-visibility events have shareable links." };
    }

    const linkToken = generateEventToken();
    await prisma.signupEvent.update({ where: { id: eventId }, data: { linkToken } });

    revalidatePath(`/signup-events/${eventId}`);
    return { success: true, data: { linkToken } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return { success: false, error: error.message };
    }
    console.error("Failed to regenerate event link:", error);
    return { success: false, error: "Failed to regenerate the event link." };
  }
}

export type SlotAvailability = Record<string, { taken: number; remaining: number | null }>;

async function computeSlotAvailability(
  slots: Array<{ id: string; capacity: number | null }>
): Promise<SlotAvailability> {
  const availability: SlotAvailability = {};
  await Promise.all(
    slots.map(async (slot) => {
      const taken = await countCommittedSlotSpots(prisma, slot.id);
      availability[slot.id] = {
        taken,
        remaining: slot.capacity == null ? null : Math.max(0, slot.capacity - taken),
      };
    })
  );
  return availability;
}

export type PublicSignupEventView = {
  event: PublicSignupEvent;
  availability: SlotAvailability;
  viewerCanManage: boolean;
  /** Phase gate for THIS viewer: may they register right now? */
  viewerPhase: { eligibleNow: boolean; nextOpensAt: Date | null };
  /** True when the host merchant is onboarded and Stripe is configured. */
  onlinePaymentReady: boolean;
};

/**
 * Visibility-gated read used by the public event pages. PUBLIC events are open;
 * LINK events require the token; INVITE_ONLY events require a matching
 * invitation; PRIVATE (and DRAFT) events are manager-only.
 */
export async function getPublicSignupEvent(params: {
  eventId?: string;
  linkToken?: string;
}): Promise<PublicSignupEventView | null> {
  const { eventId, linkToken } = params;
  if (!eventId && !linkToken) return null;

  const gate = await prisma.signupEvent.findFirst({
    where: linkToken ? { linkToken } : { id: eventId },
    select: { id: true, status: true, visibility: true, linkToken: true },
  });
  if (!gate) return null;

  const userId = await getCurrentUserId();
  const viewerCanManage = userId ? await isEventManager(userId, gate.id) : false;

  const allowed = viewerCanManage || (await canViewSignupEvent(gate, { userId, linkToken }));
  if (!allowed) return null;

  const event = await prisma.signupEvent.findUnique({
    where: { id: gate.id },
    select: publicSignupEventSelect,
  });
  if (!event) return null;

  const hostIds = await prisma.signupEvent.findUnique({
    where: { id: gate.id },
    select: {
      hostOrganizationId: true,
      hostLeagueId: true,
      hostTeamId: true,
      hostOrganization: { select: { stripeAccountId: true, stripeChargesEnabled: true } },
      hostLeague: { select: { stripeAccountId: true, stripeChargesEnabled: true } },
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
  });

  const [availability, viewerPhase] = await Promise.all([
    computeSlotAvailability(event.slots),
    hostIds
      ? resolvePhaseEligibility(prisma, { id: gate.id, ...hostIds }, userId)
      : Promise.resolve({ eligibleNow: true, nextOpensAt: null }),
  ]);

  const merchantReady = Boolean(
    (hostIds?.hostOrganization?.stripeAccountId && hostIds.hostOrganization.stripeChargesEnabled) ||
      (hostIds?.hostLeague?.stripeAccountId && hostIds.hostLeague.stripeChargesEnabled)
  );
  const onlinePaymentReady = event.acceptsOnlinePayment && isStripeEnabled() && merchantReady;

  return { event, availability, viewerCanManage, viewerPhase, onlinePaymentReady };
}

/** PUBLIC + PUBLISHED (and recently CANCELED) events for discovery pages and rollups. */
export async function listPublicSignupEvents(filters?: {
  venueId?: string;
  hostLeagueId?: string;
  hostOrganizationId?: string;
  from?: Date;
  to?: Date;
}): Promise<PublicSignupEvent[]> {
  return prisma.signupEvent.findMany({
    where: {
      visibility: "PUBLIC",
      status: { in: ["PUBLISHED", "CANCELED"] },
      venueId: filters?.venueId,
      hostLeagueId: filters?.hostLeagueId,
      hostOrganizationId: filters?.hostOrganizationId,
      startAt: {
        gte: filters?.from ?? new Date(Date.now() - 24 * 60 * 60 * 1000),
        lte: filters?.to,
      },
    },
    orderBy: { startAt: "asc" },
    take: 100,
    select: publicSignupEventSelect,
  });
}

/** Events the current user can manage: host-admin roles plus per-event grants. */
export async function listMySignupEvents() {
  const userId = await requireUserId();

  const [managerGrants, orgStaff, leagueAdminRoles, teamAdminRoles] = await Promise.all([
    prisma.eventManager.findMany({ where: { userId }, select: { eventId: true } }),
    prisma.venueStaff.findMany({
      where: { userId, status: "ACTIVE", role: { in: ["OWNER", "MANAGER", "SCHEDULER"] } },
      select: { organizationId: true },
    }),
    prisma.leagueUser.findMany({
      where: { userId, role: "LEAGUE_ADMIN" },
      select: { leagueId: true },
    }),
    prisma.teamMember.findMany({
      where: { userId, role: "ADMIN" },
      select: { teamId: true },
    }),
  ]);

  return prisma.signupEvent.findMany({
    where: {
      OR: [
        { id: { in: managerGrants.map((grant) => grant.eventId) } },
        { hostOrganizationId: { in: orgStaff.map((staff) => staff.organizationId) } },
        { hostLeagueId: { in: leagueAdminRoles.map((role) => role.leagueId) } },
        { hostTeamId: { in: teamAdminRoles.map((role) => role.teamId) } },
      ],
    },
    orderBy: { startAt: "desc" },
    take: 200,
    select: {
      id: true,
      title: true,
      category: true,
      status: true,
      visibility: true,
      startAt: true,
      endAt: true,
      timezone: true,
      locationText: true,
      venue: { select: { name: true } },
      hostOrganization: { select: { name: true } },
      hostLeague: { select: { name: true } },
      hostTeam: { select: { name: true } },
      _count: { select: { registrations: true, slots: true } },
    },
  });
}

export type ManagedSignupEvent = NonNullable<Awaited<ReturnType<typeof getManagedSignupEvent>>>;

/** Full event detail for the management UI (manager-gated). */
export async function getManagedSignupEvent(eventId: string) {
  await requireEventManager(eventId);

  const event = await prisma.signupEvent.findUnique({
    where: { id: eventId },
    include: {
      venue: { select: { id: true, name: true, slug: true, timezone: true } },
      hostOrganization: { select: { id: true, name: true } },
      hostLeague: { select: { id: true, name: true, slug: true } },
      hostTeam: { select: { id: true, name: true } },
      slots: {
        orderBy: { sortOrder: "asc" },
        include: { _count: { select: { registrations: true } } },
      },
      phases: {
        orderBy: { sortOrder: "asc" },
        include: {
          divisions: { select: { id: true, name: true } },
          teams: { select: { id: true, name: true } },
        },
      },
      _count: { select: { registrations: true, invitations: true, managers: true } },
    },
  });
  if (!event) return null;

  const availability = await computeSlotAvailability(event.slots);
  return { ...event, availability };
}

export type HostOption = {
  kind: "organization" | "league" | "team";
  id: string;
  name: string;
};

/** Hosting entities the current user may create events for. */
export async function listMyHostOptions(): Promise<HostOption[]> {
  const userId = await requireUserId();

  const [orgStaff, leagueAdminRoles, teamAdminRoles] = await Promise.all([
    prisma.venueStaff.findMany({
      where: { userId, status: "ACTIVE", role: { in: ["OWNER", "MANAGER", "SCHEDULER"] } },
      select: { organization: { select: { id: true, name: true } } },
      distinct: ["organizationId"],
    }),
    prisma.leagueUser.findMany({
      where: { userId, role: "LEAGUE_ADMIN", league: { isActive: true } },
      select: { league: { select: { id: true, name: true } } },
    }),
    prisma.teamMember.findMany({
      where: { userId, role: "ADMIN", team: { isActive: true } },
      select: { team: { select: { id: true, name: true } } },
    }),
  ]);

  return [
    ...orgStaff.map((staff) => ({
      kind: "organization" as const,
      id: staff.organization.id,
      name: staff.organization.name,
    })),
    ...leagueAdminRoles.map((role) => ({
      kind: "league" as const,
      id: role.league.id,
      name: role.league.name,
    })),
    ...teamAdminRoles.map((role) => ({
      kind: "team" as const,
      id: role.team.id,
      name: role.team.name,
    })),
  ];
}

/** Active venues for the event form's venue picker. */
export async function listVenueOptions() {
  await requireUserId();
  return prisma.venue.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    take: 300,
    select: { id: true, name: true, city: true, state: true, timezone: true },
  });
}

export type HostGroupOptions = {
  divisions: Array<{ id: string; name: string }>;
  teams: Array<{ id: string; name: string }>;
};

/**
 * Divisions/teams selectable for a phase's SELECTED_GROUPS audience,
 * resolved from the hosting entity.
 */
export async function listHostGroupOptions(host: {
  kind: "organization" | "league" | "team";
  id: string;
}): Promise<HostGroupOptions> {
  await requireUserId();

  if (host.kind === "league") {
    const [divisions, teams] = await Promise.all([
      prisma.division.findMany({
        where: { leagueId: host.id, isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.team.findMany({
        where: { leagueId: host.id, isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);
    return { divisions, teams };
  }

  if (host.kind === "team") {
    const team = await prisma.team.findUnique({
      where: { id: host.id },
      select: { id: true, name: true },
    });
    return { divisions: [], teams: team ? [team] : [] };
  }

  // Organization hosts: teams with an active relationship to the org's venues.
  const teams = await prisma.team.findMany({
    where: {
      isActive: true,
      venueRelationships: {
        some: { status: "ACTIVE", venue: { organizationId: host.id } },
      },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return { divisions: [], teams };
}
