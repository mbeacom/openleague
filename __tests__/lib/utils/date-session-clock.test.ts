/** Session clock helpers (3b): venue-zone times with a suffix, viewer-zone times without. */
import { describe, expect, it } from "vitest";
import { formatClockTime, formatLongDate, sessionStart, sessionTimeZone } from "@/lib/utils/date";

const SIX_PM_EDT = new Date("2026-04-07T22:00:00.000Z");

describe("formatClockTime", () => {
    it("formats in the venue's zone with its short name", () => {
        expect(formatClockTime(SIX_PM_EDT, "America/New_York", true)).toBe("6:00 PM EDT");
    });

    it("leaves the suffix off unless asked", () => {
        expect(formatClockTime(SIX_PM_EDT, "America/New_York")).toBe("6:00 PM");
    });

    it("follows the zone across the DST change (2026-11-01, America/New_York)", () => {
        expect(formatClockTime(new Date("2026-11-01T05:30:00.000Z"), "America/New_York", true)).toBe("1:30 AM EDT");
        expect(formatClockTime(new Date("2026-11-01T06:30:00.000Z"), "America/New_York", true)).toBe("1:30 AM EST");
    });

    it("falls back to the runtime's zone with no suffix for an invalid zone", () => {
        const text = formatClockTime(SIX_PM_EDT, "Not/AZone", true);
        expect(text).toBe(formatClockTime(SIX_PM_EDT));
        expect(text).toMatch(/^\d{1,2}:\d{2} [AP]M$/);
    });

    it("never emits ICU's narrow no-break space", () => {
        expect(formatClockTime(SIX_PM_EDT, "America/New_York", true)).not.toContain("\u202f");
        expect(formatClockTime(SIX_PM_EDT)).not.toContain("\u202f");
    });
});

describe("formatLongDate", () => {
    it("formats the calendar date in the venue's zone", () => {
        // 01:00 UTC on the 8th is still the evening of the 7th in Denver.
        expect(formatLongDate(new Date("2026-04-08T01:00:00.000Z"), "America/Denver")).toBe("Tuesday, April 7, 2026");
    });

    it("falls back to the runtime's zone for an invalid zone", () => {
        expect(formatLongDate(SIX_PM_EDT, "Not/AZone")).toBe(formatLongDate(SIX_PM_EDT));
    });
});

describe("sessionTimeZone", () => {
    it("uses a valid venue zone and shows its name", () => {
        expect(sessionTimeZone({ venueTimezone: "America/Chicago" })).toEqual({ timeZone: "America/Chicago", showZone: true });
    });

    it.each([null, undefined, "", "Not/AZone"])("falls back to the viewer's zone for %s", (venueTimezone) => {
        expect(sessionTimeZone({ venueTimezone })).toEqual({ timeZone: undefined, showZone: false });
    });
});

describe("sessionStart", () => {
    it("prefers the booked start", () => {
        expect(sessionStart({ date: "2026-04-07T12:00:00.000Z", startAt: "2026-04-07T22:00:00.000Z" }).toISOString()).toBe(
            "2026-04-07T22:00:00.000Z",
        );
    });

    it("falls back to the session date", () => {
        expect(sessionStart({ date: "2026-04-07T12:00:00.000Z", startAt: null }).toISOString()).toBe("2026-04-07T12:00:00.000Z");
        expect(sessionStart({ date: new Date("2026-04-07T12:00:00.000Z") }).toISOString()).toBe("2026-04-07T12:00:00.000Z");
    });
});
