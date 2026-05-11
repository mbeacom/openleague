"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, requireLeagueRole, requireTeamAdmin, requireVenueProfileManager } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/actions/venue-organizations";
import { sendVenueRelationshipInvitationEmail } from "@/lib/email/templates";
import { venueRelationshipSchema, type VenueRelationshipInput } from "@/lib/utils/validation";

const venueRelationshipAdminInclude = {
  team: { select: { id: true, name: true } },
  league: { select: { id: true, name: true } },
} as const satisfies Prisma.VenueRelationshipInclude;

type VenueRelationshipAdminSummary = Prisma.VenueRelationshipGetPayload<{
  include: typeof venueRelationshipAdminInclude;
}>;

type VenueRelationshipInvitationSummary = {
  relationshipId: string;
  venueName: string;
  relationshipType: string;
  targetType: string;
  targetName: string | null;
  expiresAt: Date | null;
};

type RelationshipTargetAuthority = {
  teamId: string | null;
  leagueId: string | null;
  invitedEmail: string | null;
};

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
): Promise<ActionResult<{ venueId: string; relationships: VenueRelationshipAdminSummary[] }>> {
  try {
    await requireVenueProfileManager(organizationId, venueId);
    const relationships = await prisma.venueRelationship.findMany({
      where: { venueId },
      orderBy: { createdAt: "desc" },
      include: venueRelationshipAdminInclude,
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
        teamId: validated.targetType === "TEAM" ? validated.teamId ?? null : null,
        leagueId: validated.targetType === "LEAGUE" ? validated.leagueId ?? null : null,
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

export async function getVenueRelationshipInvitation(
  relationshipId: string
): Promise<ActionResult<VenueRelationshipInvitationSummary>> {
  try {
    const validated = relationshipResponseSchema.shape.relationshipId.parse(relationshipId);
    const relationship = await findRelationship(validated);
    await requireTargetAuthority(relationship);

    return {
      success: true,
      data: {
        relationshipId: relationship.id,
        venueName: relationship.venue.name,
        relationshipType: relationship.relationshipType,
        targetType: relationship.targetType,
        targetName: relationship.targetName,
        expiresAt: relationship.expiresAt,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to load venue relationship invitation." };
  }
}

export async function respondToVenueRelationship(
  input: z.input<typeof relationshipResponseSchema>
): Promise<ActionResult<{ relationshipId: string; status: string }>> {
  try {
    const validated = relationshipResponseSchema.parse(input);
    const relationship = await findRelationship(validated.relationshipId);
    const userId = await requireTargetAuthority(relationship);

    const status = validated.response === "ACCEPT" ? "ACTIVE" : "REJECTED";
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
    const existingRelationship = await findRelationshipForRemoval(
      validated.organizationId,
      validated.venueId,
      validated.relationshipId
    );
    const removedById = await requireRelationshipRemovalAuthority(
      validated.organizationId,
      validated.venueId,
      existingRelationship
    );

    const relationship = await prisma.venueRelationship.update({
      where: { id: existingRelationship.id },
      data: { status: "REMOVED", removedById },
      select: { id: true, status: true },
    });

    revalidateRelationshipPaths(existingRelationship.venue.organizationId, validated.venueId, existingRelationship.venue.slug);
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
        select: { id: true, name: true, slug: true, organizationId: true },
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

  if (!input.invitedEmail) {
    throw new Error("An invited email is required for coach and organization relationship targets");
  }
}

async function requireTargetAuthority(relationship: RelationshipTargetAuthority): Promise<string> {
  if (relationship.teamId) {
    return requireTeamAdmin(relationship.teamId);
  }
  if (relationship.leagueId) {
    return requireLeagueRole(relationship.leagueId, "LEAGUE_ADMIN");
  }
  if (relationship.invitedEmail) {
    const session = await requireAuth();
    const sessionEmail = session.user.email?.trim().toLowerCase();
    if (!sessionEmail || sessionEmail !== relationship.invitedEmail.trim().toLowerCase()) {
      throw new Error("Unauthorized: This invitation is for a different email address");
    }
    return session.user.id;
  }

  throw new Error("Relationship target does not have an authorized responder");
}

async function requireRelationshipRemovalAuthority(
  organizationId: string,
  venueId: string,
  relationship: RelationshipTargetAuthority
): Promise<string> {
  try {
    return await requireVenueProfileManager(organizationId, venueId);
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }

    return requireTargetAuthority(relationship);
  }
}

async function findRelationship(relationshipId: string) {
  const relationship = await prisma.venueRelationship.findFirst({
    where: { id: relationshipId, status: "PENDING" },
    select: {
      id: true,
      venueId: true,
      teamId: true,
      leagueId: true,
      targetType: true,
      targetName: true,
      invitedEmail: true,
      relationshipType: true,
      expiresAt: true,
      venue: { select: { name: true, organizationId: true, slug: true } },
    },
  });

  if (!relationship) {
    throw new Error("Relationship invitation not found");
  }

  if (relationship.expiresAt && relationship.expiresAt < new Date()) {
    throw new Error("Relationship invitation has expired");
  }

  return relationship;
}

async function findRelationshipForRemoval(organizationId: string, venueId: string, relationshipId: string) {
  const relationship = await prisma.venueRelationship.findFirst({
    where: {
      id: relationshipId,
      venueId,
      venue: { organizationId },
    },
    select: {
      id: true,
      teamId: true,
      leagueId: true,
      invitedEmail: true,
      venue: { select: { organizationId: true, slug: true } },
    },
  });

  if (!relationship) {
    throw new Error("Relationship not found");
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
