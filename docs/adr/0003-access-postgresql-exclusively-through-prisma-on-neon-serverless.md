---
schemaVersion: 0.1.0
id: "0003"
title: Access PostgreSQL exclusively through Prisma on Neon serverless
status: accepted
date: 2025-10-05
created: 2026-08-09
deciders: ["@mbeacom"]
tags: [architecture, database, prisma, security]
scope: org
reversibility: one-way-door
blastRadius: org
relatesTo: ["0002"]
affects:
  - type: path
    pattern: "prisma/**"
  - type: path
    pattern: "lib/db/**"
provenance:
  authoredBy: agent-drafted
  ratifiedBy: "@mbeacom"
  sourceArtifact: CLAUDE.md
review:
  tier: async
  tierReason: >-
    One-way door, so the auto fast path is not available. Backfilled from an
    existing, already-load-bearing convention rather than newly proposed.
reviewBy: 2027-08-09
---

# ADR-0003: Access PostgreSQL exclusively through Prisma on Neon serverless

## Context

OpenLeague's domain is relational and heavily constrained: teams that may or may
not belong to a league, divisions, seasons with phases, events with RSVPs,
venues with ice surfaces and drawn segments, invitations with expiring tokens,
and an audit log. Referential integrity and cascade behaviour are correctness
requirements, not conveniences. The schema now holds 60 models across 36
migrations.

Two forces shaped the data-access decision at project bootstrap:

- **The deployment target is serverless.** The app runs on Vercel, where each
  function invocation may open its own connection. A conventional connection
  pool held in a long-lived process does not exist; connection exhaustion is the
  default failure mode unless the driver is chosen for it.
- **SQL injection had to be structurally impossible, not merely avoided.** Most
  mutation paths accept user-authored strings, and the roster holds emergency
  contacts, emergency phone numbers, and USA Hockey member IDs. A convention of
  "remember to parameterize" is a convention that eventually is not remembered.

## Decision

We will access the database exclusively through Prisma. `prisma/schema.prisma`
is the single source of truth for the data model, and every schema change ships
as a checked-in migration alongside it. All application queries go through the
generated, parameterized client. `$queryRaw` and `$executeRaw` are not used
anywhere under `app/`, `lib/`, or `components/` except `app/api/health/route.ts`,
whose single statement is `SELECT 1` and takes no input. One maintenance script
outside the deployed application (`scripts/check-cols.ts`) reads
`information_schema` through `$queryRaw`; it uses Prisma's tagged-template form,
so its interpolations are parameterized rather than concatenated.

The client is a single instance created in `lib/db/prisma.ts` and cached on
`globalThis` outside production so hot reload does not accumulate clients. The
driver adapter is selected from the connection string: Neon's serverless driver
for `*.neon.tech` hosts, and the standard `pg` adapter for anything else, so
self-hosted PostgreSQL and CI service containers work without a code change.

## Options considered

### Option A: Prisma with Neon serverless driver (chosen)

| Dimension | Assessment |
|---|---|
| Injection safety | Structural — the query API is parameterized; raw SQL is opt-in and unused |
| Schema authority | Declarative schema plus generated migrations |
| Type safety | Generated client types flow into Server Actions and components |
| Serverless fit | HTTP/WebSocket driver avoids TCP pool exhaustion |
| Complex SQL | Weakest area — window functions and recursive CTEs are awkward |
| Coupling | High: generated types and migration history pervade the codebase |

### Option B: Drizzle ORM

**Pros:** thinner runtime, SQL-shaped API, no code generation step, smaller cold
start.
**Cons:** at the time of the decision its migration tooling was less mature than
Prisma Migrate, and the schema-as-TypeScript model gives no single declarative
artifact to diff. For a 60-model relational schema, the declarative file and a
linear migration history were worth more than the runtime savings.

### Option C: A query builder (Kysely) or raw `pg`

**Pros:** full SQL expressiveness; no ORM abstraction to fight; minimal
dependency surface.
**Cons:** returns injection safety to a matter of discipline, and hands migration
management to us. The whole point of the choice was to make the unsafe path
unavailable rather than discouraged.

### Option D: A hosted backend platform (Supabase, Firebase)

**Pros:** database, auth, storage, and realtime in one product; less to operate.
**Cons:** couples the data layer to a vendor's client SDK and auth model, when
Auth.js already covers authentication. Firebase's document model is a poor fit
for a schema this relational.

## Trade-offs

- **This is a one-way door in practice.** Generated Prisma types are imported
  throughout `lib/actions/` and the component tree, and 35 migrations encode the
  schema's history. Replacing the ORM is a rewrite of the data layer, not a
  swap. The record says `one-way-door` because that is true, not because the
  decision is regretted.
- **Complex analytical SQL is awkward.** Anything beyond Prisma's query API
  means raw SQL, which this decision otherwise forbids. If reporting features
  arrive, that tension becomes real.
- **Cold-start cost.** The generated client is large; `prisma generate` runs on
  every install, and it fails without a `DATABASE_URL` present — a real papercut
  in fresh environments and CI.
- **Vendor exposure is smaller than it looks.** Neon is where the data lives,
  but the adapter selection in `lib/db/prisma.ts` means the code already runs
  against plain PostgreSQL. The lock-in is Prisma, not Neon.

## Consequences

- **Easier:** schema changes are reviewable diffs; injection is not an available
  mistake; query results are typed end-to-end into Server Actions.
- **Harder:** analytical queries, and any future migration off Prisma.
- **How we would know this was wrong:** if features start requiring raw SQL
  regularly — so the "no `$queryRaw`" rule accrues exceptions — the abstraction
  is no longer paying for itself. Equally, if Prisma cold starts become a
  measurable share of serverless response time on the hot paths.
- **Revisit if:** reporting or analytics becomes a first-class feature, or the
  deployment target stops being serverless.

## Action items

1. [x] `lib/db/prisma.ts` is the only client construction site
2. [x] Adapter selection covers Neon and plain PostgreSQL
3. [ ] Add a lint rule or CI grep failing on `$queryRaw`/`$executeRaw` under
   `app/`, `lib/`, or `components/`, excepting `app/api/health/`
