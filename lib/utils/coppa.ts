/**
 * COPPA (Children's Online Privacy Protection Act) helpers.
 *
 * Player.dateOfBirth is stored as a date-only column (UTC midnight when read
 * through Prisma), so all math here uses UTC calendar parts — local-timezone
 * getters would shift the birthday for viewers west of UTC.
 *
 * Pure and dependency-free so it is safe in both Server Actions and Client
 * Components (the roster dialog uses it for inline consent prompting).
 */

export const COPPA_AGE_THRESHOLD = 13;

/**
 * Version tag stored on ParentalConsent rows, identifying which consent
 * language the guardian agreed to. Bump when counsel finalizes or revises
 * the consent text.
 */
export const COPPA_CONSENT_VERSION = "draft-2026-07";

/** Consent capture methods. ACCOUNT_ATTESTATION = signed-in admin/guardian checkbox. */
export const CONSENT_METHOD_ACCOUNT_ATTESTATION = "ACCOUNT_ATTESTATION";

/**
 * Age in whole years at `ref` (default: now), using UTC calendar parts.
 */
export function calculateAge(dateOfBirth: Date, ref: Date = new Date()): number {
  let age = ref.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDiff = ref.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && ref.getUTCDate() < dateOfBirth.getUTCDate())) {
    age--;
  }
  return age;
}

/**
 * True when the person is under the COPPA age threshold (13) at `ref`.
 * On the 13th birthday itself this returns false.
 */
export function isUnder13(dateOfBirth: Date, ref: Date = new Date()): boolean {
  return calculateAge(dateOfBirth, ref) < COPPA_AGE_THRESHOLD;
}

/**
 * Parse a YYYY-MM-DD date-only string to a UTC-midnight Date, or null for
 * empty/absent input. Returns undefined for a malformed or impossible date
 * (e.g. 2026-02-30) so callers can distinguish "cleared" from "invalid".
 */
export function parseDateOfBirth(value: string | null | undefined): Date | null | undefined {
  if (value == null || value === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  // Reject rolled-over dates like 2026-02-30 → March 2.
  if (date.toISOString().slice(0, 10) !== value) return undefined;
  return date;
}
