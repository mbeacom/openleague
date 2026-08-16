-- PostgreSQL treats NULL values as distinct in the existing compound unique
-- index, so enforce the one-global-row invariant explicitly.
CREATE UNIQUE INDEX "notification_preferences_one_global_per_user"
  ON "notification_preferences" ("userId")
  WHERE "leagueId" IS NULL;
