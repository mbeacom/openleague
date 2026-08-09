# Architecture Decision Records

This directory is OpenLeague's decision corpus, managed by
[adrkit](https://github.com/mbeacom/adrkit). Each record is one markdown file
with typed YAML frontmatter and a prose body. Git is the system of record.

`CLAUDE.md` and `.github/copilot-instructions.md` describe **how to work here**.
These records hold **why the conventions are what they are**, which alternatives
were rejected, and what would make each decision wrong. Where the two disagree,
the ADR is the authority.

`specs/` is a third surface and a different kind of thing: each folder records
what was built for one feature. ADRs record constraints that apply across
features. Where a spec and an ADR conflict, the ADR governs — a spec describes
one feature's plan, not a licence to depart from a standing decision.

Two ADR-numbering namespaces exist in this repository, and they are unrelated.
Records under `docs/adr/` are OpenLeague's. The vendored Spec Kit extension
under `.specify/extensions/adrkit/` is upstream adrkit's own code and
documentation, and the `ADR-00NN` references inside it point at
[adrkit's corpus](https://github.com/mbeacom/adrkit/tree/main/docs/adr), not
this one. Do not edit those files to "fix" a reference: they are vendored
verbatim and `.specify/extensions/.registry` records a `manifest_hash` over
them.

## Records

| ID | Status | Decision |
|----|--------|----------|
| [0001](./0001-record-architecture-decisions-as-versioned-markdown-in-git.md) | accepted | Record architecture decisions as versioned markdown in git |
| [0002](./0002-use-next-js-server-actions-as-the-primary-mutation-surface.md) | accepted | Use Next.js Server Actions as the primary mutation surface |
| [0003](./0003-access-postgresql-exclusively-through-prisma-on-neon-serverless.md) | accepted | Access PostgreSQL exclusively through Prisma on Neon serverless |
| [0004](./0004-build-the-interface-on-mui-as-the-primary-component-library.md) | accepted | Build the interface on MUI as the primary component library |
| [0005](./0005-standardize-on-bun-as-the-development-and-ci-toolchain.md) | accepted | Standardize on Bun as the development and CI toolchain |

Records 0002–0005 are **backfilled** — written in 2026-08 from `CLAUDE.md` and
the code as it stood, not from contemporaneous notes. Their `date` is the
decision date; `created` is when the record was written. Their "options
considered" sections are honest reconstructions rather than transcripts.

## Working with the corpus

```bash
bun run adr:lint                        # validate every record
bun run adr:check-integrity             # corpus is non-empty, filenames are
                                        # discoverable, version pins agree
bun run adr:explain lib/actions/team.ts # what governs this file?
bun run adr:check <changed files...>    # what governs a change set?
bun run adr:new "Use X for Y"           # scaffold the next record
bun run adr:graph -- --format dot       # supersession/relationship graph
```

Agents can query the same corpus through the read-only `adrkit` MCP server,
registered in `.mcp.json` and `.vscode/mcp.json`. It surfaces `rejected` and
`superseded` records by default, which is the point — the decision *not* to do
something is the one most often re-litigated.

The **Copilot cloud agent** and **Copilot code review** read a separate,
repository-level MCP setting that cannot be committed as a file. The value to
paste, and why it differs from the local one, is in
[`.github/copilot-cloud-agent-mcp.md`](../../.github/copilot-cloud-agent-mcp.md).

## When to write a record

Write one when a change **alters an existing decision here**, or introduces a
new architectural constraint that future work should respect. Routine feature
work does not need a record.

Start from `0000-template.md` or run `bun run adr:new`. Then:

- **Fill in `affects`.** A record with no `affects` matchers is advisory only —
  it will never appear in `adr explain` or the CI comment. Path matchers are the
  ones that resolve in this repository; `package` matchers are inert without a
  dependency snapshot and are deliberately not used.
- **Set `reversibility` honestly.** Under-declaring a one-way door is the
  failure mode that makes the fast path dangerous. adrkit refuses
  `review.tier: auto` on a `one-way-door` record.
- **State genuine alternatives**, including doing nothing. A straw man is worth
  nothing to the reader.
- **Say how you would know it was wrong.** A record with no exit condition rots.

Superseding a decision is a new record with `supersedes: ["NNNN"]`, plus
`status: superseded` and `supersededBy` on the old one. Do not delete records —
the graveyard is the valuable part.

An `accepted` record may still carry unchecked action items. `accepted` means
the decision is binding, not that every consequence of it has been implemented;
the open items are tracked obligations. `reviewBy` is advisory — nothing
surfaces it when it expires, so treat it as a note to the next reader rather
than a scheduled gate.

## CI

`.github/workflows/adr.yml` runs on every pull request:

- **lint** — `adr lint` over the whole corpus; fails the build on schema errors,
  duplicate ids, or dangling references.
- **governing-decisions** — comments the decisions governing the PR's changed
  files. Read-only and comment-only; it never approves or blocks anything.

The corpus is excluded from the docs-site path filters, because only top-level
`docs/*.md` files are published — an ADR change cannot alter the built site.
