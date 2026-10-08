-- Practice equipment (practice equipment spec R3): the practice's own items.
-- Hand-written and additive: the dev database is behind on migrations, so
-- `migrate dev` cannot be used. Existing practices read as none ('[]'); a
-- constant DEFAULT is metadata-only on PostgreSQL 11+, so no table is
-- rewritten. Each drill's list lives in its play's playData JSON
-- (equipmentNeeds), which needs no column.

-- AlterTable
ALTER TABLE "practice_sessions" ADD COLUMN "equipment" JSONB NOT NULL DEFAULT '[]';
