---
schemaVersion: 0.1.0
id: "0017"
title: "Adopt Sentry as a DSN-optional telemetry provider that degrades to a no-op"
status: proposed
date: 2026-09-19
created: 2026-09-19
deciders: ["@mbeacom"]
tags: [observability, telemetry, portability, self-hosting]
scope: org
reversibility: two-way-door
blastRadius: org
relatesTo: ["0008", "0011"]
affects:
  - type: path
    pattern: "sentry.*.config.ts"
    note: Per-runtime initialization, each gated on the DSN being present.
  - type: path
    pattern: "instrumentation.ts"
    note: Registers the runtime-specific config and exports onRequestError.
  - type: path
    pattern: "instrumentation-client.ts"
    note: The browser half of the same gate.
provenance:
  authoredBy: agent-drafted
  sourceArtifact: sentry.server.config.ts
review:
  tier: async
  tierReason: >-
    The portability property is a commitment under ADR-0008, but the provider
    choice itself has no recorded rationale, so the record needs a human to
    supply or decline the missing half.
reviewBy: 2027-03-19
---

# ADR-0017: Adopt Sentry as a DSN-optional telemetry provider that degrades to a no-op

## Context

ADR-0008 commits to core association operations being free and
provider-portable, and to the application booting without optional credentials.
Error tracking still had to come from somewhere: unhandled exceptions in Server
Components and Server Actions are otherwise invisible.

Any hosted error tracker creates the tension ADR-0008 anticipates. A fork or a
self-hosted deployment must not be required to hold an account with a vendor in
order to run.

## Decision

We will use Sentry for error and performance telemetry, wired so that the
**absence of a DSN is a supported, first-class state** rather than a failure.

- Each runtime reads `NEXT_PUBLIC_SENTRY_DSN?.trim()` and calls `Sentry.init`
  only if it is set. `sentry.server.config.ts:7` states the intent: "No-op when
  the DSN is not configured (local dev, forks, CI)."
- `instrumentation.ts` registers the Node or edge config by `NEXT_RUNTIME`, and
  exports `onRequestError` as a "safe no-op without a DSN", so nested Server
  Component errors are captured when configured and cost nothing when not.
- `sendDefaultPii: false`. Personal data is not sent by default.
- `tracesSampleRate: 0.1`.
- Every runtime spreads `capabilityTokenPrivacyOptions`, the redaction bundle
  required by ADR-0011, so no capability credential leaves the process.

The portable property is the decision being recorded. Sentry is the current
provider; the requirement is that removing it changes nothing but observability.

## Options considered

The honest position is that **no alternative was evaluated in this repository**.
What follows is the shape of the comparison, not a record of one that happened —
a reviewer should treat it as the drafter's reconstruction and correct it.

### Option A: Hosted Sentry, DSN-optional (chosen — rationale partly unrecorded)

| Dimension | Assessment |
|---|---|
| Next.js integration | First-class: RSC errors, per-runtime configs, source maps |
| Cost without a DSN | Nothing initializes; no network, no vendor account |
| ADR-0008 compatibility | Satisfied by the gate, not by the provider |
| Recorded rationale | **Absent** for choosing Sentry over anything else |

### Option B: Self-hosted Sentry

**Pros:** same SDK and integration, no third-party processor, fully portable.

**Cons:** an operational burden that a project with one maintainer would have to
carry. Not evaluated in the repository.

### Option C: OpenTelemetry to a swappable collector

**Pros:** vendor-neutral by construction, which is the strongest possible form
of the portability property.

**Cons:** more wiring, and weaker out-of-the-box Next.js App Router error
capture. Not evaluated in the repository.

### Option D: Platform-native (Vercel) observability

**Pros:** nothing to configure on the current host.

**Cons:** host-specific, which is exactly what ADR-0008 warns against; a
self-hosted deployment would silently have no error tracking.

### Option E: Do nothing — no error tracking

**Pros:** maximum portability and zero third-party exposure.

**Cons:** production RSC and Server Action failures become invisible, which for
a service associations depend on is not acceptable.

## Trade-offs

- **The portability guarantee is "it still runs", not "it still observes".** A
  self-hoster gets a working application with no error tracking and no migration
  path to an alternative — there is no provider seam here of the kind
  `lib/email/**` has. ADR-0008's portability is satisfied in the weaker sense.
- **`sendDefaultPii: false` costs debuggability.** Reports arrive without user
  context, which is the right default and does make some issues harder to trace.
- **A 10% trace sample** means most performance data is absent; the rationale
  for that specific figure is unrecorded.
- **The DSN is a `NEXT_PUBLIC_` variable**, so it ships to the browser. That is
  how Sentry works and is not a leak, but it means the value is not secret.

## Consequences

- **Easier:** running a fork, a CI job, or a local dev server with no vendor
  account; capturing errors across all three runtimes uniformly.
- **Harder:** moving off Sentry, because there is no abstraction seam — the SDK
  is imported directly in four files; debugging without PII.
- **How we would know this was wrong:** the DSN gate being bypassed anywhere, so
  a fork attempts to initialize telemetry; or a hard dependency on Sentry
  appearing in a code path that must work without it.
- **Revisit if:** telemetry becomes load-bearing for self-hosters, which would
  argue for an OpenTelemetry seam; or if the vendor relationship changes.

## Provenance and gaps

Drafted by an agent from a backfill audit; ratification is a separate human act.

Evidence: `sentry.server.config.ts:5-19`, `instrumentation.ts:1-14`,
`instrumentation-client.ts:3-17`,
`docs/adr/0008-keep-core-association-operations-free-and-provider-portable.md:67-69`.
Introduced in commit `dca3eaf`; the capability-token redaction was added in
`6f1575f` (#335).

**The principal gap is the decision itself.** No commit, specification, or
comment records why Sentry was chosen over any alternative. The DSN-optional
degradation has clear intent evidence; the provider selection has none. Per the
backfill rules the alternatives above were not invented as historical fact, and
this record should not be ratified as if a comparison took place. A reviewer
should either supply the real reasoning or accept the record as documenting
current state only.

Also unrecorded: the rationale for `tracesSampleRate: 0.1`, and whether ADR-0008
was consciously consulted when this was wired.

## Action items

1. [ ] Supply the real rationale for choosing Sentry, or mark this as state-only.
2. [ ] Record why the trace sample rate is 0.1.
3. [ ] Decide whether self-hosted deployments should have any telemetry path.
