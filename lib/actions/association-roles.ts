"use server";

import { randomBytes } from "node:crypto";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type {
  AssociationRole,
  AssociationRoleScopeType,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import {
  Capability,
  hasCapability,
  supportedScopesForRole,
} from "@/lib/auth/capabilities";
import { AuditAction, logAuditEvent } from "@/lib/utils/security";
import { rethrowIfNextRedirectError } from "@/lib/utils/next-errors";
import { normalizeScope } from "@/lib/services/association-roles";

/**
 * Scoped responsibility grants (feature 007 / User Story 3).
 *
 * Every action here derives the acting user from the session, requires
 * association administration to change anything, and validates that the named
 * scope actually belongs to the association before writing. Descriptive labels
 * such as `TeamOfficial` are never consulted: authority comes from grants only.
 */

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

const ASSOCIATION_ROLES = [
  "ASSOCIATION_ADMIN",
  "SCHEDULER",
  "REGISTRAR",
  "TREASURER",
  "COMMUNICATIONS_LEAD",
  "TEAM_MANAGER",
  "COACH",
  "VOLUNTEER_COORDINATOR",
  "EVENT_MANAGER",
  "EQUIPMENT_MANAGER",
] as const satisfies readonly AssociationRole[];

const SCOPE_TYPES = [
  "ASSOCIATION",
  "DIVISION",
  "TEAM",
  "SEASON",
  "EVENT",
  "SIGNUP_EVENT",
] as const satisfies readonly AssociationRoleScopeType[];

const cuid = z.string().cuid("Invalid ID format");

const grantSchema = z.object({
  leagueId: cuid,
  userId: cuid,
  role: z.enum(ASSOCIATION_ROLES),
  scopeType: z.enum(SCOPE_TYPES),
  divisionId: cuid.optional(),
  teamId: cuid.optional(),
  seasonId: cuid.optional(),
  eventId: cuid.optional(),
  signupEventId: cuid.optional(),
  notes: z.string().max(500).optional(),
});

export type GrantAssociationResponsibilityInput = z.infer<typeof grantSchema>;

/**
 * Confirm the scope target exists *inside this association*.
 *
 * Without this a grant could name a team in someone else's league; the database
 * only enforces tenancy for the team scope, whose compound foreign key carries
 * the league id. Everything else is checked here.
 */
async function scopeBelongsToLeague(
  leagueId: string,
  scopeType: AssociationRoleScopeType,
  scopeId: string | null,
): Promise<boolean> {
  if (scopeType === "ASSOCIATION" || scopeId === null) return true;

  switch (scopeType) {
    case "DIVISION":
      return (
        (await prisma.division.findFirst({
          where: { id: scopeId, leagueId },
          select: { id: true },
        })) !== null
      );
    case "TEAM":
      return (
        (await prisma.team.findFirst({
          where: { id: scopeId, leagueId },
          select: { id: true },
        })) !== null
      );
    case "SEASON":
      return (
        (await prisma.season.findFirst({
          where: { id: scopeId, leagueId },
          select: { id: true },
        })) !== null
      );
    case "EVENT":
      return (
        (await prisma.event.findFirst({
          where: { id: scopeId, leagueId },
          select: { id: true },
        })) !== null
      );
    case "SIGNUP_EVENT":
      return (
        (await prisma.signupEvent.findFirst({
          where: { id: scopeId, hostLeagueId: leagueId },
          select: { id: true },
        })) !== null
      );
    default:
      return false;
  }
}

/**
 * Only association administration may delegate. This is the anti-escalation
 * rule: a delegate cannot mint further grants, so nobody can widen their own
 * authority by granting themselves a broader role.
 */
async function requireGrantAdministration(
  actingUserId: string,
  leagueId: string,
): Promise<boolean> {
  return hasCapability({
    userId: actingUserId,
    leagueId,
    capability: Capability.ADMINISTER_ASSOCIATION,
  });
}

export async function grantAssociationResponsibility(
  input: GrantAssociationResponsibilityInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const actingUserId = await requireUserId();
    const validated = grantSchema.parse(input);

    if (!(await requireGrantAdministration(actingUserId, validated.leagueId))) {
      return { success: false, error: "You do not have permission to delegate responsibilities." };
    }

    // The role must support the scope it is being granted at. Without this the
    // row would be written and then silently authorize nothing, because the
    // capability resolver rechecks the same matrix and fails closed.
    if (!supportedScopesForRole(validated.role).includes(validated.scopeType)) {
      return {
        success: false,
        error: `${validated.role} cannot be granted at ${validated.scopeType} scope.`,
      };
    }

    const scope = normalizeScope(validated);
    if (!scope.ok) {
      return { success: false, error: scope.error };
    }

    if (!(await scopeBelongsToLeague(validated.leagueId, validated.scopeType, scope.scopeId))) {
      return { success: false, error: "That scope does not belong to this association." };
    }

    const subject = await prisma.user.findUnique({
      where: { id: validated.userId },
      select: { id: true },
    });
    if (!subject) {
      return { success: false, error: "That user could not be found." };
    }

    const existing = await prisma.associationRoleGrant.findFirst({
      where: {
        userId: validated.userId,
        leagueId: validated.leagueId,
        role: validated.role,
        scopeType: validated.scopeType,
        state: "ACTIVE",
        ...scope.data,
      },
      select: { id: true },
    });
    if (existing) {
      // Idempotent: re-granting an identical live responsibility is a no-op
      // rather than a unique-constraint error surfaced to the administrator.
      return { success: true, data: { id: existing.id } };
    }

    const grant = await prisma.associationRoleGrant.create({
      data: {
        userId: validated.userId,
        leagueId: validated.leagueId,
        role: validated.role,
        scopeType: validated.scopeType,
        notes: validated.notes ?? null,
        grantedById: actingUserId,
        ...scope.data,
      },
      select: { id: true },
    });

    await logAuditEvent({
      action: AuditAction.USER_ROLE_ASSIGNED,
      userId: actingUserId,
      leagueId: validated.leagueId,
      teamId: scope.data.teamId ?? undefined,
      details: {
        grantId: grant.id,
        subjectUserId: validated.userId,
        role: validated.role,
        scopeType: validated.scopeType,
        scopeId: scope.scopeId,
      },
      timestamp: new Date(),
    });

    revalidatePath(`/league/${validated.leagueId}/workforce`);
    return { success: true, data: { id: grant.id } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid input.", details: error.issues };
    }
    rethrowIfNextRedirectError(error);
    console.error("Error granting association responsibility:", error);
    return { success: false, error: "Failed to grant the responsibility. Please try again." };
  }
}

const revokeSchema = z.object({
  grantId: cuid,
  leagueId: cuid,
});

export async function revokeAssociationResponsibility(
  input: z.infer<typeof revokeSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const actingUserId = await requireUserId();
    const validated = revokeSchema.parse(input);

    if (!(await requireGrantAdministration(actingUserId, validated.leagueId))) {
      return { success: false, error: "You do not have permission to revoke responsibilities." };
    }

    // Scoped by leagueId as well as id: a grant id from another association
    // must not be revocable by this association's administrators.
    const grant = await prisma.associationRoleGrant.findFirst({
      where: { id: validated.grantId, leagueId: validated.leagueId },
      select: { id: true, state: true, userId: true, role: true, teamId: true },
    });
    if (!grant) {
      return { success: false, error: "That responsibility could not be found." };
    }
    if (grant.state === "REVOKED") {
      return { success: true, data: { id: grant.id } };
    }

    // Revoked rows are kept as history; the ACTIVE-only unique indexes are what
    // allow the same responsibility to be granted again later.
    await prisma.associationRoleGrant.update({
      where: { id: grant.id },
      data: { state: "REVOKED", revokedAt: new Date(), revokedById: actingUserId },
    });

    await logAuditEvent({
      action: AuditAction.USER_ROLE_REMOVED,
      userId: actingUserId,
      leagueId: validated.leagueId,
      teamId: grant.teamId ?? undefined,
      details: { grantId: grant.id, subjectUserId: grant.userId, role: grant.role },
      timestamp: new Date(),
    });

    revalidatePath(`/league/${validated.leagueId}/workforce`);
    return { success: true, data: { id: grant.id } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid input.", details: error.issues };
    }
    rethrowIfNextRedirectError(error);
    console.error("Error revoking association responsibility:", error);
    return { success: false, error: "Failed to revoke the responsibility. Please try again." };
  }
}

export interface ResponsibilityGrantRow {
  id: string;
  role: AssociationRole;
  scopeType: AssociationRoleScopeType;
  scopeLabel: string;
  user: { id: string; name: string | null; email: string };
  createdAt: Date;
}

export async function listAssociationResponsibilityGrants(
  leagueId: string,
): Promise<ActionResult<ResponsibilityGrantRow[]>> {
  try {
    const actingUserId = await requireUserId();

    if (!(await requireGrantAdministration(actingUserId, leagueId))) {
      return { success: false, error: "You do not have permission to view responsibilities." };
    }

    const grants = await prisma.associationRoleGrant.findMany({
      where: { leagueId, state: "ACTIVE" },
      select: {
        id: true,
        role: true,
        scopeType: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
        division: { select: { name: true } },
        team: { select: { name: true } },
        season: { select: { name: true } },
        event: { select: { title: true } },
        signupEvent: { select: { title: true } },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    });

    return {
      success: true,
      data: grants.map((grant) => ({
        id: grant.id,
        role: grant.role,
        scopeType: grant.scopeType,
        scopeLabel:
          grant.division?.name ??
          grant.team?.name ??
          grant.season?.name ??
          grant.event?.title ??
          grant.signupEvent?.title ??
          "Entire association",
        user: grant.user,
        createdAt: grant.createdAt,
      })),
    };
  } catch (error) {
    rethrowIfNextRedirectError(error);
    console.error("Error listing association responsibilities:", error);
    return { success: false, error: "Failed to load responsibilities." };
  }
}

const inviteSchema = grantSchema.omit({ userId: true }).extend({
  email: z.string().email("A valid email address is required").max(255),
});

export type InviteAssociationOperatorInput = z.infer<typeof inviteSchema>;

/**
 * Invite somebody who may not have an account yet, carrying the intended
 * responsibility on the invitation. The grant is applied at acceptance (see
 * `acceptInvitationMemberships` in lib/actions/auth.ts) so an unaccepted
 * invitation never confers authority.
 */
export async function inviteAssociationOperator(
  input: InviteAssociationOperatorInput,
): Promise<ActionResult<{ invitationId: string }>> {
  try {
    const actingUserId = await requireUserId();
    const validated = inviteSchema.parse(input);

    if (!(await requireGrantAdministration(actingUserId, validated.leagueId))) {
      return { success: false, error: "You do not have permission to invite operators." };
    }

    if (!supportedScopesForRole(validated.role).includes(validated.scopeType)) {
      return {
        success: false,
        error: `${validated.role} cannot be granted at ${validated.scopeType} scope.`,
      };
    }

    const scope = normalizeScope(validated);
    if (!scope.ok) {
      return { success: false, error: scope.error };
    }

    if (!(await scopeBelongsToLeague(validated.leagueId, validated.scopeType, scope.scopeId))) {
      return { success: false, error: "That scope does not belong to this association." };
    }

    // Same construction as the other invitation senders. It cannot be imported
    // from lib/actions/invitations.ts: that file is "use server", so every
    // export there must be an async action, not a helper.
    const token = randomBytes(32).toString("hex");

    const invitation = await prisma.invitation.create({
      data: {
        email: validated.email.toLowerCase(),
        token,
        leagueId: validated.leagueId,
        invitedById: actingUserId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        associationRole: validated.role,
        associationScopeType: validated.scopeType,
        // TEAM and ASSOCIATION reuse the invitation's existing columns; the
        // rest get their own so acceptance can apply any scope the grant model
        // supports.
        teamId: validated.scopeType === "TEAM" ? scope.data.teamId : null,
        associationDivisionId: scope.data.divisionId,
        associationSeasonId: scope.data.seasonId,
        associationEventId: scope.data.eventId,
        associationSignupEventId: scope.data.signupEventId,
      },
      select: { id: true },
    });

    revalidatePath(`/league/${validated.leagueId}/workforce`);
    return { success: true, data: { invitationId: invitation.id } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid input.", details: error.issues };
    }
    rethrowIfNextRedirectError(error);
    console.error("Error inviting association operator:", error);
    return { success: false, error: "Failed to send the invitation. Please try again." };
  }
}
