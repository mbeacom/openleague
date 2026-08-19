import type {
  AssociationRole,
  AssociationRoleScopeType,
} from "@prisma/client";

/**
 * The role/capability/scope allowlist, with no runtime dependencies.
 *
 * Separated from lib/auth/capabilities.ts so that callers needing only the
 * matrix — invitation acceptance, form validation — do not transitively import
 * Prisma and the session helpers. Those pull next-auth into the module graph,
 * which broke unrelated tests that never touch authorization.
 */

/**
 * Capability families from plan.md. These are coarser than the gear `Permission`
 * enum on purpose: association work is delegated in whole responsibilities, not
 * individual verbs.
 *
 * Gear is absent from this enum by design — equipment managers are authorized
 * through the existing gear `Permission` checks in `lib/utils/permissions.ts`
 * rather than a second scheme the gear actions would never consult. The scope
 * matrix that feeds those checks is `grantsAllowGearAction` below.
 */
export enum Capability {
  /** Association administration, audit, export, and conflict override. */
  ADMINISTER_ASSOCIATION = "administer_association",
  /** Venue reservations and ice requests. */
  MANAGE_VENUE_RESERVATIONS = "manage_venue_reservations",
  /** Schedules, games, and proposals. */
  MANAGE_SCHEDULE = "manage_schedule",
  /** Rosters, placements, registration eligibility and reporting. */
  MANAGE_ROSTER = "manage_roster",
  /** Payments, refunds, and financial reports. */
  MANAGE_PAYMENTS = "manage_payments",
  /** Public content and operational communications. */
  MANAGE_PUBLIC_CONTENT = "manage_public_content",
  /** Team administration. */
  MANAGE_TEAM = "manage_team",
  /** Practice plans and practice participation. */
  MANAGE_PRACTICE = "manage_practice",
  /** Volunteer needs and assignments. */
  MANAGE_VOLUNTEERS = "manage_volunteers",
  /** Administration of one exact Event or SignupEvent. */
  MANAGE_EVENT = "manage_event",
}

interface RoleEntry {
  capabilities: Capability[];
  /** Scopes a grant of this role may legitimately be recorded at. */
  scopes: AssociationRoleScopeType[];
}

const ALL_CAPABILITIES = Object.values(Capability);

/**
 * Role → capabilities and supported scopes (plan.md "Default operational role
 * matrix"). Anything absent fails closed.
 */
export const ROLE_CAPABILITY_MATRIX: Record<AssociationRole, RoleEntry> = {
  ASSOCIATION_ADMIN: {
    capabilities: ALL_CAPABILITIES,
    scopes: ["ASSOCIATION"],
  },
  SCHEDULER: {
    capabilities: [
      Capability.MANAGE_VENUE_RESERVATIONS,
      Capability.MANAGE_SCHEDULE,
      Capability.MANAGE_PRACTICE,
    ],
    scopes: ["ASSOCIATION", "DIVISION", "TEAM", "SEASON"],
  },
  REGISTRAR: {
    capabilities: [Capability.MANAGE_ROSTER],
    scopes: ["ASSOCIATION", "DIVISION", "TEAM", "SEASON"],
  },
  TREASURER: {
    capabilities: [Capability.MANAGE_PAYMENTS],
    scopes: ["ASSOCIATION"],
  },
  COMMUNICATIONS_LEAD: {
    capabilities: [Capability.MANAGE_PUBLIC_CONTENT],
    scopes: ["ASSOCIATION", "DIVISION", "TEAM"],
  },
  TEAM_MANAGER: {
    capabilities: [
      Capability.MANAGE_TEAM,
      Capability.MANAGE_ROSTER,
      Capability.MANAGE_PRACTICE,
      Capability.MANAGE_VOLUNTEERS,
    ],
    scopes: ["TEAM"],
  },
  COACH: {
    capabilities: [Capability.MANAGE_PRACTICE],
    scopes: ["TEAM", "SEASON"],
  },
  VOLUNTEER_COORDINATOR: {
    capabilities: [Capability.MANAGE_VOLUNTEERS],
    scopes: ["ASSOCIATION", "DIVISION", "TEAM", "SEASON", "EVENT"],
  },
  EVENT_MANAGER: {
    capabilities: [Capability.MANAGE_EVENT],
    scopes: ["EVENT", "SIGNUP_EVENT"],
  },
  EQUIPMENT_MANAGER: {
    // Intentionally empty: gear authority flows through the gear Permission
    // bridge in lib/utils/permissions.ts, not through association capabilities.
    capabilities: [],
    scopes: ["ASSOCIATION", "DIVISION", "TEAM"],
  },
};

/**
 * Gear actions, expressed coarsely so this module never imports the `Permission`
 * enum from lib/utils/permissions.ts — that module calls into here, and naming
 * the enum in both directions would be an import cycle.
 */
export type GearAction =
  /** Association-wide inventory administration. */
  | "MANAGE_INVENTORY"
  /** Association-wide public wishlist administration. */
  | "MANAGE_WISHLIST"
  /** Team-scoped gear needs and requests; always requires an exact teamId. */
  | "TEAM_NEED_OR_REQUEST";

/** Scopes a role may be granted at, for validating grant input. */
export function supportedScopesForRole(
  role: AssociationRole,
): AssociationRoleScopeType[] {
  return ROLE_CAPABILITY_MATRIX[role]?.scopes ?? [];
}
