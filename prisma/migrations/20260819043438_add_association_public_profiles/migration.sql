-- CreateEnum
CREATE TYPE "PublicProfileStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PublicContentStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PublicContentVisibility" AS ENUM ('PUBLIC', 'MEMBERS_ONLY');

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "profileStatus" "PublicProfileStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "publicDescription" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "slug" TEXT;

-- AlterTable
ALTER TABLE "leagues" ADD COLUMN     "brandPrimaryColor" TEXT,
ADD COLUMN     "brandSecondaryColor" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "profileStatus" "PublicProfileStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "publicDescription" TEXT,
ADD COLUMN     "publicEmail" TEXT,
ADD COLUMN     "publicPhone" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "public_slug_redirects" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leagueId" TEXT NOT NULL,
    "teamId" TEXT,

    CONSTRAINT "public_slug_redirects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_content_items" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "summary" TEXT,
    "status" "PublicContentStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "PublicContentVisibility" NOT NULL DEFAULT 'PUBLIC',
    "publishAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "leagueId" TEXT NOT NULL,
    "teamId" TEXT,
    "authorId" TEXT,

    CONSTRAINT "public_content_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "public_slug_redirects_leagueId_idx" ON "public_slug_redirects"("leagueId");

-- CreateIndex
CREATE INDEX "public_content_items_leagueId_status_publishAt_idx" ON "public_content_items"("leagueId", "status", "publishAt");

-- CreateIndex
CREATE INDEX "public_content_items_leagueId_teamId_status_idx" ON "public_content_items"("leagueId", "teamId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "public_content_items_leagueId_slug_key" ON "public_content_items"("leagueId", "slug");

-- AddForeignKey
ALTER TABLE "public_slug_redirects" ADD CONSTRAINT "public_slug_redirects_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_slug_redirects" ADD CONSTRAINT "public_slug_redirects_leagueId_teamId_fkey" FOREIGN KEY ("leagueId", "teamId") REFERENCES "Team"("leagueId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_content_items" ADD CONSTRAINT "public_content_items_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_content_items" ADD CONSTRAINT "public_content_items_leagueId_teamId_fkey" FOREIGN KEY ("leagueId", "teamId") REFERENCES "Team"("leagueId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_content_items" ADD CONSTRAINT "public_content_items_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-authored invariants (feature 007 US4).
-- ---------------------------------------------------------------------------

-- A team slug is unique within its association, not globally: two associations
-- may each have a "storm". Partial, because most teams have no slug and
-- Postgres would otherwise treat every NULL as distinct anyway — being explicit
-- keeps the intent readable.
CREATE UNIQUE INDEX "teams_league_slug_key"
  ON "Team" ("leagueId", "slug")
  WHERE "slug" IS NOT NULL;

-- Retired association slugs resolve globally, so they must not collide with
-- each other. teamId IS NULL is what marks a row as an association slug.
CREATE UNIQUE INDEX "public_slug_redirects_association_slug_key"
  ON "public_slug_redirects" ("slug")
  WHERE "teamId" IS NULL;

-- Retired team slugs only need to be unambiguous within their association.
CREATE UNIQUE INDEX "public_slug_redirects_team_slug_key"
  ON "public_slug_redirects" ("leagueId", "slug")
  WHERE "teamId" IS NOT NULL;

-- A retired association slug must never shadow a live one, and vice versa.
-- Enforced in the application when renaming (the old slug is inserted in the
-- same transaction that frees it); this comment records why no constraint can
-- express it — the two live in different tables.

-- Publication timestamps agree with state.
ALTER TABLE "leagues"
  ADD CONSTRAINT "leagues_published_timestamp_check"
  CHECK ("profileStatus" <> 'PUBLISHED' OR "publishedAt" IS NOT NULL);

ALTER TABLE "Team"
  ADD CONSTRAINT "teams_published_timestamp_check"
  CHECK ("profileStatus" <> 'PUBLISHED' OR "publishedAt" IS NOT NULL);

-- A published association profile needs a slug to be reachable at all.
ALTER TABLE "leagues"
  ADD CONSTRAINT "leagues_published_requires_slug_check"
  CHECK ("profileStatus" <> 'PUBLISHED' OR "slug" IS NOT NULL);

ALTER TABLE "Team"
  ADD CONSTRAINT "teams_published_requires_slug_check"
  CHECK ("profileStatus" <> 'PUBLISHED' OR "slug" IS NOT NULL);

-- Content state agrees with its timestamps: SCHEDULED needs a future-facing
-- publishAt, PUBLISHED needs publishedAt, ARCHIVED needs archivedAt.
ALTER TABLE "public_content_items"
  ADD CONSTRAINT "public_content_items_state_timestamp_check"
  CHECK (
    ("status" <> 'SCHEDULED' OR "publishAt" IS NOT NULL)
    AND ("status" <> 'PUBLISHED' OR "publishedAt" IS NOT NULL)
    AND ("status" <> 'ARCHIVED' OR "archivedAt" IS NOT NULL)
  ),
  ADD CONSTRAINT "public_content_items_slug_not_blank_check"
    CHECK (length(btrim("slug")) > 0);
