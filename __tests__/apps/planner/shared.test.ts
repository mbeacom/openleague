import { describe, expect, it } from "vitest";
import { MAX_THUMBNAIL_SIZE, thumbnailOrNull } from "@/apps/planner/src/store/shared";

describe("thumbnailOrNull", () => {
    it.each(["png", "jpeg", "jpg", "webp"])("keeps a base64 %s data URL", (type) => {
        const url = `data:image/${type};base64,AAAA`;
        expect(thumbnailOrNull(url)).toBe(url);
    });

    it.each([
        ["an SVG data URL", "data:image/svg+xml;base64,PHN2Zz4="],
        ["a non-base64 image", "data:image/png,raw"],
        ["a GIF", "data:image/gif;base64,AAAA"],
        ["a remote URL", "https://example.com/a.png"],
        ["an empty string", ""],
    ])("drops %s", (_label, value) => {
        expect(thumbnailOrNull(value)).toBeNull();
    });

    it("drops a thumbnail over hosted's size cap and keeps one at it", () => {
        const prefix = "data:image/png;base64,";
        const atCap = prefix + "A".repeat(MAX_THUMBNAIL_SIZE - prefix.length);
        expect(thumbnailOrNull(atCap)).toBe(atCap);
        expect(thumbnailOrNull(atCap + "A")).toBeNull();
    });

    it("maps missing values to null", () => {
        expect(thumbnailOrNull(null)).toBeNull();
        expect(thumbnailOrNull(undefined)).toBeNull();
    });
});
