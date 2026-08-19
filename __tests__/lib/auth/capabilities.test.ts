import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany, getUserLeagueAccessLevel, teamFindFirst } = vi.hoisted(() => ({
  findMany: vi.fn(),
  getUserLeagueAccessLevel: vi.fn(),
  teamFindFirst: vi.fn(),
}));

vi.mock("@/lib/utils/security", () => ({
  LeagueAccessLevel: {
    NONE: "NONE",
    MEMBER: "MEMBER",
    TEAM_ADMIN: "TEAM_ADMIN",
    LEAGUE_ADMIN: "LEAGUE_ADMIN",
  },
  getUserLeagueAccessLevel,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    associationRoleGrant: { findMany },
    team: { findFirst: teamFindFirst },
  },
}));

import {
  Capability,
  ROLE_CAPABILITY_MATRIX,
  hasCapability,
} from "@/lib/auth/capabilities";

type GrantRow = {
  role: string;
  scopeType: string;
  leagueId?: string;
  divisionId?: string | null;
  teamId?: string | null;
  seasonId?: string | null;
  eventId?: string | null;
  signupEventId?: string | null;
};

/** Shape a grant the way the resolver reads it out of Prisma. */
function grant(row: GrantRow) {
  return {
    leagueId: "league-1",
    divisionId: null,
    teamId: null,
    seasonId: null,
    eventId: null,
    signupEventId: null,
    ...row,
  };
}

const base = { userId: "user-1", leagueId: "league-1" } as const;

describe("association capability matrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: an ordinary member with no legacy admin standing, so every
    // result below is attributable to a grant rather than legacy compatibility.
    getUserLeagueAccessLevel.mockResolvedValue("MEMBER");
    findMany.mockResolvedValue([]);
    teamFindFirst.mockResolvedValue(null);
  });

  describe("matrix shape", () => {
    it("declares an allowlist for every role", () => {
      // Fail-closed by construction: a role with no entry grants nothing rather
      // than falling through to a permissive default.
      for (const [role, entry] of Object.entries(ROLE_CAPABILITY_MATRIX)) {
        expect(Array.isArray(entry.capabilities), `${role} capabilities`).toBe(true);
        expect(entry.scopes.length, `${role} scopes`).toBeGreaterThan(0);
      }
    });

    it("confines the treasurer to association-scoped payments", () => {
      const entry = ROLE_CAPABILITY_MATRIX.TREASURER;
      expect(entry.capabilities).toEqual([Capability.MANAGE_PAYMENTS]);
      expect(entry.scopes).toEqual(["ASSOCIATION"]);
    });

    it("gives the equipment manager no association capability of its own", () => {
      // Equipment managers act only through the existing gear Permission checks
      // (see permissions-gear.test.ts); they hold no scheduling, finance, or
      // administrative capability here.
      expect(ROLE_CAPABILITY_MATRIX.EQUIPMENT_MANAGER.capabilities).toEqual([]);
    });
  });

  describe("least-privilege per role", () => {
    it("lets a scheduler manage schedules but not payments or rosters", async () => {
      findMany.mockResolvedValue([grant({ role: "SCHEDULER", scopeType: "ASSOCIATION" })]);

      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_SCHEDULE }),
      ).resolves.toBe(true);
      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_PAYMENTS }),
      ).resolves.toBe(false);
      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_ROSTER }),
      ).resolves.toBe(false);
    });

    it("lets a registrar manage rosters but not schedules", async () => {
      findMany.mockResolvedValue([grant({ role: "REGISTRAR", scopeType: "ASSOCIATION" })]);

      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_ROSTER }),
      ).resolves.toBe(true);
      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_SCHEDULE }),
      ).resolves.toBe(false);
    });

    it("lets a treasurer manage payments but not public content", async () => {
      findMany.mockResolvedValue([grant({ role: "TREASURER", scopeType: "ASSOCIATION" })]);

      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_PAYMENTS }),
      ).resolves.toBe(true);
      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_PUBLIC_CONTENT }),
      ).resolves.toBe(false);
    });

    it("lets a communications lead publish content but not administer the association", async () => {
      findMany.mockResolvedValue([
        grant({ role: "COMMUNICATIONS_LEAD", scopeType: "ASSOCIATION" }),
      ]);

      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_PUBLIC_CONTENT }),
      ).resolves.toBe(true);
      await expect(
        hasCapability({ ...base, capability: Capability.ADMINISTER_ASSOCIATION }),
      ).resolves.toBe(false);
    });

    it("confines a coach to practice work on the granted team", async () => {
      findMany.mockResolvedValue([
        grant({ role: "COACH", scopeType: "TEAM", teamId: "team-1" }),
      ]);

      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_PRACTICE, teamId: "team-1" }),
      ).resolves.toBe(true);
      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_PRACTICE, teamId: "team-2" }),
      ).resolves.toBe(false);
      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_TEAM, teamId: "team-1" }),
      ).resolves.toBe(false);
    });

    it("confines a team manager to the exact granted team", async () => {
      findMany.mockResolvedValue([
        grant({ role: "TEAM_MANAGER", scopeType: "TEAM", teamId: "team-1" }),
      ]);

      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_TEAM, teamId: "team-1" }),
      ).resolves.toBe(true);
      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_ROSTER, teamId: "team-1" }),
      ).resolves.toBe(true);
      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_TEAM, teamId: "team-2" }),
      ).resolves.toBe(false);
      // No association-wide reach, even for a capability the role does hold.
      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_ROSTER }),
      ).resolves.toBe(false);
    });

    it("lets a volunteer coordinator work at event scope without event administration", async () => {
      findMany.mockResolvedValue([
        grant({ role: "VOLUNTEER_COORDINATOR", scopeType: "EVENT", eventId: "event-1" }),
      ]);

      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_VOLUNTEERS, eventId: "event-1" }),
      ).resolves.toBe(true);
      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_EVENT, eventId: "event-1" }),
      ).resolves.toBe(false);
      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_VOLUNTEERS, eventId: "event-2" }),
      ).resolves.toBe(false);
    });

    it("confines an event manager to the exact event", async () => {
      findMany.mockResolvedValue([
        grant({ role: "EVENT_MANAGER", scopeType: "EVENT", eventId: "event-1" }),
      ]);

      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_EVENT, eventId: "event-1" }),
      ).resolves.toBe(true);
      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_EVENT, eventId: "event-2" }),
      ).resolves.toBe(false);
      // Managing one event confers nothing over the association hosting it.
      await expect(
        hasCapability({ ...base, capability: Capability.ADMINISTER_ASSOCIATION }),
      ).resolves.toBe(false);
    });
  });

  describe("scope ancestry", () => {
    it("lets an association-scoped grant reach a team within it", async () => {
      findMany.mockResolvedValue([grant({ role: "REGISTRAR", scopeType: "ASSOCIATION" })]);

      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_ROSTER, teamId: "team-1" }),
      ).resolves.toBe(true);
    });

    it("lets a division-scoped grant reach a team currently in that division", async () => {
      findMany.mockResolvedValue([
        grant({ role: "REGISTRAR", scopeType: "DIVISION", divisionId: "division-1" }),
      ]);
      teamFindFirst.mockResolvedValue({ id: "team-1" });

      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_ROSTER, teamId: "team-1" }),
      ).resolves.toBe(true);
      expect(teamFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: "team-1", divisionId: "division-1" }),
        }),
      );
    });

    it("rejects a division-scoped grant for a team outside the division", async () => {
      findMany.mockResolvedValue([
        grant({ role: "REGISTRAR", scopeType: "DIVISION", divisionId: "division-1" }),
      ]);
      teamFindFirst.mockResolvedValue(null);

      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_ROSTER, teamId: "team-9" }),
      ).resolves.toBe(false);
    });

    it("never widens a narrow grant to the whole association", async () => {
      // A team-scoped grant asked about association-wide work has no target to
      // check against and must fail rather than defaulting to "any team".
      findMany.mockResolvedValue([
        grant({ role: "REGISTRAR", scopeType: "TEAM", teamId: "team-1" }),
      ]);

      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_ROSTER }),
      ).resolves.toBe(false);
    });

    it("ignores a grant belonging to a different association", async () => {
      // The resolver scopes its query by league; assert the filter rather than
      // trusting the caller to have pre-filtered.
      await hasCapability({ ...base, capability: Capability.MANAGE_ROSTER });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: "user-1",
            leagueId: "league-1",
            state: "ACTIVE",
          }),
        }),
      );
    });

    it("ignores revoked grants", async () => {
      await hasCapability({ ...base, capability: Capability.MANAGE_ROSTER });

      const where = findMany.mock.calls[0][0].where;
      expect(where.state).toBe("ACTIVE");
    });
  });

  describe("unsupported role/scope combinations fail closed", () => {
    it("refuses a treasurer grant recorded at team scope", async () => {
      // TREASURER supports ASSOCIATION only. A row that somehow carries a team
      // scope must not authorize anything.
      findMany.mockResolvedValue([
        grant({ role: "TREASURER", scopeType: "TEAM", teamId: "team-1" }),
      ]);

      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_PAYMENTS, teamId: "team-1" }),
      ).resolves.toBe(false);
    });

    it("refuses an event-manager grant recorded at association scope", async () => {
      findMany.mockResolvedValue([
        grant({ role: "EVENT_MANAGER", scopeType: "ASSOCIATION" }),
      ]);

      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_EVENT, eventId: "event-1" }),
      ).resolves.toBe(false);
    });

    it("refuses an unknown role", async () => {
      findMany.mockResolvedValue([
        grant({ role: "NOT_A_REAL_ROLE", scopeType: "ASSOCIATION" }),
      ]);

      await expect(
        hasCapability({ ...base, capability: Capability.ADMINISTER_ASSOCIATION }),
      ).resolves.toBe(false);
    });
  });

  describe("legacy administrator compatibility", () => {
    it("keeps existing league admins fully capable before the backfill runs", async () => {
      getUserLeagueAccessLevel.mockResolvedValue("LEAGUE_ADMIN");
      findMany.mockResolvedValue([]);

      await expect(
        hasCapability({ ...base, capability: Capability.ADMINISTER_ASSOCIATION }),
      ).resolves.toBe(true);
      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_PAYMENTS }),
      ).resolves.toBe(true);
      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_TEAM, teamId: "team-1" }),
      ).resolves.toBe(true);
    });

    it("keeps existing team admins managing their own team", async () => {
      getUserLeagueAccessLevel.mockResolvedValue("TEAM_ADMIN");
      teamFindFirst.mockResolvedValue({ id: "team-1" });

      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_TEAM, teamId: "team-1" }),
      ).resolves.toBe(true);
    });

    it("does not let a team admin administer the association", async () => {
      getUserLeagueAccessLevel.mockResolvedValue("TEAM_ADMIN");

      await expect(
        hasCapability({ ...base, capability: Capability.ADMINISTER_ASSOCIATION }),
      ).resolves.toBe(false);
    });

    it("grants a plain member nothing", async () => {
      getUserLeagueAccessLevel.mockResolvedValue("MEMBER");

      for (const capability of Object.values(Capability)) {
        await expect(
          hasCapability({ ...base, capability, teamId: "team-1" }),
        ).resolves.toBe(false);
      }
    });

    it("never derives capability from a descriptive official title", async () => {
      // TeamOfficial is a label, not an authorization source (spec 007 US3).
      // The resolver must read grants only.
      getUserLeagueAccessLevel.mockResolvedValue("MEMBER");
      findMany.mockResolvedValue([]);

      await expect(
        hasCapability({ ...base, capability: Capability.MANAGE_TEAM, teamId: "team-1" }),
      ).resolves.toBe(false);
    });
  });
});
