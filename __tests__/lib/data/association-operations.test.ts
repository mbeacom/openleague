import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockAuth } = vi.hoisted(() => ({
  mockPrisma: {
    iceTimeRequest: { findMany: vi.fn() },
    venueReservation: { findMany: vi.fn() },
    venueReservationOverride: { findMany: vi.fn() },
    seasonGame: { findMany: vi.fn() },
    season: { findMany: vi.fn() },
    team: { findMany: vi.fn() },
    teamGearNeed: { findMany: vi.fn() },
    gearReservation: { findMany: vi.fn() },
    notificationOutbox: { findMany: vi.fn() },
    // `fields` backs the Prisma field reference the shortage query uses to
    // compare acceptedCount against capacity in the database.
    volunteerNeed: { findMany: vi.fn(), fields: { capacity: "capacity" } },
  },
  mockAuth: { requireLeagueRole: vi.fn() },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/session", () => mockAuth);

import { getAssociationOperationsData } from "@/lib/data/association-operations";

const from = new Date("2026-09-01T00:00:00.000Z");
const to = new Date("2026-10-01T00:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.requireLeagueRole.mockResolvedValue("user-1");
  for (const model of Object.values(mockPrisma)) model.findMany?.mockResolvedValue([]);
});

describe("getAssociationOperationsData", () => {
  it("does not read another league when authorization fails", async () => {
    mockAuth.requireLeagueRole.mockRejectedValue(new Error("Unauthorized"));
    await expect(getAssociationOperationsData("league-b", { from, to })).rejects.toThrow("Unauthorized");
    for (const model of Object.values(mockPrisma)) expect(model.findMany).not.toHaveBeenCalled();
  });

  it("authenticates and authorizes the exact league before reading", async () => {
    await getAssociationOperationsData("league-a", { from, to });
    expect(mockAuth.requireLeagueRole).toHaveBeenCalledWith("league-a", "LEAGUE_ADMIN");
    for (const model of Object.values(mockPrisma)) expect(model.findMany).toHaveBeenCalled();
  });

  it("puts the league boundary in every tenant-sensitive query", async () => {
    await getAssociationOperationsData("league-a", { from, to });
    expect(mockPrisma.iceTimeRequest.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ OR: expect.arrayContaining([{ requesterLeagueId: "league-a" }]) }),
    );
    expect(mockPrisma.venueReservation.findMany.mock.calls[0][0].where.OR).toEqual(
      expect.arrayContaining([{ ownerLeagueId: "league-a" }]),
    );
    expect(mockPrisma.venueReservationOverride.findMany.mock.calls[0][0].where.reservation.OR).toEqual(
      expect.arrayContaining([{ ownerLeagueId: "league-a" }]),
    );
    expect(mockPrisma.venueReservationOverride.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({
        reason: "Legacy commitments overlap during venue reservation migration",
        candidateSnapshot: {
          path: ["migrationSource"],
          not: expect.anything(),
        },
      }),
    );
    expect(mockPrisma.seasonGame.findMany.mock.calls[0][0].where.season).toEqual({ leagueId: "league-a" });
    expect(mockPrisma.season.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ leagueId: "league-a" }),
    );
    expect(mockPrisma.team.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ leagueId: "league-a" }),
    );
    expect(mockPrisma.teamGearNeed.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ leagueId: "league-a" }),
    );
    expect(mockPrisma.gearReservation.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ leagueId: "league-a" }),
    );
    expect(mockPrisma.notificationOutbox.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({
        leagueId: "league-a",
        eventType: { startsWith: "gear." },
      }),
    );
  });

  it("returns operational summaries while excluding sensitive source fields", async () => {
    mockPrisma.iceTimeRequest.findMany.mockResolvedValue([{
      id: "request-1",
      status: "SUBMITTED",
      requestedStartAt: new Date("2026-09-03T10:00:00.000Z"),
      requestedEndAt: new Date("2026-09-03T11:00:00.000Z"),
      requesterTeam: { name: "Hawks" },
      contactEmail: "private@example.test",
      notes: "private request note",
    }]);
    mockPrisma.venueReservation.findMany.mockResolvedValue([{
      id: "reservation-1",
      startsAt: new Date("2026-09-04T10:00:00.000Z"),
      endsAt: new Date("2026-09-04T11:00:00.000Z"),
      venue: { name: "Main rink" },
      ownerTeam: null,
      events: [],
      seasonGames: [],
      signupEvents: [],
      practiceSessions: [],
      proposalEntries: [],
      privateReason: "do not expose",
    }]);
    mockPrisma.teamGearNeed.findMany.mockResolvedValue([{
      id: "need-1",
      title: "Goalie gear",
      team: { name: "Hawks" },
      lines: [{ requestedQty: 2, fulfilledQty: 0, wishlistToken: "secret" }],
    }]);
    mockPrisma.gearReservation.findMany.mockResolvedValue([{
      id: "gear-1",
      requestedEndDate: new Date("2026-08-01T00:00:00.000Z"),
      approvedEndDate: null,
      team: { name: "Hawks" },
      custodianEmailSnapshot: "custodian@example.test",
      requestNotes: "private",
    }]);
    mockPrisma.notificationOutbox.findMany.mockResolvedValue([{
      status: "FAILED",
      scheduledAt: new Date("2026-09-02T00:00:00.000Z"),
      recipientEmail: "recipient@example.test",
      payload: { secret: true },
    }]);

    const result = await getAssociationOperationsData("league-a", { from, to });
    expect(result.counts).toEqual(expect.objectContaining({
      pendingIceRequests: 1,
      unassignedReservations: 1,
      urgentGearNeeds: 1,
      overdueGearCustody: 1,
      outboxFailed: 1,
    }));
    expect(JSON.stringify(result)).not.toContain("private@example.test");
    expect(JSON.stringify(result)).not.toContain("custodian@example.test");
    expect(JSON.stringify(result)).not.toContain("recipient@example.test");
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("keeps gear custody out of venue occupancy and reports only assigned reservations", async () => {
    mockPrisma.venueReservation.findMany.mockResolvedValue([{
      id: "venue-1",
      startsAt: from,
      endsAt: to,
      venue: { name: "Main rink" },
      ownerTeam: { name: "Hawks" },
      events: [{ id: "event-1" }],
      seasonGames: [],
      signupEvents: [],
      eventGames: [],
      practiceSessions: [],
      proposalEntries: [],
    }]);
    mockPrisma.gearReservation.findMany.mockResolvedValue([{
      id: "gear-1",
      requestedEndDate: new Date("2026-08-01T00:00:00.000Z"),
      approvedEndDate: null,
      team: { name: "Hawks" },
    }]);

    const result = await getAssociationOperationsData("league-a", { from, to });
    expect(result.unassignedReservations).toHaveLength(0);
    expect(result.upcomingReservations.map((item) => item.id)).toEqual(["venue-1"]);
    expect(result.upcomingReservations.map((item) => item.id)).not.toContain("gear-1");
  });

  it("does not classify reservations linked only to an event game as unassigned", async () => {
    mockPrisma.venueReservation.findMany.mockResolvedValue([{
      id: "event-game-reservation",
      startsAt: from,
      endsAt: to,
      venue: { name: "Main rink" },
      ownerTeam: null,
      events: [],
      seasonGames: [],
      signupEvents: [],
      eventGames: [{ id: "event-game-1" }],
      practiceSessions: [],
      proposalEntries: [],
    }]);

    const result = await getAssociationOperationsData("league-a", { from, to });

    expect(result.counts.unassignedReservations).toBe(0);
    expect(result.unassignedReservations).toHaveLength(0);
    expect(mockPrisma.venueReservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          eventGames: { select: { id: true }, take: 1 },
        }),
      }),
    );
  });

  it("uses the approved gear end date as the effective overdue deadline", async () => {
    mockPrisma.gearReservation.findMany.mockResolvedValue([
      {
        id: "gear-approved-future",
        requestedEndDate: new Date("2020-08-01T00:00:00.000Z"),
        approvedEndDate: new Date("2099-08-01T00:00:00.000Z"),
        team: { name: "Hawks" },
      },
      {
        id: "gear-approved-past",
        requestedEndDate: new Date("2099-08-01T00:00:00.000Z"),
        approvedEndDate: new Date("2020-08-01T00:00:00.000Z"),
        team: { name: "Otters" },
      },
    ]);

    const result = await getAssociationOperationsData("league-a", { from, to });

    expect(result.counts.overdueGearCustody).toBe(1);
    expect(result.gear.overdueCustody.map((item) => item.id)).toEqual(["gear-approved-past"]);
    expect(mockPrisma.gearReservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { approvedEndDate: { lt: expect.any(Date) } },
            { approvedEndDate: null, requestedEndDate: { lt: expect.any(Date) } },
          ],
        }),
      }),
    );
  });

  it("matches scheduled teams by ID when team names are duplicated", async () => {
    mockPrisma.team.findMany.mockResolvedValue([
      { id: "team-a", name: "Hawks" },
      { id: "team-b", name: "Hawks" },
      { id: "team-c", name: "Otters" },
    ]);
    mockPrisma.seasonGame.findMany.mockResolvedValue([{
      id: "game-1",
      status: "SCHEDULED",
      startAt: new Date("2026-09-03T10:00:00.000Z"),
      endAt: new Date("2026-09-03T11:00:00.000Z"),
      updatedAt: new Date("2026-09-01T00:00:00.000Z"),
      venueReservationId: "reservation-1",
      conflictOverriddenAt: new Date("2026-09-01T00:00:00.000Z"),
      phase: null,
      homeTeam: { id: "team-a", name: "Hawks" },
      awayTeam: { id: "team-c", name: "Otters" },
    }]);

    const result = await getAssociationOperationsData("league-a", { from, to });

    expect(result.unscheduledTeams.map((team) => team.id)).toEqual(["team-b"]);
  });

  it("reports a missing reservation only for games that claim a venue", async () => {
    mockPrisma.seasonGame.findMany.mockResolvedValue([
      {
        id: "game-with-venue",
        status: "SCHEDULED",
        startAt: from,
        endAt: to,
        updatedAt: from,
        venueId: "venue-1",
        venueReservationId: null,
        conflictOverriddenAt: null,
        phase: null,
        homeTeam: { id: "team-a", name: "Hawks" },
        awayTeam: { id: "team-b", name: "Otters" },
      },
      {
        id: "game-without-venue",
        status: "SCHEDULED",
        startAt: from,
        endAt: to,
        updatedAt: from,
        venueId: null,
        venueReservationId: null,
        conflictOverriddenAt: null,
        phase: null,
        homeTeam: { id: "team-c", name: "Foxes" },
        awayTeam: { id: "team-d", name: "Bears" },
      },
    ]);

    const result = await getAssociationOperationsData("league-a", { from, to });

    expect(result.unresolvedConflicts.map((game) => game.id)).toEqual([
      "game-with-venue",
    ]);
  });
});
