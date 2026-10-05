/**
 * The team logo for bench sheet exports, server side (practice logo spec R1,
 * R2). Server only: sharp is a native module (a Next.js server external
 * package), loaded on first use so nothing else pays for it.
 */
import { LOGO_IMAGE_FALLBACK_PX, LOGO_IMAGE_MAX_PX, LOGO_MAX_BYTES, MAX_LOGO_PNG_BYTES, sniffLogoType } from "./logo-rules";
import type { LogoImage } from "@/types/practice-planner";

export const LOGO_FETCH_TIMEOUT_MS = 5_000;
/** Decoded pixels allowed in (4096 × 4096, about 16.8 million): a 2 MB file can declare enormous dimensions. */
export const LOGO_INPUT_PIXEL_LIMIT = 4096 * 4096;

const DECODABLE_FORMATS = new Set(["png", "jpeg", "webp"]);

export interface FetchLogoOptions {
    timeoutMs?: number;
    maxBytes?: number;
    fetchImpl?: typeof fetch;
}

/**
 * The logo's bytes, or null when the response fails or is larger than the cap
 * (declared or streamed). No redirects: an owned blob URL never redirects.
 * Network errors and the timeout reject; the caller turns them into null.
 */
export async function fetchLogoBytes(
    url: string,
    { timeoutMs = LOGO_FETCH_TIMEOUT_MS, maxBytes = LOGO_MAX_BYTES, fetchImpl = fetch }: FetchLogoOptions = {},
): Promise<Uint8Array | null> {
    const response = await fetchImpl(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok || !response.body) {
        await response.body?.cancel();
        return null;
    }
    const declared = Number(response.headers.get("content-length") ?? Number.NaN);
    if (Number.isFinite(declared) && declared > maxBytes) {
        await response.body.cancel();
        return null;
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel();
            return null;
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

export interface NormalizeLogoOptions {
    maxPngBytes?: number;
    maxInputPixels?: number;
}

/**
 * A PNG within 512×512 (within 256 when the 512 PNG is over the cap), or null
 * for a type other than PNG, JPEG or WebP, or a logo too large either way.
 * Types come from the bytes (sniffLogoType), then from sharp's own reading.
 * A corrupt image or one over the pixel limit rejects.
 */
export async function normalizeLogoBytes(
    bytes: Uint8Array,
    { maxPngBytes = MAX_LOGO_PNG_BYTES, maxInputPixels = LOGO_INPUT_PIXEL_LIMIT }: NormalizeLogoOptions = {},
): Promise<LogoImage | null> {
    if (!sniffLogoType(bytes)) return null;
    const { default: sharp } = await import("sharp");
    const input = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const options = { failOn: "error", limitInputPixels: maxInputPixels } as const;
    const { format } = await sharp(input, options).metadata();
    if (!format || !DECODABLE_FORMATS.has(format)) return null;
    for (const side of [LOGO_IMAGE_MAX_PX, LOGO_IMAGE_FALLBACK_PX]) {
        const { data, info } = await sharp(input, options)
            .rotate()
            .resize({ width: side, height: side, fit: "inside", withoutEnlargement: true })
            .png({ compressionLevel: 9 })
            .toBuffer({ resolveWithObject: true });
        if (data.byteLength <= maxPngBytes) {
            return { dataUrl: `data:image/png;base64,${data.toString("base64")}`, width: info.width, height: info.height };
        }
    }
    return null;
}
