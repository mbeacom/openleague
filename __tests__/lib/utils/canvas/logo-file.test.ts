/** normalizeLogoFile: the static upload (practice logo spec R4), the browser half of the shared normalization rule. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    LOGO_FILE_SIZE_MESSAGE,
    LOGO_TOO_DETAILED_MESSAGE,
    LOGO_TYPE_MESSAGE,
    LOGO_UNREADABLE_MESSAGE,
    normalizeLogoFile,
} from "@/lib/utils/canvas/logo-file";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const OVER_CAP = `data:image/png;base64,${"A".repeat(273_068)}`; // 204,801 bytes
const u32be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
/** A PNG signature and IHDR declaring width × height. */
const pngHead = (width: number, height: number) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...u32be(13), 0x49, 0x48, 0x44, 0x52, ...u32be(width), ...u32be(height), 8, 6, 0, 0, 0];
const PNG_HEAD = pngHead(1024, 256);

const file = (head: number[], size = 64, type = "image/png") => {
    const bytes = new Uint8Array(size);
    bytes.set(head);
    return new File([bytes], "logo.png", { type });
};

let bitmap: { width: number; height: number; close: ReturnType<typeof vi.fn> };
let ctx: Record<string, ReturnType<typeof vi.fn>>;
let sizes: Array<[number, number]>;

beforeEach(() => {
    bitmap = { width: 1024, height: 256, close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
    ctx = { drawImage: vi.fn() };
    sizes = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
        sizes.push([this.width, this.height]);
        return ctx;
    } as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(PNG);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("normalizeLogoFile", () => {
    it("fits the image within 512, keeps the ratio, encodes PNG and frees the bitmap", async () => {
        expect(await normalizeLogoFile(file(PNG_HEAD))).toEqual({ ok: true, logo: { dataUrl: PNG, width: 512, height: 128 } });
        expect(sizes).toEqual([[512, 128]]);
        expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 512, 128);
        expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith("image/png");
        expect(bitmap.close).toHaveBeenCalled();
    });

    it("encodes again within 256 when the 512 PNG is over 200 KB", async () => {
        vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockReturnValueOnce(OVER_CAP).mockReturnValueOnce(PNG);
        expect(await normalizeLogoFile(file(PNG_HEAD))).toEqual({ ok: true, logo: { dataUrl: PNG, width: 256, height: 64 } });
        expect(sizes).toEqual([[512, 128], [256, 64]]);
    });

    it("refuses a logo still over 200 KB at 256", async () => {
        vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockReturnValue(OVER_CAP);
        expect(await normalizeLogoFile(file(PNG_HEAD))).toEqual({ ok: false, error: LOGO_TOO_DETAILED_MESSAGE });
        expect(bitmap.close).toHaveBeenCalled();
    });

    it("accepts JPEG and WebP by their bytes, and never upscales", async () => {
        bitmap = { width: 100, height: 40, close: vi.fn() };
        // SOI, then an SOF0 frame declaring 40 × 100.
        const jpeg = [0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 40, 0, 100, 1, 1, 0x11, 0];
        expect(await normalizeLogoFile(file(jpeg, 64, "image/jpeg"))).toMatchObject({ ok: true, logo: { width: 100, height: 40 } });
        // RIFF....WEBP with a VP8X chunk declaring 100 × 40 (stored minus one).
        const webp = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, 0, 0, 0, 0, 99, 0, 0, 39, 0, 0];
        expect(await normalizeLogoFile(file(webp, 64, "image/webp"))).toMatchObject({ ok: true });
    });

    it("refuses an SVG renamed .png and a GIF by their bytes, before decoding", async () => {
        const svg = [...new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')];
        expect(await normalizeLogoFile(file(svg, 64))).toEqual({ ok: false, error: LOGO_TYPE_MESSAGE });
        expect(await normalizeLogoFile(file([...new TextEncoder().encode("GIF89a")]))).toEqual({ ok: false, error: LOGO_TYPE_MESSAGE });
        expect(createImageBitmap).not.toHaveBeenCalled();
    });

    it("refuses an image whose header declares more than 4096 × 4096 pixels, before decoding", async () => {
        expect(await normalizeLogoFile(file(pngHead(4097, 4096)))).toEqual({ ok: false, error: LOGO_TOO_DETAILED_MESSAGE });
        expect(await normalizeLogoFile(file(pngHead(65_535, 300)))).toEqual({ ok: false, error: LOGO_TOO_DETAILED_MESSAGE });
        expect(createImageBitmap).not.toHaveBeenCalled();
        expect(await normalizeLogoFile(file(pngHead(4096, 4096)))).toMatchObject({ ok: true });
    });

    it("refuses an image whose size can't be read from its header, before decoding", async () => {
        // A PNG signature with no IHDR, and a JPEG with no frame header.
        expect(await normalizeLogoFile(file([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toEqual({ ok: false, error: LOGO_UNREADABLE_MESSAGE });
        expect(await normalizeLogoFile(file([0xff, 0xd8, 0xff, 0xe0], 64, "image/jpeg"))).toEqual({ ok: false, error: LOGO_UNREADABLE_MESSAGE });
        expect(createImageBitmap).not.toHaveBeenCalled();
    });

    it("refuses a file that can't be read", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const unreadable = {
            size: 64,
            slice: () => ({ arrayBuffer: () => Promise.reject(new DOMException("gone", "NotReadableError")) }),
        } as unknown as Blob;
        expect(await normalizeLogoFile(unreadable)).toEqual({ ok: false, error: LOGO_UNREADABLE_MESSAGE });
        expect(console.warn).toHaveBeenCalledWith(expect.any(String), "NotReadableError");
        expect(createImageBitmap).not.toHaveBeenCalled();
    });

    it("refuses a file over 2 MB", async () => {
        expect(await normalizeLogoFile(file(PNG_HEAD, 2 * 1024 * 1024 + 1))).toEqual({ ok: false, error: LOGO_FILE_SIZE_MESSAGE });
    });

    it("refuses an image the browser can't decode, or a canvas that gives no PNG", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.mocked(createImageBitmap).mockRejectedValueOnce(new DOMException("bad", "InvalidStateError"));
        expect(await normalizeLogoFile(file(PNG_HEAD))).toEqual({ ok: false, error: LOGO_UNREADABLE_MESSAGE });
        vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockReturnValue("data:,");
        expect(await normalizeLogoFile(file(PNG_HEAD))).toEqual({ ok: false, error: LOGO_UNREADABLE_MESSAGE });
    });
});
