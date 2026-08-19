"use server";

import { Prisma, type GearCondition, type GearUnitStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Permission } from "@/lib/utils/permission-types";
import { requirePermissionForLeague } from "@/lib/utils/permissions";
import { prisma } from "@/lib/db/prisma";
import {
  adjustGearPoolStockSchema,
  createGearCatalogItemSchema,
  createGearStorageLocationSchema,
  createGearUnitSchema,
} from "@/lib/utils/validation";
import { normalizeGearAssetTag, normalizeGearKey } from "@/lib/utils/gear";
import { recordGearActivity, recordGearInventoryMovement } from "@/lib/services/gear-ledger";
import {
  GearConflictError,
  gearTransactionOptions,
  withGearSerializableRetry,
} from "@/lib/services/gear-transaction";
import { logGearInventoryFailure } from "@/lib/utils/gear-observability";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

const gearIdSchema = z.string().cuid("Invalid gear identifier");
const conditionSchema = z.enum(["NEW", "EXCELLENT", "GOOD", "FAIR", "POOR", "DAMAGED"]);
const activeAllocationStatuses = ["PENDING", "ALLOCATED", "PICKED_UP", "PARTIALLY_RETURNED"] as const;

const updateLocationSchema = createGearStorageLocationSchema
  .omit({ leagueId: true })
  .partial()
  .extend({ leagueId: gearIdSchema, locationId: gearIdSchema })
  .refine((input) => Object.keys(input).some((key) => !["leagueId", "locationId"].includes(key)), {
    message: "Provide at least one location field to update",
  });
const locationCommandSchema = z.object({ leagueId: gearIdSchema, locationId: gearIdSchema });

const updateCatalogSchema = createGearCatalogItemSchema
  .omit({ leagueId: true, trackingMode: true })
  .partial()
  .extend({
    leagueId: gearIdSchema,
    catalogItemId: gearIdSchema,
    trackingMode: z.enum(["POOLED", "INDIVIDUAL"]).optional(),
  })
  .refine((input) => Object.keys(input).some((key) => !["leagueId", "catalogItemId"].includes(key)), {
    message: "Provide at least one catalog field to update",
  });
const catalogCommandSchema = z.object({ leagueId: gearIdSchema, catalogItemId: gearIdSchema });

const transferPoolStockSchema = z.object({
  leagueId: gearIdSchema,
  catalogItemId: gearIdSchema,
  sourceLocationId: gearIdSchema,
  destinationLocationId: gearIdSchema,
  condition: conditionSchema,
  quantity: z.coerce.number().int().min(1),
  expectedSourceVersion: z.coerce.number().int().min(0),
  notes: z.string().trim().max(1_000).optional(),
}).refine((input) => input.sourceLocationId !== input.destinationLocationId, {
  message: "Choose a different destination location",
  path: ["destinationLocationId"],
});

const unitCommandSchema = z.object({ leagueId: gearIdSchema, unitId: gearIdSchema });
const expectedVersionSchema = z.coerce.number().int().min(0);
const updateUnitSchema = createGearUnitSchema
  .omit({ leagueId: true, catalogItemId: true, currentLocationId: true, currentCondition: true })
  .partial()
  .extend({ leagueId: gearIdSchema, unitId: gearIdSchema, expectedVersion: expectedVersionSchema })
  .refine((input) => Object.keys(input).some((key) => !["leagueId", "unitId", "expectedVersion"].includes(key)), {
    message: "Provide at least one unit field to update",
  });
const transferUnitSchema = z.object({
  leagueId: gearIdSchema,
  unitId: gearIdSchema,
  destinationLocationId: gearIdSchema,
  expectedVersion: expectedVersionSchema,
  notes: z.string().trim().max(1_000).optional(),
});
const changeUnitConditionSchema = z.object({
  leagueId: gearIdSchema,
  unitId: gearIdSchema,
  condition: conditionSchema,
  expectedVersion: expectedVersionSchema,
  notes: z.string().trim().max(1_000).optional(),
});
const retireUnitSchema = z.object({
  leagueId: gearIdSchema,
  unitId: gearIdSchema,
  expectedVersion: expectedVersionSchema,
  notes: z.string().trim().min(1, "A retirement reason is required").max(1_000),
});
const unretireUnitSchema = z.object({
  leagueId: gearIdSchema,
  unitId: gearIdSchema,
  expectedVersion: expectedVersionSchema,
  destinationLocationId: gearIdSchema,
  condition: conditionSchema,
  notes: z.string().trim().min(1, "An unretirement reason is required").max(1_000),
});

function gearPath(leagueId: string) {
  return `/league/${leagueId}/gear`;
}

function messageForGearError(
  error: unknown,
  action = "unknown",
  input?: unknown,
): ActionResult<never> {
  const leagueId = typeof input === "object" && input !== null && "leagueId" in input && typeof input.leagueId === "string"
    ? input.leagueId
    : undefined;
  if (error instanceof GearConflictError) {
    const incidentId = error.retryExhausted ? logGearInventoryFailure(action, leagueId, error) : undefined;
    return {
      success: false,
      error: incidentId
        ? "Inventory could not be saved after concurrent updates. Please try again."
        : error.message,
    };
  }
  if (error instanceof z.ZodError) {
    return { success: false, error: "Please correct the highlighted inventory fields.", details: error.issues };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return { success: false, error: "That name or asset tag is already used in this league." };
  }
  if (error instanceof Error) {
    if (error.message.startsWith("Unauthorized")) return { success: false, error: "League admin access is required." };
    if (error.message.startsWith("Gear validation:")) return { success: false, error: error.message.slice(17) };
  }
  const incidentId = logGearInventoryFailure(action, leagueId, error);
  return { success: false, error: `Unable to update gear inventory. Please try again. Reference: ${incidentId}` };
}

function invalid(message: string): never {
  throw new Error(`Gear validation: ${message}`);
}

async function ensureActiveLocation(
  tx: Prisma.TransactionClient,
  leagueId: string,
  locationId: string,
) {
  const location = await tx.gearStorageLocation.findFirst({
    where: { id: locationId, leagueId, isActive: true },
    select: { id: true },
  });
  if (!location) invalid("The selected active storage location was not found.");
  return location;
}

async function ensureActiveCatalog(
  tx: Prisma.TransactionClient,
  leagueId: string,
  catalogItemId: string,
  trackingMode?: "POOLED" | "INDIVIDUAL",
) {
  const item = await tx.gearCatalogItem.findFirst({
    where: { id: catalogItemId, leagueId, isActive: true },
    select: { id: true, trackingMode: true },
  });
  if (!item || (trackingMode && item.trackingMode !== trackingMode)) {
    invalid("The selected active catalog item has an incompatible tracking mode.");
  }
  return item;
}

async function assertNoActiveAllocationsForStock(
  tx: Prisma.TransactionClient,
  leagueId: string,
  stockId: string,
  onHand: number,
  delta: number,
) {
  if (delta >= 0) return;
  const committed = await tx.gearAllocation.aggregate({
    where: { leagueId, poolStockId: stockId, status: { in: [...activeAllocationStatuses] } },
    _sum: { allocatedQty: true, releasedQty: true, returnedQty: true },
  });
  const commitment = Math.max(
    0,
    (committed._sum.allocatedQty ?? 0)
      - (committed._sum.releasedQty ?? 0)
      - (committed._sum.returnedQty ?? 0),
  );
  if (onHand + delta < commitment) {
    invalid(`This reduction would leave fewer items than the ${commitment} currently committed.`);
  }
}

async function assertUnitCanMove(tx: Prisma.TransactionClient, leagueId: string, unitId: string) {
  const commitments = await tx.gearAllocation.count({
    where: { leagueId, gearUnitId: unitId, status: { in: [...activeAllocationStatuses] } },
  });
  if (commitments > 0) invalid("This unit has an active commitment and cannot be changed.");
}

export async function createGearStorageLocation(
  input: z.input<typeof createGearStorageLocationSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = createGearStorageLocationSchema.parse(input);
    const userId = await requirePermissionForLeague(validated.leagueId, Permission.MANAGE_GEAR_INVENTORY);
    const location = await prisma.$transaction(async (tx) => {
      const created = await tx.gearStorageLocation.create({
        data: { ...validated, normalizedName: normalizeGearKey(validated.name) },
        select: { id: true },
      });
      await recordGearActivity(tx, {
        leagueId: validated.leagueId, entityType: "STORAGE_LOCATION", entityId: created.id,
        action: "created", actorUserId: userId,
      });
      return created;
    }, gearTransactionOptions);
    revalidatePath(gearPath(validated.leagueId));
    return { success: true, data: location };
  } catch (error) {
    return messageForGearError(error, "create-storage-location", input);
  }
}

export async function updateGearStorageLocation(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = updateLocationSchema.parse(input);
    const userId = await requirePermissionForLeague(validated.leagueId, Permission.MANAGE_GEAR_INVENTORY);
    const location = await prisma.$transaction(async (tx) => {
      const existing = await tx.gearStorageLocation.findFirst({
        where: { id: validated.locationId, leagueId: validated.leagueId },
        select: { id: true },
      });
      if (!existing) invalid("Storage location not found.");
      const { leagueId, locationId, name, ...changes } = validated;
      const updated = await tx.gearStorageLocation.update({
        where: { id: existing.id },
        data: { ...changes, ...(name ? { name, normalizedName: normalizeGearKey(name) } : {}) },
        select: { id: true },
      });
      await recordGearActivity(tx, {
        leagueId, entityType: "STORAGE_LOCATION", entityId: updated.id, action: "updated",
        actorUserId: userId,
        details: { metadata: { updatedFieldCount: Object.keys(changes).length + (name ? 1 : 0) } },
      });
      return updated;
    }, gearTransactionOptions);
    revalidatePath(gearPath(validated.leagueId));
    return { success: true, data: location };
  } catch (error) {
    return messageForGearError(error, "update-storage-location", input);
  }
}

export async function archiveGearStorageLocation(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { leagueId, locationId } = locationCommandSchema.parse(input);
    const userId = await requirePermissionForLeague(leagueId, Permission.MANAGE_GEAR_INVENTORY);
    const location = await prisma.$transaction(async (tx) => {
      const existing = await tx.gearStorageLocation.findFirst({
        where: { id: locationId, leagueId, isActive: true }, select: { id: true },
      });
      if (!existing) invalid("Active storage location not found.");
      const [stock, units, allocations] = await Promise.all([
        tx.gearPoolStock.count({ where: { leagueId, locationId, quantityOnHand: { gt: 0 } } }),
        tx.gearUnit.count({ where: { leagueId, currentLocationId: locationId, status: { notIn: ["RETIRED", "LOST"] } } }),
        tx.gearAllocation.count({
          where: {
            leagueId, status: { in: [...activeAllocationStatuses] },
            OR: [{ poolStock: { locationId } }, { gearUnit: { currentLocationId: locationId } }],
          },
        }),
      ]);
      if (stock || units || allocations) {
        invalid("Move or resolve all active stock, units, and commitments before archiving this location.");
      }
      const archived = await tx.gearStorageLocation.update({
        where: { id: existing.id }, data: { isActive: false, archivedAt: new Date() }, select: { id: true },
      });
      await recordGearActivity(tx, {
        leagueId, entityType: "STORAGE_LOCATION", entityId: archived.id, action: "archived", actorUserId: userId,
      });
      return archived;
    }, gearTransactionOptions);
    revalidatePath(gearPath(leagueId));
    return { success: true, data: location };
  } catch (error) {
    return messageForGearError(error, "archive-storage-location", input);
  }
}

export async function createGearCatalogItem(
  input: z.input<typeof createGearCatalogItemSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = createGearCatalogItemSchema.parse(input);
    const userId = await requirePermissionForLeague(validated.leagueId, Permission.MANAGE_GEAR_INVENTORY);
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.gearCatalogItem.create({
        data: { ...validated, normalizedKey: normalizeGearKey([validated.name, validated.category, validated.size ?? ""].join(" ")) },
        select: { id: true },
      });
      await recordGearActivity(tx, {
        leagueId: validated.leagueId, entityType: "CATALOG_ITEM", entityId: created.id,
        action: "created", actorUserId: userId,
        details: { metadata: { trackingMode: validated.trackingMode } },
      });
      return created;
    }, gearTransactionOptions);
    revalidatePath(gearPath(validated.leagueId));
    return { success: true, data: item };
  } catch (error) {
    return messageForGearError(error, "create-catalog-item", input);
  }
}

export async function updateGearCatalogItem(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = updateCatalogSchema.parse(input);
    const userId = await requirePermissionForLeague(validated.leagueId, Permission.MANAGE_GEAR_INVENTORY);
    const item = await prisma.$transaction(async (tx) => {
      const existing = await tx.gearCatalogItem.findFirst({
        where: { id: validated.catalogItemId, leagueId: validated.leagueId },
        select: { id: true, trackingMode: true, name: true, category: true, size: true },
      });
      if (!existing) invalid("Catalog item not found.");
      if (validated.trackingMode && validated.trackingMode !== existing.trackingMode) {
        const [stocks, units, movements] = await Promise.all([
          tx.gearPoolStock.count({ where: { catalogItemId: existing.id } }),
          tx.gearUnit.count({ where: { catalogItemId: existing.id } }),
          tx.gearInventoryMovement.count({
            where: { OR: [{ poolStock: { catalogItemId: existing.id } }, { gearUnit: { catalogItemId: existing.id } }] },
          }),
        ]);
        if (stocks || units || movements) invalid("Tracking mode cannot change after inventory or movement history exists.");
      }
      const { leagueId, catalogItemId, name, category, size, ...changes } = validated;
      const updated = await tx.gearCatalogItem.update({
        where: { id: existing.id },
        data: {
          ...changes,
          ...(name ? { name } : {}),
          ...(category ? { category } : {}),
          ...(size !== undefined ? { size } : {}),
          ...(name || category || size !== undefined
            ? {
                normalizedKey: normalizeGearKey([
                  name ?? existing.name,
                  category ?? existing.category,
                  size ?? existing.size ?? "",
                ].join(" ")),
              }
            : {}),
        },
        select: { id: true },
      });
      await recordGearActivity(tx, {
        leagueId, entityType: "CATALOG_ITEM", entityId: updated.id, action: "updated",
        actorUserId: userId,
        details: { metadata: { trackingMode: validated.trackingMode ?? existing.trackingMode } },
      });
      return updated;
    }, gearTransactionOptions);
    revalidatePath(gearPath(validated.leagueId));
    return { success: true, data: item };
  } catch (error) {
    return messageForGearError(error, "update-catalog-item", input);
  }
}

export async function archiveGearCatalogItem(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { leagueId, catalogItemId } = catalogCommandSchema.parse(input);
    const userId = await requirePermissionForLeague(leagueId, Permission.MANAGE_GEAR_INVENTORY);
    const item = await prisma.$transaction(async (tx) => {
      const existing = await tx.gearCatalogItem.findFirst({
        where: { id: catalogItemId, leagueId, isActive: true }, select: { id: true },
      });
      if (!existing) invalid("Active catalog item not found.");
      const [stock, liveUnits, movements, commitments] = await Promise.all([
        tx.gearPoolStock.count({
          where: { leagueId, catalogItemId: existing.id, quantityOnHand: { gt: 0 } },
        }),
        tx.gearUnit.count({
          where: {
            leagueId,
            catalogItemId: existing.id,
            status: { notIn: ["RETIRED", "LOST"] },
          },
        }),
        tx.gearInventoryMovement.count({
          where: {
            leagueId,
            OR: [
              { poolStock: { catalogItemId: existing.id } },
              { gearUnit: { catalogItemId: existing.id } },
            ],
          },
        }),
        tx.gearAllocation.count({
          where: {
            leagueId,
            status: { in: [...activeAllocationStatuses] },
            OR: [
              { poolStock: { catalogItemId: existing.id } },
              { gearUnit: { catalogItemId: existing.id } },
            ],
          },
        }),
      ]);
      if (stock || liveUnits || movements || commitments) {
        invalid("Catalog items with stock, active units, commitments, or inventory history cannot be archived.");
      }
      const archived = await tx.gearCatalogItem.update({
        where: { id: existing.id }, data: { isActive: false, archivedAt: new Date() }, select: { id: true },
      });
      await recordGearActivity(tx, {
        leagueId, entityType: "CATALOG_ITEM", entityId: archived.id, action: "archived", actorUserId: userId,
      });
      return archived;
    }, gearTransactionOptions);
    revalidatePath(gearPath(leagueId));
    return { success: true, data: item };
  } catch (error) {
    return messageForGearError(error, "archive-catalog-item", input);
  }
}

export async function adjustGearPoolStock(
  input: z.input<typeof adjustGearPoolStockSchema>,
): Promise<ActionResult<{ id: string; quantityOnHand: number; version: number }>> {
  try {
    const validated = adjustGearPoolStockSchema.parse(input);
    const userId = await requirePermissionForLeague(validated.leagueId, Permission.MANAGE_GEAR_INVENTORY);
    const stock = await withGearSerializableRetry(() => prisma.$transaction(async (tx) => {
      await Promise.all([
        ensureActiveCatalog(tx, validated.leagueId, validated.catalogItemId, "POOLED"),
        ensureActiveLocation(tx, validated.leagueId, validated.locationId),
      ]);
      let current = await tx.gearPoolStock.findUnique({
        where: { leagueId_catalogItemId_locationId_condition: {
          leagueId: validated.leagueId, catalogItemId: validated.catalogItemId,
          locationId: validated.locationId, condition: validated.condition,
        } },
        select: { id: true, quantityOnHand: true, version: true },
      });
      if (!current) {
        if (validated.quantityDelta < 0 || validated.expectedVersion !== 0) {
          invalid("This stock row no longer exists. Refresh inventory and try again.");
        }
        current = await tx.gearPoolStock.create({
          data: {
            leagueId: validated.leagueId, catalogItemId: validated.catalogItemId,
            locationId: validated.locationId, condition: validated.condition,
            quantityOnHand: validated.quantityDelta, version: 1,
          },
          select: { id: true, quantityOnHand: true, version: true },
        });
      } else {
        if (current.version !== validated.expectedVersion) throw new GearConflictError();
        if (current.quantityOnHand + validated.quantityDelta < 0) invalid("Inventory cannot fall below zero.");
        await assertNoActiveAllocationsForStock(
          tx,
          validated.leagueId,
          current.id,
          current.quantityOnHand,
          validated.quantityDelta,
        );
        const result = await tx.gearPoolStock.updateMany({
          where: { id: current.id, version: current.version },
          data: { quantityOnHand: { increment: validated.quantityDelta }, version: { increment: 1 } },
        });
        if (result.count !== 1) throw new GearConflictError();
        current = { ...current, quantityOnHand: current.quantityOnHand + validated.quantityDelta, version: current.version + 1 };
      }
      await recordGearInventoryMovement(tx, {
        leagueId: validated.leagueId, type: "ADJUSTMENT", poolStockId: current.id,
        // Movements always record a positive physical quantity. A source-only
        // location is an outbound adjustment; a destination-only one is inbound.
        quantity: Math.abs(validated.quantityDelta),
        direction: validated.quantityDelta > 0 ? "INCREASE" : "DECREASE",
        beforeLocationId: validated.quantityDelta < 0 ? validated.locationId : null,
        afterLocationId: validated.quantityDelta > 0 ? validated.locationId : null,
        beforeCondition: validated.quantityDelta < 0 ? validated.condition : null,
        afterCondition: validated.quantityDelta > 0 ? validated.condition : null,
        recordedById: userId, notes: validated.notes,
      });
      await recordGearActivity(tx, {
        leagueId: validated.leagueId, entityType: "POOL_STOCK", entityId: current.id,
        action: "adjusted", actorUserId: userId,
        details: { metadata: { quantityDelta: validated.quantityDelta, condition: validated.condition } },
      });
      return current;
    }, gearTransactionOptions));
    revalidatePath(gearPath(validated.leagueId));
    return { success: true, data: stock };
  } catch (error) {
    return messageForGearError(error, "adjust-pooled-stock", input);
  }
}

export async function transferGearPoolStock(input: unknown): Promise<ActionResult<{ sourceId: string; destinationId: string }>> {
  try {
    const validated = transferPoolStockSchema.parse(input);
    const userId = await requirePermissionForLeague(validated.leagueId, Permission.MANAGE_GEAR_INVENTORY);
    const transfer = await withGearSerializableRetry(() => prisma.$transaction(async (tx) => {
      await Promise.all([
        ensureActiveCatalog(tx, validated.leagueId, validated.catalogItemId, "POOLED"),
        ensureActiveLocation(tx, validated.leagueId, validated.sourceLocationId),
        ensureActiveLocation(tx, validated.leagueId, validated.destinationLocationId),
      ]);
      const source = await tx.gearPoolStock.findUnique({
        where: { leagueId_catalogItemId_locationId_condition: {
          leagueId: validated.leagueId, catalogItemId: validated.catalogItemId,
          locationId: validated.sourceLocationId, condition: validated.condition,
        } },
        select: { id: true, quantityOnHand: true, version: true },
      });
      if (!source || source.version !== validated.expectedSourceVersion) throw new GearConflictError();
      if (source.quantityOnHand < validated.quantity) invalid("Not enough stock is available at the source location.");
      await assertNoActiveAllocationsForStock(
        tx,
        validated.leagueId,
        source.id,
        source.quantityOnHand,
        -validated.quantity,
      );
      const sourceUpdate = await tx.gearPoolStock.updateMany({
        where: { id: source.id, version: source.version },
        data: { quantityOnHand: { decrement: validated.quantity }, version: { increment: 1 } },
      });
      if (sourceUpdate.count !== 1) throw new GearConflictError();
      const destination = await tx.gearPoolStock.upsert({
        where: { leagueId_catalogItemId_locationId_condition: {
          leagueId: validated.leagueId, catalogItemId: validated.catalogItemId,
          locationId: validated.destinationLocationId, condition: validated.condition,
        } },
        create: {
          leagueId: validated.leagueId, catalogItemId: validated.catalogItemId,
          locationId: validated.destinationLocationId, condition: validated.condition,
          quantityOnHand: validated.quantity, version: 1,
        },
        update: { quantityOnHand: { increment: validated.quantity }, version: { increment: 1 } },
        select: { id: true },
      });
      await recordGearInventoryMovement(tx, {
        leagueId: validated.leagueId, type: "TRANSFER", poolStockId: source.id, quantity: validated.quantity,
        direction: "NEUTRAL",
        beforeLocationId: validated.sourceLocationId, afterLocationId: validated.destinationLocationId,
        beforeCondition: validated.condition, afterCondition: validated.condition,
        recordedById: userId, notes: validated.notes,
      });
      await recordGearActivity(tx, {
        leagueId: validated.leagueId, entityType: "POOL_STOCK", entityId: source.id,
        action: "transferred", actorUserId: userId,
        details: { metadata: { quantity: validated.quantity, destinationLocationId: validated.destinationLocationId } },
      });
      return { sourceId: source.id, destinationId: destination.id };
    }, gearTransactionOptions));
    revalidatePath(gearPath(validated.leagueId));
    return { success: true, data: transfer };
  } catch (error) {
    return messageForGearError(error, "transfer-pooled-stock", input);
  }
}

export async function createGearUnit(
  input: z.input<typeof createGearUnitSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = createGearUnitSchema.parse(input);
    const userId = await requirePermissionForLeague(validated.leagueId, Permission.MANAGE_GEAR_INVENTORY);
    const unit = await prisma.$transaction(async (tx) => {
      await ensureActiveCatalog(tx, validated.leagueId, validated.catalogItemId, "INDIVIDUAL");
      const assetTag = validated.assetTag ? normalizeGearAssetTag(validated.assetTag) : "";
      if (!assetTag) invalid("An asset tag is required for individually tracked gear.");
      const locationId = validated.currentLocationId || null;
      if (!locationId) invalid("An active storage location is required for a new unit.");
      await ensureActiveLocation(tx, validated.leagueId, locationId);
      const created = await tx.gearUnit.create({
        data: {
          leagueId: validated.leagueId, catalogItemId: validated.catalogItemId, currentLocationId: locationId,
          assetTag, serialNumber: validated.serialNumber || null, currentCondition: validated.currentCondition,
          acquiredAt: validated.acquiredAt ? new Date(`${validated.acquiredAt}T00:00:00.000Z`) : null,
          notes: validated.notes || null,
        },
        select: { id: true },
      });
      await recordGearInventoryMovement(tx, {
        leagueId: validated.leagueId, type: "RECEIPT", gearUnitId: created.id, quantity: 1,
        direction: "INCREASE",
        afterLocationId: locationId, afterCondition: validated.currentCondition, recordedById: userId,
      });
      await recordGearActivity(tx, {
        leagueId: validated.leagueId, entityType: "UNIT", entityId: created.id, action: "created",
        actorUserId: userId,
        details: { metadata: { condition: validated.currentCondition } },
      });
      return created;
    }, gearTransactionOptions);
    revalidatePath(gearPath(validated.leagueId));
    return { success: true, data: unit };
  } catch (error) {
    return messageForGearError(error, "create-unit", input);
  }
}

export async function updateGearUnit(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = updateUnitSchema.parse(input);
    const userId = await requirePermissionForLeague(validated.leagueId, Permission.MANAGE_GEAR_INVENTORY);
    const unit = await prisma.$transaction(async (tx) => {
      const existing = await tx.gearUnit.findFirst({
        where: { id: validated.unitId, leagueId: validated.leagueId },
        select: { id: true, status: true, version: true },
      });
      if (!existing) invalid("Tagged unit not found.");
      if (existing.status === "RETIRED" || existing.status === "LOST") invalid("Retired or lost units cannot be edited.");
      const { leagueId, unitId, expectedVersion, assetTag, acquiredAt, ...changes } = validated;
      if (assetTag !== undefined && !normalizeGearAssetTag(assetTag)) {
        invalid("An asset tag is required for individually tracked gear.");
      }
      const updated = await tx.gearUnit.updateMany({
        where: { id: existing.id, leagueId, version: expectedVersion },
        data: {
          ...changes,
          ...(assetTag !== undefined ? { assetTag: assetTag ? normalizeGearAssetTag(assetTag) : null } : {}),
          ...(acquiredAt !== undefined ? { acquiredAt: acquiredAt ? new Date(`${acquiredAt}T00:00:00.000Z`) : null } : {}),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new GearConflictError();
      await recordGearActivity(tx, {
        leagueId, entityType: "UNIT", entityId: existing.id, action: "updated", actorUserId: userId,
      });
      return { id: existing.id };
    }, gearTransactionOptions);
    revalidatePath(gearPath(validated.leagueId));
    return { success: true, data: unit };
  } catch (error) {
    return messageForGearError(error, "update-unit", input);
  }
}

export async function transferGearUnit(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = transferUnitSchema.parse(input);
    const userId = await requirePermissionForLeague(validated.leagueId, Permission.MANAGE_GEAR_INVENTORY);
    const unit = await prisma.$transaction(async (tx) => {
      const existing = await tx.gearUnit.findFirst({
        where: { id: validated.unitId, leagueId: validated.leagueId },
        select: { id: true, status: true, currentLocationId: true, currentCondition: true, version: true },
      });
      if (!existing) invalid("Tagged unit not found.");
      if (!["AVAILABLE", "MAINTENANCE"].includes(existing.status)) invalid("Only available or maintenance units can be transferred.");
      await assertUnitCanMove(tx, validated.leagueId, existing.id);
      await ensureActiveLocation(tx, validated.leagueId, validated.destinationLocationId);
      if (existing.currentLocationId === validated.destinationLocationId) invalid("Choose a different destination location.");
      const updated = await tx.gearUnit.updateMany({
        where: { id: existing.id, leagueId: validated.leagueId, version: validated.expectedVersion },
        data: { currentLocationId: validated.destinationLocationId, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new GearConflictError();
      await recordGearInventoryMovement(tx, {
        leagueId: validated.leagueId, type: "TRANSFER", gearUnitId: existing.id, quantity: 1,
        direction: "NEUTRAL",
        beforeLocationId: existing.currentLocationId, afterLocationId: validated.destinationLocationId,
        beforeCondition: existing.currentCondition, afterCondition: existing.currentCondition,
        recordedById: userId, notes: validated.notes,
      });
      await recordGearActivity(tx, {
        leagueId: validated.leagueId, entityType: "UNIT", entityId: existing.id, action: "transferred",
        actorUserId: userId,
        details: { metadata: { destinationLocationId: validated.destinationLocationId } },
      });
      return { id: existing.id };
    }, gearTransactionOptions);
    revalidatePath(gearPath(validated.leagueId));
    return { success: true, data: unit };
  } catch (error) {
    return messageForGearError(error, "transfer-unit", input);
  }
}

export async function changeGearUnitCondition(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = changeUnitConditionSchema.parse(input);
    const userId = await requirePermissionForLeague(validated.leagueId, Permission.MANAGE_GEAR_INVENTORY);
    const unit = await prisma.$transaction(async (tx) => {
      const existing = await tx.gearUnit.findFirst({
        where: { id: validated.unitId, leagueId: validated.leagueId },
        select: { id: true, status: true, currentLocationId: true, currentCondition: true, version: true },
      });
      if (!existing) invalid("Tagged unit not found.");
      if (!["AVAILABLE", "MAINTENANCE"].includes(existing.status)) invalid("Only available or maintenance units can have their condition changed.");
      await assertUnitCanMove(tx, validated.leagueId, existing.id);
      if (existing.currentCondition === validated.condition) invalid("Choose a different condition.");
      const updated = await tx.gearUnit.updateMany({
        where: { id: existing.id, leagueId: validated.leagueId, version: validated.expectedVersion },
        data: { currentCondition: validated.condition, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new GearConflictError();
      await recordGearInventoryMovement(tx, {
        leagueId: validated.leagueId, type: "ADJUSTMENT", gearUnitId: existing.id, quantity: 1,
        direction: "DECREASE",
        beforeLocationId: existing.currentLocationId, beforeCondition: existing.currentCondition,
        recordedById: userId, notes: validated.notes,
      });
      await recordGearInventoryMovement(tx, {
        leagueId: validated.leagueId, type: "ADJUSTMENT", gearUnitId: existing.id, quantity: 1,
        direction: "INCREASE",
        afterLocationId: existing.currentLocationId, afterCondition: validated.condition,
        recordedById: userId, notes: validated.notes,
      });
      await recordGearActivity(tx, {
        leagueId: validated.leagueId, entityType: "UNIT", entityId: existing.id, action: "condition_changed",
        actorUserId: userId,
        details: { metadata: { fromCondition: existing.currentCondition, toCondition: validated.condition } },
      });
      return { id: existing.id };
    }, gearTransactionOptions);
    revalidatePath(gearPath(validated.leagueId));
    return { success: true, data: unit };
  } catch (error) {
    return messageForGearError(error, "change-unit-condition", input);
  }
}

export async function retireGearUnit(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = retireUnitSchema.parse(input);
    const userId = await requirePermissionForLeague(validated.leagueId, Permission.MANAGE_GEAR_INVENTORY);
    const unit = await prisma.$transaction(async (tx) => {
      const existing = await tx.gearUnit.findFirst({
        where: { id: validated.unitId, leagueId: validated.leagueId },
        select: { id: true, status: true, currentLocationId: true, currentCondition: true, version: true },
      });
      if (!existing) invalid("Tagged unit not found.");
      if (!["AVAILABLE", "MAINTENANCE"].includes(existing.status)) invalid("Only available or maintenance units can be retired.");
      await assertUnitCanMove(tx, validated.leagueId, existing.id);
      const updated = await tx.gearUnit.updateMany({
        where: { id: existing.id, leagueId: validated.leagueId, version: validated.expectedVersion },
        data: { status: "RETIRED", retiredAt: new Date(), currentLocationId: null, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new GearConflictError();
      await recordGearInventoryMovement(tx, {
        leagueId: validated.leagueId, type: "WRITE_OFF", gearUnitId: existing.id, quantity: 1,
        direction: "DECREASE",
        beforeLocationId: existing.currentLocationId, beforeCondition: existing.currentCondition,
        recordedById: userId, notes: validated.notes,
      });
      await recordGearActivity(tx, {
        leagueId: validated.leagueId, entityType: "UNIT", entityId: existing.id, action: "retired",
        actorUserId: userId,
      });
      return { id: existing.id };
    }, gearTransactionOptions);
    revalidatePath(gearPath(validated.leagueId));
    return { success: true, data: unit };
  } catch (error) {
    return messageForGearError(error, "retire-unit", input);
  }
}

export async function unretireGearUnit(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = unretireUnitSchema.parse(input);
    const userId = await requirePermissionForLeague(validated.leagueId, Permission.MANAGE_GEAR_INVENTORY);
    const unit = await prisma.$transaction(async (tx) => {
      const existing = await tx.gearUnit.findFirst({
        where: { id: validated.unitId, leagueId: validated.leagueId },
        select: { id: true, status: true, version: true },
      });
      if (!existing) invalid("Tagged unit not found.");
      if (existing.status !== "RETIRED") invalid("Only retired units can be returned to inventory.");
      await ensureActiveLocation(tx, validated.leagueId, validated.destinationLocationId);
      const updated = await tx.gearUnit.updateMany({
        where: { id: existing.id, leagueId: validated.leagueId, version: validated.expectedVersion },
        data: {
          status: "AVAILABLE",
          currentLocationId: validated.destinationLocationId,
          currentCondition: validated.condition,
          retiredAt: null,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new GearConflictError();
      await recordGearInventoryMovement(tx, {
        leagueId: validated.leagueId,
        type: "RECEIPT",
        direction: "INCREASE",
        gearUnitId: existing.id,
        quantity: 1,
        afterLocationId: validated.destinationLocationId,
        afterCondition: validated.condition,
        recordedById: userId,
        notes: validated.notes,
      });
      await recordGearActivity(tx, {
        leagueId: validated.leagueId,
        entityType: "UNIT",
        entityId: existing.id,
        action: "unretired",
        actorUserId: userId,
        details: {
          summary: "Unit returned to active inventory after retirement.",
          metadata: {
            destinationLocationId: validated.destinationLocationId,
            condition: validated.condition,
            retirementReversed: true,
          },
        },
      });
      return { id: existing.id };
    }, gearTransactionOptions);
    revalidatePath(gearPath(validated.leagueId));
    return { success: true, data: unit };
  } catch (error) {
    return messageForGearError(error, "unretire-unit", input);
  }
}
