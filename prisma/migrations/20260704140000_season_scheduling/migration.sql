-- CreateEnum
CREATE TYPE "ScheduleFormat" AS ENUM ('ROUND_ROBIN', 'SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION', 'POOL_PLAY', 'LADDER', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SeasonPhaseType" AS ENUM ('PRE_SEASON', 'REGULAR_SEASON', 'PLAYOFFS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SeasonGameStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "GameProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "GameProposalEntryKind" AS ENUM ('PROPOSE', 'COUNTER', 'ACCEPT', 'DECLINE', 'WITHDRAW');

-- DropForeignKey
ALTER TABLE "game_schedules" DROP CONSTRAINT "game_schedules_leagueId_fkey";

-- DropForeignKey
ALTER TABLE "game_schedules" DROP CONSTRAINT "game_schedules_teamId_fkey";

-- DropForeignKey
ALTER TABLE "game_schedules" DROP CONSTRAINT "game_schedules_createdById_fkey";

-- DropForeignKey
ALTER TABLE "schedule_games" DROP CONSTRAINT "schedule_games_gameScheduleId_fkey";

-- DropForeignKey
ALTER TABLE "schedule_games" DROP CONSTRAINT "schedule_games_eventId_fkey";

-- AlterTable
ALTER TABLE "divisions" ADD COLUMN     "ageClassification" "AgeClassification";

-- DropTable
DROP TABLE "game_schedules";

-- DropTable
DROP TABLE "schedule_games";

-- DropEnum
DROP TYPE "ScheduleStatus";

-- CreateTable
CREATE TABLE "seasons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "format" "ScheduleFormat",
    "formatRounds" INTEGER,
    "leagueId" TEXT,
    "teamId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "season_phases" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SeasonPhaseType" NOT NULL DEFAULT 'CUSTOM',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "format" "ScheduleFormat",
    "formatRounds" INTEGER,
    "seasonId" TEXT NOT NULL,

    CONSTRAINT "season_phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "season_games" (
    "id" TEXT NOT NULL,
    "status" "SeasonGameStatus" NOT NULL DEFAULT 'DRAFT',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "venueId" TEXT,
    "surfaceId" TEXT,
    "surfaceUsage" "IceUsage",
    "zoneLabel" TEXT,
    "locationText" TEXT,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "notes" TEXT,
    "conflictOverriddenById" TEXT,
    "conflictOverriddenAt" TIMESTAMP(3),
    "seasonId" TEXT NOT NULL,
    "phaseId" TEXT,
    "eventId" TEXT,
    "proposalId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "season_games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_proposals" (
    "id" TEXT NOT NULL,
    "status" "GameProposalStatus" NOT NULL DEFAULT 'PENDING',
    "leagueId" TEXT NOT NULL,
    "proposingTeamId" TEXT NOT NULL,
    "receivingTeamId" TEXT NOT NULL,
    "seasonId" TEXT,
    "phaseId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "game_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_proposal_entries" (
    "id" TEXT NOT NULL,
    "kind" "GameProposalEntryKind" NOT NULL,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "venueId" TEXT,
    "note" TEXT,
    "proposalId" TEXT NOT NULL,
    "actorTeamId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_proposal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placement_decisions" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "divisionId" TEXT,
    "rank" INTEGER,
    "privateNote" TEXT,
    "decidedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "placement_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seasons_leagueId_startDate_idx" ON "seasons"("leagueId", "startDate");

-- CreateIndex
CREATE INDEX "seasons_teamId_startDate_idx" ON "seasons"("teamId", "startDate");

-- CreateIndex
CREATE INDEX "season_phases_seasonId_sortOrder_idx" ON "season_phases"("seasonId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "season_games_eventId_key" ON "season_games"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "season_games_proposalId_key" ON "season_games"("proposalId");

-- CreateIndex
CREATE INDEX "season_games_seasonId_startAt_idx" ON "season_games"("seasonId", "startAt");

-- CreateIndex
CREATE INDEX "season_games_phaseId_startAt_idx" ON "season_games"("phaseId", "startAt");

-- CreateIndex
CREATE INDEX "season_games_homeTeamId_startAt_idx" ON "season_games"("homeTeamId", "startAt");

-- CreateIndex
CREATE INDEX "season_games_awayTeamId_startAt_idx" ON "season_games"("awayTeamId", "startAt");

-- CreateIndex
CREATE INDEX "season_games_venueId_startAt_idx" ON "season_games"("venueId", "startAt");

-- CreateIndex
CREATE INDEX "season_games_surfaceId_startAt_idx" ON "season_games"("surfaceId", "startAt");

-- CreateIndex
CREATE INDEX "game_proposals_receivingTeamId_status_idx" ON "game_proposals"("receivingTeamId", "status");

-- CreateIndex
CREATE INDEX "game_proposals_proposingTeamId_status_idx" ON "game_proposals"("proposingTeamId", "status");

-- CreateIndex
CREATE INDEX "game_proposals_leagueId_status_idx" ON "game_proposals"("leagueId", "status");

-- CreateIndex
CREATE INDEX "game_proposal_entries_proposalId_createdAt_idx" ON "game_proposal_entries"("proposalId", "createdAt");

-- CreateIndex
CREATE INDEX "placement_decisions_seasonId_teamId_createdAt_idx" ON "placement_decisions"("seasonId", "teamId", "createdAt");

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_phases" ADD CONSTRAINT "season_phases_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_games" ADD CONSTRAINT "season_games_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_games" ADD CONSTRAINT "season_games_surfaceId_fkey" FOREIGN KEY ("surfaceId") REFERENCES "ice_surfaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_games" ADD CONSTRAINT "season_games_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_games" ADD CONSTRAINT "season_games_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_games" ADD CONSTRAINT "season_games_conflictOverriddenById_fkey" FOREIGN KEY ("conflictOverriddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_games" ADD CONSTRAINT "season_games_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_games" ADD CONSTRAINT "season_games_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "season_phases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_games" ADD CONSTRAINT "season_games_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_games" ADD CONSTRAINT "season_games_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "game_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_games" ADD CONSTRAINT "season_games_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_proposals" ADD CONSTRAINT "game_proposals_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_proposals" ADD CONSTRAINT "game_proposals_proposingTeamId_fkey" FOREIGN KEY ("proposingTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_proposals" ADD CONSTRAINT "game_proposals_receivingTeamId_fkey" FOREIGN KEY ("receivingTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_proposals" ADD CONSTRAINT "game_proposals_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_proposals" ADD CONSTRAINT "game_proposals_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_proposal_entries" ADD CONSTRAINT "game_proposal_entries_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_proposal_entries" ADD CONSTRAINT "game_proposal_entries_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "game_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_proposal_entries" ADD CONSTRAINT "game_proposal_entries_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_decisions" ADD CONSTRAINT "placement_decisions_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_decisions" ADD CONSTRAINT "placement_decisions_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_decisions" ADD CONSTRAINT "placement_decisions_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_decisions" ADD CONSTRAINT "placement_decisions_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Ownership XOR: a season belongs to exactly one of league or team
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_owner_xor_check"
  CHECK (("leagueId" IS NOT NULL)::int + ("teamId" IS NOT NULL)::int = 1);

-- A game requires two distinct teams
ALTER TABLE "season_games" ADD CONSTRAINT "season_games_distinct_teams_check"
  CHECK ("homeTeamId" <> "awayTeamId");
