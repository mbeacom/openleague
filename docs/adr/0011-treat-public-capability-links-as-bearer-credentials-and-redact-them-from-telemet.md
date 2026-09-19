---
schemaVersion: 0.1.0
id: "0011"
title: "Treat public capability links as bearer credentials and redact them from telemetry"
status: proposed
date: 2026-09-19
created: 2026-09-19
deciders: ["@mbeacom"]
tags: [security, privacy, telemetry, public-access]
scope: org
reversibility: one-way-door
blastRadius: org
relatesTo: ["0002", "0008"]
affects:
  - type: path
    pattern: "lib/telemetry/**"
    note: The redaction registry and the Sentry hook bundle that applies it.
  - type: path
    pattern: "app/gear-wishlist/**"
  - type: path
    pattern: "app/(marketing)/signups/l/**"
  - type: path
    pattern: "app/(auth)/reset-password/**"
  - type: path
    pattern: "app/(auth)/verify-email/**"
  - type: path
    pattern: "app/(auth)/confirm-email-change/**"
  - type: path
    pattern: "app/api/invitations/**"
  - type: path
    pattern: "app/api/event-invitations/**"
  - type: path
    pattern: "app/unsubscribe/**"
    note: Carries its credential as a query parameter, not a path segment.
  - type: path
    pattern: "components/providers/AnalyticsProvider.tsx"
    note: Suppresses analytics on capability routes using the same registry.
provenance:
  authoredBy: agent-drafted
  sourceArtifact: specs/004-signup-events/research.md
review:
  tier: async
  tierReason: >-
    The record defines how unauthenticated access is granted across the product
    and what must never leave the process. A gap in it is a credential leak to a
    third-party processor.
reviewBy: 2027-09-19
---

# ADR-0011: Treat public capability links as bearer credentials and redact them from telemetry

## Context

Several readers have no account and cannot be given one: a supplier looking at a
gear wishlist, a parent opening a signup link, a person resetting a forgotten
password, someone unsubscribing from email. Each still needs a scoped, working
URL.

The product answered this the same way each time, in different features and at
different dates: mint a crypto-random token and put it in the URL. The mechanism
is stated plainly in two places written months apart. `lib/telemetry/capability-privacy.ts:4-6`:

> Public capability routes are unauthenticated URLs whose path segment *is* the
> credential — `/gear-wishlist/<shareToken>` grants anyone holding the link read
> access to the wishlist and the ability to pledge against it.

and `specs/004-signup-events/research.md:158`, reaching the same conclusion
independently for signup events: "the token *is* the capability."

That has a consequence the individual features did not each decide: **a URL is
now a secret.** Telemetry exists to capture URLs — Sentry records request URLs,
transaction names, span descriptions, breadcrumbs, navigation events, and
`callbackUrl` query parameters; analytics records pathnames. Every one of those
is an export path for a live credential to a third-party processor.

The decision is being recorded now because the enforcement point is a registry,
and a registry is only correct if everyone who adds a route knows it exists. The
mechanism was sound and the list had fallen behind the application as new
capability routes were added feature by feature. Nothing in the codebase said
that shipping such a route obliges you to extend the registry — which is a
documentation gap rather than a design flaw, and precisely what a decision
record is for.

## Decision

We will treat any unauthenticated URL whose path segment or query value is a
credential as a bearer secret, and we will redact it from every telemetry
payload before export.

Concretely:

1. `PUBLIC_CAPABILITY_ROUTE_PREFIXES` in `lib/telemetry/capability-privacy.ts`
   is the single registry of path-borne capability routes. Adding an
   unauthenticated token route to the application without adding it here is a
   defect, not an omission.
2. `PUBLIC_CAPABILITY_QUERY_PARAMS` is the equivalent registry for credentials
   carried as query values, which the path-prefix patterns structurally cannot
   match (`/unsubscribe?token=`).
3. Redaction runs on all four Sentry envelope hooks — `beforeSend`,
   `beforeSendTransaction`, `beforeSendSpan`, `beforeBreadcrumb` — spread into
   `Sentry.init` on all three runtimes. Breadcrumbs are scrubbed twice on
   purpose, as they are recorded and again inside the enclosing event, "so a
   token can never survive because a single hook was skipped"
   (`lib/telemetry/sentry-privacy.ts:6-12`).
4. `lib/telemetry/capability-privacy.ts` stays dependency-free and isomorphic.
   It "must never touch `window`, `document`, or `process`", because the same
   code must run in the browser bundle, on Node, and on the edge runtime.
5. The same registry suppresses analytics on capability routes
   (`AnalyticsProvider.tsx`), so a capability pathname is never sent to Umami or
   GA either.

A route addresses a *capability* when holding the URL is sufficient to act. A
route that addresses a public record by identifier is not a capability route:
`/associations/<slug>`, `/rinks/<slug>` and `/signups/<eventId>` are public by
design, and `/venue-relationships/<relationshipId>` is authorized server-side by
`requireTargetAuthority` (`lib/actions/venue-relationships.ts:121`).

## Options considered

### Option A: Token in the URL, with mandatory redaction at the telemetry boundary (chosen)

| Dimension | Assessment |
|---|---|
| Reader experience | Best available: click the link, it works, no account |
| Revocation | Regenerate the token; the old URL dies immediately |
| Leak surface | Large — URLs travel through logs, telemetry, referrers, history |
| Containment | One registry, enforced in one isomorphic module |
| Failure mode | Silent: a forgotten registry entry leaks without any error |

### Option B: Signed JWT links

**Pros:** self-describing, expiry encoded in the token, no database lookup.

**Cons:** rejected in `specs/004-signup-events/research.md:157` — "revocation
awkward vs. a regenerable DB token". Revoking a signed token before its expiry
requires exactly the denylist the DB token avoids. The URL is still a secret, so
this option does not avoid the telemetry problem at all.

### Option C: Per-viewer ACL rows

**Pros:** real per-identity authorization, ordinary auditability.

**Cons:** rejected as "overkill" in the same research note. It also fails the
forcing requirement: the viewer has no account, so there is no identity to bind
a row to.

### Option D: Do nothing — require an account for every read

**Pros:** no bearer credentials anywhere, no redaction machinery to maintain.

**Cons:** defeats the use cases outright. A supplier will not create an account
to see a wishlist, and a password reset cannot require a login by definition.

## Trade-offs

The chosen option costs real safety margin, and it is worth naming plainly:

- **A URL in a screenshot, a support ticket, a browser history, or a shared
  device is a live credential.** Nothing in this decision prevents that; it only
  prevents *our* telemetry from being one more copy.
- **Enforcement is a list a human must remember to extend.** The test added
  alongside this record asserts the registry's exact contents, so adding a route
  without registering it fails a test rather than leaking silently — but that
  test is itself a convention, not a type-level guarantee.
- **Debuggability drops on exactly the routes most likely to need it.** A
  redacted URL cannot be correlated to a specific user's failing link, and
  analytics is suppressed entirely on these pages, so page-view and web-vitals
  data for password reset and email verification is absent by design.
- **Redaction is best-effort against payload shape.** It traverses plain objects
  to a depth ceiling of 12 and deliberately does not mutate `Error`, `Date`, or
  host objects. A credential embedded in an exotic payload could survive.

## Consequences

- **Easier:** granting scoped access to people without accounts; revoking it by
  regenerating one row; adding a new capability route, because the redaction,
  the analytics suppression, and the encoded-URL handling all follow from one
  array entry.
- **Harder:** debugging capability routes from telemetry; reasoning about leak
  surface, because the credential travels wherever the URL travels.
- **How we would know this was wrong:** a capability token appearing in any
  exported telemetry payload, log line, or third-party console; or a second
  registry-shaped list appearing elsewhere in the codebase, which would mean the
  single-registry property has already been lost. Either finding invalidates the
  containment claim above.
- **Revisit if:** a capability route needs to carry authorization beyond read
  plus one scoped write; if tokens start needing per-viewer attribution; or if a
  third telemetry or logging sink is added that does not route through
  `sentry-privacy.ts`.

## Provenance and gaps

Drafted by an agent from a backfill audit; ratification is a separate human act.

Evidence: `lib/telemetry/capability-privacy.ts:1-22`,
`lib/telemetry/sentry-privacy.ts:1-30`,
`specs/004-signup-events/research.md:144-159`,
`lib/actions/venue-relationships.ts:115-121`.

Known gaps in the evidence, recorded rather than filled in:

- No commit, PR, or document states the entropy chosen for the gear share token.
  `specs/004` documents 32 bytes for signup-event link tokens only.
- Whether the unregistered routes were omitted deliberately or by oversight is
  recorded nowhere. This record assumes oversight: nothing in the module's own
  docstring justifies treating any of them differently from the one that was
  registered.
- `/unsubscribe` carries its token as a query parameter. Whether that divergence
  from the path-segment convention was deliberate is unrecorded.

## Action items

1. [x] Bring the registry in line with the application's capability routes, including the query-parameter form.
2. [x] Assert the registry's exact contents in `__tests__/lib/telemetry/capability-privacy.test.ts`.
3. [ ] Decide whether `/unsubscribe` should move to the path-segment convention.
4. [ ] Record the intended token entropy for each capability route.
