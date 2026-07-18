import { describe, it, expect } from "vitest";
import {
  COPPA_AGE_THRESHOLD,
  COPPA_CONSENT_VERSION,
  calculateAge,
  isUnder13,
  parseDateOfBirth,
} from "@/lib/utils/coppa";

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("calculateAge", () => {
  it("computes whole years before the birthday", () => {
    expect(calculateAge(utc("2013-07-19"), utc("2026-07-18"))).toBe(12);
  });

  it("increments on the birthday itself", () => {
    expect(calculateAge(utc("2013-07-18"), utc("2026-07-18"))).toBe(13);
  });

  it("handles month boundaries", () => {
    expect(calculateAge(utc("2013-08-01"), utc("2026-07-31"))).toBe(12);
    expect(calculateAge(utc("2013-06-30"), utc("2026-07-01"))).toBe(13);
  });

  it("handles Feb 29 birthdays in non-leap years (birthday counted on Mar 1)", () => {
    expect(calculateAge(utc("2016-02-29"), utc("2026-02-28"))).toBe(9);
    expect(calculateAge(utc("2016-02-29"), utc("2026-03-01"))).toBe(10);
  });
});

describe("isUnder13", () => {
  it("is true the day before the 13th birthday", () => {
    expect(isUnder13(utc("2013-07-19"), utc("2026-07-18"))).toBe(true);
  });

  it("is false on the 13th birthday", () => {
    expect(isUnder13(utc("2013-07-18"), utc("2026-07-18"))).toBe(false);
  });

  it("is false for adults", () => {
    expect(isUnder13(utc("1990-01-01"), utc("2026-07-18"))).toBe(false);
  });

  it("is true for a newborn", () => {
    expect(isUnder13(utc("2026-07-01"), utc("2026-07-18"))).toBe(true);
  });

  it("threshold constant is 13", () => {
    expect(COPPA_AGE_THRESHOLD).toBe(13);
  });
});

describe("parseDateOfBirth", () => {
  it("parses a valid date-only string to UTC midnight", () => {
    const parsed = parseDateOfBirth("2013-07-18");
    expect(parsed).toEqual(utc("2013-07-18"));
  });

  it("returns null for empty/absent input", () => {
    expect(parseDateOfBirth("")).toBeNull();
    expect(parseDateOfBirth(null)).toBeNull();
    expect(parseDateOfBirth(undefined)).toBeNull();
  });

  it("returns undefined for malformed input", () => {
    expect(parseDateOfBirth("07/18/2013")).toBeUndefined();
    expect(parseDateOfBirth("2013-7-18")).toBeUndefined();
    expect(parseDateOfBirth("not-a-date")).toBeUndefined();
  });

  it("rejects impossible dates that would roll over", () => {
    expect(parseDateOfBirth("2026-02-30")).toBeUndefined();
    expect(parseDateOfBirth("2026-13-01")).toBeUndefined();
  });

  it("consent version is a non-empty tag", () => {
    expect(COPPA_CONSENT_VERSION.length).toBeGreaterThan(0);
  });
});
