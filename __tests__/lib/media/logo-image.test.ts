// @vitest-environment node
/** Server-side logo fetch and normalization (practice logo spec R1, R2). Real images, built with sharp. */
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { LOGO_FETCH_TIMEOUT_MS, LOGO_INPUT_PIXEL_LIMIT, fetchLogoBytes, normalizeLogoBytes } from "@/lib/media/logo-image";
import { isLogoImage } from "@/lib/utils/team-mark";

const solid = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 4, background: { r: 13, g: 71, b: 161, alpha: 1 } } });
const png = async (width: number, height: number) => new Uint8Array(await solid(width, height).png().toBuffer());

/** Deterministic noise: compresses badly, so its PNG size depends on its pixel count. */
async function noisePng(side: number): Promise<Uint8Array> {
    const raw = Buffer.alloc(side * side * 3);
    let seed = 12345;
    for (let i = 0; i < raw.length; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        raw[i] = seed & 0xff;
    }
    return new Uint8Array(await sharp(raw, { raw: { width: side, height: side, channels: 3 } }).png().toBuffer());
}

function decodeSize(dataUrl: string) {
    return sharp(Buffer.from(dataUrl.split(",")[1], "base64")).metadata();
}

describe("normalizeLogoBytes", () => {
    it("fits a wide PNG within 512, keeps the ratio and returns a valid logo", async () => {
        const logo = await normalizeLogoBytes(await png(1024, 256));
        expect(logo).toMatchObject({ width: 512, height: 128 });
        expect(isLogoImage(logo)).toBe(true);
        const meta = await decodeSize(logo!.dataUrl);
        expect([meta.format, meta.width, meta.height]).toEqual(["png", 512, 128]);
    });

    it("keeps a wordmark's shape and never upscales a small logo", async () => {
        expect(await normalizeLogoBytes(await png(1200, 200))).toMatchObject({ width: 512, height: 85 });
        expect(await normalizeLogoBytes(await png(100, 50))).toMatchObject({ width: 100, height: 50 });
    });

    it("accepts JPEG and WebP and returns PNG", async () => {
        const jpeg = new Uint8Array(await solid(640, 640).jpeg().toBuffer());
        const webp = new Uint8Array(await solid(300, 600).webp().toBuffer());
        expect(await normalizeLogoBytes(jpeg)).toMatchObject({ width: 512, height: 512 });
        expect(await normalizeLogoBytes(webp)).toMatchObject({ width: 256, height: 512 });
        expect((await normalizeLogoBytes(webp))!.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    });

    it("refuses SVG and GIF by their bytes, before decoding", async () => {
        const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
        const gif = new Uint8Array(await solid(10, 10).gif().toBuffer());
        expect(await normalizeLogoBytes(svg)).toBeNull();
        expect(await normalizeLogoBytes(gif)).toBeNull();
    });

    it("encodes again within 256 when the 512 PNG is too large, and refuses when that is too", async () => {
        const source = await noisePng(600);
        const at512 = (await normalizeLogoBytes(source, { maxPngBytes: Number.MAX_SAFE_INTEGER }))!;
        const bytes512 = Buffer.from(at512.dataUrl.split(",")[1], "base64").byteLength;
        const smaller = await normalizeLogoBytes(source, { maxPngBytes: bytes512 - 1 });
        expect(smaller).toMatchObject({ width: 256, height: 256 });
        expect(await normalizeLogoBytes(source, { maxPngBytes: 1000 })).toBeNull();
    });

    it("rejects a corrupt image and an image over the pixel limit (the caller turns both into null)", async () => {
        const truncated = (await png(64, 64)).slice(0, 40);
        await expect(normalizeLogoBytes(truncated)).rejects.toThrow();
        await expect(normalizeLogoBytes(await png(20, 20), { maxInputPixels: 100 })).rejects.toThrow();
        expect(LOGO_INPUT_PIXEL_LIMIT).toBe(4096 * 4096);
    });
});

describe("fetchLogoBytes", () => {
    const URL_ = "https://abc.public.blob.vercel-storage.com/branding/team/t1/logo.png";

    it("asks for no redirects, no cache and a 5 s timeout, and returns the body", async () => {
        const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(new Uint8Array([1, 2, 3])));
        expect(await fetchLogoBytes(URL_, { fetchImpl })).toEqual(new Uint8Array([1, 2, 3]));
        const init = fetchImpl.mock.calls[0][1] as RequestInit;
        expect([init.redirect, init.cache, init.signal instanceof AbortSignal]).toEqual(["error", "no-store", true]);
        expect(LOGO_FETCH_TIMEOUT_MS).toBe(5000);
    });

    it("returns null for a failed response and for a declared size over the cap", async () => {
        expect(await fetchLogoBytes(URL_, { fetchImpl: async () => new Response("gone", { status: 404 }) })).toBeNull();
        const declared = new Response(new Uint8Array(10), { headers: { "content-length": "11" } });
        expect(await fetchLogoBytes(URL_, { maxBytes: 10, fetchImpl: async () => declared })).toBeNull();
    });

    it("stops reading once the streamed body passes the cap", async () => {
        let pulls = 0;
        const body = new ReadableStream<Uint8Array>({
            pull(controller) {
                pulls += 1;
                controller.enqueue(new Uint8Array(6));
            },
        });
        expect(await fetchLogoBytes(URL_, { maxBytes: 10, fetchImpl: async () => new Response(body) })).toBeNull();
        expect(pulls).toBeLessThan(5);
    });

    it("rejects when the timeout passes", async () => {
        const fetchImpl = (_url: string | URL | Request, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
        await expect(fetchLogoBytes(URL_, { timeoutMs: 20, fetchImpl: fetchImpl as typeof fetch })).rejects.toThrow();
    });
});
