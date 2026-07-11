"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { isTeamAdmin, requireTeamMember, requireUserId } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import {
  updateRSVPSchema,
  type UpdateRSVPInput,
} from "@/lib/utils/validation";
import type {
  AttendanceCounts,
  AttendanceEntry,
  RSVPStatus,
} from "@/types/events";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

type RsvpRow = {
  id: string;
  status: string;
  userId: string;
  eventId: string;
  playerId: string | null;
};

const RSVP_ROW_SELECT = {
  id: true,
  status: true,
  userId: true,
  eventId: true,
  playerId: true,
} as const;

/**
 * Submit (create or update) an RSVP for an event.
 *
 * Identity graph (Tier 3, decision D5):
 * - No `playerId` → the viewer's own self/household response (RSVP.playerId
 *   null). Requires team membership; integrity is enforced by the partial
 *   unique index `RSVP_userId_eventId_self_key` (the composite unique rejects
 *   null members), so this path uses findFirst + create/update, not upsert.
 * - `playerId` set → a per-child response. The viewer must be a guardian of
 *   that player with `canRsvp`, or a team ADMIN of the player's team; the
 *   player must belong to the event's team. Upserts on
 *   (userId, eventId, playerId).
 */
export async function submitRSVP(
  input: UpdateRSVPInput
): Promise<ActionResult<RsvpRow>> {
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

    let rsvp: RsvpRow;

    if (validated.playerId) {
      // Per-child response: authenticate, then authorize as guardian or admin.
      const userId = await requireUserId();

      const player = await prisma.player.findUnique({
        where: { id: validated.playerId },
        select: { id: true, teamId: true },
      });

      if (!player || player.teamId !== event.teamId) {
        return {
          success: false,
          error: "Player not found on this event's team",
        };
      }

      const guardian = await prisma.playerGuardian.findUnique({
        where: {
          playerId_userId: {
            playerId: validated.playerId,
            userId,
          },
        },
        select: { canRsvp: true },
      });

      const authorized =
        guardian?.canRsvp === true || (await isTeamAdmin(userId, event.teamId));

      if (!authorized) {
        return {
          success: false,
          error: "You are not authorized to RSVP for this player",
        };
      }

      rsvp = await prisma.rSVP.upsert({
        where: {
          userId_eventId_playerId: {
            userId,
            eventId: validated.eventId,
            playerId: validated.playerId,
          },
        },
        update: {
          status: validated.status,
        },
        create: {
          userId,
          eventId: validated.eventId,
          playerId: validated.playerId,
          status: validated.status,
        },
        select: RSVP_ROW_SELECT,
      });
    } else {
      // Self/household response — user must be a team member.
      const userId = await requireTeamMember(event.teamId);

      const existing = await prisma.rSVP.findFirst({
        where: {
          userId,
          eventId: validated.eventId,
          playerId: null,
        },
        select: { id: true },
      });

      rsvp = existing
        ? await prisma.rSVP.update({
            where: { id: existing.id },
            data: { status: validated.status },
            select: RSVP_ROW_SELECT,
          })
        : await prisma.rSVP.create({
            data: {
              userId,
              eventId: validated.eventId,
              status: validated.status,
            },
            select: RSVP_ROW_SELECT,
          });
    }

    // Revalidate the event detail page, calendar, and dashboard widgets
    revalidatePath(`/events/${validated.eventId}`);
    revalidatePath("/calendar");
    revalidatePath("/dashboard");

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

    console.error("Error submitting RSVP:", error);

    return {
      success: false,
      error: "Failed to update RSVP. Please try again.",
    };
  }
}

/**
 * Update or create an RSVP for an event.
 *
 * @deprecated Use {@link submitRSVP} (same behavior; contract name from the
 * Tier 3 identity-graph spec). Kept so existing callers compile unchanged.
 */
export async function updateRSVP(
  input: UpdateRSVPInput
): Promise<ActionResult<RsvpRow>> {
  return submitRSVP(input);
}

const eventIdSchema = z.string().cuid("Invalid event ID format");

/**
 * Per-identity attendance for an event (Tier 3 locked decision):
 * player-level responses are listed where they exist and user-level rows
 * otherwise; a user row and their child rows are distinct entries. Counts
 * treat each entry as one.
 *
 * Visible to team members and to LEAGUE_ADMINs of the event's league
 * (mirrors getEvent's read access).
 */
export async function getEventAttendance(
  eventId: string
): Promise<ActionResult<{ entries: AttendanceEntry[]; counts: AttendanceCounts }>> {
  try {
    const validatedEventId = eventIdSchema.parse(eventId);

    const event = await prisma.event.findUnique({
      where: { id: validatedEventId },
      select: {
        id: true,
        teamId: true,
        leagueId: true,
        team: { select: { leagueId: true } },
      },
    });

    if (!event) {
      return { success: false, error: "Event not found" };
    }

    const userId = await requireUserId();

    const teamMember = await prisma.teamMember.findUnique({
      where: {
        userId_teamId: {
          userId,
          teamId: event.teamId,
        },
      },
      select: { role: true },
    });

    if (!teamMember) {
      const eventLeagueId = event.leagueId ?? event.team.leagueId;
      const leagueAdmin = eventLeagueId
        ? await prisma.leagueUser.findFirst({
            where: {
              userId,
              leagueId: eventLeagueId,
              role: "LEAGUE_ADMIN",
            },
            select: { id: true },
          })
        : null;

      if (!leagueAdmin) {
        return {
          success: false,
          error: "You do not have access to this event",
        };
      }
    }

    const rsvps = await prisma.rSVP.findMany({
      where: { eventId: validatedEventId },
      select: {
        status: true,
        playerId: true,
        updatedAt: true,
        user: { select: { name: true, email: true } },
        player: { select: { id: true, name: true } },
      },
    });

    const entries: AttendanceEntry[] = [];

    // Player-level entries: dedupe per player (a child answered by both a
    // guardian and an admin still counts once — the latest response wins).
    const latestPerPlayer = new Map<string, (typeof rsvps)[number]>();

    for (const row of rsvps) {
      if (row.playerId && row.player) {
        const current = latestPerPlayer.get(row.playerId);
        if (!current || row.updatedAt > current.updatedAt) {
          latestPerPlayer.set(row.playerId, row);
        }
      } else {
        // User-level (self/household) entry.
        entries.push({
          kind: "user",
          name: row.user.name ?? row.user.email,
          status: row.status as RSVPStatus,
        });
      }
    }

    for (const row of latestPerPlayer.values()) {
      entries.push({
        kind: "player",
        name: row.player!.name,
        status: row.status as RSVPStatus,
        respondedByName: row.user.name ?? row.user.email,
      });
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    const counts: AttendanceCounts = {
      GOING: 0,
      NOT_GOING: 0,
      MAYBE: 0,
      NO_RESPONSE: 0,
    };
    for (const entry of entries) {
      counts[entry.status] += 1;
    }

    return {
      success: true,
      data: { entries, counts },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid event ID",
        details: error.issues,
      };
    }

    console.error("Error loading event attendance:", error);

    return {
      success: false,
      error: "Failed to load attendance. Please try again.",
    };
  }
}
