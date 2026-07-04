-- Add IANA timezone to Event so wall-clock times entered in datetime-local
-- inputs round-trip against the event's zone instead of the browser's local zone.
ALTER TABLE "Event" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/New_York';
