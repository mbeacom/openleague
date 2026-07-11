-- CreateEnum
CREATE TYPE "TeamOfficialRole" AS ENUM ('HEAD_COACH', 'ASSISTANT_COACH', 'MANAGER', 'TREASURER', 'VOLUNTEER_COORDINATOR', 'PARENT_VOLUNTEER', 'OTHER');

-- CreateEnum
CREATE TYPE "TeamOfficialStatus" AS ENUM ('ACTIVE', 'INVITED', 'REMOVED');

-- CreateTable
CREATE TABLE "team_officials" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" "TeamOfficialRole" NOT NULL,
    "roleDetail" TEXT,
    "status" "TeamOfficialStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT,

    CONSTRAINT "team_officials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "team_officials_teamId_idx" ON "team_officials"("teamId");

-- CreateIndex
CREATE INDEX "team_officials_userId_idx" ON "team_officials"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "team_officials_teamId_email_role_key" ON "team_officials"("teamId", "email", "role");

-- CreateIndex
CREATE INDEX "Player_userId_idx" ON "Player"("userId");

-- CreateIndex
CREATE INDEX "message_recipients_userId_sentAt_idx" ON "message_recipients"("userId", "sentAt");

-- AddForeignKey
ALTER TABLE "team_officials" ADD CONSTRAINT "team_officials_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_officials" ADD CONSTRAINT "team_officials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
-- Aligns migration history with schema.prisma: Venue.amenities has no @default,
-- so Prisma Client always supplies the value. Without this, every `migrate dev`
-- reports drift against the migration chain.
ALTER TABLE "venues" ALTER COLUMN "amenities" DROP DEFAULT;
