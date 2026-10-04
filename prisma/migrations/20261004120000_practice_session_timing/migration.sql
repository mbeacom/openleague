-- Practice timing: block rows (warm-up, water break, transition, cool-down),
-- station rotation, and a gap between blocks.
-- Hand-written and additive: the dev database is behind on migrations, so
-- `migrate dev` cannot be used. Existing rows read as drills that don't
-- rotate and existing sessions have no gap; constant DEFAULTs are
-- metadata-only on PostgreSQL 11+, so no table is rewritten. Prisma does not
-- model CHECK constraints: keep them by hand if these columns are ever
-- regenerated.
-- The play foreign key stays exactly as migration
-- 20261003120000_session_owned_plays left it (DEFERRABLE INITIALLY
-- DEFERRED): making the column nullable doesn't touch the constraint, and a
-- regenerated one would lose its deferrability.

-- AlterTable
ALTER TABLE "practice_session_plays" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'drill';
ALTER TABLE "practice_session_plays" ADD COLUMN "label" TEXT;
ALTER TABLE "practice_session_plays" ADD COLUMN "stays" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "practice_session_plays" ADD COLUMN "rotateEveryMinutes" INTEGER;
ALTER TABLE "practice_session_plays" ALTER COLUMN "playId" DROP NOT NULL;
ALTER TABLE "practice_session_plays" ADD CONSTRAINT "practice_session_plays_kind_check"
  CHECK ("kind" IN ('drill', 'warmup', 'break', 'transition', 'cooldown'));
ALTER TABLE "practice_session_plays" ADD CONSTRAINT "practice_session_plays_kind_play_check"
  CHECK (("kind" = 'drill') = ("playId" IS NOT NULL));
ALTER TABLE "practice_session_plays" ADD CONSTRAINT "practice_session_plays_label_check"
  CHECK ("label" IS NULL OR char_length("label") <= 60);
ALTER TABLE "practice_session_plays" ADD CONSTRAINT "practice_session_plays_rotateEveryMinutes_check"
  CHECK ("rotateEveryMinutes" IS NULL OR "rotateEveryMinutes" BETWEEN 1 AND 30);

-- AlterTable
ALTER TABLE "practice_sessions" ADD COLUMN "transitionMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_transitionMinutes_check"
  CHECK ("transitionMinutes" BETWEEN 0 AND 5);
