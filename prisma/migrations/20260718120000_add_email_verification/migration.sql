-- Email verification replaces manual admin approval as the signup gate.
--
-- "approved" becomes a pure moderation kill-switch (false = suspended) and
-- now defaults to true; the thing that gates login for new accounts is
-- "emailVerified", proven via single-use hashed tokens in
-- verification_tokens (see lib/auth/tokens.ts).
--
-- Grandfathering rule: only accounts that were ALREADY approved (an admin
-- vetted them and they had been logging in) are marked verified. Accounts
-- still pending approval never proved inbox ownership — auto-verifying them
-- would let a signup with someone else's address permanently squat it. They
-- are un-suspended (approved=true) but left emailVerified=NULL, so the login
-- gate routes them through real verification via the resend flow on their
-- next attempt.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailVerified" TIMESTAMP(3);
ALTER TABLE "User" ALTER COLUMN "approved" SET DEFAULT true;

-- Grandfather ONLY previously-approved accounts as verified (order matters:
-- stamp verified before flipping the pending backlog to un-suspended).
UPDATE "User" SET "emailVerified" = CURRENT_TIMESTAMP WHERE "approved" = true;
UPDATE "User" SET "approved" = true WHERE "approved" = false;

-- CreateEnum
CREATE TYPE "VerificationTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'EMAIL_CHANGE');

-- CreateTable
CREATE TABLE "verification_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "type" "VerificationTokenType" NOT NULL,
    "newEmail" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_tokenHash_key" ON "verification_tokens"("tokenHash");
CREATE INDEX "verification_tokens_userId_type_idx" ON "verification_tokens"("userId", "type");
CREATE INDEX "verification_tokens_expiresAt_idx" ON "verification_tokens"("expiresAt");

-- AddForeignKey
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
