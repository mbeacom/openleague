/**
 * A logo's declared pixel size, read from its header bytes before anything
 * decodes it (practice logo spec R4): a small file can declare an enormous
 * image. PNG (IHDR), JPEG (the first SOFn frame) and WebP (VP8, VP8L, VP8X).
 * Pure and portable. Null when the header is missing, truncated or unknown.
 */
import { LOGO_INPUT_PIXEL_LIMIT } from "@/lib/media/logo-rules";

export interface ImageDimensions {
    width: number;
    height: number;
}

const sized = (width: number, height: number): ImageDimensions | null => (width > 0 && height > 0 ? { width, height } : null);
const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);
const has = (b: Uint8Array, i: number, text: string) => b.length >= i + text.length && [...text].every((c, k) => b[i + k] === c.charCodeAt(0));

function png(b: Uint8Array): ImageDimensions | null {
    if (b.length < 24 || !has(b, 12, "IHDR")) return null;
    return sized(u32be(b, 16), u32be(b, 20));
}

/** SOF0–SOF15 carry the frame size; C4 (DHT), C8 (JPG) and CC (DAC) share the range but don't. */
const isFrameMarker = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

function jpeg(b: Uint8Array): ImageDimensions | null {
    let i = 2;
    while (i + 1 < b.length) {
        if (b[i] !== 0xff) return null;
        const marker = b[i + 1];
        if (marker === 0xff) {
            i += 1; // fill byte
            continue;
        }
        i += 2;
        // Markers without a length: TEM and RST0–RST7.
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        // The scan or the end of the image, with no frame before it.
        if (marker === 0xda || marker === 0xd9) return null;
        if (i + 2 > b.length) return null;
        const length = u16be(b, i);
        if (length < 2) return null;
        if (isFrameMarker(marker)) {
            if (i + 7 > b.length) return null;
            return sized(u16be(b, i + 5), u16be(b, i + 3));
        }
        i += length;
    }
    return null;
}

function webp(b: Uint8Array): ImageDimensions | null {
    if (has(b, 12, "VP8 ")) {
        // Frame tag (3 bytes), then the start code 9D 01 2A, then 14-bit sides.
        if (b.length < 30 || b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
        return sized(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
    }
    if (has(b, 12, "VP8L")) {
        if (b.length < 25 || b[20] !== 0x2f) return null;
        const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
        return sized((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
    if (has(b, 12, "VP8X")) {
        if (b.length < 30) return null;
        return sized(u24le(b, 24) + 1, u24le(b, 27) + 1);
    }
    return null;
}

export function readImageDimensions(bytes: Uint8Array): ImageDimensions | null {
    if (has(bytes, 0, "\x89PNG\r\n\x1a\n")) return png(bytes);
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return jpeg(bytes);
    if (has(bytes, 0, "RIFF") && has(bytes, 8, "WEBP")) return webp(bytes);
    return null;
}

/** True when decoding would mean more pixels than LOGO_INPUT_PIXEL_LIMIT. */
export function exceedsPixelLimit({ width, height }: ImageDimensions): boolean {
    return width * height > LOGO_INPUT_PIXEL_LIMIT;
}
