import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { mockRequireEventManager, mockGetCurrentUserId, mockIsEventManager, mockPrisma } = vi.hoisted(() => ({
  mockRequireEventManager: vi.fn(),
  mockGetCurrentUserId: vi.fn(),
  mockIsEventManager: vi.fn(),
  mockPrisma: {
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
    signupEvent: { findUnique: vi.fn() },
    eventGame: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    eventTeam: { findMany: vi.fn() },
    eventRegistration: { count: vi.fn() },
    playerGameStat: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireEventManager: (...args: unknown[]) => mockRequireEventManager(...args),
  getCurrentUserId: (...args: unknown[]) => mockGetCurrentUserId(...args),
  isEventManager: (...args: unknown[]) => mockIsEventManager(...args),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/email/templates", () => ({ sendEventTeamsUpdateEmail: vi.fn() }));

vi.mock("@/lib/actions/venue-organizations", () => ({}));

import { recordGameResult } from "@/lib/actions/event-teams";
import { computeStandings } from "@/lib/utils/event-standings";

const GAME_ID = "cldgame00000000000000001";
const EVENT_ID = "cldevent0000000000000001";

describe("recordGameResult (age gate)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireEventManager.mockResolvedValue("admin-1");
    mockPrisma.eventGame.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
    // logSignupEventActivity host lookup after the guarded game lookup.
    mockPrisma.signupEvent.findUnique.mockResolvedValue({ hostLeagueId: null, hostTeamId: null });
  });

  it("refuses to record scores for 8U/mite events (USA Hockey ADM)", async () => {
    mockPrisma.eventGame.findUnique.mockResolvedValue({
      id: GAME_ID,
      eventId: EVENT_ID,
      event: { ageClassification: "U8" },
    });

    const result = await recordGameResult({ gameId: GAME_ID, homeScore: 3, awayScore: 2 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not recorded at this age level");
    }
    expect(mockPrisma.eventGame.update).not.toHaveBeenCalled();
  });

  it("records scores for Squirt+ events and marks the game completed", async () => {
    mockPrisma.eventGame.findUnique.mockResolvedValue({
      id: GAME_ID,
      eventId: EVENT_ID,
      event: { ageClassification: "SQUIRT_U10" },
    });

    const result = await recordGameResult({ gameId: GAME_ID, homeScore: 3, awayScore: 2 });

    expect(result).toEqual({ success: true, data: { gameId: GAME_ID } });
    expect(mockPrisma.eventGame.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { homeScore: 3, awayScore: 2, status: "COMPLETED" },
      })
    );
  });

  it("rejects schema-invalid scores before touching the database", async () => {
    const result = await recordGameResult({ gameId: GAME_ID, homeScore: -1, awayScore: 2 });

    expect(result.success).toBe(false);
    expect(mockPrisma.eventGame.findUnique).not.toHaveBeenCalled();
  });

  it("only records stats for this event's participants", async () => {
    mockPrisma.eventGame.findUnique.mockResolvedValue({
      id: GAME_ID,
      eventId: EVENT_ID,
      event: { ageClassification: "PEEWEE_U12" },
    });
    mockPrisma.eventRegistration.count.mockResolvedValue(0);

    const result = await recordGameResult({
      gameId: GAME_ID,
      homeScore: 1,
      awayScore: 0,
      stats: [{ registrationId: "cldregforeign00000000001", goals: 1, assists: 0 }],
    });

    expect(result).toEqual({
      success: false,
      error: "Stats can only be recorded for this event's participants.",
    });
  });
});

describe("computeStandings", () => {
  const teams = [
    { id: "red", name: "Red" },
    { id: "white", name: "White" },
    { id: "gold", name: "Gold" },
  ];

  it("awards 2 points for wins and 1 for ties, ranked by points then goal diff", () => {
    const standings = computeStandings(teams, [
      { status: "COMPLETED", homeTeamId: "red", awayTeamId: "white", homeScore: 3, awayScore: 1 },
      { status: "COMPLETED", homeTeamId: "gold", awayTeamId: "red", homeScore: 2, awayScore: 2 },
      { status: "COMPLETED", homeTeamId: "white", awayTeamId: "gold", homeScore: 0, awayScore: 4 },
    ]);

    expect(standings.map((row) => row.teamName)).toEqual(["Gold", "Red", "White"]);
    const gold = standings[0];
    expect(gold).toMatchObject({ gamesPlayed: 2, wins: 1, ties: 1, losses: 0, points: 3, goalsFor: 6, goalsAgainst: 2 });
    const red = standings[1];
    expect(red).toMatchObject({ gamesPlayed: 2, wins: 1, ties: 1, points: 3 });
    // Gold outranks Red on goal differential (+4 vs +2) despite equal points.
    expect(standings[2]).toMatchObject({ teamName: "White", points: 0, losses: 2 });
  });

  it("ignores scheduled and score-less games", () => {
    const standings = computeStandings(teams, [
      { status: "SCHEDULED", homeTeamId: "red", awayTeamId: "white", homeScore: null, awayScore: null },
      { status: "COMPLETED", homeTeamId: "red", awayTeamId: "white", homeScore: null, awayScore: null },
    ]);

    expect(standings.every((row) => row.gamesPlayed === 0)).toBe(true);
  });
});
