/**
 * Crest logo rules shared by the hosted upload route, the hosted export logo
 * (lib/media/logo-image.ts) and the static planner's "Your team" upload.
 * Pure and portable: no Node, Next.js or storage import, so the static
 * planner can load it (blob.ts imports @vercel/blob and can't be).
 */

/**
 * Crest logos. Kept well under the gallery's image cap: these render at 104px
 * at the very largest, so a multi-megabyte upload is pure waste on every page
 * that shows the crest.
 */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** SVG is deliberately absent — it is a script-execution vector. */
export const LOGO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type LogoContentType = (typeof LOGO_CONTENT_TYPES)[number];

/** For a file input's accept attribute. */
export const LOGO_ACCEPT = LOGO_CONTENT_TYPES.join(",");

/** A bench sheet or export logo fits this square (spec R2)… */
export const LOGO_IMAGE_MAX_PX = 512;
/** …and is encoded again within this one when its PNG is too large. */
export const LOGO_IMAGE_FALLBACK_PX = 256;
/** The largest normalized logo PNG, decoded bytes (spec R4). */
export const MAX_LOGO_PNG_BYTES = 200 * 1024;

function startsWith(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
    if (bytes.length < offset + expected.length) return false;
    return expected.every((value, index) => bytes[offset + index] === value);
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

/** The logo type from the file's first bytes: never from a name, an extension or a content-type header. */
export function sniffLogoType(bytes: Uint8Array): LogoContentType | null {
    if (startsWith(bytes, 0, PNG)) return "image/png";
    if (startsWith(bytes, 0, JPEG)) return "image/jpeg";
    if (startsWith(bytes, 0, RIFF) && startsWith(bytes, 8, WEBP)) return "image/webp";
    return null;
}

/** The size that fits within max × max, keeping the ratio, never upscaling, at least 1 px a side. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
    if (!(width > 0 && height > 0)) throw new RangeError("An image needs a positive width and height");
    const scale = Math.min(1, max / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
