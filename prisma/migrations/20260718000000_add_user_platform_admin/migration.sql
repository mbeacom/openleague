-- Adds a real platform-admin flag on User.
--
-- Platform administration (approving/rejecting signups, enumerating all users)
-- was previously gated on "LEAGUE_ADMIN of any league", which any user could
-- self-grant by creating a throwaway league. This column backs an explicit,
-- non-self-grantable platform-admin grant (see lib/auth/session.ts
-- isPlatformAdmin(), which also honors a PLATFORM_ADMIN_EMAILS bootstrap
-- allowlist). Defaults to false so existing rows are unaffected.
ALTER TABLE "User" ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;
