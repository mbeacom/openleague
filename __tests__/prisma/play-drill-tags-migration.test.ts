import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_GOALIES_ATTENDING, PLAY_FOCUS, PLAY_GOALIES } from "@/types/practice-planner";

const sql = readFileSync(
    join(process.cwd(), "prisma/migrations/20261003140000_play_drill_tags_and_session_goalies/migration.sql"),
    "utf8",
);
const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

describe("drill tags and session goalies migration", () => {
    it("adds the play tags with defaults, so existing rows read team / optional", () => {
        expect(sql).toContain(`ADD COLUMN "focus" TEXT NOT NULL DEFAULT 'team'`);
        expect(sql).toContain(`ADD COLUMN "goalies" TEXT NOT NULL DEFAULT 'optional'`);
    });

    it("constrains the values at the database, in step with the code vocabulary", () => {
        expect(sql).toContain(`CHECK ("focus" IN (${PLAY_FOCUS.map((v) => `'${v}'`).join(", ")}))`);
        expect(sql).toContain(`CHECK ("goalies" IN (${PLAY_GOALIES.map((v) => `'${v}'`).join(", ")}))`);
        expect(sql).toContain(`ADD COLUMN "goaliesAttending" INTEGER`);
        expect(sql).toContain(`CHECK ("goaliesAttending" IS NULL OR "goaliesAttending" BETWEEN 0 AND ${MAX_GOALIES_ATTENDING})`);
    });

    it("is additive: nothing is dropped, rewritten or deleted", () => {
        expect(sql).not.toMatch(/\bDROP\b|\bUPDATE\b|\bDELETE\b/i);
    });

    it("matches the Prisma schema's columns", () => {
        expect(schema).toMatch(/focus\s+String\s+@default\("team"\)/);
        expect(schema).toMatch(/goalies\s+String\s+@default\("optional"\)/);
        expect(schema).toMatch(/goaliesAttending\s+Int\?/);
    });
});
