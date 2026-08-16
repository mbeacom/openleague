"use server";

import { requireUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  activeAllocationQuantity,
  allocationConsumesCapacityForWindow,
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
    notes?: string | null;
    version?: number;
  }>;
  recentActivity: {
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
    page: number;
    hasMore: boolean;
    search: string;
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
  const activityWhere = {
    leagueId,
    ...(activitySearch
      ? {
          OR: [
            { notes: { contains: activitySearch, mode: "insensitive" as const } },
            { poolStock: { catalogItem: { name: { contains: activitySearch, mode: "insensitive" as const } } } },
            {
              gearUnit: {
                OR: [
                  { assetTag: { contains: activitySearch, mode: "insensitive" as const } },
                  { catalogItem: { name: { contains: activitySearch, mode: "insensitive" as const } } },
                ],
              },
            },
          ],
        }
      : {}),
  };
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
          where: activityWhere,
          select: {
            id: true, type: true, quantity: true, poolStockId: true, gearUnitId: true,
            direction: true, beforeCondition: true, afterCondition: true, occurredAt: true, notes: true,
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
    ...(canManageInventory ? {
      serialNumber: unit.serialNumber,
      acquiredAt: unit.acquiredAt?.toISOString() ?? null,
      retiredAt: unit.retiredAt?.toISOString() ?? null,
      notes: unit.notes,
      version: unit.version,
    } : {}),
    status: unit.status,
    currentCondition: unit.currentCondition,
    currentLocationId: unit.currentLocationId,
    currentLocationName: unit.currentLocation?.name ?? null,
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
      page: activityPage,
      hasMore: movements.length > 20,
      search: activitySearch,
    },
  };
}

export type GearReservationContext = {
  league: { id: string; name: string };
  canManageReservations: boolean;
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
    custodianName: string;
    requestNotes: string | null;
    decisionNotes?: string | null;
    version: number;
    overdue: boolean;
    reallocationWarning: boolean;
    lines: Array<{
      id: string;
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
      poolStockId: string | null;
      gearUnitId: string | null;
      assetTag: string | null;
      locationName: string | null;
      version: number;
    }>;
  }>;
};

/**
 * Reservation visibility is deliberately narrower than inventory visibility:
 * only league and owning-team administrators can view custody records, while
 * league administrators alone see association-wide decision notes.
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
        where: { userId, role: "ADMIN", team: { leagueId, isActive: true } },
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
  if (teamIds.length === 0) {
    return { league: membership.league, canManageReservations, teamIds, requestableTeams, catalogItems, reservations: [] };
  }

  const reservations = await prisma.gearReservation.findMany({
    where: { leagueId, teamId: { in: teamIds } },
    select: {
      id: true, teamId: true, status: true, requestedStartDate: true, requestedEndDate: true,
      custodianNameSnapshot: true, requestNotes: true, decisionNotes: canManageReservations,
      version: true, team: { select: { name: true } },
      lines: {
        select: {
          id: true, nameSnapshot: true, requestedQty: true, approvedQty: true, allocatedQty: true,
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
        },
        select: {
          id: true, status: true, allocatedQty: true, pickedUpQty: true, returnedQty: true,
          releasedQty: true, effectiveStartDate: true, effectiveEndDate: true,
        },
      },
    },
  });
  const reallocationWarningByAllocationId = new Set<string>();
  for (const stock of poolStocks) {
    for (const candidate of stock.allocations) {
      if (
        !["PENDING", "ALLOCATED"].includes(candidate.status)
        || !candidate.effectiveStartDate
        || !candidate.effectiveEndDate
      ) continue;
      const window = {
        startDate: candidate.effectiveStartDate.toISOString().slice(0, 10),
        endDate: candidate.effectiveEndDate.toISOString().slice(0, 10),
      };
      const otherCommitments = stock.allocations.reduce((total, allocation) => {
        if (allocation.id === candidate.id || !allocationConsumesCapacityForWindow(allocation, window)) {
          return total;
        }
        return total + activeAllocationQuantity(allocation);
      }, 0);
      if (stock.quantityOnHand - otherCommitments < activeAllocationQuantity(candidate)) {
        reallocationWarningByAllocationId.add(candidate.id);
      }
    }
  }
  return {
    league: membership.league,
    canManageReservations,
    teamIds,
    requestableTeams,
    catalogItems,
    reservations: reservations.map((reservation) => {
      const activeAllocations = reservation.lines.flatMap((line) => line.allocations)
        .filter((allocation) => ["PENDING", "ALLOCATED", "PICKED_UP", "PARTIALLY_RETURNED"].includes(allocation.status));
      const reallocationWarning = activeAllocations.some((allocation) =>
        allocation.poolStockId !== null && reallocationWarningByAllocationId.has(allocation.id),
      );
      return {
        id: reservation.id,
        teamId: reservation.teamId,
        teamName: reservation.team.name,
        status: reservation.status,
        requestedStartDate: reservation.requestedStartDate.toISOString(),
        requestedEndDate: reservation.requestedEndDate.toISOString(),
        custodianName: reservation.custodianNameSnapshot,
        requestNotes: reservation.requestNotes,
        ...(canManageReservations ? { decisionNotes: reservation.decisionNotes } : {}),
        version: reservation.version,
        overdue: activeAllocations.some((allocation) => isOutstandingAllocationOverdue(allocation, today)),
        reallocationWarning,
        lines: reservation.lines.map((line) => ({
          id: line.id,
          name: line.nameSnapshot,
          requestedQty: line.requestedQty,
          approvedQty: line.approvedQty,
          allocatedQty: line.allocatedQty,
        })),
        allocations: reservation.lines.flatMap((line) => line.allocations.map((allocation) => ({
          id: allocation.id,
          status: allocation.status,
          allocatedQty: allocation.allocatedQty,
          pickedUpQty: allocation.pickedUpQty,
          returnedQty: allocation.returnedQty,
          releasedQty: allocation.releasedQty,
          poolStockId: allocation.poolStockId,
          gearUnitId: allocation.gearUnitId,
          assetTag: allocation.gearUnit?.assetTag ?? null,
          locationName: allocation.poolStock?.location.name ?? null,
          version: allocation.version,
        }))),
      };
    }),
  };
}
