import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  mockRequireUserId,
  mockRequireEventManager,
  mockConfirmEmail,
  mockRemovedEmail,
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
    mockTx,
    mockPrisma: {
      $transaction: vi.fn(),
      signupSlot: { findFirst: vi.fn(), findMany: vi.fn() },
      eventRegistration: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
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

vi.mock("@/lib/email/templates", () => ({
  sendEventRegistrationConfirmationEmail: (...args: unknown[]) => mockConfirmEmail(...args),
  sendEventRegistrationRemovedEmail: (...args: unknown[]) => mockRemovedEmail(...args),
}));

vi.mock("@/lib/actions/venue-organizations", () => ({}));

import {
  registerForSignupEvent,
  cancelMyEventRegistration,
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

  it("blocks registration when the slot is full", async () => {
    mockPrisma.signupSlot.findFirst.mockResolvedValue(makeSlot({ capacity: 40 }));
    mockTx.eventRegistration.count.mockResolvedValue(40);

    const result = await registerForSignupEvent({
      eventId: EVENT_ID,
      slotId: SLOT_ID,
      participants: [{ name: "Liam Beacom" }],
    });

    expect(result).toEqual({ success: false, error: "This slot just filled up." });
    expect(mockTx.eventRegistration.create).not.toHaveBeenCalled();
  });

  it("reports remaining spots when a batch does not fit", async () => {
    mockPrisma.signupSlot.findFirst.mockResolvedValue(makeSlot({ capacity: 40 }));
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
