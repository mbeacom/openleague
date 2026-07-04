import { describe, expect, it } from "vitest";
import { ScheduleFormat, Sport } from "@prisma/client";
import {
  GENERATIVE_FORMATS,
  SCHEDULE_FORMAT_LABELS,
  getSportCapabilities,
} from "@/lib/utils/sport-catalog";

const ALL_SPORTS = Object.values(Sport);
const NON_HOCKEY_SPORTS = ALL_SPORTS.filter((sport) => sport !== "HOCKEY");
const HOCKEY_VOCABULARY = /ice|rink|squirt|peewee|bantam|mite/i;

describe("sport-catalog", () => {
  describe("hockey capabilities", () => {
    const hockey = getSportCapabilities("HOCKEY");

    it("is fully populated", () => {
      expect(hockey.sport).toBe("HOCKEY");
      expect(hockey.sportLabel).toBe("Hockey");
      expect(hockey.surfaceLabel).toBe("Rink");
    });

    it("offers exactly three ice usage options", () => {
      expect(hockey.surfaceUsageOptions).toHaveLength(3);
      expect(hockey.surfaceUsageOptions).toEqual([
        { value: "FULL_ICE", label: "Full ice" },
        { value: "HALF_ICE", label: "Half ice" },
        { value: "CROSS_ICE", label: "Cross ice" },
      ]);
    });

    it("uses USA Hockey age labels", () => {
      const labels = hockey.ageClassifications.map((option) => option.label);
      expect(labels).toContain("10U (Squirt)");
      expect(labels).toContain("12U (Peewee)");
      expect(labels).toContain("14U (Bantam)");
    });

    it("suggests round robin, single elimination, and pool play", () => {
      expect(hockey.suggestedFormats).toEqual([
        "ROUND_ROBIN",
        "SINGLE_ELIMINATION",
        "POOL_PLAY",
      ]);
    });
  });

  describe("every sport", () => {
    it.each(ALL_SPORTS)("%s resolves to capabilities with age classifications", (sport) => {
      const capabilities = getSportCapabilities(sport);
      expect(capabilities.sport).toBe(sport);
      expect(capabilities.sportLabel).toBeTruthy();
      expect(capabilities.surfaceLabel).toBeTruthy();
      expect(capabilities.ageClassifications.length).toBeGreaterThan(0);
      expect(capabilities.suggestedFormats.length).toBeGreaterThan(0);
    });
  });

  describe("non-hockey sports degrade to neutral terminology", () => {
    it.each(NON_HOCKEY_SPORTS)("%s hides surface usage", (sport) => {
      expect(getSportCapabilities(sport).surfaceUsageOptions).toBeUndefined();
    });

    it.each(NON_HOCKEY_SPORTS)("%s has no hockey vocabulary in labels", (sport) => {
      const capabilities = getSportCapabilities(sport);
      const labels = [
        capabilities.sportLabel,
        capabilities.surfaceLabel,
        ...capabilities.ageClassifications.map((option) => option.label),
      ];
      for (const label of labels) {
        expect(label).not.toMatch(HOCKEY_VOCABULARY);
      }
    });
  });

  describe("getSportCapabilities without a sport", () => {
    it("returns the neutral OTHER entry for null", () => {
      const capabilities = getSportCapabilities(null);
      expect(capabilities.sport).toBe("OTHER");
      expect(capabilities.surfaceUsageOptions).toBeUndefined();
    });

    it("returns the neutral OTHER entry for undefined", () => {
      expect(getSportCapabilities(undefined).sport).toBe("OTHER");
    });
  });

  describe("schedule formats", () => {
    it("GENERATIVE_FORMATS contains only ROUND_ROBIN", () => {
      expect([...GENERATIVE_FORMATS]).toEqual(["ROUND_ROBIN"]);
    });

    it("SCHEDULE_FORMAT_LABELS covers every format", () => {
      for (const format of Object.values(ScheduleFormat)) {
        expect(SCHEDULE_FORMAT_LABELS[format]).toBeTruthy();
      }
    });
  });
});
