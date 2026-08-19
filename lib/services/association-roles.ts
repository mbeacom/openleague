import type {
  AssociationRole,
  AssociationRoleScopeType,
  Prisma,
} from "@prisma/client";

// Pure matrix module: importing lib/auth/capabilities here would pull Prisma
// and the session helpers (and thus next-auth) into the invitation-acceptance
// path, which is how an unrelated auth test lost its module resolution.
import { supportedScopesForRole } from "@/lib/auth/capability-matrix";

/**
 * Scope normalization and invitation-acceptance application for association
 * role grants (feature 007 US3).
 *
 * These live outside lib/actions/association-roles.ts on purpose: that file is
 * `"use server"`, where every export becomes a callable RPC endpoint. Applying
 * a grant takes a Prisma transaction client, which is neither serializable nor
 * something any client should be able to reach, so it belongs here instead.
 */

/** The scope column each scope type is required to populate. */
const SCOPE_FIELD = {
  ASSOCIATION: null,
  DIVISION: "divisionId",
  TEAM: "teamId",
  SEASON: "seasonId",
  EVENT: "eventId",
  SIGNUP_EVENT: "signupEventId",
} as const satisfies Record<AssociationRoleScopeType, string | null>;

/** The scope fields a caller may supply; `scopeType` selects which is used. */
export interface ScopeInput {
  scopeType: AssociationRoleScopeType;
  divisionId?: string;
  teamId?: string;
  seasonId?: string;
  eventId?: string;
  signupEventId?: string;
}

/**
 * Reduce the six optional scope ids to exactly the one `scopeType` names.
 *
 * Silently dropping the others matters: it means a caller cannot smuggle a
 * second scope past the database CHECK by sending extra ids, and the row we
 * write is the row the caller's `scopeType` describes.
 */
export function normalizeScope(input: ScopeInput): {
  ok: true;
  data: Record<string, string | null>;
  scopeId: string | null;
} | { ok: false; error: string } {
  const field = SCOPE_FIELD[input.scopeType];

  const empty = {
    divisionId: null,
    teamId: null,
    seasonId: null,
    eventId: null,
    signupEventId: null,
  };

  if (field === null) {
    return { ok: true, data: empty, scopeId: null };
  }

  const value = input[field as keyof ScopeInput] as string | undefined;
  if (!value) {
    return { ok: false, error: `A ${input.scopeType.toLowerCase()} must be selected for this scope.` };
  }

  return { ok: true, data: { ...empty, [field]: value }, scopeId: value };
}

/**
 * Apply an invitation's pending responsibility, inside the acceptance
 * transaction. Exported for `acceptInvitationMemberships`.
 *
 * Re-validates the role/scope pairing rather than trusting the stored payload:
 * the matrix may have tightened between the invitation being sent and accepted,
 * and the stricter rule should win.
 */
export async function applyInvitationResponsibility(
  tx: Prisma.TransactionClient,
  invitation: {
    leagueId: string | null;
    teamId: string | null;
    invitedById: string;
    associationRole: AssociationRole | null;
    associationScopeType: AssociationRoleScopeType | null;
    associationDivisionId: string | null;
    associationSeasonId: string | null;
    associationEventId: string | null;
    associationSignupEventId: string | null;
  },
  userId: string,
): Promise<void> {
  const { associationRole: role, associationScopeType: scopeType, leagueId } = invitation;
  if (!role || !scopeType || !leagueId) return;

  if (!supportedScopesForRole(role).includes(scopeType)) return;

  const scope = normalizeScope({
    scopeType,
    divisionId: invitation.associationDivisionId ?? undefined,
    teamId: invitation.teamId ?? undefined,
    seasonId: invitation.associationSeasonId ?? undefined,
    eventId: invitation.associationEventId ?? undefined,
    signupEventId: invitation.associationSignupEventId ?? undefined,
  });
  if (!scope.ok) return;

  const existing = await tx.associationRoleGrant.findFirst({
    where: { userId, leagueId, role, scopeType, state: "ACTIVE", ...scope.data },
    select: { id: true },
  });
  if (existing) return;

  await tx.associationRoleGrant.create({
    data: {
      userId,
      leagueId,
      role,
      scopeType,
      grantedById: invitation.invitedById,
      ...scope.data,
    },
  });
}
