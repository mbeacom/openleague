-- Identity graph (Tier 3): guardian edges, per-child RSVPs, unified invitation
-- targets, and the LeagueUser backfill. User remains the identity hub — these
-- are edges and columns, not a Person refactor.

-- AlterTable: Invitation gains league/organization targets and role payloads;
-- teamId becomes optional (exactly-one-target CHECK below).
ALTER TABLE "Invitation" ALTER COLUMN "teamId" DROP NOT NULL;
ALTER TABLE "Invitation" ADD COLUMN "leagueId" TEXT;
ALTER TABLE "Invitation" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Invitation" ADD COLUMN "officialRole" "TeamOfficialRole";
ALTER TABLE "Invitation" ADD COLUMN "venueRole" "VenueStaffRole";

-- AlterTable: RSVP gains an optional per-child target. Existing rows keep
-- playerId NULL (self/household responses) and remain valid.
ALTER TABLE "RSVP" ADD COLUMN "playerId" TEXT;

-- CreateTable
CREATE TABLE "player_guardians" (
    "id" TEXT NOT NULL,
    "relationship" TEXT,
    "canRsvp" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "playerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "player_guardians_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "player_guardians_userId_idx" ON "player_guardians"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "player_guardians_playerId_userId_key" ON "player_guardians"("playerId", "userId");

-- DropIndex: replaced by the (userId, eventId, playerId) unique plus the
-- partial unique below.
DROP INDEX "RSVP_userId_eventId_key";

-- CreateIndex
CREATE UNIQUE INDEX "RSVP_userId_eventId_playerId_key" ON "RSVP"("userId", "eventId", "playerId");

-- CreateIndex
CREATE INDEX "RSVP_playerId_idx" ON "RSVP"("playerId");

-- CreateIndex
CREATE INDEX "Invitation_leagueId_idx" ON "Invitation"("leagueId");

-- CreateIndex
CREATE INDEX "Invitation_organizationId_idx" ON "Invitation"("organizationId");

-- AddForeignKey
ALTER TABLE "player_guardians" ADD CONSTRAINT "player_guardians_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_guardians" ADD CONSTRAINT "player_guardians_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RSVP" ADD CONSTRAINT "RSVP_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "venue_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Integrity constraints not expressible in the Prisma schema DSL.
-- Existing rows satisfy all of these unchanged.
-- ============================================================================

-- Postgres treats NULLs as distinct inside composite uniques, so without this
-- a user could hold duplicate self/household rows (playerId IS NULL) for the
-- same event. Partial unique index backs up @@unique([userId, eventId, playerId]).
CREATE UNIQUE INDEX "RSVP_userId_eventId_self_key" ON "RSVP"("userId", "eventId") WHERE "playerId" IS NULL;

-- An invitation has exactly one target entity (team XOR league XOR venue org).
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_exactly_one_target"
  CHECK (
    (("teamId" IS NOT NULL)::int
      + ("leagueId" IS NOT NULL)::int
      + ("organizationId" IS NOT NULL)::int) = 1
  );

-- ============================================================================
-- Data migration: LeagueUser backfill (canonical league-identity rule).
-- Every TeamMember of a league-linked team gets an explicit LeagueUser row —
-- TEAM_ADMIN when they are a team ADMIN on any team in that league, else
-- MEMBER. Deterministic cuid-shaped ids follow the ice-surface backfill
-- pattern. Existing rows win (ON CONFLICT DO NOTHING).
-- ============================================================================
INSERT INTO "league_users" ("id", "role", "joinedAt", "userId", "leagueId")
SELECT
    'cl' || left(md5(src."userId" || ':' || src."leagueId" || ':league_user_backfill'), 23),
    CASE WHEN src."isAdmin" THEN 'TEAM_ADMIN' ELSE 'MEMBER' END::"LeagueRole",
    CURRENT_TIMESTAMP,
    src."userId",
    src."leagueId"
FROM (
    SELECT
        tm."userId",
        t."leagueId",
        bool_or(tm."role" = 'ADMIN') AS "isAdmin"
    FROM "TeamMember" tm
    JOIN "Team" t ON t."id" = tm."teamId"
    WHERE t."leagueId" IS NOT NULL
    GROUP BY tm."userId", t."leagueId"
) src
ON CONFLICT ("userId", "leagueId") DO NOTHING;
