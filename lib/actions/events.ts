"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { sendEventNotifications } from "@/lib/email/templates";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

// Event validation schemas
export const createEventSchema = z
  .object({
    type: z.enum(["GAME", "PRACTICE"], {
      message: "Event type must be GAME or PRACTICE",
    }),
    title: z
      .string()
      .min(1, "Title is required")
      .max(100, "Title must be less than 100 characters"),
    startAt: z.coerce.date({
      message: "Valid date and time is required",
    }),
    location: z
      .string()
      .min(1, "Location is required")
      .max(200, "Location must be less than 200 characters"),
    opponent: z
      .string()
      .max(100, "Opponent must be less than 100 characters")
      .optional()
      .nullable(),
    notes: z
      .string()
      .max(1000, "Notes must be less than 1000 characters")
      .optional()
      .nullable(),
    teamId: z.string().min(1, "Team ID is required"),
  })
  .refine(
    (data) => {
      // Validate date is not in the past
      return data.startAt > new Date();
    },
    {
      message: "Event date must be in the future",
      path: ["startAt"],
    }
  )
  .refine(
    (data) => {
      // Require opponent field for GAME type
      if (data.type === "GAME") {
        return data.opponent && data.opponent.trim().length > 0;
      }
      return true;
    },
    {
      message: "Opponent is required for games",
      path: ["opponent"],
    }
  );

export const updateEventSchema = createEventSchema.extend({
  id: z.string().min(1, "Event ID is required"),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

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
    // Authorization check - user must be authenticated
    const userId = await requireUserId();

    // Validate input
    const validated = createEventSchema.parse(input);

    // Verify user is ADMIN of the team
    const teamMember = await prisma.teamMember.findUnique({
      where: {
        userId_teamId: {
          userId,
          teamId: validated.teamId,
        },
      },
    });

    if (!teamMember) {
      return {
        success: false,
        error: "You are not a member of this team",
      };
    }

    if (teamMember.role !== "ADMIN") {
      return {
        success: false,
        error: "Only team admins can create events",
      };
    }

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
    // Authorization check - user must be authenticated
    const userId = await requireUserId();

    // Validate input
    const validated = updateEventSchema.parse(input);

    // Get the event to verify team ownership
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

    // Verify user is ADMIN of the team
    const teamMember = await prisma.teamMember.findUnique({
      where: {
        userId_teamId: {
          userId,
          teamId: existingEvent.teamId,
        },
      },
    });

    if (!teamMember) {
      return {
        success: false,
        error: "You are not a member of this team",
      };
    }

    if (teamMember.role !== "ADMIN") {
      return {
        success: false,
        error: "Only team admins can update events",
      };
    }

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
    // Authorization check - user must be authenticated
    const userId = await requireUserId();

    // Get the event to verify team ownership
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

    // Verify user is ADMIN of the team
    const teamMember = await prisma.teamMember.findUnique({
      where: {
        userId_teamId: {
          userId,
          teamId: existingEvent.teamId,
        },
      },
    });

    if (!teamMember) {
      return {
        success: false,
        error: "You are not a member of this team",
      };
    }

    if (teamMember.role !== "ADMIN") {
      return {
        success: false,
        error: "Only team admins can delete events",
      };
    }

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
    const userId = await requireUserId();

    // Verify user is a member of the team
    const teamMember = await prisma.teamMember.findUnique({
      where: {
        userId_teamId: {
          userId,
          teamId,
        },
      },
    });

    if (!teamMember) {
      throw new Error("You are not a member of this team");
    }

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
    const userId = await requireUserId();

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

    // Verify user is a member of the team
    const teamMember = await prisma.teamMember.findUnique({
      where: {
        userId_teamId: {
          userId,
          teamId: event.teamId,
        },
      },
    });

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
