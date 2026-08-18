import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  mockRequireUserId,
  mockRequireSignupEventHostAdmin,
  mockRequireEventManager,
  mockIsEventManager,
  mockGetCurrentUserId,
  mockIsStripeEnabled,
  mockUpdatedEmail,
  mockCanceledEmail,
  mockCreateVenueReservation,
  mockAssignVenueReservation,
  mockTransitionVenueReservation,
  mockPrisma,
} = vi.hoisted(() => ({
  mockRequireUserId: vi.fn(),
  mockRequireSignupEventHostAdmin: vi.fn(),
  mockRequireEventManager: vi.fn(),
  mockIsEventManager: vi.fn(),
  mockGetCurrentUserId: vi.fn(),
  mockIsStripeEnabled: vi.fn(),
  mockUpdatedEmail: vi.fn(),
  mockCanceledEmail: vi.fn(),
  mockCreateVenueReservation: vi.fn(),
  mockAssignVenueReservation: vi.fn(),
  mockTransitionVenueReservation: vi.fn(),
  mockPrisma: {
    $transaction: vi.fn(),
    signupEvent: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn(),
    },
    signupSlot: { update: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    eventRegistrationPhase: { deleteMany: vi.fn(), create: vi.fn() },
    eventRegistration: { findMany: vi.fn(), count: vi.fn() },
    eventGame: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
    auditLog: { create: vi.fn() },
    eventManager: { findUnique: vi.fn(), findMany: vi.fn() },
    league: { findUnique: vi.fn(), update: vi.fn() },
    venue: { findUnique: vi.fn(), findMany: vi.fn() },
    venueStaff: { findMany: vi.fn() },
    leagueUser: { findMany: vi.fn() },
    teamMember: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    eventInvitation: { findFirst: vi.fn() },
    venueReservation: undefined as unknown as Record<string, ReturnType<typeof vi.fn>>,
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireUserId: (...args: unknown[]) => mockRequireUserId(...args),
  requireSignupEventHostAdmin: (...args: unknown[]) => mockRequireSignupEventHostAdmin(...args),
  requireEventManager: (...args: unknown[]) => mockRequireEventManager(...args),
  isEventManager: (...args: unknown[]) => mockIsEventManager(...args),
  getCurrentUserId: (...args: unknown[]) => mockGetCurrentUserId(...args),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/payments/stripe", () => ({
  isStripeEnabled: (...args: unknown[]) => mockIsStripeEnabled(...args),
}));

vi.mock("@/lib/email/templates", () => ({
  sendSignupEventUpdatedEmail: (...args: unknown[]) => mockUpdatedEmail(...args),
  sendSignupEventCanceledEmail: (...args: unknown[]) => mockCanceledEmail(...args),
}));

vi.mock("@/lib/actions/venue-organizations", () => ({}));
vi.mock("@/lib/services/venue-reservations", () => ({
  assignVenueReservation: (...args: unknown[]) => mockAssignVenueReservation(...args),
  createVenueReservation: (...args: unknown[]) => mockCreateVenueReservation(...args),
  transitionVenueReservation: (...args: unknown[]) => mockTransitionVenueReservation(...args),
  VenueReservationConflictError: class extends Error {
    conflicts: unknown[];
    constructor(conflicts: unknown[]) {
      super("conflict");
      this.conflicts = conflicts;
    }
  },
  VenueReservationLifecycleError: class extends Error {},
}));

import {
  createSignupEvent,
  publishSignupEvent,
  cancelSignupEvent,
  updateSignupEvent,
} from "@/lib/actions/signup-events";

const futureDate = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000);

const validCreateInput = {
  title: "Mite Night",
  category: "SCRIMMAGE" as const,
  ageClassification: "U8" as const,
  visibility: "PUBLIC" as const,
  startAt: futureDate(24 * 7),
  endAt: futureDate(24 * 7 + 2),
  acceptsOnlinePayment: false,
  acceptsManualPayment: true,
  galleryEnabled: true,
  galleryVisibility: "PARTICIPANTS" as const,
  publicRoster: false,
  hostLeagueId: "cldleague0000000000000001",
  slots: [
    { name: "Skater", capacity: 40, waitlistEnabled: true, sortOrder: 0 },
    { name: "Goalie", capacity: 4, waitlistEnabled: true, sortOrder: 1 },
  ],
  phases: [],
};

describe("createSignupEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUserId.mockResolvedValue("user-1");
    mockRequireSignupEventHostAdmin.mockResolvedValue("user-1");
  });

  it("creates a draft event with slots for an authorized host admin", async () => {
    mockPrisma.signupEvent.create.mockResolvedValue({ id: "event-1" });

    const result = await createSignupEvent(validCreateInput);

    expect(result.success).toBe(true);
    expect(mockRequireSignupEventHostAdmin).toHaveBeenCalledWith({
      organizationId: undefined,
      leagueId: validCreateInput.hostLeagueId,
      teamId: undefined,
    });
    const createArgs = mockPrisma.signupEvent.create.mock.calls[0][0];
    expect(createArgs.data.slots.create).toHaveLength(2);
    expect(createArgs.data.hostLeagueId).toBe(validCreateInput.hostLeagueId);
  });

  it("rejects when the user is not a host admin", async () => {
    mockRequireSignupEventHostAdmin.mockRejectedValue(
      new Error("Unauthorized: You do not have permission to manage events for this host")
    );

    const result = await createSignupEvent(validCreateInput);

    expect(result).toEqual({
      success: false,
      error: "Unauthorized: You do not have permission to manage events for this host",
    });
    expect(mockPrisma.signupEvent.create).not.toHaveBeenCalled();
  });

  it("rejects when two hosting entities are provided", async () => {
    const result = await createSignupEvent({
      ...validCreateInput,
      hostTeamId: "cldteam00000000000000001",
    });

    expect(result.success).toBe(false);
    expect(mockPrisma.signupEvent.create).not.toHaveBeenCalled();
  });

  it("rejects when no hosting entity is provided", async () => {
    const result = await createSignupEvent({ ...validCreateInput, hostLeagueId: undefined });

    expect(result.success).toBe(false);
    expect(mockPrisma.signupEvent.create).not.toHaveBeenCalled();
  });

  it("rejects when end time is before start time", async () => {
    const result = await createSignupEvent({
      ...validCreateInput,
      endAt: new Date(validCreateInput.startAt.getTime() - 1000),
    });

    expect(result.success).toBe(false);
    expect(mockPrisma.signupEvent.create).not.toHaveBeenCalled();
  });
});

describe("publishSignupEvent", () => {
  const eventId = "cldevent0000000000000001";

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireEventManager.mockResolvedValue("user-1");
  });

  it("refuses to publish an event with no slots", async () => {
    mockPrisma.signupEvent.findUnique.mockResolvedValue({
      id: eventId,
      status: "DRAFT",
      visibility: "PUBLIC",
      linkToken: null,
      acceptsOnlinePayment: false,
      acceptsManualPayment: true,
      hostTeamId: null,
      venue: null,
      hostOrganization: null,
      hostLeague: null,
      slots: [],
    });

    const result = await publishSignupEvent({ eventId });

    expect(result).toEqual({
      success: false,
      error: "Add at least one signup slot before publishing.",
    });
  });

  it("refuses online payments without an onboarded merchant", async () => {
    mockIsStripeEnabled.mockReturnValue(true);
    mockPrisma.signupEvent.findUnique.mockResolvedValue({
      id: eventId,
      status: "DRAFT",
      visibility: "PUBLIC",
      linkToken: null,
      acceptsOnlinePayment: true,
      acceptsManualPayment: false,
      hostTeamId: null,
      venue: null,
      hostOrganization: null,
      hostLeague: {
        id: "league-1",
        name: "My Association",
        slug: null,
        stripeAccountId: null,
        stripeChargesEnabled: false,
      },
      slots: [{ id: "slot-1", priceAmount: 2500 }],
    });

    const result = await publishSignupEvent({ eventId });

    expect(result.success).toBe(false);
    expect(mockPrisma.signupEvent.update).not.toHaveBeenCalled();
  });

  it("refuses online payments for team-hosted events", async () => {
    mockPrisma.signupEvent.findUnique.mockResolvedValue({
      id: eventId,
      status: "DRAFT",
      visibility: "PUBLIC",
      linkToken: null,
      acceptsOnlinePayment: true,
      acceptsManualPayment: true,
      hostTeamId: "team-1",
      venue: null,
      hostOrganization: null,
      hostLeague: null,
      slots: [{ id: "slot-1", priceAmount: 2500 }],
    });

    const result = await publishSignupEvent({ eventId });

    expect(result).toEqual({
      success: false,
      error: "Team-hosted events support manual payment methods only.",
    });
  });

  it("publishes a valid draft and mints the league slug for the first public event", async () => {
    mockPrisma.signupEvent.findUnique.mockResolvedValue({
      id: eventId,
      status: "DRAFT",
      visibility: "PUBLIC",
      linkToken: null,
      acceptsOnlinePayment: false,
      acceptsManualPayment: true,
      hostTeamId: null,
      venue: { slug: null },
      hostOrganization: null,
      hostLeague: {
        id: "league-1",
        name: "Great Falls Hockey Association",
        slug: null,
        stripeAccountId: null,
        stripeChargesEnabled: false,
      },
      slots: [{ id: "slot-1", priceAmount: null }],
    });
    mockPrisma.league.findUnique.mockResolvedValue(null);
    mockPrisma.league.update.mockResolvedValue({});
    mockPrisma.signupEvent.update.mockResolvedValue({});

    const result = await publishSignupEvent({ eventId });

    expect(result.success).toBe(true);
    expect(mockPrisma.league.update).toHaveBeenCalledWith({
      where: { id: "league-1" },
      data: { slug: "great-falls-hockey-association" },
    });
    expect(mockPrisma.signupEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: eventId, status: "DRAFT" }),
        data: expect.objectContaining({ status: "PUBLISHED" }),
      })
    );
  });

  it("atomically materializes child reservations without a conflicting parent claim", async () => {
    const draft = {
      id: eventId,
      status: "DRAFT",
      visibility: "PUBLIC",
      linkToken: null,
      acceptsOnlinePayment: false,
      acceptsManualPayment: true,
      hostTeamId: null,
      venueId: "clvenue0000000000000001",
      startAt: futureDate(24 * 7),
      endAt: futureDate(24 * 7 + 2),
      timezone: "America/New_York",
      venueReservationId: null,
      venue: { slug: "test-rink" },
      hostOrganization: { id: "org-1", stripeAccountId: null, stripeChargesEnabled: false },
      hostLeague: null,
      slots: [{ id: "slot-1", priceAmount: null }],
    };
    mockRequireUserId.mockResolvedValue("user-1");
    mockPrisma.signupEvent.findUnique.mockResolvedValue(draft);
    mockPrisma.venueReservation = {};
    mockPrisma.eventGame.findMany.mockResolvedValueOnce([
      {
        id: "game-1",
        startAt: draft.startAt,
        endAt: futureDate(24 * 7 + 1),
        surfaceId: "surface-1",
        segmentId: null,
        venueReservationId: null,
      },
      {
        id: "game-2",
        startAt: futureDate(24 * 7 + 1),
        endAt: draft.endAt,
        surfaceId: "surface-1",
        segmentId: null,
        venueReservationId: null,
      },
    ]);
    mockCreateVenueReservation
      .mockResolvedValueOnce({ id: "reservation-1" })
      .mockResolvedValueOnce({ id: "reservation-2" });

    const result = await publishSignupEvent({ eventId });

    expect(result.success).toBe(true);
    expect(mockCreateVenueReservation).toHaveBeenCalledTimes(2);
    expect(mockAssignVenueReservation).toHaveBeenCalledTimes(2);
    expect(mockAssignVenueReservation).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ targetType: "EVENT_GAME", targetId: "game-1" }),
    );
    expect(mockAssignVenueReservation).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetType: "SIGNUP_EVENT" }),
    );
    expect(mockPrisma.signupEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: eventId, status: "DRAFT" } }),
    );
  });

  it("refuses to republish a canceled event", async () => {
    mockPrisma.signupEvent.findUnique.mockResolvedValue({
      id: eventId,
      status: "CANCELED",
      visibility: "PUBLIC",
      linkToken: null,
      acceptsOnlinePayment: false,
      acceptsManualPayment: true,
      hostTeamId: null,
      venue: null,
      hostOrganization: null,
      hostLeague: null,
      slots: [{ id: "slot-1", priceAmount: null }],
    });

    const result = await publishSignupEvent({ eventId });

    expect(result.success).toBe(false);
  });
});

describe("cancelSignupEvent", () => {
  const eventId = "cldevent0000000000000001";

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireEventManager.mockResolvedValue("user-1");
  });

  it("cancels, notifies active registrants, and reports paid registrations", async () => {
    mockPrisma.signupEvent.findUnique.mockResolvedValue({
      id: eventId,
      status: "PUBLISHED",
      title: "Mite Night",
      venue: null,
      hostLeague: { slug: "gfha", name: "GFHA" },
      hostOrganization: null,
      hostTeam: null,
    });
    mockPrisma.eventRegistration.findMany.mockResolvedValue([
      { registrant: { email: "parent@example.com", name: "Parent" } },
    ]);
    mockPrisma.eventRegistration.count.mockResolvedValue(3);
    mockPrisma.signupEvent.update.mockResolvedValue({});

    const result = await cancelSignupEvent({ eventId });

    expect(result).toEqual({ success: true, data: { eventId, paidRegistrations: 3 } });
    expect(mockCanceledEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        eventTitle: "Mite Night",
        recipients: [{ email: "parent@example.com", name: "Parent" }],
      })
    );
  });

  it("refuses to cancel an already-canceled event", async () => {
    mockPrisma.signupEvent.findUnique.mockResolvedValue({
      id: eventId,
      status: "CANCELED",
      title: "Mite Night",
      venue: null,
      hostLeague: null,
      hostOrganization: null,
      hostTeam: null,
    });

    const result = await cancelSignupEvent({ eventId });

    expect(result).toEqual({ success: false, error: "This event is already canceled." });
    expect(mockPrisma.signupEvent.update).not.toHaveBeenCalled();
  });

  it("atomically replaces a published event reservation when its window moves", async () => {
    const eventId = "cldevent0000000000000001";
    const oldStart = futureDate(24 * 8);
    const oldEnd = futureDate(24 * 8 + 2);
    const newStart = futureDate(24 * 9);
    const newEnd = futureDate(24 * 9 + 2);
    const existing = {
      id: eventId,
      status: "PUBLISHED",
      venueReservationId: "cloldreservation00000001",
      startAt: oldStart,
      endAt: oldEnd,
      venueId: "clvenue0000000000000001",
      locationText: null,
      visibility: "PUBLIC",
      linkToken: null,
      title: "Mite Night",
      timezone: "America/New_York",
      hostOrganizationId: null,
      hostLeagueId: "cldleague0000000000000001",
      hostTeamId: null,
      venue: { slug: null },
      hostLeague: { slug: "gfha", name: "GFHA" },
      hostOrganization: null,
      hostTeam: null,
      slots: [],
    };
    mockRequireEventManager.mockResolvedValue("user-1");
    mockPrisma.venueReservation = { findUnique: vi.fn() };
    mockPrisma.venue.findUnique.mockResolvedValue({ timezone: "America/New_York" });
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(mockPrisma));
    mockPrisma.signupEvent.findUnique
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({
        id: eventId,
        status: "PUBLISHED",
        venueReservationId: existing.venueReservationId,
        hostOrganizationId: null,
        hostLeagueId: existing.hostLeagueId,
        hostTeamId: null,
        timezone: existing.timezone,
        venueId: existing.venueId,
      });
    mockPrisma.venueReservation.findUnique.mockResolvedValue({ id: existing.venueReservationId, eventGames: [] });
    mockCreateVenueReservation.mockResolvedValue({ id: "clnewreservation0000001" });
    mockPrisma.signupEvent.update.mockResolvedValue({});

    const result = await updateSignupEvent({
      ...validCreateInput,
      eventId,
      startAt: newStart,
      endAt: newEnd,
      venueId: existing.venueId,
    });

    expect(result.success).toBe(true);
    expect(mockTransitionVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reservationId: existing.venueReservationId,
        nextStatus: "CANCELED",
      }),
    );
    expect(mockCreateVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ startsAt: newStart, endsAt: newEnd }),
    );
    expect(mockAssignVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        targetType: "SIGNUP_EVENT",
        targetId: eventId,
      }),
    );
    expect(mockPrisma.signupEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ venueReservationId: "clnewreservation0000001" }),
      }),
    );
  });

  it("does not update the event when the replacement reservation conflicts", async () => {
    const eventId = "cldevent0000000000000001";
    const existing = {
      id: eventId,
      status: "PUBLISHED",
      venueReservationId: "cloldreservation00000001",
      startAt: futureDate(24 * 8),
      endAt: futureDate(24 * 8 + 2),
      venueId: "clvenue0000000000000001",
      locationText: null,
      visibility: "PUBLIC",
      linkToken: null,
      title: "Mite Night",
      timezone: "America/New_York",
      hostOrganizationId: null,
      hostLeagueId: "cldleague0000000000000001",
      hostTeamId: null,
      venue: { slug: null },
      hostLeague: { slug: "gfha", name: "GFHA" },
      hostOrganization: null,
      hostTeam: null,
      slots: [],
    };
    mockRequireEventManager.mockResolvedValue("user-1");
    mockPrisma.venueReservation = { findUnique: vi.fn() };
    mockPrisma.venue.findUnique.mockResolvedValue({ timezone: "America/New_York" });
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(mockPrisma));
    mockPrisma.signupEvent.findUnique
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({
        id: eventId,
        status: "PUBLISHED",
        venueReservationId: existing.venueReservationId,
        hostOrganizationId: null,
        hostLeagueId: existing.hostLeagueId,
        hostTeamId: null,
        timezone: existing.timezone,
        venueId: existing.venueId,
      });
    mockPrisma.venueReservation.findUnique.mockResolvedValue({ id: existing.venueReservationId, eventGames: [] });
    mockCreateVenueReservation.mockRejectedValue(new Error("That venue space is no longer available."));

    const result = await updateSignupEvent({
      ...validCreateInput,
      eventId,
      startAt: futureDate(24 * 9),
      endAt: futureDate(24 * 9 + 2),
      venueId: existing.venueId,
    });

    expect(result.success).toBe(false);
    expect(mockPrisma.signupEvent.update).not.toHaveBeenCalled();
  });

  it("rejects a published reschedule when child games have independent reservations", async () => {
    const existing = {
      id: eventId,
      status: "PUBLISHED",
      venueReservationId: null,
      startAt: futureDate(24 * 8),
      endAt: futureDate(24 * 8 + 2),
      venueId: "clvenue0000000000000001",
      locationText: null,
      visibility: "PUBLIC",
      linkToken: null,
      title: "Mite Night",
      timezone: "America/New_York",
      hostOrganizationId: null,
      hostLeagueId: "cldleague0000000000000001",
      hostTeamId: null,
      venue: { slug: null },
      hostLeague: { slug: "gfha", name: "GFHA" },
      hostOrganization: null,
      hostTeam: null,
      slots: [],
    };
    mockPrisma.venueReservation = { findUnique: vi.fn() };
    mockPrisma.venue.findUnique.mockResolvedValue({ timezone: "America/New_York" });
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(mockPrisma));
    mockPrisma.signupEvent.findUnique
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({
        id: eventId,
        status: "PUBLISHED",
        venueReservationId: null,
        hostOrganizationId: null,
        hostLeagueId: existing.hostLeagueId,
        hostTeamId: null,
        timezone: existing.timezone,
        venueId: existing.venueId,
      });
    mockPrisma.eventGame.findMany.mockResolvedValue([{ id: "game-1" }]);

    const result = await updateSignupEvent({
      ...validCreateInput,
      eventId,
      startAt: futureDate(24 * 9),
      endAt: futureDate(24 * 9 + 2),
      venueId: existing.venueId,
    });

    expect(result).toEqual({
      success: false,
      error: "Published events with games cannot be rescheduled.",
    });
    expect(mockCreateVenueReservation).not.toHaveBeenCalled();
    expect(mockPrisma.eventGame.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId } }),
    );
  });
});

describe("SignupEvent lifecycle concurrency", () => {
  const eventId = "cldevent0000000000000001";

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireEventManager.mockResolvedValue("user-1");
    mockRequireUserId.mockResolvedValue("user-1");
  });

  it("does not publish after a concurrent cancel changes the draft state", async () => {
    const draft = {
      id: eventId,
      status: "DRAFT",
      visibility: "PUBLIC",
      linkToken: null,
      acceptsOnlinePayment: false,
      acceptsManualPayment: true,
      hostTeamId: null,
      venueId: null,
      startAt: null,
      endAt: null,
      timezone: "America/New_York",
      venueReservationId: null,
      venue: null,
      hostOrganization: null,
      hostLeague: null,
      slots: [{ id: "slot-1", priceAmount: null }],
    };
    mockPrisma.signupEvent.findUnique
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce({ ...draft, status: "CANCELED" });
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(mockPrisma));

    const result = await publishSignupEvent({ eventId });

    expect(result).toEqual({ success: false, error: "This event is no longer a draft." });
    expect(mockPrisma.signupEvent.updateMany).not.toHaveBeenCalled();
  });

  it("does not report cancellation success after a concurrent lifecycle update wins", async () => {
    mockPrisma.signupEvent.findUnique
      .mockResolvedValueOnce({
        id: eventId,
        status: "PUBLISHED",
        title: "Mite Night",
        venue: null,
        hostLeague: null,
        hostOrganization: null,
        hostTeam: null,
        venueReservationId: null,
      })
      .mockResolvedValueOnce({
        id: eventId,
        status: "PUBLISHED",
        venueReservationId: null,
        hostLeagueId: null,
        hostTeamId: null,
      });
    mockPrisma.eventRegistration.findMany.mockResolvedValue([]);
    mockPrisma.eventRegistration.count.mockResolvedValue(0);
    mockPrisma.eventGame.findMany.mockResolvedValue([]);
    mockPrisma.signupEvent.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(mockPrisma));

    const result = await cancelSignupEvent({ eventId });

    expect(result).toEqual({
      success: false,
      error: "This event changed while it was being canceled.",
    });
    expect(mockCanceledEmail).not.toHaveBeenCalled();
  });

  it("cancels active child game reservations and records child lifecycle changes", async () => {
    mockPrisma.signupEvent.findUnique
      .mockResolvedValueOnce({
        id: eventId,
        status: "PUBLISHED",
        title: "Mite Night",
        venue: null,
        hostLeague: null,
        hostOrganization: null,
        hostTeam: null,
        venueReservationId: null,
      })
      .mockResolvedValueOnce({
        id: eventId,
        status: "PUBLISHED",
        venueReservationId: null,
        hostLeagueId: "league-1",
        hostTeamId: "team-1",
      });
    mockPrisma.eventRegistration.findMany.mockResolvedValue([]);
    mockPrisma.eventRegistration.count.mockResolvedValue(0);
    mockPrisma.eventGame.findMany.mockResolvedValue([
      {
        id: "game-1",
        status: "SCHEDULED",
        venueReservationId: "reservation-child",
        venueReservation: { id: "reservation-child", status: "CONFIRMED" },
      },
    ]);
    mockPrisma.venueReservation = {};
    mockPrisma.signupEvent.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(mockPrisma));

    const result = await cancelSignupEvent({ eventId });

    expect(result.success).toBe(true);
    expect(mockTransitionVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reservationId: "reservation-child",
        nextStatus: "CANCELED",
      }),
    );
    expect(mockPrisma.eventGame.update).toHaveBeenCalledWith({
      where: { id: "game-1" },
      data: { status: "CANCELED" },
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "EVENT_GAME_CANCELED",
          resourceId: "game-1",
        }),
      }),
    );
  });
});
