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
  - type: path
    pattern: "lib/actions/**"
    note: Where most queries are authored, and where user input reaches them.
  - type: path
    pattern: "app/api/**"
    note: The other surface that queries the database directly.
  - type: path
    pattern: "scripts/check-raw-sql.ts"
    note: The pull-request gate that enforces the raw-SQL prohibition below.
  - type: path
    pattern: "eslint.config.mjs"
    note: Carries the authoring-time half of the same prohibition.
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
requirements, not conveniences. The schema now holds 60 models across 35
migrations.

Two forces shaped the data-access decision at project bootstrap:

- **The deployment target is serverless.** The app runs on Vercel, where each
  function invocation may open its own connection. A conventional connection
  pool held in a long-lived process does not exist; connection exhaustion is the
  default failure mode unless the driver is chosen for it.
- **Parameterization had to be the default, not a thing to remember.** Most
  mutation paths accept user-authored strings, and the roster holds emergency
  contacts, emergency phone numbers, and USA Hockey member IDs. A convention of
  "remember to parameterize" is a convention that eventually is not remembered.
  Note the goal is a safe *default*, not an impossibility proof: any ORM worth
  using still exposes a raw escape hatch (see Trade-offs).

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

`$queryRawUnsafe` and `$executeRawUnsafe` are prohibited outright. They take a
plain string rather than a tagged template, so they do not parameterize
anything, and no current or foreseen requirement needs them. Introducing one
requires superseding this record, not a reviewer's judgment call.

Both rules are enforced by tooling rather than by review: `no-restricted-syntax`
rules in `eslint.config.mjs` while the code is being written, and
`scripts/check-raw-sql.ts` as a job in the pull-request-triggered ADR workflow.
Trade-offs records what that pair does and does not catch.

The client is a single instance created in `lib/db/prisma.ts` and cached on
`globalThis` outside production so hot reload does not accumulate clients. The
driver adapter is selected from the connection string: Neon's serverless driver
for `*.neon.tech` hosts, and the standard `pg` adapter for anything else, so
self-hosted PostgreSQL and CI service containers work without a code change.

## Options considered

### Option A: Prisma with Neon serverless driver (chosen)

| Dimension | Assessment |
|---|---|
| Injection safety | Parameterized by default; the unsafe raw APIs exist but are prohibited by this record |
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
**Cons:** makes the *default* path an unparameterized one, so injection safety
becomes a matter of discipline on every query rather than something you opt out
of, and hands migration management to us. The point of the choice was to invert
which path takes effort.

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
- **The prohibition is enforced now, but it is still not a guarantee.** Prisma
  still exposes `$queryRawUnsafe` and `$executeRawUnsafe`, which interpolate
  strings directly. Two gates block them. `no-restricted-syntax` rules in
  `eslint.config.mjs` are AST-accurate and fire in the editor;
  `scripts/check-raw-sql.ts` runs as its own job in the ADR workflow. The
  second exists because the first is not a merge gate here — `bun run lint`
  runs only in `release.yml` and `tag-release.yml`, both push-triggered, so an
  ESLint rule alone would let a violation merge and break the release pipeline
  afterwards (#310) — and because an inline `eslint-disable` can silence a
  rule where no comment can silence the script. What neither gate catches:
  both match member access, so a destructured or aliased binding such as
  `const { $queryRawUnsafe } = prisma` passes both, and the script matches text
  rather than parsing (it blanks comments first, but it is a filter, not a
  proof). Closing that gap needs type-aware linting, which this repo does not
  run. Read the pair as a gate against the lapse this record is actually
  worried about, not as a proof that no unsafe query can reach `main`.
- **Cold-start cost.** The generated client is large; `prisma generate` runs on
  every install, and it fails without a `DATABASE_URL` present — a real papercut
  in fresh environments and CI.
- **Vendor exposure is smaller than it looks.** Neon is where the data lives,
  but the adapter selection in `lib/db/prisma.ts` means the code already runs
  against plain PostgreSQL. The lock-in is Prisma, not Neon.

## Consequences

- **Easier:** schema changes are reviewable diffs; the safe query path is also
  the convenient one, so injection takes deliberate effort rather than a lapse;
  query results are typed end-to-end into Server Actions.
- **Harder:** analytical queries, and any future migration off Prisma.
- **How we would know this was wrong:** if features start requiring raw SQL
  regularly — so the "no `$queryRaw`" rule accrues exceptions — the abstraction
  is no longer paying for itself. Equally, if Prisma cold starts become a
  measurable share of serverless response time on the hot paths.
- **How we would know the *enforcement* has been outgrown:** if either
  documented gap ever appears in a real diff — a computed name assembled by
  concatenation (`prisma["$query" + "Raw"]`), or a destructured or aliased
  binding (`const { $queryRawUnsafe } = prisma`) — then a text-and-selector
  gate is no longer sufficient, and the answer is type-aware linting rather
  than another pattern. The concatenation case is the likelier of the two to
  arrive by accident, since an unlucky refactor reaches it without anyone
  intending to evade anything; the aliased binding takes deliberate effort.
  Adding a third regex in response would be treating the symptom.
- **Revisit if:** reporting or analytics becomes a first-class feature, or the
  deployment target stops being serverless.

## Action items

1. [x] `lib/db/prisma.ts` is the only client construction site
2. [x] Adapter selection covers Neon and plain PostgreSQL
3. [x] `no-restricted-syntax` rules in `eslint.config.mjs` and
   `scripts/check-raw-sql.ts` — the latter a job in
   `.github/workflows/adr.yml`, so it gates pull requests — fail on
   `$queryRaw`/`$executeRaw` under `app/`, `lib/`, or `components/`, excepting
   `app/api/health/route.ts`, and on `$queryRawUnsafe`/`$executeRawUnsafe`
   anywhere. Both were watched failing on a seeded violation before landing.
   The gap they do not close is recorded under Trade-offs.
