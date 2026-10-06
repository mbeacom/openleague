-- Drill age groups (age-group templates, spec R2).
-- Hand-written and additive: the dev database is behind on migrations, so
-- `migrate dev` cannot be used. Existing plays read as every age ('{}'); a
-- constant DEFAULT is metadata-only on PostgreSQL 11+, so no table is
-- rewritten. Prisma does not model CHECK constraints: keep this one by hand
-- if the column is ever regenerated.

-- AlterTable
ALTER TABLE "plays" ADD COLUMN "ageGroups" TEXT[] NOT NULL DEFAULT '{}'::TEXT[];
ALTER TABLE "plays" ADD CONSTRAINT "plays_age_groups_check"
  CHECK ("ageGroups" <@ ARRAY['u6', 'u8', 'u10', 'u12', 'u14', 'u16plus']::TEXT[]);
