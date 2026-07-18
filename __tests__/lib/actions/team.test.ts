import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrismaTeam, mockRequireTeamAdmin, mockRequireUserId } = vi.hoisted(
  () => ({
    mockPrismaTeam: {
      create: vi.fn(),
      update: vi.fn(),
    },
    mockRequireTeamAdmin: vi.fn(),
    mockRequireUserId: vi.fn(),
  })
);

// Mock next/cache before importing actions
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock auth session helpers
vi.mock("@/lib/auth/session", () => ({
  requireTeamAdmin: (...args: unknown[]) => mockRequireTeamAdmin(...args),
  requireUserId: (...args: unknown[]) => mockRequireUserId(...args),
}));

// Mock Prisma client
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    team: mockPrismaTeam,
  },
}));

import { updateTeam } from "@/lib/actions/team";

// Valid CUID (matches z.string().cuid()) so we exercise auth/update, not validation.
const TEAM_ID = "clxxxxxxxxxxxxxxxxxxxxxxxxx";
const USER_ID = "user-123";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUserId.mockResolvedValue(USER_ID);
  mockRequireTeamAdmin.mockResolvedValue(USER_ID);
});

describe("updateTeam", () => {
  it("lets a team admin rename their team", async () => {
    const updated = {
      id: TEAM_ID,
      name: "New Name",
      sport: "HOCKEY",
      season: "Fall 2026",
    };
    mockPrismaTeam.update.mockResolvedValue(updated);

    const result = await updateTeam({
      id: TEAM_ID,
      name: "New Name",
      sport: "HOCKEY",
      season: "Fall 2026",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(updated);
    }
    // Authorization was enforced against the correct team.
    expect(mockRequireTeamAdmin).toHaveBeenCalledWith(TEAM_ID);
    expect(mockPrismaTeam.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TEAM_ID },
        data: expect.objectContaining({ name: "New Name" }),
      })
    );
  });

  it("rejects a non-admin member", async () => {
    mockRequireTeamAdmin.mockRejectedValue(
      new Error("Unauthorized: Only team admins can perform this action")
    );

    const result = await updateTeam({
      id: TEAM_ID,
      name: "New Name",
      sport: "HOCKEY",
      season: "Fall 2026",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/permission|unauthorized/i);
    }
    // Must never reach the database when authorization fails.
    expect(mockPrismaTeam.update).not.toHaveBeenCalled();
  });

  it("rejects invalid input (empty name)", async () => {
    const result = await updateTeam({
      id: TEAM_ID,
      name: "",
      sport: "HOCKEY",
      season: "Fall 2026",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/validation/i);
    }
    // Validation happens before authorization and persistence.
    expect(mockRequireTeamAdmin).not.toHaveBeenCalled();
    expect(mockPrismaTeam.update).not.toHaveBeenCalled();
  });

  it("rejects an invalid team id", async () => {
    const result = await updateTeam({
      id: "not-a-cuid",
      name: "New Name",
      sport: "HOCKEY",
      season: "Fall 2026",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/validation/i);
    }
    expect(mockPrismaTeam.update).not.toHaveBeenCalled();
  });

  it("rejects an invalid sport", async () => {
    const result = await updateTeam({
      id: TEAM_ID,
      name: "New Name",
      // @ts-expect-error - deliberately invalid sport value
      sport: "QUIDDITCH",
      season: "Fall 2026",
    });

    expect(result.success).toBe(false);
    expect(mockPrismaTeam.update).not.toHaveBeenCalled();
  });
});
