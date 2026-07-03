-- CreateEnum
CREATE TYPE "SignupEventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SignupEventVisibility" AS ENUM ('PRIVATE', 'INVITE_ONLY', 'LINK', 'PUBLIC');

-- CreateEnum
CREATE TYPE "SignupEventCategory" AS ENUM ('CLINIC', 'SCRIMMAGE', 'TRYOUT', 'VOLUNTEER', 'FUNDRAISER', 'TOURNAMENT', 'SOCIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "AgeClassification" AS ENUM ('U6', 'U8', 'SQUIRT_U10', 'PEEWEE_U12', 'BANTAM_U14', 'U16', 'U18', 'JUNIOR', 'ADULT', 'OPEN');

-- CreateEnum
CREATE TYPE "EventRegistrationStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'WAITLISTED', 'OFFERED', 'CANCELED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ManualPaymentStatus" AS ENUM ('NOT_REQUIRED', 'UNPAID', 'PAID', 'WAIVED');

-- CreateEnum
CREATE TYPE "PhaseAudience" AS ENUM ('HOST_MEMBERS', 'SELECTED_GROUPS', 'INVITEES', 'EVERYONE');

-- CreateEnum
CREATE TYPE "EventInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "EventGameStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "IceUsage" AS ENUM ('FULL_ICE', 'HALF_ICE', 'CROSS_ICE');

-- CreateEnum
CREATE TYPE "EventMediaKind" AS ENUM ('PHOTO', 'VIDEO');

-- CreateEnum
CREATE TYPE "EventMediaStatus" AS ENUM ('ACTIVE', 'FLAGGED', 'REMOVED');

-- CreateEnum
CREATE TYPE "GalleryVisibility" AS ENUM ('PARTICIPANTS', 'EVENT_AUDIENCE');

-- AlterTable
ALTER TABLE "leagues" ADD COLUMN     "platformFeeBps" INTEGER,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "stripeAccountId" TEXT,
ADD COLUMN     "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripeDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "eventRegistrationId" TEXT,
ADD COLUMN     "leagueId" TEXT,
ALTER COLUMN "registrationId" DROP NOT NULL,
ALTER COLUMN "venueId" DROP NOT NULL,
ALTER COLUMN "organizationId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "signup_events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "SignupEventCategory" NOT NULL DEFAULT 'OTHER',
    "ageClassification" "AgeClassification" NOT NULL DEFAULT 'OPEN',
    "status" "SignupEventStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "SignupEventVisibility" NOT NULL DEFAULT 'PRIVATE',
    "linkToken" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "locationText" TEXT,
    "registrationOpensAt" TIMESTAMP(3),
    "registrationClosesAt" TIMESTAMP(3),
    "cancellationCutoffAt" TIMESTAMP(3),
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "acceptsOnlinePayment" BOOLEAN NOT NULL DEFAULT false,
    "acceptsManualPayment" BOOLEAN NOT NULL DEFAULT true,
    "venmoHandle" TEXT,
    "zelleHandle" TEXT,
    "cashAppHandle" TEXT,
    "paymentPhone" TEXT,
    "paymentInstructions" TEXT,
    "galleryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "galleryVisibility" "GalleryVisibility" NOT NULL DEFAULT 'PARTICIPANTS',
    "publicRoster" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hostOrganizationId" TEXT,
    "hostLeagueId" TEXT,
    "hostTeamId" TEXT,
    "venueId" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "signup_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signup_slots" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "capacity" INTEGER,
    "priceAmount" INTEGER,
    "priceCurrency" TEXT NOT NULL DEFAULT 'USD',
    "waitlistEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "signup_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_registration_phases" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "audience" "PhaseAudience" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "event_registration_phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_registrations" (
    "id" TEXT NOT NULL,
    "status" "EventRegistrationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "participantName" TEXT NOT NULL,
    "participantEmail" TEXT,
    "participantPhone" TEXT,
    "notes" TEXT,
    "isFloater" BOOLEAN NOT NULL DEFAULT false,
    "unitAmount" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "manualPaymentStatus" "ManualPaymentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "manualPaymentMarkedById" TEXT,
    "waitlistJoinedAt" TIMESTAMP(3),
    "offerExpiresAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "registrantId" TEXT NOT NULL,
    "playerId" TEXT,
    "checkedInById" TEXT,
    "canceledById" TEXT,

    CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_invitations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "EventInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "eventId" TEXT NOT NULL,
    "invitedUserId" TEXT,
    "invitedById" TEXT NOT NULL,

    CONSTRAINT "event_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_managers" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,

    CONSTRAINT "event_managers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colorHex" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "event_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_team_assignments" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventTeamId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,

    CONSTRAINT "event_team_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_games" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "status" "EventGameStatus" NOT NULL DEFAULT 'SCHEDULED',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "iceUsage" "IceUsage" NOT NULL DEFAULT 'FULL_ICE',
    "zoneLabel" TEXT,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT NOT NULL,
    "surfaceId" TEXT,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,

    CONSTRAINT "event_games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_game_participants" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "eventTeamId" TEXT NOT NULL,

    CONSTRAINT "event_game_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_game_stats" (
    "id" TEXT NOT NULL,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "gameId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,

    CONSTRAINT "player_game_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_media_items" (
    "id" TEXT NOT NULL,
    "kind" "EventMediaKind" NOT NULL,
    "blobPathname" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationSeconds" INTEGER,
    "caption" TEXT,
    "status" "EventMediaStatus" NOT NULL DEFAULT 'ACTIVE',
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "removedById" TEXT,

    CONSTRAINT "event_media_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PhaseDivisions" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PhaseDivisions_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_SignupEventSurfaces" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_SignupEventSurfaces_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_PhaseTeams" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PhaseTeams_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "signup_events_linkToken_key" ON "signup_events"("linkToken");

-- CreateIndex
CREATE INDEX "signup_events_hostOrganizationId_startAt_idx" ON "signup_events"("hostOrganizationId", "startAt");

-- CreateIndex
CREATE INDEX "signup_events_hostLeagueId_startAt_idx" ON "signup_events"("hostLeagueId", "startAt");

-- CreateIndex
CREATE INDEX "signup_events_hostTeamId_startAt_idx" ON "signup_events"("hostTeamId", "startAt");

-- CreateIndex
CREATE INDEX "signup_events_venueId_startAt_idx" ON "signup_events"("venueId", "startAt");

-- CreateIndex
CREATE INDEX "signup_events_status_visibility_startAt_idx" ON "signup_events"("status", "visibility", "startAt");

-- CreateIndex
CREATE INDEX "signup_slots_eventId_sortOrder_idx" ON "signup_slots"("eventId", "sortOrder");

-- CreateIndex
CREATE INDEX "event_registration_phases_eventId_opensAt_idx" ON "event_registration_phases"("eventId", "opensAt");

-- CreateIndex
CREATE INDEX "event_registrations_eventId_status_idx" ON "event_registrations"("eventId", "status");

-- CreateIndex
CREATE INDEX "event_registrations_slotId_status_waitlistJoinedAt_idx" ON "event_registrations"("slotId", "status", "waitlistJoinedAt");

-- CreateIndex
CREATE INDEX "event_registrations_registrantId_idx" ON "event_registrations"("registrantId");

-- CreateIndex
CREATE UNIQUE INDEX "event_invitations_token_key" ON "event_invitations"("token");

-- CreateIndex
CREATE INDEX "event_invitations_invitedUserId_idx" ON "event_invitations"("invitedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "event_invitations_eventId_email_key" ON "event_invitations"("eventId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "event_managers_eventId_userId_key" ON "event_managers"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "event_teams_eventId_name_key" ON "event_teams"("eventId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "event_team_assignments_registrationId_key" ON "event_team_assignments"("registrationId");

-- CreateIndex
CREATE INDEX "event_team_assignments_eventTeamId_idx" ON "event_team_assignments"("eventTeamId");

-- CreateIndex
CREATE INDEX "event_games_eventId_startAt_idx" ON "event_games"("eventId", "startAt");

-- CreateIndex
CREATE INDEX "event_games_surfaceId_startAt_idx" ON "event_games"("surfaceId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "event_game_participants_gameId_registrationId_key" ON "event_game_participants"("gameId", "registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "player_game_stats_gameId_registrationId_key" ON "player_game_stats"("gameId", "registrationId");

-- CreateIndex
CREATE INDEX "event_media_items_eventId_status_createdAt_idx" ON "event_media_items"("eventId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "_PhaseDivisions_B_index" ON "_PhaseDivisions"("B");

-- CreateIndex
CREATE INDEX "_SignupEventSurfaces_B_index" ON "_SignupEventSurfaces"("B");

-- CreateIndex
CREATE INDEX "_PhaseTeams_B_index" ON "_PhaseTeams"("B");

-- CreateIndex
CREATE UNIQUE INDEX "leagues_slug_key" ON "leagues"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "leagues_stripeAccountId_key" ON "leagues"("stripeAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_eventRegistrationId_key" ON "payments"("eventRegistrationId");

-- CreateIndex
CREATE INDEX "payments_leagueId_status_idx" ON "payments"("leagueId", "status");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_eventRegistrationId_fkey" FOREIGN KEY ("eventRegistrationId") REFERENCES "event_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signup_events" ADD CONSTRAINT "signup_events_hostOrganizationId_fkey" FOREIGN KEY ("hostOrganizationId") REFERENCES "venue_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signup_events" ADD CONSTRAINT "signup_events_hostLeagueId_fkey" FOREIGN KEY ("hostLeagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signup_events" ADD CONSTRAINT "signup_events_hostTeamId_fkey" FOREIGN KEY ("hostTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signup_events" ADD CONSTRAINT "signup_events_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signup_events" ADD CONSTRAINT "signup_events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signup_events" ADD CONSTRAINT "signup_events_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signup_slots" ADD CONSTRAINT "signup_slots_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "signup_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registration_phases" ADD CONSTRAINT "event_registration_phases_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "signup_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_manualPaymentMarkedById_fkey" FOREIGN KEY ("manualPaymentMarkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "signup_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "signup_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_registrantId_fkey" FOREIGN KEY ("registrantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_checkedInById_fkey" FOREIGN KEY ("checkedInById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "signup_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_managers" ADD CONSTRAINT "event_managers_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "signup_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_managers" ADD CONSTRAINT "event_managers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_managers" ADD CONSTRAINT "event_managers_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_teams" ADD CONSTRAINT "event_teams_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "signup_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_team_assignments" ADD CONSTRAINT "event_team_assignments_eventTeamId_fkey" FOREIGN KEY ("eventTeamId") REFERENCES "event_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_team_assignments" ADD CONSTRAINT "event_team_assignments_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "event_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_team_assignments" ADD CONSTRAINT "event_team_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_games" ADD CONSTRAINT "event_games_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "signup_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_games" ADD CONSTRAINT "event_games_surfaceId_fkey" FOREIGN KEY ("surfaceId") REFERENCES "ice_surfaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_games" ADD CONSTRAINT "event_games_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "event_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_games" ADD CONSTRAINT "event_games_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "event_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_game_participants" ADD CONSTRAINT "event_game_participants_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "event_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_game_participants" ADD CONSTRAINT "event_game_participants_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "event_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_game_participants" ADD CONSTRAINT "event_game_participants_eventTeamId_fkey" FOREIGN KEY ("eventTeamId") REFERENCES "event_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_game_stats" ADD CONSTRAINT "player_game_stats_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "event_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_game_stats" ADD CONSTRAINT "player_game_stats_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "event_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_media_items" ADD CONSTRAINT "event_media_items_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "signup_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_media_items" ADD CONSTRAINT "event_media_items_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_media_items" ADD CONSTRAINT "event_media_items_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PhaseDivisions" ADD CONSTRAINT "_PhaseDivisions_A_fkey" FOREIGN KEY ("A") REFERENCES "divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PhaseDivisions" ADD CONSTRAINT "_PhaseDivisions_B_fkey" FOREIGN KEY ("B") REFERENCES "event_registration_phases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SignupEventSurfaces" ADD CONSTRAINT "_SignupEventSurfaces_A_fkey" FOREIGN KEY ("A") REFERENCES "ice_surfaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SignupEventSurfaces" ADD CONSTRAINT "_SignupEventSurfaces_B_fkey" FOREIGN KEY ("B") REFERENCES "signup_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PhaseTeams" ADD CONSTRAINT "_PhaseTeams_A_fkey" FOREIGN KEY ("A") REFERENCES "event_registration_phases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PhaseTeams" ADD CONSTRAINT "_PhaseTeams_B_fkey" FOREIGN KEY ("B") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Integrity CHECK constraints (not expressible in the Prisma schema DSL).
-- Existing rows satisfy all of these unchanged.
-- ============================================================================

-- A payment belongs to exactly one registration kind.
ALTER TABLE "payments" ADD CONSTRAINT "payments_exactly_one_registration"
  CHECK (("registrationId" IS NOT NULL) <> ("eventRegistrationId" IS NOT NULL));

-- A payment has exactly one merchant entity (rink organization XOR league).
ALTER TABLE "payments" ADD CONSTRAINT "payments_exactly_one_merchant"
  CHECK (("organizationId" IS NOT NULL) <> ("leagueId" IS NOT NULL));

-- A venue-scoped payment always belongs to an organization.
ALTER TABLE "payments" ADD CONSTRAINT "payments_venue_implies_org"
  CHECK ("venueId" IS NULL OR "organizationId" IS NOT NULL);

-- A signup event has exactly one hosting entity.
ALTER TABLE "signup_events" ADD CONSTRAINT "signup_events_exactly_one_host"
  CHECK (
    (("hostOrganizationId" IS NOT NULL)::int
      + ("hostLeagueId" IS NOT NULL)::int
      + ("hostTeamId" IS NOT NULL)::int) = 1
  );
