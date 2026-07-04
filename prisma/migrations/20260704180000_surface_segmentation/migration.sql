-- CreateEnum
CREATE TYPE "SegmentKind" AS ENUM ('HALF', 'CROSS', 'CUSTOM');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "conflictOverriddenAt" TIMESTAMP(3),
ADD COLUMN     "conflictOverriddenById" TEXT;

-- AlterTable
ALTER TABLE "practice_sessions" ADD COLUMN     "conflictOverriddenAt" TIMESTAMP(3),
ADD COLUMN     "conflictOverriddenById" TEXT,
ADD COLUMN     "segmentId" TEXT,
ADD COLUMN     "startAt" TIMESTAMP(3),
ADD COLUMN     "surfaceId" TEXT,
ADD COLUMN     "venueId" TEXT;

-- AlterTable
ALTER TABLE "venues" ADD COLUMN     "layout" JSONB;

-- AlterTable
ALTER TABLE "ice_surfaces" ADD COLUMN     "wholeLabel" TEXT;

-- AlterTable
ALTER TABLE "venue_schedule_blocks" ADD COLUMN     "segmentId" TEXT;

-- AlterTable
ALTER TABLE "season_games" DROP COLUMN "surfaceUsage",
DROP COLUMN "zoneLabel",
ADD COLUMN     "segmentId" TEXT;

-- AlterTable
ALTER TABLE "event_games" DROP COLUMN "iceUsage",
DROP COLUMN "zoneLabel",
ADD COLUMN     "conflictOverriddenAt" TIMESTAMP(3),
ADD COLUMN     "conflictOverriddenById" TEXT,
ADD COLUMN     "segmentId" TEXT;

-- DropEnum
DROP TYPE "IceUsage";

-- CreateTable
CREATE TABLE "surface_segments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "SegmentKind" NOT NULL DEFAULT 'CUSTOM',
    "presetRole" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "geometry" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "surfaceId" TEXT NOT NULL,

    CONSTRAINT "surface_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segment_coexistences" (
    "id" TEXT NOT NULL,
    "segmentAId" TEXT NOT NULL,
    "segmentBId" TEXT NOT NULL,

    CONSTRAINT "segment_coexistences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "surface_segments_surfaceId_isActive_idx" ON "surface_segments"("surfaceId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "surface_segments_surfaceId_name_key" ON "surface_segments"("surfaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "surface_segments_surfaceId_presetRole_key" ON "surface_segments"("surfaceId", "presetRole");

-- CreateIndex
CREATE UNIQUE INDEX "segment_coexistences_segmentAId_segmentBId_key" ON "segment_coexistences"("segmentAId", "segmentBId");

-- CreateIndex
CREATE INDEX "practice_sessions_venueId_startAt_idx" ON "practice_sessions"("venueId", "startAt");

-- CreateIndex
CREATE INDEX "practice_sessions_surfaceId_startAt_idx" ON "practice_sessions"("surfaceId", "startAt");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_conflictOverriddenById_fkey" FOREIGN KEY ("conflictOverriddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_surfaceId_fkey" FOREIGN KEY ("surfaceId") REFERENCES "ice_surfaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "surface_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_conflictOverriddenById_fkey" FOREIGN KEY ("conflictOverriddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surface_segments" ADD CONSTRAINT "surface_segments_surfaceId_fkey" FOREIGN KEY ("surfaceId") REFERENCES "ice_surfaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segment_coexistences" ADD CONSTRAINT "segment_coexistences_segmentAId_fkey" FOREIGN KEY ("segmentAId") REFERENCES "surface_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segment_coexistences" ADD CONSTRAINT "segment_coexistences_segmentBId_fkey" FOREIGN KEY ("segmentBId") REFERENCES "surface_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_schedule_blocks" ADD CONSTRAINT "venue_schedule_blocks_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "surface_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_games" ADD CONSTRAINT "season_games_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "surface_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_games" ADD CONSTRAINT "event_games_conflictOverriddenById_fkey" FOREIGN KEY ("conflictOverriddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_games" ADD CONSTRAINT "event_games_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "surface_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Canonical pair ordering for symmetric coexistence rows
ALTER TABLE "segment_coexistences" ADD CONSTRAINT "segment_coexistences_canonical_order_check"
  CHECK ("segmentAId" < "segmentBId");
