import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { mockRequireAuth, mockRequireUserId, mockRequireTeamAdmin, mockRequireVenueProfileManager, mockPrisma } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
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
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  requireUserId: (...args: unknown[]) => mockRequireUserId(...args),
  requireUserIdFromSession: () => mockRequireUserId(),
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
  mockRequireAuth.mockResolvedValue({ user: { id: "clusrxxxxxxxxxxxxxxxxxxxxxxx", email: "invitee@example.com" } });
  mockRequireUserId.mockResolvedValue("clusrxxxxxxxxxxxxxxxxxxxxxxx");
  mockRequireVenueProfileManager.mockResolvedValue("clusrxxxxxxxxxxxxxxxxxxxxxxx");
  mockPrisma.venue.findFirst.mockResolvedValue({ id: "clvenxxxxxxxxxxxxxxxxxxxxxxx", name: "North Rink", slug: "north-rink" });
  mockPrisma.venueRelationship.findFirst.mockResolvedValue({
    id: RELATIONSHIP_ID,
    venueId: "clvenxxxxxxxxxxxxxxxxxxxxxxx",
    teamId: TEAM_ID,
    leagueId: null,
    status: "PENDING",
    invitedEmail: null,
    expiresAt: null,
    venue: { name: "North Rink", organizationId: "clorgxxxxxxxxxxxxxxxxxxxxxxx", slug: "north-rink" },
  });
});

describe("venue relationship authorization", () => {
  it("rejects response when target authority fails", async () => {
    mockRequireTeamAdmin.mockRejectedValue(new Error("Unauthorized"));

    const result = await respondToVenueRelationship({ relationshipId: RELATIONSHIP_ID, response: "ACCEPT" });

    expect(result.success).toBe(false);
  });

  it("rejects invited-email responses from a different authenticated email", async () => {
    mockRequireAuth.mockResolvedValue({ user: { id: "clusrxxxxxxxxxxxxxxxxxxxxxxx", email: "other@example.com" } });
    mockPrisma.venueRelationship.findFirst.mockResolvedValue({
      id: RELATIONSHIP_ID,
      venueId: "clvenxxxxxxxxxxxxxxxxxxxxxxx",
      teamId: null,
      leagueId: null,
      targetType: "COACH",
      targetName: "Coach One",
      invitedEmail: "invitee@example.com",
      relationshipType: "PREFERRED",
      expiresAt: null,
      venue: { name: "North Rink", organizationId: "clorgxxxxxxxxxxxxxxxxxxxxxxx", slug: "north-rink" },
    });

    const result = await respondToVenueRelationship({ relationshipId: RELATIONSHIP_ID, response: "ACCEPT" });

    expect(result.success).toBe(false);
    expect(mockPrisma.venueRelationship.update).not.toHaveBeenCalled();
  });

  it("uses the resolved user id when an invited-email response has a stale session", async () => {
    mockRequireAuth.mockResolvedValue({ user: { email: "invitee@example.com" } });
    mockRequireUserId.mockResolvedValue("clresolvedxxxxxxxxxxxxxxxxxx");
    mockPrisma.venueRelationship.findFirst.mockResolvedValue({
      id: RELATIONSHIP_ID,
      venueId: "clvenxxxxxxxxxxxxxxxxxxxxxxx",
      teamId: null,
      leagueId: null,
      targetType: "COACH",
      targetName: "Coach One",
      invitedEmail: "invitee@example.com",
      relationshipType: "PREFERRED",
      expiresAt: null,
      venue: { name: "North Rink", organizationId: "clorgxxxxxxxxxxxxxxxxxxxxxxx", slug: "north-rink" },
    });
    mockPrisma.venueRelationship.update.mockResolvedValue({ id: RELATIONSHIP_ID, status: "ACTIVE" });

    const result = await respondToVenueRelationship({ relationshipId: RELATIONSHIP_ID, response: "ACCEPT" });

    expect(result.success).toBe(true);
    expect(mockPrisma.venueRelationship.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ acceptedById: "clresolvedxxxxxxxxxxxxxxxxxx" }),
      })
    );
  });

  it("rejects responses without a concrete target authority", async () => {
    mockPrisma.venueRelationship.findFirst.mockResolvedValue({
      id: RELATIONSHIP_ID,
      venueId: "clvenxxxxxxxxxxxxxxxxxxxxxxx",
      teamId: null,
      leagueId: null,
      targetType: "ORGANIZATION",
      targetName: "Community Club",
      invitedEmail: null,
      relationshipType: "PREFERRED",
      expiresAt: null,
      venue: { name: "North Rink", organizationId: "clorgxxxxxxxxxxxxxxxxxxxxxxx", slug: "north-rink" },
    });

    const result = await respondToVenueRelationship({ relationshipId: RELATIONSHIP_ID, response: "ACCEPT" });

    expect(result.success).toBe(false);
    expect(mockPrisma.venueRelationship.update).not.toHaveBeenCalled();
  });

  it("allows venue manager to remove a relationship", async () => {
    mockPrisma.venueRelationship.update.mockResolvedValue({ id: RELATIONSHIP_ID, status: "REMOVED" });

    const result = await removeVenueRelationship({ organizationId: "clorgxxxxxxxxxxxxxxxxxxxxxxx", venueId: "clvenxxxxxxxxxxxxxxxxxxxxxxx", relationshipId: RELATIONSHIP_ID });

    expect(result.success).toBe(true);
    expect(mockRequireVenueProfileManager).toHaveBeenCalled();
  });

  it("allows the authorized target team admin to remove a relationship", async () => {
    mockRequireVenueProfileManager.mockRejectedValue(new Error("Unauthorized"));
    mockRequireTeamAdmin.mockResolvedValue("cltargetxxxxxxxxxxxxxxxxxxxx");
    mockPrisma.venueRelationship.update.mockResolvedValue({ id: RELATIONSHIP_ID, status: "REMOVED" });

    const result = await removeVenueRelationship({ organizationId: "clorgxxxxxxxxxxxxxxxxxxxxxxx", venueId: "clvenxxxxxxxxxxxxxxxxxxxxxxx", relationshipId: RELATIONSHIP_ID });

    expect(result.success).toBe(true);
    expect(mockRequireTeamAdmin).toHaveBeenCalledWith(TEAM_ID);
    expect(mockPrisma.venueRelationship.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: RELATIONSHIP_ID },
        data: { status: "REMOVED", removedById: "cltargetxxxxxxxxxxxxxxxxxxxx" },
      })
    );
  });
});
