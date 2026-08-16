# Gear notification delivery

Gear notifications are delivered by a durable outbox: a domain action writes a
row inside the same transaction as its state change, and a worker drains that
row out-of-band. This document covers the delivery guarantees, the ownership
boundaries, and the runbook for the two failure modes an operator can actually
act on — a growing backlog and a dead letter.

Governing decision: [ADR-0006](./adr/0006-model-league-owned-gear-with-ledger-projections-and-an-outbox.md).

## Components and ownership

| File | Owns |
| --- | --- |
| `lib/services/gear-notification-registry.ts` | What a gear notification *is*: event type, aggregate, payload schema, priority, digest copy |
| `lib/services/gear-outbox.ts` | Enqueue (idempotent, transaction-bound) |
| `lib/services/gear-outbox-worker.ts` | Claim, order, retry, transition, health |
| `lib/services/notification.ts` | Preferences, routing, batching, provider policy |
| `lib/services/gear-reminders.ts` | Time-driven due-soon / overdue reminders and their cancellation |
| `lib/services/gear-outbox-dead-letter.ts` | Operator inspection, redrive, replay |
| `app/api/cron/gear-notifications/route.ts` | Scheduling and stage isolation |

These boundaries are load-bearing, not stylistic:

- **The registry is the only place a gear event is defined.** Adding an event
  means adding one registry entry; the discriminated union, the payload schema,
  the priority, and the digest copy are all derived from it. Nothing else in the
  system should switch on an event type string.
- **The worker never decides whether a message should be delivered.** It asks
  `NotificationService.deliverGearNotification()` and records the answer. If you
  find yourself reading a `NotificationPreference` row in the worker, the change
  belongs in the service instead.
- **`NotificationService` never decides whether a message should be retried.**
  It returns an honest outcome for policy decisions and *throws* for
  infrastructure failures, because only the worker knows the attempt count.

## Delivery semantics: at-least-once

**A gear notification may be delivered more than once. It will not be silently
dropped.** This is a deliberate trade: the alternative (at-most-once) would mean
a worker crash between "provider accepted" and "row marked sent" loses the
notification entirely, and a lost custody reminder is worse than a duplicate.

Duplicates are possible in exactly one window: the provider accepts the message,
and the process dies before the row transitions to `SENT`. The row's lock goes
stale after 10 minutes, returns to `PENDING`, and is delivered again. In
practice this is rare; it is not impossible, and downstream consumers (including
the recipient) must tolerate it.

### What prevents *routine* duplication

Enqueue is idempotent on `[leagueId, dedupeKey]`, where the dedupe key is:

```
${eventType}:${aggregateId}:${occurrenceKey}:${identity}
```

`identity` is `user:<accountId>` for a league account, and `anon:<digest>` for a
recipient without one — never the address itself. See
[Recipient identity](#recipient-identity-in-dedupe-keys).

The `occurrenceKey` is what makes a *repeatable* event distinguishable from a
*retried* one. A reservation can only be approved once, so its occurrence key is
a constant (`"approved"`). A reservation can be overdue on many days, so the
overdue reminder re-keys to the calendar date (`gear.reservation.overdue:2026-08-17`)
— today's reminder is a new occurrence, but running the cron five times today
still produces one row.

Enqueue therefore uses `createMany({ skipDuplicates: true })`. Calling a domain
action twice with the same effect does not produce two emails.

### Statuses and what they mean

| Status | Meaning |
| --- | --- |
| `PENDING` | Awaiting delivery, or awaiting an earlier sibling (see ordering) |
| `PROCESSING` | Claimed by a worker; reverts to `PENDING` if the lock goes stale |
| `SENT` | Handed to a provider **or** durably queued into a digest batch |
| `CANCELED` | Deliberately not delivered — suppressed by preference, or a stale reminder |
| `FAILED` | Dead letter. Retries are exhausted, or the event is undeliverable as written |

`SENT` is a statement about the outbox's obligation, not about an inbox. A
digested message is `SENT` the moment it is durably queued into a
`NotificationBatch`; whether that batch has flushed is the batch's business.

`CANCELED` is not a failure and does not page. Two things produce it: a
recipient's preferences said no, or a reminder was superseded before it was
delivered. Both are correct outcomes.

## Ordering

Within a **recipient + aggregate** domain, messages are delivered in creation
order. The domain key is:

```
leagueId | user:<id> or email:<addr> | aggregateType | aggregateId
```

The worker enforces this by claiming at most one message per domain per run, and
by skipping any candidate that has an older `PENDING`/`PROCESSING` sibling in the
same domain. Skipped rows are left untouched — no status change, no attempt
consumed — and reported as `skippedForOrdering`.

**What this guarantees:** a member will not see "returned" before "picked up"
for the same reservation.

**What this does not guarantee:**

- No ordering across aggregates. Two different reservations are independent.
- No ordering across recipients. Two people are independent.
- No ordering once a message reaches a digest. Digest ordering is the batch's
  concern.
- No ordering across a dead letter. If a message fails permanently, its
  successors proceed without it.

Ordering costs throughput: a domain with a stuck message drains at one message
per cron run until it clears or dead-letters. This is why backlog age matters
more than backlog depth (see below).

## Retries

Attempts are bounded at `GEAR_OUTBOX_MAX_ATTEMPTS = 5` with exponential backoff
(1 min, 2, 4, 8, 16 … capped at 1 hour). Only *infrastructure* failures consume
an attempt. A policy decision (suppressed, digested) is terminal on the first
pass, and an event that violates the registry contract dead-letters immediately
rather than burning five attempts on an outcome that cannot change.

Failure text is sanitized before it is persisted: email addresses and long hex
identifiers are replaced with `[redacted]`, and the message is truncated to 300
characters. `lastError` is safe to show an operator; it is not safe to assume it
contains the full provider response.

## Reminders

`queueGearCustodyReminders()` scans fulfilled reservations whose due date has
passed or is approaching, and enqueues `gear.reservation.due_soon` or
`gear.reservation.overdue`.

It is **paged and budgeted**: it walks by `id` cursor in pages of 100 and stops
after 500 reservations in a single run, reporting `truncated: true`. A durable,
optimistically versioned `GearReminderSweep` cursor records the final id. The
next cron run starts after that id; reaching the end resets the cursor for the
next complete pass. This prevents a stable set of earliest overdue reservations
from starving later reservations indefinitely. Concurrent runs may revisit a
page, but occurrence keys keep those writes idempotent.

A league that has let 10,000 items go overdue cannot make one cron invocation
run for an unbounded time. Each reservation is processed in its **own**
transaction inside its own `try`, so one malformed row cannot abort the sweep
for everyone else — failures are counted and reported, not thrown.

### Stale reminders

`cancelStaleGearCustodyReminders()` runs **before** queueing and cancels
`PENDING` reminders that no longer describe reality:

- the reservation no longer exists
- the reservation is no longer `FULFILLED` (it was returned)
- the payload's due date no longer matches the reservation's due date (it was
  extended)
- a due-soon reminder has been superseded by the item actually going overdue

Cancellation is a `PENDING`-only compare-and-set. A reminder that a worker has
already claimed is never yanked out from under it — the worker's own suppression
path handles that case. This means cancellation is best-effort by design: it
reduces wrong reminders, it does not promise zero.

## Cron and stage isolation

`GET /api/cron/gear-notifications` authenticates with a constant-time bearer
comparison and then runs four stages, each independently caught:

1. cancel stale reminders
2. queue due reminders
3. drain the outbox
4. read health

A failure in one stage does not prevent the others. The response is:

```jsonc
{
  "success": false,          // false if ANY stage failed
  "reminders": { ... },
  "canceled": { ... },
  "delivery": { ... },
  "health": { ... },
  "errors": ["reminders: ..."]  // present only on partial failure
}
```

**HTTP status is not the health signal.** A partial failure returns `200` with
`success: false`, because retrying the whole invocation would redo the stages
that worked. Only a total failure of all three mutating stages returns `500`.
Alerting should read `success` and `errors`, not the status code.

## Health and follow-up

`getGearOutboxHealth()` returns a cheap global snapshot — pending depth,
in-flight count, dead-letter count, and `oldestPendingAgeMs`. That last field is
how long the oldest row that is *already due* has been waiting past its
`scheduledAt`; a message sitting in retry backoff is not yet due and does not
inflate it, so the number means "overdue", not merely "unsent".

Two thresholds are exported so alerting and the worker agree on what "behind"
means, and the snapshot pre-computes them into a single `backlogged` boolean:

| Signal | Threshold | Meaning | Action |
| --- | --- | --- | --- |
| `oldestPendingAgeMs` | `GEAR_OUTBOX_BACKLOG_AGE_MS` (30 min) | Something is stuck, not merely busy | Investigate first — this is the real signal |
| `pending` | `GEAR_OUTBOX_BACKLOG_DEPTH` (500) | One cron slice can no longer drain the queue | Raise cron frequency or batch size |
| `deadLettered` | any sustained growth | Delivery is failing permanently | Run the dead-letter runbook |

Prefer **age** over **depth**. A deep queue that is young is a busy league and
will drain. A shallow queue that is old means ordering is blocked behind a
message that keeps failing, and depth will not reveal it.

These counts are instance-wide, not per-league: they answer "is delivery
healthy", not "is this league healthy". Use `inspectGearDeadLetters()` for the
per-league view.

## Dead-letter runbook

All three operations require `LEAGUE_ADMIN` on the league in question, are scoped
so a message from another league reads as `NOT_FOUND`, and write an audit row.

### 1. Inspect

```ts
await inspectGearDeadLetters({ leagueId });
```

Returns masked recipients (`m*****@example.com`), attempt history, sanitized
`lastError`, and — critically — a `deliverable` flag. A row with
`deliverable: false` carries a `contractViolation` explaining which part of the
registry contract it fails. The page also reports `undeliverable`, the count of
such rows.

### 2. Decide

- **`deliverable: false`** — redriving will fail again immediately. The event was
  written by code that no longer agrees with the registry (a renamed event type,
  a changed payload shape). Fix the producer or add the registry entry. These
  rows are evidence of a bug, not a transient outage.
- **`deliverable: true`, transient `lastError`** (provider timeout, 5xx) —
  redrive once the provider is healthy.
- **`deliverable: true`, permanent `lastError`** (invalid recipient address) —
  redriving will not help. Fix the recipient's address first.

### 3. Redrive or replay

```ts
await redriveGearDeadLetters({ leagueId, outboxIds, reason });
```

Redrive returns the **existing** row to `PENDING` with `attempts` reset to 0. It
preserves `lastError` on the row, and records `previousAttempts` and
`previousError` in the audit entry so the history is not lost. It refuses rows
that are not `FAILED` (`NOT_DEAD_LETTERED`), rows from another league
(`NOT_FOUND`), and rows that violate the contract (`UNDELIVERABLE_CONTRACT`).
It is capped at 100 rows per call. Every outcome is reported per id — a partial
success is normal and is not an error.

```ts
await replayGearNotification({ leagueId, outboxId, reason });
```

Replay is different and rarer. It creates a **new** row with a suffixed dedupe
key (`<original>:replay:2`), leaving the original untouched. Use it when a
message was recorded as delivered but the recipient did not receive it — the
dedupe key would otherwise refuse the re-send. Replay deliberately bypasses
idempotency, so it requires a stated `reason` and is always audited.

### Audit trail

| Action | Written when |
| --- | --- |
| `gear.outbox.dead_letter.inspected` | A dead-letter page is read |
| `gear.outbox.dead_letter.redriven` | A row is returned to the queue |
| `gear.outbox.dead_letter.replayed` | A new row is created from an old one |

An audit write failure is logged, not thrown: it must not turn a successful
redrive into an apparent failure that an operator retries.

## Deleted and redacted recipients

A gear notification row deliberately outlives the account it was addressed to —
that is what makes the outbox durable. It must never outlive that account's
*right not to be contacted*.

Two schema facts make this subtle:

- `NotificationOutbox.recipientUser` is `onDelete: SetNull`. Deleting an account
  nulls `recipientUserId` **but leaves `recipientEmail`**, the snapshot captured
  at enqueue time.
- Gear genuinely does address some rows to a bare address with no account: a
  public in-kind donor receiving a pledge acknowledgement
  (`queueGearOutboxForEmail`).

So after a deletion, a row for a departed member is byte-for-byte shaped like a
donor row. Inferring "no account" from a null `recipientUserId` would reclassify
that member as an anonymous external recipient and email them their snapshot
address — league activity sent to someone who left.

**The worker therefore never infers addressing from `recipientUserId`.** It
derives an explicit `ACCOUNT | EXTERNAL` discriminant from the dedupe key, which
records the original addressing durably:

```
${eventType}:${aggregateId}:${occurrenceKey}:${identity}
                                              ^^^^^^^^^
                                     user:<accountId> | anon:<digest>
```

A row is `EXTERNAL` only when that identity segment is tagged `anon:` (ignoring
any `:replay:<n>` suffix). Everything else — including anything ambiguous — is
`ACCOUNT`, because that classification suppresses rather than sends.
`NotificationService` then dispatches on the discriminant, so an `ACCOUNT` row
is *structurally incapable* of reaching the external send path.

Because both forms are self-describing, this works on a row whose address has
already been redacted — the classifier never needs to read `recipientEmail`.

The resulting order of checks, all terminal and none retried:

| Condition | Outcome |
| --- | --- |
| `recipientRedactedAt` set | `SUPPRESSED / RECIPIENT_REDACTED` |
| `EXTERNAL` | delivered directly, no preference row |
| `ACCOUNT` with no `userId` (deleted) | `SUPPRESSED / RECIPIENT_UNAVAILABLE` |
| `ACCOUNT` whose user row is gone | `SUPPRESSED / RECIPIENT_UNAVAILABLE` |
| `ACCOUNT` with a live account | preference resolution |

Redaction is checked first, so a redacted row is suppressed regardless of how it
was addressed. All of these land the row in `CANCELED`, not `FAILED`: refusing
to contact a departed account is a correct outcome, not a delivery failure, and
must not page an operator or appear in the dead-letter queue.

Account deletion, cancellation, and redaction themselves are owned elsewhere;
the worker's only obligation is to never deliver what they have marked.

## Recipient identity in dedupe keys

A dedupe key is a **uniqueness constraint, not contact data**. Nothing redacts
it: it is not covered by recipient redaction, it is copied into replay keys, and
it surfaces in operator tooling. An address written into a dedupe key would
therefore outlive every deletion and erasure path in the system.

So the identity segment names the recipient without being able to reach them:

| Recipient | Segment | Why it is safe |
| --- | --- | --- |
| League account | `user:<accountId>` | Already an opaque internal handle |
| No account (donor) | `anon:<digest>` | Keyed HMAC-SHA256 of the normalized address, truncated to 128 bits |

The digest is derived in `lib/services/gear-recipient-identity.ts` with a key
derived from `NEXTAUTH_SECRET` under a fixed domain-separation label, so it is
not the raw application secret and not a bare hash an attacker could reverse
with a wordlist of addresses.

This is **pseudonymous, not anonymous**, and deliberately so:

- The same address always yields the same digest — that is exactly what makes
  deduplication work.
- It is not reversible without the key, so a database copy alone yields no
  addresses.
- It is not correlatable across deployments with different secrets.

Rotating `NEXTAUTH_SECRET` changes every future digest. Occurrences already
enqueued keep their old keys, so a producer re-run spanning the rotation can
emit one duplicate. That is within the at-least-once contract, and nothing else
breaks: addressing classification only reads the `anon:` tag, not the digest.

If `NEXTAUTH_SECRET` is absent, enqueue **throws** rather than writing an
unkeyed identity. This rolls the producing mutation back, which is the correct
trade: the secret is already required to authenticate anyone, so a real mutation
cannot reach that state.

Errors are held to the same rule. `sanitizeFailure` strips addresses and long
opaque identifiers from provider and database errors before they are written to
`lastError`, returned from dead-letter inspection, or copied into audit rows —
and its address pattern does not require a dotted domain, because SMTP errors
quote internal and malformed addresses too.

### Legacy keys and landed backfill

Keys written before this scheme embedded the address directly
(`…:${occurrenceKey}:donor@example.com`). Two things follow:

1. **The worker still classifies them.** `addressingFromDedupeKey` falls back to
   matching the captured address when a key carries no `user:`/`anon:` tag, so
   in-flight rows keep delivering across the deploy. This fallback is removable
   once the backfill below has run.
2. **Operator output masks them.** `replayGearNotification` returns the key
   through `maskDedupeKeyForDisplay`, which rewrites an address segment to
   `anon:[redacted]`. The stored key is left alone — rewriting it in place would
   break the uniqueness guarantee it exists to provide.

Historical rows are purged by the landed migration
`20260817110000_redact_legacy_gear_outbox_dedupe_emails`, which rewrites their
keys without requiring an application secret:

```sql
-- Replace the address in legacy gear dedupe keys with an opaque token.
-- Embedding the row id keeps [leagueId, dedupeKey] unique; the `anon:` tag
-- keeps the row classified as externally addressed by the worker.
UPDATE "NotificationOutbox"
SET "dedupeKey" = regexp_replace("dedupeKey", '(^|:)[^:]*@[^:]*', '\1anon:legacy-' || "id")
WHERE "eventType" LIKE 'gear.%'
  AND "dedupeKey" LIKE '%@%';
```

Migration notes:

- It must **not** recompute the real digest. That would require the application
  secret inside migration history.
- The `anon:` prefix is required, not cosmetic: the classifier matches
  `anon:<anything>`, so a backfilled row stays `EXTERNAL` and its donor receipt
  still sends.
- The `:replay:<n>` suffix and the event/aggregate/occurrence prefix are
  preserved, so replay counting and diagnostics keep working.
- Cross-format deduplication is already lost by the format change itself, so
  rewriting these rows costs nothing extra. Worst case a producer re-run for a
  still-pending legacy occurrence emits one duplicate — within the at-least-once
  contract.
- Vercel applies migrations during the build **before** it serves the new
  application writer. For the initial greenfield production rollout, this
  migration may ship with the opaque-key writer because the previously serving
  application has no gear outbox writer. It normalizes any preview or
  earlier-iteration rows, while the new worker remains compatible with legacy
  keys. Use a separate writer-first rollout only if a legacy-key writer has
  already reached production; then deploy the migration after every live writer
  uses opaque keys so no address-bearing rows are created during the
  build-to-rollout window.

## Adding a gear notification

1. Add one entry to the registry in `lib/services/gear-notification-registry.ts`
   — event type, aggregate type, payload schema, priority, subject/body copy.
2. Enqueue it from the domain action via `queueGearOutbox()`, inside the same
   transaction as the state change. Choose an `occurrenceKey` that is constant
   for a one-time event and varying for a repeatable one.
3. Add the type to the registry's exhaustiveness test.

Do not add a switch on the event type anywhere else. If a behavior varies by
event, it belongs in the registry entry.
