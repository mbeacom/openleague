import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/cache before importing actions
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock auth session helpers
const mockRequireTeamAdmin = vi.fn();
const mockRequireUserId = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  requireTeamAdmin: (...args: unknown[]) => mockRequireTeamAdmin(...args),
  requireUserId: (...args: unknown[]) => mockRequireUserId(...args),
}));

// Mock Prisma client
const mockPrismaPlayer = {
  create: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  findMany: vi.fn(),
};
const mockPrismaTeamMember = {
  findUnique: vi.fn(),
  update: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
};
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    player: mockPrismaPlayer,
    teamMember: mockPrismaTeamMember,
  },
}));

import { addPlayer, updatePlayer, updateTeamMemberUsahId } from "@/lib/actions/roster";

const TEAM_ID = "clxxxxxxxxxxxxxxxxxxxxxxxxx";
const PLAYER_ID = "clyyyyyyyyyyyyyyyyyyyyyyyy";
const USER_ID = "user-123";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireTeamAdmin.mockResolvedValue(USER_ID);
  mockRequireUserId.mockResolvedValue(USER_ID);
});

describe("addPlayer", () => {
  it("saves jerseyNumber correctly", async () => {
    const created = { id: PLAYER_ID, name: "Alice", jerseyNumber: 7, teamId: TEAM_ID };
    mockPrismaPlayer.create.mockResolvedValue(created);
    mockPrismaPlayer.findFirst.mockResolvedValue(null); // no duplicate

    const result = await addPlayer({
      name: "Alice",
      teamId: TEAM_ID,
      jerseyNumber: 7,
    });

    expect(result.success).toBe(true);
    expect(mockPrismaPlayer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ jerseyNumber: 7 }),
      })
    );
  });

  it("returns warning when duplicate jersey number exists", async () => {
    const created = { id: PLAYER_ID, name: "Bob", jerseyNumber: 10, teamId: TEAM_ID };
    mockPrismaPlayer.create.mockResolvedValue(created);
    mockPrismaPlayer.findFirst.mockResolvedValue({ name: "ExistingPlayer" });

    const result = await addPlayer({
      name: "Bob",
      teamId: TEAM_ID,
      jerseyNumber: 10,
    });

    expect(result.success).toBe(true);
    expect(result.warning).toMatch(/Jersey #10.*ExistingPlayer/);
  });

  it("does not check for duplicate when jerseyNumber is null", async () => {
    const created = { id: PLAYER_ID, name: "Charlie", jerseyNumber: null, teamId: TEAM_ID };
    mockPrismaPlayer.create.mockResolvedValue(created);

    const result = await addPlayer({
      name: "Charlie",
      teamId: TEAM_ID,
      jerseyNumber: null,
    });

    expect(result.success).toBe(true);
    expect(result.warning).toBeUndefined();
    expect(mockPrismaPlayer.findFirst).not.toHaveBeenCalled();
  });
});

describe("updatePlayer", () => {
  it("saves jerseyNumber null when cleared", async () => {
    mockPrismaPlayer.findUnique.mockResolvedValue({ teamId: TEAM_ID });
    const updated = { id: PLAYER_ID, name: "Alice", jerseyNumber: null, teamId: TEAM_ID };
    mockPrismaPlayer.update.mockResolvedValue(updated);

    const result = await updatePlayer({
      id: PLAYER_ID,
      name: "Alice",
      teamId: TEAM_ID,
      jerseyNumber: null,
    });

    expect(result.success).toBe(true);
    expect(mockPrismaPlayer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ jerseyNumber: null }),
      })
    );
  });

  it("returns warning on duplicate jersey number (excluding self)", async () => {
    mockPrismaPlayer.findUnique.mockResolvedValue({ teamId: TEAM_ID });
    const updated = { id: PLAYER_ID, name: "Alice", jerseyNumber: 5, teamId: TEAM_ID };
    mockPrismaPlayer.update.mockResolvedValue(updated);
    mockPrismaPlayer.findFirst.mockResolvedValue({ name: "OtherPlayer" });

    const result = await updatePlayer({
      id: PLAYER_ID,
      name: "Alice",
      teamId: TEAM_ID,
      jerseyNumber: 5,
    });

    expect(result.success).toBe(true);
    expect(result.warning).toMatch(/Jersey #5.*OtherPlayer/);
    // Should exclude the current player from duplicate check
    expect(mockPrismaPlayer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: PLAYER_ID },
        }),
      })
    );
  });
});

describe("updateTeamMemberUsahId", () => {
  const MEMBER_ID = "clzzzzzzzzzzzzzzzzzzzzzzzz";

  it("updates USAH ID successfully", async () => {
    mockPrismaTeamMember.findUnique.mockResolvedValue({ teamId: TEAM_ID });
    mockPrismaTeamMember.update.mockResolvedValue({
      id: MEMBER_ID,
      usahMemberId: "ABC123",
    });

    const result = await updateTeamMemberUsahId({
      teamMemberId: MEMBER_ID,
      teamId: TEAM_ID,
      usahMemberId: "ABC123",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: MEMBER_ID, usahMemberId: "ABC123" });
  });

  it("returns error when TeamMember not found", async () => {
    mockPrismaTeamMember.findUnique.mockResolvedValue(null);

    const result = await updateTeamMemberUsahId({
      teamMemberId: MEMBER_ID,
      teamId: TEAM_ID,
      usahMemberId: "ABC123",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it("returns error when TeamMember belongs to different team", async () => {
    mockPrismaTeamMember.findUnique.mockResolvedValue({
      teamId: "different-team-id",
    });

    const result = await updateTeamMemberUsahId({
      teamMemberId: MEMBER_ID,
      teamId: TEAM_ID,
      usahMemberId: "ABC123",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unauthorized|does not belong/i);
  });
});
