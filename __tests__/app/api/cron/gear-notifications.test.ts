import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  queueGearCustodyReminders,
  cancelStaleGearCustodyReminders,
  processGearOutbox,
  getGearOutboxHealth,
} = vi.hoisted(() => ({
  queueGearCustodyReminders: vi.fn(),
  cancelStaleGearCustodyReminders: vi.fn(),
  processGearOutbox: vi.fn(),
  getGearOutboxHealth: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: { CRON_SECRET: "12345678901234567890123456789012" },
}));
vi.mock("@/lib/services/gear-reminders", () => ({
  queueGearCustodyReminders: (...args: unknown[]) => queueGearCustodyReminders(...args),
  cancelStaleGearCustodyReminders: (...args: unknown[]) => cancelStaleGearCustodyReminders(...args),
}));
vi.mock("@/lib/services/gear-outbox-worker", () => ({
  processGearOutbox: (...args: unknown[]) => processGearOutbox(...args),
  getGearOutboxHealth: (...args: unknown[]) => getGearOutboxHealth(...args),
}));

import { GET } from "@/app/api/cron/gear-notifications/route";

const AUTHORIZED = new NextRequest("http://localhost/api/cron/gear-notifications", {
  headers: { authorization: "Bearer 12345678901234567890123456789012" },
});

const HEALTH = {
  pending: 0,
  processing: 0,
  deadLettered: 0,
  oldestPendingAgeMs: null,
  backlogged: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  cancelStaleGearCustodyReminders.mockResolvedValue({ inspected: 0, canceled: 0 });
  queueGearCustodyReminders.mockResolvedValue({ dueSoon: 1, overdue: 2, failed: 0, scanned: 3, truncated: false });
  processGearOutbox.mockResolvedValue({
    claimed: 3,
    sent: 3,
    digested: 0,
    retried: 0,
    deadLettered: 0,
    rejected: 0,
    suppressed: 0,
    recoveredLocks: 0,
    skippedForOrdering: 0,
  });
  getGearOutboxHealth.mockResolvedValue(HEALTH);
});

describe("gear notification cron", () => {
  it("rejects requests without the configured bearer secret", async () => {
    const response = await GET(new NextRequest("http://localhost/api/cron/gear-notifications"));
    expect(response.status).toBe(401);
    expect(queueGearCustodyReminders).not.toHaveBeenCalled();
  });

  it("queues reminders before processing the durable outbox", async () => {
    const response = await GET(AUTHORIZED);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      reminders: { dueSoon: 1, overdue: 2 },
      health: HEALTH,
    });
    expect(queueGearCustodyReminders.mock.invocationCallOrder[0]).toBeLessThan(
      processGearOutbox.mock.invocationCallOrder[0],
    );
  });

  it("retires stale reminders before queueing new ones", async () => {
    await GET(AUTHORIZED);
    expect(cancelStaleGearCustodyReminders.mock.invocationCallOrder[0]).toBeLessThan(
      queueGearCustodyReminders.mock.invocationCallOrder[0],
    );
  });

  it("still drains the outbox when reminder materialization fails", async () => {
    queueGearCustodyReminders.mockRejectedValue(new Error("reservation scan timed out"));

    const response = await GET(AUTHORIZED);

    expect(response.status).toBe(200);
    expect(processGearOutbox).toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      reminders: null,
      errors: [{ stage: "queue-reminders", error: "reservation scan timed out" }],
    });
  });

  it("still queues reminders when delivery fails", async () => {
    processGearOutbox.mockRejectedValue(new Error("provider unavailable"));

    const response = await GET(AUTHORIZED);

    expect(response.status).toBe(200);
    expect(queueGearCustodyReminders).toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      delivery: null,
      errors: [{ stage: "deliver-outbox" }],
    });
  });

  it("fails the run only when every stage fails", async () => {
    cancelStaleGearCustodyReminders.mockRejectedValue(new Error("down"));
    queueGearCustodyReminders.mockRejectedValue(new Error("down"));
    processGearOutbox.mockRejectedValue(new Error("down"));

    const response = await GET(AUTHORIZED);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "Gear notification processing failed",
    });
  });

  it("reports a backlog without failing the run", async () => {
    getGearOutboxHealth.mockResolvedValue({ ...HEALTH, pending: 900, backlogged: true });

    const response = await GET(AUTHORIZED);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      health: { backlogged: true, pending: 900 },
    });
  });
});
