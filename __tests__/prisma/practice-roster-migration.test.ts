import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AGE_GROUPS } from "@/lib/utils/age-groups";
import { CUSTOM_ROSTER_ROLE_MAX, ROSTER_NAME_MAX, ROSTER_NUMBER_MAX_DIGITS } from "@/lib/utils/practice-roster";

const sql = readFileSync(join(process.cwd(), "prisma/migrations/20261007160000_practice_session_roster/migration.sql"), "utf8");
const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const model = (name: string) => schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? "";

describe("practice roster migration (roster spec R6)", () => {
    it("adds the session's age group with a CHECK in step with the code, and positions defaulting to none", () => {
        expect(sql).toContain(`ADD COLUMN "rosterAgeGroup" TEXT`);
        expect(sql).toContain(`ADD COLUMN "rosterRoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`);
        expect(sql).toContain(`CHECK ("rosterAgeGroup" IS NULL OR "rosterAgeGroup" IN (${AGE_GROUPS.map((group) => `'${group}'`).join(", ")}))`);
    });

    it("creates the players table with CHECKs in step with the code's limits", () => {
        expect(sql).toContain(`CREATE TABLE "practice_session_roster_players"`);
        expect(sql).toContain(`CHECK ("position" >= 0)`);
        expect(sql).toContain(`CHECK ("name" IS NULL OR char_length("name") BETWEEN 1 AND ${ROSTER_NAME_MAX})`);
        expect(sql).toContain(`CHECK ("number" IS NULL OR "number" ~ '^[0-9]{1,${ROSTER_NUMBER_MAX_DIGITS}}$')`);
        expect(sql).toContain(`CHECK (char_length("role") BETWEEN 1 AND ${CUSTOM_ROSTER_ROLE_MAX})`);
        expect(sql).toContain(`CHECK ("playerId" IS NULL OR ("name" IS NULL AND "number" IS NULL))`);
    });

    it("keeps positions and team players unique per practice", () => {
        expect(sql).toContain(`CREATE UNIQUE INDEX "practice_session_roster_players_sessionId_position_key" ON "practice_session_roster_players"("sessionId", "position");`);
        expect(sql).toContain(`CREATE UNIQUE INDEX "practice_session_roster_players_sessionId_playerId_key" ON "practice_session_roster_players"("sessionId", "playerId");`);
    });

    it("cascades from the practice and from the team player", () => {
        expect(sql).toContain(`FOREIGN KEY ("sessionId") REFERENCES "practice_sessions"("id") ON DELETE CASCADE`);
        expect(sql).toContain(`FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE`);
    });

    it("is additive", () => {
        expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/i);
        expect(sql).not.toMatch(/^\s*(UPDATE|DELETE)\s/im);
        expect(sql).not.toMatch(/ALTER COLUMN/i);
        const altered = [...sql.matchAll(/ALTER TABLE "([^"]+)"/g)].map((match) => match[1]);
        expect(new Set(altered)).toEqual(new Set(["practice_sessions", "practice_session_roster_players"]));
    });

    it("matches the Prisma schema", () => {
        const players = model("PracticeSessionRosterPlayer");
        expect(players).toMatch(/position\s+Int/);
        expect(players).toMatch(/name\s+String\?/);
        expect(players).toMatch(/number\s+String\?/);
        expect(players).toMatch(/role\s+String/);
        expect(players).toMatch(/session\s+PracticeSession\s+@relation\(fields: \[sessionId\], references: \[id\], onDelete: Cascade\)/);
        expect(players).toMatch(/player\s+Player\?\s+@relation\(fields: \[playerId\], references: \[id\], onDelete: Cascade\)/);
        expect(players).toContain("@@unique([sessionId, position])");
        expect(players).toContain("@@unique([sessionId, playerId])");
        expect(players).toContain(`@@map("practice_session_roster_players")`);
        const session = model("PracticeSession");
        expect(session).toMatch(/rosterAgeGroup\s+String\?/);
        expect(session).toMatch(/rosterRoles\s+String\[\]\s+@default\(\[\]\)/);
        expect(session).toMatch(/rosterPlayers\s+PracticeSessionRosterPlayer\[\]/);
        expect(model("Player")).toMatch(/practiceRosters\s+PracticeSessionRosterPlayer\[\]/);
    });
});
