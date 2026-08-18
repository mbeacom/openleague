import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockAuth, mockDashboard } = vi.hoisted(() => ({
  mockPrisma: {
    event: { findMany: vi.fn() },
    practiceSession: { findMany: vi.fn() },
    signupEvent: { findMany: vi.fn() },
    venueStaff: { findMany: vi.fn() },
    team: { findMany: vi.fn() },
  },
  mockAuth: {
    getViewableTeamIds: vi.fn(),
    requireUserId: vi.fn(),
  },
  mockDashboard: { getViewerMemberships: vi.fn() },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/session", () => mockAuth);
vi.mock("@/lib/data/dashboard", () => mockDashboard);

import {
  deduplicateCalendarItems,
  getUserCalendarItems,
} from "@/lib/data/calendar";
import type { CalendarItem } from "@/types/events";

function item(overrides: Partial<CalendarItem>): CalendarItem {
  return {
    id: "event-1",
    source: "event",
    title: "Practice RSVP",
    startAt: "2026-09-07T10:00:00.000Z",
    endAt: "2026-09-07T11:00:00.000Z",
    scope: { teamId: "team-1", teamName: "Hawks" },
    href: "/events/event-1",
    ...overrides,
  };
}

describe("deduplicateCalendarItems", () => {
  it("uses practice metadata but preserves the participant Event RSVP href in either input order", () => {
    const aliases = [
      item({ venueReservationId: "reservation-1" }),
      item({
        id: "practice-1",
        source: "practice",
        title: "Team practice",
        href: "/practice-planner/practice-1",
        venueReservationId: "reservation-1",
      }),
    ];

    for (const result of [
      deduplicateCalendarItems(aliases),
      deduplicateCalendarItems([...aliases].reverse()),
    ]) {
      expect(result).toEqual([
        expect.objectContaining({
          id: "practice-1",
          source: "practice",
          title: "Team practice",
          href: "/events/event-1",
        }),
      ]);
    }
  });

  it("preserves independent legacy items without a reservation link", () => {
    const result = deduplicateCalendarItems([
      item({ id: "event-1" }),
      item({
        id: "practice-1",
        source: "practice",
        href: "/practice-planner/practice-1",
      }),
    ]);

    expect(result).toHaveLength(2);
  });
});

describe("getUserCalendarItems event privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.requireUserId.mockResolvedValue("user-1");
    mockAuth.getViewableTeamIds.mockResolvedValue([]);
    mockDashboard.getViewerMemberships.mockResolvedValue({
      teams: [],
      leagues: [{
        role: "MEMBER",
        league: { id: "league-1", name: "Association" },
      }],
    });
    mockPrisma.event.findMany.mockResolvedValue([]);
    mockPrisma.practiceSession.findMany.mockResolvedValue([]);
    mockPrisma.signupEvent.findMany.mockResolvedValue([]);
    mockPrisma.venueStaff.findMany.mockResolvedValue([]);
    mockPrisma.team.findMany.mockResolvedValue([]);
  });

  it("defaults an ordinary league member to least-privilege team scope", async () => {
    mockDashboard.getViewerMemberships.mockResolvedValue({
      teams: [{
        role: "MEMBER",
        team: { id: "team-1", name: "Hawks", leagueId: "league-1" },
      }],
      leagues: [{
        role: "MEMBER",
        league: { id: "league-1", name: "Association" },
      }],
    });
    mockPrisma.team.findMany.mockResolvedValue([{ id: "team-1" }]);

    await getUserCalendarItems({
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-10-01T00:00:00.000Z",
    });

    const eventQueries = mockPrisma.event.findMany.mock.calls.map(([args]) =>
      JSON.stringify(args.where),
    );
    expect(eventQueries.some((query) => query.includes("team-1"))).toBe(true);
    expect(eventQueries.every((query) => !query.includes('"leagueId":{"in":["league-1"]}'))).toBe(true);
  });

  it("resolves each league role independently for member privacy and admin aggregation", async () => {
    mockDashboard.getViewerMemberships.mockResolvedValue({
      teams: [],
      leagues: [
        { role: "MEMBER", league: { id: "league-member", name: "Member league" } },
        { role: "LEAGUE_ADMIN", league: { id: "league-admin", name: "Admin league" } },
      ],
    });
    mockPrisma.team.findMany.mockImplementation(async ({ where }) =>
      where.leagueId === "league-member"
        ? [{ id: "member-team" }]
        : [{ id: "admin-team-a" }, { id: "admin-team-b" }],
    );

    await getUserCalendarItems({
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-10-01T00:00:00.000Z",
    });

    const eventQueries = mockPrisma.event.findMany.mock.calls.map(([args]) =>
      JSON.stringify(args.where),
    );
    expect(eventQueries.some((query) => query.includes("member-team"))).toBe(true);
    expect(eventQueries.every((query) => !query.includes('"leagueId":{"in":["league-member"]}'))).toBe(true);
    expect(eventQueries.some((query) => query.includes('"leagueId":{"in":["league-admin"]}'))).toBe(true);
  });
});
