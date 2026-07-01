import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  mockRequireUserId,
  mockRequireVenueRequestManager,
  mockRequireVenueStaffRole,
  mockPrisma,
  mockIsStripeEnabled,
  mockCreateCheckout,
  mockRefund,
  mockConfirmEmail,
  mockManagerEmail,
  mockLogActivity,
} = vi.hoisted(() => ({
  mockRequireUserId: vi.fn(),
  mockRequireVenueRequestManager: vi.fn(),
  mockRequireVenueStaffRole: vi.fn(),
  mockIsStripeEnabled: vi.fn(),
  mockCreateCheckout: vi.fn(),
  mockRefund: vi.fn(),
  mockConfirmEmail: vi.fn(),
  mockManagerEmail: vi.fn(),
  mockLogActivity: vi.fn(),
  mockPrisma: {
    $transaction: vi.fn(),
    venueScheduleBlock: { findFirst: vi.fn() },
    lessonOffering: { findFirst: vi.fn() },
    sessionRegistration: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    payment: { update: vi.fn(), aggregate: vi.fn() },
    venueStaff: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireUserId: (...args: unknown[]) => mockRequireUserId(...args),
  requireVenueRequestManager: (...args: unknown[]) => mockRequireVenueRequestManager(...args),
  requireVenueStaffRole: (...args: unknown[]) => mockRequireVenueStaffRole(...args),
  VENUE_STAFF_ADMIN_ROLES: ["OWNER", "MANAGER"],
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/payments/stripe", () => ({
  StripeDisabledError: class StripeDisabledError extends Error {},
  isStripeEnabled: (...args: unknown[]) => mockIsStripeEnabled(...args),
  computeApplicationFee: (amount: number, bps?: number | null) =>
    !bps || bps <= 0 || amount <= 0 ? 0 : Math.floor((amount * bps) / 10000),
  createRegistrationCheckoutSession: (...args: unknown[]) => mockCreateCheckout(...args),
  refundPaymentIntent: (...args: unknown[]) => mockRefund(...args),
}));

vi.mock("@/lib/email/templates", () => ({
  sendSessionRegistrationConfirmationEmail: (...args: unknown[]) => mockConfirmEmail(...args),
  sendSessionRegistrationManagerEmail: (...args: unknown[]) => mockManagerEmail(...args),
}));

vi.mock("@/lib/actions/venue-organizations", () => ({
  logVenueActivity: (...args: unknown[]) => mockLogActivity(...args),
}));

import { refundRegistration, registerForSession } from "@/lib/actions/session-registrations";

const USER_ID = "clusrxxxxxxxxxxxxxxxxxxxxxxx";
const VENUE_ID = "clvenxxxxxxxxxxxxxxxxxxxxxxx";
const ORG_ID = "clorgxxxxxxxxxxxxxxxxxxxxxxx";
const BLOCK_ID = "clblkxxxxxxxxxxxxxxxxxxxxxxx";
const REG_ID = "clregxxxxxxxxxxxxxxxxxxxxxxx";

function blockOffering(overrides: Record<string, unknown> = {}) {
  return {
    title: "Open Skate",
    priceAmount: 0,
    priceCurrency: "USD",
    capacity: null,
    status: "PUBLISHED",
    visibility: "PUBLIC",
    registrationMode: "SELF_REGISTER",
    venue: {
      id: VENUE_ID,
      name: "Ice Palace",
      slug: "ice-palace",
      organizationId: ORG_ID,
      organization: {
        id: ORG_ID,
        stripeAccountId: null,
        stripeChargesEnabled: false,
        platformFeeBps: null,
        status: "ACTIVE",
      },
    },
    ...overrides,
  };
}

const freeInput = {
  venueId: VENUE_ID,
  scheduleBlockId: BLOCK_ID,
  participantName: "Jordan Skater",
  participantEmail: "jordan@example.com",
  quantity: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUserId.mockResolvedValue(USER_ID);
  mockRequireVenueStaffRole.mockResolvedValue(USER_ID);
  mockIsStripeEnabled.mockReturnValue(true);
  mockPrisma.$transaction.mockResolvedValue([]);
  mockPrisma.sessionRegistration.findMany.mockResolvedValue([]);
  mockPrisma.venueStaff.findMany.mockResolvedValue([]);
  mockPrisma.sessionRegistration.create.mockResolvedValue({ id: REG_ID });
});

describe("registerForSession — free", () => {
  it("confirms a free session immediately and emails the participant", async () => {
    mockPrisma.venueScheduleBlock.findFirst.mockResolvedValue(blockOffering());

    const result = await registerForSession(freeInput);

    expect(result).toEqual({
      success: true,
      data: { registrationId: REG_ID, status: "CONFIRMED", requiresPayment: false },
    });
    const createArg = mockPrisma.sessionRegistration.create.mock.calls[0][0];
    expect(createArg.data.status).toBe("CONFIRMED");
    expect(createArg.data.confirmedAt).toBeInstanceOf(Date);
    expect(mockConfirmEmail).toHaveBeenCalledTimes(1);
  });

  it("rejects registration when the session is full", async () => {
    mockPrisma.venueScheduleBlock.findFirst.mockResolvedValue(blockOffering({ capacity: 2 }));
    mockPrisma.sessionRegistration.findMany.mockResolvedValue([{ quantity: 2 }]);

    const result = await registerForSession(freeInput);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/full/i);
    expect(mockPrisma.sessionRegistration.create).not.toHaveBeenCalled();
  });
});

describe("registerForSession — paid", () => {
  const paidInput = { ...freeInput, quantity: 2 };

  it("blocks paid registration when the rink is not onboarded", async () => {
    mockPrisma.venueScheduleBlock.findFirst.mockResolvedValue(blockOffering({ priceAmount: 1500 }));

    const result = await registerForSession(paidInput);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/online payments/i);
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it("creates a checkout session for an onboarded rink and returns the URL", async () => {
    mockPrisma.venueScheduleBlock.findFirst.mockResolvedValue(
      blockOffering({
        priceAmount: 1500,
        venue: {
          id: VENUE_ID,
          name: "Ice Palace",
          slug: "ice-palace",
          organizationId: ORG_ID,
          organization: {
            id: ORG_ID,
            stripeAccountId: "acct_123",
            stripeChargesEnabled: true,
            platformFeeBps: 250,
            status: "ACTIVE",
          },
        },
      })
    );
    mockCreateCheckout.mockResolvedValue({ id: "cs_test_1", url: "https://checkout.stripe.com/pay/cs_test_1" });

    const result = await registerForSession(paidInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requiresPayment).toBe(true);
      expect(result.data.checkoutUrl).toContain("checkout.stripe.com");
    }
    const createArg = mockPrisma.sessionRegistration.create.mock.calls[0][0];
    expect(createArg.data.status).toBe("PENDING");
    expect(createArg.data.amountTotal).toBe(3000);
    expect(createArg.data.payment.create.applicationFeeAmount).toBe(75); // 2.5% of 3000
    expect(mockCreateCheckout).toHaveBeenCalledTimes(1);
    // Payment updated with the checkout session id.
    expect(mockPrisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stripeCheckoutSessionId: "cs_test_1" } })
    );
  });
});

describe("refundRegistration", () => {
  it("refunds a captured payment and marks the registration refunded", async () => {
    mockPrisma.sessionRegistration.findFirst.mockResolvedValue({
      id: REG_ID,
      status: "CONFIRMED",
      amountTotal: 1500,
      venue: { organizationId: ORG_ID, slug: "ice-palace" },
      payment: {
        id: "pay_1",
        status: "PAID",
        amount: 1500,
        refundedAmount: 0,
        stripePaymentIntentId: "pi_1",
        stripeAccountId: "acct_123",
      },
    });
    mockRefund.mockResolvedValue({ id: "re_1" });

    const result = await refundRegistration({ organizationId: ORG_ID, venueId: VENUE_ID, registrationId: REG_ID });

    expect(result.success).toBe(true);
    expect(mockRefund).toHaveBeenCalledWith(
      expect.objectContaining({ paymentIntentId: "pi_1", connectedAccountId: "acct_123" })
    );
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockLogActivity).toHaveBeenCalledTimes(1);
  });

  it("refuses to refund a registration without a captured payment", async () => {
    mockPrisma.sessionRegistration.findFirst.mockResolvedValue({
      id: REG_ID,
      status: "PENDING",
      amountTotal: 1500,
      venue: { organizationId: ORG_ID, slug: "ice-palace" },
      payment: { id: "pay_1", status: "REQUIRES_PAYMENT", amount: 1500, refundedAmount: 0, stripePaymentIntentId: null, stripeAccountId: "acct_123" },
    });

    const result = await refundRegistration({ organizationId: ORG_ID, venueId: VENUE_ID, registrationId: REG_ID });

    expect(result.success).toBe(false);
    expect(mockRefund).not.toHaveBeenCalled();
  });
});
