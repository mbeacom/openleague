import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db/prisma";
import {
  constructConnectWebhookEvent,
  getStripeClient,
  isStripeEnabled,
  refundPaymentIntent,
} from "@/lib/payments/stripe";
import { env } from "@/lib/env";
import {
  sendSessionRegistrationConfirmationEmail,
  sendSessionRegistrationManagerEmail,
} from "@/lib/email/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe Connect webhook endpoint. Events originate from connected accounts and
 * are verified with STRIPE_CONNECT_WEBHOOK_SECRET. Handlers are idempotent.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isStripeEnabled() || !env.STRIPE_CONNECT_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Payments not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = constructConnectWebhookEvent(payload, signature);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid signature";
    return NextResponse.json({ error: `Webhook verification failed: ${message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, event.account);
        break;
      case "checkout.session.expired":
        await handleCheckoutExpired(event.data.object as Stripe.Checkout.Session);
        break;
      case "payment_intent.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      case "charge.refunded":
        await handleChargeRefunded(event.data.object as Stripe.Charge, event.account);
        break;
      case "account.updated":
        await handleAccountUpdated(event.data.object as Stripe.Account);
        break;
      default:
        break;
    }
  } catch (error) {
    console.error(`Stripe webhook handler error for ${event.type}:`, error);
    // Return 500 so Stripe retries transient failures.
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

const checkoutPaymentSelect = {
  id: true,
  status: true,
  amount: true,
  stripeAccountId: true,
  registration: {
    select: {
      id: true,
      status: true,
      participantEmail: true,
      participantName: true,
      quantity: true,
      amountTotal: true,
      currency: true,
      venue: { select: { name: true, slug: true, organizationId: true } },
      scheduleBlock: { select: { id: true, title: true, capacity: true } },
      lessonOffering: { select: { title: true } },
    },
  },
} as const;

/** Locate the payment for a completed checkout, falling back to the registration id. */
async function findCheckoutPayment(sessionId: string, registrationId: string | null) {
  const bySession = await prisma.payment.findUnique({
    where: { stripeCheckoutSessionId: sessionId },
    select: checkoutPaymentSelect,
  });
  if (bySession) return bySession;
  if (!registrationId) return null;
  return prisma.payment.findUnique({
    where: { registrationId },
    select: checkoutPaymentSelect,
  });
}

/** Sum confirmed spots for a schedule block, excluding one registration. */
async function countConfirmedSpots(scheduleBlockId: string, excludeRegistrationId: string): Promise<number> {
  const result = await prisma.sessionRegistration.aggregate({
    where: { scheduleBlockId, id: { not: excludeRegistrationId }, status: "CONFIRMED" },
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
}

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  connectedAccountId?: string | null
): Promise<void> {
  if (session.payment_status !== "paid") return;

  const registrationId =
    session.client_reference_id ??
    (typeof session.metadata?.registrationId === "string" ? session.metadata.registrationId : null);

  const payment = await findCheckoutPayment(session.id, registrationId);

  if (!payment || !payment.registration) return;
  // Only confirm an outstanding, still-pending hold. This makes the handler
  // idempotent and prevents a canceled/expired registration from being revived
  // by a late payment on a stale checkout URL.
  if (payment.status !== "REQUIRES_PAYMENT" && payment.status !== "PROCESSING") return;
  if (payment.registration.status !== "PENDING") return;

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  const account = connectedAccountId ?? payment.stripeAccountId;
  const reg = payment.registration;

  // Capacity re-check: a late payment must not oversell a schedule block.
  if (reg.scheduleBlock?.capacity != null) {
    const confirmed = await countConfirmedSpots(reg.scheduleBlock.id, reg.id);
    if (confirmed + reg.quantity > reg.scheduleBlock.capacity) {
      if (paymentIntentId && account) {
        try {
          await refundPaymentIntent({
            paymentIntentId,
            connectedAccountId: account,
            refundApplicationFee: true,
            idempotencyKey: `overbook-refund:${reg.id}`,
          });
        } catch (refundError) {
          console.error("Failed to auto-refund overbooked registration:", refundError);
        }
      }
      await prisma.$transaction([
        prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: "REFUNDED",
            stripePaymentIntentId: paymentIntentId,
            stripeCheckoutSessionId: session.id,
            paidAt: new Date(),
            refundedAmount: payment.amount,
            refundedAt: new Date(),
          },
        }),
        prisma.sessionRegistration.update({ where: { id: reg.id }, data: { status: "EXPIRED" } }),
      ]);
      return;
    }
  }

  const receiptUrl = await resolveReceiptUrl(paymentIntentId, account);

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "PAID",
        stripePaymentIntentId: paymentIntentId,
        stripeCheckoutSessionId: session.id,
        receiptUrl,
        paidAt: new Date(),
      },
    }),
    prisma.sessionRegistration.update({
      where: { id: reg.id },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    }),
  ]);

  const offeringTitle = reg.scheduleBlock?.title ?? reg.lessonOffering?.title ?? "your session";

  try {
    await sendSessionRegistrationConfirmationEmail({
      to: reg.participantEmail,
      participantName: reg.participantName,
      venueName: reg.venue.name,
      offeringTitle,
      quantity: reg.quantity,
      amountTotal: reg.amountTotal,
      currency: reg.currency,
      receiptUrl,
    });

    const managerEmails = await getVenueManagerEmails(reg.venue.organizationId);
    if (managerEmails.length > 0) {
      await sendSessionRegistrationManagerEmail({
        managerEmails,
        venueName: reg.venue.name,
        offeringTitle,
        participantName: reg.participantName,
        quantity: reg.quantity,
      });
    }
  } catch (emailError) {
    // The payment is already recorded; do not fail the webhook on email errors.
    console.error("Failed to send registration confirmation email:", emailError);
  }
}

async function handleCheckoutExpired(session: Stripe.Checkout.Session): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { stripeCheckoutSessionId: session.id },
    select: { id: true, status: true, registrationId: true },
  });
  if (!payment || payment.status === "PAID") return;

  await prisma.$transaction([
    prisma.payment.update({ where: { id: payment.id }, data: { status: "CANCELED" } }),
    prisma.sessionRegistration.updateMany({
      where: { id: payment.registrationId, status: "PENDING" },
      data: { status: "EXPIRED" },
    }),
  ]);
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  let payment = await prisma.payment.findFirst({
    where: { stripePaymentIntentId: paymentIntent.id },
    select: { id: true, status: true, registrationId: true },
  });
  // Fall back to the registration id carried in PaymentIntent metadata in case
  // this event arrives before checkout.session.completed stored the intent id.
  if (!payment) {
    const registrationId =
      typeof paymentIntent.metadata?.registrationId === "string" ? paymentIntent.metadata.registrationId : null;
    if (registrationId) {
      payment = await prisma.payment.findUnique({
        where: { registrationId },
        select: { id: true, status: true, registrationId: true },
      });
    }
  }
  if (!payment || payment.status === "PAID") return;

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "FAILED",
      stripePaymentIntentId: paymentIntent.id,
      failureReason: paymentIntent.last_payment_error?.message ?? "Payment failed",
    },
  });
}

async function handleChargeRefunded(charge: Stripe.Charge, connectedAccountId?: string | null): Promise<void> {
  const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) return;

  let payment = await prisma.payment.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
    select: { id: true, amount: true, status: true, registrationId: true },
  });

  // If the completed webhook has not yet stored the intent id, reconcile via the
  // registration id carried in PaymentIntent metadata.
  if (!payment && connectedAccountId) {
    try {
      const intent = await getStripeClient().paymentIntents.retrieve(
        paymentIntentId,
        {},
        { stripeAccount: connectedAccountId }
      );
      const registrationId =
        typeof intent.metadata?.registrationId === "string" ? intent.metadata.registrationId : null;
      if (registrationId) {
        payment = await prisma.payment.findUnique({
          where: { registrationId },
          select: { id: true, amount: true, status: true, registrationId: true },
        });
      }
    } catch (retrieveError) {
      console.error("Failed to retrieve PaymentIntent for refund reconciliation:", retrieveError);
    }
  }

  if (!payment) return;

  const refundedAmount = charge.amount_refunded;
  const fullyRefunded = refundedAmount >= payment.amount;

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
        stripePaymentIntentId: paymentIntentId,
        refundedAmount,
        refundedAt: new Date(),
      },
    }),
    ...(fullyRefunded
      ? [
          prisma.sessionRegistration.update({
            where: { id: payment.registrationId },
            data: { status: "REFUNDED", canceledAt: new Date() },
          }),
        ]
      : []),
  ]);
}

async function handleAccountUpdated(account: Stripe.Account): Promise<void> {
  await prisma.venueOrganization.updateMany({
    where: { stripeAccountId: account.id },
    data: {
      stripeChargesEnabled: Boolean(account.charges_enabled),
      stripePayoutsEnabled: Boolean(account.payouts_enabled),
      stripeDetailsSubmitted: Boolean(account.details_submitted),
    },
  });
}

async function resolveReceiptUrl(
  paymentIntentId: string | null,
  connectedAccountId?: string | null
): Promise<string | null> {
  if (!paymentIntentId || !connectedAccountId) return null;
  try {
    const stripe = getStripeClient();
    const intent = await stripe.paymentIntents.retrieve(
      paymentIntentId,
      { expand: ["latest_charge"] },
      { stripeAccount: connectedAccountId }
    );
    const charge = intent.latest_charge;
    if (charge && typeof charge !== "string") {
      return charge.receipt_url ?? null;
    }
  } catch (error) {
    console.error("Failed to resolve Stripe receipt URL:", error);
  }
  return null;
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
