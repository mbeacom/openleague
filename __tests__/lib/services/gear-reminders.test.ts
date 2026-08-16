import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reservationFindMany: vi.fn(),
  teamMemberFindMany: vi.fn(),
  createMany: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    gearReservation: { findMany: mocks.reservationFindMany },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
      teamMember: { findMany: mocks.teamMemberFindMany },
      notificationOutbox: { createMany: mocks.createMany },
    }),
  },
}));

import { queueGearCustodyReminders } from "@/lib/services/gear-reminders";

describe("gear custody reminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.teamMemberFindMany.mockResolvedValue([{ userId: "cuuuuuuuuuuuuuuuuuuuuuuuu" }]);
    mocks.createMany.mockResolvedValue({ count: 1 });
  });

  it("uses an approved end date for due-soon delivery and occurrence dedupe", async () => {
    const approvedEndDate = new Date("2026-08-18T00:00:00.000Z");
    mocks.reservationFindMany
      .mockResolvedValueOnce([{
        id: "crrrrrrrrrrrrrrrrrrrrrrrr",
        leagueId: "cllllllllllllllllllllllll",
        teamId: "ctttttttttttttttttttttttt",
        requestedById: null,
        requestedEndDate: new Date("2026-08-30T00:00:00.000Z"),
        approvedEndDate,
      }])
      .mockResolvedValueOnce([]);

    await queueGearCustodyReminders(new Date("2026-08-16T12:00:00.000Z"));

    expect(mocks.reservationFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([{ approvedEndDate: { gte: expect.any(Date), lte: expect.any(Date) } }]),
      }),
    }));
    expect(mocks.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        aggregateId: "crrrrrrrrrrrrrrrrrrrrrrrr",
        payload: expect.objectContaining({ dueDate: "2026-08-18" }),
        dedupeKey: expect.stringContaining("gear.reservation.due_soon:crrrrrrrrrrrrrrrrrrrrrrrr:gear.reservation.due_soon:2026-08-18"),
      })],
    }));
  });
});
