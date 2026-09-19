---
schemaVersion: 0.1.0
id: "0014"
title: "Route every public read through an explicit column whitelist module"
status: proposed
date: 2026-09-19
created: 2026-09-19
deciders: ["@mbeacom"]
tags: [security, privacy, data-boundary, public-access]
scope: org
reversibility: two-way-door
blastRadius: org
relatesTo: ["0002", "0003", "0011"]
affects:
  - type: path
    pattern: "lib/utils/public-*.ts"
    note: The whitelist modules themselves; the only sanctioned public selects.
  - type: path
    pattern: "app/(marketing)/**"
    note: The public surfaces that must read through a whitelist.
  - type: path
    pattern: "app/gear-wishlist/**"
  - type: path
    pattern: "lib/actions/signup-events.ts"
    note: Consumes publicSignupEventSelect for the public read path.
provenance:
  authoredBy: agent-drafted
  sourceArtifact: specs/004-signup-events/research.md
review:
  tier: async
  tierReason: >-
    The boundary decides what an anonymous visitor can see. A leak here exposes
    participant PII, including minors, on an indexable public page.
reviewBy: 2027-03-19
---

# ADR-0014: Route every public read through an explicit column whitelist module

## Context

The application renders association pages, rink profiles, signup events, and
gear wishlists to visitors who are not signed in. Those pages read the same
Prisma models the authenticated app uses — and those models carry emergency
contacts, emergency phone numbers, participant email addresses, and the names of
minors.

Prisma's default behaviour is the hazard. `findMany` with no `select` returns
every scalar column. A public page that reuses an internal query is one relation
away from serialising a roster's emergency contacts into HTML, and nothing about
the code would look wrong. ADR-0002 already notes the sensitivity of these
columns as motivation for authenticating every Server Action
(`0002:46`), but a public page has no session to check.

The risk is asymmetric in a way that matters: an over-restrictive public page is
a visible bug someone reports, while an over-permissive one is invisible until
it is indexed.

## Decision

We will route every public read through a dedicated column-whitelist module, and
public pages will not construct their own selects.

The pattern is stated in `specs/004-signup-events/research.md:150-153`: public
reads go through a `publicSignupEventSelect` whitelist, described there as a
"clone of the `publicVenueProfileSelect` pattern in `lib/utils/public-venues.ts`",
"so participant PII can never leak into public pages".

The rules:

1. A public surface reads through a `lib/utils/public-*.ts` module. It does not
   inline a `select`, and it does not reuse an authenticated query.
2. The whitelist is an allowlist of columns, never a denylist. A column added to
   a Prisma model is excluded from public output by default, because nobody
   listed it.
3. Derived public values are computed server-side, not by trimming on the
   client. Public rosters render "first name + last initial only, computed
   server-side" — the surname never reaches the browser.

## Options considered

### Option A: Explicit per-surface whitelist modules (chosen)

| Dimension | Assessment |
|---|---|
| Default for a new column | Excluded — the safe direction |
| Reviewability | The entire public surface is a handful of readable files |
| Failure mode | Missing field: visible bug, reported quickly |
| Cost | Duplication between internal and public selects |

### Option B: Fetch the full record, strip fields before rendering

**Pros:** one query shape; no duplicate select definitions to maintain.

**Cons:** the PII is already in process memory and is one serialization boundary
away from the client. In an App Router codebase a Server Component's props cross
exactly such a boundary, so a stripped-too-late object leaks through the RSC
payload even when the rendered HTML looks clean. The default is also wrong: a
new sensitive column is included until someone remembers to strip it.

### Option C: One shared select with conditional field inclusion

**Pros:** a single definition per model; no drift between internal and public.

**Cons:** correctness then depends on a boolean argument being right at every
call site, and the dangerous value is the default-looking one. It concentrates
the definition but distributes the decision, which is the wrong way round for a
security boundary.

### Option D: Do nothing — review public queries case by case

**Pros:** no structure to maintain.

**Cons:** this is the status quo the pattern replaced. It relies on every future
author knowing which columns are sensitive.

## Trade-offs

- **Duplication is the price, and it is real.** Internal and public selects for
  the same model must be maintained separately, and they will drift. The drift
  is in the safe direction — public lags private — but it means public pages
  quietly miss fields until someone notices.
- **The pattern is a convention with no enforcement.** ADR-0003's raw-SQL
  prohibition is backed by `bun run check:raw-sql` in CI and an ESLint rule.
  This boundary has neither. A new public page that inlines a `select` passes
  every check.
- **"Public" is decided per surface, not per model**, so two public pages can
  legitimately expose different columns of the same model. That is flexible and
  it also means there is no single answer to "what is public about a Player".

## Consequences

- **Easier:** adding a sensitive column, which is excluded from public output by
  default; auditing the public data boundary, which is a short list of files.
- **Harder:** keeping public pages feature-complete as models evolve; adding a
  public surface, which now requires a whitelist module rather than a query.
- **How we would know this was wrong:** any PII column appearing in a public
  page's RSC payload or HTML; or a public route reading a model without going
  through a `lib/utils/public-*.ts` module, which would mean the convention has
  already eroded.
- **Revisit if:** the number of whitelist modules makes drift unmanageable, at
  which point the answer is likely enforcement (a lint rule) rather than
  consolidation; or if a public surface needs viewer-dependent columns, which
  this model does not express.

## Provenance and gaps

Drafted by an agent from a backfill audit; ratification is a separate human act.

Evidence: `specs/004-signup-events/research.md:144-153`,
`lib/utils/public-venues.ts`, `lib/utils/public-signup-events.ts`,
`docs/adr/0002-use-next-js-server-actions-as-the-primary-mutation-surface.md:46`.

Known gaps, recorded rather than filled in:

- **No CI or lint gate enforces this**, unlike the raw-SQL prohibition in
  ADR-0003. Whether that is an accepted cost or an unfinished task is unrecorded.
- The whitelist modules' contents were not read during the audit that produced
  this record; their existence and the pattern's description were. A reviewer
  should confirm the modules actually exclude what this record claims.

## Action items

1. [ ] Decide whether to enforce the pattern with a lint rule, as ADR-0003 does for raw SQL.
2. [ ] Audit each `lib/utils/public-*.ts` against its model's current sensitive columns.
