/**
 * League access levels, with no imports.
 *
 * Lives apart from lib/utils/security.ts because this enum is a *runtime* value
 * that client components legitimately need (to label a role, to switch on a
 * level). Importing it from security.ts drags in the session helpers, auth.ts,
 * and ultimately `next/headers` and node:dns, none of which can be bundled for
 * the browser — which is what made components/features/admin/*PermissionManager
 * unbuildable the moment either was first mounted.
 *
 * security.ts re-exports this, so existing server-side importers are unchanged.
 */
export enum LeagueAccessLevel {
  NONE = 0,
  MEMBER = 1,
  TEAM_ADMIN = 2,
  LEAGUE_ADMIN = 3,
}
