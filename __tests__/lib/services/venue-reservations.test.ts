import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  assignVenueReservation,
  assertGenericRescheduleAllowed,
  createVenueReservation,
  VenueReservationConflictError,
  transitionVenueReservation,
} from "@/lib/services/venue-reservations";

const startsAt = new Date("2026-09-01T18:00:00.000Z");
const endsAt = new Date("2026-09-01T19:00:00.000Z");
const venueReservationId = "cssssssssssssssssssssssss";

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    id: venueReservationId,
    status: "CONFIRMED",
    startsAt,
    endsAt,
    timezone: "America/New_York",
    venueId: "venue-1",
    surfaceId: "surface-1",
    segmentId: "segment-1",
    ownerLeagueId: "league-1",
    ownerTeamId: null,
    ownerVenueOrganizationId: null,
    sourceRequestId: null,
    offeringBlockId: null,
    venue: { organizationId: "venue-org-1" },
    events: [],
    seasonGames: [],
    eventGames: [],
    signupEvents: [],
    practiceSessions: [],
    proposalEntries: [],
    ...overrides,
  };
}

function makeTx() {
  return {
    venue: {
      findUnique: vi.fn().mockResolvedValue({
        id: "venue-1",
        isActive: true,
        organizationId: "venue-org-1",
        leagueId: "league-1",
        teamId: null,
        timezone: "America/New_York",
      }),
    },
    iceSurface: {
      findFirst: vi.fn().mockResolvedValue({ id: "surface-1" }),
    },
    surfaceSegment: {
      findFirst: vi.fn().mockResolvedValue({ id: "segment-1" }),
    },
    league: { findUnique: vi.fn().mockResolvedValue({ id: "league-1" }) },
    team: {
      findUnique: vi.fn().mockResolvedValue({ leagueId: "league-1" }),
    },
    venueOrganization: {
      findUnique: vi.fn().mockResolvedValue({ id: "venue-org-1" }),
    },
    venueRelationship: { findFirst: vi.fn().mockResolvedValue(null) },
    venueStaff: { findFirst: vi.fn().mockResolvedValue(null) },
    leagueUser: {
      findFirst: vi.fn().mockResolvedValue({ id: "league-user-1" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    teamMember: {
      findFirst: vi.fn().mockResolvedValue({ id: "team-member-1" }),
    },
    venueScheduleBlock: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    iceTimeRequest: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    venueReservation: {
      findUnique: vi.fn().mockResolvedValue(reservation()),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: venueReservationId }),
      update: vi.fn().mockResolvedValue({ id: venueReservationId }),
    },
    segmentCoexistence: { findMany: vi.fn().mockResolvedValue([]) },
    event: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({ id: "event-1" }),
    },
    seasonGame: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({ id: "season-game-1" }),
    },
    practiceSession: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({ id: "practice-1" }),
    },
    signupEvent: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({ id: "signup-event-1" }),
    },
    eventGame: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({ id: "event-game-1" }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
    notificationOutbox: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  } as unknown as Prisma.TransactionClient;
}

function createInput(
  overrides: Partial<Parameters<typeof createVenueReservation>[1]> = {},
) {
  return {
    venueId: "venue-1",
    surfaceId: "surface-1",
    segmentId: "segment-1",
    startsAt,
    endsAt,
    timezone: "America/New_York",
    ownerLeagueId: "league-1",
    actorId: "actor-1",
    ...overrides,
  };
}

it("rejects a reservation timezone that differs from the venue timezone", async () => {
  const tx = makeTx();

  await expect(
    createVenueReservation(tx, createInput({ timezone: "America/Chicago" })),
  ).rejects.toThrow("timezone must match the venue timezone");
  expect(tx.venueReservation.create).not.toHaveBeenCalled();
});

type TargetType = Parameters<typeof assignVenueReservation>[1]["targetType"];

function setAssignmentTarget(
  tx: Prisma.TransactionClient,
  targetType: TargetType,
  leagueId = "league-1",
  venueReservationId: string | null = null,
) {
  switch (targetType) {
    case "EVENT":
      vi.mocked(tx.event.findUnique).mockResolvedValue({
        id: "event-1",
        venueId: "venue-1",
        venueReservationId,
        startAt: startsAt,
        endAt: endsAt,
        type: "GAME",
        teamId: "team-1",
        homeTeamId: "team-1",
        awayTeamId: "team-2",
        leagueId,
        team: { leagueId },
        seasonGame: null,
      } as never);
      return "event-1";
    case "SEASON_GAME":
      vi.mocked(tx.seasonGame.findUnique).mockResolvedValue({
        id: "season-game-1",
        venueId: "venue-1",
        surfaceId: "surface-1",
        segmentId: "segment-1",
        venueReservationId,
        startAt: startsAt,
        endAt: endsAt,
        homeTeamId: "team-1",
        awayTeamId: "team-2",
        eventId: null,
        season: { leagueId, teamId: null },
        homeTeam: { leagueId },
        awayTeam: { leagueId },
      } as never);
      return "season-game-1";
    case "PRACTICE":
      vi.mocked(tx.practiceSession.findUnique).mockResolvedValue({
        id: "practice-1",
        venueId: "venue-1",
        surfaceId: "surface-1",
        segmentId: "segment-1",
        venueReservationId,
        startAt: startsAt,
        duration: 60,
        teamId: "team-1",
        team: { leagueId },
      } as never);
      return "practice-1";
    case "SIGNUP_EVENT":
      vi.mocked(tx.signupEvent.findUnique).mockResolvedValue({
        id: "signup-event-1",
        venueId: "venue-1",
        venueReservationId,
        startAt: startsAt,
        endAt: endsAt,
        hostOrganizationId: null,
        hostLeagueId: leagueId,
        hostTeamId: null,
        hostTeam: null,
        surfaces: [{ id: "surface-1" }],
      } as never);
      return "signup-event-1";
    case "EVENT_GAME":
      vi.mocked(tx.eventGame.findUnique).mockResolvedValue({
        id: "event-game-1",
        venueReservationId,
        startAt: startsAt,
        endAt: endsAt,
        surfaceId: "surface-1",
        segmentId: "segment-1",
        eventId: "signup-event-1",
        event: {
          id: "signup-event-1",
          venueId: "venue-1",
          hostOrganizationId: null,
          hostLeagueId: leagueId,
          hostTeamId: null,
          hostTeam: null,
        },
      } as never);
      return "event-game-1";
  }
}

describe("createVenueReservation validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["venue", (tx: Prisma.TransactionClient) =>
      vi.mocked(tx.venue.findUnique).mockResolvedValue({
        id: "venue-1",
        isActive: false,
        organizationId: "venue-org-1",
        leagueId: "league-1",
        teamId: null,
      } as never)],
    ["surface", (tx: Prisma.TransactionClient) =>
      vi.mocked(tx.iceSurface.findFirst).mockResolvedValue(null)],
    ["segment", (tx: Prisma.TransactionClient) =>
      vi.mocked(tx.surfaceSegment.findFirst).mockResolvedValue(null)],
  ])("rejects an inactive or missing %s before writing", async (_name, arrange) => {
    const tx = makeTx();
    arrange(tx);

    await expect(createVenueReservation(tx, createInput())).rejects.toThrow();
    expect(tx.venueReservation.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("requires an existing exact owner and active venue relationship", async () => {
    const tx = makeTx();
    vi.mocked(tx.venue.findUnique).mockResolvedValue({
      id: "venue-1",
      isActive: true,
      organizationId: "venue-org-1",
      leagueId: null,
      teamId: null,
      timezone: "America/New_York",
    } as never);

    await expect(createVenueReservation(tx, createInput())).rejects.toThrow(
      "not eligible",
    );
    expect(tx.venueRelationship.findFirst).toHaveBeenCalledWith({
      where: {
        venueId: "venue-1",
        status: "ACTIVE",
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
        targetType: "LEAGUE",
        leagueId: "league-1",
        teamId: null,
      },
      select: { id: true },
    });

    vi.mocked(tx.league.findUnique).mockResolvedValue(null);
    await expect(createVenueReservation(tx, createInput())).rejects.toThrow(
      "owner league",
    );
    expect(tx.venueReservation.create).not.toHaveBeenCalled();
  });

  it.each([
    [
      "team",
      {
        ownerLeagueId: undefined,
        ownerTeamId: "team-1",
      },
      {
        organizationId: null,
        leagueId: null,
        teamId: "team-1",
      },
    ],
    [
      "venue organization",
      {
        ownerLeagueId: undefined,
        ownerVenueOrganizationId: "venue-org-1",
      },
      {
        organizationId: "venue-org-1",
        leagueId: null,
        teamId: null,
      },
    ],
  ])("validates exact %s owner ancestry and authorization", async (
    _name,
    owner,
    venueOwner,
  ) => {
    const tx = makeTx();
    vi.mocked(tx.venue.findUnique).mockResolvedValue({
      id: "venue-1",
      isActive: true,
      timezone: "America/New_York",
      ...venueOwner,
    } as never);
    vi.mocked(tx.venueStaff.findFirst).mockResolvedValue({ id: "staff-1" } as never);

    await expect(createVenueReservation(tx, createInput(owner))).resolves.toEqual({
      id: venueReservationId,
    });
    expect(tx.venueReservation.create).toHaveBeenCalledOnce();
  });

  it("accepts only a published offering that contains the exact interval and space", async () => {
    const tx = makeTx();
    vi.mocked(tx.venueScheduleBlock.findFirst).mockResolvedValue({
      id: "offering-1",
      venueId: "venue-1",
      surfaceId: "surface-1",
      segmentId: "other-segment",
      startsAt,
      endsAt,
      recurrenceRule: null,
      recurrenceEndDate: null,
    } as never);

    await expect(createVenueReservation(tx, createInput({
      offeringBlockId: "offering-1",
    }))).rejects.toThrow("offering does not contain");
    expect(tx.venueScheduleBlock.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "offering-1",
          venueId: "venue-1",
          status: "PUBLISHED",
          intent: "OFFERING",
        },
      }),
    );
    expect(tx.venueReservation.create).not.toHaveBeenCalled();
  });

  it("accepts an interval contained by a later recurring offering occurrence", async () => {
    const tx = makeTx();
    const laterStart = new Date(startsAt.getTime() + 7 * 86_400_000);
    const laterEnd = new Date(endsAt.getTime() + 7 * 86_400_000);
    vi.mocked(tx.venueScheduleBlock.findFirst).mockResolvedValue({
      id: "offering-1",
      venueId: "venue-1",
      surfaceId: "surface-1",
      segmentId: null,
      startsAt,
      endsAt,
      recurrenceRule: "FREQ=WEEKLY;COUNT=2",
      recurrenceEndDate: laterStart,
    } as never);

    await expect(createVenueReservation(tx, createInput({
      startsAt: laterStart,
      endsAt: laterEnd,
      offeringBlockId: "offering-1",
    }))).resolves.toMatchObject({ id: venueReservationId });
  });

  it.each([
    ["status", { status: "SUBMITTED" }],
    ["interval", { approvedEndAt: new Date(endsAt.getTime() + 60_000) }],
    ["surface", { approvedSurfaceId: "surface-2" }],
    ["segment", { approvedSegmentId: "segment-2" }],
    ["requester", { requesterLeagueId: "league-2" }],
    ["prior reservation", { venueReservation: { id: "reservation-2" } }],
  ])("rejects a source request with mismatched %s", async (_name, requestChange) => {
    const tx = makeTx();
    vi.mocked(tx.venueStaff.findFirst).mockResolvedValue({ id: "staff-1" } as never);
    vi.mocked(tx.venueScheduleBlock.findFirst).mockResolvedValue({
      id: "offering-1",
      venueId: "venue-1",
      surfaceId: "surface-1",
      segmentId: null,
      startsAt,
      endsAt,
      recurrenceRule: null,
      recurrenceEndDate: null,
    } as never);
    vi.mocked(tx.iceTimeRequest.findUnique).mockResolvedValue({
      status: "ACCEPTED",
      venueId: "venue-1",
      scheduleBlockId: "offering-1",
      approvedStartAt: startsAt,
      approvedEndAt: endsAt,
      approvedSurfaceId: "surface-1",
      approvedSegmentId: "segment-1",
      requesterTeamId: null,
      requesterLeagueId: "league-1",
      requestedStartAt: startsAt,
      requestedEndAt: endsAt,
      venueReservation: null,
      ...requestChange,
    } as never);

    await expect(createVenueReservation(tx, createInput({
      sourceRequestId: "request-1",
      offeringBlockId: "offering-1",
    }))).rejects.toThrow("source request does not match");
    expect(tx.venueReservation.create).not.toHaveBeenCalled();
  });

  it("creates only after an accepted matching request is fully validated", async () => {
    const tx = makeTx();
    vi.mocked(tx.venueStaff.findFirst).mockResolvedValue({ id: "staff-1" } as never);
    vi.mocked(tx.venueScheduleBlock.findFirst).mockResolvedValue({
      id: "offering-1",
      venueId: "venue-1",
      surfaceId: "surface-1",
      segmentId: null,
      startsAt,
      endsAt,
      recurrenceRule: null,
      recurrenceEndDate: null,
    } as never);
    vi.mocked(tx.iceTimeRequest.findUnique).mockResolvedValue({
      status: "PARTIALLY_ACCEPTED",
      venueId: "venue-1",
      scheduleBlockId: "offering-1",
      approvedStartAt: startsAt,
      approvedEndAt: endsAt,
      approvedSurfaceId: "surface-1",
      approvedSegmentId: "segment-1",
      requesterTeamId: null,
      requesterLeagueId: "league-1",
      requestedStartAt: startsAt,
      requestedEndAt: endsAt,
      venueReservation: null,
    } as never);

    await expect(createVenueReservation(tx, createInput({
      sourceRequestId: "request-1",
      offeringBlockId: "offering-1",
    }))).resolves.toMatchObject({ id: venueReservationId });
    expect(tx.iceTimeRequest.findUnique).toHaveBeenCalledBefore(
      vi.mocked(tx.venueReservation.create),
    );
  });

  it("creates a public-request reservation only for the venue's organization", async () => {
    const tx = makeTx();
    vi.mocked(tx.venueStaff.findFirst).mockResolvedValue({ id: "staff-1" } as never);
    vi.mocked(tx.venueScheduleBlock.findFirst).mockResolvedValue({
      id: "offering-1",
      venueId: "venue-1",
      surfaceId: "surface-1",
      segmentId: null,
      startsAt,
      endsAt,
      recurrenceRule: null,
      recurrenceEndDate: null,
    } as never);
    vi.mocked(tx.iceTimeRequest.findUnique).mockResolvedValue({
      status: "ACCEPTED",
      venueId: "venue-1",
      scheduleBlockId: "offering-1",
      approvedStartAt: startsAt,
      approvedEndAt: endsAt,
      approvedSurfaceId: "surface-1",
      approvedSegmentId: "segment-1",
      requesterTeamId: null,
      requesterLeagueId: null,
      requestedStartAt: startsAt,
      requestedEndAt: endsAt,
      venueReservation: null,
    } as never);

    await expect(createVenueReservation(tx, createInput({
      ownerLeagueId: undefined,
      ownerVenueOrganizationId: "venue-org-1",
      sourceRequestId: "request-1",
      offeringBlockId: "offering-1",
    }))).resolves.toMatchObject({ id: venueReservationId });
    expect(tx.venueReservation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerLeagueId: null,
          ownerTeamId: null,
          ownerVenueOrganizationId: "venue-org-1",
          sourceRequestId: "request-1",
        }),
      }),
    );
  });

  it("requires exact active venue request staff for a source request", async () => {
    const tx = makeTx();

    await expect(createVenueReservation(tx, createInput({
      sourceRequestId: "request-1",
      offeringBlockId: "offering-1",
    }))).rejects.toThrow("actor is not authorized");
    expect(tx.venueStaff.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "actor-1",
        organizationId: "venue-org-1",
        status: "ACTIVE",
        role: { in: ["OWNER", "MANAGER", "REQUEST_MANAGER"] },
        OR: [{ venueId: null }, { venueId: "venue-1" }],
      },
      select: { id: true },
    });
    expect(tx.venueReservation.create).not.toHaveBeenCalled();
  });

  it("requires a reason and exact venue-manager authority for venue-wide claims", async () => {
    const tx = makeTx();

    await expect(createVenueReservation(tx, createInput({
      surfaceId: null,
      segmentId: null,
    }))).rejects.toThrow("require a reason");

    await expect(createVenueReservation(tx, createInput({
      surfaceId: null,
      segmentId: null,
      venueWideReason: "Private venue event",
    }))).rejects.toThrow("venue-manager authorization");
    expect(tx.venueReservation.create).not.toHaveBeenCalled();
  });

  it("requires exact venue-manager authority for a reasoned conflict override", async () => {
    const tx = makeTx();
    vi.mocked(tx.venueReservation.findMany).mockResolvedValue([{
      ...reservation(),
      id: "reservation-2",
    }] as never);

    await expect(createVenueReservation(tx, createInput({
      overrideConflicts: true,
      overrideReason: "Approved overlap",
    }))).rejects.toThrow("venue-manager authorization");

    vi.mocked(tx.venueStaff.findFirst).mockResolvedValue({ id: "staff-1" } as never);
    await expect(createVenueReservation(tx, createInput({
      overrideConflicts: true,
      overrideReason: "Approved overlap",
    }))).resolves.toMatchObject({ id: venueReservationId });
    expect(tx.venueReservation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          overrides: {
            create: expect.objectContaining({
              reason: "Approved overlap",
              conflictingReservationIds: ["reservation-2"],
            }),
          },
        }),
      }),
    );
  });

  it("does not let a venue-wide justification override a conflict", async () => {
    const tx = makeTx();
    vi.mocked(tx.venueStaff.findFirst).mockResolvedValue({ id: "staff-1" } as never);
    vi.mocked(tx.venueReservation.findMany).mockResolvedValue([{
      ...reservation(),
      id: "reservation-2",
    }] as never);

    await expect(createVenueReservation(tx, createInput({
      ownerLeagueId: undefined,
      ownerVenueOrganizationId: "venue-org-1",
      surfaceId: null,
      segmentId: null,
      venueWideReason: "Private venue event",
    }))).rejects.toBeInstanceOf(VenueReservationConflictError);
  });
});

describe("assignVenueReservation validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each<TargetType>([
    "EVENT",
    "SEASON_GAME",
    "PRACTICE",
    "SIGNUP_EVENT",
    "EVENT_GAME",
  ])("assigns a valid %s target", async (targetType) => {
    const tx = makeTx();
    const targetId = setAssignmentTarget(tx, targetType);

    await expect(assignVenueReservation(tx, {
      reservationId: "reservation-1",
      targetType,
      targetId,
      actorId: "actor-1",
    })).resolves.toMatchObject({ id: venueReservationId });

    const delegate = {
      EVENT: tx.event,
      SEASON_GAME: tx.seasonGame,
      PRACTICE: tx.practiceSession,
      SIGNUP_EVENT: tx.signupEvent,
      EVENT_GAME: tx.eventGame,
    }[targetType];
    expect(delegate.update).toHaveBeenCalledWith({
      where: { id: targetId },
      data: { venueReservationId },
    });
  });

  it("allows league authority to assign league-owned inventory to a team in that league", async () => {
    const tx = makeTx();
    const targetId = setAssignmentTarget(tx, "PRACTICE");
    vi.mocked(tx.teamMember.findFirst).mockResolvedValue(null);

    await expect(assignVenueReservation(tx, {
      reservationId: "reservation-1",
      targetType: "PRACTICE",
      targetId,
      actorId: "actor-1",
    })).resolves.toMatchObject({ id: venueReservationId });

    expect(tx.leagueUser.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "actor-1",
        leagueId: "league-1",
        role: "LEAGUE_ADMIN",
      },
      select: { id: true },
    });
    expect(tx.teamMember.findFirst).not.toHaveBeenCalled();
    expect(tx.practiceSession.update).toHaveBeenCalledOnce();
  });

  it("keeps team-owned inventory restricted to exact team authority", async () => {
    const tx = makeTx();
    vi.mocked(tx.venueReservation.findUnique).mockResolvedValue(reservation({
      ownerLeagueId: null,
      ownerTeamId: "team-1",
    }) as never);
    const targetId = setAssignmentTarget(tx, "PRACTICE");
    vi.mocked(tx.teamMember.findFirst).mockResolvedValue(null);

    await expect(assignVenueReservation(tx, {
      reservationId: "reservation-1",
      targetType: "PRACTICE",
      targetId,
      actorId: "actor-1",
    })).rejects.toThrow("reservation owner");

    expect(tx.teamMember.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "actor-1",
        teamId: "team-1",
        role: "ADMIN",
      },
      select: { id: true },
    });
    expect(tx.practiceSession.update).not.toHaveBeenCalled();
  });

  it("prevents assigning public-request venue inventory to team activities", async () => {
    const tx = makeTx();
    vi.mocked(tx.venueReservation.findUnique).mockResolvedValue(reservation({
      ownerLeagueId: null,
      ownerVenueOrganizationId: "venue-org-1",
      sourceRequestId: "request-1",
    }) as never);
    const targetId = setAssignmentTarget(tx, "PRACTICE");

    await expect(assignVenueReservation(tx, {
      reservationId: "reservation-1",
      targetType: "PRACTICE",
      targetId,
      actorId: "actor-1",
    })).rejects.toThrow("cannot be assigned to association or team activities");
    expect(tx.practiceSession.update).not.toHaveBeenCalled();
  });

  describe("request-backed rescheduling", () => {
    it("rejects generic rescheduling without mutating request lineage", () => {
      const requestBacked = { sourceRequestId: "request-1" };
      expect(() => assertGenericRescheduleAllowed(requestBacked)).toThrow(
        "cancel or amend the approved request",
      );
      expect(requestBacked.sourceRequestId).toBe("request-1");
    });
  });

  it.each<TargetType>([
    "EVENT",
    "SEASON_GAME",
    "PRACTICE",
    "SIGNUP_EVENT",
    "EVENT_GAME",
  ])("rejects a cross-tenant %s target without an override path", async (targetType) => {
    const tx = makeTx();
    const targetId = setAssignmentTarget(tx, targetType, "league-2");

    await expect(assignVenueReservation(tx, {
      reservationId: "reservation-1",
      targetType,
      targetId,
      actorId: "actor-1",
    })).rejects.toThrow("outside the reservation owner's scope");
    expect(tx.venueReservation.update).not.toHaveBeenCalled();
  });

  it("rejects a target already linked to another reservation", async () => {
    const tx = makeTx();
    const targetId = setAssignmentTarget(
      tx,
      "PRACTICE",
      "league-1",
      "reservation-2",
    );

    await expect(assignVenueReservation(tx, {
      reservationId: "reservation-1",
      targetType: "PRACTICE",
      targetId,
      actorId: "actor-1",
    })).rejects.toThrow("linked to another");
    expect(tx.practiceSession.update).not.toHaveBeenCalled();
  });

  it("reloads and authorizes an idempotent target before returning", async () => {
    const tx = makeTx();
    vi.mocked(tx.venueReservation.findUnique).mockResolvedValue(reservation({
      practiceSessions: [{ id: "practice-1", teamId: "team-1" }],
    }) as never);
    const targetId = setAssignmentTarget(
      tx,
      "PRACTICE",
      "league-1",
      venueReservationId,
    );
    vi.mocked(tx.leagueUser.findFirst).mockResolvedValue(null);

    await expect(assignVenueReservation(tx, {
      reservationId: "reservation-1",
      targetType: "PRACTICE",
      targetId,
      actorId: "actor-1",
    })).rejects.toThrow("reservation owner");
    expect(tx.practiceSession.findUnique).toHaveBeenCalled();
    expect(tx.leagueUser.findFirst).toHaveBeenCalled();
    expect(tx.practiceSession.update).not.toHaveBeenCalled();
  });

  it("rechecks conflicts for an already-linked target", async () => {
    const tx = makeTx();
    vi.mocked(tx.venueReservation.findUnique).mockResolvedValue(reservation({
      practiceSessions: [{ id: "practice-1", teamId: "team-1" }],
    }) as never);
    vi.mocked(tx.venueReservation.findMany).mockResolvedValue([
      reservation({ id: "reservation-2" }),
    ] as never);
    const targetId = setAssignmentTarget(tx, "PRACTICE", "league-1", venueReservationId);

    await expect(assignVenueReservation(tx, {
      reservationId: "reservation-1",
      targetType: "PRACTICE",
      targetId,
      actorId: "actor-1",
    })).rejects.toBeInstanceOf(VenueReservationConflictError);
    expect(tx.practiceSession.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("preserves explicit reservation exclusions during assignment rechecks", async () => {
    const tx = makeTx();
    const targetId = setAssignmentTarget(tx, "PRACTICE", "league-1", null);
    const parentReservationId = "parent-reservation-1";

    await assignVenueReservation(tx, {
      reservationId: "reservation-1",
      targetType: "PRACTICE",
      targetId,
      actorId: "actor-1",
      excludeReservationIds: [parentReservationId],
    });

    expect(tx.venueReservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { notIn: [venueReservationId, parentReservationId] },
        }),
      }),
    );
  });

  it("records the actor, reason, and conflict snapshot for an idempotent override", async () => {
    const tx = makeTx();
    vi.mocked(tx.venueReservation.findUnique).mockResolvedValue(reservation({
      practiceSessions: [{ id: "practice-1", teamId: "team-1" }],
    }) as never);
    vi.mocked(tx.venueReservation.findMany).mockResolvedValue([
      reservation({ id: "reservation-2" }),
    ] as never);
    vi.mocked(tx.venueStaff.findFirst).mockResolvedValue({ id: "staff-1" } as never);
    const targetId = setAssignmentTarget(tx, "PRACTICE", "league-1", venueReservationId);

    await assignVenueReservation(tx, {
      reservationId: "reservation-1",
      targetType: "PRACTICE",
      targetId,
      actorId: "actor-1",
      overrideConflicts: true,
      overrideReason: "Tournament director approved the overlap",
    });

    expect(tx.venueReservation.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        assignedById: "actor-1",
        overrides: {
          create: expect.objectContaining({
            actorId: "actor-1",
            reason: "Tournament director approved the overlap",
            conflictingReservationIds: ["reservation-2"],
          }),
        },
      }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "VENUE_RESERVATION_ASSIGNED",
        userId: "actor-1",
        details: expect.objectContaining({
          targetType: "PRACTICE",
          targetId,
          conflictOverrideCount: 1,
        }),
      }),
    }));
  });

  it("uses canonical reservation space for surface Events and segmented SignupEvents", async () => {
    const eventTx = makeTx();
    setAssignmentTarget(eventTx, "EVENT");
    await expect(assignVenueReservation(eventTx, {
      reservationId: "reservation-1",
      targetType: "EVENT",
      targetId: "event-1",
      actorId: "actor-1",
    })).resolves.toMatchObject({ id: venueReservationId });

    const signupTx = makeTx();
    setAssignmentTarget(signupTx, "SIGNUP_EVENT");
    await expect(assignVenueReservation(signupTx, {
      reservationId: "reservation-1",
      targetType: "SIGNUP_EVENT",
      targetId: "signup-event-1",
      actorId: "actor-1",
    })).resolves.toMatchObject({ id: venueReservationId });
  });

  it("allows an explicitly matched Practice/Event alias to share one reservation", async () => {
    const tx = makeTx();
    vi.mocked(tx.venueReservation.findUnique).mockResolvedValue(reservation({
      events: [{
        id: "event-1",
        teamId: "team-1",
        type: "PRACTICE",
        venueId: "venue-1",
        startAt: startsAt,
        endAt: endsAt,
      }],
    }) as never);
    setAssignmentTarget(tx, "PRACTICE");

    await expect(assignVenueReservation(tx, {
      reservationId: "reservation-1",
      targetType: "PRACTICE",
      targetId: "practice-1",
      actorId: "actor-1",
    })).resolves.toMatchObject({ id: venueReservationId });
  });
});

describe("transitionVenueReservation authorization", () => {
  it("rejects an actor without exact owner or venue authority", async () => {
    const tx = makeTx();
    vi.mocked(tx.leagueUser.findFirst).mockResolvedValue(null);
    vi.mocked(tx.venueStaff.findFirst).mockResolvedValue(null);

    await expect(transitionVenueReservation(tx, {
      reservationId: "reservation-1",
      nextStatus: "CANCELED",
      actorId: "actor-1",
      reason: "Canceled by organizer",
    })).rejects.toThrow("not authorized to transition");
    expect(tx.venueReservation.update).not.toHaveBeenCalled();
  });

  it("requires exact venue-manager authority for a held confirmation override", async () => {
    const tx = makeTx();
    vi.mocked(tx.venueReservation.findUnique).mockResolvedValue(reservation({
      status: "HELD",
      heldUntil: new Date(Date.now() + 60_000),
    }) as never);
    vi.mocked(tx.venueReservation.findMany).mockResolvedValue([reservation({
      id: "reservation-2",
    })] as never);

    await expect(transitionVenueReservation(tx, {
      reservationId: "reservation-1",
      nextStatus: "CONFIRMED",
      actorId: "actor-1",
      reason: "Approve held inventory",
      overrideConflicts: true,
      overrideReason: "Approved overlap",
    })).rejects.toThrow("venue-manager authorization");

    vi.mocked(tx.venueStaff.findFirst).mockResolvedValue({ id: "staff-1" } as never);
    await expect(transitionVenueReservation(tx, {
      reservationId: "reservation-1",
      nextStatus: "CONFIRMED",
      actorId: "actor-1",
      reason: "Approve held inventory",
      overrideConflicts: true,
      overrideReason: "Approved overlap",
    })).resolves.toMatchObject({ id: venueReservationId });
  });

  it("persists an optional transition snapshot for reschedule bookkeeping", async () => {
    const tx = makeTx();
    const snapshot = {
      kind: "RESCHEDULE",
      priorSourceRequestId: "request-1",
      replacementStartsAt: "2026-09-08T18:00:00.000Z",
      replacementEndsAt: "2026-09-08T19:00:00.000Z",
    } as const;

    await expect(transitionVenueReservation(tx, {
      reservationId: "reservation-1",
      nextStatus: "RELEASED",
      actorId: "actor-1",
      reason: "Moved to a replacement slot",
      snapshot,
    })).resolves.toMatchObject({ id: venueReservationId });

    expect(tx.venueReservation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: venueReservationId },
        data: expect.objectContaining({
          transitions: {
            create: expect.objectContaining({
              reason: "Moved to a replacement slot",
              snapshot,
            }),
          },
        }),
      }),
    );
  });
});
