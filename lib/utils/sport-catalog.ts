import type { AgeClassification, IceUsage, ScheduleFormat, Sport } from "@prisma/client";
import { AGE_CLASSIFICATION_LABELS, AGE_CLASSIFICATION_OPTIONS } from "@/lib/utils/age-level";

/**
 * Per-sport capability catalog keyed by the Prisma `Sport` enum.
 *
 * Hockey is first-class (FR-032): its entry carries USA Hockey age labels,
 * rink terminology, ice-usage options, and a fuller set of suggested schedule
 * formats. Every other sport degrades gracefully (FR-031/033) to a neutral
 * entry — correct sport label, generic "Surface" terminology, plain age
 * labels, and no surface-usage options (`surfaceUsageOptions` undefined tells
 * the UI to hide the field entirely).
 *
 * The catalog is code, not data: type-safe, testable, and liftable to the
 * database later without changing call sites (research R3).
 */
export type SportCapabilities = {
  sport: Sport;
  sportLabel: string;
  surfaceLabel: string;
  surfaceUsageOptions?: { value: IceUsage; label: string }[];
  ageClassifications: { value: AgeClassification; label: string }[];
  suggestedFormats: ScheduleFormat[];
};

export const SCHEDULE_FORMAT_LABELS: Record<ScheduleFormat, string> = {
  ROUND_ROBIN: "Round robin",
  SINGLE_ELIMINATION: "Single elimination",
  DOUBLE_ELIMINATION: "Double elimination",
  POOL_PLAY: "Pool play",
  LADDER: "Ladder",
  CUSTOM: "Custom",
};

/** Formats the platform can generate schedules for (others are label-only). */
export const GENERATIVE_FORMATS: ReadonlySet<ScheduleFormat> = new Set<ScheduleFormat>([
  "ROUND_ROBIN",
]);

const SPORT_LABELS: Record<Sport, string> = {
  HOCKEY: "Hockey",
  LACROSSE: "Lacrosse",
  SOCCER: "Soccer",
  BASKETBALL: "Basketball",
  BASEBALL: "Baseball",
  SOFTBALL: "Softball",
  FOOTBALL: "Football",
  VOLLEYBALL: "Volleyball",
  OTHER: "Other",
};

/** Sport-neutral age labels — no hockey vocabulary (FR-033). */
const NEUTRAL_AGE_CLASSIFICATION_LABELS: Record<AgeClassification, string> = {
  U6: "U6",
  U8: "U8",
  SQUIRT_U10: "U10",
  PEEWEE_U12: "U12",
  BANTAM_U14: "U14",
  U16: "U16",
  U18: "U18",
  JUNIOR: "Junior",
  ADULT: "Adult",
  OPEN: "Open",
};

function ageClassificationOptions(
  labels: Record<AgeClassification, string>
): { value: AgeClassification; label: string }[] {
  return AGE_CLASSIFICATION_OPTIONS.map((value) => ({ value, label: labels[value] }));
}

function neutralCapabilities(sport: Sport): SportCapabilities {
  return {
    sport,
    sportLabel: SPORT_LABELS[sport],
    surfaceLabel: "Surface",
    ageClassifications: ageClassificationOptions(NEUTRAL_AGE_CLASSIFICATION_LABELS),
    suggestedFormats: ["ROUND_ROBIN"],
  };
}

const HOCKEY_CAPABILITIES: SportCapabilities = {
  sport: "HOCKEY",
  sportLabel: SPORT_LABELS.HOCKEY,
  surfaceLabel: "Rink",
  surfaceUsageOptions: [
    { value: "FULL_ICE", label: "Full ice" },
    { value: "HALF_ICE", label: "Half ice" },
    { value: "CROSS_ICE", label: "Cross ice" },
  ],
  ageClassifications: ageClassificationOptions(AGE_CLASSIFICATION_LABELS),
  suggestedFormats: ["ROUND_ROBIN", "SINGLE_ELIMINATION", "POOL_PLAY"],
};

const SPORT_CATALOG: Record<Sport, SportCapabilities> = {
  HOCKEY: HOCKEY_CAPABILITIES,
  LACROSSE: neutralCapabilities("LACROSSE"),
  SOCCER: neutralCapabilities("SOCCER"),
  BASKETBALL: neutralCapabilities("BASKETBALL"),
  BASEBALL: neutralCapabilities("BASEBALL"),
  SOFTBALL: neutralCapabilities("SOFTBALL"),
  FOOTBALL: neutralCapabilities("FOOTBALL"),
  VOLLEYBALL: neutralCapabilities("VOLLEYBALL"),
  OTHER: neutralCapabilities("OTHER"),
};

/**
 * Resolve capabilities for a sport. Unknown context (null/undefined) resolves
 * to the neutral OTHER entry so callers never need to branch (FR-031).
 */
export function getSportCapabilities(sport: Sport | null | undefined): SportCapabilities {
  return SPORT_CATALOG[sport ?? "OTHER"];
}
