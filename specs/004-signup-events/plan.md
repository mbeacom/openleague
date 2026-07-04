# Implementation Plan: Signup Events & Event Day Management

**Branch**: `004-signup-events` | **Date**: 2026-07-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-signup-events/spec.md`

## Summary

A SignUpGenius replacement for hockey associations: rink organizations, leagues/
associations, and teams host signup events with capacity-limited role slots (goalies,
skaters, refs, coaches), four visibility tiers, priority registration windows with
automatic waitlist backfill, manual (Venmo/Zelle/Cash App/cash) and online (Stripe
Connect) payment, per-event delegated managers, event-day team formation with floaters
and half-ice games, media galleries, and age-gated statistics. The design **reuses the
proven 003 machinery** — serializable-transaction capacity reservation, hold windows,
Stripe Connect direct charges, idempotent webhooks — re-scoped from schedule blocks to
per-slot event registration, and adds the platform's first object-storage integration
(Vercel Blob) for media.

## Technical Context

**Language/Version**: TypeScript, Next.js 16 App Router, React 19
**Primary Dependencies**: MUI v7/Emotion, Prisma 7, Neon PostgreSQL adapter, Auth.js v5,
Zod v4, Bun, `stripe` SDK (existing), `@vercel/blob` (new)
**Storage**: PostgreSQL via Prisma (amounts in cents); Vercel Blob (private) for media
**Testing**: Vitest + Testing Library; Prisma/auth/Stripe/Blob/email mocked
**Payments**: Existing Stripe Connect direct-charge pipeline; League gains merchant
columns; `Payment` generalized to serve session and event registrations (research R2/R3)
**Constraints**: Payments and media optional at deploy time (graceful degradation);
prices snapshotted server-side; webhooks signature-verified and idempotent; no raw SQL
outside migration files; participant PII never crosses the public data boundary; slots
never oversold under concurrency
**Scale/Scope**: association-scale events (≤ a few hundred registrations each); 12 new
models, ~7 new action files, ~10 new routes/pages, 1 new cron

## Constitution Check

`.specify/memory/constitution.md` is the unfilled template, so the gate applies the
repository's active conventions (as 003 did): Server Components for reads, Server
Actions for mutations (API routes only for webhooks/cron/file transfer), session-helper
auth first in every action, Zod validation in `lib/utils/validation.ts`, Prisma via
`lib/db/prisma.ts` (no raw SQL in app code), `revalidatePath` after mutations,
migration + client regen committed together, mobile-first MUI UI. **Gate Result: PASS**
— the design introduces no new architectural styles; the two API-route additions
(upload token exchange, CSV export) match existing webhook/export precedents.

## Architecture Decisions

Full rationale in [research.md](./research.md); load-bearing choices:

1. **New `SignupEvent` entity family** — not an extension of team `Event` (roster-RSVP
   shaped) or `VenueScheduleBlock` (single flat capacity, venue-owned). Polymorphic
   host via mutually-exclusive FKs with DB CHECK (Venue-ownership precedent).
2. **Per-slot capacity via the 003 reservation engine** — Serializable transaction
   counting CONFIRMED + held PENDING_PAYMENT + un-expired OFFERED; webhook re-check
   with auto-refund on late oversell (R4).
3. **Waitlist as a status machine in `EventRegistration`** — WAITLISTED → OFFERED
   (claim window) → CONFIRMED/EXPIRED; synchronous promotion on any freed spot, 10-min
   cron backstop, lazy expiry so correctness never depends on the cron (R5).
4. **Phases evaluated at request time** — pure predicate of (user, event, now); no
   schedulers (R6).
5. **`Payment` generalized, not cloned** — optional `registrationId` XOR
   `eventRegistrationId`; merchant = organization XOR league; CHECK constraints in the
   migration; one webhook state machine (R3). League mirrors the five Connect columns;
   teams are never merchants (R2).
6. **Visibility via select-boundary + tokens** — `publicSignupEventSelect` whitelist,
   crypto-random regenerable `linkToken`, email-bound invitations for INVITE_ONLY (R7).
7. **Vercel Blob (private) client uploads** for media; galleries feature-flagged on
   `BLOB_READ_WRITE_TOKEN`; signed-URL delivery after authorization (R1).
8. **Age gate as ordered enum + env threshold** — enforced in schema refinement,
   action, and UI; stats hidden (not deleted) on downgrade (R10).
9. **Routes**: dashboard `signup-events/` (existing `/events` belongs to team events);
   public `(marketing)/signups/…`, `/signups/l/[token]`, `/associations/[slug]/events`
   (League gains a nullable unique `slug`) (R8/R9). Public pages use `/signups`, not
   `/events` — route groups do not change the URL, so `(marketing)/events` collides
   with the team `(dashboard)/events`.

## Project Structure

### Documentation (this feature)

```text
specs/004-signup-events/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions R1–R13
├── data-model.md        # Phase 1 — enums, 12 models, extensions, migration notes
├── quickstart.md        # Phase 1 — env, migration, manual Mite Night walkthrough
├── contracts/
│   └── server-actions.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit.tasks — not created by /speckit.plan)
```

### Source Code (repository root)

```text
prisma/schema.prisma                          # +enums, 12 models, League/Payment extensions
prisma/migrations/<ts>_add_signup_events/     # incl. raw-SQL CHECK constraints

lib/utils/validation.ts                       # +signup event/slot/phase/registration/… schemas
lib/utils/age-level.ts                        # AgeClassification ranks + isStatsEligible()
lib/utils/public-signup-events.ts             # publicSignupEventSelect boundary
lib/auth/session.ts                           # +requireEventManager(), host-admin resolvers
lib/media/blob.ts                             # Vercel Blob client, isBlobEnabled(), signed URLs
lib/env.ts                                    # +BLOB_READ_WRITE_TOKEN, EVENT_WAITLIST_CLAIM_HOURS,
                                              #  STATS_MIN_AGE_LEVEL

lib/actions/signup-events.ts                  # CRUD, publish/cancel, duplicate, link regen, listings
lib/actions/event-registrations.ts            # register/cancel/claim/decline, roster, check-in,
                                              #  mark-paid, promote/remove, refund, capacity engine
lib/actions/event-invitations.ts              # send/revoke/resend
lib/actions/event-managers.ts                 # add/remove/list
lib/actions/event-teams.ts                    # teams, assignments, floaters, games, rotations, results
lib/actions/event-media.ts                    # finalize/list/remove/report
lib/actions/league-payments.ts                # League Connect onboarding/status/overview
lib/email/templates.ts                        # +invitation, confirmation, waitlist-offer, change/cancel,
                                              #  reminder, team-published emails

app/api/webhooks/stripe/route.ts              # +eventRegistrationId branch, League account.updated
app/api/cron/event-waitlist/route.ts          # offer expiry + phase-open backfill (10 min)
app/api/cron/rsvp-reminders/…                 # +48h signup-event reminder branch
app/api/event-invitations/[token]/route.ts    # invitation accept redirect
app/api/signup-events/[eventId]/media/upload/route.ts   # Blob client-upload token exchange
app/api/signup-events/[eventId]/roster/export/route.ts  # CSV download

app/(marketing)/signups/page.tsx              # public discovery
app/(marketing)/signups/[eventId]/page.tsx    # public event page (+register CTA)
app/(marketing)/signups/l/[token]/page.tsx    # LINK access
app/(marketing)/associations/[slug]/events/page.tsx     # league rollup
app/(marketing)/rinks/[slug]/…                # venue schedule page gains PUBLIC signup events

app/(dashboard)/signup-events/page.tsx        # manage list
app/(dashboard)/signup-events/new/page.tsx
app/(dashboard)/signup-events/[eventId]/page.tsx        # tabs: overview/roster/waitlist/
                                                        #  invitations/teams & games/media/settings
app/(dashboard)/my-registrations/…            # +event registrations section

components/features/signup-events/…           # EventForm, SlotEditor, PhaseEditor, RegisterDialog,
                                              #  RosterTable, WaitlistPanel, InvitePanel, TeamBoard,
                                              #  GameScheduler, MediaGallery, PaymentConfigCard…
vercel.json                                   # +event-waitlist cron entry
```

**Structure Decision**: standard app-router layout already used by 002/003 — public
surfaces under `(marketing)`, management under `(dashboard)`, mutations in
`lib/actions`, API routes only for webhook/cron/uploads/exports.

## Phases

Implementation order tracks spec priorities so each phase ships independently:

1. **Data model** — schema (all models at once to avoid churn), migration with CHECK
   constraints, client regen, `age-level.ts`, env additions.
2. **P1 core** — validation schemas, `requireEventManager`, event CRUD/publish/cancel/
   duplicate actions, free registration with per-slot capacity engine, roster/check-in/
   CSV export, public event page + discovery + venue rollup, dashboard management UI,
   confirmation/change/cancel emails. *(US1 + US2 — usable SignUpGenius replacement.)*
3. **P2 access** — phases + eligibility predicate, waitlist join/offer/claim/decline,
   sync promotion + cron, invitations (send/accept/revoke), LINK tokens + route,
   INVITE_ONLY gate, league slug + association rollup page. *(US3 + US4 — Mite Night.)*
4. **P3 money & delegation** — League Connect columns + onboarding actions, Payment
   generalization + webhook branch, paid registration/checkout/refund, manual payment
   config + mark-paid, event managers + activity logging. *(US5 + US6.)*
5. **P4 event day** — teams, assignments, floaters, games with surfaces/ice-usage,
   rotations with overlap warnings, publish-teams notifications. *(US7.)*
6. **P5 media & stats** — Blob integration, upload/gallery/moderation, age-gated
   results + tournament standings. *(US8 + US9.)*
7. **Verification** — `bun run type-check`, `bun run lint`, `bun run test`; unit tests
   for capacity/waitlist/eligibility/age-gate logic, action tests with mocked Prisma/
   Stripe/Blob, component tests for registration and roster UI.

## Out of Scope / Future

- Recurring event series (duplicate covers it); ICS calendar feeds.
- Peer-to-peer payment reconciliation; partial refunds; deposits/installments.
- Automated team balancing; bracket generation/seeding.
- Public league profile pages beyond the events listing.
- Media orphan sweeps, transcoding, albums/tagging.
- Consolidated `MerchantAccount` model (revisit if a third merchant type appears).
