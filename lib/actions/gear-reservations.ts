"use server";

import { Prisma, type GearCondition } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserLeagueRole, isTeamAdmin, requireLeagueRole, requireUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { recordGearActivity, recordGearInventoryMovement } from "@/lib/services/gear-ledger";
import {
  GearConflictError,
  gearTransactionOptions,
  withGearSerializableRetry,
} from "@/lib/services/gear-transaction";
import {
  activeAllocationQuantity,
  canTransitionAllocation,
  canTransitionReservation,
  datesOverlap,
} from "@/lib/utils/gear";
import { createGearReservationSchema } from "@/lib/utils/validation";
import type { ActionResult } from "@/lib/actions/gear-inventory";

const gearId = z.string().cuid("Invalid gear identifier");
const quantity = z.coerce.number().int().min(1);
const condition = z.enum(["NEW", "EXCELLENT", "GOOD", "FAIR", "POOR", "DAMAGED"]);
const date = z.string().date();

const reservationCommand = z.object({
  leagueId: gearId,
  reservationId: gearId,
  expectedVersion: z.coerce.number().int().min(0),
});

const rescheduleSchema = reservationCommand.extend({
  requestedStartDate: date,
  requestedEndDate: date,
}).refine((value) => value.requestedEndDate >= value.requestedStartDate, {
  path: ["requestedEndDate"],
  message: "Reservation end date must be on or after the start date.",
});

const decisionSchema = reservationCommand.extend({
  decisionNotes: z.string().trim().max(2_000).optional(),
});

const allocationSchema = reservationCommand.extend({
  approvedStartDate: date.optional(),
  approvedEndDate: date.optional(),
  allocations: z.array(z.object({
    reservationLineId: gearId,
    poolStockId: gearId.optional(),
    gearUnitId: gearId.optional(),
    quantity,
  }).refine((value) => Boolean(value.poolStockId) !== Boolean(value.gearUnitId), {
    message: "Choose either pooled stock or one tagged unit.",
  })).min(1).max(100),
}).refine((value) => !value.approvedStartDate || !value.approvedEndDate || value.approvedEndDate >= value.approvedStartDate, {
  path: ["approvedEndDate"],
  message: "Approved end date must be on or after the approved start date.",
});

const allocationCommand = z.object({
  leagueId: gearId,
  allocationId: gearId,
  expectedVersion: z.coerce.number().int().min(0),
  quantity: quantity.optional(),
  notes: z.string().trim().max(1_000).optional(),
});

const returnSchema = allocationCommand.extend({
  quantity,
  returnDisposition: z.enum(["GOOD", "DAMAGED", "LOST", "CONSUMED"]),
  condition: condition.optional(),
});

type Tx = Prisma.TransactionClient;

function reservationPath(leagueId: string, reservationId?: string) {
  return reservationId
    ? `/league/${leagueId}/gear/reservations/${reservationId}`
    : `/league/${leagueId}/gear/reservations`;
}

function inventoryPath(leagueId: string) {
  return `/league/${leagueId}/gear`;
}

function invalid(message: string): never {
  throw new Error(`Gear validation: ${message}`);
}

function actionError(error: unknown): ActionResult<never> {
  if (error instanceof GearConflictError) return { success: false, error: error.message };
  if (error instanceof z.ZodError) return { success: false, error: "Please correct the highlighted reservation fields.", details: error.issues };
  if (error instanceof Error) {
    if (error.message.startsWith("Unauthorized")) return { success: false, error: "You do not have permission to manage this reservation." };
    if (error.message.startsWith("Gear validation:")) return { success: false, error: error.message.slice(17) };
  }
  return { success: false, error: "Unable to update the gear reservation. Please try again." };
}

async function assertRequestAccess(
  leagueId: string,
  teamId: string,
  userId: string,
  allowLeagueAdmin = true,
): Promise<boolean> {
  const leagueRole = await getUserLeagueRole(userId, leagueId);
  if (allowLeagueAdmin && leagueRole === "LEAGUE_ADMIN") return true;
  const [team, teamAdmin] = await Promise.all([
    prisma.team.findFirst({ where: { id: teamId, leagueId, isActive: true }, select: { id: true } }),
    isTeamAdmin(userId, teamId),
  ]);
  if (!team || !teamAdmin) throw new Error("Unauthorized: team admin access is required.");
  return false;
}

async function getReservationForMutation(tx: Tx, leagueId: string, reservationId: string) {
  const reservation = await tx.gearReservation.findFirst({
    where: { id: reservationId, leagueId, league: { isActive: true }, team: { leagueId, isActive: true } },
    include: {
      lines: {
        include: {
          catalogItem: { select: { trackingMode: true } },
          allocations: {
            select: { allocatedQty: true, pickedUpQty: true, returnedQty: true, releasedQty: true },
          },
        },
      },
    },
  });
  if (!reservation) invalid("Reservation not found in this league.");
  return reservation;
}

async function activePoolCommitment(
  tx: Tx,
  poolStockId: string,
  window: { startDate: Date; endDate: Date },
) {
  const allocations = await tx.gearAllocation.findMany({
    where: {
      poolStockId,
      status: { in: ["PENDING", "ALLOCATED", "PICKED_UP", "PARTIALLY_RETURNED"] },
      reservationLine: {
        reservation: {
          requestedStartDate: { lte: window.endDate },
          requestedEndDate: { gte: window.startDate },
        },
      },
    },
    select: { allocatedQty: true, releasedQty: true, returnedQty: true, pickedUpQty: true },
  });
  return allocations.reduce(
    (total, allocation) => total + activeAllocationQuantity(allocation),
    0,
  );
}

async function hasOverdueCheckout(tx: Tx, gearUnitId: string) {
  const today = new Date();
  return Boolean(await tx.gearAllocation.findFirst({
    where: {
      gearUnitId,
      status: { in: ["PICKED_UP", "PARTIALLY_RETURNED"] },
      reservationLine: { reservation: { requestedEndDate: { lt: today } } },
    },
    select: { id: true },
  }));
}

async function releaseTaggedUnitIfFree(tx: Tx, leagueId: string, gearUnitId: string) {
  const active = await tx.gearAllocation.count({
    where: { leagueId, gearUnitId, status: { in: ["PENDING", "ALLOCATED", "PICKED_UP", "PARTIALLY_RETURNED"] } },
  });
  if (active === 0) {
    await tx.gearUnit.updateMany({
      where: { id: gearUnitId, leagueId, status: "RESERVED" },
      data: { status: "AVAILABLE", version: { increment: 1 } },
    });
  }
}

export async function createGearReservation(
  input: z.input<typeof createGearReservationSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = createGearReservationSchema.parse(input);
    const userId = await requireUserId();
    await assertRequestAccess(validated.leagueId, validated.teamId, userId);
    const created = await prisma.$transaction(async (tx) => {
      const items = await tx.gearCatalogItem.findMany({
        where: {
          leagueId: validated.leagueId,
          id: {
            in: validated.lines
              .map((line) => line.catalogItemId)
              .filter((catalogItemId): catalogItemId is string => Boolean(catalogItemId)),
          },
        },
        select: { id: true },
      });
      const itemIds = new Set(items.map((item) => item.id));
      if (validated.lines.some((line) => line.catalogItemId && !itemIds.has(line.catalogItemId))) {
        invalid("A requested catalog item is not available in this league.");
      }
      const reservation = await tx.gearReservation.create({
        data: {
          leagueId: validated.leagueId,
          teamId: validated.teamId,
          status: "REQUESTED",
          requestedStartDate: new Date(`${validated.requestedStartDate}T00:00:00.000Z`),
          requestedEndDate: new Date(`${validated.requestedEndDate}T00:00:00.000Z`),
          custodianNameSnapshot: validated.custodianNameSnapshot,
          custodianEmailSnapshot: validated.custodianEmailSnapshot || null,
          custodianPhoneSnapshot: validated.custodianPhoneSnapshot || null,
          requestNotes: validated.requestNotes || null,
          requestedById: userId,
          lines: { create: validated.lines.map((line) => ({
            catalogItemId: line.catalogItemId || null,
            needLineId: line.needLineId || null,
            nameSnapshot: line.nameSnapshot,
            requestedQty: line.requestedQty,
          })) },
        },
        select: { id: true },
      });
      await recordGearActivity(tx, {
        leagueId: validated.leagueId, entityType: "RESERVATION", entityId: reservation.id,
        action: "requested", actorUserId: userId, details: { teamId: validated.teamId },
      });
      return reservation;
    }, gearTransactionOptions);
    revalidatePath(reservationPath(validated.leagueId));
    return { success: true, data: created };
  } catch (error) {
    return actionError(error);
  }
}

export async function cancelGearReservation(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = reservationCommand.parse(input);
    const userId = await requireUserId();
    const result = await prisma.$transaction(async (tx) => {
      const reservation = await getReservationForMutation(tx, validated.leagueId, validated.reservationId);
      await assertRequestAccess(validated.leagueId, reservation.teamId, userId);
      if (!canTransitionReservation(reservation.status, "CANCELED")) invalid("This reservation can no longer be canceled.");
      if (reservation.version !== validated.expectedVersion) throw new GearConflictError();
      const update = await tx.gearReservation.updateMany({
        where: { id: reservation.id, version: reservation.version, status: reservation.status },
        data: { status: "CANCELED", canceledAt: new Date(), version: { increment: 1 } },
      });
      if (update.count !== 1) throw new GearConflictError();
      await recordGearActivity(tx, { leagueId: validated.leagueId, entityType: "RESERVATION", entityId: reservation.id, action: "canceled", actorUserId: userId });
      return { id: reservation.id };
    }, gearTransactionOptions);
    revalidatePath(reservationPath(validated.leagueId));
    revalidatePath(reservationPath(validated.leagueId, result.id));
    revalidatePath(inventoryPath(validated.leagueId));
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function rescheduleGearReservation(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = rescheduleSchema.parse(input);
    const userId = await requireUserId();
    const result = await prisma.$transaction(async (tx) => {
      const reservation = await getReservationForMutation(tx, validated.leagueId, validated.reservationId);
      await assertRequestAccess(validated.leagueId, reservation.teamId, userId);
      if (!["DRAFT", "REQUESTED"].includes(reservation.status)) invalid("Only pending reservations can be rescheduled.");
      if (reservation.version !== validated.expectedVersion) throw new GearConflictError();
      const update = await tx.gearReservation.updateMany({
        where: { id: reservation.id, version: reservation.version, status: reservation.status },
        data: {
          requestedStartDate: new Date(`${validated.requestedStartDate}T00:00:00.000Z`),
          requestedEndDate: new Date(`${validated.requestedEndDate}T00:00:00.000Z`),
          version: { increment: 1 },
        },
      });
      if (update.count !== 1) throw new GearConflictError();
      await recordGearActivity(tx, { leagueId: validated.leagueId, entityType: "RESERVATION", entityId: reservation.id, action: "rescheduled", actorUserId: userId });
      return { id: reservation.id };
    }, gearTransactionOptions);
    revalidatePath(reservationPath(validated.leagueId));
    revalidatePath(reservationPath(validated.leagueId, result.id));
    revalidatePath(inventoryPath(validated.leagueId));
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function declineGearReservation(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = decisionSchema.parse(input);
    const userId = await requireLeagueRole(validated.leagueId, "LEAGUE_ADMIN");
    const result = await prisma.$transaction(async (tx) => {
      const reservation = await getReservationForMutation(tx, validated.leagueId, validated.reservationId);
      if (!canTransitionReservation(reservation.status, "DECLINED")) invalid("Only requested reservations can be declined.");
      if (reservation.version !== validated.expectedVersion) throw new GearConflictError();
      const update = await tx.gearReservation.updateMany({
        where: { id: reservation.id, version: reservation.version, status: "REQUESTED" },
        data: { status: "DECLINED", decisionNotes: validated.decisionNotes || null, decidedById: userId, decidedAt: new Date(), version: { increment: 1 } },
      });
      if (update.count !== 1) throw new GearConflictError();
      await recordGearActivity(tx, { leagueId: validated.leagueId, entityType: "RESERVATION", entityId: reservation.id, action: "declined", actorUserId: userId });
      return { id: reservation.id };
    }, gearTransactionOptions);
    revalidatePath(reservationPath(validated.leagueId));
    revalidatePath(reservationPath(validated.leagueId, result.id));
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function approveAndAllocateGearReservation(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = allocationSchema.parse(input);
    const userId = await requireLeagueRole(validated.leagueId, "LEAGUE_ADMIN");
    const result = await withGearSerializableRetry(() => prisma.$transaction(async (tx) => {
      const reservation = await getReservationForMutation(tx, validated.leagueId, validated.reservationId);
      if (!["REQUESTED", "APPROVED"].includes(reservation.status)) invalid("Only requested or approved reservations can receive allocations.");
      if (reservation.version !== validated.expectedVersion) throw new GearConflictError();
      const window = {
        startDate: new Date(`${validated.approvedStartDate ?? reservation.requestedStartDate.toISOString().slice(0, 10)}T00:00:00.000Z`),
        endDate: new Date(`${validated.approvedEndDate ?? reservation.requestedEndDate.toISOString().slice(0, 10)}T00:00:00.000Z`),
      };
      if (!datesOverlap(
        { startDate: window.startDate.toISOString().slice(0, 10), endDate: window.endDate.toISOString().slice(0, 10) },
        { startDate: reservation.requestedStartDate.toISOString().slice(0, 10), endDate: reservation.requestedEndDate.toISOString().slice(0, 10) },
      )) invalid("Approved dates must overlap the requested reservation dates.");

      const lines = new Map(reservation.lines.map((line) => [line.id, line]));
      const requestedByLine = new Map<string, number>();
      const requestedByPoolStock = new Map<string, number>();
      const requestedTaggedUnits = new Set<string>();
      for (const allocation of validated.allocations) {
        const line = lines.get(allocation.reservationLineId);
        if (!line || !line.catalogItemId) invalid("Each allocation must belong to an item-backed reservation line.");
        if ((requestedByLine.get(line.id) ?? 0) + allocation.quantity > line.requestedQty) {
          invalid(`Allocation exceeds the requested quantity for ${line.nameSnapshot}.`);
        }
        requestedByLine.set(line.id, (requestedByLine.get(line.id) ?? 0) + allocation.quantity);
        if (allocation.poolStockId) {
          requestedByPoolStock.set(
            allocation.poolStockId,
            (requestedByPoolStock.get(allocation.poolStockId) ?? 0) + allocation.quantity,
          );
        }
        if (allocation.gearUnitId) {
          if (requestedTaggedUnits.has(allocation.gearUnitId)) {
            invalid("A tagged unit may only be allocated once in the same request.");
          }
          requestedTaggedUnits.add(allocation.gearUnitId);
        }
      }
      for (const allocation of validated.allocations) {
        const line = lines.get(allocation.reservationLineId);
        if (!line) invalid("Reservation line not found.");
        const catalogItemId = line.catalogItemId;
        if (!catalogItemId) invalid("Each allocation must belong to an item-backed reservation line.");
        const activeForLine = line.allocations.reduce(
          (total, existing) => total + activeAllocationQuantity(existing),
          0,
        );
        if (activeForLine + (requestedByLine.get(line.id) ?? 0) > line.requestedQty) {
          invalid(`Allocation exceeds the remaining requested quantity for ${line.nameSnapshot}.`);
        }
        if (allocation.poolStockId) {
          if (line.catalogItem?.trackingMode !== "POOLED") invalid("Pooled allocations require a pooled catalog item.");
          const stock = await tx.gearPoolStock.findFirst({
            where: { id: allocation.poolStockId, leagueId: validated.leagueId, catalogItemId },
            select: { id: true, quantityOnHand: true, locationId: true },
          });
          const location = stock && await tx.gearStorageLocation.findFirst({
            where: { id: stock.locationId, leagueId: validated.leagueId, isActive: true },
            select: { id: true },
          });
          if (!stock || !location) invalid("The selected pooled stock is not active in this league.");
          const committed = await activePoolCommitment(tx, stock.id, window);
          if (stock.quantityOnHand - committed < (requestedByPoolStock.get(stock.id) ?? 0)) {
            invalid("Not enough matching pooled stock remains for these dates.");
          }
        } else if (allocation.gearUnitId) {
          if (line.catalogItem?.trackingMode !== "INDIVIDUAL" || allocation.quantity !== 1) invalid("Tagged allocations require exactly one individually tracked item.");
          const unit = await tx.gearUnit.findFirst({
            where: { id: allocation.gearUnitId, leagueId: validated.leagueId, catalogItemId },
            select: { id: true, status: true, version: true },
          });
          if (!unit || !["AVAILABLE", "RESERVED"].includes(unit.status)) invalid("The tagged unit is unavailable.");
          if (await hasOverdueCheckout(tx, unit.id)) invalid("The tagged unit is blocked by an overdue checkout.");
          const conflicts = await tx.gearAllocation.count({
            where: {
              gearUnitId: unit.id,
              status: { in: ["PENDING", "ALLOCATED", "PICKED_UP", "PARTIALLY_RETURNED"] },
              reservationLine: { reservation: { requestedStartDate: { lte: window.endDate }, requestedEndDate: { gte: window.startDate } } },
            },
          });
          if (conflicts > 0) invalid("The tagged unit is already allocated for these dates.");
          const updated = await tx.gearUnit.updateMany({
            where: { id: unit.id, leagueId: validated.leagueId, version: unit.version, status: unit.status },
            data: { status: "RESERVED", version: { increment: 1 } },
          });
          if (updated.count !== 1) throw new GearConflictError();
        }
      }
      for (const allocation of validated.allocations) {
        await tx.gearAllocation.create({
          data: {
            leagueId: validated.leagueId,
            reservationLineId: allocation.reservationLineId,
            poolStockId: allocation.poolStockId ?? null,
            gearUnitId: allocation.gearUnitId ?? null,
            status: "ALLOCATED",
            allocatedQty: allocation.quantity,
            allocatedAt: new Date(),
            allocatedById: userId,
          },
        });
      }
      for (const [lineId, approvedQty] of requestedByLine) {
        const line = lines.get(lineId);
        if (!line) invalid("Reservation line not found.");
        const activeForLine = line.allocations.reduce(
          (total, existing) => total + activeAllocationQuantity(existing),
          0,
        );
        await tx.gearReservationLine.update({
          where: { id: lineId },
          data: {
            approvedQty: Math.max(line.approvedQty, activeForLine + approvedQty),
            allocatedQty: activeForLine + approvedQty,
          },
        });
      }
      const update = await tx.gearReservation.updateMany({
        where: { id: reservation.id, version: reservation.version, status: reservation.status },
        data: {
          status: "APPROVED",
          approvedStartDate: window.startDate,
          approvedEndDate: window.endDate,
          decidedAt: new Date(),
          decidedById: userId,
          version: { increment: 1 },
        },
      });
      if (update.count !== 1) throw new GearConflictError();
      await recordGearActivity(tx, {
        leagueId: validated.leagueId, entityType: "RESERVATION", entityId: reservation.id,
        action: "approved_and_allocated", actorUserId: userId, details: { allocationCount: validated.allocations.length },
      });
      return { id: reservation.id };
    }, gearTransactionOptions));
    revalidatePath(reservationPath(validated.leagueId));
    revalidatePath(reservationPath(validated.leagueId, result.id));
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function releaseGearAllocation(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = allocationCommand.parse(input);
    const userId = await requireLeagueRole(validated.leagueId, "LEAGUE_ADMIN");
    const result = await prisma.$transaction(async (tx) => {
      const allocation = await tx.gearAllocation.findFirst({
        where: { id: validated.allocationId, leagueId: validated.leagueId },
        include: { reservationLine: { include: { reservation: true } } },
      });
      if (!allocation) invalid("Allocation not found in this league.");
      if (!canTransitionAllocation(allocation.status, "RELEASED") || allocation.pickedUpQty > 0) invalid("Only uncollected allocations can be released.");
      if (allocation.version !== validated.expectedVersion) throw new GearConflictError();
      const update = await tx.gearAllocation.updateMany({
        where: { id: allocation.id, version: allocation.version, status: allocation.status },
        data: { status: "RELEASED", releasedQty: allocation.allocatedQty, releasedAt: new Date(), version: { increment: 1 } },
      });
      if (update.count !== 1) throw new GearConflictError();
      if (allocation.gearUnitId) await releaseTaggedUnitIfFree(tx, validated.leagueId, allocation.gearUnitId);
      await recordGearActivity(tx, { leagueId: validated.leagueId, entityType: "ALLOCATION", entityId: allocation.id, action: "released", actorUserId: userId });
      return { id: allocation.id, reservationId: allocation.reservationLine.reservationId };
    }, gearTransactionOptions);
    revalidatePath(reservationPath(validated.leagueId));
    revalidatePath(reservationPath(validated.leagueId, result.reservationId));
    revalidatePath(inventoryPath(validated.leagueId));
    return { success: true, data: { id: result.id } };
  } catch (error) {
    return actionError(error);
  }
}

export async function recordGearPickup(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = allocationCommand.extend({ quantity }).parse(input);
    const userId = await requireLeagueRole(validated.leagueId, "LEAGUE_ADMIN");
    const result = await prisma.$transaction(async (tx) => {
      const allocation = await tx.gearAllocation.findFirst({
        where: { id: validated.allocationId, leagueId: validated.leagueId },
        include: { reservationLine: { include: { reservation: true } }, poolStock: true, gearUnit: true },
      });
      if (!allocation) invalid("Allocation not found in this league.");
      if (
        allocation.status !== "ALLOCATED"
        || allocation.pickedUpQty !== 0
        || validated.quantity !== allocation.allocatedQty
      ) invalid("This allocation must be picked up in full.");
      if (allocation.version !== validated.expectedVersion) throw new GearConflictError();
      const update = await tx.gearAllocation.updateMany({
        where: { id: allocation.id, version: allocation.version, status: "ALLOCATED" },
        data: { status: "PICKED_UP", pickedUpQty: validated.quantity, pickedUpAt: new Date(), version: { increment: 1 } },
      });
      if (update.count !== 1) throw new GearConflictError();
      if (allocation.gearUnitId) {
        const unit = allocation.gearUnit;
        if (!unit) invalid("Tagged unit projection is missing.");
        const unitUpdate = await tx.gearUnit.updateMany({
          where: { id: unit.id, leagueId: validated.leagueId, version: unit.version, status: "RESERVED" },
          data: { status: "CHECKED_OUT", version: { increment: 1 } },
        });
        if (unitUpdate.count !== 1) throw new GearConflictError();
      }
      const handoff = await tx.gearHandoff.create({
        data: {
          leagueId: validated.leagueId, reservationId: allocation.reservationLine.reservationId,
          allocationId: allocation.id, type: "PICKUP",
          custodianNameSnapshot: allocation.reservationLine.reservation.custodianNameSnapshot,
          handledById: userId, notes: validated.notes || null,
        },
      });
      await recordGearInventoryMovement(tx, {
        leagueId: validated.leagueId, type: "ALLOCATION", quantity: validated.quantity,
        poolStockId: allocation.poolStockId, gearUnitId: allocation.gearUnitId,
        allocationId: allocation.id, handoffId: handoff.id, recordedById: userId, notes: validated.notes,
      });
      await recordGearActivity(tx, { leagueId: validated.leagueId, entityType: "HANDOFF", entityId: handoff.id, action: "picked_up", actorUserId: userId });
      const reservationUpdate = await tx.gearReservation.updateMany({
        where: { id: allocation.reservationLine.reservationId, status: "APPROVED" },
        data: { status: "FULFILLED", custodyStartedAt: new Date(), version: { increment: 1 } },
      });
      void reservationUpdate;
      return { id: allocation.id, reservationId: allocation.reservationLine.reservationId };
    }, gearTransactionOptions);
    revalidatePath(reservationPath(validated.leagueId));
    revalidatePath(reservationPath(validated.leagueId, result.reservationId));
    revalidatePath(inventoryPath(validated.leagueId));
    return { success: true, data: { id: result.id } };
  } catch (error) {
    return actionError(error);
  }
}

export async function recordGearReturn(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = returnSchema.parse(input);
    const userId = await requireLeagueRole(validated.leagueId, "LEAGUE_ADMIN");
    const result = await prisma.$transaction(async (tx) => {
      const allocation = await tx.gearAllocation.findFirst({
        where: { id: validated.allocationId, leagueId: validated.leagueId },
        include: {
          reservationLine: { include: { reservation: true } },
          poolStock: { include: { location: true } },
          gearUnit: true,
        },
      });
      if (!allocation) invalid("Allocation not found in this league.");
      if (!["PICKED_UP", "PARTIALLY_RETURNED"].includes(allocation.status)) invalid("Only checked-out gear can be returned.");
      if (allocation.version !== validated.expectedVersion) throw new GearConflictError();
      const remaining = allocation.pickedUpQty - allocation.returnedQty;
      if (validated.quantity > remaining) invalid("Return quantity exceeds the amount currently in custody.");
      const returnedQty = allocation.returnedQty + validated.quantity;
      const nextStatus = returnedQty === allocation.pickedUpQty ? "RETURNED" : "PARTIALLY_RETURNED";
      const update = await tx.gearAllocation.updateMany({
        where: { id: allocation.id, version: allocation.version, status: allocation.status },
        data: { status: nextStatus, returnedQty, returnedAt: new Date(), version: { increment: 1 } },
      });
      if (update.count !== 1) throw new GearConflictError();
      const returnCondition: GearCondition = validated.condition
        ?? (validated.returnDisposition === "DAMAGED"
          ? "DAMAGED"
          : allocation.poolStock?.condition ?? allocation.gearUnit?.currentCondition ?? "GOOD");
      if (allocation.gearUnit) {
        const unitStatus = validated.returnDisposition === "LOST"
          ? "LOST"
          : validated.returnDisposition === "CONSUMED" ? "RETIRED"
            : validated.returnDisposition === "DAMAGED" ? "MAINTENANCE" : "AVAILABLE";
        const unitUpdate = await tx.gearUnit.updateMany({
          where: { id: allocation.gearUnit.id, leagueId: validated.leagueId, version: allocation.gearUnit.version, status: "CHECKED_OUT" },
          data: {
            status: unitStatus,
            currentCondition: returnCondition,
            retiredAt: unitStatus === "RETIRED" ? new Date() : undefined,
            version: { increment: 1 },
          },
        });
        if (unitUpdate.count !== 1) throw new GearConflictError();
      }
      if (allocation.poolStock) {
        if (["LOST", "CONSUMED"].includes(validated.returnDisposition)) {
          const stockUpdate = await tx.gearPoolStock.updateMany({
            where: { id: allocation.poolStock.id, leagueId: validated.leagueId, quantityOnHand: { gte: validated.quantity } },
            data: { quantityOnHand: { decrement: validated.quantity }, version: { increment: 1 } },
          });
          if (stockUpdate.count !== 1) throw new GearConflictError("Inventory changed before this loss could be recorded.");
        } else if (returnCondition !== allocation.poolStock.condition) {
          const sourceUpdate = await tx.gearPoolStock.updateMany({
            where: { id: allocation.poolStock.id, leagueId: validated.leagueId, quantityOnHand: { gte: validated.quantity } },
            data: { quantityOnHand: { decrement: validated.quantity }, version: { increment: 1 } },
          });
          if (sourceUpdate.count !== 1) throw new GearConflictError("Inventory changed before this return could be recorded.");
          await tx.gearPoolStock.upsert({
            where: {
              leagueId_catalogItemId_locationId_condition: {
                leagueId: validated.leagueId,
                catalogItemId: allocation.poolStock.catalogItemId,
                locationId: allocation.poolStock.locationId,
                condition: returnCondition,
              },
            },
            create: {
              leagueId: validated.leagueId,
              catalogItemId: allocation.poolStock.catalogItemId,
              locationId: allocation.poolStock.locationId,
              condition: returnCondition,
              quantityOnHand: validated.quantity,
              version: 1,
            },
            update: { quantityOnHand: { increment: validated.quantity }, version: { increment: 1 } },
          });
        }
      }
      const handoff = await tx.gearHandoff.create({
        data: {
          leagueId: validated.leagueId, reservationId: allocation.reservationLine.reservationId,
          allocationId: allocation.id, type: "RETURN", returnDisposition: validated.returnDisposition,
          custodianNameSnapshot: allocation.reservationLine.reservation.custodianNameSnapshot,
          handledById: userId, notes: validated.notes || null,
        },
      });
      await recordGearInventoryMovement(tx, {
        leagueId: validated.leagueId,
        type: ["LOST", "CONSUMED"].includes(validated.returnDisposition) ? "WRITE_OFF" : "RETURN",
        quantity: validated.quantity, poolStockId: allocation.poolStockId, gearUnitId: allocation.gearUnitId,
        allocationId: allocation.id, handoffId: handoff.id,
        beforeLocationId: allocation.poolStock?.locationId, afterLocationId: allocation.poolStock?.locationId,
        beforeCondition: allocation.poolStock?.condition ?? allocation.gearUnit?.currentCondition,
        afterCondition: returnCondition, recordedById: userId, notes: validated.notes,
      });
      await recordGearActivity(tx, {
        leagueId: validated.leagueId, entityType: "HANDOFF", entityId: handoff.id,
        action: "returned", actorUserId: userId, details: { quantity: validated.quantity, disposition: validated.returnDisposition },
      });
      const openAllocations = await tx.gearAllocation.count({
        where: {
          reservationLine: { reservationId: allocation.reservationLine.reservationId },
          status: { in: ["PENDING", "ALLOCATED", "PICKED_UP", "PARTIALLY_RETURNED"] },
        },
      });
      if (openAllocations === 0) {
        await tx.gearReservation.updateMany({
          where: { id: allocation.reservationLine.reservationId, status: "FULFILLED" },
          data: { status: "CLOSED", custodyEndedAt: new Date(), version: { increment: 1 } },
        });
      }
      return { id: allocation.id, reservationId: allocation.reservationLine.reservationId };
    }, gearTransactionOptions);
    revalidatePath(reservationPath(validated.leagueId));
    revalidatePath(reservationPath(validated.leagueId, result.reservationId));
    revalidatePath(inventoryPath(validated.leagueId));
    return { success: true, data: { id: result.id } };
  } catch (error) {
    return actionError(error);
  }
}
