"use server";

import { requireUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  activeAllocationQuantity,
  canTransitionAllocation,
  canTransitionReservation,
  isOutstandingAllocationOverdue,
} from "@/lib/utils/gear";

export type GearInventoryContext = {
  league: { id: string; name: string };
  canManageInventory: boolean;
  summary: {
    pooledOnHand: number;
    pooledAvailable: number;
    taggedUnits: number;
    taggedAvailable: number;
  };
  locations: Array<{
    id: string;
    name: string;
    address?: string | null;
    privateNotes?: string | null;
    isActive: boolean;
  }>;
  catalogItems: Array<{
    id: string;
    name: string;
    category: string;
    size: string | null;
    brand: string | null;
    model: string | null;
    description: string | null;
    trackingMode: "POOLED" | "INDIVIDUAL";
    isActive: boolean;
  }>;
  pooledStock: Array<{
    id: string;
    catalogItemId: string;
    catalogName: string;
    category: string;
    locationId: string;
    locationName: string;
    condition: "NEW" | "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "DAMAGED";
    quantityOnHand: number;
    committedQuantity: number;
    availableQuantity: number;
    version: number;
  }>;
  units: Array<{
    id: string;
    catalogItemId: string;
    catalogName: string;
    assetTag: string | null;
    serialNumber?: string | null;
    status: "AVAILABLE" | "RESERVED" | "CHECKED_OUT" | "MAINTENANCE" | "RETIRED" | "LOST";
    currentCondition: "NEW" | "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "DAMAGED";
    currentLocationId: string | null;
    currentLocationName: string | null;
    acquiredAt?: string | null;
    retiredAt?: string | null;
    version?: number;
    notes?: string | null;
  }>;
  recentActivity: {
    page: number;
    search: string;
    hasMore: boolean;
    items: Array<{
      id: string;
      type: string;
      direction: "INCREASE" | "DECREASE" | "NEUTRAL";
      quantity: number;
      poolStockId: string | null;
      gearUnitId: string | null;
      catalogName: string | null;
      assetTag: string | null;
      beforeLocationName: string | null;
      afterLocationName: string | null;
      beforeCondition: "NEW" | "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "DAMAGED" | null;
      afterCondition: "NEW" | "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "DAMAGED" | null;
      actorName: string | null;
      occurredAt: string;
      notes: string | null;
    }>;
  };
};

const activeAllocationStatuses = ["PENDING", "ALLOCATED", "PICKED_UP", "PARTIALLY_RETURNED"] as const;

/** Returns only records in the caller's league and redacts admin-only operational notes. */
export async function getGearInventoryContext(
  leagueId: string,
  options?: { activityPage?: number; activitySearch?: string },
): Promise<GearInventoryContext | null> {
  const userId = await requireUserId();
  const membership = await prisma.leagueUser.findFirst({
    where: { leagueId, userId, league: { isActive: true } },
    select: { role: true, league: { select: { id: true, name: true } } },
  });
  if (!membership) return null;

  const canManageInventory = membership.role === "LEAGUE_ADMIN";
  const activityPage = Math.max(1, Math.floor(options?.activityPage ?? 1));
  const activitySearch = options?.activitySearch?.trim().slice(0, 100) ?? "";
  const [locations, catalogItems, stocks, units, movements] = await Promise.all([
    prisma.gearStorageLocation.findMany({
      where: { leagueId },
      select: {
        id: true, name: true, address: canManageInventory, privateNotes: canManageInventory,
        isActive: true,
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    prisma.gearCatalogItem.findMany({
      where: { leagueId },
      select: {
        id: true, name: true, category: true, size: true, brand: true, model: true,
        description: true, trackingMode: true, isActive: true,
      },
      orderBy: [{ isActive: "desc" }, { category: "asc" }, { name: "asc" }],
    }),
    prisma.gearPoolStock.findMany({
      where: { leagueId },
      select: {
        id: true, catalogItemId: true, locationId: true, condition: true, quantityOnHand: true, version: true,
        catalogItem: { select: { name: true, category: true } },
        location: { select: { name: true } },
        allocations: {
          where: { status: { in: [...activeAllocationStatuses] } },
          select: { allocatedQty: true, releasedQty: true, returnedQty: true, pickedUpQty: true },
        },
      },
      orderBy: [{ catalogItem: { name: "asc" } }, { location: { name: "asc" } }],
    }),
    prisma.gearUnit.findMany({
      where: { leagueId },
      select: {
        id: true, catalogItemId: true, assetTag: true, serialNumber: canManageInventory, status: true,
        currentCondition: true, currentLocationId: true, acquiredAt: canManageInventory, retiredAt: canManageInventory,
        version: canManageInventory,
        notes: canManageInventory,
        catalogItem: { select: { name: true } },
        currentLocation: { select: { name: true } },
      },
      orderBy: [{ status: "asc" }, { assetTag: "asc" }],
    }),
    canManageInventory
      ? prisma.gearInventoryMovement.findMany({
          where: {
            leagueId,
            ...(activitySearch ? {
              OR: [
                { poolStock: { catalogItem: { name: { contains: activitySearch, mode: "insensitive" } } } },
                { gearUnit: { assetTag: { contains: activitySearch, mode: "insensitive" } } },
                { gearUnit: { catalogItem: { name: { contains: activitySearch, mode: "insensitive" } } } },
              ],
            } : {}),
          },
          select: {
            id: true, type: true, direction: true, quantity: true, poolStockId: true, gearUnitId: true,
            beforeCondition: true, afterCondition: true, occurredAt: true, notes: true,
            beforeLocation: { select: { name: true } },
            afterLocation: { select: { name: true } },
            poolStock: { select: { catalogItem: { select: { name: true } } } },
            gearUnit: { select: { assetTag: true, catalogItem: { select: { name: true } } } },
            recordedBy: { select: { name: true } },
          },
          orderBy: { occurredAt: "desc" },
          skip: (activityPage - 1) * 20,
          take: 21,
        })
      : Promise.resolve([]),
  ]);

  const pooledStock = stocks.map((stock) => {
    const committedQuantity = stock.allocations.reduce(
      (sum, allocation) => sum + activeAllocationQuantity(allocation),
      0,
    );
    return {
      id: stock.id,
      catalogItemId: stock.catalogItemId,
      catalogName: stock.catalogItem.name,
      category: stock.catalogItem.category,
      locationId: stock.locationId,
      locationName: stock.location.name,
      condition: stock.condition,
      quantityOnHand: stock.quantityOnHand,
      committedQuantity,
      availableQuantity: Math.max(0, stock.quantityOnHand - committedQuantity),
      version: stock.version,
    };
  });

  const taggedUnits = units.map((unit) => ({
    id: unit.id,
    catalogItemId: unit.catalogItemId,
    catalogName: unit.catalogItem.name,
    assetTag: unit.assetTag,
    ...(canManageInventory ? { serialNumber: unit.serialNumber } : {}),
    status: unit.status,
    currentCondition: unit.currentCondition,
    currentLocationId: unit.currentLocationId,
    currentLocationName: unit.currentLocation?.name ?? null,
    ...(canManageInventory ? {
      acquiredAt: unit.acquiredAt?.toISOString() ?? null,
      retiredAt: unit.retiredAt?.toISOString() ?? null,
      version: unit.version,
      notes: unit.notes,
    } : {}),
  }));

  return {
    league: membership.league,
    canManageInventory,
    summary: {
      pooledOnHand: pooledStock.reduce((sum, stock) => sum + stock.quantityOnHand, 0),
      pooledAvailable: pooledStock.reduce((sum, stock) => sum + stock.availableQuantity, 0),
      taggedUnits: taggedUnits.length,
      taggedAvailable: taggedUnits.filter((unit) => unit.status === "AVAILABLE").length,
    },
    locations: locations.map((location) => ({
      id: location.id,
      name: location.name,
      isActive: location.isActive,
      ...(canManageInventory ? { address: location.address, privateNotes: location.privateNotes } : {}),
    })),
    catalogItems,
    pooledStock,
    units: taggedUnits,
    recentActivity: {
      page: activityPage,
      search: activitySearch,
      hasMore: movements.length > 20,
      items: movements.slice(0, 20).map((movement) => ({
      id: movement.id,
      type: movement.type,
      direction: movement.direction,
      quantity: movement.quantity,
      poolStockId: movement.poolStockId,
      gearUnitId: movement.gearUnitId,
      catalogName: movement.poolStock?.catalogItem.name ?? movement.gearUnit?.catalogItem.name ?? null,
      assetTag: movement.gearUnit?.assetTag ?? null,
      beforeLocationName: movement.beforeLocation?.name ?? null,
      afterLocationName: movement.afterLocation?.name ?? null,
      beforeCondition: movement.beforeCondition,
      afterCondition: movement.afterCondition,
      actorName: movement.recordedBy?.name ?? null,
      occurredAt: movement.occurredAt.toISOString(),
      notes: movement.notes,
      })),
    },
  };
}

export type GearReservationCapabilities = {
  canApproveAndAllocate: boolean;
  canDecline: boolean;
  canReschedule: boolean;
  canCancel: boolean;
};

export type GearAllocationCapabilities = {
  canRecordPickup: boolean;
  canRecordReturn: boolean;
  canRelease: boolean;
};

export type GearReservationContext = {
  league: { id: string; name: string };
  canManageReservations: boolean;
  canRequestReservations: boolean;
  teamIds: string[];
  requestableTeams: Array<{ id: string; name: string }>;
  catalogItems: Array<{ id: string; name: string; trackingMode: "POOLED" | "INDIVIDUAL" }>;
  reservations: Array<{
    id: string;
    teamId: string;
    teamName: string;
    status: "DRAFT" | "REQUESTED" | "APPROVED" | "DECLINED" | "CANCELED" | "FULFILLED" | "CLOSED";
    requestedStartDate: string;
    requestedEndDate: string;
    approvedStartDate: string | null;
    approvedEndDate: string | null;
    custodianName: string;
    requestNotes: string | null;
    decisionNotes?: string | null;
    version: number;
    capabilities: GearReservationCapabilities;
    overdue: boolean;
    reallocationWarning: boolean;
    lines: Array<{
      id: string;
      catalogItemId: string | null;
      name: string;
      requestedQty: number;
      approvedQty: number;
      allocatedQty: number;
    }>;
    allocations: Array<{
      id: string;
      status: "PENDING" | "ALLOCATED" | "PICKED_UP" | "PARTIALLY_RETURNED" | "RETURNED" | "RELEASED";
      allocatedQty: number;
      pickedUpQty: number;
      returnedQty: number;
      releasedQty: number;
      outstandingQty: number;
      poolStockId: string | null;
      gearUnitId: string | null;
      assetTag: string | null;
      locationName: string | null;
      effectiveStartDate: string | null;
      effectiveEndDate: string | null;
      overdue: boolean;
      version: number;
      capabilities: GearAllocationCapabilities;
    }>;
  }>;
};

/**
 * Reservation visibility is deliberately narrower than inventory visibility:
 * members see only teams they belong to, while league administrators see the
 * association-wide operational queue and decision notes.
 */
export async function getGearReservationContext(leagueId: string): Promise<GearReservationContext | null> {
  const userId = await requireUserId();
  const membership = await prisma.leagueUser.findFirst({
    where: { leagueId, userId, league: { isActive: true } },
    select: { role: true, league: { select: { id: true, name: true } } },
  });
  if (!membership) return null;

  const canManageReservations = membership.role === "LEAGUE_ADMIN";
  const teamMemberships = canManageReservations
    ? await prisma.team.findMany({
        where: { leagueId, isActive: true },
        select: { id: true },
      })
    : await prisma.teamMember.findMany({
        where: { userId, team: { leagueId, isActive: true } },
        select: { teamId: true },
      });
  const teamIds = teamMemberships.map((membership) => "teamId" in membership ? membership.teamId : membership.id);
  const requestableTeams = canManageReservations
    ? await prisma.team.findMany({
        where: { leagueId, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : await prisma.teamMember.findMany({
        where: { userId, role: "ADMIN", team: { leagueId, isActive: true } },
        select: { team: { select: { id: true, name: true } } },
        orderBy: { team: { name: "asc" } },
      }).then((memberships) => memberships.map((membership) => membership.team));
  const catalogItems = await prisma.gearCatalogItem.findMany({
    where: { leagueId, isActive: true },
    select: { id: true, name: true, trackingMode: true },
    orderBy: { name: "asc" },
  });
  const requestableTeamIds = new Set(
    requestableTeams
      .filter((team): team is { id: string; name: string } => Boolean(team))
      .map((team) => team.id),
  );
  const canRequestReservations = canManageReservations || requestableTeamIds.size > 0;
  if (teamIds.length === 0) {
    return {
      league: membership.league, canManageReservations, canRequestReservations,
      teamIds, requestableTeams, catalogItems, reservations: [],
    };
  }

  const reservations = await prisma.gearReservation.findMany({
    where: { leagueId, teamId: { in: teamIds } },
    select: {
      id: true, teamId: true, status: true, requestedStartDate: true, requestedEndDate: true,
      approvedStartDate: true, approvedEndDate: true,
      custodianNameSnapshot: true, requestNotes: true, decisionNotes: canManageReservations,
      version: true, team: { select: { name: true } },
      lines: {
        select: {
          id: true, catalogItemId: true, nameSnapshot: true, requestedQty: true, approvedQty: true, allocatedQty: true,
          allocations: {
            select: {
              id: true, status: true, allocatedQty: true, pickedUpQty: true, returnedQty: true,
              releasedQty: true, effectiveStartDate: true, effectiveEndDate: true,
              poolStockId: true, gearUnitId: true, version: true,
              poolStock: { select: { location: { select: { name: true } } } },
              gearUnit: { select: { assetTag: true } },
            },
          },
        },
      },
    },
    orderBy: [{ requestedStartDate: "asc" }, { createdAt: "desc" }],
  });

  const today = new Date();
  const poolStocks = await prisma.gearPoolStock.findMany({
    where: { leagueId },
    select: {
      id: true,
      quantityOnHand: true,
      allocations: {
        where: {
          status: { in: ["PENDING", "ALLOCATED", "PICKED_UP", "PARTIALLY_RETURNED"] },
          effectiveEndDate: { gt: today },
        },
        select: { allocatedQty: true, pickedUpQty: true, returnedQty: true, releasedQty: true },
      },
    },
  });
  const reallocationWarningByStockId = new Set(
    poolStocks
      .filter((stock) => stock.allocations.reduce(
        (total, allocation) => total + activeAllocationQuantity(allocation),
        0,
      ) > stock.quantityOnHand)
      .map((stock) => stock.id),
  );
  return {
    league: membership.league,
    canManageReservations,
    canRequestReservations,
    teamIds,
    requestableTeams,
    catalogItems,
    reservations: reservations.map((reservation) => {
      const activeAllocations = reservation.lines.flatMap((line) => line.allocations)
        .filter((allocation) => ["PENDING", "ALLOCATED", "PICKED_UP", "PARTIALLY_RETURNED"].includes(allocation.status));
      const reallocationWarning = activeAllocations.some((allocation) =>
        allocation.poolStockId !== null
        && (reservation.approvedStartDate ?? reservation.requestedStartDate) > today
        && reallocationWarningByStockId.has(allocation.poolStockId),
      );
      const outstandingCustody = activeAllocations.some((allocation) =>
        ["PICKED_UP", "PARTIALLY_RETURNED"].includes(allocation.status)
        && allocation.pickedUpQty > allocation.returnedQty,
      );
      const isRequester = requestableTeamIds.has(reservation.teamId);
      const allocatableLines = reservation.lines.some((line) => line.catalogItemId !== null);
      return {
        id: reservation.id,
        teamId: reservation.teamId,
        teamName: reservation.team.name,
        status: reservation.status,
        requestedStartDate: reservation.requestedStartDate.toISOString(),
        requestedEndDate: reservation.requestedEndDate.toISOString(),
        approvedStartDate: reservation.approvedStartDate?.toISOString() ?? null,
        approvedEndDate: reservation.approvedEndDate?.toISOString() ?? null,
        custodianName: reservation.custodianNameSnapshot,
        requestNotes: reservation.requestNotes,
        ...(canManageReservations ? { decisionNotes: reservation.decisionNotes } : {}),
        version: reservation.version,
        capabilities: {
          canApproveAndAllocate: canManageReservations
            && allocatableLines
            && ["REQUESTED", "APPROVED"].includes(reservation.status),
          canDecline: canManageReservations && canTransitionReservation(reservation.status, "DECLINED"),
          canReschedule: (canManageReservations || isRequester)
            && ["DRAFT", "REQUESTED", "APPROVED"].includes(reservation.status),
          canCancel: (canManageReservations || isRequester)
            && canTransitionReservation(reservation.status, "CANCELED")
            && !outstandingCustody,
        },
        overdue: activeAllocations.some((allocation) =>
          isOutstandingAllocationOverdue(allocation, today),
        ),
        reallocationWarning,
        lines: reservation.lines.map((line) => ({
          id: line.id,
          catalogItemId: line.catalogItemId,
          name: line.nameSnapshot,
          requestedQty: line.requestedQty,
          approvedQty: line.approvedQty,
          allocatedQty: line.allocatedQty,
        })),
        allocations: reservation.lines.flatMap((line) => line.allocations.map((allocation) => {
          const outstandingQty = Math.max(0, allocation.pickedUpQty - allocation.returnedQty);
          // Pickup mirrors the server guard: a due date already in the past
          // blocks checkout regardless of the allocation's current status.
          const dueDatePassed = isOutstandingAllocationOverdue(
            { status: "PICKED_UP", effectiveEndDate: allocation.effectiveEndDate },
            today,
          );
          return {
            id: allocation.id,
            status: allocation.status,
            allocatedQty: allocation.allocatedQty,
            pickedUpQty: allocation.pickedUpQty,
            returnedQty: allocation.returnedQty,
            releasedQty: allocation.releasedQty,
            outstandingQty,
            poolStockId: allocation.poolStockId,
            gearUnitId: allocation.gearUnitId,
            assetTag: allocation.gearUnit?.assetTag ?? null,
            locationName: allocation.poolStock?.location.name ?? null,
            effectiveStartDate: allocation.effectiveStartDate?.toISOString() ?? null,
            effectiveEndDate: allocation.effectiveEndDate?.toISOString() ?? null,
            overdue: isOutstandingAllocationOverdue(allocation, today),
            version: allocation.version,
            capabilities: {
              canRecordPickup: canManageReservations
                && allocation.status === "ALLOCATED"
                && allocation.pickedUpQty === 0
                && !dueDatePassed,
              canRecordReturn: canManageReservations
                && ["PICKED_UP", "PARTIALLY_RETURNED"].includes(allocation.status)
                && outstandingQty > 0,
              canRelease: canManageReservations
                && canTransitionAllocation(allocation.status, "RELEASED")
                && allocation.pickedUpQty === 0,
            },
          };
        })),
      };
    }),
  };
}
