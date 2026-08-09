---
schemaVersion: 0.1.0
id: "0001"
title: Record architecture decisions as versioned markdown in git
status: accepted
date: 2026-08-09
created: 2026-08-09
deciders: ["@mbeacom"]
tags: [meta, process, governance]
scope: org
reversibility: two-way-door
blastRadius: org
affects:
  - type: path
    pattern: "docs/adr/**"
  - type: path
    pattern: ".github/workflows/adr.yml"
provenance:
  authoredBy: agent-drafted
  ratifiedBy: "@mbeacom"
review:
  tier: auto
  tierReason: Process bootstrap; sole maintainer is the sole decider.
reviewBy: 2027-08-09
---

# ADR-0001: Record architecture decisions as versioned markdown in git

## Context

OpenLeague's architectural decisions currently live in prose: `CLAUDE.md`,
`.github/copilot-instructions.md`, `README.md`, `SETUP.md`, and six feature
folders under `specs/`. That prose states *what* the conventions are — Server
Actions over API routes, Prisma over raw SQL, MUI-first styling — but not *why*
they were chosen, what alternatives were weighed, or what would make them wrong.

Three forces make this a decision rather than a preference:

- **Most planning here is agent-assisted.** The repository ships Spec Kit
  (`.specify/`, version 0.13.0) and an MCP configuration (`.mcp.json`). Each
  new feature currently starts from an empty context and re-derives settled
  questions from instruction files that describe conventions without their
  rationale. An agent cannot tell a load-bearing constraint from an incidental
  habit when both are rendered as a bullet in the same list.
- **Rejected options leave no trace.** When an approach is tried and abandoned,
  nothing in the repository records that it was tried. The knowledge lives in
  pull request threads that nobody greps, so the same option gets re-proposed.
- **Instruction files drift silently.** `CLAUDE.md` asserts conventions with no
  mechanism that fails when the code stops honoring them. Nothing maps a diff
  back to the decisions that constrain it.

## Decision

We will record architecture decisions as one markdown file per decision under
`docs/adr/NNNN-kebab-title.md`, with typed YAML frontmatter and a prose body,
managed by [adrkit](https://github.com/mbeacom/adrkit) (`@adrkit/cli`, pinned to
0.4.0). Git is the system of record; every lifecycle transition happens through
a pull request.

Each record carries `affects` matchers so `adr explain <path>` and the CI Action
can answer "which decisions govern this change?" against real repository paths.

`CLAUDE.md` and `.github/copilot-instructions.md` remain the operational
"how to work here" surface. They are not replaced. ADRs hold the *why*, the
alternatives, and the exit conditions; the instruction files point at them.

## Options considered

### Option A: adrkit ADRs in `docs/adr/` (chosen)

| Dimension | Assessment |
|---|---|
| Adoption cost | Low — one devDependency, no service, no account |
| Agent legibility | High — markdown in the repo, plus a read-only MCP server |
| Path→decision mapping | Native, via `affects` matchers and `adr explain` |
| CI enforcement | `adr lint` and a comment-only GitHub Action |
| Rejected-option retention | First-class; `rejected` and `superseded` are retained statuses |
| Schema rigidity | Frontmatter is strict; malformed records fail lint |

### Option B: Keep decisions in `CLAUDE.md` and `specs/`

**Pros:** zero new tooling; already how the repository works; one less thing to
keep current.
**Cons:** no supersession semantics, so a superseded convention and a current
one are indistinguishable; no path→decision mapping, so CI cannot surface the
constraints relevant to a diff; `specs/` records what was *built*, not what was
*decided against*; the files grow monotonically and are never pruned because
nothing marks an entry dead.

### Option C: Plain MADR templates with no tooling

**Pros:** the most portable format; no dependency at all.
**Cons:** frontmatter is untyped, so nothing catches a dangling `supersedes`
reference or a status typo; no `affects` field, so records stay documentation
rather than becoming queryable; adopting it now and adding tooling later is the
same work done twice, and adrkit's `adr migrate --from madr` exists precisely
because that later migration is the expected path.

### Option D: Do nothing

**Pros:** no cost.
**Cons:** accepts the status quo, in which the reason for every convention
lives only in the maintainer's memory and in unindexed PR threads. For a
single-maintainer, heavily agent-assisted project, that is the specific failure
mode most likely to bite.

## Trade-offs

We accept real costs:

- **A second place to write things.** Some maintenance burden is unavoidable;
  the mitigation is that ADRs are written once per genuine decision, not per
  feature.
- **Backfilled records are reconstructions.** ADRs 0002–0005 are written from
  `CLAUDE.md` and the code as it stands, not from contemporaneous notes. Their
  "options considered" sections are honest reconstructions, and they say so.
- **Governance ceremony a solo project does not need.** adrkit ships an ARB
  queue, SLA tiers, and quorum fields. We use `review.tier: auto` where adrkit
  permits it and do not adopt the ARB workflow; the `one-way-door` records
  (0003, 0004) carry `async` because the schema refuses `auto` on a one-way
  door. Either way nothing consumes the queue. The fields are unused, not
  zero-cost — they are visible in every record and invite cargo-culting.
- **A tool dependency on a young project.** `@adrkit/cli` is at 0.4.0 and moves
  quickly. We pin an exact version and pin CI to an immutable ref rather than
  tracking a moving tag.

## Consequences

- **Easier:** an agent or contributor can ask "what governs `lib/actions/`?" and
  get a cited answer; superseding a convention is an explicit, reviewable diff;
  rejected approaches stay findable.
- **Harder:** a genuinely new architectural decision now costs a written record
  before it can be called settled.
- **How we would know this was wrong:** if after twelve months the corpus has
  not grown past the bootstrap records while the codebase has taken on new
  architectural decisions, ADRs are being routed around rather than used, and
  the practice should be dropped rather than mandated harder. Equally, if
  `adr lint` becomes a step contributors disable rather than satisfy, the schema
  is costing more than the retrieval is worth.
- **Revisit if:** the project gains multiple regular contributors (the review
  tiers become load-bearing rather than decorative), or `@adrkit/cli` stops
  being maintained.

## Action items

1. [x] `docs/adr/` with `0000-template.md`
2. [x] `@adrkit/cli` pinned as a devDependency, with `adr:*` package scripts
3. [x] `adr lint` in CI on pull requests
4. [x] adrkit MCP server registered in `.mcp.json` and `.vscode/mcp.json`
5. [x] `CLAUDE.md` and `.github/copilot-instructions.md` point at the corpus
