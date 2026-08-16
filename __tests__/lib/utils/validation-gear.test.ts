import { describe, expect, it } from "vitest";
import {
  createGearPledgeSchema,
  createGearReservationSchema,
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
    };

    expect(receiveGearPledgeSchema.safeParse({ ...base, poolStockId: STOCK_ID }).success).toBe(true);
    expect(
      receiveGearPledgeSchema.safeParse({ ...base, poolStockId: STOCK_ID, gearUnitId: UNIT_ID }).success,
    ).toBe(false);
  });

  it("requires an idempotency key for public pledges", () => {
    expect(
      createGearPledgeSchema.safeParse({
        wishlistToken: "a".repeat(16),
        wishlistItemId: ITEM_ID,
        donorName: "A donor",
        quantity: 1,
        idempotencyKey: "b".repeat(16),
      }).success,
    ).toBe(true);
    expect(
      createGearPledgeSchema.safeParse({
        wishlistToken: "a".repeat(16),
        wishlistItemId: ITEM_ID,
        donorName: "A donor",
        quantity: 1,
        idempotencyKey: "short",
      }).success,
    ).toBe(false);
  });
});
