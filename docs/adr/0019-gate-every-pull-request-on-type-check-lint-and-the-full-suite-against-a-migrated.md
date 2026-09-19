---
schemaVersion: 0.1.0
id: "0019"
title: "Gate every pull request on type-check, lint, and the full suite against a migrated database"
status: proposed
date: 2026-09-19
created: 2026-09-19
deciders: ["@mbeacom"]
tags: [ci, testing, quality-gates]
scope: org
reversibility: two-way-door
blastRadius: org
relatesTo: ["0003", "0005", "0013"]
affects:
  - type: path
    pattern: ".github/workflows/quality-gates.yml"
    note: The gate itself; type-check, lint, and the suite on pull requests.
provenance:
  authoredBy: agent-drafted
  sourceArtifact: .github/workflows/quality-gates.yml
review:
  tier: async
  tierReason: >-
    Narrows ADR-0005's CI scope with a concrete gating commitment, and the
    reviewer may prefer it folded into that record instead.
reviewBy: 2027-03-19
---

# ADR-0019: Gate every pull request on type-check, lint, and the full suite against a migrated database

## Context

Until pull request #317 (commit `21b8d62`), the checks did not run where they
were needed. Type-check and lint ran only on push to `main` — after merge — and
the Vitest suite ran in no workflow at all.

The consequence is the kind that is obvious only afterwards: a change that broke
tests merged green, because nothing on the pull request ran them. The failure
surfaced later in the release pipeline, at a point where the cause was several
merges away.

ADR-0005 establishes Bun as the toolchain and governs `.github/workflows/**`,
but it treats Vitest only as a startup-time benchmark (`0005:127`). It does not
say what must pass before code merges.

## Decision

We will gate every pull request to `main` on type-check, lint, and the **full**
Vitest suite, run against a real migrated PostgreSQL database.

`quality-gates.yml` runs on `pull_request` and on `push` to `main` (`:9-14`).
Before the suite runs it generates the Prisma client and applies migrations —
`bun run db:generate` then `bun run db:migrate:deploy` (`:76-82`) — so tests
execute against a schema built the same way production's is.

Testing against a migrated database rather than mocks follows from ADR-0003: if
PostgreSQL through Prisma is the only sanctioned data path, then a test suite
that mocks Prisma verifies the mock rather than the query. Migrations are part
of what is under test.

A `[skip ci]` escape exists and is deliberately scoped to `push` events
(`:45-49`), because `github.event.head_commit` does not exist on a
`pull_request` event and an expression referencing it there would skip the gate
rather than fail loudly. Pull requests cannot opt out.

## Options considered

### Option A: Full suite on every PR, against a migrated database (chosen)

| Dimension | Assessment |
|---|---|
| Confidence | Highest: schema, queries, and migrations all exercised |
| Feedback latency | Slower — provisioning and migrating on every run |
| Failure modes | Includes infrastructure flakes unrelated to the change |
| Opt-out | None on pull requests, by construction |

### Option B: Mock Prisma, no database in CI

**Pros:** fast, hermetic, no service container.

**Cons:** implicitly rejected by provisioning a database. Under ADR-0003 the
Prisma query *is* the logic under test; mocking it asserts that the test author
and the implementer imagined the same query. Migration defects become invisible.

### Option C: Type-check and lint on PRs, tests only on `main`

**Pros:** fast PR feedback; some gate is better than none.

**Cons:** this is close to the state that failed. It moves test failures to
after merge, where bisecting is harder and `main` is already broken.

### Option D: Pre-commit hooks instead of CI

**Pros:** fastest possible feedback, before a push exists.

**Cons:** hooks are local, bypassable with `--no-verify`, and absent for any
contributor who has not installed them. Not evaluated in the repository.

## Trade-offs

- **Every pull request depends on database provisioning and migration health.**
  A migration that fails to apply blocks all review, including changes that
  touch nothing related. CI failures now have two populations — real defects and
  infrastructure — and telling them apart costs attention.
- **Feedback is slower**, paid on every push to every branch.
- **"The full suite" is a commitment that gets more expensive over time**, with
  no carve-out for slow tests. The pressure to add one will grow.
- **The gate is only as meaningful as the suite is green.** As of this record,
  six tests fail on `main` in two files (`game-proposals.test.ts`,
  `gear-context.test.ts`). A red baseline trains reviewers to read failures as
  noise, which is the precise failure mode this gate exists to prevent.

## Consequences

- **Easier:** trusting `main`; catching schema and migration defects before
  merge; onboarding, since one workflow defines what "passing" means.
- **Harder:** merging when infrastructure is degraded; keeping the suite fast
  enough that the gate is not resented.
- **How we would know this was wrong:** the suite being excluded from the gate
  to regain speed; or a persistently red `main` making the gate advisory in
  practice.
- **Revisit if:** the suite grows slow enough to need splitting into a fast gate
  and a nightly full run; or if database provisioning becomes a frequent enough
  flake to dominate failures.

## Relationship to ADR-0005

This record **narrows** ADR-0005 rather than replacing it. ADR-0005 remains
authoritative for the toolchain — Bun, the lockfile, the version pins, the
supply-chain posture. This record states only what must pass before a change
merges, which ADR-0005 does not cover. **No supersession is intended**, and
ADR-0005's status is unchanged.

A reviewer may reasonably prefer this as an amendment to ADR-0005 instead of a
standalone record; that is an open question, noted below.

## Provenance and gaps

Drafted by an agent from a backfill audit; ratification is a separate human act.

Evidence: `.github/workflows/quality-gates.yml:9-14,45-49,76-91`, commit
`21b8d62` ("ci: run type-check, lint, and tests on pull requests", #317),
`docs/adr/0005-standardize-on-bun-as-the-development-and-ci-toolchain.md:127`.

Known gaps:

- No pull request body or commit message explains why the suite previously ran
  in no workflow. The gap was found and closed; its cause is unrecorded.
- Whether this belongs as a standalone record or an amendment to ADR-0005 is a
  human call this draft does not make.
- This is the weakest of the records drafted in this batch. It documents a CI
  policy rather than an architectural constraint, and it is offered for review
  on that basis.

## Action items

1. [ ] Decide: standalone record, or fold into ADR-0005.
2. [ ] Restore a green baseline on `main` so the gate stays meaningful.
