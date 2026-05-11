import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { mockRequireUserId, mockRequireVenueRequestManager, mockPrisma, mockSubmitEmail, mockDecisionEmail } = vi.hoisted(() => ({
  mockRequireUserId: vi.fn(),
  mockRequireVenueRequestManager: vi.fn(),
  mockSubmitEmail: vi.fn(),
  mockDecisionEmail: vi.fn(),
  mockPrisma: {
    venueScheduleBlock: { findFirst: vi.fn() },
    iceTimeRequest: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    venueStaff: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireUserId: (...args: unknown[]) => mockRequireUserId(...args),
  requireVenueRequestManager: (...args: unknown[]) => mockRequireVenueRequestManager(...args),
  requireTeamMember: vi.fn(),
  getUserLeagueRole: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/email/templates", () => ({
  sendIceTimeRequestSubmittedEmail: (...args: unknown[]) => mockSubmitEmail(...args),
  sendIceTimeRequestDecisionEmail: (...args: unknown[]) => mockDecisionEmail(...args),
}));

import {
  cancelIceTimeRequest,
  decideIceTimeRequest,
  expireIceTimeRequest,
  getVenueRequestQueue,
  submitIceTimeRequest,
} from "@/lib/actions/venue-requests";

const USER_ID = "clusrxxxxxxxxxxxxxxxxxxxxxxx";
const ORGANIZATION_ID = "clorgxxxxxxxxxxxxxxxxxxxxxxx";
const VENUE_ID = "clvenxxxxxxxxxxxxxxxxxxxxxxx";
const BLOCK_ID = "clblkxxxxxxxxxxxxxxxxxxxxxxx";
const REQUEST_ID = "clreqxxxxxxxxxxxxxxxxxxxxxxx";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUserId.mockResolvedValue(USER_ID);
  mockRequireVenueRequestManager.mockResolvedValue(USER_ID);
  mockPrisma.venueScheduleBlock.findFirst.mockResolvedValue({
    id: BLOCK_ID,
    startsAt: new Date("2026-03-01T10:00:00Z"),
    endsAt: new Date("2026-03-01T12:00:00Z"),
    status: "PUBLISHED",
    registrationMode: "REQUEST_REQUIRED",
    venue: { id: VENUE_ID, name: "North Rink", organizationId: ORGANIZATION_ID, slug: "north-rink" },
  });
  mockPrisma.iceTimeRequest.findFirst.mockResolvedValue(null);
  mockPrisma.venueStaff.findMany.mockResolvedValue([{ user: { email: "manager@example.com" } }]);
});

describe("ice time request lifecycle", () => {
  it("submits a request for a published schedule block", async () => {
    mockPrisma.iceTimeRequest.create.mockResolvedValue({ id: REQUEST_ID, status: "SUBMITTED" });

    const result = await submitIceTimeRequest({
      scheduleBlockId: BLOCK_ID,
      venueId: VENUE_ID,
      contactName: "Coach One",
      contactEmail: "coach@example.com",
      requestedStartAt: "2026-03-01T10:00:00Z",
      requestedEndAt: "2026-03-01T11:00:00Z",
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.iceTimeRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requesterUserId: USER_ID,
          scheduleBlockId: BLOCK_ID,
          status: "SUBMITTED",
        }),
      })
    );
    expect(mockSubmitEmail).toHaveBeenCalled();
  });

  it("lets venue request managers accept, cancel, and expire requests", async () => {
    const managedRequest = {
      id: REQUEST_ID,
      requesterUserId: "other-user",
      contactEmail: "coach@example.com",
      scheduleBlockId: BLOCK_ID,
      requestedStartAt: new Date("2026-03-01T10:00:00Z"),
      requestedEndAt: new Date("2026-03-01T11:00:00Z"),
      venue: { organizationId: ORGANIZATION_ID, slug: "north-rink", name: "North Rink" },
    };
    mockPrisma.iceTimeRequest.findFirst
      .mockResolvedValueOnce(managedRequest)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(managedRequest);
    mockPrisma.iceTimeRequest.update
      .mockResolvedValueOnce({ id: REQUEST_ID, status: "ACCEPTED", decidedAt: new Date("2026-03-01T00:00:00Z") })
      .mockResolvedValueOnce({ id: REQUEST_ID, status: "CANCELED" })
      .mockResolvedValueOnce({ id: REQUEST_ID, status: "EXPIRED" });

    expect((await decideIceTimeRequest({ organizationId: ORGANIZATION_ID, venueId: VENUE_ID, requestId: REQUEST_ID, status: "ACCEPTED" })).success).toBe(true);
    expect((await cancelIceTimeRequest({ organizationId: ORGANIZATION_ID, venueId: VENUE_ID, requestId: REQUEST_ID })).success).toBe(true);
    expect((await expireIceTimeRequest({ organizationId: ORGANIZATION_ID, venueId: VENUE_ID, requestId: REQUEST_ID })).success).toBe(true);
    expect(mockDecisionEmail).toHaveBeenCalled();
  });

  it("prevents accepting a request that overlaps an accepted request", async () => {
    mockPrisma.iceTimeRequest.findFirst
      .mockResolvedValueOnce({
        id: REQUEST_ID,
        contactEmail: "coach@example.com",
        scheduleBlockId: BLOCK_ID,
        requestedStartAt: new Date("2026-03-01T10:00:00Z"),
        requestedEndAt: new Date("2026-03-01T11:00:00Z"),
        venue: { organizationId: ORGANIZATION_ID, slug: "north-rink", name: "North Rink" },
      })
      .mockResolvedValueOnce({ id: "clreqacceptedxxxxxxxxxxxxxx" });

    const result = await decideIceTimeRequest({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
      status: "ACCEPTED",
    });

    expect(result.success).toBe(false);
    expect(mockPrisma.iceTimeRequest.update).not.toHaveBeenCalled();
  });

  it("returns private request details for the manager queue", async () => {
    mockPrisma.iceTimeRequest.findMany.mockResolvedValue([{ id: REQUEST_ID, contactEmail: "coach@example.com" }]);

    const result = await getVenueRequestQueue(ORGANIZATION_ID, VENUE_ID);

    expect(result.success).toBe(true);
    expect(mockPrisma.iceTimeRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { venueId: VENUE_ID },
      })
    );
  });
});
