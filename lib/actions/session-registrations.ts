"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUserId, requireVenueRequestManager, requireVenueStaffRole, VENUE_STAFF_ADMIN_ROLES } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/actions/venue-organizations";
import { logVenueActivity } from "@/lib/services/venue-activity";
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
  expireCheckoutSession,
  isStripeEnabled,
  refundPaymentIntent,
} from "@/lib/payments/stripe";
import { sendSessionRegistrationConfirmationEmail, sendSessionRegistrationManagerEmail } from "@/lib/email/templates";
import { computeRevenueSummary } from "@/lib/payments/revenue";

export type RegisterForSessionResult = {
  registrationId: string;
  status: "CONFIRMED" | "PENDING";
  requiresPayment: boolean;
  checkoutUrl?: string;
};

type PrismaClientLike = Prisma.TransactionClient | typeof prisma;

/**
 * Count the spots already committed to a schedule block (confirmed + active holds).
 * PENDING registrations only hold a spot for HOLD_WINDOW_MS to avoid orphaned holds.
 */
const HOLD_WINDOW_MS = 30 * 60 * 1000;

/** Thrown inside the reservation transaction when a block is at capacity. */
class CapacityError extends Error {
  constructor(public readonly remaining: number) {
    super("Session at capacity");
    this.name = "CapacityError";
  }
}

/** True for Prisma serialization/write-conflict failures worth retrying. */
function isSerializationError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2034" || error.code === "P2028")
  );
}

async function countCommittedSpots(
  client: PrismaClientLike,
  scheduleBlockId: string,
  excludeRegistrationId?: string
): Promise<number> {
  const holdCutoff = new Date(Date.now() - HOLD_WINDOW_MS);
  const result = await client.sessionRegistration.aggregate({
    where: {
      scheduleBlockId,
      id: excludeRegistrationId ? { not: excludeRegistrationId } : undefined,
      OR: [
        { status: "CONFIRMED" },
        { status: "PENDING", createdAt: { gte: holdCutoff } },
      ],
    },
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
}

/**
 * Atomically enforce capacity and create the registration row. Runs in a
 * serializable transaction so concurrent registrations cannot oversell a block.
 * Throws {@link CapacityError} when full.
 */
async function reserveRegistration(params: {
  scheduleBlockId: string | null;
  capacity: number | null;
  quantity: number;
  data: Prisma.SessionRegistrationCreateArgs["data"];
}): Promise<string> {
  return prisma.$transaction(
    async (tx) => {
      if (params.capacity != null && params.scheduleBlockId) {
        const taken = await countCommittedSpots(tx, params.scheduleBlockId);
        if (taken + params.quantity > params.capacity) {
          throw new CapacityError(Math.max(0, params.capacity - taken));
        }
      }
      const registration = await tx.sessionRegistration.create({ data: params.data, select: { id: true } });
      return registration.id;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
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

    const scheduleBlockId = validated.scheduleBlockId || null;

    // --- Free registration: reserve + confirm atomically ---
    if (!isPaid) {
      const registrationId = await reserveRegistration({
        scheduleBlockId,
        capacity: offering.capacity,
        quantity,
        data: { ...baseData, status: "CONFIRMED", confirmedAt: new Date() },
      });

      await afterConfirmation({
        registrationId,
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
        data: { registrationId, status: "CONFIRMED", requiresPayment: false },
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

    // Reserve a PENDING hold (capacity-enforced) with a payment placeholder.
    const registrationId = await reserveRegistration({
      scheduleBlockId,
      capacity: offering.capacity,
      quantity,
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
        registrationId,
        productName: `${offering.title} — ${offering.venue.name}`,
        productDescription: offering.kind === "lesson" ? "Lesson registration" : "Session registration",
        unitAmount,
        currency: offering.currency,
        quantity,
        applicationFeeAmount,
        customerEmail: validated.participantEmail,
        successPath,
        cancelPath,
        // Match the app-level hold window so late payments cannot overbook.
        expiresInSeconds: Math.floor(HOLD_WINDOW_MS / 1000),
        metadata: { venueId: offering.venue.id, organizationId },
      });

      await prisma.payment.update({
        where: { registrationId },
        data: { stripeCheckoutSessionId: checkout.id },
      });

      revalidateRegistrationPaths(offering);
      return {
        success: true,
        data: {
          registrationId,
          status: "PENDING",
          requiresPayment: true,
          checkoutUrl: checkout.url ?? undefined,
        },
      };
    } catch (stripeError) {
      // Roll back the pending registration if checkout could not be created.
      await prisma.sessionRegistration.update({
        where: { id: registrationId },
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
    if (error instanceof CapacityError) {
      return {
        success: false,
        error:
          error.remaining === 0
            ? "This session is full."
            : `Only ${error.remaining} spot${error.remaining === 1 ? "" : "s"} left for this session.`,
      };
    }
    if (isSerializationError(error)) {
      return { success: false, error: "This session is filling up fast — please try again." };
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
        payment: {
          select: { id: true, status: true, stripeCheckoutSessionId: true, stripeAccountId: true },
        },
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

    // For a paid PENDING hold, expire the open Checkout Session first so the
    // customer cannot pay the stale URL and resurrect a canceled registration.
    const payment = registration.payment;
    if (payment?.stripeCheckoutSessionId && payment.stripeAccountId && payment.status !== "PAID") {
      try {
        await expireCheckoutSession(payment.stripeCheckoutSessionId, payment.stripeAccountId);
      } catch (expireError) {
        console.error("Failed to expire Stripe Checkout session on cancel:", expireError);
      }
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

  // Bind venue to organization: org-wide staff roles authorize any venueId, so we
  // must confirm the venue actually belongs to this org before returning data.
  const venue = await prisma.venue.findFirst({
    where: { id: input.venueId, organizationId: input.organizationId },
    select: { id: true },
  });
  if (!venue) {
    throw new Error("Venue not found for this organization");
  }

  const [registrations, summary] = await Promise.all([
    prisma.sessionRegistration.findMany({
      where: { venueId: input.venueId, venue: { organizationId: input.organizationId } },
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
    computeRevenueSummary({ venueId: input.venueId, organizationId: input.organizationId }),
  ]);

  return { registrations, summary };
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
    const refundable = payment?.status === "PAID" || payment?.status === "PARTIALLY_REFUNDED";
    if (!payment || !refundable || !payment.stripePaymentIntentId || !payment.stripeAccountId) {
      return { success: false, error: "This registration has no captured payment to refund." };
    }

    const remaining = payment.amount - payment.refundedAmount;
    if (remaining <= 0) {
      return { success: false, error: "This payment has already been fully refunded." };
    }

    // Claim the payment for refunding so concurrent requests cannot double-refund.
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
        // Refund the outstanding balance; omit amount for a never-refunded payment.
        amount: payment.refundedAmount > 0 ? remaining : undefined,
        refundApplicationFee: true,
        idempotencyKey: `refund-full:${registration.id}`,
      });
    } catch (stripeError) {
      // Release the claim so the admin can retry.
      await prisma.payment.update({ where: { id: payment.id }, data: { status: payment.status } });
      throw stripeError;
    }

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
  // Notifications are best-effort: a mail failure must not fail a committed
  // registration (which would prompt the user to retry and double-register).
  try {
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
  } catch (emailError) {
    console.error("Failed to send registration confirmation email:", emailError);
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
