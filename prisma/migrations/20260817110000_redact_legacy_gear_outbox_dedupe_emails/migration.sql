-- Older Layer 5 rows encoded an anonymous donor email in dedupeKey. New rows
-- use an opaque keyed identity, but deployed rows must also be non-PII. Keep
-- the external-recipient marker and the row id so the original composite
-- uniqueness constraint remains valid without needing application secrets.
UPDATE "notification_outbox"
SET "dedupeKey" = regexp_replace(
  "dedupeKey",
  '(^|:)[^:]*@[^:]*',
  '\1anon:legacy-' || "id"
)
WHERE "eventType" LIKE 'gear.%'
  AND "dedupeKey" LIKE '%@%';
