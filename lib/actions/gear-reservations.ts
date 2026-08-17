"use server";

import { Prisma, type GearCondition } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserLeagueRole, isTeamAdmin, requireLeagueRole, requireUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { recordGearActivity, recordGearInventoryMovement } from "@/lib/services/gear-ledger";
import {
  queueGearOutboxForLeagueAdmins,
  queueGearOutboxForRecipients,
  type GearOutboxEvent,
} from "@/lib/services/gear-outbox";
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
  isOutstandingAllocationOverdue,
} from "@/lib/utils/gear";
import type { GearAllocationStatus } from "@/types/gear";
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

export type GearReservationAllocationOption = {
  value: string;
  label: string;
  maxQuantity: number;
};

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
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2004", "P2034"].includes(error.code)) {
    return { success: false, error: "Inventory availability changed. Review the reservation dates and allocations, then try again." };
  }
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
            select: {
              id: true, status: true, poolStockId: true, gearUnitId: true,
              allocatedQty: true, pickedUpQty: true, returnedQty: true, releasedQty: true,
              effectiveStartDate: true, effectiveEndDate: true, version: true,
            },
          },
        },
      },
    },
  });
  if (!reservation) invalid("Reservation not found in this league.");
  return reservation;
}

function reservationWindow(reservation: {
  requestedStartDate: Date;
  requestedEndDate: Date;
  approvedStartDate: Date | null;
  approvedEndDate: Date | null;
}) {
  return {
    startDate: reservation.approvedStartDate ?? reservation.requestedStartDate,
    endDate: reservation.approvedEndDate ?? reservation.requestedEndDate,
  };
}

async function activePoolCommitment(
  leagueId: string,
  tx: Tx,
  poolStockId: string,
  window: { startDate: Date; endDate: Date },
) {
  const allocations = await tx.gearAllocation.findMany({
    where: {
      leagueId,
      poolStockId,
      status: { in: ["PENDING", "ALLOCATED", "PICKED_UP", "PARTIALLY_RETURNED"] },
      effectiveStartDate: { lte: window.endDate },
      effectiveEndDate: { gte: window.startDate },
    },
    select: { allocatedQty: true, releasedQty: true, returnedQty: true, pickedUpQty: true },
  });
  return allocations.reduce(
    (total, allocation) => total + activeAllocationQuantity(allocation),
    0,
  );
}

async function hasOverdueCheckout(tx: Tx, leagueId: string, gearUnitId: string) {
  const today = new Date();
  return Boolean(await tx.gearAllocation.findFirst({
    where: {
      leagueId, gearUnitId,
      status: { in: ["PICKED_UP", "PARTIALLY_RETURNED"] },
      effectiveEndDate: { lt: today },
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

type ReleasableAllocation = {
  id: string;
  status: GearAllocationStatus;
  allocatedQty: number;
  pickedUpQty: number;
  poolStockId: string | null;
  gearUnitId: string | null;
  version: number;
};

/**
 * Releasing uncollected inventory always reverses the same three effects:
 * the allocation row, the tagged unit projection, and the inventory ledger.
 */
async function releaseUncollectedAllocation(
  tx: Tx,
  leagueId: string,
  allocation: ReleasableAllocation,
  actorUserId: string,
  options: { action: string; notes?: string | null },
): Promise<void> {
  if (!canTransitionAllocation(allocation.status, "RELEASED") || allocation.pickedUpQty > 0) {
    invalid("Only uncollected allocations can be released.");
  }
  const release = await tx.gearAllocation.updateMany({
    where: { id: allocation.id, leagueId, version: allocation.version, status: allocation.status },
    data: {
      status: "RELEASED",
      releasedQty: allocation.allocatedQty,
      releasedAt: new Date(),
      version: { increment: 1 },
    },
  });
  if (release.count !== 1) throw new GearConflictError();
  if (allocation.gearUnitId) await releaseTaggedUnitIfFree(tx, leagueId, allocation.gearUnitId);
  await recordGearInventoryMovement(tx, {
    leagueId,
    type: "RELEASE",
    direction: "INCREASE",
    allocationId: allocation.id,
    poolStockId: allocation.poolStockId,
    gearUnitId: allocation.gearUnitId,
    quantity: allocation.allocatedQty,
    recordedById: actorUserId,
    notes: options.notes ?? undefined,
  });
  await recordGearActivity(tx, {
    leagueId,
    entityType: "ALLOCATION",
    entityId: allocation.id,
    action: options.action,
    actorUserId,
  });
}

/**
 * Allocations are the source of truth for custody, so any terminal allocation
 * change has to re-derive line totals and close the parent reservation once no
 * inventory remains outstanding.
 */
async function reconcileReservationAfterTerminalAllocation(
  tx: Tx,
  leagueId: string,
  reservationId: string,
): Promise<void> {
  const reservation = await tx.gearReservation.findFirst({
    where: { id: reservationId, leagueId },
    select: {
      id: true,
      status: true,
      version: true,
      lines: {
        select: {
          id: true,
          allocations: {
            select: {
              status: true,
              allocatedQty: true,
              pickedUpQty: true,
              returnedQty: true,
              releasedQty: true,
            },
          },
        },
      },
    },
  });
  if (!reservation) invalid("Reservation not found in this league.");

  for (const line of reservation.lines) {
    await tx.gearReservationLine.updateMany({
      where: { id: line.id, leagueId, reservationId },
      data: {
        allocatedQty: line.allocations.reduce(
          (total, allocation) => total + activeAllocationQuantity(allocation),
          0,
        ),
      },
    });
  }

  const allocations = reservation.lines.flatMap((line) => line.allocations);
  const hasActiveAllocation = allocations.some((allocation) =>
    ["PENDING", "ALLOCATED", "PICKED_UP", "PARTIALLY_RETURNED"].includes(allocation.status),
  );
  const hasOutstandingCustody = allocations.some((allocation) =>
    ["PICKED_UP", "PARTIALLY_RETURNED"].includes(allocation.status)
    && allocation.pickedUpQty > allocation.returnedQty,
  );
  if (reservation.status === "FULFILLED" && !hasActiveAllocation && !hasOutstandingCustody) {
    const closed = await tx.gearReservation.updateMany({
      where: { id: reservation.id, leagueId, status: "FULFILLED", version: reservation.version },
      data: { status: "CLOSED", custodyEndedAt: new Date(), version: { increment: 1 } },
    });
    if (closed.count !== 1) throw new GearConflictError();
  }
}

async function queueReservationPartyNotification(
  tx: Tx,
  event: GearOutboxEvent,
  reservation: { teamId: string; requestedById: string | null },
): Promise<void> {
  const teamAdmins = await tx.teamMember.findMany({
    where: { teamId: reservation.teamId, role: "ADMIN" },
    select: { userId: true },
  });
  await queueGearOutboxForRecipients(tx, event, [
    ...teamAdmins.map((membership) => membership.userId),
    ...(reservation.requestedById ? [reservation.requestedById] : []),
  ]);
}

/**
 * Server-authoritative allocation candidates for one reservation line and
 * proposed approved window. The mutation repeats these checks transactionally.
 */
export async function getGearReservationAllocationOptions(input: unknown): Promise<ActionResult<GearReservationAllocationOption[]>> {
  try {
    const validated = reservationCommand.extend({
      reservationLineId: gearId,
      approvedStartDate: date,
      approvedEndDate: date,
    }).refine((value) => value.approvedEndDate >= value.approvedStartDate, {
      path: ["approvedEndDate"],
      message: "Approved end date must be on or after the approved start date.",
    }).parse(input);
    await requireLeagueRole(validated.leagueId, "LEAGUE_ADMIN");
    const startDate = new Date(`${validated.approvedStartDate}T00:00:00.000Z`);
    const endDate = new Date(`${validated.approvedEndDate}T00:00:00.000Z`);
    const line = await prisma.gearReservationLine.findFirst({
      where: {
        id: validated.reservationLineId,
        reservation: { id: validated.reservationId, leagueId: validated.leagueId },
      },
      include: {
        catalogItem: { select: { id: true, trackingMode: true } },
        reservation: { select: { requestedStartDate: true, requestedEndDate: true } },
      },
    });
    if (!line?.catalogItem) invalid("Reservation line is not backed by an active catalog item.");
    if (!datesOverlap(
      { startDate: validated.approvedStartDate, endDate: validated.approvedEndDate },
      {
        startDate: line.reservation.requestedStartDate.toISOString().slice(0, 10),
        endDate: line.reservation.requestedEndDate.toISOString().slice(0, 10),
      },
    )) invalid("Approved dates must overlap the requested reservation dates.");

    if (line.catalogItem.trackingMode === "POOLED") {
      const stocks = await prisma.gearPoolStock.findMany({
        where: { leagueId: validated.leagueId, catalogItemId: line.catalogItem.id, location: { isActive: true } },
        include: {
          location: { select: { name: true } },
          allocations: {
            where: {
              status: { in: ["PENDING", "ALLOCATED", "PICKED_UP", "PARTIALLY_RETURNED"] },
              effectiveStartDate: { lte: endDate },
              effectiveEndDate: { gte: startDate },
            },
            select: { allocatedQty: true, pickedUpQty: true, returnedQty: true, releasedQty: true },
          },
        },
      });
      return {
        success: true,
        data: stocks.flatMap((stock) => {
          const available = stock.quantityOnHand - stock.allocations.reduce(
            (total, allocation) => total + activeAllocationQuantity(allocation), 0,
          );
          return available > 0 ? [{
            value: `pool:${stock.id}`,
            label: `${stock.location.name} (${stock.condition}, ${available} available)`,
            maxQuantity: available,
          }] : [];
        }),
      };
    }

    const units = await prisma.gearUnit.findMany({
      where: {
        leagueId: validated.leagueId,
        catalogItemId: line.catalogItem.id,
        status: { in: ["AVAILABLE", "RESERVED"] },
      },
      select: { id: true, assetTag: true, currentCondition: true },
    });
    const [conflicts, overdueCheckouts] = await Promise.all([
      prisma.gearAllocation.findMany({
        where: {
          leagueId: validated.leagueId,
          gearUnitId: { in: units.map((unit) => unit.id) },
          status: { in: ["PENDING", "ALLOCATED", "PICKED_UP", "PARTIALLY_RETURNED"] },
          effectiveStartDate: { lte: endDate },
          effectiveEndDate: { gte: startDate },
        },
        select: { gearUnitId: true },
      }),
      prisma.gearAllocation.findMany({
        where: {
          leagueId: validated.leagueId,
          gearUnitId: { in: units.map((unit) => unit.id) },
          status: { in: ["PICKED_UP", "PARTIALLY_RETURNED"] },
          effectiveEndDate: { lt: new Date() },
        },
        select: { gearUnitId: true },
      }),
    ]);
    const unavailable = new Set([
      ...conflicts.map((allocation) => allocation.gearUnitId),
      ...overdueCheckouts.map((allocation) => allocation.gearUnitId),
    ]);
    return {
      success: true,
      data: units
        .filter((unit) => !unavailable.has(unit.id))
        .map((unit) => ({
          value: `unit:${unit.id}`,
          label: `${unit.assetTag ?? "Tagged unit"} (${unit.currentCondition})`,
          maxQuantity: 1,
        })),
    };
  } catch (error) {
    return actionError(error);
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
        select: { id: true, name: true },
      });
      const itemById = new Map(items.map((item) => [item.id, item]));
      const itemIds = new Set(itemById.keys());
      if (validated.lines.some((line) => line.catalogItemId && !itemIds.has(line.catalogItemId))) {
        invalid("A requested catalog item is not available in this league.");
      }
      const needLineIds = validated.lines
        .map((line) => line.needLineId)
        .filter((needLineId): needLineId is string => Boolean(needLineId));
      const needLines = await tx.teamGearNeedLine.findMany({
        where: {
          leagueId: validated.leagueId,
          id: { in: needLineIds },
          need: { leagueId: validated.leagueId, teamId: validated.teamId },
        },
        select: { id: true, catalogItemId: true, nameSnapshot: true },
      });
      const needLineById = new Map(needLines.map((needLine) => [needLine.id, needLine]));
      if (needLineById.size !== needLineIds.length) {
        invalid("A selected gear need does not belong to this team in this league.");
      }
      const trustedLines = validated.lines.map((line) => {
        const needLine = line.needLineId ? needLineById.get(line.needLineId) : undefined;
        if (!needLine) {
          const catalogItem = line.catalogItemId ? itemById.get(line.catalogItemId) : undefined;
          return catalogItem ? { ...line, nameSnapshot: catalogItem.name } : line;
        }
        if (line.catalogItemId && line.catalogItemId !== needLine.catalogItemId) {
          invalid("A selected gear need does not match its catalog item.");
        }
        return {
          ...line,
          catalogItemId: needLine.catalogItemId ?? "",
          nameSnapshot: needLine.nameSnapshot,
          needLineId: needLine.id,
        };
      });
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
          lines: { create: trustedLines.map((line) => ({
            leagueId: validated.leagueId,
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
        action: "requested", actorUserId: userId, details: { metadata: { teamId: validated.teamId } },
      });
      await queueGearOutboxForLeagueAdmins(tx, {
        leagueId: validated.leagueId,
        eventType: "gear.reservation.requested",
        occurrenceKey: "v1",
        aggregateType: "RESERVATION",
        aggregateId: reservation.id,
        payload: { kind: "GEAR_RESERVATION", data: { reservationId: reservation.id, teamId: validated.teamId } },
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
      const activeAllocations = reservation.lines.flatMap((line) => line.allocations)
        .filter((allocation) => ["PENDING", "ALLOCATED", "PICKED_UP", "PARTIALLY_RETURNED"].includes(allocation.status));
      if (activeAllocations.some((allocation) => allocation.pickedUpQty > allocation.returnedQty)) {
        invalid("Checked-out gear must be returned before this reservation can be canceled.");
      }
      for (const allocation of activeAllocations) {
        await releaseUncollectedAllocation(tx, validated.leagueId, allocation, userId, {
          action: "released_by_reservation_cancellation",
          notes: "Reservation canceled before pickup.",
        });
      }
      for (const line of reservation.lines) {
        await tx.gearReservationLine.updateMany({
          where: { id: line.id, leagueId: validated.leagueId },
          data: { allocatedQty: 0 },
        });
      }
      const update = await tx.gearReservation.updateMany({
        where: { id: reservation.id, leagueId: validated.leagueId, version: reservation.version, status: reservation.status },
        data: { status: "CANCELED", canceledAt: new Date(), version: { increment: 1 } },
      });
      if (update.count !== 1) throw new GearConflictError();
      await recordGearActivity(tx, { leagueId: validated.leagueId, entityType: "RESERVATION", entityId: reservation.id, action: "canceled", actorUserId: userId });
      await queueGearOutboxForLeagueAdmins(tx, {
        leagueId: validated.leagueId,
        eventType: "gear.reservation.canceled",
        occurrenceKey: `v${reservation.version + 1}`,
        aggregateType: "RESERVATION",
        aggregateId: reservation.id,
        payload: { kind: "GEAR_RESERVATION", data: { reservationId: reservation.id, teamId: reservation.teamId } },
      });
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
      await queueGearOutboxForLeagueAdmins(tx, {
        leagueId: validated.leagueId,
        eventType: "gear.reservation.rescheduled",
        occurrenceKey: `v${reservation.version + 1}`,
        aggregateType: "RESERVATION",
        aggregateId: reservation.id,
        payload: { kind: "GEAR_RESERVATION", data: { reservationId: reservation.id, teamId: reservation.teamId } },
      });
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
      await queueReservationPartyNotification(tx, {
        leagueId: validated.leagueId,
        eventType: "gear.reservation.declined",
        occurrenceKey: `v${reservation.version + 1}`,
        aggregateType: "RESERVATION",
        aggregateId: reservation.id,
        payload: { kind: "GEAR_RESERVATION", data: { reservationId: reservation.id, teamId: reservation.teamId } },
      }, reservation);
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
      const currentWindow = reservationWindow(reservation);
      const window = {
        startDate: new Date(`${validated.approvedStartDate ?? currentWindow.startDate.toISOString().slice(0, 10)}T00:00:00.000Z`),
        endDate: new Date(`${validated.approvedEndDate ?? currentWindow.endDate.toISOString().slice(0, 10)}T00:00:00.000Z`),
      };
      const activeExistingAllocations = reservation.lines.flatMap((line) => line.allocations)
        .filter((allocation) => ["PENDING", "ALLOCATED", "PICKED_UP", "PARTIALLY_RETURNED"].includes(allocation.status));
      if (
        activeExistingAllocations.length > 0
        && (window.startDate.getTime() !== currentWindow.startDate.getTime() || window.endDate.getTime() !== currentWindow.endDate.getTime())
      ) {
        invalid("Release and reallocate existing inventory before changing approved reservation dates.");
      }
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
          const committed = await activePoolCommitment(validated.leagueId, tx, stock.id, window);
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
          if (await hasOverdueCheckout(tx, validated.leagueId, unit.id)) invalid("The tagged unit is blocked by an overdue checkout.");
          const conflicts = await tx.gearAllocation.count({
            where: {
              leagueId: validated.leagueId,
              gearUnitId: unit.id,
              status: { in: ["PENDING", "ALLOCATED", "PICKED_UP", "PARTIALLY_RETURNED"] },
              effectiveStartDate: { lte: window.endDate },
              effectiveEndDate: { gte: window.startDate },
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
            effectiveStartDate: window.startDate,
            effectiveEndDate: window.endDate,
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
        action: "approved_and_allocated", actorUserId: userId, details: { metadata: { allocationCount: validated.allocations.length } },
      });
      await queueReservationPartyNotification(tx, {
        leagueId: validated.leagueId,
        eventType: "gear.reservation.approved",
        occurrenceKey: `v${reservation.version + 1}`,
        aggregateType: "RESERVATION",
        aggregateId: reservation.id,
        payload: { kind: "GEAR_RESERVATION", data: { reservationId: reservation.id, teamId: reservation.teamId, allocationCount: validated.allocations.length } },
      }, reservation);
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
      await releaseUncollectedAllocation(tx, validated.leagueId, allocation, userId, {
        action: "released",
        notes: validated.notes,
      });
      await reconcileReservationAfterTerminalAllocation(
        tx,
        validated.leagueId,
        allocation.reservationLine.reservationId,
      );
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
      if (isOutstandingAllocationOverdue({ status: "PICKED_UP", effectiveEndDate: allocation.effectiveEndDate })) {
        invalid("This allocation is past its due date and cannot be checked out.");
      }
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
        leagueId: validated.leagueId, type: "ALLOCATION", direction: "DECREASE", quantity: validated.quantity,
        poolStockId: allocation.poolStockId, gearUnitId: allocation.gearUnitId,
        allocationId: allocation.id, handoffId: handoff.id, recordedById: userId, notes: validated.notes,
      });
      await recordGearActivity(tx, { leagueId: validated.leagueId, entityType: "HANDOFF", entityId: handoff.id, action: "picked_up", actorUserId: userId });
      const reservationUpdate = await tx.gearReservation.updateMany({
        where: { id: allocation.reservationLine.reservationId, status: "APPROVED" },
        data: { status: "FULFILLED", custodyStartedAt: new Date(), version: { increment: 1 } },
      });
      void reservationUpdate;
      await queueReservationPartyNotification(tx, {
        leagueId: validated.leagueId,
        eventType: "gear.reservation.picked_up",
        occurrenceKey: `${allocation.id}:v${allocation.version + 1}`,
        aggregateType: "RESERVATION",
        aggregateId: allocation.reservationLine.reservationId,
        payload: { kind: "GEAR_ALLOCATION", data: { reservationId: allocation.reservationLine.reservationId, allocationId: allocation.id, quantity: validated.quantity } },
      }, allocation.reservationLine.reservation);
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
    if (validated.returnDisposition === "GOOD" && validated.condition === "DAMAGED") {
      invalid("A damaged disposition is required when the returned condition is damaged.");
    }
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
        const remainingActiveAllocations = await tx.gearAllocation.count({
          where: {
            leagueId: validated.leagueId,
            gearUnitId: allocation.gearUnit.id,
            id: { not: allocation.id },
            status: { in: ["PENDING", "ALLOCATED", "PICKED_UP", "PARTIALLY_RETURNED"] },
          },
        });
        const unitStatus = validated.returnDisposition === "LOST"
          ? "LOST"
          : validated.returnDisposition === "CONSUMED" ? "RETIRED"
            : validated.returnDisposition === "DAMAGED" ? "MAINTENANCE" : "AVAILABLE";
        const unitUpdate = await tx.gearUnit.updateMany({
          where: { id: allocation.gearUnit.id, leagueId: validated.leagueId, version: allocation.gearUnit.version, status: "CHECKED_OUT" },
          data: {
            status: unitStatus === "AVAILABLE" && remainingActiveAllocations > 0 ? "RESERVED" : unitStatus,
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
        direction: ["LOST", "CONSUMED"].includes(validated.returnDisposition) ? "DECREASE" : "INCREASE",
        quantity: validated.quantity, poolStockId: allocation.poolStockId, gearUnitId: allocation.gearUnitId,
        allocationId: allocation.id, handoffId: handoff.id,
        beforeLocationId: allocation.poolStock?.locationId, afterLocationId: allocation.poolStock?.locationId,
        beforeCondition: allocation.poolStock?.condition ?? allocation.gearUnit?.currentCondition,
        afterCondition: returnCondition, recordedById: userId, notes: validated.notes,
      });
      await recordGearActivity(tx, {
        leagueId: validated.leagueId, entityType: "HANDOFF", entityId: handoff.id,
        action: "returned", actorUserId: userId, details: { metadata: { quantity: validated.quantity, disposition: validated.returnDisposition } },
      });
      await reconcileReservationAfterTerminalAllocation(
        tx,
        validated.leagueId,
        allocation.reservationLine.reservationId,
      );
      await queueReservationPartyNotification(tx, {
        leagueId: validated.leagueId,
        eventType: "gear.reservation.returned",
        occurrenceKey: `${allocation.id}:v${allocation.version + 1}`,
        aggregateType: "RESERVATION",
        aggregateId: allocation.reservationLine.reservationId,
        payload: { kind: "GEAR_ALLOCATION", data: {
          reservationId: allocation.reservationLine.reservationId,
          allocationId: allocation.id,
          quantity: validated.quantity,
          disposition: validated.returnDisposition,
        } },
      }, allocation.reservationLine.reservation);
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
