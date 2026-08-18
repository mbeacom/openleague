# Quickstart Validation: Association Operations

## Prerequisites

- Install dependencies with `bun install`.
- Configure the existing required environment variables.
- Export `SPECIFY_FEATURE=007-association-operations` before running branch-sensitive SpecKit scripts from this app-managed worktree.
- Use a development PostgreSQL database with migrations applied.
- Seed or create:
  - one association with two divisions and four teams;
  - two team managers and one scheduler;
  - one venue organization with one full ice surface and two coexisting half-ice segments;
  - one venue manager;
  - players/guardians on two teams;
  - the merged association gear capability with one pooled item, one tagged unit, one submitted team need, one overdue custody reservation, and one published wishlist.

## Scenario 1 - Request to Practice

1. Venue staff publishes a two-hour requestable offering.
2. Association scheduler requests one hour on half ice.
3. Venue manager partially approves the requested interval if needed.
4. Confirm one reservation is created.
5. Association scheduler assigns it to a practice and attaches a practice plan.
6. Verify one participant-facing Event and RSVPs are created.
7. Verify association, team, participant, and venue schedules show one canonical item.
8. Attempt a conflicting non-coexisting reservation and verify rejection.

## Scenario 2 - Complete Season

1. Create pre-season and regular-season phases.
2. Place teams into season-specific divisions.
3. Confirm several venue reservations.
4. Generate a draft schedule from those reservations.
5. Commit a competing reservation before publication.
6. Publish and verify the stale game fails with a structured conflict.
7. Resolve inventory and publish.
8. Verify each game, participant Event, RSVP set, reservation, and calendar entry stays linked and appears once.

## Scenario 3 - Delegated Workforce

1. Invite a new team manager, volunteer coordinator, and equipment manager.
2. Accept the invitations through account creation.
3. Create volunteer needs for scorekeeping and check-in.
4. Accept one assignment as a volunteer.
5. Submit a team gear need, approve it as the equipment manager, and open the existing custody workflow.
6. Verify the equipment manager can use authorized inventory/wishlist functions but cannot manage association finance or venue scheduling.
7. Verify the team manager cannot manage association finance or unrelated teams.
8. Verify the coordinator sees fulfillment without private household data.

## Scenario 4 - Public Presence

1. Configure and publish association identity and one team profile.
2. Publish a public announcement and schedule a second post.
3. Verify association home, team directory, team page, schedule, event rollup, news routes, and the published gear-wishlist link.
4. Change a slug and verify the old route redirects.
5. Verify private roster, guardian, RSVP, payment, invitation, audit, gear inventory/location/custody, donor contact, share-token page data, and outbox data never appear in public responses.

## Scenario 5 - Utilization and Export

1. Complete one reservation, release one, cancel one, and mark one unused.
2. Verify utilization totals by association, team, venue, surface, segment, status, and date.
3. Review one normalized timeline containing general audit, venue activity, and gear ledger entries while preserving source identity.
4. Export association data with payment and media integrations disabled.
5. Verify the schema version, relational references, gear projections, custody history, and append-only movement/handoff references.
6. Verify secrets, raw tokens, credentials, private storage notes, outbox recipient snapshots, donor/custodian PII, and unrelated tenant data are absent.

## Scenario 6 - Durable Notification Reuse

1. Trigger one gear event and one venue-reservation event in separate domain transactions.
2. Verify both create durable intent in the existing `NotificationOutbox`.
3. Verify the gear registry remains authoritative for gear events and the association-operations registry validates the venue event.
4. Verify `gear-outbox-worker.ts` claims only gear events, the association-operations worker claims only its registered non-gear events, and both delegate preferences, batching, and provider delivery to `NotificationService`.
5. Verify provider-accepted, batched, suppressed, stale/canceled, and failed outcomes remain distinguishable without claiming mailbox delivery.

## Concurrency Validation

Run PostgreSQL-backed integration coverage that submits two simultaneous approvals or assignments for overlapping non-coexisting space. Exactly one may commit unless an authorized actor supplies a valid reasoned override.

## Timed Assignment Protocol

1. Seed one approved, unassigned venue reservation.
2. Start the timer when a signed-in scheduler opens that reservation.
3. Assign it to a planned practice without re-entering venue, surface, segment, start, or end.
4. Stop the timer when the practice appears on the team schedule.
5. Pass when completion is under 5 minutes and the canonical schedule shows one item.

## First-Time Operator Study

1. Recruit at least 10 participants who have not operated this feature.
2. Give each participant the same seeded association and only the instruction to identify:
   - unassigned venue ice;
   - one scheduling conflict;
   - one volunteer shortage;
   - one urgent gear need;
   - one overdue gear custody record.
3. Do not provide facilitator assistance after the task begins.
4. Pass when at least 9 of 10 identify all five items.

## Public Navigation Protocol

Run `__tests__/app/public-association-navigation.test.tsx`. The test starts at
the published association home and counts link/button activations. Each
published team, schedule, signup event, announcement, and active gear wishlist
must be reachable in no more than three activations.

## Provider Failure Protocol

1. Run `__tests__/integration/core-provider-absence.test.ts` with payment/media disabled.
2. Inject email-provider rejection and media/storage unavailability.
3. Execute venue scheduling, registration, volunteer, communication, reporting, and export flows.
4. Pass when core domain records remain committed and readable, degraded outcomes are visible and durable, retries apply only where defined, and no workflow returns a false success.

## Self-Hosted Reference Smoke Test

1. Use a generic PostgreSQL deployment and a replaceable email transport; do not configure Stripe or proprietary media storage.
2. Apply migrations, seed the prerequisites above, and run Scenarios 1-6.
3. Run `bun run type-check`, `bun run lint`, and the focused suites.
4. Pass when every core scenario completes without entitlement checks, per-player fees, platform commissions, or mandatory proprietary storage.

## Commands

```bash
export SPECIFY_FEATURE=007-association-operations
bun run db:generate
bun run type-check
bun run lint
bun run check:raw-sql
bun run adr:lint
bun run test
```

Use targeted Vitest files during implementation, then run the full suite before completion.
