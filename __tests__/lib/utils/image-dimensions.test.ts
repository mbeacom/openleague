/** readImageDimensions: a logo's declared size from its header bytes, read before any decode (practice logo spec R4). */
import { describe, expect, it } from "vitest";
import { exceedsPixelLimit, readImageDimensions } from "@/lib/utils/image-dimensions";

const u32be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16be = (n: number) => [(n >>> 8) & 255, n & 255];
const u16le = (n: number) => [n & 255, (n >>> 8) & 255];
const u24le = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const bytes = (...parts: number[][]) => new Uint8Array(parts.flat());

function pngHeader(width: number, height: number): Uint8Array {
    return bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], u32be(13), ascii("IHDR"), u32be(width), u32be(height), [8, 6, 0, 0, 0]);
}

function jpegHeader(width: number, height: number, sof = 0xc0): Uint8Array {
    return bytes(
        [0xff, 0xd8],
        [0xff, 0xe0], u16be(16), ascii("JFIF"), [0, 1, 1, 0, 0, 1, 0, 1, 0, 0],
        [0xff, 0xc4], u16be(4), [0, 0], // a DHT before the frame: its length is skipped
        [0xff, sof], u16be(11), [8], u16be(height), u16be(width), [1, 1, 0x11, 0],
    );
}

const riff = (chunk: string, payload: number[]) => bytes(ascii("RIFF"), [0, 0, 0, 0], ascii("WEBP"), ascii(chunk), [0, 0, 0, 0], payload);

describe("readImageDimensions", () => {
    it("reads a PNG's IHDR", () => {
        expect(readImageDimensions(pngHeader(1200, 200))).toEqual({ width: 1200, height: 200 });
    });

    it("reads a baseline and a progressive JPEG frame, skipping the segments before it", () => {
        expect(readImageDimensions(jpegHeader(640, 480))).toEqual({ width: 640, height: 480 });
        expect(readImageDimensions(jpegHeader(100, 800, 0xc2))).toEqual({ width: 100, height: 800 });
    });

    it("reads WebP VP8, VP8L and VP8X headers", () => {
        const vp8 = riff("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, ...u16le(300), ...u16le(150)]);
        expect(readImageDimensions(vp8)).toEqual({ width: 300, height: 150 });
        const w = 299, h = 99; // stored minus one, 14 bits each
        const bits = w | (h << 14);
        const vp8l = riff("VP8L", [0x2f, bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, (bits >>> 24) & 255]);
        expect(readImageDimensions(vp8l)).toEqual({ width: 300, height: 100 });
        const vp8x = riff("VP8X", [0, 0, 0, 0, ...u24le(4999), ...u24le(2999)]);
        expect(readImageDimensions(vp8x)).toEqual({ width: 5000, height: 3000 });
    });

    it("gives null for a truncated header, a zero side or another format", () => {
        expect(readImageDimensions(pngHeader(10, 10).slice(0, 20))).toBeNull();
        expect(readImageDimensions(pngHeader(0, 10))).toBeNull();
        expect(readImageDimensions(jpegHeader(640, 480).slice(0, 30))).toBeNull();
        expect(readImageDimensions(bytes([0xff, 0xd8], [0xff, 0xda], u16be(8)))).toBeNull(); // scan data before any frame
        expect(readImageDimensions(riff("VP8 ", [0, 0, 0, 0, 0, 0, ...u16le(300), ...u16le(150)]))).toBeNull(); // no start code
        expect(readImageDimensions(riff("ALPH", [0, 0, 0, 0, 0, 0]))).toBeNull();
        expect(readImageDimensions(new Uint8Array(ascii("GIF89a")))).toBeNull();
    });
});

describe("exceedsPixelLimit", () => {
    it("allows 4096 × 4096 and refuses one pixel more, or a long thin image of the same area", () => {
        expect(exceedsPixelLimit({ width: 4096, height: 4096 })).toBe(false);
        expect(exceedsPixelLimit({ width: 4097, height: 4096 })).toBe(true);
        expect(exceedsPixelLimit({ width: 65535, height: 300 })).toBe(true);
    });
});
