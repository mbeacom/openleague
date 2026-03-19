-- AlterTable: Add jerseyNumber and usahMemberId to Player
ALTER TABLE "Player" ADD COLUMN "jerseyNumber" INTEGER;
ALTER TABLE "Player" ADD COLUMN "usahMemberId" VARCHAR(20);

-- AlterTable: Add usahMemberId to TeamMember
ALTER TABLE "TeamMember" ADD COLUMN "usahMemberId" VARCHAR(20);
