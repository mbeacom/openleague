import { TZDate } from "@date-fns/tz";
import { isValidTimeZone } from "@/lib/utils/date";

/**
 * Pure round-robin schedule generation (no database access).
 *
 * The same deterministic output backs both the generation preview and draft
 * creation (FR-015/FR-016): given identical input, `buildRoundRobin` always
 * produces an identical result — no randomness, no reliance on the current
 * time or the runtime's local timezone.
 */

export type RoundRobinInput = {
  teamIds: string[]; // >= 2 distinct ids
  rounds: number; // 1..4 — times each pair meets
  startDate: Date;
  endDate: Date; // inclusive last day
  eligibleDays: number[]; // 0(Sun)..6(Sat), non-empty
  startTime: string; // "HH:MM" wall-clock for each slot
  gameDurationMinutes: number;
  timezone: string; // IANA zone the wall-clock applies in
  defaultVenueId?: string | null;
};

export type ProposedGame = {
  homeTeamId: string;
  awayTeamId: string;
  round: number; // 1-based
  startAt: Date; // UTC instant
  endAt: Date;
  venueId: string | null;
};

export type RoundRobinResult = {
  games: ProposedGame[]; // slotted games in chronological order
  unslottedCount: number; // pairings that did not fit in the date range
};

const START_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MS_PER_DAY = 86_400_000;
const MS_PER_MINUTE = 60_000;

type Pairing = { homeTeamId: string; awayTeamId: string };

function assertValidInput(input: RoundRobinInput): void {
  const { teamIds, rounds, eligibleDays, startTime, gameDurationMinutes, timezone } = input;

  if (teamIds.length < 2) {
    throw new Error("Round-robin generation requires at least 2 teams");
  }
  if (new Set(teamIds).size !== teamIds.length) {
    throw new Error("Round-robin team ids must be distinct");
  }
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 4) {
    throw new Error("Rounds must be an integer between 1 and 4");
  }
  if (eligibleDays.length === 0) {
    throw new Error("At least one eligible day is required");
  }
  if (eligibleDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error("Eligible days must be integers between 0 (Sunday) and 6 (Saturday)");
  }
  if (!START_TIME_RE.test(startTime)) {
    throw new Error("Start time must be in HH:MM (24-hour) format");
  }
  if (!Number.isFinite(gameDurationMinutes) || gameDurationMinutes <= 0) {
    throw new Error("Game duration must be a positive number of minutes");
  }
  if (!isValidTimeZone(timezone)) {
    throw new Error(`Invalid IANA timezone: ${timezone}`);
  }
  if (Number.isNaN(input.startDate.getTime()) || Number.isNaN(input.endDate.getTime())) {
    throw new Error("Start and end dates must be valid dates");
  }
}

/**
 * One full round-robin cycle via the circle method: every pair meets exactly
 * once, and no team plays twice within the same pairing round. An odd team
 * count gets a rotating bye (the seat paired with the `null` placeholder).
 * Orientation alternates by pairing-round parity so home/away is roughly
 * balanced within the cycle.
 */
function circleMethodCycle(teamIds: string[]): Pairing[] {
  const seats: (string | null)[] = [...teamIds];
  if (seats.length % 2 === 1) seats.push(null); // bye placeholder
  const seatCount = seats.length;
  const half = seatCount / 2;

  const fixed = seats[0];
  const rotating = seats.slice(1);
  const pairings: Pairing[] = [];

  for (let pairingRound = 0; pairingRound < seatCount - 1; pairingRound++) {
    const roundSeats = [fixed, ...rotating];
    for (let i = 0; i < half; i++) {
      const a = roundSeats[i];
      const b = roundSeats[seatCount - 1 - i];
      if (a === null || b === null) continue; // bye — team sits this round out
      if (pairingRound % 2 === 0) {
        pairings.push({ homeTeamId: a, awayTeamId: b });
      } else {
        pairings.push({ homeTeamId: b, awayTeamId: a });
      }
    }
    // Rotate all seats except the fixed one.
    rotating.unshift(rotating.pop()!);
  }

  return pairings;
}

/**
 * Generate a proposed round-robin schedule.
 *
 * Pairings are the circle-method cycle repeated `rounds` times, with home/away
 * swapped on each successive round for balance. Slots are walked day by day
 * from `startDate` to `endDate` (inclusive, as calendar dates in `timezone`);
 * each day whose day-of-week in `timezone` is in `eligibleDays` hosts exactly
 * one game at `startTime` wall-clock. Pairings that do not fit in the range
 * are reported via `unslottedCount`, so
 * `games.length + unslottedCount === n(n-1)/2 * rounds`.
 */
export function buildRoundRobin(input: RoundRobinInput): RoundRobinResult {
  assertValidInput(input);
  const {
    teamIds,
    rounds,
    startDate,
    endDate,
    eligibleDays,
    startTime,
    gameDurationMinutes,
    timezone,
    defaultVenueId,
  } = input;

  // All pairings across every round, in generation (and therefore slot) order.
  const cycle = circleMethodCycle(teamIds);
  const pairings: (Pairing & { round: number })[] = [];
  for (let round = 1; round <= rounds; round++) {
    for (const pairing of cycle) {
      // Swap home/away on even rounds so repeat meetings alternate venues.
      pairings.push(
        round % 2 === 1
          ? { homeTeamId: pairing.homeTeamId, awayTeamId: pairing.awayTeamId, round }
          : { homeTeamId: pairing.awayTeamId, awayTeamId: pairing.homeTeamId, round }
      );
    }
  }

  const [, hourPart, minutePart] = START_TIME_RE.exec(startTime)!;
  const hours = Number(hourPart);
  const minutes = Number(minutePart);
  const eligible = new Set(eligibleDays);
  const venueId = defaultVenueId ?? null;

  // Walk calendar days as seen in the target timezone. The cursor advances in
  // uniform UTC days (immune to DST length changes); day-of-week of a calendar
  // date is zone-independent, so getUTCDay() on the cursor is correct.
  const startWall = new TZDate(startDate.getTime(), timezone);
  const endWall = new TZDate(endDate.getTime(), timezone);
  let cursor = Date.UTC(startWall.getFullYear(), startWall.getMonth(), startWall.getDate());
  const lastDay = Date.UTC(endWall.getFullYear(), endWall.getMonth(), endWall.getDate());

  const games: ProposedGame[] = [];
  let slotted = 0;

  while (cursor <= lastDay && slotted < pairings.length) {
    const day = new Date(cursor);
    if (eligible.has(day.getUTCDay())) {
      const zoned = new TZDate(
        day.getUTCFullYear(),
        day.getUTCMonth(),
        day.getUTCDate(),
        hours,
        minutes,
        0,
        timezone
      );
      const startAt = new Date(zoned.getTime());
      const endAt = new Date(startAt.getTime() + gameDurationMinutes * MS_PER_MINUTE);
      const pairing = pairings[slotted];
      games.push({
        homeTeamId: pairing.homeTeamId,
        awayTeamId: pairing.awayTeamId,
        round: pairing.round,
        startAt,
        endAt,
        venueId,
      });
      slotted++;
    }
    cursor += MS_PER_DAY;
  }

  return { games, unslottedCount: pairings.length - slotted };
}
