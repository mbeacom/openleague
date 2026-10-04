-- Goaltender-aware drills: drill tags and a session goalie count.
-- Hand-written and additive: the dev database is behind on migrations, so
-- `migrate dev` cannot be used. Existing plays read as team / optional and
-- existing sessions have no goalie count (NULL = not set); a constant
-- DEFAULT is metadata-only on PostgreSQL 11+, so no table is rewritten.
-- Prisma does not model CHECK constraints: keep them by hand if these
-- columns are ever regenerated.

-- AlterTable
ALTER TABLE "plays" ADD COLUMN "focus" TEXT NOT NULL DEFAULT 'team';
ALTER TABLE "plays" ADD COLUMN "goalies" TEXT NOT NULL DEFAULT 'optional';
ALTER TABLE "plays" ADD CONSTRAINT "plays_focus_check" CHECK ("focus" IN ('team', 'skaters', 'goalies'));
ALTER TABLE "plays" ADD CONSTRAINT "plays_goalies_check" CHECK ("goalies" IN ('none', 'optional', 'required'));

-- AlterTable
ALTER TABLE "practice_sessions" ADD COLUMN "goaliesAttending" INTEGER;
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_goaliesAttending_check"
  CHECK ("goaliesAttending" IS NULL OR "goaliesAttending" BETWEEN 0 AND 10);
