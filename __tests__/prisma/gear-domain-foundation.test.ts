import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  join(process.cwd(), "prisma/migrations/20260816180000_gear_domain_foundation/migration.sql"),
  "utf8",
);

describe("gear domain foundation persistence invariants", () => {
  it("uses League-scoped composite relations for gear resources", () => {
    expect(schema).toContain(
      '@relation(fields: [leagueId, catalogItemId], references: [leagueId, id], onDelete: Restrict)',
    );
    expect(schema).toContain(
      '@relation(fields: [leagueId, reservationLineId], references: [leagueId, id], onDelete: Restrict)',
    );
    expect(schema).toContain(
      '@relation(fields: [leagueId, wishlistItemId], references: [leagueId, id], onDelete: Restrict)',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("leagueId", "gearUnitId") REFERENCES "gear_units"("leagueId", "id")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("leagueId", "beforeLocationId") REFERENCES "gear_storage_locations"("leagueId", "id") ON DELETE RESTRICT',
    );
  });

  it("protects tagged allocation windows and terminal quantities in the database", () => {
    expect(schema).toMatch(/effectiveStartDate\s+DateTime\?\s+@db\.Date/);
    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS btree_gist");
    expect(migration).toContain("gear_allocations_tagged_unit_active_window_excl");
    expect(migration).toContain("'PENDING', 'ALLOCATED', 'PICKED_UP', 'PARTIALLY_RETURNED'");
    expect(migration).toContain("gear_allocations_status_quantities_valid");
  });

  it("preserves movement locations and allows user deletion without deleting delivery intent", () => {
    expect(schema).toContain(
      '@relation("NotificationOutboxRecipient", fields: [recipientUserId], references: [id], onDelete: SetNull)',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL',
    );
    expect(migration).not.toContain(
      'gear_inventory_movements_beforeLocationId_fkey" FOREIGN KEY ("leagueId", "beforeLocationId") REFERENCES "gear_storage_locations"("leagueId", "id") ON DELETE SET NULL',
    );
  });

  it("makes ledger rows append-only and validates polymorphic activity tenancy", () => {
    expect(migration.trimStart()).toMatch(/^--[\s\S]*?BEGIN;/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
    expect(migration).toContain('CREATE FUNCTION "gear_reject_ledger_mutation"()');
    expect(migration).toContain('"gear_handoffs_append_only"');
    expect(migration).toContain('"gear_activity_append_only"');
    expect(migration).toContain('"gear_inventory_movements_append_only"');
    expect(migration).toContain('CREATE FUNCTION "gear_validate_activity_entity_league"()');
    expect(migration).toContain('"gear_activity_entity_league"');
  });

  it("guards durable outbox intent while supporting terminal PII redaction", () => {
    expect(migration).toContain('CREATE FUNCTION "guard_notification_outbox_mutation"()');
    expect(migration).toContain('"notification_outbox_delivery_state_only"');
    expect(migration).toContain('CREATE FUNCTION "redact_notification_outbox_recipient"("outbox_id" TEXT)');
    expect(migration).toContain('REVOKE ALL ON FUNCTION "redact_notification_outbox_recipient"(TEXT) FROM PUBLIC');
  });

  it("requires a quantity of one for tagged movements and pledge receipts", () => {
    expect(migration).toContain("gear_inventory_movements_tagged_unit_quantity");
    expect(migration).toContain("gear_pledge_receipts_tagged_unit_quantity");
    expect(migration).toContain("gear_inventory_movements_direction_valid");
  });
});
