import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockIsStripeEnabled,
  mockConstructEvent,
  mockGetStripeClient,
  mockRefund,
  mockPrisma,
  mockConfirmEmail,
  mockManagerEmail,
} = vi.hoisted(() => ({
  mockIsStripeEnabled: vi.fn(),
  mockConstructEvent: vi.fn(),
  mockGetStripeClient: vi.fn(),
  mockRefund: vi.fn(),
  mockConfirmEmail: vi.fn(),
  mockManagerEmail: vi.fn(),
  mockPrisma: {
    $transaction: vi.fn(),
    payment: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    sessionRegistration: { update: vi.fn(), findMany: vi.fn(), aggregate: vi.fn() },
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
  refundPaymentIntent: (...args: unknown[]) => mockRefund(...args),
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

  it("does not resurrect a canceled registration from a stale checkout", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      account: "acct_123",
      data: { object: { id: "cs_1", payment_status: "paid", payment_intent: "pi_1" } },
    });
    mockPrisma.payment.findUnique.mockResolvedValue({
      id: "pay_1",
      status: "CANCELED",
      amount: 1500,
      stripeAccountId: "acct_123",
      registration: { id: "reg_1", status: "CANCELED", scheduleBlock: null },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockConfirmEmail).not.toHaveBeenCalled();
  });

  it("auto-refunds and expires when a late payment would oversell capacity", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      account: "acct_123",
      data: { object: { id: "cs_1", payment_status: "paid", payment_intent: "pi_1" } },
    });
    mockPrisma.payment.findUnique.mockResolvedValue({
      id: "pay_1",
      status: "REQUIRES_PAYMENT",
      amount: 3000,
      stripeAccountId: "acct_123",
      registration: {
        id: "reg_1",
        status: "PENDING",
        participantEmail: "jordan@example.com",
        participantName: "Jordan",
        quantity: 2,
        amountTotal: 3000,
        currency: "USD",
        venue: { name: "Ice Palace", slug: "ice-palace", organizationId: "org_1" },
        scheduleBlock: { id: "blk_1", title: "Stick Time", capacity: 2 },
        lessonOffering: null,
      },
    });
    // One spot already confirmed; this 2-spot payment would exceed capacity 2.
    mockPrisma.sessionRegistration.aggregate.mockResolvedValue({ _sum: { quantity: 1 } });
    mockRefund.mockResolvedValue({ id: "re_1" });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mockRefund).toHaveBeenCalledWith(
      expect.objectContaining({ paymentIntentId: "pi_1", connectedAccountId: "acct_123" })
    );
    expect(mockConfirmEmail).not.toHaveBeenCalled();
  });
});
