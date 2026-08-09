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
    pattern: "bun.lockb"
  - type: path
    pattern: "package.json"
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
development, CI, and deployment. `bun.lockb` is the only lockfile; `bun install`
is the only install command; every `package.json` script is invoked with
`bun run`.

Two settings follow from the decision rather than merely accompanying it:

- `bunfig.toml` sets `minimumReleaseAge = 259200` — a three-day quarantine
  before a newly published version is installable, which blunts the window in
  which a compromised release is picked up automatically.
- `vercel.json` pins `bunVersion: "1.x"` and installs with
  `--frozen-lockfile`, so deployment resolves exactly what was committed.

Seven GitHub Actions workflows use `oven-sh/setup-bun`, so CI, deployment, and
local development run the same toolchain.

Bun is the *toolchain*, not the *runtime contract*. The application is a Next.js
app deployed to Vercel's Node-compatible serverless runtime. `bun --bun next
dev` is used locally for speed, but nothing in the application code may depend
on Bun-only APIs.

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

- **`bun.lockb` is binary.** It cannot be reviewed in a diff, so a dependency
  change is only visible through `package.json`. That is a real loss of review
  signal in the one place supply-chain attacks land.
- **Bun is the youngest tool in the stack.** Native modules and less common
  build tooling occasionally need workarounds, and the maintainer absorbs that.
- **Contributors must install Bun.** For an open-source project, that is a small
  but nonzero barrier to a first pull request.
- **The three-day quarantine cuts both ways.** It also delays security patches
  by up to three days. That is an accepted trade: unattended compromise is
  judged the likelier risk than a three-day-old known CVE.

## Consequences

- **Easier:** fast installs and test runs; one toolchain in local, CI, and
  deploy; supply-chain quarantine configured in one file.
- **Harder:** reviewing lockfile changes; onboarding a contributor who does not
  have Bun; debugging the occasional tool that assumes npm.
- **How we would know this was wrong:** if Bun-specific breakage — native
  modules, Next.js compatibility, CI flakiness — starts consuming meaningful
  maintenance time, the speed benefit is being repaid with interest. Equally, if
  a contributor is ever blocked on the toolchain rather than the code.
- **Revisit if:** Vercel drops or degrades Bun support, or the project gains
  enough contributors that npm familiarity outweighs the speed benefit.

## Action items

1. [x] `bun.lockb` is the only lockfile in the repository
2. [x] `bunfig.toml` sets a three-day `minimumReleaseAge`
3. [x] `vercel.json` pins `bunVersion` and installs `--frozen-lockfile`
4. [x] Note the Bun prerequisite in the contributing guide
