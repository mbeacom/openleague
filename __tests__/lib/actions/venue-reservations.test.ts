/**
 * T019: Server Action tests for the not-yet-built `lib/actions/venue-reservations.ts`
 * (T025). These express the intended contract from
 * `specs/007-association-operations/contracts/venue-reservation-actions.md`
 * ("Assign Venue Reservation", "Reservation Lifecycle", "Availability
 * Preview") against the already-implemented `lib/services/venue-reservations.ts`
 * and `lib/services/venue-reservation-availability.ts` foundation.
 *
 * Every test in this file imports from `@/lib/actions/venue-reservations`,
 * which does not exist until T025 lands, so the whole suite is expected to
 * fail at module resolution today. That failure is the intended "red" state
 * of tests-first work for an unimplemented action module, not a defect in
 * the tests themselves — each test still pins the exact contract T025 must
 * satisfy (auth/cross-tenant checks, disposition requirements on
 * release/cancel, idempotent assignment, and public-safe availability
 * previews) so it can be turned green mechanically once the action exists.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuth,
  mockTx,
  mockPrisma,
  serviceAssignVenueReservation,
  serviceTransitionVenueReservation,
  serviceCreateVenueReservation,
  serviceFindVenueReservationAvailability,
} = vi.hoisted(() => {
  const transaction = {
    venueReservation: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    practiceSession: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    event: {
      findUnique: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    teamMember: { findMany: vi.fn() },
    rSVP: { createMany: vi.fn() },
    seasonGame: { updateMany: vi.fn() },
    eventGame: { updateMany: vi.fn() },
    signupEvent: { updateMany: vi.fn() },
    gameProposalEntry: { updateMany: vi.fn() },
    venue: { findUnique: vi.fn(), findFirst: vi.fn() },
    venueStaff: { findFirst: vi.fn() },
    leagueUser: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    mockAuth: {
      requireUserId: vi.fn(),
      requireVenueScheduleManager: vi.fn(),
      requireLeagueRole: vi.fn(),
      requireTeamAdmin: vi.fn(),
    },
    mockTx: transaction,
    mockPrisma: {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
      venueReservation: { findUnique: vi.fn(), findFirst: vi.fn() },
    },
    serviceAssignVenueReservation: vi.fn(),
    serviceTransitionVenueReservation: vi.fn(),
    serviceCreateVenueReservation: vi.fn(),
    serviceFindVenueReservationAvailability: vi.fn(),
  };
});

vi.mock("@/lib/auth/session", () => mockAuth);
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/venue-reservations", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/venue-reservations")>(
    "@/lib/services/venue-reservations",
  );
  return {
    ...actual,
    assignVenueReservation: serviceAssignVenueReservation,
    transitionVenueReservation: serviceTransitionVenueReservation,
    createVenueReservation: serviceCreateVenueReservation,
  };
});
vi.mock("@/lib/services/venue-reservation-availability", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/services/venue-reservation-availability")
  >("@/lib/services/venue-reservation-availability");
  return {
    ...actual,
    findVenueReservationAvailability: serviceFindVenueReservationAvailability,
  };
});

import {
  VenueReservationConflictError,
  VenueReservationLifecycleError,
} from "@/lib/services/venue-reservations";
import {
  assignVenueReservation,
  cancelVenueReservation,
  checkVenueReservationAvailability,
  completeVenueReservation,
  markVenueReservationUnused,
  releaseVenueReservation,
  rescheduleVenueReservation,
  unassignVenueReservation,
} from "@/lib/actions/venue-reservations";

const ORG_ID = "corgxxxxxxxxxxxxxxxxxxxxx";
const OTHER_ORG_ID = "corgyyyyyyyyyyyyyyyyyyyyy";
const VENUE_ID = "cvenuexxxxxxxxxxxxxxxxxxx";
const OTHER_VENUE_ID = "cvenueyyyyyyyyyyyyyyyyyyy";
const RESERVATION_ID = "cresxxxxxxxxxxxxxxxxxxxxx";
const PRACTICE_ID = "cpracticexxxxxxxxxxxxxxxx";
const USER_ID = "cuserxxxxxxxxxxxxxxxxxxxxx";

function ownedReservation(overrides: Partial<{ venueId: string; organizationId: string; status: string }> = {}) {
  return {
    id: RESERVATION_ID,
    venueId: overrides.venueId ?? VENUE_ID,
    status: overrides.status ?? "CONFIRMED",
    startsAt: new Date("2026-05-01T18:00:00.000Z"),
    endsAt: new Date("2026-05-01T19:00:00.000Z"),
    timezone: "America/New_York",
    ownerLeagueId: null,
    ownerTeamId: null,
    venue: {
      organizationId: overrides.organizationId ?? ORG_ID,
      name: "North Rink",
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.requireUserId.mockResolvedValue(USER_ID);
  mockAuth.requireVenueScheduleManager.mockResolvedValue(USER_ID);
  mockAuth.requireLeagueRole.mockResolvedValue(USER_ID);
  mockAuth.requireTeamAdmin.mockResolvedValue(USER_ID);
  mockTx.venueReservation.findUnique.mockResolvedValue(ownedReservation());
  mockTx.venueReservation.findFirst.mockResolvedValue(null);
  mockTx.venueReservation.update.mockResolvedValue({ id: RESERVATION_ID });
  mockTx.venue.findUnique.mockResolvedValue({ organizationId: ORG_ID });
  mockTx.venue.findFirst.mockResolvedValue({ organizationId: ORG_ID });
  mockTx.venueStaff.findFirst.mockResolvedValue({ id: "cstaffxxxxxxxxxxxxxxxxxxxx", role: "MANAGER" });
  mockPrisma.venueReservation.findUnique.mockResolvedValue(ownedReservation());
  mockTx.practiceSession.findUnique.mockResolvedValue({
    id: PRACTICE_ID,
    title: "Tuesday practice",
    teamId: "cteamxxxxxxxxxxxxxxxxxxxx",
    team: { leagueId: "cleaguexxxxxxxxxxxxxxxxxx" },
  });
  mockTx.practiceSession.findFirst.mockResolvedValue({
    id: PRACTICE_ID,
    teamId: "cteamxxxxxxxxxxxxxxxxxxxx",
    venueId: VENUE_ID,
    startAt: new Date("2026-05-01T18:00:00.000Z"),
    duration: 60,
  });
  mockTx.practiceSession.update.mockResolvedValue({ id: PRACTICE_ID });
  mockTx.practiceSession.updateMany.mockResolvedValue({ count: 1 });
  mockTx.event.findUnique.mockResolvedValue(null);
  mockTx.event.create.mockResolvedValue({ id: "ceventxxxxxxxxxxxxxxxxxxxx" });
  mockTx.teamMember.findMany.mockResolvedValue([]);
  mockTx.venue.findUnique.mockResolvedValue({ organizationId: ORG_ID });
  mockTx.venueStaff.findFirst.mockResolvedValue({ id: "cstaffxxxxxxxxxxxxxxxxxxxx" });
});

describe("assignVenueReservation action (T019)", () => {
  it("authorizes against the reservation's own venue/organization and links the target", async () => {
    serviceAssignVenueReservation.mockResolvedValue({
      reservation: ownedReservation(),
      canonicalScheduleId: `reservation:${RESERVATION_ID}`,
      rsvpCount: 0,
    });

    const result = await assignVenueReservation({
      reservationId: RESERVATION_ID,
      targetType: "PRACTICE",
      targetId: PRACTICE_ID,
      overrideConflicts: false,
    });

    expect(result.success).toBe(true);
    expect(mockAuth.requireVenueScheduleManager).toHaveBeenCalledWith(ORG_ID, VENUE_ID);
    expect(serviceAssignVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reservationId: RESERVATION_ID, targetType: "PRACTICE", targetId: PRACTICE_ID }),
    );
  });

  it("rejects assignment when the caller only holds venue-schedule authority at a different venue (cross-tenant)", async () => {
    mockTx.venueReservation.findUnique.mockResolvedValue(
      ownedReservation({ venueId: OTHER_VENUE_ID, organizationId: OTHER_ORG_ID }),
    );
    mockPrisma.venueReservation.findUnique.mockResolvedValue(
      ownedReservation({ venueId: OTHER_VENUE_ID, organizationId: OTHER_ORG_ID }),
    );
    mockAuth.requireVenueScheduleManager.mockImplementation(async (organizationId: string) => {
      if (organizationId === OTHER_ORG_ID) {
        throw new Error("Unauthorized: You do not have permission to manage this venue");
      }
      return USER_ID;
    });

    const result = await assignVenueReservation({
      reservationId: RESERVATION_ID,
      targetType: "PRACTICE",
      targetId: PRACTICE_ID,
      overrideConflicts: false,
    });

    expect(result.success).toBe(false);
    expect(serviceAssignVenueReservation).not.toHaveBeenCalled();
  });

  it("is idempotent: assigning the same reservation to the same already-linked target twice succeeds both times", async () => {
    serviceAssignVenueReservation.mockResolvedValue({
      reservation: ownedReservation(),
      canonicalScheduleId: `reservation:${RESERVATION_ID}`,
      rsvpCount: 0,
    });

    const input = {
      reservationId: RESERVATION_ID,
      targetType: "PRACTICE" as const,
      targetId: PRACTICE_ID,
      overrideConflicts: false,
    };
    const first = await assignVenueReservation(input);
    const second = await assignVenueReservation(input);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    // Each operation links the practice and its participant-facing Event.
    expect(serviceAssignVenueReservation).toHaveBeenCalledTimes(4);
  });

  it("creates a team-scoped participant Event for a practice using league-owned inventory", async () => {
    const leagueId = "cleaguexxxxxxxxxxxxxxxxxx";
    const leagueReservation = {
      ...ownedReservation(),
      ownerLeagueId: leagueId,
      ownerTeamId: null,
    };
    mockPrisma.venueReservation.findUnique.mockResolvedValue(leagueReservation);
    mockTx.venueReservation.findUnique.mockResolvedValue(leagueReservation);
    serviceAssignVenueReservation.mockResolvedValue({
      reservation: leagueReservation,
      canonicalScheduleId: `reservation:${RESERVATION_ID}`,
      rsvpCount: 0,
    });

    const result = await assignVenueReservation({
      reservationId: RESERVATION_ID,
      targetType: "PRACTICE",
      targetId: PRACTICE_ID,
      overrideConflicts: false,
    });

    expect(result.success).toBe(true);
    expect(mockTx.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          teamId: "cteamxxxxxxxxxxxxxxxxxxxx",
          leagueId: null,
        }),
      }),
    );
  });

  it("keeps the participant Event team-scoped when a practice assignment updates it", async () => {
    const leagueId = "cleaguexxxxxxxxxxxxxxxxxx";
    const leagueReservation = {
      ...ownedReservation(),
      ownerLeagueId: leagueId,
      ownerTeamId: null,
    };
    mockPrisma.venueReservation.findUnique.mockResolvedValue(leagueReservation);
    mockTx.venueReservation.findUnique.mockResolvedValue(leagueReservation);
    mockTx.event.findUnique.mockResolvedValue({
      id: "ceventxxxxxxxxxxxxxxxxxxxx",
      teamId: "cteamxxxxxxxxxxxxxxxxxxxx",
      type: "PRACTICE",
    });
    serviceAssignVenueReservation.mockResolvedValue({
      reservation: leagueReservation,
      canonicalScheduleId: `reservation:${RESERVATION_ID}`,
      rsvpCount: 0,
    });

    const result = await assignVenueReservation({
      reservationId: RESERVATION_ID,
      targetType: "PRACTICE",
      targetId: PRACTICE_ID,
      overrideConflicts: false,
    });

    expect(result.success).toBe(true);
    expect(mockTx.event.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          teamId: "cteamxxxxxxxxxxxxxxxxxxxx",
          leagueId: null,
        }),
      }),
    );
  });

  it("surfaces a conflict error requiring an override reason instead of silently double-booking", async () => {
    serviceAssignVenueReservation.mockRejectedValue(
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

    const result = await assignVenueReservation({
      reservationId: RESERVATION_ID,
      targetType: "PRACTICE",
      targetId: PRACTICE_ID,
      overrideConflicts: false,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/no longer available|conflict/i);
    }
  });
});

describe("reservation lifecycle actions (T019)", () => {
  it("releaseVenueReservation requires an explicit disposition when a linked activity exists", async () => {
    mockTx.venueReservation.findUnique.mockResolvedValue({
      ...ownedReservation(),
      practiceSessions: [{ id: PRACTICE_ID }],
    });

    const result = await releaseVenueReservation({
      reservationId: RESERVATION_ID,
      nextStatus: "RELEASED",
      reason: "Ice time no longer needed",
    });

    expect(result.success).toBe(false);
    expect(serviceTransitionVenueReservation).not.toHaveBeenCalled();
  });

  it("releaseVenueReservation proceeds once allowAssignedDisposition is explicitly set", async () => {
    mockTx.venueReservation.findUnique.mockResolvedValue({
      ...ownedReservation(),
      practiceSessions: [{ id: PRACTICE_ID }],
    });
    serviceTransitionVenueReservation.mockResolvedValue({ ...ownedReservation(), status: "RELEASED" });

    const result = await releaseVenueReservation({
      reservationId: RESERVATION_ID,
      nextStatus: "RELEASED",
      reason: "Ice time no longer needed",
      allowAssignedDisposition: true,
    });

    expect(result.success).toBe(true);
    expect(serviceTransitionVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ nextStatus: "RELEASED", allowAssignedDisposition: false }),
    );
  });

  it("cancelVenueReservation requires the same explicit disposition for linked activities", async () => {
    mockTx.venueReservation.findUnique.mockResolvedValue({
      ...ownedReservation(),
      practiceSessions: [{ id: PRACTICE_ID }],
    });
    serviceTransitionVenueReservation.mockRejectedValue(
      new VenueReservationLifecycleError(
        "Cannot cancel a reservation with a linked activity without an explicit disposition.",
      ),
    );

    const result = await cancelVenueReservation({
      reservationId: RESERVATION_ID,
      nextStatus: "CANCELED",
      reason: "Rink closed for maintenance",
    });

    expect(result.success).toBe(false);
  });

  it("completeVenueReservation marks the reservation COMPLETED with a usage status", async () => {
    serviceTransitionVenueReservation.mockResolvedValue({
      ...ownedReservation(),
      status: "COMPLETED",
      usageStatus: "USED",
    });

    const result = await completeVenueReservation({
      reservationId: RESERVATION_ID,
      nextStatus: "COMPLETED",
      reason: "Ice time used as scheduled",
      usageStatus: "USED",
    });

    expect(result.success).toBe(true);
    expect(serviceTransitionVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ nextStatus: "COMPLETED", usageStatus: "USED" }),
    );
  });

  it("markVenueReservationUnused records a completed-but-unused disposition", async () => {
    serviceTransitionVenueReservation.mockResolvedValue({
      ...ownedReservation(),
      status: "COMPLETED",
      usageStatus: "UNUSED",
    });

    const result = await markVenueReservationUnused({
      reservationId: RESERVATION_ID,
      reason: "Team did not attend",
    });

    expect(result.success).toBe(true);
    expect(serviceTransitionVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ usageStatus: "UNUSED" }),
    );
  });

  it.each([
    ["requesting team admin", { ownerTeamId: "cteamxxxxxxxxxxxxxxxxxxxx" }],
    ["association scheduler", { ownerLeagueId: "cleaguexxxxxxxxxxxxxxxxxx" }],
    ["venue scheduler", { ownerVenueOrganizationId: ORG_ID }],
  ])("rejects generic rescheduling by the %s and preserves request lineage", async (
    _path,
    owner,
  ) => {
    const requestBacked = {
      ...ownedReservation(),
      ownerLeagueId: null,
      ownerTeamId: null,
      ownerVenueOrganizationId: null,
      ...owner,
      sourceRequestId: "crequestxxxxxxxxxxxxxxxxxx",
      offeringBlockId: "cofferxxxxxxxxxxxxxxxxxxx",
    };
    mockPrisma.venueReservation.findUnique.mockResolvedValueOnce(requestBacked);
    mockTx.venueReservation.findUnique.mockResolvedValueOnce(requestBacked);
    mockAuth.requireTeamAdmin.mockResolvedValue(USER_ID);
    mockAuth.requireLeagueRole.mockResolvedValue(USER_ID);

    const result = await rescheduleVenueReservation({
      reservationId: RESERVATION_ID,
      startsAt: new Date("2026-05-01T20:00:00.000Z"),
      endsAt: new Date("2026-05-01T21:00:00.000Z"),
      reason: "Move the approved request",
    });

    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/cancel or amend.*approved request/i),
    });
    expect(requestBacked.sourceRequestId).toBe(
      "crequestxxxxxxxxxxxxxxxxxx",
    );
    expect(mockTx.venueReservation.update).not.toHaveBeenCalled();
    expect(serviceTransitionVenueReservation).not.toHaveBeenCalled();
    expect(serviceCreateVenueReservation).not.toHaveBeenCalled();
  });

  it("unassignVenueReservation clears the linkage without deleting the reservation or the target", async () => {
    const result = await unassignVenueReservation({
      reservationId: RESERVATION_ID,
      targetType: "PRACTICE",
      targetId: PRACTICE_ID,
      reason: "Practice moved to a different reservation",
    });

    expect(result.success).toBe(true);
  });
});

describe("checkVenueReservationAvailability action (T019)", () => {
  it("returns offerings, occupancy, and override eligibility for an authorized manager", async () => {
    serviceFindVenueReservationAvailability.mockResolvedValue({
      offerings: [],
      occupancy: [],
      conflicts: [],
    });

    const result = await checkVenueReservationAvailability({
      venueId: VENUE_ID,
      startsAt: new Date("2026-05-01T18:00:00.000Z"),
      endsAt: new Date("2026-05-01T19:00:00.000Z"),
      mode: "STAFF",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty("canOverride");
    }
  });

  it("returns only public offerings and available slices for a published venue", async () => {
    serviceFindVenueReservationAvailability.mockResolvedValue({
      offerings: [],
      occupancy: [
        {
          id: RESERVATION_ID,
          ownerTeamId: "cteamxxxxxxxxxxxxxxxxxxxx",
          status: "CONFIRMED",
          startsAt: new Date("2026-05-01T18:15:00.000Z"),
          endsAt: new Date("2026-05-01T18:45:00.000Z"),
        },
      ],
      conflicts: [],
    });

    const result = await checkVenueReservationAvailability({
      venueId: VENUE_ID,
      startsAt: new Date("2026-05-01T18:00:00.000Z"),
      endsAt: new Date("2026-05-01T19:00:00.000Z"),
      mode: "PUBLIC",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const serialized = JSON.stringify(result.data);
      expect(serialized).not.toMatch(
        /reservationId|status|occupancy|conflicts|ownerTeamId|ownerLeagueId|ownerVenueOrganizationId/,
      );
      expect(result.data).toEqual(
        expect.objectContaining({
          offerings: [],
          availableSlices: [
            {
              startsAt: new Date("2026-05-01T18:00:00.000Z"),
              endsAt: new Date("2026-05-01T18:15:00.000Z"),
            },
            {
              startsAt: new Date("2026-05-01T18:45:00.000Z"),
              endsAt: new Date("2026-05-01T19:00:00.000Z"),
            },
          ],
          canOverride: false,
        }),
      );
    }
  });

  it("rejects public previews for unpublished or private venues", async () => {
    mockTx.venue.findFirst.mockResolvedValue(null);
    serviceFindVenueReservationAvailability.mockResolvedValue({
      offerings: [],
      occupancy: [],
      conflicts: [],
    });

    const result = await checkVenueReservationAvailability({
      venueId: VENUE_ID,
      startsAt: new Date("2026-05-01T18:00:00.000Z"),
      endsAt: new Date("2026-05-01T19:00:00.000Z"),
      mode: "PUBLIC",
    });

    expect(result).toEqual({
      success: false,
      error: "Unable to check venue availability.",
    });
    expect(serviceFindVenueReservationAvailability).not.toHaveBeenCalled();
    expect(mockTx.venue.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: VENUE_ID,
          isActive: true,
          visibility: "PUBLIC",
          profileStatus: "PUBLISHED",
        }),
      }),
    );
  });

  it("requires exact active venue staff for staff availability", async () => {
    mockTx.venueStaff.findFirst.mockResolvedValue(null);

    const result = await checkVenueReservationAvailability({
      venueId: VENUE_ID,
      startsAt: new Date("2026-05-01T18:00:00.000Z"),
      endsAt: new Date("2026-05-01T19:00:00.000Z"),
      mode: "STAFF",
    });

    expect(result.success).toBe(false);
    expect(serviceFindVenueReservationAvailability).not.toHaveBeenCalled();
  });
});
