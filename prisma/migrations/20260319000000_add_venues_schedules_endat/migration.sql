-- CreateEnum
CREATE TYPE "SurfaceType" AS ENUM ('ICE', 'TURF', 'COURT', 'FIELD', 'OTHER');

-- CreateEnum
CREATE TYPE "VenueVisibility" AS ENUM ('PUBLIC', 'LEAGUE', 'TEAM');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable: Add endAt and venueId to Event
ALTER TABLE "Event" ADD COLUMN "endAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN "venueId" TEXT;

-- CreateTable: Venue
CREATE TABLE "venues" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "surfaceType" "SurfaceType" NOT NULL DEFAULT 'OTHER',
    "capacity" INTEGER,
    "amenities" TEXT[],
    "phone" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "visibility" "VenueVisibility" NOT NULL DEFAULT 'PUBLIC',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "teamId" TEXT,
    "leagueId" TEXT,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable: GameSchedule
CREATE TABLE "game_schedules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seasonName" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "roundRobin" BOOLEAN NOT NULL DEFAULT true,
    "rounds" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "leagueId" TEXT,
    "teamId" TEXT,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "game_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ScheduleGame
CREATE TABLE "schedule_games" (
    "id" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "gameNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gameScheduleId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "schedule_games_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Venue indexes
CREATE INDEX "venues_visibility_idx" ON "venues"("visibility");
CREATE INDEX "venues_teamId_idx" ON "venues"("teamId");
CREATE INDEX "venues_leagueId_idx" ON "venues"("leagueId");
CREATE INDEX "venues_surfaceType_idx" ON "venues"("surfaceType");

-- CreateIndex: GameSchedule indexes
CREATE INDEX "game_schedules_leagueId_status_idx" ON "game_schedules"("leagueId", "status");
CREATE INDEX "game_schedules_teamId_status_idx" ON "game_schedules"("teamId", "status");

-- CreateIndex: ScheduleGame indexes
CREATE UNIQUE INDEX "schedule_games_eventId_key" ON "schedule_games"("eventId");
CREATE INDEX "schedule_games_gameScheduleId_roundNumber_idx" ON "schedule_games"("gameScheduleId", "roundNumber");

-- CreateIndex: Event venue+startAt index
CREATE INDEX "Event_venueId_startAt_idx" ON "Event"("venueId", "startAt");

-- AddForeignKey: Event -> Venue
ALTER TABLE "Event" ADD CONSTRAINT "Event_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Venue -> Team
ALTER TABLE "venues" ADD CONSTRAINT "venues_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Venue -> League
ALTER TABLE "venues" ADD CONSTRAINT "venues_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Venue -> User (createdBy)
ALTER TABLE "venues" ADD CONSTRAINT "venues_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: GameSchedule -> League
ALTER TABLE "game_schedules" ADD CONSTRAINT "game_schedules_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: GameSchedule -> Team
ALTER TABLE "game_schedules" ADD CONSTRAINT "game_schedules_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: GameSchedule -> User (createdBy)
ALTER TABLE "game_schedules" ADD CONSTRAINT "game_schedules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: ScheduleGame -> GameSchedule
ALTER TABLE "schedule_games" ADD CONSTRAINT "schedule_games_gameScheduleId_fkey" FOREIGN KEY ("gameScheduleId") REFERENCES "game_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: ScheduleGame -> Event
ALTER TABLE "schedule_games" ADD CONSTRAINT "schedule_games_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
