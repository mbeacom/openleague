import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  mockRequireUserId,
  mockRequireVenueRequestManager,
  mockPrisma,
  mockSubmitEmail,
  mockDecisionEmail,
  mockCreateVenueReservation,
  mockTransitionVenueReservation,
  mockFindLegacyAcceptedRequestConflicts,
} = vi.hoisted(() => ({
  mockRequireUserId: vi.fn(),
  mockRequireVenueRequestManager: vi.fn(),
  mockSubmitEmail: vi.fn(),
  mockDecisionEmail: vi.fn(),
  // T023/T024 (unbuilt): `decideIceTimeRequest`/cancel/expire are expected to
  // start calling the already-implemented reservation service atomically
  // alongside the `IceTimeRequest` row update. Mocked here as black boxes
  // (matching the venue-reservations.ts service boundary, not
  // lib/auth/session.ts helpers, since that's where the real authorization
  // and conflict logic for reservations lives).
  mockCreateVenueReservation: vi.fn(),
  mockTransitionVenueReservation: vi.fn(),
  mockFindLegacyAcceptedRequestConflicts: vi.fn(),
  mockPrisma: {
    $transaction: vi.fn(),
    venue: { findFirst: vi.fn() },
    venueScheduleBlock: { findFirst: vi.fn() },
    iceTimeRequest: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    venueStaff: { findMany: vi.fn(), findFirst: vi.fn() },
    venueReservation: { findUnique: vi.fn(), create: vi.fn() },
    venueReservationOverride: { create: vi.fn() },
    notificationOutbox: { create: vi.fn(), createMany: vi.fn(), upsert: vi.fn() },
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
vi.mock("@/lib/services/venue-reservations", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/venue-reservations")>(
    "@/lib/services/venue-reservations",
  );
  return {
    ...actual,
    createVenueReservation: mockCreateVenueReservation,
    transitionVenueReservation: mockTransitionVenueReservation,
  };
});
vi.mock("@/lib/services/venue-reservation-availability", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/services/venue-reservation-availability")
  >("@/lib/services/venue-reservation-availability");
  return {
    ...actual,
    findLegacyAcceptedRequestConflicts:
      mockFindLegacyAcceptedRequestConflicts,
  };
});

import {
  cancelIceTimeRequest,
  decideIceTimeRequest,
  expireIceTimeRequest,
  getVenueRequestQueue,
  submitIceTimeRequest,
} from "@/lib/actions/venue-requests";
import { VenueReservationConflictError } from "@/lib/services/venue-reservations";
import {
  assertAssociationOperationsNotificationEvent,
  parseAssociationOperationsNotificationEvent,
} from "@/lib/services/association-operations-notification-registry";

const USER_ID = "clusrxxxxxxxxxxxxxxxxxxxxxxx";
const ORGANIZATION_ID = "clorgxxxxxxxxxxxxxxxxxxxxxxx";
const VENUE_ID = "clvenxxxxxxxxxxxxxxxxxxxxxxx";
const BLOCK_ID = "clblkxxxxxxxxxxxxxxxxxxxxxxx";
const REQUEST_ID = "clreqxxxxxxxxxxxxxxxxxxxxxxx";
// Valid, strict 25-char CUIDs (`^c[a-z0-9]{24}$`) for the notification
// registry's `validateCuid`, distinct from the looser 28-char fixtures
// above that only satisfy Zod's `.cuid()` check used elsewhere.
const STRICT_REQUEST_ID = "creq000000000000000000000";
const STRICT_RESERVATION_ID = "cres000000000000000000000";
const RESERVATION_ID = "clresxxxxxxxxxxxxxxxxxxxxxx";
const SURFACE_ID = "csurf000000000000000000000";
const SURFACE_B_ID = "csurf111111111111111111111";
const SEGMENT_ID = "csegm000000000000000000000";
const SEGMENT_B_ID = "csegm111111111111111111111";

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) so a leftover queued
  // `mockResolvedValueOnce` from a test that threw before consuming it
  // (e.g. Zod validation rejecting an unimplemented field/status) never
  // bleeds into the next test's first call.
  vi.resetAllMocks();
  mockPrisma.$transaction.mockImplementation((callback) => callback(mockPrisma));
  mockRequireUserId.mockResolvedValue(USER_ID);
  mockRequireVenueRequestManager.mockResolvedValue(USER_ID);
  mockPrisma.venueScheduleBlock.findFirst.mockResolvedValue({
    id: BLOCK_ID,
    startsAt: new Date("2026-03-01T10:00:00Z"),
    endsAt: new Date("2026-03-01T12:00:00Z"),
    status: "PUBLISHED",
    registrationMode: "REQUEST_REQUIRED",
    recurrenceRule: null,
    recurrenceEndDate: null,
    venue: {
      id: VENUE_ID,
      name: "North Rink",
      organizationId: ORGANIZATION_ID,
      slug: "north-rink",
      timezone: "America/New_York",
    },
  });
  mockPrisma.iceTimeRequest.findFirst.mockResolvedValue(null);
  mockPrisma.venue.findFirst.mockResolvedValue({
    id: VENUE_ID,
    name: "North Rink",
    timezone: "America/New_York",
    surfaces: [
      {
        id: SURFACE_ID,
        name: "Rink A",
        surfaceType: "ICE_RINK",
        wholeLabel: "Full Rink A",
        segments: [{ id: SEGMENT_ID, name: "Offensive Zone" }],
      },
    ],
  });
  mockPrisma.venueStaff.findMany.mockResolvedValue([{ user: { email: "manager@example.com" } }]);
  mockPrisma.venueStaff.findFirst.mockResolvedValue({ id: "cstaff0000000000000000000" });
  mockPrisma.notificationOutbox.upsert.mockResolvedValue({
    id: "coutbox000000000000000000",
  });
  mockFindLegacyAcceptedRequestConflicts.mockResolvedValue([]);
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

  it("submits a request for a concrete recurring offering occurrence", async () => {
    mockPrisma.venueScheduleBlock.findFirst.mockResolvedValueOnce({
      id: BLOCK_ID,
      startsAt: new Date("2026-03-01T15:00:00Z"),
      endsAt: new Date("2026-03-01T16:00:00Z"),
      title: "Weekly ice",
      status: "PUBLISHED",
      registrationMode: "REQUEST_REQUIRED",
      recurrenceRule: "FREQ=WEEKLY;COUNT=3",
      recurrenceEndDate: new Date("2026-03-15T14:00:00Z"),
      venue: {
        id: VENUE_ID,
        name: "North Rink",
        organizationId: ORGANIZATION_ID,
        slug: "north-rink",
        timezone: "America/New_York",
      },
    });
    mockPrisma.iceTimeRequest.create.mockResolvedValue({
      id: REQUEST_ID,
      status: "SUBMITTED",
    });

    const result = await submitIceTimeRequest({
      scheduleBlockId: BLOCK_ID,
      venueId: VENUE_ID,
      contactName: "Coach One",
      contactEmail: "coach@example.com",
      requestedStartAt: "2026-03-08T14:00:00Z",
      requestedEndAt: "2026-03-08T15:00:00Z",
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.iceTimeRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requestedStartAt: new Date("2026-03-08T14:00:00Z"),
          requestedEndAt: new Date("2026-03-08T15:00:00Z"),
        }),
      }),
    );
  });

  it("lets venue request managers accept, cancel, and expire requests", async () => {
    const managedRequest = managedRequestFixture();
    mockPrisma.iceTimeRequest.findFirst
      .mockResolvedValueOnce(managedRequest)
      .mockResolvedValue(managedRequest);
    mockPrisma.iceTimeRequest.update
      .mockResolvedValueOnce({ id: REQUEST_ID, status: "ACCEPTED", decidedAt: new Date("2026-03-01T00:00:00Z") })
      .mockResolvedValueOnce({ id: REQUEST_ID, status: "CANCELED" })
      .mockResolvedValueOnce({ id: REQUEST_ID, status: "EXPIRED" });

    expect((await decideIceTimeRequest({ organizationId: ORGANIZATION_ID, venueId: VENUE_ID, requestId: REQUEST_ID, status: "ACCEPTED" })).success).toBe(true);
    expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({
      isolationLevel: "Serializable",
    }));
    expect((await cancelIceTimeRequest({ organizationId: ORGANIZATION_ID, venueId: VENUE_ID, requestId: REQUEST_ID })).success).toBe(true);
    expect((await expireIceTimeRequest({ organizationId: ORGANIZATION_ID, venueId: VENUE_ID, requestId: REQUEST_ID })).success).toBe(true);
    expect(mockPrisma.notificationOutbox.upsert).toHaveBeenCalled();
  });

  it("prevents accepting a request that overlaps an accepted request", async () => {
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValueOnce(
      managedRequestFixture({ id: REQUEST_ID }),
    );
    mockFindLegacyAcceptedRequestConflicts.mockResolvedValueOnce([
      { id: "clreqacceptedxxxxxxxxxxxxxx" },
    ]);

    const result = await decideIceTimeRequest({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
      status: "ACCEPTED",
    });

    expect(result.success).toBe(false);
    expect(mockFindLegacyAcceptedRequestConflicts).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        venueId: VENUE_ID,
        excludeRequestId: REQUEST_ID,
      }),
    );
    expect(mockPrisma.iceTimeRequest.update).not.toHaveBeenCalled();
  });

  it("does not bluntly reject a new request because an accepted request exists", async () => {
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValueOnce({
      id: "legacy-accepted",
    });
    mockPrisma.iceTimeRequest.create.mockResolvedValue({
      id: REQUEST_ID,
      status: "SUBMITTED",
    });

    const result = await submitIceTimeRequest({
      scheduleBlockId: BLOCK_ID,
      venueId: VENUE_ID,
      contactName: "Coach One",
      contactEmail: "coach@example.com",
      requestedStartAt: "2026-03-01T10:00:00Z",
      requestedEndAt: "2026-03-01T11:00:00Z",
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.iceTimeRequest.create).toHaveBeenCalledOnce();
  });

  it("returns private request details for the manager queue", async () => {
    mockPrisma.iceTimeRequest.findMany.mockResolvedValue([{
      id: REQUEST_ID,
      contactName: "Coach One",
      contactEmail: "coach@example.com",
      status: "SUBMITTED",
      venue: { timezone: "America/New_York" },
      requestedStartAt: new Date("2026-03-01T10:00:00Z"),
      requestedEndAt: new Date("2026-03-01T11:00:00Z"),
      approvedStartAt: null,
      approvedEndAt: null,
      approvedSurfaceId: null,
      approvedSegmentId: null,
      approvedSurface: null,
      approvedSegment: null,
      scheduleBlock: {
        surfaceId: SURFACE_ID,
        segmentId: SEGMENT_ID,
        surface: { name: "Rink A" },
        segment: { name: "Offensive Zone" },
      },
      venueReservation: null,
    }]);

    const result = await getVenueRequestQueue(ORGANIZATION_ID, VENUE_ID);

    expect(result.success).toBe(true);
    expect(mockPrisma.iceTimeRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { venueId: VENUE_ID, venue: { organizationId: ORGANIZATION_ID } },
      })
    );
    if (result.success) {
      expect(result.data.timezone).toBe("America/New_York");
      expect(result.data.surfaceOptions[0]).toMatchObject({
        id: SURFACE_ID,
        name: "Rink A",
        wholeLabel: "Full Rink A",
      });
      expect(result.data.requests[0]).toMatchObject({
        requestedSurfaceId: SURFACE_ID,
        requestedSegmentId: SEGMENT_ID,
      });
    }
  });
});

/**
 * T017 tests below express the intended T023/T024 contract from
 * `specs/007-association-operations/contracts/venue-reservation-actions.md`
 * ("Decide Ice Request" / "Reservation Lifecycle") on top of the current
 * `decideIceTimeRequest`/`cancelIceTimeRequest`/`expireIceTimeRequest`, which
 * today only ever mutate the `IceTimeRequest` row and never touch a
 * `VenueReservation` at all. Failures here are the intended red state for
 * unimplemented T023/T024 work, not defects in the assertions themselves.
 */
function managedRequestFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: STRICT_REQUEST_ID,
    requesterUserId: "other-user",
    requesterLeagueId: "cleague000000000000000000",
    requesterTeamId: null,
    requesterTeam: null,
    status: "SUBMITTED",
    decidedAt: null,
    contactEmail: "coach@example.com",
    scheduleBlockId: BLOCK_ID,
    requestedStartAt: new Date("2026-03-01T10:00:00Z"),
    requestedEndAt: new Date("2026-03-01T11:00:00Z"),
    approvedStartAt: null,
    approvedEndAt: null,
    approvedSurfaceId: null,
    approvedSegmentId: null,
    scheduleBlock: {
      id: BLOCK_ID,
      surfaceId: SURFACE_ID,
      segmentId: SEGMENT_ID,
      intent: "OFFERING",
    },
    venue: {
      id: VENUE_ID,
      organizationId: ORGANIZATION_ID,
      slug: "north-rink",
      name: "North Rink",
      timezone: "America/New_York",
      leagueId: "cleague000000000000000000",
      team: null,
    },
    venueReservation: null as { id: string; status: string } | null,
    ...overrides,
  };
}

describe("decideIceTimeRequest full/partial/decline approval (T017 -> T023 intended contract)", () => {
  beforeEach(() => {
    mockCreateVenueReservation.mockResolvedValue({
      id: RESERVATION_ID,
      status: "CONFIRMED",
      startsAt: new Date("2026-03-01T10:00:00Z"),
      endsAt: new Date("2026-03-01T11:00:00Z"),
    });
  });

  it("fully approves a request, creates exactly one confirmed reservation, and returns queued notification identifiers", async () => {
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValueOnce(managedRequestFixture());
    mockPrisma.iceTimeRequest.update.mockResolvedValueOnce({
      id: REQUEST_ID,
      status: "ACCEPTED",
      decidedAt: new Date("2026-03-01T00:00:00Z"),
    });

    const result = await decideIceTimeRequest({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
      status: "ACCEPTED",
      approvedStartAt: new Date("2026-03-01T10:00:00Z"),
      approvedEndAt: new Date("2026-03-01T11:00:00Z"),
    });

    expect(result.success).toBe(true);
    expect(mockCreateVenueReservation).toHaveBeenCalledTimes(1);
    expect(mockCreateVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        venueId: VENUE_ID,
        status: "CONFIRMED",
        sourceRequestId: STRICT_REQUEST_ID,
        surfaceId: SURFACE_ID,
        segmentId: SEGMENT_ID,
      }),
    );
    if (result.success) {
      const data = result.data as unknown as { notificationIds?: string[]; reservationId?: string };
      expect(Array.isArray(data.notificationIds)).toBe(true);
      expect((data.notificationIds ?? []).length).toBeGreaterThan(0);
      expect(data.reservationId).toBe(RESERVATION_ID);
    }
  });

  it("allows only a venue manager to record a reasoned override of a conflicting legacy accepted request", async () => {
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValueOnce(managedRequestFixture());
    mockPrisma.iceTimeRequest.update.mockResolvedValueOnce({
      id: REQUEST_ID,
      status: "ACCEPTED",
      decidedAt: new Date("2026-03-01T00:00:00Z"),
    });
    mockFindLegacyAcceptedRequestConflicts.mockResolvedValueOnce([
      { id: "clegacy000000000000000000" },
    ]);

    const result = await decideIceTimeRequest({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
      status: "ACCEPTED",
      approvedStartAt: new Date("2026-03-01T10:00:00Z"),
      approvedEndAt: new Date("2026-03-01T11:00:00Z"),
      overrideConflicts: true,
      overrideReason: "Venue manager approved the documented legacy overlap.",
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.venueStaff.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: { in: ["OWNER", "MANAGER"] },
        }),
      }),
    );
    expect(mockPrisma.venueReservationOverride.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reservationId: RESERVATION_ID,
        reason: "Venue manager approved the documented legacy overlap.",
        conflictingReservationIds: [],
        candidateSnapshot: expect.objectContaining({
          source: "LEGACY_ACCEPTED_REQUESTS",
          legacyAcceptedRequestIds: ["clegacy000000000000000000"],
        }),
      }),
    });
  });

  it("rejects a legacy accepted-request override from request-only staff", async () => {
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValueOnce(managedRequestFixture());
    mockFindLegacyAcceptedRequestConflicts.mockResolvedValueOnce([
      { id: "clegacy000000000000000000" },
    ]);
    mockPrisma.venueStaff.findFirst
      .mockResolvedValueOnce({ id: "cstaff0000000000000000000" })
      .mockResolvedValueOnce(null);

    const result = await decideIceTimeRequest({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
      status: "ACCEPTED",
      approvedStartAt: new Date("2026-03-01T10:00:00Z"),
      approvedEndAt: new Date("2026-03-01T11:00:00Z"),
      overrideConflicts: true,
      overrideReason: "Request staff attempted an override.",
    });

    expect(result).toEqual({
      success: false,
      error: "Conflict overrides require venue-manager authorization.",
    });
    expect(mockCreateVenueReservation).not.toHaveBeenCalled();
  });

  it("treats a narrower approved interval as PARTIALLY_ACCEPTED even when the caller submits ACCEPTED", async () => {
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValueOnce(managedRequestFixture());
    mockPrisma.iceTimeRequest.update.mockResolvedValueOnce({
      id: REQUEST_ID,
      status: "PARTIALLY_ACCEPTED",
      decidedAt: new Date("2026-03-01T00:00:00Z"),
    });

    const approvedStartAt = new Date("2026-03-01T10:00:00Z");
    const approvedEndAt = new Date("2026-03-01T10:30:00Z"); // narrower than the 10:00-11:00 request

    const result = await decideIceTimeRequest({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
      status: "ACCEPTED",
      approvedStartAt,
      approvedEndAt,
      decisionMessage: "Only the first half hour is available",
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.iceTimeRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PARTIALLY_ACCEPTED" }),
      }),
    );
    expect(mockCreateVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ startsAt: approvedStartAt, endsAt: approvedEndAt }),
    );
  });

  it("rejects partial approval onto an unrelated surface", async () => {
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValueOnce(managedRequestFixture());

    const result = await decideIceTimeRequest({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
      status: "ACCEPTED",
      approvedStartAt: new Date("2026-03-01T10:00:00Z"),
      approvedEndAt: new Date("2026-03-01T11:00:00Z"),
      approvedSurfaceId: SURFACE_B_ID,
      approvedSegmentId: SEGMENT_B_ID,
    });

    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/must stay within the requested/i),
    });
    expect(mockPrisma.iceTimeRequest.update).not.toHaveBeenCalled();
    expect(mockCreateVenueReservation).not.toHaveBeenCalled();
  });

  it("keeps an exact venue-wide approval as ACCEPTED when the manager explicitly confirms the full-venue claim", async () => {
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValueOnce(
      managedRequestFixture({
        scheduleBlock: {
          id: BLOCK_ID,
          surfaceId: null,
          segmentId: null,
          intent: "OFFERING",
        },
      }),
    );
    mockPrisma.iceTimeRequest.update.mockResolvedValueOnce({
      id: REQUEST_ID,
      status: "ACCEPTED",
      decidedAt: new Date("2026-03-01T00:00:00Z"),
    });

    const result = await decideIceTimeRequest({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
      status: "ACCEPTED",
      approvedStartAt: new Date("2026-03-01T10:00:00Z"),
      approvedEndAt: new Date("2026-03-01T11:00:00Z"),
      approvedSurfaceId: null,
      approvedSegmentId: null,
      intentionalVenueWideClaim: true,
      overrideReason: "Tournament setup uses the full venue",
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.iceTimeRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "ACCEPTED" }),
      }),
    );
    expect(mockCreateVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        surfaceId: null,
        segmentId: null,
        venueWideReason: "Tournament setup uses the full venue",
      }),
    );
  });

  it("rejects widening a surface request into a venue-wide approval", async () => {
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValueOnce(
      managedRequestFixture(),
    );

    const result = await decideIceTimeRequest({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
      status: "ACCEPTED",
      approvedStartAt: new Date("2026-03-01T10:00:00Z"),
      approvedEndAt: new Date("2026-03-01T11:00:00Z"),
      approvedSurfaceId: null,
      approvedSegmentId: null,
      intentionalVenueWideClaim: true,
      overrideReason: "The approved allocation intentionally uses the full venue",
    });

    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/must stay within the requested/i),
    });
    expect(mockPrisma.iceTimeRequest.update).not.toHaveBeenCalled();
    expect(mockCreateVenueReservation).not.toHaveBeenCalled();
  });

  it("allows a whole-surface request to be partially approved to a segment on that surface", async () => {
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValueOnce(
      managedRequestFixture({
        scheduleBlock: {
          id: BLOCK_ID,
          surfaceId: SURFACE_ID,
          segmentId: null,
          intent: "OFFERING",
        },
      }),
    );
    mockPrisma.iceTimeRequest.update.mockResolvedValueOnce({
      id: REQUEST_ID,
      status: "PARTIALLY_ACCEPTED",
      decidedAt: new Date("2026-03-01T00:00:00Z"),
    });

    const result = await decideIceTimeRequest({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
      status: "PARTIALLY_ACCEPTED",
      approvedStartAt: new Date("2026-03-01T10:00:00Z"),
      approvedEndAt: new Date("2026-03-01T11:00:00Z"),
      approvedSurfaceId: SURFACE_ID,
      approvedSegmentId: SEGMENT_ID,
    });

    expect(result.success).toBe(true);
    expect(mockCreateVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        surfaceId: SURFACE_ID,
        segmentId: SEGMENT_ID,
      }),
    );
  });

  it("creates venue-organization ownership only for an unaffiliated public request", async () => {
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValueOnce(
      managedRequestFixture({
        requesterLeagueId: null,
        requesterTeamId: null,
      }),
    );
    mockPrisma.iceTimeRequest.update.mockResolvedValueOnce({
      id: REQUEST_ID,
      status: "ACCEPTED",
      decidedAt: new Date("2026-03-01T00:00:00Z"),
    });

    const result = await decideIceTimeRequest({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
      status: "ACCEPTED",
    });

    expect(result.success).toBe(true);
    expect(mockCreateVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ownerVenueOrganizationId: ORGANIZATION_ID,
        sourceRequestId: STRICT_REQUEST_ID,
      }),
    );
    expect(mockCreateVenueReservation.mock.calls[0][1]).not.toHaveProperty(
      "ownerLeagueId",
    );
    expect(mockCreateVenueReservation.mock.calls[0][1]).not.toHaveProperty(
      "ownerTeamId",
    );
  });

  it("materializes a matching legacy accepted request that lacks a reservation", async () => {
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValueOnce(
      managedRequestFixture({
        status: "ACCEPTED",
        decidedAt: new Date("2026-02-01T00:00:00Z"),
        approvedStartAt: new Date("2026-03-01T10:00:00Z"),
        approvedEndAt: new Date("2026-03-01T11:00:00Z"),
        approvedSurfaceId: SURFACE_ID,
        approvedSegmentId: SEGMENT_ID,
        venueReservation: null,
      }),
    );

    const result = await decideIceTimeRequest({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
      status: "ACCEPTED",
      approvedStartAt: new Date("2026-03-01T10:00:00Z"),
      approvedEndAt: new Date("2026-03-01T11:00:00Z"),
      approvedSurfaceId: SURFACE_ID,
      approvedSegmentId: SEGMENT_ID,
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.iceTimeRequest.update).not.toHaveBeenCalled();
    expect(mockCreateVenueReservation).toHaveBeenCalledOnce();
  });

  it("repairs a missing legacy approval snapshot before materializing its reservation", async () => {
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValueOnce(
      managedRequestFixture({
        status: "ACCEPTED",
        decidedAt: new Date("2026-02-01T00:00:00Z"),
        approvedStartAt: null,
        approvedEndAt: null,
        approvedSurfaceId: null,
        approvedSegmentId: null,
        venueReservation: null,
      }),
    );
    mockPrisma.iceTimeRequest.update.mockResolvedValueOnce({
      id: REQUEST_ID,
      status: "ACCEPTED",
      decidedAt: new Date("2026-02-01T00:00:00Z"),
    });

    const result = await decideIceTimeRequest({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
      status: "ACCEPTED",
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.iceTimeRequest.update).toHaveBeenCalledWith({
      where: { id: STRICT_REQUEST_ID },
      data: {
        approvedStartAt: new Date("2026-03-01T10:00:00Z"),
        approvedEndAt: new Date("2026-03-01T11:00:00Z"),
        approvedSurfaceId: SURFACE_ID,
        approvedSegmentId: SEGMENT_ID,
      },
      select: { id: true, status: true, decidedAt: true },
    });
    expect(mockCreateVenueReservation).toHaveBeenCalledOnce();
  });

  it("declines a request without creating any reservation", async () => {
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValueOnce(managedRequestFixture());
    mockPrisma.iceTimeRequest.update.mockResolvedValueOnce({
      id: REQUEST_ID,
      status: "DECLINED",
      decidedAt: new Date("2026-03-01T00:00:00Z"),
    });

    const result = await decideIceTimeRequest({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
      status: "DECLINED",
      decisionMessage: "No ice available at this time",
    });

    expect(result.success).toBe(true);
    expect(mockCreateVenueReservation).not.toHaveBeenCalled();
    if (result.success) {
      const data = result.data as unknown as { reservationId?: string | null };
      expect(data.reservationId ?? null).toBeNull();
    }
  });

  it("is idempotent: re-approving an already-accepted request with an existing reservation does not create a second one", async () => {
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValueOnce(
      managedRequestFixture({
        status: "ACCEPTED",
        decidedAt: new Date("2026-03-01T00:00:00Z"),
        approvedStartAt: new Date("2026-03-01T10:00:00Z"),
        approvedEndAt: new Date("2026-03-01T11:00:00Z"),
        approvedSurfaceId: SURFACE_ID,
        approvedSegmentId: SEGMENT_ID,
        venueReservation: {
          id: RESERVATION_ID,
          status: "CONFIRMED",
          startsAt: new Date("2026-03-01T10:00:00Z"),
          endsAt: new Date("2026-03-01T11:00:00Z"),
          surfaceId: SURFACE_ID,
          segmentId: SEGMENT_ID,
        },
      }),
    );
    mockPrisma.iceTimeRequest.update.mockResolvedValueOnce({
      id: REQUEST_ID,
      status: "ACCEPTED",
      decidedAt: new Date("2026-03-01T00:00:00Z"),
    });

    const result = await decideIceTimeRequest({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
      status: "ACCEPTED",
      approvedStartAt: new Date("2026-03-01T10:00:00Z"),
      approvedEndAt: new Date("2026-03-01T11:00:00Z"),
    });

    expect(result.success).toBe(true);
    expect(mockCreateVenueReservation).not.toHaveBeenCalled();
    expect(mockPrisma.iceTimeRequest.update).not.toHaveBeenCalled();
  });

  it("rejects a different final decision once a confirmed reservation exists", async () => {
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValueOnce(
      managedRequestFixture({
        status: "ACCEPTED",
        decidedAt: new Date("2026-03-01T00:00:00Z"),
        approvedStartAt: new Date("2026-03-01T10:00:00Z"),
        approvedEndAt: new Date("2026-03-01T11:00:00Z"),
        approvedSurfaceId: SURFACE_ID,
        approvedSegmentId: SEGMENT_ID,
        venueReservation: {
          id: RESERVATION_ID,
          status: "CONFIRMED",
          startsAt: new Date("2026-03-01T10:00:00Z"),
          endsAt: new Date("2026-03-01T11:00:00Z"),
          surfaceId: SURFACE_ID,
          segmentId: SEGMENT_ID,
        },
      }),
    );

    const result = await decideIceTimeRequest({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
      status: "DECLINED",
      decisionMessage: "Changed after approval",
    });

    expect(result.success).toBe(false);
    expect(mockPrisma.iceTimeRequest.update).not.toHaveBeenCalled();
    expect(mockTransitionVenueReservation).not.toHaveBeenCalled();
  });

  it("requires an override reason before overriding a detected conflict rather than silently double-booking", async () => {
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValueOnce(managedRequestFixture());
    mockCreateVenueReservation.mockRejectedValueOnce(
      new VenueReservationConflictError([
        {
          id: "cotherxxxxxxxxxxxxxxxxxxxx",
          status: "CONFIRMED",
          startsAt: new Date(),
          endsAt: new Date(),
          timezone: "UTC",
          venueId: VENUE_ID,
          surfaceId: null,
          segmentId: null,
        },
      ]),
    );

    const result = await decideIceTimeRequest({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
      status: "ACCEPTED",
      approvedStartAt: new Date("2026-03-01T10:00:00Z"),
      approvedEndAt: new Date("2026-03-01T11:00:00Z"),
      overrideConflicts: false,
    });

    expect(result.success).toBe(false);
    // The unit mock cannot model transaction rollback. The returned failure,
    // plus the PostgreSQL-backed concurrency suite, verifies no decision can
    // commit independently from reservation creation.
  });

  it("proceeds past a detected conflict once an explicit override reason is supplied", async () => {
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValueOnce(managedRequestFixture());
    mockPrisma.iceTimeRequest.update.mockResolvedValueOnce({
      id: REQUEST_ID,
      status: "ACCEPTED",
      decidedAt: new Date("2026-03-01T00:00:00Z"),
    });

    const result = await decideIceTimeRequest({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
      status: "ACCEPTED",
      approvedStartAt: new Date("2026-03-01T10:00:00Z"),
      approvedEndAt: new Date("2026-03-01T11:00:00Z"),
      overrideConflicts: true,
      overrideReason: "Association scheduler manually reallocated the ice",
    });

    expect(result.success).toBe(true);
    expect(mockCreateVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ overrideReason: "Association scheduler manually reallocated the ice" }),
    );
  });
});

describe("cancel/expire ice time requests propagate to the linked reservation (T017 -> T024 intended contract)", () => {
  it("cancelIceTimeRequest releases the linked reservation atomically instead of leaving it orphaned", async () => {
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValueOnce(
      managedRequestFixture({ venueReservation: { id: RESERVATION_ID, status: "CONFIRMED" } }),
    );
    mockPrisma.iceTimeRequest.update.mockResolvedValueOnce({ id: REQUEST_ID, status: "CANCELED" });
    mockTransitionVenueReservation.mockResolvedValueOnce({ id: RESERVATION_ID, status: "RELEASED" });

    const result = await cancelIceTimeRequest({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
    });

    expect(result.success).toBe(true);
    expect(mockTransitionVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reservationId: RESERVATION_ID, nextStatus: "RELEASED" }),
    );
    // The request update and the reservation release belong to one atomic
    // operation, not two independently-committed writes.
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });

  it("expireIceTimeRequest releases the linked reservation the same way cancellation does", async () => {
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValueOnce(
      managedRequestFixture({ venueReservation: { id: RESERVATION_ID, status: "CONFIRMED" } }),
    );
    mockPrisma.iceTimeRequest.update.mockResolvedValueOnce({ id: REQUEST_ID, status: "EXPIRED" });
    mockTransitionVenueReservation.mockResolvedValueOnce({ id: RESERVATION_ID, status: "RELEASED" });

    const result = await expireIceTimeRequest({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
    });

    expect(result.success).toBe(true);
    expect(mockTransitionVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reservationId: RESERVATION_ID, nextStatus: "RELEASED" }),
    );
  });

  it("cancelIceTimeRequest releases the replacement reservation now linked after a reschedule", async () => {
    const replacementReservationId = "clresreplacementxxxxxxxxxx";
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValueOnce(
      managedRequestFixture({
        status: "ACCEPTED",
        venueReservation: { id: replacementReservationId, status: "CONFIRMED" },
      }),
    );
    mockPrisma.iceTimeRequest.update.mockResolvedValueOnce({ id: REQUEST_ID, status: "CANCELED" });
    mockTransitionVenueReservation.mockResolvedValueOnce({
      id: replacementReservationId,
      status: "RELEASED",
    });

    const result = await cancelIceTimeRequest({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
    });

    expect(result.success).toBe(true);
    expect(mockTransitionVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reservationId: replacementReservationId,
        nextStatus: "RELEASED",
      }),
    );
  });

  it("expireIceTimeRequest releases the replacement reservation now linked after a reschedule", async () => {
    const replacementReservationId = "clresreplacementxxxxxxxxxx";
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValueOnce(
      managedRequestFixture({
        status: "PARTIALLY_ACCEPTED",
        venueReservation: { id: replacementReservationId, status: "CONFIRMED" },
      }),
    );
    mockPrisma.iceTimeRequest.update.mockResolvedValueOnce({ id: REQUEST_ID, status: "EXPIRED" });
    mockTransitionVenueReservation.mockResolvedValueOnce({
      id: replacementReservationId,
      status: "RELEASED",
    });

    const result = await expireIceTimeRequest({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
    });

    expect(result.success).toBe(true);
    expect(mockTransitionVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reservationId: replacementReservationId,
        nextStatus: "RELEASED",
      }),
    );
  });

  it("cancelling a request with no linked reservation still succeeds without calling the reservation service", async () => {
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValueOnce(managedRequestFixture({ venueReservation: null }));
    mockPrisma.iceTimeRequest.update.mockResolvedValueOnce({ id: REQUEST_ID, status: "CANCELED" });

    const result = await cancelIceTimeRequest({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
    });

    expect(result.success).toBe(true);
    expect(mockTransitionVenueReservation).not.toHaveBeenCalled();
  });
});

describe("exact auth / cross-tenant protections on ice time request decisions", () => {
  it("scopes decideIceTimeRequest's lookup to the exact organization and venue (existing protection)", async () => {
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValueOnce(null);

    const result = await decideIceTimeRequest({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
      status: "ACCEPTED",
    });

    expect(result.success).toBe(false);
    expect(mockPrisma.iceTimeRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: REQUEST_ID,
          venueId: VENUE_ID,
          venue: { organizationId: ORGANIZATION_ID },
        }),
      }),
    );
  });

  it("checks venue-request-manager authority for the exact organization/venue pair before deciding (existing protection)", async () => {
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValueOnce(managedRequestFixture());
    mockPrisma.iceTimeRequest.update.mockResolvedValueOnce({
      id: REQUEST_ID,
      status: "ACCEPTED",
      decidedAt: new Date(),
    });

    await decideIceTimeRequest({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
      status: "ACCEPTED",
    });

    expect(mockRequireVenueRequestManager).toHaveBeenCalledWith(ORGANIZATION_ID, VENUE_ID);
  });

  it("rejects a decision attempt when the caller's venue-request authority is scoped to a different venue (cross-tenant)", async () => {
    mockRequireVenueRequestManager.mockRejectedValueOnce(
      new Error("Unauthorized: You do not have permission to manage this venue"),
    );

    const result = await decideIceTimeRequest({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
      status: "ACCEPTED",
    });

    expect(result.success).toBe(false);
    expect(mockPrisma.iceTimeRequest.findFirst).not.toHaveBeenCalled();
  });
});

describe("durable notification identifiers and the association-operations notification registry", () => {
  it("accepts a valid venue_request.approved envelope whose payload id matches the aggregate id (registry contract, already implemented)", () => {
    const payload = { kind: "VENUE_REQUEST" as const, data: { requestId: STRICT_REQUEST_ID } };

    expect(() =>
      assertAssociationOperationsNotificationEvent({
        eventType: "association.venue_request.approved",
        aggregateType: "VENUE_REQUEST",
        aggregateId: STRICT_REQUEST_ID,
        payload,
      }),
    ).not.toThrow();

    const parsed = parseAssociationOperationsNotificationEvent({
      eventType: "association.venue_request.approved",
      aggregateType: "VENUE_REQUEST",
      aggregateId: STRICT_REQUEST_ID,
      payload,
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect((parsed.event.payload as { requestId: string }).requestId).toBe(STRICT_REQUEST_ID);
    }
  });

  it("accepts a valid venue_reservation.confirmed envelope (registry contract, already implemented)", () => {
    const payload = {
      kind: "VENUE_RESERVATION" as const,
      data: { venueReservationId: STRICT_RESERVATION_ID },
    };

    expect(() =>
      assertAssociationOperationsNotificationEvent({
        eventType: "association.venue_reservation.confirmed",
        aggregateType: "VENUE_RESERVATION",
        aggregateId: STRICT_RESERVATION_ID,
        payload,
      }),
    ).not.toThrow();
  });

  it("rejects an envelope whose payload id does not match the aggregate id, guarding against notification-ID drift", () => {
    const mismatchedId = "creq111111111111111111111";
    const payload = { kind: "VENUE_REQUEST" as const, data: { requestId: mismatchedId } };

    expect(() =>
      assertAssociationOperationsNotificationEvent({
        eventType: "association.venue_request.approved",
        aggregateType: "VENUE_REQUEST",
        aggregateId: STRICT_REQUEST_ID,
        payload,
      }),
    ).toThrow();
  });

  it("rejects a mismatched aggregateType for a known eventType", () => {
    const payload = { kind: "VENUE_REQUEST" as const, data: { requestId: STRICT_REQUEST_ID } };

    expect(() =>
      assertAssociationOperationsNotificationEvent({
        eventType: "association.venue_request.approved",
        aggregateType: "VENUE_RESERVATION",
        aggregateId: STRICT_REQUEST_ID,
        payload,
      }),
    ).toThrow();
  });

  it("every notification id returned by a full approval is itself a strictly valid CUID the registry would accept", async () => {
    mockPrisma.iceTimeRequest.findFirst.mockResolvedValueOnce(managedRequestFixture());
    mockPrisma.iceTimeRequest.update.mockResolvedValueOnce({
      id: REQUEST_ID,
      status: "ACCEPTED",
      decidedAt: new Date("2026-03-01T00:00:00Z"),
    });
    mockCreateVenueReservation.mockResolvedValueOnce({
      id: RESERVATION_ID,
      status: "CONFIRMED",
      startsAt: new Date("2026-03-01T10:00:00Z"),
      endsAt: new Date("2026-03-01T11:00:00Z"),
    });

    const result = await decideIceTimeRequest({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
      status: "ACCEPTED",
      approvedStartAt: new Date("2026-03-01T10:00:00Z"),
      approvedEndAt: new Date("2026-03-01T11:00:00Z"),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as unknown as { notificationIds?: string[] };
      for (const id of data.notificationIds ?? []) {
        expect(id).toMatch(/^c[a-z0-9]{24}$/);
      }
    }
  });
});
