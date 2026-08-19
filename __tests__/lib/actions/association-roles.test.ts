import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGrant,
  mockUser,
  mockTeam,
  mockDivision,
  mockSeason,
  mockEvent,
  mockSignupEvent,
  mockInvitation,
  mockRequireUserId,
  mockHasCapability,
  mockLogAuditEvent,
} = vi.hoisted(() => ({
  mockGrant: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  mockUser: { findUnique: vi.fn() },
  mockTeam: { findFirst: vi.fn() },
  mockDivision: { findFirst: vi.fn() },
  mockSeason: { findFirst: vi.fn() },
  mockEvent: { findFirst: vi.fn() },
  mockSignupEvent: { findFirst: vi.fn() },
  mockInvitation: { create: vi.fn() },
  mockRequireUserId: vi.fn(),
  mockHasCapability: vi.fn(),
  mockLogAuditEvent: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    associationRoleGrant: mockGrant,
    user: mockUser,
    team: mockTeam,
    division: mockDivision,
    season: mockSeason,
    event: mockEvent,
    signupEvent: mockSignupEvent,
    invitation: mockInvitation,
  },
}));

vi.mock("@/lib/auth/session", () => ({ requireUserId: mockRequireUserId }));

vi.mock("@/lib/utils/security", () => ({
  AuditAction: { USER_ROLE_ASSIGNED: "user_role_assigned", USER_ROLE_REMOVED: "user_role_removed" },
  logAuditEvent: mockLogAuditEvent,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// The capability resolver has its own suite; here it is a seam so these tests
// assert the action's authorization *decisions*, not the resolver's internals.
vi.mock("@/lib/auth/capabilities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/capabilities")>();
  return { ...actual, hasCapability: mockHasCapability };
});

import {
  grantAssociationResponsibility,
  inviteAssociationOperator,
  listAssociationResponsibilityGrants,
  revokeAssociationResponsibility,
} from "@/lib/actions/association-roles";
import { applyInvitationResponsibility } from "@/lib/services/association-roles";

const LEAGUE = "clfleague0000000000000001";
const SUBJECT = "clfuser00000000000000001";
const TEAM = "clfteam00000000000000001";
const DIVISION = "clfdiv0000000000000000001";
const SEASON = "clfseason00000000000000001";
const EVENT = "clfevent000000000000000001";

const validGrant = {
  leagueId: LEAGUE,
  userId: SUBJECT,
  role: "TEAM_MANAGER" as const,
  scopeType: "TEAM" as const,
  teamId: TEAM,
};

describe("association responsibility grants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUserId.mockResolvedValue("admin-1");
    mockHasCapability.mockResolvedValue(true);
    mockUser.findUnique.mockResolvedValue({ id: SUBJECT });
    mockTeam.findFirst.mockResolvedValue({ id: TEAM });
    mockDivision.findFirst.mockResolvedValue({ id: DIVISION });
    mockSeason.findFirst.mockResolvedValue({ id: SEASON });
    mockEvent.findFirst.mockResolvedValue({ id: EVENT });
    mockGrant.findFirst.mockResolvedValue(null);
    mockGrant.create.mockResolvedValue({ id: "grant-1" });
  });

  describe("granting", () => {
    it("creates a scoped grant and records it in the audit log", async () => {
      const result = await grantAssociationResponsibility(validGrant);

      expect(result).toEqual({ success: true, data: { id: "grant-1" } });
      expect(mockGrant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: SUBJECT,
            leagueId: LEAGUE,
            role: "TEAM_MANAGER",
            scopeType: "TEAM",
            teamId: TEAM,
            grantedById: "admin-1",
          }),
        }),
      );
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: "user_role_assigned" }),
      );
    });

    it("refuses a caller without association administration", async () => {
      mockHasCapability.mockResolvedValue(false);

      const result = await grantAssociationResponsibility(validGrant);

      expect(result.success).toBe(false);
      expect(mockGrant.create).not.toHaveBeenCalled();
    });

    it("blocks privilege escalation by a delegate", async () => {
      // A scheduler holds MANAGE_SCHEDULE but not ADMINISTER_ASSOCIATION, so
      // the capability gate declines and they cannot mint themselves a broader
      // role.
      mockHasCapability.mockResolvedValue(false);

      const result = await grantAssociationResponsibility({
        ...validGrant,
        userId: "clfuser00000000000000002",
        role: "ASSOCIATION_ADMIN",
        scopeType: "ASSOCIATION",
        teamId: undefined,
      });

      expect(result.success).toBe(false);
      expect(mockGrant.create).not.toHaveBeenCalled();
    });

    it("rejects a role at a scope it does not support", async () => {
      const result = await grantAssociationResponsibility({
        ...validGrant,
        role: "TREASURER",
      });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toMatch(/cannot be granted at TEAM scope/);
      expect(mockGrant.create).not.toHaveBeenCalled();
    });

    it("requires the scope id the scope type names", async () => {
      const result = await grantAssociationResponsibility({
        ...validGrant,
        teamId: undefined,
      });

      expect(result.success).toBe(false);
      expect(mockGrant.create).not.toHaveBeenCalled();
    });

    it("drops scope ids that do not belong to the declared scope type", async () => {
      // Sending extra ids must not smuggle a second scope past the database
      // CHECK; only the one scopeType names is written.
      await grantAssociationResponsibility({
        ...validGrant,
        seasonId: SEASON,
        eventId: EVENT,
      });

      expect(mockGrant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ teamId: TEAM, seasonId: null, eventId: null }),
        }),
      );
    });

    it("rejects a scope belonging to another association", async () => {
      mockTeam.findFirst.mockResolvedValue(null);

      const result = await grantAssociationResponsibility(validGrant);

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toMatch(/does not belong to this association/);
      expect(mockGrant.create).not.toHaveBeenCalled();
    });

    it("rejects an unknown subject", async () => {
      mockUser.findUnique.mockResolvedValue(null);

      const result = await grantAssociationResponsibility(validGrant);

      expect(result.success).toBe(false);
      expect(mockGrant.create).not.toHaveBeenCalled();
    });

    it("is idempotent for an identical live grant", async () => {
      mockGrant.findFirst.mockResolvedValue({ id: "existing-1" });

      const result = await grantAssociationResponsibility(validGrant);

      expect(result).toEqual({ success: true, data: { id: "existing-1" } });
      expect(mockGrant.create).not.toHaveBeenCalled();
    });

    it("accepts an equipment manager at association, division, and team scope", async () => {
      for (const [scopeType, extra] of [
        ["ASSOCIATION", {}],
        ["DIVISION", { divisionId: DIVISION }],
        ["TEAM", { teamId: TEAM }],
      ] as const) {
        mockGrant.create.mockClear();
        const result = await grantAssociationResponsibility({
          leagueId: LEAGUE,
          userId: SUBJECT,
          role: "EQUIPMENT_MANAGER",
          scopeType,
          ...extra,
        });
        expect(result.success, `${scopeType} should be accepted`).toBe(true);
      }
    });

    it("refuses an equipment manager at season or event scope", async () => {
      for (const [scopeType, extra] of [
        ["SEASON", { seasonId: SEASON }],
        ["EVENT", { eventId: EVENT }],
      ] as const) {
        mockGrant.create.mockClear();
        const result = await grantAssociationResponsibility({
          leagueId: LEAGUE,
          userId: SUBJECT,
          role: "EQUIPMENT_MANAGER",
          scopeType,
          ...extra,
        });
        expect(result.success, `${scopeType} should be refused`).toBe(false);
        expect(mockGrant.create).not.toHaveBeenCalled();
      }
    });
  });

  describe("revoking", () => {
    it("marks the grant revoked and stamps who did it", async () => {
      mockGrant.findFirst.mockResolvedValue({
        id: "grant-1",
        state: "ACTIVE",
        userId: SUBJECT,
        role: "TEAM_MANAGER",
        teamId: TEAM,
      });

      const result = await revokeAssociationResponsibility({
        grantId: "clfgrant00000000000000001",
        leagueId: LEAGUE,
      });

      expect(result.success).toBe(true);
      expect(mockGrant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ state: "REVOKED", revokedById: "admin-1" }),
        }),
      );
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: "user_role_removed" }),
      );
    });

    it("scopes the lookup by league so another association's grant is untouchable", async () => {
      mockGrant.findFirst.mockResolvedValue(null);

      const result = await revokeAssociationResponsibility({
        grantId: "clfgrant00000000000000001",
        leagueId: LEAGUE,
      });

      expect(result.success).toBe(false);
      expect(mockGrant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ leagueId: LEAGUE }),
        }),
      );
      expect(mockGrant.update).not.toHaveBeenCalled();
    });

    it("is idempotent for an already revoked grant", async () => {
      mockGrant.findFirst.mockResolvedValue({
        id: "grant-1",
        state: "REVOKED",
        userId: SUBJECT,
        role: "COACH",
        teamId: TEAM,
      });

      const result = await revokeAssociationResponsibility({
        grantId: "clfgrant00000000000000001",
        leagueId: LEAGUE,
      });

      expect(result.success).toBe(true);
      expect(mockGrant.update).not.toHaveBeenCalled();
    });

    it("refuses a caller without association administration", async () => {
      mockHasCapability.mockResolvedValue(false);

      const result = await revokeAssociationResponsibility({
        grantId: "clfgrant00000000000000001",
        leagueId: LEAGUE,
      });

      expect(result.success).toBe(false);
      expect(mockGrant.update).not.toHaveBeenCalled();
    });
  });

  describe("listing", () => {
    it("returns only active grants with a readable scope label", async () => {
      mockGrant.findMany.mockResolvedValue([
        {
          id: "grant-1",
          role: "TEAM_MANAGER",
          scopeType: "TEAM",
          createdAt: new Date("2026-01-01"),
          user: { id: SUBJECT, name: "Sam", email: "sam@example.com" },
          division: null,
          team: { name: "Metro Blades" },
          season: null,
          event: null,
          signupEvent: null,
        },
        {
          id: "grant-2",
          role: "TREASURER",
          scopeType: "ASSOCIATION",
          createdAt: new Date("2026-01-02"),
          user: { id: "u2", name: null, email: "t@example.com" },
          division: null,
          team: null,
          season: null,
          event: null,
          signupEvent: null,
        },
      ]);

      const result = await listAssociationResponsibilityGrants(LEAGUE);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].scopeLabel).toBe("Metro Blades");
        expect(result.data[1].scopeLabel).toBe("Entire association");
      }
      expect(mockGrant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ leagueId: LEAGUE, state: "ACTIVE" }),
        }),
      );
    });

    it("refuses a caller without association administration", async () => {
      mockHasCapability.mockResolvedValue(false);

      const result = await listAssociationResponsibilityGrants(LEAGUE);

      expect(result.success).toBe(false);
    });
  });

  describe("inviting an operator", () => {
    beforeEach(() => {
      mockInvitation.create.mockResolvedValue({ id: "invite-1" });
    });

    it("stores the pending responsibility on the invitation", async () => {
      const result = await inviteAssociationOperator({
        leagueId: LEAGUE,
        email: "New.Person@Example.com",
        role: "VOLUNTEER_COORDINATOR",
        scopeType: "DIVISION",
        divisionId: DIVISION,
      });

      expect(result.success).toBe(true);
      expect(mockInvitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: "new.person@example.com",
            associationRole: "VOLUNTEER_COORDINATOR",
            associationScopeType: "DIVISION",
            associationDivisionId: DIVISION,
          }),
        }),
      );
    });

    it("refuses a role/scope pairing the matrix does not support", async () => {
      const result = await inviteAssociationOperator({
        leagueId: LEAGUE,
        email: "person@example.com",
        role: "TREASURER",
        scopeType: "TEAM",
        teamId: TEAM,
      });

      expect(result.success).toBe(false);
      expect(mockInvitation.create).not.toHaveBeenCalled();
    });

    it("refuses a caller without association administration", async () => {
      mockHasCapability.mockResolvedValue(false);

      const result = await inviteAssociationOperator({
        leagueId: LEAGUE,
        email: "person@example.com",
        role: "COACH",
        scopeType: "TEAM",
        teamId: TEAM,
      });

      expect(result.success).toBe(false);
      expect(mockInvitation.create).not.toHaveBeenCalled();
    });
  });
});

describe("applying a responsibility at invitation acceptance", () => {
  const tx = {
    associationRoleGrant: { findFirst: vi.fn(), create: vi.fn() },
  } as unknown as Parameters<typeof applyInvitationResponsibility>[0];

  const txMocks = tx as unknown as {
    associationRoleGrant: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  };

  const invitation = {
    leagueId: LEAGUE,
    teamId: TEAM,
    invitedById: "admin-1",
    associationRole: "TEAM_MANAGER" as const,
    associationScopeType: "TEAM" as const,
    associationDivisionId: null,
    associationSeasonId: null,
    associationEventId: null,
    associationSignupEventId: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    txMocks.associationRoleGrant.findFirst.mockResolvedValue(null);
  });

  it("creates the grant the invitation carried", async () => {
    await applyInvitationResponsibility(tx, invitation, SUBJECT);

    expect(txMocks.associationRoleGrant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: SUBJECT,
          leagueId: LEAGUE,
          role: "TEAM_MANAGER",
          scopeType: "TEAM",
          teamId: TEAM,
          grantedById: "admin-1",
        }),
      }),
    );
  });

  it("does nothing when the invitation carries no responsibility", async () => {
    await applyInvitationResponsibility(
      tx,
      { ...invitation, associationRole: null, associationScopeType: null },
      SUBJECT,
    );

    expect(txMocks.associationRoleGrant.create).not.toHaveBeenCalled();
  });

  it("re-validates the pairing so a since-tightened matrix wins", async () => {
    // The invitation was written when this pairing was allowed; acceptance must
    // apply today's rules, not the ones in force when it was sent.
    await applyInvitationResponsibility(
      tx,
      { ...invitation, associationRole: "TREASURER", associationScopeType: "TEAM" },
      SUBJECT,
    );

    expect(txMocks.associationRoleGrant.create).not.toHaveBeenCalled();
  });

  it("does not duplicate an existing live grant", async () => {
    txMocks.associationRoleGrant.findFirst.mockResolvedValue({ id: "existing" });

    await applyInvitationResponsibility(tx, invitation, SUBJECT);

    expect(txMocks.associationRoleGrant.create).not.toHaveBeenCalled();
  });

  it("skips an invitation with no association", async () => {
    await applyInvitationResponsibility(tx, { ...invitation, leagueId: null }, SUBJECT);

    expect(txMocks.associationRoleGrant.create).not.toHaveBeenCalled();
  });
});
