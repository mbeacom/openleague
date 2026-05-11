import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { mockRequireVenueContentManager, mockPrisma } = vi.hoisted(() => ({
  mockRequireVenueContentManager: vi.fn(),
  mockPrisma: {
    venue: { findFirst: vi.fn() },
    lessonOffering: { create: vi.fn(), update: vi.fn() },
    venueScheduleBlock: { create: vi.fn() },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireVenueContentManager: (...args: unknown[]) => mockRequireVenueContentManager(...args),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

import {
  archiveLessonOffering,
  createLessonOffering,
  publishLessonOffering,
  publishSpecialtyEvent,
} from "@/lib/actions/venue-content";

const ORGANIZATION_ID = "clorgxxxxxxxxxxxxxxxxxxxxxxx";
const VENUE_ID = "clvenxxxxxxxxxxxxxxxxxxxxxxx";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireVenueContentManager.mockResolvedValue("clusrxxxxxxxxxxxxxxxxxxxxxxx");
  mockPrisma.venue.findFirst.mockResolvedValue({ id: VENUE_ID, organizationId: ORGANIZATION_ID, slug: "north-rink" });
});

describe("venue lessons and specialty events", () => {
  it("creates, publishes, and archives lesson offerings", async () => {
    mockPrisma.lessonOffering.create.mockResolvedValue({ id: "cllesxxxxxxxxxxxxxxxxxxxxxxx", status: "DRAFT" });
    mockPrisma.lessonOffering.update
      .mockResolvedValueOnce({ id: "cllesxxxxxxxxxxxxxxxxxxxxxxx", status: "PUBLISHED" })
      .mockResolvedValueOnce({ id: "cllesxxxxxxxxxxxxxxxxxxxxxxx", status: "ARCHIVED" });

    expect((await createLessonOffering({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      title: "Learn to Skate",
      lessonType: "GROUP",
    })).success).toBe(true);
    expect((await publishLessonOffering({ organizationId: ORGANIZATION_ID, venueId: VENUE_ID, lessonOfferingId: "cllesxxxxxxxxxxxxxxxxxxxxxxx" })).success).toBe(true);
    expect((await archiveLessonOffering({ organizationId: ORGANIZATION_ID, venueId: VENUE_ID, lessonOfferingId: "cllesxxxxxxxxxxxxxxxxxxxxxxx" })).success).toBe(true);
  });

  it("publishes specialty events as public schedule blocks", async () => {
    mockPrisma.venueScheduleBlock.create.mockResolvedValue({ id: "clblkxxxxxxxxxxxxxxxxxxxxxxx", status: "PUBLISHED" });

    const result = await publishSpecialtyEvent({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      title: "Holiday Skate",
      activityType: "SPECIALTY_EVENT",
      startsAt: "2026-12-01T18:00:00Z",
      endsAt: "2026-12-01T20:00:00Z",
      status: "PUBLISHED",
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.venueScheduleBlock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          activityType: "SPECIALTY_EVENT",
          visibility: "PUBLIC",
        }),
      })
    );
  });
});
