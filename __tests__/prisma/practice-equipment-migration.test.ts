import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "prisma/migrations/20261007130000_practice_session_equipment/migration.sql"), "utf8");
const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

describe("practice equipment migration", () => {
    it("adds the column with an empty list default, so existing practices read as none", () => {
        expect(sql).toContain(`ALTER TABLE "practice_sessions" ADD COLUMN "equipment" JSONB NOT NULL DEFAULT '[]';`);
    });

    it("is additive: nothing is dropped, rewritten or deleted", () => {
        expect(sql).not.toMatch(/\bDROP\b|\bUPDATE\b|\bDELETE\b/i);
    });

    it("matches the Prisma schema's column", () => {
        const model = schema.slice(schema.indexOf("model PracticeSession {"), schema.indexOf("model PracticeSessionPlay {"));
        expect(model).toMatch(/\n\s+equipment\s+Json\s+@default\("\[\]"\)/);
    });
});
