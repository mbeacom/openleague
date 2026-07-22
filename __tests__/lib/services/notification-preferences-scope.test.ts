/**
 * Structural regression tests for the scope-aware upsert in NotificationService
 * (Track 2). The global (leagueId=null) path must NOT go through
 * prisma.upsert(): leagueId is nullable and part of the @@unique constraint, so
 * Prisma rejects null in the compound-unique `where` at query build. A Prisma
 * mock can't reproduce that runtime validation error, so these tests assert the
 * QUERY SHAPE instead — proving the null branch uses findFirst + create/update.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NotificationService } from "@/lib/services/notification";
import { prisma } from "@/lib/db/prisma";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    notificationPreference: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const service = new NotificationService();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateNotificationPreferences scope handling", () => {
  it("global scope (no leagueId) never calls upsert; updates existing row by id", async () => {
    vi.mocked(prisma.notificationPreference.findFirst).mockResolvedValue({ id: "pref-1" } as never);

    await service.updateNotificationPreferences("user-1", { emailEnabled: false });

    expect(prisma.notificationPreference.upsert).not.toHaveBeenCalled();
    expect(prisma.notificationPreference.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", leagueId: null },
      select: { id: true },
    });
    expect(prisma.notificationPreference.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pref-1" } })
    );
    expect(prisma.notificationPreference.create).not.toHaveBeenCalled();
  });

  it("global scope creates a leagueId=null row when none exists", async () => {
    vi.mocked(prisma.notificationPreference.findFirst).mockResolvedValue(null);

    await service.updateNotificationPreferences("user-1", { rsvpReminders: false });

    expect(prisma.notificationPreference.upsert).not.toHaveBeenCalled();
    expect(prisma.notificationPreference.create).toHaveBeenCalledTimes(1);
    const createArg = vi.mocked(prisma.notificationPreference.create).mock.calls[0][0];
    expect(createArg.data).toMatchObject({ userId: "user-1", leagueId: null, rsvpReminders: false });
    expect(typeof createArg.data.unsubscribeToken).toBe("string");
  });

  it("league scope uses the atomic compound-unique upsert with a string leagueId", async () => {
    vi.mocked(prisma.notificationPreference.upsert).mockResolvedValue({} as never);

    await service.updateNotificationPreferences("user-1", { emailEnabled: false }, "league-a");

    expect(prisma.notificationPreference.findFirst).not.toHaveBeenCalled();
    expect(prisma.notificationPreference.upsert).toHaveBeenCalledTimes(1);
    const upsertArg = vi.mocked(prisma.notificationPreference.upsert).mock.calls[0][0];
    expect(upsertArg.where).toEqual({ userId_leagueId: { userId: "user-1", leagueId: "league-a" } });
  });
});

describe("generateUnsubscribeToken scope handling", () => {
  it("global scope avoids upsert and returns a token", async () => {
    vi.mocked(prisma.notificationPreference.findFirst).mockResolvedValue({ id: "pref-1" } as never);

    const token = await service.generateUnsubscribeToken("user-1");

    expect(prisma.notificationPreference.upsert).not.toHaveBeenCalled();
    expect(prisma.notificationPreference.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pref-1" } })
    );
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("league scope uses upsert with a string leagueId", async () => {
    vi.mocked(prisma.notificationPreference.upsert).mockResolvedValue({} as never);

    await service.generateUnsubscribeToken("user-1", "league-a");

    expect(prisma.notificationPreference.findFirst).not.toHaveBeenCalled();
    const upsertArg = vi.mocked(prisma.notificationPreference.upsert).mock.calls[0][0];
    expect(upsertArg.where).toEqual({ userId_leagueId: { userId: "user-1", leagueId: "league-a" } });
  });
});
