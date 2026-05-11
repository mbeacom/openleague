import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { mockRequireUserId, mockRequireTeamAdmin, mockRequireVenueProfileManager, mockPrisma } = vi.hoisted(() => ({
  mockRequireUserId: vi.fn(),
  mockRequireTeamAdmin: vi.fn(),
  mockRequireVenueProfileManager: vi.fn(),
  mockPrisma: {
    venue: { findFirst: vi.fn() },
    team: { findUnique: vi.fn() },
    venueRelationship: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireUserId: (...args: unknown[]) => mockRequireUserId(...args),
  requireTeamAdmin: (...args: unknown[]) => mockRequireTeamAdmin(...args),
  requireLeagueRole: vi.fn(),
  requireVenueProfileManager: (...args: unknown[]) => mockRequireVenueProfileManager(...args),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/email/templates", () => ({ sendVenueRelationshipInvitationEmail: vi.fn() }));

import { removeVenueRelationship, respondToVenueRelationship } from "@/lib/actions/venue-relationships";

const RELATIONSHIP_ID = "clrelxxxxxxxxxxxxxxxxxxxxxxx";
const TEAM_ID = "clteaxxxxxxxxxxxxxxxxxxxxxxx";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUserId.mockResolvedValue("clusrxxxxxxxxxxxxxxxxxxxxxxx");
  mockRequireVenueProfileManager.mockResolvedValue("clusrxxxxxxxxxxxxxxxxxxxxxxx");
  mockPrisma.venue.findFirst.mockResolvedValue({ id: "clvenxxxxxxxxxxxxxxxxxxxxxxx", name: "North Rink", slug: "north-rink" });
  mockPrisma.venueRelationship.findFirst.mockResolvedValue({
    id: RELATIONSHIP_ID,
    venueId: "clvenxxxxxxxxxxxxxxxxxxxxxxx",
    teamId: TEAM_ID,
    leagueId: null,
    status: "PENDING",
    venue: { organizationId: "clorgxxxxxxxxxxxxxxxxxxxxxxx", slug: "north-rink" },
  });
});

describe("venue relationship authorization", () => {
  it("rejects response when target authority fails", async () => {
    mockRequireTeamAdmin.mockRejectedValue(new Error("Unauthorized"));

    const result = await respondToVenueRelationship({ relationshipId: RELATIONSHIP_ID, response: "ACCEPT" });

    expect(result.success).toBe(false);
  });

  it("allows venue manager to remove a relationship", async () => {
    mockPrisma.venueRelationship.update.mockResolvedValue({ id: RELATIONSHIP_ID, status: "REMOVED" });

    const result = await removeVenueRelationship({ organizationId: "clorgxxxxxxxxxxxxxxxxxxxxxxx", venueId: "clvenxxxxxxxxxxxxxxxxxxxxxxx", relationshipId: RELATIONSHIP_ID });

    expect(result.success).toBe(true);
    expect(mockRequireVenueProfileManager).toHaveBeenCalled();
  });
});
