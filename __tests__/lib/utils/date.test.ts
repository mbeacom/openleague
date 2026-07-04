import { describe, it, expect } from "vitest";
import {
  parseDateTimeLocalToUtc,
  formatDateTimeLocalInput,
  resolveTimeZone,
  isValidTimeZone,
  formatDateTime,
  FALLBACK_TIME_ZONE,
} from "@/lib/utils/date";

describe("isValidTimeZone", () => {
  it("accepts valid IANA zones", () => {
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("America/Chicago")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rejects invalid or empty zones", () => {
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
  });
});

describe("resolveTimeZone", () => {
  it("returns a valid preferred zone unchanged", () => {
    expect(resolveTimeZone("America/Chicago")).toBe("America/Chicago");
  });

  it("falls back when the preferred zone is invalid", () => {
    const resolved = resolveTimeZone("Not/AZone");
    expect(isValidTimeZone(resolved)).toBe(true);
  });

  it("resolves to a valid zone when nothing is provided", () => {
    expect(isValidTimeZone(resolveTimeZone())).toBe(true);
  });
});

describe("parseDateTimeLocalToUtc", () => {
  it("interprets wall-clock in the target zone, not the runtime zone (summer/EDT)", () => {
    // 6:00 PM in New York during DST is 22:00 UTC.
    const utc = parseDateTimeLocalToUtc("2026-07-10T18:00", "America/New_York");
    expect(utc?.toISOString()).toBe("2026-07-10T22:00:00.000Z");
  });

  it("handles standard time (winter/EST)", () => {
    // 6:00 PM in New York during standard time is 23:00 UTC.
    const utc = parseDateTimeLocalToUtc("2026-01-10T18:00", "America/New_York");
    expect(utc?.toISOString()).toBe("2026-01-10T23:00:00.000Z");
  });

  it("differs across zones for the same wall-clock", () => {
    const ny = parseDateTimeLocalToUtc("2026-07-10T18:00", "America/New_York");
    const chi = parseDateTimeLocalToUtc("2026-07-10T18:00", "America/Chicago");
    // Chicago is one hour behind New York.
    expect((chi!.getTime() - ny!.getTime()) / 3_600_000).toBe(1);
  });

  it("accepts an optional seconds component", () => {
    const utc = parseDateTimeLocalToUtc("2026-07-10T18:00:30", "UTC");
    expect(utc?.toISOString()).toBe("2026-07-10T18:00:30.000Z");
  });

  it("returns null for empty or malformed input", () => {
    expect(parseDateTimeLocalToUtc("", "America/New_York")).toBeNull();
    expect(parseDateTimeLocalToUtc("not-a-date", "America/New_York")).toBeNull();
    expect(parseDateTimeLocalToUtc(null, "America/New_York")).toBeNull();
    expect(parseDateTimeLocalToUtc(undefined, "America/New_York")).toBeNull();
  });
});

describe("formatDateTimeLocalInput", () => {
  it("renders the wall-clock in the given zone", () => {
    const instant = new Date("2026-07-10T22:00:00.000Z");
    expect(formatDateTimeLocalInput(instant, "America/New_York")).toBe("2026-07-10T18:00");
    expect(formatDateTimeLocalInput(instant, "America/Chicago")).toBe("2026-07-10T17:00");
    expect(formatDateTimeLocalInput(instant, "UTC")).toBe("2026-07-10T22:00");
  });

  it("returns '' for missing/invalid input", () => {
    expect(formatDateTimeLocalInput(null, "UTC")).toBe("");
    expect(formatDateTimeLocalInput(undefined, "UTC")).toBe("");
    expect(formatDateTimeLocalInput("nonsense", "UTC")).toBe("");
  });

  it("round-trips with parseDateTimeLocalToUtc", () => {
    const zone = "America/New_York";
    const wall = "2026-03-15T09:30";
    const instant = parseDateTimeLocalToUtc(wall, zone);
    expect(formatDateTimeLocalInput(instant, zone)).toBe(wall);
  });
});

describe("formatDateTime", () => {
  it("renders in the provided zone when valid", () => {
    const instant = new Date("2026-07-10T22:00:00.000Z");
    const ny = formatDateTime(instant, "America/New_York");
    expect(ny).toContain("6:00");
    expect(ny).toContain("EDT");
  });

  it("ignores an invalid zone and still renders", () => {
    const instant = new Date("2026-07-10T22:00:00.000Z");
    expect(formatDateTime(instant, "Not/AZone")).toBeTruthy();
  });
});

describe("FALLBACK_TIME_ZONE", () => {
  it("matches the Prisma schema defaults", () => {
    expect(FALLBACK_TIME_ZONE).toBe("America/New_York");
  });
});
