---
schemaVersion: 0.1.0
id: "0006"
title: Model league-owned gear with ledger projections and an outbox
status: accepted
date: 2026-08-16
created: 2026-08-16
deciders: ["@mbeacom"]
tags: [architecture, gear, inventory, ledger, notifications]
scope: org
reversibility: one-way-door
blastRadius: org
relatesTo: ["0002", "0003"]
affects:
  - type: path
    pattern: "prisma/schema.prisma"
  - type: path
    pattern: "prisma/migrations/*_gear_domain_foundation/**"
  - type: path
    pattern: "lib/actions/gear/**"
  - type: path
    pattern: "lib/utils/gear.ts"
  - type: path
    pattern: "types/gear.ts"
  - type: path
    pattern: "lib/utils/validation.ts"
  - type: path
    pattern: "lib/utils/permissions.ts"
  - type: path
    pattern: ".github/workflows/smoke-tests.yml"
provenance:
  authoredBy: agent-drafted
  ratifiedBy: "@mbeacom"
  sourceArtifact: "PR #331 review adjudication"
review:
  tier: async
  tierReason: >-
    Ratified after persistence, privacy, and operational review of the
    implementation boundary spanning inventory, custody, pledges, and delivery.
reviewBy: 2027-08-16
---

# ADR-0006: Model league-owned gear with ledger projections and an outbox

## Context

Associations need to track pooled gear, individually tagged assets, storage,
team needs, temporary custody, and public in-kind pledges. Gear is an
association resource, so its owner is a `League`, not a venue or venue
organization. Inventory changes and handoffs can affect safety, availability,
and accountability; replacing their history with a current row loses the
reasoning needed to resolve discrepancies.

The application also needs to notify people after gear changes. Sending a
message directly inside an inventory transaction couples durable state to an
unreliable external operation and creates a gap when the transaction succeeds
but delivery does not.

## Decision

We will model all gear as League-owned. Catalog items and named storage
locations support either pooled counts or individually tracked units. Current
inventory, reservation, allocation, and wishlist rows are mutable projections;
append-only gear activity, handoff, and inventory-movement rows retain the
operational ledger. Public donor contact data remains confined to pledges and
is never copied to generic activity details.

Allocation mutations will execute in serializable Prisma transactions and use
optimistic versions on mutable inventory and workflow projections. PostgreSQL
checks and partial unique indexes enforce local invariants such as nonnegative
quantities, one inventory source per allocation, and one active allocation for
a tagged unit. The ledger tables are insert-only at the PostgreSQL boundary;
corrections use compensating entries.

Tagged-unit allocations retain their effective date window and are protected by
a PostgreSQL exclusion constraint, so pending and active allocations for the
same unit cannot overlap while separate future windows remain possible.
Locations referenced by immutable movements are archive-only: history-bearing
references restrict deletion rather than being nulled.

Every notification intent will be persisted to a durable outbox in the same
transaction as its aggregate mutation. A later gear outbox worker owns claiming
and retry scheduling only; it delegates preferences, batching, and provider
delivery to the existing `NotificationService` and its `NotificationBatch`
path. That service remains the sole delivery-state owner, preventing a second
notification state machine.

Outbox rows retain a nullable user relation plus an immutable delivery-email
snapshot, so deleting a user cannot block an already durable notification. A
privileged terminal-retention procedure may replace that email with a redacted
address after the retention period; it preserves the event fact, intent
metadata, and delivery outcome. Donor and custodian contact data is held only
in mutable pledge/reservation snapshot fields, is never copied to activity or
outbox payloads, and is subject to the same controlled retention/redaction
policy. Activity and outbox payloads use typed allowlists rather than arbitrary
PII-bearing JSON.

## Options considered

### Option A: League-owned projections with an immutable ledger and outbox (chosen)

| Dimension | Assessment |
|---|---|
| Ownership | Matches association responsibility and keeps venue inventory out of scope |
| Operational history | Preserves physical movements and custody independently of current state |
| Concurrency | Serializable allocation writes protect scarce inventory |
| Delivery reliability | The outbox closes the database-commit-to-notification gap |
| Complexity | Requires projection and ledger writes to stay transactionally coordinated |

### Option B: Mutable inventory rows only

**Pros:** fewer tables and simpler CRUD.

**Cons:** cannot explain a missing unit, a returned damaged item, or an
availability adjustment after the current row is overwritten.

### Option C: Full event sourcing

**Pros:** one immutable source for all state and complete replayability.

**Cons:** read models, replay tooling, and event-versioning infrastructure are
unjustified for the first gear workflows. The domain needs durable history, not
the operational cost of a full event-sourced platform.

### Option D: Synchronous notifications from actions

**Pros:** fewer persisted records and immediate apparent delivery.

**Cons:** external delivery failure can occur after the inventory transaction
commits, leaving no durable retry intent.

## Trade-offs

- Projection and ledger writes must be kept in the same transaction.
- Serializable transactions can abort and need bounded retry handling.
- Restrictive foreign keys retain operational movement-location history; storage
  locations must be archived rather than deleted.
- Migration SQL is transaction-wrapped. If a deployment fails, do not edit an
  applied migration: use `prisma migrate resolve` only after inspecting the
  failed migration, then recover a Neon branch from its restore point or create
  a fresh branch before retrying a corrected deployment.
- The outbox adds a processing component and monitoring requirement.

## Consequences

- Easier: reconcile inventory, audit custody, retry delivery, and add later
  gear workflows without redefining ownership.
- Harder: implement mutations because each state change must record both a
  projection update and its ledger/outbox effects.
- **How we would know this was wrong:** if normal gear workflows require
  replaying the ledger to answer routine reads, projections are insufficient;
  if the outbox repeatedly exceeds its delivery SLA, inline delivery may need a
  separate immediate channel in addition to—not instead of—the durable intent.
- Revisit if: venue operators must own inventory independently, or cross-league
  inventory transfers become a supported product requirement.

## Action items

1. [x] Add tenant-safe gear projections, immutable ledger records, and the
   notification outbox to the Prisma schema and migration.
2. [ ] Implement serializable inventory actions with retryable conflict handling.
3. [ ] Implement an outbox worker with bounded retries and observability.
4. [ ] Define production ledger/outbox capacity thresholds and archival policy.
5. [ ] Add parity guards before future gear enum changes duplicate across layers.
