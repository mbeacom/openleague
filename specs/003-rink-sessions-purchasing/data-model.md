# Data Model: Rink Session Management & Purchasing

Extends the `002-ice-rink-management` data model. Amounts are stored in the smallest currency
unit (cents).

## Extended: VenueOrganization (Stripe Connect)

New fields on the existing model:

- `stripeAccountId` (unique, nullable) — connected Express account id (`acct_...`).
- `stripeChargesEnabled` (bool) — mirrors Stripe `charges_enabled`.
- `stripePayoutsEnabled` (bool) — mirrors Stripe `payouts_enabled`.
- `stripeDetailsSubmitted` (bool) — mirrors Stripe `details_submitted`.
- `platformFeeBps` (int, nullable) — optional per-org application fee in basis points;
  falls back to `STRIPE_PLATFORM_FEE_BPS` (default 0).

Onboarding is complete when `stripeChargesEnabled && stripeDetailsSubmitted`.

## Extended enum: RegistrationMode

Adds `SELF_REGISTER` to the existing `INFO_ONLY | REQUEST_REQUIRED | EXTERNAL_REGISTRATION`.
Schedule blocks and lesson offerings in this mode are open for end-user opt-in; a positive
`priceAmount` makes them paid, otherwise free.

## New enum: SessionRegistrationStatus

`PENDING | CONFIRMED | WAITLISTED | CANCELED | REFUNDED | EXPIRED`

State transitions:

- Free: create → `CONFIRMED`.
- Paid: create → `PENDING` → (`checkout.session.completed`) → `CONFIRMED`.
- `PENDING` → `EXPIRED` (checkout expired / rolled back).
- `CONFIRMED` → `CANCELED` (free self-cancel) or `REFUNDED` (rink refund / `charge.refunded`).

## New enum: PaymentStatus

`FREE | REQUIRES_PAYMENT | PROCESSING | PAID | FAILED | REFUNDED | PARTIALLY_REFUNDED | CANCELED`

## New model: SessionRegistration

An individual end user's opt-in to exactly one schedule block **or** one lesson offering.

Fields: `id`, `status`, `participantName`, `participantEmail`, `participantPhone?`,
`skillLevelNote?`, `notes?`, `quantity` (default 1), `unitAmount`, `amountTotal`, `currency`,
`confirmedAt?`, `canceledAt?`, timestamps.

Relations: `venue` (denormalized for auth/queries), `scheduleBlock?`, `lessonOffering?`,
`user` (registrant), `canceledBy?`, `payment?` (1:1).

Validation:

- Exactly one of `scheduleBlockId` / `lessonOfferingId`.
- Registrant must be authenticated.
- Price is snapshotted from the offering server-side (never client-supplied).
- Capacity (schedule blocks): confirmed + actively held pending quantities ≤ `capacity`.

Indexes: `[venueId, status]`, `[scheduleBlockId, status]`, `[lessonOfferingId, status]`,
`[userId]`.

## New model: Payment

A Stripe payment for a paid registration (1:1). Free registrations have no Payment row.

Fields: `id`, `status`, `amount`, `currency`, `applicationFeeAmount`, `refundedAmount`,
`stripeAccountId?`, `stripeCheckoutSessionId?` (unique), `stripePaymentIntentId?` (unique),
`receiptUrl?`, `failureReason?`, `paidAt?`, `refundedAt?`, timestamps.

Relations: `registration` (unique 1:1), `venue`, `organization`.

Indexes: unique on checkout session id / payment intent id / registration id;
`[organizationId, status]`, `[venueId, status]`, `[stripePaymentIntentId]`.

## Public data boundaries

Public schedule responses expose only aggregate registration **quantities** (to compute
remaining spots) — never participant identity, contact info, or payment details. Participant
and payment data are visible only to the registrant and to authorized rink staff.

## Migration notes

- Migration `20260630000000_add_rink_sessions_purchasing` adds the enum value, new enums,
  organization columns, and the two tables with their indexes and foreign keys.
- `ALTER TYPE "RegistrationMode" ADD VALUE 'SELF_REGISTER'` is additive and not used within the
  same migration, so it is safe on PostgreSQL 12+.
- Existing venues, schedule blocks, lessons, and requests are unaffected.
