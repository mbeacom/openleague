import { describe, expect, it } from "vitest";
import {
  StripeDisabledError,
  computeApplicationFee,
  getStripeClient,
  isStripeEnabled,
} from "@/lib/payments/stripe";

describe("computeApplicationFee", () => {
  it("returns 0 when fee bps is zero or negative", () => {
    expect(computeApplicationFee(10000, 0)).toBe(0);
    expect(computeApplicationFee(10000, -50)).toBe(0);
  });

  it("returns 0 for non-positive amounts", () => {
    expect(computeApplicationFee(0, 250)).toBe(0);
  });

  it("computes basis points and rounds down", () => {
    // 2.5% of $100.00 = $2.50
    expect(computeApplicationFee(10000, 250)).toBe(250);
    // 2.5% of $10.01 (1001c) = 25.025c -> floor 25
    expect(computeApplicationFee(1001, 250)).toBe(25);
  });

  it("falls back to platform default (0) when bps is null/undefined", () => {
    expect(computeApplicationFee(10000, null)).toBe(0);
    expect(computeApplicationFee(10000, undefined)).toBe(0);
  });
});

describe("stripe configuration", () => {
  it("reports disabled when STRIPE_SECRET_KEY is unset (test env)", () => {
    expect(isStripeEnabled()).toBe(false);
  });

  it("throws StripeDisabledError when constructing a client without a key", () => {
    expect(() => getStripeClient()).toThrow(StripeDisabledError);
  });
});
