/** The thumbnail rule shared by the hosted schemas (validation.ts) and the static planner store. */
import { describe, expect, it } from "vitest";
import { MAX_THUMBNAIL_SIZE, STORED_THUMBNAIL_MIN_WIDTH, THUMBNAIL_DATA_URL, isAcceptableThumbnail, thumbnailPixelWidth } from "@/lib/utils/thumbnail-rules";
import { createPlaySchema } from "@/lib/utils/validation";
import { thumbnailOrNull } from "@/apps/planner/src/store/shared";

const PREFIX = "data:image/png;base64,";

describe("thumbnail rules", () => {
    it("accepts png, jpeg, jpg and webp data URLs only", () => {
        for (const type of ["png", "jpeg", "jpg", "webp"]) expect(THUMBNAIL_DATA_URL.test(`data:image/${type};base64,AAAA`)).toBe(true);
        for (const bad of ["data:image/svg+xml;base64,AAAA", "https://x/a.png", "data:image/png,AAAA"]) {
            expect(THUMBNAIL_DATA_URL.test(bad)).toBe(false);
        }
    });

    it("caps the length at MAX_THUMBNAIL_SIZE", () => {
        expect(MAX_THUMBNAIL_SIZE).toBe(1000000);
        expect(isAcceptableThumbnail(PREFIX + "A".repeat(MAX_THUMBNAIL_SIZE - PREFIX.length))).toBe(true);
        expect(isAcceptableThumbnail(PREFIX + "A".repeat(MAX_THUMBNAIL_SIZE - PREFIX.length + 1))).toBe(false);
    });

    it("agrees with the hosted createPlaySchema and the static store on every case", () => {
        const cases = [
            PREFIX + "AAAA",
            "data:image/webp;base64,AAAA",
            "data:image/svg+xml;base64,AAAA",
            "not a data url",
            PREFIX + "A".repeat(MAX_THUMBNAIL_SIZE - PREFIX.length),
            PREFIX + "A".repeat(MAX_THUMBNAIL_SIZE - PREFIX.length + 1),
        ];
        const base = { name: "Drill", playData: { players: [], drawings: [], equipment: [], annotations: [] } };
        for (const thumbnail of cases) {
            const result = createPlaySchema.safeParse({ ...base, thumbnail });
            const hosted = !(result.error?.issues ?? []).some((issue) => issue.path.includes("thumbnail"));
            expect(isAcceptableThumbnail(thumbnail)).toBe(hosted);
            expect(thumbnailOrNull(thumbnail) !== null).toBe(hosted);
        }
    });
});

/** A minimal PNG header: signature, IHDR length and type, width, height. */
function pngHeader(width: number, height: number): string {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(bytes.buffer).setUint32(16, width);
    new DataView(bytes.buffer).setUint32(20, height);
    return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;
}

describe("thumbnailPixelWidth", () => {
    it("reads a PNG's width from its header", () => {
        expect(thumbnailPixelWidth(pngHeader(300, 128))).toBe(300);
        expect(thumbnailPixelWidth(pngHeader(600, 256))).toBe(600);
    });

    it.each([
        ["a JPEG", "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=="],
        ["malformed base64", "data:image/png;base64,***"],
        ["too short", "data:image/png;base64,iVBORw0K"],
        ["not a data URL", "https://example.com/x.png"],
        ["wrong signature", `data:image/png;base64,${btoa("x".repeat(24))}`],
    ])("returns null for %s", (_name, value) => {
        expect(thumbnailPixelWidth(value)).toBeNull();
    });

    it("names the stored minimum: 300 px at 2×", () => {
        expect(STORED_THUMBNAIL_MIN_WIDTH).toBe(600);
    });
});
