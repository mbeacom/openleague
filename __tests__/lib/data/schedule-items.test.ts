import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    event: { findMany: vi.fn() },
    seasonGame: { findMany: vi.fn() },
    practiceSession: { findMany: vi.fn() },
    signupEvent: { findMany: vi.fn() },
    eventGame: { findMany: vi.fn() },
    venueReservation: { findMany: vi.fn() },
    team: { findMany: vi.fn() },
    leagueUser: { findFirst: vi.fn() },
  },
}));
const { mockCanViewSignupEvent } = vi.hoisted(() => ({
  mockCanViewSignupEvent: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/utils/event-access", () => ({
  canViewSignupEvent: mockCanViewSignupEvent,
  isSignupEventManager: vi.fn(),
}));

import {
  deduplicateAssociationScheduleItems,
  getLeagueScheduleItems,
  getScheduleItems,
} from "@/lib/data/schedule-items";
import type { AssociationScheduleItemView } from "@/types/association-operations";

const startsAt = new Date("2026-09-07T10:00:00.000Z");

function scheduleItem(
  overrides: Partial<AssociationScheduleItemView> = {},
): AssociationScheduleItemView {
  return {
    id: "item-1",
    canonicalScheduleId: "",
    venueReservationId: null,
    source: "event",
    sourceId: "recurring-source-1",
    title: "Weekly skate",
    startsAt,
    endsAt: new Date("2026-09-07T11:00:00.000Z"),
    timezone: "UTC",
    venueId: "venue-1",
    surfaceId: "surface-1",
    segmentId: null,
    href: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCanViewSignupEvent.mockResolvedValue(false);
  for (const model of Object.values(mockPrisma)) {
    if ("findMany" in model) model.findMany.mockResolvedValue([]);
  }
  mockPrisma.leagueUser.findFirst.mockResolvedValue(null);
});

describe("getLeagueScheduleItems viewer scope", () => {
  it("returns no private schedule without an authenticated viewer", async () => {
    const result = await getLeagueScheduleItems("league-1");

    expect(result).toEqual([]);
    expect(mockPrisma.team.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.event.findMany).not.toHaveBeenCalled();
  });

  it("includes every active team commitment for a league administrator", async () => {
    mockPrisma.leagueUser.findFirst.mockResolvedValue({ role: "LEAGUE_ADMIN" });
    mockPrisma.team.findMany.mockResolvedValue([{ id: "team-a" }, { id: "team-b" }]);

    await getLeagueScheduleItems("league-1", { userId: "admin-1" });

    expect(mockPrisma.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { leagueId: "league-1", isActive: true },
      }),
    );
    const practiceWhere = mockPrisma.practiceSession.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(practiceWhere)).toContain("team-a");
    expect(JSON.stringify(practiceWhere)).toContain("team-b");
    expect(JSON.stringify(practiceWhere)).not.toContain("isShared");
    const reservationWhere = mockPrisma.venueReservation.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(reservationWhere)).toContain("ownerLeagueId");
    expect(JSON.stringify(reservationWhere)).toContain("ownerTeamId");
  });

  it("limits a member to viewer-authorized team commitments and safe season visibility", async () => {
    mockPrisma.leagueUser.findFirst.mockResolvedValue({ role: "MEMBER" });
    mockPrisma.team.findMany
      .mockResolvedValueOnce([{ id: "team-a" }])
      .mockResolvedValueOnce([{ id: "team-a" }, { id: "guardian-team" }]);

    await getLeagueScheduleItems("league-1", { userId: "member-1" });

    expect(mockPrisma.team.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          leagueId: "league-1",
          members: { some: { userId: "member-1" } },
        }),
      }),
    );
    expect(mockPrisma.team.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          leagueId: "league-1",
          OR: expect.any(Array),
        }),
      }),
    );
    const eventWhere = mockPrisma.event.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(eventWhere)).toContain("team-a");
    expect(JSON.stringify(eventWhere)).toContain("guardian-team");
    expect(JSON.stringify(eventWhere)).not.toContain('"leagueId":{"in":["league-1"]}');
    const practiceWhere = mockPrisma.practiceSession.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(practiceWhere)).toContain("team-a");
    expect(JSON.stringify(practiceWhere)).not.toContain("guardian-team");
    const seasonWhere = mockPrisma.seasonGame.findMany.mock.calls[0][0].where;
    expect(seasonWhere.AND).toEqual(expect.arrayContaining([
      expect.objectContaining({
        OR: expect.arrayContaining([
          {
            season: {
              leagueId: { in: ["league-1"] },
              scheduleVisibility: { in: ["PUBLIC", "AUTHENTICATED"] },
            },
          },
          {
            AND: [
              {
                OR: [
                  { homeTeamId: { in: ["team-a"] } },
                  { awayTeamId: { in: ["team-a"] } },
                ],
              },
              {
                season: {
                  scheduleVisibility: {
                    in: ["RELATIONSHIP_ONLY", "PRIVATE"],
                  },
                },
              },
            ],
          },
        ]),
      }),
    ]));
    expect(JSON.stringify(seasonWhere)).not.toContain('"notes":true');
    const reservationWhere = mockPrisma.venueReservation.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(reservationWhere)).not.toContain("ownerLeagueId");
    expect(JSON.stringify(reservationWhere)).toContain("ownerTeamId");
  });

  it("returns league-wide authenticated and participant-private games for members", async () => {
    mockPrisma.leagueUser.findFirst.mockResolvedValue({ role: "MEMBER" });
    mockPrisma.team.findMany
      .mockResolvedValueOnce([{ id: "team-a" }])
      .mockResolvedValueOnce([{ id: "team-a" }])
      .mockResolvedValueOnce([{ id: "team-a" }, { id: "team-b" }]);
    mockPrisma.seasonGame.findMany.mockResolvedValue([
      {
        id: "league-wide",
        status: "SCHEDULED",
        startAt: startsAt,
        endAt: new Date("2026-09-07T11:00:00.000Z"),
        homeTeam: { id: "team-b", name: "B" },
        awayTeam: { id: "team-c", name: "C" },
      },
      {
        id: "participant-private",
        status: "SCHEDULED",
        startAt: new Date("2026-09-08T10:00:00.000Z"),
        endAt: new Date("2026-09-08T11:00:00.000Z"),
        homeTeam: { id: "team-a", name: "A" },
        awayTeam: { id: "team-b", name: "B" },
      },
    ]);

    const result = await getLeagueScheduleItems("league-1", { userId: "member-1" });

    expect(result.filter((item) => item.source === "seasonGame").map((item) => item.sourceId))
      .toEqual(["league-wide", "participant-private"]);
  });

  it("uses all league teams but only published public sources for public scope", async () => {
    mockPrisma.team.findMany.mockResolvedValue([{ id: "team-a" }, { id: "team-b" }]);

    await getLeagueScheduleItems("league-1", { publicOnly: true });

    expect(mockPrisma.leagueUser.findFirst).not.toHaveBeenCalled();
    const signupWhere = mockPrisma.signupEvent.findMany.mock.calls[0][0].where;
    expect(signupWhere).toEqual(expect.objectContaining({
      status: "PUBLISHED",
      visibility: "PUBLIC",
    }));
    const reservationWhere = mockPrisma.venueReservation.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(reservationWhere)).not.toContain("ownerLeagueId");
    expect(JSON.stringify(reservationWhere)).toContain('"visibility":"PUBLIC"');
  });
});

describe("deduplicateAssociationScheduleItems", () => {
  it("keeps unlinked recurring occurrences with the same source ID distinct", () => {
    const secondStart = new Date("2026-09-14T10:00:00.000Z");

    const result = deduplicateAssociationScheduleItems([
      scheduleItem(),
      scheduleItem({
        id: "item-2",
        startsAt: secondStart,
        endsAt: new Date("2026-09-14T11:00:00.000Z"),
      }),
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.canonicalScheduleId)).toEqual([
      `event:recurring-source-1:${startsAt.toISOString()}`,
      `event:recurring-source-1:${secondStart.toISOString()}`,
    ]);
  });

  it("deduplicates linked reservation aliases regardless of source identity", () => {
    const result = deduplicateAssociationScheduleItems([
      scheduleItem({
        venueReservationId: "reservation-1",
        source: "venueReservation",
        sourceId: "reservation-1",
        title: "Reserved venue time",
      }),
      scheduleItem({
        id: "game-1",
        venueReservationId: "reservation-1",
        source: "seasonGame",
        sourceId: "game-1",
        title: "Hawks vs Otters",
      }),
    ]);

    expect(result).toEqual([
      expect.objectContaining({
        source: "seasonGame",
        canonicalScheduleId: "reservation:reservation-1",
      }),
    ]);
  });

  // T021: a practice and its participant-facing Event alias sharing one
  // VenueReservation must collapse to a single canonical row, with the
  // practice (domain activity) winning over the bare Event alias -- this is
  // the exact linkage the not-yet-built T032 practice-session flow is meant
  // to establish (see __tests__/lib/actions/practice-sessions.test.ts).
  it("keeps practice metadata and the participant Event RSVP href regardless of input order", () => {
    const aliases = [
      scheduleItem({
        id: "event-alias-1",
        venueReservationId: "reservation-2",
        source: "event",
        sourceId: "event-alias-1",
        title: "Practice (roster view)",
        href: "/events/event-alias-1",
      }),
      scheduleItem({
        id: "practice-1",
        venueReservationId: "reservation-2",
        source: "practice",
        sourceId: "practice-1",
        title: "Team practice",
        href: "/practice-planner/practice-1",
      }),
    ];

    for (const result of [
      deduplicateAssociationScheduleItems(aliases),
      deduplicateAssociationScheduleItems([...aliases].reverse()),
    ]) {
      expect(result).toEqual([
        expect.objectContaining({
          source: "practice",
          canonicalScheduleId: "reservation:reservation-2",
          title: "Team practice",
          href: "/events/event-alias-1",
        }),
      ]);
    }
  });

  it("collapses more than two aliases of the same reservation to the single highest-priority source, in either input order", () => {
    const aliases = [
      scheduleItem({
        id: "res-alias",
        venueReservationId: "reservation-3",
        source: "venueReservation",
        sourceId: "reservation-3",
      }),
      scheduleItem({
        id: "event-alias",
        venueReservationId: "reservation-3",
        source: "event",
        sourceId: "event-alias",
      }),
      scheduleItem({
        id: "signup-alias",
        venueReservationId: "reservation-3",
        source: "signupEvent",
        sourceId: "signup-alias",
      }),
      scheduleItem({
        id: "eventgame-alias",
        venueReservationId: "reservation-3",
        source: "eventGame",
        sourceId: "eventgame-alias",
      }),
      scheduleItem({
        id: "seasongame-alias",
        venueReservationId: "reservation-3",
        source: "seasonGame",
        sourceId: "seasongame-alias",
      }),
    ];

    const forward = deduplicateAssociationScheduleItems(aliases);
    const reversed = deduplicateAssociationScheduleItems([...aliases].reverse());

    for (const result of [forward, reversed]) {
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          source: "seasonGame",
          canonicalScheduleId: "reservation:reservation-3",
        }),
      );
    }
  });

  it("collapses two fully identical unlinked occurrences (same source, sourceId, and start time) to one row", () => {
    const result = deduplicateAssociationScheduleItems([
      scheduleItem({ id: "dup-a" }),
      scheduleItem({ id: "dup-b" }),
    ]);

    expect(result).toHaveLength(1);
  });

  it("sorts canonical items by start time, then by canonical schedule ID as a stable tiebreaker for same-instant items", () => {
    const sameInstant = new Date("2026-09-21T09:00:00.000Z");
    const earlier = new Date("2026-09-20T09:00:00.000Z");

    const result = deduplicateAssociationScheduleItems([
      scheduleItem({ id: "z-item", source: "event", sourceId: "zzz", startsAt: sameInstant }),
      scheduleItem({ id: "a-item", source: "event", sourceId: "aaa", startsAt: sameInstant }),
      scheduleItem({ id: "earliest-item", source: "event", sourceId: "earliest", startsAt: earlier }),
    ]);

    expect(result.map((item) => item.canonicalScheduleId)).toEqual([
      `event:earliest:${earlier.toISOString()}`,
      `event:aaa:${sameInstant.toISOString()}`,
      `event:zzz:${sameInstant.toISOString()}`,
    ]);
  });
});

describe("getScheduleItems public sources", () => {
  it("excludes bare Event rows and reads only published public signup events", async () => {
    mockPrisma.signupEvent.findMany.mockResolvedValue([{
      id: "signup-public",
      title: "Public clinic",
      category: "CLINIC",
      startAt: startsAt,
      endAt: new Date("2026-09-07T11:00:00.000Z"),
      timezone: "UTC",
      venueId: null,
      venue: null,
      hostTeamId: null,
      hostTeam: null,
      hostLeague: { id: "league-1", name: "League" },
      venueReservationId: null,
      venueReservation: null,
    }]);

    const result = await getScheduleItems({ leagueIds: ["league-1"], publicOnly: true });

    expect(mockPrisma.event.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.signupEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PUBLISHED",
          visibility: "PUBLIC",
        }),
      }),
    );
    const reservationWhere = mockPrisma.venueReservation.findMany.mock.calls[0][0].where;
    expect(reservationWhere.OR).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ events: expect.anything() }),
      ]),
    );
    expect(result.map((item) => item.source)).toEqual(["signupEvent"]);
  });

  it("deduplicates a public season game alias while preserving its Event RSVP URL", async () => {
    mockPrisma.seasonGame.findMany.mockResolvedValue([{
      id: "season-game-1",
      status: "SCHEDULED",
      startAt: startsAt,
      endAt: new Date("2026-09-07T11:00:00.000Z"),
      timezone: "UTC",
      venueId: null,
      surfaceId: null,
      segmentId: null,
      updatedAt: null,
      homeTeam: { id: "team-a", name: "Hawks" },
      awayTeam: { id: "team-b", name: "Otters" },
      venue: null,
      venueReservationId: null,
      venueReservation: null,
      event: { id: "event-rsvp" },
    }]);

    const result = await getScheduleItems({ leagueIds: ["league-1"], publicOnly: true });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      source: "seasonGame",
      title: "Hawks vs Otters",
      href: "/events/event-rsvp",
    }));
    expect(mockPrisma.seasonGame.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { season: { scheduleVisibility: "PUBLIC" } },
          ]),
        }),
      }),
    );
  });

  it("requires the parent signup event to be published, public, and teams-published before exposing matchups", async () => {
    mockPrisma.eventGame.findMany.mockResolvedValue([{
      id: "event-game-1",
      name: "Semifinal",
      status: "SCHEDULED",
      startAt: startsAt,
      endAt: new Date("2026-09-07T11:00:00.000Z"),
      surfaceId: null,
      segmentId: null,
      event: {
        id: "signup-event-1",
        title: "Tournament",
        status: "PUBLISHED",
        visibility: "PUBLIC",
        linkToken: null,
        teamsPublishedAt: new Date("2026-09-01T00:00:00.000Z"),
        timezone: "UTC",
        venueId: null,
        venue: null,
      },
      venueReservationId: null,
      venueReservation: null,
      homeTeam: { id: "event-team-a", name: "Hawks" },
      awayTeam: { id: "event-team-b", name: "Otters" },
    }]);

    const result = await getScheduleItems({ leagueIds: ["league-1"], publicOnly: true });

    expect(result).toEqual([
      expect.objectContaining({ source: "eventGame", title: "Semifinal" }),
    ]);
    expect(mockPrisma.eventGame.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          {
            event: {
              status: "PUBLISHED",
              visibility: "PUBLIC",
              teamsPublishedAt: { not: null },
            },
          },
        ]),
      }),
    }));
  });

  it("scopes public venue-block reservations to the requested association tenant", async () => {
    await getScheduleItems({ leagueIds: ["league-a"], publicOnly: true });

    const reservationWhere = mockPrisma.venueReservation.findMany.mock.calls[0][0].where;
    const publicBlockScope = reservationWhere.OR.find(
      (scope: Record<string, unknown>) => "OR" in scope,
    ) as { OR: Array<Record<string, unknown>> };
    const sourceScopes = publicBlockScope.OR.filter(
      (scope) => "sourceScheduleBlock" in scope,
    );
    expect(sourceScopes).toHaveLength(2);
    expect(sourceScopes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceScheduleBlock: expect.objectContaining({
          venue: expect.objectContaining({
            is: expect.objectContaining({ leagueId: { in: ["league-a"] } }),
          }),
        }),
      }),
      expect.objectContaining({
        sourceScheduleBlock: expect.objectContaining({
          venue: expect.objectContaining({
            is: expect.objectContaining({
              relationships: {
                some: expect.objectContaining({
                  leagueId: { in: ["league-a"] },
                  status: "ACTIVE",
                }),
              },
            }),
          }),
        }),
      }),
    ]));
  });
});

describe("getScheduleItems private source privacy", () => {
  it("defaults direct private reads to member scope instead of association aggregation", async () => {
    await getScheduleItems({
      leagueIds: ["league-1"],
      teamIds: ["team-direct"],
      userId: "user-1",
    });

    const eventWhere = mockPrisma.event.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(eventWhere)).toContain("team-direct");
    expect(JSON.stringify(eventWhere)).not.toContain(
      '"leagueId":{"in":["league-1"]}',
    );
  });

  it("limits practices to direct teams and shared or viewer-created sessions", async () => {
    await getScheduleItems({
      leagueIds: ["league-1"],
      teamIds: ["team-direct"],
      venueIds: ["venue-1"],
      userId: "user-1",
    });

    expect(mockPrisma.practiceSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            { OR: [{ teamId: { in: ["team-direct"] } }] },
            { OR: [{ isShared: true }, { createdById: "user-1" }] },
          ]),
        },
      }),
    );
    const practiceWhere = mockPrisma.practiceSession.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(practiceWhere)).not.toContain("league-1");
    expect(JSON.stringify(practiceWhere)).not.toContain("venue-1");
  });

  it("does not let league, venue, or guardian-derived host scope expose signup drafts", async () => {
    mockPrisma.signupEvent.findMany.mockResolvedValue([{
      id: "private-signup",
      title: "Private signup",
      category: "OTHER",
      status: "DRAFT",
      visibility: "PRIVATE",
      linkToken: null,
      startAt: startsAt,
      endAt: new Date("2026-09-07T11:00:00.000Z"),
      hostTeamId: "team-guardian",
      hostTeam: { id: "team-guardian", name: "Guardian team" },
      hostLeague: { id: "league-1", name: "League" },
      venueReservationId: null,
      venueReservation: null,
    }]);

    const result = await getScheduleItems({
      leagueIds: ["league-1"],
      teamIds: ["team-guardian"],
      venueIds: ["venue-1"],
      userId: "user-1",
    });

    const signupWhere = mockPrisma.signupEvent.findMany.mock.calls[0][0].where;
    const privateScopes = signupWhere.AND.find(
      (entry: { OR?: unknown[] }) => Array.isArray(entry.OR),
    ) as { OR: Array<Record<string, unknown>> };
    expect(privateScopes.OR).toEqual(expect.arrayContaining([
      { hostLeagueId: { in: ["league-1"] } },
      { hostTeamId: { in: ["team-guardian"] } },
      { venueId: { in: ["venue-1"] } },
    ]));
    expect(result.some((item) => item.source === "signupEvent")).toBe(false);
    expect(mockCanViewSignupEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: "private-signup", visibility: "PRIVATE" }),
      { userId: "user-1" },
    );
  });

  it("does not expose a private event game to host-team members without event access", async () => {
    mockPrisma.eventGame.findMany.mockResolvedValue([{
      id: "private-game",
      name: "Private matchup",
      status: "SCHEDULED",
      startAt: startsAt,
      endAt: new Date("2026-09-07T11:00:00.000Z"),
      surfaceId: null,
      segmentId: null,
      event: {
        id: "private-event",
        title: "Private event",
        status: "PUBLISHED",
        visibility: "PRIVATE",
        linkToken: "public-link-token",
        teamsPublishedAt: new Date("2026-09-01T00:00:00.000Z"),
        timezone: "UTC",
        venueId: null,
        venue: null,
      },
      venueReservationId: null,
      venueReservation: null,
      homeTeam: { id: "event-team-a", name: "Hawks" },
      awayTeam: { id: "event-team-b", name: "Otters" },
    }]);

    const result = await getScheduleItems({
      leagueIds: ["league-1"],
      teamIds: ["host-team"],
      userId: "member-1",
    });

    expect(result.some((item) => item.source === "eventGame")).toBe(false);
    expect(mockCanViewSignupEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: "private-event", visibility: "PRIVATE" }),
      { userId: "member-1" },
    );
    expect(mockCanViewSignupEvent.mock.calls[0][1]).not.toHaveProperty("linkToken");
  });

  it("allows a registrant or invitee through the canonical signup-event gate", async () => {
    mockCanViewSignupEvent.mockResolvedValue(true);
    mockPrisma.eventGame.findMany.mockResolvedValue([{
      id: "authorized-game",
      name: "Authorized matchup",
      status: "SCHEDULED",
      startAt: startsAt,
      endAt: new Date("2026-09-07T11:00:00.000Z"),
      surfaceId: null,
      segmentId: null,
      event: {
        id: "invite-event",
        title: "Invite event",
        status: "PUBLISHED",
        visibility: "INVITE_ONLY",
        linkToken: null,
        teamsPublishedAt: new Date("2026-09-01T00:00:00.000Z"),
        timezone: "UTC",
        venueId: null,
        venue: null,
      },
      venueReservationId: null,
      venueReservation: null,
      homeTeam: { id: "event-team-a", name: "Hawks" },
      awayTeam: { id: "event-team-b", name: "Otters" },
    }]);

    const result = await getScheduleItems({
      leagueIds: ["league-1"],
      userId: "registrant-1",
    });

    expect(result).toEqual([
      expect.objectContaining({ source: "eventGame", title: "Authorized matchup" }),
    ]);
  });
});
