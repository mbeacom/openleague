---
schemaVersion: 0.1.0
id: "0002"
title: Use Next.js Server Actions as the primary mutation surface
status: accepted
date: 2025-10-05
created: 2026-08-09
deciders: ["@mbeacom"]
tags: [architecture, nextjs, api, security]
scope: org
reversibility: two-way-door
blastRadius: org
relatesTo: ["0003"]
affects:
  - type: path
    pattern: "lib/actions/**"
  - type: path
    pattern: "app/api/**"
  - type: path
    pattern: "lib/auth/session.ts"
provenance:
  authoredBy: agent-drafted
  ratifiedBy: "@mbeacom"
  sourceArtifact: CLAUDE.md
review:
  tier: auto
  tierReason: Backfilled record of an existing convention; sole maintainer.
reviewBy: 2027-08-09
---

# ADR-0002: Use Next.js Server Actions as the primary mutation surface

## Context

OpenLeague is a single Next.js 16 App Router application with no separate
backend and no third-party API consumers. Every mutation originates in a form or
button in the same deployment that serves the database access.

The App Router offers two ways to write a mutation: a Server Action (a `"use
server"` function imported directly by a component) or a route handler under
`app/api/` called via `fetch`. Choosing per-feature would have produced two
authorization idioms, two validation idioms, and two cache-invalidation idioms
in one codebase.

The security shape of this application makes that inconsistency expensive rather
than merely untidy. Roster records carry emergency contacts, emergency phone
numbers, and USA Hockey member IDs; the data model has both team-level roles
(`ADMIN`/`MEMBER`) and league-level roles (`LEAGUE_ADMIN`/`TEAM_ADMIN`/`MEMBER`).
Every mutation must resolve the caller's identity from the session and then
verify authorization against the specific resource being touched. An
inconsistent mutation surface means that check gets written differently in
different places, which is how insecure-direct-object-reference bugs happen.

## Decision

We will implement mutations as Server Actions in `lib/actions/`. Every action
file begins with `"use server"` and follows one shape: authenticate via
`requireUserId()` (never a client-supplied `userId`), validate input with a Zod
schema, authorize against the specific team/league/resource, mutate through
Prisma, call `revalidatePath()` for affected routes, and return a discriminated
`ActionResult<T>`.

Route handlers under `app/api/` are reserved for the cases a Server Action
structurally cannot serve:

- **Externally-initiated calls:** Auth.js (`/api/auth/[...nextauth]`), the
  Stripe webhook, the Vercel cron endpoints, and the Vercel Blob client-upload
  token exchange (`/api/signup-events/[eventId]/media/upload`), which the Blob
  SDK is given as a URL and which Blob itself calls back on upload completion.
  The caller is not our React tree.
- **Browser navigations to a URL:** invitation and event-invitation token
  redemption, which arrive as links in email and answer with a redirect.
- **Responses that are a file, not a state change:** the roster, event-roster,
  and account exports, and the league `.ics` schedule feed — all four answer
  with `Content-Disposition: attachment`.
- **Infrastructure:** the health check.
- **On-demand reads for a Client Component:** a `GET` that an already-rendered
  Client Component fetches lazily, where a Server Component cannot supply the
  data because the need arises after render. As of this record there is exactly
  one — `/api/leagues/[leagueId]/teams`, fetched by `PlayerTransferDialog` when
  the dialog opens.

As of this record there are 45 action modules and 14 route handlers, each
handler falling into one of those categories.

The fifth category is the weakest of the five, and it is stated separately for
that reason: unlike the others, a Server Action *could* serve it, since actions
may return data as well as mutate. It is recorded as a real exception rather
than hidden inside one of the other four, so that its growth is visible. If it
acquires more members, that is evidence for revisiting this decision (see
Consequences), not licence to widen the category.

## Options considered

### Option A: Server Actions as the default, route handlers by exception (chosen)

| Dimension | Assessment |
|---|---|
| Consistency | One mutation shape; the auth/validate/authorize/revalidate sequence is reviewable by pattern |
| Type safety | End-to-end — no serialization boundary to keep in sync by hand |
| CSRF | Handled by the framework rather than per-route |
| Progressive enhancement | Forms work before hydration |
| Cache invalidation | `revalidatePath()` colocated with the mutation |
| External consumption | Not possible — actions are not addressable |
| Portability | Coupled to the Next.js App Router |

### Option B: REST route handlers for everything

**Pros:** framework-portable; directly consumable by a future mobile client or
third-party integration; testable with plain HTTP tooling.
**Cons:** requires hand-maintaining request/response types across the
serialization boundary; needs an explicit CSRF story; every route re-implements
the session→authorization sequence, and the security surface here (emergency
contacts, two role hierarchies) is exactly where drift is most costly. For an
app with no external API consumers, it is cost with no present benefit.

### Option C: Both, chosen per feature

**Pros:** each feature picks what fits.
**Cons:** the failure mode this decision exists to prevent. Two idioms means a
reviewer must hold both in their head, and an agent generating a new feature has
no basis to pick.

### Option D: A tRPC or GraphQL layer

**Pros:** end-to-end types plus a real external API surface.
**Cons:** a whole additional runtime and codegen step to reach type safety the
App Router already provides in-process. Justified when a separate client exists;
there is none.

## Trade-offs

- **We give up an external API.** Nothing outside the React tree can invoke a
  mutation. Adding a mobile client or a partner integration means writing route
  handlers that call into the same underlying logic — real work, not a rewrite,
  but real.
- **We are coupled to the App Router.** Server Actions are not portable to
  another framework.
- **Testing is less conventional.** Actions are tested as functions with Prisma
  and the session helpers mocked, rather than by exercising HTTP.
- **The exception list needs judgment.** "Reserved for external callers, browser
  navigations, file responses, infrastructure, and lazy Client Component reads"
  is a rule a reviewer must apply, not one CI can check. The fifth category in
  particular is a judgment call every time, since a Server Action could serve it.
  It will be argued over at the margin.

## Consequences

- **Easier:** new mutations follow one reviewable template; authorization has a
  single place to go wrong, so it can be audited in a single pass; no
  client/server type drift.
- **Harder:** exposing any capability to a non-browser client; migrating off
  Next.js.
- **How we would know this was wrong:** if a second client (mobile app, partner
  integration) becomes a real requirement, the exception list stops being an
  exception list and this decision should be superseded rather than stretched.
  Equally, if route handlers start appearing for reasons outside the five
  categories above — or if the fifth category, currently a single handler, grows
  past two or three members — the rule is not holding.
- **Revisit if:** a non-browser consumer is committed to, or Next.js changes the
  Server Action security model.

## Action items

1. [x] `lib/actions/` holds mutation logic behind `"use server"`
2. [x] Session helpers in `lib/auth/session.ts` are the only identity source
3. [ ] Document the route-handler exception categories in `lib/actions/README.md`
