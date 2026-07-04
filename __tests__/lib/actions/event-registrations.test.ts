import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  mockRequireUserId,
  mockRequireEventManager,
  mockConfirmEmail,
  mockRemovedEmail,
  mockCreateCheckout,
  mockPrisma,
  mockTx,
} = vi.hoisted(() => {
  const mockTx = {
    eventRegistration: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  };
  return {
    mockRequireUserId: vi.fn(),
    mockRequireEventManager: vi.fn(),
    mockConfirmEmail: vi.fn(),
    mockRemovedEmail: vi.fn(),
    mockCreateCheckout: vi.fn(),
    mockTx,
    mockPrisma: {
      $transaction: vi.fn(),
      signupSlot: { findFirst: vi.fn(), findMany: vi.fn() },
      eventRegistration: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        count: vi.fn(),
      },
      payment: { update: vi.fn(), updateMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
      user: { findUnique: vi.fn() },
      eventInvitation: { findFirst: vi.fn() },
    },
  };
});

vi.mock("@/lib/auth/session", () => ({
  requireUserId: (...args: unknown[]) => mockRequireUserId(...args),
  requireEventManager: (...args: unknown[]) => mockRequireEventManager(...args),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/payments/stripe", () => ({
  StripeDisabledError: class StripeDisabledError extends Error {},
  isStripeEnabled: () => true,
  computeApplicationFee: (amount: number, bps?: number | null) =>
    !bps || bps <= 0 || amount <= 0 ? 0 : Math.floor((amount * bps) / 10000),
  createRegistrationCheckoutSession: (...args: unknown[]) => mockCreateCheckout(...args),
  expireCheckoutSession: vi.fn(),
  refundPaymentIntent: vi.fn(),
}));

vi.mock("@/lib/email/templates", () => ({
  sendEventRegistrationConfirmationEmail: (...args: unknown[]) => mockConfirmEmail(...args),
  sendEventRegistrationRemovedEmail: (...args: unknown[]) => mockRemovedEmail(...args),
}));

vi.mock("@/lib/actions/venue-organizations", () => ({}));

import {
  registerForSignupEvent,
  cancelMyEventRegistration,
  claimWaitlistOffer,
  setManualPaymentStatus,
} from "@/lib/actions/event-registrations";

const EVENT_ID = "cldevent0000000000000001";
const SLOT_ID = "cldslot00000000000000001";

const futureDate = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000);

function makeSlot(overrides: Record<string, unknown> = {}, eventOverrides: Record<string, unknown> = {}) {
  return {
    id: SLOT_ID,
    name: "Skater",
    capacity: 40,
    priceAmount: null,
    priceCurrency: "USD",
    waitlistEnabled: true,
    event: {
      id: EVENT_ID,
      title: "Mite Night",
      status: "PUBLISHED",
      visibility: "PUBLIC",
      linkToken: null,
      startAt: futureDate(24 * 7),
      timezone: "America/New_York",
      registrationOpensAt: null,
      registrationClosesAt: null,
      acceptsOnlinePayment: false,
      acceptsManualPayment: true,
      venmoHandle: null,
      zelleHandle: null,
      cashAppHandle: null,
      paymentPhone: null,
      paymentInstructions: null,
      hostOrganizationId: null,
      hostLeagueId: "league-1",
      hostTeamId: null,
      phases: [],
      venue: null,
      hostLeague: { slug: "gfha", name: "GFHA" },
      hostOrganization: null,
      hostTeam: null,
      ...eventOverrides,
    },
    ...overrides,
  };
}

describe("registerForSignupEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUserId.mockResolvedValue("user-1");
    // Run the serializable transaction callback against the mock tx client.
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx));
    mockTx.eventRegistration.findMany.mockResolvedValue([]);
    mockTx.eventRegistration.count.mockResolvedValue(0);
    mockTx.eventRegistration.create.mockResolvedValue({ id: "reg-1" });
    mockPrisma.user.findUnique.mockResolvedValue({ email: "parent@example.com" });
  });

  it("confirms a free registration and sends a confirmation email", async () => {
    mockPrisma.signupSlot.findFirst.mockResolvedValue(makeSlot());

    const result = await registerForSignupEvent({
      eventId: EVENT_ID,
      slotId: SLOT_ID,
      participants: [{ name: "Liam Beacom" }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("CONFIRMED");
      expect(result.data.requiresPayment).toBe(false);
    }
    expect(mockTx.eventRegistration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "CONFIRMED",
          participantName: "Liam Beacom",
          manualPaymentStatus: "NOT_REQUIRED",
          unitAmount: 0,
        }),
      })
    );
    expect(mockConfirmEmail).toHaveBeenCalled();
  });

  it("registers multiple participants, each occupying one spot", async () => {
    mockPrisma.signupSlot.findFirst.mockResolvedValue(makeSlot());
    mockTx.eventRegistration.create
      .mockResolvedValueOnce({ id: "reg-1" })
      .mockResolvedValueOnce({ id: "reg-2" });

    const result = await registerForSignupEvent({
      eventId: EVENT_ID,
      slotId: SLOT_ID,
      participants: [{ name: "Liam Beacom" }, { name: "Nora Beacom" }],
    });

    expect(result.success).toBe(true);
    expect(mockTx.eventRegistration.create).toHaveBeenCalledTimes(2);
  });

  it("blocks registration when the slot is full and waitlist is disabled", async () => {
    mockPrisma.signupSlot.findFirst.mockResolvedValue(
      makeSlot({ capacity: 40, waitlistEnabled: false })
    );
    mockTx.eventRegistration.count.mockResolvedValue(40);

    const result = await registerForSignupEvent({
      eventId: EVENT_ID,
      slotId: SLOT_ID,
      participants: [{ name: "Liam Beacom" }],
    });

    expect(result).toEqual({ success: false, error: "This slot just filled up." });
    expect(mockTx.eventRegistration.create).not.toHaveBeenCalled();
  });

  it("reports remaining spots when a batch does not fit and waitlist is disabled", async () => {
    mockPrisma.signupSlot.findFirst.mockResolvedValue(
      makeSlot({ capacity: 40, waitlistEnabled: false })
    );
    mockTx.eventRegistration.count.mockResolvedValue(39);

    const result = await registerForSignupEvent({
      eventId: EVENT_ID,
      slotId: SLOT_ID,
      participants: [{ name: "Liam Beacom" }, { name: "Nora Beacom" }],
    });

    expect(result).toEqual({ success: false, error: "Only 1 spot left in this slot." });
  });

  it("counts committed spots including holds and offers against capacity", async () => {
    mockPrisma.signupSlot.findFirst.mockResolvedValue(makeSlot({ capacity: 2 }));
    mockTx.eventRegistration.count.mockResolvedValue(1);

    const result = await registerForSignupEvent({
      eventId: EVENT_ID,
      slotId: SLOT_ID,
      participants: [{ name: "Liam Beacom" }],
    });

    expect(result.success).toBe(true);
    const countWhere = mockTx.eventRegistration.count.mock.calls[0][0].where;
    expect(countWhere.slotId).toBe(SLOT_ID);
    const statuses = countWhere.OR.map((clause: { status: string }) => clause.status);
    expect(statuses).toEqual(["CONFIRMED", "PENDING_PAYMENT", "OFFERED"]);
  });

  it("prevents duplicate registration of the same participant in a slot", async () => {
    mockPrisma.signupSlot.findFirst.mockResolvedValue(makeSlot());
    mockTx.eventRegistration.findMany.mockResolvedValue([{ participantName: "liam  beacom" }]);

    const result = await registerForSignupEvent({
      eventId: EVENT_ID,
      slotId: SLOT_ID,
      participants: [{ name: "Liam Beacom" }],
    });

    expect(result).toEqual({
      success: false,
      error: "Liam Beacom is already registered for this slot.",
    });
  });

  it("prevents duplicates within a single request", async () => {
    mockPrisma.signupSlot.findFirst.mockResolvedValue(makeSlot());

    const result = await registerForSignupEvent({
      eventId: EVENT_ID,
      slotId: SLOT_ID,
      participants: [{ name: "Liam Beacom" }, { name: "liam beacom" }],
    });

    expect(result).toEqual({
      success: false,
      error: "Each participant can only be registered once per slot.",
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("maps serialization conflicts to a friendly try-again error", async () => {
    mockPrisma.signupSlot.findFirst.mockResolvedValue(makeSlot());
    mockPrisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("write conflict", {
        code: "P2034",
        clientVersion: "7.0.0",
      })
    );

    const result = await registerForSignupEvent({
      eventId: EVENT_ID,
      slotId: SLOT_ID,
      participants: [{ name: "Liam Beacom" }],
    });

    expect(result).toEqual({
      success: false,
      error: "This slot is filling up fast — please try again.",
    });
  });

  it("rejects unpublished events", async () => {
    mockPrisma.signupSlot.findFirst.mockResolvedValue(makeSlot({}, { status: "DRAFT" }));

    const result = await registerForSignupEvent({
      eventId: EVENT_ID,
      slotId: SLOT_ID,
      participants: [{ name: "Liam Beacom" }],
    });

    expect(result).toEqual({ success: false, error: "This event is not open for registration." });
  });

  it("rejects registration before the window opens", async () => {
    mockPrisma.signupSlot.findFirst.mockResolvedValue(
      makeSlot({}, { registrationOpensAt: futureDate(24) })
    );

    const result = await registerForSignupEvent({
      eventId: EVENT_ID,
      slotId: SLOT_ID,
      participants: [{ name: "Liam Beacom" }],
    });

    expect(result).toEqual({
      success: false,
      error: "Registration hasn't opened yet for this event.",
    });
  });

  it("denies access to private events", async () => {
    mockPrisma.signupSlot.findFirst.mockResolvedValue(makeSlot({}, { visibility: "PRIVATE" }));

    const result = await registerForSignupEvent({
      eventId: EVENT_ID,
      slotId: SLOT_ID,
      participants: [{ name: "Liam Beacom" }],
    });

    expect(result).toEqual({ success: false, error: "You don't have access to this event." });
  });

  it("confirms priced manual-payment registrations as unpaid with the price snapshot", async () => {
    mockPrisma.signupSlot.findFirst.mockResolvedValue(
      makeSlot({ priceAmount: 2500 }, { venmoHandle: "@gfha" })
    );

    const result = await registerForSignupEvent({
      eventId: EVENT_ID,
      slotId: SLOT_ID,
      participants: [{ name: "Liam Beacom" }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requiresPayment).toBe(true);
    }
    expect(mockTx.eventRegistration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          unitAmount: 2500,
          manualPaymentStatus: "UNPAID",
        }),
      })
    );
  });
});

describe("cancelMyEventRegistration", () => {
  const REG_ID = "cldreg000000000000000001";

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUserId.mockResolvedValue("user-1");
  });

  function makeRegistration(overrides: Record<string, unknown> = {}, eventOverrides: Record<string, unknown> = {}) {
    return {
      id: REG_ID,
      status: "CONFIRMED",
      unitAmount: 0,
      payment: null,
      event: {
        id: EVENT_ID,
        startAt: futureDate(24 * 7),
        cancellationCutoffAt: null,
        venue: null,
        hostLeague: null,
        ...eventOverrides,
      },
      ...overrides,
    };
  }

  it("cancels an active free registration before the cutoff", async () => {
    mockPrisma.eventRegistration.findFirst.mockResolvedValue(makeRegistration());
    mockPrisma.eventRegistration.update.mockResolvedValue({});

    const result = await cancelMyEventRegistration({ registrationId: REG_ID });

    expect(result).toEqual({
      success: true,
      data: { registrationId: REG_ID, status: "CANCELED" },
    });
    expect(mockPrisma.eventRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "CANCELED", canceledById: "user-1" }),
      })
    );
  });

  it("blocks cancellation after the organizer's cutoff", async () => {
    mockPrisma.eventRegistration.findFirst.mockResolvedValue(
      makeRegistration({}, { cancellationCutoffAt: new Date(Date.now() - 60 * 60 * 1000) })
    );

    const result = await cancelMyEventRegistration({ registrationId: REG_ID });

    expect(result.success).toBe(false);
    expect(mockPrisma.eventRegistration.update).not.toHaveBeenCalled();
  });

  it("directs paid-online registrations to the organizer for refunds", async () => {
    mockPrisma.eventRegistration.findFirst.mockResolvedValue(
      makeRegistration({ unitAmount: 2500, payment: { status: "PAID" } })
    );

    const result = await cancelMyEventRegistration({ registrationId: REG_ID });

    expect(result).toEqual({
      success: false,
      error: "This is a paid registration — contact the organizer to request a refund.",
    });
  });

  it("only cancels the caller's own registration", async () => {
    mockPrisma.eventRegistration.findFirst.mockResolvedValue(null);

    const result = await cancelMyEventRegistration({ registrationId: REG_ID });

    expect(result).toEqual({ success: false, error: "Registration not found" });
    const where = mockPrisma.eventRegistration.findFirst.mock.calls[0][0].where;
    expect(where.registrantId).toBe("user-1");
  });
});

describe("registerForSignupEvent online checkout", () => {
  const onboardedLeague = {
    id: "league-1",
    slug: "gfha",
    name: "GFHA",
    stripeAccountId: "acct_league",
    stripeChargesEnabled: true,
    platformFeeBps: 250,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUserId.mockResolvedValue("user-1");
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx));
    mockTx.eventRegistration.findMany.mockResolvedValue([]);
    mockTx.eventRegistration.count.mockResolvedValue(0);
    mockTx.eventRegistration.create.mockResolvedValue({ id: "reg-1" });
    mockPrisma.user.findUnique.mockResolvedValue({ email: "parent@example.com" });
    mockCreateCheckout.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" });
    mockPrisma.payment.update.mockResolvedValue({});
  });

  it("creates a pending hold with a nested payment and returns the checkout URL", async () => {
    mockPrisma.signupSlot.findFirst.mockResolvedValue(
      makeSlot(
        { priceAmount: 2500 },
        { acceptsOnlinePayment: true, acceptsManualPayment: false, hostLeague: onboardedLeague }
      )
    );

    const result = await registerForSignupEvent({
      eventId: EVENT_ID,
      slotId: SLOT_ID,
      paymentMethod: "ONLINE",
      participants: [{ name: "Liam Beacom" }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("PENDING_PAYMENT");
      expect(result.data.checkoutUrl).toBe("https://checkout.stripe.test/cs_1");
    }
    expect(mockTx.eventRegistration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PENDING_PAYMENT",
          payment: {
            create: expect.objectContaining({
              status: "REQUIRES_PAYMENT",
              amount: 2500,
              applicationFeeAmount: 62, // floor(2500 * 250 / 10000)
              leagueId: "league-1",
              organizationId: null,
            }),
          },
        }),
      })
    );
    expect(mockPrisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventRegistrationId: "reg-1" },
        data: { stripeCheckoutSessionId: "cs_1" },
      })
    );
  });

  it("limits online checkout to one participant per request", async () => {
    mockPrisma.signupSlot.findFirst.mockResolvedValue(
      makeSlot(
        { priceAmount: 2500 },
        { acceptsOnlinePayment: true, acceptsManualPayment: true, hostLeague: onboardedLeague }
      )
    );

    const result = await registerForSignupEvent({
      eventId: EVENT_ID,
      slotId: SLOT_ID,
      paymentMethod: "ONLINE",
      participants: [{ name: "Liam Beacom" }, { name: "Nora Beacom" }],
    });

    expect(result.success).toBe(false);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rolls the hold back when checkout creation fails", async () => {
    mockPrisma.signupSlot.findFirst.mockResolvedValue(
      makeSlot(
        { priceAmount: 2500 },
        { acceptsOnlinePayment: true, acceptsManualPayment: false, hostLeague: onboardedLeague }
      )
    );
    mockCreateCheckout.mockRejectedValue(new Error("stripe down"));
    mockPrisma.eventRegistration.update.mockResolvedValue({});

    const result = await registerForSignupEvent({
      eventId: EVENT_ID,
      slotId: SLOT_ID,
      paymentMethod: "ONLINE",
      participants: [{ name: "Liam Beacom" }],
    });

    expect(result).toEqual({ success: false, error: "Could not start checkout. Please try again." });
    expect(mockPrisma.eventRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "reg-1" },
        data: expect.objectContaining({ status: "EXPIRED" }),
      })
    );
  });

  it("keeps a claimed offer counting as committed by carrying the hold deadline in offerExpiresAt", async () => {
    // The claimed row's createdAt is the WAITLIST JOIN time (long past), so
    // the createdAt-based hold window would lapse instantly — the payment
    // hold must live in offerExpiresAt instead (oversell regression).
    mockPrisma.eventRegistration.findFirst.mockResolvedValue({
      id: "creg000000001",
      status: "OFFERED",
      offerExpiresAt: futureDate(12),
      unitAmount: 2500,
      participantName: "Liam Beacom",
      slot: { name: "Skater", priceCurrency: "USD" },
      event: {
        id: EVENT_ID,
        title: "Mite Night",
        startAt: futureDate(24 * 7),
        acceptsOnlinePayment: true,
        acceptsManualPayment: false,
        venmoHandle: null,
        zelleHandle: null,
        cashAppHandle: null,
        paymentPhone: null,
        paymentInstructions: null,
        venue: null,
        hostLeague: onboardedLeague,
        hostOrganization: null,
        hostTeam: null,
      },
    });
    mockPrisma.eventRegistration.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.payment.create.mockResolvedValue({});

    const result = await claimWaitlistOffer({ registrationId: "creg000000001" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("PENDING_PAYMENT");
      expect(result.data.checkoutUrl).toBe("https://checkout.stripe.test/cs_1");
    }
    const holdData = mockPrisma.eventRegistration.updateMany.mock.calls[0][0].data;
    expect(holdData.status).toBe("PENDING_PAYMENT");
    expect(holdData.offerExpiresAt).toBeInstanceOf(Date);
    expect(holdData.offerExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("refuses online payment when the merchant is not onboarded", async () => {
    mockPrisma.signupSlot.findFirst.mockResolvedValue(
      makeSlot({ priceAmount: 2500 }, { acceptsOnlinePayment: true, acceptsManualPayment: false })
    );

    const result = await registerForSignupEvent({
      eventId: EVENT_ID,
      slotId: SLOT_ID,
      paymentMethod: "ONLINE",
      participants: [{ name: "Liam Beacom" }],
    });

    expect(result).toEqual({ success: false, error: "Online payment isn't available for this event." });
  });
});

describe("setManualPaymentStatus", () => {
  const REG = "cldreg000000000000000001";

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireEventManager.mockResolvedValue("admin-1");
  });

  it("marks a confirmed manual registration paid", async () => {
    mockPrisma.eventRegistration.findUnique.mockResolvedValue({
      id: REG,
      eventId: EVENT_ID,
      status: "CONFIRMED",
      unitAmount: 2500,
      payment: null,
    });
    mockPrisma.eventRegistration.update.mockResolvedValue({});

    const result = await setManualPaymentStatus({ registrationId: REG, status: "PAID" });

    expect(result).toEqual({ success: true, data: { registrationId: REG, status: "PAID" } });
    expect(mockPrisma.eventRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { manualPaymentStatus: "PAID", manualPaymentMarkedById: "admin-1" },
      })
    );
  });

  it("refuses to touch online payments", async () => {
    mockPrisma.eventRegistration.findUnique.mockResolvedValue({
      id: REG,
      eventId: EVENT_ID,
      status: "CONFIRMED",
      unitAmount: 2500,
      payment: { id: "pay-1" },
    });

    const result = await setManualPaymentStatus({ registrationId: REG, status: "PAID" });

    expect(result).toEqual({
      success: false,
      error: "This registration was paid online — use Refund instead.",
    });
  });

  it("refuses free registrations", async () => {
    mockPrisma.eventRegistration.findUnique.mockResolvedValue({
      id: REG,
      eventId: EVENT_ID,
      status: "CONFIRMED",
      unitAmount: 0,
      payment: null,
    });

    const result = await setManualPaymentStatus({ registrationId: REG, status: "PAID" });

    expect(result.success).toBe(false);
  });
});
