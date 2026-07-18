-- Team-scoped messages: let a standalone (non-league) team admin message
-- their own members. A LeagueMessage is now scoped to EITHER a league OR a
-- team (exactly one), reusing the existing targeting / recipient / notification
-- pipeline. Existing league messages keep leagueId set and are unaffected.

-- Relax leagueId so a message can instead be team-scoped.
ALTER TABLE "league_messages" ALTER COLUMN "leagueId" DROP NOT NULL;

-- Team scope.
ALTER TABLE "league_messages" ADD COLUMN "teamId" TEXT;

-- CreateIndex
CREATE INDEX "league_messages_teamId_createdAt_idx" ON "league_messages"("teamId", "createdAt");

-- AddForeignKey
ALTER TABLE "league_messages" ADD CONSTRAINT "league_messages_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enforce exactly-one scope (league xor team) at the database level.
ALTER TABLE "league_messages" ADD CONSTRAINT "league_messages_exactly_one_scope" CHECK (num_nonnulls("leagueId", "teamId") = 1);
