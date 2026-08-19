import type {
  AssociationRole,
  AssociationRoleScopeType,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { LeagueAccessLevel, getUserLeagueAccessLevel } from "@/lib/utils/security";
import {
  Capability,
  ROLE_CAPABILITY_MATRIX,
  supportedScopesForRole,
  type GearAction,
} from "@/lib/auth/capability-matrix";

export { Capability, ROLE_CAPABILITY_MATRIX, supportedScopesForRole };
export type { GearAction } from "@/lib/auth/capability-matrix";

/**
 * Delegated capability resolution for feature 007 / User Story 3.
 *
 * `AssociationRoleGrant` is the only source of delegated authority. Two things
 * are deliberately NOT authorization sources:
 *
 *  - `TeamOfficial`, which is a descriptive label ("Head Coach") that anyone
 *    may be given for a roster listing. Spec 007 US3 says twice that it never
 *    grants capability, so nothing here reads it.
 *  - `VenueStaff`, which stays in the venue organization model. Venue authority
 *    is not mirrored into association grants.
 *
 * The matrix below is an allowlist. A role/capability/scope combination that is
 * not written down produces `false`, so new roles or scopes fail closed until
 * someone states what they may do.
 */

/**
 * Capabilities a pre-existing team admin keeps while the backfill (T063) has
 * not run. Mirrors TEAM_MANAGER, which is the role that describes what a team
 * admin could already do.
 */
const LEGACY_TEAM_ADMIN_CAPABILITIES = ROLE_CAPABILITY_MATRIX.TEAM_MANAGER.capabilities;

/** The scope target a caller is asking about. At most one is meaningful. */
export interface CapabilityTarget {
  teamId?: string | null;
  divisionId?: string | null;
  seasonId?: string | null;
  eventId?: string | null;
  signupEventId?: string | null;
}

export interface HasCapabilityOptions extends CapabilityTarget {
  userId: string;
  leagueId: string;
  capability: Capability;
}

/** The grant columns scope resolution needs. */
interface GrantRow {
  role: AssociationRole;
  scopeType: AssociationRoleScopeType;
  divisionId: string | null;
  teamId: string | null;
  seasonId: string | null;
  eventId: string | null;
  signupEventId: string | null;
}

/**
 * Load a user's ACTIVE grants for one association.
 *
 * Exported so the gear bridge in lib/utils/permissions.ts reads grants exactly
 * the same way rather than writing a second query with its own filters.
 */
export async function loadActiveGrants(
  userId: string,
  leagueId: string,
): Promise<GrantRow[]> {
  return prisma.associationRoleGrant.findMany({
    where: { userId, leagueId, state: "ACTIVE" },
    select: {
      role: true,
      scopeType: true,
      divisionId: true,
      teamId: true,
      seasonId: true,
      eventId: true,
      signupEventId: true,
    },
  });
}

/**
 * Is `teamId` currently in `divisionId` within this league?
 *
 * "Currently" is the point: division-scoped authority follows the division's
 * present membership, so moving a team out of a division removes the delegate's
 * reach over it without anyone editing a grant.
 */
async function teamIsInDivision(
  leagueId: string,
  teamId: string,
  divisionId: string,
): Promise<boolean> {
  const team = await prisma.team.findFirst({
    where: { id: teamId, divisionId, leagueId },
    select: { id: true },
  });
  return team !== null;
}

async function userAdministersTeam(
  leagueId: string,
  userId: string,
  teamId: string,
): Promise<boolean> {
  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      leagueId,
      isActive: true,
      members: { some: { userId, role: "ADMIN" } },
    },
    select: { id: true },
  });
  return team !== null;
}

/**
 * Does one grant's scope cover the requested target?
 *
 * A narrow grant never widens: a team-scoped grant asked about association-wide
 * work has nothing to match against and returns false rather than defaulting to
 * "any team".
 */
async function grantCoversTarget(
  leagueId: string,
  grant: GrantRow,
  target: CapabilityTarget,
): Promise<boolean> {
  switch (grant.scopeType) {
    case "ASSOCIATION":
      // Bounded by the required leagueId every grant row carries; the query
      // that loaded it already filtered on this league.
      return true;

    case "DIVISION": {
      if (!grant.divisionId) return false;
      if (target.divisionId) return target.divisionId === grant.divisionId;
      if (target.teamId) {
        return teamIsInDivision(leagueId, target.teamId, grant.divisionId);
      }
      return false;
    }

    case "TEAM":
      return Boolean(grant.teamId) && target.teamId === grant.teamId;

    case "SEASON":
      return Boolean(grant.seasonId) && target.seasonId === grant.seasonId;

    case "EVENT":
      return Boolean(grant.eventId) && target.eventId === grant.eventId;

    case "SIGNUP_EVENT":
      return Boolean(grant.signupEventId) && target.signupEventId === grant.signupEventId;

    default:
      // Unknown scope kind: fail closed rather than assume it is permissive.
      return false;
  }
}

/**
 * Does this grant authorize `capability` over `target`?
 *
 * Both halves must hold: the role must own the capability, AND the grant must
 * be recorded at a scope the role supports. The second check is what stops a
 * row written at an unsupported scope — by an older migration, a bug, or a
 * direct database edit — from authorizing anything.
 */
async function grantAuthorizes(
  leagueId: string,
  grant: GrantRow,
  capability: Capability,
  target: CapabilityTarget,
): Promise<boolean> {
  const entry = ROLE_CAPABILITY_MATRIX[grant.role];
  if (!entry) return false;
  if (!entry.capabilities.includes(capability)) return false;
  if (!entry.scopes.includes(grant.scopeType)) return false;

  return grantCoversTarget(leagueId, grant, target);
}

/**
 * Resolve whether a user holds `capability` over the given target.
 *
 * Order: legacy compatibility first (it needs no grant query), then grants.
 * Existing league admins keep full authority until the backfill in T063 gives
 * them real grants, so enabling this feature cannot lock an association out of
 * its own administration.
 */
export async function hasCapability(
  options: HasCapabilityOptions,
): Promise<boolean> {
  const { userId, leagueId, capability, ...target } = options;

  const accessLevel = await getUserLeagueAccessLevel(userId, leagueId);

  if (accessLevel === LeagueAccessLevel.LEAGUE_ADMIN) {
    return true;
  }

  if (
    accessLevel === LeagueAccessLevel.TEAM_ADMIN &&
    LEGACY_TEAM_ADMIN_CAPABILITIES.includes(capability) &&
    target.teamId
  ) {
    if (await userAdministersTeam(leagueId, userId, target.teamId)) {
      return true;
    }
  }

  const grants = await loadActiveGrants(userId, leagueId);
  for (const grant of grants) {
    if (await grantAuthorizes(leagueId, grant, capability, target)) {
      return true;
    }
  }

  return false;
}

/**
 * Throwing form, for Server Actions that have already established the user.
 */
export async function requireCapability(
  options: HasCapabilityOptions,
): Promise<void> {
  if (!(await hasCapability(options))) {
    throw new Error(`Capability denied: ${options.capability}`);
  }
}

/**
 * The equipment-manager scope matrix (data-model.md §6), plus the team manager's
 * narrow team gear rights.
 *
 * | Scope        | Equipment manager may                                    |
 * | ------------ | -------------------------------------------------------- |
 * | Association  | inventory, wishlist, and needs/requests for ANY team      |
 * | Division     | needs/requests for teams *currently* in the division      |
 * | Team         | needs/requests for that exact team                        |
 * | Season/Event | nothing — fails closed                                    |
 *
 * This is the bridge referenced in the header: gear authority is delegated
 * here, but it is *applied* by lib/utils/permissions.ts through the same
 * `hasPermission` entry point the gear actions already call, so no gear action
 * needs to learn about grants.
 */
export async function grantsAllowGearAction(options: {
  userId: string;
  leagueId: string;
  action: GearAction;
  teamId?: string | null;
}): Promise<boolean> {
  const { userId, leagueId, action, teamId } = options;

  // Team-scoped gear work is never league-wide by omission. Mirrors the same
  // rule in hasPermission so a grant cannot loosen it.
  if (action === "TEAM_NEED_OR_REQUEST" && !teamId) return false;

  const grants = await loadActiveGrants(userId, leagueId);

  for (const grant of grants) {
    if (grant.role === "EQUIPMENT_MANAGER") {
      switch (grant.scopeType) {
        case "ASSOCIATION":
          // Inventory and wishlist are association-level; team needs/requests
          // are allowed for any team in the association.
          return true;

        case "DIVISION":
          if (
            action === "TEAM_NEED_OR_REQUEST" &&
            teamId &&
            grant.divisionId &&
            (await teamIsInDivision(leagueId, teamId, grant.divisionId))
          ) {
            return true;
          }
          break;

        case "TEAM":
          if (action === "TEAM_NEED_OR_REQUEST" && teamId === grant.teamId) {
            return true;
          }
          break;

        default:
          // SEASON, EVENT, SIGNUP_EVENT: no gear meaning. Fail closed.
          break;
      }
      continue;
    }

    // Team managers may raise needs and requests for their own team, and
    // nothing else in the gear domain.
    if (
      grant.role === "TEAM_MANAGER" &&
      grant.scopeType === "TEAM" &&
      action === "TEAM_NEED_OR_REQUEST" &&
      teamId === grant.teamId
    ) {
      return true;
    }
  }

  return false;
}
