import { describe, expect, it } from "vitest";
import { parseGearActivitySearchParams } from "@/lib/utils/gear-activity-query";

describe("gear inventory activity query parsing", () => {
  it("bounds and normalizes activity options before querying the inventory context", () => {
    expect(parseGearActivitySearchParams({
      activityPage: ["100000000", "2"],
      activitySearch: `  ${"a".repeat(150)}  `,
    })).toEqual({
      activityPage: 10_000,
      activitySearch: "a".repeat(100),
    });
  });

  it("falls back safely for invalid pages and preserves a single query value", () => {
    expect(parseGearActivitySearchParams({
      activityPage: "not-a-page",
      activitySearch: ["helmet", "ignored"],
    })).toEqual({
      activityPage: 1,
      activitySearch: "helmet",
    });
  });
});
