# Tier 2 — Feature Completion: Design

**Date:** 2026-07-11
**Status:** Approved direction (roadmap D1–D8); this doc specifies the Tier 2 workstreams
**Parent:** `2026-07-11-observation-audit-roadmap-design.md`
**Branch:** `feat/audit-tier2-features` (stacked on `feat/audit-tier1-foundations`, PR #265)

Seven workstreams with disjoint file ownership. W1 and W2 are internally
pipelined (data/schema stage feeds UI stages); the rest are single-stage.

## W1 — Unified calendar (three pipelined stages)

**W1a — Data layer + serialized-type cleanup**

- `lib/data/calendar.ts` (server-only reads, not Server Actions):
  `getUserCalendarItems({ from, to })` modeled on the `availability.ts` union
  pattern — parallel windowed Prisma queries scoped by the viewer's
  memberships: Events for all TeamMember teams (+ league events for LeagueUser
  leagues), shared/own PracticeSessions, SignupEvents where
  registered/managing/hosted, and PUBLISHED VenueScheduleBlocks for VenueStaff
  venues. Normalize to a `CalendarItem` discriminated union
  `{ id, source, title, startAt, endAt, timezone?, scope: { teamId?, leagueId?,
  venueId? }, href, color? }` with all dates ISO-serialized.
- Widen `getCalendarData` (`lib/actions/team-context.ts`): all of the user's
  teams + a bounded date window (fixes multi-team blindness and the unbounded
  query).
- Type cleanup deferred from PR #263 feedback: add `endAt: string | null` to
  the shared `LeagueEvent` (`types/events.ts`), update `getLeagueScheduleData`
  serialization, and remove `LeagueCalendar`'s local intersection type.

**W1b — CalendarView UI**

- New client `CalendarView` (`components/features/calendar/`): month grid
  (CSS grid, date-fns v4 interval math, zone-correct day bucketing per the
  VenueScheduleBoard pattern) + agenda list; month view on md+, agenda default
  below (mobile-first). Month navigation via URL searchParams + RSC refetch.
  Overflow days show "+N more" linking to the day's agenda.
- Overlay toggle chips (team/league/venue scopes derived from the feed),
  URL-persisted. Team color-coding via chips.
- `/calendar` page renders CalendarView fed by `getUserCalendarItems`.

**W1c — League schedule unification**

- Replace the league `/schedule` list with the same CalendarView,
  league-locked scope.
- Move iCal export server-side (route handler or server action returning the
  file) using real `endAt` (fallback +2h only when null).

## W2 — Schema migration + TeamOfficial (two pipelined stages)

**W2a — Schema + migration + actions**

- `prisma/schema.prisma`: new `TeamOfficial` model per the VenueStaff pattern:
  `{ id, teamId, userId String?, name, email String?, role TeamOfficialRole,
  roleDetail String?, status OfficialStatus (ACTIVE/INVITED/REMOVED),
  timestamps, @@index([userId]), @@index([teamId]),
  @@unique([teamId, email, role]) }`; enum `TeamOfficialRole` (HEAD_COACH,
  ASSISTANT_COACH, MANAGER, TREASURER, VOLUNTEER_COORDINATOR,
  PARENT_VOLUNTEER, OTHER). Same migration adds
  `MessageRecipient @@index([userId, sentAt])` (unblocks the messages widget)
  and `Player @@index([userId])` (deferred from Tier 0).
- Migration via `bun run db:migrate` (dev DB; `db:wake` first). Fallback if
  the DB is unreachable: hand-authored migration folder + SQL, applied later
  with `db:migrate:deploy`. Always `bun run db:generate`.
- `lib/actions/team-officials.ts`: create/update/remove/list, requireTeamAdmin,
  Zod schemas in `lib/utils/validation.ts`; link `userId` on invitation
  acceptance by email (same transactions as the Player link).
- Decision D4: role is descriptive; an explicit "grant team admin access"
  checkbox on create/edit may also upsert TeamMember ADMIN (kept separate from
  the taxonomy).

**W2b — Officials UI**

- `AddOfficialDialog` (clone AddPlayerDialog), `TeamOfficialCard` rewritten to
  show real role labels (chip = role, not permission), officials section in
  the roster page fed by `getTeamOfficials` (called from
  `app/(dashboard)/roster/page.tsx` — NOT team-context, which W1 owns).
- CSV export: officials rows use the new model + role column; reconcile the
  old ADMIN-based definition.
- Migration seed: none — the officials section starts empty and admins add
  entries (auto-creating officials from ADMIN members was rejected: titles are
  unknowable).

## W3 — Venue staff invitations (D3)

- `lib/actions/venue-staff.ts`: inviteVenueStaff (existing-User email match —
  account-less invites deferred to Tier 3's unified Invitation since
  VenueStaff.userId is required), acceptVenueStaffInvite (INVITED→ACTIVE +
  joinedAt), updateStaffRole, removeStaff (REMOVED). Owner-only management,
  self-accept. Zod schemas local to the module (validation.ts is W2-owned).
- Staff panel: `app/(dashboard)/venue-admin/[organizationId]/staff/page.tsx`
  (list + invite dialog + role select + remove), linked from the venue-admin
  dashboard card.
- Email template in `lib/email/templates.ts` (invite notification with link to
  the staff page).

## W4 — League route build-out (D1)

- `/league` landing page: league join/create (reuse the existing
  OnboardingFlow/league creation components) for users without leagues; league
  list linking to `/league/[id]/dashboard` for users with them.
- `/league/[leagueId]/settings`: league profile edit (name, description,
  sport) via existing league update action if present, else a minimal new one;
  LEAGUE_ADMIN-gated.
- `/league/[leagueId]/venues`: league-scoped venue list reusing the venues
  components/queries.
- Restore the nav items removed in Tier 0 (`roadmap-D1` comment markers in
  DashboardNav, MobileNavigation) and repoint ProposalInbox's empty-state link
  back to `/league`.

## W5 — Dark mode (D8)

- `lib/theme.ts`: MUI `colorSchemes` (light + dark) with `cssVariables`
  enabled; dark palette derived from the Digital Playbook colors (League Blue
  ramps on dark surfaces, preserved Scoreboard Green / Penalty Box Red
  semantics).
- `app/globals.css`: remove the forced `color-scheme: light` stopgap;
  reintroduce scheme-aware CSS vars wired to MUI's attribute selector.
- `ThemeToggle` component (light/dark/system) using MUI's `useColorScheme`,
  mounted in the dashboard layout header area; preference persists via MUI's
  default localStorage mechanism; no SSR flash (InitColorSchemeScript).
- Keep existing theme tests green; update snapshots/assertions if scheme
  restructuring requires.

## W6 — Play starter pack

- `lib/data/starter-plays.ts`: 8–10 curated hockey drills/plays as static
  PlayData (breakout, 3-man weave, power-play umbrella, penalty-kill box,
  forecheck 1-2-2, cycle down low, point shot w/ screen, regroup) with
  accurate coordinates for the existing RinkBoard geometry.
- PlayLibrary: "Starter plays" section (manage mode) rendering the static pack
  with per-card "Add to my library" calling the existing `createPlay`
  (`isTemplate: true`) to give the team an editable copy; hide already-copied
  starters by name match.

## W7 — Recent messages widget

- `RecentMessagesWidget`: viewer's latest MessageRecipient rows (teaser + link
  to the league messages page), Suspense-wrapped like the Tier 1 widgets;
  query in `lib/data/dashboard.ts` (W7-owned this tier). Rides W2a's
  `MessageRecipient @@index([userId, sentAt])`.

## File-ownership map (concurrent-safety)

- W1: `lib/data/calendar.ts`, `lib/actions/team-context.ts`,
  `lib/actions/league-context.ts`, `types/events.ts`,
  `components/features/calendar/**`, `app/(dashboard)/calendar/**`,
  `app/(dashboard)/league/[leagueId]/schedule/**`
- W2: `prisma/schema.prisma`, `prisma/migrations/**`,
  `lib/actions/team-officials.ts`, `lib/utils/validation.ts`,
  `lib/actions/{auth,invitations}.ts`, `types/roster.ts`,
  `components/features/roster/**`, `app/(dashboard)/roster/page.tsx`,
  `app/api/roster/export/route.ts`
- W3: `lib/actions/venue-staff.ts`, `lib/email/templates.ts`,
  `app/(dashboard)/venue-admin/**`
- W4: `app/(dashboard)/league/page.tsx`,
  `app/(dashboard)/league/[leagueId]/{settings,venues}/**`,
  `components/features/dashboard/DashboardNav.tsx`,
  `components/features/navigation/MobileNavigation.tsx`,
  `lib/hooks/useLeagueKeyboardShortcuts.ts`,
  `components/features/seasons/ProposalInbox.tsx`, `lib/actions/league.ts`
- W5: `lib/theme.ts`, `app/globals.css`,
  `components/providers/ThemeProvider.tsx`, `components/ui/ThemeToggle.tsx`,
  `app/(dashboard)/layout.tsx`, theme test files
- W6: `lib/data/starter-plays.ts`, `components/features/practice-planner/**`
- W7: `lib/data/dashboard.ts`,
  `components/features/dashboard/widgets/RecentMessagesWidget.tsx`,
  `app/(dashboard)/dashboard/page.tsx`

## Out of scope (Tier 3)

PlayerGuardian + per-child RSVP (D5), unified Invitation (account-less venue
staff and league invites), canonical league-identity rule, per-session play
diagram persistence (`PracticeSessionPlay.playData`).

## Verification

Single post-landing pass: `bun run type-check`, `bun run lint`, `bun run
test`, `bun run build`, plus `bun run db:generate` consistency and a seed dry
run if the migration landed. Manual smoke: calendar month/agenda with overlay
chips, dark-mode toggle without flash, officials CRUD, staff invite flow.
