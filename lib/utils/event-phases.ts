import type { PhaseAudience } from "@prisma/client";
import type { PrismaClientLike } from "@/lib/utils/event-capacity";

/**
 * Registration-phase eligibility (research R6). Phases are evaluated at
 * request time as a pure predicate of (user, event, now) — no scheduler ever
 * mutates phase state. When an event defines phases, they govern when
 * registration opens; the event-level close (registrationClosesAt / startAt)
 * still applies globally.
 */

export type PhaseForEligibility = {
  id: string;
  name: string;
  opensAt: Date;
  audience: PhaseAudience;
  divisions: Array<{ id: string }>;
  teams: Array<{ id: string }>;
};

export type EventHostForEligibility = {
  id: string;
  hostOrganizationId: string | null;
  hostLeagueId: string | null;
  hostTeamId: string | null;
};

export type PhaseEligibility = {
  /** True when at least one currently-open phase matches the viewer. */
  eligibleNow: boolean;
  /** Earliest future phase opening (any audience) — for "opens at" messaging. */
  nextOpensAt: Date | null;
};

/**
 * Is the user a "host member" of the event's hosting entity?
 * - League host: league membership or membership on a team in the league.
 * - Team host: team membership.
 * - Organization host: active venue staff, or membership on a team with an
 *   active relationship to one of the organization's venues.
 */
async function isHostMember(
  client: PrismaClientLike,
  event: EventHostForEligibility,
  userId: string
): Promise<boolean> {
  if (event.hostLeagueId) {
    const [leagueUser, leagueTeamMember] = await Promise.all([
      client.leagueUser.count({ where: { userId, leagueId: event.hostLeagueId } }),
      client.teamMember.count({ where: { userId, team: { leagueId: event.hostLeagueId } } }),
    ]);
    return leagueUser > 0 || leagueTeamMember > 0;
  }
  if (event.hostTeamId) {
    const member = await client.teamMember.count({ where: { userId, teamId: event.hostTeamId } });
    return member > 0;
  }
  if (event.hostOrganizationId) {
    const [staff, relatedTeamMember] = await Promise.all([
      client.venueStaff.count({
        where: { userId, organizationId: event.hostOrganizationId, status: "ACTIVE" },
      }),
      client.teamMember.count({
        where: {
          userId,
          team: {
            venueRelationships: {
              some: {
                status: "ACTIVE",
                venue: { organizationId: event.hostOrganizationId },
              },
            },
          },
        },
      }),
    ]);
    return staff > 0 || relatedTeamMember > 0;
  }
  return false;
}

async function isInvitee(client: PrismaClientLike, eventId: string, userId: string): Promise<boolean> {
  const user = await client.user.findUnique({ where: { id: userId }, select: { email: true } });
  const invitation = await client.eventInvitation.findFirst({
    where: {
      eventId,
      status: { not: "REVOKED" },
      OR: [
        { invitedUserId: userId },
        ...(user?.email ? [{ email: { equals: user.email, mode: "insensitive" as const } }] : []),
      ],
    },
    select: { id: true },
  });
  return Boolean(invitation);
}

async function isSelectedGroupMember(
  client: PrismaClientLike,
  phase: PhaseForEligibility,
  userId: string
): Promise<boolean> {
  const teamIds = phase.teams.map((team) => team.id);
  const divisionIds = phase.divisions.map((division) => division.id);
  if (teamIds.length === 0 && divisionIds.length === 0) {
    return false;
  }
  const member = await client.teamMember.count({
    where: {
      userId,
      OR: [
        ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
        ...(divisionIds.length > 0 ? [{ team: { divisionId: { in: divisionIds } } }] : []),
      ],
    },
  });
  return member > 0;
}

/**
 * Resolve whether the viewer may register right now under the event's phases.
 * `userId = null` (anonymous viewers) matches only EVERYONE phases.
 * An event with no phases is treated as a single EVERYONE phase governed by
 * the event-level registration window (callers handle that case).
 */
export async function resolvePhaseEligibility(
  client: PrismaClientLike,
  event: EventHostForEligibility & { phases: PhaseForEligibility[] },
  userId: string | null,
  now: Date = new Date()
): Promise<PhaseEligibility> {
  if (event.phases.length === 0) {
    return { eligibleNow: true, nextOpensAt: null };
  }

  const openPhases = event.phases.filter((phase) => phase.opensAt <= now);
  const futurePhases = event.phases.filter((phase) => phase.opensAt > now);
  const nextOpensAt =
    futurePhases.length > 0
      ? futurePhases.reduce(
          (earliest, phase) => (phase.opensAt < earliest ? phase.opensAt : earliest),
          futurePhases[0].opensAt
        )
      : null;

  // Cache membership checks shared across phases.
  let hostMember: boolean | null = null;
  let invitee: boolean | null = null;

  for (const phase of openPhases) {
    switch (phase.audience) {
      case "EVERYONE":
        return { eligibleNow: true, nextOpensAt };
      case "HOST_MEMBERS": {
        if (!userId) break;
        hostMember ??= await isHostMember(client, event, userId);
        if (hostMember) return { eligibleNow: true, nextOpensAt };
        break;
      }
      case "INVITEES": {
        if (!userId) break;
        invitee ??= await isInvitee(client, event.id, userId);
        if (invitee) return { eligibleNow: true, nextOpensAt };
        break;
      }
      case "SELECTED_GROUPS": {
        if (!userId) break;
        if (await isSelectedGroupMember(client, phase, userId)) {
          return { eligibleNow: true, nextOpensAt };
        }
        break;
      }
    }
  }

  return { eligibleNow: false, nextOpensAt };
}
