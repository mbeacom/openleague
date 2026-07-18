-- Email verification replaces manual admin approval as the signup gate.
--
-- "approved" becomes a pure moderation kill-switch (false = suspended) and
-- now defaults to true; the thing that gates login for new accounts is
-- "emailVerified", proven via single-use hashed tokens in
-- verification_tokens (see lib/auth/tokens.ts). Existing users are
-- grandfathered: everyone present before this migration is marked verified
-- (previously-approved users demonstrably receive mail at their address;
-- previously-pending users were stuck in the manual-approval dead end and
-- are unblocked the same way).

-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailVerified" TIMESTAMP(3);
ALTER TABLE "User" ALTER COLUMN "approved" SET DEFAULT true;

-- Grandfather existing accounts: verified as of migration time, and clear
-- the manual-approval backlog so "approved" only means "not suspended".
UPDATE "User" SET "emailVerified" = CURRENT_TIMESTAMP;
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
