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

/** Thumbnails that are stored (library, static store) are generated at 2×: library cards show them larger than 300×128. */
export const STORED_THUMBNAIL_PIXEL_RATIO = 2;

/**
 * The look stored thumbnails are drawn in. Bump it when the renderer's look
 * changes, so the static planner redraws its stored thumbnails once.
 * 3: the playbook style (rink diagram quality spec §3).
 */
export const THUMBNAIL_STYLE_VERSION = 3;

/** A stored thumbnail narrower than this was made before 2× storage (300 logical px × STORED_THUMBNAIL_PIXEL_RATIO). */
export const STORED_THUMBNAIL_MIN_WIDTH = 600;

const PNG_PREFIX = "data:image/png;base64,";
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A PNG data URL's pixel width from its IHDR chunk; null for anything else or anything unreadable. */
export function thumbnailPixelWidth(dataUrl: string): number | null {
    if (!dataUrl.startsWith(PNG_PREFIX)) return null;
    let header: string;
    try {
        // 32 base64 characters decode to the 24 bytes holding the signature, IHDR and width.
        header = atob(dataUrl.slice(PNG_PREFIX.length, PNG_PREFIX.length + 32));
    } catch {
        return null;
    }
    if (header.length < 24) return null;
    if (PNG_SIGNATURE.some((byte, i) => header.charCodeAt(i) !== byte)) return null;
    if (header.slice(12, 16) !== "IHDR") return null;
    return ((header.charCodeAt(16) << 24) | (header.charCodeAt(17) << 16) | (header.charCodeAt(18) << 8) | header.charCodeAt(19)) >>> 0;
}
