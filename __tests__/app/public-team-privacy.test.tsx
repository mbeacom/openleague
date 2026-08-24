import { describe, expect, it } from "vitest";

import {
  getPublicTeamProfileSelect,
  publicTeamSummarySelect,
  publicPublishedTeamWhere,
} from "@/lib/utils/public-associations";

/**
 * The public team page shows identity and news. It must never show a roster:
 * a youth team's page is exactly where participant and guardian data would do
 * the most harm.
 */
const NOW = new Date("2026-06-01T00:00:00Z");

describe("public team page excludes participant data", () => {
  const select = getPublicTeamProfileSelect(NOW) as Record<string, unknown>;

  it("never selects players, members, officials, or invitations", () => {
    for (const field of ["players", "members", "teamOfficials", "invitations", "rsvps"]) {
      expect(Object.keys(select), field).not.toContain(field);
    }
  });

  it("never selects events, practices, or attendance", () => {
    // The team page reads the canonical public schedule separately, rather
    // than widening this approved-identity selector with activity relations.
    for (const field of ["events", "practiceSessions", "seasonGames"]) {
      expect(Object.keys(select), field).not.toContain(field);
    }
  });

  it("never selects gear needs or reservations", () => {
    for (const field of ["gearNeeds", "gearReservations", "gearUnits"]) {
      expect(Object.keys(select), field).not.toContain(field);
    }
  });

  it("exposes only approved identity fields", () => {
    expect(Object.keys(publicTeamSummarySelect).sort()).toEqual([
      "division",
      "id",
      "logoUrl",
      "name",
      "publicDescription",
      "season",
      "slug",
      "sport",
    ]);
  });

  it("reads only published, active teams", () => {
    expect(publicPublishedTeamWhere).toEqual({
      isActive: true,
      profileStatus: "PUBLISHED",
      slug: { not: null },
    });
  });

  it("carries the association only as its public summary", () => {
    const league = select.league as { select: Record<string, unknown> };
    expect(Object.keys(league.select)).not.toContain("contactEmail");
    expect(Object.keys(league.select)).not.toContain("stripeAccountId");
  });
});
