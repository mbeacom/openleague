import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db/prisma";
import {
  constructConnectWebhookEvent,
  getStripeClient,
  isStripeEnabled,
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
        await handleChargeRefunded(event.data.object as Stripe.Charge);
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

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  connectedAccountId?: string | null
): Promise<void> {
  if (session.payment_status !== "paid") return;

  const payment = await prisma.payment.findUnique({
    where: { stripeCheckoutSessionId: session.id },
    select: {
      id: true,
      status: true,
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
          scheduleBlock: { select: { title: true } },
          lessonOffering: { select: { title: true } },
        },
      },
    },
  });

  if (!payment || !payment.registration) return;
  if (payment.status === "PAID") return; // idempotent

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

  const receiptUrl = await resolveReceiptUrl(paymentIntentId, connectedAccountId ?? payment.stripeAccountId);

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "PAID",
        stripePaymentIntentId: paymentIntentId,
        receiptUrl,
        paidAt: new Date(),
      },
    }),
    prisma.sessionRegistration.update({
      where: { id: payment.registration.id },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    }),
  ]);

  const reg = payment.registration;
  const offeringTitle = reg.scheduleBlock?.title ?? reg.lessonOffering?.title ?? "your session";

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
  const payment = await prisma.payment.findFirst({
    where: { stripePaymentIntentId: paymentIntent.id },
    select: { id: true, status: true, registrationId: true },
  });
  if (!payment || payment.status === "PAID") return;

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "FAILED",
      failureReason: paymentIntent.last_payment_error?.message ?? "Payment failed",
    },
  });
}

async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) return;

  const payment = await prisma.payment.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
    select: { id: true, amount: true, registrationId: true },
  });
  if (!payment) return;

  const refundedAmount = charge.amount_refunded;
  const fullyRefunded = refundedAmount >= payment.amount;

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
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
