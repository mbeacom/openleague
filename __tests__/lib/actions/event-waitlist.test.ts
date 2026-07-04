import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { mockRequireUserId, mockRequireEventManager, mockOfferEmail, mockConfirmEmail, mockPrisma, mockTx } =
  vi.hoisted(() => {
    const mockTx = {
      eventRegistration: { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
      leagueUser: { count: vi.fn() },
      teamMember: { count: vi.fn() },
      venueStaff: { count: vi.fn() },
      user: { findUnique: vi.fn() },
      eventInvitation: { findFirst: vi.fn() },
    };
    return {
      mockRequireUserId: vi.fn(),
      mockRequireEventManager: vi.fn(),
      mockOfferEmail: vi.fn(),
      mockConfirmEmail: vi.fn(),
      mockTx,
      mockPrisma: {
        $transaction: vi.fn(),
        signupSlot: { findFirst: vi.fn(), findUnique: vi.fn() },
        eventRegistration: {
          findFirst: vi.fn(),
          findUnique: vi.fn(),
          findMany: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn(),
          count: vi.fn(),
        },
        leagueUser: { count: vi.fn() },
        teamMember: { count: vi.fn() },
        venueStaff: { count: vi.fn() },
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
  sendEventRegistrationRemovedEmail: vi.fn(),
  sendWaitlistOfferEmail: (...args: unknown[]) => mockOfferEmail(...args),
}));

vi.mock("@/lib/actions/venue-organizations", () => ({}));

import { resolvePhaseEligibility, type PhaseForEligibility } from "@/lib/utils/event-phases";
import { promoteNextWaitlistEntriesForSlot } from "@/lib/utils/event-waitlist";
import {
  registerForSignupEvent,
  claimWaitlistOffer,
  promoteWaitlistEntry,
} from "@/lib/actions/event-registrations";

const EVENT_ID = "cldevent0000000000000001";
const SLOT_ID = "cldslot00000000000000001";
const futureDate = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000);
const pastDate = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);

const leagueHost = {
  id: EVENT_ID,
  hostOrganizationId: null,
  hostLeagueId: "league-1",
  hostTeamId: null,
};

function phase(overrides: Partial<PhaseForEligibility>): PhaseForEligibility {
  return {
    id: "phase-1",
    name: "Phase",
    opensAt: pastDate(1),
    audience: "EVERYONE",
    divisions: [],
    teams: [],
    ...overrides,
  };
}

describe("resolvePhaseEligibility", () => {
  beforeEach(() => vi.clearAllMocks());

  it("treats an event with no phases as open", async () => {
    const result = await resolvePhaseEligibility(
      mockPrisma as never,
      { ...leagueHost, phases: [] },
      "user-1"
    );
    expect(result).toEqual({ eligibleNow: true, nextOpensAt: null });
  });

  it("matches an open EVERYONE phase, even anonymously", async () => {
    const result = await resolvePhaseEligibility(
      mockPrisma as never,
      { ...leagueHost, phases: [phase({ audience: "EVERYONE" })] },
      null
    );
    expect(result.eligibleNow).toBe(true);
  });

  it("matches HOST_MEMBERS for league members and rejects outsiders", async () => {
    const phases = [phase({ audience: "HOST_MEMBERS" })];

    mockPrisma.leagueUser.count.mockResolvedValue(1);
    mockPrisma.teamMember.count.mockResolvedValue(0);
    const member = await resolvePhaseEligibility(
      mockPrisma as never,
      { ...leagueHost, phases },
      "member-1"
    );
    expect(member.eligibleNow).toBe(true);

    mockPrisma.leagueUser.count.mockResolvedValue(0);
    mockPrisma.teamMember.count.mockResolvedValue(0);
    const outsider = await resolvePhaseEligibility(
      mockPrisma as never,
      { ...leagueHost, phases },
      "outsider-1"
    );
    expect(outsider.eligibleNow).toBe(false);
  });

  it("counts team membership in a league team as host membership", async () => {
    mockPrisma.leagueUser.count.mockResolvedValue(0);
    mockPrisma.teamMember.count.mockResolvedValue(1);
    const result = await resolvePhaseEligibility(
      mockPrisma as never,
      { ...leagueHost, phases: [phase({ audience: "HOST_MEMBERS" })] },
      "player-parent"
    );
    expect(result.eligibleNow).toBe(true);
  });

  it("ignores phases that have not opened and reports the next opening", async () => {
    const opensAt = futureDate(24);
    const result = await resolvePhaseEligibility(
      mockPrisma as never,
      { ...leagueHost, phases: [phase({ audience: "EVERYONE", opensAt })] },
      "user-1"
    );
    expect(result.eligibleNow).toBe(false);
    expect(result.nextOpensAt).toEqual(opensAt);
  });

  it("matches SELECTED_GROUPS through team and division membership", async () => {
    const phases = [
      phase({ audience: "SELECTED_GROUPS", teams: [{ id: "team-9" }], divisions: [{ id: "div-3" }] }),
    ];
    mockPrisma.teamMember.count.mockResolvedValue(1);
    const result = await resolvePhaseEligibility(
      mockPrisma as never,
      { ...leagueHost, phases },
      "user-1"
    );
    expect(result.eligibleNow).toBe(true);
    const where = mockPrisma.teamMember.count.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { teamId: { in: ["team-9"] } },
      { team: { divisionId: { in: ["div-3"] } } },
    ]);
  });
});

describe("registerForSignupEvent waitlist paths", () => {
  function makeSlot(overrides: Record<string, unknown> = {}, eventOverrides: Record<string, unknown> = {}) {
    return {
      id: SLOT_ID,
      name: "Skater",
      capacity: 2,
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

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUserId.mockResolvedValue("user-1");
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx));
    mockTx.eventRegistration.findMany.mockResolvedValue([]);
    mockTx.eventRegistration.count.mockResolvedValue(0);
    mockTx.eventRegistration.create.mockResolvedValue({ id: "reg-1" });
    mockPrisma.user.findUnique.mockResolvedValue({ email: "parent@example.com" });
  });

  it("waitlists the whole batch when the slot is full and waitlist is enabled", async () => {
    mockPrisma.signupSlot.findFirst.mockResolvedValue(makeSlot({ capacity: 2 }));
    mockTx.eventRegistration.count.mockResolvedValue(2);

    const result = await registerForSignupEvent({
      eventId: EVENT_ID,
      slotId: SLOT_ID,
      participants: [{ name: "Liam Beacom" }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("WAITLISTED");
    }
    expect(mockTx.eventRegistration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "WAITLISTED",
          waitlistJoinedAt: expect.any(Date),
          manualPaymentStatus: "NOT_REQUIRED",
        }),
      })
    );
    // No confirmation email for waitlist joins.
    expect(mockConfirmEmail).not.toHaveBeenCalled();
  });

  it("still errors when the slot is full and its waitlist is disabled", async () => {
    mockPrisma.signupSlot.findFirst.mockResolvedValue(makeSlot({ capacity: 2, waitlistEnabled: false }));
    mockTx.eventRegistration.count.mockResolvedValue(2);

    const result = await registerForSignupEvent({
      eventId: EVENT_ID,
      slotId: SLOT_ID,
      participants: [{ name: "Liam Beacom" }],
    });

    expect(result).toEqual({ success: false, error: "This slot just filled up." });
  });

  it("waitlists a user whose phase has not opened", async () => {
    mockPrisma.signupSlot.findFirst.mockResolvedValue(
      makeSlot({}, {
        phases: [
          phase({ audience: "HOST_MEMBERS", opensAt: pastDate(24) }),
          phase({ id: "phase-2", audience: "EVERYONE", opensAt: futureDate(24) }),
        ],
      })
    );
    // Not a league member → HOST_MEMBERS phase does not match.
    mockPrisma.leagueUser.count.mockResolvedValue(0);
    mockPrisma.teamMember.count.mockResolvedValue(0);

    const result = await registerForSignupEvent({
      eventId: EVENT_ID,
      slotId: SLOT_ID,
      participants: [{ name: "Liam Beacom" }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("WAITLISTED");
    }
  });

  it("confirms a host member during the members-only phase", async () => {
    mockPrisma.signupSlot.findFirst.mockResolvedValue(
      makeSlot({}, { phases: [phase({ audience: "HOST_MEMBERS", opensAt: pastDate(24) })] })
    );
    mockPrisma.leagueUser.count.mockResolvedValue(1);
    mockPrisma.teamMember.count.mockResolvedValue(0);

    const result = await registerForSignupEvent({
      eventId: EVENT_ID,
      slotId: SLOT_ID,
      participants: [{ name: "Liam Beacom" }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("CONFIRMED");
    }
  });
});

describe("promoteNextWaitlistEntriesForSlot", () => {
  const eventStartAt = futureDate(24 * 7);

  function makePromotableSlot(overrides: Record<string, unknown> = {}) {
    return {
      id: SLOT_ID,
      name: "Skater",
      capacity: 2,
      waitlistEnabled: true,
      event: {
        id: EVENT_ID,
        title: "Mite Night",
        status: "PUBLISHED",
        startAt: eventStartAt,
        registrationClosesAt: null,
        hostOrganizationId: null,
        hostLeagueId: "league-1",
        hostTeamId: null,
        phases: [],
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx));
  });

  it("offers freed spots to waitlisted entries in FIFO order", async () => {
    mockPrisma.signupSlot.findUnique.mockResolvedValue(makePromotableSlot());
    // One committed spot, capacity 2 → one free spot; second sweep sees it filled.
    mockTx.eventRegistration.count.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    mockTx.eventRegistration.findMany.mockResolvedValue([
      {
        id: "wl-1",
        participantName: "First Kid",
        registrantId: "parent-1",
        registrant: { email: "first@example.com" },
      },
      {
        id: "wl-2",
        participantName: "Second Kid",
        registrantId: "parent-2",
        registrant: { email: "second@example.com" },
      },
    ]);
    mockTx.eventRegistration.updateMany.mockResolvedValue({ count: 1 });

    const promoted = await promoteNextWaitlistEntriesForSlot(SLOT_ID);

    expect(promoted).toBe(1);
    expect(mockTx.eventRegistration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wl-1", status: "WAITLISTED" },
        data: expect.objectContaining({ status: "OFFERED", offerExpiresAt: expect.any(Date) }),
      })
    );
    const offerExpiresAt = mockTx.eventRegistration.updateMany.mock.calls[0][0].data.offerExpiresAt;
    expect(offerExpiresAt.getTime()).toBeLessThanOrEqual(eventStartAt.getTime());
    expect(mockOfferEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "first@example.com", participantName: "First Kid" })
    );
  });

  it("skips entries whose phase is not open and offers to the next eligible one", async () => {
    mockPrisma.signupSlot.findUnique.mockResolvedValue(
      makePromotableSlot({
        event: {
          ...makePromotableSlot().event,
          phases: [phase({ audience: "HOST_MEMBERS", opensAt: pastDate(24) })],
        },
      })
    );
    mockTx.eventRegistration.count.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
    mockTx.eventRegistration.findMany.mockResolvedValue([
      {
        id: "wl-outsider",
        participantName: "Outsider Kid",
        registrantId: "outsider",
        registrant: { email: "outsider@example.com" },
      },
      {
        id: "wl-member",
        participantName: "Member Kid",
        registrantId: "member",
        registrant: { email: "member@example.com" },
      },
    ]);
    // Eligibility checks run against the tx client: outsider is not a member,
    // the second candidate is.
    mockTx.leagueUser.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    mockTx.teamMember.count.mockResolvedValue(0);
    mockTx.eventRegistration.updateMany.mockResolvedValue({ count: 1 });

    const promoted = await promoteNextWaitlistEntriesForSlot(SLOT_ID);

    expect(promoted).toBe(1);
    expect(mockTx.eventRegistration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "wl-member", status: "WAITLISTED" } })
    );
  });

  it("does nothing when the slot is already full", async () => {
    mockPrisma.signupSlot.findUnique.mockResolvedValue(makePromotableSlot({ capacity: 2 }));
    mockTx.eventRegistration.count.mockResolvedValue(2);

    const promoted = await promoteNextWaitlistEntriesForSlot(SLOT_ID);

    expect(promoted).toBe(0);
    expect(mockTx.eventRegistration.updateMany).not.toHaveBeenCalled();
  });

  it("does nothing after the event has started", async () => {
    mockPrisma.signupSlot.findUnique.mockResolvedValue(
      makePromotableSlot({
        event: { ...makePromotableSlot().event, startAt: pastDate(1) },
      })
    );

    const promoted = await promoteNextWaitlistEntriesForSlot(SLOT_ID);

    expect(promoted).toBe(0);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("claimWaitlistOffer", () => {
  const REG_ID = "cldreg000000000000000001";

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUserId.mockResolvedValue("user-1");
    mockPrisma.user.findUnique.mockResolvedValue({ email: "parent@example.com" });
  });

  function makeOffer(overrides: Record<string, unknown> = {}) {
    return {
      id: REG_ID,
      status: "OFFERED",
      offerExpiresAt: futureDate(12),
      unitAmount: 0,
      participantName: "Liam Beacom",
      slot: { name: "Skater", priceCurrency: "USD" },
      event: {
        id: EVENT_ID,
        title: "Mite Night",
        startAt: futureDate(24 * 7),
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
      },
      ...overrides,
    };
  }

  it("confirms an unexpired offer and emails the registrant", async () => {
    mockPrisma.eventRegistration.findFirst.mockResolvedValue(makeOffer());
    mockPrisma.eventRegistration.updateMany.mockResolvedValue({ count: 1 });

    const result = await claimWaitlistOffer({ registrationId: REG_ID });

    expect(result).toEqual({ success: true, data: { registrationId: REG_ID, status: "CONFIRMED" } });
    expect(mockPrisma.eventRegistration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: REG_ID, status: "OFFERED" }),
        data: expect.objectContaining({ status: "CONFIRMED" }),
      })
    );
    expect(mockConfirmEmail).toHaveBeenCalled();
  });

  it("marks priced claims as unpaid manual payments", async () => {
    mockPrisma.eventRegistration.findFirst.mockResolvedValue(makeOffer({ unitAmount: 2500 }));
    mockPrisma.eventRegistration.updateMany.mockResolvedValue({ count: 1 });

    const result = await claimWaitlistOffer({ registrationId: REG_ID });

    expect(result.success).toBe(true);
    expect(mockPrisma.eventRegistration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ manualPaymentStatus: "UNPAID" }),
      })
    );
  });

  it("rejects an expired offer", async () => {
    mockPrisma.eventRegistration.findFirst.mockResolvedValue(
      makeOffer({ offerExpiresAt: pastDate(1) })
    );

    const result = await claimWaitlistOffer({ registrationId: REG_ID });

    expect(result.success).toBe(false);
    expect(mockPrisma.eventRegistration.updateMany).not.toHaveBeenCalled();
  });

  it("loses gracefully when the offer was already consumed", async () => {
    mockPrisma.eventRegistration.findFirst.mockResolvedValue(makeOffer());
    mockPrisma.eventRegistration.updateMany.mockResolvedValue({ count: 0 });

    const result = await claimWaitlistOffer({ registrationId: REG_ID });

    expect(result).toEqual({ success: false, error: "This offer is no longer available." });
  });
});

describe("promoteWaitlistEntry (manual)", () => {
  const REG_ID = "cldreg000000000000000001";

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireEventManager.mockResolvedValue("admin-1");
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx));
  });

  function makeWaitlisted() {
    return {
      id: REG_ID,
      eventId: EVENT_ID,
      status: "WAITLISTED",
      participantName: "Liam Beacom",
      registrant: { email: "parent@example.com" },
      slot: { id: SLOT_ID, name: "Skater", capacity: 2 },
      event: {
        id: EVENT_ID,
        title: "Mite Night",
        startAt: futureDate(24 * 7),
        venue: null,
        hostLeague: null,
      },
    };
  }

  it("refuses to offer a spot when the slot is full", async () => {
    mockPrisma.eventRegistration.findUnique.mockResolvedValue(makeWaitlisted());
    mockTx.eventRegistration.count.mockResolvedValue(2);

    const result = await promoteWaitlistEntry({ registrationId: REG_ID });

    expect(result).toEqual({
      success: false,
      error: "This slot is full — increase its capacity before offering more spots.",
    });
  });

  it("offers a spot when capacity allows and emails the registrant", async () => {
    mockPrisma.eventRegistration.findUnique.mockResolvedValue(makeWaitlisted());
    mockTx.eventRegistration.count.mockResolvedValue(1);
    mockTx.eventRegistration.updateMany.mockResolvedValue({ count: 1 });

    const result = await promoteWaitlistEntry({ registrationId: REG_ID });

    expect(result.success).toBe(true);
    expect(mockOfferEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "parent@example.com" })
    );
  });
});
