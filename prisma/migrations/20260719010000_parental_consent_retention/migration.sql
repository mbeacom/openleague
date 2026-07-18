-- COPPA retention hardening. A ParentalConsent row must outlive the child's
-- roster entry: it is the auditable proof that guardian consent (and any later
-- revocation) existed. The original table used ON DELETE CASCADE on playerId,
-- so deleting a Player — a routine one-click ADMIN action — destroyed its
-- consent + revocation rows, defeating the model's own retention intent.
--
-- This mirrors the grantedByUserId design (SET NULL): playerId becomes nullable
-- and its FK becomes ON DELETE SET NULL, so deleting a Player detaches the
-- consent row instead of deleting it. A denormalized snapshot of the child
-- (name, DOB, team) is added so a detached row (playerId → NULL) stays
-- meaningful for audit. Snapshot columns are populated by application logic
-- (lib/actions/roster.ts) at consent-write time.

-- Denormalized child snapshot (captured at consent-write time)
ALTER TABLE "parental_consents" ADD COLUMN "childName" TEXT;
ALTER TABLE "parental_consents" ADD COLUMN "childDateOfBirth" DATE;
ALTER TABLE "parental_consents" ADD COLUMN "teamId" TEXT;

-- Make playerId nullable so it can be SET NULL when the Player is deleted
ALTER TABLE "parental_consents" ALTER COLUMN "playerId" DROP NOT NULL;

-- DropForeignKey (old ON DELETE CASCADE)
ALTER TABLE "parental_consents" DROP CONSTRAINT "parental_consents_playerId_fkey";

-- AddForeignKey (retention-preserving ON DELETE SET NULL)
ALTER TABLE "parental_consents" ADD CONSTRAINT "parental_consents_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
