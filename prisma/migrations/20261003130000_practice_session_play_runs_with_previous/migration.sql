-- Station grouping for practice sessions (practice planner 2b).
-- Hand-written and additive: the dev database is behind on migrations, so
-- `migrate dev` cannot be used. Existing rows stay sequential (false).
ALTER TABLE "practice_session_plays"
  ADD COLUMN "runsWithPrevious" BOOLEAN NOT NULL DEFAULT false;
