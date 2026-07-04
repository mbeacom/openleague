import { describe, it, expect } from "vitest";
import {
  computeSeasonStandings,
  type SeasonStandingsGame,
} from "@/lib/utils/season-standings";

const completed = (
  homeTeamId: string,
  awayTeamId: string,
  homeScore: number,
  awayScore: number
): SeasonStandingsGame => ({
  status: "COMPLETED",
  homeTeamId,
  awayTeamId,
  homeScore,
  awayScore,
});

describe("computeSeasonStandings", () => {
  it("includes every team with zeroed stats when there are no games", () => {
    const rows = computeSeasonStandings(
      [
        { id: "t1", name: "Sharks" },
        { id: "t2", name: "Bears" },
      ],
      []
    );

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
      });
    }
    expect(rows.map((row) => row.teamId)).toEqual(
      expect.arrayContaining(["t1", "t2"])
    );
  });

  it("accumulates wins, losses, ties, goals, and points across home and away games", () => {
    const rows = computeSeasonStandings(
      [
        { id: "t1", name: "Sharks" },
        { id: "t2", name: "Bears" },
      ],
      [
        completed("t1", "t2", 3, 1), // t1 home win
        completed("t2", "t1", 0, 2), // t1 away win
        completed("t1", "t2", 1, 4), // t1 home loss
        completed("t2", "t1", 2, 2), // tie
      ]
    );

    const sharks = rows.find((row) => row.teamId === "t1");
    const bears = rows.find((row) => row.teamId === "t2");

    expect(sharks).toEqual({
      teamId: "t1",
      teamName: "Sharks",
      gamesPlayed: 4,
      wins: 2,
      losses: 1,
      ties: 1,
      goalsFor: 8,
      goalsAgainst: 7,
      points: 5, // 2*2 wins + 1 tie
    });
    expect(bears).toEqual({
      teamId: "t2",
      teamName: "Bears",
      gamesPlayed: 4,
      wins: 1,
      losses: 2,
      ties: 1,
      goalsFor: 7,
      goalsAgainst: 8,
      points: 3, // 2*1 win + 1 tie
    });
  });

  it("ignores non-COMPLETED games and games missing either score", () => {
    const rows = computeSeasonStandings(
      [
        { id: "t1", name: "Sharks" },
        { id: "t2", name: "Bears" },
      ],
      [
        { ...completed("t1", "t2", 9, 0), status: "SCHEDULED" },
        { ...completed("t1", "t2", 9, 0), status: "CANCELLED" },
        { ...completed("t1", "t2", 9, 0), homeScore: null },
        { ...completed("t1", "t2", 9, 0), awayScore: null },
      ]
    );

    for (const row of rows) {
      expect(row.gamesPlayed).toBe(0);
      expect(row.points).toBe(0);
      expect(row.goalsFor).toBe(0);
    }
  });

  it("ignores games referencing teams not in the teams list", () => {
    const rows = computeSeasonStandings(
      [{ id: "t1", name: "Sharks" }],
      [
        completed("t1", "ghost", 5, 0),
        completed("ghost", "t1", 0, 5),
        completed("ghost-a", "ghost-b", 3, 3),
      ]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      teamId: "t1",
      gamesPlayed: 0,
      wins: 0,
      points: 0,
    });
  });

  it("ranks by points, then goal differential, then goals for, then team name", () => {
    // Alpha: 4 pts. Bravo: 2 pts, GD +5. Charlie: 2 pts, GD +2, GF 4.
    // Delta: 2 pts, GD +2, GF 2. Echo/Foxtrot: no games (name tiebreak).
    // Zed: 0 pts, GD -11 (below the zero-game teams on GD).
    const rows = computeSeasonStandings(
      [
        { id: "zed", name: "Zed" },
        { id: "foxtrot", name: "Foxtrot" },
        { id: "delta", name: "Delta" },
        { id: "charlie", name: "Charlie" },
        { id: "bravo", name: "Bravo" },
        { id: "echo", name: "Echo" },
        { id: "alpha", name: "Alpha" },
      ],
      [
        completed("alpha", "zed", 1, 0),
        completed("zed", "alpha", 0, 1),
        completed("bravo", "zed", 5, 0),
        completed("charlie", "zed", 4, 2),
        completed("zed", "delta", 0, 2),
      ]
    );

    expect(rows.map((row) => row.teamId)).toEqual([
      "alpha", // points (4)
      "bravo", // GD +5 beats GD +2 at 2 points
      "charlie", // GF 4 beats GF 2 at equal points and GD
      "delta",
      "echo", // name asc at identical zero records
      "foxtrot",
      "zed", // GD -11 sinks below zero-game teams
    ]);
  });

  it("produces stable output ordering across repeated calls", () => {
    const teams = [
      { id: "b", name: "Bandits" },
      { id: "a", name: "Aces" },
      { id: "c", name: "Comets" },
    ];
    const games = [completed("a", "b", 2, 2), completed("b", "c", 1, 1)];

    const first = computeSeasonStandings(teams, games);
    const second = computeSeasonStandings(teams, games);

    expect(second).toEqual(first);
    // Bandits: 2 ties (2 pts); Aces and Comets: 1 tie each, name breaks the tie.
    expect(first.map((row) => row.teamName)).toEqual([
      "Bandits",
      "Aces",
      "Comets",
    ]);
  });
});
