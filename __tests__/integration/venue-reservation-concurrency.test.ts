import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeWithTestDatabase = TEST_DATABASE_URL ? describe : describe.skip;

type Fixture = {
  managerId: string;
  requesterIds: [string, string];
  organizationId: string;
  venueId: string;
  leagueId: string;
  relationshipId: string;
  surfaceId: string;
  segmentIds: [string, string];
  scheduleBlockId: string;
  requestIds: [string, string];
  startsAt: Date;
  endsAt: Date;
};

function createBarrier(parties: number) {
  let arrivals = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  return async () => {
    arrivals += 1;
    if (arrivals === parties) {
      release();
    }
    await gate;
  };
}

describeWithTestDatabase("venue reservation concurrency (T018)", () => {
  let prisma: any;
  let appPrisma: { $disconnect: () => Promise<void> } | null = null;
  let decideIceTimeRequestInTransaction: any;
  let runVenueReservationTransaction: any;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    vi.resetModules();
    // The transaction helper under test does not use request/session state, but
    // its Server Action module imports the Auth.js boundary. Keep this
    // database integration test independent of Next's runtime-only
    // `next/server` export while still executing the real approval transaction.
    vi.doMock("@/lib/auth/session", () => ({
      requireUserId: vi.fn(),
      requireVenueRequestManager: vi.fn(),
      requireTeamMember: vi.fn(),
      getUserLeagueRole: vi.fn(),
    }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));

    const [{ PrismaClient }, dbModule, actionModule, transactionModule] =
      await Promise.all([
        import("@prisma/client"),
        import("@/lib/db/prisma"),
        import("@/lib/actions/venue-requests"),
        import("@/lib/services/venue-reservation-transaction"),
      ]);

    const connectionString = TEST_DATABASE_URL!;
    if (/\.neon\.tech[/:]/.test(connectionString)) {
      const { PrismaNeon } = await import("@prisma/adapter-neon");
      prisma = new PrismaClient({
        adapter: new PrismaNeon({ connectionString }),
        log: ["error"],
      });
    } else {
      const { PrismaPg } = await import("@prisma/adapter-pg");
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
        log: ["error"],
      });
    }

    appPrisma = dbModule.prisma;
    decideIceTimeRequestInTransaction =
      actionModule.decideIceTimeRequestInTransaction;
    runVenueReservationTransaction =
      transactionModule.runVenueReservationTransaction;
  });

  afterAll(async () => {
    await Promise.allSettled([
      prisma?.$disconnect?.() ?? Promise.resolve(),
      appPrisma?.$disconnect?.() ?? Promise.resolve(),
    ]);

    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    vi.resetModules();
  });

  async function createFixture(): Promise<Fixture> {
    const nonce = randomUUID().replaceAll("-", "").slice(0, 12);
    const startsAt = new Date("2026-04-01T10:00:00.000Z");
    const endsAt = new Date("2026-04-01T11:00:00.000Z");

    const [manager, requesterA, requesterB] = await Promise.all([
      prisma.user.create({
        data: {
          email: `t018-manager-${nonce}@example.com`,
          passwordHash: "integration-test-hash",
          name: `T018 Manager ${nonce}`,
        },
        select: { id: true },
      }),
      prisma.user.create({
        data: {
          email: `t018-requester-a-${nonce}@example.com`,
          passwordHash: "integration-test-hash",
          name: `T018 Requester A ${nonce}`,
        },
        select: { id: true },
      }),
      prisma.user.create({
        data: {
          email: `t018-requester-b-${nonce}@example.com`,
          passwordHash: "integration-test-hash",
          name: `T018 Requester B ${nonce}`,
        },
        select: { id: true },
      }),
    ]);

    const organization = await prisma.venueOrganization.create({
      data: {
        name: `T018 Org ${nonce}`,
        createdById: manager.id,
      },
      select: { id: true },
    });
    const league = await prisma.league.create({
      data: {
        name: `T018 League ${nonce}`,
        contactEmail: `t018-league-${nonce}@example.com`,
      },
      select: { id: true },
    });

    const venue = await prisma.venue.create({
      data: {
        name: `T018 Venue ${nonce}`,
        slug: `t018-${nonce}`,
        amenities: [],
        timezone: "UTC",
        organizationId: organization.id,
        createdById: manager.id,
      },
      select: { id: true },
    });

    const surface = await prisma.iceSurface.create({
      data: {
        name: `T018 Surface ${nonce}`,
        venueId: venue.id,
        surfaceType: "ICE",
        isDefault: true,
      },
      select: { id: true },
    });

    const [segmentA, segmentB] = await Promise.all([
      prisma.surfaceSegment.create({
        data: {
          name: `T018 Segment A ${nonce}`,
          surfaceId: surface.id,
          geometry: { x: 0, y: 0, w: 0.5, h: 1 },
        },
        select: { id: true },
      }),
      prisma.surfaceSegment.create({
        data: {
          name: `T018 Segment B ${nonce}`,
          surfaceId: surface.id,
          geometry: { x: 0.5, y: 0, w: 0.5, h: 1 },
        },
        select: { id: true },
      }),
    ]);

    await prisma.venueStaff.create({
      data: {
        organizationId: organization.id,
        venueId: venue.id,
        userId: manager.id,
        role: "REQUEST_MANAGER",
        status: "ACTIVE",
        joinedAt: new Date(),
      },
      select: { id: true },
    });
    const relationship = await prisma.venueRelationship.create({
      data: {
        venueId: venue.id,
        leagueId: league.id,
        relationshipType: "PREFERRED",
        targetType: "LEAGUE",
        status: "ACTIVE",
        invitedById: manager.id,
        acceptedById: manager.id,
      },
      select: { id: true },
    });

    const scheduleBlock = await prisma.venueScheduleBlock.create({
      data: {
        title: `T018 Offering ${nonce}`,
        activityType: "TEAM_ICE",
        status: "PUBLISHED",
        intent: "OFFERING",
        registrationMode: "REQUEST_REQUIRED",
        startsAt,
        endsAt,
        venueId: venue.id,
        surfaceId: surface.id,
        createdById: manager.id,
      },
      select: { id: true },
    });

    const [requestA, requestB] = await Promise.all([
      prisma.iceTimeRequest.create({
        data: {
          scheduleBlockId: scheduleBlock.id,
          venueId: venue.id,
          requesterUserId: requesterA.id,
          requesterLeagueId: league.id,
          contactName: "Requester A",
          contactEmail: `t018-contact-a-${nonce}@example.com`,
          requestedStartAt: startsAt,
          requestedEndAt: endsAt,
          status: "SUBMITTED",
        },
        select: { id: true },
      }),
      prisma.iceTimeRequest.create({
        data: {
          scheduleBlockId: scheduleBlock.id,
          venueId: venue.id,
          requesterUserId: requesterB.id,
          requesterLeagueId: league.id,
          contactName: "Requester B",
          contactEmail: `t018-contact-b-${nonce}@example.com`,
          requestedStartAt: startsAt,
          requestedEndAt: endsAt,
          status: "SUBMITTED",
        },
        select: { id: true },
      }),
    ]);

    return {
      managerId: manager.id,
      requesterIds: [requesterA.id, requesterB.id],
      organizationId: organization.id,
      venueId: venue.id,
      leagueId: league.id,
      relationshipId: relationship.id,
      surfaceId: surface.id,
      segmentIds: [segmentA.id, segmentB.id],
      scheduleBlockId: scheduleBlock.id,
      requestIds: [requestA.id, requestB.id],
      startsAt,
      endsAt,
    };
  }

  it("lets only one overlapping non-coexisting approval commit", async () => {
    const fixture = await createFixture();
    const synchronizeBeforeReservation = createBarrier(2);

    // Reservation transitions and reservations are intentionally append-only,
    // so deleting fixture rows would violate the production invariants this
    // test is exercising. TEST_DATABASE_URL must therefore name a dedicated,
    // disposable database; the test disconnects in afterAll and the harness
    // drops that exact database/container after the run.
    const [segmentAId, segmentBId] = fixture.segmentIds;
    const [requestAId, requestBId] = fixture.requestIds;

    const outcomes = await Promise.allSettled([
        runVenueReservationTransaction((tx: any) =>
          decideIceTimeRequestInTransaction(
            tx,
            {
              organizationId: fixture.organizationId,
              venueId: fixture.venueId,
              requestId: requestAId,
              status: "ACCEPTED",
              approvedStartAt: fixture.startsAt,
              approvedEndAt: fixture.endsAt,
              approvedSegmentId: segmentAId,
            },
            fixture.managerId,
            { beforeCreateReservation: synchronizeBeforeReservation },
          )),
        runVenueReservationTransaction((tx: any) =>
          decideIceTimeRequestInTransaction(
            tx,
            {
              organizationId: fixture.organizationId,
              venueId: fixture.venueId,
              requestId: requestBId,
              status: "ACCEPTED",
              approvedStartAt: fixture.startsAt,
              approvedEndAt: fixture.endsAt,
              approvedSegmentId: segmentBId,
            },
            fixture.managerId,
            { beforeCreateReservation: synchronizeBeforeReservation },
          )),
    ]);

    const activeReservations = await prisma.venueReservation.findMany({
        where: {
          sourceRequestId: { in: [...fixture.requestIds] },
          status: { in: ["HELD", "CONFIRMED", "COMPLETED"] },
        },
        select: {
          id: true,
          sourceRequestId: true,
          segmentId: true,
          status: true,
        },
    });
    expect(activeReservations).toHaveLength(1);
    expect(activeReservations[0].status).toBe("CONFIRMED");
    expect(fixture.requestIds).toContain(activeReservations[0].sourceRequestId);

    const requestStatuses = await prisma.iceTimeRequest.findMany({
        where: { id: { in: [...fixture.requestIds] } },
        select: { id: true, status: true },
    });
    expect(
      requestStatuses.filter(({ status }: { status: string }) =>
        ["ACCEPTED", "PARTIALLY_ACCEPTED"].includes(status)),
    ).toHaveLength(1);

    const approved = outcomes.filter(
      (outcome) => outcome.status === "fulfilled" && outcome.value.success,
    );
    expect(approved).toHaveLength(1);

    const losingOutcome = outcomes.find(
      (outcome) => !(outcome.status === "fulfilled" && outcome.value.success),
    );
    expect(losingOutcome).toBeDefined();

    if (losingOutcome?.status === "fulfilled") {
      expect(losingOutcome.value.success).toBe(false);
      expect(losingOutcome.value.error).toMatch(
        /already been accepted|different final decision/i,
      );
    } else {
      expect([
        "VenueReservationConflictError",
        "VenueReservationContentionError",
      ]).toContain(losingOutcome?.reason?.name);
    }
  });
});
