---
schemaVersion: 0.1.0
id: "0005"
title: Standardize on Bun as the development and CI toolchain
status: accepted
date: 2025-10-05
created: 2026-08-09
deciders: ["@mbeacom"]
tags: [toolchain, ci, supply-chain]
scope: org
reversibility: two-way-door
blastRadius: org
affects:
  - type: path
    pattern: "bunfig.toml"
  - type: path
    pattern: "bun.lock"
  - type: path
    pattern: "package.json"
  - type: path
    pattern: ".mcp.json"
  - type: path
    pattern: ".vscode/mcp.json"
  - type: path
    pattern: ".github/workflows/**"
  - type: path
    pattern: "vercel.json"
provenance:
  authoredBy: agent-drafted
  ratifiedBy: "@mbeacom"
  sourceArtifact: CLAUDE.md
review:
  tier: auto
  tierReason: Backfilled record of an existing convention; sole maintainer.
reviewBy: 2027-08-09
---

# ADR-0005: Standardize on Bun as the development and CI toolchain

## Context

A JavaScript project acquires a package manager whether or not anyone decides
on one, and the choice then shows up in the lockfile, every CI workflow, the
deployment configuration, and every instruction given to a contributor or a
coding agent. Mixing managers produces two lockfiles and a class of
"works locally, fails in CI" bug that costs more to diagnose than the choice
costs to make.

Two forces were specific to this project:

- **Iteration speed matters disproportionately for a solo maintainer.** Install
  and test-startup time is paid many times a day by one person, and there is
  nobody else to absorb the wait.
- **Dependency supply-chain risk is unattended.** With one maintainer, a
  compromised release published to npm can be installed before anyone has read
  about it. A cooling-off window on new versions is the cheapest available
  mitigation, and it needs package-manager support.

## Decision

We will standardize on Bun as the package manager and script runner across
development, CI, and deployment. `bun.lock` is the only lockfile; `bun install`
is the only install command; every `package.json` script is invoked with
`bun run`.

Two settings follow from the decision rather than merely accompanying it:

- `bunfig.toml` sets `minimumReleaseAge = 259200` — a three-day quarantine
  before a newly published version is installable, which blunts the window in
  which a compromised release is picked up automatically. It applies to
  `bun install`, and therefore to what is in `bun.lock` — **not** to anything
  fetched at runtime by some other mechanism.
- `vercel.json` pins `bunVersion: "1.x"` and installs with
  `--frozen-lockfile`, so deployment resolves exactly what was committed.

Seven GitHub Actions workflows use `oven-sh/setup-bun`, so CI, deployment, and
local development run the same toolchain.

Bun is the *toolchain*, not the *runtime contract*. The application is a Next.js
app deployed to Vercel's Node-compatible serverless runtime. `bun --bun next
dev` is used locally for speed, but nothing in the application code may depend
on Bun-only APIs.

### MCP servers are launched outside the quarantine, so they are pinned instead

The scope limit above turned out to matter. MCP servers are configured in
`.mcp.json` and `.vscode/mcp.json` and launched with `bunx -y` / `npx -y`, which
resolves and executes from the registry at *process start*. Nothing about that
path touches `bun install`, so those packages were in neither the lockfile nor
the quarantine — and two of the four floated on `@latest`, re-resolving on every
launch. Agents invoke these tools autonomously with repository access, so there
is no human in the loop at the moment a fetched version runs (#307).

The response is tiered by measured cost rather than applied uniformly:

- **`@adrkit/mcp` is a pinned devDependency**, launched as
  `node_modules/.bin/adrkit-mcp`. It adds three packages, because `@adrkit/core`
  is already present via `@adrkit/cli`. This is the full fix: lockfile integrity
  *and* the quarantine.
- **The other three keep `bunx`, at an exact version.** Vendoring them was
  measured and rejected: `@upstash/context7-mcp` adds 56 packages and
  `next-devtools-mcp` 63, each an Express subtree paid on every CI run, every
  Vercel build, and every contributor's install, for a tool only agents use in
  local sessions; `@playwright/mcp` adds only three, but one is a `playwright`
  **pre-release**, which does not belong in a production application's lockfile.
- An exact pin is weaker than vendoring but is the larger share of the benefit.
  It converts the attack from "publish a malicious version" — executed on the
  next launch — into "replace an already-published version", which npm forbids.
- `bun run check:mcp-pins` enforces this on pull requests. Like `check:raw-sql`
  for ADR-0003, the policy is a gate rather than a convention, because a
  floating tag starts a perfectly working server right up until the day it
  does not.

`minimumReleaseAgeExcludes` exempts the first-party `@adrkit/*` packages, whose
releases come from this repository's own maintainer. Every one of them is listed
individually: exclusions do not propagate to a package's dependencies and globs
are not supported, so an incomplete list makes the next adrkit release
uninstallable for three days.

## Options considered

### Option A: Bun for everything (chosen)

| Dimension | Assessment |
|---|---|
| Install speed | Fastest of the options |
| Test startup | Fast — matters for a Vitest suite run repeatedly |
| Supply-chain control | `minimumReleaseAge` quarantine, natively supported |
| Ecosystem maturity | Youngest; occasional native-module and tooling edge cases |
| Deployment support | First-class on Vercel via `bunVersion` |
| Contributor familiarity | Least familiar of the three |

### Option B: npm

**Pros:** ships with Node; maximum contributor familiarity; the broadest
compatibility guarantee; `package-lock.json` is universally understood.
**Cons:** the slowest install and script startup of the three, paid repeatedly
every day. Version-quarantine behaviour is not available in the same
first-class way.

### Option C: pnpm

**Pros:** fast; content-addressed store saves disk; strict `node_modules`
layout catches phantom dependencies; more mature than Bun.
**Cons:** the strict layout occasionally requires hoisting workarounds for
packages that assume a flat tree, and it does not bring the test-runner and
runtime speed benefits Bun contributes on top of installs.

### Option D: Mix — npm in CI, Bun locally

**Pros:** familiar CI, fast local development.
**Cons:** two lockfiles, or one lockfile the other manager ignores. Precisely
the divergence class this decision exists to eliminate.

## Trade-offs

- **The lockfile format was wrong at first, and it cost more than review
  ergonomics.** This record originally chose `bun.lockb`, Bun's binary
  lockfile, and named its cost as a loss of review signal: a dependency change
  was visible only through `package.json`, in the one place supply-chain
  attacks land. The larger cost went unanticipated — Dependabot cannot
  regenerate a binary lockfile, so every automated update produced a
  `package.json` change with a stale lockfile, and every workflow's
  `--frozen-lockfile` install failed. Dependency updates could not merge at
  all, including a Next.js release fixing DoS and SSRF advisories in Server
  Actions, this project's primary mutation surface (ADR-0002). Migrating to the
  text `bun.lock` — Bun's own default since 1.2 — resolved both costs at once
  (#320). The residual cost is smaller: a text lockfile is large and noisy in
  diffs, so it is skimmed rather than read.
- **Bun is the youngest tool in the stack.** Native modules and less common
  build tooling occasionally need workarounds, and the maintainer absorbs that.
- **Contributors must install Bun.** For an open-source project, that is a small
  but nonzero barrier to a first pull request.
- **The three-day quarantine cuts both ways.** It also delays security patches
  by up to three days. That is an accepted trade: unattended compromise is
  judged the likelier risk than a three-day-old known CVE.
- **Pinning the MCP servers trades drift risk for staleness risk.** Versions in
  `.mcp.json` are not `package.json` dependencies, so Dependabot cannot see
  them and nothing will bump them automatically — `@latest` at least stayed
  current. This is the same shape of trade as the quarantine itself, and it is
  the reason the pins have to be reviewed by hand rather than assumed fresh.
- **The cloud agent's MCP configuration cannot be covered at all.** It is a
  GitHub repository *setting*, evaluated before or independently of
  `bun install`, so it cannot run a local binary and must keep `npx`. It gets
  the exact-version pin and nothing else. That gap is recorded in
  `.github/copilot-cloud-agent-mcp.md` rather than papered over, and it closes
  only if the agent runner gains a dependable pre-install step.

## Consequences

- **Easier:** fast installs and test runs; one toolchain in local, CI, and
  deploy; supply-chain quarantine configured in one file.
- **Harder:** onboarding a contributor who does not have Bun; debugging the
  occasional tool that assumes npm.
- **How we would know this was wrong:** if Bun-specific breakage — native
  modules, Next.js compatibility, CI flakiness — starts consuming meaningful
  maintenance time, the speed benefit is being repaid with interest. Equally, if
  a contributor is ever blocked on the toolchain rather than the code.
- **This has already fired once, and the lesson generalises.** The binary
  lockfile silently broke Dependabot, and the symptom appeared as ordinary red
  checks on a dependency pull request rather than as anything pointing at the
  toolchain. Bun being the youngest tool in the stack means its costs tend to
  surface as *integration* failures with tools that assume npm conventions, not
  as Bun itself misbehaving. When something in the supply chain stops working,
  check whether a Bun-specific artifact is the thing the other tool cannot read
  before assuming the other tool is at fault.
- **A supply-chain control is only as wide as the mechanism it hooks.**
  `minimumReleaseAge` reads as "this project quarantines new npm releases", but
  it hooks `bun install` and so covers only the lockfile. Everything that
  reaches npm by another route — `bunx`, `npx`, an editor's own tooling, a
  GitHub repository setting — is outside it by default and looks no different
  from the inside (#307). Before treating any of these settings as covering a
  new kind of dependency, check which command actually enforces it.
- **Revisit if:** Vercel drops or degrades Bun support, or the project gains
  enough contributors that npm familiarity outweighs the speed benefit.

## Action items

1. [x] `bun.lock` is the only lockfile in the repository (migrated from the
   binary `bun.lockb`, which blocked automated dependency updates — #320)
2. [x] `bunfig.toml` sets a three-day `minimumReleaseAge`
3. [x] `vercel.json` pins `bunVersion` and installs `--frozen-lockfile`
4. [x] Note the Bun prerequisite in the contributing guide
5. [x] MCP servers are pinned or vendored, and `bun run check:mcp-pins` enforces
   it on pull requests (#307)
6. [ ] Move the cloud agent MCP entry to the local binary if the agent runner
   ever gains a dependable pre-install step; until then the gap stands as
   documented in `.github/copilot-cloud-agent-mcp.md`
