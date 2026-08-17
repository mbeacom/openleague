-- Gear messages have a distinct preference because they can be operationally
-- urgent while remaining separate from event, RSVP, and messaging preferences.
ALTER TABLE "notification_preferences"
  ADD COLUMN "gearNotifications" BOOLEAN NOT NULL DEFAULT true;
