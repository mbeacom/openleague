# Quickstart: Signup Events & Event Day Management

**Feature**: `004-signup-events`

## Environment

All new variables are optional — absent values degrade gracefully (FR-039):

```bash
# Media galleries (Vercel Blob). Unset → galleries hidden everywhere.
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_…

# Waitlist offer claim window in hours (default 24; clamped to event start).
EVENT_WAITLIST_CLAIM_HOURS=24

# Minimum age classification allowing scores/stats (default SQUIRT_U10).
STATS_MIN_AGE_LEVEL=SQUIRT_U10

# Online payments reuse the existing Stripe vars:
# STRIPE_SECRET_KEY / STRIPE_CONNECT_WEBHOOK_SECRET /
# NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY / STRIPE_PLATFORM_FEE_BPS
```

## Setup

```bash
bun install                 # adds @vercel/blob
bun run db:migrate          # add_signup_events migration (+CHECK constraints)
bun run db:generate
bun run dev
# Stripe webhooks locally:
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

## Manual walkthrough — the "Mite Night" scenario (SC-004)

1. **Create** — as a league admin: Dashboard → Signup Events → New. Title "Mite
   Night", category Scrimmage, classification U8, venue + date. Slots: Goalie ×4
   (free), Skater ×40 ($25), Referee ×4, Coach ×8. Phases: "Association members"
   opens Mon, "Open registration" opens Fri. Visibility: Public. Payments: online +
   Venmo handle. Save draft → Publish.
2. **Rollup** — event appears at `/events`, `/associations/<slug>/events`, and the
   rink's public schedule page.
3. **Priority window** — register as a league member (confirmed). As a non-member
   before Friday: only "Join waitlist" is offered.
4. **Capacity & payment** — fill a slot; the 41st skater waitlists. Pay by card
   (confirm via webhook) and manually (confirmed, shows Unpaid on the roster →
   mark Paid).
5. **Backfill** — cancel a confirmed skater: first eligible waitlist entry flips to
   OFFERED and gets an email; claim within the window (paying if priced). Let one
   offer lapse → next entry is offered (cron or lazy expiry).
6. **Delegate** — add the mite delegate as event manager; verify they manage the
   roster but cannot open league payment settings.
7. **Event day** — form teams Red/White/House Gold/House Black, flag two Mite 3
   floaters, schedule two half-ice games (North/South), add floaters to both
   rotations, publish teams, check participants in, export the roster CSV.
8. **Age gate** — U8 event: no score entry anywhere. Duplicate the event, set
   classification to SQUIRT_U10 → score entry and results appear.
9. **Media** — with Blob configured: upload a photo as a parent; verify a
   non-participant cannot view the gallery; remove an item as organizer.

## Verification

```bash
bun run type-check && bun run lint && bun run test
```

Key test areas: slot capacity under concurrency (mocked serializable conflicts),
waitlist offer/expiry cascade, phase eligibility predicate, age-gate refusal,
webhook event-registration branch (idempotency, late-payment auto-refund), public
data boundary (no PII in public selects), Blob-token upload authorization.
