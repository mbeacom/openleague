---
schemaVersion: 0.1.0
id: "0013"
title: "Never push to main from CI, deriving versions from tags and reports from an orphan branch"
status: proposed
date: 2026-09-19
created: 2026-09-19
deciders: ["@mbeacom"]
tags: [ci, release, versioning, supply-chain]
scope: org
reversibility: two-way-door
blastRadius: org
relatesTo: ["0001", "0005"]
affects:
  - type: path
    pattern: ".github/workflows/release.yml"
    note: Derives the version from git describe; deliberately has no bump step.
  - type: path
    pattern: ".github/workflows/tag-release.yml"
  - type: path
    pattern: ".github/workflows/version-check.yml"
  - type: path
    pattern: ".github/workflows/adr-badges.yml"
    note: Publishes the badge reports to the orphan badges branch, not to main.
  - type: path
    pattern: "package.json"
    note: The version field trails the newest tag by design; nothing reads it.
  - type: path
    pattern: ".github/AUTOMATION.md"
    note: The prose description of the release lifecycle must match the workflow.
provenance:
  authoredBy: agent-drafted
  sourceArtifact: .github/workflows/release.yml
review:
  tier: async
  tierReason: >-
    Reversing this re-breaks releases, and the only workaround discussed grants
    any workflow with contents:write the ability to bypass branch protection.
reviewBy: 2027-09-19
---

# ADR-0013: Never push to main from CI, deriving versions from tags and reports from an orphan branch

## Context

The `main` branch is protected by a ruleset requiring four status checks. A push
made by a workflow produces none of them, so GitHub rejects it with **GH013**.

Two automations were written assuming they could write to `main`, and both
failed in production:

1. The release workflow computed a semantic version, wrote it to `package.json`,
   and committed the bump with `[skip ci]`. The push was rejected, and — this is
   the part that mattered — the failure aborted the job *before* it reached the
   tag and release steps. The repository stopped producing releases entirely,
   and the cause was a bookkeeping step nothing depended on.
2. The ADR badge workflow generated two JSON reports for shields.io to read and
   committed them to `main`. It failed the same way. A rebase-and-retry loop was
   added and did not help: `adr-badges.yml:99` records that the retry "failed
   identically and the job errored", because the rejection is a policy decision,
   not a race.

The ruleset is correct and should stay. The automations were wrong to assume
they could write through it.

## Decision

We will not push to `main` from any workflow. Each automation that wanted to
gets a substitute that does not require write access to a protected branch.

**Versions come from git tags.** `release.yml:80` reads the current version with
`git describe --tags --abbrev=0`, derives the bump from commit messages since
that tag, and creates an annotated tag. There is no `package.json` write and no
commit. The workflow says so in place (`release.yml:130-145`):

> There is deliberately no "bump package.json and push to main" step here. […]
> The bump was safe to drop rather than work around: the version above is
> derived from `git describe --tags`, so tags are already the source of truth,
> and nothing reads `package.json`'s version at build or runtime.

**`package.json`'s `version` field is therefore stale by design.** Read the
version from the newest tag or the GitHub release. The README version badge
does.

**Generated reports go to a dedicated orphan branch.** `adr-badges.yml` rebuilds
`.adrkit/lint.json` and `.adrkit/queue.json` on each run and force-pushes them
to the **`badges`** branch as a single orphan commit. Shields.io reads that
branch. The copies committed on `main` are a point-in-time snapshot and are not
the published artifact.

Tag protection is not configured, and the ruleset targets branches, so tagging
and releasing work without any exception being granted.

## Options considered

### Option A: No CI writes to main; tags and an orphan branch carry the state (chosen)

| Dimension | Assessment |
|---|---|
| Releases | Work, with no protection exception |
| Security | No workflow needs push access to a protected branch |
| Race behaviour | Orphan force-push is race-free by construction |
| Cost | `package.json` version is misleading to a casual reader |

### Option B: Grant the Actions app a ruleset bypass

**Pros:** every automation keeps working as originally written; `package.json`
stays accurate.

**Cons:** rejected, and the reason is recorded in `release.yml:142-144` — a
bypass for the Actions app (id 15368) "would let any workflow holding
`contents: write` push to main past all four required checks". That converts a
branch protection into a suggestion for every current and future workflow,
including ones added by a dependency's reusable action. The blast radius is far
larger than the bookkeeping it would restore.

### Option C: Rebase and retry the push against main

**Pros:** the obvious fix for a rejected push; no policy change.

**Cons:** attempted and removed. It treats a policy rejection as a race
condition. The retry re-ran, was rejected identically, and the job errored
(`adr-badges.yml:99-101`).

### Option D: Do nothing — accept that releases are manual

**Pros:** no automation to maintain.

**Cons:** the repository had already stopped releasing automatically; this was
the status quo being escaped, not an option to return to.

## Trade-offs

- **`package.json` lies about the version, permanently.** Anyone reading the
  file gets a stale answer, and the failure is silent — there is no error, just
  a wrong number. This is the direct cost of the decision and it is accepted
  only because nothing reads the field at build or runtime. If anything ever
  does, this record is invalidated.
- **The badges branch has no history worth keeping.** It is force-pushed on
  every run, so it cannot be used to answer "when did the corpus reach N
  records".
- **`version-check.yml` still diffs `package.json` versions on pull requests**
  and appears vestigial now that nothing bumps the field. It has not been
  removed, and whether it still earns its place is unresolved.
- **The rationale lives in workflow comments**, which is the right place for it
  but means a reader of the repository root sees only the stale version field.

## Consequences

- **Easier:** releasing, which now works; reasoning about who can write to
  `main`, because the answer is "no workflow"; reasoning about badge races.
- **Harder:** answering "what version is deployed" from a file; keeping prose
  documentation honest, since `.github/AUTOMATION.md` described the removed bump
  step for some time after it was deleted.
- **How we would know this was wrong:** any code or build step reading
  `package.json`'s `version`, which would make the stale field load-bearing; or
  a release failing because tag protection was later added without updating this
  record.
- **Revisit if:** tag protection is introduced; if a release artifact needs an
  accurate in-repo version; or if GitHub gains a way to satisfy required checks
  from a workflow push without a blanket app bypass.

## Provenance and gaps

Drafted by an agent from a backfill audit; ratification is a separate human act.

Evidence: `.github/workflows/release.yml:73-115,130-145`,
`.github/workflows/adr-badges.yml:95-133`,
`.github/workflows/version-check.yml:26-44`.

Known gaps:

- The GH013 rejection itself is not recorded in any commit message or pull
  request body. It survives only in workflow comments and project prose, which
  is why this record exists.
- Whether `version-check.yml` is now dead weight is unverified; this record does
  not decide it.

## Action items

1. [x] Correct `.github/AUTOMATION.md` to describe the tag-derived release flow.
2. [ ] Decide whether `version-check.yml` still has a purpose.
3. [ ] Consider removing `version` from `package.json`, or annotating it as unmaintained.
