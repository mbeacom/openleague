-- CreateEnum
CREATE TYPE "Sport" AS ENUM ('HOCKEY', 'LACROSSE', 'SOCCER', 'BASKETBALL', 'BASEBALL', 'SOFTBALL', 'FOOTBALL', 'VOLLEYBALL', 'OTHER');

-- Normalize existing text values to uppercase enum-compatible format before altering
UPDATE "Team" SET "sport" = UPPER("sport") WHERE "sport" IS NOT NULL;
UPDATE "League" SET "sport" = UPPER("sport") WHERE "sport" IS NOT NULL;

-- Set any non-conforming values to 'OTHER' so the cast doesn't fail
UPDATE "Team" SET "sport" = 'OTHER' WHERE "sport" NOT IN ('HOCKEY', 'LACROSSE', 'SOCCER', 'BASKETBALL', 'BASEBALL', 'SOFTBALL', 'FOOTBALL', 'VOLLEYBALL', 'OTHER');
UPDATE "League" SET "sport" = 'OTHER' WHERE "sport" NOT IN ('HOCKEY', 'LACROSSE', 'SOCCER', 'BASKETBALL', 'BASEBALL', 'SOFTBALL', 'FOOTBALL', 'VOLLEYBALL', 'OTHER');

-- AlterTable: convert Team.sport from TEXT to Sport enum
ALTER TABLE "Team" ALTER COLUMN "sport" DROP DEFAULT;
ALTER TABLE "Team" ALTER COLUMN "sport" TYPE "Sport" USING ("sport"::"Sport");
ALTER TABLE "Team" ALTER COLUMN "sport" SET DEFAULT 'HOCKEY';

-- AlterTable: convert League.sport from TEXT to Sport enum
ALTER TABLE "League" ALTER COLUMN "sport" DROP DEFAULT;
ALTER TABLE "League" ALTER COLUMN "sport" TYPE "Sport" USING ("sport"::"Sport");
ALTER TABLE "League" ALTER COLUMN "sport" SET DEFAULT 'HOCKEY';
