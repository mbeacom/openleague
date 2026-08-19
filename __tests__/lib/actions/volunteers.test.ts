import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockNeed,
  mockAssignment,
  mockUser,
  mockTransaction,
  mockRequireUserId,
  mockHasCapability,
  mockLoadActiveGrants,
  mockScopeBelongsToLeague,
} = vi.hoisted(() => ({
  mockNeed: {
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  mockAssignment: {
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
  },
  mockUser: { findUnique: vi.fn() },
  mockTransaction: vi.fn(),
  mockRequireUserId: vi.fn(),
  mockHasCapability: vi.fn(),
  mockLoadActiveGrants: vi.fn(),
  mockScopeBelongsToLeague: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    volunteerNeed: mockNeed,
    volunteerAssignment: mockAssignment,
    user: mockUser,
    $transaction: mockTransaction,
  },
}));

vi.mock("@/lib/auth/session", () => ({ requireUserId: mockRequireUserId }));

vi.mock("@/lib/auth/capabilities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/capabilities")>();
  return {
    ...actual,
    hasCapability: mockHasCapability,
    loadActiveGrants: mockLoadActiveGrants,
  };
});

// Tenancy validation shares the grant path's checker; here it is a seam so
// these tests assert the action's decisions rather than re-testing lookups.
vi.mock("@/lib/services/association-roles", () => ({
  scopeBelongsToLeague: mockScopeBelongsToLeague,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  assignVolunteer,
  cancelVolunteerNeed,
  completeVolunteerAssignment,
  createVolunteerNeed,
  getVolunteerBoard,
  respondToVolunteerAssignment,
  updateVolunteerNeed,
} from "@/lib/actions/volunteers";

const LEAGUE = "clfleague0000000000000001";
const NEED = "clfneed00000000000000001";
const ASSIGNMENT = "clfassign000000000000001";
const TEAM = "clfteam00000000000000001";
const VOLUNTEER = "clfuser00000000000000001";

const futureStart = new Date("2027-01-01T18:00:00Z");
const futureEnd = new Date("2027-01-01T20:00:00Z");

describe("volunteer needs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUserId.mockResolvedValue("organizer-1");
    mockHasCapability.mockResolvedValue(true);
    mockLoadActiveGrants.mockResolvedValue([]);
    mockScopeBelongsToLeague.mockResolvedValue(true);
    mockNeed.create.mockResolvedValue({ id: NEED });
    mockTransaction.mockResolvedValue([]);
  });

  it("creates a need scoped to a team", async () => {
    const result = await createVolunteerNeed({
      leagueId: LEAGUE,
      roleLabel: "Scorekeeper",
      capacity: 2,
      startAt: futureStart,
      endAt: futureEnd,
      timezone: "America/Chicago",
      teamId: TEAM,
    });

    expect(result.success).toBe(true);
    expect(mockNeed.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ roleLabel: "Scorekeeper", capacity: 2, teamId: TEAM }),
      }),
    );
  });

  it("checks the capability at the need's own scope, not the association", async () => {
    await createVolunteerNeed({
      leagueId: LEAGUE,
      roleLabel: "Scorekeeper",
      capacity: 1,
      startAt: futureStart,
      endAt: futureEnd,
      timezone: "America/Chicago",
      teamId: TEAM,
    });

    expect(mockHasCapability).toHaveBeenCalledWith(
      expect.objectContaining({ capability: "manage_volunteers", teamId: TEAM }),
    );
  });

  it("refuses a caller without the volunteer capability", async () => {
    mockHasCapability.mockResolvedValue(false);

    const result = await createVolunteerNeed({
      leagueId: LEAGUE,
      roleLabel: "Scorekeeper",
      capacity: 1,
      startAt: futureStart,
      endAt: futureEnd,
      timezone: "America/Chicago",
    });

    expect(result.success).toBe(false);
    expect(mockNeed.create).not.toHaveBeenCalled();
  });

  it("rejects an interval that ends before it starts", async () => {
    const result = await createVolunteerNeed({
      leagueId: LEAGUE,
      roleLabel: "Scorekeeper",
      capacity: 1,
      startAt: futureEnd,
      endAt: futureStart,
      timezone: "America/Chicago",
    });

    expect(result.success).toBe(false);
    expect(mockNeed.create).not.toHaveBeenCalled();
  });

  it("rejects a capacity below one", async () => {
    const result = await createVolunteerNeed({
      leagueId: LEAGUE,
      roleLabel: "Scorekeeper",
      capacity: 0,
      startAt: futureStart,
      endAt: futureEnd,
      timezone: "America/Chicago",
    });

    expect(result.success).toBe(false);
  });

  it("refuses to cut capacity below the accepted count", async () => {
    mockNeed.findUnique.mockResolvedValue({
      id: NEED,
      leagueId: LEAGUE,
      teamId: null,
      divisionId: null,
      eventId: null,
      signupEventId: null,
      acceptedCount: 3,
      status: "OPEN",
    });

    const result = await updateVolunteerNeed({ needId: NEED, capacity: 2 });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/3 volunteer/);
    expect(mockNeed.update).not.toHaveBeenCalled();
  });

  it("cancels live assignments alongside the need", async () => {
    mockNeed.findUnique.mockResolvedValue({
      id: NEED,
      leagueId: LEAGUE,
      teamId: null,
      divisionId: null,
      eventId: null,
      signupEventId: null,
    });

    const result = await cancelVolunteerNeed(NEED);

    expect(result.success).toBe(true);
    // Both writes go in one transaction so a cancelled need never keeps
    // assignments that still read as live.
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { in: ["INVITED", "ACCEPTED"] } }),
      }),
    );
  });
});

describe("volunteer assignment and capacity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUserId.mockResolvedValue(VOLUNTEER);
    mockHasCapability.mockResolvedValue(true);
    mockLoadActiveGrants.mockResolvedValue([]);
    mockScopeBelongsToLeague.mockResolvedValue(true);
    mockAssignment.create.mockResolvedValue({ id: ASSIGNMENT });
    mockAssignment.update.mockResolvedValue({ id: ASSIGNMENT });
  });

  it("refuses to assign onto a closed need", async () => {
    mockNeed.findUnique.mockResolvedValue({
      id: NEED,
      leagueId: LEAGUE,
      teamId: null,
      divisionId: null,
      eventId: null,
      signupEventId: null,
      status: "CLOSED",
    });

    const result = await assignVolunteer({ needId: NEED, userId: VOLUNTEER });

    expect(result.success).toBe(false);
    expect(mockAssignment.create).not.toHaveBeenCalled();
  });

  it("requires exactly one of user or email", async () => {
    const both = await assignVolunteer({
      needId: NEED,
      userId: VOLUNTEER,
      invitedEmail: "v@example.com",
    });
    expect(both.success).toBe(false);

    const neither = await assignVolunteer({ needId: NEED });
    expect(neither.success).toBe(false);
  });

  describe("responding", () => {
    const acceptedNeed = {
      id: NEED,
      leagueId: LEAGUE,
      capacity: 2,
      status: "OPEN",
    };

    beforeEach(() => {
      mockAssignment.findUnique.mockResolvedValue({
        id: ASSIGNMENT,
        userId: VOLUNTEER,
        status: "INVITED",
        need: acceptedNeed,
      });
      mockAssignment.updateMany.mockResolvedValue({ count: 1 });
      mockNeed.updateMany.mockResolvedValue({ count: 1 });
      // Interactive transaction: run the callback against the same mocks so
      // the two conditional writes are observable.
      mockTransaction.mockImplementation(async (fn: unknown) =>
        typeof fn === "function"
          ? (fn as (client: unknown) => unknown)({
              volunteerAssignment: mockAssignment,
              volunteerNeed: mockNeed,
            })
          : undefined,
      );
    });

    it("claims the assignment and a slot inside one transaction", async () => {
      const result = await respondToVolunteerAssignment({
        assignmentId: ASSIGNMENT,
        response: "ACCEPTED",
      });

      expect(result).toEqual({ success: true, data: { status: "ACCEPTED" } });
      // Conditional on still being INVITED: this is what stops two requests
      // for the SAME assignment from each taking a slot on a multi-slot need.
      expect(mockAssignment.updateMany).toHaveBeenCalledWith({
        where: { id: ASSIGNMENT, status: "INVITED" },
        data: expect.objectContaining({ status: "ACCEPTED" }),
      });
      // Guarded on capacity: this is what stops two different volunteers from
      // taking the same last slot. Postgres evaluates it at write time.
      expect(mockNeed.updateMany).toHaveBeenCalledWith({
        where: { id: NEED, status: "OPEN", acceptedCount: { lt: 2 } },
        data: { acceptedCount: { increment: 1 } },
      });
      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    it("reports the need full when the capacity guard matches nothing", async () => {
      mockNeed.updateMany.mockResolvedValue({ count: 0 });

      const result = await respondToVolunteerAssignment({
        assignmentId: ASSIGNMENT,
        response: "ACCEPTED",
      });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toMatch(/already full/);
    });

    it("reports an already-answered assignment when the claim matches nothing", async () => {
      // The row moved out of INVITED between the read and the write.
      mockAssignment.updateMany.mockResolvedValue({ count: 0 });

      const result = await respondToVolunteerAssignment({
        assignmentId: ASSIGNMENT,
        response: "ACCEPTED",
      });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toMatch(/already been answered/);
      // The slot is never claimed when the assignment claim fails.
      expect(mockNeed.updateMany).not.toHaveBeenCalled();
    });

    it("does not touch capacity when declining", async () => {
      const result = await respondToVolunteerAssignment({
        assignmentId: ASSIGNMENT,
        response: "DECLINED",
      });

      expect(result).toEqual({ success: true, data: { status: "DECLINED" } });
      expect(mockNeed.updateMany).not.toHaveBeenCalled();
    });

    it("refuses to answer somebody else's assignment", async () => {
      mockAssignment.findUnique.mockResolvedValue({
        id: ASSIGNMENT,
        userId: "someone-else",
        status: "INVITED",
        need: acceptedNeed,
      });

      const result = await respondToVolunteerAssignment({
        assignmentId: ASSIGNMENT,
        response: "ACCEPTED",
      });

      expect(result.success).toBe(false);
      expect(mockNeed.updateMany).not.toHaveBeenCalled();
    });

    it("refuses to answer twice", async () => {
      mockAssignment.findUnique.mockResolvedValue({
        id: ASSIGNMENT,
        userId: VOLUNTEER,
        status: "ACCEPTED",
        need: acceptedNeed,
      });

      const result = await respondToVolunteerAssignment({
        assignmentId: ASSIGNMENT,
        response: "ACCEPTED",
      });

      expect(result.success).toBe(false);
      expect(mockNeed.updateMany).not.toHaveBeenCalled();
    });
  });

  it("only closes out an accepted assignment", async () => {
    mockAssignment.findUnique.mockResolvedValue({
      id: ASSIGNMENT,
      status: "INVITED",
      need: {
        leagueId: LEAGUE,
        teamId: null,
        divisionId: null,
        eventId: null,
        signupEventId: null,
      },
    });

    const result = await completeVolunteerAssignment(ASSIGNMENT);

    expect(result.success).toBe(false);
    expect(mockAssignment.update).not.toHaveBeenCalled();
  });
});

describe("volunteer board visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUserId.mockResolvedValue(VOLUNTEER);
    mockLoadActiveGrants.mockResolvedValue([]);
    mockNeed.findMany.mockResolvedValue([]);
  });

  it("shows organizers every need with all assignments", async () => {
    mockHasCapability.mockResolvedValue(true);

    await getVolunteerBoard(LEAGUE);

    const args = mockNeed.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ leagueId: LEAGUE });
    expect(args.select.assignments.where).toEqual({});
  });

  it("treats a team-scoped coordinator as an organizer for their own team's needs", async () => {
    // The bug this covers: asking hasCapability with an empty target classified
    // every narrow coordinator as a non-organizer, so the people authorized to
    // run those shifts saw only their own rows.
    mockHasCapability.mockResolvedValue(false);
    mockLoadActiveGrants.mockResolvedValue([
      {
        role: "VOLUNTEER_COORDINATOR",
        scopeType: "TEAM",
        divisionId: null,
        teamId: TEAM,
        seasonId: null,
        eventId: null,
        signupEventId: null,
      },
    ]);
    mockNeed.findMany.mockResolvedValue([
      {
        id: "need-mine", roleLabel: "Scorekeeper", description: null, capacity: 2,
        acceptedCount: 0, status: "OPEN", startAt: new Date(), endAt: new Date(),
        timezone: "America/Chicago", teamId: TEAM, divisionId: null, eventId: null,
        signupEventId: null, team: { name: "Metro Blades", divisionId: null },
        assignments: [{ id: "a1", status: "ACCEPTED", invitedEmail: null, user: { name: "Sam", email: "s@e.com" } }],
      },
      {
        id: "need-other", roleLabel: "Timekeeper", description: null, capacity: 2,
        acceptedCount: 0, status: "OPEN", startAt: new Date(), endAt: new Date(),
        timezone: "America/Chicago", teamId: "other-team", divisionId: null, eventId: null,
        signupEventId: null, team: { name: "Harbor Hawks", divisionId: null },
        assignments: [],
      },
    ]);

    const result = await getVolunteerBoard(LEAGUE);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.isOrganizer).toBe(true);
    // Their own team's need is visible with fulfillment; the other team's is not.
    expect(result.data.needs.map((n) => n.id)).toEqual(["need-mine"]);
    expect(result.data.needs[0].assignments).toHaveLength(1);
  });

  it("shows a volunteer only needs they are assigned to, and only their own row", async () => {
    mockHasCapability.mockResolvedValue(false);
    mockLoadActiveGrants.mockResolvedValue([]);

    await getVolunteerBoard(LEAGUE);

    const args = mockNeed.findMany.mock.calls[0][0];
    // Both halves matter: the need filter hides other people's shifts, and the
    // assignment filter stops a volunteer reading who else was rostered.
    expect(args.where).toEqual({
      leagueId: LEAGUE,
      assignments: { some: { userId: VOLUNTEER } },
    });
    expect(args.select.assignments.where).toEqual({ userId: VOLUNTEER });
  });
});
