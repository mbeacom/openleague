"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import {
  getUserLeagueRole,
  requireTeamMember,
  requireUserId,
  requireVenueRequestManager,
} from "@/lib/auth/session";
import type { ActionResult } from "@/lib/actions/venue-organizations";
import {
  decideIceTimeRequestSchema,
  submitIceTimeRequestSchema,
  type SubmitIceTimeRequestInput,
} from "@/lib/utils/validation";
import {
  sendIceTimeRequestDecisionEmail,
  sendIceTimeRequestSubmittedEmail,
} from "@/lib/email/templates";

const requestCommandSchema = z.object({
  organizationId: z.string().cuid("Invalid organization ID format"),
  venueId: z.string().cuid("Invalid venue ID format"),
  requestId: z.string().cuid("Invalid request ID format"),
});

const decisionSchema = decideIceTimeRequestSchema.extend({
  status: z.enum(["UNDER_REVIEW", "ACCEPTED", "DECLINED"]),
});

export async function submitIceTimeRequest(
  input: SubmitIceTimeRequestInput
): Promise<ActionResult<{ requestId: string; status: string }>> {
  try {
    const validated = submitIceTimeRequestSchema.parse(input);
    const userId = await requireUserId();

    if (validated.requesterTeamId) {
      await requireTeamMember(validated.requesterTeamId);
    }

    if (validated.requesterLeagueId) {
      const role = await getUserLeagueRole(userId, validated.requesterLeagueId);
      if (!role) {
        return { success: false, error: "You are not authorized to request ice for that league" };
      }
    }

    const block = await prisma.venueScheduleBlock.findFirst({
      where: {
        id: validated.scheduleBlockId,
        venueId: validated.venueId,
        status: "PUBLISHED",
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        title: true,
        registrationMode: true,
        venue: {
          select: {
            id: true,
            name: true,
            organizationId: true,
            slug: true,
          },
        },
      },
    });

    if (!block) {
      return { success: false, error: "Available ice block not found" };
    }

    if (block.registrationMode !== "REQUEST_REQUIRED") {
      return { success: false, error: "That ice block is not accepting ice time requests" };
    }

    if (validated.requestedStartAt < block.startsAt || validated.requestedEndAt > block.endsAt) {
      return { success: false, error: "Requested time must be within the published available ice block" };
    }

    const existingAccepted = await prisma.iceTimeRequest.findFirst({
      where: {
        scheduleBlockId: block.id,
        status: "ACCEPTED",
        requestedStartAt: { lt: validated.requestedEndAt },
        requestedEndAt: { gt: validated.requestedStartAt },
      },
      select: { id: true },
    });

    if (existingAccepted) {
      return { success: false, error: "That ice time has already been accepted for another request" };
    }

    const request = await prisma.iceTimeRequest.create({
      data: {
        scheduleBlockId: block.id,
        venueId: block.venue.id,
        requesterUserId: userId,
        requesterTeamId: validated.requesterTeamId || null,
        requesterLeagueId: validated.requesterLeagueId || null,
        requesterOrganizationName: validated.requesterOrganizationName || null,
        contactName: validated.contactName,
        contactEmail: validated.contactEmail,
        contactPhone: validated.contactPhone || null,
        requestedStartAt: validated.requestedStartAt,
        requestedEndAt: validated.requestedEndAt,
        notes: validated.notes || null,
        status: "SUBMITTED",
      },
      select: { id: true, status: true },
    });

    const organizationId = block.venue.organizationId;
    const managerEmails = await getRequestManagerEmails(organizationId);
    if (organizationId && managerEmails.length > 0) {
      await sendIceTimeRequestSubmittedEmail({
        managerEmails,
        venueName: block.venue.name,
        scheduleTitle: block.title,
        contactName: validated.contactName,
        contactEmail: validated.contactEmail,
        requestId: request.id,
        organizationId,
        venueId: block.venue.id,
      });
    }

    revalidateRequestPaths(block.venue.organizationId, block.venue.id, block.venue.slug);
    return { success: true, data: { requestId: request.id, status: request.status } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to submit ice time request." };
  }
}

export async function decideIceTimeRequest(
  input: z.input<typeof decisionSchema>
): Promise<ActionResult<{ requestId: string; status: string; decidedAt: Date | null }>> {
  try {
    const validated = decisionSchema.parse(input);
    const userId = await requireVenueRequestManager(validated.organizationId, validated.venueId);
    const request = await findManagedRequest(validated.organizationId, validated.venueId, validated.requestId);
    if (!request) {
      return { success: false, error: "Ice time request not found" };
    }

    if (validated.status === "ACCEPTED") {
      const acceptedConflict = await prisma.iceTimeRequest.findFirst({
        where: {
          id: { not: request.id },
          scheduleBlockId: request.scheduleBlockId,
          status: "ACCEPTED",
          requestedStartAt: { lt: request.requestedEndAt },
          requestedEndAt: { gt: request.requestedStartAt },
        },
        select: { id: true },
      });

      if (acceptedConflict) {
        return { success: false, error: "That ice time has already been accepted for another request" };
      }
    }

    const decidedAt = validated.status === "UNDER_REVIEW" ? null : new Date();
    const updated = await prisma.iceTimeRequest.update({
      where: { id: request.id },
      data: {
        status: validated.status,
        decisionMessage: validated.decisionMessage || null,
        decidedAt,
        decidedById: userId,
      },
      select: { id: true, status: true, decidedAt: true },
    });

    if (validated.status !== "UNDER_REVIEW") {
      await sendIceTimeRequestDecisionEmail({
        contactEmail: request.contactEmail,
        venueName: request.venue.name,
        status: validated.status,
        decisionMessage: validated.decisionMessage || null,
      });
    }

    revalidateRequestPaths(validated.organizationId, validated.venueId, request.venue.slug);
    return {
      success: true,
      data: { requestId: updated.id, status: updated.status, decidedAt: updated.decidedAt },
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to update ice time request." };
  }
}

export async function cancelIceTimeRequest(
  input: z.input<typeof requestCommandSchema>
): Promise<ActionResult<{ requestId: string; status: string }>> {
  return setRequestStatus(input, "CANCELED");
}

export async function expireIceTimeRequest(
  input: z.input<typeof requestCommandSchema>
): Promise<ActionResult<{ requestId: string; status: string }>> {
  return setRequestStatus(input, "EXPIRED");
}

export async function getVenueRequestQueue(
  organizationId: string,
  venueId: string
): Promise<
  ActionResult<{
    venueId: string;
    requests: Array<{
      id: string;
      contactName: string;
      contactEmail: string;
      status: string;
      requestedStartAt: Date;
      requestedEndAt: Date;
    }>;
  }>
> {
  try {
    await requireVenueRequestManager(organizationId, venueId);

    const requests = await prisma.iceTimeRequest.findMany({
      where: { venueId },
      select: {
        id: true,
        contactName: true,
        contactEmail: true,
        status: true,
        requestedStartAt: true,
        requestedEndAt: true,
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    return { success: true, data: { venueId, requests } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to load request queue." };
  }
}

async function setRequestStatus(
  input: z.input<typeof requestCommandSchema>,
  status: "CANCELED" | "EXPIRED"
): Promise<ActionResult<{ requestId: string; status: string }>> {
  try {
    const validated = requestCommandSchema.parse(input);
    await requireVenueRequestManager(validated.organizationId, validated.venueId);
    const request = await findManagedRequest(validated.organizationId, validated.venueId, validated.requestId);
    if (!request) {
      return { success: false, error: "Ice time request not found" };
    }

    const updated = await prisma.iceTimeRequest.update({
      where: { id: request.id },
      data: { status },
      select: { id: true, status: true },
    });

    revalidateRequestPaths(validated.organizationId, validated.venueId, request.venue.slug);
    return { success: true, data: { requestId: updated.id, status: updated.status } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to update ice time request." };
  }
}

async function findManagedRequest(organizationId: string, venueId: string, requestId: string) {
  return prisma.iceTimeRequest.findFirst({
    where: {
      id: requestId,
      venueId,
      venue: { organizationId },
    },
    select: {
      id: true,
      contactEmail: true,
      scheduleBlockId: true,
      requestedStartAt: true,
      requestedEndAt: true,
      venue: {
        select: {
          id: true,
          name: true,
          organizationId: true,
          slug: true,
        },
      },
    },
  });
}

async function getRequestManagerEmails(organizationId: string | null): Promise<string[]> {
  if (!organizationId) {
    return [];
  }

  const staff = await prisma.venueStaff.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      role: { in: ["OWNER", "MANAGER", "REQUEST_MANAGER"] },
    },
    select: {
      user: { select: { email: true } },
    },
  });

  return staff.map((member) => member.user.email);
}

function revalidateRequestPaths(organizationId: string | null, venueId: string, slug?: string | null) {
  if (organizationId) {
    revalidatePath(`/venue-admin/${organizationId}/venues/${venueId}/requests`);
  }
  if (slug) {
    revalidatePath(`/rinks/${slug}/schedule`);
  }
}
