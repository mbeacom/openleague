"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import type { AssociationRoleScopeType } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { Capability, hasCapability, loadActiveGrants } from "@/lib/auth/capabilities";
import { ROLE_CAPABILITY_MATRIX } from "@/lib/auth/capability-matrix";
import { rethrowIfNextRedirectError } from "@/lib/utils/next-errors";
import { scopeBelongsToLeague } from "@/lib/services/association-roles";

/**
 * Volunteer needs and assignments (feature 007 / User Story 3).
 *
 * Organizing is gated on MANAGE_VOLUNTEERS at the need's own scope, so a
 * team-scoped volunteer coordinator can staff their team's needs and nothing
 * else. Volunteers themselves need no capability: they act on assignments
 * addressed to them, which is checked by ownership rather than by role.
 */

/** Rolls the acceptance transaction back with a reason the caller can report. */
class VolunteerClaimError extends Error {
  constructor(readonly reason: "FULL" | "ALREADY_ANSWERED") {
    super(reason);
    this.name = "VolunteerClaimError";
  }
}

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

const cuid = z.string().cuid("Invalid ID format");

const createNeedSchema = z
  .object({
    leagueId: cuid,
    roleLabel: z.string().min(1, "A role is required").max(120),
    description: z.string().max(2000).optional(),
    capacity: z.number().int().min(1, "Capacity must be at least 1").max(500),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    timezone: z.string().min(1).max(64),
    divisionId: cuid.optional(),
    teamId: cuid.optional(),
    eventId: cuid.optional(),
    signupEventId: cuid.optional(),
  })
  .refine((value) => value.endAt > value.startAt, {
    message: "The end time must be after the start time",
    path: ["endAt"],
  });

export type CreateVolunteerNeedInput = z.input<typeof createNeedSchema>;

/**
 * Can this user organize volunteers for the given need scope?
 *
 * The scope of the *need* is what is checked, not the association as a whole:
 * a team-scoped coordinator organizing a team need passes, the same coordinator
 * reaching for an association-wide need does not.
 */
async function canOrganize(
  userId: string,
  leagueId: string,
  scope: {
    teamId?: string | null;
    divisionId?: string | null;
    eventId?: string | null;
    signupEventId?: string | null;
  },
): Promise<boolean> {
  return hasCapability({
    userId,
    leagueId,
    capability: Capability.MANAGE_VOLUNTEERS,
    teamId: scope.teamId ?? undefined,
    divisionId: scope.divisionId ?? undefined,
    eventId: scope.eventId ?? undefined,
    signupEventId: scope.signupEventId ?? undefined,
  });
}

export async function createVolunteerNeed(
  input: CreateVolunteerNeedInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const userId = await requireUserId();
    const validated = createNeedSchema.parse(input);

    if (!(await canOrganize(userId, validated.leagueId, validated))) {
      return { success: false, error: "You do not have permission to organize volunteers." };
    }

    // Only teamId has a compound tenant foreign key; the other scope columns
    // would happily reference another association's division, event, or signup
    // event. Without this a scoped coordinator could attach an association-owned
    // need to a foreign tenant's activity.
    const tenancyChecks: Array<[AssociationRoleScopeType, string | undefined]> = [
      ["DIVISION", validated.divisionId],
      ["TEAM", validated.teamId],
      ["EVENT", validated.eventId],
      ["SIGNUP_EVENT", validated.signupEventId],
    ];
    for (const [scopeType, scopeId] of tenancyChecks) {
      if (!scopeId) continue;
      if (!(await scopeBelongsToLeague(validated.leagueId, scopeType, scopeId))) {
        return { success: false, error: "That scope does not belong to this association." };
      }
    }

    const need = await prisma.volunteerNeed.create({
      data: {
        leagueId: validated.leagueId,
        roleLabel: validated.roleLabel,
        description: validated.description ?? null,
        capacity: validated.capacity,
        startAt: validated.startAt,
        endAt: validated.endAt,
        timezone: validated.timezone,
        divisionId: validated.divisionId ?? null,
        teamId: validated.teamId ?? null,
        eventId: validated.eventId ?? null,
        signupEventId: validated.signupEventId ?? null,
        createdById: userId,
      },
      select: { id: true },
    });

    revalidatePath(`/league/${validated.leagueId}/workforce`);
    return { success: true, data: { id: need.id } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid input.", details: error.issues };
    }
    rethrowIfNextRedirectError(error);
    console.error("Error creating volunteer need:", error);
    return { success: false, error: "Failed to create the volunteer need." };
  }
}

const updateNeedSchema = z.object({
  needId: cuid,
  roleLabel: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  capacity: z.number().int().min(1).max(500).optional(),
  status: z.enum(["OPEN", "CLOSED", "COMPLETED"]).optional(),
});

export async function updateVolunteerNeed(
  input: z.infer<typeof updateNeedSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const userId = await requireUserId();
    const validated = updateNeedSchema.parse(input);

    const need = await prisma.volunteerNeed.findUnique({
      where: { id: validated.needId },
      select: {
        id: true,
        leagueId: true,
        teamId: true,
        divisionId: true,
        eventId: true,
        signupEventId: true,
        acceptedCount: true,
        status: true,
      },
    });
    if (!need) return { success: false, error: "That volunteer need could not be found." };

    if (!(await canOrganize(userId, need.leagueId, need))) {
      return { success: false, error: "You do not have permission to organize volunteers." };
    }

    // Capacity may not be cut below what has already been accepted: the people
    // holding those slots were told they had them, and the database CHECK would
    // reject it anyway.
    if (validated.capacity !== undefined && validated.capacity < need.acceptedCount) {
      return {
        success: false,
        error: `Capacity cannot be lower than the ${need.acceptedCount} volunteer(s) already accepted.`,
      };
    }

    await prisma.volunteerNeed.update({
      where: { id: need.id },
      data: {
        ...(validated.roleLabel !== undefined ? { roleLabel: validated.roleLabel } : {}),
        ...(validated.description !== undefined ? { description: validated.description } : {}),
        ...(validated.capacity !== undefined ? { capacity: validated.capacity } : {}),
        ...(validated.status !== undefined ? { status: validated.status } : {}),
        ...(validated.status === "COMPLETED" ? { completedAt: new Date() } : {}),
      },
    });

    revalidatePath(`/league/${need.leagueId}/workforce`);
    return { success: true, data: { id: need.id } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid input.", details: error.issues };
    }
    rethrowIfNextRedirectError(error);
    console.error("Error updating volunteer need:", error);
    return { success: false, error: "Failed to update the volunteer need." };
  }
}

export async function cancelVolunteerNeed(
  needId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const userId = await requireUserId();
    const validated = cuid.parse(needId);

    const need = await prisma.volunteerNeed.findUnique({
      where: { id: validated },
      select: {
        id: true,
        leagueId: true,
        teamId: true,
        divisionId: true,
        eventId: true,
        signupEventId: true,
      },
    });
    if (!need) return { success: false, error: "That volunteer need could not be found." };

    if (!(await canOrganize(userId, need.leagueId, need))) {
      return { success: false, error: "You do not have permission to organize volunteers." };
    }

    // Cancelling the need cancels its live assignments too, so nobody is left
    // believing they are still expected to turn up.
    await prisma.$transaction([
      prisma.volunteerNeed.update({
        where: { id: need.id },
        data: { status: "CANCELED", canceledAt: new Date() },
      }),
      prisma.volunteerAssignment.updateMany({
        where: { needId: need.id, status: { in: ["INVITED", "ACCEPTED"] } },
        data: { status: "CANCELED" },
      }),
    ]);

    revalidatePath(`/league/${need.leagueId}/workforce`);
    return { success: true, data: { id: need.id } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid volunteer need ID." };
    }
    rethrowIfNextRedirectError(error);
    console.error("Error cancelling volunteer need:", error);
    return { success: false, error: "Failed to cancel the volunteer need." };
  }
}

const assignSchema = z
  .object({
    needId: cuid,
    userId: cuid.optional(),
    invitedEmail: z.string().email().max(255).optional(),
  })
  .refine((v) => Boolean(v.userId) !== Boolean(v.invitedEmail), {
    message: "Provide either a user or an email address, not both",
  });

export async function assignVolunteer(
  input: z.infer<typeof assignSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const actingUserId = await requireUserId();
    const validated = assignSchema.parse(input);

    const need = await prisma.volunteerNeed.findUnique({
      where: { id: validated.needId },
      select: {
        id: true,
        leagueId: true,
        teamId: true,
        divisionId: true,
        eventId: true,
        signupEventId: true,
        status: true,
      },
    });
    if (!need) return { success: false, error: "That volunteer need could not be found." };
    if (need.status !== "OPEN") {
      return { success: false, error: "That volunteer need is no longer open." };
    }

    if (!(await canOrganize(actingUserId, need.leagueId, need))) {
      return { success: false, error: "You do not have permission to organize volunteers." };
    }

    // An assignment carrying only an email can never be answered: responding
    // requires the signed-in user to own the row, and nothing claims an email
    // assignment on signup. Resolve the address to an account, or say so
    // plainly rather than creating a permanently dead shift.
    let subjectUserId = validated.userId ?? null;
    if (!subjectUserId && validated.invitedEmail) {
      const existing = await prisma.user.findUnique({
        where: { email: validated.invitedEmail.toLowerCase() },
        select: { id: true },
      });
      if (!existing) {
        return {
          success: false,
          error:
            "That email address has no account yet. Invite them to the association first, then assign the shift.",
        };
      }
      subjectUserId = existing.id;
    }

    const assignment = await prisma.volunteerAssignment.create({
      data: {
        needId: need.id,
        userId: subjectUserId,
        assignedById: actingUserId,
      },
      select: { id: true },
    });

    revalidatePath(`/league/${need.leagueId}/workforce`);
    return { success: true, data: { id: assignment.id } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid input.", details: error.issues };
    }
    rethrowIfNextRedirectError(error);
    console.error("Error assigning volunteer:", error);
    return { success: false, error: "Failed to assign the volunteer." };
  }
}

const respondSchema = z.object({
  assignmentId: cuid,
  response: z.enum(["ACCEPTED", "DECLINED"]),
});

/**
 * A volunteer accepts or declines their own assignment.
 *
 * Acceptance claims a capacity slot atomically. The claim is a conditional
 * `updateMany` guarded on `acceptedCount < capacity`, evaluated by Postgres at
 * write time: two simultaneous acceptances of a one-slot need both issue the
 * same guarded update, the first matches one row, and the second matches zero
 * because the counter has already moved. ADR-0003 rules out
 * `SELECT ... FOR UPDATE`, and this needs no lock.
 *
 * The `acceptedCount <= capacity` CHECK on the table is the backstop if the
 * guard is ever wrong.
 */
export async function respondToVolunteerAssignment(
  input: z.infer<typeof respondSchema>,
): Promise<ActionResult<{ status: "ACCEPTED" | "DECLINED" }>> {
  try {
    const userId = await requireUserId();
    const validated = respondSchema.parse(input);

    const assignment = await prisma.volunteerAssignment.findUnique({
      where: { id: validated.assignmentId },
      select: {
        id: true,
        userId: true,
        status: true,
        need: { select: { id: true, leagueId: true, capacity: true, status: true } },
      },
    });
    if (!assignment) {
      return { success: false, error: "That assignment could not be found." };
    }

    // Ownership, not capability: a volunteer answers only for themselves.
    if (assignment.userId !== userId) {
      return { success: false, error: "That assignment is not yours to answer." };
    }
    if (assignment.status !== "INVITED") {
      return { success: false, error: "That assignment has already been answered." };
    }
    if (assignment.need.status !== "OPEN") {
      return { success: false, error: "That volunteer need is no longer open." };
    }

    if (validated.response === "DECLINED") {
      await prisma.volunteerAssignment.update({
        where: { id: assignment.id },
        data: { status: "DECLINED", respondedAt: new Date() },
      });
      revalidatePath(`/league/${assignment.need.leagueId}/workforce`);
      return { success: true, data: { status: "DECLINED" } };
    }

    // Both writes commit together or neither does. Claiming the assignment
    // conditionally (still INVITED) is what stops two requests for the SAME
    // assignment from each incrementing a multi-slot need; the guarded
    // increment is what stops two different volunteers from taking one slot.
    // A compensating decrement cannot cover the first case, because both
    // callers would have already passed the status check.
    try {
      await prisma.$transaction(async (tx) => {
        const claimedAssignment = await tx.volunteerAssignment.updateMany({
          where: { id: assignment.id, status: "INVITED" },
          data: { status: "ACCEPTED", respondedAt: new Date() },
        });
        if (claimedAssignment.count === 0) {
          throw new VolunteerClaimError("ALREADY_ANSWERED");
        }

        const claimedSlot = await tx.volunteerNeed.updateMany({
          where: {
            id: assignment.need.id,
            status: "OPEN",
            acceptedCount: { lt: assignment.need.capacity },
          },
          data: { acceptedCount: { increment: 1 } },
        });
        if (claimedSlot.count === 0) {
          // Rolls the assignment transition back with it.
          throw new VolunteerClaimError("FULL");
        }
      });
    } catch (error) {
      if (error instanceof VolunteerClaimError) {
        return {
          success: false,
          error:
            error.reason === "FULL"
              ? "That volunteer need is already full."
              : "That assignment has already been answered.",
        };
      }
      throw error;
    }

    revalidatePath(`/league/${assignment.need.leagueId}/workforce`);
    return { success: true, data: { status: "ACCEPTED" } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid input.", details: error.issues };
    }
    rethrowIfNextRedirectError(error);
    console.error("Error responding to volunteer assignment:", error);
    return { success: false, error: "Failed to record your response." };
  }
}

const outcomeSchema = z.object({
  assignmentId: cuid,
  outcome: z.enum(["COMPLETED", "MISSED"]),
});

/** Organizer records whether an accepted volunteer actually turned up. */
async function recordAssignmentOutcome(
  input: z.infer<typeof outcomeSchema>,
): Promise<ActionResult<{ id: string }>> {
  const userId = await requireUserId();
  const validated = outcomeSchema.parse(input);

  const assignment = await prisma.volunteerAssignment.findUnique({
    where: { id: validated.assignmentId },
    select: {
      id: true,
      status: true,
      need: {
        select: {
          leagueId: true,
          teamId: true,
          divisionId: true,
          eventId: true,
          signupEventId: true,
        },
      },
    },
  });
  if (!assignment) {
    return { success: false, error: "That assignment could not be found." };
  }

  if (!(await canOrganize(userId, assignment.need.leagueId, assignment.need))) {
    return { success: false, error: "You do not have permission to organize volunteers." };
  }

  if (assignment.status !== "ACCEPTED") {
    return { success: false, error: "Only an accepted assignment can be closed out." };
  }

  await prisma.volunteerAssignment.update({
    where: { id: assignment.id },
    data: {
      status: validated.outcome,
      ...(validated.outcome === "COMPLETED" ? { completedAt: new Date() } : {}),
    },
  });

  revalidatePath(`/league/${assignment.need.leagueId}/workforce`);
  return { success: true, data: { id: assignment.id } };
}

export async function completeVolunteerAssignment(
  assignmentId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    return await recordAssignmentOutcome({ assignmentId, outcome: "COMPLETED" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid assignment ID." };
    }
    rethrowIfNextRedirectError(error);
    console.error("Error completing volunteer assignment:", error);
    return { success: false, error: "Failed to complete the assignment." };
  }
}

export async function markVolunteerAssignmentMissed(
  assignmentId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    return await recordAssignmentOutcome({ assignmentId, outcome: "MISSED" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid assignment ID." };
    }
    rethrowIfNextRedirectError(error);
    console.error("Error marking volunteer assignment missed:", error);
    return { success: false, error: "Failed to update the assignment." };
  }
}

export interface VolunteerNeedSummary {
  id: string;
  roleLabel: string;
  description: string | null;
  capacity: number;
  acceptedCount: number;
  status: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  teamName: string | null;
  /** Populated for organizers only; volunteers see just their own assignment. */
  assignments: Array<{
    id: string;
    status: string;
    personLabel: string;
  }>;
}

/**
 * Board data for one association.
 *
 * Organizers see fulfillment across every need. Everyone else sees only needs
 * they hold an assignment on, with no other volunteer's identity attached —
 * "authorized organizers see fulfillment; volunteers see only their own
 * assignments and safe activity context" (contracts/association-actions.md).
 */
export async function getVolunteerBoard(
  leagueId: string,
): Promise<ActionResult<{ needs: VolunteerNeedSummary[]; isOrganizer: boolean }>> {
  try {
    const userId = await requireUserId();
    const validated = cuid.parse(leagueId);

    // Organizing authority is per need, not per association. Asking with an
    // empty target classified every team-, division-, or event-scoped
    // coordinator as a non-organizer, because narrow grants deliberately do
    // not match an empty target — so the very people authorized to run those
    // shifts saw only their own rows.
    const grants = (await loadActiveGrants(userId, validated)).filter(
      (grant) => ROLE_CAPABILITY_MATRIX[grant.role]?.capabilities.includes(
        Capability.MANAGE_VOLUNTEERS,
      ) && ROLE_CAPABILITY_MATRIX[grant.role]?.scopes.includes(grant.scopeType),
    );

    // Association-wide authority (a grant at association scope, or a legacy
    // league admin) still short-circuits the per-need matching below.
    const isAssociationOrganizer = await hasCapability({
      userId,
      leagueId: validated,
      capability: Capability.MANAGE_VOLUNTEERS,
    });

    const hasAnyOrganizingGrant = isAssociationOrganizer || grants.length > 0;

    const needs = await prisma.volunteerNeed.findMany({
      where: {
        leagueId: validated,
        ...(hasAnyOrganizingGrant ? {} : { assignments: { some: { userId } } }),
      },
      select: {
        id: true,
        roleLabel: true,
        description: true,
        capacity: true,
        acceptedCount: true,
        status: true,
        startAt: true,
        endAt: true,
        timezone: true,
        // Scope columns: needed to decide organizer standing per need.
        teamId: true,
        divisionId: true,
        eventId: true,
        signupEventId: true,
        team: { select: { name: true, divisionId: true } },
        assignments: {
          where: hasAnyOrganizingGrant ? {} : { userId },
          select: {
            id: true,
            status: true,
            invitedEmail: true,
            user: { select: { name: true, email: true } },
          },
        },
      },
      orderBy: { startAt: "asc" },
    });

    // Decide organizer standing per need, in memory, from the grants already
    // loaded — one query rather than a hasCapability round-trip per row.
    const organizesNeed = (need: {
      teamId: string | null;
      divisionId: string | null;
      eventId: string | null;
      signupEventId: string | null;
      team: { divisionId: string | null } | null;
    }): boolean => {
      if (isAssociationOrganizer) return true;
      return grants.some((grant) => {
        switch (grant.scopeType) {
          case "ASSOCIATION":
            return true;
          case "DIVISION":
            return (
              grant.divisionId !== null &&
              (grant.divisionId === need.divisionId ||
                grant.divisionId === need.team?.divisionId)
            );
          case "TEAM":
            return grant.teamId !== null && grant.teamId === need.teamId;
          case "EVENT":
            return grant.eventId !== null && grant.eventId === need.eventId;
          case "SIGNUP_EVENT":
            return (
              grant.signupEventId !== null && grant.signupEventId === need.signupEventId
            );
          default:
            return false;
        }
      });
    };

    const visible = needs.filter(
      (need) => organizesNeed(need) || need.assignments.length > 0,
    );

    return {
      success: true,
      data: {
        isOrganizer: isAssociationOrganizer || visible.some(organizesNeed),
        needs: visible.map((need) => ({
          id: need.id,
          roleLabel: need.roleLabel,
          description: need.description,
          capacity: need.capacity,
          acceptedCount: need.acceptedCount,
          status: need.status,
          startAt: need.startAt,
          endAt: need.endAt,
          timezone: need.timezone,
          teamName: need.team?.name ?? null,
          assignments: need.assignments.map((assignment) => ({
            id: assignment.id,
            status: assignment.status,
            personLabel:
              assignment.user?.name ??
              assignment.user?.email ??
              assignment.invitedEmail ??
              "Invited volunteer",
          })),
        })),
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid association ID." };
    }
    rethrowIfNextRedirectError(error);
    console.error("Error loading volunteer board:", error);
    return { success: false, error: "Failed to load volunteers." };
  }
}
