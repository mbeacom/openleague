"use server";

import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/auth/session";
import { Permission } from "@/lib/utils/permission-types";
import { requirePermissionForLeague } from "@/lib/utils/permissions";
import { prisma } from "@/lib/db/prisma";
import { recordGearActivity } from "@/lib/services/gear-ledger";
import { reportGearActionFailure } from "@/lib/services/gear-observability";
import { queueGearOutboxForLeagueAdmins } from "@/lib/services/gear-outbox";
import {
  GearConflictError,
  gearTransactionOptions,
  withGearSerializableRetry,
} from "@/lib/services/gear-transaction";
import { normalizeGearKey } from "@/lib/utils/gear";
import { saveGearWishlistSchema } from "@/lib/utils/validation";
import type { ActionResult } from "@/lib/actions/gear-inventory";

const gearId = z.string().cuid("Invalid gear identifier");
const wishlistCommandSchema = z.object({
  leagueId: gearId,
  expectedVersion: z.coerce.number().int().min(0),
});

type Tx = Prisma.TransactionClient;

function wishlistPath(leagueId: string) {
  return `/league/${leagueId}/gear/wishlist`;
}

function invalid(message: string): never {
  throw new Error(`Gear validation: ${message}`);
}

function actionError(error: unknown): ActionResult<never> {
  reportGearActionFailure({ action: "wishlist", error });
  if (error instanceof GearConflictError) return { success: false, error: error.message };
  if (error instanceof z.ZodError) {
    return { success: false, error: "Please correct the highlighted wishlist fields.", details: error.issues };
  }
  if (error instanceof Error) {
    if (error.message.startsWith("Unauthorized")) return { success: false, error: "League admin access is required." };
    if (error.message.startsWith("Gear validation:")) return { success: false, error: error.message.slice(17) };
  }
  return { success: false, error: "Unable to update the gear wishlist. Please try again." };
}

function newShareToken() {
  return randomBytes(32).toString("base64url");
}

async function curatedItems(
  tx: Tx,
  leagueId: string,
  items: z.output<typeof saveGearWishlistSchema>["items"],
) {
  const catalogIds = items
    .map((item) => item.catalogItemId)
    .filter((id): id is string => Boolean(id));
  const catalogItems = catalogIds.length === 0
    ? []
    : await tx.gearCatalogItem.findMany({
        where: { leagueId, id: { in: catalogIds }, isActive: true },
        select: { id: true, name: true, category: true, size: true },
      });
  const catalogById = new Map(catalogItems.map((item) => [item.id, item]));
  if (catalogById.size !== new Set(catalogIds).size) {
    invalid("A selected catalog item is not active in this league.");
  }

  const curated = items.map((item) => {
    const catalog = item.catalogItemId ? catalogById.get(item.catalogItemId) : undefined;
    const nameSnapshot = catalog?.name ?? item.nameSnapshot;
    const categorySnapshot = (catalog?.category ?? item.categorySnapshot) || null;
    const sizeSnapshot = (catalog?.size ?? item.sizeSnapshot) || null;
    return {
      catalogItemId: catalog?.id ?? null,
      nameSnapshot,
      categorySnapshot,
      sizeSnapshot,
      description: item.description || null,
      targetQty: item.targetQty,
      normalizedKey: normalizeGearKey([
        catalog?.id ?? "",
        nameSnapshot,
        categorySnapshot ?? "",
        sizeSnapshot ?? "",
      ].join(" ")),
    };
  });
  if (new Set(curated.map((item) => item.normalizedKey)).size !== curated.length) {
    invalid("Each wishlist item must be distinct.");
  }
  return curated;
}

export async function saveGearWishlist(
  input: z.input<typeof saveGearWishlistSchema>,
): Promise<ActionResult<{ id: string; shareToken: string; status: string; version: number }>> {
  try {
    const validated = saveGearWishlistSchema.parse(input);
    const userId = await requirePermissionForLeague(validated.leagueId, Permission.MANAGE_GEAR_WISHLIST);

    const result = await withGearSerializableRetry(() => prisma.$transaction(async (tx) => {
      const existing = await tx.gearWishlist.findUnique({
        where: { leagueId: validated.leagueId },
        include: {
          items: {
            select: {
              id: true, normalizedKey: true, targetQty: true, pledgedQty: true, receivedQty: true, isActive: true,
            },
          },
        },
      });
      const items = await curatedItems(tx, validated.leagueId, validated.items);
      if (validated.publish && items.length === 0) invalid("Add at least one item before publishing the wishlist.");

      if (!existing) {
        if (validated.expectedVersion !== undefined && validated.expectedVersion !== 0) {
          throw new GearConflictError();
        }
        const created = await tx.gearWishlist.create({
          data: {
            leagueId: validated.leagueId,
            shareToken: newShareToken(),
            status: validated.publish ? "PUBLISHED" : "DRAFT",
            title: validated.title,
            description: validated.description || null,
            publishedAt: validated.publish ? new Date() : null,
            items: { create: items },
          },
          select: { id: true, shareToken: true, status: true, version: true },
        });
        await recordGearActivity(tx, {
          leagueId: validated.leagueId,
          entityType: "WISHLIST",
          entityId: created.id,
          action: validated.publish ? "created_and_published" : "created",
          actorUserId: userId,
          details: { metadata: { itemCount: items.length } },
        });
        await queueGearOutboxForLeagueAdmins(tx, {
          leagueId: validated.leagueId,
          eventType: validated.publish ? "gear.wishlist.created_and_published" : "gear.wishlist.created",
          occurrenceKey: `v${created.version}`,
          aggregateType: "WISHLIST",
          aggregateId: created.id,
          payload: { kind: "GEAR_WISHLIST", data: { wishlistId: created.id, status: created.status, itemCount: items.length } },
        });
        return created;
      }

      if (validated.expectedVersion === undefined || existing.version !== validated.expectedVersion) {
        throw new GearConflictError();
      }
      if (existing.status === "ARCHIVED") {
        const now = new Date();
        const shareToken = newShareToken();
        const status = validated.publish ? "PUBLISHED" : "DRAFT";
        const update = await tx.gearWishlist.updateMany({
          where: { id: existing.id, version: existing.version, status: "ARCHIVED" },
          data: {
            shareToken,
            title: validated.title,
            description: validated.description || null,
            status,
            publishedAt: validated.publish ? now : null,
            archivedAt: null,
            version: { increment: 1 },
          },
        });
        if (update.count !== 1) throw new GearConflictError();
        await tx.gearWishlistItem.updateMany({
          where: { leagueId: validated.leagueId, wishlistId: existing.id },
          data: { isActive: false },
        });
        for (const item of items) {
          await tx.gearWishlistItem.create({
            data: { leagueId: validated.leagueId, wishlistId: existing.id, ...item },
          });
        }
        await recordGearActivity(tx, {
          leagueId: validated.leagueId,
          entityType: "WISHLIST",
          entityId: existing.id,
          action: "recycled",
          actorUserId: userId,
          details: { metadata: { itemCount: items.length, status } },
        });
        await queueGearOutboxForLeagueAdmins(tx, {
          leagueId: validated.leagueId,
          eventType: "gear.wishlist.recycled",
          occurrenceKey: `v${existing.version + 1}`,
          aggregateType: "WISHLIST",
          aggregateId: existing.id,
          payload: { kind: "GEAR_WISHLIST", data: { wishlistId: existing.id, status, itemCount: items.length } },
        });
        return {
          id: existing.id,
          shareToken,
          status,
          version: existing.version + 1,
        };
      }

      const existingByKey = new Map(existing.items.map((item) => [item.normalizedKey, item]));
      const submittedKeys = new Set(items.map((item) => item.normalizedKey));
      for (const oldItem of existing.items) {
        if (!submittedKeys.has(oldItem.normalizedKey) && oldItem.pledgedQty > 0) {
          invalid("A wishlist item with outstanding pledges cannot be removed.");
        }
      }
      for (const item of items) {
        const oldItem = existingByKey.get(item.normalizedKey);
        if (oldItem && item.targetQty < oldItem.pledgedQty + oldItem.receivedQty) {
          invalid("A wishlist target cannot be below the currently pledged and received quantity.");
        }
      }

      const now = new Date();
      const nextStatus = existing.status === "PUBLISHED" || validated.publish ? "PUBLISHED" : "DRAFT";
      const update = await tx.gearWishlist.updateMany({
        where: { id: existing.id, version: existing.version, status: existing.status },
        data: {
          title: validated.title,
          description: validated.description || null,
          status: nextStatus,
          publishedAt: nextStatus === "PUBLISHED" ? (existing.publishedAt ?? now) : null,
          version: { increment: 1 },
        },
      });
      if (update.count !== 1) throw new GearConflictError();

      for (const item of items) {
        const oldItem = existingByKey.get(item.normalizedKey);
        if (oldItem) {
          await tx.gearWishlistItem.update({
            where: { id: oldItem.id },
            data: { ...item, isActive: true },
          });
        } else {
          await tx.gearWishlistItem.create({
            data: { leagueId: validated.leagueId, wishlistId: existing.id, ...item },
          });
        }
      }
      await tx.gearWishlistItem.updateMany({
        where: {
          wishlistId: existing.id,
          normalizedKey: { notIn: [...submittedKeys] },
          pledgedQty: 0,
        },
        data: { isActive: false },
      });

      await recordGearActivity(tx, {
        leagueId: validated.leagueId,
        entityType: "WISHLIST",
        entityId: existing.id,
        action: nextStatus === "PUBLISHED" && existing.status === "DRAFT" ? "published" : "updated",
        actorUserId: userId,
        details: { metadata: { itemCount: items.length } },
      });
      if (nextStatus === "PUBLISHED" && existing.status === "DRAFT") {
        await queueGearOutboxForLeagueAdmins(tx, {
          leagueId: validated.leagueId,
          eventType: "gear.wishlist.published",
          occurrenceKey: `v${existing.version + 1}`,
          aggregateType: "WISHLIST",
          aggregateId: existing.id,
          payload: { kind: "GEAR_WISHLIST", data: { wishlistId: existing.id, status: nextStatus, itemCount: items.length } },
        });
      }
      return {
        id: existing.id,
        shareToken: existing.shareToken,
        status: nextStatus,
        version: existing.version + 1,
      };
    }, gearTransactionOptions));

    revalidatePath(wishlistPath(validated.leagueId));
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function archiveGearWishlist(input: unknown): Promise<ActionResult<{ id: string; version: number }>> {
  try {
    const validated = wishlistCommandSchema.parse(input);
    const userId = await requirePermissionForLeague(validated.leagueId, Permission.MANAGE_GEAR_WISHLIST);
    const result = await withGearSerializableRetry(() => prisma.$transaction(async (tx) => {
      const wishlist = await tx.gearWishlist.findUnique({ where: { leagueId: validated.leagueId } });
      if (!wishlist) invalid("Wishlist not found.");
      if (wishlist.status === "ARCHIVED") invalid("Wishlist is already archived.");
      if (wishlist.version !== validated.expectedVersion) throw new GearConflictError();
      const update = await tx.gearWishlist.updateMany({
        where: { id: wishlist.id, version: wishlist.version, status: wishlist.status },
        data: { status: "ARCHIVED", archivedAt: new Date(), version: { increment: 1 } },
      });
      if (update.count !== 1) throw new GearConflictError();
      await recordGearActivity(tx, {
        leagueId: validated.leagueId, entityType: "WISHLIST", entityId: wishlist.id,
        action: "archived", actorUserId: userId,
      });
      await queueGearOutboxForLeagueAdmins(tx, {
        leagueId: validated.leagueId,
        eventType: "gear.wishlist.archived",
        occurrenceKey: `v${wishlist.version + 1}`,
        aggregateType: "WISHLIST",
        aggregateId: wishlist.id,
        payload: { kind: "GEAR_WISHLIST", data: { wishlistId: wishlist.id, status: "ARCHIVED" } },
      });
      return { id: wishlist.id, version: wishlist.version + 1 };
    }, gearTransactionOptions));
    revalidatePath(wishlistPath(validated.leagueId));
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function rotateGearWishlistShareToken(
  input: unknown,
): Promise<ActionResult<{ id: string; shareToken: string; version: number }>> {
  try {
    const validated = wishlistCommandSchema.parse(input);
    const userId = await requirePermissionForLeague(validated.leagueId, Permission.MANAGE_GEAR_WISHLIST);
    const result = await withGearSerializableRetry(() => prisma.$transaction(async (tx) => {
      const wishlist = await tx.gearWishlist.findUnique({ where: { leagueId: validated.leagueId } });
      if (!wishlist) invalid("Wishlist not found.");
      if (wishlist.status === "ARCHIVED") invalid("An archived wishlist cannot receive a new share link.");
      if (wishlist.version !== validated.expectedVersion) throw new GearConflictError();
      const token = newShareToken();
      const update = await tx.gearWishlist.updateMany({
        where: { id: wishlist.id, version: wishlist.version, status: wishlist.status },
        data: { shareToken: token, version: { increment: 1 } },
      });
      if (update.count !== 1) throw new GearConflictError();
      await recordGearActivity(tx, {
        leagueId: validated.leagueId,
        entityType: "WISHLIST",
        entityId: wishlist.id,
        action: "share_token_rotated",
        actorUserId: userId,
      });
      await queueGearOutboxForLeagueAdmins(tx, {
        leagueId: validated.leagueId,
        eventType: "gear.wishlist.share_token_rotated",
        occurrenceKey: `v${wishlist.version + 1}`,
        aggregateType: "WISHLIST",
        aggregateId: wishlist.id,
        payload: { kind: "GEAR_WISHLIST", data: { wishlistId: wishlist.id } },
      });
      return { id: wishlist.id, shareToken: token, version: wishlist.version + 1 };
    }, gearTransactionOptions));
    revalidatePath(wishlistPath(validated.leagueId));
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function setGearWishlistStatus(input: unknown): Promise<ActionResult<{ id: string; status: string; version: number }>> {
  try {
    const validated = wishlistCommandSchema.extend({
      status: z.enum(["PUBLISHED", "ARCHIVED"]),
    }).parse(input);
    if (validated.status === "ARCHIVED") {
      const archived = await archiveGearWishlist(validated);
      return archived.success
        ? { success: true, data: { ...archived.data, status: "ARCHIVED" } }
        : archived;
    }

    const userId = await requirePermissionForLeague(validated.leagueId, Permission.MANAGE_GEAR_WISHLIST);
    const result = await withGearSerializableRetry(() => prisma.$transaction(async (tx) => {
      const wishlist = await tx.gearWishlist.findUnique({
        where: { leagueId: validated.leagueId },
        select: { id: true, status: true, version: true, publishedAt: true, items: { select: { id: true } } },
      });
      if (!wishlist) invalid("Wishlist not found.");
      if (wishlist.status !== "DRAFT") invalid("Only draft wishlists can be published.");
      if (wishlist.items.length === 0) invalid("Add at least one item before publishing the wishlist.");
      if (wishlist.version !== validated.expectedVersion) throw new GearConflictError();
      const update = await tx.gearWishlist.updateMany({
        where: { id: wishlist.id, version: wishlist.version, status: "DRAFT" },
        data: { status: "PUBLISHED", publishedAt: new Date(), version: { increment: 1 } },
      });
      if (update.count !== 1) throw new GearConflictError();
      await recordGearActivity(tx, {
        leagueId: validated.leagueId,
        entityType: "WISHLIST",
        entityId: wishlist.id,
        action: "published",
        actorUserId: userId,
      });
      await queueGearOutboxForLeagueAdmins(tx, {
        leagueId: validated.leagueId,
        eventType: "gear.wishlist.published",
        occurrenceKey: `v${wishlist.version + 1}`,
        aggregateType: "WISHLIST",
        aggregateId: wishlist.id,
        payload: { kind: "GEAR_WISHLIST", data: { wishlistId: wishlist.id, status: "PUBLISHED", itemCount: wishlist.items.length } },
      });
      return { id: wishlist.id, status: "PUBLISHED", version: wishlist.version + 1 };
    }, gearTransactionOptions));
    revalidatePath(wishlistPath(validated.leagueId));
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export type GearWishlistAdminContext = {
  id: string;
  shareToken: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  title: string;
  description: string | null;
  version: number;
  publishedAt: string | null;
  archivedAt: string | null;
  items: Array<{
    id: string;
    catalogItemId: string | null;
    normalizedKey: string;
    nameSnapshot: string;
    categorySnapshot: string | null;
    sizeSnapshot: string | null;
    description: string | null;
    targetQty: number;
    pledgedQty: number;
    receivedQty: number;
    isActive: boolean;
  }>;
};

export async function getGearWishlistAdminContext(leagueId: string): Promise<GearWishlistAdminContext | null> {
  await requirePermissionForLeague(leagueId, Permission.MANAGE_GEAR_WISHLIST);
  const wishlist = await prisma.gearWishlist.findUnique({
    where: { leagueId },
    select: {
      id: true, shareToken: true, status: true, title: true, description: true, version: true,
      publishedAt: true, archivedAt: true,
      items: {
        select: {
          id: true, catalogItemId: true, normalizedKey: true, nameSnapshot: true, categorySnapshot: true,
          sizeSnapshot: true, description: true, targetQty: true, pledgedQty: true, receivedQty: true, isActive: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!wishlist) return null;
  return {
    ...wishlist,
    publishedAt: wishlist.publishedAt?.toISOString() ?? null,
    archivedAt: wishlist.archivedAt?.toISOString() ?? null,
  };
}

export async function getGearWishlistForAdmin(leagueId: string) {
  return getGearWishlistAdminContext(leagueId);
}

/** The share-token projection intentionally omits league identity and all donor records. */
export async function getPublicGearWishlist(wishlistToken: string) {
  const token = z.string().trim().min(16).max(255).parse(wishlistToken);
  const wishlist = await prisma.gearWishlist.findFirst({
    where: { shareToken: token, status: "PUBLISHED", league: { isActive: true } },
    select: {
      league: { select: { name: true } },
      title: true,
      description: true,
      items: {
        where: { isActive: true },
        select: {
          id: true, nameSnapshot: true, categorySnapshot: true, sizeSnapshot: true, description: true,
          targetQty: true, pledgedQty: true, receivedQty: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!wishlist) return null;
  return {
    associationName: wishlist.league.name,
    title: wishlist.title,
    description: wishlist.description,
    items: wishlist.items.map((item) => ({
      ...item,
      remainingQty: Math.max(0, item.targetQty - item.pledgedQty - item.receivedQty),
    })),
  };
}

export async function canViewGearWishlist(leagueId: string): Promise<boolean> {
  const userId = await requireUserId();
  return Boolean(await prisma.leagueUser.findFirst({
    where: { leagueId, userId, league: { isActive: true } },
    select: { id: true },
  }));
}
