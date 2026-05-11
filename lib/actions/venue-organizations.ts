"use server";

import { prisma } from "@/lib/db/prisma";
import { requireUserId, requireVenueProfileManager } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import {
  publicPublishedVenueWhere,
  publicVenueProfileSelect,
  publicVenueSummarySelect,
} from "@/lib/utils/public-venues";
import {
  createVenueOrganizationSchema,
  publishVenueProfileSchema,
  updateVenueProfileSchema,
  type CreateVenueOrganizationInput,
  type UpdateVenueProfileInput,
} from "@/lib/utils/validation";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

export async function createVenueOrganization(
  input: CreateVenueOrganizationInput
): Promise<ActionResult<{ organizationId: string; venueId: string; profileStatus: string }>> {
  try {
    const validated = createVenueOrganizationSchema.parse(input);
    const userId = await requireUserId();

    const result = await prisma.$transaction(async (tx) => {
      const organization = await tx.venueOrganization.create({
        data: {
          name: validated.name,
          type: validated.type,
          description: validated.description || null,
          primaryContactName: validated.primaryContactName || null,
          primaryContactEmail: validated.primaryContactEmail || null,
          primaryContactPhone: validated.primaryContactPhone || null,
          website: validated.website || null,
          status: "ACTIVE",
          createdById: userId,
        },
        select: { id: true },
      });

      const venue = await tx.venue.create({
        data: {
          name: validated.name,
          organizationId: organization.id,
          surfaceType: "ICE",
          visibility: "PUBLIC",
          profileStatus: "DRAFT",
          publicEmail: validated.primaryContactEmail || null,
          publicPhone: validated.primaryContactPhone || null,
          website: validated.website || null,
          createdById: userId,
        },
        select: { id: true, profileStatus: true },
      });

      await tx.venueStaff.create({
        data: {
          organizationId: organization.id,
          userId,
          role: "OWNER",
          status: "ACTIVE",
          joinedAt: new Date(),
        },
      });

      await tx.venueActivityLog.create({
        data: {
          venueId: venue.id,
          actorId: userId,
          action: "VENUE_ORGANIZATION_CREATED",
          resourceType: "VenueOrganization",
          resourceId: organization.id,
          summary: "Created venue organization",
        },
      });

      return {
        organizationId: organization.id,
        venueId: venue.id,
        profileStatus: venue.profileStatus,
      };
    });

    revalidatePath("/venue-admin");
    revalidatePath("/rinks");

    return { success: true, data: result };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to create venue organization. Please try again." };
  }
}

export async function updateVenueProfile(
  input: UpdateVenueProfileInput
): Promise<ActionResult<{ venueId: string; profileStatus: string; updatedAt: Date }>> {
  try {
    const validated = updateVenueProfileSchema.parse(input);
    if (!validated.venueId) {
      return { success: false, error: "Venue ID is required" };
    }

    const venue = await prisma.venue.findFirst({
      where: {
        id: validated.venueId,
        organizationId: validated.organizationId,
      },
      select: { id: true, slug: true },
    });

    if (!venue) {
      return { success: false, error: "Venue profile not found" };
    }

    const userId = await requireVenueProfileManager(validated.organizationId, validated.venueId);

    const updated = await prisma.venue.update({
      where: { id: validated.venueId },
      data: {
        name: validated.name,
        address: validated.address || null,
        city: validated.city || null,
        state: validated.state || null,
        zipCode: validated.zipCode || null,
        surfaceType: validated.surfaceType,
        capacity: validated.capacity ?? null,
        amenities: validated.amenities,
        phone: validated.phone || null,
        website: validated.website || null,
        notes: validated.notes || null,
        slug: validated.slug || null,
        publicDescription: validated.publicDescription || null,
        logoUrl: validated.logoUrl || null,
        brandPrimaryColor: validated.brandPrimaryColor || null,
        brandSecondaryColor: validated.brandSecondaryColor || null,
        timezone: validated.timezone,
        publicEmail: validated.publicEmail || null,
        publicPhone: validated.publicPhone || null,
        privateManagerNotes: validated.privateManagerNotes || null,
        profileStatus: validated.profileStatus,
      },
      select: { id: true, profileStatus: true, updatedAt: true, slug: true },
    });

    await logVenueActivity({
      venueId: updated.id,
      actorId: userId,
      action: "VENUE_PROFILE_UPDATED",
      resourceType: "Venue",
      resourceId: updated.id,
      summary: "Updated venue profile",
    });

    revalidatePath("/venue-admin");
    revalidatePath(`/venue-admin/${validated.organizationId}/venues/${updated.id}/profile`);
    if (venue.slug) {
      revalidatePath(`/rinks/${venue.slug}`);
    }
    if (updated.slug && updated.slug !== venue.slug) {
      revalidatePath(`/rinks/${updated.slug}`);
    }
    revalidatePath("/rinks");

    return {
      success: true,
      data: {
        venueId: updated.id,
        profileStatus: updated.profileStatus,
        updatedAt: updated.updatedAt,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to update venue profile. Please try again." };
  }
}

export async function publishVenueProfile(
  input: { organizationId: string; venueId: string }
): Promise<ActionResult<{ venueId: string; profileStatus: string; publishedAt: Date }>> {
  try {
    const validated = publishVenueProfileSchema.parse(input);

    const venue = await prisma.venue.findFirst({
      where: {
        id: validated.venueId,
        organizationId: validated.organizationId,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        city: true,
        state: true,
        publicDescription: true,
      },
    });

    if (!venue) {
      return { success: false, error: "Venue profile not found" };
    }

    const missingFields = [
      !venue.name ? "name" : null,
      !venue.slug ? "slug" : null,
      !venue.city ? "city" : null,
      !venue.state ? "state" : null,
      !venue.publicDescription ? "public description" : null,
    ].filter(Boolean);

    if (missingFields.length > 0) {
      return {
        success: false,
        error: `Complete required public profile fields before publishing: ${missingFields.join(", ")}`,
      };
    }

    const slugConflict = await prisma.venue.findFirst({
      where: {
        slug: venue.slug,
        id: { not: venue.id },
      },
      select: { id: true },
    });

    if (slugConflict) {
      return { success: false, error: "That public rink slug is already in use" };
    }

    const userId = await requireVenueProfileManager(validated.organizationId, validated.venueId);
    const publishedAt = new Date();
    const updated = await prisma.venue.update({
      where: { id: venue.id },
      data: {
        profileStatus: "PUBLISHED",
        publishedAt,
      },
      select: { id: true, profileStatus: true, publishedAt: true },
    });

    await logVenueActivity({
      venueId: updated.id,
      actorId: userId,
      action: "VENUE_PROFILE_PUBLISHED",
      resourceType: "Venue",
      resourceId: updated.id,
      summary: "Published venue profile",
    });

    revalidatePath("/venue-admin");
    revalidatePath(`/venue-admin/${validated.organizationId}/venues/${updated.id}/profile`);
    revalidatePath("/rinks");
    revalidatePath(`/rinks/${venue.slug}`);

    return {
      success: true,
      data: {
        venueId: updated.id,
        profileStatus: updated.profileStatus,
        publishedAt: updated.publishedAt ?? publishedAt,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to publish venue profile. Please try again." };
  }
}

export async function getVenueAdminDashboard() {
  const userId = await requireUserId();

  const organizations = await prisma.venueOrganization.findMany({
    where: {
      staff: {
        some: {
          userId,
          status: "ACTIVE",
        },
      },
      status: { in: ["DRAFT", "ACTIVE"] },
    },
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      venues: {
        select: {
          id: true,
          name: true,
          slug: true,
          profileStatus: true,
          city: true,
          state: true,
        },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return {
    organizations,
  };
}

export async function getPublicRinkSummaries() {
  try {
    return await prisma.venue.findMany({
      where: publicPublishedVenueWhere,
      select: publicVenueSummarySelect,
      orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
    });
  } catch (error) {
    if (isMissingVenueManagementSchemaError(error)) {
      console.warn("Public rink listing unavailable until venue management migration is applied", {
        code: error.code,
      });
      return [];
    }
    throw error;
  }
}

export async function getPublicRinkProfile(slug: string) {
  try {
    return await prisma.venue.findFirst({
      where: {
        ...publicPublishedVenueWhere,
        slug,
      },
      select: publicVenueProfileSelect,
    });
  } catch (error) {
    if (isMissingVenueManagementSchemaError(error)) {
      console.warn("Public rink profile unavailable until venue management migration is applied", {
        code: error.code,
        slug,
      });
      return null;
    }
    throw error;
  }
}

function isMissingVenueManagementSchemaError(
  error: unknown
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
}

export interface VenueActivityLogInput {
  venueId: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  summary: string;
  details?: Prisma.InputJsonValue;
}

export async function logVenueActivity(input: VenueActivityLogInput) {
  return prisma.venueActivityLog.create({
    data: {
      venueId: input.venueId,
      actorId: input.actorId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      summary: input.summary,
      details: input.details ?? undefined,
    },
  });
}

export async function logCurrentUserVenueActivity(
  input: Omit<VenueActivityLogInput, "actorId">
) {
  const actorId = await requireUserId();
  return logVenueActivity({ ...input, actorId });
}
