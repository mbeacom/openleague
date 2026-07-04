import { describe, it, expect } from "vitest";
import {
  ICE_USAGES,
  createSeasonSchema,
  createSeasonPhaseSchema,
  createSeasonGameSchema,
  generateRoundRobinSchema,
  createGameProposalSchema,
  recordPlacementSchema,
} from "@/lib/utils/validation";

// Valid cuid fixtures (start with "c", no whitespace/hyphens, 8+ chars after).
const SEASON_ID = "clseason0000000000000001";
const PHASE_ID = "clphase00000000000000001";
const LEAGUE_ID = "clleague0000000000000001";
const TEAM_A = "clteama00000000000000001";
const TEAM_B = "clteamb00000000000000001";
const DIVISION_ID = "cldivision00000000000001";
const VENUE_ID = "clvenue00000000000000001";

const manyTeamIds = (count: number) =>
  Array.from({ length: count }, (_, i) => `clteam${String(i).padStart(18, "0")}`);

describe("createSeasonSchema", () => {
  const base = {
    name: "Fall 2026",
    startDate: "2026-09-01",
    endDate: "2026-12-01",
  };

  describe("owner XOR (exactly one of leagueId/teamId)", () => {
    it("accepts a league-owned season", () => {
      const result = createSeasonSchema.safeParse({ ...base, leagueId: LEAGUE_ID });
      expect(result.success).toBe(true);
    });

    it("accepts a team-owned season", () => {
      const result = createSeasonSchema.safeParse({ ...base, teamId: TEAM_A });
      expect(result.success).toBe(true);
    });

    it("rejects a season with both a league and a team owner", () => {
      const result = createSeasonSchema.safeParse({
        ...base,
        leagueId: LEAGUE_ID,
        teamId: TEAM_A,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path.includes("leagueId"))).toBe(true);
      }
    });

    it("rejects a season with neither owner", () => {
      const result = createSeasonSchema.safeParse(base);
      expect(result.success).toBe(false);
    });
  });

  describe("date range refinement", () => {
    it("rejects an end date before the start date", () => {
      const result = createSeasonSchema.safeParse({
        ...base,
        leagueId: LEAGUE_ID,
        startDate: "2026-12-01",
        endDate: "2026-09-01",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path.includes("endDate"))).toBe(true);
      }
    });

    it("accepts an end date equal to the start date (>= refinement)", () => {
      const result = createSeasonSchema.safeParse({
        ...base,
        leagueId: LEAGUE_ID,
        startDate: "2026-09-01",
        endDate: "2026-09-01",
      });
      expect(result.success).toBe(true);
    });
  });
});

describe("createSeasonPhaseSchema", () => {
  const base = {
    seasonId: SEASON_ID,
    name: "Regular Season",
    startDate: "2026-09-01",
    endDate: "2026-11-15",
  };

  it("accepts a valid phase and applies defaults", () => {
    const result = createSeasonPhaseSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("CUSTOM");
      expect(result.data.sortOrder).toBe(0);
    }
  });

  it("rejects an end date before the start date", () => {
    const result = createSeasonPhaseSchema.safeParse({
      ...base,
      startDate: "2026-11-15",
      endDate: "2026-09-01",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("endDate"))).toBe(true);
    }
  });

  it("accepts a single-day phase (end date equals start date)", () => {
    const result = createSeasonPhaseSchema.safeParse({
      ...base,
      startDate: "2026-09-01",
      endDate: "2026-09-01",
    });
    expect(result.success).toBe(true);
  });
});

describe("createSeasonGameSchema", () => {
  const base = {
    seasonId: SEASON_ID,
    homeTeamId: TEAM_A,
    awayTeamId: TEAM_B,
    startAt: "2026-09-05T18:00:00.000Z",
    endAt: "2026-09-05T19:30:00.000Z",
  };

  it("accepts a valid game", () => {
    const result = createSeasonGameSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("defaults publish to true and overrideConflicts to false", () => {
    const result = createSeasonGameSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.publish).toBe(true);
      expect(result.data.overrideConflicts).toBe(false);
    }
  });

  it("rejects an end time equal to the start time (strict >)", () => {
    const result = createSeasonGameSchema.safeParse({
      ...base,
      endAt: base.startAt,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("endAt"))).toBe(true);
    }
  });

  it("rejects an end time before the start time", () => {
    const result = createSeasonGameSchema.safeParse({
      ...base,
      startAt: "2026-09-05T19:30:00.000Z",
      endAt: "2026-09-05T18:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a game where a team plays itself", () => {
    const result = createSeasonGameSchema.safeParse({
      ...base,
      awayTeamId: TEAM_A,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("awayTeamId"))).toBe(true);
    }
  });

  describe("surfaceUsage", () => {
    it.each(ICE_USAGES)("accepts %s", (usage) => {
      const result = createSeasonGameSchema.safeParse({ ...base, surfaceUsage: usage });
      expect(result.success).toBe(true);
    });

    it("is optional", () => {
      const result = createSeasonGameSchema.safeParse(base);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.surfaceUsage).toBeUndefined();
      }
    });

    it("rejects values outside the ice usage enum", () => {
      const result = createSeasonGameSchema.safeParse({
        ...base,
        surfaceUsage: "QUARTER_ICE",
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("generateRoundRobinSchema", () => {
  const base = {
    seasonId: SEASON_ID,
    teamIds: [TEAM_A, TEAM_B],
    startDate: "2026-09-01",
    endDate: "2026-11-01",
    eligibleDays: [6],
    startTime: "18:00",
  };

  it("accepts a valid request and applies defaults", () => {
    const result = generateRoundRobinSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rounds).toBe(1);
      expect(result.data.gameDurationMinutes).toBe(90);
    }
  });

  describe("teamIds", () => {
    it("rejects fewer than 2 teams", () => {
      const result = generateRoundRobinSchema.safeParse({ ...base, teamIds: [TEAM_A] });
      expect(result.success).toBe(false);
    });

    it("accepts exactly 20 teams", () => {
      const result = generateRoundRobinSchema.safeParse({ ...base, teamIds: manyTeamIds(20) });
      expect(result.success).toBe(true);
    });

    it("rejects more than 20 teams", () => {
      const result = generateRoundRobinSchema.safeParse({ ...base, teamIds: manyTeamIds(21) });
      expect(result.success).toBe(false);
    });

    it("rejects duplicate teams", () => {
      const result = generateRoundRobinSchema.safeParse({ ...base, teamIds: [TEAM_A, TEAM_A] });
      expect(result.success).toBe(false);
    });
  });

  describe("rounds", () => {
    it("rejects 0 rounds", () => {
      const result = generateRoundRobinSchema.safeParse({ ...base, rounds: 0 });
      expect(result.success).toBe(false);
    });

    it("accepts 4 rounds (upper bound)", () => {
      const result = generateRoundRobinSchema.safeParse({ ...base, rounds: 4 });
      expect(result.success).toBe(true);
    });

    it("rejects 5 rounds", () => {
      const result = generateRoundRobinSchema.safeParse({ ...base, rounds: 5 });
      expect(result.success).toBe(false);
    });
  });

  describe("eligibleDays", () => {
    it("rejects an empty selection", () => {
      const result = generateRoundRobinSchema.safeParse({ ...base, eligibleDays: [] });
      expect(result.success).toBe(false);
    });

    it("accepts the full Sunday–Saturday range", () => {
      const result = generateRoundRobinSchema.safeParse({
        ...base,
        eligibleDays: [0, 1, 2, 3, 4, 5, 6],
      });
      expect(result.success).toBe(true);
    });

    it("rejects a day above 6", () => {
      const result = generateRoundRobinSchema.safeParse({ ...base, eligibleDays: [7] });
      expect(result.success).toBe(false);
    });

    it("rejects a negative day", () => {
      const result = generateRoundRobinSchema.safeParse({ ...base, eligibleDays: [-1] });
      expect(result.success).toBe(false);
    });
  });

  describe("startTime", () => {
    it("accepts HH:MM", () => {
      const result = generateRoundRobinSchema.safeParse({ ...base, startTime: "09:30" });
      expect(result.success).toBe(true);
    });

    it("rejects a single-digit hour", () => {
      const result = generateRoundRobinSchema.safeParse({ ...base, startTime: "9:30" });
      expect(result.success).toBe(false);
    });

    it("rejects non-time text", () => {
      const result = generateRoundRobinSchema.safeParse({ ...base, startTime: "evening" });
      expect(result.success).toBe(false);
    });
  });

  it("rejects an end date before the start date", () => {
    const result = generateRoundRobinSchema.safeParse({
      ...base,
      startDate: "2026-11-01",
      endDate: "2026-09-01",
    });
    expect(result.success).toBe(false);
  });
});

describe("createGameProposalSchema", () => {
  const base = {
    proposingTeamId: TEAM_A,
    receivingTeamId: TEAM_B,
    startAt: "2026-09-12T18:00:00.000Z",
    endAt: "2026-09-12T19:30:00.000Z",
  };

  it("accepts a valid proposal", () => {
    const result = createGameProposalSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("accepts optional season and venue references", () => {
    const result = createGameProposalSchema.safeParse({
      ...base,
      seasonId: SEASON_ID,
      venueId: VENUE_ID,
      note: "Saturday evening works best for us.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an end time equal to the start time", () => {
    const result = createGameProposalSchema.safeParse({ ...base, endAt: base.startAt });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("endAt"))).toBe(true);
    }
  });

  it("rejects an end time before the start time", () => {
    const result = createGameProposalSchema.safeParse({
      ...base,
      startAt: "2026-09-12T19:30:00.000Z",
      endAt: "2026-09-12T18:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a team proposing a game against itself", () => {
    const result = createGameProposalSchema.safeParse({
      ...base,
      receivingTeamId: TEAM_A,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("receivingTeamId"))).toBe(true);
    }
  });
});

describe("recordPlacementSchema", () => {
  const base = {
    seasonId: SEASON_ID,
    teamId: TEAM_A,
  };

  it("accepts a placement with a positive rank", () => {
    const result = recordPlacementSchema.safeParse({ ...base, rank: 1 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rank).toBe(1);
    }
  });

  it("accepts a placement without a rank (optional)", () => {
    const result = recordPlacementSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rank).toBeUndefined();
    }
  });

  it("rejects a rank of 0", () => {
    const result = recordPlacementSchema.safeParse({ ...base, rank: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects a negative rank", () => {
    const result = recordPlacementSchema.safeParse({ ...base, rank: -2 });
    expect(result.success).toBe(false);
  });

  it("rejects a fractional rank", () => {
    const result = recordPlacementSchema.safeParse({ ...base, rank: 1.5 });
    expect(result.success).toBe(false);
  });

  describe("divisionId", () => {
    it("accepts a null divisionId", () => {
      const result = recordPlacementSchema.safeParse({ ...base, divisionId: null });
      expect(result.success).toBe(true);
    });

    it("accepts a valid divisionId", () => {
      const result = recordPlacementSchema.safeParse({ ...base, divisionId: DIVISION_ID });
      expect(result.success).toBe(true);
    });

    it("accepts an omitted divisionId", () => {
      const result = recordPlacementSchema.safeParse(base);
      expect(result.success).toBe(true);
    });

    it("rejects a malformed divisionId", () => {
      const result = recordPlacementSchema.safeParse({ ...base, divisionId: "not-a-cuid" });
      expect(result.success).toBe(false);
    });
  });
});

// PHASE_ID is exercised implicitly through optional phase references.
describe("optional phase reference on game creation", () => {
  it("accepts a game assigned to a phase", () => {
    const result = createSeasonGameSchema.safeParse({
      seasonId: SEASON_ID,
      phaseId: PHASE_ID,
      homeTeamId: TEAM_A,
      awayTeamId: TEAM_B,
      startAt: "2026-09-05T18:00:00.000Z",
      endAt: "2026-09-05T19:30:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});
