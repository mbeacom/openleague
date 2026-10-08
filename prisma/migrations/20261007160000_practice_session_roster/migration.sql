-- Practice roster: a practice's tentative roster by position (roster spec R6).
-- Hand-written and additive: the dev database is behind on migrations, so
-- `migrate dev` cannot be used. It adds two defaulted columns to
-- practice_sessions and creates one table; nothing existing changes.
-- Prisma models none of the CHECK constraints: keep them by hand if
-- regenerated.

-- AlterTable
ALTER TABLE "practice_sessions" ADD COLUMN "rosterAgeGroup" TEXT,
ADD COLUMN "rosterRoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD CONSTRAINT "practice_sessions_rosterAgeGroup_check" CHECK ("rosterAgeGroup" IS NULL OR "rosterAgeGroup" IN ('u6', 'u8', 'u10', 'u12', 'u14', 'u16plus'));

-- CreateTable
CREATE TABLE "practice_session_roster_players" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT,
    "number" TEXT,
    "role" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "playerId" TEXT,

    CONSTRAINT "practice_session_roster_players_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "practice_session_roster_players_position_check" CHECK ("position" >= 0),
    CONSTRAINT "practice_session_roster_players_name_check" CHECK ("name" IS NULL OR char_length("name") BETWEEN 1 AND 40),
    CONSTRAINT "practice_session_roster_players_number_check" CHECK ("number" IS NULL OR "number" ~ '^[0-9]{1,3}$'),
    CONSTRAINT "practice_session_roster_players_role_check" CHECK (char_length("role") BETWEEN 1 AND 12),
    CONSTRAINT "practice_session_roster_players_link_check" CHECK ("playerId" IS NULL OR ("name" IS NULL AND "number" IS NULL))
);

-- CreateIndex
CREATE UNIQUE INDEX "practice_session_roster_players_sessionId_position_key" ON "practice_session_roster_players"("sessionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "practice_session_roster_players_sessionId_playerId_key" ON "practice_session_roster_players"("sessionId", "playerId");

-- CreateIndex
CREATE INDEX "practice_session_roster_players_playerId_idx" ON "practice_session_roster_players"("playerId");

-- AddForeignKey
ALTER TABLE "practice_session_roster_players" ADD CONSTRAINT "practice_session_roster_players_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "practice_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_session_roster_players" ADD CONSTRAINT "practice_session_roster_players_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
