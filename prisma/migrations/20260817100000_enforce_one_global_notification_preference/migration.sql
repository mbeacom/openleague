-- PostgreSQL treats NULL values as distinct in the existing compound unique
-- index, so reconcile any historical duplicate global rows before enforcing
-- the one-global-row invariant. The single DO block is atomic even under the
-- migration runner, which can execute top-level statements independently.
DO $$
DECLARE
  reconciled RECORD;
BEGIN
  FOR reconciled IN
    SELECT
      "userId",
      (array_agg("id" ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC))[1] AS "keeperId",
      bool_and("leagueMessages") AS "leagueMessages",
      bool_and("leagueAnnouncements") AS "leagueAnnouncements",
      bool_and("eventNotifications") AS "eventNotifications",
      bool_and("rsvpReminders") AS "rsvpReminders",
      bool_and("teamInvitations") AS "teamInvitations",
      bool_and("practicePlanNotifications") AS "practicePlanNotifications",
      bool_and("gearNotifications") AS "gearNotifications",
      bool_and("emailEnabled") AS "emailEnabled",
      bool_or("urgentOnly") AS "urgentOnly",
      bool_or("batchDelivery") AS "batchDelivery",
      (
        array_agg("unsubscribeToken" ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC)
        FILTER (WHERE "unsubscribeToken" IS NOT NULL)
      )[1] AS "unsubscribeToken"
    FROM "notification_preferences"
    WHERE "leagueId" IS NULL
    GROUP BY "userId"
  LOOP
    DELETE FROM "notification_preferences"
    WHERE "userId" = reconciled."userId"
      AND "leagueId" IS NULL
      AND "id" <> reconciled."keeperId";

    UPDATE "notification_preferences"
    SET
      "leagueMessages" = reconciled."leagueMessages",
      "leagueAnnouncements" = reconciled."leagueAnnouncements",
      "eventNotifications" = reconciled."eventNotifications",
      "rsvpReminders" = reconciled."rsvpReminders",
      "teamInvitations" = reconciled."teamInvitations",
      "practicePlanNotifications" = reconciled."practicePlanNotifications",
      "gearNotifications" = reconciled."gearNotifications",
      "emailEnabled" = reconciled."emailEnabled",
      "urgentOnly" = reconciled."urgentOnly",
      "batchDelivery" = reconciled."batchDelivery",
      "unsubscribeToken" = reconciled."unsubscribeToken"
    WHERE "id" = reconciled."keeperId";
  END LOOP;
END $$;

CREATE UNIQUE INDEX "notification_preferences_one_global_per_user"
  ON "notification_preferences" ("userId")
  WHERE "leagueId" IS NULL;
