import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockIsActiveTeamInLeague,
  mockNotFound,
  mockRedirect,
} = vi.hoisted(() => ({
  mockIsActiveTeamInLeague: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  mockRedirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: () => mockNotFound(),
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock("@/lib/actions/team-context", () => ({
  isActiveTeamInLeague: (...args: unknown[]) => mockIsActiveTeamInLeague(...args),
}));

import LeagueTeamRedirectPage from "@/app/(dashboard)/league/[leagueId]/teams/[teamId]/page";
import LeagueTeamRosterRedirectPage from "@/app/(dashboard)/league/[leagueId]/teams/[teamId]/roster/page";

const LEAGUE_ID = "clleague00000000000000000";
const TEAM_ID = "clteam000000000000000000";
const params = Promise.resolve({ leagueId: LEAGUE_ID, teamId: TEAM_ID });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("league team route aliases", () => {
  it("redirects a valid league team alias to the canonical team page", async () => {
    mockIsActiveTeamInLeague.mockResolvedValue(true);

    await expect(LeagueTeamRedirectPage({ params })).rejects.toThrow(
      `NEXT_REDIRECT:/team/${TEAM_ID}`,
    );

    expect(mockIsActiveTeamInLeague).toHaveBeenCalledWith(TEAM_ID, LEAGUE_ID);
    expect(mockRedirect).toHaveBeenCalledWith(`/team/${TEAM_ID}`);
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it("redirects a valid league team roster alias to the canonical team roster page", async () => {
    mockIsActiveTeamInLeague.mockResolvedValue(true);

    await expect(LeagueTeamRosterRedirectPage({ params })).rejects.toThrow(
      `NEXT_REDIRECT:/team/${TEAM_ID}/roster`,
    );

    expect(mockIsActiveTeamInLeague).toHaveBeenCalledWith(TEAM_ID, LEAGUE_ID);
    expect(mockRedirect).toHaveBeenCalledWith(`/team/${TEAM_ID}/roster`);
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it("returns not found when the team does not belong to the requested league", async () => {
    mockIsActiveTeamInLeague.mockResolvedValue(false);

    await expect(LeagueTeamRedirectPage({ params })).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mockIsActiveTeamInLeague).toHaveBeenCalledWith(TEAM_ID, LEAGUE_ID);
    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("returns not found for invalid roster aliases", async () => {
    mockIsActiveTeamInLeague.mockResolvedValue(false);

    await expect(LeagueTeamRosterRedirectPage({ params })).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mockIsActiveTeamInLeague).toHaveBeenCalledWith(TEAM_ID, LEAGUE_ID);
    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
