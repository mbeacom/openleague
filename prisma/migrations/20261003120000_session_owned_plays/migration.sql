-- Session-owned drill copies (practice planner 3a).
-- Hand-written and additive: the dev database is behind on migrations, so
-- `migrate dev` cannot be used. No data is rewritten; a session converts to
-- owned copies the next time it is saved.

-- AlterTable
ALTER TABLE "plays" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "plays" ADD COLUMN "sourcePlayId" TEXT;

-- CreateIndex
CREATE INDEX "plays_sessionId_idx" ON "plays"("sessionId");

-- AddForeignKey
ALTER TABLE "plays" ADD CONSTRAINT "plays_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "practice_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plays" ADD CONSTRAINT "plays_sourcePlayId_fkey"
  FOREIGN KEY ("sourcePlayId") REFERENCES "plays"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Session plays no longer cascade away when their play is deleted
-- (constraint created in 20251116173235_add_practice_planner_schema).
ALTER TABLE "practice_session_plays" DROP CONSTRAINT "practice_session_plays_playId_fkey";
ALTER TABLE "practice_session_plays" ADD CONSTRAINT "practice_session_plays_playId_fkey"
  FOREIGN KEY ("playId") REFERENCES "plays"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
