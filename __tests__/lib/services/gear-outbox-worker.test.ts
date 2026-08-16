import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockSendGearNotificationEmail } = vi.hoisted(() => ({
  mockPrisma: {
    notificationOutbox: { findMany: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    notificationPreference: { findMany: vi.fn() },
  },
  mockSendGearNotificationEmail: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/email/templates", () => ({
  sendGearNotificationEmail: (...args: unknown[]) => mockSendGearNotificationEmail(...args),
}));

import {
  claimDueGearOutbox,
  processGearOutbox,
  recoverStaleGearOutboxLocks,
} from "@/lib/services/gear-outbox-worker";

const row = {
  id: "coutboxxxxxxxxxxxxxxxxxxxx",
  leagueId: "cllllllllllllllllllllllll",
  recipientUserId: "cuuuuuuuuuuuuuuuuuuuuuuuu",
  recipientEmail: "member@example.com",
  eventType: "gear.reservation.approved",
  aggregateType: "RESERVATION",
  aggregateId: "crrrrrrrrrrrrrrrrrrrrrrrr",
  payload: {
    kind: "GEAR_RESERVATION",
    data: { reservationId: "crrrrrrrrrrrrrrrrrrrrrrrr" },
  },
  dedupeKey: "gear.reservation.approved:crrrrrrrrrrrrrrrrrrrrrrrr:cuuuuuuuuuuuuuuuuuuuuuuuu",
  status: "PROCESSING",
  attempts: 1,
  scheduledAt: new Date("2026-01-01T00:00:00.000Z"),
  lockedAt: new Date("2026-01-01T00:00:00.000Z"),
  lastAttemptAt: new Date("2026-01-01T00:00:00.000Z"),
  sentAt: null,
  failedAt: null,
  lastError: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("gear outbox worker", () => {
  it("recovers only stale processing locks", async () => {
    mockPrisma.notificationOutbox.updateMany.mockResolvedValue({ count: 2 });
    const now = new Date("2026-08-16T12:00:00.000Z");

    await expect(recoverStaleGearOutboxLocks(now)).resolves.toBe(2);
    expect(mockPrisma.notificationOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "PROCESSING", lockedAt: { lt: new Date("2026-08-16T11:50:00.000Z") } }),
      data: expect.objectContaining({ status: "PENDING", lockedAt: null, scheduledAt: now }),
    }));
  });

  it("claims rows with a pending-status compare-and-set before delivery", async () => {
    const now = new Date("2026-08-16T12:00:00.000Z");
    mockPrisma.notificationOutbox.findMany.mockResolvedValue([{ id: row.id }]);
    mockPrisma.notificationOutbox.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.notificationOutbox.findUnique.mockResolvedValue(row);

    await expect(claimDueGearOutbox(10, now)).resolves.toEqual([row]);
    expect(mockPrisma.notificationOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: row.id, status: "PENDING", scheduledAt: { lte: now } },
      data: expect.objectContaining({ status: "PROCESSING", lockedAt: now, attempts: { increment: 1 } }),
    }));
  });

  it("retries failed delivery without exposing recipient data in the outbox error", async () => {
    mockPrisma.notificationOutbox.updateMany
      .mockResolvedValueOnce({ count: 0 }) // stale lock recovery
      .mockResolvedValueOnce({ count: 1 }) // claim
      .mockResolvedValueOnce({ count: 1 }); // retry scheduling
    mockPrisma.notificationOutbox.findMany.mockResolvedValue([{ id: row.id }]);
    mockPrisma.notificationOutbox.findUnique.mockResolvedValue(row);
    mockPrisma.user.findUnique.mockResolvedValue({ email: "member@example.com", name: "Member" });
    mockPrisma.notificationPreference.findMany.mockResolvedValue([]);
    mockSendGearNotificationEmail.mockRejectedValue(new Error("SMTP failed for member@example.com"));

    await expect(processGearOutbox(1)).resolves.toMatchObject({ claimed: 1, retried: 1, sent: 0 });
    expect(mockPrisma.notificationOutbox.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "PENDING", lockedAt: null, lastError: "SMTP failed for [redacted]" }),
    }));
  });

  it("applies user notification preferences while delivering to the captured email address", async () => {
    mockPrisma.notificationOutbox.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.notificationOutbox.findMany.mockResolvedValue([{ id: row.id }]);
    mockPrisma.notificationOutbox.findUnique.mockResolvedValue(row);
    mockPrisma.user.findUnique.mockResolvedValue({ email: "new-address@example.com", name: "Member" });
    mockPrisma.notificationPreference.findMany.mockResolvedValue([{
      leagueId: null,
      leagueMessages: true,
      leagueAnnouncements: true,
      eventNotifications: true,
      rsvpReminders: true,
      teamInvitations: true,
      practicePlanNotifications: true,
      gearNotifications: false,
      emailEnabled: true,
      urgentOnly: false,
      batchDelivery: false,
    }]);

    await expect(processGearOutbox(1)).resolves.toMatchObject({ claimed: 1, suppressed: 1, sent: 0 });

    expect(mockSendGearNotificationEmail).not.toHaveBeenCalled();
    expect(mockPrisma.notificationOutbox.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "SENT", lastError: "suppressed by notification preference" }),
    }));
  });
});
