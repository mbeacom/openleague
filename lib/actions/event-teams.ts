"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUserId, isEventManager, requireEventManager } from "@/lib/auth/session";
import { canViewSignupEvent } from "@/lib/utils/event-access";
import type { ActionResult } from "@/lib/actions/venue-organizations";
import {
  eventTeamSchema,
  eventTeamCommandSchema,
  assignToEventTeamSchema,
  removeTeamAssignmentSchema,
  setFloaterSchema,
  eventGameSchema,
  eventGameCommandSchema,
  setGameRotationSchema,
  signupEventCommandSchema,
  type EventTeamInput,
  type EventTeamCommandInput,
  type AssignToEventTeamInput,
  type RemoveTeamAssignmentInput,
  type SetFloaterInput,
  type EventGameInput,
  type EventGameCommandInput,
  type SetGameRotationInput,
  type SignupEventCommandInput,
  recordGameResultSchema,
  type RecordGameResultInput,
} from "@/lib/utils/validation";
import { sendEventTeamsUpdateEmail } from "@/lib/email/templates";
import { isStatsEligible } from "@/lib/utils/age-level";
import { computeStandings } from "@/lib/utils/event-standings";
import { STATS_MIN_AGE_LEVEL } from "@/lib/env";
import type { AgeClassification } from "@prisma/client";
import { logSignupEventActivity } from "@/lib/utils/event-activity";

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function handleActionError(error: unknown, fallback: string): ActionResult<never> {
  if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
    throw error;
  }
  if (error instanceof Error && error.message.startsWith("Unauthorized")) {
    return { success: false, error: error.message };
  }
  console.error(fallback, error);
  return { success: false, error: fallback };
}

/** Create or rename an event team (Red, White, House Gold…). */
export async function upsertEventTeam(
  input: EventTeamInput
): Promise<ActionResult<{ teamId: string }>> {
  try {
    const validated = eventTeamSchema.parse(input);
    await requireEventManager(validated.eventId);

    const data = {
      name: validated.name,
      colorHex: validated.colorHex || null,
      notes: validated.notes || null,
    };

    if (validated.teamId) {
      const existing = await prisma.eventTeam.findFirst({
        where: { id: validated.teamId, eventId: validated.eventId },
        select: { id: true },
      });
      if (!existing) {
        return { success: false, error: "Team not found for this event" };
      }
      await prisma.eventTeam.update({ where: { id: existing.id }, data });
      revalidatePath(`/signup-events/${validated.eventId}`);
      return { success: true, data: { teamId: existing.id } };
    }

    const team = await prisma.eventTeam.create({
      data: { ...data, eventId: validated.eventId },
      select: { id: true },
    });
    revalidatePath(`/signup-events/${validated.eventId}`);
    return { success: true, data: { teamId: team.id } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return { success: false, error: "A team with that name already exists for this event." };
    }
    return handleActionError(error, "Failed to save the team.");
  }
}

/** Delete an event team. Blocked while games reference it; assignments cascade. */
export async function deleteEventTeam(
  input: EventTeamCommandInput
): Promise<ActionResult<{ teamId: string }>> {
  try {
    const { teamId } = eventTeamCommandSchema.parse(input);

    const team = await prisma.eventTeam.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        eventId: true,
        _count: { select: { homeGames: true, awayGames: true } },
      },
    });
    if (!team) {
      return { success: false, error: "Team not found" };
    }
    await requireEventManager(team.eventId);

    if (team._count.homeGames + team._count.awayGames > 0) {
      return { success: false, error: "Delete this team's games first." };
    }

    await prisma.eventTeam.delete({ where: { id: team.id } });
    revalidatePath(`/signup-events/${team.eventId}`);
    return { success: true, data: { teamId: team.id } };
  } catch (error) {
    return handleActionError(error, "Failed to delete the team.");
  }
}

/**
 * Assign confirmed participants to a team as their primary assignment
 * (at most one per participant — reassignment moves them). After teams are
 * posted, affected registrants are notified.
 */
export async function assignToEventTeam(
  input: AssignToEventTeamInput
): Promise<ActionResult<{ assigned: number }>> {
  try {
    const validated = assignToEventTeamSchema.parse(input);

    const team = await prisma.eventTeam.findUnique({
      where: { id: validated.eventTeamId },
      select: {
        id: true,
        name: true,
        eventId: true,
        event: { select: { id: true, title: true, teamsPublishedAt: true } },
      },
    });
    if (!team) {
      return { success: false, error: "Team not found" };
    }
    const userId = await requireEventManager(team.eventId);

    const registrations = await prisma.eventRegistration.findMany({
      where: {
        id: { in: validated.registrationIds },
        eventId: team.eventId,
        status: "CONFIRMED",
      },
      select: { id: true, registrant: { select: { email: true, name: true } } },
    });
    if (registrations.length !== validated.registrationIds.length) {
      return {
        success: false,
        error: "Only confirmed participants of this event can be assigned to teams.",
      };
    }

    for (const registration of registrations) {
      await prisma.eventTeamAssignment.upsert({
        where: { registrationId: registration.id },
        create: {
          registrationId: registration.id,
          eventTeamId: team.id,
          assignedById: userId,
        },
        update: { eventTeamId: team.id, assignedById: userId },
      });
    }

    // Post-publish roster changes notify the affected families (FR-033).
    if (team.event.teamsPublishedAt) {
      const recipients = [
        ...new Map(
          registrations.map((registration) => [
            registration.registrant.email,
            { email: registration.registrant.email, name: registration.registrant.name },
          ])
        ).values(),
      ];
      try {
        await sendEventTeamsUpdateEmail({
          recipients,
          eventTitle: team.event.title,
          eventId: team.event.id,
          isInitialPublish: false,
        });
      } catch (emailError) {
        console.error("Failed to send assignment-change notification:", emailError);
      }
    }

    revalidatePath(`/signup-events/${team.eventId}`);
    revalidatePath(`/events/${team.eventId}`);
    return { success: true, data: { assigned: registrations.length } };
  } catch (error) {
    return handleActionError(error, "Failed to assign participants.");
  }
}

/** Remove a participant's primary team assignment. */
export async function removeTeamAssignment(
  input: RemoveTeamAssignmentInput
): Promise<ActionResult<{ registrationId: string }>> {
  try {
    const { registrationId } = removeTeamAssignmentSchema.parse(input);

    const assignment = await prisma.eventTeamAssignment.findUnique({
      where: { registrationId },
      select: { id: true, registration: { select: { eventId: true } } },
    });
    if (!assignment) {
      return { success: false, error: "This participant has no team assignment." };
    }
    await requireEventManager(assignment.registration.eventId);

    await prisma.eventTeamAssignment.delete({ where: { id: assignment.id } });
    revalidatePath(`/signup-events/${assignment.registration.eventId}`);
    return { success: true, data: { registrationId } };
  } catch (error) {
    return handleActionError(error, "Failed to remove the assignment.");
  }
}

/** Flag a participant as a floater who may rotate through multiple games. */
export async function setFloater(
  input: SetFloaterInput
): Promise<ActionResult<{ registrationId: string; isFloater: boolean }>> {
  try {
    const validated = setFloaterSchema.parse(input);

    const registration = await prisma.eventRegistration.findUnique({
      where: { id: validated.registrationId },
      select: { id: true, eventId: true },
    });
    if (!registration) {
      return { success: false, error: "Registration not found" };
    }
    await requireEventManager(registration.eventId);

    await prisma.eventRegistration.update({
      where: { id: registration.id },
      data: { isFloater: validated.isFloater },
    });

    revalidatePath(`/signup-events/${registration.eventId}`);
    return {
      success: true,
      data: { registrationId: registration.id, isFloater: validated.isFloater },
    };
  } catch (error) {
    return handleActionError(error, "Failed to update the floater flag.");
  }
}

/**
 * Create or update a game between two event teams, optionally on a venue
 * surface (full ice, half ice, or a cross-ice zone). Returns soft warnings —
 * e.g. a game outside the event window — rather than blocking.
 */
export async function upsertEventGame(
  input: EventGameInput
): Promise<ActionResult<{ gameId: string; warnings: string[] }>> {
  try {
    const validated = eventGameSchema.parse(input);
    await requireEventManager(validated.eventId);

    const event = await prisma.signupEvent.findUnique({
      where: { id: validated.eventId },
      select: { id: true, startAt: true, endAt: true, venueId: true },
    });
    if (!event) {
      return { success: false, error: "Event not found" };
    }

    const teams = await prisma.eventTeam.findMany({
      where: { id: { in: [validated.homeTeamId, validated.awayTeamId] }, eventId: validated.eventId },
      select: { id: true },
    });
    if (teams.length !== 2) {
      return { success: false, error: "Both teams must belong to this event." };
    }

    if (validated.surfaceId) {
      const surface = await prisma.iceSurface.findFirst({
        where: { id: validated.surfaceId, venueId: event.venueId ?? undefined },
        select: { id: true },
      });
      if (!surface) {
        return { success: false, error: "That surface doesn't belong to this event's venue." };
      }
    }

    const warnings: string[] = [];
    if (validated.startAt < event.startAt || validated.endAt > event.endAt) {
      warnings.push("This game falls outside the event's scheduled time window.");
    }

    const data = {
      name: validated.name || null,
      homeTeamId: validated.homeTeamId,
      awayTeamId: validated.awayTeamId,
      startAt: validated.startAt,
      endAt: validated.endAt,
      surfaceId: validated.surfaceId || null,
      iceUsage: validated.iceUsage,
      zoneLabel: validated.zoneLabel || null,
      notes: validated.notes || null,
    };

    let gameId: string;
    if (validated.gameId) {
      const existing = await prisma.eventGame.findFirst({
        where: { id: validated.gameId, eventId: validated.eventId },
        select: { id: true },
      });
      if (!existing) {
        return { success: false, error: "Game not found for this event" };
      }
      await prisma.eventGame.update({ where: { id: existing.id }, data });
      gameId = existing.id;
    } else {
      const game = await prisma.eventGame.create({
        data: { ...data, eventId: validated.eventId },
        select: { id: true },
      });
      gameId = game.id;
    }

    revalidatePath(`/signup-events/${validated.eventId}`);
    revalidatePath(`/events/${validated.eventId}`);
    return { success: true, data: { gameId, warnings } };
  } catch (error) {
    return handleActionError(error, "Failed to save the game.");
  }
}

/** Delete a game (rotation entries and stats cascade). */
export async function deleteEventGame(
  input: EventGameCommandInput
): Promise<ActionResult<{ gameId: string }>> {
  try {
    const { gameId } = eventGameCommandSchema.parse(input);

    const game = await prisma.eventGame.findUnique({
      where: { id: gameId },
      select: { id: true, eventId: true },
    });
    if (!game) {
      return { success: false, error: "Game not found" };
    }
    await requireEventManager(game.eventId);

    await prisma.eventGame.delete({ where: { id: game.id } });
    revalidatePath(`/signup-events/${game.eventId}`);
    return { success: true, data: { gameId: game.id } };
  } catch (error) {
    return handleActionError(error, "Failed to delete the game.");
  }
}

/**
 * Replace a game's rotation list — the explicit per-game participants beyond
 * the two primary rosters. Floaters (e.g. Mite 3 players) may appear in any
 * number of games on either side; double-booking a non-floater into
 * overlapping games returns warnings without blocking (organizer's call).
 */
export async function setGameRotation(
  input: SetGameRotationInput
): Promise<ActionResult<{ gameId: string; warnings: string[] }>> {
  try {
    const validated = setGameRotationSchema.parse(input);

    const game = await prisma.eventGame.findUnique({
      where: { id: validated.gameId },
      select: {
        id: true,
        eventId: true,
        startAt: true,
        endAt: true,
        homeTeamId: true,
        awayTeamId: true,
      },
    });
    if (!game) {
      return { success: false, error: "Game not found" };
    }
    await requireEventManager(game.eventId);

    const invalidSide = validated.entries.find(
      (entry) => entry.eventTeamId !== game.homeTeamId && entry.eventTeamId !== game.awayTeamId
    );
    if (invalidSide) {
      return { success: false, error: "Rotation entries must skate for one of this game's two teams." };
    }

    const registrationIds = validated.entries.map((entry) => entry.registrationId);
    const registrations = await prisma.eventRegistration.findMany({
      where: { id: { in: registrationIds }, eventId: game.eventId, status: "CONFIRMED" },
      select: {
        id: true,
        participantName: true,
        isFloater: true,
        teamAssignment: { select: { eventTeamId: true } },
        gameParticipations: {
          where: { gameId: { not: game.id } },
          select: { game: { select: { startAt: true, endAt: true, name: true } } },
        },
      },
    });
    if (registrations.length !== registrationIds.length) {
      return {
        success: false,
        error: "Only confirmed participants of this event can be added to a rotation.",
      };
    }

    const warnings: string[] = [];
    for (const entry of validated.entries) {
      const registration = registrations.find((candidate) => candidate.id === entry.registrationId);
      if (!registration || registration.isFloater) continue;

      const primaryTeamId = registration.teamAssignment?.eventTeamId ?? null;
      if (primaryTeamId && primaryTeamId !== entry.eventTeamId) {
        warnings.push(
          `${registration.participantName} isn't flagged as a floater but is rotating onto a different team.`
        );
      }
      const conflict = registration.gameParticipations.find((participation) =>
        overlaps(game.startAt, game.endAt, participation.game.startAt, participation.game.endAt)
      );
      if (conflict) {
        warnings.push(
          `${registration.participantName} is already in an overlapping game${conflict.game.name ? ` (${conflict.game.name})` : ""}.`
        );
      }
    }

    await prisma.$transaction([
      prisma.eventGameParticipant.deleteMany({ where: { gameId: game.id } }),
      ...(validated.entries.length > 0
        ? [
            prisma.eventGameParticipant.createMany({
              data: validated.entries.map((entry) => ({
                gameId: game.id,
                registrationId: entry.registrationId,
                eventTeamId: entry.eventTeamId,
              })),
            }),
          ]
        : []),
    ]);

    revalidatePath(`/signup-events/${game.eventId}`);
    revalidatePath(`/events/${game.eventId}`);
    return { success: true, data: { gameId: game.id, warnings } };
  } catch (error) {
    return handleActionError(error, "Failed to update the rotation.");
  }
}

/** Post teams/games to participants and notify every assigned family. */
export async function publishEventTeams(
  input: SignupEventCommandInput
): Promise<ActionResult<{ eventId: string; notified: number }>> {
  try {
    const { eventId } = signupEventCommandSchema.parse(input);
    const userId = await requireEventManager(eventId);

    const event = await prisma.signupEvent.findUnique({
      where: { id: eventId },
      select: { id: true, title: true, teamsPublishedAt: true },
    });
    if (!event) {
      return { success: false, error: "Event not found" };
    }

    const assignments = await prisma.eventTeamAssignment.findMany({
      where: { eventTeam: { eventId } },
      select: { registration: { select: { registrant: { select: { email: true, name: true } } } } },
    });
    if (assignments.length === 0) {
      return { success: false, error: "Assign participants to teams before posting." };
    }

    await prisma.signupEvent.update({
      where: { id: eventId },
      data: { teamsPublishedAt: new Date() },
    });

    const recipients = [
      ...new Map(
        assignments.map((assignment) => [
          assignment.registration.registrant.email,
          {
            email: assignment.registration.registrant.email,
            name: assignment.registration.registrant.name,
          },
        ])
      ).values(),
    ];
    try {
      await sendEventTeamsUpdateEmail({
        recipients,
        eventTitle: event.title,
        eventId,
        isInitialPublish: !event.teamsPublishedAt,
      });
    } catch (emailError) {
      console.error("Failed to send teams-published notifications:", emailError);
    }

    await logSignupEventActivity({
      eventId,
      actorId: userId,
      action: "teams.published",
      summary: `Posted teams to ${recipients.length} famil${recipients.length === 1 ? "y" : "ies"}`,
    });

    revalidatePath(`/signup-events/${eventId}`);
    revalidatePath(`/events/${eventId}`);
    return { success: true, data: { eventId, notified: recipients.length } };
  } catch (error) {
    return handleActionError(error, "Failed to post teams.");
  }
}

export type EventTeamsBoard = Awaited<ReturnType<typeof getEventTeamsBoard>>;

/** Manager view: teams with rosters and counts, unassigned pool, games, surfaces. */
export async function getEventTeamsBoard(eventId: string) {
  await requireEventManager(eventId);

  const [event, teams, unassigned, games] = await Promise.all([
    prisma.signupEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        startAt: true,
        endAt: true,
        teamsPublishedAt: true,
        ageClassification: true,
        category: true,
        venue: { select: { id: true, name: true, surfaces: { select: { id: true, name: true } } } },
      },
    }),
    prisma.eventTeam.findMany({
      where: { eventId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        colorHex: true,
        notes: true,
        assignments: {
          select: {
            registration: {
              select: {
                id: true,
                participantName: true,
                isFloater: true,
                slot: { select: { name: true } },
                player: { select: { team: { select: { name: true } } } },
              },
            },
          },
        },
      },
    }),
    prisma.eventRegistration.findMany({
      where: { eventId, status: "CONFIRMED", teamAssignment: null },
      orderBy: { participantName: "asc" },
      select: {
        id: true,
        participantName: true,
        isFloater: true,
        slot: { select: { name: true } },
        player: { select: { team: { select: { name: true } } } },
      },
    }),
    prisma.eventGame.findMany({
      where: { eventId },
      orderBy: { startAt: "asc" },
      select: {
        id: true,
        name: true,
        status: true,
        startAt: true,
        endAt: true,
        iceUsage: true,
        zoneLabel: true,
        homeScore: true,
        awayScore: true,
        surface: { select: { id: true, name: true } },
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        participants: {
          select: {
            registrationId: true,
            eventTeamId: true,
            registration: { select: { participantName: true, isFloater: true } },
          },
        },
      },
    }),
  ]);

  const teamsWithCounts = teams.map((team) => ({
    ...team,
    positionCounts: team.assignments.reduce<Record<string, number>>((counts, assignment) => {
      const slotName = assignment.registration.slot.name;
      counts[slotName] = (counts[slotName] ?? 0) + 1;
      return counts;
    }, {}),
  }));

  const statsEligible = event
    ? isStatsEligible(event.ageClassification, STATS_MIN_AGE_LEVEL as AgeClassification)
    : false;
  const gatedGames = games.map((game) => ({
    ...game,
    homeScore: statsEligible ? game.homeScore : null,
    awayScore: statsEligible ? game.awayScore : null,
  }));

  return { event, teams: teamsWithCounts, unassigned, games: gatedGames, statsEligible };
}

export type MyEventAssignments = Awaited<ReturnType<typeof getMyEventAssignments>>;

/**
 * Participant view for the public event page: the signed-in family's team
 * assignments and game times, visible once teams are posted.
 */
export async function getMyEventAssignments(eventId: string) {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const event = await prisma.signupEvent.findUnique({
    where: { id: eventId },
    select: { teamsPublishedAt: true },
  });
  if (!event?.teamsPublishedAt) return null;

  const registrations = await prisma.eventRegistration.findMany({
    where: { eventId, registrantId: userId, status: "CONFIRMED" },
    select: {
      id: true,
      participantName: true,
      isFloater: true,
      teamAssignment: {
        select: { eventTeam: { select: { id: true, name: true, colorHex: true } } },
      },
      gameParticipations: {
        select: {
          eventTeam: { select: { name: true } },
          game: {
            select: {
              id: true,
              name: true,
              startAt: true,
              endAt: true,
              iceUsage: true,
              zoneLabel: true,
              homeTeam: { select: { name: true } },
              awayTeam: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (registrations.length === 0) return null;

  // Games of each participant's primary team (implicit roster) merged with
  // explicit rotation entries.
  const teamIds = [
    ...new Set(
      registrations
        .map((registration) => registration.teamAssignment?.eventTeam.id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const teamGames = teamIds.length
    ? await prisma.eventGame.findMany({
        where: { eventId, OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }] },
        orderBy: { startAt: "asc" },
        select: {
          id: true,
          name: true,
          startAt: true,
          endAt: true,
          iceUsage: true,
          zoneLabel: true,
          homeTeamId: true,
          awayTeamId: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      })
    : [];

  return registrations.map((registration) => {
    const primaryTeam = registration.teamAssignment?.eventTeam ?? null;
    const primaryGames = primaryTeam
      ? teamGames.filter(
          (game) => game.homeTeamId === primaryTeam.id || game.awayTeamId === primaryTeam.id
        )
      : [];
    const rotationGames = registration.gameParticipations.map((participation) => ({
      id: participation.game.id,
      name: participation.game.name,
      startAt: participation.game.startAt,
      endAt: participation.game.endAt,
      iceUsage: participation.game.iceUsage,
      zoneLabel: participation.game.zoneLabel,
      homeTeamName: participation.game.homeTeam.name,
      awayTeamName: participation.game.awayTeam.name,
      playingFor: participation.eventTeam.name,
    }));
    const games = [
      ...primaryGames.map((game) => ({
        id: game.id,
        name: game.name,
        startAt: game.startAt,
        endAt: game.endAt,
        iceUsage: game.iceUsage,
        zoneLabel: game.zoneLabel,
        homeTeamName: game.homeTeam.name,
        awayTeamName: game.awayTeam.name,
        playingFor: primaryTeam?.name ?? "",
      })),
      ...rotationGames.filter(
        (rotation) => !primaryGames.some((primary) => primary.id === rotation.id)
      ),
    ].sort((left, right) => left.startAt.getTime() - right.startAt.getTime());

    return {
      registrationId: registration.id,
      participantName: registration.participantName,
      isFloater: registration.isFloater,
      teamName: primaryTeam?.name ?? null,
      teamColorHex: primaryTeam?.colorHex ?? null,
      games,
    };
  });
}

export type PublicEventGames = Awaited<ReturnType<typeof getPublicEventGames>>;

/**
 * Public games agenda for an event, visible once teams are posted. Gated by
 * the event's visibility (LINK viewers pass the token) — contains no
 * participant PII, only team names and times.
 */
export async function getPublicEventGames(eventId: string, linkToken?: string) {
  const gate = await prisma.signupEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      status: true,
      visibility: true,
      linkToken: true,
      teamsPublishedAt: true,
      ageClassification: true,
    },
  });
  if (!gate?.teamsPublishedAt) return null;

  const userId = await getCurrentUserId();
  const allowed =
    (userId && (await isEventManager(userId, gate.id))) ||
    (await canViewSignupEvent(gate, { userId, linkToken }));
  if (!allowed) return null;

  const games = await prisma.eventGame.findMany({
    where: { eventId },
    orderBy: { startAt: "asc" },
    select: {
      id: true,
      name: true,
      status: true,
      startAt: true,
      endAt: true,
      iceUsage: true,
      zoneLabel: true,
      homeScore: true,
      awayScore: true,
      surface: { select: { name: true } },
      homeTeam: { select: { name: true, colorHex: true } },
      awayTeam: { select: { name: true, colorHex: true } },
    },
  });

  // Age gate on display: below the threshold, scores are never shown even if
  // rows somehow carry them (e.g. after a classification downgrade).
  const statsEligible = isStatsEligible(
    gate.ageClassification,
    STATS_MIN_AGE_LEVEL as AgeClassification
  );
  return games.map((game) => ({
    ...game,
    homeScore: statsEligible ? game.homeScore : null,
    awayScore: statsEligible ? game.awayScore : null,
  }));
}

/**
 * Published games for PUBLIC signup events at a venue — surfaced on the
 * rink's public schedule page alongside the event listing (FR-032).
 */
export async function listPublicVenueEventGames(venueId: string) {
  return prisma.eventGame.findMany({
    where: {
      event: {
        venueId,
        visibility: "PUBLIC",
        status: "PUBLISHED",
        teamsPublishedAt: { not: null },
      },
    },
    orderBy: { startAt: "asc" },
    take: 100,
    select: {
      id: true,
      startAt: true,
      endAt: true,
      iceUsage: true,
      zoneLabel: true,
      eventId: true,
      surface: { select: { name: true } },
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });
}

/**
 * Record a game's score (and optional basic player stats) — ONLY for events
 * at or above the configured age threshold. USA Hockey ADM: no scores or
 * statistics at 8U/mite and below; the gate is enforced here and again in
 * every read (FR-036).
 */
export async function recordGameResult(
  input: RecordGameResultInput
): Promise<ActionResult<{ gameId: string }>> {
  try {
    const validated = recordGameResultSchema.parse(input);

    const game = await prisma.eventGame.findUnique({
      where: { id: validated.gameId },
      select: {
        id: true,
        eventId: true,
        event: { select: { ageClassification: true } },
      },
    });
    if (!game) {
      return { success: false, error: "Game not found" };
    }
    const userId = await requireEventManager(game.eventId);

    if (!isStatsEligible(game.event.ageClassification, STATS_MIN_AGE_LEVEL as AgeClassification)) {
      return {
        success: false,
        error:
          "Scores and statistics are not recorded at this age level (development-first play — no standings for mites).",
      };
    }

    if (validated.stats.length > 0) {
      const registrationIds = validated.stats.map((stat) => stat.registrationId);
      const count = await prisma.eventRegistration.count({
        where: { id: { in: registrationIds }, eventId: game.eventId },
      });
      if (count !== registrationIds.length) {
        return { success: false, error: "Stats can only be recorded for this event's participants." };
      }
    }

    await prisma.$transaction([
      prisma.eventGame.update({
        where: { id: game.id },
        data: {
          homeScore: validated.homeScore,
          awayScore: validated.awayScore,
          status: "COMPLETED",
        },
      }),
      ...validated.stats.map((stat) =>
        prisma.playerGameStat.upsert({
          where: { gameId_registrationId: { gameId: game.id, registrationId: stat.registrationId } },
          create: {
            gameId: game.id,
            registrationId: stat.registrationId,
            goals: stat.goals,
            assists: stat.assists,
          },
          update: { goals: stat.goals, assists: stat.assists },
        })
      ),
    ]);

    await logSignupEventActivity({
      eventId: game.eventId,
      actorId: userId,
      action: "game.result",
      summary: `Recorded a game result ${validated.homeScore}–${validated.awayScore}`,
      details: { gameId: game.id },
    });

    revalidatePath(`/signup-events/${game.eventId}`);
    revalidatePath(`/events/${game.eventId}`);
    return { success: true, data: { gameId: game.id } };
  } catch (error) {
    return handleActionError(error, "Failed to record the result.");
  }
}

export type EventStandings = Awaited<ReturnType<typeof getEventStandings>>;

/**
 * Tournament standings, derived at read time from COMPLETED games. Returns
 * null unless the event is a TOURNAMENT, age-eligible for scores, has posted
 * teams, and the viewer passes the visibility gate.
 */
export async function getEventStandings(eventId: string, linkToken?: string) {
  const gate = await prisma.signupEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      status: true,
      visibility: true,
      linkToken: true,
      category: true,
      ageClassification: true,
      teamsPublishedAt: true,
    },
  });
  if (
    !gate ||
    gate.category !== "TOURNAMENT" ||
    !gate.teamsPublishedAt ||
    !isStatsEligible(gate.ageClassification, STATS_MIN_AGE_LEVEL as AgeClassification)
  ) {
    return null;
  }

  const userId = await getCurrentUserId();
  const allowed =
    (userId && (await isEventManager(userId, gate.id))) ||
    (await canViewSignupEvent(gate, { userId, linkToken }));
  if (!allowed) return null;

  const [teams, games] = await Promise.all([
    prisma.eventTeam.findMany({
      where: { eventId },
      select: { id: true, name: true },
    }),
    prisma.eventGame.findMany({
      where: { eventId },
      select: { status: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
    }),
  ]);
  if (teams.length === 0) return null;

  return computeStandings(teams, games);
}
