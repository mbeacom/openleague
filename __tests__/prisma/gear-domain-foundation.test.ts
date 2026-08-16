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

  it("retains immutable outbox recipients and movement locations", () => {
    expect(schema).toContain(
      '@relation("NotificationOutboxRecipient", fields: [recipientUserId], references: [id], onDelete: Restrict)',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT',
    );
    expect(migration).not.toContain(
      'gear_inventory_movements_beforeLocationId_fkey" FOREIGN KEY ("leagueId", "beforeLocationId") REFERENCES "gear_storage_locations"("leagueId", "id") ON DELETE SET NULL',
    );
  });
});
