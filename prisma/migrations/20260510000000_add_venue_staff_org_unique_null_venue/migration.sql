-- Enforce one organization-wide staff role per user when no venue-specific scope is set.
CREATE UNIQUE INDEX "venue_staff_organizationId_userId_null_venue_key"
ON "venue_staff"("organizationId", "userId")
WHERE "venueId" IS NULL;