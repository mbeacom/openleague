"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { isTeamAdmin, requireTeamAdmin, requireUserId } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import {
  addGuardianSchema,
  removeGuardianSchema,
  type AddGuardianInput,
  type RemoveGuardianInput,
} from "@/lib/utils/validation";
import type { GuardianWithUser } from "@/types/roster";
import type { RSVPStatus } from "@/types/events";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

const GUARDIAN_WITH_USER_INCLUDE = {
  user: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} as const;

/** How many days ahead getMyPlayers looks for upcoming events. */
const UPCOMING_WINDOW_DAYS = 14;

/** One upcoming event for a guarded player, with the child's RSVP status. */
export type MyPlayerUpcomingEvent = {
  eventId: string;
  title: string;
  startAt: Date;
  /** The child's per-player status (latest row regardless of who answered); NO_RESPONSE when unanswered. */
  myChildStatus: RSVPStatus;
};

/** A player the current user guards, with team context and upcoming events. */
export type MyPlayerSummary = {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  canRsvp: boolean;
  upcoming: MyPlayerUpcomingEvent[];
};

/**
 * Link an existing User account as a guardian of a roster player.
 * Team ADMIN only. The email must belong to an existing account — guardians
 * are User edges, not standalone contacts.
 */
export async function addGuardian(
  input: AddGuardianInput
): Promise<ActionResult<GuardianWithUser>> {
  try {
    const validated = addGuardianSchema.parse(input);

    const player = await prisma.player.findUnique({
      where: { id: validated.playerId },
      select: { id: true, teamId: true },
    });

    if (!player) {
      return { success: false, error: "Player not found" };
    }

    // Only team admins can manage a player's guardians
    await requireTeamAdmin(player.teamId);

    const user = await prisma.user.findUnique({
      where: { email: validated.email },
      select: { id: true },
    });

    if (!user) {
      return {
        success: false,
        error:
          "No account found with that email. Ask them to sign up for OpenLeague first, then add them as a guardian.",
      };
    }

    const existing = await prisma.playerGuardian.findUnique({
      where: {
        playerId_userId: {
          playerId: player.id,
          userId: user.id,
        },
      },
      select: { id: true },
    });

    if (existing) {
      return {
        success: false,
        error: "That account is already a guardian of this player",
      };
    }

    const guardian = await prisma.playerGuardian.create({
      data: {
        playerId: player.id,
        userId: user.id,
        relationship: validated.relationship || null,
      },
      include: GUARDIAN_WITH_USER_INCLUDE,
    });

    revalidatePath("/roster");
    revalidatePath("/dashboard");

    return { success: true, data: guardian };
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

    console.error("Error adding guardian:", error);

    return {
      success: false,
      error: "Failed to add guardian. Please try again.",
    };
  }
}

/**
 * Remove a guardian link. Allowed for team ADMINs of the player's team and
 * for the guardian themself (self-removal).
 */
export async function removeGuardian(
  input: RemoveGuardianInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = removeGuardianSchema.parse(input);

    const userId = await requireUserId();

    const guardian = await prisma.playerGuardian.findUnique({
      where: { id: validated.guardianId },
      select: {
        id: true,
        userId: true,
        player: { select: { teamId: true } },
      },
    });

    if (!guardian) {
      return { success: false, error: "Guardian link not found" };
    }

    const authorized =
      guardian.userId === userId ||
      (await isTeamAdmin(userId, guardian.player.teamId));

    if (!authorized) {
      return {
        success: false,
        error: "You are not authorized to remove this guardian",
      };
    }

    await prisma.playerGuardian.delete({
      where: { id: guardian.id },
    });

    revalidatePath("/roster");
    revalidatePath("/dashboard");

    return { success: true, data: { id: guardian.id } };
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

    console.error("Error removing guardian:", error);

    return {
      success: false,
      error: "Failed to remove guardian. Please try again.",
    };
  }
}

const playerIdSchema = z.string().cuid("Invalid player ID format");

/**
 * List a player's guardians. Visible to team ADMINs of the player's team and
 * to the player's guardians themselves.
 */
export async function listGuardians(
  playerId: string
): Promise<ActionResult<GuardianWithUser[]>> {
  try {
    const validatedPlayerId = playerIdSchema.parse(playerId);

    const player = await prisma.player.findUnique({
      where: { id: validatedPlayerId },
      select: { id: true, teamId: true },
    });

    if (!player) {
      return { success: false, error: "Player not found" };
    }

    const userId = await requireUserId();

    const selfLink = await prisma.playerGuardian.findUnique({
      where: {
        playerId_userId: {
          playerId: player.id,
          userId,
        },
      },
      select: { id: true },
    });

    const authorized =
      selfLink !== null || (await isTeamAdmin(userId, player.teamId));

    if (!authorized) {
      return {
        success: false,
        error: "You are not authorized to view this player's guardians",
      };
    }

    const guardians = await prisma.playerGuardian.findMany({
      where: { playerId: player.id },
      include: GUARDIAN_WITH_USER_INCLUDE,
      orderBy: { createdAt: "asc" },
    });

    return { success: true, data: guardians };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid player ID",
        details: error.issues,
      };
    }

    console.error("Error listing guardians:", error);

    return {
      success: false,
      error: "Failed to load guardians. Please try again.",
    };
  }
}

/**
 * The current user's guarded players with their teams and each team's
 * upcoming events (next 14 days), carrying the child's per-player RSVP
 * status (NO_RESPONSE where no per-child row exists — per-child rows are
 * only created on response).
 */
export async function getMyPlayers(): Promise<ActionResult<MyPlayerSummary[]>> {
  try {
    const userId = await requireUserId();

    const links = await prisma.playerGuardian.findMany({
      where: { userId },
      select: {
        canRsvp: true,
        player: {
          select: {
            id: true,
            name: true,
            teamId: true,
            team: { select: { name: true } },
          },
        },
      },
      orderBy: { player: { name: "asc" } },
    });

    if (links.length === 0) {
      return { success: true, data: [] };
    }

    const teamIds = [...new Set(links.map((link) => link.player.teamId))];
    const playerIds = links.map((link) => link.player.id);

    const now = new Date();
    const horizon = new Date(
      now.getTime() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000
    );

    const events = await prisma.event.findMany({
      where: {
        teamId: { in: teamIds },
        startAt: { gte: now, lte: horizon },
      },
      select: {
        id: true,
        title: true,
        startAt: true,
        teamId: true,
      },
      orderBy: { startAt: "asc" },
    });

    const childRsvps = events.length
      ? await prisma.rSVP.findMany({
          where: {
            playerId: { in: playerIds },
            eventId: { in: events.map((event) => event.id) },
          },
          select: {
            playerId: true,
            eventId: true,
            status: true,
            updatedAt: true,
          },
        })
      : [];

    // Latest status per (playerId, eventId), regardless of who answered
    // (a guardian and a team admin may each hold a row for the same child).
    const statusByPlayerEvent = new Map<
      string,
      { status: RSVPStatus; updatedAt: Date }
    >();
    for (const row of childRsvps) {
      if (!row.playerId) continue;
      const key = `${row.playerId}:${row.eventId}`;
      const current = statusByPlayerEvent.get(key);
      if (!current || row.updatedAt > current.updatedAt) {
        statusByPlayerEvent.set(key, {
          status: row.status as RSVPStatus,
          updatedAt: row.updatedAt,
        });
      }
    }

    const data: MyPlayerSummary[] = links.map((link) => ({
      playerId: link.player.id,
      playerName: link.player.name,
      teamId: link.player.teamId,
      teamName: link.player.team.name,
      canRsvp: link.canRsvp,
      upcoming: events
        .filter((event) => event.teamId === link.player.teamId)
        .map((event) => ({
          eventId: event.id,
          title: event.title,
          startAt: event.startAt,
          myChildStatus:
            statusByPlayerEvent.get(`${link.player.id}:${event.id}`)?.status ??
            "NO_RESPONSE",
        })),
    }));

    return { success: true, data };
  } catch (error) {
    console.error("Error loading guarded players:", error);

    return {
      success: false,
      error: "Failed to load your players. Please try again.",
    };
  }
}
