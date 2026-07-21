import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  leagueMessage: { create: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  messageTargeting: { create: vi.fn() },
  messageRecipient: { createMany: vi.fn(), updateMany: vi.fn() },
  user: { findMany: vi.fn() },
  teamMember: { findFirst: vi.fn() },
  requireUserId: vi.fn(),
  isTeamAdmin: vi.fn(),
  sendOrBatchNotification: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({
  requireUserId: (...a: unknown[]) => mocks.requireUserId(...a),
  isTeamAdmin: (...a: unknown[]) => mocks.isTeamAdmin(...a),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    leagueMessage: mocks.leagueMessage,
    messageTargeting: mocks.messageTargeting,
    messageRecipient: mocks.messageRecipient,
    user: mocks.user,
    teamMember: mocks.teamMember,
  },
}));

vi.mock("@/lib/services/notification", () => ({
  notificationService: {
    sendOrBatchNotification: (...a: unknown[]) => mocks.sendOrBatchNotification(...a),
  },
}));

vi.mock("@/lib/utils/durable-rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => mocks.checkRateLimit(...a),
  rateLimitMessage: (retryAfterSec?: number) => {
    const minutes = Math.max(1, Math.ceil((retryAfterSec ?? 60) / 60));
    return `Too many requests — try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  },
  RATE_LIMITS: {
    MESSAGE_SEND_PER_USER: { limit: 20, windowSec: 3600 },
  },
}));

import { sendTeamMessage, getTeamMessages } from "@/lib/actions/communication";

const TEAM_ID = "cjld2cjxh0000qzrmn831i7rn";
const OTHER_TEAM_ID = "cjld2cjxh0002qzrmn831i7rn";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserId.mockResolvedValue("user-admin-1");
  mocks.isTeamAdmin.mockResolvedValue(true);
  mocks.user.findMany.mockResolvedValue([
    { id: "u1", email: "a@example.com", name: "A" },
    { id: "u2", email: "b@example.com", name: "B" },
  ]);
  mocks.leagueMessage.create.mockResolvedValue({ id: "msg-1" });
  mocks.messageTargeting.create.mockResolvedValue({});
  mocks.messageRecipient.createMany.mockResolvedValue({ count: 2 });
  mocks.messageRecipient.updateMany.mockResolvedValue({ count: 2 });
  mocks.sendOrBatchNotification.mockResolvedValue(undefined);
  mocks.teamMember.findFirst.mockResolvedValue({ id: "member-1" });
  mocks.checkRateLimit.mockResolvedValue({ allowed: true });
});

const validInput = {
  teamId: TEAM_ID,
  subject: "Practice moved",
  content: "Practice is now at 6pm.",
  messageType: "MESSAGE" as const,
  priority: "NORMAL" as const,
};

describe("sendTeamMessage", () => {
  it("lets a team admin message their own team", async () => {
    const result = await sendTeamMessage(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recipientCount).toBe(2);
    }
    // Scoped to the team, never to a league.
    const createArg = mocks.leagueMessage.create.mock.calls[0][0];
    expect(createArg.data.teamId).toBe(TEAM_ID);
    expect(createArg.data.leagueId).toBeUndefined();
    // Notification service called per recipient with no leagueId.
    expect(mocks.sendOrBatchNotification).toHaveBeenCalledTimes(2);
    expect(mocks.sendOrBatchNotification.mock.calls[0][5]).toBeUndefined();
  });

  it("rejects a non-admin member", async () => {
    mocks.isTeamAdmin.mockResolvedValue(false);
    const result = await sendTeamMessage(validInput);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/Only team admins/i);
    expect(mocks.leagueMessage.create).not.toHaveBeenCalled();
  });

  it("rejects sending to a team the caller does not admin", async () => {
    // isTeamAdmin is checked against the SUPPLIED teamId; a caller who only
    // admins TEAM_ID cannot target OTHER_TEAM_ID.
    mocks.isTeamAdmin.mockImplementation(async (_userId: string, teamId: string) => teamId === TEAM_ID);
    const result = await sendTeamMessage({ ...validInput, teamId: OTHER_TEAM_ID });
    expect(result.success).toBe(false);
    expect(mocks.isTeamAdmin).toHaveBeenCalledWith("user-admin-1", OTHER_TEAM_ID);
    expect(mocks.leagueMessage.create).not.toHaveBeenCalled();
  });

  it("does not send when the team has no members", async () => {
    mocks.user.findMany.mockResolvedValue([]);
    const result = await sendTeamMessage(validInput);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/no team members/i);
    expect(mocks.leagueMessage.create).not.toHaveBeenCalled();
  });

  it("rejects when the per-sender rate limit is exceeded, before any fan-out", async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 600 });

    const result = await sendTeamMessage(validInput);
    expect(result).toEqual({
      success: false,
      error: "Too many requests — try again in 10 minutes.",
    });

    expect(mocks.checkRateLimit).toHaveBeenCalledWith("message:user:user-admin-1", {
      limit: 20,
      windowSec: 3600,
    });
    expect(mocks.leagueMessage.create).not.toHaveBeenCalled();
    expect(mocks.sendOrBatchNotification).not.toHaveBeenCalled();
  });
});

describe("getTeamMessages", () => {
  it("rejects a non-member", async () => {
    mocks.teamMember.findFirst.mockResolvedValue(null);
    const result = await getTeamMessages({ teamId: TEAM_ID, page: 1, limit: 20 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/don't have access/i);
  });

  it("returns a member's team messages", async () => {
    mocks.leagueMessage.count.mockResolvedValue(1);
    mocks.leagueMessage.findMany.mockResolvedValue([
      {
        id: "msg-1",
        subject: "Hi",
        content: "Body",
        messageType: "MESSAGE",
        priority: "NORMAL",
        createdAt: new Date("2026-07-18T00:00:00Z"),
        sender: { name: "Coach", email: "c@example.com" },
        _count: { recipients: 3 },
      },
    ]);
    const result = await getTeamMessages({ teamId: TEAM_ID, page: 1, limit: 20 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.messages).toHaveLength(1);
      expect(result.data.messages[0].recipientCount).toBe(3);
    }
  });
});
