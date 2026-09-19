---
schemaVersion: 0.1.0
id: "0018"
title: "Model game proposals as append-only entry rows rather than a mutable proposal"
status: proposed
date: 2026-09-19
created: 2026-09-19
deciders: ["@mbeacom"]
tags: [architecture, scheduling, negotiation, auditability]
scope: component
reversibility: one-way-door
blastRadius: component
relatesTo: ["0003", "0006", "0007"]
affects:
  - type: path
    pattern: "lib/actions/game-proposals.ts"
    note: Appends entries and resolves current terms from the latest one.
  - type: path
    pattern: "prisma/schema.prisma"
    note: GameProposal and its append-only GameProposalEntry rows.
provenance:
  authoredBy: agent-drafted
  sourceArtifact: specs/005-season-scheduling/research.md
review:
  tier: async
  tierReason: >-
    The shape is a one-way door once proposal history exists in production, and
    it defines what can be reconstructed about a disputed booking.
reviewBy: 2027-03-19
---

# ADR-0018: Model game proposals as append-only entry rows rather than a mutable proposal

## Context

Scheduling a game between two teams is a negotiation, not a form submission. One
admin proposes a date, venue, and time; the other counters; the first counters
back; eventually someone accepts, declines, or withdraws, or the proposal
expires.

Each step carries its own terms. "Accepted" is only meaningful relative to
*which* offer was accepted, and a counter-offer is a new set of terms, not an
edit of the old one. The data model has to answer "what was agreed, and by
whom" after the fact — a question that arises precisely when two parties
disagree about a booking.

## Decision

We will model a proposal as a parent row plus **append-only entry rows**.

`GameProposal` (`prisma/schema.prisma:2748`) holds the status, the parties, and
the resulting game. `GameProposalEntry` (`:2781`) rows record each act —
`PROPOSE`, `COUNTER`, `ACCEPT`, `DECLINE`, `WITHDRAW` — and each entry carries
the terms it was made under (`specs/005-season-scheduling/research.md:39-41`).

Entries are appended, never updated or deleted. The proposal's current terms are
derived from the most recent entry rather than stored on the parent.

This mirrors the append-only ledger ADR-0006 established for gear, applied to a
different domain: state is a projection over an immutable sequence of events.

## Options considered

### Option A: Parent row plus append-only entries (chosen)

| Dimension | Assessment |
|---|---|
| History | Complete by construction; nothing to remember to log |
| Expiry semantics | Natural — expiry is relative to the last entry's timestamp |
| Dispute resolution | Answerable: every offer and its author survive |
| Read cost | Every read resolves the thread; terms are never a single field |

### Option B: A single mutable proposal row with a counter count

**Pros:** trivial reads — current terms are columns on one row; no join.

**Cons:** rejected in `research.md:43` because it "loses history, complicates
expiry semantics". Each counter overwrites the previous terms, so a dispute
about what was offered is unanswerable. Expiry becomes ambiguous: it is unclear
whether the clock runs from the original proposal or the latest edit, and the
row no longer holds the information needed to decide.

### Option C: A mutable row plus a separate audit log

**Pros:** fast reads and a history.

**Cons:** two sources of truth that can disagree, and the history is only as
good as the discipline of writing to it. The failure mode — a code path that
updates the row and forgets the log — is silent and is discovered during exactly
the dispute the log exists to settle.

### Option D: Do nothing — schedule games directly, no negotiation

**Pros:** no model at all.

**Cons:** the negotiation happens regardless, in email and text messages, and
the resulting game has no provenance.

## Trade-offs

- **Every read resolves a thread.** There is no single column holding "the
  current date"; callers must fetch the latest entry or the parent must cache a
  projection that can go stale. This is the direct cost of the chosen shape.
- **Storage grows with negotiation, not with outcomes.** A proposal countered
  ten times costs eleven rows and yields one game.
- **Append-only is a convention unless the database enforces it.** Nothing in
  Prisma prevents an `update` on an entry; correctness depends on no code path
  doing so, and the guarantee is therefore only as strong as review.
- **It is a one-way door once real history exists.** Collapsing to a mutable row
  later means discarding the recorded negotiations, which is not a migration but
  a deletion.

## Consequences

- **Easier:** answering what was offered, by whom, and when; expiring proposals
  against a well-defined timestamp; showing a readable negotiation thread.
- **Harder:** reading current terms, which is always a derivation; enforcing
  immutability, which no constraint guarantees.
- **How we would know this was wrong:** an entry row being updated in place
  anywhere in the codebase; or the parent accumulating denormalized term
  columns, which would mean the projection has been abandoned and the two
  representations can now disagree.
- **Revisit if:** proposals need more than two parties, which the parent's party
  columns may not express; or if read performance forces a materialized
  projection, in which case the invariant should be re-recorded rather than
  quietly dropped.

## Provenance and gaps

Drafted by an agent from a backfill audit; ratification is a separate human act.

Evidence: `specs/005-season-scheduling/research.md:37-43`,
`prisma/schema.prisma:2748` (`GameProposal`), `prisma/schema.prisma:2781`
(`GameProposalEntry`).

Known gaps:

- **Whether entry immutability is enforced at the database level or only by
  convention is unverified.** The audit confirmed the models exist and the
  research note describes them as append-only; it did not confirm a constraint,
  trigger, or permission preventing an update.
- `lib/actions/game-proposals.ts` was not read during the audit, so the claim
  that current terms are derived rather than stored rests on the research note.

## Action items

1. [ ] Confirm whether entry immutability is enforced or conventional.
2. [ ] Verify current terms are derived from the latest entry, not cached on the parent.
