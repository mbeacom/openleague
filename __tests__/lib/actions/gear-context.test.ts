import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireUserId, mockPrisma } = vi.hoisted(() => ({
  mockRequireUserId: vi.fn(),
  mockPrisma: {
    leagueUser: { findFirst: vi.fn() },
    gearStorageLocation: { findMany: vi.fn() },
    gearCatalogItem: { findMany: vi.fn() },
    gearPoolStock: { findMany: vi.fn() },
    gearUnit: { findMany: vi.fn() },
    gearReservation: { findMany: vi.fn() },
    teamMember: { findMany: vi.fn() },
    team: { findMany: vi.fn() },
    gearInventoryMovement: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth/session", () => ({ requireUserId: () => mockRequireUserId() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

import { getGearInventoryContext, getGearReservationContext } from "@/lib/actions/gear-context";

const LEAGUE_ID = "cllllllllllllllllllllllll";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUserId.mockResolvedValue("cuserrrrrrrrrrrrrrrrrrrrr");
  mockPrisma.gearStorageLocation.findMany.mockResolvedValue([]);
  mockPrisma.gearCatalogItem.findMany.mockResolvedValue([]);
  mockPrisma.gearPoolStock.findMany.mockResolvedValue([]);
  mockPrisma.gearUnit.findMany.mockResolvedValue([]);
  mockPrisma.gearReservation.findMany.mockResolvedValue([]);
  mockPrisma.teamMember.findMany.mockResolvedValue([]);
  mockPrisma.team.findMany.mockResolvedValue([]);
  mockPrisma.gearInventoryMovement.findMany.mockResolvedValue([]);
});

describe("gear inventory context", () => {
  it("returns null outside the requested league", async () => {
    mockPrisma.leagueUser.findFirst.mockResolvedValue(null);
    await expect(getGearInventoryContext(LEAGUE_ID)).resolves.toBeNull();
    expect(mockPrisma.gearPoolStock.findMany).not.toHaveBeenCalled();
  });

  it("redacts private storage notes and admin activity for league members", async () => {
    mockPrisma.leagueUser.findFirst.mockResolvedValue({
      role: "MEMBER",
      league: { id: LEAGUE_ID, name: "Metro" },
    });
    mockPrisma.gearStorageLocation.findMany.mockResolvedValue([
      { id: "clocationxxxxxxxxxxxxxxxx", name: "Locker", address: null, privateNotes: null, isActive: true },
    ]);

    const result = await getGearInventoryContext(LEAGUE_ID);

    expect(result?.canManageInventory).toBe(false);
    expect(result?.locations[0]).not.toHaveProperty("privateNotes");
    expect(result?.locations[0]).not.toHaveProperty("address");
    expect(mockPrisma.gearStorageLocation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { leagueId: LEAGUE_ID },
      select: expect.objectContaining({ address: false, privateNotes: false }),
    }));
    expect(mockPrisma.gearInventoryMovement.findMany).not.toHaveBeenCalled();
  });

  it("does not serialize sensitive unit lifecycle fields to a member Flight payload", async () => {
    mockPrisma.leagueUser.findFirst.mockResolvedValue({
      role: "MEMBER",
      league: { id: LEAGUE_ID, name: "Metro" },
    });
    mockPrisma.gearUnit.findMany.mockResolvedValue([{
      id: "cunittttttttttttttttttttt",
      catalogItemId: "caaaaaaaaaaaaaaaaaaaaaaaa",
      assetTag: "TAG42",
      serialNumber: "SERIAL-PRIVATE",
      status: "AVAILABLE",
      currentCondition: "GOOD",
      currentLocationId: "clocationxxxxxxxxxxxxxxxx",
      acquiredAt: new Date("2026-01-01T00:00:00.000Z"),
      retiredAt: new Date("2026-02-01T00:00:00.000Z"),
      version: 7,
      notes: "Private service record",
      catalogItem: { name: "Helmet" },
      currentLocation: { name: "Locker" },
    }]);

    const result = await getGearInventoryContext(LEAGUE_ID);
    const serialized = JSON.stringify(result);

    expect(result?.units[0]).not.toHaveProperty("serialNumber");
    expect(result?.units[0]).not.toHaveProperty("acquiredAt");
    expect(result?.units[0]).not.toHaveProperty("retiredAt");
    expect(result?.units[0]).not.toHaveProperty("notes");
    expect(result?.units[0]).not.toHaveProperty("version");
    expect(serialized).not.toContain("SERIAL-PRIVATE");
    expect(serialized).not.toContain("Private service record");
  });

  it("returns paginated, searchable movement identity only to administrators", async () => {
    mockPrisma.leagueUser.findFirst.mockResolvedValue({
      role: "LEAGUE_ADMIN",
      league: { id: LEAGUE_ID, name: "Metro" },
    });
    mockPrisma.gearInventoryMovement.findMany.mockResolvedValue([{
      id: "cmovementxxxxxxxxxxxxxxxx",
      type: "ADJUSTMENT",
      direction: "DECREASE",
      quantity: 1,
      poolStockId: null,
      gearUnitId: "cunittttttttttttttttttttt",
      beforeCondition: "GOOD",
      afterCondition: null,
      occurredAt: new Date("2026-03-01T12:34:56.789Z"),
      notes: "Inspection failed",
      beforeLocation: { name: "Locker" },
      afterLocation: null,
      poolStock: null,
      gearUnit: { assetTag: "TAG42", catalogItem: { name: "Helmet" } },
      recordedBy: { name: "Alex Admin" },
    }]);

    const result = await getGearInventoryContext(LEAGUE_ID, {
      activityPage: 2,
      activitySearch: "helmet",
    });

    expect(mockPrisma.gearInventoryMovement.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 20,
      take: 21,
      where: expect.objectContaining({ leagueId: LEAGUE_ID }),
    }));
    expect(result?.recentActivity).toMatchObject({
      page: 2,
      search: "helmet",
      items: [{
        catalogName: "Helmet",
        assetTag: "TAG42",
        direction: "DECREASE",
        beforeCondition: "GOOD",
        actorName: "Alex Admin",
        occurredAt: "2026-03-01T12:34:56.789Z",
      }],
    });
  });

  it("withholds detailed reservations from ordinary league members", async () => {
      mockPrisma.leagueUser.findFirst.mockResolvedValue({
        role: "MEMBER",
        league: { id: LEAGUE_ID, name: "Metro" },
      });

      const result = await getGearReservationContext(LEAGUE_ID);

      expect(result?.reservations).toEqual([]);
      expect(mockPrisma.gearReservation.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.teamMember.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ role: "ADMIN" }),
      }));
  });

  it("projects overdue custody from outstanding allocation dates, not requested dates", async () => {
      const TEAM_ID = "cteeeeeeeeeeeeeeeeeeeeeee";
      mockPrisma.leagueUser.findFirst.mockResolvedValue({
        role: "MEMBER",
        league: { id: LEAGUE_ID, name: "Metro" },
      });
      mockPrisma.teamMember.findMany.mockResolvedValue([{ teamId: TEAM_ID }]);
      mockPrisma.gearReservation.findMany.mockResolvedValue([{
        id: "crrrrrrrrrrrrrrrrrrrrrrrr",
        teamId: TEAM_ID,
        team: { name: "Owning team" },
        status: "FULFILLED",
        requestedStartDate: new Date("2027-01-01"),
        requestedEndDate: new Date("2027-01-03"),
        custodianNameSnapshot: "Custodian",
        requestNotes: "Private to team admins",
        decisionNotes: "Private to league admins",
        version: 1,
        lines: [{
          id: "cliiiiiiiiiiiiiiiiiiiiiiii",
          nameSnapshot: "Helmet",
          requestedQty: 1,
          approvedQty: 1,
          allocatedQty: 1,
          allocations: [{
            id: "caaaaaaaaaaaaaaaaaaaaaaaa",
            status: "PICKED_UP",
            allocatedQty: 1,
            pickedUpQty: 1,
            returnedQty: 0,
            releasedQty: 0,
            effectiveStartDate: new Date("2026-01-01"),
            effectiveEndDate: new Date("2026-01-02"),
            poolStockId: null,
            gearUnitId: null,
            version: 1,
            poolStock: null,
            gearUnit: null,
          }],
        }],
      }]);

      const result = await getGearReservationContext(LEAGUE_ID);

      expect(result?.reservations[0]).toMatchObject({
        overdue: true,
        requestNotes: "Private to team admins",
      });
      expect(result?.reservations[0]).not.toHaveProperty("decisionNotes");
  });

  it("flags future reallocation only when overlapping custody exhausts the same pool window", async () => {
      mockPrisma.leagueUser.findFirst.mockResolvedValue({
        role: "LEAGUE_ADMIN",
        league: { id: LEAGUE_ID, name: "Metro" },
      });
      mockPrisma.team.findMany.mockResolvedValue([{ id: "cteeeeeeeeeeeeeeeeeeeeeee" }]);
      mockPrisma.gearReservation.findMany.mockResolvedValue([{
        id: "crrrrrrrrrrrrrrrrrrrrrrrr",
        teamId: "cteeeeeeeeeeeeeeeeeeeeeee",
        team: { name: "Owning team" },
        status: "APPROVED",
        requestedStartDate: new Date("2026-09-10"),
        requestedEndDate: new Date("2026-09-12"),
        custodianNameSnapshot: "Custodian",
        requestNotes: null,
        decisionNotes: null,
        version: 1,
        lines: [{
          id: "cliiiiiiiiiiiiiiiiiiiiiiii",
          nameSnapshot: "Helmet",
          requestedQty: 2,
          approvedQty: 2,
          allocatedQty: 2,
          allocations: [{
            id: "caaaaaaaaaaaaaaaaaaaaaaaa",
            status: "ALLOCATED",
            allocatedQty: 2,
            pickedUpQty: 0,
            returnedQty: 0,
            releasedQty: 0,
            effectiveStartDate: new Date("2026-09-10"),
            effectiveEndDate: new Date("2026-09-12"),
            poolStockId: "cstockkkkkkkkkkkkkkkkkkkk",
            gearUnitId: null,
            version: 1,
            poolStock: { location: { name: "Locker" } },
            gearUnit: null,
          }],
        }],
      }]);
      mockPrisma.gearPoolStock.findMany.mockResolvedValue([{
        id: "cstockkkkkkkkkkkkkkkkkkkk",
        quantityOnHand: 2,
        allocations: [
          {
            id: "caaaaaaaaaaaaaaaaaaaaaaaa",
            status: "ALLOCATED",
            allocatedQty: 2,
            pickedUpQty: 0,
            returnedQty: 0,
            releasedQty: 0,
            effectiveStartDate: new Date("2026-09-10"),
            effectiveEndDate: new Date("2026-09-12"),
          },
          {
            id: "cbbbbbbbbbbbbbbbbbbbbbbbb",
            status: "PICKED_UP",
            allocatedQty: 1,
            pickedUpQty: 1,
            returnedQty: 0,
            releasedQty: 0,
            effectiveStartDate: new Date("2026-08-01"),
            effectiveEndDate: new Date("2026-08-03"),
          },
        ],
      }]);

      const result = await getGearReservationContext(LEAGUE_ID);

      expect(result?.reservations[0]?.reallocationWarning).toBe(true);
  });
});

describe("gear reservation capabilities", () => {
  const TEAM_ID = "cteeeeeeeeeeeeeeeeeeeeeee";
  const RESERVATION_ID = "crrrrrrrrrrrrrrrrrrrrrrrr";

  function reservation(overrides: Record<string, unknown> = {}, allocations: Array<Record<string, unknown>> = []) {
    return {
      id: RESERVATION_ID,
      teamId: TEAM_ID,
      team: { name: "Owning team" },
      status: "REQUESTED",
      requestedStartDate: new Date("2027-01-01"),
      requestedEndDate: new Date("2027-01-03"),
      approvedStartDate: null,
      approvedEndDate: null,
      custodianNameSnapshot: "Custodian",
      requestNotes: null,
      decisionNotes: null,
      version: 1,
      lines: [{
        id: "cliiiiiiiiiiiiiiiiiiiiiiii",
        catalogItemId: "ccatalogiiiiiiiiiiiiiiiii",
        nameSnapshot: "Helmet",
        requestedQty: 1,
        approvedQty: 1,
        allocatedQty: allocations.length,
        allocations: allocations.map((allocation) => ({
          id: "caaaaaaaaaaaaaaaaaaaaaaaa",
          status: "ALLOCATED",
          allocatedQty: 1,
          pickedUpQty: 0,
          returnedQty: 0,
          releasedQty: 0,
          effectiveStartDate: new Date("2027-01-01"),
          effectiveEndDate: new Date("2027-01-03"),
          poolStockId: null,
          gearUnitId: null,
          version: 1,
          poolStock: null,
          gearUnit: null,
          ...allocation,
        })),
      }],
      ...overrides,
    };
  }

  function asLeagueAdmin() {
    mockPrisma.leagueUser.findFirst.mockResolvedValue({
      role: "LEAGUE_ADMIN",
      league: { id: LEAGUE_ID, name: "Metro" },
    });
    mockPrisma.team.findMany.mockResolvedValue([{ id: TEAM_ID, name: "Owning team" }]);
  }

  it("withholds cancel from administrators when no CANCELED transition exists", async () => {
    asLeagueAdmin();
    mockPrisma.gearReservation.findMany.mockResolvedValue([reservation({ status: "CLOSED" })]);

    const result = await getGearReservationContext(LEAGUE_ID);

    expect(result?.reservations[0]?.capabilities).toMatchObject({
      canCancel: false,
      canDecline: false,
      canApproveAndAllocate: false,
    });
  });

  it("withholds cancel while gear is still checked out", async () => {
    asLeagueAdmin();
    mockPrisma.gearReservation.findMany.mockResolvedValue([reservation({ status: "FULFILLED" }, [{
      status: "PICKED_UP",
      pickedUpQty: 1,
    }])]);

    const result = await getGearReservationContext(LEAGUE_ID);

    expect(result?.reservations[0]?.capabilities.canCancel).toBe(false);
  });

  it("derives approve, decline, and cancel capabilities for a requested reservation", async () => {
    asLeagueAdmin();
    mockPrisma.gearReservation.findMany.mockResolvedValue([reservation()]);

    const result = await getGearReservationContext(LEAGUE_ID);

    expect(result?.reservations[0]?.capabilities).toEqual({
      canApproveAndAllocate: true,
      canDecline: true,
      canReschedule: true,
      canCancel: true,
    });
  });

  it("blocks pickup capability once the allocation due date has passed", async () => {
    asLeagueAdmin();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    mockPrisma.gearReservation.findMany.mockResolvedValue([reservation({ status: "APPROVED" }, [{
      effectiveStartDate: new Date("2020-01-01"),
      effectiveEndDate: yesterday,
    }])]);

    const result = await getGearReservationContext(LEAGUE_ID);

    expect(result?.reservations[0]?.allocations[0]?.capabilities).toEqual({
      canRecordPickup: false,
      canRecordReturn: false,
      canRelease: true,
    });
  });

  it("exposes return capability and outstanding custody quantity for checked-out gear", async () => {
    asLeagueAdmin();
    mockPrisma.gearReservation.findMany.mockResolvedValue([reservation({ status: "FULFILLED" }, [{
      status: "PICKED_UP",
      allocatedQty: 3,
      pickedUpQty: 3,
      returnedQty: 1,
    }])]);

    const result = await getGearReservationContext(LEAGUE_ID);

    expect(result?.reservations[0]?.allocations[0]).toMatchObject({
      outstandingQty: 2,
      effectiveStartDate: "2027-01-01T00:00:00.000Z",
      effectiveEndDate: "2027-01-03T00:00:00.000Z",
      capabilities: { canRecordPickup: false, canRecordReturn: true, canRelease: false },
    });
  });

  it("withholds every management capability from a team requester", async () => {
    mockPrisma.leagueUser.findFirst.mockResolvedValue({
      role: "MEMBER",
      league: { id: LEAGUE_ID, name: "Metro" },
    });
    mockPrisma.teamMember.findMany
      .mockResolvedValueOnce([{ teamId: TEAM_ID }])
      .mockResolvedValueOnce([{ team: { id: TEAM_ID, name: "Owning team" } }]);
    mockPrisma.gearReservation.findMany.mockResolvedValue([reservation({}, [{}])]);

    const result = await getGearReservationContext(LEAGUE_ID);

    expect(result?.reservations[0]?.capabilities).toEqual({
      canApproveAndAllocate: false,
      canDecline: false,
      canReschedule: true,
      canCancel: true,
    });
    expect(result?.reservations[0]?.allocations[0]?.capabilities).toEqual({
      canRecordPickup: false,
      canRecordReturn: false,
      canRelease: false,
    });
  });
});
