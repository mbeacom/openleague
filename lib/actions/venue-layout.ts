"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  requireVenueProfileManager,
  requireVenueStaffRole,
  VENUE_VIEW_ROLES,
} from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { saveVenueLayoutSchema, type SaveVenueLayoutInput } from "@/lib/utils/validation";
import type { VenueLayoutData } from "@/types/segments";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

const venueIdSchema = z.string().cuid("Invalid venue ID format");

/**
 * Venue schematic layout actions (feature 006, FR-016..018).
 *
 * The layout is presentational only — it never drives availability. Editing
 * requires venue profile rights (VENUE_PROFILE_ROLES = OWNER/MANAGER); reads
 * are open to any active venue staff member. Mutations are activity-logged.
 */

type VenueForLayout = {
  id: string;
  organizationId: string;
  slug: string | null;
};

/**
 * Resolve the venue and its owning organization. Layout management is a rink
 * profile feature, so only organization-owned venues qualify.
 */
async function findLayoutVenue(
  venueId: string
): Promise<{ venue: VenueForLayout } | { error: string }> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { id: true, organizationId: true, slug: true },
  });
  if (!venue) {
    return { error: "Venue not found" };
  }
  if (!venue.organizationId) {
    return { error: "Layouts are only available for venues managed by a venue organization" };
  }
  return { venue: { id: venue.id, organizationId: venue.organizationId, slug: venue.slug } };
}

function revalidateLayoutPaths(venue: VenueForLayout): void {
  revalidatePath(`/venue-admin/${venue.organizationId}/venues/${venue.id}`);
  revalidatePath(`/venue-admin/${venue.organizationId}/venues/${venue.id}/layout`);
  if (venue.slug) {
    revalidatePath(`/rinks/${venue.slug}`);
  }
}

function toActionError(error: unknown, fallback: string): ActionResult<never> {
  if (error instanceof z.ZodError) {
    return { success: false, error: "Invalid input", details: error.issues };
  }
  if (error instanceof Error && error.message.includes("Unauthorized")) {
    return { success: false, error: error.message };
  }
  console.error(fallback, error);
  return { success: false, error: fallback };
}

/**
 * Save (create or replace) a venue's schematic layout (FR-016).
 *
 * Every placed surface must belong to the venue; archived surfaces may stay
 * in the layout (the editor flags them and the public schematic hides them,
 * FR-018). Activity-logged; revalidates the venue admin layout route and the
 * public rink profile.
 */
export async function saveVenueLayout(
  input: SaveVenueLayoutInput
): Promise<ActionResult<{ venueId: string; layout: VenueLayoutData }>> {
  try {
    const validated = saveVenueLayoutSchema.parse(input);

    const resolved = await findLayoutVenue(validated.venueId);
    if ("error" in resolved) {
      return { success: false, error: resolved.error };
    }
    const { venue } = resolved;

    const userId = await requireVenueProfileManager(venue.organizationId, venue.id);

    // Every referenced surface must belong to this venue, each at most once.
    const surfaceIds = validated.layout.surfaces.map((surface) => surface.surfaceId);
    const uniqueSurfaceIds = [...new Set(surfaceIds)];
    if (uniqueSurfaceIds.length !== surfaceIds.length) {
      return { success: false, error: "Each surface can only be placed once in the layout" };
    }
    if (uniqueSurfaceIds.length > 0) {
      const ownedCount = await prisma.iceSurface.count({
        where: { id: { in: uniqueSurfaceIds }, venueId: venue.id },
      });
      if (ownedCount !== uniqueSurfaceIds.length) {
        return { success: false, error: "One or more surfaces do not belong to this venue" };
      }
    }

    const layout: VenueLayoutData = {
      surfaces: validated.layout.surfaces.map(({ surfaceId, x, y, w, h, rotation }) => ({
        surfaceId,
        x,
        y,
        w,
        h,
        rotation,
      })),
      labels: validated.layout.labels.map(({ text, x, y }) => ({ text, x, y })),
    };

    await prisma.$transaction(async (tx) => {
      await tx.venue.update({
        where: { id: venue.id },
        data: { layout: layout as unknown as Prisma.InputJsonValue },
      });
      await tx.venueActivityLog.create({
        data: {
          venueId: venue.id,
          actorId: userId,
          action: "VENUE_LAYOUT_UPDATED",
          resourceType: "Venue",
          resourceId: venue.id,
          summary: `Saved venue layout (${layout.surfaces.length} surface${layout.surfaces.length === 1 ? "" : "s"}, ${layout.labels.length} label${layout.labels.length === 1 ? "" : "s"})`,
        },
      });
    });

    revalidateLayoutPaths(venue);

    return { success: true, data: { venueId: venue.id, layout } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return toActionError(error, "Failed to save venue layout. Please try again.");
  }
}

/**
 * Remove a venue's schematic layout (FR-017): the public profile falls back
 * to the existing list presentation. Activity-logged.
 */
export async function clearVenueLayout(
  venueId: string
): Promise<ActionResult<{ venueId: string }>> {
  try {
    const validatedVenueId = venueIdSchema.parse(venueId);

    const resolved = await findLayoutVenue(validatedVenueId);
    if ("error" in resolved) {
      return { success: false, error: resolved.error };
    }
    const { venue } = resolved;

    const userId = await requireVenueProfileManager(venue.organizationId, venue.id);

    await prisma.$transaction(async (tx) => {
      await tx.venue.update({
        where: { id: venue.id },
        data: { layout: Prisma.DbNull },
      });
      await tx.venueActivityLog.create({
        data: {
          venueId: venue.id,
          actorId: userId,
          action: "VENUE_LAYOUT_CLEARED",
          resourceType: "Venue",
          resourceId: venue.id,
          summary: "Cleared venue layout",
        },
      });
    });

    revalidateLayoutPaths(venue);

    return { success: true, data: { venueId: venue.id } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return toActionError(error, "Failed to clear venue layout. Please try again.");
  }
}

/**
 * Read a venue's layout plus its surfaces for the layout editor (any active
 * venue staff member). Surfaces include archived ones so the editor can flag
 * placements that reference them (FR-018); the public schematic filters them
 * out on render.
 */
export async function getVenueLayout(venueId: string): Promise<
  ActionResult<{
    venueId: string;
    layout: VenueLayoutData | null;
    surfaces: Array<{ id: string; name: string; isActive: boolean; displayOrder: number }>;
  }>
> {
  try {
    const validatedVenueId = venueIdSchema.parse(venueId);

    const resolved = await findLayoutVenue(validatedVenueId);
    if ("error" in resolved) {
      return { success: false, error: resolved.error };
    }
    const { venue } = resolved;

    await requireVenueStaffRole(venue.organizationId, VENUE_VIEW_ROLES, venue.id);

    const [venueRow, surfaces] = await Promise.all([
      prisma.venue.findUnique({
        where: { id: venue.id },
        select: { layout: true },
      }),
      prisma.iceSurface.findMany({
        where: { venueId: venue.id },
        select: { id: true, name: true, isActive: true, displayOrder: true },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      }),
    ]);

    return {
      success: true,
      data: {
        venueId: venue.id,
        layout: (venueRow?.layout as unknown as VenueLayoutData | null) ?? null,
        surfaces,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return toActionError(error, "Failed to load venue layout. Please try again.");
  }
}
