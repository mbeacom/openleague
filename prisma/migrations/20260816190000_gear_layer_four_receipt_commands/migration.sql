-- Durable idempotency and optimistic-concurrency journal for Layer-4 pledge
-- receipt commands. A command may produce multiple tagged-unit receipts.

BEGIN;

CREATE TYPE "GearPledgePiiRedactionStatus" AS ENUM ('PENDING', 'REDACTED');

ALTER TABLE "gear_pledges"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "piiRedactionStatus" "GearPledgePiiRedactionStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "piiRedactedAt" TIMESTAMP(3),
  ALTER COLUMN "donorName" DROP NOT NULL;

ALTER TABLE "gear_pledge_receipts"
  ADD COLUMN "receiptCommandId" TEXT,
  ADD COLUMN "correctionOfReceiptId" TEXT,
  ADD COLUMN "correctionReason" TEXT;

CREATE TABLE "gear_pledge_receipt_commands" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "pledgeId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "expectedVersion" INTEGER NOT NULL,
  "resultingVersion" INTEGER NOT NULL,
  "resultingStatus" "GearPledgeStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gear_pledge_receipt_commands_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "team_gear_need_commands" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "needId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "team_gear_need_commands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gear_pledge_receipt_commands_leagueId_id_key"
  ON "gear_pledge_receipt_commands"("leagueId", "id");
CREATE UNIQUE INDEX "gear_pledge_receipt_commands_leagueId_pledgeId_idempotencyKey_key"
  ON "gear_pledge_receipt_commands"("leagueId", "pledgeId", "idempotencyKey");
CREATE INDEX "gear_pledge_receipt_commands_leagueId_pledgeId_createdAt_idx"
  ON "gear_pledge_receipt_commands"("leagueId", "pledgeId", "createdAt");
CREATE UNIQUE INDEX "gear_pledge_receipts_leagueId_correctionOfReceiptId_key"
  ON "gear_pledge_receipts"("leagueId", "correctionOfReceiptId");
CREATE UNIQUE INDEX "team_gear_need_commands_leagueId_id_key"
  ON "team_gear_need_commands"("leagueId", "id");
CREATE UNIQUE INDEX "team_gear_need_commands_leagueId_teamId_idempotencyKey_key"
  ON "team_gear_need_commands"("leagueId", "teamId", "idempotencyKey");
CREATE UNIQUE INDEX "team_gear_need_commands_leagueId_needId_key"
  ON "team_gear_need_commands"("leagueId", "needId");
CREATE INDEX "team_gear_need_commands_leagueId_teamId_createdAt_idx"
  ON "team_gear_need_commands"("leagueId", "teamId", "createdAt");

ALTER TABLE "gear_pledge_receipt_commands"
  ADD CONSTRAINT "gear_pledge_receipt_commands_leagueId_fkey"
  FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_pledge_receipt_commands"
  ADD CONSTRAINT "gear_pledge_receipt_commands_leagueId_pledgeId_fkey"
  FOREIGN KEY ("leagueId", "pledgeId") REFERENCES "gear_pledges"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_pledge_receipts"
  ADD CONSTRAINT "gear_pledge_receipts_leagueId_receiptCommandId_fkey"
  FOREIGN KEY ("leagueId", "receiptCommandId") REFERENCES "gear_pledge_receipt_commands"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_pledge_receipts"
  ADD CONSTRAINT "gear_pledge_receipts_correctionOfReceiptId_fkey"
  FOREIGN KEY ("leagueId", "correctionOfReceiptId") REFERENCES "gear_pledge_receipts"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_pledge_receipts"
  ADD CONSTRAINT "gear_pledge_receipts_correction_fields_valid"
  CHECK (
    ("correctionOfReceiptId" IS NULL AND "correctionReason" IS NULL)
    OR ("correctionOfReceiptId" IS NOT NULL AND "correctionReason" IS NOT NULL)
  );
ALTER TABLE "team_gear_need_commands"
  ADD CONSTRAINT "team_gear_need_commands_leagueId_fkey"
  FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_gear_need_commands"
  ADD CONSTRAINT "team_gear_need_commands_leagueId_teamId_fkey"
  FOREIGN KEY ("leagueId", "teamId") REFERENCES "Team"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_gear_need_commands"
  ADD CONSTRAINT "team_gear_need_commands_leagueId_needId_fkey"
  FOREIGN KEY ("leagueId", "needId") REFERENCES "team_gear_needs"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
