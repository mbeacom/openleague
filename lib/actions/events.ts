"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireTeamAdmin, requireTeamMember, requireUserId } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { sendEventNotifications } from "@/lib/email/templates";
import {
  createEventSchema,
  updateEventSchema,
  type CreateEventInput,
  type UpdateEventInput,
} from "@/lib/utils/validation";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

export type { CreateEventInput, UpdateEventInput };

/**
 * Create a new event and initialize RSVPs for all team members
 */
export async function createEvent(
  input: CreateEventInput
): Promise<
  ActionResult<{
    id: string;
    type: string;
    title: string;
    startAt: Date;
    location: string;
    opponent: string | null;
    notes: string | null;
  }>
> {
  try {
    // Validate input
    const validated = createEventSchema.parse(input);

    // Check authentication and authorization - only ADMIN can create events
    await requireTeamAdmin(validated.teamId);

    // Get all team members to initialize RSVPs
    const allTeamMembers = await prisma.teamMember.findMany({
      where: {
        teamId: validated.teamId,
      },
      select: {
        userId: true,
      },
    });

    // Create event with RSVPs for all team members
    const event = await prisma.event.create({
      data: {
        type: validated.type,
        title: validated.title,
        startAt: validated.startAt,
        location: validated.location,
        opponent: validated.opponent || null,
        notes: validated.notes || null,
        teamId: validated.teamId,
        rsvps: {
          create: allTeamMembers.map((member: { userId: string }) => ({
            userId: member.userId,
            status: "NO_RESPONSE",
          })),
        },
      },
      select: {
        id: true,
        type: true,
        title: true,
        startAt: true,
        location: true,
        opponent: true,
        notes: true,
      },
    });

    // Revalidate calendar and events pages
    revalidatePath("/calendar");
    revalidatePath("/events");

    // Send email notifications to all team members (async, don't block response)
    sendEventNotifications(event.id, "created").catch((error) => {
      console.error("Failed to send event notification emails:", error);
    });

    return {
      success: true,
      data: event,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors = error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join(", ");
      return {
        success: false,
        error: `Validation failed: ${fieldErrors}`,
        details: error.issues,
      };
    }

    console.error("Error creating event:", error);

    return {
      success: false,
      error: "Failed to create event. Please try again.",
    };
  }
}

/**
 * Update an existing event
 */
export async function updateEvent(
  input: UpdateEventInput
): Promise<
  ActionResult<{
    id: string;
    type: string;
    title: string;
    startAt: Date;
    location: string;
    opponent: string | null;
    notes: string | null;
  }>
> {
  try {
    // Validate input
    const validated = updateEventSchema.parse(input);

    // Get the event to verify it exists and get team ID
    const existingEvent = await prisma.event.findUnique({
      where: { id: validated.id },
      select: { teamId: true },
    });

    if (!existingEvent) {
      return {
        success: false,
        error: "Event not found",
      };
    }

    // Check authentication and authorization - only ADMIN can update events
    await requireTeamAdmin(existingEvent.teamId);

    // Update the event
    const event = await prisma.event.update({
      where: { id: validated.id },
      data: {
        type: validated.type,
        title: validated.title,
        startAt: validated.startAt,
        location: validated.location,
        opponent: validated.opponent || null,
        notes: validated.notes || null,
      },
      select: {
        id: true,
        type: true,
        title: true,
        startAt: true,
        location: true,
        opponent: true,
        notes: true,
      },
    });

    // Revalidate calendar and events pages
    revalidatePath("/calendar");
    revalidatePath("/events");
    revalidatePath(`/events/${validated.id}`);

    // Send email notifications to all team members (async, don't block response)
    sendEventNotifications(event.id, "updated").catch((error) => {
      console.error("Failed to send event update notification emails:", error);
    });

    return {
      success: true,
      data: event,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors = error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join(", ");
      return {
        success: false,
        error: `Validation failed: ${fieldErrors}`,
        details: error.issues,
      };
    }

    console.error("Error updating event:", error);

    return {
      success: false,
      error: "Failed to update event. Please try again.",
    };
  }
}

/**
 * Delete an event
 */
export async function deleteEvent(
  eventId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    // Get the event to verify it exists and get team ID
    const existingEvent = await prisma.event.findUnique({
      where: { id: eventId },
      select: { teamId: true },
    });

    if (!existingEvent) {
      return {
        success: false,
        error: "Event not found",
      };
    }

    // Check authentication and authorization - only ADMIN can delete events
    await requireTeamAdmin(existingEvent.teamId);

    // Delete the event (RSVPs will be cascade deleted)
    await prisma.event.delete({
      where: { id: eventId },
    });

    // Send cancellation email after deletion (async, don't block response)
    sendEventNotifications(eventId, "cancelled").catch((error) => {
      console.error("Failed to send event cancellation notification emails:", error);
    });

    // Revalidate calendar and events pages
    revalidatePath("/calendar");
    revalidatePath("/events");

    return {
      success: true,
      data: { id: eventId },
    };
  } catch (error) {
    console.error("Error deleting event:", error);

    return {
      success: false,
      error: "Failed to delete event. Please try again.",
    };
  }
}

/**
 * Get all events for a team
 */
export async function getTeamEvents(teamId: string) {
  try {
    // Check authentication and authorization - user must be a team member
    await requireTeamMember(teamId);

    const events = await prisma.event.findMany({
      where: {
        teamId,
      },
      orderBy: {
        startAt: "asc",
      },
      select: {
        id: true,
        type: true,
        title: true,
        startAt: true,
        location: true,
        opponent: true,
        notes: true,
        _count: {
          select: {
            rsvps: true,
          },
        },
      },
    });

    return events;
  } catch (error) {
    console.error("Error fetching team events:", error);
    throw error;
  }
}

/**
 * Get a single event with full details including RSVPs
 */
export async function getEvent(eventId: string) {
  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        team: {
          select: {
            id: true,
            name: true,
          },
        },
        rsvps: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!event) {
      return null;
    }

    // Check authentication and authorization, and get user's role in one go.
    const userId = await requireUserId();
    const teamMember = await prisma.teamMember.findUnique({
      where: {
        userId_teamId: {
          userId,
          teamId: event.teamId,
        },
      },
      select: {
        role: true,
      },
    });

    // If user is not a member of the team, return null as before.
    if (!teamMember) {
      return null;
    }

    return {
      ...event,
      userRole: teamMember.role,
    };
  } catch (error) {
    console.error("Error fetching event:", error);
    throw error;
  }
}
