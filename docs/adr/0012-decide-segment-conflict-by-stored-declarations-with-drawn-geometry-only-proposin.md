---
schemaVersion: 0.1.0
id: "0012"
title: "Decide segment conflict by stored declarations, with drawn geometry only proposing them"
status: proposed
date: 2026-09-19
created: 2026-09-19
deciders: ["@mbeacom"]
tags: [architecture, scheduling, venues, segmentation, correctness]
scope: org
reversibility: two-way-door
blastRadius: org
relatesTo: ["0003", "0007"]
affects:
  - type: path
    pattern: "lib/utils/availability.ts"
    note: The conflict engine; reads declarations, never geometry.
  - type: path
    pattern: "lib/utils/segment-presets.ts"
    note: Surface-type presets that seed the suggested zones.
  - type: path
    pattern: "lib/actions/venue-surfaces.ts"
    note: Where staff confirm or override the suggested coexistence pairs.
  - type: path
    pattern: "prisma/schema.prisma"
    note: SegmentCoexistence rows, and segmentId null as the whole-surface sentinel.
provenance:
  authoredBy: agent-drafted
  sourceArtifact: specs/006-surface-segmentation/research.md
review:
  tier: async
  tierReason: >-
    The rule decides whether two bookings may share a surface. A permissive
    default double-books ice; a restrictive one silently blocks legitimate
    concurrent use.
reviewBy: 2027-03-19
---

# ADR-0012: Decide segment conflict by stored declarations, with drawn geometry only proposing them

## Context

ADR-0007 established `venue / surface / segment / interval` as the occupancy
coordinate. It did not say how a *segment* conflict is computed, and that turns
out to be the hard part.

Ice is routinely sold in pieces. Two half-ice bookings can share one sheet;
three cross-ice bookings can share it; but "the east half" and "the east third"
cannot, while "the east third" and "the west third" can. Whether two bookings
collide is not a property of their time intervals — they overlap in time by
construction — but of which physical zones they occupy and whether the operator
considers those zones simultaneously usable.

Ordinary interval overlap cannot express this. Neither can a single
"capacity" number, because the question is not *how much* of the surface is
consumed but *which parts*, and which combinations the rink is willing to run.

## Decision

We will compute segment conflict from **stored, explicit, symmetric coexistence
declarations**. Drawn geometry only ever *proposes* them.

The rule, from `specs/006-surface-segmentation/research.md:9-11`, is
"geometry proposes, declarations decide":

1. Staff draw zones on a surface schematic using normalized coordinates.
2. The drawing generates *suggested* coexistence pairs — non-overlapping zones
   suggest "these coexist", overlapping zones suggest "these conflict".
3. Staff confirm or override every suggestion.
4. The stored pair rows are **the only input to conflict math**. Geometry is
   never read at booking time.

Storage is presence-only with canonical ordering — `SegmentCoexistence` rows
with `segmentAId < segmentBId` and a `@@unique` constraint
(`prisma/schema.prisma:2106`). A row existing means the pair coexists; a row
absent means the pair conflicts.

Whole-surface occupancy is `segmentId: null` rather than a `WHOLE` segment row.
The schema states this in place (`prisma/schema.prisma:2070`): "segmentId: null
— there is no WHOLE segment row." A renameable display name lives on
`IceSurface.wholeLabel` (`:2037`) so a venue can call it "Full ice" or
"Full sheet" without introducing a row.

## Options considered

### Option A: Hybrid — geometry proposes, declarations decide (chosen)

| Dimension | Assessment |
|---|---|
| Correctness | Conflict math is a set membership test; trivially testable |
| Authoring UX | Drawing is natural; staff are not typing pair matrices |
| Failure direction | Fails **closed** — a missing declaration means conflict |
| Decoupling | The editor can be rewritten without touching booking logic |
| Cost | Two sources of truth that can drift if a zone is redrawn |

### Option B: Declarations only, no drawing

**Pros:** one source of truth; no geometry to keep in sync.

**Cons:** rejected for UX in `research.md:13`. An operator with six zones faces
fifteen pair decisions with no spatial context. It is the same information
presented in the form least like the thing being described.

### Option C: Geometry as law — compute conflict from overlap at booking time

**Pros:** genuinely one source of truth; no confirmation step.

**Cons:** rejected for "correctness/testability" (`research.md:13`). Real rinks
run configurations that pure overlap gets wrong in both directions: adjacent
non-overlapping zones that cannot actually run together for safety reasons, and
nominally overlapping drawn boxes that a rink does run concurrently. It also
makes booking correctness depend on floating-point geometry.

### Option D: Capacity-fraction model — surface is 1.0, each booking consumes a fraction

**Pros:** simple arithmetic; a familiar pattern from seat inventory.

**Cons:** rejected explicitly (`research.md:13`) because it "cannot express
'these two thirds coexist but not those two'". Fractions carry magnitude but not
identity, and identity is the whole question.

### Option E: Do nothing — whole-surface bookings only

**Pros:** no new model at all; ADR-0007 already works.

**Cons:** gives up half-ice and cross-ice scheduling, which is a substantial
share of how rinks actually sell time.

## Trade-offs

- **Two representations of the same zones can drift.** Geometry is advisory, so
  nothing forces a redrawn zone to have its declarations revisited. A zone can
  be moved on the schematic while the stale pair rows keep deciding bookings.
- **Absence is meaningful, which makes the model unforgiving of partial data.**
  A half-configured surface conflicts with everything. That is the safe
  direction, but it presents to staff as "the system is broken", not as "you
  have not finished configuring".
- **`segmentId: null` is a sentinel every occupancy query must honour.** A query
  that treats null as "no segment filter" rather than "the whole surface" will
  silently allow a whole-ice booking to sit on top of a half-ice one. The
  saving is real — no backfill, no WHOLE-row protection logic — but it is paid
  for with a rule that cannot be enforced by the type system.
- **Staff bear a confirmation step** that a pure-geometry model would not ask
  for, on every surface, at configuration time.

## Consequences

- **Easier:** testing conflict logic, which reduces to set membership; changing
  the segmentation editor, since booking correctness does not depend on it;
  expressing genuinely irregular real-world rink configurations.
- **Harder:** keeping declarations current when zones are redrawn; explaining to
  an operator why a newly drawn zone conflicts with everything until confirmed.
- **How we would know this was wrong:** a double-booked surface traced to a
  coexistence row that no longer matches the drawn zones, or operators routinely
  confirming every suggestion without review — which would mean the confirmation
  step is ceremony and geometry is the de facto law after all.
- **Revisit if:** segments become dynamic per booking rather than configured per
  surface; or if a surface type needs more than pairwise coexistence, for
  example a rule that any two of three zones may run but not all three, which
  pairwise rows cannot express.

## Provenance and gaps

Drafted by an agent from a backfill audit; ratification is a separate human act.

Evidence: `specs/006-surface-segmentation/research.md:7-29`,
`prisma/schema.prisma:2037,2070,2106`,
`lib/utils/availability.ts:78`,
`docs/adr/0007-use-canonical-venue-reservations-for-occupancy.md:55`.

Known gap: no record states who is authorized to confirm or override a suggested
coexistence pair, or whether that override is written to the audit log. Given
that the stored rows are the sole input to conflict math, this is the highest
open question attached to this record.

## Action items

1. [ ] Record who may confirm or override coexistence pairs, and whether it is audited.
2. [ ] Decide whether redrawing a zone should invalidate its existing declarations.
