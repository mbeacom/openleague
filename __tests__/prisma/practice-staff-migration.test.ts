import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STAFF_NAME_MAX } from "@/types/practice-planner";

const sql = readFileSync(join(process.cwd(), "prisma/migrations/20261005120000_practice_session_staff/migration.sql"), "utf8");
const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const model = (name: string) => schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? "";

describe("practice staff migration", () => {
    it("creates the staff list with its CHECKs, in step with the code's name limit", () => {
        expect(sql).toContain(`CREATE TABLE "practice_session_staff"`);
        expect(sql).toContain(`CHECK (char_length("name") BETWEEN 1 AND ${STAFF_NAME_MAX})`);
        expect(sql).toContain(`CONSTRAINT "practice_session_staff_position_check" CHECK ("position" >= 0)`);
        expect(sql).toContain(`CHECK (num_nonnulls("teamOfficialId", "userId") <= 1)`);
    });

    it("keeps positions and names unique per practice, names ignoring case through a hand-written expression index", () => {
        expect(sql).toContain(`CREATE UNIQUE INDEX "practice_session_staff_sessionId_position_key" ON "practice_session_staff"("sessionId", "position");`);
        expect(sql).toContain(`CREATE UNIQUE INDEX "practice_session_staff_sessionId_lower_name_key" ON "practice_session_staff"("sessionId", lower("name"));`);
    });

    it("creates the row assignments, one per row and person, ordered", () => {
        expect(sql).toContain(`CREATE TABLE "practice_session_play_staff"`);
        expect(sql).toContain(`CONSTRAINT "practice_session_play_staff_pkey" PRIMARY KEY ("playRowId", "staffId")`);
        expect(sql).toContain(`CONSTRAINT "practice_session_play_staff_position_check" CHECK ("position" >= 0)`);
    });

    it("cascades from the practice, the row and the person, and only unlinks when an official or an account goes", () => {
        expect(sql).toContain(`FOREIGN KEY ("sessionId") REFERENCES "practice_sessions"("id") ON DELETE CASCADE`);
        expect(sql).toContain(`FOREIGN KEY ("teamOfficialId") REFERENCES "team_officials"("id") ON DELETE SET NULL`);
        expect(sql).toContain(`FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL`);
        expect(sql).toContain(`FOREIGN KEY ("playRowId") REFERENCES "practice_session_plays"("id") ON DELETE CASCADE`);
        expect(sql).toContain(`FOREIGN KEY ("staffId") REFERENCES "practice_session_staff"("id") ON DELETE CASCADE`);
    });

    it("is additive: it only creates, and alters nothing but the two new tables", () => {
        expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/i);
        expect(sql).not.toMatch(/^\s*(UPDATE|DELETE)\s/im);
        const altered = [...sql.matchAll(/ALTER TABLE "([^"]+)"/g)].map((match) => match[1]);
        expect(new Set(altered)).toEqual(new Set(["practice_session_staff", "practice_session_play_staff"]));
    });

    it("matches the Prisma schema", () => {
        const staff = model("PracticeSessionStaff");
        expect(staff).toMatch(/name\s+String/);
        expect(staff).toMatch(/position\s+Int/);
        expect(staff).toMatch(/session\s+PracticeSession\s+@relation\(fields: \[sessionId\], references: \[id\], onDelete: Cascade\)/);
        expect(staff).toMatch(/teamOfficial\s+TeamOfficial\?\s+@relation\(fields: \[teamOfficialId\], references: \[id\], onDelete: SetNull\)/);
        expect(staff).toMatch(/user\s+User\?\s+@relation\(fields: \[userId\], references: \[id\], onDelete: SetNull\)/);
        expect(staff).toContain("@@unique([sessionId, position])");
        expect(staff).toContain(`@@map("practice_session_staff")`);
        const assigned = model("PracticeSessionPlayStaff");
        expect(assigned).toMatch(/playRow\s+PracticeSessionPlay\s+@relation\(fields: \[playRowId\], references: \[id\], onDelete: Cascade\)/);
        expect(assigned).toMatch(/staff\s+PracticeSessionStaff\s+@relation\(fields: \[staffId\], references: \[id\], onDelete: Cascade\)/);
        expect(assigned).toContain("@@id([playRowId, staffId])");
        expect(assigned).toContain(`@@map("practice_session_play_staff")`);
        expect(model("PracticeSession")).toMatch(/staff\s+PracticeSessionStaff\[\]/);
        expect(model("PracticeSessionPlay")).toMatch(/staff\s+PracticeSessionPlayStaff\[\]/);
    });
});
