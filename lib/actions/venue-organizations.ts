"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { createVenueActivityLog } from "@/lib/services/venue-activity";
import {
  createOwnerVenueStaff,
  ensureVenueStaffCoverage,
} from "@/lib/services/venue-staff-bootstrap";
import { requireUserId, requireVenueProfileManager } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import {
  getPublicVenueProfileSelect,
  publicPublishedVenueWhere,
  publicVenueSummarySelect,
} from "@/lib/utils/public-venues";
import {
  createVenueOrganizationSchema,
  createVenueSchema,
  publishVenueProfileSchema,
  updateVenueProfileSchema,
  type CreateVenueInput,
  type CreateVenueOrganizationInput,
  type UpdateVenueProfileInput,
} from "@/lib/utils/validation";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

type ParsedUpdateVenueProfileInput = ReturnType<typeof updateVenueProfileSchema.parse>;

const nullableVenueProfileFields = [
  "address",
  "city",
  "state",
  "zipCode",
  "phone",
  "website",
  "notes",
  "slug",
  "publicDescription",
  "logoUrl",
  "brandPrimaryColor",
  "brandSecondaryColor",
  "publicEmail",
  "publicPhone",
  "privateManagerNotes",
] as const;

function hasInputField(input: UpdateVenueProfileInput, field: keyof UpdateVenueProfileInput): boolean {
  return Object.prototype.hasOwnProperty.call(input, field);
}

function setDataField(data: Prisma.VenueUpdateInput, field: string, value: unknown) {
  (data as Record<string, unknown>)[field] = value;
}

function buildVenueProfileUpdateData(
  input: UpdateVenueProfileInput,
  validated: ParsedUpdateVenueProfileInput
): Prisma.VenueUpdateInput {
  const data: Prisma.VenueUpdateInput = {};

  if (hasInputField(input, "name") && validated.name !== undefined) {
    data.name = validated.name;
  }
  if (hasInputField(input, "surfaceType") && validated.surfaceType !== undefined) {
    data.surfaceType = validated.surfaceType;
  }
  if (hasInputField(input, "timezone") && validated.timezone !== undefined) {
    data.timezone = validated.timezone;
  }
  if (hasInputField(input, "capacity")) {
    data.capacity = validated.capacity ?? null;
  }
  if (hasInputField(input, "amenities") && validated.amenities !== undefined) {
    data.amenities = validated.amenities;
  }

  for (const field of nullableVenueProfileFields) {
    if (hasInputField(input, field)) {
      setDataField(data, field, validated[field] || null);
    }
  }

  return data;
}

interface PublishableVenueProfile {
  name: string | null;
  slug: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  publicDescription: string | null;
  timezone: string | null;
  publicEmail: string | null;
  publicPhone: string | null;
  website: string | null;
  hasActiveOwnerOrManager: boolean;
}

function getVenuePublishMissingFields(venue: PublishableVenueProfile): string[] {
  return [
    !venue.name ? "name" : null,
    !venue.slug ? "slug" : null,
    !venue.publicDescription ? "public description" : null,
    !venue.timezone ? "timezone" : null,
    !venue.address && !(venue.city && venue.state) ? "address or city/state" : null,
    !(venue.publicEmail || venue.publicPhone || venue.website) ? "public contact method" : null,
    !venue.hasActiveOwnerOrManager ? "active owner or manager" : null,
  ].filter((field): field is string => Boolean(field));
}

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

      await createOwnerVenueStaff(tx, {
        organizationId: organization.id,
        userId,
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

// Kept module-private: schema for the attach action below. Lives here rather
// than lib/utils/validation.ts to keep the attach contract next to its only
// consumer; "use server" files may not export non-async values.
const attachVenueToOrganizationSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID format"),
  venueId: z.string().cuid("Invalid venue ID format"),
});

/**
 * Add a new venue to an existing venue organization. Mirrors the venue-create
 * block of onboarding (PUBLIC visibility, DRAFT profile, activity log) so org
 * venues always carry audit history, unlike the generic createVenue action.
 */
export async function createOrganizationVenue(
  input: CreateVenueInput
): Promise<ActionResult<{ venueId: string; name: string; profileStatus: string }>> {
  try {
    const validated = createVenueSchema.parse(input);
    if (!validated.organizationId) {
      return { success: false, error: "Organization is required" };
    }
    const organizationId = validated.organizationId;
    const userId = await requireVenueProfileManager(organizationId);

    const venue = await prisma.$transaction(async (tx) => {
      const created = await tx.venue.create({
        data: {
          name: validated.name,
          organizationId,
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
          visibility: "PUBLIC",
          profileStatus: "DRAFT",
          createdById: userId,
        },
        select: { id: true, name: true, profileStatus: true },
      });

      await ensureVenueStaffCoverage(tx, {
        organizationId,
        userId,
        venueId: created.id,
      });

      await createVenueActivityLog(tx, {
        venueId: created.id,
        actorId: userId,
        action: "VENUE_CREATED",
        resourceType: "Venue",
        resourceId: created.id,
        summary: "Added venue to organization",
      });

      return created;
    });

    revalidatePath("/venue-admin");
    revalidatePath(`/venue-admin/${organizationId}`);
    revalidatePath("/rinks");

    return {
      success: true,
      data: { venueId: venue.id, name: venue.name, profileStatus: venue.profileStatus },
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to add venue. Please try again." };
  }
}

/**
 * Attach an existing standalone venue to a venue organization. Requires
 * authorization on both sides: the caller must be an OWNER/MANAGER of the
 * organization AND the creator of the venue being attached. Team- and
 * league-owned venues, and venues already in an organization, are rejected.
 */
export async function attachVenueToOrganization(
  input: { organizationId: string; venueId: string }
): Promise<ActionResult<{ venueId: string }>> {
  try {
    const validated = attachVenueToOrganizationSchema.parse(input);
    const userId = await requireVenueProfileManager(validated.organizationId);

    const venue = await prisma.venue.findUnique({
      where: { id: validated.venueId },
      select: {
        id: true,
        organizationId: true,
        teamId: true,
        leagueId: true,
        createdById: true,
      },
    });

    if (!venue) {
      return { success: false, error: "Venue not found" };
    }
    if (venue.organizationId) {
      return {
        success: false,
        error:
          venue.organizationId === validated.organizationId
            ? "This venue already belongs to this organization"
            : "This venue already belongs to another organization",
      };
    }
    if (venue.teamId || venue.leagueId) {
      return {
        success: false,
        error: "Team- and league-owned venues cannot be attached to a venue organization",
      };
    }
    if (venue.createdById !== userId) {
      return { success: false, error: "You can only attach venues you created" };
    }

    await prisma.$transaction(async (tx) => {
      // Re-check ownership constraints in the write itself so a concurrent
      // attach or team/league assignment cannot slip between read and update.
      const attached = await tx.venue.updateMany({
        where: {
          id: venue.id,
          organizationId: null,
          teamId: null,
          leagueId: null,
          createdById: userId,
        },
        data: { organizationId: validated.organizationId },
      });
      if (attached.count === 0) {
        throw new Error("VENUE_NOT_ATTACHABLE");
      }

      await createVenueActivityLog(tx, {
        venueId: venue.id,
        actorId: userId,
        action: "VENUE_ATTACHED_TO_ORGANIZATION",
        resourceType: "Venue",
        resourceId: venue.id,
        summary: "Attached existing venue to organization",
      });
    });

    revalidatePath("/venue-admin");
    revalidatePath(`/venue-admin/${validated.organizationId}`);
    revalidatePath("/venues");
    revalidatePath("/rinks");

    return { success: true, data: { venueId: venue.id } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    if (error instanceof Error && error.message === "VENUE_NOT_ATTACHABLE") {
      return { success: false, error: "This venue can no longer be attached. Please refresh and try again." };
    }
    return { success: false, error: "Failed to attach venue. Please try again." };
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

      const updateData = buildVenueProfileUpdateData(input, validated);
      if (Object.keys(updateData).length === 0) {
        return { success: false, error: "At least one venue profile field is required" };
      }

      const userId = await requireVenueProfileManager(validated.organizationId, validated.venueId);

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

      const updated = await prisma.$transaction(async (tx) => {
        const updatedVenue = await tx.venue.update({
          where: { id: validated.venueId },
          data: updateData,
          select: { id: true, profileStatus: true, updatedAt: true, slug: true },
        });

        await createVenueActivityLog(tx, {
          venueId: updatedVenue.id,
          actorId: userId,
          action: "VENUE_PROFILE_UPDATED",
          resourceType: "Venue",
          resourceId: updatedVenue.id,
          summary: "Updated venue profile",
        });

        return updatedVenue;
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
      const userId = await requireVenueProfileManager(validated.organizationId, validated.venueId);

    const venue = await prisma.venue.findFirst({
      where: {
        id: validated.venueId,
        organizationId: validated.organizationId,
      },
      select: {
        id: true,
        name: true,
        slug: true,
          address: true,
        city: true,
        state: true,
        publicDescription: true,
          timezone: true,
          publicEmail: true,
          publicPhone: true,
          website: true,
      },
    });

    if (!venue) {
      return { success: false, error: "Venue profile not found" };
    }

      const activeOwnerOrManager = await prisma.venueStaff.findFirst({
        where: {
          organizationId: validated.organizationId,
          status: "ACTIVE",
          role: { in: ["OWNER", "MANAGER"] },
          OR: [{ venueId: null }, { venueId: validated.venueId }],
        },
        select: { id: true },
      });

      const missingFields = getVenuePublishMissingFields({
        ...venue,
        hasActiveOwnerOrManager: Boolean(activeOwnerOrManager),
      });

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

    const publishedAt = new Date();
      const updated = await prisma.$transaction(async (tx) => {
        const updatedVenue = await tx.venue.update({
          where: { id: venue.id },
          data: {
            profileStatus: "PUBLISHED",
            publishedAt,
          },
          select: { id: true, profileStatus: true, publishedAt: true },
        });

        await createVenueActivityLog(tx, {
          venueId: updatedVenue.id,
          actorId: userId,
          action: "VENUE_PROFILE_PUBLISHED",
          resourceType: "Venue",
          resourceId: updatedVenue.id,
          summary: "Published venue profile",
    });

        return updatedVenue;
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

  try {
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
        staff: {
          where: { userId, status: "ACTIVE" },
          select: { role: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return {
      organizations: organizations.map(({ staff, ...organization }) => ({
        ...organization,
        // Gates management CTAs (e.g. Add venue) in the dashboard UI.
        viewerCanManageVenues: staff.some(
          (member) => member.role === "OWNER" || member.role === "MANAGER"
        ),
      })),
    };
  } catch (error) {
    if (isMissingVenueManagementSchemaError(error)) {
      console.warn("Venue admin dashboard unavailable until venue management migration is applied", {
        code: error.code,
      });
      return { organizations: [] };
    }
    throw error;
  }
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
    const now = new Date();
    return await prisma.venue.findFirst({
      where: {
        ...publicPublishedVenueWhere,
        slug,
      },
      select: getPublicVenueProfileSelect(now),
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

// Venue activity-log helpers moved to lib/services/venue-activity.ts (a plain,
// non-"use server" module) so they are importable by actions but not exposed
// as forgeable client-callable RPC endpoints. createVenueActivityLog is
// imported at the top of this file for the transaction-scoped log writes below.
// The former logCurrentUserVenueActivity was unused and removed.
