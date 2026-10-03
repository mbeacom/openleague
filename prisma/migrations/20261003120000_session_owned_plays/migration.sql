-- Session-owned drill copies (practice planner 3a).
-- Hand-written and additive: the dev database is behind on migrations, so
-- `migrate dev` cannot be used. No data is rewritten; a session converts to
-- owned copies the next time it is saved.

-- AlterTable
ALTER TABLE "plays" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "plays" ADD COLUMN "sourcePlayId" TEXT;

-- CreateIndex
CREATE INDEX "plays_sessionId_idx" ON "plays"("sessionId");

-- CreateIndex: the SET NULL FK below looks up copies by sourcePlayId on every play delete.
CREATE INDEX "plays_sourcePlayId_idx" ON "plays"("sourcePlayId");

-- AddForeignKey
ALTER TABLE "plays" ADD CONSTRAINT "plays_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "practice_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plays" ADD CONSTRAINT "plays_sourcePlayId_fkey"
  FOREIGN KEY ("sourcePlayId") REFERENCES "plays"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Session plays no longer cascade away when their play is deleted
-- (constraint created in 20251116173235_add_practice_planner_schema).
-- DEFERRABLE INITIALLY DEFERRED: a team delete reaches practice_session_plays
-- and plays along two cascade paths (Team -> practice_sessions ->
-- practice_session_plays, and Team -> plays). Each cascade is its own nested
-- statement, so an immediate NO ACTION check passes or fails depending on RI
-- trigger order, which a pg_dump/restore can change. Deferred, it is checked
-- once at commit, after every cascade has run. Prisma cannot model this, so a
-- regenerated migration would silently drop it.
ALTER TABLE "practice_session_plays" DROP CONSTRAINT "practice_session_plays_playId_fkey";
ALTER TABLE "practice_session_plays" ADD CONSTRAINT "practice_session_plays_playId_fkey"
  FOREIGN KEY ("playId") REFERENCES "plays"("id") ON DELETE NO ACTION ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

-- CreateIndex: detach, orphan cleanup and the FK check above all filter by playId.
CREATE INDEX "practice_session_plays_playId_idx" ON "practice_session_plays"("playId");
