import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { mockRequireUserId, mockRequireTeamAdmin, mockRequireLeagueRole, mockRequireVenueProfileManager, mockPrisma, mockSendEmail } = vi.hoisted(() => ({
  mockRequireUserId: vi.fn(),
  mockRequireTeamAdmin: vi.fn(),
  mockRequireLeagueRole: vi.fn(),
  mockRequireVenueProfileManager: vi.fn(),
  mockPrisma: {
    venue: { findFirst: vi.fn() },
    team: { findUnique: vi.fn() },
    league: { findUnique: vi.fn() },
    venueRelationship: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  },
  mockSendEmail: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireAuth: vi.fn(),
  requireUserId: (...args: unknown[]) => mockRequireUserId(...args),
  requireUserIdFromSession: () => mockRequireUserId(),
  requireTeamAdmin: (...args: unknown[]) => mockRequireTeamAdmin(...args),
  requireLeagueRole: (...args: unknown[]) => mockRequireLeagueRole(...args),
  requireVenueProfileManager: (...args: unknown[]) => mockRequireVenueProfileManager(...args),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/email/templates", () => ({
  sendVenueRelationshipInvitationEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

import {
  getVenueRelationshipAdminData,
  inviteVenueRelationship,
  respondToVenueRelationship,
} from "@/lib/actions/venue-relationships";

const ORGANIZATION_ID = "clorgxxxxxxxxxxxxxxxxxxxxxxx";
const VENUE_ID = "clvenxxxxxxxxxxxxxxxxxxxxxxx";
const TEAM_ID = "clteaxxxxxxxxxxxxxxxxxxxxxxx";
const RELATIONSHIP_ID = "clrelxxxxxxxxxxxxxxxxxxxxxxx";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUserId.mockResolvedValue("clusrxxxxxxxxxxxxxxxxxxxxxxx");
  mockRequireTeamAdmin.mockResolvedValue("clusrxxxxxxxxxxxxxxxxxxxxxxx");
  mockRequireVenueProfileManager.mockResolvedValue("clusrxxxxxxxxxxxxxxxxxxxxxxx");
  mockPrisma.venue.findFirst.mockResolvedValue({ id: VENUE_ID, name: "North Rink", slug: "north-rink" });
  mockPrisma.team.findUnique.mockResolvedValue({ id: TEAM_ID, name: "Sharks" });
  mockPrisma.venueRelationship.create.mockResolvedValue({ id: RELATIONSHIP_ID, status: "PENDING" });
});

describe("venue relationship actions", () => {
  it("invites a team relationship and sends notification email", async () => {
    const result = await inviteVenueRelationship({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      relationshipType: "HOME",
      targetType: "TEAM",
      teamId: TEAM_ID,
      invitedEmail: "coach@example.com",
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.venueRelationship.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ teamId: TEAM_ID, status: "PENDING" }) })
    );
    expect(mockSendEmail).toHaveBeenCalled();
  });

  it("requires an invited email for coach and organization relationship targets", async () => {
    const result = await inviteVenueRelationship({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      relationshipType: "PREFERRED",
      targetType: "COACH",
      targetName: "Coach One",
    });

    expect(result.success).toBe(false);
    expect(mockPrisma.venueRelationship.create).not.toHaveBeenCalled();
  });

  it("accepts a relationship as target team admin", async () => {
    mockPrisma.venueRelationship.findFirst.mockResolvedValue({
      id: RELATIONSHIP_ID,
      venueId: VENUE_ID,
      teamId: TEAM_ID,
      leagueId: null,
      invitedEmail: null,
      status: "PENDING",
      venue: { slug: "north-rink" },
    });
    mockPrisma.venueRelationship.update.mockResolvedValue({ id: RELATIONSHIP_ID, status: "ACTIVE" });

    const result = await respondToVenueRelationship({
      relationshipId: RELATIONSHIP_ID,
      response: "ACCEPT",
    });

    expect(result.success).toBe(true);
    expect(mockRequireTeamAdmin).toHaveBeenCalledWith(TEAM_ID);
  });

  it("loads manager relationship history", async () => {
    mockPrisma.venueRelationship.findMany.mockResolvedValue([{ id: RELATIONSHIP_ID, status: "ACTIVE" }]);

    const result = await getVenueRelationshipAdminData(ORGANIZATION_ID, VENUE_ID);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.relationships).toHaveLength(1);
  });
});
