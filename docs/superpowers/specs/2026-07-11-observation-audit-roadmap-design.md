# Observation Audit Roadmap — Design

**Date:** 2026-07-11
**Status:** Approved (decisions D1–D8 confirmed by Mark; D6/D7 delegated and resolved below)
**Source:** 10-agent ground-truth codebase audit of 9 product observations (session workflow `wf_b305b186-2bb`)

## Summary

The audit found that most observed problems are features built to ~90% with the last
mile unwired — orphaned components, dead schema fields, spec'd flows stopped one task
short — plus a thin layer of genuine bugs. Two areas need real design work: the unified
calendar and the person/role identity graph. Everything else is wiring.

## Decisions

| # | Decision | Resolution |
|---|----------|-----------|
| D1 | League mode | **First-class surface.** Build the missing league routes (venues, settings, event detail, messages/new) rather than gating nav down. Many hockey programs are league-organized. Until routes exist, nav must not 404. |
| D2 | `/events` section | **Fold into `/calendar`.** `/events` redirects; creation stays at `/events/new`. |
| D3 | Venue admin scope | **Rink-operator-scoped.** `/venue-admin` is for venue organizations and their staff. Venue admins *may* later be granted team/league association (venue→team direction), but team admins are not steered into org creation. Staff invitation lifecycle (schema-ready, FR-023) is the path for additional venue admins. |
| D4 | Team officials | **Dedicated `TeamOfficial` model** (VenueStaff pattern): role enum + OTHER detail, optional `userId` (account linking encouraged, not required — link on invite acceptance like Player). Titles are descriptive by default; MANAGER (and similar) may carry team-level permissions via an explicit grant at assignment time (checkbox → TeamMember ADMIN), with possible league-level rollup TBD. |
| D5 | Per-child RSVP | **Required.** Tier 3 adds `PlayerGuardian` join table and optional `RSVP.playerId`; unique constraint migrates from `(userId, eventId)` to include `playerId` (nullable, backfill-safe). |
| D6 | Date/time pickers | **MUI X responsive pickers app-wide** (desktop popover, touch dialog), one shared component set speaking the existing wall-clock string formats. Revisit native mobile inputs only if user feedback demands it. |
| D7 | Dashboard ordering | **Schedule-first** (Upcoming Schedule → Needs Your RSVP → Admin Attention → Leagues/Messages). Admin cards below schedule. |
| D8 | Dark mode | **Invest.** Real dark mode via MUI `colorSchemes` reconciled with `globals.css` vars (Tier 2). Until then, force `color-scheme: light` to stop the current split-brain rendering. |

## Tier 0 — Bug-fix batch (this branch)

Pure fixes; no schema migrations, no product redesign.

1. **Nav & shell** — remove/repoint the four 404 nav destinations (league Venues,
   league/global Settings, league event detail, `messages/new` shortcut) pending D1
   route builds; `/events` page redirects to `/calendar` and leaves primary nav
   (creation remains at `/events/new`); sidebar selected-state uses prefix matching;
   delete the dead mobile branch in `DashboardNav`; add `app/(dashboard)/loading.tsx`.
2. **Dashboard** — return the real `LeagueUser` role from `getUserMode` (kills the
   hardcoded "League Admin" chip); make league cards link to the league dashboard;
   parallelize the request waterfall; `cache()` `getUserMode`; collapse the
   always-open `CreateTeamForm` behind a button.
3. **Venue admin triage** — redirect after successful org onboarding (stops duplicate
   orgs on resubmit); rewrite the empty state to point team/league facility owners at
   `/venues`; add a create-org CTA when orgs already exist; guard
   `getVenueAdminDashboard` against missing-migration environments (P2021/P2022).
4. **Play library wiring** — `library/new` and `library/[playId]/edit` routes mounting
   the orphaned `PlayEditor` via thin client wrappers onto the existing
   `createPlay`/`updatePlay` actions; force `isTemplate: true` in library flows; add
   header + empty-state CTAs; wire edit navigation; delete `PlayEditor.example.tsx`.
5. **Roster quick wins** — expose the existing `Player.position` column end-to-end
   (Zod schemas, actions, dialog, card, roster payload, types); write `Player.userId`
   at invitation acceptance (both new-user and existing-user paths) by matching the
   invitation email to the team's Player rows.
6. **Fixtures & misc** — replace non-cuid seed IDs so seeded rows pass `z.cuid()`
   action schemas; explain the league requirement in the proposals disabled state;
   use real `Event.endAt` in the league iCal export; force `color-scheme: light`
   stopgap per D8.

Deferred out of Tier 0 (noted for later tiers): venue-admin nav gating by staff
membership (needs layout data plumbing — Tier 1 app-shell), `Player` `@@index([userId])`
migration (bundle with the next schema migration), all-teams practices on dashboard
(Tier 1 dashboard widgets).

## Tier 1 — Foundations

- **App shell:** per-section `loading.tsx` skeletons, `error.tsx`/`not-found.tsx` at the
  `(dashboard)` group, shared `PageHeader`/`PageContainer`/`EmptyState` primitives swept
  across pages, real links (prefetch/cmd-click) via client `next/link` and
  `NextLinkComposites` at RSC boundaries.
- **Date/time fields (D6):** one `LocalizationProvider` hoisted into `ThemeProvider`;
  `DateTimeField`/`DateField`/`TimeField` wrappers speaking existing wall-clock strings
  (`YYYY-MM-DDTHH:MM`, `YYYY-MM-DD`, `HH:MM`) with hidden inputs for FormData forms;
  convert all 17 field sites; fix the `PracticeSessionEditor` browser/venue zone mix;
  wire or remove the dead `SpecialtyEventEditor` stub.
- **Dev fixture graph:** league + 2 divisions + 4 league-linked teams + role-matrix
  users (league admin / team admin with both role rows / member) + venue + season with
  in-window phases + proposals in PENDING/DECLINED/EXPIRED states; production
  DATABASE_URL guard; seed summary printout.
- **Dashboard v1 (D7):** page becomes a thin RSC shell; independent async widget RSCs
  stream under Suspense in schedule-first order; single `cache()`-deduped memberships
  fetch; `MessageRecipient @@index([userId, sentAt])` migration when the messages
  widget lands.

## Tier 2 — Feature completion

- **Unified calendar** (phased): (1) custom month grid + agenda over widened,
  windowed, multi-team Event data; (2) `getUserCalendarItems({from,to})` unioning
  Event / SeasonGame / PracticeSession / SignupEvent / VenueScheduleBlock scoped by
  the viewer's memberships, overlay toggle chips with URL state; (3) league
  `/schedule` replaced by the same component (league-locked scope); iCal export moves
  server-side. No new dependencies.
- **`TeamOfficial` model (D4)** with invite/link lifecycle and roster UI; reconcile
  the officials definition between roster UI and CSV export.
- **Venue staff invitations (D3):** `lib/actions/venue-staff.ts`
  (invite/accept/update/remove), staff panel page, email template; schema already
  models the lifecycle — zero migrations.
- **League mode build-out (D1):** create the missing league routes referenced by nav.
- **Dark mode (D8):** MUI `colorSchemes` + `globals.css` reconciliation.
- **Play starter pack:** curated drills as static PlayData with copy-on-demand
  "Add to my library" (`isTemplate: true` copies via existing `createPlay`).

## Tier 3 — Identity graph increment

Sequenced last; depends on the Player↔User link from Tier 0.

- `PlayerGuardian` join table (multi-guardian, per-guardian RSVP rights).
- `RSVP.playerId` (nullable) + unique-constraint migration for per-child RSVP (D5);
  update RSVP surfaces (buttons, reminders cron, attendance counts).
- One canonical league-identity rule (explicit `LeagueUser` rows synced on team
  join/leave vs derivation — decide at spec time); backfill league members in
  `migrateTeamToLeague`.
- Unified `Invitation` with exactly-one-target discriminator (team/league/venue-org)
  reusing the SignupEvent CHECK-constraint pattern.
- **Rejected:** unified Person/RoleAssignment polymorphic refactor — the `User` hub and
  four FK'd role systems are sound; gaps are unwired seams, not wrong shape.

## Verification

Every tier lands behind: `bun run type-check`, `bun run lint`, `bun run test`
(modulo the two known pre-existing failures), and `bun run build` (required for route
changes — type-check misses App Router collisions).
