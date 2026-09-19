---
schemaVersion: 0.1.0
id: "0016"
title: "Keep the sport capability catalog as a typed module in code rather than database rows"
status: proposed
date: 2026-09-19
created: 2026-09-19
deciders: ["@mbeacom"]
tags: [architecture, configuration, sports, provisional]
scope: component
reversibility: two-way-door
blastRadius: component
relatesTo: ["0003"]
affects:
  - type: path
    pattern: "lib/utils/sport-catalog.ts"
    note: The catalog itself, keyed by the Prisma Sport enum.
  - type: path
    pattern: "lib/utils/segment-presets.ts"
    note: Took over surface-usage options when they left the catalog.
provenance:
  authoredBy: agent-drafted
  sourceArtifact: specs/005-season-scheduling/research.md
review:
  tier: async
  tierReason: >-
    The rejection of a database-backed catalog was explicitly provisional, so
    the record should be reviewed as a live question rather than a settled one.
reviewBy: 2027-03-19
---

# ADR-0016: Keep the sport capability catalog as a typed module in code rather than database rows

## Context

Sports differ in vocabulary and structure. Hockey has periods, soccer has
halves; age classifications differ by governing body; some sports subdivide a
playing surface and others do not. Scheduling needed a place to hold these
differences so the UI could label things correctly and offer the right options.

The natural instinct is a configuration table. The application already runs on
PostgreSQL through Prisma (ADR-0003), and "configuration belongs in the
database" is the default answer.

## Decision

We will keep the catalog as a typed TypeScript module,
`lib/utils/sport-catalog.ts`, keyed by the existing Prisma `Sport` enum
(`specs/005-season-scheduling/research.md:31`).

Entries define terminology labels, age-classification options, and suggested
formats. A sport with no entry falls back to a neutral default rather than
failing, and a field with no defined options is hidden rather than rendered
empty.

The catalog is keyed by the `Sport` enum specifically, which means the database
still owns *which sports exist*. Only their capability metadata lives in code.

**This rejection is provisional and says so.** The research note rejects a
database-driven catalog "for now", and names the exit condition: it "can be
lifted to DB later without changing call sites". Keeping call sites stable is a
constraint this record imposes, not an accident.

## Options considered

### Option A: Typed module in code (chosen)

| Dimension | Assessment |
|---|---|
| Type safety | Full — exhaustiveness checked against the Prisma enum |
| Change cost | A deploy |
| Operational cost | None: no admin surface, no seeding, no cache |
| Reviewability | A catalog change is a reviewable diff |
| Flexibility | An operator cannot adjust anything without an engineer |

### Option B: Database-driven catalog

**Pros:** editable without a deploy; per-installation customization; the
conventional home for configuration.

**Cons:** rejected in `research.md:35` for "admin surface, seeding, and caching
complexity with zero near-term benefit". Each is real: rows need a management
UI, every environment needs seeding, and a table read on every render needs a
cache with an invalidation story. The benefit — editing without a deploy —
serves a user who does not yet exist, since the only party who would edit it is
the maintainer.

### Option C: Per-league overrides

**Pros:** leagues genuinely do vary within a sport.

**Cons:** ruled out of scope in the same note. It also presumes Option B, since
overrides need somewhere to live.

### Option D: No catalog — hardcode labels at call sites

**Pros:** nothing to build.

**Cons:** the status quo this replaced, which conflated sport terminology with
scheduling logic and made adding a sport a search-and-replace exercise.

## Trade-offs

- **Adding or adjusting a sport requires a deploy.** For a project with one
  maintainer this is barely a cost; for a self-hosting association that wants
  its own terminology, it is a hard wall.
- **The catalog is a second place where sport knowledge lives**, alongside the
  Prisma `Sport` enum. They are keyed together, so they drift only by
  forgetting, but the coupling is by convention.
- **"Can be lifted to DB later without changing call sites" is a claim that
  decays** unless call sites are actually kept ignorant of the storage. Any
  consumer that imports the catalog object directly rather than calling an
  accessor erodes the exit path this decision depends on.
- **The provisional framing is itself a cost:** the record does not settle the
  question, so it will be re-litigated.

## Consequences

- **Easier:** type-safe exhaustive handling of sports; shipping a new sport's
  metadata in the same commit as the code that uses it; zero operational
  surface.
- **Harder:** per-installation or per-league customization; any change by a
  non-engineer.
- **How we would know this was wrong:** a request to customize sport terminology
  per league or per installation that cannot be deferred; or the catalog
  accumulating enough entries that changes become frequent deploys.
- **Revisit if:** self-hosting associations need their own terminology; if
  per-league overrides return to scope; or if call sites start depending on the
  catalog's literal shape, which would close the migration path before it is
  needed.

## Provenance and gaps

Drafted by an agent from a backfill audit; ratification is a separate human act.

Evidence: `specs/005-season-scheduling/research.md:29-35`,
`specs/006-surface-segmentation/research.md:51-55`.

Note that the catalog has **already been amended once**: feature 006 removed
`surfaceUsageOptions` from it and moved those consumers to segment pickers in
`lib/utils/segment-presets.ts`. The catalog is narrower than when it was
designed, which is mild evidence that code is the right home for something still
changing shape.

Known gaps:

- No threshold or trigger is recorded for lifting the catalog into the database.
  A provisional rejection with no exit condition is how a temporary choice
  becomes permanent by default.
- The module's contents were not read during the audit; its existence and the
  research rationale were.

## Action items

1. [ ] Record a concrete trigger for moving the catalog to the database.
2. [ ] Confirm call sites use accessors, so the migration path stays open.
