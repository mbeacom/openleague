---
description: Draft one new ADR from the current plan artifact. Writes a single new
  record.
scripts:
  sh: .specify/extensions/adrkit/scripts/draft.sh
---


<!-- Extension: adrkit -->
<!-- Config: .specify/extensions/adrkit/ -->
# adrkit — draft a decision from this plan

Turns a decision the plan already made into a record that outlives it. Plans get
superseded and forgotten; the decisions inside them are what the next feature
needs and never gets.

## User Input

$ARGUMENTS

## Steps

1. Read the current plan. Identify the decision worth recording — a choice
   between real alternatives with consequences that outlast this feature. If the
   plan made no such choice, say so and stop. Not every plan contains an ADR,
   and manufacturing one is worse than not writing it.
2. Run `.specify/extensions/adrkit/scripts/draft.sh` with the decision's title as arguments. Write the title as the
   decision itself, in the imperative — "Adopt Postgres for the read model", not
   "Database choice".
3. The script prints `{ "id", "path" }`. It has scaffolded a schema-valid draft
   at the next free id; it has **not** written the reasoning.
4. Open that file and fill it in from the plan:
   - **Context** — the forces that made this a decision. Pull them from the
     plan; do not invent constraints the plan never stated.
   - **Decision** — what was chosen, in the plan's own terms.
   - **Options considered** — the alternatives the plan actually weighed, with
     why each lost. If the plan weighed none, record that honestly rather than
     inventing a strawman to reject.
   - **Consequences** — what gets easier, what gets harder, and what would make
     this worth revisiting.
   - Frontmatter — `affects` patterns for the paths this governs, `relatesTo`
     for records it touches, and a `review.tier` matching the blast radius.
5. Leave the status as `draft`. Ratification is a human act, and this command
   does not perform it.
6. Run `/speckit.adrkit.check` afterwards to confirm the new record is valid and
   does not conflict with an existing decision.

## Notes

- This is the only command in the extension that writes, and it is deliberately
  not reachable from any hook. A plan-phase hook that created records
  unprompted would manufacture decision memory instead of recording it.
- It writes exactly one new file and never edits an existing record. If the
  target path is already taken it refuses rather than overwriting (exit 1).
- A plan must exist. Drafting "from the plan artifact" without a plan is not a
  degraded mode, it is a different and worse thing.