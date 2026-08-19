"use server";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Permission } from "@/lib/utils/permission-types";
import { requirePermissionForLeague } from "@/lib/utils/permissions";
import { prisma } from "@/lib/db/prisma";
import { recordGearActivity, recordGearInventoryMovement } from "@/lib/services/gear-ledger";
import { queueGearOutboxForEmail, queueGearOutboxForLeagueAdmins } from "@/lib/services/gear-outbox";
import { redactTerminalGearPledgePii } from "@/lib/services/gear-pledge-retention";
import {
  GearConflictError,
  gearTransactionOptions,
  withGearSerializableRetry,
} from "@/lib/services/gear-transaction";
import {
  checkRateLimit,
  getClientIp,
  RATE_LIMITS,
  rateLimitMessage,
} from "@/lib/utils/durable-rate-limit";
import { normalizeGearAssetTag } from "@/lib/utils/gear";
import {
  correctGearPledgeReceiptSchema,
  createGearPledgeSchema,
  receiveGearPledgeSchema,
} from "@/lib/utils/validation";
import type { ActionResult } from "@/lib/actions/gear-inventory";

const gearId = z.string().cuid("Invalid gear identifier");
const pledgeCommandSchema = z.object({
  leagueId: gearId,
  pledgeId: gearId,
  expectedVersion: z.coerce.number().int().min(0),
});

type Tx = Prisma.TransactionClient;

function receiptPayloadHash(input: ReturnType<typeof receiveGearPledgeSchema.parse>): string {
  const payload = {
    leagueId: input.leagueId,
    pledgeId: input.pledgeId,
    expectedVersion: input.expectedVersion,
    poolStockId: input.poolStockId ?? null,
    catalogItemId: input.catalogItemId ?? null,
    locationId: input.locationId ?? null,
    condition: input.condition ?? null,
    quantity: input.quantity,
    notes: input.notes ?? null,
    assetTags: (input.assetTags ?? []).map(normalizeGearAssetTag).sort(),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function wishlistPath(leagueId: string) {
  return `/league/${leagueId}/gear/wishlist`;
}

function invalid(message: string): never {
  throw new Error(`Gear validation: ${message}`);
}

function actionError(error: unknown): ActionResult<never> {
  if (error instanceof GearConflictError) return { success: false, error: error.message };
  if (error instanceof z.ZodError) {
    return { success: false, error: "Please correct the highlighted pledge fields.", details: error.issues };
  }
  if (error instanceof Error) {
    if (error.message.startsWith("Unauthorized")) return { success: false, error: "League admin access is required." };
    if (error.message.startsWith("Gear validation:")) return { success: false, error: error.message.slice(17) };
  }
  return { success: false, error: "Unable to update the gear pledge. Please try again." };
}

async function publicPledgeByIdempotency(
  wishlistToken: string,
  wishlistItemId: string,
  idempotencyKey: string,
) {
  return prisma.gearPledge.findFirst({
    where: {
      idempotencyKey,
      wishlistItemId,
      wishlistItem: { wishlist: { shareToken: wishlistToken } },
    },
    select: { id: true, status: true },
  });
}

export async function createGearPledge(
  input: z.input<typeof createGearPledgeSchema>,
): Promise<ActionResult<{ id: string | null; status: string }>> {
  try {
    // Check the honeypot before normal validation so bots always receive the
    // same generic response, even when they omit consent or other fields.
    if (typeof input === "object" && input !== null && "website" in input
      && typeof input.website === "string" && input.website.trim()) {
      return { success: false, error: "Unable to submit the pledge. Please try again." };
    }
    const validated = createGearPledgeSchema.parse(input);
    if (!validated.contactConsent) invalid("Contact consent is required to submit a pledge.");

    const existing = await publicPledgeByIdempotency(
      validated.wishlistToken,
      validated.wishlistItemId,
      validated.idempotencyKey,
    );
    if (existing) return { success: true, data: existing };

    const ip = await getClientIp();
    if (!ip) {
      return { success: false, error: "Unable to submit the pledge. Please try again." };
    }
    const rateLimit = await checkRateLimit(
      `gear-pledge:ip:${ip}`,
      RATE_LIMITS.GEAR_PLEDGE_PER_IP,
      { failOpen: false },
    );
    if (!rateLimit.allowed) {
      return { success: false, error: rateLimitMessage(rateLimit.retryAfterSec) };
    }

    const pledge = await withGearSerializableRetry(() => prisma.$transaction(async (tx) => {
      const item = await tx.gearWishlistItem.findFirst({
        where: {
          id: validated.wishlistItemId,
          isActive: true,
          wishlist: {
            shareToken: validated.wishlistToken,
            status: "PUBLISHED",
            league: { isActive: true },
          },
        },
        select: { id: true, wishlistId: true, pledgedQty: true, receivedQty: true, targetQty: true, wishlist: { select: { leagueId: true } } },
      });
      if (!item) invalid("This wishlist item is no longer accepting pledges.");
      const duplicate = await tx.gearPledge.findUnique({
        where: { leagueId_idempotencyKey: { leagueId: item.wishlist.leagueId, idempotencyKey: validated.idempotencyKey } },
        select: { id: true, status: true },
      });
      if (duplicate) return duplicate;
      const remaining = item.targetQty - item.pledgedQty;
      if (validated.quantity > remaining) {
        // Retain the transactional row lock even for a rejected over-pledge.
        await tx.gearWishlistItem.update({
          where: { id: item.id },
          data: { pledgedQty: { increment: 0 } },
        });
        invalid("Pledge quantity exceeds the remaining wishlist target.");
      }

      const created = await tx.gearPledge.create({
        data: {
          leagueId: item.wishlist.leagueId,
          wishlistItemId: item.id,
          donorName: validated.donorName,
          donorEmail: validated.donorEmail || null,
          donorPhone: validated.donorPhone || null,
          contactConsentAt: validated.contactConsent ? new Date() : null,
          quantity: validated.quantity,
          note: validated.note || null,
          idempotencyKey: validated.idempotencyKey,
        },
        select: { id: true, status: true },
      });
      await tx.gearWishlistItem.update({
        where: { id: item.id },
        data: { pledgedQty: { increment: validated.quantity } },
      });
      await recordGearActivity(tx, {
        leagueId: item.wishlist.leagueId,
        entityType: "PLEDGE",
        entityId: created.id,
        action: "pledged",
        actorKind: "PUBLIC_DONOR",
        details: { metadata: { wishlistItemId: item.id, quantity: validated.quantity } },
      });
      await queueGearOutboxForLeagueAdmins(tx, {
        leagueId: item.wishlist.leagueId,
        eventType: "gear.pledge.created",
        occurrenceKey: created.id,
        aggregateType: "PLEDGE",
        aggregateId: created.id,
        payload: { kind: "GEAR_PLEDGE", data: { pledgeId: created.id, wishlistItemId: item.id, quantity: validated.quantity } },
      });
      await queueGearOutboxForEmail(tx, {
        leagueId: item.wishlist.leagueId,
        eventType: "gear.pledge.acknowledged",
        occurrenceKey: created.id,
        aggregateType: "PLEDGE",
        aggregateId: created.id,
        payload: { kind: "GEAR_PLEDGE", data: { pledgeId: created.id, wishlistItemId: item.id, quantity: validated.quantity } },
      }, validated.donorEmail || null);
      return created;
    }, gearTransactionOptions));

    return { success: true, data: pledge };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const parsed = createGearPledgeSchema.safeParse(input);
      if (parsed.success) {
        const existing = await publicPledgeByIdempotency(
          parsed.data.wishlistToken,
          parsed.data.wishlistItemId,
          parsed.data.idempotencyKey,
        );
        if (existing) return { success: true, data: existing };
      }
    }
    return actionError(error);
  }
}

export async function createPublicGearPledge(
  input: z.input<typeof createGearPledgeSchema>,
): Promise<ActionResult<{ id: string | null; status: string }>> {
  return createGearPledge(input);
}

export async function receiveGearPledge(
  input: z.input<typeof receiveGearPledgeSchema>,
): Promise<ActionResult<{ receiptId: string; receiptIds: string[]; pledgeStatus: string; pledgeVersion: number }>> {
  try {
    const validated = receiveGearPledgeSchema.parse(input);
    const payloadHash = receiptPayloadHash(validated);
    const userId = await requirePermissionForLeague(validated.leagueId, Permission.MANAGE_GEAR_WISHLIST);
    const result = await withGearSerializableRetry(() => prisma.$transaction(async (tx) => {
      const priorCommand = await tx.gearPledgeReceiptCommand.findUnique({
        where: {
          leagueId_pledgeId_idempotencyKey: {
            leagueId: validated.leagueId,
            pledgeId: validated.pledgeId,
            idempotencyKey: validated.idempotencyKey,
          },
        },
        select: {
          payloadHash: true,
          resultingStatus: true,
          resultingVersion: true,
          receipts: { select: { id: true } },
        },
      });
      if (priorCommand) {
        if (priorCommand.payloadHash !== payloadHash) {
          invalid("This receipt operation key was already used with different details.");
        }
        const receiptIds = priorCommand.receipts.map((receipt) => receipt.id);
        if (receiptIds.length === 0) invalid("The saved receipt command has no receipts.");
        return {
          receiptId: receiptIds[0],
          receiptIds,
          pledgeStatus: priorCommand.resultingStatus,
          pledgeVersion: priorCommand.resultingVersion,
        };
      }
      const pledge = await tx.gearPledge.findFirst({
        where: { id: validated.pledgeId, leagueId: validated.leagueId, status: "PLEDGED" },
        include: { wishlistItem: { select: { id: true, catalogItemId: true } } },
      });
      if (!pledge) invalid("An active pledge was not found.");
      if (pledge.version !== validated.expectedVersion) throw new GearConflictError();

      const received = await tx.gearPledgeReceipt.aggregate({
        where: { pledgeId: pledge.id },
        _sum: { quantity: true },
      });
      const alreadyReceived = received._sum.quantity ?? 0;
      if (alreadyReceived + validated.quantity > pledge.quantity) {
        invalid("Receipt quantity exceeds the remaining pledged quantity.");
      }

      const remainingAfterReceipt = pledge.quantity - alreadyReceived - validated.quantity;
      const pledgeStatus = remainingAfterReceipt === 0 ? "RECEIVED" : "PLEDGED";
      const command = await tx.gearPledgeReceiptCommand.create({
        data: {
          leagueId: validated.leagueId,
          pledgeId: pledge.id,
          idempotencyKey: validated.idempotencyKey,
          payloadHash,
          expectedVersion: validated.expectedVersion,
          resultingVersion: pledge.version + 1,
          resultingStatus: pledgeStatus,
        },
        select: { id: true },
      });
      const receiptIds: string[] = [];

      if (validated.poolStockId) {
        const stock = await tx.gearPoolStock.findFirst({
          where: {
            id: validated.poolStockId,
            leagueId: validated.leagueId,
            catalogItem: { trackingMode: "POOLED", isActive: true },
          },
          select: { id: true, catalogItemId: true, locationId: true, condition: true },
        });
        if (!stock) invalid("The selected pooled inventory row is not active in this league.");
        if (validated.catalogItemId && validated.catalogItemId !== stock.catalogItemId) {
          invalid("The selected pooled inventory does not match the supplied catalog item.");
        }
        if (pledge.wishlistItem.catalogItemId && pledge.wishlistItem.catalogItemId !== stock.catalogItemId) {
          invalid("Received inventory does not match the pledged catalog item.");
        }
        await tx.gearPoolStock.update({
          where: { id: stock.id },
          data: { quantityOnHand: { increment: validated.quantity }, version: { increment: 1 } },
        });
        const receipt = await tx.gearPledgeReceipt.create({
          data: {
            leagueId: validated.leagueId,
            pledgeId: pledge.id,
            receiptCommandId: command.id,
            catalogItemId: stock.catalogItemId,
            poolStockId: stock.id,
            quantity: validated.quantity,
            notes: validated.notes || null,
          },
          select: { id: true },
        });
        receiptIds.push(receipt.id);
        await recordGearInventoryMovement(tx, {
          leagueId: validated.leagueId,
          type: "RECEIPT",
          direction: "INCREASE",
          quantity: validated.quantity,
          poolStockId: stock.id,
          pledgeReceiptId: receipt.id,
          afterLocationId: stock.locationId,
          afterCondition: stock.condition,
          recordedById: userId,
          notes: validated.notes || null,
        });
      } else if (!(validated.assetTags?.length)) {
        if (!validated.catalogItemId || !validated.locationId || !validated.condition) {
          invalid("Pooled receipts require catalog, location, and condition.");
        }
        const [catalogItem, location] = await Promise.all([
          tx.gearCatalogItem.findFirst({
            where: {
              id: validated.catalogItemId,
              leagueId: validated.leagueId,
              isActive: true,
              trackingMode: "POOLED",
            },
            select: { id: true },
          }),
          tx.gearStorageLocation.findFirst({
            where: { id: validated.locationId, leagueId: validated.leagueId, isActive: true },
            select: { id: true },
          }),
        ]);
        if (!catalogItem) invalid("The selected catalog item is not active for pooled inventory.");
        if (!location) invalid("The selected storage location is not active in this league.");
        if (pledge.wishlistItem.catalogItemId && pledge.wishlistItem.catalogItemId !== catalogItem.id) {
          invalid("Received inventory does not match the pledged catalog item.");
        }
        const stock = await tx.gearPoolStock.upsert({
          where: {
            leagueId_catalogItemId_locationId_condition: {
              leagueId: validated.leagueId,
              catalogItemId: catalogItem.id,
              locationId: location.id,
              condition: validated.condition,
            },
          },
          create: {
            leagueId: validated.leagueId,
            catalogItemId: catalogItem.id,
            locationId: location.id,
            condition: validated.condition,
            quantityOnHand: validated.quantity,
            version: 1,
          },
          update: {
            quantityOnHand: { increment: validated.quantity },
            version: { increment: 1 },
          },
          select: { id: true, locationId: true, condition: true },
        });
        const receipt = await tx.gearPledgeReceipt.create({
          data: {
            leagueId: validated.leagueId,
            pledgeId: pledge.id,
            receiptCommandId: command.id,
            catalogItemId: catalogItem.id,
            poolStockId: stock.id,
            quantity: validated.quantity,
            notes: validated.notes || null,
          },
          select: { id: true },
        });
        receiptIds.push(receipt.id);
        await recordGearInventoryMovement(tx, {
          leagueId: validated.leagueId,
          type: "RECEIPT",
          direction: "INCREASE",
          quantity: validated.quantity,
          poolStockId: stock.id,
          pledgeReceiptId: receipt.id,
          afterLocationId: stock.locationId,
          afterCondition: stock.condition,
          recordedById: userId,
          notes: validated.notes || null,
        });
      } else {
        const assetTags = (validated.assetTags ?? []).map(normalizeGearAssetTag);
        if (!validated.catalogItemId || !validated.locationId || !validated.condition || assetTags.length === 0) {
          invalid("Tagged receipts require catalog, location, condition, and asset tags.");
        }
        if (new Set(assetTags).size !== assetTags.length) invalid("Each received asset tag must be unique.");
        const [catalogItem, location, existingUnits] = await Promise.all([
          tx.gearCatalogItem.findFirst({
            where: {
              id: validated.catalogItemId,
              leagueId: validated.leagueId,
              isActive: true,
              trackingMode: "INDIVIDUAL",
            },
            select: { id: true },
          }),
          tx.gearStorageLocation.findFirst({
            where: { id: validated.locationId, leagueId: validated.leagueId, isActive: true },
            select: { id: true },
          }),
          tx.gearUnit.findMany({
            where: { leagueId: validated.leagueId, assetTag: { in: assetTags } },
            select: { assetTag: true },
          }),
        ]);
        if (!catalogItem) invalid("The selected catalog item is not active for individually tracked inventory.");
        if (!location) invalid("The selected storage location is not active in this league.");
        if (existingUnits.length > 0) invalid("One or more received asset tags already exist in this league.");
        if (pledge.wishlistItem.catalogItemId && pledge.wishlistItem.catalogItemId !== catalogItem.id) {
          invalid("Received inventory does not match the pledged catalog item.");
        }

        for (const assetTag of assetTags) {
          const unit = await tx.gearUnit.create({
            data: {
              leagueId: validated.leagueId,
              catalogItemId: catalogItem.id,
              assetTag,
              status: "AVAILABLE",
              currentCondition: validated.condition,
              currentLocationId: location.id,
              acquiredAt: new Date(),
            },
            select: { id: true },
          });
          const receipt = await tx.gearPledgeReceipt.create({
            data: {
              leagueId: validated.leagueId,
              pledgeId: pledge.id,
              receiptCommandId: command.id,
              catalogItemId: catalogItem.id,
              gearUnitId: unit.id,
              quantity: 1,
              notes: validated.notes || null,
            },
            select: { id: true },
          });
          receiptIds.push(receipt.id);
          await recordGearInventoryMovement(tx, {
            leagueId: validated.leagueId,
            type: "RECEIPT",
            direction: "INCREASE",
            quantity: 1,
            gearUnitId: unit.id,
            pledgeReceiptId: receipt.id,
            afterLocationId: location.id,
            afterCondition: validated.condition,
            recordedById: userId,
            notes: validated.notes || null,
          });
          await recordGearActivity(tx, {
            leagueId: validated.leagueId,
            entityType: "UNIT",
            entityId: unit.id,
            action: "received_from_pledge",
            actorUserId: userId,
            details: { metadata: { pledgeId: pledge.id, receiptId: receipt.id, assetTag } },
          });
        }
      }

      const pledgeUpdate = await tx.gearPledge.updateMany({
        where: { id: pledge.id, leagueId: validated.leagueId, status: "PLEDGED", version: pledge.version },
        data: {
          ...(pledgeStatus === "RECEIVED" ? { status: "RECEIVED", receivedAt: new Date() } : {}),
          version: { increment: 1 },
        },
      });
      if (pledgeUpdate.count !== 1) throw new GearConflictError();
      await tx.gearWishlistItem.update({
        where: { id: pledge.wishlistItem.id },
        data: {
          pledgedQty: { decrement: validated.quantity },
          receivedQty: { increment: validated.quantity },
        },
      });
      await recordGearActivity(tx, {
        leagueId: validated.leagueId,
        entityType: "PLEDGE",
        entityId: pledge.id,
        action: pledgeStatus === "RECEIVED" ? "received" : "partially_received",
        actorUserId: userId,
        details: { metadata: {
          receiptIds: receiptIds.join(","),
          quantity: validated.quantity,
          inventoryKind: validated.poolStockId ? "POOLED" : "INDIVIDUAL",
        } },
      });
      await queueGearOutboxForLeagueAdmins(tx, {
        leagueId: validated.leagueId,
        eventType: "gear.pledge.received",
        occurrenceKey: command.id,
        aggregateType: "PLEDGE",
        aggregateId: pledge.id,
        payload: { kind: "GEAR_PLEDGE", data: {
          pledgeId: pledge.id,
          receiptIds: receiptIds.join(","),
          wishlistItemId: pledge.wishlistItem.id,
          quantity: validated.quantity,
          status: pledgeStatus,
        } },
      });
      return { receiptId: receiptIds[0], receiptIds, pledgeStatus, pledgeVersion: pledge.version + 1 };
    }, gearTransactionOptions));

    revalidatePath(wishlistPath(validated.leagueId));
    revalidatePath(`/league/${validated.leagueId}/gear`);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const parsed = receiveGearPledgeSchema.safeParse(input);
      if (parsed.success) {
        const priorCommand = await prisma.gearPledgeReceiptCommand.findUnique({
          where: {
            leagueId_pledgeId_idempotencyKey: {
              leagueId: parsed.data.leagueId,
              pledgeId: parsed.data.pledgeId,
              idempotencyKey: parsed.data.idempotencyKey,
            },
          },
          select: {
            payloadHash: true,
            resultingStatus: true,
            resultingVersion: true,
            receipts: { select: { id: true } },
          },
        });
        if (priorCommand?.receipts.length) {
          if (priorCommand.payloadHash !== receiptPayloadHash(parsed.data)) {
            return { success: false, error: "This receipt operation key was already used with different details." };
          }
          const receiptIds = priorCommand.receipts.map((receipt) => receipt.id);
          return {
            success: true,
            data: {
              receiptId: receiptIds[0],
              receiptIds,
              pledgeStatus: priorCommand.resultingStatus,
              pledgeVersion: priorCommand.resultingVersion,
            },
          };
        }
      }
    }
    return actionError(error);
  }
}

export async function correctGearPledgeReceipt(
  input: unknown,
): Promise<ActionResult<{ receiptId: string; pledgeStatus: string; pledgeVersion: number }>> {
  try {
    const validated = correctGearPledgeReceiptSchema.parse(input);
    const userId = await requirePermissionForLeague(validated.leagueId, Permission.MANAGE_GEAR_WISHLIST);
    const result = await withGearSerializableRetry(() => prisma.$transaction(async (tx) => {
      const receipt = await tx.gearPledgeReceipt.findFirst({
        where: {
          id: validated.receiptId,
          leagueId: validated.leagueId,
          pledgeId: validated.pledgeId,
        },
        include: {
          correction: { select: { id: true } },
          pledge: {
            select: {
              id: true,
              status: true,
              version: true,
              wishlistItem: { select: { id: true, receivedQty: true } },
            },
          },
        },
      });
      if (!receipt) invalid("Receipt not found for this pledge.");
      if (receipt.correction) invalid("This receipt has already been corrected.");
      if (receipt.quantity <= 0) invalid("Only original receipt entries can be corrected.");
      if (receipt.pledge.version !== validated.expectedVersion) throw new GearConflictError();

      if (receipt.poolStockId) {
        const stockUpdate = await tx.gearPoolStock.updateMany({
          where: {
            id: receipt.poolStockId,
            leagueId: validated.leagueId,
            quantityOnHand: { gte: receipt.quantity },
          },
          data: { quantityOnHand: { decrement: receipt.quantity }, version: { increment: 1 } },
        });
        if (stockUpdate.count !== 1) {
          throw new GearConflictError("Inventory changed before this receipt correction could be recorded.");
        }
      } else if (receipt.gearUnitId) {
        const unitUpdate = await tx.gearUnit.updateMany({
          where: { id: receipt.gearUnitId, leagueId: validated.leagueId, status: "AVAILABLE" },
          data: { status: "RETIRED", retiredAt: new Date(), version: { increment: 1 } },
        });
        if (unitUpdate.count !== 1) {
          throw new GearConflictError("The received tagged unit can no longer be corrected.");
        }
      } else {
        invalid("Receipt has no inventory record to correct.");
      }

      const correction = await tx.gearPledgeReceipt.create({
        data: {
          leagueId: validated.leagueId,
          pledgeId: receipt.pledgeId,
          catalogItemId: receipt.catalogItemId,
          poolStockId: receipt.poolStockId,
          gearUnitId: receipt.gearUnitId,
          correctionOfReceiptId: receipt.id,
          correctionReason: validated.reason,
          quantity: -receipt.quantity,
          notes: "Receipt correction",
        },
        select: { id: true },
      });
      await recordGearInventoryMovement(tx, {
        leagueId: validated.leagueId,
        type: "ADJUSTMENT",
        direction: "DECREASE",
        quantity: receipt.quantity,
        poolStockId: receipt.poolStockId,
        gearUnitId: receipt.gearUnitId,
        pledgeReceiptId: correction.id,
        recordedById: userId,
        notes: validated.reason,
      });
      const pledgeStatus = "PLEDGED";
      const pledgeUpdate = await tx.gearPledge.updateMany({
        where: {
          id: validated.pledgeId,
          leagueId: validated.leagueId,
          version: receipt.pledge.version,
        },
        data: {
          status: pledgeStatus,
          receivedAt: null,
          version: { increment: 1 },
        },
      });
      if (pledgeUpdate.count !== 1) throw new GearConflictError();
      await tx.gearWishlistItem.update({
        where: { id: receipt.pledge.wishlistItem.id },
        data: {
          pledgedQty: { increment: receipt.quantity },
          receivedQty: { decrement: receipt.quantity },
        },
      });
      await recordGearActivity(tx, {
        leagueId: validated.leagueId,
        entityType: "PLEDGE",
        entityId: validated.pledgeId,
        action: "receipt_corrected",
        actorUserId: userId,
        details: { metadata: { receiptId: receipt.id, correctionReceiptId: correction.id, quantity: receipt.quantity } },
      });
      await queueGearOutboxForLeagueAdmins(tx, {
        leagueId: validated.leagueId,
        eventType: "gear.pledge.receipt_corrected",
        occurrenceKey: correction.id,
        aggregateType: "PLEDGE",
        aggregateId: validated.pledgeId,
        payload: {
          kind: "GEAR_PLEDGE",
          data: { pledgeId: validated.pledgeId, receiptId: receipt.id, quantity: receipt.quantity, status: pledgeStatus },
        },
      });
      return {
        receiptId: correction.id,
        pledgeStatus,
        pledgeVersion: receipt.pledge.version + 1,
      };
    }, gearTransactionOptions));
    revalidatePath(wishlistPath(validated.leagueId));
    revalidatePath(`/league/${validated.leagueId}/gear`);
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function redactGearPledgePii(
  input: unknown,
): Promise<ActionResult<{ id: string; version: number }>> {
  try {
    const validated = pledgeCommandSchema.parse(input);
    const userId = await requirePermissionForLeague(validated.leagueId, Permission.MANAGE_GEAR_WISHLIST);
    const result = await prisma.$transaction(async (tx) => {
      const pledge = await tx.gearPledge.findFirst({
        where: { id: validated.pledgeId, leagueId: validated.leagueId },
        select: {
          id: true,
          leagueId: true,
          wishlistItemId: true,
          status: true,
          version: true,
          piiRedactionStatus: true,
        },
      });
      if (!pledge) invalid("Pledge not found in this league.");
      if (!["RECEIVED", "DECLINED", "CANCELED", "EXPIRED"].includes(pledge.status)) {
        invalid("Only terminal pledges can have contact data redacted.");
      }
      if (pledge.version !== validated.expectedVersion) throw new GearConflictError();
      return redactTerminalGearPledgePii(tx, {
        ...pledge,
        status: pledge.status as "RECEIVED" | "DECLINED" | "CANCELED" | "EXPIRED",
      }, userId);
    }, gearTransactionOptions);
    revalidatePath(wishlistPath(validated.leagueId));
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

async function transitionPledge(
  input: unknown,
  target: "DECLINED" | "CANCELED" | "EXPIRED",
): Promise<ActionResult<{ id: string; status: string; version: number }>> {
  try {
    const validated = pledgeCommandSchema.parse(input);
    const userId = await requirePermissionForLeague(validated.leagueId, Permission.MANAGE_GEAR_WISHLIST);
    const result = await withGearSerializableRetry(() => prisma.$transaction(async (tx) => {
      const pledge = await tx.gearPledge.findFirst({
        where: { id: validated.pledgeId, leagueId: validated.leagueId, status: "PLEDGED" },
        select: {
          id: true, quantity: true, wishlistItemId: true, version: true,
          receipts: { select: { quantity: true } },
        },
      });
      if (!pledge) invalid("Only active pledges can be updated.");
      if (pledge.version !== validated.expectedVersion) throw new GearConflictError();
      const receivedQty = pledge.receipts.reduce((total, receipt) => total + receipt.quantity, 0);
      const outstandingQty = pledge.quantity - receivedQty;
      if (outstandingQty < 0) invalid("Pledge receipt history is inconsistent.");
      const update = await tx.gearPledge.updateMany({
        where: { id: pledge.id, leagueId: validated.leagueId, status: "PLEDGED", version: pledge.version },
        data: { status: target, version: { increment: 1 } },
      });
      if (update.count !== 1) throw new GearConflictError();
      if (outstandingQty > 0) {
        await tx.gearWishlistItem.update({
          where: { id: pledge.wishlistItemId },
          data: { pledgedQty: { decrement: outstandingQty } },
        });
      }
      await recordGearActivity(tx, {
        leagueId: validated.leagueId,
        entityType: "PLEDGE",
        entityId: pledge.id,
        action: target.toLowerCase(),
        actorUserId: userId,
        details: { metadata: { wishlistItemId: pledge.wishlistItemId, outstandingQty } },
      });
      await queueGearOutboxForLeagueAdmins(tx, {
        leagueId: validated.leagueId,
        eventType: `gear.pledge.${target.toLowerCase()}`,
        occurrenceKey: `v${pledge.version + 1}`,
        aggregateType: "PLEDGE",
        aggregateId: pledge.id,
        payload: { kind: "GEAR_PLEDGE", data: { pledgeId: pledge.id, wishlistItemId: pledge.wishlistItemId, status: target } },
      });
      return { id: pledge.id, status: target, version: pledge.version + 1 };
    }, gearTransactionOptions));
    revalidatePath(wishlistPath(validated.leagueId));
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function declineGearPledge(input: unknown) {
  return transitionPledge(input, "DECLINED");
}

export async function cancelGearPledge(input: unknown) {
  return transitionPledge(input, "CANCELED");
}

export async function expireGearPledge(input: unknown) {
  return transitionPledge(input, "EXPIRED");
}

export async function updateGearPledgeStatus(input: unknown) {
  const parsed = pledgeCommandSchema.extend({
    status: z.enum(["DECLINED", "CANCELED", "EXPIRED"]),
  }).parse(input);
  return transitionPledge(parsed, parsed.status);
}

export type GearPledgeAdminContext = Array<{
  id: string;
  version: number;
  wishlistItemId: string;
  donorName: string | null;
  donorEmail: string | null;
  donorPhone: string | null;
  contactConsentAt: string | null;
  status: "PLEDGED" | "RECEIVED" | "DECLINED" | "CANCELED" | "EXPIRED";
  quantity: number;
  note: string | null;
  expiresAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  wishlistItem: { nameSnapshot: string; categorySnapshot: string | null; sizeSnapshot: string | null };
  receipts: Array<{
    id: string;
    quantity: number;
    receivedAt: string;
    notes: string | null;
    poolStockId: string | null;
    gearUnitId: string | null;
  }>;
}>;

export async function getGearPledgeAdminContext(leagueId: string): Promise<GearPledgeAdminContext> {
  await requirePermissionForLeague(leagueId, Permission.MANAGE_GEAR_WISHLIST);
  const pledges = await prisma.gearPledge.findMany({
    where: { leagueId },
    select: {
      id: true, version: true, wishlistItemId: true, donorName: true, donorEmail: true, donorPhone: true, contactConsentAt: true,
      status: true, quantity: true, note: true, expiresAt: true, receivedAt: true,
      piiRedactionStatus: true, createdAt: true,
      wishlistItem: { select: { nameSnapshot: true, categorySnapshot: true, sizeSnapshot: true } },
      receipts: {
        select: { id: true, quantity: true, receivedAt: true, notes: true, poolStockId: true, gearUnitId: true },
        orderBy: { receivedAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return pledges.map((pledge) => ({
    ...pledge,
    ...(pledge.piiRedactionStatus === "REDACTED" ? {
      donorName: null,
      donorEmail: null,
      donorPhone: null,
      contactConsentAt: null,
      note: null,
    } : {}),
    contactConsentAt: pledge.contactConsentAt?.toISOString() ?? null,
    expiresAt: pledge.expiresAt?.toISOString() ?? null,
    receivedAt: pledge.receivedAt?.toISOString() ?? null,
    createdAt: pledge.createdAt.toISOString(),
    receipts: pledge.receipts.map((receipt) => ({
      ...receipt,
      receivedAt: receipt.receivedAt.toISOString(),
    })),
  }));
}

export async function getGearPledgesForAdmin(leagueId: string) {
  return getGearPledgeAdminContext(leagueId);
}
