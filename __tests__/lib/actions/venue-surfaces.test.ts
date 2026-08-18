import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  mockRequireVenueScheduleManager,
  mockPrisma,
  mockLogVenueActivity,
} = vi.hoisted(() => ({
  mockRequireVenueScheduleManager: vi.fn(),
  mockLogVenueActivity: vi.fn(),
  mockPrisma: {
    surfaceSegment: { findUnique: vi.fn(), update: vi.fn() },
    seasonGame: { findMany: vi.fn() },
    eventGame: { findMany: vi.fn() },
    venueScheduleBlock: { findMany: vi.fn() },
    practiceSession: { findMany: vi.fn() },
    venueReservation: { findMany: vi.fn() },
    iceTimeRequest: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireVenueScheduleManager: (...args: unknown[]) =>
    mockRequireVenueScheduleManager(...args),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/services/venue-activity", () => ({
  logVenueActivity: (...args: unknown[]) => mockLogVenueActivity(...args),
}));

import { setSegmentActive } from "@/lib/actions/venue-surfaces";

const ORGANIZATION_ID = "clorgxxxxxxxxxxxxxxxxxxxxxxx";
const VENUE_ID = "clvenxxxxxxxxxxxxxxxxxxxxxxx";
const SURFACE_ID = "clsurxxxxxxxxxxxxxxxxxxxxxxx";
const SEGMENT_ID = "clsegxxxxxxxxxxxxxxxxxxxxxxx";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireVenueScheduleManager.mockResolvedValue("clusrxxxxxxxxxxxxxxxxxxxxxxx");
  mockPrisma.surfaceSegment.findUnique.mockResolvedValue({
    id: SEGMENT_ID,
    name: "North",
    isActive: true,
    surfaceId: SURFACE_ID,
    surface: {
      name: "Main",
      venueId: VENUE_ID,
      venue: { organizationId: ORGANIZATION_ID, slug: "rink" },
    },
  });
  mockPrisma.venueReservation.findMany.mockResolvedValue([]);
  mockPrisma.seasonGame.findMany.mockResolvedValue([]);
  mockPrisma.eventGame.findMany.mockResolvedValue([]);
  mockPrisma.venueScheduleBlock.findMany.mockResolvedValue([]);
  mockPrisma.practiceSession.findMany.mockResolvedValue([]);
  mockPrisma.iceTimeRequest.findMany.mockResolvedValue([]);
  mockPrisma.surfaceSegment.update.mockResolvedValue({ id: SEGMENT_ID, isActive: false });
  mockPrisma.$transaction.mockImplementation(
    async (callback: (tx: typeof mockPrisma) => unknown) => callback(mockPrisma),
  );
  mockLogVenueActivity.mockResolvedValue({ id: "cllogxxxxxxxxxxxxxxxxxxxxxxx" });
});

describe("segment deactivation guards", () => {
  it("reads active canonical reservations and retains exact venue/surface scope", async () => {
    mockPrisma.venueReservation.findMany.mockResolvedValue([
      {
        id: "clreservationxxxxxxxxxxxxxxxxx",
        startsAt: new Date("2027-01-10T18:00:00Z"),
        endsAt: new Date("2027-01-10T19:30:00Z"),
        surfaceId: SURFACE_ID,
        segmentId: SEGMENT_ID,
        sourceScheduleBlock: null,
      },
    ]);

    const result = await setSegmentActive({ segmentId: SEGMENT_ID, isActive: false });

    expect(result.success).toBe(false);
    expect(mockPrisma.venueReservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          venueId: VENUE_ID,
          surfaceId: SURFACE_ID,
          segmentId: { in: [SEGMENT_ID] },
        }),
      }),
    );
  });

  it("retains an active published offering as a deactivation reference", async () => {
    mockPrisma.venueScheduleBlock.findMany.mockResolvedValue([
      {
        id: "clblockxxxxxxxxxxxxxxxxxxxxxxx",
        title: "Public skate requests",
        startsAt: new Date("2027-01-10T18:00:00Z"),
        endsAt: new Date("2027-01-10T19:30:00Z"),
        surfaceId: SURFACE_ID,
        segmentId: SEGMENT_ID,
        segment: { name: "North" },
        recurrenceRule: null,
        recurrenceEndDate: null,
        venue: { timezone: "America/New_York" },
        reservationOccurrences: [],
      },
    ]);

    const result = await setSegmentActive({ segmentId: SEGMENT_ID, isActive: false });

    expect(result.success).toBe(false);
    expect(mockPrisma.venueScheduleBlock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          venueId: VENUE_ID,
          surfaceId: SURFACE_ID,
          intent: { in: ["OFFERING", "VENUE_ACTIVITY", "CLOSURE"] },
        }),
      }),
    );
  });

  it("dual-reads unlinked legacy bookings alongside canonical reservations", async () => {
    mockPrisma.venueReservation.findMany.mockResolvedValue([
      {
        id: "clreservationxxxxxxxxxxxxxxxxx",
        startsAt: new Date("2027-01-10T18:00:00Z"),
        endsAt: new Date("2027-01-10T19:30:00Z"),
        surfaceId: SURFACE_ID,
        segmentId: SEGMENT_ID,
        sourceScheduleBlock: null,
      },
    ]);
    mockPrisma.seasonGame.findMany.mockResolvedValue([
      {
        id: "clgamexxxxxxxxxxxxxxxxxxxxxxxx",
        startAt: new Date("2027-01-11T18:00:00Z"),
        endAt: new Date("2027-01-11T19:30:00Z"),
        surfaceId: SURFACE_ID,
        segmentId: SEGMENT_ID,
        segment: { name: "North" },
        homeTeam: { name: "A" },
        awayTeam: { name: "B" },
      },
    ]);

    const result = await setSegmentActive({ segmentId: SEGMENT_ID, isActive: false });

    expect(result.success).toBe(false);
    if (!result.success) {
      const details = result.details as
        | { futureBookings?: Array<{ source: string }> }
        | undefined;
      expect(details?.futureBookings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ source: "venueReservation" }),
          expect.objectContaining({ source: "seasonGame" }),
        ]),
      );
    }
  });

  it("rechecks active state and reservations on a serializable retry", async () => {
    mockPrisma.surfaceSegment.findUnique
      .mockResolvedValueOnce({
        id: SEGMENT_ID,
        name: "North",
        isActive: true,
        surfaceId: SURFACE_ID,
        surface: {
          name: "Main",
          venueId: VENUE_ID,
          venue: { organizationId: ORGANIZATION_ID, slug: "rink" },
        },
      })
      .mockResolvedValue({
        id: SEGMENT_ID,
        name: "North",
        isActive: true,
        surfaceId: SURFACE_ID,
        surface: {
          name: "Main",
          venueId: VENUE_ID,
          venue: { organizationId: ORGANIZATION_ID, slug: "rink" },
        },
      });
    mockPrisma.venueReservation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: "clreservationxxxxxxxxxxxxxxxxx",
        startsAt: new Date("2027-01-10T18:00:00Z"),
        endsAt: new Date("2027-01-10T19:30:00Z"),
        surfaceId: SURFACE_ID,
        segmentId: SEGMENT_ID,
        sourceScheduleBlock: null,
      }]);
    let attempt = 0;
    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mockPrisma) => unknown) => {
        attempt += 1;
        const result = await callback(mockPrisma);
        if (attempt === 1) {
          throw new Prisma.PrismaClientKnownRequestError("write conflict", {
            code: "P2034",
            clientVersion: "test",
          });
        }
        return result;
      },
    );

    const result = await setSegmentActive({ segmentId: SEGMENT_ID, isActive: false });

    expect(result.success).toBe(false);
    expect(mockPrisma.surfaceSegment.findUnique).toHaveBeenCalledTimes(3);
    expect(mockPrisma.venueReservation.findMany).toHaveBeenCalledTimes(2);
    expect(mockPrisma.surfaceSegment.update).toHaveBeenCalledTimes(1);
  });
});
