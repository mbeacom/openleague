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
    venueScheduleBlock: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
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
    expect(mockPrisma.venueScheduleBlock.findMany).toHaveBeenCalled();
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

  it("rejects overlapping published blocks", async () => {
    mockPrisma.venueScheduleBlock.findMany.mockResolvedValue([
      {
        id: "existing",
        startAt: new Date("2026-02-01T19:00:00Z"),
        endAt: new Date("2026-02-01T21:00:00Z"),
        status: "PUBLISHED",
        activityType: "OPEN_SKATE",
      },
    ]);

    const result = await createScheduleBlock({ ...scheduleInput, status: "PUBLISHED" });

    expect(result.success).toBe(false);
    expect(mockPrisma.venueScheduleBlock.create).not.toHaveBeenCalled();
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
      startAt: new Date("2026-02-01T18:00:00Z"),
      endAt: new Date("2026-02-01T20:00:00Z"),
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
