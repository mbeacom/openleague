/** The thumbnail rule shared by the hosted schemas (validation.ts) and the static planner store. */
import { describe, expect, it } from "vitest";
import { MAX_THUMBNAIL_SIZE, THUMBNAIL_DATA_URL, isAcceptableThumbnail } from "@/lib/utils/thumbnail-rules";
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
