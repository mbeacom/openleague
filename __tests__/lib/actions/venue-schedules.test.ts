import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const {
  mockRequireVenueScheduleManager,
  mockPrisma,
  mockLogVenueActivity,
  mockFindBookingConflicts,
} = vi.hoisted(() => ({
  mockRequireVenueScheduleManager: vi.fn(),
  mockLogVenueActivity: vi.fn(),
  mockFindBookingConflicts: vi.fn(),
  mockPrisma: {
    venue: {
      findFirst: vi.fn(),
    },
    venueScheduleBlock: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    surfaceSegment: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireVenueScheduleManager: (...args: unknown[]) => mockRequireVenueScheduleManager(...args),
}));

// Block conflict checks are delegated to the unified availability engine
// (feature 006); its five-source semantics are covered by
// __tests__/lib/utils/availability.test.ts.
vi.mock("@/lib/utils/availability", () => ({
  findBookingConflicts: (...args: unknown[]) => mockFindBookingConflicts(...args),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mockPrisma,
}));

// logVenueActivity moved to lib/services/venue-activity (out of the "use server"
// file). Mock it at its new home; the venue-organizations mock below remains for
// its other exports.
vi.mock("@/lib/services/venue-activity", () => ({
  logVenueActivity: (...args: unknown[]) => mockLogVenueActivity(...args),
}));

vi.mock("@/lib/actions/venue-organizations", () => ({
  logVenueActivity: (...args: unknown[]) => mockLogVenueActivity(...args),
  publicPublishedVenueWhere: {
    isActive: true,
    visibility: "PUBLIC",
    profileStatus: "PUBLISHED",
    slug: { not: null },
  },
}));

import {
  cancelScheduleBlock,
  createScheduleBlock,
  getPublicVenueSchedule,
  publishScheduleBlock,
  updateScheduleBlock,
} from "@/lib/actions/venue-schedules";

const USER_ID = "clusrxxxxxxxxxxxxxxxxxxxxxxx";
const ORGANIZATION_ID = "clorgxxxxxxxxxxxxxxxxxxxxxxx";
const VENUE_ID = "clvenxxxxxxxxxxxxxxxxxxxxxxx";
const BLOCK_ID = "clblkxxxxxxxxxxxxxxxxxxxxxxx";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireVenueScheduleManager.mockResolvedValue(USER_ID);
  mockPrisma.venue.findFirst.mockResolvedValue({ id: VENUE_ID, organizationId: ORGANIZATION_ID });
  mockPrisma.venueScheduleBlock.findMany.mockResolvedValue([]);
  mockFindBookingConflicts.mockResolvedValue([]);
  mockLogVenueActivity.mockResolvedValue({ id: "cllogxxxxxxxxxxxxxxxxxxxxxxx" });
});

describe("schedule block actions", () => {
  const scheduleInput = {
    organizationId: ORGANIZATION_ID,
    venueId: VENUE_ID,
    title: "Open Skate",
    activityType: "OPEN_SKATE" as const,
    startsAt: "2026-02-01T18:00:00Z",
    endsAt: "2026-02-01T20:00:00Z",
    status: "DRAFT" as const,
  };

  it("creates draft schedule blocks after conflict checking", async () => {
    mockPrisma.venueScheduleBlock.create.mockResolvedValue({
      id: BLOCK_ID,
      venueId: VENUE_ID,
      status: "DRAFT",
    });

    const result = await createScheduleBlock(scheduleInput);

    expect(result.success).toBe(true);
    expect(mockFindBookingConflicts).toHaveBeenCalledWith(
      expect.objectContaining({
        venueId: VENUE_ID,
        surfaceId: null,
        segmentId: null,
      })
    );
    expect(mockPrisma.venueScheduleBlock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Open Skate",
          status: "DRAFT",
          createdById: USER_ID,
        }),
      })
    );
  });

  it("rejects publishing over conflicting bookings from any source", async () => {
    mockFindBookingConflicts.mockResolvedValue([
      {
        source: "seasonGame",
        title: "Sharks vs Jets",
        startAt: new Date("2026-02-01T19:00:00Z"),
        endAt: new Date("2026-02-01T21:00:00Z"),
        surfaceId: null,
        segmentId: null,
        segmentName: null,
      },
    ]);

    const result = await createScheduleBlock({ ...scheduleInput, status: "PUBLISHED" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.details).toEqual(
        expect.objectContaining({
          conflicts: expect.arrayContaining([
            expect.objectContaining({ source: "seasonGame" }),
          ]),
        })
      );
    }
    expect(mockPrisma.venueScheduleBlock.create).not.toHaveBeenCalled();
  });

  it("still saves drafts when conflicts exist", async () => {
    mockFindBookingConflicts.mockResolvedValue([
      {
        source: "practice",
        title: "Practice — Tuesday skills",
        startAt: new Date("2026-02-01T19:00:00Z"),
        endAt: new Date("2026-02-01T20:00:00Z"),
        surfaceId: null,
        segmentId: null,
        segmentName: null,
      },
    ]);
    mockPrisma.venueScheduleBlock.create.mockResolvedValue({
      id: BLOCK_ID,
      venueId: VENUE_ID,
      status: "DRAFT",
    });

    const result = await createScheduleBlock(scheduleInput);

    expect(result.success).toBe(true);
    expect(mockPrisma.venueScheduleBlock.create).toHaveBeenCalled();
  });

  it("validates that a segment belongs to the selected surface and is active", async () => {
    mockPrisma.surfaceSegment.findFirst.mockResolvedValue(null);

    const result = await createScheduleBlock({
      ...scheduleInput,
      surfaceId: "clsurxxxxxxxxxxxxxxxxxxxxxxx",
      segmentId: "clsegxxxxxxxxxxxxxxxxxxxxxxx",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/segment/i);
    }
    expect(mockPrisma.venueScheduleBlock.create).not.toHaveBeenCalled();
  });

  it("rejects a segment without a surface selection", async () => {
    const result = await createScheduleBlock({
      ...scheduleInput,
      segmentId: "clsegxxxxxxxxxxxxxxxxxxxxxxx",
    });

    expect(result.success).toBe(false);
    expect(mockPrisma.venueScheduleBlock.create).not.toHaveBeenCalled();
  });

  it("persists the segment when it is active on the selected surface", async () => {
    mockPrisma.surfaceSegment.findFirst.mockResolvedValue({
      id: "clsegxxxxxxxxxxxxxxxxxxxxxxx",
      isActive: true,
    });
    mockPrisma.venueScheduleBlock.create.mockResolvedValue({
      id: BLOCK_ID,
      venueId: VENUE_ID,
      status: "DRAFT",
    });

    const result = await createScheduleBlock({
      ...scheduleInput,
      surfaceId: "clsurxxxxxxxxxxxxxxxxxxxxxxx",
      segmentId: "clsegxxxxxxxxxxxxxxxxxxxxxxx",
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.venueScheduleBlock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ segmentId: "clsegxxxxxxxxxxxxxxxxxxxxxxx" }),
      })
    );
  });

  it("updates, publishes, and cancels schedule blocks", async () => {
    mockPrisma.venueScheduleBlock.create.mockResolvedValue({ id: BLOCK_ID, status: "DRAFT" });
    mockPrisma.venueScheduleBlock.update
      .mockResolvedValueOnce({ id: BLOCK_ID, status: "DRAFT" })
      .mockResolvedValueOnce({ id: BLOCK_ID, status: "PUBLISHED" })
      .mockResolvedValueOnce({ id: BLOCK_ID, status: "CANCELED" });
    mockPrisma.venueScheduleBlock.findFirst.mockResolvedValue({
      id: BLOCK_ID,
      venueId: VENUE_ID,
      venue: { organizationId: ORGANIZATION_ID, slug: "north-rink" },
      startsAt: new Date("2026-02-01T18:00:00Z"),
      endsAt: new Date("2026-02-01T20:00:00Z"),
      status: "DRAFT",
      activityType: "OPEN_SKATE",
    });

    expect((await updateScheduleBlock({ ...scheduleInput, scheduleBlockId: BLOCK_ID })).success).toBe(true);
    expect((await publishScheduleBlock({ organizationId: ORGANIZATION_ID, venueId: VENUE_ID, scheduleBlockId: BLOCK_ID })).success).toBe(true);
    expect((await cancelScheduleBlock({ organizationId: ORGANIZATION_ID, venueId: VENUE_ID, scheduleBlockId: BLOCK_ID })).success).toBe(true);
  });
});

describe("public schedule query", () => {
  it("returns only public published schedule data for published rinks", async () => {
    mockPrisma.venue.findFirst.mockResolvedValue({
      id: VENUE_ID,
      name: "North Rink",
      scheduleBlocks: [],
    });

    const result = await getPublicVenueSchedule("north-rink");

    expect(result).toEqual({ id: VENUE_ID, name: "North Rink", scheduleBlocks: [] });
    expect(mockPrisma.venue.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          slug: "north-rink",
          profileStatus: "PUBLISHED",
        }),
      })
    );
  });
});
