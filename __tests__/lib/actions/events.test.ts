import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockPrismaEvent,
  mockPrismaTeamMember,
  mockPrismaLeagueUser,
  mockRequireUserId,
  mockGetViewableTeamIds,
} = vi.hoisted(() => ({
  mockPrismaEvent: {
    findUnique: vi.fn(),
  },
  mockPrismaTeamMember: {
    findUnique: vi.fn(),
  },
  mockPrismaLeagueUser: {
    findFirst: vi.fn(),
  },
  mockRequireUserId: vi.fn(),
  mockGetViewableTeamIds: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireUserId: (...args: unknown[]) => mockRequireUserId(...args),
  requireTeamAdmin: vi.fn(),
  requireTeamMember: vi.fn(),
  getViewableTeamIds: (...args: unknown[]) => mockGetViewableTeamIds(...args),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    event: mockPrismaEvent,
    teamMember: mockPrismaTeamMember,
    leagueUser: mockPrismaLeagueUser,
  },
}));

// Side-effecting / heavy modules pulled in by events.ts at import time.
vi.mock("@/lib/email/templates", () => ({
  sendEventNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/actions/venues", () => ({
  canUserAccessVenue: vi.fn(),
}));
vi.mock("@/lib/utils/availability", () => ({
  findBookingConflicts: vi.fn(),
}));

import { getEvent } from "@/lib/actions/events";

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
