-- Durable idempotency and optimistic-concurrency journal for Layer-4 pledge
-- receipt commands. A command may produce multiple tagged-unit receipts.

ALTER TABLE "gear_pledges"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "gear_pledge_receipts"
  ADD COLUMN "receiptCommandId" TEXT;

CREATE TABLE "gear_pledge_receipt_commands" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "pledgeId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "expectedVersion" INTEGER NOT NULL,
  "resultingVersion" INTEGER NOT NULL,
  "resultingStatus" "GearPledgeStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gear_pledge_receipt_commands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gear_pledge_receipt_commands_leagueId_id_key"
  ON "gear_pledge_receipt_commands"("leagueId", "id");
CREATE UNIQUE INDEX "gear_pledge_receipt_commands_leagueId_pledgeId_idempotencyKey_key"
  ON "gear_pledge_receipt_commands"("leagueId", "pledgeId", "idempotencyKey");
CREATE INDEX "gear_pledge_receipt_commands_leagueId_pledgeId_createdAt_idx"
  ON "gear_pledge_receipt_commands"("leagueId", "pledgeId", "createdAt");

ALTER TABLE "gear_pledge_receipt_commands"
  ADD CONSTRAINT "gear_pledge_receipt_commands_leagueId_fkey"
  FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_pledge_receipt_commands"
  ADD CONSTRAINT "gear_pledge_receipt_commands_leagueId_pledgeId_fkey"
  FOREIGN KEY ("leagueId", "pledgeId") REFERENCES "gear_pledges"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gear_pledge_receipts"
  ADD CONSTRAINT "gear_pledge_receipts_leagueId_receiptCommandId_fkey"
  FOREIGN KEY ("leagueId", "receiptCommandId") REFERENCES "gear_pledge_receipt_commands"("leagueId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
