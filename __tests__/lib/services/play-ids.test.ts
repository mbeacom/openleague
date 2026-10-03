import { describe, expect, it } from "vitest";
import { z } from "zod";
import { newPlayId } from "@/lib/services/play-ids";

describe("newPlayId", () => {
    it("is cuid-shaped and unique", () => {
        const ids = Array.from({ length: 200 }, () => newPlayId());
        for (const id of ids) {
            expect(id).toMatch(/^c[0-9a-z]{24}$/);
            expect(z.string().cuid().safeParse(id).success).toBe(true);
        }
        expect(new Set(ids).size).toBe(ids.length);
    });
});
