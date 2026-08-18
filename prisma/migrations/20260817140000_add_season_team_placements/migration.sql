-- Add season-specific placement projection and schedule visibility.
-- PlacementDecision remains the append-only history; this table is the current
-- season/team projection used by season readers.

BEGIN;

CREATE TYPE "SeasonScheduleVisibility" AS ENUM (
  'PUBLIC',
  'AUTHENTICATED',
  'RELATIONSHIP_ONLY',
  'PRIVATE'
);

ALTER TABLE "seasons"
  ADD COLUMN "scheduleVisibility" "SeasonScheduleVisibility" NOT NULL DEFAULT 'PRIVATE';

CREATE TABLE "season_team_placements" (
  "id" TEXT NOT NULL,
  "seasonId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "divisionId" TEXT,
  "teamNameSnapshot" TEXT NOT NULL,
  "divisionNameSnapshot" TEXT,
  "rank" INTEGER,
  "privateNote" TEXT,
  "placedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "season_team_placements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "season_team_placements_rank_check"
    CHECK ("rank" IS NULL OR "rank" > 0)
);

CREATE UNIQUE INDEX "season_team_placements_seasonId_teamId_key"
  ON "season_team_placements"("seasonId", "teamId");
CREATE INDEX "season_team_placements_seasonId_divisionId_idx"
  ON "season_team_placements"("seasonId", "divisionId");
CREATE INDEX "season_team_placements_seasonId_rank_idx"
  ON "season_team_placements"("seasonId", "rank");

ALTER TABLE "season_team_placements"
  ADD CONSTRAINT "season_team_placements_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "season_team_placements_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "season_team_placements_divisionId_fkey"
  FOREIGN KEY ("divisionId") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "season_team_placements_placedById_fkey"
  FOREIGN KEY ("placedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
