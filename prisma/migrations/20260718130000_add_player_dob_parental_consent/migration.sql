-- COPPA groundwork: Player.dateOfBirth (admin-only, like emergencyContact) and
-- a parental-consent audit table. dateOfBirth is nullable so existing rosters
-- are unaffected; under-13 enforcement happens in application logic
-- (lib/utils/coppa.ts + lib/actions/roster.ts). Consent rows are never
-- deleted on revocation (revokedAt) and survive deletion of the granting
-- user (SET NULL) so the audit trail persists.

-- AlterTable
ALTER TABLE "Player" ADD COLUMN "dateOfBirth" DATE;

-- CreateTable
CREATE TABLE "parental_consents" (
    "id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "playerId" TEXT NOT NULL,
    "grantedByUserId" TEXT,

    CONSTRAINT "parental_consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parental_consents_playerId_idx" ON "parental_consents"("playerId");

-- AddForeignKey
ALTER TABLE "parental_consents" ADD CONSTRAINT "parental_consents_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parental_consents" ADD CONSTRAINT "parental_consents_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
