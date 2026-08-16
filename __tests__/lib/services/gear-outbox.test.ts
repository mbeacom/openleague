import { describe, expect, it, vi } from "vitest";
import { queueGearOutbox } from "@/lib/services/gear-outbox";
import { anonymousRecipientDigest } from "@/lib/services/gear-recipient-identity";

const event = {
  leagueId: "cllllllllllllllllllllllll",
  eventType: "gear.reservation.approved",
  occurrenceKey: "v2",
  aggregateType: "RESERVATION",
  aggregateId: "crrrrrrrrrrrrrrrrrrrrrrrr",
  payload: {
    kind: "GEAR_RESERVATION",
    data: { reservationId: "crrrrrrrrrrrrrrrrrrrrrrrr" },
  },
} as const;

describe("gear outbox enqueue", () => {
  it("writes one transaction-bound row per unique captured recipient with stable dedupe keys", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    await queueGearOutbox(
      { notificationOutbox: { createMany } } as never,
      event,
      [
        { userId: "cuuuuuuuuuuuuuuuuuuuuuuuu", email: "Admin@Example.com" },
        { email: "Donor@Example.com" },
        { email: "donor@example.com" },
      ],
    );

    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          recipientUserId: "cuuuuuuuuuuuuuuuuuuuuuuuu",
          recipientEmail: "admin@example.com",
          dedupeKey:
            "gear.reservation.approved:crrrrrrrrrrrrrrrrrrrrrrrr:v2:user:cuuuuuuuuuuuuuuuuuuuuuuuu",
        }),
        expect.objectContaining({
          recipientUserId: null,
          recipientEmail: "donor@example.com",
          dedupeKey: `gear.reservation.approved:crrrrrrrrrrrrrrrrrrrrrrrr:v2:anon:${anonymousRecipientDigest("donor@example.com")}`,
        }),
      ],
      skipDuplicates: true,
    });
  });

  it("never writes a recipient address into a dedupe key", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    await queueGearOutbox({ notificationOutbox: { createMany } } as never, event, [
      { email: "Donor@Example.com" },
    ]);

    const [row] = createMany.mock.calls[0][0].data;
    expect(row.dedupeKey).not.toContain("@");
    expect(row.dedupeKey).not.toContain("donor");
    // The captured address still has to survive — delivery depends on it.
    expect(row.recipientEmail).toBe("donor@example.com");
  });

  it("derives the same identity for the same address so occurrences still deduplicate", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    await queueGearOutbox({ notificationOutbox: { createMany } } as never, event, [
      { email: "donor@example.com" },
    ]);
    await queueGearOutbox({ notificationOutbox: { createMany } } as never, event, [
      { email: "  DONOR@Example.com  " },
    ]);

    const first = createMany.mock.calls[0][0].data[0].dedupeKey;
    const second = createMany.mock.calls[1][0].data[0].dedupeKey;
    expect(second).toBe(first);
  });

  it("derives different identities for different addresses", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    await queueGearOutbox({ notificationOutbox: { createMany } } as never, event, [
      { email: "one@example.com" },
      { email: "two@example.com" },
    ]);

    const [first, second] = createMany.mock.calls[0][0].data;
    expect(first.dedupeKey).not.toBe(second.dedupeKey);
  });
});
