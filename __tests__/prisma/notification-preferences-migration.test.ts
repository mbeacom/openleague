import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "prisma/migrations/20260817100000_enforce_one_global_notification_preference/migration.sql",
  ),
  "utf8",
);
const legacyOutboxMigration = readFileSync(
  join(
    process.cwd(),
    "prisma/migrations/20260817110000_redact_legacy_gear_outbox_dedupe_emails/migration.sql",
  ),
  "utf8",
);

describe("global notification preference migration", () => {
  it("reconciles dirty null-league rows before creating the partial unique index", () => {
    const reconciliation = migration.indexOf("DO $$");
    const dedupe = migration.indexOf('DELETE FROM "notification_preferences"');
    const update = migration.indexOf('UPDATE "notification_preferences"');
    const index = migration.indexOf('CREATE UNIQUE INDEX "notification_preferences_one_global_per_user"');

    expect(reconciliation).toBeGreaterThanOrEqual(0);
    expect(dedupe).toBeGreaterThan(reconciliation);
    expect(update).toBeGreaterThan(dedupe);
    expect(index).toBeGreaterThan(update);
    expect(migration).toContain('bool_and("emailEnabled")');
    expect(migration).toContain('bool_and("gearNotifications")');
    expect(migration).toContain('bool_or("urgentOnly")');
    expect(migration).toContain('FILTER (WHERE "unsubscribeToken" IS NOT NULL)');
  });

  it("redacts legacy anonymous outbox keys without changing their external-recipient identity", () => {
    expect(legacyOutboxMigration).toContain('UPDATE "notification_outbox"');
    expect(legacyOutboxMigration).toContain("'gear.%'");
    expect(legacyOutboxMigration).toContain("anon:legacy-");
    expect(legacyOutboxMigration).not.toContain("NEXTAUTH_SECRET");
  });
});
