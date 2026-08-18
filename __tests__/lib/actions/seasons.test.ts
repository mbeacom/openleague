import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockAuth } = vi.hoisted(() => ({
  mockPrisma: {
    season: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
  mockAuth: {
    getUserLeagueRole: vi.fn(),
    isTeamAdmin: vi.fn(),
    requireLeagueRole: vi.fn(),
    requireTeamAdmin: vi.fn(),
    requireTeamMember: vi.fn(),
    requireUserId: vi.fn(),
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/session", () => mockAuth);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createSeason,
  getSeasonDetail,
  updateSeason,
} from "@/lib/actions/seasons";

const season = {
  id: "season-1",
  leagueId: "league-1",
  teamId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.requireLeagueRole.mockResolvedValue("user-1");
  mockAuth.getUserLeagueRole.mockResolvedValue("MEMBER");
  mockAuth.isTeamAdmin.mockResolvedValue(false);
  mockPrisma.season.findUnique
    .mockResolvedValueOnce(season)
    .mockResolvedValueOnce({ id: season.id, teamPlacements: [] });
});

describe("getSeasonDetail", () => {
  it("does not select private placement notes for ordinary league members", async () => {
    await getSeasonDetail(season.id);

    const detailQuery = mockPrisma.season.findUnique.mock.calls[1][0];
    expect(detailQuery.include.teamPlacements.select).not.toHaveProperty("privateNote");
  });
});

describe("season schedule visibility mutations", () => {
  it("persists an authorized visibility choice on create", async () => {
    mockPrisma.season.create.mockResolvedValue({ id: "clseason000000000000001", name: "Fall" });

    const result = await createSeason({
      name: "Fall",
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      endDate: new Date("2026-12-01T00:00:00.000Z"),
      leagueId: "clleague0000000000000001",
      scheduleVisibility: "AUTHENTICATED",
    });

    expect(result.success).toBe(true);
    expect(mockAuth.requireLeagueRole).toHaveBeenCalledWith(
      "clleague0000000000000001",
      "LEAGUE_ADMIN",
    );
    expect(mockPrisma.season.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ scheduleVisibility: "AUTHENTICATED" }),
    }));
  });

  it("persists an authorized visibility update", async () => {
    mockPrisma.season.findUnique.mockReset().mockResolvedValue({
      id: "clseason000000000000001",
      name: "Fall",
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      endDate: new Date("2026-12-01T00:00:00.000Z"),
      leagueId: "clleague0000000000000001",
      teamId: null,
      league: { sport: "HOCKEY" },
      team: null,
    });
    mockPrisma.season.update.mockResolvedValue({ id: "clseason000000000000001" });

    const result = await updateSeason({
      seasonId: "clseason000000000000001",
      scheduleVisibility: "PUBLIC",
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.season.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ scheduleVisibility: "PUBLIC" }),
    }));
  });

  it("rejects an unknown visibility value", async () => {
    const result = await createSeason({
      name: "Fall",
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      endDate: new Date("2026-12-01T00:00:00.000Z"),
      leagueId: "clleague0000000000000001",
      scheduleVisibility: "EVERYONE" as "PUBLIC",
    });

    expect(result.success).toBe(false);
    expect(mockPrisma.season.create).not.toHaveBeenCalled();
  });
});
