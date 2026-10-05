import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuth, mockPrisma, mockSchedule } = vi.hoisted(() => ({
  mockAuth: { getCurrentUserId: vi.fn() },
  mockPrisma: { leagueUser: { findFirst: vi.fn() } },
  mockSchedule: {
    getLeagueScheduleItems: vi.fn(),
    buildScheduleIcs: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => mockAuth);
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/data/schedule-items", () => mockSchedule);

import { GET } from "@/app/api/leagues/[leagueId]/schedule.ics/route";

const LEAGUE_ID = "clleague000000000000000001";

describe("private league schedule ICS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.getCurrentUserId.mockResolvedValue("member-1");
    mockPrisma.leagueUser.findFirst.mockResolvedValue({
      role: "MEMBER",
      league: { id: LEAGUE_ID, name: "Test League" },
    });
    mockSchedule.getLeagueScheduleItems.mockResolvedValue([]);
    mockSchedule.buildScheduleIcs.mockReturnValue("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
  });

  it("forwards the authenticated viewer and exact league role", async () => {
    const response = await GET(
      new Request("https://example.test/api/leagues/league-1/schedule.ics") as never,
      { params: Promise.resolve({ leagueId: LEAGUE_ID }) },
    );

    expect(response.status).toBe(200);
    expect(mockSchedule.getLeagueScheduleItems).toHaveBeenCalledWith(LEAGUE_ID, {
      userId: "member-1",
      leagueRole: "MEMBER",
    });
  });

  it("does not invoke the reader for a non-member", async () => {
    mockPrisma.leagueUser.findFirst.mockResolvedValue(null);

    const response = await GET(
      new Request("https://example.test/api/leagues/league-1/schedule.ics") as never,
      { params: Promise.resolve({ leagueId: LEAGUE_ID }) },
    );

    expect(response.status).toBe(404);
    expect(mockSchedule.getLeagueScheduleItems).not.toHaveBeenCalled();
  });
});
