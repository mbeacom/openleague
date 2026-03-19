"use server";

import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { findVenueConflicts } from "@/lib/actions/venues";
import {
  createGameScheduleSchema,
  publishScheduleSchema,
  type CreateGameScheduleInput,
  type PublishScheduleInput,
} from "@/lib/utils/validation";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

/**
 * Create a new game schedule (DRAFT status)
 */
export async function createGameSchedule(
  input: CreateGameScheduleInput
): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    const validated = createGameScheduleSchema.parse(input);
    const userId = await requireUserId();

    // Verify authorization: league admin or team admin
    if (validated.leagueId) {
      const leagueUser = await prisma.leagueUser.findUnique({
        where: { userId_leagueId: { userId, leagueId: validated.leagueId } },
      });
      if (!leagueUser || leagueUser.role !== "LEAGUE_ADMIN") {
        return { success: false, error: "You must be a league admin to create schedules" };
      }
    } else if (validated.teamId) {
      const membership = await prisma.teamMember.findUnique({
        where: { userId_teamId: { userId, teamId: validated.teamId } },
      });
      if (!membership || membership.role !== "ADMIN") {
        return { success: false, error: "You must be a team admin to create schedules" };
      }
    } else {
      return { success: false, error: "Either leagueId or teamId is required" };
    }

    // Verify all teams exist
    const teams = await prisma.team.findMany({
      where: { id: { in: validated.teamIds } },
      select: { id: true, name: true },
    });
    if (teams.length !== validated.teamIds.length) {
      return { success: false, error: "One or more teams not found" };
    }

    // Verify all venues exist
    const venues = await prisma.venue.findMany({
      where: { id: { in: validated.venueIds } },
      select: { id: true, name: true },
    });
    if (venues.length !== validated.venueIds.length) {
      return { success: false, error: "One or more venues not found" };
    }

    // Create schedule
    const schedule = await prisma.gameSchedule.create({
      data: {
        name: validated.name,
        seasonName: validated.seasonName || null,
        startDate: validated.startDate,
        endDate: validated.endDate,
        roundRobin: validated.roundRobin,
        rounds: validated.rounds,
        notes: validated.notes || null,
        leagueId: validated.leagueId || null,
        teamId: validated.teamId || null,
        createdById: userId,
      },
    });

    // Generate round-robin games
    const generationResult = await generateRoundRobinGames(
      schedule.id,
      validated.teamIds,
      validated.venueIds,
      validated.startDate,
      validated.endDate,
      validated.rounds,
      validated.gameDurationMinutes,
      validated.dayOfWeek,
      validated.preferredStartTime,
      validated.leagueId || null
    );

    revalidatePath("/schedules");

    if (!generationResult.success) {
      // Schedule was created but game generation failed — clean up
      await prisma.gameSchedule.delete({ where: { id: schedule.id } });
      return { success: false, error: generationResult.error };
    }

    return {
      success: true,
      data: { id: schedule.id, name: schedule.name },
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    console.error("Error creating game schedule:", error);
    return { success: false, error: "Failed to create schedule. Please try again." };
  }
}

/**
 * Generate round-robin game matchups and create events
 */
async function generateRoundRobinGames(
  scheduleId: string,
  teamIds: string[],
  venueIds: string[],
  startDate: Date,
  endDate: Date,
  rounds: number,
  gameDurationMinutes: number,
  dayOfWeek?: number,
  preferredStartTime?: string,
  leagueId?: string | null
): Promise<ActionResult<{ gamesCreated: number; conflicts: string[] }>> {
  // Generate all unique pairings
  const pairings: Array<[string, string]> = [];
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      pairings.push([teamIds[i], teamIds[j]]);
    }
  }

  // Multiply by rounds
  const allMatchups: Array<[string, string]> = [];
  for (let r = 0; r < rounds; r++) {
    // Alternate home/away each round
    for (const [a, b] of pairings) {
      if (r % 2 === 0) {
        allMatchups.push([a, b]);
      } else {
        allMatchups.push([b, a]);
      }
    }
  }

  // Get team names for event titles
  const teams = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    select: { id: true, name: true },
  });
  const teamNameMap = new Map(teams.map((t) => [t.id, t.name]));

  // Get venue names
  const venues = await prisma.venue.findMany({
    where: { id: { in: venueIds } },
    select: { id: true, name: true },
  });

  // Pre-fetch all team members to avoid N+1 queries in the loop
  const allTeamMembers = await prisma.teamMember.findMany({
    where: { teamId: { in: teamIds } },
    select: { teamId: true, userId: true },
  });
  const teamMembersMap = new Map<string, string[]>();
  for (const member of allTeamMembers) {
    const existing = teamMembersMap.get(member.teamId) || [];
    existing.push(member.userId);
    teamMembersMap.set(member.teamId, existing);
  }

  // Distribute games across the date range
  const gameSlots = generateTimeSlots(
    startDate,
    endDate,
    allMatchups.length,
    dayOfWeek,
    preferredStartTime
  );

  const conflicts: string[] = [];
  let gamesCreated = 0;

  for (let i = 0; i < allMatchups.length; i++) {
    const [homeTeamId, awayTeamId] = allMatchups[i];
    const slot = gameSlots[i];
    if (!slot) break; // Ran out of time slots

    const venueId = venueIds[i % venueIds.length];
    const venue = venues.find((v) => v.id === venueId);
    const endAt = new Date(slot.getTime() + gameDurationMinutes * 60 * 1000);

    // Check venue conflicts
    const venueConflicts = await findVenueConflicts(venueId, slot, endAt);
    if (venueConflicts.length > 0) {
      conflicts.push(
        `${teamNameMap.get(homeTeamId)} vs ${teamNameMap.get(awayTeamId)} at ${slot.toISOString()}: venue conflict with ${venueConflicts[0].title}`
      );
      // Still create the game but note the conflict
    }

    const homeName = teamNameMap.get(homeTeamId) || "Home";
    const awayName = teamNameMap.get(awayTeamId) || "Away";
    const roundNumber = Math.floor(i / pairings.length) + 1;

    // Get team members from pre-fetched map
    const homeMembers = teamMembersMap.get(homeTeamId) || [];
    const awayMembers = teamMembersMap.get(awayTeamId) || [];
    const uniqueUserIds = [...new Set([...homeMembers, ...awayMembers])];

    // Create event and schedule game in a transaction
    await prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          type: "GAME",
          title: `${homeName} vs ${awayName}`,
          startAt: slot,
          endAt,
          location: venue?.name || "TBD",
          venueId,
          opponent: awayName,
          teamId: homeTeamId,
          homeTeamId,
          awayTeamId,
          leagueId: leagueId || null,
          rsvps: {
            create: uniqueUserIds.map((userId) => ({
              userId,
              status: "NO_RESPONSE",
            })),
          },
        },
      });

      await tx.scheduleGame.create({
        data: {
          roundNumber,
          gameNumber: (i % pairings.length) + 1,
          gameScheduleId: scheduleId,
          eventId: event.id,
        },
      });
    });

    gamesCreated++;
  }

  return {
    success: true,
    data: { gamesCreated, conflicts },
  };
}

/**
 * Generate time slots for games across a date range
 */
function generateTimeSlots(
  startDate: Date,
  endDate: Date,
  count: number,
  dayOfWeek?: number,
  preferredStartTime?: string
): Date[] {
  const slots: Date[] = [];
  const current = new Date(startDate);

  // Parse preferred time or default to 7:00 PM
  let startHour = 19;
  let startMinute = 0;
  if (preferredStartTime) {
    const parts = preferredStartTime.split(":");
    startHour = parseInt(parts[0], 10);
    startMinute = parseInt(parts[1], 10);
  }

  while (slots.length < count && current <= endDate) {
    // If dayOfWeek specified, skip to the right day
    if (dayOfWeek !== undefined) {
      while (current.getDay() !== dayOfWeek && current <= endDate) {
        current.setDate(current.getDate() + 1);
      }
    }

    if (current > endDate) break;

    const slot = new Date(current);
    slot.setHours(startHour, startMinute, 0, 0);

    // Only add if the slot is after startDate
    if (slot >= startDate) {
      slots.push(new Date(slot));
    }

    // Move to next day (or next week if dayOfWeek is set)
    current.setDate(current.getDate() + (dayOfWeek !== undefined ? 7 : 1));
  }

  return slots;
}

/**
 * Publish a schedule (change status from DRAFT to PUBLISHED)
 */
export async function publishSchedule(
  input: PublishScheduleInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = publishScheduleSchema.parse(input);
    const userId = await requireUserId();

    const schedule = await prisma.gameSchedule.findUnique({
      where: { id: validated.gameScheduleId },
      include: { games: { include: { event: true } } },
    });

    if (!schedule) {
      return { success: false, error: "Schedule not found" };
    }

    if (schedule.createdById !== userId) {
      // Check if user is league admin or team admin
      let hasPermission = false;
      if (schedule.leagueId) {
        const leagueUser = await prisma.leagueUser.findUnique({
          where: { userId_leagueId: { userId, leagueId: schedule.leagueId } },
        });
        hasPermission = leagueUser?.role === "LEAGUE_ADMIN";
      }
      if (!hasPermission && schedule.teamId) {
        const membership = await prisma.teamMember.findUnique({
          where: { userId_teamId: { userId, teamId: schedule.teamId } },
        });
        hasPermission = membership?.role === "ADMIN";
      }
      if (!hasPermission) {
        return { success: false, error: "You don't have permission to publish this schedule" };
      }
    }

    if (schedule.status !== "DRAFT") {
      return { success: false, error: `Schedule is already ${schedule.status.toLowerCase()}` };
    }

    if (schedule.games.length === 0) {
      return { success: false, error: "Cannot publish a schedule with no games" };
    }

    await prisma.gameSchedule.update({
      where: { id: validated.gameScheduleId },
      data: { status: "PUBLISHED" },
    });

    revalidatePath("/schedules");
    revalidatePath(`/schedules/${validated.gameScheduleId}`);
    revalidatePath("/calendar");
    revalidatePath("/events");

    return { success: true, data: { id: validated.gameScheduleId } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to publish schedule. Please try again." };
  }
}

/**
 * Archive a schedule
 */
export async function archiveSchedule(
  scheduleId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const userId = await requireUserId();

    const schedule = await prisma.gameSchedule.findUnique({
      where: { id: scheduleId },
    });
    if (!schedule) {
      return { success: false, error: "Schedule not found" };
    }

    // Check permission: creator, league admin, or team admin
    if (schedule.createdById !== userId) {
      let hasPermission = false;
      if (schedule.leagueId) {
        const leagueUser = await prisma.leagueUser.findUnique({
          where: { userId_leagueId: { userId, leagueId: schedule.leagueId } },
        });
        hasPermission = leagueUser?.role === "LEAGUE_ADMIN";
      }
      if (!hasPermission && schedule.teamId) {
        const membership = await prisma.teamMember.findUnique({
          where: { userId_teamId: { userId, teamId: schedule.teamId } },
        });
        hasPermission = membership?.role === "ADMIN";
      }
      if (!hasPermission) {
        return { success: false, error: "You don't have permission to archive this schedule" };
      }
    }

    await prisma.gameSchedule.update({
      where: { id: scheduleId },
      data: { status: "ARCHIVED" },
    });

    revalidatePath("/schedules");
    revalidatePath(`/schedules/${scheduleId}`);

    return { success: true, data: { id: scheduleId } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to archive schedule." };
  }
}

/**
 * Delete a DRAFT schedule and its generated events
 */
export async function deleteSchedule(
  scheduleId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const userId = await requireUserId();

    const schedule = await prisma.gameSchedule.findUnique({
      where: { id: scheduleId },
      include: { games: { select: { eventId: true } } },
    });
    if (!schedule) {
      return { success: false, error: "Schedule not found" };
    }

    // Check permission: creator, league admin, or team admin
    if (schedule.createdById !== userId) {
      let hasPermission = false;
      if (schedule.leagueId) {
        const leagueUser = await prisma.leagueUser.findUnique({
          where: { userId_leagueId: { userId, leagueId: schedule.leagueId } },
        });
        hasPermission = leagueUser?.role === "LEAGUE_ADMIN";
      }
      if (!hasPermission && schedule.teamId) {
        const membership = await prisma.teamMember.findUnique({
          where: { userId_teamId: { userId, teamId: schedule.teamId } },
        });
        hasPermission = membership?.role === "ADMIN";
      }
      if (!hasPermission) {
        return { success: false, error: "You don't have permission to delete this schedule" };
      }
    }

    if (schedule.status === "PUBLISHED") {
      return { success: false, error: "Cannot delete a published schedule. Archive it instead." };
    }

    // Delete schedule (cascades to ScheduleGame records)
    // Also delete the associated events
    const eventIds = schedule.games.map((g) => g.eventId);

    await prisma.$transaction(async (tx) => {
      await tx.gameSchedule.delete({ where: { id: scheduleId } });
      if (eventIds.length > 0) {
        await tx.event.deleteMany({ where: { id: { in: eventIds } } });
      }
    });

    revalidatePath("/schedules");
    revalidatePath("/calendar");
    revalidatePath("/events");

    return { success: true, data: { id: scheduleId } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { success: false, error: "Failed to delete schedule." };
  }
}

/**
 * Get a game schedule with all its games and event details
 */
export async function getGameSchedule(scheduleId: string) {
  await requireUserId();

  const schedule = await prisma.gameSchedule.findUnique({
    where: { id: scheduleId },
    include: {
      createdBy: { select: { id: true, name: true } },
      league: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
      games: {
        include: {
          event: {
            include: {
              venue: { select: { id: true, name: true } },
              homeTeam: { select: { id: true, name: true } },
              awayTeam: { select: { id: true, name: true } },
              team: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ roundNumber: "asc" }, { gameNumber: "asc" }],
      },
    },
  });

  return schedule;
}

/**
 * List schedules for a league or team context
 */
export async function getSchedulesForContext(filters?: {
  leagueId?: string;
  teamId?: string;
  status?: string;
}) {
  await requireUserId();

  const where: Record<string, unknown> = {};

  if (filters?.leagueId) {
    where.leagueId = filters.leagueId;
  }
  if (filters?.teamId) {
    // Show schedules owned by this team, or where this team participates
    where.OR = [
      { teamId: filters.teamId },
      {
        games: {
          some: {
            event: {
              OR: [
                { teamId: filters.teamId },
                { homeTeamId: filters.teamId },
                { awayTeamId: filters.teamId },
              ],
            },
          },
        },
      },
    ];
  }
  if (filters?.status) {
    where.status = filters.status;
  }

  const schedules = await prisma.gameSchedule.findMany({
    where,
    include: {
      createdBy: { select: { id: true, name: true } },
      league: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
      _count: { select: { games: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return schedules;
}
