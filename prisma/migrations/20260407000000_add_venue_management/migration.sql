-- CreateEnum
CREATE TYPE "VenueOrganizationType" AS ENUM ('RINK', 'ARENA', 'SKATING_CENTER', 'SPORTS_COMPLEX', 'OTHER');

-- CreateEnum
CREATE TYPE "VenueOrganizationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VenueStaffRole" AS ENUM ('OWNER', 'MANAGER', 'SCHEDULER', 'CONTENT_EDITOR', 'REQUEST_MANAGER', 'VIEWER');

-- CreateEnum
CREATE TYPE "VenueStaffStatus" AS ENUM ('INVITED', 'ACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "VenueProfileStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OperatingHourStatus" AS ENUM ('OPEN', 'CLOSED', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "VenueScheduleActivityType" AS ENUM ('OPEN_SKATE', 'STICK_AND_PICK', 'FREE_SKATE', 'FIGURE_SKATING', 'SPECIALTY_EVENT', 'PRIVATE_LESSON', 'PUBLIC_LESSON', 'TEAM_ICE', 'ORGANIZATION_ICE', 'RENTAL', 'CLOSURE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "VenueScheduleAudience" AS ENUM ('PUBLIC', 'TEAMS', 'COACHES', 'ORGANIZATIONS', 'INVITE_ONLY', 'STAFF_ONLY');

-- CreateEnum
CREATE TYPE "VenueScheduleVisibility" AS ENUM ('PUBLIC', 'AUTHENTICATED', 'RELATIONSHIP_ONLY', 'PRIVATE');

-- CreateEnum
CREATE TYPE "VenueScheduleBlockStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RegistrationMode" AS ENUM ('INFO_ONLY', 'REQUEST_REQUIRED', 'EXTERNAL_REGISTRATION');

-- CreateEnum
CREATE TYPE "IceTimeRequestStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'DECLINED', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LessonOfferingType" AS ENUM ('PRIVATE', 'SEMI_PRIVATE', 'GROUP', 'CLINIC', 'CAMP');

-- CreateEnum
CREATE TYPE "LessonOfferingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VenueContentPostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VenueRelationshipType" AS ENUM ('PREFERRED', 'HOME');

-- CreateEnum
CREATE TYPE "VenueRelationshipTargetType" AS ENUM ('TEAM', 'LEAGUE', 'COACH', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "VenueRelationshipStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'REMOVED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SkillLevelSource" AS ENUM ('USA_HOCKEY', 'US_FIGURE_SKATING', 'RINK_CUSTOM', 'OTHER');

-- CreateEnum
CREATE TYPE "SkillLevelDiscipline" AS ENUM ('HOCKEY', 'FIGURE_SKATING', 'SKATING', 'GOALIE', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SurfaceType" ADD VALUE 'STUDIO';
ALTER TYPE "SurfaceType" ADD VALUE 'ROOM';
ALTER TYPE "SurfaceType" ADD VALUE 'DRYLAND';

-- AlterTable
ALTER TABLE "venues" ADD COLUMN     "brandPrimaryColor" TEXT,
ADD COLUMN     "brandSecondaryColor" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "privateManagerNotes" TEXT,
ADD COLUMN     "profileStatus" "VenueProfileStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "publicDescription" TEXT,
ADD COLUMN     "publicEmail" TEXT,
ADD COLUMN     "publicPhone" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/New_York';

-- CreateTable
CREATE TABLE "venue_organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "VenueOrganizationType" NOT NULL DEFAULT 'RINK',
    "description" TEXT,
    "primaryContactName" TEXT,
    "primaryContactEmail" TEXT,
    "primaryContactPhone" TEXT,
    "website" TEXT,
    "status" "VenueOrganizationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "venue_organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_staff" (
    "id" TEXT NOT NULL,
    "role" "VenueStaffRole" NOT NULL DEFAULT 'VIEWER',
    "status" "VenueStaffStatus" NOT NULL DEFAULT 'INVITED',
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "venueId" TEXT,
    "userId" TEXT NOT NULL,
    "invitedById" TEXT,

    CONSTRAINT "venue_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ice_surfaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "surfaceType" "SurfaceType" NOT NULL DEFAULT 'ICE',
    "capacity" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "venueId" TEXT NOT NULL,

    CONSTRAINT "ice_surfaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_operating_hours" (
    "id" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "opensAt" TEXT NOT NULL,
    "closesAt" TEXT NOT NULL,
    "effectiveStartDate" TIMESTAMP(3) NOT NULL,
    "effectiveEndDate" TIMESTAMP(3),
    "status" "OperatingHourStatus" NOT NULL DEFAULT 'OPEN',
    "label" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "venueId" TEXT NOT NULL,
    "surfaceId" TEXT,

    CONSTRAINT "venue_operating_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_schedule_blocks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "activityType" "VenueScheduleActivityType" NOT NULL,
    "audience" "VenueScheduleAudience" NOT NULL DEFAULT 'PUBLIC',
    "visibility" "VenueScheduleVisibility" NOT NULL DEFAULT 'PUBLIC',
    "status" "VenueScheduleBlockStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "recurrenceRule" TEXT,
    "recurrenceStartDate" TIMESTAMP(3),
    "recurrenceEndDate" TIMESTAMP(3),
    "capacity" INTEGER,
    "priceAmount" INTEGER,
    "priceCurrency" TEXT NOT NULL DEFAULT 'USD',
    "priceLabel" TEXT,
    "registrationMode" "RegistrationMode" NOT NULL DEFAULT 'INFO_ONLY',
    "externalRegistrationUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "venueId" TEXT NOT NULL,
    "surfaceId" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "venue_schedule_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ice_time_requests" (
    "id" TEXT NOT NULL,
    "requesterOrganizationName" TEXT,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "requestedStartAt" TIMESTAMP(3) NOT NULL,
    "requestedEndAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "status" "IceTimeRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "decisionMessage" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "scheduleBlockId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "requesterTeamId" TEXT,
    "requesterLeagueId" TEXT,
    "decidedById" TEXT,

    CONSTRAINT "ice_time_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_offerings" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "lessonType" "LessonOfferingType" NOT NULL,
    "instructorName" TEXT,
    "priceAmount" INTEGER,
    "priceCurrency" TEXT NOT NULL DEFAULT 'USD',
    "durationMinutes" INTEGER,
    "availabilityDescription" TEXT,
    "registrationMode" "RegistrationMode" NOT NULL DEFAULT 'INFO_ONLY',
    "externalRegistrationUrl" TEXT,
    "status" "LessonOfferingStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "venueId" TEXT NOT NULL,
    "surfaceId" TEXT,

    CONSTRAINT "lesson_offerings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_content_posts" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT NOT NULL,
    "status" "VenueContentPostStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "scheduledFor" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "venueId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "venue_content_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_relationships" (
    "id" TEXT NOT NULL,
    "relationshipType" "VenueRelationshipType" NOT NULL,
    "targetType" "VenueRelationshipTargetType" NOT NULL,
    "targetName" TEXT,
    "invitedEmail" TEXT,
    "status" "VenueRelationshipStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "venueId" TEXT NOT NULL,
    "teamId" TEXT,
    "leagueId" TEXT,
    "invitedById" TEXT NOT NULL,
    "acceptedById" TEXT,
    "removedById" TEXT,

    CONSTRAINT "venue_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_level_references" (
    "id" TEXT NOT NULL,
    "source" "SkillLevelSource" NOT NULL,
    "discipline" "SkillLevelDiscipline" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "skill_level_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_activity_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "venueId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,

    CONSTRAINT "venue_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_LessonOfferingToVenueScheduleBlock" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_LessonOfferingToVenueScheduleBlock_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_LessonOfferingToSkillLevelReference" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_LessonOfferingToSkillLevelReference_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_SkillLevelReferenceToVenueScheduleBlock" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_SkillLevelReferenceToVenueScheduleBlock_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "venue_organizations_createdById_idx" ON "venue_organizations"("createdById");

-- CreateIndex
CREATE INDEX "venue_organizations_status_idx" ON "venue_organizations"("status");

-- CreateIndex
CREATE INDEX "venue_staff_userId_idx" ON "venue_staff"("userId");

-- CreateIndex
CREATE INDEX "venue_staff_organizationId_role_idx" ON "venue_staff"("organizationId", "role");

-- CreateIndex
CREATE INDEX "venue_staff_venueId_idx" ON "venue_staff"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "venue_staff_organizationId_venueId_userId_key" ON "venue_staff"("organizationId", "venueId", "userId");

-- CreateIndex
CREATE INDEX "ice_surfaces_venueId_isActive_idx" ON "ice_surfaces"("venueId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ice_surfaces_venueId_name_key" ON "ice_surfaces"("venueId", "name");

-- CreateIndex
CREATE INDEX "venue_operating_hours_venueId_dayOfWeek_idx" ON "venue_operating_hours"("venueId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "venue_operating_hours_surfaceId_dayOfWeek_idx" ON "venue_operating_hours"("surfaceId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "venue_schedule_blocks_venueId_startsAt_idx" ON "venue_schedule_blocks"("venueId", "startsAt");

-- CreateIndex
CREATE INDEX "venue_schedule_blocks_surfaceId_startsAt_idx" ON "venue_schedule_blocks"("surfaceId", "startsAt");

-- CreateIndex
CREATE INDEX "venue_schedule_blocks_status_visibility_idx" ON "venue_schedule_blocks"("status", "visibility");

-- CreateIndex
CREATE INDEX "venue_schedule_blocks_activityType_idx" ON "venue_schedule_blocks"("activityType");

-- CreateIndex
CREATE INDEX "ice_time_requests_venueId_status_idx" ON "ice_time_requests"("venueId", "status");

-- CreateIndex
CREATE INDEX "ice_time_requests_scheduleBlockId_status_idx" ON "ice_time_requests"("scheduleBlockId", "status");

-- CreateIndex
CREATE INDEX "ice_time_requests_requesterUserId_idx" ON "ice_time_requests"("requesterUserId");

-- CreateIndex
CREATE INDEX "ice_time_requests_requesterTeamId_idx" ON "ice_time_requests"("requesterTeamId");

-- CreateIndex
CREATE INDEX "ice_time_requests_requesterLeagueId_idx" ON "ice_time_requests"("requesterLeagueId");

-- CreateIndex
CREATE INDEX "lesson_offerings_venueId_status_idx" ON "lesson_offerings"("venueId", "status");

-- CreateIndex
CREATE INDEX "lesson_offerings_lessonType_idx" ON "lesson_offerings"("lessonType");

-- CreateIndex
CREATE INDEX "venue_content_posts_venueId_status_idx" ON "venue_content_posts"("venueId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "venue_content_posts_venueId_slug_key" ON "venue_content_posts"("venueId", "slug");

-- CreateIndex
CREATE INDEX "venue_relationships_venueId_status_idx" ON "venue_relationships"("venueId", "status");

-- CreateIndex
CREATE INDEX "venue_relationships_teamId_status_idx" ON "venue_relationships"("teamId", "status");

-- CreateIndex
CREATE INDEX "venue_relationships_leagueId_status_idx" ON "venue_relationships"("leagueId", "status");

-- CreateIndex
CREATE INDEX "skill_level_references_discipline_isActive_idx" ON "skill_level_references"("discipline", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "skill_level_references_source_discipline_label_key" ON "skill_level_references"("source", "discipline", "label");

-- CreateIndex
CREATE INDEX "venue_activity_logs_venueId_createdAt_idx" ON "venue_activity_logs"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "venue_activity_logs_actorId_idx" ON "venue_activity_logs"("actorId");

-- CreateIndex
CREATE INDEX "venue_activity_logs_action_idx" ON "venue_activity_logs"("action");

-- CreateIndex
CREATE INDEX "_LessonOfferingToVenueScheduleBlock_B_index" ON "_LessonOfferingToVenueScheduleBlock"("B");

-- CreateIndex
CREATE INDEX "_LessonOfferingToSkillLevelReference_B_index" ON "_LessonOfferingToSkillLevelReference"("B");

-- CreateIndex
CREATE INDEX "_SkillLevelReferenceToVenueScheduleBlock_B_index" ON "_SkillLevelReferenceToVenueScheduleBlock"("B");

-- CreateIndex
CREATE UNIQUE INDEX "venues_slug_key" ON "venues"("slug");

-- CreateIndex
CREATE INDEX "venues_organizationId_idx" ON "venues"("organizationId");

-- CreateIndex
CREATE INDEX "venues_profileStatus_idx" ON "venues"("profileStatus");

-- AddForeignKey
ALTER TABLE "venue_organizations" ADD CONSTRAINT "venue_organizations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_staff" ADD CONSTRAINT "venue_staff_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "venue_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_staff" ADD CONSTRAINT "venue_staff_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_staff" ADD CONSTRAINT "venue_staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_staff" ADD CONSTRAINT "venue_staff_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venues" ADD CONSTRAINT "venues_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "venue_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ice_surfaces" ADD CONSTRAINT "ice_surfaces_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_operating_hours" ADD CONSTRAINT "venue_operating_hours_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_operating_hours" ADD CONSTRAINT "venue_operating_hours_surfaceId_fkey" FOREIGN KEY ("surfaceId") REFERENCES "ice_surfaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_schedule_blocks" ADD CONSTRAINT "venue_schedule_blocks_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_schedule_blocks" ADD CONSTRAINT "venue_schedule_blocks_surfaceId_fkey" FOREIGN KEY ("surfaceId") REFERENCES "ice_surfaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_schedule_blocks" ADD CONSTRAINT "venue_schedule_blocks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_schedule_blocks" ADD CONSTRAINT "venue_schedule_blocks_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ice_time_requests" ADD CONSTRAINT "ice_time_requests_scheduleBlockId_fkey" FOREIGN KEY ("scheduleBlockId") REFERENCES "venue_schedule_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ice_time_requests" ADD CONSTRAINT "ice_time_requests_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ice_time_requests" ADD CONSTRAINT "ice_time_requests_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ice_time_requests" ADD CONSTRAINT "ice_time_requests_requesterTeamId_fkey" FOREIGN KEY ("requesterTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ice_time_requests" ADD CONSTRAINT "ice_time_requests_requesterLeagueId_fkey" FOREIGN KEY ("requesterLeagueId") REFERENCES "leagues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ice_time_requests" ADD CONSTRAINT "ice_time_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_offerings" ADD CONSTRAINT "lesson_offerings_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_offerings" ADD CONSTRAINT "lesson_offerings_surfaceId_fkey" FOREIGN KEY ("surfaceId") REFERENCES "ice_surfaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_content_posts" ADD CONSTRAINT "venue_content_posts_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_content_posts" ADD CONSTRAINT "venue_content_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_relationships" ADD CONSTRAINT "venue_relationships_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_relationships" ADD CONSTRAINT "venue_relationships_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_relationships" ADD CONSTRAINT "venue_relationships_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_relationships" ADD CONSTRAINT "venue_relationships_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_relationships" ADD CONSTRAINT "venue_relationships_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_relationships" ADD CONSTRAINT "venue_relationships_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_activity_logs" ADD CONSTRAINT "venue_activity_logs_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_activity_logs" ADD CONSTRAINT "venue_activity_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LessonOfferingToVenueScheduleBlock" ADD CONSTRAINT "_LessonOfferingToVenueScheduleBlock_A_fkey" FOREIGN KEY ("A") REFERENCES "lesson_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LessonOfferingToVenueScheduleBlock" ADD CONSTRAINT "_LessonOfferingToVenueScheduleBlock_B_fkey" FOREIGN KEY ("B") REFERENCES "venue_schedule_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LessonOfferingToSkillLevelReference" ADD CONSTRAINT "_LessonOfferingToSkillLevelReference_A_fkey" FOREIGN KEY ("A") REFERENCES "lesson_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LessonOfferingToSkillLevelReference" ADD CONSTRAINT "_LessonOfferingToSkillLevelReference_B_fkey" FOREIGN KEY ("B") REFERENCES "skill_level_references"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SkillLevelReferenceToVenueScheduleBlock" ADD CONSTRAINT "_SkillLevelReferenceToVenueScheduleBlock_A_fkey" FOREIGN KEY ("A") REFERENCES "skill_level_references"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SkillLevelReferenceToVenueScheduleBlock" ADD CONSTRAINT "_SkillLevelReferenceToVenueScheduleBlock_B_fkey" FOREIGN KEY ("B") REFERENCES "venue_schedule_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
