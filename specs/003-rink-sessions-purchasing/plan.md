# Implementation Plan: Rink Session Management & Purchasing

**Branch**: `003-rink-sessions-purchasing` | **Date**: 2026-06-30 | **Spec**: [spec.md](./spec.md)

## Summary

Add individual end-user registration/enrollment and online purchasing to the existing ice
rink management feature. Skaters opt into self-register sessions and lessons; free offerings
confirm instantly, paid offerings are purchased through Stripe Checkout. Payments use **Stripe
Connect direct charges** so each rink is the merchant of record and receives funds directly,
with an optional platform application fee. Confirmation happens via signed Stripe webhooks.

## Technical Context

**Language/Version**: TypeScript, Next.js 16 App Router, React 19
**Primary Dependencies**: MUI v7/Emotion, Prisma 7, Neon PostgreSQL adapter, Auth.js v5, Zod v4, Bun, `stripe` SDK (Connect direct charges)
**Storage**: PostgreSQL via Prisma; amounts stored in cents
**Testing**: Vitest + Testing Library; Prisma/auth/Stripe/email mocked
**Payments**: Stripe Connect (Express accounts), direct charges with optional `application_fee_amount`
**Constraints**: Payments optional at deploy time (graceful free-only fallback); prices snapshotted server-side; webhooks signature-verified and idempotent; never expose participant data publicly

## Constitution Check

Applies the repository's active conventions (Server Components for reads, Server Actions for
mutations, session-helper auth, Zod validation in `lib/utils/validation.ts`, Prisma via
`lib/db/prisma.ts`, migration + client regen on schema changes). **Gate Result: PASS.**

## Architecture Decisions

1. **Direct charges over destination charges** — the rink owns the customer relationship and
   is the merchant of record. Checkout Sessions are created with `{ stripeAccount }`; the
   optional platform fee is `payment_intent_data.application_fee_amount`.
2. **Connect webhooks** — events originate from connected accounts (carry `account`) and are
   verified with `STRIPE_CONNECT_WEBHOOK_SECRET` at `POST /api/webhooks/stripe`.
3. **Registration + Payment split** — free registrations have no `Payment`; paid ones create a
   `Payment` placeholder before contacting Stripe and are confirmed on webhook.
4. **Capacity** — enforced by summing confirmed + actively held pending registration
   quantities against the block capacity; a 30-minute hold window prevents orphaned holds.
5. **Optional payments** — `isStripeEnabled()` gates paid flows; without keys the platform
   supports free registration only and hides/disables paid actions.

## Project Structure

```
prisma/schema.prisma                         # +Stripe fields, SessionRegistration, Payment, enums
prisma/migrations/20260630000000_add_rink_sessions_purchasing/
lib/payments/stripe.ts                       # Stripe client + Connect/checkout/refund/webhook helpers
lib/actions/venue-payments.ts                # Connect onboarding + status + payments overview
lib/actions/session-registrations.ts         # register, cancel, my-registrations, admin roster, refund
lib/email/templates.ts                       # +registration confirmation/manager emails
lib/utils/validation.ts                      # +session registration / connect / refund schemas
lib/utils/currency.ts                        # formatCurrencyFromCents
app/api/webhooks/stripe/route.ts             # Connect webhook handler
app/(marketing)/rinks/[slug]/schedule/page.tsx  # Register/Buy UI on public schedule
app/(dashboard)/my-registrations/page.tsx    # end-user registrations
app/(dashboard)/venue-admin/[organizationId]/payments/page.tsx           # Connect + revenue
app/(dashboard)/venue-admin/[organizationId]/venues/[venueId]/registrations/page.tsx
components/features/venue-admin/{SessionRegisterButton,StripeConnectCard,RefundRegistrationButton,CancelRegistrationButton}.tsx
```

## Phases

1. **Data model** — schema, migration, client regen.
2. **Payments core** — env vars, Stripe client lib, Connect onboarding actions, webhook route.
3. **Registration** — validation, registration/checkout/cancel/refund actions, emails.
4. **UI** — public Register/Buy, my-registrations, admin payments + registrations.
5. **Verification** — type-check, lint, unit tests, full suite.

## Out of Scope / Future

- Automated waitlist promotion (schema supports `WAITLISTED`).
- Deposits, subscriptions/memberships, multi-session packages, coupons.
- Partial/self-service refunds by end users.
- Deep USA Hockey / US Figure Skating verification (skill levels remain labels/filters).
