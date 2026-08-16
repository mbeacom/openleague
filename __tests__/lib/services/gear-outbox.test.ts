import { describe, expect, it, vi } from "vitest";
import { queueGearOutbox } from "@/lib/services/gear-outbox";

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
          dedupeKey: "gear.reservation.approved:crrrrrrrrrrrrrrrrrrrrrrrr:v2:cuuuuuuuuuuuuuuuuuuuuuuuu",
        }),
        expect.objectContaining({
          recipientUserId: null,
          recipientEmail: "donor@example.com",
          dedupeKey: "gear.reservation.approved:crrrrrrrrrrrrrrrrrrrrrrrr:v2:donor@example.com",
        }),
      ],
      skipDuplicates: true,
    });
  });
});
