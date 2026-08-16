import { describe, expect, it, vi } from "vitest";
import { queueGearOutbox } from "@/lib/services/gear-outbox";

const event = {
  leagueId: "cllllllllllllllllllllllll",
  eventType: "gear.reservation.approved",
  aggregateType: "RESERVATION",
  aggregateId: "crrrrrrrrrrrrrrrrrrrrrrrr",
  payload: { reservationId: "crrrrrrrrrrrrrrrrrrrrrrrr" },
} as const;

describe("gear outbox enqueue", () => {
  it("writes one transaction-bound row per unique XOR recipient with stable dedupe keys", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    await queueGearOutbox(
      { notificationOutbox: { createMany } } as never,
      event,
      [{ userId: "cuuuuuuuuuuuuuuuuuuuuuuuu" }, { email: "Donor@Example.com" }, { email: "donor@example.com" }],
    );

    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          recipientUserId: "cuuuuuuuuuuuuuuuuuuuuuuuu",
          recipientEmail: null,
          dedupeKey: "gear.reservation.approved:crrrrrrrrrrrrrrrrrrrrrrrr:cuuuuuuuuuuuuuuuuuuuuuuuu",
        }),
        expect.objectContaining({
          recipientUserId: null,
          recipientEmail: "donor@example.com",
          dedupeKey: "gear.reservation.approved:crrrrrrrrrrrrrrrrrrrrrrrr:donor@example.com",
        }),
      ],
      skipDuplicates: true,
    });
  });
});
