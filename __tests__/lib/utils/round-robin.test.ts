import { describe, it, expect } from "vitest";
import {
  buildRoundRobin,
  type ProposedGame,
  type RoundRobinInput,
} from "@/lib/utils/round-robin";

const teamList = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => `team-${i + 1}`);

/** A range with every day eligible and far more slots than any test needs. */
const roomyInput = (overrides: Partial<RoundRobinInput> = {}): RoundRobinInput => ({
  teamIds: teamList(4),
  rounds: 1,
  startDate: new Date("2026-01-01T12:00:00Z"),
  endDate: new Date("2026-06-30T12:00:00Z"),
  eligibleDays: [0, 1, 2, 3, 4, 5, 6],
  startTime: "12:00",
  gameDurationMinutes: 60,
  timezone: "UTC",
  ...overrides,
});

const pairKey = (game: ProposedGame): string =>
  [game.homeTeamId, game.awayTeamId].sort().join("|");

describe("buildRoundRobin", () => {
  describe("pairing counts", () => {
    const cases: [n: number, rounds: number][] = [];
    for (let n = 2; n <= 8; n++) {
      for (let rounds = 1; rounds <= 4; rounds++) {
        cases.push([n, rounds]);
      }
    }

    it.each(cases)("slots n(n-1)/2 x R games for n=%i, rounds=%i", (n, rounds) => {
      const expected = (n * (n - 1)) / 2 * rounds;
      const result = buildRoundRobin(roomyInput({ teamIds: teamList(n), rounds }));

      expect(result.games).toHaveLength(expected);
      expect(result.unslottedCount).toBe(0);

      // Every unordered pair meets exactly `rounds` times.
      const meetings = new Map<string, number>();
      for (const game of result.games) {
        expect(game.homeTeamId).not.toBe(game.awayTeamId);
        meetings.set(pairKey(game), (meetings.get(pairKey(game)) ?? 0) + 1);
      }
      expect(meetings.size).toBe((n * (n - 1)) / 2);
      for (const count of meetings.values()) {
        expect(count).toBe(rounds);
      }
    });
  });

  describe("odd team counts (byes)", () => {
    it("gives each of 5 teams exactly 4 games with no team twice in a pairing round", () => {
      const result = buildRoundRobin(roomyInput({ teamIds: teamList(5), rounds: 1 }));
      expect(result.games).toHaveLength(10);

      // Each team plays n-1 games.
      const gamesPerTeam = new Map<string, number>();
      for (const game of result.games) {
        for (const teamId of [game.homeTeamId, game.awayTeamId]) {
          gamesPerTeam.set(teamId, (gamesPerTeam.get(teamId) ?? 0) + 1);
        }
      }
      expect(gamesPerTeam.size).toBe(5);
      for (const count of gamesPerTeam.values()) {
        expect(count).toBe(4);
      }

      // Circle method emits (n-1)/2 games per pairing round; within each
      // pairing round no team appears twice (one team has the bye).
      const gamesPerPairingRound = 2;
      for (let i = 0; i < result.games.length; i += gamesPerPairingRound) {
        const chunk = result.games.slice(i, i + gamesPerPairingRound);
        const teamsInRound = chunk.flatMap((game) => [game.homeTeamId, game.awayTeamId]);
        expect(new Set(teamsInRound).size).toBe(teamsInRound.length);
      }
    });

    it("handles 3 teams (one bye per pairing round)", () => {
      const result = buildRoundRobin(roomyInput({ teamIds: teamList(3), rounds: 1 }));
      expect(result.games).toHaveLength(3);
      expect(new Set(result.games.map(pairKey)).size).toBe(3);
    });
  });

  describe("home/away balance across rounds", () => {
    it("gives each of 2 teams one home game across 2 rounds", () => {
      const result = buildRoundRobin(
        roomyInput({ teamIds: ["team-a", "team-b"], rounds: 2 })
      );
      expect(result.games).toHaveLength(2);

      const [first, second] = result.games;
      expect(first.round).toBe(1);
      expect(second.round).toBe(2);
      expect(second.homeTeamId).toBe(first.awayTeamId);
      expect(second.awayTeamId).toBe(first.homeTeamId);
      expect(new Set(result.games.map((game) => game.homeTeamId)).size).toBe(2);
    });

    it("swaps home/away for every pairing on successive rounds (n=4, rounds=2)", () => {
      const result = buildRoundRobin(roomyInput({ teamIds: teamList(4), rounds: 2 }));
      const byPair = new Map<string, ProposedGame[]>();
      for (const game of result.games) {
        const existing = byPair.get(pairKey(game)) ?? [];
        byPair.set(pairKey(game), [...existing, game]);
      }

      expect(byPair.size).toBe(6);
      for (const meetings of byPair.values()) {
        expect(meetings).toHaveLength(2);
        const [first, second] = meetings;
        expect(second.homeTeamId).toBe(first.awayTeamId);
        expect(second.awayTeamId).toBe(first.homeTeamId);
      }
    });
  });

  describe("slot exhaustion", () => {
    it("reports pairings that do not fit in the date range", () => {
      // Mon 2026-01-05 .. Sun 2026-01-11 with Mon/Wed/Fri eligible = 3 slots,
      // but 4 teams x 1 round = 6 pairings.
      const result = buildRoundRobin(
        roomyInput({
          teamIds: teamList(4),
          rounds: 1,
          startDate: new Date("2026-01-05T00:00:00Z"),
          endDate: new Date("2026-01-11T00:00:00Z"),
          eligibleDays: [1, 3, 5],
          startTime: "18:00",
        })
      );

      expect(result.games).toHaveLength(3);
      expect(result.unslottedCount).toBe(3);
      expect(result.games.length + result.unslottedCount).toBe(6);
      expect(result.games.map((game) => game.startAt.toISOString())).toEqual([
        "2026-01-05T18:00:00.000Z",
        "2026-01-07T18:00:00.000Z",
        "2026-01-09T18:00:00.000Z",
      ]);
    });

    it("slots nothing when no eligible day falls in the range", () => {
      // 2026-01-05 is a Monday; only Sundays eligible.
      const result = buildRoundRobin(
        roomyInput({
          teamIds: teamList(3),
          startDate: new Date("2026-01-05T00:00:00Z"),
          endDate: new Date("2026-01-06T00:00:00Z"),
          eligibleDays: [0],
        })
      );
      expect(result.games).toHaveLength(0);
      expect(result.unslottedCount).toBe(3);
    });
  });

  describe("chronological order", () => {
    it("returns games in strictly increasing start order, one per eligible day", () => {
      const result = buildRoundRobin(roomyInput({ teamIds: teamList(6), rounds: 2 }));
      expect(result.games).toHaveLength(30);
      for (let i = 1; i < result.games.length; i++) {
        expect(result.games[i].startAt.getTime()).toBeGreaterThan(
          result.games[i - 1].startAt.getTime()
        );
      }
    });

    it("sets endAt to startAt plus the game duration", () => {
      const result = buildRoundRobin(roomyInput({ gameDurationMinutes: 90 }));
      for (const game of result.games) {
        expect(game.endAt.getTime() - game.startAt.getTime()).toBe(90 * 60_000);
      }
    });
  });

  describe("determinism", () => {
    it("produces identical output for identical input", () => {
      const input = roomyInput({ teamIds: teamList(7), rounds: 3 });
      const first = buildRoundRobin(input);
      const second = buildRoundRobin(input);
      expect(second).toEqual(first);
    });
  });

  describe("timezone correctness", () => {
    it("maps an 18:00 America/New_York slot to 22:00Z during EDT", () => {
      // 2026-09-15 is a Tuesday; New York observes EDT (UTC-4).
      const result = buildRoundRobin(
        roomyInput({
          teamIds: teamList(2),
          startDate: new Date("2026-09-15T00:00:00-04:00"),
          endDate: new Date("2026-09-15T23:59:59-04:00"),
          eligibleDays: [2],
          startTime: "18:00",
          gameDurationMinutes: 60,
          timezone: "America/New_York",
        })
      );

      expect(result.games).toHaveLength(1);
      expect(result.unslottedCount).toBe(0);
      expect(result.games[0].startAt.toISOString()).toBe("2026-09-15T22:00:00.000Z");
      expect(result.games[0].endAt.toISOString()).toBe("2026-09-15T23:00:00.000Z");
    });

    it("maps an 18:00 America/New_York slot to 23:00Z during EST", () => {
      // 2026-01-13 is a Tuesday; New York observes EST (UTC-5).
      const result = buildRoundRobin(
        roomyInput({
          teamIds: teamList(2),
          startDate: new Date("2026-01-13T00:00:00-05:00"),
          endDate: new Date("2026-01-13T23:59:59-05:00"),
          eligibleDays: [2],
          startTime: "18:00",
          timezone: "America/New_York",
        })
      );

      expect(result.games).toHaveLength(1);
      expect(result.games[0].startAt.toISOString()).toBe("2026-01-13T23:00:00.000Z");
    });
  });

  describe("venue assignment", () => {
    it("assigns the default venue to every game when provided", () => {
      const result = buildRoundRobin(roomyInput({ defaultVenueId: "venue-1" }));
      expect(result.games.length).toBeGreaterThan(0);
      for (const game of result.games) {
        expect(game.venueId).toBe("venue-1");
      }
    });

    it("leaves venueId null when no default venue is provided", () => {
      for (const defaultVenueId of [undefined, null]) {
        const result = buildRoundRobin(roomyInput({ defaultVenueId }));
        for (const game of result.games) {
          expect(game.venueId).toBeNull();
        }
      }
    });
  });

  describe("input validation", () => {
    it("rejects fewer than 2 teams", () => {
      expect(() => buildRoundRobin(roomyInput({ teamIds: ["team-1"] }))).toThrow();
    });

    it("rejects duplicate team ids", () => {
      expect(() =>
        buildRoundRobin(roomyInput({ teamIds: ["team-1", "team-1"] }))
      ).toThrow();
    });

    it("rejects rounds outside 1..4", () => {
      expect(() => buildRoundRobin(roomyInput({ rounds: 0 }))).toThrow();
      expect(() => buildRoundRobin(roomyInput({ rounds: 5 }))).toThrow();
    });

    it("rejects empty or out-of-range eligible days", () => {
      expect(() => buildRoundRobin(roomyInput({ eligibleDays: [] }))).toThrow();
      expect(() => buildRoundRobin(roomyInput({ eligibleDays: [7] }))).toThrow();
    });

    it("rejects malformed start times", () => {
      expect(() => buildRoundRobin(roomyInput({ startTime: "25:00" }))).toThrow();
      expect(() => buildRoundRobin(roomyInput({ startTime: "6pm" }))).toThrow();
    });

    it("rejects invalid timezones", () => {
      expect(() => buildRoundRobin(roomyInput({ timezone: "Not/AZone" }))).toThrow();
    });
  });
});
