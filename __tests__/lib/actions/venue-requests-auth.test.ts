import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { mockRequireUserId, mockRequireTeamMember, mockGetUserLeagueRole, mockPrisma } = vi.hoisted(() => ({
  mockRequireUserId: vi.fn(),
  mockRequireTeamMember: vi.fn(),
  mockGetUserLeagueRole: vi.fn(),
  mockPrisma: {
    venueScheduleBlock: { findFirst: vi.fn() },
    iceTimeRequest: { create: vi.fn(), findFirst: vi.fn() },
    venueStaff: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireUserId: (...args: unknown[]) => mockRequireUserId(...args),
  requireTeamMember: (...args: unknown[]) => mockRequireTeamMember(...args),
  getUserLeagueRole: (...args: unknown[]) => mockGetUserLeagueRole(...args),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/email/templates", () => ({
  sendIceTimeRequestSubmittedEmail: vi.fn(),
}));

import { submitIceTimeRequest } from "@/lib/actions/venue-requests";

const USER_ID = "clusrxxxxxxxxxxxxxxxxxxxxxxx";
const VENUE_ID = "clvenxxxxxxxxxxxxxxxxxxxxxxx";
const BLOCK_ID = "clblkxxxxxxxxxxxxxxxxxxxxxxx";
const TEAM_ID = "clteamxxxxxxxxxxxxxxxxxxxxxx";
const LEAGUE_ID = "cllgxxxxxxxxxxxxxxxxxxxxxxx";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUserId.mockResolvedValue(USER_ID);
  mockRequireTeamMember.mockResolvedValue(USER_ID);
  mockGetUserLeagueRole.mockResolvedValue("MEMBER");
  mockPrisma.venueScheduleBlock.findFirst.mockResolvedValue({
    id: BLOCK_ID,
    startsAt: new Date("2026-03-01T10:00:00Z"),
    endsAt: new Date("2026-03-01T12:00:00Z"),
    status: "PUBLISHED",
    venue: { id: VENUE_ID, name: "North Rink", organizationId: "clorgxxxxxxxxxxxxxxxxxxxxxxx", slug: "north-rink" },
  });
  mockPrisma.iceTimeRequest.create.mockResolvedValue({ id: "clreqxxxxxxxxxxxxxxxxxxxxxxx", status: "SUBMITTED" });
  mockPrisma.venueStaff.findMany.mockResolvedValue([]);
});

describe("ice time request authorization and booking safety", () => {
  it("verifies requester team and league authority", async () => {
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValue(null);

    const result = await submitIceTimeRequest({
      scheduleBlockId: BLOCK_ID,
      venueId: VENUE_ID,
      requesterTeamId: TEAM_ID,
      requesterLeagueId: LEAGUE_ID,
      contactName: "Coach One",
      contactEmail: "coach@example.com",
      requestedStartAt: "2026-03-01T10:00:00Z",
      requestedEndAt: "2026-03-01T11:00:00Z",
    });

    expect(result.success).toBe(true);
    expect(mockRequireTeamMember).toHaveBeenCalledWith(TEAM_ID);
    expect(mockGetUserLeagueRole).toHaveBeenCalledWith(USER_ID, LEAGUE_ID);
  });

  it("rejects accepted-request double booking", async () => {
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValue({ id: "existing-request" });

    const result = await submitIceTimeRequest({
      scheduleBlockId: BLOCK_ID,
      venueId: VENUE_ID,
      contactName: "Coach One",
      contactEmail: "coach@example.com",
      requestedStartAt: "2026-03-01T10:00:00Z",
      requestedEndAt: "2026-03-01T11:00:00Z",
    });

    expect(result.success).toBe(false);
    expect(mockPrisma.iceTimeRequest.create).not.toHaveBeenCalled();
  });
});
