# Server Actions & Routes Contract

All actions return `ActionResult<T>` and follow the standard pattern: authenticate →
Zod-validate → authorize → mutate → `revalidatePath`. "Event manager" below means:
host-entity admin (org OWNER/MANAGER with scheduling rights, league LEAGUE_ADMIN, or
team ADMIN) **or** a user holding an `EventManager` row for the event — resolved by a
new `requireEventManager(eventId)` helper in `lib/auth/session.ts`.

## Events — `lib/actions/signup-events.ts`

- `createSignupEvent(input)` → `ActionResult<{ eventId }>`
  - Auth: host-entity admin for the chosen host (exactly one of organizationId /
    leagueId / teamId). Creates DRAFT event + slots + phases in one transaction.
    Validates venue access and time sanity (end > start, cutoff ≤ start).
- `updateSignupEvent(input)` → `ActionResult<{ eventId }>`
  - Auth: event manager. Material changes (startAt/endAt, venue) on PUBLISHED events
    queue notification emails to active registrants (FR-005). Capacity reductions
    below committed count are allowed but flagged in the result (never revoke).
- `publishSignupEvent({ eventId })` / `cancelSignupEvent({ eventId, reason? })`
  - Auth: event manager. Publish validates ≥1 slot and, when
    `acceptsOnlinePayment`, that the host merchant is onboarded. Cancel notifies all
    active registrants, flags online payments for refund follow-up (FR-027), sets
    CANCELED. League hosts publishing their first PUBLIC event get a `slug`
    generated (R9).
- `duplicateSignupEvent({ eventId })` → `ActionResult<{ eventId }>`
  - Auth: event manager. Deep-copies event/slots/phases/payment config → new DRAFT
    (no registrations, invitations, teams, games, media).
- `regenerateEventLink({ eventId })` → `ActionResult<{ linkToken }>`
  - Auth: event manager. LINK-visibility events only; old token invalid immediately.
- `getSignupEvent(eventIdOrToken)` — read used by public/dashboard pages; applies the
  visibility gate and `publicSignupEventSelect` boundary for non-managers.
- `listHostSignupEvents({ host, includeState })` — management listing.
- `listPublicSignupEvents(filters)` — PUBLIC + PUBLISHED only, for discovery/rollups.

## Registration & waitlist — `lib/actions/event-registrations.ts`

- `registerForSignupEvent(input)` →
  `ActionResult<{ registrationId, status, requiresPayment, checkoutUrl? }>`
  - Auth: any authenticated user with view access (visibility + invitation gate).
  - Validates window/phase eligibility (R6). Inside one Serializable transaction
    (R4): duplicate guard (R11), committed-spot count vs slot capacity, then:
    free+capacity → `CONFIRMED` (+email); paid+capacity → `PENDING_PAYMENT` +
    `Payment(REQUIRES_PAYMENT, eventRegistrationId)` + Checkout on the host
    merchant's account; full/ineligible-phase + waitlist enabled → `WAITLISTED`.
    Price snapshotted server-side; never accepted from the client.
- `cancelMyEventRegistration({ registrationId })` → `ActionResult`
  - Auth: registrant. Allowed until `cancellationCutoffAt` (organizer/managers are
    exempt from the cutoff). Frees the spot → synchronous waitlist promotion (R5).
    Paid+confirmed → instructs to contact organizer for refund (mirrors 003).
- `claimWaitlistOffer({ registrationId })` → same shape as `registerForSignupEvent`
  - Auth: registrant. OFFERED + unexpired only. Free → CONFIRMED; paid →
    PENDING_PAYMENT + checkout with `expires_at` clamped to `offerExpiresAt`.
- `declineWaitlistOffer({ registrationId })` — → CANCELED; promotes next entry.
- `getMyEventRegistrations()` — registrant's registrations incl. waitlist positions.
- `getEventRoster({ eventId })` → per-slot roster + waitlist + counts + payment/
  check-in state. Auth: event manager.
- `promoteWaitlistEntry({ registrationId })` — manual promotion → OFFERED (organizer
  override of FIFO). Auth: event manager. Logged.
- `removeEventRegistration({ registrationId, reason? })` — organizer removal →
  CANCELED + notification + sync promotion. Auth: event manager. Logged.
- `setCheckIn({ registrationId, checkedIn })` — toggle check-in timestamp/actor.
  Auth: event manager.
- `setManualPaymentStatus({ registrationId, status })` — UNPAID/PAID/WAIVED.
  Auth: event manager. Logged (FR-029).
- `refundEventRegistration({ registrationId, reason? })` → `ActionResult`
  - Auth: event manager on a host with the payment's merchant rights. Stripe refund
    via existing `refundPaymentIntent`; → REFUNDED; frees spot → sync promotion.

## Invitations — `lib/actions/event-invitations.ts`

- `sendEventInvitations({ eventId, emails[] })` — creates/refreshes tokens, sends
  emails (existing-user vs signup variants), binds `invitedUserId` when the address
  matches an account. Auth: event manager.
- `revokeEventInvitation({ invitationId })` / `resendEventInvitation({ invitationId })`
  - Auth: event manager. Revoked tokens stop granting INVITE_ONLY access.
- `GET /api/event-invitations/[token]` — accept route: signed-in matching user →
  event page; unknown email → signup flow carrying the token (mirrors the existing
  team-invitation route).

## Managers — `lib/actions/event-managers.ts`

- `addEventManager({ eventId, email | userId })` / `removeEventManager({ eventId, userId })`
  - Auth: **host-entity admin only** (not other event managers). Logged.
- `listEventManagers({ eventId })` — Auth: event manager.

## League payments — `lib/actions/league-payments.ts`

- `startLeagueStripeOnboarding({ leagueId })`, `refreshLeagueStripeStatus({ leagueId })`,
  `getLeagueStripeDashboardLink({ leagueId })`, `getLeaguePaymentsOverview(leagueId)`
  - Auth: LEAGUE_ADMIN. Thin wrappers over `lib/payments/stripe.ts` helpers,
    persisting to the League Connect columns (R2).

## Teams, games & stats — `lib/actions/event-teams.ts`

- `createEventTeam` / `updateEventTeam` / `deleteEventTeam` — Auth: event manager.
- `assignToEventTeam({ eventTeamId, registrationIds[] })` — upserts primary
  assignments (one per participant); returns per-team position counts.
- `setFloater({ registrationId, isFloater })`.
- `createEventGame(input)` / `updateEventGame` / `deleteEventGame` — matchup of two
  event teams, time window inside the event, optional surface + `iceUsage`/`zoneLabel`.
- `setGameRotation({ gameId, entries: [{ registrationId, eventTeamId }] })`
  - Replaces the game's participation list. Non-floater in overlapping games →
    `warnings[]` in the result (soft, FR-031).
- `publishEventTeams({ eventId })` — makes teams/games visible to participants and
  notifies them; later assignment changes notify affected participants (FR-033).
- `recordGameResult({ gameId, homeScore, awayScore, stats?[] })`
  - Auth: event manager. **Rejected unless `isStatsEligible(event.ageClassification)`**
    (R10) — enforced in schema refinement and the action. Marks game COMPLETED.
  - Standings for TOURNAMENT events derive at read time.

## Media — `lib/actions/event-media.ts` + upload routes

- `POST /api/signup-events/[eventId]/media/upload` — Vercel Blob client-upload token
  exchange (R1). Authorizes: gallery enabled + Blob configured + caller is an active
  registrant/registrant-of-participant or event manager. Enforces size/type caps
  server-side; private access.
- `finalizeEventMediaUpload(input)` — creates the `EventMediaItem` row after client
  upload completes (metadata: kind, contentType, sizeBytes, dimensions/duration).
- `listEventMedia({ eventId })` — gallery-visibility check → items with short-lived
  signed URLs.
- `removeEventMediaItem({ mediaItemId })` — organizer (any item, logged) or uploader
  (own items). Best-effort blob deletion.
- `reportEventMediaItem({ mediaItemId })` — any gallery viewer; increments
  `reportCount`, flips status to FLAGGED (hidden pending review) at threshold 1.

## Webhook — `POST /api/webhooks/stripe` (extended, same endpoint)

- Payment lookup by `stripeCheckoutSessionId` unchanged; handler branches on
  `payment.registrationId` (003 path, untouched) vs `payment.eventRegistrationId`:
  - `checkout.session.completed` → re-count committed spots for the **slot**; fits →
    Payment `PAID` + registration `CONFIRMED` + emails; would oversell → auto-refund
    (idempotency key `overbook-refund:{id}`) + registration `EXPIRED`.
  - `checkout.session.expired` / `payment_intent.payment_failed` /
    `charge.refunded` → same state maps as 003, then synchronous waitlist promotion
    when a spot frees.
  - `account.updated` → sync Connect flags on VenueOrganization **or** League by
    `stripeAccountId`.

## Cron — `GET /api/cron/event-waitlist` (new, every 10 min in `vercel.json`)

- Expires lapsed OFFERED/PENDING_PAYMENT rows → EXPIRED, cascading offers to next
  eligible WAITLISTED entries; issues offers when a phase has opened with capacity
  remaining. Idempotent; safe to run concurrently with user traffic (Serializable
  reservation transactions arbitrate).
- Event reminders (48 h) ride the existing `rsvp-reminders` hourly cron via a new
  branch.

## Roster export — `GET /api/signup-events/[eventId]/roster/export`

- Auth: event manager. CSV download (participants, slot, status, payment, check-in),
  reusing `lib/utils/csv.ts`. GET route per the existing roster-export precedent.

## Public routes

- `GET /signups` — PUBLIC event discovery (filter: host, venue, date, category). Uses
  `/signups`, not `/events` (which belongs to team calendar events; route groups do not
  change the URL).
- `GET /signups/[eventId]` — public event page (visibility-gated; register CTA).
- `GET /signups/l/[token]` — LINK-visibility access; same page, token-gated.
- `GET /associations/[slug]/events` — league/association public event rollup (R9).
- `GET /rinks/[slug]` + `/schedule` — extended to include the venue's PUBLIC signup
  events alongside schedule blocks (FR-010).
- Dashboard: `/signup-events` (manage list), `/signup-events/new`,
  `/signup-events/[eventId]` (tabs: overview, roster, waitlist, invitations, teams &
  games, media, settings), `/my-registrations` (extended with event registrations),
  internal league/team calendars gain signup-event sections.
