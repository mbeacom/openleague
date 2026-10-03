import { describe, expect, it } from "vitest";
import { isPngDataUri, pngDataUriToBytes } from "@/components/features/practice-planner/export/png";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("isPngDataUri", () => {
    it("accepts a base64 PNG data URI", () => {
        expect(isPngDataUri(PNG)).toBe(true);
    });

    it.each([
        null,
        undefined,
        "",
        "data:,", // what toDataURL returns when the canvas is too large to encode
        "data:image/svg+xml;base64,PHN2Zz4=",
        "data:image/png;base64,abc", // length not a multiple of 4: atob would throw
        'data:image/png;base64,AAAA" onerror="alert(1)',
        "javascript:alert(1)",
        "https://example.com/a.png",
    ])("rejects %j", (value) => {
        expect(isPngDataUri(value)).toBe(false);
    });
});

describe("pngDataUriToBytes", () => {
    it("decodes the PNG signature", () => {
        expect(Array.from(pngDataUriToBytes(PNG).slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    });
});
