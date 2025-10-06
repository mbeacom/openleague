"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireTeamMember } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import {
  updateRSVPSchema,
  type UpdateRSVPInput
} from "@/lib/utils/validation";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

/**
 * Update or create an RSVP for an event
 */
export async function updateRSVP(
  input: UpdateRSVPInput
): Promise<
  ActionResult<{
    id: string;
    status: string;
    userId: string;
    eventId: string;
  }>
> {
  try {
    // Validate input
    const validated = updateRSVPSchema.parse(input);

    // Verify the event exists and get team ID
    const event = await prisma.event.findUnique({
      where: { id: validated.eventId },
      select: {
        id: true,
        teamId: true,
      },
    });

    if (!event) {
      return {
        success: false,
        error: "Event not found",
      };
    }

    // Check authentication and authorization - user must be a team member
    const userId = await requireTeamMember(event.teamId);

    // Create or update RSVP
    const rsvp = await prisma.rSVP.upsert({
      where: {
        userId_eventId: {
          userId,
          eventId: validated.eventId,
        },
      },
      update: {
        status: validated.status,
      },
      create: {
        userId,
        eventId: validated.eventId,
        status: validated.status,
      },
      select: {
        id: true,
        status: true,
        userId: true,
        eventId: true,
      },
    });

    // Revalidate the event detail page and calendar
    revalidatePath(`/events/${validated.eventId}`);
    revalidatePath("/calendar");

    return {
      success: true,
      data: rsvp,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors = error.issues
        .map((issue: z.ZodIssue) => `${issue.path.join(".")}: ${issue.message}`)
        .join(", ");
      return {
        success: false,
        error: `Validation failed: ${fieldErrors}`,
        details: error.issues,
      };
    }

    console.error("Error updating RSVP:", error);

    return {
      success: false,
      error: "Failed to update RSVP. Please try again.",
    };
  }
}
