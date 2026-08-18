import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reservationFindMany: vi.fn(),
  teamMemberFindMany: vi.fn(),
  createMany: vi.fn(),
  transaction: vi.fn(),
  outboxFindMany: vi.fn(),
  outboxUpdateMany: vi.fn(),
  sweepUpsert: vi.fn(),
  sweepUpdateMany: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    gearReservation: { findMany: mocks.reservationFindMany },
    notificationOutbox: {
      findMany: mocks.outboxFindMany,
      updateMany: mocks.outboxUpdateMany,
    },
    gearReminderSweep: {
      upsert: mocks.sweepUpsert,
      updateMany: mocks.sweepUpdateMany,
    },
    $transaction: (callback: (tx: unknown) => Promise<unknown>) => mocks.transaction(callback),
  },
}));

import {
  cancelStaleGearCustodyReminders,
  GEAR_REMINDER_BUDGET,
  queueGearCustodyReminders,
} from "@/lib/services/gear-reminders";

const NOW = new Date("2026-08-16T12:00:00.000Z");

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    id: "crrrrrrrrrrrrrrrrrrrrrrrr",
    leagueId: "cllllllllllllllllllllllll",
    teamId: "ctttttttttttttttttttttttt",
    requestedById: null,
    requestedEndDate: new Date("2026-08-30T00:00:00.000Z"),
    approvedEndDate: new Date("2026-08-18T00:00:00.000Z"),
    custodyStartedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.teamMemberFindMany.mockResolvedValue([{ userId: "cuuuuuuuuuuuuuuuuuuuuuuuu" }]);
  mocks.createMany.mockResolvedValue({ count: 1 });
  mocks.sweepUpsert.mockResolvedValue({ cursorId: null, version: 0 });
  mocks.sweepUpdateMany.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation((callback: (tx: unknown) => Promise<unknown>) => callback({
    teamMember: { findMany: mocks.teamMemberFindMany },
    user: {
      findMany: vi.fn().mockResolvedValue([
        { id: "cuuuuuuuuuuuuuuuuuuuuuuuu", email: "admin@example.com" },
      ]),
    },
    notificationOutbox: { createMany: mocks.createMany },
  }));
});

describe("gear custody reminders", () => {
  it("uses an approved end date for due-soon delivery and occurrence dedupe", async () => {
    mocks.reservationFindMany.mockResolvedValueOnce([reservation()]);

    await expect(queueGearCustodyReminders(NOW)).resolves.toMatchObject({
      dueSoon: 1,
      overdue: 0,
      failed: 0,
      truncated: false,
    });

    expect(mocks.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        aggregateId: "crrrrrrrrrrrrrrrrrrrrrrrr",
        payload: expect.objectContaining({
          kind: "GEAR_RESERVATION",
          data: expect.objectContaining({ dueDate: "2026-08-18" }),
        }),
        dedupeKey: expect.stringContaining(
          "gear.reservation.due_soon:crrrrrrrrrrrrrrrrrrrrrrrr:gear.reservation.due_soon:2026-08-18",
        ),
      })],
    }));
    expect(mocks.reservationFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: "FULFILLED",
        custodyStartedAt: { not: null },
      }),
    }));
  });

  it("classifies a past due date as overdue and re-keys the occurrence to today", async () => {
    mocks.reservationFindMany.mockResolvedValueOnce([
      reservation({ approvedEndDate: new Date("2026-08-10T00:00:00.000Z") }),
    ]);

    await expect(queueGearCustodyReminders(NOW)).resolves.toMatchObject({ overdue: 1, dueSoon: 0 });
    expect(mocks.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        eventType: "gear.reservation.overdue",
        dedupeKey: expect.stringContaining("gear.reservation.overdue:2026-08-16"),
      })],
    }));
  });

  it("keeps queueing after one reservation fails", async () => {
    mocks.reservationFindMany.mockResolvedValueOnce([
      reservation({ id: "cbrokenxxxxxxxxxxxxxxxxxxx" }),
      reservation({ id: "cworkingxxxxxxxxxxxxxxxxxx" }),
    ]);
    mocks.transaction.mockRejectedValueOnce(new Error("team was deleted"));

    await expect(queueGearCustodyReminders(NOW)).resolves.toMatchObject({
      dueSoon: 1,
      failed: 1,
      scanned: 2,
    });
    expect(mocks.createMany).toHaveBeenCalledTimes(1);
  });

  it("queues each reservation in its own transaction", async () => {
    mocks.reservationFindMany.mockResolvedValueOnce([
      reservation({ id: "cfirstxxxxxxxxxxxxxxxxxxxx" }),
      reservation({ id: "csecondxxxxxxxxxxxxxxxxxxx" }),
    ]);

    await queueGearCustodyReminders(NOW);
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
  });

  it("pages with a cursor and stops when a short page is returned", async () => {
    mocks.reservationFindMany
      .mockResolvedValueOnce(
        Array.from({ length: 100 }, (_, index) => reservation({ id: `cpage1-${index}` })),
      )
      .mockResolvedValueOnce([reservation({ id: "cpage2-0" })]);

    await expect(queueGearCustodyReminders(NOW)).resolves.toMatchObject({
      scanned: 101,
      truncated: false,
    });
    expect(mocks.reservationFindMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      cursor: { id: "cpage1-99" },
      skip: 1,
    }));
  });

  it("stops at the budget and reports the backlog instead of scanning forever", async () => {
    mocks.reservationFindMany.mockImplementation(async ({ take }: { take: number }) =>
      Array.from({ length: take }, (_, index) => reservation({ id: `cbudget-${index}` })),
    );

    const result = await queueGearCustodyReminders(NOW);
    expect(result.scanned).toBe(GEAR_REMINDER_BUDGET);
    expect(result.truncated).toBe(true);
    expect(mocks.sweepUpdateMany).toHaveBeenCalledWith({
      where: { id: "custody-reminders", version: 0 },
      data: { cursorId: "cbudget-99", version: { increment: 1 } },
    });
  });

  it("persists a forward sweep cursor so a second budgeted run reaches later reservations", async () => {
    const page = (start: number) => Array.from(
      { length: 100 },
      (_, index) => reservation({ id: `c${String(start + index).padStart(24, "0")}` }),
    );
    const firstRunPages = [page(0), page(100), page(200), page(300), page(400)];
    const firstCursor = firstRunPages.at(-1)?.at(-1)?.id;
    mocks.reservationFindMany.mockImplementationOnce(async () => firstRunPages.shift() ?? []);

    // Preserve normal pagination while making each call consume the next page.
    mocks.reservationFindMany.mockReset();
    firstRunPages.forEach((entries) => mocks.reservationFindMany.mockResolvedValueOnce(entries));
    mocks.sweepUpsert
      .mockResolvedValueOnce({ cursorId: null, version: 0 })
      .mockResolvedValueOnce({ cursorId: firstCursor, version: 1 });
    await expect(queueGearCustodyReminders(NOW)).resolves.toMatchObject({
      scanned: GEAR_REMINDER_BUDGET,
      truncated: true,
    });
    expect(mocks.createMany).toHaveBeenCalledTimes(GEAR_REMINDER_BUDGET);

    const later = reservation({ id: "czlaterxxxxxxxxxxxxxxxxxxx" });
    mocks.reservationFindMany.mockResolvedValueOnce([later]);
    await expect(queueGearCustodyReminders(NOW)).resolves.toMatchObject({
      scanned: 1,
      truncated: false,
    });
    expect(mocks.createMany).toHaveBeenCalledTimes(GEAR_REMINDER_BUDGET + 1);
    expect(mocks.createMany.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({
      data: [expect.objectContaining({ aggregateId: later.id })],
    }));
    expect(mocks.reservationFindMany.mock.calls.at(-1)?.[0]).toMatchObject({
      where: expect.objectContaining({ id: { gt: firstCursor } }),
    });
  });
});

describe("stale gear custody reminder cancellation", () => {
  function pendingRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "coutboxxxxxxxxxxxxxxxxxxxx",
      eventType: "gear.reservation.due_soon",
      aggregateId: "crrrrrrrrrrrrrrrrrrrrrrrr",
      payload: { kind: "GEAR_RESERVATION", data: { reservationId: "crrrrrrrrrrrrrrrrrrrrrrrr", dueDate: "2026-08-18" } },
      ...overrides,
    };
  }

  beforeEach(() => {
    mocks.outboxUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("only inspects pending reminder rows", async () => {
    mocks.outboxFindMany.mockResolvedValue([]);

    await expect(cancelStaleGearCustodyReminders(NOW)).resolves.toEqual({ inspected: 0, canceled: 0 });
    expect(mocks.outboxFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: "PENDING",
        eventType: { in: ["gear.reservation.due_soon", "gear.reservation.overdue"] },
      }),
    }));
    expect(mocks.outboxUpdateMany).not.toHaveBeenCalled();
  });

  it("cancels a reminder whose reservation no longer exists", async () => {
    mocks.outboxFindMany.mockResolvedValue([pendingRow()]);
    mocks.reservationFindMany.mockResolvedValue([]);

    await expect(cancelStaleGearCustodyReminders(NOW)).resolves.toEqual({ inspected: 1, canceled: 1 });
    expect(mocks.outboxUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "coutboxxxxxxxxxxxxxxxxxxxx", status: "PENDING" },
      data: expect.objectContaining({
        status: "CANCELED",
        lastError: "canceled: reservation no longer exists",
      }),
    }));
  });

  it("cancels a reminder once the gear has been returned", async () => {
    mocks.outboxFindMany.mockResolvedValue([pendingRow()]);
    mocks.reservationFindMany.mockResolvedValue([{
      id: "crrrrrrrrrrrrrrrrrrrrrrrr",
      status: "RETURNED",
      requestedEndDate: new Date("2026-08-18T00:00:00.000Z"),
      approvedEndDate: new Date("2026-08-18T00:00:00.000Z"),
    }]);

    await expect(cancelStaleGearCustodyReminders(NOW)).resolves.toMatchObject({ canceled: 1 });
    expect(mocks.outboxUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lastError: expect.stringContaining("no gear is in custody") }),
    }));
  });

  it("cancels a reminder whose due date has moved", async () => {
    mocks.outboxFindMany.mockResolvedValue([pendingRow()]);
    mocks.reservationFindMany.mockResolvedValue([{
      id: "crrrrrrrrrrrrrrrrrrrrrrrr",
      status: "FULFILLED",
      custodyStartedAt: new Date("2026-08-01T00:00:00.000Z"),
      requestedEndDate: new Date("2026-08-30T00:00:00.000Z"),
      approvedEndDate: new Date("2026-08-25T00:00:00.000Z"),
    }]);

    await expect(cancelStaleGearCustodyReminders(NOW)).resolves.toMatchObject({ canceled: 1 });
    expect(mocks.outboxUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lastError: "canceled: reservation due date changed" }),
    }));
  });

  it("cancels a due-soon reminder that an overdue one has overtaken", async () => {
    mocks.outboxFindMany.mockResolvedValue([
      pendingRow({ payload: { kind: "GEAR_RESERVATION", data: { reservationId: "crrrrrrrrrrrrrrrrrrrrrrrr", dueDate: "2026-08-10" } } }),
    ]);
    mocks.reservationFindMany.mockResolvedValue([{
      id: "crrrrrrrrrrrrrrrrrrrrrrrr",
      status: "FULFILLED",
      custodyStartedAt: new Date("2026-08-01T00:00:00.000Z"),
      requestedEndDate: new Date("2026-08-10T00:00:00.000Z"),
      approvedEndDate: new Date("2026-08-10T00:00:00.000Z"),
    }]);

    await expect(cancelStaleGearCustodyReminders(NOW)).resolves.toMatchObject({ canceled: 1 });
    expect(mocks.outboxUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lastError: "canceled: superseded by an overdue reminder" }),
    }));
  });

  it("leaves a still-accurate reminder alone", async () => {
    mocks.outboxFindMany.mockResolvedValue([pendingRow()]);
    mocks.reservationFindMany.mockResolvedValue([{
      id: "crrrrrrrrrrrrrrrrrrrrrrrr",
      status: "FULFILLED",
      custodyStartedAt: new Date("2026-08-01T00:00:00.000Z"),
      requestedEndDate: new Date("2026-08-30T00:00:00.000Z"),
      approvedEndDate: new Date("2026-08-18T00:00:00.000Z"),
    }]);

    await expect(cancelStaleGearCustodyReminders(NOW)).resolves.toEqual({ inspected: 1, canceled: 0 });
    expect(mocks.outboxUpdateMany).not.toHaveBeenCalled();
  });

  it("cancels a pending custody reminder when pickup never started", async () => {
    mocks.outboxFindMany.mockResolvedValue([pendingRow()]);
    mocks.reservationFindMany.mockResolvedValue([{
      id: "crrrrrrrrrrrrrrrrrrrrrrrr",
      status: "FULFILLED",
      custodyStartedAt: null,
      requestedEndDate: new Date("2026-08-30T00:00:00.000Z"),
      approvedEndDate: new Date("2026-08-18T00:00:00.000Z"),
    }]);

    await expect(cancelStaleGearCustodyReminders(NOW)).resolves.toEqual({
      inspected: 1,
      canceled: 1,
    });
  });
});
