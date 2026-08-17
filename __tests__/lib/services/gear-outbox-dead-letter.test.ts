import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireLeagueRole: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn(),
  updateMany: vi.fn(),
  create: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    notificationOutbox: {
      findMany: mocks.findMany,
      findFirst: mocks.findFirst,
      count: mocks.count,
      updateMany: mocks.updateMany,
      create: mocks.create,
    },
    auditLog: { create: mocks.auditCreate },
  },
}));
vi.mock("@/lib/auth/session", () => ({
  requireLeagueRole: (...args: unknown[]) => mocks.requireLeagueRole(...args),
}));

import {
  inspectGearDeadLetters,
  redriveGearDeadLetters,
  replayGearNotification,
} from "@/lib/services/gear-outbox-dead-letter";

const LEAGUE = "cllllllllllllllllllllllll";
const ADMIN = "cuuuuuuuuuuuuuuuuuuuuuuuu";
const RESERVATION = "crrrrrrrrrrrrrrrrrrrrrrrr";

function deadLetter(overrides: Record<string, unknown> = {}) {
  return {
    id: "coutboxxxxxxxxxxxxxxxxxxxx",
    leagueId: LEAGUE,
    recipientUserId: ADMIN,
    recipientEmail: "member@example.com",
    eventType: "gear.reservation.approved",
    aggregateType: "RESERVATION",
    aggregateId: RESERVATION,
    payload: { kind: "GEAR_RESERVATION", data: { reservationId: RESERVATION } },
    dedupeKey: `gear.reservation.approved:${RESERVATION}:approved:user:${ADMIN}`,
    status: "FAILED",
    attempts: 5,
    scheduledAt: new Date("2026-08-16T00:00:00.000Z"),
    lockedAt: null,
    lastAttemptAt: new Date("2026-08-16T06:00:00.000Z"),
    sentAt: null,
    failedAt: new Date("2026-08-16T06:00:00.000Z"),
    lastError: "SMTP failed for [redacted]",
    createdAt: new Date("2026-08-15T00:00:00.000Z"),
    updatedAt: new Date("2026-08-16T06:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.requireLeagueRole.mockResolvedValue(ADMIN);
  mocks.auditCreate.mockResolvedValue({ id: "cauditxxxxxxxxxxxxxxxxxxxx" });
  mocks.count.mockResolvedValue(0);
});

describe("gear dead-letter inspection", () => {
  it("requires league administration before reading anything", async () => {
    mocks.requireLeagueRole.mockRejectedValue(new Error("Forbidden"));

    await expect(inspectGearDeadLetters({ leagueId: LEAGUE })).rejects.toThrow("Forbidden");
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("scopes the query to gear failures in the caller's league", async () => {
    mocks.findMany.mockResolvedValue([]);

    await inspectGearDeadLetters({ leagueId: LEAGUE });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { leagueId: LEAGUE, status: "FAILED", eventType: { startsWith: "gear." } },
    }));
  });

  it("masks recipient addresses and reports remaining attempts", async () => {
    mocks.findMany.mockResolvedValue([deadLetter()]);
    mocks.count.mockResolvedValue(1);

    const page = await inspectGearDeadLetters({ leagueId: LEAGUE });

    expect(page.entries[0]).toMatchObject({
      recipient: "m*****@example.com",
      attempts: 5,
      attemptsRemaining: 0,
      deliverable: true,
      lastError: "SMTP failed for [redacted]",
    });
    expect(page.total).toBe(1);
    expect(page.undeliverable).toBe(0);
  });

  it("flags a row that can never be delivered as written", async () => {
    mocks.findMany.mockResolvedValue([deadLetter({ eventType: "gear.reservation.teleported" })]);
    mocks.count.mockResolvedValue(1);

    const page = await inspectGearDeadLetters({ leagueId: LEAGUE });
    expect(page.entries[0]).toMatchObject({ deliverable: false });
    expect(page.entries[0].contractViolation).toContain("UNKNOWN_EVENT_TYPE");
    expect(page.undeliverable).toBe(1);
  });

  it("audits the inspection", async () => {
    mocks.findMany.mockResolvedValue([deadLetter()]);
    mocks.count.mockResolvedValue(1);

    await inspectGearDeadLetters({ leagueId: LEAGUE });
    expect(mocks.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "gear.outbox.dead_letter.inspected",
        userId: ADMIN,
        leagueId: LEAGUE,
      }),
    }));
  });

  it("returns the page even when the audit write fails", async () => {
    mocks.findMany.mockResolvedValue([deadLetter()]);
    mocks.count.mockResolvedValue(1);
    mocks.auditCreate.mockRejectedValue(new Error("audit table unavailable"));

    await expect(inspectGearDeadLetters({ leagueId: LEAGUE })).resolves.toMatchObject({ total: 1 });
  });
});

describe("gear dead-letter redrive", () => {
  it("returns a failed message to the queue with a fresh attempt budget", async () => {
    mocks.findMany.mockResolvedValue([deadLetter()]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    const now = new Date("2026-08-17T00:00:00.000Z");

    await expect(redriveGearDeadLetters({
      leagueId: LEAGUE,
      outboxIds: ["coutboxxxxxxxxxxxxxxxxxxxx"],
      reason: "provider outage resolved",
      now,
    })).resolves.toMatchObject({
      redriven: 1,
      outcomes: [{ id: "coutboxxxxxxxxxxxxxxxxxxxx", outcome: "REDRIVEN" }],
    });

    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "coutboxxxxxxxxxxxxxxxxxxxx", status: "FAILED" },
      data: expect.objectContaining({ status: "PENDING", attempts: 0, failedAt: null, scheduledAt: now }),
    }));
  });

  it("keeps the failure history in the audit trail", async () => {
    mocks.findMany.mockResolvedValue([deadLetter()]);
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await redriveGearDeadLetters({
      leagueId: LEAGUE,
      outboxIds: ["coutboxxxxxxxxxxxxxxxxxxxx"],
      reason: "provider outage resolved",
    });

    expect(mocks.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "gear.outbox.dead_letter.redriven",
        details: expect.objectContaining({
          previousAttempts: 5,
          previousError: "SMTP failed for [redacted]",
          reason: "provider outage resolved",
        }),
      }),
    }));
  });

  it("reports an id from another league as not found", async () => {
    mocks.findMany.mockResolvedValue([]);

    await expect(redriveGearDeadLetters({
      leagueId: LEAGUE,
      outboxIds: ["cotherleaguexxxxxxxxxxxxxx"],
    })).resolves.toMatchObject({
      redriven: 0,
      outcomes: [{ id: "cotherleaguexxxxxxxxxxxxxx", outcome: "NOT_FOUND" }],
    });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to requeue a message that violates the event contract", async () => {
    mocks.findMany.mockResolvedValue([deadLetter({ eventType: "gear.reservation.teleported" })]);

    const result = await redriveGearDeadLetters({
      leagueId: LEAGUE,
      outboxIds: ["coutboxxxxxxxxxxxxxxxxxxxx"],
    });

    expect(result.redriven).toBe(0);
    expect(result.outcomes[0]).toMatchObject({ outcome: "UNDELIVERABLE_CONTRACT" });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to requeue a message that is not dead-lettered", async () => {
    mocks.findMany.mockResolvedValue([deadLetter({ status: "SENT" })]);

    const result = await redriveGearDeadLetters({
      leagueId: LEAGUE,
      outboxIds: ["coutboxxxxxxxxxxxxxxxxxxxx"],
    });

    expect(result.outcomes[0]).toMatchObject({ outcome: "NOT_DEAD_LETTERED", detail: "SENT" });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("treats a row claimed concurrently as no longer dead-lettered", async () => {
    mocks.findMany.mockResolvedValue([deadLetter()]);
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const result = await redriveGearDeadLetters({
      leagueId: LEAGUE,
      outboxIds: ["coutboxxxxxxxxxxxxxxxxxxxx"],
    });

    expect(result.redriven).toBe(0);
    expect(result.outcomes[0]).toMatchObject({ outcome: "NOT_DEAD_LETTERED", detail: "changed concurrently" });
  });
});

describe("gear notification replay", () => {
  it("creates a new row with a suffixed dedupe key rather than reusing the original", async () => {
    mocks.findFirst.mockResolvedValue(deadLetter());
    mocks.count.mockResolvedValue(1);
    mocks.create.mockResolvedValue({ id: "creplayxxxxxxxxxxxxxxxxxxx" });

    await expect(replayGearNotification({
      leagueId: LEAGUE,
      outboxId: "coutboxxxxxxxxxxxxxxxxxxxx",
      reason: "recipient reported never receiving it",
    })).resolves.toMatchObject({
      replayedFrom: "coutboxxxxxxxxxxxxxxxxxxxx",
      outboxId: "creplayxxxxxxxxxxxxxxxxxxx",
      dedupeKey: `gear.reservation.approved:${RESERVATION}:approved:user:${ADMIN}:replay:2`,
    });

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "PENDING", recipientEmail: "member@example.com" }),
    }));
  });

  it("masks an address inherited from a legacy dedupe key before returning it", async () => {
    // Rows enqueued before identities were digested still carry the address in
    // their key, and a replay inherits it. It must not reach the operator.
    mocks.findFirst.mockResolvedValue(
      deadLetter({
        recipientUserId: null,
        recipientEmail: "donor@example.com",
        dedupeKey: `gear.reservation.approved:${RESERVATION}:approved:donor@example.com`,
      }),
    );
    mocks.count.mockResolvedValue(0);
    mocks.create.mockResolvedValue({ id: "creplayxxxxxxxxxxxxxxxxxxx" });

    const result = await replayGearNotification({
      leagueId: LEAGUE,
      outboxId: "coutboxxxxxxxxxxxxxxxxxxxx",
      reason: "operator request",
    });

    expect(result.dedupeKey).not.toContain("@");
    expect(result.dedupeKey).not.toContain("donor");
    // The row itself keeps the real key, or the replay would not stay unique.
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dedupeKey: `gear.reservation.approved:${RESERVATION}:approved:donor@example.com:replay:1`,
        }),
      }),
    );
  });

  it("refuses to replay a message from another league", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(replayGearNotification({
      leagueId: LEAGUE,
      outboxId: "cotherleaguexxxxxxxxxxxxxx",
      reason: "operator request",
    })).rejects.toThrow("Notification not found in this league");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("refuses to replay a message that violates the event contract", async () => {
    mocks.findFirst.mockResolvedValue(deadLetter({ eventType: "gear.reservation.teleported" }));

    await expect(replayGearNotification({
      leagueId: LEAGUE,
      outboxId: "coutboxxxxxxxxxxxxxxxxxxxx",
      reason: "operator request",
    })).rejects.toThrow(/cannot be replayed/);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("records what it replayed and why", async () => {
    mocks.findFirst.mockResolvedValue(deadLetter());
    mocks.create.mockResolvedValue({ id: "creplayxxxxxxxxxxxxxxxxxxx" });

    await replayGearNotification({
      leagueId: LEAGUE,
      outboxId: "coutboxxxxxxxxxxxxxxxxxxxx",
      reason: "recipient reported never receiving it",
    });

    expect(mocks.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "gear.outbox.dead_letter.replayed",
        resourceId: "creplayxxxxxxxxxxxxxxxxxxx",
        details: expect.objectContaining({
          replayedFrom: "coutboxxxxxxxxxxxxxxxxxxxx",
          reason: "recipient reported never receiving it",
        }),
      }),
    }));
  });
});
