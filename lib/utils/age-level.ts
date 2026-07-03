import type { AgeClassification } from "@prisma/client";
import { STATS_MIN_AGE_LEVEL } from "@/lib/env";

/**
 * Ordered ranks for age/level classifications. Game scores and statistics are
 * only allowed at or above the configured minimum level (USA Hockey ADM:
 * no scores/stats at 8U/mite and below).
 */
export const AGE_CLASSIFICATION_RANK: Record<AgeClassification, number> = {
  U6: 1,
  U8: 2,
  SQUIRT_U10: 3,
  PEEWEE_U12: 4,
  BANTAM_U14: 5,
  U16: 6,
  U18: 7,
  JUNIOR: 8,
  ADULT: 9,
  OPEN: 10,
};

export const AGE_CLASSIFICATION_LABELS: Record<AgeClassification, string> = {
  U6: "6U (Mini Mite)",
  U8: "8U (Mite)",
  SQUIRT_U10: "10U (Squirt)",
  PEEWEE_U12: "12U (Peewee)",
  BANTAM_U14: "14U (Bantam)",
  U16: "16U",
  U18: "18U",
  JUNIOR: "Junior",
  ADULT: "Adult",
  OPEN: "Open / All ages",
};

export const AGE_CLASSIFICATION_OPTIONS = (
  Object.keys(AGE_CLASSIFICATION_RANK) as AgeClassification[]
).sort((left, right) => AGE_CLASSIFICATION_RANK[left] - AGE_CLASSIFICATION_RANK[right]);

/**
 * Whether game scores/outcomes/statistics may be recorded and displayed for an
 * event at the given classification. The threshold is platform-configurable via
 * STATS_MIN_AGE_LEVEL (default SQUIRT_U10 — blocks 8U/mite and below).
 */
export function isStatsEligible(classification: AgeClassification): boolean {
  const minimum = STATS_MIN_AGE_LEVEL as AgeClassification;
  return AGE_CLASSIFICATION_RANK[classification] >= AGE_CLASSIFICATION_RANK[minimum];
}
