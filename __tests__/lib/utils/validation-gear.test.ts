import { describe, expect, it } from "vitest";
import {
  createTeamGearNeedSchema,
  createGearPledgeSchema,
  createGearReservationSchema,
  gearActivityDetailsSchema,
  gearNotificationPayloadSchema,
  recordGearInventoryMovementSchema,
  receiveGearPledgeSchema,
} from "@/lib/utils/validation";

const LEAGUE_ID = "clleague0000000000000001";
const TEAM_ID = "clteam00000000000000001";
const ITEM_ID = "clcatalog000000000000001";
const STOCK_ID = "clstock00000000000000001";
const UNIT_ID = "clunit00000000000000001";

describe("gear validation schemas", () => {
  it("accepts an inclusive reservation date window", () => {
    expect(
      createGearReservationSchema.safeParse({
        leagueId: LEAGUE_ID,
        teamId: TEAM_ID,
        requestedStartDate: "2026-09-01",
        requestedEndDate: "2026-09-01",
        custodianNameSnapshot: "Team Manager",
        lines: [{ nameSnapshot: "Youth helmet", requestedQty: 4 }],
      }).success,
    ).toBe(true);
  });

  it("rejects a reservation that ends before it starts", () => {
    expect(
      createGearReservationSchema.safeParse({
        leagueId: LEAGUE_ID,
        teamId: TEAM_ID,
        requestedStartDate: "2026-09-02",
        requestedEndDate: "2026-09-01",
        custodianNameSnapshot: "Team Manager",
        lines: [{ nameSnapshot: "Youth helmet", requestedQty: 4 }],
      }).success,
    ).toBe(false);
  });

  it("requires exactly one receipt inventory destination", () => {
    const base = {
      leagueId: LEAGUE_ID,
      pledgeId: ITEM_ID,
      quantity: 1,
      expectedVersion: 0,
      idempotencyKey: "receipt-command-1",
    };

    expect(receiveGearPledgeSchema.safeParse({ ...base, poolStockId: STOCK_ID }).success).toBe(true);
    expect(
      receiveGearPledgeSchema.safeParse({ ...base, poolStockId: STOCK_ID, gearUnitId: UNIT_ID }).success,
    ).toBe(false);
    expect(receiveGearPledgeSchema.safeParse({ ...base, gearUnitId: UNIT_ID, quantity: 2 }).success).toBe(false);
  });

  it("requires tagged movement quantities of one and compatible adjustment direction", () => {
    const base = {
      leagueId: LEAGUE_ID,
      gearUnitId: UNIT_ID,
      type: "ADJUSTMENT" as const,
      direction: "INCREASE" as const,
      quantity: 1,
    };

    expect(recordGearInventoryMovementSchema.safeParse(base).success).toBe(true);
    expect(recordGearInventoryMovementSchema.safeParse({ ...base, quantity: 2 }).success).toBe(false);
    expect(recordGearInventoryMovementSchema.safeParse({ ...base, direction: "NEUTRAL" }).success).toBe(false);
  });

  it("allows only typed, non-PII activity and notification payload fields", () => {
    expect(
      gearActivityDetailsSchema.safeParse({
        action: "reservation_requested",
        metadata: { lineCount: 2 },
      }).success,
    ).toBe(true);
    expect(
      gearActivityDetailsSchema.safeParse({
        action: "reservation_requested",
        donorEmail: "donor@example.com",
      }).success,
    ).toBe(false);
    expect(
      gearNotificationPayloadSchema.safeParse({
        kind: "GEAR_RESERVATION",
        data: { reservationId: ITEM_ID },
      }).success,
    ).toBe(true);
    expect(
      gearNotificationPayloadSchema.safeParse({
        kind: "GEAR_RESERVATION",
        data: { recipientEmail: "player@example.com" },
      }).success,
    ).toBe(false);
  });

  it("requires an idempotency key for public pledges", () => {
    expect(
      createGearPledgeSchema.safeParse({
        wishlistToken: "a".repeat(16),
        wishlistItemId: ITEM_ID,
        donorName: "A donor",
        donorEmail: "donor@example.com",
        quantity: 1,
        idempotencyKey: "b".repeat(16),
      }).success,
    ).toBe(true);
    expect(
      createGearPledgeSchema.safeParse({
        wishlistToken: "a".repeat(16),
        wishlistItemId: ITEM_ID,
        donorName: "A donor",
        donorEmail: "donor@example.com",
        quantity: 1,
        idempotencyKey: "short",
      }).success,
    ).toBe(false);
    expect(
      createGearPledgeSchema.safeParse({
        wishlistToken: "a".repeat(16),
        wishlistItemId: ITEM_ID,
        donorName: "A donor",
        quantity: 1,
        idempotencyKey: "b".repeat(16),
      }).success,
    ).toBe(false);
  });

  it("requires a stable idempotency key for gear-need creation", () => {
    expect(createTeamGearNeedSchema.safeParse({
      leagueId: ITEM_ID,
      teamId: ITEM_ID,
      idempotencyKey: "n".repeat(16),
      title: "Equipment",
      lines: [{ nameSnapshot: "Tape", requestedQty: 1 }],
    }).success).toBe(true);
    expect(createTeamGearNeedSchema.safeParse({
      leagueId: ITEM_ID,
      teamId: ITEM_ID,
      title: "Equipment",
      lines: [{ nameSnapshot: "Tape", requestedQty: 1 }],
    }).success).toBe(false);
  });
});
