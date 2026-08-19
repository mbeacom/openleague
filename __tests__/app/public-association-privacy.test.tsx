import { describe, expect, it } from "vitest";

import {
  getPublicAssociationProfileSelect,
  getPublicTeamProfileSelect,
  publicAssociationSummarySelect,
  publicContentSelect,
  publicContentDetailSelect,
  publicContentWhere,
  publicPublishedAssociationWhere,
  publicPublishedTeamWhere,
  publicTeamSummarySelect,
} from "@/lib/utils/public-associations";

/**
 * The public association surface is safe because of what its selectors do NOT
 * contain. These assertions are deliberately negative: they fail when somebody
 * adds a field, not when somebody removes one.
 *
 * Proven end to end as well — every route was fetched unauthenticated against a
 * seeded database and checked for these exact values. This file is the
 * repeatable form of that sweep.
 */

const NOW = new Date("2026-06-01T00:00:00Z");

function keys(select: Record<string, unknown>): string[] {
  return Object.keys(select);
}

describe("public association selectors exclude private data", () => {
  const associationSelect = getPublicAssociationProfileSelect(NOW) as Record<string, unknown>;
  const teamSelect = getPublicTeamProfileSelect(NOW) as Record<string, unknown>;

  it("never selects the private administrative contact", () => {
    // League.contactEmail / contactPhone are the admin contact. The public page
    // uses publicEmail / publicPhone, which an administrator opts into.
    expect(keys(associationSelect)).not.toContain("contactEmail");
    expect(keys(associationSelect)).not.toContain("contactPhone");
    expect(keys(associationSelect)).toContain("publicEmail");
  });

  it("never selects payment or merchant configuration", () => {
    for (const field of [
      "stripeAccountId",
      "stripeChargesEnabled",
      "stripePayoutsEnabled",
      "stripeDetailsSubmitted",
      "platformFeeBps",
      "payments",
    ]) {
      expect(keys(associationSelect), field).not.toContain(field);
    }
  });

  it("never selects rosters, members, or invitations", () => {
    for (const field of ["players", "users", "invitations", "notificationPreferences"]) {
      expect(keys(associationSelect), field).not.toContain(field);
    }
    expect(keys(teamSelect)).not.toContain("players");
    expect(keys(teamSelect)).not.toContain("members");
  });

  it("never selects gear inventory, custody, donors, or pledges", () => {
    for (const field of [
      "gearCatalogItems",
      "gearStorageLocations",
      "gearPoolStocks",
      "gearUnits",
      "gearReservations",
      "gearPledges",
      "gearActivity",
    ]) {
      expect(keys(associationSelect), field).not.toContain(field);
    }
  });

  it("exposes a published wishlist only as a token and a title", () => {
    const wishlist = associationSelect.gearWishlist as {
      where: { status: string };
      select: Record<string, unknown>;
    };
    expect(wishlist.where).toEqual({ status: "PUBLISHED" });
    // Nothing else: not items, not donors, not the league's inventory.
    expect(keys(wishlist.select).sort()).toEqual(["shareToken", "title"]);
  });

  it("never selects the notification outbox or audit trail", () => {
    for (const field of ["notificationOutbox", "auditLogs", "messages"]) {
      expect(keys(associationSelect), field).not.toContain(field);
    }
  });

  it("never selects the content author", () => {
    // A volunteer posting a schedule change has not consented to a byline.
    expect(keys(publicContentSelect)).not.toContain("author");
    expect(keys(publicContentSelect)).not.toContain("authorId");
    expect(keys(publicContentDetailSelect)).not.toContain("author");
  });

  it("only reads published, active associations and teams", () => {
    expect(publicPublishedAssociationWhere).toEqual({
      isActive: true,
      profileStatus: "PUBLISHED",
      slug: { not: null },
    });
    expect(publicPublishedTeamWhere).toEqual({
      isActive: true,
      profileStatus: "PUBLISHED",
      slug: { not: null },
    });
  });

  it("only reads public content whose time has come and which is not archived", () => {
    expect(publicContentWhere(NOW)).toEqual({
      visibility: "PUBLIC",
      status: { in: ["PUBLISHED", "SCHEDULED"] },
      publishAt: { lte: NOW },
      archivedAt: null,
    });
  });

  it("restricts nested teams on the association page to published ones", () => {
    const teams = associationSelect.teams as { where: unknown };
    expect(teams.where).toEqual(publicPublishedTeamWhere);
  });

  it("keeps the summary selectors minimal", () => {
    expect(keys(publicAssociationSummarySelect)).not.toContain("contactEmail");
    expect(keys(publicTeamSummarySelect)).not.toContain("players");
  });
});
