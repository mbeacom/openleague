import { describe, expect, it } from "vitest";
import {
  createIceSurfaceSchema,
  decideIceTimeRequestSchema,
  skillLevelReferenceSchema,
  submitIceTimeRequestSchema,
  venueContentPostSchema,
  venueOperatingHourSchema,
  venueRelationshipSchema,
  venueScheduleBlockSchema,
} from "@/lib/utils/validation";

const organizationId = "clorgxxxxxxxxxxxxxxxxxxxxxxx";
const venueId = "clvenxxxxxxxxxxxxxxxxxxxxxxx";
const surfaceId = "clsurxxxxxxxxxxxxxxxxxxxxxxx";
const scheduleBlockId = "clblkxxxxxxxxxxxxxxxxxxxxxxx";

describe("venue surface and operating-hour validation", () => {
  it("accepts expanded surface types for rink facilities", () => {
    const result = createIceSurfaceSchema.safeParse({
      organizationId,
      venueId,
      name: "Studio Room",
      surfaceType: "STUDIO",
    });

    expect(result.success).toBe(true);
  });

  it("rejects operating hour effective ranges that end before they start", () => {
    const result = venueOperatingHourSchema.safeParse({
      organizationId,
      venueId,
      surfaceId,
      dayOfWeek: 1,
      opensAt: "08:00",
      closesAt: "22:00",
      effectiveStartDate: "2026-01-10T00:00:00Z",
      effectiveEndDate: "2026-01-01T00:00:00Z",
    });

    expect(result.success).toBe(false);
  });
});

describe("venue schedule block validation", () => {
  it("accepts a public schedule block with capacity and pricing", () => {
    const result = venueScheduleBlockSchema.safeParse({
      organizationId,
      venueId,
      surfaceId,
      title: "Open Skate",
      activityType: "OPEN_SKATE",
      startsAt: "2026-02-01T18:00:00Z",
      endsAt: "2026-02-01T20:00:00Z",
      capacity: "80",
      priceAmount: "1200",
      registrationMode: "INFO_ONLY",
    });

    expect(result.success).toBe(true);
  });

  it("rejects reversed times and missing external registration URLs", () => {
    expect(
      venueScheduleBlockSchema.safeParse({
        organizationId,
        venueId,
        title: "Clinic",
        activityType: "PUBLIC_LESSON",
        startsAt: "2026-02-01T20:00:00Z",
        endsAt: "2026-02-01T18:00:00Z",
      }).success
    ).toBe(false);

    expect(
      venueScheduleBlockSchema.safeParse({
        organizationId,
        venueId,
        title: "Clinic",
        activityType: "PUBLIC_LESSON",
        startsAt: "2026-02-01T18:00:00Z",
        endsAt: "2026-02-01T20:00:00Z",
        registrationMode: "EXTERNAL_REGISTRATION",
      }).success
    ).toBe(false);
  });
});

describe("venue request/content/relationship validation", () => {
  it("requires ice-time request end times after start times", () => {
    expect(
      submitIceTimeRequestSchema.safeParse({
        scheduleBlockId,
        venueId,
        contactName: "Coach One",
        contactEmail: "coach@example.com",
        requestedStartAt: "2026-03-01T10:00:00Z",
        requestedEndAt: "2026-03-01T11:00:00Z",
      }).success
    ).toBe(true);

    expect(
      submitIceTimeRequestSchema.safeParse({
        scheduleBlockId,
        venueId,
        contactName: "Coach One",
        contactEmail: "coach@example.com",
        requestedStartAt: "2026-03-01T11:00:00Z",
        requestedEndAt: "2026-03-01T10:00:00Z",
      }).success
    ).toBe(false);
  });

  it("accepts explicit request decisions only", () => {
    expect(
      decideIceTimeRequestSchema.safeParse({
        organizationId,
        venueId,
        requestId: "clreqxxxxxxxxxxxxxxxxxxxxxxx",
        status: "ACCEPTED",
      }).success
    ).toBe(true);

    expect(
      decideIceTimeRequestSchema.safeParse({
        organizationId,
        venueId,
        requestId: "clreqxxxxxxxxxxxxxxxxxxxxxxx",
        status: "UNDER_REVIEW",
      }).success
    ).toBe(false);
  });

  it("validates venue content slugs, relationships, and skill labels", () => {
    expect(
      venueContentPostSchema.safeParse({
        organizationId,
        venueId,
        title: "Try Hockey",
        slug: "try-hockey",
        body: "Join us.",
      }).success
    ).toBe(true);

    expect(
      venueContentPostSchema.safeParse({
        organizationId,
        venueId,
        title: "Try Hockey",
        slug: "Try Hockey",
        body: "Join us.",
      }).success
    ).toBe(false);

    expect(
      venueRelationshipSchema.safeParse({
        organizationId,
        venueId,
        relationshipType: "PREFERRED",
        targetType: "TEAM",
        invitedEmail: "coach@example.com",
      }).success
    ).toBe(true);

    expect(
      skillLevelReferenceSchema.safeParse({
        source: "RINK_CUSTOM",
        discipline: "HOCKEY",
        label: "Learn to Play",
      }).success
    ).toBe(true);
  });
});
