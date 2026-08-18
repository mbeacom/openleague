import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockPrismaEvent,
  mockPrismaTeamMember,
  mockPrismaVenue,
  mockPrismaLeagueUser,
  mockRequireUserId,
  mockRequireTeamAdmin,
  mockGetViewableTeamIds,
  mockAssignVenueReservation,
  mockCreateVenueReservation,
  mockSendEventNotifications,
  mockCanUserAccessVenue,
} = vi.hoisted(() => ({
  mockPrismaEvent: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  mockPrismaVenue: { findUnique: vi.fn() },
  mockPrismaTeamMember: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  mockPrismaLeagueUser: {
    findFirst: vi.fn(),
  },
  mockRequireUserId: vi.fn(),
  mockRequireTeamAdmin: vi.fn(),
  mockGetViewableTeamIds: vi.fn(),
  mockAssignVenueReservation: vi.fn(),
  mockCreateVenueReservation: vi.fn(),
  mockSendEventNotifications: vi.fn().mockResolvedValue(undefined),
  mockCanUserAccessVenue: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireUserId: (...args: unknown[]) => mockRequireUserId(...args),
  requireTeamAdmin: (...args: unknown[]) => mockRequireTeamAdmin(...args),
  requireTeamMember: vi.fn(),
  getViewableTeamIds: (...args: unknown[]) => mockGetViewableTeamIds(...args),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (work: (tx: unknown) => unknown) =>
      work({ event: mockPrismaEvent }),
    ),
    event: mockPrismaEvent,
    teamMember: mockPrismaTeamMember,
    leagueUser: mockPrismaLeagueUser,
    venue: mockPrismaVenue,
    venueReservation: {},
  },
}));

// Side-effecting / heavy modules pulled in by events.ts at import time.
vi.mock("@/lib/email/templates", () => ({
  sendEventNotifications: (...args: unknown[]) => mockSendEventNotifications(...args),
}));
vi.mock("@/lib/actions/venues", () => ({
  canUserAccessVenue: (...args: unknown[]) => mockCanUserAccessVenue(...args),
}));
vi.mock("@/lib/utils/availability", () => ({
  findBookingConflicts: vi.fn(),
}));
vi.mock("@/lib/services/venue-reservations", () => ({
  assignVenueReservation: (...args: unknown[]) => mockAssignVenueReservation(...args),
  createVenueReservation: (...args: unknown[]) => mockCreateVenueReservation(...args),
  transitionVenueReservation: vi.fn(),
  VenueReservationConflictError: class extends Error {
    conflicts: unknown[];
    constructor(conflicts: unknown[]) {
      super("conflict");
      this.conflicts = conflicts;
    }
  },
}));

import { createEvent, getEvent, updateEvent } from "@/lib/actions/events";

const GUARDIAN_USER_ID = "user-guardian";
const MEMBER_USER_ID = "user-member";
const TEAM_ID = "cteam00000000000000000001";
const OTHER_TEAM_ID = "cteam00000000000000000002";
const EVENT_ID = "cevent0000000000000000001";

/** A standalone (non-league) team event with no RSVP rows. */
function buildEvent(teamId: string) {
  return {
    id: EVENT_ID,
    type: "GAME",
    title: "vs Wolves",
    startAt: new Date("2026-08-01T18:00:00Z"),
    teamId,
    leagueId: null,
    team: { id: teamId, name: "Ice Hawks", leagueId: null },
    rsvps: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getEvent — guardian-aware view access", () => {
  it("lets a guardian-only user view their child's team event at MEMBER level", async () => {
    mockRequireUserId.mockResolvedValue(GUARDIAN_USER_ID);
    mockPrismaEvent.findUnique.mockResolvedValue(buildEvent(TEAM_ID));
    // Guardian is not a direct member of the team.
    mockPrismaTeamMember.findUnique.mockResolvedValue(null);
    // Guardianship makes the child's team viewable.
    mockGetViewableTeamIds.mockResolvedValue([TEAM_ID]);

    const result = await getEvent(EVENT_ID);

    expect(result).not.toBeNull();
    expect(result?.userRole).toBe("MEMBER");
    // VIEW only — guardians never get self-RSVP or management controls here.
    expect(result?.canRSVP).toBe(false);
    expect(result?.canManageEvent).toBe(false);
    expect(mockGetViewableTeamIds).toHaveBeenCalledWith(GUARDIAN_USER_ID);
  });

  it("blocks a guardian from viewing an unrelated team's event (404)", async () => {
    mockRequireUserId.mockResolvedValue(GUARDIAN_USER_ID);
    mockPrismaEvent.findUnique.mockResolvedValue(buildEvent(OTHER_TEAM_ID));
    mockPrismaTeamMember.findUnique.mockResolvedValue(null);
    // The guardian only guards a child on TEAM_ID, never OTHER_TEAM_ID.
    mockGetViewableTeamIds.mockResolvedValue([TEAM_ID]);

    const result = await getEvent(EVENT_ID);

    expect(result).toBeNull();
  });

  it("does not consult guardian access for a direct team member", async () => {
    mockRequireUserId.mockResolvedValue(MEMBER_USER_ID);
    mockPrismaEvent.findUnique.mockResolvedValue(buildEvent(TEAM_ID));
    mockPrismaTeamMember.findUnique.mockResolvedValue({ role: "MEMBER" });

    const result = await getEvent(EVENT_ID);

    expect(result).not.toBeNull();
    expect(result?.userRole).toBe("MEMBER");
    expect(result?.canRSVP).toBe(true);
    expect(result?.canManageEvent).toBe(false);
    // Membership already grants access — the guardian fallback must be skipped.
    expect(mockGetViewableTeamIds).not.toHaveBeenCalled();
  });

  it("returns null for a non-member, non-guardian, non-league-admin viewer", async () => {
    mockRequireUserId.mockResolvedValue("user-stranger");
    mockPrismaEvent.findUnique.mockResolvedValue(buildEvent(TEAM_ID));
    mockPrismaTeamMember.findUnique.mockResolvedValue(null);
    mockGetViewableTeamIds.mockResolvedValue([]);

    const result = await getEvent(EVENT_ID);

    expect(result).toBeNull();
  });
});

describe("venue-backed team events", () => {
  const venueId = "cvenue0000000000000000001";
  const reservationId = "cres000000000000000000001";
  const event = {
    id: EVENT_ID,
    type: "GAME",
    title: "vs Wolves",
    startAt: new Date("2099-08-01T18:00:00Z"),
    endAt: new Date("2099-08-01T19:00:00Z"),
    location: "North Rink",
    opponent: "Wolves",
    notes: null,
  };

  beforeEach(() => {
    mockRequireTeamAdmin.mockResolvedValue(GUARDIAN_USER_ID);
    mockCanUserAccessVenue.mockResolvedValue(true);
    mockPrismaTeamMember.findMany.mockResolvedValue([]);
    mockPrismaVenue.findUnique
      .mockResolvedValueOnce({
        id: venueId,
        name: "North Rink",
        timezone: "America/New_York",
        isActive: true,
        visibility: "PUBLIC",
        teamId: TEAM_ID,
        leagueId: null,
      })
      .mockResolvedValueOnce({ name: "North Rink", timezone: "America/New_York" });
    mockPrismaEvent.create.mockResolvedValue(event);
    mockAssignVenueReservation.mockResolvedValue({ id: reservationId });
  });

  it("rejects create before authorization when a venue event has no end time", async () => {
    const result = await createEvent({
      type: "PRACTICE",
      title: "Practice",
      startAt: event.startAt,
      location: "North Rink",
      teamId: TEAM_ID,
      venueId,
      overrideConflicts: false,
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("End date and time is required"),
    });
    expect(mockRequireTeamAdmin).not.toHaveBeenCalled();
    expect(mockPrismaEvent.create).not.toHaveBeenCalled();
  });

  it("rejects update before lookup when a venue event has no end time", async () => {
    const result = await updateEvent({
      id: EVENT_ID,
      type: "PRACTICE",
      title: "Practice",
      startAt: event.startAt,
      location: "North Rink",
      teamId: TEAM_ID,
      venueId,
      overrideConflicts: false,
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("End date and time is required"),
    });
    expect(mockPrismaEvent.findUnique).not.toHaveBeenCalled();
    expect(mockPrismaEvent.update).not.toHaveBeenCalled();
  });

  it("assigns exact existing inventory without minting venue-wide occupancy", async () => {
    const result = await createEvent({
      type: "GAME",
      title: "vs Wolves",
      startAt: event.startAt,
      endAt: event.endAt,
      location: "North Rink",
      opponent: "Wolves",
      teamId: TEAM_ID,
      venueId,
      reservationId,
      overrideConflicts: false,
    });

    expect(result.success).toBe(true);
    expect(mockCreateVenueReservation).not.toHaveBeenCalled();
    expect(mockAssignVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reservationId,
        targetType: "EVENT",
        actorId: GUARDIAN_USER_ID,
      }),
    );
  });

  it("rejects a timed venue event without explicit reservation inventory", async () => {
    const result = await createEvent({
      type: "GAME",
      title: "vs Wolves",
      startAt: event.startAt,
      endAt: event.endAt,
      location: "North Rink",
      opponent: "Wolves",
      teamId: TEAM_ID,
      venueId,
      overrideConflicts: false,
    });

    expect(result).toEqual(expect.objectContaining({
      success: false,
      error: expect.stringContaining("confirmed reservation"),
    }));
    expect(mockPrismaEvent.create).not.toHaveBeenCalled();
  });

  it("rejects a timed venue update when the reservation is omitted", async () => {
    mockPrismaEvent.findUnique.mockResolvedValue({
      teamId: TEAM_ID,
      venueReservationId: reservationId,
    });

    const result = await updateEvent({
      id: EVENT_ID,
      type: "PRACTICE",
      title: "Practice",
      startAt: event.startAt,
      endAt: event.endAt,
      location: "North Rink",
      teamId: TEAM_ID,
      venueId,
      overrideConflicts: false,
    });

    expect(result).toEqual(expect.objectContaining({
      success: false,
      error: expect.stringContaining("confirmed reservation"),
    }));
    expect(mockPrismaEvent.update).not.toHaveBeenCalled();
  });

  it("notifies only after the canonical transaction commits", async () => {
    const order: string[] = [];
    mockPrismaEvent.create.mockImplementation(async () => {
      order.push("create");
      return event;
    });
    mockAssignVenueReservation.mockImplementation(async () => {
      order.push("assign");
      return { id: reservationId };
    });
    mockSendEventNotifications.mockImplementation(async () => {
      order.push("notify");
    });

    const result = await createEvent({
      type: "GAME",
      title: "vs Wolves",
      startAt: event.startAt,
      endAt: event.endAt,
      location: "North Rink",
      opponent: "Wolves",
      teamId: TEAM_ID,
      venueId,
      reservationId,
      overrideConflicts: false,
    });

    expect(result.success).toBe(true);
    expect(order).toEqual(["create", "assign", "notify"]);
  });
});
