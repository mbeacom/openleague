"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireLeagueRole, requireTeamAdmin, requireUserId, requireVenueProfileManager } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/actions/venue-organizations";
import { sendVenueRelationshipInvitationEmail } from "@/lib/email/templates";
import { venueRelationshipSchema, type VenueRelationshipInput } from "@/lib/utils/validation";

const relationshipResponseSchema = z.object({
  relationshipId: z.string().cuid("Invalid relationship ID format"),
  response: z.enum(["ACCEPT", "REJECT"]),
});

const removeRelationshipSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID format"),
  venueId: z.string().cuid("Invalid venue ID format"),
  relationshipId: z.string().cuid("Invalid relationship ID format"),
});

export async function getVenueRelationshipAdminData(
  organizationId: string,
  venueId: string
): Promise<ActionResult<{ venueId: string; relationships: unknown[] }>> {
  try {
    await requireVenueProfileManager(organizationId, venueId);
    const relationships = await prisma.venueRelationship.findMany({
      where: { venueId },
      orderBy: { createdAt: "desc" },
      include: {
        team: { select: { id: true, name: true } },
        league: { select: { id: true, name: true } },
      },
    });

    return { success: true, data: { venueId, relationships } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to load venue relationships." };
  }
}

export async function inviteVenueRelationship(
  input: VenueRelationshipInput
): Promise<ActionResult<{ relationshipId: string; status: string }>> {
  try {
    const validated = venueRelationshipSchema.parse(input);
    const invitedById = await requireVenueProfileManager(validated.organizationId, validated.venueId);
    const venue = await ensureVenue(validated.organizationId, validated.venueId);
    await validateTarget(validated);

    const relationship = await prisma.venueRelationship.create({
      data: {
        venueId: validated.venueId,
        relationshipType: validated.relationshipType,
        targetType: validated.targetType,
        teamId: validated.teamId || null,
        leagueId: validated.leagueId || null,
        targetName: validated.targetName || null,
        invitedEmail: validated.invitedEmail || null,
        expiresAt: validated.expiresAt ?? null,
        status: "PENDING",
        invitedById,
      },
      select: { id: true, status: true },
    });

    if (validated.invitedEmail) {
      await sendVenueRelationshipInvitationEmail({
        email: validated.invitedEmail,
        venueName: venue.name,
        relationshipType: validated.relationshipType,
        relationshipId: relationship.id,
      });
    }

    revalidateRelationshipPaths(validated.organizationId, validated.venueId, venue.slug);
    return { success: true, data: { relationshipId: relationship.id, status: relationship.status } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to invite venue relationship." };
  }
}

export async function respondToVenueRelationship(
  input: z.input<typeof relationshipResponseSchema>
): Promise<ActionResult<{ relationshipId: string; status: string }>> {
  try {
    const validated = relationshipResponseSchema.parse(input);
    const relationship = await findRelationship(validated.relationshipId);
    await requireTargetAuthority(relationship);

    const status = validated.response === "ACCEPT" ? "ACTIVE" : "REJECTED";
    const userId = await requireUserId();
    const updated = await prisma.venueRelationship.update({
      where: { id: relationship.id },
      data: {
        status,
        acceptedById: status === "ACTIVE" ? userId : null,
      },
      select: { id: true, status: true },
    });

    revalidateRelationshipPaths(relationship.venue.organizationId, relationship.venueId, relationship.venue.slug);
    return { success: true, data: { relationshipId: updated.id, status: updated.status } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to respond to venue relationship." };
  }
}

export async function removeVenueRelationship(
  input: z.input<typeof removeRelationshipSchema>
): Promise<ActionResult<{ relationshipId: string; status: string }>> {
  try {
    const validated = removeRelationshipSchema.parse(input);
    const removedById = await requireVenueProfileManager(validated.organizationId, validated.venueId);
    const venue = await ensureVenue(validated.organizationId, validated.venueId);

    const relationship = await prisma.venueRelationship.update({
      where: { id: validated.relationshipId },
      data: { status: "REMOVED", removedById },
      select: { id: true, status: true },
    });

    revalidateRelationshipPaths(validated.organizationId, validated.venueId, venue.slug);
    return { success: true, data: { relationshipId: relationship.id, status: relationship.status } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to remove venue relationship." };
  }
}

export async function getPublicVenueRelationships(venueId: string) {
  return prisma.venueRelationship.findMany({
    where: { venueId, status: "ACTIVE" },
    select: {
      id: true,
      relationshipType: true,
      targetType: true,
      targetName: true,
      team: { select: { id: true, name: true } },
      league: { select: { id: true, name: true } },
    },
    orderBy: [{ relationshipType: "asc" }, { targetName: "asc" }],
  });
}

export async function getTeamVenueRelationships(teamIds: string[]) {
  if (teamIds.length === 0) {
    return [];
  }

  return prisma.venueRelationship.findMany({
    where: { teamId: { in: teamIds }, status: "ACTIVE" },
    select: {
      id: true,
      relationshipType: true,
      teamId: true,
      venue: {
        select: { id: true, name: true, slug: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function validateTarget(input: z.infer<typeof venueRelationshipSchema>) {
  if (input.targetType === "TEAM") {
    if (!input.teamId) throw new Error("Team target is required");
    const team = await prisma.team.findUnique({ where: { id: input.teamId }, select: { id: true, name: true } });
    if (!team) throw new Error("Team target not found");
    return;
  }

  if (input.targetType === "LEAGUE") {
    if (!input.leagueId) throw new Error("League target is required");
    const league = await prisma.league.findUnique({ where: { id: input.leagueId }, select: { id: true, name: true } });
    if (!league) throw new Error("League target not found");
    return;
  }

  if (!input.targetName && !input.invitedEmail) {
    throw new Error("Target name or invited email is required");
  }
}

async function requireTargetAuthority(relationship: Awaited<ReturnType<typeof findRelationship>>) {
  if (relationship.teamId) {
    await requireTeamAdmin(relationship.teamId);
    return;
  }
  if (relationship.leagueId) {
    await requireLeagueRole(relationship.leagueId, "LEAGUE_ADMIN");
    return;
  }
  await requireUserId();
}

async function findRelationship(relationshipId: string) {
  const relationship = await prisma.venueRelationship.findFirst({
    where: { id: relationshipId, status: "PENDING" },
    select: {
      id: true,
      venueId: true,
      teamId: true,
      leagueId: true,
      venue: { select: { organizationId: true, slug: true } },
    },
  });

  if (!relationship) {
    throw new Error("Relationship invitation not found");
  }

  return relationship;
}

async function ensureVenue(organizationId: string, venueId: string) {
  const venue = await prisma.venue.findFirst({
    where: { id: venueId, organizationId },
    select: { id: true, name: true, slug: true },
  });

  if (!venue) {
    throw new Error("Venue not found");
  }

  return venue;
}

function revalidateRelationshipPaths(organizationId: string | null, venueId: string, slug?: string | null) {
  if (organizationId) {
    revalidatePath(`/venue-admin/${organizationId}/venues/${venueId}/relationships`);
  }
  revalidatePath("/dashboard");
  if (slug) {
    revalidatePath(`/rinks/${slug}`);
  }
}
