# Server Actions & Routes Contract

## Payments / Connect — `lib/actions/venue-payments.ts`

- `startStripeOnboarding({ organizationId })` → `ActionResult<{ url }>`
  - Auth: org OWNER/MANAGER. Creates the connected account on first use; returns a hosted
    onboarding URL. Errors gracefully when Stripe is not configured.
- `refreshStripeAccountStatus({ organizationId })` → `ActionResult<ConnectStatus>`
  - Auth: org OWNER/MANAGER. Re-syncs capability flags from Stripe and persists them.
- `getStripeDashboardLink({ organizationId })` → `ActionResult<{ url }>`
  - Auth: org OWNER/MANAGER. Express dashboard login link (onboarded accounts only).
- `getOrganizationPaymentsOverview(organizationId)` → `ActionResult<OrganizationPaymentsOverview>`
  - Read-only (no revalidate); stored Connect flags + revenue aggregates. Safe during render.

## Registration — `lib/actions/session-registrations.ts`

- `registerForSession(input)` → `ActionResult<{ registrationId, status, requiresPayment, checkoutUrl? }>`
  - Auth: any authenticated user. Validates with `sessionRegistrationSchema`. Loads the
    self-register offering, enforces capacity, snapshots price. Free → `CONFIRMED` + email.
    Paid → `PENDING` + `Payment(REQUIRES_PAYMENT)` + Stripe Checkout URL. Rolls back on
    checkout-creation failure.
- `cancelMyRegistration({ registrationId })` → `ActionResult<{ registrationId, status }>`
  - Auth: owner of the registration. Cancels unpaid/free; paid+confirmed must be refunded by
    the rink.
- `getMyRegistrations()` → registration list for the current user.
- `getVenueRegistrations({ organizationId, venueId })` → `{ registrations, summary }`
  - Auth: OWNER/MANAGER/REQUEST_MANAGER. Roster + revenue summary.
- `refundRegistration({ organizationId, venueId, registrationId, reason? })` → `ActionResult`
  - Auth: org OWNER/MANAGER. Refunds the captured payment via Stripe; marks `REFUNDED`; logs
    activity.

## Webhook — `POST /api/webhooks/stripe`

- Runtime: Node.js. Verifies the Connect signature (`STRIPE_CONNECT_WEBHOOK_SECRET`).
  Bypasses proxy IP rate limiting. Idempotent handlers for:
  - `checkout.session.completed` → Payment `PAID`, registration `CONFIRMED`, confirmation +
    manager emails, receipt URL resolution.
  - `checkout.session.expired` → Payment `CANCELED`, pending registration `EXPIRED`.
  - `payment_intent.payment_failed` → Payment `FAILED` with reason.
  - `charge.refunded` → Payment `REFUNDED`/`PARTIALLY_REFUNDED`; registration `REFUNDED` when
    fully refunded (reconciles dashboard-initiated refunds).
  - `account.updated` → sync organization Connect flags.
- Responses: `200 {received:true}`; `400` bad/missing signature; `503` payments not
  configured; `500` on handler error (Stripe retries).

## Public routes

- `GET /rinks/[slug]/schedule` — renders self-register sessions/lessons with price, remaining
  spots, and Register/Buy actions; `?registration=success|canceled` shows a status banner.
- `GET /my-registrations` — authenticated end-user registrations with receipts and cancel.
- `GET /venue-admin/[organizationId]/payments` — Connect status + revenue.
- `GET /venue-admin/[organizationId]/venues/[venueId]/registrations` — roster + refunds.
