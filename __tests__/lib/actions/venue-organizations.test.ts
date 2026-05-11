import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const { mockRequireUserId, mockRequireVenueProfileManager, mockPrisma } = vi.hoisted(() => ({
  mockRequireUserId: vi.fn(),
  mockRequireVenueProfileManager: vi.fn(),
  mockPrisma: {
    $transaction: vi.fn(),
    venueOrganization: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    venue: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    venueStaff: {
      create: vi.fn(),
        findFirst: vi.fn(),
    },
    venueActivityLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireUserId: (...args: unknown[]) => mockRequireUserId(...args),
  requireVenueProfileManager: (...args: unknown[]) => mockRequireVenueProfileManager(...args),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mockPrisma,
}));

import {
  createVenueOrganization,
  publishVenueProfile,
  updateVenueProfile,
} from "@/lib/actions/venue-organizations";

const USER_ID = "clusrxxxxxxxxxxxxxxxxxxxxxxx";
const ORGANIZATION_ID = "clorgxxxxxxxxxxxxxxxxxxxxxxx";
const VENUE_ID = "clvenxxxxxxxxxxxxxxxxxxxxxxx";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUserId.mockResolvedValue(USER_ID);
  mockRequireVenueProfileManager.mockResolvedValue(USER_ID);
  mockPrisma.$transaction.mockImplementation((callback) => callback(mockPrisma));
    mockPrisma.venueStaff.findFirst.mockResolvedValue({ id: "clstfxxxxxxxxxxxxxxxxxxxxxxx" });
});

describe("createVenueOrganization", () => {
  it("creates an organization, draft venue, owner staff row, and activity log", async () => {
    mockPrisma.venueOrganization.create.mockResolvedValue({ id: ORGANIZATION_ID });
    mockPrisma.venue.create.mockResolvedValue({ id: VENUE_ID, profileStatus: "DRAFT" });
    mockPrisma.venueStaff.create.mockResolvedValue({ id: "clstfxxxxxxxxxxxxxxxxxxxxxxx" });
    mockPrisma.venueActivityLog.create.mockResolvedValue({ id: "cllogxxxxxxxxxxxxxxxxxxxxxxx" });

    const result = await createVenueOrganization({
      name: "North Rink",
      type: "RINK",
      primaryContactEmail: "manager@example.com",
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.venueOrganization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "North Rink",
          status: "ACTIVE",
          createdById: USER_ID,
        }),
      })
    );
    expect(mockPrisma.venue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: ORGANIZATION_ID,
          profileStatus: "DRAFT",
          visibility: "PUBLIC",
        }),
      })
    );
    expect(mockPrisma.venueStaff.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: ORGANIZATION_ID,
          userId: USER_ID,
          role: "OWNER",
          status: "ACTIVE",
        }),
      })
    );
  });
});

describe("updateVenueProfile", () => {
  it("updates public and private profile fields after venue authorization", async () => {
    mockPrisma.venue.findFirst.mockResolvedValueOnce({ id: VENUE_ID, slug: "old-rink" });
    mockPrisma.venue.update.mockResolvedValue({
      id: VENUE_ID,
      profileStatus: "DRAFT",
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      slug: "north-rink",
    });
    mockPrisma.venueActivityLog.create.mockResolvedValue({ id: "cllogxxxxxxxxxxxxxxxxxxxxxxx" });

    const result = await updateVenueProfile({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      name: "North Rink",
      slug: "north-rink",
      surfaceType: "ICE",
      publicDescription: "Community rink",
      privateManagerNotes: "Manager-only note",
    });

    expect(result.success).toBe(true);
    expect(mockRequireVenueProfileManager).toHaveBeenCalledWith(ORGANIZATION_ID, VENUE_ID);
    expect(mockPrisma.venue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: VENUE_ID },
        data: expect.objectContaining({
          slug: "north-rink",
          publicDescription: "Community rink",
          privateManagerNotes: "Manager-only note",
        }),
      })
    );
      const updateCall = mockPrisma.venue.update.mock.calls[0]?.[0];
      expect(updateCall.data).not.toHaveProperty("amenities");
      expect(updateCall.data).not.toHaveProperty("address");
      expect(updateCall.data).not.toHaveProperty("phone");
  });

  it("returns an error when venueId is missing", async () => {
    const result = await updateVenueProfile({
      organizationId: ORGANIZATION_ID,
      name: "North Rink",
      surfaceType: "ICE",
    });

    expect(result.success).toBe(false);
    expect(mockRequireVenueProfileManager).not.toHaveBeenCalled();
  });
});

describe("publishVenueProfile", () => {
  it("publishes a complete profile and logs activity", async () => {
    mockPrisma.venue.findFirst
      .mockResolvedValueOnce({
        id: VENUE_ID,
        name: "North Rink",
        slug: "north-rink",
          address: "100 Ice Way",
        city: "Cleveland",
        state: "OH",
        publicDescription: "Community rink",
          timezone: "America/New_York",
          publicEmail: "info@example.com",
          publicPhone: null,
          website: null,
          staff: [{ id: "clstfxxxxxxxxxxxxxxxxxxxxxxx" }],
      })
      .mockResolvedValueOnce(null);
    mockPrisma.venue.update.mockResolvedValue({
      id: VENUE_ID,
      profileStatus: "PUBLISHED",
      publishedAt: new Date("2026-01-01T00:00:00Z"),
    });
    mockPrisma.venueActivityLog.create.mockResolvedValue({ id: "cllogxxxxxxxxxxxxxxxxxxxxxxx" });

    const result = await publishVenueProfile({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.venue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ profileStatus: "PUBLISHED" }),
      })
    );
    expect(mockPrisma.venueActivityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "VENUE_PROFILE_PUBLISHED",
          actorId: USER_ID,
        }),
      })
    );
  });

  it("rejects incomplete profiles before publishing", async () => {
    mockPrisma.venue.findFirst.mockResolvedValueOnce({
      id: VENUE_ID,
      name: "North Rink",
      slug: "",
        address: null,
      city: null,
      state: "OH",
      publicDescription: null,
        timezone: "America/New_York",
        publicEmail: null,
        publicPhone: null,
        website: null,
        staff: [],
    });

    const result = await publishVenueProfile({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
    });

    expect(result.success).toBe(false);
    expect(mockPrisma.venue.update).not.toHaveBeenCalled();
  });
});
