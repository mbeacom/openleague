# Tier 1 — Foundations: Design

**Date:** 2026-07-11
**Status:** Approved direction (roadmap D1–D8); this doc specifies the four Tier 1 workstreams
**Parent:** `2026-07-11-observation-audit-roadmap-design.md`
**Branch:** `feat/audit-tier1-foundations` (stacked on `feat/audit-tier0-fixes`, PR #263)

Four independently shippable workstreams. A and B each have a foundation stage
(build the primitives) followed by an adoption stage (sweep consumers). C and D
are single-stage. File ownership is disjoint across concurrent streams.

## Workstream A — App shell

**A1 — Primitives + route states**

- `components/ui/PageHeader.tsx`: server-safe presentational component —
  `{ title, subtitle?, actions?, breadcrumbs? }`. Actions is a ReactNode slot
  (callers pass RSC-safe links via `NextLinkComposites`). Typography scales per
  the existing theme (athletic headline for title).
- `components/ui/PageContainer.tsx`: standardizes `Container maxWidth` + vertical
  padding (today three different `py` values and two widths exist across pages).
- `components/ui/EmptyState.tsx`: `{ icon?, title, description?, action? }` —
  MUI-styled, replaces bare-text empty states; action slot takes a
  LinkButton/Button.
- Route states for the `(dashboard)` group: `error.tsx` (client, MUI Alert +
  reset button), `not-found.tsx`, and per-section `loading.tsx` skeletons for the
  heaviest routes: roster, calendar, seasons, venues, venue-admin, league,
  practice-planner, my-registrations. Skeletons approximate each section's
  layout (header bar + card/list placeholders).

**A2 — Adoption sweep (three parallel sub-streams, disjoint page sets)**

- A2a: roster, calendar, events, team pages.
- A2b: seasons, league pages.
- A2c: venues, venue-admin, practice-planner, signup-events, my-registrations,
  admin pages.
- Each page: wrap content in `PageContainer`, replace ad-hoc header rows with
  `PageHeader`, replace bare empty states with `EmptyState`. Convert non-link
  navigation (`onClick` + `router.push`) to real links where encountered in
  owned files (client components use `next/link`; RSC contexts use
  `NextLinkComposites`).
- Explicitly excluded: `app/(dashboard)/dashboard/**` (workstream D owns) and
  form components (workstream B owns).

## Workstream B — Date/time fields (decision D6)

**B1 — Provider + field components**

- Hoist a single `LocalizationProvider` (AdapterDateFns, date-fns v4) into
  `components/providers/ThemeProvider.tsx` (already `"use client"`); delete the
  local provider in `PracticeSessionEditor`.
- `components/ui/date/DateTimeField.tsx`, `DateField.tsx`, `TimeField.tsx`:
  thin `"use client"` wrappers over MUI X `DateTimePicker`/`DatePicker`/
  `TimePicker` (responsive: popover desktop, dialog touch). API speaks the
  wall-clock strings forms already use — `'YYYY-MM-DDTHH:MM'`, `'YYYY-MM-DD'`,
  `'HH:MM'` — converting to/from a display `Date` internally; the `Date` object
  is never serialized. Each renders a hidden `<input name={...}>` with the
  canonical string so uncontrolled FormData-based forms keep working unchanged.
  Support `label`, `required`, `disabled`, `minDateTime`/`min`, `helperText`,
  `error`. 5-minute time step default.
- Unit tests mirroring `__tests__/lib/utils/date.test.ts` formats: round-trip
  string↔display, hidden-input emission, empty/invalid handling.
- Fix the `PracticeSessionEditor` zone mix: derive the booking day via
  `formatDateTimeLocalInput(date, selectedVenueTimeZone).slice(0, 10)` instead
  of browser-local `getFullYear/getMonth/getDate`.
- `SpecialtyEventEditor` dead stub: delete it if nothing renders it; if
  rendered, replace its inert fields with the new components and wire submit or
  gate it behind a "coming soon" state — investigate first.

**B2 — Form conversion (two parallel sub-streams, disjoint files)**

- B2a: `events/EventForm`, `events/InterTeamGameForm`, `signup-events/EventForm`,
  `signup-events/GameScheduler`, `signup-events/PhaseEditor`.
- B2b: `seasons/GameForm`, `seasons/ProposalForm`, `seasons/ProposalThread`,
  `seasons/SeasonForm`, `seasons/PhaseEditor`, `seasons/GenerationWizard`,
  `venue-admin/VenueScheduleBoard`, `venue-admin/IceTimeRequestForm`,
  `venue-admin/SurfaceManager`.
- Local swaps only: native `type="datetime-local|date|time"` TextFields become
  the shared fields. No serialization, Zod, or Server Action changes. Season
  date-only forms keep their UTC-calendar-date convention. Timezone stays
  implicit (venue zone > browser zone) with existing helper text.

## Workstream C — Dev fixture graph

Extend `prisma/seed.ts` (single entry, small named upsert helpers so it can
split into scenario modules later):

- `Metro Hockey League` (HOCKEY) with 2 divisions.
- 4 league teams (`isActive`, `leagueId`, `divisionId`) with cuid-shaped fixed
  IDs; keep the existing standalone teams untouched.
- Role-matrix users (all documented in the seed summary output):
  `league-admin@test.com` (LeagueUser LEAGUE_ADMIN), two team admins holding
  BOTH TeamMember ADMIN and LeagueUser TEAM_ADMIN rows, one plain member.
- One venue with a timezone; one league-owned season spanning now−30d…now+120d
  with 3 phases (pre-season/regular/playoffs) where one phase covers "now".
- Game proposals exercising the inbox: PENDING incoming, PENDING outgoing,
  DECLINED, EXPIRED (accept/counter flows left to manual testing).
- Production guard: refuse to run when `DATABASE_URL` doesn't look local/dev
  unless `FORCE_SEED=1`.
- Idempotent via upsert with fixed IDs; re-runs shift relative dates
  (acceptable for dev).

## Workstream D — Dashboard v1 (decision D7: schedule-first)

- `app/(dashboard)/dashboard/page.tsx` becomes a thin RSC shell: header +
  My Teams grid paint immediately; each widget is an independent async RSC in
  `components/features/dashboard/widgets/`, wrapped in `<Suspense>` with an MUI
  Skeleton card fallback.
- Widget order (D7): **UpcomingSchedule** (Events for ALL the user's teams +
  upcoming practice sessions, next 14 days, with the viewer's RSVP status
  chips) → **NeedsYourRSVP** (NO_RESPONSE RSVPs on future events, inline
  RSVPButtons reuse) → **AdminAttention** (admin-only: events with unanswered
  RSVPs, pending invitations) → **MyLeagues** (role-aware league cards via
  `LeagueOverviewCard` where data allows).
- Data layer: `lib/data/dashboard.ts` — read-only RSC queries (not Server
  Actions), all starting from one `cache()`-deduped memberships fetch (teams +
  roles, leagues + roles). Every query filters strictly by the viewer's own
  memberships. Widen `getDashboardData`/practices to all teams
  (`teamId: { in: [...] }`) — `lib/actions/team-context.ts` is owned by this
  stream.
- `TeamCard`: feed the existing `showStats` capability with `_count`
  (players, events).
- Deferred: RecentMessages widget (needs `MessageRecipient @@index([userId,
  sentAt])` migration — lands with the next schema migration), venue-admin
  panel, per-team feed tabs.

## Verification

Single pass after all streams land: `bun run type-check`, `bun run lint`,
`bun run test` (new date-field tests included), `bun run build` (new routes:
none expected beyond loading/error files — build validates the Suspense/RSC
composition). Manual smoke: dashboard streams under throttled network;
EventForm picker on desktop + touch emulation.

## Out of scope (later tiers)

Unified calendar (Tier 2), TeamOfficial model (Tier 2), venue staff invites
(Tier 2), league route build-out (Tier 2, D1), dark mode (Tier 2, D8),
PlayerGuardian/per-child RSVP (Tier 3, D5).
