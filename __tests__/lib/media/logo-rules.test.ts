/** Logo rules shared by the hosted upload, the hosted export logo and the static upload (practice logo spec R1, R2, R4). */
import { describe, expect, it } from "vitest";
import {
    LOGO_ACCEPT,
    LOGO_CONTENT_TYPES,
    LOGO_IMAGE_FALLBACK_PX,
    LOGO_IMAGE_MAX_PX,
    LOGO_MAX_BYTES,
    MAX_LOGO_PNG_BYTES,
    fitWithin,
    sniffLogoType,
} from "@/lib/media/logo-rules";
import { LOGO_CONTENT_TYPES as BLOB_LOGO_CONTENT_TYPES, LOGO_MAX_BYTES as BLOB_LOGO_MAX_BYTES } from "@/lib/media/blob";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);

describe("logo limits", () => {
    it("keeps the hosted upload limits and shares them with blob.ts", () => {
        expect(LOGO_MAX_BYTES).toBe(2 * 1024 * 1024);
        expect([...LOGO_CONTENT_TYPES]).toEqual(["image/jpeg", "image/png", "image/webp"]);
        expect(BLOB_LOGO_MAX_BYTES).toBe(LOGO_MAX_BYTES);
        expect(BLOB_LOGO_CONTENT_TYPES).toBe(LOGO_CONTENT_TYPES);
        expect(LOGO_ACCEPT).toBe("image/jpeg,image/png,image/webp");
        expect([LOGO_IMAGE_MAX_PX, LOGO_IMAGE_FALLBACK_PX, MAX_LOGO_PNG_BYTES]).toEqual([512, 256, 204800]);
    });
});

describe("sniffLogoType", () => {
    it("recognizes PNG, JPEG and WebP by their first bytes", () => {
        expect(sniffLogoType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toBe("image/png");
        expect(sniffLogoType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
        expect(sniffLogoType(new Uint8Array([...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP")]))).toBe("image/webp");
    });

    it("refuses SVG, GIF, a RIFF that isn't WebP, empty and truncated input", () => {
        expect(sniffLogoType(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
        expect(sniffLogoType(ascii("GIF89a"))).toBeNull();
        expect(sniffLogoType(new Uint8Array([...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WAVE")]))).toBeNull();
        expect(sniffLogoType(new Uint8Array())).toBeNull();
        expect(sniffLogoType(bytes(0x89, 0x50, 0x4e))).toBeNull();
    });
});

describe("fitWithin", () => {
    it("keeps the aspect ratio and never upscales", () => {
        expect(fitWithin(1024, 256, 512)).toEqual({ width: 512, height: 128 });
        expect(fitWithin(1200, 200, 512)).toEqual({ width: 512, height: 85 });
        expect(fitWithin(100, 800, 512)).toEqual({ width: 64, height: 512 });
        expect(fitWithin(100, 50, 512)).toEqual({ width: 100, height: 50 });
    });

    it("keeps at least one pixel on each side, and refuses an empty image", () => {
        expect(fitWithin(5000, 1, 512)).toEqual({ width: 512, height: 1 });
        expect(() => fitWithin(0, 10, 512)).toThrow(RangeError);
    });
});
