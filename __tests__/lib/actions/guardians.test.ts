import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockPrismaPlayer,
  mockPrismaUser,
  mockPrismaPlayerGuardian,
  mockPrismaEvent,
  mockPrismaRsvp,
  mockRequireUserId,
  mockRequireTeamAdmin,
  mockIsTeamAdmin,
} = vi.hoisted(() => ({
  mockPrismaPlayer: {
    findUnique: vi.fn(),
  },
  mockPrismaUser: {
    findUnique: vi.fn(),
  },
  mockPrismaPlayerGuardian: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  mockPrismaEvent: {
    findMany: vi.fn(),
  },
  mockPrismaRsvp: {
    findMany: vi.fn(),
  },
  mockRequireUserId: vi.fn(),
  mockRequireTeamAdmin: vi.fn(),
  mockIsTeamAdmin: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireUserId: (...args: unknown[]) => mockRequireUserId(...args),
  requireTeamAdmin: (...args: unknown[]) => mockRequireTeamAdmin(...args),
  isTeamAdmin: (...args: unknown[]) => mockIsTeamAdmin(...args),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    player: mockPrismaPlayer,
    user: mockPrismaUser,
    playerGuardian: mockPrismaPlayerGuardian,
    event: mockPrismaEvent,
    rSVP: mockPrismaRsvp,
  },
}));

import {
  addGuardian,
  removeGuardian,
  listGuardians,
  getMyPlayers,
} from "@/lib/actions/guardians";

const USER_ID = "user-123";
const GUARDIAN_USER_ID = "user-guardian";
const TEAM_ID = "cteam00000000000000000001";
const PLAYER_ID = "cplayer000000000000000001";
const GUARDIAN_ID = "cguardian0000000000000001";
const EVENT_ID = "cevent0000000000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUserId.mockResolvedValue(USER_ID);
  mockRequireTeamAdmin.mockResolvedValue(USER_ID);
  mockIsTeamAdmin.mockResolvedValue(false);
});

describe("addGuardian", () => {
  beforeEach(() => {
    mockPrismaPlayer.findUnique.mockResolvedValue({ id: PLAYER_ID, teamId: TEAM_ID });
    mockPrismaUser.findUnique.mockResolvedValue({ id: GUARDIAN_USER_ID });
    mockPrismaPlayerGuardian.findUnique.mockResolvedValue(null);
  });

  it("creates a guardian link for an existing account (team admin only)", async () => {
    const created = {
      id: GUARDIAN_ID,
      playerId: PLAYER_ID,
      userId: GUARDIAN_USER_ID,
      relationship: "Mother",
      canRsvp: true,
      createdAt: new Date(),
      user: { id: GUARDIAN_USER_ID, name: "Paula Parent", email: "paula@test.com" },
    };
    mockPrismaPlayerGuardian.create.mockResolvedValue(created);

    const result = await addGuardian({
      playerId: PLAYER_ID,
      email: "Paula@Test.com",
      relationship: "Mother",
    });

    expect(result.success).toBe(true);
    expect(mockRequireTeamAdmin).toHaveBeenCalledWith(TEAM_ID);
    // Email is normalized to lowercase by the schema before lookup
    expect(mockPrismaUser.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "paula@test.com" },
      })
    );
    expect(mockPrismaPlayerGuardian.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          playerId: PLAYER_ID,
          userId: GUARDIAN_USER_ID,
          relationship: "Mother",
        },
      })
    );
  });

  it("returns a friendly error when no account exists for the email", async () => {
    mockPrismaUser.findUnique.mockResolvedValue(null);

    const result = await addGuardian({
      playerId: PLAYER_ID,
      email: "nobody@test.com",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/sign up/i);
    expect(mockPrismaPlayerGuardian.create).not.toHaveBeenCalled();
  });

  it("rejects duplicate guardian links", async () => {
    mockPrismaPlayerGuardian.findUnique.mockResolvedValue({ id: GUARDIAN_ID });

    const result = await addGuardian({
      playerId: PLAYER_ID,
      email: "paula@test.com",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/already a guardian/i);
    expect(mockPrismaPlayerGuardian.create).not.toHaveBeenCalled();
  });

  it("returns error when the player does not exist", async () => {
    mockPrismaPlayer.findUnique.mockResolvedValue(null);

    const result = await addGuardian({
      playerId: PLAYER_ID,
      email: "paula@test.com",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/player not found/i);
    expect(mockRequireTeamAdmin).not.toHaveBeenCalled();
  });

  it("fails when the caller is not a team admin", async () => {
    mockRequireTeamAdmin.mockRejectedValue(new Error("Unauthorized"));

    const result = await addGuardian({
      playerId: PLAYER_ID,
      email: "paula@test.com",
    });

    expect(result.success).toBe(false);
    expect(mockPrismaPlayerGuardian.create).not.toHaveBeenCalled();
  });

  it("rejects invalid input (bad email)", async () => {
    const result = await addGuardian({
      playerId: PLAYER_ID,
      email: "not-an-email",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/validation failed/i);
  });
});

describe("removeGuardian", () => {
  const guardianRow = {
    id: GUARDIAN_ID,
    userId: GUARDIAN_USER_ID,
    player: { teamId: TEAM_ID },
  };

  it("allows the guardian to remove themself", async () => {
    mockRequireUserId.mockResolvedValue(GUARDIAN_USER_ID);
    mockPrismaPlayerGuardian.findUnique.mockResolvedValue(guardianRow);

    const result = await removeGuardian({ guardianId: GUARDIAN_ID });

    expect(result.success).toBe(true);
    expect(mockPrismaPlayerGuardian.delete).toHaveBeenCalledWith({
      where: { id: GUARDIAN_ID },
    });
    // Self-removal short-circuits — no admin lookup needed.
    expect(mockIsTeamAdmin).not.toHaveBeenCalled();
  });

  it("allows a team ADMIN of the player's team", async () => {
    mockPrismaPlayerGuardian.findUnique.mockResolvedValue(guardianRow);
    mockIsTeamAdmin.mockResolvedValue(true);

    const result = await removeGuardian({ guardianId: GUARDIAN_ID });

    expect(result.success).toBe(true);
    expect(mockIsTeamAdmin).toHaveBeenCalledWith(USER_ID, TEAM_ID);
    expect(mockPrismaPlayerGuardian.delete).toHaveBeenCalled();
  });

  it("rejects a viewer who is neither the guardian nor a team admin", async () => {
    mockPrismaPlayerGuardian.findUnique.mockResolvedValue(guardianRow);
    mockIsTeamAdmin.mockResolvedValue(false);

    const result = await removeGuardian({ guardianId: GUARDIAN_ID });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/not authorized/i);
    expect(mockPrismaPlayerGuardian.delete).not.toHaveBeenCalled();
  });

  it("returns error when the guardian link does not exist", async () => {
    mockPrismaPlayerGuardian.findUnique.mockResolvedValue(null);

    const result = await removeGuardian({ guardianId: GUARDIAN_ID });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/not found/i);
  });
});

describe("listGuardians", () => {
  beforeEach(() => {
    mockPrismaPlayer.findUnique.mockResolvedValue({ id: PLAYER_ID, teamId: TEAM_ID });
  });

  it("allows a team ADMIN", async () => {
    mockPrismaPlayerGuardian.findUnique.mockResolvedValue(null);
    mockIsTeamAdmin.mockResolvedValue(true);
    mockPrismaPlayerGuardian.findMany.mockResolvedValue([]);

    const result = await listGuardians(PLAYER_ID);

    expect(result.success).toBe(true);
    expect(mockPrismaPlayerGuardian.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { playerId: PLAYER_ID },
      })
    );
  });

  it("allows a guardian of the player", async () => {
    mockPrismaPlayerGuardian.findUnique.mockResolvedValue({ id: GUARDIAN_ID });
    mockPrismaPlayerGuardian.findMany.mockResolvedValue([]);

    const result = await listGuardians(PLAYER_ID);

    expect(result.success).toBe(true);
    expect(mockIsTeamAdmin).not.toHaveBeenCalled();
  });

  it("rejects other viewers", async () => {
    mockPrismaPlayerGuardian.findUnique.mockResolvedValue(null);
    mockIsTeamAdmin.mockResolvedValue(false);

    const result = await listGuardians(PLAYER_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/not authorized/i);
    expect(mockPrismaPlayerGuardian.findMany).not.toHaveBeenCalled();
  });

  it("rejects malformed player IDs", async () => {
    const result = await listGuardians("not-a-cuid");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/invalid player id/i);
  });
});

describe("getMyPlayers", () => {
  it("returns an empty list when the user guards no players", async () => {
    mockPrismaPlayerGuardian.findMany.mockResolvedValue([]);

    const result = await getMyPlayers();

    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual([]);
    expect(mockPrismaEvent.findMany).not.toHaveBeenCalled();
  });

  it("returns guarded players with upcoming events and per-child statuses", async () => {
    const startAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    mockPrismaPlayerGuardian.findMany.mockResolvedValue([
      {
        canRsvp: true,
        player: {
          id: PLAYER_ID,
          name: "Kid One",
          teamId: TEAM_ID,
          team: { name: "Ice Hawks" },
        },
      },
      {
        canRsvp: false,
        player: {
          id: "cplayer000000000000000002",
          name: "Kid Two",
          teamId: TEAM_ID,
          team: { name: "Ice Hawks" },
        },
      },
    ]);
    mockPrismaEvent.findMany.mockResolvedValue([
      { id: EVENT_ID, title: "vs Wolves", startAt, teamId: TEAM_ID },
    ]);
    mockPrismaRsvp.findMany.mockResolvedValue([
      {
        playerId: PLAYER_ID,
        eventId: EVENT_ID,
        status: "GOING",
        updatedAt: new Date("2026-07-01"),
      },
    ]);

    const result = await getMyPlayers();

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data).toHaveLength(2);

    const [kidOne, kidTwo] = result.data;
    expect(kidOne).toMatchObject({
      playerId: PLAYER_ID,
      playerName: "Kid One",
      teamId: TEAM_ID,
      teamName: "Ice Hawks",
      canRsvp: true,
    });
    expect(kidOne.upcoming).toEqual([
      {
        eventId: EVENT_ID,
        title: "vs Wolves",
        startAt,
        myChildStatus: "GOING",
      },
    ]);

    // No per-child row yet — pending shows as NO_RESPONSE
    expect(kidTwo.canRsvp).toBe(false);
    expect(kidTwo.upcoming[0].myChildStatus).toBe("NO_RESPONSE");
  });

  it("uses the latest row when multiple adults answered for the same child", async () => {
    const startAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    mockPrismaPlayerGuardian.findMany.mockResolvedValue([
      {
        canRsvp: true,
        player: {
          id: PLAYER_ID,
          name: "Kid One",
          teamId: TEAM_ID,
          team: { name: "Ice Hawks" },
        },
      },
    ]);
    mockPrismaEvent.findMany.mockResolvedValue([
      { id: EVENT_ID, title: "Practice", startAt, teamId: TEAM_ID },
    ]);
    mockPrismaRsvp.findMany.mockResolvedValue([
      {
        playerId: PLAYER_ID,
        eventId: EVENT_ID,
        status: "NOT_GOING",
        updatedAt: new Date("2026-07-01"),
      },
      {
        playerId: PLAYER_ID,
        eventId: EVENT_ID,
        status: "GOING",
        updatedAt: new Date("2026-07-05"),
      },
    ]);

    const result = await getMyPlayers();

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0].upcoming[0].myChildStatus).toBe("GOING");
  });

  it("skips the RSVP query when there are no upcoming events", async () => {
    mockPrismaPlayerGuardian.findMany.mockResolvedValue([
      {
        canRsvp: true,
        player: {
          id: PLAYER_ID,
          name: "Kid One",
          teamId: TEAM_ID,
          team: { name: "Ice Hawks" },
        },
      },
    ]);
    mockPrismaEvent.findMany.mockResolvedValue([]);

    const result = await getMyPlayers();

    expect(result.success).toBe(true);
    if (result.success) expect(result.data[0].upcoming).toEqual([]);
    expect(mockPrismaRsvp.findMany).not.toHaveBeenCalled();
  });
});
