-- Convert drifted Sport columns after the enum-label repair migration has
-- committed. This keeps ALTER TYPE ... ADD VALUE separate from any casts or
-- defaults that use the new labels.

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