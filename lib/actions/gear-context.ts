"use server";

import { requireUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

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
          select: { allocatedQty: true, releasedQty: true },
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
      (sum, allocation) => sum + Math.max(0, allocation.allocatedQty - allocation.releasedQty),
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
