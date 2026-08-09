---
schemaVersion: 0.1.0
id: "NNNN"
title: Imperative phrase naming the decision, not the problem
status: draft
date: YYYY-MM-DD
deciders: []
tags: []
scope: component
reversibility: unknown
blastRadius: component
relatesTo: []
affects: []
provenance:
  authoredBy: human
---

<!--
  Copy to docs/adr/NNNN-kebab-title.md, or run `adr new "<title>"`.

  Fill in `affects` — it is what makes this decision locatable by CI and
  agents. An ADR with no affects is advisory only.

  Set `reversibility` honestly. Under-declaring a one-way door is the failure
  mode that makes the fast-approval path dangerous.
-->

# ADR-NNNN: <title>

## Context

What forces are at play? What makes this a decision rather than a preference?
Why now — what changed?

State the problem, not the solution. If this section is a restatement of the
option you already picked, the record scores 2 at best on D1.

## Decision

What we are doing, in the active voice. "We will…"

## Options considered

At least two genuine alternatives, including doing nothing. An option no
competent engineer would choose is a straw man and scores zero.

### Option A: <chosen>

| Dimension | Assessment |
|---|---|
| | |

### Option B: <alternative>

**Pros:**
**Cons:**

### Option C: Do nothing

## Trade-offs

What the chosen option costs. State the downsides as plainly as the benefits —
a decision whose chosen option has no listed downsides is not a decision.

## Consequences

- Easier:
- Harder:
- **How we would know this was wrong:** a metric, a threshold, an exit
  condition, or a review date. This is the field that most separates records
  that stay alive from records that rot.
- Revisit if:

## Action items

1. [ ]
