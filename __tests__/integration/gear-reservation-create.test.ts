import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeWithTestDatabase = TEST_DATABASE_URL ? describe : describe.skip;

/**
 * A team admin requesting league gear, written through the real Prisma client.
 *
 * The unit tests mock `tx.gearReservation.create`, so they cannot see Prisma's
 * own input validation. Reservation lines relate to their reservation through
 * the compound `[leagueId, reservationId]` key, which means a nested line
 * create must not carry `leagueId` itself — Prisma rejects the whole write
 * with "Unknown argument `leagueId`". Only a real client catches that.
 *
 * Skipped unless TEST_DATABASE_URL is set, matching the other integration
 * tests in this folder.
 */
describeWithTestDatabase("createGearReservation against PostgreSQL", () => {
  let prisma: any;
  let appPrisma: { $disconnect: () => Promise<void> } | null = null;
  let createGearReservation: any;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let actingUserId: string | undefined;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    vi.resetModules();

    // The real session module imports the Auth.js boundary. Replace it with
    // helpers that read the same membership rows, so authorization still
    // depends on the fixture rather than on a hard-coded answer.
    vi.doMock("@/lib/auth/session", () => ({
      requireUserId: vi.fn(async () => actingUserId),
      requireLeagueRole: vi.fn(async () => actingUserId),
      getUserLeagueRole: vi.fn(async (userId: string, leagueId: string) => {
        const row = await prisma.leagueUser.findUnique({
          where: { userId_leagueId: { userId, leagueId } },
          select: { role: true },
        });
        return row?.role ?? null;
      }),
      isTeamAdmin: vi.fn(async (userId: string, teamId: string) => {
        const row = await prisma.teamMember.findFirst({
          where: { userId, teamId, role: "ADMIN" },
          select: { id: true },
        });
        return Boolean(row);
      }),
    }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));

    const [{ PrismaClient }, dbModule, actionModule] = await Promise.all([
      import("@prisma/client"),
      import("@/lib/db/prisma"),
      import("@/lib/actions/gear-reservations"),
    ]);

    const connectionString = TEST_DATABASE_URL!;
    if (/\.neon\.tech[/:]/.test(connectionString)) {
      const { PrismaNeon } = await import("@prisma/adapter-neon");
      prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }), log: ["error"] });
    } else {
      const { PrismaPg } = await import("@prisma/adapter-pg");
      prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }), log: ["error"] });
    }

    appPrisma = dbModule.prisma;
    createGearReservation = actionModule.createGearReservation;
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
  });

  async function createFixture() {
    const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
    const league = await prisma.league.create({
      data: { name: `Gear League ${suffix}`, sport: "HOCKEY", contactEmail: `league-${suffix}@example.com` },
      select: { id: true },
    });
    const [admin, coach] = await Promise.all(
      ["admin", "coach"].map((label) =>
        prisma.user.create({
          data: { email: `${label}-${suffix}@example.com`, passwordHash: "x", emailVerified: new Date() },
          select: { id: true },
        }),
      ),
    );
    const team = await prisma.team.create({
      data: { name: `Gear Team ${suffix}`, season: "2026-27", leagueId: league.id },
      select: { id: true },
    });
    await prisma.leagueUser.createMany({
      data: [
        { userId: admin.id, leagueId: league.id, role: "LEAGUE_ADMIN" },
        { userId: coach.id, leagueId: league.id, role: "TEAM_ADMIN" },
      ],
    });
    await prisma.teamMember.create({ data: { userId: coach.id, teamId: team.id, role: "ADMIN" } });
    const catalogItem = await prisma.gearCatalogItem.create({
      data: {
        leagueId: league.id,
        normalizedKey: `practice-pylons-${suffix}`,
        name: "Practice pylons",
        category: "Training aids",
        trackingMode: "POOLED",
      },
      select: { id: true },
    });
    return {
      leagueId: league.id,
      teamId: team.id,
      coachId: coach.id,
      userIds: [admin.id, coach.id],
      catalogItemId: catalogItem.id,
    };
  }

  async function cleanup(fixture: Awaited<ReturnType<typeof createFixture>>) {
    // gear_activity is append-only and notification_outbox is durable, both
    // enforced by trigger, so the rows this request wrote there stay, along
    // with the league and users they reference (deleting a user would null
    // the activity actor, which the trigger also refuses). The league is
    // deactivated; every other fixture row is removed. Names are suffixed,
    // so leftovers never collide with a later run.
    const { leagueId, teamId } = fixture;
    await prisma.gearReservationLine.deleteMany({ where: { leagueId } });
    await prisma.gearReservation.deleteMany({ where: { leagueId } });
    await prisma.gearCatalogItem.deleteMany({ where: { leagueId } });
    await prisma.teamMember.deleteMany({ where: { teamId } });
    await prisma.leagueUser.deleteMany({ where: { leagueId } });
    await prisma.team.deleteMany({ where: { id: teamId } });
    await prisma.league.update({ where: { id: leagueId }, data: { isActive: false } });
  }

  it("saves a team admin's request with its lines in the reservation's league", async () => {
    const fixture = await createFixture();
    try {
      actingUserId = fixture.coachId;
      const result = await createGearReservation({
        leagueId: fixture.leagueId,
        teamId: fixture.teamId,
        requestedStartDate: "2026-11-20",
        requestedEndDate: "2026-11-21",
        custodianNameSnapshot: "Team custodian",
        lines: [
          { catalogItemId: fixture.catalogItemId, nameSnapshot: "Client name", requestedQty: 8 },
          { nameSnapshot: "Extra water bottles", requestedQty: 2 },
        ],
      });

      expect(result).toEqual({ success: true, data: { id: expect.any(String) } });

      const reservation = await prisma.gearReservation.findUnique({
        where: { id: result.data.id },
        select: {
          leagueId: true,
          teamId: true,
          status: true,
          requestedById: true,
          lines: {
            select: { leagueId: true, catalogItemId: true, nameSnapshot: true, requestedQty: true },
            orderBy: { requestedQty: "desc" },
          },
        },
      });
      expect(reservation).toMatchObject({
        leagueId: fixture.leagueId,
        teamId: fixture.teamId,
        status: "REQUESTED",
        requestedById: fixture.coachId,
      });
      expect(reservation.lines).toEqual([
        {
          leagueId: fixture.leagueId,
          catalogItemId: fixture.catalogItemId,
          nameSnapshot: "Practice pylons",
          requestedQty: 8,
        },
        { leagueId: fixture.leagueId, catalogItemId: null, nameSnapshot: "Extra water bottles", requestedQty: 2 },
      ]);

      // The league admin is queued a notification for the new request.
      const outbox = await prisma.notificationOutbox.findMany({
        where: { leagueId: fixture.leagueId, eventType: "gear.reservation.requested" },
        select: { recipientUserId: true },
      });
      expect(outbox).toEqual([{ recipientUserId: fixture.userIds[0] }]);
    } finally {
      await cleanup(fixture);
    }
  });
});
