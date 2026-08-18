import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const {
  mockRequireVenueScheduleManager,
  mockPrisma,
  mockLogVenueActivity,
  mockFindBookingConflicts,
  mockPopulateVenueOfferingAvailability,
  mockGetVenueBookings,
} = vi.hoisted(() => ({
  mockRequireVenueScheduleManager: vi.fn(),
  mockLogVenueActivity: vi.fn(),
  mockFindBookingConflicts: vi.fn(),
  mockPopulateVenueOfferingAvailability: vi.fn(),
  mockGetVenueBookings: vi.fn(),
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
    venueStaff: {
      findFirst: vi.fn(),
    },
    venueReservation: undefined as unknown,
    $transaction: vi.fn(),
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

const {
  mockCreateVenueReservation,
  mockTransitionVenueReservation,
} = vi.hoisted(() => ({
  mockCreateVenueReservation: vi.fn(),
  mockTransitionVenueReservation: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  VENUE_SCHEDULE_ROLES: ["OWNER", "MANAGER", "SCHEDULER"],
  requireVenueScheduleManager: (...args: unknown[]) => mockRequireVenueScheduleManager(...args),
}));

// Block conflict checks are delegated to the unified availability engine
// (feature 006); its five-source semantics are covered by
// __tests__/lib/utils/availability.test.ts.
vi.mock("@/lib/utils/availability", () => ({
  findBookingConflicts: (...args: unknown[]) => mockFindBookingConflicts(...args),
  getVenueBookings: (...args: unknown[]) => mockGetVenueBookings(...args),
}));

vi.mock("@/lib/services/venue-reservation-availability", () => ({
  populateVenueOfferingAvailability: (...args: unknown[]) =>
    mockPopulateVenueOfferingAvailability(...args),
}));

vi.mock("@/lib/services/venue-reservations", () => ({
  createVenueReservation: (...args: unknown[]) => mockCreateVenueReservation(...args),
  transitionVenueReservation: (...args: unknown[]) => mockTransitionVenueReservation(...args),
  VenueReservationConflictError: class VenueReservationConflictError extends Error {
    conflicts: unknown[];
    constructor(conflicts: unknown[]) {
      super("conflict");
      this.conflicts = conflicts;
    }
  },
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
  getVenueScheduleBoard,
  getPublicVenueSchedule,
  publishScheduleBlock,
  updateScheduleBlock,
} from "@/lib/actions/venue-schedules";

const USER_ID = "clusrxxxxxxxxxxxxxxxxxxxxxxx";
const ORGANIZATION_ID = "clorgxxxxxxxxxxxxxxxxxxxxxxx";
const VENUE_ID = "clvenxxxxxxxxxxxxxxxxxxxxxxx";
const BLOCK_ID = "clblkxxxxxxxxxxxxxxxxxxxxxxx";

function occupyingBlock(overrides: Record<string, unknown> = {}) {
  return {
    id: BLOCK_ID,
    venueId: VENUE_ID,
    surfaceId: null,
    segmentId: null,
    startsAt: new Date("2026-09-01T18:00:00.000Z"),
    endsAt: new Date("2026-09-01T19:00:00.000Z"),
    status: "PUBLISHED",
    intent: "VENUE_ACTIVITY",
    recurrenceRule: null,
    recurrenceEndDate: null,
    reservationOccurrences: [],
    venue: {
      organizationId: ORGANIZATION_ID,
      slug: "north-rink",
      timezone: "America/New_York",
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireVenueScheduleManager.mockResolvedValue(USER_ID);
  mockPrisma.venue.findFirst.mockResolvedValue({ id: VENUE_ID, organizationId: ORGANIZATION_ID });
  mockPrisma.venueScheduleBlock.findMany.mockResolvedValue([]);
  mockPrisma.venueStaff.findFirst.mockResolvedValue({ id: "venue-staff-1" });
  mockPrisma.iceSurface.findMany.mockResolvedValue([]);
  mockPrisma.venueOperatingHour.findMany.mockResolvedValue([]);
  mockFindBookingConflicts.mockResolvedValue([]);
  mockPopulateVenueOfferingAvailability.mockResolvedValue([]);
  mockGetVenueBookings.mockResolvedValue([]);
  mockLogVenueActivity.mockResolvedValue({ id: "cllogxxxxxxxxxxxxxxxxxxxxxxx" });
  mockCreateVenueReservation.mockResolvedValue({ id: "reservation-new" });
  mockTransitionVenueReservation.mockResolvedValue({ id: "reservation-old" });
  mockPrisma.venueReservation = undefined;
  mockPrisma.$transaction.mockReset();
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

describe("venue activity and closure recurrence materialization", () => {
  it.each([
    ["CLOSURE", "Maintenance window"],
    ["OPEN_SKATE", "Community skate"],
  ])("materializes recurring %s blocks into concrete bookings", async (activityType, title) => {
    mockPrisma.venue.findFirst.mockResolvedValue({
      id: VENUE_ID,
      organizationId: ORGANIZATION_ID,
      slug: "north-rink",
      timezone: "America/New_York",
    });
    mockPrisma.venueScheduleBlock.findMany.mockResolvedValue([
      {
        id: BLOCK_ID,
        title,
        description: null,
        activityType,
        audience: "PUBLIC",
        visibility: "PUBLIC",
        status: "DRAFT",
        startsAt: new Date("2026-09-01T18:00:00.000Z"),
        endsAt: new Date("2026-09-01T19:00:00.000Z"),
        recurrenceRule: "FREQ=WEEKLY;COUNT=2",
        recurrenceStartDate: new Date("2026-09-01T18:00:00.000Z"),
        recurrenceEndDate: new Date("2026-09-08T18:00:00.000Z"),
        capacity: null,
        priceAmount: null,
        priceCurrency: "USD",
        priceLabel: null,
        registrationMode: "INFO_ONLY",
        externalRegistrationUrl: null,
        surfaceId: null,
        segmentId: null,
        segment: null,
      },
    ]);

    const result = await getVenueScheduleBoard({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      from: new Date("2026-08-31T00:00:00.000Z"),
      to: new Date("2026-09-15T00:00:00.000Z"),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const matchingBookings = result.data.bookings.filter((booking) => booking.title === title);
      expect(matchingBookings).toHaveLength(2);
      expect(result.data.blocks[0]).toEqual(
        expect.objectContaining({
          activityType,
          status: "DRAFT",
          recurrenceRule: "FREQ=WEEKLY;COUNT=2",
        }),
      );
    }
  });

  it("replaces obsolete published occurrences and rechecks new ones", async () => {
    mockPrisma.venue.findFirst.mockResolvedValue({
      id: VENUE_ID,
      organizationId: ORGANIZATION_ID,
      slug: "north-rink",
      timezone: "America/New_York",
    });
    const oldStart = new Date("2026-09-01T18:00:00.000Z");
    const oldEnd = new Date("2026-09-01T19:00:00.000Z");
    const newStart = new Date("2026-09-02T18:00:00.000Z");
    const newEnd = new Date("2026-09-02T19:00:00.000Z");
    mockPrisma.venueScheduleBlock.findFirst.mockResolvedValue(occupyingBlock({
      startsAt: oldStart,
      endsAt: oldEnd,
    }));
    mockPrisma.venueScheduleBlock.update.mockResolvedValue(occupyingBlock({
      startsAt: newStart,
      endsAt: newEnd,
    }));
    mockPrisma.venueReservation = {
      findMany: vi.fn().mockResolvedValue([{
        id: "reservation-old",
        startsAt: oldStart,
        endsAt: oldEnd,
        status: "CONFIRMED",
      }]),
      update: vi.fn(),
    };
    mockPrisma.$transaction.mockImplementation((work: (tx: unknown) => unknown) =>
      work(mockPrisma),
    );

    const result = await updateScheduleBlock({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      scheduleBlockId: BLOCK_ID,
      title: "Rescheduled maintenance",
      activityType: "CLOSURE",
      startsAt: newStart.toISOString(),
      endsAt: newEnd.toISOString(),
      status: "PUBLISHED",
    });

    expect(result.success).toBe(true);
    expect(mockTransitionVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reservationId: "reservation-old",
        nextStatus: "CANCELED",
      }),
    );
    expect(mockCreateVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sourceScheduleBlockId: BLOCK_ID,
        startsAt: newStart,
        endsAt: newEnd,
      }),
    );
  });

  it("replaces an occurrence when its surface or segment scope changes", async () => {
    const oldSurfaceId = "csurfacexxxxxxxxxxxxxxxxxx";
    const newSurfaceId = "csurfaceyyyyyyyyyyyyyyyyyy";
    const newSegmentId = "csegmentxxxxxxxxxxxxxxxxxx";
    const startsAt = new Date("2026-09-02T18:00:00.000Z");
    const endsAt = new Date("2026-09-02T19:00:00.000Z");
    mockPrisma.venueScheduleBlock.findFirst.mockResolvedValue(occupyingBlock({
      surfaceId: oldSurfaceId,
      startsAt,
      endsAt,
    }));
    mockPrisma.venueScheduleBlock.update.mockResolvedValue(occupyingBlock({
      surfaceId: newSurfaceId,
      segmentId: newSegmentId,
      startsAt,
      endsAt,
    }));
    mockPrisma.surfaceSegment.findFirst.mockResolvedValue({
      id: newSegmentId,
      isActive: true,
      surfaceId: newSurfaceId,
      surface: { venueId: VENUE_ID },
    });
    mockPrisma.venueReservation = {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "reservation-old",
          venueId: VENUE_ID,
          surfaceId: oldSurfaceId,
          segmentId: null,
          startsAt,
          endsAt,
          status: "CONFIRMED",
        },
      ]),
      update: vi.fn(),
    };
    mockPrisma.$transaction.mockImplementation((work: (tx: unknown) => unknown) =>
      work(mockPrisma),
    );

    const result = await updateScheduleBlock({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      scheduleBlockId: BLOCK_ID,
      title: "Segmented maintenance",
      activityType: "CLOSURE",
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "PUBLISHED",
      surfaceId: newSurfaceId,
      segmentId: newSegmentId,
    });

    expect(result.success).toBe(true);
    expect(mockTransitionVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reservationId: "reservation-old",
        nextStatus: "CANCELED",
      }),
    );
    expect(mockCreateVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        surfaceId: newSurfaceId,
        segmentId: newSegmentId,
        startsAt,
        endsAt,
      }),
    );
  });

  it("cancels all source reservations atomically when a block is canceled", async () => {
    mockPrisma.venue.findFirst.mockResolvedValue({
      id: VENUE_ID,
      organizationId: ORGANIZATION_ID,
      slug: "north-rink",
      timezone: "America/New_York",
    });
    mockPrisma.venueScheduleBlock.findFirst.mockResolvedValue(occupyingBlock());
    mockPrisma.venueScheduleBlock.update.mockResolvedValue({
      id: BLOCK_ID,
      status: "CANCELED",
    });
    mockPrisma.venueReservation = {
      findMany: vi.fn().mockResolvedValue([
        { id: "reservation-1" },
        { id: "reservation-2" },
      ]),
      update: vi.fn(),
    };
    mockPrisma.$transaction.mockImplementation((work: (tx: unknown) => unknown) =>
      work(mockPrisma),
    );

    const result = await cancelScheduleBlock({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      scheduleBlockId: BLOCK_ID,
    });

    expect(result.success).toBe(true);
    expect(mockTransitionVenueReservation).toHaveBeenCalledTimes(2);
    expect(mockTransitionVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        nextStatus: "CANCELED",
        allowAssignedDisposition: true,
      }),
    );
  });

  it("reports a failed occurrence reconciliation so the transaction can roll back", async () => {
    mockPrisma.venue.findFirst.mockResolvedValue({
      id: VENUE_ID,
      organizationId: ORGANIZATION_ID,
      slug: "north-rink",
      timezone: "America/New_York",
    });
    mockPrisma.venueScheduleBlock.findFirst.mockResolvedValue(occupyingBlock());
    mockPrisma.venueScheduleBlock.update.mockResolvedValue(occupyingBlock());
    mockPrisma.venueReservation = {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    };
    mockCreateVenueReservation.mockRejectedValueOnce(new Error("conflict"));
    mockPrisma.$transaction.mockImplementation((work: (tx: unknown) => unknown) =>
      work(mockPrisma),
    );

    const result = await updateScheduleBlock({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      scheduleBlockId: BLOCK_ID,
      title: "Broken replacement",
      activityType: "CLOSURE",
      startsAt: "2026-09-03T18:00:00Z",
      endsAt: "2026-09-03T19:00:00Z",
      status: "PUBLISHED",
    });

    expect(result).toEqual({
      success: false,
      error: "Failed to update schedule block.",
    });
  });

  it("uses the block status reloaded inside the update transaction", async () => {
    const startsAt = new Date("2026-09-04T18:00:00.000Z");
    const endsAt = new Date("2026-09-04T19:00:00.000Z");
    mockPrisma.venueScheduleBlock.findFirst.mockResolvedValue(occupyingBlock({
      startsAt,
      endsAt,
      status: "PUBLISHED",
    }));
    mockPrisma.venueScheduleBlock.update.mockResolvedValue(occupyingBlock({
      startsAt,
      endsAt,
      status: "DRAFT",
    }));
    mockPrisma.venueReservation = {
      findMany: vi.fn().mockResolvedValue([{ id: "reservation-concurrent" }]),
      update: vi.fn(),
    };
    let insideTransaction = false;
    mockPrisma.$transaction.mockImplementation(
      async (work: (tx: typeof mockPrisma) => unknown) => {
        insideTransaction = true;
        try {
          return await work(mockPrisma);
        } finally {
          insideTransaction = false;
        }
      },
    );
    mockPrisma.venueScheduleBlock.findFirst.mockImplementation(async () => {
      expect(insideTransaction).toBe(true);
      return occupyingBlock({ startsAt, endsAt, status: "PUBLISHED" });
    });

    const result = await updateScheduleBlock({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      scheduleBlockId: BLOCK_ID,
      title: "Draft concurrent closure",
      activityType: "CLOSURE",
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "DRAFT",
    });

    expect(result.success).toBe(true);
    expect(mockTransitionVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reservationId: "reservation-concurrent" }),
    );
    expect(mockPrisma.venueScheduleBlock.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          venue: { organizationId: ORGANIZATION_ID },
        }),
        select: expect.objectContaining({ reservationOccurrences: expect.anything() }),
      }),
    );
  });

  it("reloads recurrence and authorization scope on a publish retry", async () => {
    const first = occupyingBlock({
      status: "DRAFT",
      recurrenceRule: null,
      recurrenceEndDate: null,
    });
    const concurrentlyChanged = occupyingBlock({
      status: "DRAFT",
      recurrenceRule: "FREQ=WEEKLY",
      recurrenceEndDate: null,
    });
    mockPrisma.venueScheduleBlock.findFirst
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(concurrentlyChanged);
    mockPrisma.venueScheduleBlock.update.mockResolvedValue({
      id: BLOCK_ID,
      status: "PUBLISHED",
    });
    mockPrisma.venueReservation = {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    };
    let attempt = 0;
    mockPrisma.$transaction.mockImplementation(
      async (work: (tx: typeof mockPrisma) => unknown) => {
        attempt += 1;
        const result = await work(mockPrisma);
        if (attempt === 1) {
          throw new Prisma.PrismaClientKnownRequestError("write conflict", {
            code: "P2034",
            clientVersion: "test",
          });
        }
        return result;
      },
    );

    const result = await publishScheduleBlock({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      scheduleBlockId: BLOCK_ID,
    });

    expect(result).toEqual({
      success: false,
      error: "Occupying recurring blocks must have an end date.",
    });
    expect(mockPrisma.venueScheduleBlock.findFirst).toHaveBeenCalledTimes(2);
    expect(mockPrisma.venueStaff.findFirst).toHaveBeenCalledTimes(2);
    for (const [query] of mockPrisma.venueScheduleBlock.findFirst.mock.calls) {
      expect(query).toEqual(expect.objectContaining({
        where: expect.objectContaining({
          venue: { organizationId: ORGANIZATION_ID },
        }),
        select: expect.objectContaining({ reservationOccurrences: expect.anything() }),
      }));
    }
    expect(mockLogVenueActivity).not.toHaveBeenCalled();
  });

  it("rechecks schedule-manager authorization inside every update retry", async () => {
    mockPrisma.venueScheduleBlock.findFirst.mockResolvedValue(occupyingBlock());
    mockPrisma.venueScheduleBlock.update.mockResolvedValue(occupyingBlock());
    mockPrisma.venueReservation = {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    };
    mockPrisma.venueStaff.findFirst
      .mockResolvedValueOnce({ id: "venue-staff-1" })
      .mockResolvedValueOnce(null);
    let attempt = 0;
    mockPrisma.$transaction.mockImplementation(
      async (work: (tx: typeof mockPrisma) => unknown) => {
        attempt += 1;
        const result = await work(mockPrisma);
        if (attempt === 1) {
          throw new Prisma.PrismaClientKnownRequestError("write conflict", {
            code: "P2034",
            clientVersion: "test",
          });
        }
        return result;
      },
    );

    const result = await updateScheduleBlock({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      scheduleBlockId: BLOCK_ID,
      title: "Concurrent closure",
      activityType: "CLOSURE",
      startsAt: "2026-09-03T18:00:00Z",
      endsAt: "2026-09-03T19:00:00Z",
      status: "PUBLISHED",
    });

    expect(result).toEqual({
      success: false,
      error: "Unauthorized: You do not have permission to manage this venue",
    });
    expect(mockPrisma.venueStaff.findFirst).toHaveBeenCalledTimes(2);
    expect(mockLogVenueActivity).not.toHaveBeenCalled();
  });

  it("uses fresh cancel intent and linked-reservation state in the transaction", async () => {
    mockPrisma.venueScheduleBlock.findFirst.mockResolvedValue(occupyingBlock({
      status: "PUBLISHED",
      intent: "OFFERING",
      reservationOccurrences: [{ id: "reservation-linked", status: "CONFIRMED" }],
    }));
    mockPrisma.venueScheduleBlock.update.mockResolvedValue({
      id: BLOCK_ID,
      status: "CANCELED",
    });
    mockPrisma.venueReservation = {
      findMany: vi.fn().mockResolvedValue([{ id: "reservation-linked" }]),
      update: vi.fn(),
    };
    mockPrisma.$transaction.mockImplementation(
      async (work: (tx: typeof mockPrisma) => unknown) => work(mockPrisma),
    );

    const result = await cancelScheduleBlock({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      scheduleBlockId: BLOCK_ID,
    });

    expect(result.success).toBe(true);
    const reservationClient = mockPrisma.venueReservation as {
      findMany: ReturnType<typeof vi.fn>;
    };
    expect(reservationClient.findMany).not.toHaveBeenCalled();
    expect(mockTransitionVenueReservation).not.toHaveBeenCalled();
    expect(mockPrisma.venueScheduleBlock.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ reservationOccurrences: expect.anything() }),
      }),
    );
  });
});
