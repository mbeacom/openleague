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
bun run adr:review-dates                # which decisions are past, or near,
                                        # their reviewBy date?
bun run adr:queue                       # which decisions await review?
bun run adr:check-reports               # validate the generated badge reports
bun run adr:explain lib/actions/team.ts # what governs this file?
bun run adr:check <changed files...>    # what governs a change set?
bun run adr:new "Use X for Y"           # scaffold the next record
bun run adr:graph -- --format dot       # supersession/relationship graph
```

Agents can query the same corpus through the read-only `adrkit` MCP server,
registered in `.mcp.json` and `.vscode/mcp.json`. It surfaces `rejected` and
`superseded` records by default, which is the point — the decision *not* to do
something is the one most often re-litigated.

Reaching for the CLI directly rather than a script? It is **`adrkit`**. The
package installs a second bin, `adr`, pointing at the same program, but `adr` on
npm is an [unrelated package](https://www.npmjs.com/package/adr) that adrkit does
not control and cannot acquire — so in a tree carrying both, `node_modules/.bin/adr`
is whichever installed last. `@adrkit/cli` 0.8.0 added the `adrkit` bin precisely
so nothing here has to depend on that. The `adr:*` script names above are this
repository's own namespace and are not affected.

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
  it will never appear in `adrkit explain` or the CI comment. Path matchers are the
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
the open items are tracked obligations. `reviewBy` **is** surfaced: a monthly
workflow opens a single tracking issue when a date has passed, or is within 30
days of passing, and closes it again once the dates are moved forward. See
[CI](#ci) below.

## CI

`.github/workflows/adr.yml` runs on every pull request:

- **lint** — `adrkit lint` over the whole corpus; fails the build on schema errors,
  duplicate ids, or dangling references.
- **raw-sql** — enforces the ADR-0003 raw-SQL prohibition with
  `bun run check:raw-sql`. It is a job here rather than a lone ESLint rule
  because the equivalent ESLint rules run only on push, so a violation would
  otherwise merge green and break the release pipeline afterwards. See #310.
- **governing-decisions** — comments the decisions governing the PR's changed
  files. It approves nothing and changes no repository content — its only write
  is the comment itself — but it is **not** unconditionally non-blocking: it
  fails the job when a record **changed in that pull request** is itself
  invalid. The decisions it merely reports on never block.

  **On a pull request from a fork, the comment is not posted.** GitHub restricts
  `GITHUB_TOKEN` to read-only for `pull_request` events raised from a fork,
  whatever the workflow's `permissions:` block asks for. The action catches the
  resulting `403`, writes the comment body to a `notice` annotation on the run
  instead, and returns without failing — the job still passes, and the content
  is relocated rather than lost. That is accepted behaviour, not a defect, and
  in particular not one to "fix" by switching to `pull_request_target`, which
  would pair a write token with a checkout of untrusted fork code.

  `lint` and `raw-sql` need only `contents: read`, so a fork PR is still gated
  on corpus validity and the raw-SQL prohibition exactly as a branch PR is.

  **Contributing from a fork?** You will not receive the comment. Ask for the
  same answer locally before you push:

  ```bash
  bun run adr:check <changed files...>   # decisions governing your change
  bun run adr:explain <path>             # decisions governing one file
  ```

  This is read from the pinned action's source and from adrkit's own
  documentation, which states the Action "degrades (never fails the job) on a
  read-only fork token". It has **not** been observed here — this repository has
  had no fork PR since the workflow landed. Tracked as ADR-0001 action item 8.

`.github/workflows/adr-review.yml` runs monthly, and on demand via
`workflow_dispatch`:

- **review-dates** — reads `reviewBy` from every `accepted` and `proposed`
  record and opens **one** tracking issue, labelled `adr-review`, listing the
  decisions that are past their date or within 30 days of it. Re-running updates
  that issue rather than opening another; once the dates move forward it comments
  and closes itself.

  This closes a real gap: `adrkit queue` only projects `proposed` records, so an
  `accepted` one never appears there, and `adrkit lint` does not read `reviewBy` at
  all. It is deliberately **not** a pull-request check — a decision falling due
  is a notification, not a defect, and must never block unrelated work. The
  script exits 0 even when records are expired.

  Run it locally with `bun run adr:review-dates`. Without `GITHUB_TOKEN` it
  prints the report and a preview of the issue body instead of writing anything.
  Use `--as-of YYYY-MM-DD` to check a future date without editing any record.

The corpus is excluded from the docs-site path filters, because only top-level
`docs/*.md` files are published — an ADR change cannot alter the built site.

## Badges

The two ADR badges in the root [`README.md`](../../README.md) report *numbers a
reader can verify by opening this directory* — corpus size and ARB queue depth.
Neither is a grade, and neither claims the corpus is healthy.

adrkit ships no badge service and no `adrkit badge` command. Both badges are a
recipe over JSON it already emits, served from this repository and rendered by
shields.io. `.github/workflows/adr-badges.yml` runs on a push to `main` that
touches `docs/adr/**` and regenerates two files:

| File | Command | Badge reads |
|------|---------|-------------|
| `.adrkit/lint.json` | `adrkit lint --json` | `$.checked` — every record on file, whatever its status |
| `.adrkit/queue.json` | `adrkit queue --format json` | `$.totalItems` — records with status `proposed` |

Three things about that workflow are deliberate:

- **It runs the pinned local binary**, not `npx @adrkit/cli@x.y.z` as adrkit's
  own recipe suggests. A registry fetch inside a job holding `contents: write`
  gets neither `bun.lock`'s integrity hash nor the `minimumReleaseAge`
  quarantine (ADR-0005), and it would add a sixth version pin site that nothing
  would notice going stale.
- **It validates before publishing.** A truncated write does not break a badge —
  shields.io renders `no result`, which reads as broken tooling and would go
  unnoticed indefinitely. `bun run adr:check-reports` fails the run instead.
- **It commits with `[skip ci]`**, matching `release.yml`'s own convention.
  `.adrkit/**` is not covered by `release.yml`'s `paths-ignore`, so without the
  marker a two-file JSON refresh would start a release.

A badge cannot detect its own staleness: if this workflow is disabled or starts
failing its push, the committed JSON keeps its last value and the badges keep
rendering it. The signal that covers regeneration is the workflow's own run
history, not the badges.
