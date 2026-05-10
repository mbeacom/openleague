import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireUserId: vi.fn(),
  requireVenueProfileManager: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {},
}));

import {
  publicPublishedVenueWhere,
  publicVenueProfileSelect,
  publicVenueSummarySelect,
} from "@/lib/actions/venue-organizations";

describe("public venue selectors", () => {
  it("only selects public-safe profile fields", () => {
    expect(publicVenueProfileSelect).toMatchObject({
      id: true,
      name: true,
      slug: true,
      publicDescription: true,
      publicEmail: true,
      publicPhone: true,
    });

    expect(publicVenueProfileSelect).not.toHaveProperty("privateManagerNotes");
    expect(publicVenueProfileSelect).not.toHaveProperty("notes");
    expect(publicVenueProfileSelect).not.toHaveProperty("createdBy");
    expect(publicVenueProfileSelect).not.toHaveProperty("staff");
    expect(publicVenueProfileSelect).not.toHaveProperty("activityLogs");
  });

  it("limits public listing queries to published public venues with slugs", () => {
    expect(publicPublishedVenueWhere).toEqual({
      isActive: true,
      visibility: "PUBLIC",
      profileStatus: "PUBLISHED",
      slug: { not: null },
    });
  });

  it("keeps summary selectors narrow for rink listing cards", () => {
    expect(publicVenueSummarySelect).toMatchObject({
      id: true,
      name: true,
      city: true,
      state: true,
      slug: true,
      _count: {
        select: {
          surfaces: true,
        },
      },
    });

    expect(publicVenueSummarySelect).not.toHaveProperty("privateManagerNotes");
    expect(publicVenueSummarySelect).not.toHaveProperty("publicEmail");
  });
});
