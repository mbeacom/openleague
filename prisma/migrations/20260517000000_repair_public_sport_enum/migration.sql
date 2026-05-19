-- Repair production drift where Prisma Client casts Sport values to public."Sport"
-- but an older database does not have the enum in the public schema or is
-- missing one or more labels.
--
-- Keep this migration limited to enum creation/value repair. The follow-up
-- migration converts columns/defaults so runners that wrap each migration in a
-- transaction commit newly-added enum values before they are used.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'Sport'
  ) THEN
    CREATE TYPE public."Sport" AS ENUM (
      'HOCKEY',
      'LACROSSE',
      'SOCCER',
      'BASKETBALL',
      'BASEBALL',
      'SOFTBALL',
      'FOOTBALL',
      'VOLLEYBALL',
      'OTHER'
    );
  END IF;
END $$;

ALTER TYPE public."Sport" ADD VALUE IF NOT EXISTS 'HOCKEY';
ALTER TYPE public."Sport" ADD VALUE IF NOT EXISTS 'LACROSSE';
ALTER TYPE public."Sport" ADD VALUE IF NOT EXISTS 'SOCCER';
ALTER TYPE public."Sport" ADD VALUE IF NOT EXISTS 'BASKETBALL';
ALTER TYPE public."Sport" ADD VALUE IF NOT EXISTS 'BASEBALL';
ALTER TYPE public."Sport" ADD VALUE IF NOT EXISTS 'SOFTBALL';
ALTER TYPE public."Sport" ADD VALUE IF NOT EXISTS 'FOOTBALL';
ALTER TYPE public."Sport" ADD VALUE IF NOT EXISTS 'VOLLEYBALL';
ALTER TYPE public."Sport" ADD VALUE IF NOT EXISTS 'OTHER';
