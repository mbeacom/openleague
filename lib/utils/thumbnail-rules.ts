/**
 * The thumbnail rule, in one pure module with no imports so both the hosted
 * Zod schemas (lib/utils/validation.ts) and the static planner's store
 * (apps/planner) share it without the static bundle pulling in validation.ts.
 */

/** Maximum thumbnail length in characters (1MB in base64 is ~1.37MB, so this is ~750KB of image). */
export const MAX_THUMBNAIL_SIZE = 1000000;

export const THUMBNAIL_DATA_URL = /^data:image\/(png|jpeg|jpg|webp);base64,/;

/** True for a base64 PNG/JPEG/WebP data URL within MAX_THUMBNAIL_SIZE. */
export function isAcceptableThumbnail(value: string): boolean {
    return value.length <= MAX_THUMBNAIL_SIZE && THUMBNAIL_DATA_URL.test(value);
}
