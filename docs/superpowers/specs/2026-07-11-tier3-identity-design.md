# Tier 3 — Identity Graph: Design

**Date:** 2026-07-11
**Status:** Approved direction (roadmap D5; audit identity-crosscut recommendation)
**Parent:** `2026-07-11-observation-audit-roadmap-design.md`
**Branch:** `feat/audit-tier3-identity` (stacked on `feat/audit-tier2-features`, PR #266)

Activates the unwired identity seams. Explicitly NOT a unified-Person refactor —
`User` remains the hub; all additions are edges and columns.

## Decisions locked here

- **League identity rule (canonical):** explicit `LeagueUser` rows, synced.
  Every TeamMember of a league team gets a `LeagueUser` MEMBER row (TEAM_ADMIN
  for team ADMINs) created at: invitation acceptance, `migrateTeamToLeague`,
  and team-joins-league transitions. One-off backfill in the migration.
  Derivation checks remain as fallback but the row is the source of truth.
- **RSVP semantics (D5):** existing `playerId = null` rows remain valid
  "self/household" responses. Guardians (and admins) answer per child via rows
  carrying `playerId`. Event fan-out is unchanged (per-user NO_RESPONSE rows);
  per-child rows are created on response (upsert). Reminders stay user-level
  in this tier.
- **Attendance counting:** an event's attendance view lists player-level
  responses where they exist and user-level otherwise; counts deduplicate
  (a user row + their child rows are distinct entries — the child rows count
  as players attending, the user row as the adult's own response).

## X1 — Schema migration (one migration: `identity_graph`)

- `PlayerGuardian { id, playerId → Player (Cascade), userId → User (Cascade),
  relationship String?, canRsvp Boolean @default(true), createdAt,
  @@unique([playerId, userId]), @@index([userId]) }`.
- `RSVP.playerId String?` → Player (Cascade), `@@index([playerId])`.
  Uniqueness: drop `@@unique([userId, eventId])`; add
  `@@unique([userId, eventId, playerId])` PLUS a raw-SQL partial unique index
  `ON "RSVP"(userId, eventId) WHERE "playerId" IS NULL` (Postgres treats NULLs
  as distinct in composite uniques). Existing rows keep `playerId = null`.
- `Invitation` unified-target: add `leagueId String?`, `organizationId
  String?`, `officialRole TeamOfficialRole?`, `venueRole` (existing venue role
  enum) — `teamId` becomes optional; raw-SQL CHECK constraint: exactly one of
  (teamId, leagueId, organizationId) non-null (pattern exists on SignupEvent).
  Existing rows (teamId set) remain valid.
- LeagueUser backfill (data migration SQL): insert missing LeagueUser rows for
  every TeamMember of a league-linked team (role MEMBER; TEAM_ADMIN where
  TeamMember.role = ADMIN), ON CONFLICT DO NOTHING.
- Apply via `db:wake` + `db:migrate`; fallback hand-authored SQL; always
  `db:generate`.

## Interface contracts (implement/consume against these — enables parallel work)

```ts
// lib/actions/rsvp.ts (X2 implements, X3 consumes)
submitRSVP({ eventId, status, playerId? }): ActionResult<...>
// playerId present → authz: viewer is guardian with canRsvp of that player
// (PlayerGuardian) OR team ADMIN; upsert keyed on (userId, eventId, playerId).
getEventAttendance(eventId): ActionResult<{
  entries: Array<{ kind: 'user'|'player'; name: string; status: RSVPStatus;
                   respondedByName?: string }>,
  counts: Record<RSVPStatus, number>
}>

// lib/actions/guardians.ts (X2 implements, X6 consumes)
addGuardian({ playerId, email, relationship? })      // team ADMIN; existing User by email
removeGuardian({ guardianId })                        // team ADMIN or the guardian themself
listGuardians(playerId)                               // team ADMIN or guardian
getMyPlayers(): ActionResult<Array<{ playerId, playerName, teamId, teamName,
  canRsvp, upcoming: Array<{ eventId, title, startAt, myChildStatus }> }>>

// lib/data/dashboard.ts (X3 owns this tier)
getNeedsRsvp(...) returns per-identity pending rows:
  Array<{ eventId, ..., target: { kind: 'self' } | { kind: 'player',
          playerId, playerName } }>
```

## X2 — Guardian + per-child RSVP server logic

Owns: `lib/actions/rsvp.ts`, NEW `lib/actions/guardians.ts`,
`lib/utils/validation.ts`, `lib/actions/events.ts` (fan-out untouched;
attendance queries updated), `app/api/cron/**` (verify reminders still compile
against the RSVP shape; behavior unchanged), `prisma/seed.ts` (guardian +
per-child RSVP fixtures), types file additions.

## X3 — RSVP UI

Owns: `components/features/events/**` (RSVPButtons → per-identity rows for
guardians: self + one row per linked player with canRsvp; attendance list
shows player-level entries with "answered by" attribution),
`components/features/dashboard/widgets/NeedsRsvpWidget.tsx`,
`lib/data/dashboard.ts`, `app/(dashboard)/events/[id]/**` (attendance
section). Implements against the X2 contracts.

## X4 — Unified invitation + league-identity sync + account-less invites

Owns: `lib/actions/invitations.ts`, `lib/actions/auth.ts`,
`lib/actions/league.ts`, `lib/auth/session.ts`, `lib/actions/venue-staff.ts`,
`lib/actions/team-officials.ts`, `lib/email/templates.ts`,
`app/api/invitations/**`, invitation acceptance UI touchpoints.

- Extend invitation create/accept for league and venue-org targets with role
  payloads; acceptance creates the right membership row (LeagueUser /
  VenueStaff / TeamOfficial link) inside the existing transactions.
- Account-less venue staff + official invites: Invitation row up front;
  VenueStaff/TeamOfficial row created (or userId-linked) at acceptance —
  closes the Tier 2 W3 "sign up first" gap.
- League-identity sync (canonical rule): `ensureLeagueUser` helper applied at
  team-invitation acceptance for league teams and inside
  `migrateTeamToLeague`.
- Fix `isSystemAdmin` mislabel in `lib/auth/session.ts` (any LEAGUE_ADMIN
  passes a check named system-wide): rename to what it means
  (`isAnyLeagueAdmin`) and update call sites.

## X6 — Guardian UI

Owns: `components/features/roster/**` (PlayerCard guardian chips + manage
dialog, AddGuardianDialog), `app/(dashboard)/roster/**`, NEW "My players"
surface (section on the dashboard is X3's widget; here: roster-side guardian
management only).

## Sequencing

X1 first (schema + contracts landed in types). Then X2/X3/X4/X6 in parallel
against the interface contracts above. X3 consumes X2's module — both
implement to this spec's signatures; integration pass reconciles drift.

## Out of scope

Person entity/RoleAssignment refactor (rejected), per-child reminder fan-out
(user-level reminders stay), RSVP.playerId backfill (no historical inference),
household messaging preferences.

## Verification

`bun run type-check`, `lint`, `test`, `build`; migration applied to dev DB +
`db:generate` consistency; seed re-run green (guardian fixtures); manual
smoke: guardian answers per child, attendance shows attribution, league-team
invite acceptance creates LeagueUser row, account-less staff invite round-trip.
