---
schemaVersion: 0.1.0
id: "0015"
title: "Accept per-instance in-memory rate limiting as advisory, not a security control"
status: proposed
date: 2026-09-19
created: 2026-09-19
deciders: ["@mbeacom"]
tags: [security, infrastructure, rate-limiting, serverless]
scope: org
reversibility: two-way-door
blastRadius: org
relatesTo: ["0008"]
affects:
  - type: path
    pattern: "proxy.ts"
    note: Applies the limiter and emits the 429 and X-RateLimit-* headers.
  - type: path
    pattern: "lib/utils/rate-limit.ts"
    note: The in-memory Map, its windows, and the configured limits.
provenance:
  authoredBy: agent-drafted
  sourceArtifact: lib/utils/rate-limit.ts
review:
  tier: async
  tierReason: >-
    The record states that a control the code presents as protective is in fact
    advisory. If that is not the intent, the gap is a security finding rather
    than a decision.
reviewBy: 2027-03-19
---

# ADR-0015: Accept per-instance in-memory rate limiting as advisory, not a security control

## Context

`proxy.ts` rate-limits matched requests, applying a stricter window to auth
routes than to general API traffic, returning `429` with `Retry-After`, and
emitting `X-RateLimit-Limit`, `-Remaining`, and `-Reset` headers
(`proxy.ts:24-61`). It presents, from the outside, as a working rate limiter.

The implementation is a `Map` held in module scope
(`lib/utils/rate-limit.ts:9-11`). Its own header says what it is:

> Simple in-memory rate limiter for development
> In production, consider using Redis or a dedicated rate limiting service

The application runs on Vercel Fluid Compute, which reuses instances and runs
several concurrently. Each instance holds its own `Map`. A client's requests are
counted separately per instance, so the effective ceiling is approximately
*N × configured*, where N is the live instance count — a number the application
does not control, cannot observe, and which changes with load. Counters also
reset whenever an instance recycles.

This is a decision that was never made. Code written for one deployment model is
running under another, and the comment describing it as a development tool is
still accurate while the wiring treats it as production infrastructure.

## Decision

We will treat the in-memory limiter as an **advisory** control and say so,
rather than leave code in place that reads as a security boundary.

Specifically:

1. The limiter's purpose is to blunt accidental request storms — a retry loop, a
   misbehaving client, a double-submitted form — not to resist a deliberate
   attacker.
2. **No security property may depend on it.** Credential stuffing, enumeration,
   and abuse resistance must be handled by controls that do not rely on
   per-instance counters: password hashing cost, account lockout, token entropy,
   or a platform-level control.
3. The configured numbers are per instance, not per deployment, and should be
   read that way when tuning.

This records the constraint as it stands. It is deliberately *not* a decision
that the limiter is adequate.

## Options considered

### Option A: Keep the in-memory limiter, documented as advisory (chosen)

| Dimension | Assessment |
|---|---|
| Cost | None; already built |
| Effectiveness vs accidents | Good — a runaway client is stopped per instance |
| Effectiveness vs attackers | Weak — per-instance counters do not compose into a global limit |
| Honesty | Requires this record; the code alone implies more than it delivers |

### Option B: Redis or a dedicated rate-limiting service

**Pros:** correct shared counters; the limit means what it says. Named in the
source comment as the production answer.

**Cons:** adds a stateful dependency to a stack whose portability is a committed
property (ADR-0008). It becomes a new boot requirement for self-hosters and a
new failure mode on every request path, to protect endpoints that are also
protected by bcrypt cost and token entropy.

### Option C: Vercel's platform firewall or built-in rate limiting

**Pros:** correct at the edge, before compute is billed; no application
dependency.

**Cons:** not evaluated anywhere in the repository. It is also host-specific,
which sits awkwardly with ADR-0008's portability commitment — a self-hosted
deployment would have no equivalent and would silently lose the control.

### Option D: Remove the limiter entirely

**Pros:** removes a control that implies a guarantee it does not provide.

**Cons:** it does provide real value against accidental storms, and the headers
are useful to well-behaved clients. Removing it trades a partial control for
none.

## Trade-offs

- **The code implies a stronger guarantee than it delivers.** Headers and a
  `429` look authoritative. Anyone reading `proxy.ts` without reading
  `rate-limit.ts` will reasonably conclude the endpoint is rate-limited, and
  they will be wrong by a factor of the instance count.
- **The limit is not a number anyone can state.** "10 auth requests per 15
  minutes" is per instance; the real figure is unknown and variable.
- **Memory grows with distinct identifiers** until `cleanup()` runs, so the
  `Map` is also a small unbounded-growth surface under a spray of unique IPs.
- **Accepting this means accepting that the numbers cannot be tuned meaningfully**
  against real-world abuse, only against accidental load.

## Consequences

- **Easier:** deployment and self-hosting, which need no shared store; local
  development, which behaves identically to production.
- **Harder:** making any claim about abuse resistance; tuning limits; reasoning
  about behaviour under scale-out.
- **How we would know this was wrong:** a successful credential-stuffing or
  enumeration incident against an endpoint whose only stated protection is this
  limiter; or a security review treating the `X-RateLimit-*` headers as evidence
  of a control.
- **Revisit if:** an endpoint needs a rate limit as a genuine security boundary;
  if instance counts rise enough that accidental storms stop being contained; or
  if a portable shared-counter option appears that does not become a boot
  requirement.

## Provenance and gaps

Drafted by an agent from a backfill audit; ratification is a separate human act.

Evidence: `lib/utils/rate-limit.ts:1-8` (the source comment),
`lib/utils/rate-limit.ts:9-45` (the per-process Map),
`proxy.ts:24-61` (production wiring).

Known gaps, and one of them is load-bearing:

- **No commit or document records that the multi-instance weakening was
  consciously accepted.** The source comment still describes the limiter as a
  development choice. This record may therefore be documenting an oversight
  rather than a decision — if so, it should be rejected and the limiter
  replaced, not ratified.
- A local branch (`feat/track2-wrapup`) was checked during the audit and does
  **not** modify `rate-limit.ts` or `proxy.ts`, so no in-flight work supersedes
  this.
- Neither Vercel's platform rate limiting nor a Redis option was evaluated in
  the repository; both are listed above from first principles, not from a
  recorded assessment.

## Action items

1. [ ] Confirm the advisory framing is intended, or replace the limiter.
2. [ ] Correct the source comment so it no longer calls a production control a development one.
3. [ ] Confirm no security claim anywhere depends on these limits.
