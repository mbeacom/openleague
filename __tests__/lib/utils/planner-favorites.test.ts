import { describe, expect, it } from "vitest";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import {
    favoritesFirst,
    isStarterDrillId,
    listPlannerFavoritesSchema,
    setPlannerFavoriteSchema,
} from "@/lib/utils/planner-favorites";

const CUID = "cjld2cyuq0000t3rmniod1foy";

describe("planner favorite rules", () => {
    it("knows every starter id and nothing else", () => {
        for (const starter of STARTER_PLAYS) expect(isStarterDrillId(starter.id)).toBe(true);
        expect(isStarterDrillId("starter-made-up")).toBe(false);
        expect(isStarterDrillId(CUID)).toBe(false);
    });

    it("accepts a CUID or a starter id for a drill, and only a CUID for a practice", () => {
        const starter = STARTER_PLAYS[0].id;
        expect(setPlannerFavoriteSchema.safeParse({ kind: "DRILL", targetId: CUID, favorite: true }).success).toBe(true);
        expect(setPlannerFavoriteSchema.safeParse({ kind: "DRILL", targetId: starter, favorite: true }).success).toBe(true);
        expect(setPlannerFavoriteSchema.safeParse({ kind: "PRACTICE", targetId: CUID, favorite: false }).success).toBe(true);
        expect(setPlannerFavoriteSchema.safeParse({ kind: "PRACTICE", targetId: starter, favorite: true }).success).toBe(false);
    });

    it("rejects malformed ids, kinds and flags", () => {
        for (const targetId of ["", "not-a-cuid", { not: "x" }, ["a"], undefined]) {
            expect(setPlannerFavoriteSchema.safeParse({ kind: "DRILL", targetId, favorite: true }).success).toBe(false);
        }
        expect(setPlannerFavoriteSchema.safeParse({ kind: "TEAM", targetId: CUID, favorite: true }).success).toBe(false);
        expect(setPlannerFavoriteSchema.safeParse({ kind: "DRILL", targetId: CUID, favorite: "yes" }).success).toBe(false);
        expect(listPlannerFavoritesSchema.safeParse({ kind: "PRACTICE" }).success).toBe(true);
        expect(listPlannerFavoritesSchema.safeParse({ kind: "drill" }).success).toBe(false);
    });

    it("sorts favorites first and keeps the given order within each group", () => {
        const items = [{ id: "a", n: 1 }, { id: "b", n: 2 }, { id: "c", n: 3 }, { id: "d", n: 4 }];
        const starred = new Set(["c", "a"]);
        const sorted = [...items].sort(favoritesFirst((item) => starred.has(item.id), (x, y) => y.n - x.n));
        expect(sorted.map((item) => item.id)).toEqual(["c", "a", "d", "b"]);
    });
});
