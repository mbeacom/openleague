-- Repair production drift where Prisma Client casts Sport values to public."Sport"
-- but an older database still has Team.sport/leagues.sport as TEXT or the enum
-- was not created in the public schema.

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

DO $$
DECLARE
  target_type regtype := 'public."Sport"'::regtype;
  team_sport_type regtype;
  league_sport_type regtype;
BEGIN
  SELECT a.atttypid::regtype
  INTO team_sport_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'Team'
    AND a.attname = 'sport'
    AND NOT a.attisdropped
    AND c.relkind IN ('r', 'p');

  IF team_sport_type IS NOT NULL AND team_sport_type <> target_type THEN
    ALTER TABLE public."Team" ALTER COLUMN "sport" DROP DEFAULT;
    ALTER TABLE public."Team" ALTER COLUMN "sport" TYPE public."Sport"
      USING (
        CASE
          WHEN "sport" IS NULL THEN NULL
          WHEN UPPER("sport"::text) IN ('HOCKEY', 'LACROSSE', 'SOCCER', 'BASKETBALL', 'BASEBALL', 'SOFTBALL', 'FOOTBALL', 'VOLLEYBALL', 'OTHER')
            THEN UPPER("sport"::text)::public."Sport"
          ELSE 'OTHER'::public."Sport"
        END
      );
  END IF;

  IF team_sport_type IS NOT NULL THEN
    ALTER TABLE public."Team" ALTER COLUMN "sport" SET DEFAULT 'HOCKEY'::public."Sport";
  END IF;

  SELECT a.atttypid::regtype
  INTO league_sport_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'leagues'
    AND a.attname = 'sport'
    AND NOT a.attisdropped
    AND c.relkind IN ('r', 'p');

  IF league_sport_type IS NOT NULL AND league_sport_type <> target_type THEN
    ALTER TABLE public."leagues" ALTER COLUMN "sport" DROP DEFAULT;
    ALTER TABLE public."leagues" ALTER COLUMN "sport" TYPE public."Sport"
      USING (
        CASE
          WHEN "sport" IS NULL THEN NULL
          WHEN UPPER("sport"::text) IN ('HOCKEY', 'LACROSSE', 'SOCCER', 'BASKETBALL', 'BASEBALL', 'SOFTBALL', 'FOOTBALL', 'VOLLEYBALL', 'OTHER')
            THEN UPPER("sport"::text)::public."Sport"
          ELSE 'OTHER'::public."Sport"
        END
      );
  END IF;

  IF league_sport_type IS NOT NULL THEN
    ALTER TABLE public."leagues" ALTER COLUMN "sport" SET DEFAULT 'HOCKEY'::public."Sport";
  END IF;
END $$;
