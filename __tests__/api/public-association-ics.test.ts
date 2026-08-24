import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockGetCurrentUserId, mockPrisma, mockResolvePublicAssociation } = vi.hoisted(() => ({
  mockGetCurrentUserId: vi.fn(),
  mockResolvePublicAssociation: vi.fn(),
  mockPrisma: {
    league: { findFirst: vi.fn(), findUnique: vi.fn() },
    event: { findMany: vi.fn() },
    seasonGame: { findMany: vi.fn() },
    eventGame: { findMany: vi.fn() },
    practiceSession: { findMany: vi.fn() },
    signupEvent: { findMany: vi.fn() },
    venueScheduleBlock: { findMany: vi.fn() },
    team: { findMany: vi.fn() },
    venueReservation: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserId: (...args: unknown[]) => mockGetCurrentUserId(...args),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/actions/association-profile", () => ({
  resolvePublicAssociation: mockResolvePublicAssociation,
}));

import { GET } from "@/app/api/associations/[slug]/schedule.ics/route";

const SLUG = "north-stars";
const LEAGUE_NAME = "North Stars";

function request(slug = SLUG) {
  return new NextRequest(`http://localhost/api/associations/${slug}/schedule.ics`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUserId.mockResolvedValue(null);
  mockResolvePublicAssociation.mockResolvedValue({
    id: "clleague0000000000000001",
    canonicalSlug: SLUG,
    redirected: false,
  });
  mockPrisma.league.findFirst.mockResolvedValue({
    id: "clleague0000000000000001",
    name: LEAGUE_NAME,
    slug: SLUG,
    timezone: "America/New_York",
    publicDescription: "A public association",
    mission: "Grow the game",
    brandPrimaryColor: "#123456",
    brandSecondaryColor: "#654321",
  });
  mockPrisma.event.findMany.mockResolvedValue([
    {
      id: "clevent0000000000000001",
      type: "GAME",
      title: "Arrows vs Blizzards",
      startAt: new Date("2026-09-05T22:00:00.000Z"),
      endAt: new Date("2026-09-05T23:30:00.000Z"),
      location: "North Rink",
      opponent: "Blizzards",
      updatedAt: new Date("2026-08-17T00:00:00.000Z"),
      homeTeam: { name: "Arrows" },
      awayTeam: { name: "Blizzards" },
    },
  ]);
  mockPrisma.seasonGame.findMany.mockResolvedValue([
    {
      id: "clseason-game-000000000000001",
      status: "SCHEDULED",
      startAt: new Date("2026-09-05T22:00:00.000Z"),
      endAt: new Date("2026-09-05T23:30:00.000Z"),
      timezone: "America/New_York",
      venueId: null,
      surfaceId: null,
      segmentId: null,
      updatedAt: new Date("2026-08-17T00:00:00.000Z"),
      homeTeam: { id: "team-arrows", name: "Arrows" },
      awayTeam: { id: "team-blizzards", name: "Blizzards" },
      venue: null,
      venueReservationId: null,
      venueReservation: null,
      event: { id: "clevent0000000000000001" },
    },
  ]);
  mockPrisma.eventGame.findMany.mockResolvedValue([]);
  mockPrisma.practiceSession.findMany.mockResolvedValue([]);
  mockPrisma.signupEvent.findMany.mockResolvedValue([]);
  mockPrisma.venueScheduleBlock.findMany.mockResolvedValue([]);
  mockPrisma.team.findMany.mockResolvedValue([
    { id: "team-arrows" },
    { id: "team-blizzards" },
  ]);
  mockPrisma.venueReservation.findMany.mockImplementation(
    async ({ where }: { where: unknown }) => {
      const serialized = JSON.stringify(where);
      // A real database returns these private rows only when the selector
      // accidentally admits bare owner inventory or non-public blocks.
      if (
        serialized.includes("ownerLeagueId")
        || !serialized.includes('"visibility":"PUBLIC"')
      ) {
        return [{
          id: "private-reservation",
          startsAt: new Date("2026-09-06T22:00:00.000Z"),
          endsAt: new Date("2026-09-06T23:30:00.000Z"),
          timezone: "America/New_York",
          venueId: "private-venue",
          surfaceId: null,
          segmentId: null,
          venue: { name: "Private rink", timezone: "America/New_York" },
        }];
      }
      return [];
    },
  );
});

describe("public association ICS", () => {
  it("serves canonical public schedule contents for a slug without requiring sign-in", async () => {
    const response = await GET(request(), { params: Promise.resolve({ slug: SLUG }) });

    expect(mockGetCurrentUserId).not.toHaveBeenCalled();
    expect(mockPrisma.league.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "clleague0000000000000001",
          isActive: true,
          profileStatus: "PUBLISHED",
        }),
        select: { id: true, name: true },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/calendar");

    const body = await response.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain(`X-WR-CALNAME:${LEAGUE_NAME} Schedule`);
    expect(body).toContain("SUMMARY:Arrows vs Blizzards");
    expect(body).not.toContain("publicDescription");
    expect(body).not.toContain("mission");
    expect(body).not.toContain("gearReservation");
    expect(body).not.toContain("donor");
    expect(body).not.toContain("Reserved venue time");
    expect(body).not.toContain("Private rink");
    const reservationWhere =
      mockPrisma.venueReservation.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(reservationWhere)).not.toContain("ownerLeagueId");
    expect(JSON.stringify(reservationWhere)).toContain('"visibility":"PUBLIC"');
  });

  it("returns not found for an unpublished association slug", async () => {
    mockResolvePublicAssociation.mockResolvedValue(null);

    const response = await GET(request(), { params: Promise.resolve({ slug: SLUG }) });

    expect(response.status).toBe(404);
    expect(mockPrisma.league.findFirst).not.toHaveBeenCalled();
  });

  it("redirects a retired slug to the canonical ICS address", async () => {
    mockResolvePublicAssociation.mockResolvedValue({
      id: "clleague0000000000000001",
      canonicalSlug: SLUG,
      redirected: true,
    });

    const response = await GET(request("old-north-stars"), {
      params: Promise.resolve({ slug: "old-north-stars" }),
    });

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      `http://localhost/api/associations/${SLUG}/schedule.ics`,
    );
    expect(mockPrisma.league.findFirst).not.toHaveBeenCalled();
  });
});
