import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const { mockRequireUserId, mockRequireVenueProfileManager, mockHasVenueStaffRole, mockPrisma } =
  vi.hoisted(() => ({
    mockRequireUserId: vi.fn(),
    mockRequireVenueProfileManager: vi.fn(),
    mockHasVenueStaffRole: vi.fn(),
    mockPrisma: {
      venue: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      teamMember: {
        findUnique: vi.fn(),
      },
      leagueUser: {
        findUnique: vi.fn(),
      },
    },
  }));

vi.mock("@/lib/auth/session", () => ({
  requireUserId: (...args: unknown[]) => mockRequireUserId(...args),
  requireVenueProfileManager: (...args: unknown[]) => mockRequireVenueProfileManager(...args),
  hasVenueStaffRole: (...args: unknown[]) => mockHasVenueStaffRole(...args),
  VENUE_PROFILE_ROLES: ["OWNER", "MANAGER"],
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mockPrisma,
}));

import { updateVenue } from "@/lib/actions/venues";

const USER_ID = "clusrxxxxxxxxxxxxxxxxxxxxxxx";
const VENUE_ID = "clvenxxxxxxxxxxxxxxxxxxxxxxx";
const ORGANIZATION_ID = "clorgxxxxxxxxxxxxxxxxxxxxxxx";
const OTHER_ORGANIZATION_ID = "clorgyyyyyyyyyyyyyyyyyyyyyyy";

const existingOrgVenue = {
  id: VENUE_ID,
  createdById: USER_ID,
  visibility: "PUBLIC",
  teamId: null,
  leagueId: null,
  organizationId: ORGANIZATION_ID,
};

const baseInput = {
  id: VENUE_ID,
  name: "North Rink",
  surfaceType: "ICE" as const,
  amenities: [],
  visibility: "PUBLIC" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUserId.mockResolvedValue(USER_ID);
  mockRequireVenueProfileManager.mockResolvedValue(USER_ID);
  mockHasVenueStaffRole.mockResolvedValue(false);
  mockPrisma.venue.findUnique.mockResolvedValue(existingOrgVenue);
  mockPrisma.venue.update.mockResolvedValue({ id: VENUE_ID, name: "North Rink" });
});

describe("updateVenue organizationId handling", () => {
  it("leaves organizationId untouched when the input omits the field (regression: silent org detach)", async () => {
    const result = await updateVenue(baseInput);

    expect(result.success).toBe(true);
    expect(mockPrisma.venue.update).toHaveBeenCalledTimes(1);
    const updateCall = mockPrisma.venue.update.mock.calls[0]?.[0];
    expect(updateCall.data).not.toHaveProperty("organizationId");
  });

  it("detaches the venue when organizationId is explicitly cleared", async () => {
    const result = await updateVenue({ ...baseInput, organizationId: "" });

    expect(result.success).toBe(true);
    const updateCall = mockPrisma.venue.update.mock.calls[0]?.[0];
    expect(updateCall.data.organizationId).toBeNull();
  });

  it("writes and authorizes an explicitly provided organizationId change", async () => {
    const result = await updateVenue({ ...baseInput, organizationId: OTHER_ORGANIZATION_ID });

    expect(result.success).toBe(true);
    expect(mockRequireVenueProfileManager).toHaveBeenCalledWith(OTHER_ORGANIZATION_ID);
    const updateCall = mockPrisma.venue.update.mock.calls[0]?.[0];
    expect(updateCall.data.organizationId).toBe(OTHER_ORGANIZATION_ID);
  });

  it("keeps organizationId writes for the venue's current organization without re-authorization", async () => {
    const result = await updateVenue({ ...baseInput, organizationId: ORGANIZATION_ID });

    expect(result.success).toBe(true);
    expect(mockRequireVenueProfileManager).not.toHaveBeenCalled();
    const updateCall = mockPrisma.venue.update.mock.calls[0]?.[0];
    expect(updateCall.data.organizationId).toBe(ORGANIZATION_ID);
  });

  it("rejects edits from users without permission", async () => {
    mockPrisma.venue.findUnique.mockResolvedValue({
      ...existingOrgVenue,
      createdById: "clusrzzzzzzzzzzzzzzzzzzzzzzz",
    });

    const result = await updateVenue(baseInput);

    expect(result.success).toBe(false);
    expect(mockPrisma.venue.update).not.toHaveBeenCalled();
  });
});
