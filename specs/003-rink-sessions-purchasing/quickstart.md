# Quickstart: Rink Session Management & Purchasing

## Environment

Payments are optional. Without these vars the app runs in **free-registration-only** mode and
paid actions are hidden/disabled.

```bash
# .env.local
STRIPE_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_CONNECT_WEBHOOK_SECRET="whsec_..."   # signing secret for the Connect webhook endpoint
STRIPE_PLATFORM_FEE_BPS="0"                  # optional platform fee, basis points (250 = 2.5%)
```

## Database

```bash
bun run db:migrate:deploy   # apply 20260630000000_add_rink_sessions_purchasing
bun run db:generate         # regenerate Prisma Client
```

## Local Stripe webhooks

```bash
# Forward Connect events to the local endpoint
stripe listen --forward-connect-to localhost:3000/api/webhooks/stripe
# Use the printed whsec_... as STRIPE_CONNECT_WEBHOOK_SECRET
```

## Try it

1. As a rink admin, open `/venue-admin/{orgId}/payments` and click **Set up online payments**;
   complete Stripe Connect onboarding (test mode).
2. Create a schedule block (open skate / stick time / skills) or lesson offering with
   **registration mode = Self-register** and a price (or leave price 0 for free).
3. As a skater, open `/rinks/{slug}/schedule`, find the **Register & buy** section, and
   register:
   - Free → confirmed instantly; check `/my-registrations`.
   - Paid → redirected to Stripe Checkout; on success you return to the schedule with a
     confirmation banner and the registration appears (confirmed) once the webhook lands.
4. As a rink manager, open `/venue-admin/{orgId}/venues/{venueId}/registrations` to view the
   roster and revenue, and refund a paid registration.

## Tests

```bash
bun run test __tests__/lib/payments/stripe.test.ts
bun run test __tests__/lib/utils/validation-session-registration.test.ts
bun run test __tests__/lib/actions/session-registrations.test.ts
bun run test __tests__/app/api/webhooks/stripe.test.ts
```
