"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import { requireUserId, isTeamAdmin, hasVenueStaffRole } from "@/lib/auth/session";
import { Capability, hasCapability } from "@/lib/auth/capabilities";
import { rethrowIfNextRedirectError } from "@/lib/utils/next-errors";
import {
  BRANDABLE_ENTITIES,
  deleteBlobBestEffort,
  entityLogoPrefix,
  isOwnedBlobUrl,
  type BrandableEntity,
} from "@/lib/media/blob";

/**
 * Crest branding for the three entities that own one — team, league, venue.
 *
 * The three live together because the authorization question ("may this user
 * change how this thing presents itself?") is the only part that differs
 * between them, and keeping that difference in a single switch is what stops a
 * fourth entity from acquiring a fourth, subtly weaker check.
 */

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

const VENUE_BRANDING_ROLES = ["OWNER", "MANAGER"] as const;

const entitySchema = z.enum(BRANDABLE_ENTITIES);
const hexColor = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use a hex color like #0D47A1");

const logoInputSchema = z.object({
  entity: entitySchema,
  entityId: z.string().cuid("Invalid ID format"),
  url: z.string().url().max(600),
});

const clearLogoSchema = z.object({
  entity: entitySchema,
  entityId: z.string().cuid("Invalid ID format"),
});

const brandColorsSchema = z.object({
  entity: entitySchema,
  entityId: z.string().cuid("Invalid ID format"),
  // null clears the color and returns the crest to its derived hue; undefined
  // leaves it untouched, so a form may submit one field without the other.
  brandPrimaryColor: hexColor.nullable().optional(),
  brandSecondaryColor: hexColor.nullable().optional(),
});

/**
 * Whether the user may change how this entity presents itself.
 *
 * Exported so the upload token route asks exactly the same question the write
 * actions do — a token issued on a weaker check would be a way to write a URL
 * the action itself would refuse.
 */
export async function canBrandEntity(
  userId: string,
  entity: BrandableEntity,
  entityId: string,
): Promise<boolean> {
  switch (entity) {
    case "team": {
      if (await isTeamAdmin(userId, entityId)) return true;
      const team = await prisma.team.findUnique({
        where: { id: entityId },
        select: { leagueId: true },
      });
      // A standalone team has no association to delegate from, so team
      // admin is the whole answer for it.
      if (!team?.leagueId) return false;
      return hasCapability({
        userId,
        leagueId: team.leagueId,
        teamId: entityId,
        capability: Capability.MANAGE_TEAM,
      });
    }
    case "league":
      return hasCapability({
        userId,
        leagueId: entityId,
        capability: Capability.ADMINISTER_ASSOCIATION,
      });
    case "venue": {
      const venue = await prisma.venue.findUnique({
        where: { id: entityId },
        select: { organizationId: true },
      });
      // A venue with no owning organization has no staff to authorize against.
      if (!venue?.organizationId) return false;
      return hasVenueStaffRole(
        userId,
        venue.organizationId,
        VENUE_BRANDING_ROLES,
        entityId,
      );
    }
  }
}

/** Reads the crest fields currently stored for an entity. */
async function readLogoUrl(
  entity: BrandableEntity,
  entityId: string,
): Promise<string | null> {
  const select = { logoUrl: true } as const;
  const row =
    entity === "team"
      ? await prisma.team.findUnique({ where: { id: entityId }, select })
      : entity === "league"
        ? await prisma.league.findUnique({ where: { id: entityId }, select })
        : await prisma.venue.findUnique({ where: { id: entityId }, select });
  return row?.logoUrl ?? null;
}

type BrandingData = {
  logoUrl?: string | null;
  brandPrimaryColor?: string | null;
  brandSecondaryColor?: string | null;
};

async function writeBranding(
  entity: BrandableEntity,
  entityId: string,
  data: BrandingData,
): Promise<void> {
  if (entity === "team") {
    await prisma.team.update({ where: { id: entityId }, data });
    return;
  }
  if (entity === "league") {
    await prisma.league.update({ where: { id: entityId }, data });
    return;
  }
  await prisma.venue.update({ where: { id: entityId }, data });
}

/** Paths whose cached render shows this entity's crest. */
function revalidateBranding(entity: BrandableEntity, entityId: string): void {
  revalidatePath("/dashboard");
  if (entity === "team") {
    revalidatePath(`/team/${entityId}`);
    revalidatePath("/league", "layout");
  } else if (entity === "league") {
    revalidatePath("/league", "layout");
  } else {
    revalidatePath("/venues");
    revalidatePath("/venue-admin", "layout");
  }
}

/**
 * Record a finished crest upload.
 *
 * The URL is verified to be one of our own blobs under this entity's prefix
 * before it is stored: the client hands us the URL, so an unchecked write would
 * let any admin point their crest at an arbitrary host — an SSRF-flavored
 * tracking pixel on every page their team appears.
 */
export async function setEntityLogo(
  input: z.infer<typeof logoInputSchema>,
): Promise<ActionResult<{ logoUrl: string }>> {
  try {
    const userId = await requireUserId();
    const validated = logoInputSchema.parse(input);

    if (!(await canBrandEntity(userId, validated.entity, validated.entityId))) {
      return { success: false, error: "You do not have permission to change this logo." };
    }

    const prefix = entityLogoPrefix(validated.entity, validated.entityId);
    if (!isOwnedBlobUrl(validated.url, prefix)) {
      return { success: false, error: "That image was not uploaded for this entity." };
    }

    const previous = await readLogoUrl(validated.entity, validated.entityId);
    await writeBranding(validated.entity, validated.entityId, { logoUrl: validated.url });

    // Replacing a crest orphans the old object; drop it so a team that iterates
    // on its artwork does not accumulate storage forever.
    if (previous && previous !== validated.url && isOwnedBlobUrl(previous, prefix)) {
      await deleteBlobBestEffort(previous);
    }

    revalidateBranding(validated.entity, validated.entityId);
    return { success: true, data: { logoUrl: validated.url } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid input.", details: error.issues };
    }
    rethrowIfNextRedirectError(error);
    console.error("Error setting entity logo:", error);
    return { success: false, error: "Failed to save the logo." };
  }
}

/** Remove a crest logo, returning the entity to its monogram. */
export async function clearEntityLogo(
  input: z.infer<typeof clearLogoSchema>,
): Promise<ActionResult<{ cleared: true }>> {
  try {
    const userId = await requireUserId();
    const validated = clearLogoSchema.parse(input);

    if (!(await canBrandEntity(userId, validated.entity, validated.entityId))) {
      return { success: false, error: "You do not have permission to change this logo." };
    }

    const previous = await readLogoUrl(validated.entity, validated.entityId);
    await writeBranding(validated.entity, validated.entityId, { logoUrl: null });

    const prefix = entityLogoPrefix(validated.entity, validated.entityId);
    // Only our own objects are deleted: a logo set by pasting a third-party URL
    // before uploads existed is not ours to remove from wherever it lives.
    if (previous && isOwnedBlobUrl(previous, prefix)) {
      await deleteBlobBestEffort(previous);
    }

    revalidateBranding(validated.entity, validated.entityId);
    return { success: true, data: { cleared: true } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid input.", details: error.issues };
    }
    rethrowIfNextRedirectError(error);
    console.error("Error clearing entity logo:", error);
    return { success: false, error: "Failed to remove the logo." };
  }
}

/** Set or clear the colors a crest falls back to when there is no logo. */
export async function setEntityBrandColors(
  input: z.infer<typeof brandColorsSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const userId = await requireUserId();
    const validated = brandColorsSchema.parse(input);

    if (!(await canBrandEntity(userId, validated.entity, validated.entityId))) {
      return { success: false, error: "You do not have permission to change these colors." };
    }

    const { entity, entityId, ...colors } = validated;
    const data = Object.fromEntries(
      Object.entries(colors).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(data).length > 0) {
      await writeBranding(entity, entityId, data);
    }

    revalidateBranding(entity, entityId);
    return { success: true, data: { id: entityId } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid input.", details: error.issues };
    }
    rethrowIfNextRedirectError(error);
    console.error("Error setting brand colors:", error);
    return { success: false, error: "Failed to save the colors." };
  }
}
