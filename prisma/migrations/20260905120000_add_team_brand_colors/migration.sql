-- Team crest branding. Mirrors the columns League and Venue already carry so
-- the three identity surfaces render through one code path.
ALTER TABLE "Team" ADD COLUMN "brandPrimaryColor" TEXT;
ALTER TABLE "Team" ADD COLUMN "brandSecondaryColor" TEXT;
