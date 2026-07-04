import type { AgeClassification } from "@prisma/client";

/**
 * Ordered ranks for age/level classifications. Game scores and statistics are
 * only allowed at or above the platform's minimum level (USA Hockey ADM:
 * no scores/stats at 8U/mite and below).
 *
 * This module is client-safe on purpose (no env access) — server callers pass
 * the configured threshold (env STATS_MIN_AGE_LEVEL) into isStatsEligible.
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

export const DEFAULT_STATS_MIN_AGE_LEVEL: AgeClassification = "SQUIRT_U10";

/**
 * Whether game scores/outcomes/statistics may be recorded and displayed for an
 * event at the given classification. Server callers pass the configured
 * STATS_MIN_AGE_LEVEL; the default blocks 8U/mite and below.
 */
export function isStatsEligible(
  classification: AgeClassification,
  minimumLevel: AgeClassification = DEFAULT_STATS_MIN_AGE_LEVEL
): boolean {
  return AGE_CLASSIFICATION_RANK[classification] >= AGE_CLASSIFICATION_RANK[minimumLevel];
}
