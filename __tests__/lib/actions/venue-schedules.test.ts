import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const {
  mockRequireVenueScheduleManager,
  mockPrisma,
  mockLogVenueActivity,
  mockFindBookingConflicts,
  mockPopulateVenueOfferingAvailability,
} = vi.hoisted(() => ({
  mockRequireVenueScheduleManager: vi.fn(),
  mockLogVenueActivity: vi.fn(),
  mockFindBookingConflicts: vi.fn(),
  mockPopulateVenueOfferingAvailability: vi.fn(),
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
    iceSurface: {
      findMany: vi.fn(),
    },
    venueOperatingHour: {
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

vi.mock("@/lib/services/venue-reservation-availability", () => ({
  populateVenueOfferingAvailability: (...args: unknown[]) =>
    mockPopulateVenueOfferingAvailability(...args),
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
  getVenueScheduleAdminData,
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
  mockPrisma.iceSurface.findMany.mockResolvedValue([]);
  mockPrisma.venueOperatingHour.findMany.mockResolvedValue([]);
  mockFindBookingConflicts.mockResolvedValue([]);
  mockPopulateVenueOfferingAvailability.mockResolvedValue([]);
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

    expect(result).toEqual({
      id: VENUE_ID,
      name: "North Rink",
      scheduleBlocks: [],
      availableIce: [],
    });
    expect(mockPrisma.venue.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          slug: "north-rink",
          profileStatus: "PUBLISHED",
        }),
      })
    );
  });

  it("populates public requestable offerings with remaining slices and no occupancy detail", async () => {
    const startsAt = new Date("2026-09-01T18:00:00.000Z");
    const endsAt = new Date("2026-09-01T20:00:00.000Z");
    const block = {
      id: BLOCK_ID,
      title: "Requestable ice",
      startsAt,
      endsAt,
      registrationMode: "REQUEST_REQUIRED",
      intent: "OFFERING",
      surfaceId: "csurfacexxxxxxxxxxxxxxxxxx",
      segmentId: null,
      surface: { id: "csurfacexxxxxxxxxxxxxxxxxx", name: "Rink A" },
      segment: null,
      skillLevels: [],
      registrations: [],
    };
    mockPrisma.venue.findFirst.mockResolvedValue({
      id: VENUE_ID,
      name: "North Rink",
      timezone: "America/New_York",
      scheduleBlocks: [block],
      lessonOfferings: [],
    });
    mockPopulateVenueOfferingAvailability.mockResolvedValue([
      {
        ...block,
        surfaceName: "Rink A",
        remainingSlices: [
          {
            startsAt,
            endsAt: new Date("2026-09-01T18:30:00.000Z"),
          },
          {
            startsAt: new Date("2026-09-01T19:00:00.000Z"),
            endsAt,
          },
        ],
      },
    ]);

    const result = await getPublicVenueSchedule("north-rink");

    expect(mockPopulateVenueOfferingAvailability).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        venueId: VENUE_ID,
        offerings: [
          expect.objectContaining({
            id: BLOCK_ID,
            surfaceId: "csurfacexxxxxxxxxxxxxxxxxx",
            segmentId: null,
          }),
        ],
        mode: "PUBLIC",
      }),
    );
    expect(result?.availableIce[0]).toEqual(
      expect.objectContaining({
        remainingSlices: expect.any(Array),
      }),
    );
    expect(result?.availableIce[0]).not.toHaveProperty("occupancy");
    expect(mockPrisma.venue.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          scheduleBlocks: expect.objectContaining({
            where: expect.objectContaining({
              audience: "PUBLIC",
              visibility: "PUBLIC",
              status: "PUBLISHED",
            }),
          }),
        }),
      }),
    );
  });

  it("expands recurring requestable offerings into concrete future occurrences", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T12:00:00.000Z"));
    try {
      const block = {
        id: BLOCK_ID,
        title: "Weekly requestable ice",
        startsAt: new Date("2026-08-23T14:00:00.000Z"),
        endsAt: new Date("2026-08-23T15:00:00.000Z"),
        registrationMode: "REQUEST_REQUIRED",
        intent: "OFFERING",
        recurrenceRule: "FREQ=WEEKLY;COUNT=2",
        recurrenceEndDate: new Date("2026-08-30T14:00:00.000Z"),
        surfaceId: null,
        segmentId: null,
        surface: null,
        segment: null,
        skillLevels: [],
        registrations: [],
      };
      mockPrisma.venue.findFirst.mockResolvedValue({
        id: VENUE_ID,
        name: "North Rink",
        timezone: "America/New_York",
        scheduleBlocks: [block],
        lessonOfferings: [],
      });
      mockPopulateVenueOfferingAvailability.mockImplementation(
        async (
          _client: unknown,
          input: { offerings: Array<Record<string, unknown>> },
        ) =>
          input.offerings.map((offering: Record<string, unknown>) => ({
            ...offering,
            remainingSlices: [
              {
                startsAt: offering.startsAt,
                endsAt: offering.endsAt,
              },
            ],
          })),
      );

      const result = await getPublicVenueSchedule("north-rink");

      expect(mockPopulateVenueOfferingAvailability).toHaveBeenCalledWith(
        mockPrisma,
        expect.objectContaining({
          offerings: [
            expect.objectContaining({
              offeringBlockId: BLOCK_ID,
              startsAt: new Date("2026-08-23T14:00:00.000Z"),
            }),
            expect.objectContaining({
              offeringBlockId: BLOCK_ID,
              startsAt: new Date("2026-08-30T14:00:00.000Z"),
            }),
          ],
          mode: "PUBLIC",
        }),
      );
      expect(result?.availableIce).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("admin schedule availability", () => {
  it("populates the admin available-ice browser data", async () => {
    const startsAt = new Date("2026-09-01T18:00:00.000Z");
    const endsAt = new Date("2026-09-01T20:00:00.000Z");
    mockPrisma.venue.findFirst.mockResolvedValue({
      id: VENUE_ID,
      organizationId: ORGANIZATION_ID,
      slug: "north-rink",
      timezone: "America/New_York",
    });
    mockPrisma.venueScheduleBlock.findMany.mockResolvedValue([
      {
        id: BLOCK_ID,
        title: "Requestable ice",
        startsAt,
        endsAt,
        activityType: "OTHER",
        status: "PUBLISHED",
        intent: "OFFERING",
        registrationMode: "REQUEST_REQUIRED",
        surfaceId: null,
        segmentId: null,
        surface: null,
      },
    ]);
    mockPopulateVenueOfferingAvailability.mockResolvedValue([
      {
        id: BLOCK_ID,
        title: "Requestable ice",
        startsAt,
        endsAt,
        surfaceId: null,
        segmentId: null,
        surfaceName: null,
        occupancy: [],
        remainingSlices: [{ startsAt, endsAt }],
      },
    ]);

    const result = await getVenueScheduleAdminData(ORGANIZATION_ID, VENUE_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.availableIce).toEqual([
        expect.objectContaining({
          id: BLOCK_ID,
          remainingSlices: [{ startsAt, endsAt }],
        }),
      ]);
    }
    expect(mockPopulateVenueOfferingAvailability).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({ mode: "STAFF" }),
    );
  });
});
