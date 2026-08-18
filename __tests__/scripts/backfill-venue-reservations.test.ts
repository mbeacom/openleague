import { describe, expect, it, vi } from "vitest";
import {
  backfillVenueReservations,
  buildPreservedOverlapOverride,
  expandFiniteVenueBlockOccurrences,
  resolveLinkedAliasVenueReservationId,
} from "@/scripts/backfill-venue-reservations";
import {
  assessVenueReservationRollback,
  verifyVenueReservationCutover,
} from "@/scripts/verify-venue-reservation-cutover";

function emptyClient() {
  return {
    seasonGame: { findMany: vi.fn().mockResolvedValue([]) },
    event: { findMany: vi.fn().mockResolvedValue([]) },
    eventGame: { findMany: vi.fn().mockResolvedValue([]) },
    practiceSession: { findMany: vi.fn().mockResolvedValue([]) },
    iceTimeRequest: { findMany: vi.fn().mockResolvedValue([]) },
    venueScheduleBlock: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

function verifierEmptyDelegates() {
  return {
    seasonGame: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    event: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    eventGame: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    practiceSession: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    iceTimeRequest: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    signupEvent: { findMany: vi.fn().mockResolvedValue([]) },
    venueScheduleBlock: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

function materializationClient(options: {
  failStandaloneLink?: boolean;
  publicRequest?: boolean;
} = {}) {
  const at = (day: number) => new Date(`2026-09-0${day}T10:00:00Z`);
  const end = (day: number) => new Date(`2026-09-0${day}T11:00:00Z`);
  let state = {
    reservations: [] as Array<Record<string, unknown>>,
    overrides: [] as Array<Record<string, unknown>>,
    links: {
      season: null as string | null,
      seasonEvent: null as string | null,
      practice: null as string | null,
      practiceEvent: null as string | null,
      eventGame: null as string | null,
      signupEvent: null as string | null,
      standaloneEvent: null as string | null,
    },
  };
  let failStandaloneLink = options.failStandaloneLink ?? false;

  const reservationShape = (reservation: Record<string, unknown> | null | undefined) =>
    reservation
      ? {
          id: reservation.id,
          venueId: reservation.venueId,
          surfaceId: reservation.surfaceId,
          segmentId: reservation.segmentId,
          startsAt: reservation.startsAt,
          endsAt: reservation.endsAt,
        }
      : null;
  const linkOnly = (args: { select?: Record<string, unknown> }) =>
    Object.keys(args.select ?? {}).length === 1
    && !!args.select?.venueReservationId;

  const seasonGame = {
    findMany: vi.fn(async () =>
      !state.links.season || !state.links.seasonEvent ? [{ id: "season" }] : []),
    findUnique: vi.fn(async (args: { select?: Record<string, unknown> }) =>
      linkOnly(args)
        ? { venueReservationId: state.links.season }
        : {
            id: "season",
            status: "SCHEDULED",
            startAt: at(1),
            endAt: end(1),
            timezone: "UTC",
            venueId: "venue",
            surfaceId: null,
            segmentId: null,
            venueReservationId: state.links.season,
            eventId: "season-event",
            event: {
              id: "season-event",
              venueId: "venue",
              startAt: at(1),
              endAt: end(1),
              venueReservationId: state.links.seasonEvent,
            },
            season: { leagueId: "league", teamId: null },
            homeTeamId: "home-team",
          }),
    update: vi.fn(async ({ data }: { data: { venueReservationId: string } }) => {
      state.links.season = data.venueReservationId;
    }),
  };
  const event = {
    findMany: vi.fn(async (args: {
      where?: Record<string, unknown>;
      select?: Record<string, unknown>;
    }) => {
      if (args.where?.type === "PRACTICE") {
        return [{
          id: "practice-event",
          venueReservationId: state.links.practiceEvent,
        }];
      }
      return state.links.standaloneEvent ? [] : [{ id: "standalone-event" }];
    }),
    findUnique: vi.fn(async (args: {
      where: { id: string };
      select?: Record<string, unknown>;
    }) => {
      const links = {
        "season-event": state.links.seasonEvent,
        "practice-event": state.links.practiceEvent,
        "standalone-event": state.links.standaloneEvent,
      };
      if (linkOnly(args)) {
        return { venueReservationId: links[args.where.id as keyof typeof links] };
      }
      return {
        id: "standalone-event",
        type: "GAME",
        teamId: "team",
        startAt: at(4),
        endAt: end(4),
        venueId: "venue",
        venueReservationId: state.links.standaloneEvent,
        venue: { timezone: "UTC" },
        seasonGame: null,
      };
    }),
    update: vi.fn(async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { venueReservationId: string };
    }) => {
      if (where.id === "standalone-event" && failStandaloneLink) {
        failStandaloneLink = false;
        throw new Error("injected alias failure");
      }
      if (where.id === "season-event") state.links.seasonEvent = data.venueReservationId;
      if (where.id === "practice-event") state.links.practiceEvent = data.venueReservationId;
      if (where.id === "standalone-event") state.links.standaloneEvent = data.venueReservationId;
    }),
  };
  const practiceSession = {
    findMany: vi.fn(async (args: { where?: Record<string, unknown> }) => {
      if (args.where?.duration !== undefined) return [];
      return state.links.practice ? [] : [{ id: "practice" }];
    }),
    findUnique: vi.fn(async (args: { select?: Record<string, unknown> }) =>
      linkOnly(args)
        ? { venueReservationId: state.links.practice }
        : {
            id: "practice",
            duration: 60,
            teamId: "team",
            venueId: "venue",
            surfaceId: null,
            segmentId: null,
            startAt: at(2),
            venueReservationId: state.links.practice,
            venue: { timezone: "UTC" },
          }),
    update: vi.fn(async ({ data }: { data: { venueReservationId: string } }) => {
      state.links.practice = data.venueReservationId;
    }),
  };
  const eventGame = {
    findMany: vi.fn(async () => state.links.eventGame ? [] : [{ id: "event-game" }]),
    findUnique: vi.fn(async (args: { select?: Record<string, unknown> }) =>
      linkOnly(args)
        ? { venueReservationId: state.links.eventGame }
        : {
            id: "event-game",
            status: "SCHEDULED",
            startAt: at(3),
            endAt: end(3),
            surfaceId: null,
            segmentId: null,
            venueReservationId: state.links.eventGame,
            event: {
              id: "signup-event",
              status: "PUBLISHED",
              startAt: at(3),
              endAt: end(3),
              timezone: "UTC",
              venueId: "venue",
              venueReservationId: state.links.signupEvent,
              hostOrganizationId: null,
              hostLeagueId: "league",
              hostTeamId: null,
              games: [{ id: "event-game" }],
            },
          }),
    update: vi.fn(async ({ data }: { data: { venueReservationId: string } }) => {
      state.links.eventGame = data.venueReservationId;
    }),
  };
  const signupEvent = {
    findUnique: vi.fn(async () => ({
      venueReservationId: state.links.signupEvent,
    })),
    update: vi.fn(async ({ data }: { data: { venueReservationId: string } }) => {
      state.links.signupEvent = data.venueReservationId;
    }),
  };
  const iceTimeRequest = {
    findMany: vi.fn(async () =>
      state.reservations.some((reservation) => reservation.sourceRequestId === "request")
        ? []
        : [{ id: "request" }]),
    findUnique: vi.fn(async () => ({
      id: "request",
      status: "ACCEPTED",
      requestedStartAt: at(4),
      requestedEndAt: end(4),
      approvedStartAt: null,
      approvedEndAt: null,
      approvedSurfaceId: null,
      approvedSegmentId: null,
      requesterTeamId: options.publicRequest ? null : "request-team",
      requesterLeagueId: null,
      venueId: "venue",
      venue: {
        timezone: "UTC",
        organizationId: "venue-organization",
      },
      venueReservation: null,
      scheduleBlockId: "offering",
    })),
  };
  const venueScheduleBlock = {
    findMany: vi.fn(async () => [{
      id: "block",
      startsAt: at(5),
      endsAt: end(5),
      recurrenceRule: "FREQ=DAILY;COUNT=2",
      recurrenceEndDate: null,
      venueId: "venue",
      surfaceId: null,
      segmentId: null,
      venue: { timezone: "UTC" },
      reservationOccurrences: state.reservations
        .filter((reservation) => reservation.sourceScheduleBlockId === "block")
        .map((reservation) => ({
          startsAt: reservation.startsAt,
          endsAt: reservation.endsAt,
          status: reservation.status,
          heldUntil: reservation.heldUntil,
          venueId: reservation.venueId,
          surfaceId: reservation.surfaceId,
          segmentId: reservation.segmentId,
        })),
    }]),
    findUnique: vi.fn(async () => ({
      id: "block",
      status: "PUBLISHED",
      intent: "CLOSURE",
      startsAt: at(5),
      endsAt: end(5),
      recurrenceRule: "FREQ=DAILY;COUNT=2",
      recurrenceEndDate: null,
      venueId: "venue",
      surfaceId: null,
      segmentId: null,
      venue: {
        timezone: "UTC",
        organizationId: "venue-organization",
        leagueId: null,
        teamId: null,
      },
    })),
  };
  const venueReservation = {
    findUnique: vi.fn(async ({ where }: {
      where: {
        id?: string;
        sourceRequestId?: string;
        sourceScheduleBlockId_startsAt?: {
          sourceScheduleBlockId: string;
          startsAt: Date;
        };
      };
    }) => reservationShape(state.reservations.find(
      (reservation) =>
        where.id
          ? reservation.id === where.id
          : where.sourceRequestId
            ? reservation.sourceRequestId === where.sourceRequestId
            : reservation.sourceScheduleBlockId
              === where.sourceScheduleBlockId_startsAt?.sourceScheduleBlockId
              && (reservation.startsAt as Date).getTime()
                === where.sourceScheduleBlockId_startsAt!.startsAt.getTime(),
    ))),
    findMany: vi.fn(async ({ where }: {
      where: { venueId: string; startsAt: { lt: Date }; endsAt: { gt: Date } };
    }) => state.reservations.filter(
      (reservation) =>
        reservation.venueId === where.venueId
        && (reservation.startsAt as Date) < where.startsAt.lt
        && (reservation.endsAt as Date) > where.endsAt.gt,
    )),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const reservation = {
        ...data,
        id: `reservation-${state.reservations.length + 1}`,
      };
      state.reservations.push(reservation);
      const overrides = data.overrides as
        | { create: Record<string, unknown> }
        | undefined;
      if (overrides) state.overrides.push(overrides.create);
      return { id: reservation.id };
    }),
  };
  const client = {
    seasonGame,
    event,
    eventGame,
    signupEvent,
    practiceSession,
    iceTimeRequest,
    venueScheduleBlock,
    venueReservation,
    segmentCoexistence: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => {
      const before = structuredClone(state);
      try {
        return await work(client);
      } catch (error) {
        state = before;
        throw error;
      }
    }),
  };
  return {
    client,
    get state() {
      return state;
    },
  };
}

describe("venue reservation backfill", () => {
  it("defaults to a read-only dry run and is repeatable", async () => {
    const client = emptyClient();

    const first = await backfillVenueReservations(
      { systemActorId: "cactor00000000000000000001" },
      client as never,
    );
    const second = await backfillVenueReservations(
      { systemActorId: "cactor00000000000000000001" },
      client as never,
    );

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      dryRun: true,
      candidates: 0,
      created: 0,
      linkedAliases: 0,
    });
  });

  it("deduplicates aliases already linked to the same reservation", () => {
    expect(
      resolveLinkedAliasVenueReservationId([
        null,
        "cvenueReservation0000000001",
        "cvenueReservation0000000001",
      ]),
    ).toEqual({
      venueReservationId: "cvenueReservation0000000001",
      inconsistent: false,
    });
  });

  it("flags aliases linked to different reservations for reconciliation", () => {
    expect(
      resolveLinkedAliasVenueReservationId([
        "cvenueReservation0000000001",
        "cvenueReservation0000000002",
      ]),
    ).toEqual({ venueReservationId: null, inconsistent: true });
  });

  it("preserves legacy overlaps as explicit migration override evidence", () => {
    expect(
      buildPreservedOverlapOverride(
        "Legacy commitments overlap",
        ["cconflict00000000000000001", "cconflict00000000000000002"],
      ),
    ).toEqual({
      reason: "Legacy commitments overlap",
      conflictingReservationIds: [
        "cconflict00000000000000001",
        "cconflict00000000000000002",
      ],
    });
  });

  it("expands every occurrence of a finite recurring occupying block", () => {
    const expansion = expandFiniteVenueBlockOccurrences({
      startsAt: new Date("2026-09-01T10:00:00Z"),
      endsAt: new Date("2026-09-01T11:00:00Z"),
      recurrenceRule: "FREQ=DAILY;COUNT=3",
      recurrenceEndDate: null,
      timezone: "UTC",
    });

    expect(expansion.reason).toBeNull();
    expect(expansion.occurrences.map(({ startsAt }) => startsAt.toISOString()))
      .toEqual([
        "2026-09-01T10:00:00.000Z",
        "2026-09-02T10:00:00.000Z",
        "2026-09-03T10:00:00.000Z",
      ]);
  });

  it("preserves venue-local weekly time while backfilling across DST", () => {
    const expansion = expandFiniteVenueBlockOccurrences({
      startsAt: new Date("2026-10-25T14:00:00.000Z"),
      endsAt: new Date("2026-10-25T15:00:00.000Z"),
      recurrenceRule: "FREQ=WEEKLY;COUNT=3",
      recurrenceEndDate: null,
      timezone: "America/New_York",
    });

    expect(expansion.reason).toBeNull();
    expect(expansion.occurrences.map(({ startsAt }) => startsAt.toISOString())).toEqual([
      "2026-10-25T14:00:00.000Z",
      "2026-11-01T15:00:00.000Z",
      "2026-11-08T15:00:00.000Z",
    ]);
  });

  it("materializes all legacy source types, shares aliases, and makes the second write pass a no-op", async () => {
    const fixture = materializationClient();

    const first = await backfillVenueReservations(
      {
        dryRun: false,
        systemActorId: "cactor00000000000000000001",
      },
      fixture.client as never,
    );
    const second = await backfillVenueReservations(
      {
        dryRun: false,
        systemActorId: "cactor00000000000000000001",
      },
      fixture.client as never,
    );

    expect(first).toMatchObject({
      created: 7,
      linkedAliases: 7,
      preservedOverlaps: 1,
      unresolved: [],
    });

    expect(fixture.state.links.season).toBe(fixture.state.links.seasonEvent);
    expect(fixture.state.links.practice).toBe(fixture.state.links.practiceEvent);
    expect(fixture.state.links.eventGame).toBe(fixture.state.links.signupEvent);
    expect(fixture.state.links.standaloneEvent).toBeTruthy();
    expect(fixture.state.reservations.filter(
      (reservation) => reservation.sourceScheduleBlockId === "block",
    )).toHaveLength(2);
    expect(fixture.state.reservations.filter(
      (reservation) => reservation.sourceRequestId === "request",
    )).toHaveLength(1);
    expect(fixture.state.reservations.find(
      (reservation) => reservation.sourceRequestId === "request",
    )).toMatchObject({
      offeringBlockId: "offering",
      sourceScheduleBlockId: null,
    });
    expect(fixture.state.reservations.filter(
      (reservation) => reservation.sourceScheduleBlockId === "block",
    )).toEqual(expect.arrayContaining([
      expect.objectContaining({ offeringBlockId: null }),
    ]));
    expect(second).toMatchObject({
      candidates: 0,
      created: 0,
      linkedAliases: 0,
      unresolved: [],
    });
    expect(fixture.state.reservations).toHaveLength(7);
  });

  it("backfills unaffiliated accepted requests to the venue organization owner", async () => {
    const fixture = materializationClient({ publicRequest: true });

    const report = await backfillVenueReservations(
      {
        dryRun: false,
        systemActorId: "cactor00000000000000000001",
      },
      fixture.client as never,
    );

    expect(report.unresolved).toEqual([]);
    expect(fixture.state.reservations.find(
      (reservation) => reservation.sourceRequestId === "request",
    )).toMatchObject({
      ownerLeagueId: null,
      ownerTeamId: null,
      ownerVenueOrganizationId: "venue-organization",
    });
  });

  it("recomputes a shortened recurrence inside each transaction and skips the stale later candidate", async () => {
    const fixture = materializationClient();
    const block = {
      id: "block",
      status: "PUBLISHED",
      intent: "CLOSURE",
      startsAt: new Date("2026-09-05T10:00:00Z"),
      endsAt: new Date("2026-09-05T11:00:00Z"),
      recurrenceEndDate: null,
      venueId: "venue",
      surfaceId: null,
      segmentId: null,
      venue: {
        timezone: "UTC",
        organizationId: "venue-organization",
        leagueId: null,
        teamId: null,
      },
    };
    fixture.client.venueScheduleBlock.findUnique
      .mockResolvedValueOnce({
        ...block,
        recurrenceRule: "FREQ=DAILY;COUNT=2",
      })
      .mockResolvedValue({
        ...block,
        recurrenceRule: "FREQ=DAILY;COUNT=1",
      });

    const report = await backfillVenueReservations(
      {
        dryRun: false,
        systemActorId: "cactor00000000000000000001",
      },
      fixture.client as never,
    );

    expect(fixture.state.reservations.filter(
      (reservation) => reservation.sourceScheduleBlockId === "block",
    )).toHaveLength(1);
    expect(report.skippedAlreadyLinked).toBeGreaterThanOrEqual(1);
  });

  it("skips occurrence candidates moved by a concurrent block edit", async () => {
    const fixture = materializationClient();
    fixture.client.venueScheduleBlock.findUnique.mockResolvedValue({
      id: "block",
      status: "PUBLISHED",
      intent: "CLOSURE",
      startsAt: new Date("2026-09-10T10:00:00Z"),
      endsAt: new Date("2026-09-10T11:00:00Z"),
      recurrenceRule: "FREQ=DAILY;COUNT=2",
      recurrenceEndDate: null,
      venueId: "venue",
      surfaceId: null,
      segmentId: null,
      venue: {
        timezone: "UTC",
        organizationId: "venue-organization",
        leagueId: null,
        teamId: null,
      },
    });

    const report = await backfillVenueReservations(
      {
        dryRun: false,
        systemActorId: "cactor00000000000000000001",
      },
      fixture.client as never,
    );

    expect(fixture.state.reservations.filter(
      (reservation) => reservation.sourceScheduleBlockId === "block",
    )).toHaveLength(0);
    expect(report.skippedAlreadyLinked).toBeGreaterThanOrEqual(2);
    expect(fixture.client.venueScheduleBlock.findUnique).toHaveBeenCalledWith({
      where: { id: "block" },
      select: expect.objectContaining({
        startsAt: true,
        endsAt: true,
        recurrenceRule: true,
        recurrenceEndDate: true,
      }),
    });
  });

  it("rolls back a failed unit while keeping dry-run strictly read-only", async () => {
    const dryRunFixture = materializationClient();
    await backfillVenueReservations(
      { systemActorId: "cactor00000000000000000001" },
      dryRunFixture.client as never,
    );
    expect(dryRunFixture.client.$transaction).not.toHaveBeenCalled();
    expect(dryRunFixture.state.reservations).toHaveLength(0);

    const rollbackFixture = materializationClient({ failStandaloneLink: true });
    const report = await backfillVenueReservations(
      {
        dryRun: false,
        systemActorId: "cactor00000000000000000001",
      },
      rollbackFixture.client as never,
    );
    expect(report.unresolved).toContainEqual({
      source: "EVENT",
      sourceId: "standalone-event",
      reason: "injected alias failure",
    });
    expect(rollbackFixture.state.links.standaloneEvent).toBeNull();
    expect(rollbackFixture.state.reservations.some(
      (reservation) =>
        reservation.startsAt instanceof Date
        && reservation.startsAt.getTime() === new Date("2026-09-04T10:00:00Z").getTime()
        && !reservation.sourceRequestId,
    )).toBe(false);
  });
});

describe("venue reservation cutover verification", () => {
  it("reconciles source and alias counts", async () => {
    const client = verifierEmptyDelegates();
    client.event.count.mockResolvedValue(1);

    await expect(verifyVenueReservationCutover(client as never)).resolves.toMatchObject({
      clean: false,
      unlinkedLegacy: { events: 1 },
      inconsistentAliases: [],
    });
  });

  it("keeps dual-read rollback safe until destructive cleanup", () => {
    expect(
      assessVenueReservationRollback({
        legacyReadsEnabled: true,
        destructiveCleanupDetected: false,
      }),
    ).toEqual({ safe: true, reason: null });
    expect(
      assessVenueReservationRollback({
        legacyReadsEnabled: false,
        destructiveCleanupDetected: true,
      }).safe,
    ).toBe(false);
  });

  it("reports mismatched signup-event and event-game reservation aliases", async () => {
    const client = verifierEmptyDelegates();
    client.eventGame.findMany.mockResolvedValue([
          {
            id: "ceventgame0000000000000001",
            status: "SCHEDULED",
            startAt: new Date("2026-09-01T10:00:00Z"),
            endAt: new Date("2026-09-01T11:00:00Z"),
            venueReservationId: "creservation00000000000001",
            event: {
              id: "csignupevent00000000000001",
              startAt: new Date("2026-09-01T10:00:00Z"),
              endAt: new Date("2026-09-01T11:00:00Z"),
              venueReservationId: "creservation00000000000002",
              _count: { games: 1 },
            },
          },
        ] as never);

    await expect(
      verifyVenueReservationCutover(client as never),
    ).resolves.toMatchObject({
      clean: false,
      inconsistentAliases: [
        {
          source: "SIGNUP_EVENT_GAME",
          primaryId: "csignupevent00000000000001",
          aliasId: "ceventgame0000000000000001",
        },
      ],
    });
  });

  it("reports a partially linked SeasonGame/Event alias", async () => {
    const client = verifierEmptyDelegates();
    client.seasonGame.findMany.mockResolvedValue([{
    id: "cgame000000000000000000001",
    startAt: new Date("2026-09-01T10:00:00Z"),
    endAt: new Date("2026-09-01T11:00:00Z"),
    venueId: "cvenue00000000000000000001",
    surfaceId: null,
    segmentId: null,
    homeTeamId: "cteam000000000000000000001",
    venueReservationId: "creservation00000000000001",
    venueReservation: {
      id: "creservation00000000000001",
      venueId: "cvenue00000000000000000001",
      surfaceId: null,
      segmentId: null,
      startsAt: new Date("2026-09-01T10:00:00Z"),
      endsAt: new Date("2026-09-01T11:00:00Z"),
      ownerLeagueId: "cleague0000000000000000001",
      ownerTeamId: null,
      ownerVenueOrganizationId: null,
      sourceRequestId: null,
      offeringBlockId: null,
      sourceScheduleBlockId: null,
    },
    season: {
      leagueId: "cleague0000000000000000001",
      teamId: null,
    },
    event: {
      id: "cevent00000000000000000001",
      venueId: "cvenue00000000000000000001",
      startAt: new Date("2026-09-01T10:00:00Z"),
      endAt: new Date("2026-09-01T11:00:00Z"),
      venueReservationId: null,
      venueReservation: null,
    },
    }] as never);

    await expect(verifyVenueReservationCutover(client as never)).resolves
    .toMatchObject({
      clean: false,
      inconsistentAliases: [{
        source: "SEASON_GAME_EVENT",
        primaryId: "cgame000000000000000000001",
        aliasId: "cevent00000000000000000001",
        reservationIds: ["creservation00000000000001"],
      }],
    });
  });

  it("requires every finite recurrence occurrence, not merely one block link", async () => {
    const client = verifierEmptyDelegates();
    client.venueScheduleBlock.findMany.mockResolvedValue([{
      id: "cblock000000000000000000001",
      startsAt: new Date("2026-09-01T10:00:00Z"),
      endsAt: new Date("2026-09-01T11:00:00Z"),
      recurrenceRule: "FREQ=DAILY;COUNT=2",
      recurrenceEndDate: null,
      venueId: "venue",
      surfaceId: null,
      segmentId: null,
      venue: {
        timezone: "UTC",
        organizationId: "venue-organization",
        leagueId: null,
        teamId: null,
      },
      reservationOccurrences: [{
        id: "creservation00000000000001",
        startsAt: new Date("2026-09-01T10:00:00Z"),
        endsAt: new Date("2026-09-01T11:00:00Z"),
        status: "CONFIRMED",
        heldUntil: null,
        venueId: "venue",
        surfaceId: null,
        segmentId: null,
        ownerLeagueId: null,
        ownerTeamId: null,
        ownerVenueOrganizationId: "venue-organization",
        sourceRequestId: null,
        offeringBlockId: null,
        sourceScheduleBlockId: "cblock000000000000000000001",
      }],
    }] as never);

    await expect(verifyVenueReservationCutover(client as never)).resolves
      .toMatchObject({
        clean: false,
        unlinkedLegacy: { occupyingBlocks: 1 },
        incompleteBlockOccurrences: [{
          blockId: "cblock000000000000000000001",
          startsAt: new Date("2026-09-02T10:00:00Z"),
        }],
      });
  });

  it("treats released or canceled source occurrences as already materialized", async () => {
    const client = verifierEmptyDelegates();
    client.venueScheduleBlock.findMany.mockResolvedValue([{
      id: "cblock000000000000000000001",
      startsAt: new Date("2026-09-01T10:00:00Z"),
      endsAt: new Date("2026-09-01T11:00:00Z"),
      recurrenceRule: "FREQ=DAILY;COUNT=1",
      recurrenceEndDate: null,
      venueId: "venue",
      surfaceId: null,
      segmentId: null,
      venue: {
        timezone: "UTC",
        organizationId: "venue-organization",
        leagueId: null,
        teamId: null,
      },
      reservationOccurrences: [{
        id: "creservation00000000000001",
        startsAt: new Date("2026-09-01T10:00:00Z"),
        endsAt: new Date("2026-09-01T11:00:00Z"),
        status: "CANCELED",
        heldUntil: null,
        venueId: "venue",
        surfaceId: null,
        segmentId: null,
        ownerLeagueId: null,
        ownerTeamId: null,
        ownerVenueOrganizationId: "venue-organization",
        sourceRequestId: null,
        offeringBlockId: null,
        sourceScheduleBlockId: "cblock000000000000000000001",
      }],
    }] as never);

    await expect(verifyVenueReservationCutover(client as never)).resolves
      .toMatchObject({
        incompleteBlockOccurrences: [],
        unlinkedLegacy: { occupyingBlocks: 0 },
      });
  });

  it("reports linked reservation identity mismatches", async () => {
    const client = verifierEmptyDelegates();
    client.iceTimeRequest.findMany.mockResolvedValue([{
      id: "crequest000000000000000001",
      requestedStartAt: new Date("2026-09-01T10:00:00Z"),
      requestedEndAt: new Date("2026-09-01T11:00:00Z"),
      approvedStartAt: null,
      approvedEndAt: null,
      approvedSurfaceId: "csurface000000000000000001",
      approvedSegmentId: null,
      requesterTeamId: "cteam000000000000000000001",
      requesterLeagueId: "cleague0000000000000000001",
      venueId: "cvenue00000000000000000001",
      scheduleBlockId: "coffering000000000000000001",
      venueReservation: {
        id: "creservation00000000000001",
        venueId: "cvenue00000000000000000001",
        surfaceId: "cwrongSurface00000000000001",
        segmentId: null,
        startsAt: new Date("2026-09-01T10:00:00Z"),
        endsAt: new Date("2026-09-01T11:00:00Z"),
        ownerLeagueId: null,
        ownerTeamId: "cteam000000000000000000001",
        ownerVenueOrganizationId: null,
        sourceRequestId: "cwrongRequest00000000000001",
        offeringBlockId: "coffering000000000000000001",
        sourceScheduleBlockId: null,
      },
    }] as never);

    await expect(verifyVenueReservationCutover(client as never)).resolves
      .toMatchObject({
        clean: false,
        mismatchedLinkedReservations: [{
          source: "ICE_REQUEST",
          sourceId: "crequest000000000000000001",
          mismatchedFields: ["surfaceId", "sourceRequestId"],
        }],
      });
  });
});
