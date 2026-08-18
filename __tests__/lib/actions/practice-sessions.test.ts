/**
 * T020: tests for the intended reservation-aware practice-session actions.
 *
 * Today `createPracticeSession`/`updatePracticeSession` only ever touch the
 * legacy `PracticeSession.venueId/surfaceId/segmentId/startAt` +
 * `conflictOverriddenById/At` fields (feature 006) and never create an Event,
 * RSVPs, or a `VenueReservation` link. These tests express the T032 contract
 * this feature adds on top of that foundation: a practice that references a
 * confirmed `VenueReservation` must atomically link both the `PracticeSession`
 * and its participant-facing `Event` to that single reservation (so the two
 * "linked alias" rows share one occupied slot, per
 * `assignVenueReservation`'s alias rules in `lib/services/venue-reservations.ts`),
 * fan out RSVPs to the roster, and require an explicit override reason when
 * the reservation was created against a conflict.
 *
 * The pre-existing admin-only authorization check is exercised too (and is
 * expected to already pass), so this file also documents which parts of the
 * contract the current implementation already satisfies versus what T032
 * still needs to add.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuth, mockTx, mockPrisma, serviceAssignVenueReservation, serviceCreateVenueReservation } = vi.hoisted(() => {
  // Shared model mocks: today's `createPracticeSession` calls `prisma.*`
  // directly with no `$transaction` wrapper at all, while the intended T032
  // contract wraps every write in one atomic `prisma.$transaction(tx => ...)`.
  // Using the *same* mock objects for both `mockPrisma` and `mockTx` lets
  // these tests observe calls correctly under either shape, so a test only
  // fails because the expected call never happens - not because of which
  // client reference the (current or future) implementation calls through.
  const models = {
    play: { findMany: vi.fn() },
    practiceSession: {
      create: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    practiceSessionPlay: { deleteMany: vi.fn() },
    event: {
      create: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    rSVP: { createMany: vi.fn() },
    team: { findUnique: vi.fn() },
    teamMember: { findMany: vi.fn(), findFirst: vi.fn() },
    leagueUser: { findFirst: vi.fn() },
    venue: { findUnique: vi.fn() },
    venueReservation: { findUnique: vi.fn() },
  };
  return {
    mockAuth: {
      requireTeamAdmin: vi.fn(),
      requireTeamMember: vi.fn(),
      requireLeagueRole: vi.fn(),
    },
    mockTx: models,
    mockPrisma: {
      $transaction: vi.fn(async (callback: (tx: typeof models) => unknown) => callback(models)),
      ...models,
    },
    serviceAssignVenueReservation: vi.fn(),
    serviceCreateVenueReservation: vi.fn(),
  };
});

vi.mock("@/lib/auth/session", () => mockAuth);
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actions/venues", () => ({ canUserAccessVenue: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/services/venue-reservations", () => ({
  assignVenueReservation: serviceAssignVenueReservation,
  createVenueReservation: serviceCreateVenueReservation,
  VenueReservationConflictError: class VenueReservationConflictError extends Error {
    conflicts: unknown[];
    constructor(conflicts: unknown[]) {
      super("That venue space is no longer available.");
      this.conflicts = conflicts;
    }
  },
  VenueReservationLifecycleError: class VenueReservationLifecycleError extends Error {},
}));

import {
  createPracticeSession,
  deletePracticeSession,
  updatePracticeSession,
} from "@/lib/actions/practice-sessions";

const TEAM_ID = "cteamxxxxxxxxxxxxxxxxxxxx";
const USER_ID = "cuserxxxxxxxxxxxxxxxxxxxx";
const RESERVATION_ID = "cresxxxxxxxxxxxxxxxxxxxxx";
const VENUE_ID = "cvenuexxxxxxxxxxxxxxxxxxx";
const OTHER_TEAM_ID = "cteamyyyyyyyyyyyyyyyyyyyy";
const SESSION_ID = "csessionxxxxxxxxxxxxxxxxx";
const EVENT_ID = "ceventxxxxxxxxxxxxxxxxxxxx";

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    title: "Tuesday practice",
    date: new Date("2026-04-07T22:00:00.000Z"),
    duration: 60,
    teamId: TEAM_ID,
    plays: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.requireTeamAdmin.mockResolvedValue(USER_ID);
  mockAuth.requireLeagueRole.mockResolvedValue(USER_ID);
  mockTx.teamMember.findFirst.mockResolvedValue({
    id: "cmemberxxxxxxxxxxxxxxxxxxx",
  });
  mockTx.leagueUser.findFirst.mockResolvedValue({
    id: "cleagueuserxxxxxxxxxxxxxxx",
  });
  mockTx.venueReservation.findUnique.mockResolvedValue({
    id: RESERVATION_ID,
    status: "CONFIRMED",
    venueId: VENUE_ID,
    startsAt: new Date("2026-04-07T22:00:00.000Z"),
    endsAt: new Date("2026-04-07T23:00:00.000Z"),
    ownerTeamId: TEAM_ID,
    ownerLeagueId: null,
    ownerVenueOrganizationId: null,
  });
  mockTx.practiceSession.create.mockResolvedValue({
    id: SESSION_ID,
    title: "Tuesday practice",
    date: new Date("2026-04-07T22:00:00.000Z"),
  });
  mockTx.practiceSession.findUnique.mockResolvedValue({
    id: SESSION_ID,
    teamId: TEAM_ID,
    isShared: false,
    venueReservationId: RESERVATION_ID,
  });
  mockTx.practiceSession.update.mockResolvedValue({
    id: SESSION_ID,
    title: "Tuesday practice",
    date: new Date("2026-04-07T22:00:00.000Z"),
  });
  mockTx.event.create.mockResolvedValue({ id: EVENT_ID });
  mockTx.event.findUnique.mockResolvedValue({ id: EVENT_ID });
  mockTx.event.update.mockResolvedValue({ id: EVENT_ID });
  mockTx.team.findUnique.mockResolvedValue({ leagueId: null });
  mockTx.teamMember.findMany.mockResolvedValue([
    { userId: "cmember1xxxxxxxxxxxxxxxxxx" },
    { userId: "cmember2xxxxxxxxxxxxxxxxxx" },
  ]);
  mockTx.venue.findUnique.mockResolvedValue({
    name: "Test Rink",
    timezone: "America/New_York",
  });
  serviceAssignVenueReservation.mockResolvedValue({ ok: true });
  serviceCreateVenueReservation.mockResolvedValue({ id: RESERVATION_ID, status: "CONFIRMED" });
});

describe("createPracticeSession authorization (already enforced today)", () => {
  it("rejects a non-admin team member", async () => {
    mockAuth.requireTeamAdmin.mockRejectedValue(new Error("Unauthorized: Only team admins can create practice sessions"));

    const result = await createPracticeSession(baseInput());

    expect(result.success).toBe(false);
    expect(mockTx.practiceSession.create).not.toHaveBeenCalled();
  });
});

describe("createPracticeSession reservation linkage (T020 / T032 intended contract)", () => {
  it("links the created PracticeSession to the referenced confirmed reservation", async () => {
    const result = await createPracticeSession(baseInput({ reservationId: RESERVATION_ID }));

    expect(result.success).toBe(true);
    expect(serviceAssignVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reservationId: RESERVATION_ID,
        targetType: "PRACTICE",
        targetId: SESSION_ID,
      }),
    );
  });

  it("atomically creates a participant-facing Event linked to the same reservation (linked alias)", async () => {
    await createPracticeSession(baseInput({ reservationId: RESERVATION_ID }));

    expect(mockTx.event.create).toHaveBeenCalled();
    expect(serviceAssignVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reservationId: RESERVATION_ID,
        targetType: "EVENT",
        targetId: EVENT_ID,
      }),
    );
    // Both PracticeSession and Event creation, plus both assignments, happen
    // inside the one committing transaction.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("keeps a league-owned practice participant Event scoped to the exact team", async () => {
    const leagueId = "cleaguexxxxxxxxxxxxxxxxxx";
    mockTx.team.findUnique.mockResolvedValue({ leagueId });
    mockTx.venueReservation.findUnique.mockResolvedValue({
      id: RESERVATION_ID,
      status: "CONFIRMED",
      venueId: VENUE_ID,
      startsAt: new Date("2026-04-07T22:00:00.000Z"),
      endsAt: new Date("2026-04-07T23:00:00.000Z"),
      ownerTeamId: null,
      ownerLeagueId: leagueId,
      ownerVenueOrganizationId: null,
    });

    const result = await createPracticeSession(
      baseInput({ reservationId: RESERVATION_ID }),
    );

    expect(result.success).toBe(true);
    expect(mockTx.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          teamId: TEAM_ID,
          leagueId: null,
        }),
      }),
    );
  });

  it("fans out RSVPs to the full active roster once the participant-facing Event exists", async () => {
    await createPracticeSession(baseInput({ reservationId: RESERVATION_ID }));

    expect(mockTx.rSVP.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ eventId: EVENT_ID, userId: "cmember1xxxxxxxxxxxxxxxxxx" }),
          expect.objectContaining({ eventId: EVENT_ID, userId: "cmember2xxxxxxxxxxxxxxxxxx" }),
        ]),
      }),
    );
  });

  it("rejects a reservation that belongs to a different team (cross-tenant)", async () => {
    mockTx.venueReservation.findUnique.mockResolvedValue({
      id: RESERVATION_ID,
      status: "CONFIRMED",
      venueId: VENUE_ID,
      startsAt: new Date("2026-04-07T22:00:00.000Z"),
      endsAt: new Date("2026-04-07T23:00:00.000Z"),
      ownerTeamId: OTHER_TEAM_ID,
      ownerLeagueId: null,
      ownerVenueOrganizationId: null,
    });

    const result = await createPracticeSession(baseInput({ reservationId: RESERVATION_ID, teamId: TEAM_ID }));

    expect(result.success).toBe(false);
    expect(serviceAssignVenueReservation).not.toHaveBeenCalled();
  });

  it("permits a league admin to assign same-league inventory when exact team admin auth is unavailable", async () => {
    const leagueId = "cleaguexxxxxxxxxxxxxxxxxx";
    mockAuth.requireTeamAdmin.mockRejectedValue(new Error("Unauthorized"));
    mockTx.team.findUnique.mockResolvedValue({ leagueId });
    mockTx.venueReservation.findUnique.mockResolvedValue({
      id: RESERVATION_ID,
      status: "CONFIRMED",
      venueId: VENUE_ID,
      startsAt: new Date("2026-04-07T22:00:00.000Z"),
      endsAt: new Date("2026-04-07T23:00:00.000Z"),
      ownerTeamId: null,
      ownerLeagueId: leagueId,
      ownerVenueOrganizationId: null,
    });

    const result = await createPracticeSession(
      baseInput({ reservationId: RESERVATION_ID }),
    );

    expect(result.success).toBe(true);
    expect(mockAuth.requireLeagueRole).toHaveBeenCalledWith(
      leagueId,
      "LEAGUE_ADMIN",
    );
  });

  it("rejects when the referenced reservation's interval does not match the practice's date/duration", async () => {
    mockTx.venueReservation.findUnique.mockResolvedValue({
      id: RESERVATION_ID,
      status: "CONFIRMED",
      venueId: VENUE_ID,
      startsAt: new Date("2026-04-07T18:00:00.000Z"),
      endsAt: new Date("2026-04-07T19:00:00.000Z"),
      ownerTeamId: TEAM_ID,
      ownerLeagueId: null,
      ownerVenueOrganizationId: null,
    });

    const result = await createPracticeSession(baseInput({ reservationId: RESERVATION_ID }));

    expect(result.success).toBe(false);
  });

  it("creates a new reservation via the shared service (with an override reason) when no reservationId is given but a conflicting slot is explicitly overridden", async () => {
    const result = await createPracticeSession(
      baseInput({
        venueId: VENUE_ID,
        surfaceId: "csurfacexxxxxxxxxxxxxxxxx",
        startAt: new Date("2026-04-07T22:00:00.000Z"),
        overrideConflicts: true,
        overrideReason: "Ice reallocated by the association scheduler",
      }),
    );

    expect(result.success).toBe(true);
    expect(serviceCreateVenueReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ overrideReason: "Ice reallocated by the association scheduler" }),
    );
  });
});

describe("updatePracticeSession reservation idempotency", () => {
  it("updates the one linked Event and deduplicates RSVP fanout", async () => {
    const input = {
      id: SESSION_ID,
      ...baseInput({ reservationId: RESERVATION_ID }),
    };

    const first = await updatePracticeSession(input);
    const second = await updatePracticeSession(input);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(mockTx.event.create).not.toHaveBeenCalled();
    expect(mockTx.event.update).toHaveBeenCalledTimes(2);
    expect(mockTx.rSVP.createMany).toHaveBeenCalledTimes(2);
    expect(mockTx.rSVP.createMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(serviceAssignVenueReservation).not.toHaveBeenCalled();
  });

  it("allows an exact team admin to retain an unchanged league reservation without league authority", async () => {
    const leagueId = "cleaguexxxxxxxxxxxxxxxxxx";
    mockTx.team.findUnique.mockResolvedValue({ leagueId });
    mockTx.venueReservation.findUnique.mockResolvedValue({
      id: RESERVATION_ID,
      status: "CONFIRMED",
      venueId: VENUE_ID,
      startsAt: new Date("2026-04-07T22:00:00.000Z"),
      endsAt: new Date("2026-04-07T23:00:00.000Z"),
      ownerTeamId: null,
      ownerLeagueId: leagueId,
      ownerVenueOrganizationId: null,
    });
    mockAuth.requireLeagueRole.mockRejectedValue(
      new Error("Unauthorized: LEAGUE_ADMIN role required"),
    );

    const result = await updatePracticeSession({
      id: SESSION_ID,
      ...baseInput({ reservationId: RESERVATION_ID, title: "Updated title" }),
    });

    expect(result.success).toBe(true);
    expect(mockAuth.requireLeagueRole).not.toHaveBeenCalled();
    expect(serviceAssignVenueReservation).not.toHaveBeenCalled();
    expect(mockTx.event.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          teamId: TEAM_ID,
          leagueId: null,
        }),
      }),
    );
  });

  it("rejects an unchanged update if the reservation relation changes before the transaction recheck", async () => {
    mockTx.practiceSession.findUnique
      .mockResolvedValueOnce({
        id: SESSION_ID,
        teamId: TEAM_ID,
        isShared: false,
        venueReservationId: RESERVATION_ID,
      })
      .mockResolvedValueOnce({
        id: SESSION_ID,
        teamId: TEAM_ID,
        venueReservationId: "cresyyyyyyyyyyyyyyyyyyyyy",
      });

    const result = await updatePracticeSession({
      id: SESSION_ID,
      ...baseInput({ reservationId: RESERVATION_ID }),
    });

    expect(result.success).toBe(false);
    expect(mockTx.practiceSession.update).not.toHaveBeenCalled();
  });

  it("does not let a team admin detach league-owned inventory without league authority", async () => {
    const leagueId = "cleaguexxxxxxxxxxxxxxxxxx";
    mockTx.team.findUnique.mockResolvedValue({ leagueId });
    mockTx.venueReservation.findUnique.mockResolvedValue({
      id: RESERVATION_ID,
      status: "CONFIRMED",
      venueId: VENUE_ID,
      startsAt: new Date("2026-04-07T22:00:00.000Z"),
      endsAt: new Date("2026-04-07T23:00:00.000Z"),
      ownerTeamId: null,
      ownerLeagueId: leagueId,
      ownerVenueOrganizationId: null,
    });
    mockAuth.requireLeagueRole.mockRejectedValue(
      new Error("Unauthorized: LEAGUE_ADMIN role required"),
    );

    const result = await updatePracticeSession({
      id: SESSION_ID,
      ...baseInput({ reservationId: null }),
    });

    expect(result.success).toBe(false);
    expect(mockTx.practiceSession.update).not.toHaveBeenCalled();
  });
});

describe("deletePracticeSession coordinated cleanup", () => {
  it("deletes the participant Event/RSVP alias and returns the reservation to inventory", async () => {
    mockTx.event.findUnique.mockResolvedValue({
      id: EVENT_ID,
      type: "PRACTICE",
      teamId: TEAM_ID,
    });
    mockTx.event.delete.mockResolvedValue({ id: EVENT_ID });
    mockTx.practiceSession.delete.mockResolvedValue({ id: SESSION_ID });

    const result = await deletePracticeSession({
      id: SESSION_ID,
      teamId: TEAM_ID,
    });

    expect(result.success).toBe(true);
    expect(mockTx.event.delete).toHaveBeenCalledWith({
      where: { id: EVENT_ID },
    });
    expect(mockTx.practiceSession.delete).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
    });
    expect(mockTx.venueReservation.findUnique).toHaveBeenCalled();
  });
});
