import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockSendGearNotificationEmail } = vi.hoisted(() => ({
  mockPrisma: {
    notificationOutbox: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    user: { findUnique: vi.fn() },
    notificationPreference: { findMany: vi.fn() },
    notificationBatch: { findFirst: vi.fn(), create: vi.fn() },
    batchedMessage: { create: vi.fn() },
  },
  mockSendGearNotificationEmail: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/email/templates", () => ({
  sendGearNotificationEmail: (...args: unknown[]) => mockSendGearNotificationEmail(...args),
  sendLeagueMessageEmail: vi.fn(),
}));

import {
  claimDueGearOutbox,
  getGearOutboxHealth,
  processGearOutbox,
  recoverStaleGearOutboxLocks,
  sanitizeFailure,
} from "@/lib/services/gear-outbox-worker";
import { anonymousRecipientDigest } from "@/lib/services/gear-recipient-identity";

const DONOR_EMAIL = "donor@example.com";
const DONOR_KEY = `gear.pledge.acknowledged:crrrrrrrrrrrrrrrrrrrrrrrr:acknowledged:anon:${anonymousRecipientDigest(DONOR_EMAIL)}`;

const row = {
  id: "coutboxxxxxxxxxxxxxxxxxxxx",
  leagueId: "cllllllllllllllllllllllll",
  recipientUserId: "cuuuuuuuuuuuuuuuuuuuuuuuu",
  recipientEmail: "member@example.com",
  recipientRedactedAt: null as Date | null,
  eventType: "gear.reservation.approved",
  aggregateType: "RESERVATION",
  aggregateId: "crrrrrrrrrrrrrrrrrrrrrrrr",
  payload: {
    kind: "GEAR_RESERVATION",
    data: { reservationId: "crrrrrrrrrrrrrrrrrrrrrrrr" },
  },
  dedupeKey:
    "gear.reservation.approved:crrrrrrrrrrrrrrrrrrrrrrrr:approved:user:cuuuuuuuuuuuuuuuuuuuuuuuu",
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

const candidate = {
  id: row.id,
  leagueId: row.leagueId,
  aggregateType: row.aggregateType,
  aggregateId: row.aggregateId,
  recipientUserId: row.recipientUserId,
  recipientEmail: row.recipientEmail,
  eventType: row.eventType,
  createdAt: row.createdAt,
};

const gearPrefixFilter = { startsWith: "gear." };

function preference(overrides: Record<string, unknown> = {}) {
  return {
    leagueId: null,
    leagueMessages: true,
    leagueAnnouncements: true,
    eventNotifications: true,
    rsvpReminders: true,
    teamInvitations: true,
    practicePlanNotifications: true,
    gearNotifications: true,
    emailEnabled: true,
    urgentOnly: false,
    batchDelivery: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockPrisma.notificationOutbox.findFirst.mockResolvedValue(null);
  mockPrisma.user.findUnique.mockResolvedValue({ name: "Member" });
  mockPrisma.notificationPreference.findMany.mockResolvedValue([]);
});

describe("gear outbox worker", () => {
  it("recovers only stale processing locks", async () => {
    mockPrisma.notificationOutbox.updateMany.mockResolvedValue({ count: 2 });
    const now = new Date("2026-08-16T12:00:00.000Z");

    await expect(recoverStaleGearOutboxLocks(now)).resolves.toBe(2);
    expect(mockPrisma.notificationOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        eventType: gearPrefixFilter,
        status: "PROCESSING",
        lockedAt: { lt: new Date("2026-08-16T11:50:00.000Z") },
      }),
      data: expect.objectContaining({ status: "PENDING", lockedAt: null, scheduledAt: now }),
    }));
  });

  it("claims rows with a pending-status compare-and-set before delivery", async () => {
    const now = new Date("2026-08-16T12:00:00.000Z");
    mockPrisma.notificationOutbox.findMany.mockResolvedValue([candidate]);
    mockPrisma.notificationOutbox.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.notificationOutbox.findUnique.mockResolvedValue(row);

    await expect(claimDueGearOutbox(10, now)).resolves.toEqual({ rows: [row], skippedForOrdering: 0 });
    expect(mockPrisma.notificationOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: row.id,
        eventType: gearPrefixFilter,
        status: "PENDING",
        scheduledAt: { lte: now },
      }),
      data: expect.objectContaining({ status: "PROCESSING", lockedAt: now, attempts: { increment: 1 } }),
    }));
  });

  it("leaves a message pending when an earlier one for the same recipient and aggregate is unfinished", async () => {
    const now = new Date("2026-08-16T12:00:00.000Z");
    mockPrisma.notificationOutbox.findMany.mockResolvedValue([candidate]);
    mockPrisma.notificationOutbox.findFirst.mockResolvedValue({ id: "cpredecessorxxxxxxxxxxxxxx" });

    await expect(claimDueGearOutbox(10, now)).resolves.toEqual({ rows: [], skippedForOrdering: 1 });
    expect(mockPrisma.notificationOutbox.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.notificationOutbox.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        eventType: gearPrefixFilter,
        aggregateId: row.aggregateId,
        recipientUserId: row.recipientUserId,
        status: { in: ["PENDING", "PROCESSING"] },
        createdAt: { lt: row.createdAt },
      }),
    }));
  });

  it("claims at most one message per recipient and aggregate in a single run", async () => {
    const now = new Date("2026-08-16T12:00:00.000Z");
    const successor = { ...candidate, id: "csuccessorxxxxxxxxxxxxxxxx", createdAt: new Date("2026-01-01T00:05:00.000Z") };
    mockPrisma.notificationOutbox.findMany.mockResolvedValue([candidate, successor]);
    mockPrisma.notificationOutbox.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.notificationOutbox.findUnique.mockResolvedValue(row);

    const claim = await claimDueGearOutbox(10, now);
    expect(claim.rows).toHaveLength(1);
    expect(claim.skippedForOrdering).toBe(1);
  });

  it("orders unauthenticated recipients by their captured address", async () => {
    const now = new Date("2026-08-16T12:00:00.000Z");
    mockPrisma.notificationOutbox.findMany.mockResolvedValue([
      { ...candidate, recipientUserId: null, recipientEmail: "donor@example.com" },
    ]);
    mockPrisma.notificationOutbox.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.notificationOutbox.findUnique.mockResolvedValue(row);

    await claimDueGearOutbox(10, now);
    expect(mockPrisma.notificationOutbox.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ recipientUserId: null, recipientEmail: "donor@example.com" }),
    }));
  });

  it("retries failed delivery without exposing recipient data in the outbox error", async () => {
    mockPrisma.notificationOutbox.updateMany
      .mockResolvedValueOnce({ count: 0 }) // stale lock recovery
      .mockResolvedValueOnce({ count: 1 }) // claim
      .mockResolvedValueOnce({ count: 1 }); // retry scheduling
    mockPrisma.notificationOutbox.findMany.mockResolvedValue([candidate]);
    mockPrisma.notificationOutbox.findUnique.mockResolvedValue(row);
    mockSendGearNotificationEmail.mockRejectedValue(new Error("SMTP failed for member@example.com"));

    await expect(processGearOutbox(1)).resolves.toMatchObject({ claimed: 1, retried: 1, sent: 0 });
    expect(mockPrisma.notificationOutbox.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "PENDING", lockedAt: null, lastError: "SMTP failed for [redacted]" }),
    }));
  });

  it("cancels a message the recipient opted out of instead of recording it as sent", async () => {
    mockPrisma.notificationOutbox.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.notificationOutbox.findMany.mockResolvedValue([candidate]);
    mockPrisma.notificationOutbox.findUnique.mockResolvedValue(row);
    mockPrisma.notificationPreference.findMany.mockResolvedValue([preference({ gearNotifications: false })]);

    await expect(processGearOutbox(1)).resolves.toMatchObject({ claimed: 1, suppressed: 1, sent: 0 });

    expect(mockSendGearNotificationEmail).not.toHaveBeenCalled();
    expect(mockPrisma.notificationOutbox.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "CANCELED",
        lastError: "suppressed: CATEGORY_DISABLED",
      }),
    }));
  });

  it("never delivers to a redacted recipient", async () => {
    mockPrisma.notificationOutbox.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.notificationOutbox.findMany.mockResolvedValue([candidate]);
    mockPrisma.notificationOutbox.findUnique.mockResolvedValue({
      ...row,
      recipientRedactedAt: new Date("2026-02-01T00:00:00.000Z"),
    });

    await expect(processGearOutbox(1)).resolves.toMatchObject({ suppressed: 1, sent: 0 });
    expect(mockSendGearNotificationEmail).not.toHaveBeenCalled();
    expect(mockPrisma.notificationOutbox.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "CANCELED", lastError: "suppressed: RECIPIENT_REDACTED" }),
    }));
  });

  it("never delivers an account-addressed row whose account was deleted", async () => {
    // `recipientUser` is `onDelete: SetNull`, so deletion leaves a row that
    // looks account-less while keeping the captured address. It must not be
    // mistaken for a donor and emailed that snapshot.
    mockPrisma.notificationOutbox.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.notificationOutbox.findMany.mockResolvedValue([
      { ...candidate, recipientUserId: null },
    ]);
    mockPrisma.notificationOutbox.findUnique.mockResolvedValue({
      ...row,
      recipientUserId: null,
      // dedupeKey still names the original account, recording the addressing.
    });

    await expect(processGearOutbox(1)).resolves.toMatchObject({ suppressed: 1, sent: 0 });
    expect(mockSendGearNotificationEmail).not.toHaveBeenCalled();
    expect(mockPrisma.notificationOutbox.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "CANCELED",
        lastError: "suppressed: RECIPIENT_UNAVAILABLE",
      }),
    }));
  });

  it("never delivers when the addressed account row has vanished", async () => {
    mockPrisma.notificationOutbox.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.notificationOutbox.findMany.mockResolvedValue([candidate]);
    mockPrisma.notificationOutbox.findUnique.mockResolvedValue(row);
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(processGearOutbox(1)).resolves.toMatchObject({ suppressed: 1, sent: 0 });
    expect(mockSendGearNotificationEmail).not.toHaveBeenCalled();
    expect(mockPrisma.notificationOutbox.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lastError: "suppressed: RECIPIENT_UNAVAILABLE" }),
    }));
  });

  it("does not consult preferences for a deleted account", async () => {
    mockPrisma.notificationOutbox.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.notificationOutbox.findMany.mockResolvedValue([
      { ...candidate, recipientUserId: null },
    ]);
    mockPrisma.notificationOutbox.findUnique.mockResolvedValue({ ...row, recipientUserId: null });

    await processGearOutbox(1);
    expect(mockPrisma.notificationPreference.findMany).not.toHaveBeenCalled();
  });

  it("still delivers to a donor address that never had an account", async () => {
    // Same null `recipientUserId` as a deleted account, but the dedupe key
    // records that this row was addressed to a bare address from the start.
    const donorRow = {
      ...row,
      recipientUserId: null,
      recipientEmail: DONOR_EMAIL,
      dedupeKey: DONOR_KEY,
      eventType: "gear.pledge.acknowledged",
      aggregateType: "PLEDGE",
      payload: { kind: "GEAR_PLEDGE", data: { pledgeId: "crrrrrrrrrrrrrrrrrrrrrrrr" } },
    };
    mockPrisma.notificationOutbox.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.notificationOutbox.findMany.mockResolvedValue([
      { ...candidate, recipientUserId: null, recipientEmail: DONOR_EMAIL },
    ]);
    mockPrisma.notificationOutbox.findUnique.mockResolvedValue(donorRow);
    mockSendGearNotificationEmail.mockResolvedValue(undefined);

    await expect(processGearOutbox(1)).resolves.toMatchObject({ sent: 1, suppressed: 0 });
    expect(mockSendGearNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: DONOR_EMAIL }),
    );
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("still delivers a donor row enqueued before dedupe keys were digested", async () => {
    // In-flight rows written by the previous format must keep working until the
    // backfill runs; their identity segment is the address itself.
    const legacyRow = {
      ...row,
      recipientUserId: null,
      recipientEmail: DONOR_EMAIL,
      dedupeKey: `gear.pledge.acknowledged:crrrrrrrrrrrrrrrrrrrrrrrr:acknowledged:${DONOR_EMAIL}`,
      eventType: "gear.pledge.acknowledged",
      aggregateType: "PLEDGE",
      payload: { kind: "GEAR_PLEDGE", data: { pledgeId: "crrrrrrrrrrrrrrrrrrrrrrrr" } },
    };
    mockPrisma.notificationOutbox.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.notificationOutbox.findMany.mockResolvedValue([
      { ...candidate, recipientUserId: null, recipientEmail: DONOR_EMAIL },
    ]);
    mockPrisma.notificationOutbox.findUnique.mockResolvedValue(legacyRow);
    mockSendGearNotificationEmail.mockResolvedValue(undefined);

    await expect(processGearOutbox(1)).resolves.toMatchObject({ sent: 1, suppressed: 0 });
  });

  it("keeps a replayed donor row externally addressed", async () => {
    const donorRow = {
      ...row,
      recipientUserId: null,
      recipientEmail: DONOR_EMAIL,
      dedupeKey: `${DONOR_KEY}:replay:2`,
      eventType: "gear.pledge.acknowledged",
      aggregateType: "PLEDGE",
      payload: { kind: "GEAR_PLEDGE", data: { pledgeId: "crrrrrrrrrrrrrrrrrrrrrrrr" } },
    };
    mockPrisma.notificationOutbox.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.notificationOutbox.findMany.mockResolvedValue([
      { ...candidate, recipientUserId: null, recipientEmail: DONOR_EMAIL },
    ]);
    mockPrisma.notificationOutbox.findUnique.mockResolvedValue(donorRow);
    mockSendGearNotificationEmail.mockResolvedValue(undefined);

    await expect(processGearOutbox(1)).resolves.toMatchObject({ sent: 1, suppressed: 0 });
  });

  it("suppresses a redacted row before considering how it was addressed", async () => {
    mockPrisma.notificationOutbox.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.notificationOutbox.findMany.mockResolvedValue([
      { ...candidate, recipientUserId: null, recipientEmail: DONOR_EMAIL },
    ]);
    mockPrisma.notificationOutbox.findUnique.mockResolvedValue({
      ...row,
      recipientUserId: null,
      recipientEmail: DONOR_EMAIL,
      dedupeKey: DONOR_KEY,
      recipientRedactedAt: new Date("2026-02-01T00:00:00.000Z"),
    });

    await expect(processGearOutbox(1)).resolves.toMatchObject({ suppressed: 1, sent: 0 });
    expect(mockSendGearNotificationEmail).not.toHaveBeenCalled();
    expect(mockPrisma.notificationOutbox.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lastError: "suppressed: RECIPIENT_REDACTED" }),
    }));
  });

  it("delivers to the captured address with registry copy, not the payload", async () => {    mockPrisma.notificationOutbox.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.notificationOutbox.findMany.mockResolvedValue([candidate]);
    mockPrisma.notificationOutbox.findUnique.mockResolvedValue(row);
    mockSendGearNotificationEmail.mockResolvedValue(undefined);

    await expect(processGearOutbox(1)).resolves.toMatchObject({ sent: 1, digested: 0 });
    expect(mockSendGearNotificationEmail).toHaveBeenCalledWith({
      email: "member@example.com",
      name: "Member",
      leagueId: row.leagueId,
      copy: { subject: "Gear reservation approved", body: expect.stringContaining("approved") },
    });
  });

  it("routes a batching recipient to the digest and counts it separately", async () => {
    mockPrisma.notificationOutbox.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.notificationOutbox.findMany.mockResolvedValue([candidate]);
    mockPrisma.notificationOutbox.findUnique.mockResolvedValue(row);
    mockPrisma.notificationPreference.findMany.mockResolvedValue([preference({ batchDelivery: true })]);
    mockPrisma.notificationBatch.findFirst.mockResolvedValue({ id: "cbatchxxxxxxxxxxxxxxxxxxxx" });
    mockPrisma.batchedMessage.create.mockResolvedValue({ id: "cmsgxxxxxxxxxxxxxxxxxxxxxx" });

    await expect(processGearOutbox(1)).resolves.toMatchObject({ sent: 1, digested: 1 });
    expect(mockSendGearNotificationEmail).not.toHaveBeenCalled();
    expect(mockPrisma.batchedMessage.create).toHaveBeenCalled();
  });

  it("sends an overdue custody notice past both digest batching and urgent-only", async () => {
    mockPrisma.notificationOutbox.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.notificationOutbox.findMany.mockResolvedValue([candidate]);
    mockPrisma.notificationOutbox.findUnique.mockResolvedValue({
      ...row,
      eventType: "gear.reservation.overdue",
      payload: { kind: "GEAR_RESERVATION", data: { reservationId: row.aggregateId, dueDate: "2026-08-10" } },
    });
    mockPrisma.notificationPreference.findMany.mockResolvedValue([
      preference({ batchDelivery: true, urgentOnly: true }),
    ]);
    mockSendGearNotificationEmail.mockResolvedValue(undefined);

    await expect(processGearOutbox(1)).resolves.toMatchObject({ sent: 1, digested: 0, suppressed: 0 });
    expect(mockSendGearNotificationEmail).toHaveBeenCalled();
  });

  it("dead-letters an unknown persisted event immediately instead of retrying it", async () => {
    mockPrisma.notificationOutbox.updateMany.mockResolvedValue({ count: 1 });
    const unknownCandidate = {
      ...candidate,
      eventType: "gear.reservation.teleported",
    };
    mockPrisma.notificationOutbox.findMany.mockImplementation(async ({ where }) =>
      unknownCandidate.eventType.startsWith(where.eventType.startsWith)
        ? [unknownCandidate]
        : [],
    );
    mockPrisma.notificationOutbox.findUnique.mockResolvedValue({
      ...row,
      attempts: 1,
      eventType: "gear.reservation.teleported",
    });

    await expect(processGearOutbox(1)).resolves.toMatchObject({
      rejected: 1,
      deadLettered: 1,
      retried: 0,
      sent: 0,
    });
    expect(mockSendGearNotificationEmail).not.toHaveBeenCalled();
    expect(mockPrisma.notificationOutbox.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ eventType: gearPrefixFilter }),
      }),
    );
    expect(mockPrisma.notificationOutbox.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "FAILED",
        lastError: expect.stringContaining("undeliverable (UNKNOWN_EVENT_TYPE)"),
      }),
    }));
  });

  it("leaves non-gear rows untouched while claiming unknown gear events", async () => {
    const associationCandidate = {
      ...candidate,
      id: "cassociationxxxxxxxxxxxxxx",
      eventType: "association.venue_reservation.created",
    };
    const unknownGearCandidate = {
      ...candidate,
      id: "cunknowngearxxxxxxxxxxxxxx",
      eventType: "gear.experimental.created",
    };
    mockPrisma.notificationOutbox.findMany.mockImplementation(async ({ where }) =>
      [associationCandidate, unknownGearCandidate].filter((item) =>
        item.eventType.startsWith(where.eventType.startsWith),
      ),
    );
    mockPrisma.notificationOutbox.findFirst.mockResolvedValue(null);
    mockPrisma.notificationOutbox.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.notificationOutbox.findUnique.mockResolvedValue({
      ...row,
      id: unknownGearCandidate.id,
      eventType: unknownGearCandidate.eventType,
    });

    await expect(processGearOutbox(10)).resolves.toMatchObject({
      claimed: 1,
      rejected: 1,
      deadLettered: 1,
    });
    expect(mockPrisma.notificationOutbox.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: associationCandidate.id }),
      }),
    );
  });

  it("dead-letters a payload that no longer satisfies its event contract", async () => {
    mockPrisma.notificationOutbox.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.notificationOutbox.findMany.mockResolvedValue([candidate]);
    mockPrisma.notificationOutbox.findUnique.mockResolvedValue({
      ...row,
      eventType: "gear.reservation.due_soon",
      payload: { kind: "GEAR_RESERVATION", data: { reservationId: row.aggregateId } },
    });

    await expect(processGearOutbox(1)).resolves.toMatchObject({ rejected: 1, deadLettered: 1 });
    expect(mockPrisma.notificationOutbox.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        lastError: expect.stringContaining("undeliverable (MALFORMED_PAYLOAD)"),
      }),
    }));
  });

  it("reports a backlog from the age of the oldest due message", async () => {
    const now = new Date("2026-08-16T12:00:00.000Z");
    mockPrisma.notificationOutbox.count
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    mockPrisma.notificationOutbox.findFirst.mockResolvedValue({
      scheduledAt: new Date("2026-08-16T11:00:00.000Z"),
    });

    await expect(getGearOutboxHealth(now)).resolves.toEqual({
      pending: 4,
      processing: 1,
      deadLettered: 2,
      oldestPendingAgeMs: 60 * 60 * 1_000,
      backlogged: true,
    });
    for (const call of mockPrisma.notificationOutbox.count.mock.calls) {
      expect(call[0]).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({ eventType: gearPrefixFilter }),
        }),
      );
    }
    expect(mockPrisma.notificationOutbox.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ eventType: gearPrefixFilter }),
      }),
    );
  });

  it("is not backlogged when the queue is empty", async () => {
    mockPrisma.notificationOutbox.count.mockResolvedValue(0);
    mockPrisma.notificationOutbox.findFirst.mockResolvedValue(null);

    await expect(getGearOutboxHealth(new Date())).resolves.toMatchObject({
      oldestPendingAgeMs: null,
      backlogged: false,
    });
  });
});

describe("sanitizeFailure", () => {
  it("removes a recipient address from a provider error", () => {
    expect(sanitizeFailure(new Error("550 rejected recipient donor@example.com"))).toBe(
      "550 rejected recipient [redacted]",
    );
  });

  it("removes an address whose domain has no dot", () => {
    // Internal and malformed addresses appear in provider and SMTP errors too.
    expect(sanitizeFailure(new Error("unknown mailbox ops@localhost"))).toBe(
      "unknown mailbox [redacted]",
    );
  });

  it("removes an address wrapped in angle brackets", () => {
    const sanitized = sanitizeFailure(new Error("failed for <Donor@Example.com>"));
    expect(sanitized).not.toContain("@");
    expect(sanitized).not.toContain("Donor");
  });

  it("removes every address when an error names several", () => {
    const sanitized = sanitizeFailure(new Error("a@example.com, b@example.com both bounced"));
    expect(sanitized).not.toContain("@");
  });

  it("removes long opaque identifiers", () => {
    expect(sanitizeFailure(new Error("token abcdef0123456789abcdef0123 invalid"))).toBe(
      "token [redacted] invalid",
    );
  });

  it("keeps a non-Error rejection generic", () => {
    expect(sanitizeFailure("donor@example.com")).toBe("Notification delivery failed");
  });

  it("bounds the stored message", () => {
    expect(sanitizeFailure(new Error("x".repeat(500)))).toHaveLength(300);
  });
});
