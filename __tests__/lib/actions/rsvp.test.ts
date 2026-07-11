import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockPrismaEvent,
  mockPrismaPlayer,
  mockPrismaPlayerGuardian,
  mockPrismaRsvp,
  mockPrismaTeamMember,
  mockPrismaLeagueUser,
  mockRequireUserId,
  mockRequireTeamMember,
  mockIsTeamAdmin,
} = vi.hoisted(() => ({
  mockPrismaEvent: {
    findUnique: vi.fn(),
  },
  mockPrismaPlayer: {
    findUnique: vi.fn(),
  },
  mockPrismaPlayerGuardian: {
    findUnique: vi.fn(),
  },
  mockPrismaRsvp: {
    upsert: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  mockPrismaTeamMember: {
    findUnique: vi.fn(),
  },
  mockPrismaLeagueUser: {
    findFirst: vi.fn(),
  },
  mockRequireUserId: vi.fn(),
  mockRequireTeamMember: vi.fn(),
  mockIsTeamAdmin: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireUserId: (...args: unknown[]) => mockRequireUserId(...args),
  requireTeamMember: (...args: unknown[]) => mockRequireTeamMember(...args),
  isTeamAdmin: (...args: unknown[]) => mockIsTeamAdmin(...args),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    event: mockPrismaEvent,
    player: mockPrismaPlayer,
    playerGuardian: mockPrismaPlayerGuardian,
    rSVP: mockPrismaRsvp,
    teamMember: mockPrismaTeamMember,
    leagueUser: mockPrismaLeagueUser,
  },
}));

import { submitRSVP, getEventAttendance } from "@/lib/actions/rsvp";

const USER_ID = "user-123";
const TEAM_ID = "cteam00000000000000000001";
const EVENT_ID = "cevent0000000000000000001";
const PLAYER_ID = "cplayer000000000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUserId.mockResolvedValue(USER_ID);
  mockRequireTeamMember.mockResolvedValue(USER_ID);
  mockIsTeamAdmin.mockResolvedValue(false);
  mockPrismaEvent.findUnique.mockResolvedValue({ id: EVENT_ID, teamId: TEAM_ID });
});

describe("submitRSVP — self/household (no playerId)", () => {
  it("updates the existing self row via findFirst + update (never upsert)", async () => {
    mockPrismaRsvp.findFirst.mockResolvedValue({ id: "rsvp-1" });
    mockPrismaRsvp.update.mockResolvedValue({
      id: "rsvp-1",
      status: "GOING",
      userId: USER_ID,
      eventId: EVENT_ID,
      playerId: null,
    });

    const result = await submitRSVP({ eventId: EVENT_ID, status: "GOING" });

    expect(result.success).toBe(true);
    expect(mockRequireTeamMember).toHaveBeenCalledWith(TEAM_ID);
    expect(mockPrismaRsvp.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID, eventId: EVENT_ID, playerId: null },
      })
    );
    expect(mockPrismaRsvp.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "rsvp-1" },
        data: { status: "GOING" },
      })
    );
    // The composite unique rejects null playerId — upsert must not be used here.
    expect(mockPrismaRsvp.upsert).not.toHaveBeenCalled();
    expect(mockPrismaRsvp.create).not.toHaveBeenCalled();
  });

  it("creates a self row when none exists", async () => {
    mockPrismaRsvp.findFirst.mockResolvedValue(null);
    mockPrismaRsvp.create.mockResolvedValue({
      id: "rsvp-2",
      status: "MAYBE",
      userId: USER_ID,
      eventId: EVENT_ID,
      playerId: null,
    });

    const result = await submitRSVP({ eventId: EVENT_ID, status: "MAYBE" });

    expect(result.success).toBe(true);
    expect(mockPrismaRsvp.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { userId: USER_ID, eventId: EVENT_ID, status: "MAYBE" },
      })
    );
    expect(mockPrismaRsvp.upsert).not.toHaveBeenCalled();
  });

  it("returns error when the event does not exist", async () => {
    mockPrismaEvent.findUnique.mockResolvedValue(null);

    const result = await submitRSVP({ eventId: EVENT_ID, status: "GOING" });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/not found/i);
  });

  it("rejects invalid status values", async () => {
    const result = await submitRSVP({
      eventId: EVENT_ID,
      // @ts-expect-error — fan-out-only status must be rejected by the schema
      status: "NO_RESPONSE",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/validation failed/i);
  });
});

describe("submitRSVP — per-child (playerId set)", () => {
  beforeEach(() => {
    mockPrismaPlayer.findUnique.mockResolvedValue({ id: PLAYER_ID, teamId: TEAM_ID });
    mockPrismaRsvp.upsert.mockResolvedValue({
      id: "rsvp-3",
      status: "GOING",
      userId: USER_ID,
      eventId: EVENT_ID,
      playerId: PLAYER_ID,
    });
  });

  it("allows a guardian with canRsvp and upserts on the composite key", async () => {
    mockPrismaPlayerGuardian.findUnique.mockResolvedValue({ canRsvp: true });

    const result = await submitRSVP({
      eventId: EVENT_ID,
      status: "GOING",
      playerId: PLAYER_ID,
    });

    expect(result.success).toBe(true);
    expect(mockPrismaRsvp.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_eventId_playerId: {
            userId: USER_ID,
            eventId: EVENT_ID,
            playerId: PLAYER_ID,
          },
        },
        create: expect.objectContaining({ playerId: PLAYER_ID, status: "GOING" }),
      })
    );
    // Guardian check short-circuits — no admin lookup needed.
    expect(mockIsTeamAdmin).not.toHaveBeenCalled();
  });

  it("allows a team ADMIN without a guardian link", async () => {
    mockPrismaPlayerGuardian.findUnique.mockResolvedValue(null);
    mockIsTeamAdmin.mockResolvedValue(true);

    const result = await submitRSVP({
      eventId: EVENT_ID,
      status: "NOT_GOING",
      playerId: PLAYER_ID,
    });

    expect(result.success).toBe(true);
    expect(mockIsTeamAdmin).toHaveBeenCalledWith(USER_ID, TEAM_ID);
    expect(mockPrismaRsvp.upsert).toHaveBeenCalled();
  });

  it("rejects a guardian whose canRsvp is false (and who is not admin)", async () => {
    mockPrismaPlayerGuardian.findUnique.mockResolvedValue({ canRsvp: false });
    mockIsTeamAdmin.mockResolvedValue(false);

    const result = await submitRSVP({
      eventId: EVENT_ID,
      status: "GOING",
      playerId: PLAYER_ID,
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/not authorized/i);
    expect(mockPrismaRsvp.upsert).not.toHaveBeenCalled();
  });

  it("rejects a non-guardian non-admin viewer", async () => {
    mockPrismaPlayerGuardian.findUnique.mockResolvedValue(null);
    mockIsTeamAdmin.mockResolvedValue(false);

    const result = await submitRSVP({
      eventId: EVENT_ID,
      status: "GOING",
      playerId: PLAYER_ID,
    });

    expect(result.success).toBe(false);
    expect(mockPrismaRsvp.upsert).not.toHaveBeenCalled();
  });

  it("rejects a player that belongs to a different team than the event", async () => {
    mockPrismaPlayer.findUnique.mockResolvedValue({
      id: PLAYER_ID,
      teamId: "cotherteam000000000000001",
    });

    const result = await submitRSVP({
      eventId: EVENT_ID,
      status: "GOING",
      playerId: PLAYER_ID,
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/player/i);
    expect(mockPrismaPlayerGuardian.findUnique).not.toHaveBeenCalled();
    expect(mockPrismaRsvp.upsert).not.toHaveBeenCalled();
  });

  it("rejects a playerId for a player that does not exist", async () => {
    mockPrismaPlayer.findUnique.mockResolvedValue(null);

    const result = await submitRSVP({
      eventId: EVENT_ID,
      status: "GOING",
      playerId: PLAYER_ID,
    });

    expect(result.success).toBe(false);
    expect(mockPrismaRsvp.upsert).not.toHaveBeenCalled();
  });
});

describe("getEventAttendance", () => {
  beforeEach(() => {
    mockPrismaEvent.findUnique.mockResolvedValue({
      id: EVENT_ID,
      teamId: TEAM_ID,
      leagueId: null,
      team: { leagueId: null },
    });
    mockPrismaTeamMember.findUnique.mockResolvedValue({ role: "MEMBER" });
  });

  it("lists user-level and player-level entries with attribution and counts", async () => {
    mockPrismaRsvp.findMany.mockResolvedValue([
      {
        status: "GOING",
        playerId: null,
        updatedAt: new Date("2026-07-01"),
        user: { name: "Alice Adult", email: "alice@test.com" },
        player: null,
      },
      {
        status: "MAYBE",
        playerId: null,
        updatedAt: new Date("2026-07-01"),
        user: { name: null, email: "bob@test.com" },
        player: null,
      },
      {
        status: "GOING",
        playerId: PLAYER_ID,
        updatedAt: new Date("2026-07-02"),
        user: { name: "Paula Parent", email: "paula@test.com" },
        player: { id: PLAYER_ID, name: "Kid Kowalski" },
      },
    ]);

    const result = await getEventAttendance(EVENT_ID);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.entries).toHaveLength(3);

    const playerEntry = result.data.entries.find((e) => e.kind === "player");
    expect(playerEntry).toMatchObject({
      name: "Kid Kowalski",
      status: "GOING",
      respondedByName: "Paula Parent",
    });

    // User without a display name falls back to email
    const bobEntry = result.data.entries.find((e) => e.name === "bob@test.com");
    expect(bobEntry).toMatchObject({ kind: "user", status: "MAYBE" });

    expect(result.data.counts).toEqual({
      GOING: 2,
      MAYBE: 1,
      NOT_GOING: 0,
      NO_RESPONSE: 0,
    });
  });

  it("deduplicates multiple rows for the same player — latest response wins", async () => {
    mockPrismaRsvp.findMany.mockResolvedValue([
      {
        status: "NOT_GOING",
        playerId: PLAYER_ID,
        updatedAt: new Date("2026-07-01"),
        user: { name: "Admin", email: "admin@test.com" },
        player: { id: PLAYER_ID, name: "Kid Kowalski" },
      },
      {
        status: "GOING",
        playerId: PLAYER_ID,
        updatedAt: new Date("2026-07-03"),
        user: { name: "Paula Parent", email: "paula@test.com" },
        player: { id: PLAYER_ID, name: "Kid Kowalski" },
      },
    ]);

    const result = await getEventAttendance(EVENT_ID);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.entries).toHaveLength(1);
    expect(result.data.entries[0]).toMatchObject({
      kind: "player",
      status: "GOING",
      respondedByName: "Paula Parent",
    });
    expect(result.data.counts.GOING).toBe(1);
    expect(result.data.counts.NOT_GOING).toBe(0);
  });

  it("denies non-members when the event has no league", async () => {
    mockPrismaTeamMember.findUnique.mockResolvedValue(null);

    const result = await getEventAttendance(EVENT_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/access/i);
    expect(mockPrismaRsvp.findMany).not.toHaveBeenCalled();
  });

  it("allows a LEAGUE_ADMIN of the event's league", async () => {
    mockPrismaEvent.findUnique.mockResolvedValue({
      id: EVENT_ID,
      teamId: TEAM_ID,
      leagueId: "cleague000000000000000001",
      team: { leagueId: "cleague000000000000000001" },
    });
    mockPrismaTeamMember.findUnique.mockResolvedValue(null);
    mockPrismaLeagueUser.findFirst.mockResolvedValue({ id: "lu-1" });
    mockPrismaRsvp.findMany.mockResolvedValue([]);

    const result = await getEventAttendance(EVENT_ID);

    expect(result.success).toBe(true);
    expect(mockPrismaLeagueUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: USER_ID,
          leagueId: "cleague000000000000000001",
          role: "LEAGUE_ADMIN",
        }),
      })
    );
  });

  it("returns error for an unknown event", async () => {
    mockPrismaEvent.findUnique.mockResolvedValue(null);

    const result = await getEventAttendance(EVENT_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/not found/i);
  });
});
