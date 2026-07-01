# Feature Specification: Rink Session Management & Purchasing

**Feature Branch**: `003-rink-sessions-purchasing`
**Created**: 2026-06-30
**Status**: Implemented
**Input**: User description: "Session management and purchasing for ice rinks. A rink should be able to claim a business, add open skate/stick time sessions to a rink calendar, offer skills sessions and/or lessons like Snowplow for USA figure skating and/or Learn to Play for USA Hockey. This management should enable ice rink/organization scheduling and end-user opt-in (and ultimately purchase via Stripe or similar). The rink schedules should be viewable from the rink page."

## Context & Relationship to 002

Feature `002-ice-rink-management` already delivers venue organizations, staff roles,
bookable ice surfaces, operating hours, recurring schedule blocks (open skate, stick and
pick, skills, lessons, etc.), lesson offerings with optional USA Hockey / US Figure Skating
skill levels, team-oriented ice-time **requests**, and public rink + schedule pages. That
spec explicitly deferred payment collection: *"Pricing shown to users is informational for
the initial request workflow unless a later plan adds checkout, deposits, invoices, or
payment processing."*

This feature implements that deferred capability: **individual end-user opt-in
(registration/enrollment) and online purchasing via Stripe Connect.**

## User Scenarios & Testing

### User Story 1 - Rink connects a Stripe account to accept payments (Priority: P1)

A rink owner or manager connects their organization's Stripe account so skaters can pay for
sessions and lessons. The rink is the merchant of record and receives payouts directly;
OpenLeague may collect an optional platform application fee.

**Acceptance Scenarios**:

1. **Given** an organization admin, **When** they start payment setup, **Then** they are
   sent to Stripe Connect onboarding and returned to a payments page reflecting their status.
2. **Given** an incomplete Connect account, **When** the admin returns, **Then** the status
   shows "setup incomplete" and offers a way to finish onboarding.
3. **Given** a fully onboarded account, **When** a session has a price, **Then** skaters can
   purchase it and the rink can view revenue and manage payouts.

### User Story 2 - Skater registers for a free session (Priority: P1)

An authenticated skater opts into a free self-register session (e.g. open skate) and is
confirmed instantly, up to the session's capacity.

**Acceptance Scenarios**:

1. **Given** a published self-register session with no price, **When** a skater registers,
   **Then** the registration is confirmed immediately and a confirmation email is sent.
2. **Given** a session at capacity, **When** a skater tries to register, **Then** the system
   blocks it and reports the session is full (or remaining spots).

### User Story 3 - Skater purchases a paid session or lesson (Priority: P1)

An authenticated skater buys a spot in a paid session (stick time, skills clinic) or lesson
(Snowplow, Learn to Play) and pays securely via Stripe Checkout.

**Acceptance Scenarios**:

1. **Given** a paid self-register offering at an onboarded rink, **When** the skater
   registers, **Then** a pending registration is created and the skater is sent to Stripe
   Checkout on the rink's connected account.
2. **Given** successful payment, **When** Stripe notifies the platform, **Then** the
   registration is confirmed, a receipt/confirmation email is sent, and it appears in the
   skater's registrations.
3. **Given** the rink has not finished Stripe onboarding, **When** a skater tries to buy a
   paid offering, **Then** the system explains payments are not yet available.

### User Story 4 - Skater views and cancels their registrations (Priority: P2)

A skater views all their registrations across rinks, opens receipts, and cancels
unpaid/free registrations. Paid, confirmed registrations must be refunded by the rink.

### User Story 5 - Rink views registrations and issues refunds (Priority: P2)

Rink managers see a roster of registrations per venue with revenue totals, and can refund a
captured payment, which reverses the charge and marks the registration refunded.

### User Story 6 - Public schedule shows what's purchasable (Priority: P2)

The public rink schedule page shows self-register sessions and lessons with price, remaining
spots, and a Register/Buy action, alongside the existing schedule and ice-time requests.

### Edge Cases

- Payments are not configured on the deployment (Stripe keys unset) — paid actions are
  disabled gracefully; free registration still works.
- A rink's price changes after a checkout session is created — the registration snapshots the
  price at registration time.
- A checkout is abandoned or expires — the pending hold is released so the spot frees up.
- Duplicate/again-delivered Stripe webhooks — handlers are idempotent.
- A refund is initiated from the Stripe dashboard rather than the app — the `charge.refunded`
  webhook reconciles the registration state.

## Requirements

### Functional Requirements

- **FR-001**: Authorized organization admins MUST be able to connect a Stripe account and
  complete onboarding via Stripe-hosted flows.
- **FR-002**: The system MUST record and reflect the connected account's charges/payouts/
  details-submitted status and keep it in sync via `account.updated` webhooks.
- **FR-003**: Schedule blocks and lesson offerings MUST support a self-register registration
  mode distinct from information-only, request-required, and external-registration modes.
- **FR-004**: Authenticated end users MUST be able to register for self-register offerings,
  providing participant name, email, optional phone, optional skill-level note, quantity, and
  notes.
- **FR-005**: Free offerings MUST confirm instantly; the system MUST enforce capacity for
  schedule blocks using confirmed plus actively held pending registrations.
- **FR-006**: Paid offerings MUST create a Stripe Checkout Session as a direct charge on the
  rink's connected account, optionally applying a platform application fee.
- **FR-007**: The system MUST confirm registrations and send confirmation/receipt emails only
  after Stripe verifies payment via a signed webhook.
- **FR-008**: Registration prices MUST be snapshotted server-side and never accepted from the
  client.
- **FR-009**: End users MUST be able to view their registrations, open receipts, and cancel
  unpaid/free registrations.
- **FR-010**: Rink managers MUST be able to view registrations per venue with revenue totals
  and refund captured payments.
- **FR-011**: All payment and registration mutations MUST enforce authentication and
  role-based authorization; webhooks MUST verify the Stripe signature.
- **FR-012**: The public schedule page MUST display self-register sessions/lessons with price,
  remaining spots, and a Register/Buy action.

### Key Entities

- **Stripe Connect account** (fields on Venue Organization): connected account id and
  capability flags, optional platform fee override.
- **Session Registration**: an end user's opt-in to a schedule block or lesson offering, with
  participant snapshot, quantity, price snapshot, and lifecycle status.
- **Payment**: a Stripe payment for a registration (checkout session / payment intent ids,
  amounts, application fee, refund tracking, status).

## Assumptions

- Money flow uses **Stripe Connect direct charges**: the rink is the merchant of record and
  receives funds directly; OpenLeague may collect an application fee (default configurable via
  `STRIPE_PLATFORM_FEE_BPS`, overridable per organization).
- Payments are optional at the deployment level; when Stripe env vars are unset, the platform
  operates in free-registration-only mode.
- Amounts are stored in the smallest currency unit (cents), consistent with Stripe.
- Waitlisting is modeled in the schema (`WAITLISTED`) but full waitlist automation is a future
  enhancement; capacity overflow currently blocks registration.

## Success Criteria

- **SC-001**: A rink admin can connect Stripe and reach an onboarded state without manual
  support.
- **SC-002**: A skater can register for a free session in under 1 minute and receive
  confirmation.
- **SC-003**: A skater can purchase a paid session/lesson and be confirmed automatically after
  Stripe payment.
- **SC-004**: A rink manager can see per-venue revenue and refund a payment in under 2 minutes.
- **SC-005**: With Stripe unconfigured, no user-facing errors occur; paid actions are hidden or
  clearly disabled while free registration still works.
