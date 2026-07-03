import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockPrisma,
  mockConstructEvent,
  mockRefund,
  mockGetStripeClient,
  mockPromote,
  mockEventConfirmEmail,
} = vi.hoisted(() => ({
  mockConstructEvent: vi.fn(),
  mockRefund: vi.fn(),
  mockGetStripeClient: vi.fn(),
  mockPromote: vi.fn(),
  mockEventConfirmEmail: vi.fn(),
  mockPrisma: {
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
    payment: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    sessionRegistration: { update: vi.fn(), updateMany: vi.fn(), aggregate: vi.fn() },
    eventRegistration: { update: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    venueOrganization: { updateMany: vi.fn() },
    league: { updateMany: vi.fn() },
    venueStaff: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/payments/stripe", () => ({
  isStripeEnabled: () => true,
  constructConnectWebhookEvent: (...args: unknown[]) => mockConstructEvent(...args),
  refundPaymentIntent: (...args: unknown[]) => mockRefund(...args),
  getStripeClient: (...args: unknown[]) => mockGetStripeClient(...args),
}));

vi.mock("@/lib/env", () => ({
  env: { STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_test" },
  getBaseUrl: () => "http://localhost:3000",
  EVENT_WAITLIST_CLAIM_HOURS: 24,
  STATS_MIN_AGE_LEVEL: "SQUIRT_U10",
  isBlobConfigured: false,
  isStripeConfigured: true,
  DEFAULT_PLATFORM_FEE_BPS: 0,
}));

vi.mock("@/lib/email/templates", () => ({
  sendSessionRegistrationConfirmationEmail: vi.fn(),
  sendSessionRegistrationManagerEmail: vi.fn(),
  sendEventRegistrationConfirmationEmail: (...args: unknown[]) => mockEventConfirmEmail(...args),
}));

vi.mock("@/lib/utils/event-waitlist", () => ({
  promoteNextWaitlistEntriesForSlot: (...args: unknown[]) => mockPromote(...args),
}));

import { POST } from "@/app/api/webhooks/stripe/route";

function webhookRequest(event: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "sig_test" },
    body: JSON.stringify(event),
  });
}

function eventRegistrationPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay-1",
    status: "REQUIRES_PAYMENT",
    amount: 2500,
    stripeAccountId: "acct_league",
    registration: null,
    eventRegistration: {
      id: "evreg-1",
      status: "PENDING_PAYMENT",
      participantName: "Liam Beacom",
      unitAmount: 2500,
      currency: "USD",
      registrant: { email: "parent@example.com" },
      slot: { id: "slot-1", name: "Skater", capacity: 40 },
      event: {
        id: "event-1",
        title: "Mite Night",
        startAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        hostOrganization: null,
        hostLeague: { name: "GFHA" },
        hostTeam: null,
      },
    },
    ...overrides,
  };
}

const completedSession = {
  id: "cs_1",
  payment_status: "paid",
  payment_intent: "pi_1",
  client_reference_id: "evreg-1",
  metadata: { registrationId: "evreg-1", eventRegistrationId: "evreg-1" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));
  mockGetStripeClient.mockReturnValue({
    paymentIntents: {
      retrieve: vi.fn().mockResolvedValue({ latest_charge: { receipt_url: "https://receipt" } }),
    },
  });
});

describe("checkout.session.completed for event registrations", () => {
  it("confirms the registration, stores the receipt, and emails the registrant", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      account: "acct_league",
      data: { object: completedSession },
    });
    mockPrisma.payment.findUnique.mockResolvedValue(eventRegistrationPayment());
    mockPrisma.eventRegistration.count.mockResolvedValue(10); // committed excluding self
    mockPrisma.payment.update.mockResolvedValue({});
    mockPrisma.eventRegistration.update.mockResolvedValue({});

    const response = await POST(webhookRequest({}));

    expect(response.status).toBe(200);
    expect(mockPrisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PAID", receiptUrl: "https://receipt" }) })
    );
    expect(mockPrisma.eventRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "evreg-1" },
        data: expect.objectContaining({ status: "CONFIRMED" }),
      })
    );
    expect(mockEventConfirmEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "parent@example.com", eventTitle: "Mite Night" })
    );
    expect(mockRefund).not.toHaveBeenCalled();
  });

  it("auto-refunds a late payment that would oversell the slot", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      account: "acct_league",
      data: { object: completedSession },
    });
    mockPrisma.payment.findUnique.mockResolvedValue(eventRegistrationPayment());
    mockPrisma.eventRegistration.count.mockResolvedValue(40); // slot already full without this hold
    mockPrisma.payment.update.mockResolvedValue({});
    mockPrisma.eventRegistration.update.mockResolvedValue({});

    const response = await POST(webhookRequest({}));

    expect(response.status).toBe(200);
    expect(mockRefund).toHaveBeenCalledWith(
      expect.objectContaining({ paymentIntentId: "pi_1", idempotencyKey: "overbook-refund:evreg-1" })
    );
    expect(mockPrisma.eventRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "evreg-1" }, data: { status: "EXPIRED" } })
    );
    expect(mockEventConfirmEmail).not.toHaveBeenCalled();
  });

  it("is idempotent: an already-paid payment is not confirmed twice", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      account: "acct_league",
      data: { object: completedSession },
    });
    mockPrisma.payment.findUnique.mockResolvedValue(eventRegistrationPayment({ status: "PAID" }));

    const response = await POST(webhookRequest({}));

    expect(response.status).toBe(200);
    expect(mockPrisma.payment.update).not.toHaveBeenCalled();
    expect(mockPrisma.eventRegistration.update).not.toHaveBeenCalled();
  });

  it("never revives a canceled registration on a stale checkout", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      account: "acct_league",
      data: { object: completedSession },
    });
    const payment = eventRegistrationPayment();
    (payment.eventRegistration as { status: string }).status = "CANCELED";
    mockPrisma.payment.findUnique.mockResolvedValue(payment);

    const response = await POST(webhookRequest({}));

    expect(response.status).toBe(200);
    expect(mockPrisma.eventRegistration.update).not.toHaveBeenCalled();
  });
});

describe("checkout.session.expired for event registrations", () => {
  it("expires the hold and cascades a waitlist offer", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.expired",
      data: { object: { id: "cs_1" } },
    });
    mockPrisma.payment.findUnique.mockResolvedValue({
      id: "pay-1",
      status: "REQUIRES_PAYMENT",
      registrationId: null,
      eventRegistration: { id: "evreg-1", slotId: "slot-1" },
    });
    mockPrisma.payment.update.mockResolvedValue({});
    mockPrisma.eventRegistration.updateMany.mockResolvedValue({ count: 1 });

    const response = await POST(webhookRequest({}));

    expect(response.status).toBe(200);
    expect(mockPrisma.eventRegistration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "evreg-1", status: "PENDING_PAYMENT" },
        data: { status: "EXPIRED" },
      })
    );
    expect(mockPromote).toHaveBeenCalledWith("slot-1");
  });
});

describe("account.updated", () => {
  it("syncs Connect flags on venue organizations AND leagues", async () => {
    mockConstructEvent.mockReturnValue({
      type: "account.updated",
      data: {
        object: {
          id: "acct_league",
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
        },
      },
    });
    mockPrisma.venueOrganization.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.league.updateMany.mockResolvedValue({ count: 1 });

    const response = await POST(webhookRequest({}));

    expect(response.status).toBe(200);
    const expectedData = {
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeDetailsSubmitted: true,
    };
    expect(mockPrisma.venueOrganization.updateMany).toHaveBeenCalledWith({
      where: { stripeAccountId: "acct_league" },
      data: expectedData,
    });
    expect(mockPrisma.league.updateMany).toHaveBeenCalledWith({
      where: { stripeAccountId: "acct_league" },
      data: expectedData,
    });
  });
});

describe("charge.refunded for event registrations", () => {
  it("marks a fully refunded registration REFUNDED and cascades the freed spot", async () => {
    mockConstructEvent.mockReturnValue({
      type: "charge.refunded",
      account: "acct_league",
      data: { object: { payment_intent: "pi_1", amount_refunded: 2500 } },
    });
    mockPrisma.payment.findFirst.mockResolvedValue({
      id: "pay-1",
      amount: 2500,
      status: "PAID",
      registrationId: null,
      eventRegistration: { id: "evreg-1", slotId: "slot-1" },
    });
    mockPrisma.payment.update.mockResolvedValue({});
    mockPrisma.eventRegistration.updateMany.mockResolvedValue({ count: 1 });

    const response = await POST(webhookRequest({}));

    expect(response.status).toBe(200);
    expect(mockPrisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "REFUNDED", refundedAmount: 2500 }) })
    );
    expect(mockPrisma.eventRegistration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "REFUNDED" }) })
    );
    expect(mockPromote).toHaveBeenCalledWith("slot-1");
  });
});
