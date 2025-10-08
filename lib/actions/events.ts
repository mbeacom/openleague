"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireTeamAdmin, requireTeamMember, requireUserId } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { sendEventNotifications } from "@/lib/email/templates";
import {
  createEventSchema,
  updateEventSchema,
  createInterTeamGameSchema,
  type CreateEventInput,
  type UpdateEventInput,
  type CreateInterTeamGameInput,
} from "@/lib/utils/validation";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

export type { CreateEventInput, UpdateEventInput, CreateInterTeamGameInput };

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

/**
 * Create an inter-team game with conflict detection and automatic RSVP creation
 */
export async function createInterTeamGame(
  input: CreateInterTeamGameInput
): Promise<
  ActionResult<{
    id: string;
    title: string;
    startAt: Date;
    location: string;
    notes: string | null;
    homeTeam: { id: string; name: string };
    awayTeam: { id: string; name: string };
    conflicts?: Array<{
      teamId: string;
      teamName: string;
      conflictingEvent: {
        id: string;
        title: string;
        startAt: Date;
      };
    }>;
  }>
> {
  try {
    // Validate input
    const validated = createInterTeamGameSchema.parse(input);

    // Check authentication and authorization - user must be league admin or admin of one of the teams
    const userId = await requireUserId();
    
    // Import league actions for authorization helpers
    const { verifyLeagueAdmin, verifyTeamAdminInLeague } = await import("@/lib/actions/league");
    
    const isLeagueAdmin = await verifyLeagueAdmin(validated.leagueId, userId);
    const isHomeTeamAdmin = await verifyTeamAdminInLeague(validated.homeTeamId, validated.leagueId, userId);
    const isAwayTeamAdmin = await verifyTeamAdminInLeague(validated.awayTeamId, validated.leagueId, userId);

    if (!isLeagueAdmin && !isHomeTeamAdmin && !isAwayTeamAdmin) {
      return {
        success: false,
        error: "Unauthorized - you must be a league admin or admin of one of the teams",
      };
    }

    // Verify both teams exist and belong to the league
    const teams = await prisma.team.findMany({
      where: {
        id: { in: [validated.homeTeamId, validated.awayTeamId] },
        leagueId: validated.leagueId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (teams.length !== 2) {
      return {
        success: false,
        error: "One or both teams not found or do not belong to this league",
      };
    }

    const homeTeam = teams.find(t => t.id === validated.homeTeamId)!;
    const awayTeam = teams.find(t => t.id === validated.awayTeamId)!;

    // Check for scheduling conflicts
    const conflicts = await detectSchedulingConflicts(validated);

    if (conflicts.length > 0 && !validated.overrideConflicts) {
      // Generate alternative time suggestions
      const suggestions = await generateAlternativeTimeSlots(validated);
      
      return {
        success: false,
        error: "Scheduling conflicts detected",
        details: { 
          conflicts,
          suggestions,
          canOverride: isLeagueAdmin, // Only league admins can override conflicts
        },
      };
    }

    // Get all team members from both teams to initialize RSVPs
    const allTeamMembers = await prisma.teamMember.findMany({
      where: {
        teamId: { in: [validated.homeTeamId, validated.awayTeamId] },
      },
      select: {
        userId: true,
      },
    });

    // Create the inter-team game event
    const event = await prisma.event.create({
      data: {
        type: "GAME",
        title: validated.title,
        startAt: validated.startAt,
        location: validated.location,
        notes: validated.notes || null,
        leagueId: validated.leagueId,
        teamId: validated.homeTeamId, // Primary team for backward compatibility
        homeTeamId: validated.homeTeamId,
        awayTeamId: validated.awayTeamId,
        rsvps: {
          create: allTeamMembers.map((member: { userId: string }) => ({
            userId: member.userId,
            status: "NO_RESPONSE",
          })),
        },
      },
      select: {
        id: true,
        title: true,
        startAt: true,
        location: true,
        notes: true,
      },
    });

    // Revalidate relevant pages
    revalidatePath("/calendar");
    revalidatePath("/events");
    revalidatePath(`/league/${validated.leagueId}/schedule`);

    // Send email notifications to both teams (async, don't block response)
    sendEventNotifications(event.id, "created").catch((error) => {
      console.error("Failed to send inter-team game notification emails:", error);
    });

    return {
      success: true,
      data: {
        ...event,
        homeTeam,
        awayTeam,
      },
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

    console.error("Error creating inter-team game:", error);

    return {
      success: false,
      error: "Failed to create inter-team game. Please try again.",
    };
  }
}

/**
 * Detect scheduling conflicts for inter-team games
 */
async function detectSchedulingConflicts(
  gameData: CreateInterTeamGameInput
): Promise<Array<{
  teamId: string;
  teamName: string;
  conflictingEvent: {
    id: string;
    title: string;
    startAt: Date;
  };
}>> {
  const conflicts: Array<{
    teamId: string;
    teamName: string;
    conflictingEvent: {
      id: string;
      title: string;
      startAt: Date;
    };
  }> = [];

  // Define conflict window (2 hours before and after the game)
  const conflictWindowStart = new Date(gameData.startAt.getTime() - 2 * 60 * 60 * 1000);
  const conflictWindowEnd = new Date(gameData.startAt.getTime() + 2 * 60 * 60 * 1000);

  // Check for conflicts for both teams
  const conflictingEvents = await prisma.event.findMany({
    where: {
      OR: [
        { teamId: gameData.homeTeamId },
        { teamId: gameData.awayTeamId },
        { homeTeamId: gameData.homeTeamId },
        { awayTeamId: gameData.homeTeamId },
        { homeTeamId: gameData.awayTeamId },
        { awayTeamId: gameData.awayTeamId },
      ],
      startAt: {
        gte: conflictWindowStart,
        lte: conflictWindowEnd,
      },
    },
    include: {
      team: {
        select: {
          id: true,
          name: true,
        },
      },
      homeTeam: {
        select: {
          id: true,
          name: true,
        },
      },
      awayTeam: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  // Process conflicts for each team
  for (const event of conflictingEvents) {
    // Check if home team has conflict
    if (event.teamId === gameData.homeTeamId || 
        event.homeTeamId === gameData.homeTeamId || 
        event.awayTeamId === gameData.homeTeamId) {
      const homeTeam = await prisma.team.findUnique({
        where: { id: gameData.homeTeamId },
        select: { name: true },
      });
      
      if (homeTeam) {
        conflicts.push({
          teamId: gameData.homeTeamId,
          teamName: homeTeam.name,
          conflictingEvent: {
            id: event.id,
            title: event.title,
            startAt: event.startAt,
          },
        });
      }
    }

    // Check if away team has conflict
    if (event.teamId === gameData.awayTeamId || 
        event.homeTeamId === gameData.awayTeamId || 
        event.awayTeamId === gameData.awayTeamId) {
      const awayTeam = await prisma.team.findUnique({
        where: { id: gameData.awayTeamId },
        select: { name: true },
      });
      
      if (awayTeam) {
        conflicts.push({
          teamId: gameData.awayTeamId,
          teamName: awayTeam.name,
          conflictingEvent: {
            id: event.id,
            title: event.title,
            startAt: event.startAt,
          },
        });
      }
    }
  }

  // Remove duplicates
  const uniqueConflicts = conflicts.filter((conflict, index, self) =>
    index === self.findIndex(c => 
      c.teamId === conflict.teamId && 
      c.conflictingEvent.id === conflict.conflictingEvent.id
    )
  );

  return uniqueConflicts;
}

/**
 * Generate alternative time slots when conflicts are detected
 */
async function generateAlternativeTimeSlots(
  gameData: CreateInterTeamGameInput
): Promise<Array<{
  startAt: Date;
  reason: string;
}>> {
  const suggestions: Array<{
    startAt: Date;
    reason: string;
  }> = [];

  const originalDate = new Date(gameData.startAt);
  
  // Generate suggestions for the same day at different times
  const timeSlots = [
    { hour: 9, minute: 0, label: "9:00 AM" },
    { hour: 11, minute: 0, label: "11:00 AM" },
    { hour: 14, minute: 0, label: "2:00 PM" },
    { hour: 16, minute: 0, label: "4:00 PM" },
    { hour: 18, minute: 0, label: "6:00 PM" },
    { hour: 19, minute: 30, label: "7:30 PM" },
  ];

  // Check same day alternatives
  for (const slot of timeSlots) {
    const alternativeTime = new Date(originalDate);
    alternativeTime.setHours(slot.hour, slot.minute, 0, 0);
    
    // Skip if it's the same time as requested
    if (alternativeTime.getTime() === originalDate.getTime()) continue;
    
    // Skip if it's in the past
    if (alternativeTime <= new Date()) continue;
    
    // Check if this time has conflicts
    const testGameData = { ...gameData, startAt: alternativeTime };
    const conflicts = await detectSchedulingConflicts(testGameData);
    
    if (conflicts.length === 0) {
      suggestions.push({
        startAt: alternativeTime,
        reason: `Same day at ${slot.label}`,
      });
    }
  }

  // Generate suggestions for the next few days
  for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
    const alternativeDate = new Date(originalDate);
    alternativeDate.setDate(alternativeDate.getDate() + dayOffset);
    
    // Try the same time on different days
    const testGameData = { ...gameData, startAt: alternativeDate };
    const conflicts = await detectSchedulingConflicts(testGameData);
    
    if (conflicts.length === 0) {
      const dayName = alternativeDate.toLocaleDateString('en-US', { weekday: 'long' });
      suggestions.push({
        startAt: alternativeDate,
        reason: `${dayName} at same time`,
      });
      
      // Limit to 3 day suggestions to avoid overwhelming the user
      if (suggestions.filter(s => s.reason.includes('at same time')).length >= 3) {
        break;
      }
    }
  }

  // Limit total suggestions to 5
  return suggestions.slice(0, 5);
}
