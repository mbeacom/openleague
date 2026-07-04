import Stripe from "stripe";
import { env, DEFAULT_PLATFORM_FEE_BPS, getBaseUrl } from "@/lib/env";

/**
 * Thrown when a payment operation is attempted but Stripe is not configured.
 * Callers should catch this and surface a friendly "payments unavailable" message.
 */
export class StripeDisabledError extends Error {
  constructor(message = "Online payments are not configured for this environment.") {
    super(message);
    this.name = "StripeDisabledError";
  }
}

const globalForStripe = globalThis as unknown as {
  stripe: Stripe | undefined;
};

export function isStripeEnabled(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

/**
 * Lazily construct a singleton Stripe client. Throws {@link StripeDisabledError}
 * when STRIPE_SECRET_KEY is unset so paid flows degrade gracefully.
 */
export function getStripeClient(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new StripeDisabledError();
  }

  if (!globalForStripe.stripe) {
    globalForStripe.stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      appInfo: { name: "OpenLeague", url: "https://openl.app" },
      typescript: true,
    });
  }

  return globalForStripe.stripe;
}

/**
 * Compute a platform application fee (in cents) from a gross amount and basis points.
 * Falls back to the platform default when the organization override is null/undefined.
 */
export function computeApplicationFee(amountCents: number, feeBps?: number | null): number {
  const bps = feeBps ?? DEFAULT_PLATFORM_FEE_BPS;
  if (!bps || bps <= 0 || amountCents <= 0) {
    return 0;
  }
  // Round down so the platform never over-charges the rink.
  return Math.floor((amountCents * bps) / 10_000);
}

export interface ConnectAccountInput {
  organizationId: string;
  organizationName: string;
  email?: string | null;
}

/**
 * Create an Express connected account for a venue organization. The organization
 * is the merchant of record and receives funds directly (direct charges).
 */
export async function createConnectAccount(input: ConnectAccountInput): Promise<Stripe.Account> {
  const stripe = getStripeClient();
  return stripe.accounts.create({
    type: "express",
    email: input.email ?? undefined,
    business_profile: {
      name: input.organizationName,
      product_description: "Ice rink sessions, lessons, and programs",
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { organizationId: input.organizationId },
  });
}

/**
 * Create an Express connected account for a league/association hosting signup
 * events. Mirrors {@link createConnectAccount} with league-appropriate metadata.
 */
export async function createLeagueConnectAccount(input: {
  leagueId: string;
  leagueName: string;
  email?: string | null;
}): Promise<Stripe.Account> {
  const stripe = getStripeClient();
  return stripe.accounts.create({
    type: "express",
    email: input.email ?? undefined,
    business_profile: {
      name: input.leagueName,
      product_description: "Youth sports events, clinics, and programs",
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { leagueId: input.leagueId },
  });
}

/**
 * Create an onboarding/account-management link the rink owner uses to complete
 * Stripe Connect verification.
 */
export async function createAccountLink(
  accountId: string,
  paths: { refreshPath: string; returnPath: string }
): Promise<Stripe.AccountLink> {
  const stripe = getStripeClient();
  const baseUrl = getBaseUrl() || env.NEXTAUTH_URL;
  return stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${baseUrl}${paths.refreshPath}`,
    return_url: `${baseUrl}${paths.returnPath}`,
    type: "account_onboarding",
  });
}

/**
 * Create a Stripe Express dashboard login link so onboarded rinks can view payouts.
 */
export async function createLoginLink(accountId: string): Promise<Stripe.LoginLink> {
  const stripe = getStripeClient();
  return stripe.accounts.createLoginLink(accountId);
}

export async function retrieveAccount(accountId: string): Promise<Stripe.Account> {
  const stripe = getStripeClient();
  return stripe.accounts.retrieve(accountId);
}

export interface RegistrationCheckoutInput {
  connectedAccountId: string;
  registrationId: string;
  productName: string;
  productDescription?: string;
  unitAmount: number; // cents
  currency: string;
  quantity: number;
  applicationFeeAmount: number; // cents
  customerEmail?: string | null;
  successPath: string;
  cancelPath: string;
  /** Seconds from now the Checkout Session should expire (min 1800, max 86400). */
  expiresInSeconds?: number;
  metadata?: Record<string, string>;
}

/**
 * Create a Checkout Session as a DIRECT charge on the rink's connected account.
 * The customer pays the rink; OpenLeague collects an optional application fee.
 */
export async function createRegistrationCheckoutSession(
  input: RegistrationCheckoutInput
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripeClient();
  const baseUrl = getBaseUrl() || env.NEXTAUTH_URL;

  // Stripe requires expires_at between 30 minutes and 24 hours from creation.
  const expiresInSeconds = Math.min(Math.max(input.expiresInSeconds ?? 1800, 1800), 86400);
  const metadata = { registrationId: input.registrationId, ...input.metadata };

  return stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer_email: input.customerEmail ?? undefined,
      expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
      line_items: [
        {
          quantity: input.quantity,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: input.unitAmount,
            product_data: {
              name: input.productName,
              description: input.productDescription || undefined,
            },
          },
        },
      ],
      // Always attach metadata to the PaymentIntent so refund/failure webhooks
      // can reconcile even if they arrive before checkout.session.completed.
      payment_intent_data: {
        metadata,
        ...(input.applicationFeeAmount > 0
          ? { application_fee_amount: input.applicationFeeAmount }
          : {}),
      },
      success_url: `${baseUrl}${input.successPath}`,
      cancel_url: `${baseUrl}${input.cancelPath}`,
      client_reference_id: input.registrationId,
      metadata,
    },
    { stripeAccount: input.connectedAccountId }
  );
}

/**
 * Expire an open Checkout Session so a canceled/abandoned registration cannot be
 * paid later. Best-effort: callers should ignore failures (e.g. already expired).
 */
export async function expireCheckoutSession(sessionId: string, connectedAccountId: string): Promise<void> {
  const stripe = getStripeClient();
  await stripe.checkout.sessions.expire(sessionId, {}, { stripeAccount: connectedAccountId });
}

/**
 * Refund a payment made via a direct charge. Runs against the connected account.
 */
export async function refundPaymentIntent(input: {
  paymentIntentId: string;
  connectedAccountId: string;
  amount?: number;
  /** Reverse the application fee back to the rink (default true for full refunds). */
  refundApplicationFee?: boolean;
  /** Deterministic key so retries/double-clicks do not create duplicate refunds. */
  idempotencyKey?: string;
}): Promise<Stripe.Refund> {
  const stripe = getStripeClient();
  return stripe.refunds.create(
    {
      payment_intent: input.paymentIntentId,
      amount: input.amount,
      refund_application_fee: input.refundApplicationFee ?? input.amount === undefined,
    },
    {
      stripeAccount: input.connectedAccountId,
      idempotencyKey: input.idempotencyKey,
    }
  );
}

/**
 * Verify and construct a Connect webhook event. Connect events include the
 * `account` field identifying the connected account they originated from.
 */
export function constructConnectWebhookEvent(payload: string | Buffer, signature: string): Stripe.Event {
  const stripe = getStripeClient();
  if (!env.STRIPE_CONNECT_WEBHOOK_SECRET) {
    throw new StripeDisabledError("Stripe webhook secret is not configured.");
  }
  return stripe.webhooks.constructEvent(payload, signature, env.STRIPE_CONNECT_WEBHOOK_SECRET);
}
