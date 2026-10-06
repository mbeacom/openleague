import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AGE_GROUPS } from "@/lib/utils/age-groups";

const sql = readFileSync(join(process.cwd(), "prisma/migrations/20261005130000_play_age_groups/migration.sql"), "utf8");
const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

describe("drill age groups migration", () => {
    it("adds the column with an empty default, so existing plays read as every age", () => {
        expect(sql).toContain(`ADD COLUMN "ageGroups" TEXT[] NOT NULL DEFAULT '{}'::TEXT[]`);
    });

    it("constrains the values at the database, in step with the code vocabulary", () => {
        expect(sql).toContain(`ADD CONSTRAINT "plays_age_groups_check"`);
        expect(sql).toContain(`CHECK ("ageGroups" <@ ARRAY[${AGE_GROUPS.map((value) => `'${value}'`).join(", ")}]::TEXT[])`);
    });

    it("is additive: nothing is dropped, rewritten or deleted", () => {
        expect(sql).not.toMatch(/\bDROP\b|\bUPDATE\b|\bDELETE\b/i);
    });

    it("matches the Prisma schema's column", () => {
        expect(schema).toMatch(/ageGroups\s+String\[\]\s+@default\(\[\]\)/);
    });
});
