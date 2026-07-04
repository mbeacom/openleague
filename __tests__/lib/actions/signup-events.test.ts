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
  mockPrisma: {
    $transaction: vi.fn(),
    signupEvent: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    signupSlot: { update: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    eventRegistrationPhase: { deleteMany: vi.fn(), create: vi.fn() },
    eventRegistration: { findMany: vi.fn(), count: vi.fn() },
    eventManager: { findUnique: vi.fn(), findMany: vi.fn() },
    league: { findUnique: vi.fn(), update: vi.fn() },
    venue: { findUnique: vi.fn(), findMany: vi.fn() },
    venueStaff: { findMany: vi.fn() },
    leagueUser: { findMany: vi.fn() },
    teamMember: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    eventInvitation: { findFirst: vi.fn() },
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

import { createSignupEvent, publishSignupEvent, cancelSignupEvent } from "@/lib/actions/signup-events";

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
    expect(mockPrisma.signupEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: eventId },
        data: expect.objectContaining({ status: "PUBLISHED" }),
      })
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
});
