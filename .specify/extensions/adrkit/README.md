# @adrkit/spec-kit

The [Spec Kit](https://github.com/github/spec-kit) extension for
[adrkit](https://adrkit.dev) — decision memory for the spec-driven plan loop.

Spec Kit takes you from `specify` to `plan` to `tasks` to `implement`. What it
does not do is check the plan it just produced against the decisions your
organization already made, or record the new decisions the plan contains. Every
feature starts from an empty context and re-litigates settled questions.

This extension closes that loop, without leaving git.

## What it adds

| Command | What it does | Writes |
|---|---|---|
| `/speckit.adrkit.context` | Pulls the decisions governing the paths you're about to touch — including superseded and rejected ones — into context before you plan | no |
| `/speckit.adrkit.check` | Checks a produced plan against the decisions that govern it, and routes it through the deterministic evaluator when a snapshot bundle is configured | no |
| `/speckit.adrkit.draft` | Scaffolds a draft ADR from the current plan artifact for you to fill in | one new record |

Plus one hook: `after_plan` offers to run `/speckit.adrkit.check`. It is
**optional** — it asks, it does not seize the plan loop.

## Requirements

- Spec Kit `>=0.13.0,<0.16.0`. Verified by installing and rendering against
  0.13.0, 0.14.4, and 0.15.1; widening past 0.16 means re-verifying first, not
  bumping. See
  [ADR-0019](../../../docs/adr/0019-ship-the-spec-kit-extension-treating-the-spike-no-go-as-a-measurement-artifact.md).
- The `adr` CLI (`npm install -g @adrkit/cli`), or `ADRKIT_CLI` pointing at its
  entry point.
- An ADR corpus. Defaults to `docs/adr`.

## Install

From the Spec Kit catalog, once the entry lands:

```sh
specify extension add adrkit
```

Or straight from a checkout:

```sh
specify extension add --dev path/to/packages/adapters/spec-kit
```

Then `/speckit.adrkit.context` is available in your agent, and `/speckit.plan`
will offer the `after_plan` hook.

The package is also published on npm as `@adrkit/spec-kit`, versioned
independently of the rest of the scope: its semver contract is with Spec Kit,
not with `@adrkit/core` (ADR-0007).

## Configuration

Every knob is an environment variable, because an extension that needs its own
config file is an extension nobody installs.

| Variable | Default | Meaning |
|---|---|---|
| `ADRKIT_DIR` | `docs/adr` | ADR corpus directory |
| `ADRKIT_CLI` | resolved | Explicit path to the `adr` entry point |
| `ADRKIT_FEATURE_DIR` | resolved | Override Spec Kit's own feature resolution |
| `ADRKIT_SNAPSHOT` | unset | Snapshot bundle enabling the deterministic evaluator |
| `ADRKIT_AS_OF` | today, UTC | Evaluation date |

The CLI is resolved in a fixed order: `ADRKIT_CLI`, then
`./node_modules/.bin/adr`, then `adr` on `PATH`. No branch of that reaches the
network — a missing CLI is reported, never fetched.

## Design constraints

These are enforced by tests, not by convention, and each was observed failing
under a deliberately introduced defect before it was trusted
([ADR-0016](../../../docs/adr/0016-require-every-check-to-be-observed-failing-before-it-counts-as-coverage.md)).

- **Hooks never write.** `draft` is the only command that writes, and it is
  unreachable from any hook. A plan-phase hook creating records unprompted would
  manufacture decision memory rather than record it.
- **The hook is never mandatory.** `optional: false` renders as an automatic hook
  that fires without consent.
- **Failures name what is missing.** No command exits 0 having found nothing
  because it was looking in the wrong place. "0 decisions govern this" and "I
  could not see the corpus" must never render as the same string.
- **`check` mutates nothing**, verified by byte-comparing the whole project tree
  before and after.
- **Nothing development-only reaches your repo.** `specify extension add --dev`
  copies this directory verbatim, so `.extensionignore` keeps the test suite,
  `tsconfig.json`, and `package.json` out of your `.specify/extensions/`. The
  package declares no dependencies at all, so there is never a `node_modules/`
  to copy — a workspace symlink in one aborts the install partway through.

## Provenance

The hook mechanism was verified end-to-end against live Spec Kit v0.13.0 by
[spike 008](../../../specs/008-spec-kit-hook-viability/), under a
kernel-enforced network namespace, with an independent evidence audit. That
spike's recorded verdict is `no-go`, driven by a measurement artifact it
disclosed itself; [ADR-0019](../../../docs/adr/0019-ship-the-spec-kit-extension-treating-the-spike-no-go-as-a-measurement-artifact.md)
records why that verdict does not block this package, and what still binds.

Per [ADR-0014](../../../docs/adr/0014-stage-phase-landing-evidence-across-a-three-rung-validation-ladder.md)
this package is **landed / reference-verified** on rungs 1–2. Rung 2 is a
maintainer-owned isolated reference repository,
[`adrkit-t018-dogfood`](https://github.com/mbeacom/adrkit-t018-dogfood), which
re-installs this extension from a pinned adrkit commit into a real Spec Kit
project on every push and weekly, across all three declared upstream versions —
41 self-verifying, fail-closed assertions each. The gate was observed failing on
a deliberate divergence before being trusted. Evidence index:
[`docs/reference-verification-spec-kit-extension.md`](../../../docs/reference-verification-spec-kit-extension.md).

It is **not** externally validated (rung 3): nobody but the maintainer has run
this in their own repository yet.

## License

Apache-2.0.
