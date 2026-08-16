import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { queueGearCustodyReminders, processGearOutbox } = vi.hoisted(() => ({
  queueGearCustodyReminders: vi.fn(),
  processGearOutbox: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: { CRON_SECRET: "12345678901234567890123456789012" },
}));
vi.mock("@/lib/services/gear-reminders", () => ({
  queueGearCustodyReminders: (...args: unknown[]) => queueGearCustodyReminders(...args),
}));
vi.mock("@/lib/services/gear-outbox-worker", () => ({
  processGearOutbox: (...args: unknown[]) => processGearOutbox(...args),
}));

import { GET } from "@/app/api/cron/gear-notifications/route";

describe("gear notification cron", () => {
  it("rejects requests without the configured bearer secret", async () => {
    const response = await GET(new NextRequest("http://localhost/api/cron/gear-notifications"));
    expect(response.status).toBe(401);
    expect(queueGearCustodyReminders).not.toHaveBeenCalled();
  });

  it("queues reminders before processing the durable outbox", async () => {
    queueGearCustodyReminders.mockResolvedValue({ dueSoon: 1, overdue: 2 });
    processGearOutbox.mockResolvedValue({ claimed: 3, sent: 3, retried: 0, deadLettered: 0, suppressed: 0, recoveredLocks: 0 });

    const response = await GET(new NextRequest("http://localhost/api/cron/gear-notifications", {
      headers: { authorization: "Bearer 12345678901234567890123456789012" },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, reminders: { dueSoon: 1, overdue: 2 } });
    expect(queueGearCustodyReminders.mock.invocationCallOrder[0]).toBeLessThan(
      processGearOutbox.mock.invocationCallOrder[0],
    );
  });
});
