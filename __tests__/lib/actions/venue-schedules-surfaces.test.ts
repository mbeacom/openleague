import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const { mockRequireVenueScheduleManager, mockPrisma, mockLogVenueActivity } = vi.hoisted(() => ({
  mockRequireVenueScheduleManager: vi.fn(),
  mockLogVenueActivity: vi.fn(),
  mockPrisma: {
    venue: {
      findFirst: vi.fn(),
    },
    iceSurface: {
      create: vi.fn(),
      update: vi.fn(),
        findFirst: vi.fn(),
    },
    venueOperatingHour: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
    },
    // Surface-capable booking sources checked by the FR-007 archive guard.
    seasonGame: {
      findMany: vi.fn(),
    },
    eventGame: {
      findMany: vi.fn(),
    },
    venueScheduleBlock: {
      findMany: vi.fn(),
    },
    practiceSession: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireVenueScheduleManager: (...args: unknown[]) => mockRequireVenueScheduleManager(...args),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mockPrisma,
}));

// logVenueActivity moved to lib/services/venue-activity (out of the "use server"
// file); mock it at its new module home. The venue-organizations mock is kept
// for its other exports / module isolation.
vi.mock("@/lib/services/venue-activity", () => ({
  logVenueActivity: (...args: unknown[]) => mockLogVenueActivity(...args),
}));

vi.mock("@/lib/actions/venue-organizations", () => ({
  logVenueActivity: (...args: unknown[]) => mockLogVenueActivity(...args),
}));

import {
  archiveIceSurface,
  createIceSurface,
  setOperatingHours,
  updateIceSurface,
} from "@/lib/actions/venue-schedules";

const USER_ID = "clusrxxxxxxxxxxxxxxxxxxxxxxx";
const ORGANIZATION_ID = "clorgxxxxxxxxxxxxxxxxxxxxxxx";
const VENUE_ID = "clvenxxxxxxxxxxxxxxxxxxxxxxx";
const SURFACE_ID = "clsurxxxxxxxxxxxxxxxxxxxxxxx";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireVenueScheduleManager.mockResolvedValue(USER_ID);
  mockPrisma.venue.findFirst.mockResolvedValue({ id: VENUE_ID, organizationId: ORGANIZATION_ID });
    mockPrisma.iceSurface.findFirst.mockResolvedValue({ id: SURFACE_ID });
  mockPrisma.seasonGame.findMany.mockResolvedValue([]);
  mockPrisma.eventGame.findMany.mockResolvedValue([]);
  mockPrisma.venueScheduleBlock.findMany.mockResolvedValue([]);
  mockPrisma.practiceSession.findMany.mockResolvedValue([]);
  mockLogVenueActivity.mockResolvedValue({ id: "cllogxxxxxxxxxxxxxxxxxxxxxxx" });
});

describe("ice surface actions", () => {
  it("creates an ice surface for authorized venue schedulers", async () => {
    mockPrisma.iceSurface.create.mockResolvedValue({
      id: SURFACE_ID,
      venueId: VENUE_ID,
      name: "Main Rink",
    });

    const result = await createIceSurface({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      name: "Main Rink",
      surfaceType: "ICE",
      isDefault: true,
    });

    expect(result.success).toBe(true);
    expect(mockRequireVenueScheduleManager).toHaveBeenCalledWith(ORGANIZATION_ID, VENUE_ID);
    expect(mockPrisma.iceSurface.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          venueId: VENUE_ID,
          name: "Main Rink",
          surfaceType: "ICE",
          isDefault: true,
        }),
      })
    );
  });

  it("updates and archives ice surfaces without hard deletion", async () => {
    mockPrisma.iceSurface.update
      .mockResolvedValueOnce({ id: SURFACE_ID, venueId: VENUE_ID, name: "Studio" })
      .mockResolvedValueOnce({ id: SURFACE_ID, venueId: VENUE_ID, isActive: false });

    const updateResult = await updateIceSurface({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      surfaceId: SURFACE_ID,
      name: "Studio",
      surfaceType: "STUDIO",
    });
    const archiveResult = await archiveIceSurface({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      surfaceId: SURFACE_ID,
    });

    expect(updateResult.success).toBe(true);
    expect(archiveResult.success).toBe(true);
    expect(mockPrisma.iceSurface.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: SURFACE_ID, venueId: VENUE_ID },
        data: { isActive: false },
      })
    );
  });

  it("refuses to archive a surface with future bookings (FR-007)", async () => {
    mockPrisma.seasonGame.findMany.mockResolvedValue([
      {
        id: "clgamxxxxxxxxxxxxxxxxxxxxxxx",
        startAt: new Date("2027-01-10T18:00:00Z"),
        endAt: new Date("2027-01-10T19:30:00Z"),
        surfaceId: SURFACE_ID,
        segmentId: null,
        segment: null,
        homeTeam: { name: "Sharks" },
        awayTeam: { name: "Jets" },
      },
    ]);

    const result = await archiveIceSurface({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      surfaceId: SURFACE_ID,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.details).toEqual(
        expect.objectContaining({
          futureBookings: expect.arrayContaining([
            expect.objectContaining({
              source: "seasonGame",
              title: "Sharks vs Jets",
            }),
          ]),
        })
      );
    }
    expect(mockPrisma.iceSurface.update).not.toHaveBeenCalled();
  });
});

describe("operating hour actions", () => {
  it("creates operating hours when no overlapping rule exists", async () => {
    mockPrisma.venueOperatingHour.findFirst.mockResolvedValue(null);
    mockPrisma.venueOperatingHour.create.mockResolvedValue({ id: "clhrxxxxxxxxxxxxxxxxxxxxxxxx", venueId: VENUE_ID });

    const result = await setOperatingHours({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      surfaceId: SURFACE_ID,
      dayOfWeek: 1,
      opensAt: "08:00",
      closesAt: "22:00",
      effectiveStartDate: "2026-01-01T00:00:00Z",
      status: "OPEN",
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.venueOperatingHour.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          venueId: VENUE_ID,
          surfaceId: SURFACE_ID,
          dayOfWeek: 1,
        }),
      })
    );
  });

  it("rejects overlapping operating hour rules for the same day and surface", async () => {
    mockPrisma.venueOperatingHour.findFirst.mockResolvedValue({ id: "existing-rule" });

    const result = await setOperatingHours({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      surfaceId: SURFACE_ID,
      dayOfWeek: 1,
      opensAt: "08:00",
      closesAt: "22:00",
      effectiveStartDate: "2026-01-01T00:00:00Z",
      status: "OPEN",
    });

    expect(result.success).toBe(false);
    expect(mockPrisma.venueOperatingHour.create).not.toHaveBeenCalled();
  });
});
