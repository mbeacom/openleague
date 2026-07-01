import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockIsStripeEnabled,
  mockConstructEvent,
  mockGetStripeClient,
  mockPrisma,
  mockConfirmEmail,
  mockManagerEmail,
} = vi.hoisted(() => ({
  mockIsStripeEnabled: vi.fn(),
  mockConstructEvent: vi.fn(),
  mockGetStripeClient: vi.fn(),
  mockConfirmEmail: vi.fn(),
  mockManagerEmail: vi.fn(),
  mockPrisma: {
    $transaction: vi.fn(),
    payment: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    sessionRegistration: { update: vi.fn() },
    venueStaff: { findMany: vi.fn() },
    venueOrganization: { updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/env", () => ({
  env: { STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_test", EMAIL_FROM: "from@openl.app", NEXTAUTH_URL: "http://localhost:3000" },
  getBaseUrl: () => "http://localhost:3000",
  isStripeConfigured: true,
  DEFAULT_PLATFORM_FEE_BPS: 0,
}));

vi.mock("@/lib/payments/stripe", () => ({
  StripeDisabledError: class StripeDisabledError extends Error {},
  isStripeEnabled: (...args: unknown[]) => mockIsStripeEnabled(...args),
  constructConnectWebhookEvent: (...args: unknown[]) => mockConstructEvent(...args),
  getStripeClient: (...args: unknown[]) => mockGetStripeClient(...args),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/email/templates", () => ({
  sendSessionRegistrationConfirmationEmail: (...args: unknown[]) => mockConfirmEmail(...args),
  sendSessionRegistrationManagerEmail: (...args: unknown[]) => mockManagerEmail(...args),
}));

import { POST } from "@/app/api/webhooks/stripe/route";

function webhookRequest(body = "{}", signature: string | null = "sig_test") {
  const headers = new Headers();
  if (signature) headers.set("stripe-signature", signature);
  return new Request("http://localhost:3000/api/webhooks/stripe", { method: "POST", body, headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsStripeEnabled.mockReturnValue(true);
  mockPrisma.$transaction.mockResolvedValue([]);
  mockPrisma.venueStaff.findMany.mockResolvedValue([]);
});

describe("stripe webhook route", () => {
  it("returns 503 when payments are not configured", async () => {
    mockIsStripeEnabled.mockReturnValue(false);
    const response = await POST(webhookRequest());
    expect(response.status).toBe(503);
  });

  it("returns 400 when the signature header is missing", async () => {
    const response = await POST(webhookRequest("{}", null));
    expect(response.status).toBe(400);
  });

  it("returns 400 when signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("bad signature");
    });
    const response = await POST(webhookRequest());
    expect(response.status).toBe(400);
  });

  it("confirms a registration on checkout.session.completed", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      account: "acct_123",
      data: { object: { id: "cs_1", payment_status: "paid", payment_intent: "pi_1" } },
    });
    mockPrisma.payment.findUnique.mockResolvedValue({
      id: "pay_1",
      status: "REQUIRES_PAYMENT",
      stripeAccountId: "acct_123",
      registration: {
        id: "reg_1",
        status: "PENDING",
        participantEmail: "jordan@example.com",
        participantName: "Jordan",
        quantity: 1,
        amountTotal: 1500,
        currency: "USD",
        venue: { name: "Ice Palace", slug: "ice-palace", organizationId: "org_1" },
        scheduleBlock: { title: "Open Skate" },
        lessonOffering: null,
      },
    });
    mockGetStripeClient.mockReturnValue({
      paymentIntents: {
        retrieve: vi.fn().mockResolvedValue({ latest_charge: { receipt_url: "https://receipt" } }),
      },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockConfirmEmail).toHaveBeenCalledTimes(1);
  });

  it("is idempotent when the payment is already PAID", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      account: "acct_123",
      data: { object: { id: "cs_1", payment_status: "paid", payment_intent: "pi_1" } },
    });
    mockPrisma.payment.findUnique.mockResolvedValue({
      id: "pay_1",
      status: "PAID",
      stripeAccountId: "acct_123",
      registration: { id: "reg_1" },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockConfirmEmail).not.toHaveBeenCalled();
  });

  it("syncs connected account flags on account.updated", async () => {
    mockConstructEvent.mockReturnValue({
      type: "account.updated",
      account: "acct_123",
      data: { object: { id: "acct_123", charges_enabled: true, payouts_enabled: true, details_submitted: true } },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mockPrisma.venueOrganization.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeAccountId: "acct_123" },
        data: expect.objectContaining({ stripeChargesEnabled: true }),
      })
    );
  });
});
