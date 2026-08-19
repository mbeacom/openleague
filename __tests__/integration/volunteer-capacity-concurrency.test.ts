import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeWithTestDatabase = TEST_DATABASE_URL ? describe : describe.skip;

/**
 * Two volunteers accepting the last slot at the same instant (T057).
 *
 * Mocked Prisma cannot prove this: the guarantee lives in Postgres, in the
 * conditional `updateMany` guarded on `acceptedCount < capacity`, backed by the
 * `acceptedCount <= capacity` CHECK. ADR-0003 rules out `SELECT ... FOR UPDATE`,
 * so the claim has to be atomic by construction rather than by locking — and
 * that is exactly what needs a real database to verify.
 *
 * Skipped unless TEST_DATABASE_URL is set, matching
 * venue-reservation-concurrency.test.ts.
 */
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

describeWithTestDatabase("volunteer capacity concurrency (T057)", () => {
  let prisma: any;
  let appPrisma: { $disconnect: () => Promise<void> } | null = null;
  let respondToVolunteerAssignment: any;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  /** Which user the action sees, consumed one per invocation. */
  const actingUsers: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    vi.resetModules();

    // The action module imports the Auth.js boundary, which drags in Next's
    // runtime-only exports. Stub the session seam so this stays a database
    // test while still running the real capacity claim.
    vi.doMock("@/lib/auth/session", () => ({
      requireUserId: vi.fn(async () => actingUsers.shift()),
    }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));

    const [{ PrismaClient }, dbModule, actionModule] = await Promise.all([
      import("@prisma/client"),
      import("@/lib/db/prisma"),
      import("@/lib/actions/volunteers"),
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
    respondToVolunteerAssignment = actionModule.respondToVolunteerAssignment;
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

  async function createFixture(capacity: number) {
    const suffix = randomUUID().replace(/-/g, "").slice(0, 12);

    const league = await prisma.league.create({
      data: {
        name: `Capacity League ${suffix}`,
        sport: "HOCKEY",
        contactEmail: `league-${suffix}@example.com`,
      },
      select: { id: true },
    });

    const users = await Promise.all(
      [0, 1].map((index) =>
        prisma.user.create({
          data: {
            email: `volunteer-${index}-${suffix}@example.com`,
            passwordHash: "x",
            emailVerified: new Date(),
          },
          select: { id: true },
        }),
      ),
    );

    const need = await prisma.volunteerNeed.create({
      data: {
        leagueId: league.id,
        roleLabel: "Last slot",
        capacity,
        startAt: new Date(Date.now() + 86_400_000),
        endAt: new Date(Date.now() + 90_000_000),
        timezone: "America/Chicago",
      },
      select: { id: true },
    });

    const assignments = await Promise.all(
      users.map((user) =>
        prisma.volunteerAssignment.create({
          data: { needId: need.id, userId: user.id, status: "INVITED" },
          select: { id: true },
        }),
      ),
    );

    return {
      leagueId: league.id,
      needId: need.id,
      userIds: users.map((user: { id: string }) => user.id) as [string, string],
      assignmentIds: assignments.map((a: { id: string }) => a.id) as [string, string],
    };
  }

  async function cleanup(leagueId: string, userIds: string[]) {
    await prisma.volunteerAssignment.deleteMany({
      where: { need: { leagueId } },
    });
    await prisma.volunteerNeed.deleteMany({ where: { leagueId } });
    await prisma.league.deleteMany({ where: { id: leagueId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  it("lets exactly one of two simultaneous acceptances take the final slot", async () => {
    const fixture = await createFixture(1);

    try {
      const barrier = createBarrier(2);

      // requireUserId is consumed in invocation order, and JS runs each call
      // synchronously up to its first await, so caller 0 gets user 0.
      actingUsers.length = 0;
      actingUsers.push(fixture.userIds[0], fixture.userIds[1]);

      const results = await Promise.all(
        fixture.assignmentIds.map(async (assignmentId) => {
          await barrier();
          return respondToVolunteerAssignment({ assignmentId, response: "ACCEPTED" });
        }),
      );

      const accepted = results.filter((r) => r.success);
      const rejected = results.filter((r) => !r.success);

      expect(accepted).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].error).toMatch(/already full/);

      const need = await prisma.volunteerNeed.findUnique({
        where: { id: fixture.needId },
        select: { acceptedCount: true, capacity: true },
      });
      // The invariant that matters: never oversubscribed.
      expect(need.acceptedCount).toBe(1);
      expect(need.acceptedCount).toBeLessThanOrEqual(need.capacity);

      const acceptedRows = await prisma.volunteerAssignment.count({
        where: { needId: fixture.needId, status: "ACCEPTED" },
      });
      expect(acceptedRows).toBe(1);
    } finally {
      await cleanup(fixture.leagueId, fixture.userIds);
    }
  });

  it("lets both in when there are two slots", async () => {
    const fixture = await createFixture(2);

    try {
      const barrier = createBarrier(2);

      actingUsers.length = 0;
      actingUsers.push(fixture.userIds[0], fixture.userIds[1]);

      const results = await Promise.all(
        fixture.assignmentIds.map(async (assignmentId) => {
          await barrier();
          return respondToVolunteerAssignment({ assignmentId, response: "ACCEPTED" });
        }),
      );

      expect(results.filter((r) => r.success)).toHaveLength(2);

      const need = await prisma.volunteerNeed.findUnique({
        where: { id: fixture.needId },
        select: { acceptedCount: true },
      });
      expect(need.acceptedCount).toBe(2);
    } finally {
      await cleanup(fixture.leagueId, fixture.userIds);
    }
  });

  it("lets one accept win when the same assignment is answered twice at once", async () => {
    // The case a compensating decrement cannot cover: both callers read the
    // assignment as INVITED, so without a conditional claim inside the
    // transaction they would each take a slot on a multi-slot need.
    const fixture = await createFixture(2);

    try {
      const barrier = createBarrier(2);
      const assignmentId = fixture.assignmentIds[0];

      actingUsers.length = 0;
      actingUsers.push(fixture.userIds[0], fixture.userIds[0]);

      const results = await Promise.all(
        [0, 1].map(async () => {
          await barrier();
          return respondToVolunteerAssignment({ assignmentId, response: "ACCEPTED" });
        }),
      );

      expect(results.filter((r) => r.success)).toHaveLength(1);

      const need = await prisma.volunteerNeed.findUnique({
        where: { id: fixture.needId },
        select: { acceptedCount: true },
      });
      // One assignment accepted means exactly one slot consumed, even though
      // the need had room for two.
      expect(need.acceptedCount).toBe(1);
    } finally {
      await cleanup(fixture.leagueId, fixture.userIds);
    }
  });

  it("refuses to let the database exceed capacity even by direct write", async () => {
    // Proves the CHECK backing the guard is really present, so a future caller
    // that forgets the guard still cannot oversubscribe.
    const fixture = await createFixture(1);

    try {
      await expect(
        prisma.volunteerNeed.update({
          where: { id: fixture.needId },
          data: { acceptedCount: 2 },
        }),
      ).rejects.toThrow();
    } finally {
      await cleanup(fixture.leagueId, fixture.userIds);
    }
  });
});
