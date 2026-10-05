import { z } from "zod";

/**
 * Shared identifier schemas.
 *
 * Kept in a leaf module (no app imports) so the auth helpers can use them
 * without pulling the full validation module into their import graph.
 * `lib/utils/validation.ts` re-exports everything here.
 */

/**
 * A Prisma-generated entity id (`@id @default(cuid())`). Not for app-assigned
 * ids (such as fixed sentinel ids) or composite keys.
 */
export const idSchema = z.string().cuid("Invalid ID format");

/** URL slugs: lowercase alphanumerics separated by single hyphens. */
export const slugSchema = z
  .string()
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format");

/**
 * Parse an identifier argument received by a server action or auth helper.
 * Returns the id when it is a well-formed cuid string, otherwise `null`.
 */
export function parseId(value: unknown): string | null {
  const result = idSchema.safeParse(value);
  return result.success ? result.data : null;
}

/**
 * Parse an optional identifier: `undefined`, `null` and `""` mean "not
 * supplied" and yield `undefined`; anything else must be a well-formed id or
 * the result is `null` (invalid).
 */
export function parseOptionalId(value: unknown): string | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  return parseId(value);
}

/** Parse a slug argument. Returns the slug when well-formed, otherwise `null`. */
export function parseSlug(value: unknown): string | null {
  const result = slugSchema.safeParse(value);
  return result.success ? result.data : null;
}

/** A user id from the session: any non-empty string. */
export function isUserIdString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
