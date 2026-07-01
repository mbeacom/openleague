"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireUserId, requireVenueRequestManager, requireVenueStaffRole, VENUE_STAFF_ADMIN_ROLES } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/actions/venue-organizations";
import { logVenueActivity } from "@/lib/actions/venue-organizations";
import {
  sessionRegistrationSchema,
  registrationCommandSchema,
  refundRegistrationSchema,
  type SessionRegistrationInput,
  type RegistrationCommandInput,
  type RefundRegistrationInput,
} from "@/lib/utils/validation";
import {
  StripeDisabledError,
  computeApplicationFee,
  createRegistrationCheckoutSession,
  isStripeEnabled,
  refundPaymentIntent,
} from "@/lib/payments/stripe";
import { sendSessionRegistrationConfirmationEmail, sendSessionRegistrationManagerEmail } from "@/lib/email/templates";

export type RegisterForSessionResult = {
  registrationId: string;
  status: "CONFIRMED" | "PENDING";
  requiresPayment: boolean;
  checkoutUrl?: string;
};

/**
 * Count the spots already committed to a schedule block (confirmed + active holds).
 * PENDING registrations only hold a spot for HOLD_WINDOW_MS to avoid orphaned holds.
 */
const HOLD_WINDOW_MS = 30 * 60 * 1000;

async function countCommittedSpots(scheduleBlockId: string, excludeRegistrationId?: string): Promise<number> {
  const holdCutoff = new Date(Date.now() - HOLD_WINDOW_MS);
  const registrations = await prisma.sessionRegistration.findMany({
    where: {
      scheduleBlockId,
      id: excludeRegistrationId ? { not: excludeRegistrationId } : undefined,
      OR: [
        { status: "CONFIRMED" },
        { status: "PENDING", createdAt: { gte: holdCutoff } },
      ],
    },
    select: { quantity: true },
  });
  return registrations.reduce((total, reg) => total + reg.quantity, 0);
}

type RegistrableOffering = {
  kind: "block" | "lesson";
  title: string;
  priceAmount: number;
  currency: string;
  capacity: number | null;
  venue: { id: string; name: string; slug: string | null; organizationId: string | null };
  organization: {
    id: string;
    stripeAccountId: string | null;
    stripeChargesEnabled: boolean;
    platformFeeBps: number | null;
  } | null;
};

async function loadRegistrableOffering(
  input: { venueId: string; scheduleBlockId?: string; lessonOfferingId?: string }
): Promise<RegistrableOffering | { error: string }> {
  const organizationSelect = {
    select: {
      id: true,
      stripeAccountId: true,
      stripeChargesEnabled: true,
      platformFeeBps: true,
      status: true,
    },
  } as const;

  if (input.scheduleBlockId) {
    const block = await prisma.venueScheduleBlock.findFirst({
      where: { id: input.scheduleBlockId, venueId: input.venueId },
      select: {
        title: true,
        priceAmount: true,
        priceCurrency: true,
        capacity: true,
        status: true,
        visibility: true,
        registrationMode: true,
        venue: {
          select: {
            id: true,
            name: true,
            slug: true,
            organizationId: true,
            organization: organizationSelect,
          },
        },
      },
    });

    if (!block) return { error: "Session not found" };
    if (block.status !== "PUBLISHED" || block.visibility !== "PUBLIC") {
      return { error: "This session is not open for registration" };
    }
    if (block.registrationMode !== "SELF_REGISTER") {
      return { error: "This session is not open for online registration" };
    }
    return {
      kind: "block",
      title: block.title,
      priceAmount: block.priceAmount ?? 0,
      currency: block.priceCurrency,
      capacity: block.capacity,
      venue: {
        id: block.venue.id,
        name: block.venue.name,
        slug: block.venue.slug,
        organizationId: block.venue.organizationId,
      },
      organization: block.venue.organization,
    };
  }

  const lesson = await prisma.lessonOffering.findFirst({
    where: { id: input.lessonOfferingId, venueId: input.venueId },
    select: {
      title: true,
      priceAmount: true,
      priceCurrency: true,
      status: true,
      registrationMode: true,
      venue: {
        select: {
          id: true,
          name: true,
          slug: true,
          organizationId: true,
          organization: organizationSelect,
        },
      },
    },
  });

  if (!lesson) return { error: "Lesson not found" };
  if (lesson.status !== "PUBLISHED") {
    return { error: "This lesson is not open for registration" };
  }
  if (lesson.registrationMode !== "SELF_REGISTER") {
    return { error: "This lesson is not open for online registration" };
  }
  return {
    kind: "lesson",
    title: lesson.title,
    priceAmount: lesson.priceAmount ?? 0,
    currency: lesson.priceCurrency,
    capacity: null,
    venue: {
      id: lesson.venue.id,
      name: lesson.venue.name,
      slug: lesson.venue.slug,
      organizationId: lesson.venue.organizationId,
    },
    organization: lesson.venue.organization,
  };
}

/**
 * End-user opt-in for a self-register session or lesson. Free offerings confirm
 * instantly; paid offerings create a Stripe Checkout Session (direct charge on
 * the rink's connected account) and return a checkout URL.
 */
export async function registerForSession(
  input: SessionRegistrationInput
): Promise<ActionResult<RegisterForSessionResult>> {
  try {
    const validated = sessionRegistrationSchema.parse(input);
    const userId = await requireUserId();

    const offering = await loadRegistrableOffering({
      venueId: validated.venueId,
      scheduleBlockId: validated.scheduleBlockId || undefined,
      lessonOfferingId: validated.lessonOfferingId || undefined,
    });

    if ("error" in offering) {
      return { success: false, error: offering.error };
    }

    // Capacity check (schedule blocks only).
    if (offering.capacity != null && validated.scheduleBlockId) {
      const taken = await countCommittedSpots(validated.scheduleBlockId);
      if (taken + validated.quantity > offering.capacity) {
        const remaining = Math.max(0, offering.capacity - taken);
        return {
          success: false,
          error:
            remaining === 0
              ? "This session is full."
              : `Only ${remaining} spot${remaining === 1 ? "" : "s"} left for this session.`,
        };
      }
    }

    const unitAmount = offering.priceAmount;
    const quantity = validated.quantity;
    const amountTotal = unitAmount * quantity;
    const isPaid = amountTotal > 0;

    const baseData = {
      venueId: offering.venue.id,
      scheduleBlockId: validated.scheduleBlockId || null,
      lessonOfferingId: validated.lessonOfferingId || null,
      userId,
      participantName: validated.participantName,
      participantEmail: validated.participantEmail,
      participantPhone: validated.participantPhone || null,
      skillLevelNote: validated.skillLevelNote || null,
      notes: validated.notes || null,
      quantity,
      unitAmount,
      amountTotal,
      currency: offering.currency,
    };

    // --- Free registration: confirm immediately ---
    if (!isPaid) {
      const registration = await prisma.sessionRegistration.create({
        data: { ...baseData, status: "CONFIRMED", confirmedAt: new Date() },
        select: { id: true },
      });

      await afterConfirmation({
        registrationId: registration.id,
        offering,
        participantEmail: validated.participantEmail,
        participantName: validated.participantName,
        quantity,
        amountTotal,
        currency: offering.currency,
      });

      revalidateRegistrationPaths(offering);
      return {
        success: true,
        data: { registrationId: registration.id, status: "CONFIRMED", requiresPayment: false },
      };
    }

    // --- Paid registration: require an onboarded Stripe account ---
    if (!isStripeEnabled()) {
      return { success: false, error: "Online payments are not available right now." };
    }
    if (!offering.organization?.stripeAccountId || !offering.organization.stripeChargesEnabled) {
      return { success: false, error: "This rink hasn't finished setting up online payments yet." };
    }

    const organizationId = offering.organization.id;
    const applicationFeeAmount = computeApplicationFee(amountTotal, offering.organization.platformFeeBps);

    // Create the registration + payment placeholder before contacting Stripe.
    const registration = await prisma.sessionRegistration.create({
      data: {
        ...baseData,
        status: "PENDING",
        payment: {
          create: {
            status: "REQUIRES_PAYMENT",
            amount: amountTotal,
            currency: offering.currency,
            applicationFeeAmount,
            stripeAccountId: offering.organization.stripeAccountId,
            venueId: offering.venue.id,
            organizationId,
          },
        },
      },
      select: { id: true },
    });

    const slug = offering.venue.slug;
    const successPath = slug
      ? `/rinks/${slug}/schedule?registration=success`
      : `/my-registrations?registration=success`;
    const cancelPath = slug
      ? `/rinks/${slug}/schedule?registration=canceled`
      : `/my-registrations?registration=canceled`;

    try {
      const checkout = await createRegistrationCheckoutSession({
        connectedAccountId: offering.organization.stripeAccountId,
        registrationId: registration.id,
        productName: `${offering.title} — ${offering.venue.name}`,
        productDescription: offering.kind === "lesson" ? "Lesson registration" : "Session registration",
        unitAmount,
        currency: offering.currency,
        quantity,
        applicationFeeAmount,
        customerEmail: validated.participantEmail,
        successPath,
        cancelPath,
        metadata: { venueId: offering.venue.id, organizationId },
      });

      await prisma.payment.update({
        where: { registrationId: registration.id },
        data: { stripeCheckoutSessionId: checkout.id },
      });

      revalidateRegistrationPaths(offering);
      return {
        success: true,
        data: {
          registrationId: registration.id,
          status: "PENDING",
          requiresPayment: true,
          checkoutUrl: checkout.url ?? undefined,
        },
      };
    } catch (stripeError) {
      // Roll back the pending registration if checkout could not be created.
      await prisma.sessionRegistration.update({
        where: { id: registration.id },
        data: { status: "EXPIRED", payment: { update: { status: "CANCELED" } } },
      });
      if (stripeError instanceof StripeDisabledError) {
        return { success: false, error: stripeError.message };
      }
      return { success: false, error: "Could not start checkout. Please try again." };
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to register for this session." };
  }
}

/**
 * Cancel the current user's own registration. Unpaid/free registrations cancel
 * immediately; paid & confirmed registrations must be refunded by the rink.
 */
export async function cancelMyRegistration(
  input: { registrationId: string }
): Promise<ActionResult<{ registrationId: string; status: string }>> {
  try {
    const registrationId = registrationCommandSchema.shape.registrationId.parse(input.registrationId);
    const userId = await requireUserId();

    const registration = await prisma.sessionRegistration.findFirst({
      where: { id: registrationId, userId },
      select: {
        id: true,
        status: true,
        amountTotal: true,
        venue: { select: { id: true, slug: true, organizationId: true } },
      },
    });

    if (!registration) {
      return { success: false, error: "Registration not found" };
    }

    if (registration.status === "CANCELED" || registration.status === "REFUNDED") {
      return { success: false, error: "This registration is already canceled." };
    }

    if (registration.amountTotal > 0 && registration.status === "CONFIRMED") {
      return { success: false, error: "This is a paid registration — contact the rink to request a refund." };
    }

    const updated = await prisma.sessionRegistration.update({
      where: { id: registration.id },
      data: {
        status: "CANCELED",
        canceledAt: new Date(),
        canceledById: userId,
        payment: registration.amountTotal > 0 ? { update: { status: "CANCELED" } } : undefined,
      },
      select: { id: true, status: true },
    });

    revalidatePath("/my-registrations");
    if (registration.venue.slug) {
      revalidatePath(`/rinks/${registration.venue.slug}/schedule`);
    }
    return { success: true, data: { registrationId: updated.id, status: updated.status } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to cancel registration." };
  }
}

/** List the current user's registrations across all rinks. */
export async function getMyRegistrations() {
  const userId = await requireUserId();
  return prisma.sessionRegistration.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      participantName: true,
      quantity: true,
      amountTotal: true,
      currency: true,
      createdAt: true,
      confirmedAt: true,
      venue: { select: { id: true, name: true, slug: true } },
      scheduleBlock: { select: { id: true, title: true, startsAt: true, endsAt: true, activityType: true } },
      lessonOffering: { select: { id: true, title: true, lessonType: true } },
      payment: { select: { status: true, receiptUrl: true, amount: true, refundedAmount: true } },
    },
  });
}

/** Admin: list registrations for a venue plus a revenue summary. */
export async function getVenueRegistrations(input: { organizationId: string; venueId: string }) {
  await requireVenueRequestManager(input.organizationId, input.venueId);

  const [registrations, paidAgg] = await Promise.all([
    prisma.sessionRegistration.findMany({
      where: { venueId: input.venueId },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true,
        status: true,
        participantName: true,
        participantEmail: true,
        skillLevelNote: true,
        quantity: true,
        amountTotal: true,
        currency: true,
        createdAt: true,
        scheduleBlock: { select: { id: true, title: true, startsAt: true, activityType: true } },
        lessonOffering: { select: { id: true, title: true, lessonType: true } },
        payment: { select: { status: true, amount: true, refundedAmount: true, applicationFeeAmount: true } },
      },
    }),
    prisma.payment.aggregate({
      where: { venueId: input.venueId, status: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
      _sum: { amount: true, refundedAmount: true, applicationFeeAmount: true },
      _count: true,
    }),
  ]);

  const grossCents = paidAgg._sum.amount ?? 0;
  const refundedCents = paidAgg._sum.refundedAmount ?? 0;
  const feeCents = paidAgg._sum.applicationFeeAmount ?? 0;

  return {
    registrations,
    summary: {
      paidCount: paidAgg._count,
      grossCents,
      refundedCents,
      platformFeeCents: feeCents,
      netCents: grossCents - refundedCents - feeCents,
    },
  };
}

/** Admin: refund a paid registration via Stripe and mark it refunded. */
export async function refundRegistration(
  input: RefundRegistrationInput
): Promise<ActionResult<{ registrationId: string; status: string }>> {
  try {
    const validated = refundRegistrationSchema.parse(input);
    const actorId = await requireVenueStaffRole(validated.organizationId, VENUE_STAFF_ADMIN_ROLES, validated.venueId);

    const registration = await prisma.sessionRegistration.findFirst({
      where: { id: validated.registrationId, venueId: validated.venueId },
      select: {
        id: true,
        status: true,
        amountTotal: true,
        venue: { select: { organizationId: true, slug: true } },
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

    if (!registration || registration.venue.organizationId !== validated.organizationId) {
      return { success: false, error: "Registration not found" };
    }
    const payment = registration.payment;
    if (!payment || payment.status !== "PAID" || !payment.stripePaymentIntentId || !payment.stripeAccountId) {
      return { success: false, error: "This registration has no captured payment to refund." };
    }

    await refundPaymentIntent({
      paymentIntentId: payment.stripePaymentIntentId,
      connectedAccountId: payment.stripeAccountId,
    });

    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: "REFUNDED", refundedAmount: payment.amount, refundedAt: new Date() },
      }),
      prisma.sessionRegistration.update({
        where: { id: registration.id },
        data: { status: "REFUNDED", canceledAt: new Date(), canceledById: actorId },
      }),
    ]);

    await logVenueActivity({
      venueId: validated.venueId,
      actorId,
      action: "registration.refunded",
      resourceType: "SessionRegistration",
      resourceId: registration.id,
      summary: `Refunded registration ${registration.id}`,
    });

    revalidatePath(`/venue-admin/${validated.organizationId}/venues/${validated.venueId}/registrations`);
    if (registration.venue.slug) {
      revalidatePath(`/rinks/${registration.venue.slug}/schedule`);
    }
    return { success: true, data: { registrationId: registration.id, status: "REFUNDED" } };
  } catch (error) {
    if (error instanceof StripeDisabledError) {
      return { success: false, error: error.message };
    }
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to refund registration." };
  }
}

async function afterConfirmation(input: {
  registrationId: string;
  offering: RegistrableOffering;
  participantEmail: string;
  participantName: string;
  quantity: number;
  amountTotal: number;
  currency: string;
}) {
  await sendSessionRegistrationConfirmationEmail({
    to: input.participantEmail,
    participantName: input.participantName,
    venueName: input.offering.venue.name,
    offeringTitle: input.offering.title,
    quantity: input.quantity,
    amountTotal: input.amountTotal,
    currency: input.currency,
  });

  const managerEmails = await getVenueManagerEmails(input.offering.venue.organizationId);
  if (managerEmails.length > 0) {
    await sendSessionRegistrationManagerEmail({
      managerEmails,
      venueName: input.offering.venue.name,
      offeringTitle: input.offering.title,
      participantName: input.participantName,
      quantity: input.quantity,
    });
  }
}

async function getVenueManagerEmails(organizationId: string | null): Promise<string[]> {
  if (!organizationId) return [];
  const staff = await prisma.venueStaff.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      role: { in: ["OWNER", "MANAGER", "REQUEST_MANAGER"] },
    },
    select: { user: { select: { email: true } } },
  });
  return staff.map((member) => member.user.email);
}

function revalidateRegistrationPaths(offering: RegistrableOffering) {
  if (offering.venue.slug) {
    revalidatePath(`/rinks/${offering.venue.slug}/schedule`);
    revalidatePath(`/rinks/${offering.venue.slug}`);
  }
  revalidatePath("/my-registrations");
  if (offering.venue.organizationId) {
    revalidatePath(`/venue-admin/${offering.venue.organizationId}/venues/${offering.venue.id}/registrations`);
  }
}
