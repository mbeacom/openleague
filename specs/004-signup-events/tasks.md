# Tasks: Signup Events & Event Day Management

**Input**: Design documents from `/specs/004-signup-events/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/server-actions.md

**Tests**: Included for the load-bearing logic the plan's verification phase names
(capacity, waitlist, eligibility, age gate, webhook branch, public data boundary).

**Organization**: Grouped by user story (US1–US9 from spec.md) so each slice is
independently implementable and testable. US1+US2 together are the MVP.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1–US9 for story phases; none for Setup/Foundational/Polish

---

## Phase 1: Setup

- [X] T001 Add `@vercel/blob` dependency via `bun add @vercel/blob` and commit lockfile
- [X] T002 [P] Add optional env vars `BLOB_READ_WRITE_TOKEN`, `EVENT_WAITLIST_CLAIM_HOURS` (default 24), `STATS_MIN_AGE_LEVEL` (default `SQUIRT_U10`) with helpers `isBlobConfigured`, `EVENT_WAITLIST_CLAIM_HOURS`, `STATS_MIN_AGE_LEVEL` in lib/env.ts; document in scripts/validate-env if applicable

---

## Phase 2: Foundational (blocking prerequisites)

**⚠️ CRITICAL**: complete before any user story work.

- [X] T003 Add all new enums and 12 models (SignupEvent, SignupSlot, EventRegistrationPhase, EventRegistration, EventInvitation, EventManager, EventTeam, EventTeamAssignment, EventGame, EventGameParticipant, PlayerGameStat, EventMediaItem) plus League extensions (slug, Stripe columns) and Payment generalization (optional registrationId/venueId/organizationId; new eventRegistrationId, leagueId) to prisma/schema.prisma per data-model.md, including all User/Team/Division/Venue/IceSurface/Player back-relations
- [X] T004 Create migration `add_signup_events` via `bun run db:migrate`, then append raw-SQL CHECK constraints (payments exactly-one registration link, exactly-one merchant, venue-implies-org; signup_events exactly-one host) to the generated migration.sql and re-apply; run `bun run db:generate`; commit schema + migration together
- [X] T005 [P] Create lib/utils/age-level.ts with ordered `AgeClassification` ranks, `isStatsEligible(classification)` honoring `STATS_MIN_AGE_LEVEL`, and display labels
- [X] T006 [P] Add host/manager auth helpers to lib/auth/session.ts: `getSignupEventAccess(eventId, userId)`, `requireEventManager(eventId)` (host org staff via VENUE_SCHEDULE_ROLES, LEAGUE_ADMIN, team ADMIN, or EventManager row), `requireHostAdmin(host)` for event creation/manager grants
- [X] T007 [P] Create lib/utils/public-signup-events.ts exporting `publicSignupEventSelect` whitelist + `toPublicRosterName(fullName)` (first name + last initial) per data-model.md public data boundaries
- [X] T008 [P] Add base Zod schemas to lib/utils/validation.ts: signupEventSchema (create/update, host XOR check, time sanity), signupSlotSchema, registrationPhaseSchema, eventRegistrationSchema, plus shared enums; export inferred types
- [X] T009 [P] Unit tests for age-level ranks/threshold and public-roster name formatting in __tests__/lib/utils/age-level.test.ts and __tests__/lib/utils/public-signup-events.test.ts

**Checkpoint**: schema migrated, helpers/tests in place — story phases may begin.

---

## Phase 3: User Story 1 — Organizer creates a signup event with role-limited slots (P1) 🎯 MVP

**Goal**: Hosts create/publish multi-slot events that appear on their pages/calendars.

**Independent Test**: create a 4-slot event as league admin, publish PUBLIC, see it on
public listings with per-slot capacities; non-admin creation refused.

- [X] T010 [US1] Implement lib/actions/signup-events.ts: `createSignupEvent`, `updateSignupEvent` (material-change notification queue), `publishSignupEvent` (≥1 slot; merchant check when online payments on; league slug generation on first PUBLIC publish), `cancelSignupEvent`, `duplicateSignupEvent`, `regenerateEventLink`, `getSignupEvent`, `listHostSignupEvents`, `listPublicSignupEvents` per contracts/server-actions.md
- [X] T011 [P] [US1] Add event lifecycle email templates (created→registrants n/a, updated-material-change, canceled) to lib/email/templates.ts
- [X] T012 [P] [US1] Build components/features/signup-events/EventForm.tsx, SlotEditor.tsx, PaymentConfigCard.tsx (manual handles fields; online toggle disabled until merchant onboarded), VisibilityPicker.tsx
- [X] T013 [US1] Build dashboard pages app/(dashboard)/signup-events/page.tsx (host-scoped list), new/page.tsx, [eventId]/page.tsx (overview + settings tabs, publish/cancel/duplicate actions)
- [X] T014 [US1] Build public pages app/(marketing)/events/page.tsx (PUBLIC discovery with host/venue/date/category filters) and app/(marketing)/events/[eventId]/page.tsx using `publicSignupEventSelect`
- [X] T015 [P] [US1] Roll PUBLIC venue-tied events into the rink public schedule page (app/(marketing)/rinks/[slug]/schedule/page.tsx section) and add a signup-events section to internal league/team calendar views
- [X] T016 [P] [US1] Add "Signup Events" navigation entries to components/features/dashboard/DashboardNav.tsx and the mobile More menu in components/features/navigation/MobileNavigation.tsx
- [X] T017 [P] [US1] Action tests (mocked Prisma) for create/publish/cancel authorization and host-XOR validation in __tests__/lib/actions/signup-events.test.ts

**Checkpoint**: events publishable & visible — no registration yet.

---

## Phase 4: User Story 2 — Participant registers for a slot (P1) 🎯 MVP

**Goal**: Free registration with per-slot capacity, roster, check-in, CSV export.

**Independent Test**: register participants into slots until one fills; verify per-slot
enforcement, confirmation email, self-cancel, roster view + export.

- [X] T018 [US2] Implement the slot reservation engine in lib/actions/event-registrations.ts: Serializable `reserveEventRegistration` counting CONFIRMED + held PENDING_PAYMENT + un-expired OFFERED, typed CapacityError, duplicate guard (slot + registrant + normalized participant name), P2034/P2028 friendly error (research R4/R11)
- [X] T019 [US2] Implement `registerForSignupEvent` (free path → CONFIRMED + email; visibility + window gate), `cancelMyEventRegistration` (cutoff enforced), `getMyEventRegistrations`, `getEventRoster` in lib/actions/event-registrations.ts
- [X] T020 [US2] Implement organizer roster mutations `setCheckIn`, `removeEventRegistration` (notify + free spot) in lib/actions/event-registrations.ts
- [X] T021 [P] [US2] Registration/confirmation/cancellation email templates in lib/email/templates.ts; 48 h reminder branch in app/api/cron/rsvp-reminders route honoring NotificationPreference
- [X] T022 [P] [US2] CSV export route app/api/signup-events/[eventId]/roster/export/route.ts (GET, `requireEventManager`, lib/utils/csv.ts)
- [X] T023 [P] [US2] Build RegisterDialog.tsx (slot pick, participant name(s), notes) and RosterTable.tsx (per-slot tabs, status/payment/check-in chips, remove/check-in actions, export button) in components/features/signup-events/
- [X] T024 [US2] Wire registration CTA into public event pages; add roster tab to dashboard [eventId] page; extend app/(dashboard)/my-registrations page with event registrations + cancel
- [X] T025 [P] [US2] Tests: concurrency-shaped capacity engine tests (mocked serializable conflicts + committed-count math) and duplicate-guard tests in __tests__/lib/actions/event-registrations.test.ts

**Checkpoint**: MVP complete — free SignUpGenius replacement usable end-to-end.

> **Implementation notes (2026-07-03)**: T012's SlotEditor/PaymentConfigCard/
> VisibilityPicker shipped integrated inside EventForm.tsx rather than as separate
> files. T015's internal league/team calendar sections are deferred to a follow-up
> (venue schedule rollup, public discovery, and dashboard nav shipped). Priced slots
> currently confirm with manual-payment (unpaid) tracking; online checkout arrives
> with US5. Waitlist joins arrive with US3 per the phase plan — full slots block
> registration until then.

---

## Phase 5: User Story 3 — Priority windows & waitlist backfill (P2)

**Goal**: Members-first phases; ordered waitlist with auto-offers and claim windows.

**Independent Test**: two-phase event, non-member waitlists in phase 1, phase 2 opens by
clock, cancellation triggers ordered offer with expiry cascade.

- [X] T026 [US3] Implement phase eligibility predicate `resolvePhaseEligibility(user, event, now)` (HOST_MEMBERS via LeagueUser/TeamMember/org relationships, SELECTED_GROUPS via linked divisions/teams, INVITEES, EVERYONE) in lib/actions/event-registrations.ts (research R6)
- [X] T027 [US3] Extend `registerForSignupEvent`: full slot or not-yet-open phase → WAITLISTED (waitlistJoinedAt); expose waitlist position in reads
- [X] T028 [US3] Implement promotion routine `promoteNextWaitlistEntries(slotId)` (sync cascade on cancel/remove/refund/capacity-increase; offerExpiresAt = min(now + EVENT_WAITLIST_CLAIM_HOURS, startAt)), `claimWaitlistOffer`, `declineWaitlistOffer`, `promoteWaitlistEntry` (manual, logged) in lib/actions/event-registrations.ts (research R5)
- [X] T029 [US3] Cron route app/api/cron/event-waitlist/route.ts (expire lapsed offers/holds → cascade; phase-open backfill) + add `*/10` cron entry to vercel.json
- [X] T030 [P] [US3] Waitlist offer/expiry email templates in lib/email/templates.ts
- [X] T031 [P] [US3] PhaseEditor.tsx (audiences, division/team pickers, opensAt) and WaitlistPanel.tsx (ordered list, positions, manual promote/remove) in components/features/signup-events/; waitlist tab on dashboard [eventId] page; "Join waitlist" state on public pages
- [X] T032 [P] [US3] Tests: eligibility predicate matrix and offer/expiry cascade (incl. simultaneous claim vs manual promote) in __tests__/lib/actions/event-waitlist.test.ts

**Checkpoint**: Mite Night priority scenario works with free events.

---

## Phase 6: User Story 4 — Invite-only & link access (P2)

**Goal**: Complete the four visibility tiers.

**Independent Test**: invite-only event blocks non-invitees, invitee lands ready to
register; LINK event reachable only via token; regeneration kills old link.

- [X] T033 [US4] Implement lib/actions/event-invitations.ts: `sendEventInvitations` (token gen, existing-user vs signup email variants, invitedUserId binding), `revokeEventInvitation`, `resendEventInvitation`, `listEventInvitations` + invitation schemas in lib/utils/validation.ts
- [X] T034 [US4] Accept route app/api/event-invitations/[token]/route.ts (signed-in match → event; unknown → signup flow carrying token; expired/revoked → friendly redirect)
- [X] T035 [US4] Enforce INVITE_ONLY gate in `getSignupEvent`/`registerForSignupEvent` (invitation email/user match) and add INVITEES audience support to the phase predicate; LINK route app/(marketing)/events/l/[token]/page.tsx
- [X] T036 [P] [US4] Invitation email templates (member + non-member variants) in lib/email/templates.ts
- [X] T037 [P] [US4] InvitePanel.tsx (bulk emails, status chips, resend/revoke) in components/features/signup-events/ + invitations tab on dashboard [eventId] page
- [X] T038 [P] [US4] Tests: visibility gate matrix (PRIVATE/INVITE_ONLY/LINK/PUBLIC × viewer types) in __tests__/lib/actions/event-visibility.test.ts

**Checkpoint**: all four visibility tiers enforced.

---

## Phase 7: User Story 5 — Payments (P3)

**Goal**: Priced slots with online (Stripe) + manual (Venmo/Zelle/Cash App/phone/cash)
collection; league merchants; refunds.

**Independent Test**: priced slot → online flow confirms only via webhook; manual flow
confirms immediately and tracks unpaid→paid; abandoned checkout frees the hold;
organizer refund reverses charge.

- [X] T039 [US5] Implement lib/actions/league-payments.ts (`startLeagueStripeOnboarding`, `refreshLeagueStripeStatus`, `getLeagueStripeDashboardLink`, `getLeaguePaymentsOverview`) persisting League Connect columns, reusing lib/payments/stripe.ts helpers unchanged
- [X] T040 [US5] Extend `registerForSignupEvent`/`claimWaitlistOffer` paid path: price snapshot, PENDING_PAYMENT hold + Payment(REQUIRES_PAYMENT, eventRegistrationId, org-or-league merchant), Checkout session with expires_at clamped to hold/offer window, rollback on checkout failure
- [X] T041 [US5] Extend app/api/webhooks/stripe/route.ts: branch on `payment.eventRegistrationId` (completed → slot re-count → confirm or overbook auto-refund; expired/failed/refunded → 003 state maps + sync waitlist promotion); `account.updated` syncs VenueOrganization **or** League by stripeAccountId
- [X] T042 [US5] Implement `setManualPaymentStatus` (UNPAID/PAID/WAIVED, logged) and `refundEventRegistration` (Stripe refund, → REFUNDED, free spot → promotion) in lib/actions/event-registrations.ts; cancel-event flow prompts refund follow-up list
- [X] T043 [P] [US5] League payments dashboard page app/(dashboard)/league/payments/page.tsx (Connect status card + revenue overview, reusing StripeConnectCard patterns)
- [X] T044 [P] [US5] Payment UX: method chooser in RegisterDialog (online vs manual instructions display), payment-status chips + mark-paid/refund actions in RosterTable, receipt links in my-registrations
- [X] T045 [P] [US5] Tests: webhook event-registration branch (idempotency, late-payment auto-refund, league account.updated) in __tests__/api/stripe-webhook-events.test.ts; manual payment status transitions in existing registration test file

**Checkpoint**: paid Mite Night runs end-to-end.

---

## Phase 8: User Story 6 — Delegated event management (P3)

**Goal**: Per-event manager grants with activity logging.

**Independent Test**: member granted manager manages one event only; actions logged;
revocation immediate.

- [X] T046 [US6] Implement lib/actions/event-managers.ts (`addEventManager` by email/userId, `removeEventManager`, `listEventManagers`; host-admin-only) and ensure every management mutation logs via a `logSignupEventActivity` helper (reuse AuditLog/VenueActivityLog pattern) capturing actor + action (FR-029)
- [X] T047 [P] [US6] ManagerPanel.tsx (grant by email, list, revoke) on the dashboard settings tab; activity log view for host admins
- [X] T048 [P] [US6] Tests: manager-scope authorization (event-scoped yes, entity settings no) in __tests__/lib/actions/event-managers.test.ts

**Checkpoint**: delegation matches FR-028/FR-029.

---

## Phase 9: User Story 7 — Team formation, games & rotations (P4)

**Goal**: Event teams from confirmed signups, floaters, half-ice games, rotations.

**Independent Test**: form teams from confirmed registrations, flag floaters, schedule
two overlapping half-ice games on different zones, assign floaters to both, publish,
participants see assignments; non-floater double-booking warns.

- [X] T049 [US7] Implement lib/actions/event-teams.ts: team CRUD (`createEventTeam`/`updateEventTeam`/`deleteEventTeam`), `assignToEventTeam` (primary assignment upsert + per-team position counts from slot names), `setFloater`
- [X] T050 [US7] Implement game scheduling in lib/actions/event-teams.ts: `createEventGame`/`updateEventGame`/`deleteEventGame` (two event teams, window inside event, surface + iceUsage/zoneLabel), `setGameRotation` (replace participation list; non-floater overlap → warnings[]), `publishEventTeams` (+assignment-change notifications)
- [X] T051 [P] [US7] Schemas for teams/games/rotations in lib/utils/validation.ts; team-published + assignment-change email templates in lib/email/templates.ts
- [X] T052 [P] [US7] TeamBoard.tsx (assign confirmed participants, origin club team via linked Player, position counts, floater flags) and GameScheduler.tsx (matchups, time, surface/zone, rotation editor with conflict warnings) in components/features/signup-events/; teams & games tab on dashboard [eventId] page; participant-facing "My team/games" section on event page
- [X] T053 [P] [US7] Surface event games on the venue schedule view where venue is on-platform (FR-032)
- [X] T054 [P] [US7] Tests: assignment uniqueness, floater multi-game rotation, overlap warning logic in __tests__/lib/actions/event-teams.test.ts

**Checkpoint**: event-day workflow complete.

---

## Phase 10: User Story 8 — Photo/video sharing (P5)

**Goal**: Participant media galleries with privacy-safe defaults and moderation.

**Independent Test**: participant uploads photo+video within limits; non-participant
blocked by default; organizer removes item/disables gallery; uploader deletes own.

- [X] T055 [US8] Create lib/media/blob.ts (Vercel Blob client, `isBlobEnabled()`, private put/delete, short-lived signed URL helper, size/type/duration limit constants per research R1)
- [X] T056 [US8] Upload token route app/api/signup-events/[eventId]/media/upload/route.ts (client-upload token exchange; authorize registrant/manager; enforce caps server-side)
- [X] T057 [US8] Implement lib/actions/event-media.ts: `finalizeEventMediaUpload`, `listEventMedia` (gallery-visibility check → signed URLs), `removeEventMediaItem` (organizer any/uploader own, best-effort blob delete, logged), `reportEventMediaItem` (→ FLAGGED at first report)
- [X] T058 [P] [US8] MediaGallery.tsx (upload with progress, grid, video playback, report/remove) in components/features/signup-events/; media tab + gallery settings (enable/visibility) on dashboard; gallery section on event page; hide feature entirely when `!isBlobEnabled()`
- [X] T059 [P] [US8] Tests: upload authorization + gallery visibility matrix (mocked Blob) in __tests__/lib/actions/event-media.test.ts

**Checkpoint**: media shipping; galleries hidden when Blob unconfigured.

---

## Phase 11: User Story 9 — Age-gated stats & tournaments (P5)

**Goal**: Scores/stats only at/above threshold; tournament standings.

**Independent Test**: U8 event exposes no score entry anywhere; SQUIRT_U10 event
records results; TOURNAMENT category rolls standings; downgrade hides stats.

- [X] T060 [US9] Implement `recordGameResult` (scores + optional per-player stats; Zod refinement **and** action-level `isStatsEligible` rejection; game → COMPLETED) in lib/actions/event-teams.ts; hide-on-downgrade behavior in all reads
- [X] T061 [P] [US9] Standings derivation for TOURNAMENT events (read-time from COMPLETED games) in lib/actions/event-teams.ts; results/standings sections on event page + dashboard (never rendered when ineligible)
- [X] T062 [P] [US9] GameResultForm.tsx + StandingsTable.tsx in components/features/signup-events/
- [X] T063 [P] [US9] Tests: age-gate refusal at schema and action level, downgrade hiding, standings math in __tests__/lib/actions/event-stats.test.ts

**Checkpoint**: all nine stories delivered.

---

## Phase 12: Polish & verification

- [ ] T064 [P] Public data boundary audit test: assert `publicSignupEventSelect` output contains no registrant/participant PII fields in __tests__/lib/utils/public-signup-events.test.ts
- [ ] T065 [P] Mobile pass over all new UI (bottom-nav reachability, 44px touch targets, card layouts for roster/waitlist tables on xs)
- [ ] T066 [P] Update README.md feature list and docs/ (env vars, cron, Blob setup); note new vercel.json cron
- [ ] T067 Run `bun run type-check && bun run lint && bun run test` and fix regressions (pre-existing failures in theme-marketing.test.ts and DragDropTeams.test.tsx excluded)

---

## Dependencies & execution order

- **Phase 2 blocks everything** (schema + helpers).
- Story order: US1 → US2 (needs events) → US3 (needs registration) → US4 (independent
  of US3 apart from the INVITEES audience hook) → US5 (needs registration; league
  onboarding T039 is independent) → US6 (anytime after US1) → US7 (needs confirmed
  registrations) → US8/US9 (independent of each other; US9 needs US7 games).
- Within each phase, [P] tasks touch disjoint files and can run concurrently; e.g.,
  after T010 lands, T011/T012/T015/T016/T017 can proceed in parallel.

## Implementation strategy

Ship **US1+US2 as the MVP** (free signup sheets end-to-end), demo to the association,
then layer P2 (Mite Night access rules), P3 (money + delegation), P4 (event day), P5
(media + stats). Each checkpoint leaves `main`-mergeable, independently testable
functionality; payments and media remain feature-flagged by env so partial deploys
stay safe.
