# Research: Signup Events & Event Day Management

**Feature**: `004-signup-events` | **Date**: 2026-07-03

Resolves the technical unknowns from the plan's Technical Context. Each item records
the decision, rationale, and alternatives considered.

## R1. Media storage provider

**Decision**: Vercel Blob (`@vercel/blob`) — the platform's first object-storage
integration. Client uploads (browser → Blob via `upload()` with a token issued by a
route handler) so video files bypass the serverless request-body limit. Media stored
with **private access**; delivery through short-lived signed URLs generated server-side
after an authorization check. Feature is gated on `BLOB_READ_WRITE_TOKEN` being set —
absent token hides the gallery everywhere (FR-039 graceful degradation).

**Rationale**: The app deploys on Vercel (`vercel.json`); Blob is zero-infrastructure,
supports private objects, and the client-upload flow is designed exactly for this
use case. Galleries default to participants-only (spec), so public-read storage is
not acceptable.

**Alternatives considered**: AWS S3 + presigned URLs (more setup, credentials, and a
second cloud; `AWS_REGION` env exists but nothing else does); UploadThing (third-party
dependency and pricing layer for little gain); base64-in-DB like `Play.thumbnail`
(unacceptable for photos/videos at scale).

**Limits (initial)**: images ≤ 10 MB (JPEG/PNG/WebP/HEIC), videos ≤ 200 MB and ≤ 90 s
(MP4/QuickTime/WebM). Size/type enforced in the upload-token route (authoritative) and
client-side for UX; duration client-side best-effort.

## R2. League/association merchant accounts

**Decision**: Mirror the five Stripe Connect fields from `VenueOrganization` onto
`League` (`stripeAccountId @unique`, `stripeChargesEnabled`, `stripePayoutsEnabled`,
`stripeDetailsSubmitted`, `platformFeeBps`). New thin action file reuses every helper
in `lib/payments/stripe.ts` unchanged. The `account.updated` webhook handler syncs
whichever entity matches the incoming `stripeAccountId`. Teams do **not** become
merchants (spec assumption): team-hosted paid events are manual-payment only.

**Rationale**: `lib/payments/stripe.ts` helpers are already entity-agnostic (they take
account ids and amounts). Duplicating five columns is far cheaper and safer than
extracting a shared `MerchantAccount` model, which would force a data migration and
code churn through the proven 003 pipeline.

**Alternatives considered**: A generalized `MerchantAccount`/`PayoutAccount` model
(cleaner long-term; rejected for migration risk on live payment code — noted as a
future consolidation if a third merchant type ever appears).

## R3. Payment model: generalize vs. new table

**Decision**: Generalize the existing `Payment` model instead of adding an
`EventPayment` clone:

- `registrationId` becomes optional; add optional `eventRegistrationId @unique`
  (exactly one of the two set — same mutual-exclusivity pattern as
  `SessionRegistration.scheduleBlockId`/`lessonOfferingId` and `Venue` ownership).
- `venueId` and `organizationId` become optional; add optional `leagueId` (the
  merchant for league-hosted events). Exactly one merchant entity set.
- A raw-SQL `CHECK` constraint in the migration enforces the exactly-one rules at the
  database level; application code enforces them at write time.

**Rationale**: The webhook state machine (idempotent confirm, capacity re-check,
late-payment auto-refund, dashboard-initiated refund reconciliation) is the subtlest
code in the payments system. One table keeps one lookup path
(`stripeCheckoutSessionId` → payment) and one refund/expiry implementation; the
handler branches on which registration link is set. Loosening NOT NULL constraints is
a data-safe migration; existing 003 rows are untouched.

**Alternatives considered**: Separate `EventPayment` table (duplicates the webhook
state machine and refund logic — two implementations of the trickiest code path);
polymorphic `payableType`/`payableId` strings (loses referential integrity).

## R4. Slot capacity engine

**Decision**: Reuse the 003 capacity pattern per **slot** (not per event):
`prisma.$transaction(..., { isolationLevel: Serializable })` that counts committed
spots — `CONFIRMED` + `PENDING_PAYMENT` created within the 30-minute hold window +
un-expired `OFFERED` holds — and inserts the registration atomically, throwing a
typed `CapacityError` when full. `P2034`/`P2028` serialization failures surface as
"filling up fast — try again". Checkout `expires_at` matches the hold window; the
`checkout.session.completed` handler re-checks slot capacity and auto-refunds a late
payment that would oversell (existing behavior, re-pointed at slots).

**Rationale**: This exact pattern is proven in production for schedule blocks; the
only change is the counting scope (slotId) and the addition of `OFFERED` as a
committed status.

**Alternatives considered**: Row-level `SELECT ... FOR UPDATE` via raw SQL (forbidden
by project rules — no raw SQL); optimistic version columns (more moving parts, no
benefit over the established serializable transaction).

## R5. Waitlist mechanics

**Decision**: Waitlist entries live in the same `EventRegistration` table as a status
(`WAITLISTED`, ordered by `waitlistJoinedAt`), matching the 003 precedent
(`SessionRegistrationStatus.WAITLISTED` was modeled for exactly this). Promotion is a
status transition `WAITLISTED → OFFERED` with `offerExpiresAt = min(now + claim
window, event start)`; default claim window 24 h via `EVENT_WAITLIST_CLAIM_HOURS`.

Triggers, in order of immediacy:

1. **Synchronous cascade** — any action that frees a spot (cancel, organizer removal,
   offer decline, capacity increase) immediately runs the promotion routine for that
   slot inside/after its transaction. Satisfies SC-005 (offer within 1 minute).
2. **Cron sweep** — `/api/cron/event-waitlist` every 10 minutes: expires lapsed
   `OFFERED` holds (cascading to the next entry) and issues offers when a
   registration phase opens with capacity remaining. New entry in `vercel.json`
   `crons` alongside the two existing jobs.
3. **Lazy counting** — expired `OFFERED`/`PENDING_PAYMENT` rows never count as
   committed spots (same lazy-expiry trick as the 003 hold window), so correctness
   never depends on the cron having run.

Offer claim on a priced slot goes straight into the paid-registration flow
(`OFFERED → PENDING_PAYMENT → CONFIRMED` via webhook), with the checkout expiry
clamped to the remaining offer window.

**Rationale**: One table means the capacity count, the roster query, and the
promotion routine all read one source of truth; separate waitlist tables invite
drift. Lazy expiry + cron backstop is the established resilience pattern here.

**Alternatives considered**: Separate `WaitlistEntry` table (extra join and a
two-phase move on promotion; rejected); real-time queues/schedulers (nothing else in
the app runs one; serverless cron + lazy expiry is sufficient).

## R6. Registration phases (priority windows)

**Decision**: Phases are rows (`EventRegistrationPhase`) with `opensAt` and an
audience (`HOST_MEMBERS`, `SELECTED_GROUPS` with linked divisions/teams, `INVITEES`,
`EVERYONE`). Eligibility is **evaluated at request time** — a pure function of (user,
event, now) — so no scheduler flips anything on or off. An event with no phases uses
its plain `registrationOpensAt/ClosesAt` window for everyone with view access.
"Host members" resolves through existing structures: league-hosted → any
`LeagueUser` / rostered player-linked user of that league; team-hosted →
`TeamMember`; org-hosted → org/venue staff plus members of teams with an active
relationship to the org's venues (via `VenueRelationship`).

**Rationale**: Time-based predicates need no background jobs and cannot miss;
matches how the rest of the app already evaluates access on request.

**Alternatives considered**: Materialized per-user entitlement rows (write
amplification, stale-data risk); a phase-state machine mutated by cron (fails
"opens exactly at time T" and adds failure modes).

## R7. Visibility, link tokens, and the public data boundary

**Decision**: Four-tier enum on the event. LINK visibility uses a 32-byte
crypto-random hex `linkToken` (`@unique`, regenerable — same generator as invitation
tokens); the public route is `/events/l/[token]`. INVITE_ONLY resolves through
`EventInvitation` rows (email-bound, matched to the signed-in user's email or
accepted invitation). All public reads go through a `publicSignupEventSelect`
whitelist module (clone of the `publicVenueProfileSelect` pattern in
`lib/utils/public-venues.ts`) so participant PII can never leak into public pages;
public rosters (opt-in) render first name + last initial only, computed server-side.

**Rationale**: Every mechanism (token generation, select-whitelist boundary,
publish gating) has a working precedent in 002/003 code.

**Alternatives considered**: Signed JWT links (revocation awkward vs. a regenerable
DB token); per-viewer ACL rows for LINK events (overkill — the token *is* the
capability).

## R8. Route namespaces (avoiding the existing `/events` collision)

**Decision**: `app/(dashboard)/events/` already belongs to team calendar events, so:

- **Management UI**: `app/(dashboard)/signup-events/…` (list, new, `[eventId]` detail
  with roster/waitlist/teams/games/media/settings tabs).
- **Public pages**: `app/(marketing)/events/page.tsx` (discovery of PUBLIC events,
  filterable by host/venue/date), `app/(marketing)/events/[eventId]/page.tsx`
  (public event page), `app/(marketing)/events/l/[token]/page.tsx` (LINK access).
- **Rollups**: PUBLIC venue-tied events render on the existing rink schedule page;
  league/association public events render at
  `app/(marketing)/associations/[slug]/events` (see R9); internal league/team
  calendars gain a signup-events section.
- **My registrations**: extend the existing `my-registrations` page with an event
  registrations section.

**Rationale**: Zero collision with existing routes; mirrors the marketing/dashboard
split already used for rinks (public `(marketing)/rinks` vs. `(dashboard)/venue-admin`).

## R9. Public league/association event pages

**Decision**: Add nullable `slug String? @unique` to `League` (exact pattern of
`Venue.slug`, schema line 858). Slug is generated from the league name (with
de-dup suffix) the first time the league publishes a PUBLIC signup event; league
admins can edit it. Public listing lives at `(marketing)/associations/[slug]/events`.
No full public league profile page is built — just the events listing (a profile
page is a natural follow-up feature).

**Rationale**: FR-010 requires league events to roll up "onto the association's event
page"; leagues currently have no public surface at all. A slug + single listing page
is the minimal honest implementation, reusing the venue-slug conventions.

**Alternatives considered**: id-based URLs (ugly, leaks cuids, poor sharing);
building full public league profiles (scope creep beyond this feature).

## R10. Age-gated statistics

**Decision**: `AgeClassification` enum on the event with an explicit rank order
(`U6 < U8 < SQUIRT_U10 < PEEWEE_U12 < BANTAM_U14 < U16 < U18 < JUNIOR < ADULT <
OPEN`). A helper `isStatsEligible(classification)` compares against the platform
threshold env `STATS_MIN_AGE_LEVEL` (default `SQUIRT_U10`, i.e. 8U/mite and below
blocked, per USA Hockey ADM). The gate is enforced in three places: Zod schema
refinement (reject score/stat input), server action authorization, and UI (score
entry and results sections never render for ineligible events). Classification
downgrades hide existing stats (they remain in rows but are never displayed and
further writes are blocked) per the spec's edge case.

**Alternatives considered**: Free-text age labels (not gateable); numeric birth-year
cutoffs (more precision than the domain needs — hockey levels are the domain
language).

## R11. Duplicate-participant prevention

**Decision**: Application-level check inside the same serializable registration
transaction: reject when an **active** (non-canceled/expired/refunded) registration
already exists for the same slot + registrant user + case-insensitively normalized
participant name. Not a DB unique constraint.

**Rationale**: The rule only applies to active statuses, and Prisma/Postgres partial
unique indexes aren't expressible in the schema DSL (raw SQL is off-limits by
project convention). The serializable transaction already provides the needed
atomicity.

## R12. Rosters, check-in, exports, reminders

**Decision**: Roster CSV export follows the existing `app/api/roster/export`
GET-download precedent at `app/api/signup-events/[eventId]/roster/export`, reusing
`lib/utils/csv.ts`. Check-in is a timestamp + actor on the registration, toggled via
server action from the roster view. Pre-event reminder emails ride a new branch in
the existing hourly reminders cron (48-hour window, honoring
`NotificationPreference`), not a new cron job.

## R13. Recurrence

**Decision**: Per the spec, no series model. A `duplicateSignupEvent` action deep-
copies event + slots + phases + payment config (never registrations) into a new
DRAFT. Organizers adjust dates and publish.

## Environment variables (all optional, graceful degradation)

| Variable | Purpose | Default |
| --- | --- | --- |
| `BLOB_READ_WRITE_TOKEN` | Enables media galleries (Vercel Blob) | unset → galleries hidden |
| `EVENT_WAITLIST_CLAIM_HOURS` | Waitlist offer claim window | `24` |
| `STATS_MIN_AGE_LEVEL` | Minimum age classification for stats | `SQUIRT_U10` |
| *(existing)* `STRIPE_*` | Online payments | unset → manual/free only |
