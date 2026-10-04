import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    MAX_BLOCK_LABEL_LENGTH,
    MAX_ROTATE_MINUTES,
    MAX_TRANSITION_MINUTES,
    MIN_ROTATE_MINUTES,
    SESSION_ROW_KINDS,
} from "@/types/practice-planner";

const sql = readFileSync(join(process.cwd(), "prisma/migrations/20261004120000_practice_session_timing/migration.sql"), "utf8");
const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const model = (name: string) => schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? "";

describe("practice timing migration", () => {
    it("adds the columns with defaults, so existing rows read as drills that don't rotate and sessions have no gap", () => {
        expect(sql).toContain(`ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'drill'`);
        expect(sql).toContain(`ADD COLUMN "label" TEXT;`);
        expect(sql).toContain(`ADD COLUMN "stays" BOOLEAN NOT NULL DEFAULT false`);
        expect(sql).toContain(`ADD COLUMN "rotateEveryMinutes" INTEGER;`);
        expect(sql).toContain(`ADD COLUMN "transitionMinutes" INTEGER NOT NULL DEFAULT 0`);
    });

    it("lets a block row, and only a block row, have no play", () => {
        expect(sql).toContain(`ALTER COLUMN "playId" DROP NOT NULL`);
        expect(sql).toContain(`CHECK (("kind" = 'drill') = ("playId" IS NOT NULL))`);
    });

    it("constrains the values at the database, in step with the code vocabulary", () => {
        expect(sql).toContain(`CHECK ("kind" IN (${SESSION_ROW_KINDS.map((kind) => `'${kind}'`).join(", ")}))`);
        expect(sql).toContain(`CHECK ("label" IS NULL OR char_length("label") <= ${MAX_BLOCK_LABEL_LENGTH})`);
        expect(sql).toContain(`CHECK ("rotateEveryMinutes" IS NULL OR "rotateEveryMinutes" BETWEEN ${MIN_ROTATE_MINUTES} AND ${MAX_ROTATE_MINUTES})`);
        expect(sql).toContain(`CHECK ("transitionMinutes" BETWEEN 0 AND ${MAX_TRANSITION_MINUTES})`);
    });

    it("is additive and leaves the deferrable play foreign key exactly as it is", () => {
        expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/i);
        expect(sql).not.toMatch(/\bUPDATE\b|\bDELETE\b/i);
        expect(sql).not.toContain("practice_session_plays_playId_fkey");
    });

    it("matches the Prisma schema, which keeps the deferrable foreign key's note", () => {
        const row = model("PracticeSessionPlay");
        expect(row).toMatch(/kind\s+String\s+@default\("drill"\)/);
        expect(row).toMatch(/label\s+String\?/);
        expect(row).toMatch(/stays\s+Boolean\s+@default\(false\)/);
        expect(row).toMatch(/rotateEveryMinutes\s+Int\?/);
        expect(row).toMatch(/playId\s+String\?/);
        expect(row).toMatch(/play\s+Play\?\s+@relation\(fields: \[playId\], references: \[id\], onDelete: NoAction\)/);
        expect(row).toContain("DEFERRABLE INITIALLY DEFERRED");
        expect(model("PracticeSession")).toMatch(/transitionMinutes\s+Int\s+@default\(0\)/);
    });
});
