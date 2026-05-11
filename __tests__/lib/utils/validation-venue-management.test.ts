import { describe, expect, it } from "vitest";
import {
  createVenueOrganizationSchema,
  inviteVenueStaffSchema,
  publishVenueProfileSchema,
  updateVenueProfileSchema,
} from "@/lib/utils/validation";

const organizationId = "clorgxxxxxxxxxxxxxxxxxxxxxxx";
const venueId = "clvenxxxxxxxxxxxxxxxxxxxxxxx";

describe("venue organization validation", () => {
  it("accepts a valid rink organization and trims public fields", () => {
    const result = createVenueOrganizationSchema.safeParse({
      name: "  North Rink  ",
      type: "RINK",
      primaryContactEmail: "manager@example.com",
      website: "https://example.com",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("North Rink");
    }
  });

  it("rejects invalid organization contact URLs and emails", () => {
    expect(
      createVenueOrganizationSchema.safeParse({
        name: "North Rink",
        primaryContactEmail: "not-email",
      }).success
    ).toBe(false);

    expect(
      createVenueOrganizationSchema.safeParse({
        name: "North Rink",
        website: "not-url",
      }).success
    ).toBe(false);
  });
});

describe("venue profile validation", () => {
  it("accepts publish-ready branded profile input", () => {
    const result = updateVenueProfileSchema.safeParse({
      organizationId,
      venueId,
      name: "North Rink",
      slug: "north-rink",
      surfaceType: "ICE",
      publicDescription: "Home of community hockey.",
      logoUrl: "https://example.com/logo.png",
      brandPrimaryColor: "#003B73",
      brandSecondaryColor: "#18A999",
      timezone: "America/New_York",
      publicEmail: "info@example.com",
    });

    expect(result.success).toBe(true);
  });

    it("accepts 3-digit shorthand brand colors", () => {
      const result = updateVenueProfileSchema.safeParse({
        organizationId,
        venueId,
        brandPrimaryColor: "#037",
        brandSecondaryColor: "#FFF",
      });

      expect(result.success).toBe(true);
    });

  it("rejects unsafe slugs and malformed brand colors", () => {
    expect(
      updateVenueProfileSchema.safeParse({
        organizationId,
        name: "North Rink",
        slug: "North Rink",
        brandPrimaryColor: "#12345",
      }).success
    ).toBe(false);
  });

  it("requires IDs for profile publication", () => {
    expect(
      publishVenueProfileSchema.safeParse({
        organizationId,
        venueId,
      }).success
    ).toBe(true);

    expect(
      publishVenueProfileSchema.safeParse({
        organizationId,
        venueId: "not-a-cuid",
      }).success
    ).toBe(false);
  });
});

describe("venue staff validation", () => {
  it("allows scoped manager invites but not owner assignment by invitation", () => {
    expect(
      inviteVenueStaffSchema.safeParse({
        organizationId,
        venueId,
        email: "scheduler@example.com",
        role: "SCHEDULER",
      }).success
    ).toBe(true);

    expect(
      inviteVenueStaffSchema.safeParse({
        organizationId,
        email: "owner@example.com",
        role: "OWNER",
      }).success
    ).toBe(false);
  });
});
