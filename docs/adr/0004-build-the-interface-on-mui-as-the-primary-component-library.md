---
schemaVersion: 0.1.0
id: "0004"
title: Build the interface on MUI as the primary component library
status: accepted
date: 2025-10-05
created: 2026-08-09
deciders: ["@mbeacom"]
tags: [architecture, ui, styling, accessibility]
scope: org
reversibility: one-way-door
blastRadius: org
affects:
  - type: path
    pattern: "lib/theme.ts"
  - type: path
    pattern: "components/**"
  - type: path
    pattern: "tailwind.config.ts"
  - type: path
    pattern: "app/**/*.tsx"
    note: Route-level UI, including the Tailwind-scoped marketing and docs trees.
provenance:
  authoredBy: agent-drafted
  ratifiedBy: "@mbeacom"
  sourceArtifact: CLAUDE.md
review:
  tier: async
  tierReason: >-
    One-way door, so the auto fast path is not available. Backfilled from an
    existing convention already embodied in the component tree.
reviewBy: 2027-08-09
---

# ADR-0004: Build the interface on MUI as the primary component library

## Context

OpenLeague is built and maintained by one person for a non-technical audience —
team managers and parents — who use it primarily on phones, often at a rink.
Two consequences follow.

First, the UI surface is broad relative to the maintenance capacity: rosters,
calendars, event forms, RSVP flows, season scheduling, placement boards, a
drawing-based practice planner, venue schematics, and an admin area. Hand-built
primitives across that surface would mean hand-building — and then maintaining —
accessible dialogs, menus, date pickers, and data tables.

Second, accessibility and touch ergonomics are baseline requirements, not
polish. Focus management, keyboard navigation, ARIA wiring, and 44px minimum
touch targets have to hold everywhere, including screens nobody revisits after
they ship.

## Decision

We will build the application interface on MUI v7 with Emotion, and treat it as
the primary component library: layout uses `Box`, `Stack`, and `Grid`; text uses
`Typography`; component-level styling uses the `sx` prop; responsive behaviour
uses the theme's breakpoints rather than ad-hoc media queries.

Design tokens live in one place — `lib/theme.ts` defines the "Digital Playbook"
palette, typography, custom variants, and component defaults. Components
reference semantic tokens (`primary.main`, `background.paper`, `error.main`)
rather than hex values, so a palette change is one edit.

Tailwind is retained, but deliberately scoped. Its `content` globs cover only
`app/(marketing)/**`, `components/features/marketing/**`, and `app/docs/**`,
where the work is static promotional layout rather than interactive application
UI. It is a utility layer for those surfaces, not a second way to style the app.

## Options considered

### Option A: MUI as primary, Tailwind scoped to marketing and docs (chosen)

| Dimension | Assessment |
|---|---|
| Accessible primitives | Comprehensive out of the box — dialogs, menus, pickers, tables |
| Theming | Centralized; one file governs the design system |
| Mobile ergonomics | Breakpoints and touch sizing built in |
| Bundle size | Largest of the options considered |
| Runtime cost | Emotion is runtime CSS-in-JS; adds work on the client |
| Visual distinctiveness | Requires deliberate theming to not look like stock Material |

### Option B: Tailwind everywhere, with headless primitives (Radix, Headless UI)

**Pros:** far smaller runtime; no CSS-in-JS cost; complete visual freedom;
excellent with React Server Components since there is no client-side style
runtime.
**Cons:** headless libraries supply behaviour, not components — every dialog,
menu, date picker, and data table is still assembled and maintained here. For a
solo maintainer with this much surface area, that is the dominant cost, and it
recurs on every screen. Rejected on maintenance capacity, not on technical
merit; this is the strongest alternative.

### Option C: shadcn/ui (Radix + Tailwind, vendored into the repo)

**Pros:** the ergonomics of a component library with full source ownership; no
upstream version to fight.
**Cons:** vendored components become code this project maintains, including
their accessibility fixes. It moves the maintenance burden rather than removing
it. It was also not the established default at bootstrap time.

### Option D: Both MUI and Tailwind used freely across the app

**Pros:** each screen uses whichever is convenient.
**Cons:** two sources of truth for spacing, colour, and breakpoints, which drift
immediately and silently. The scoped `content` globs exist specifically to make
this configuration-enforced rather than a matter of discipline.

## Trade-offs

- **Bundle size and runtime styling cost.** MUI plus Emotion is the heaviest
  option evaluated, and it runs on the client. For a mobile-first app used on
  rink wifi, this is a genuine cost paid on every page.
- **Client Components are pushed wider than ideal.** MUI's interactive
  components require `'use client'`, so 157 of the 292 `.tsx` files under
  `app/` and `components/` open with the directive (counted as a leading
  directive, not a substring match — one file contains the string only in a
  comment explaining that it deliberately has none). Some of that is inherent
  to the features, but MUI raises the floor and limits how much of the tree can
  stay a Server Component.
- **Escaping Material's visual defaults takes deliberate work.** The 497-line
  theme is what that work looks like.
- **This is effectively a one-way door.** MUI's layout and styling idioms are
  present across the component tree; replacing it is a UI rewrite.

## Consequences

- **Easier:** new screens compose existing accessible primitives; the design
  system changes in one file; responsive and touch behaviour is consistent
  without per-screen effort.
- **Harder:** shrinking the client bundle; expanding Server Component coverage;
  changing component libraries.
- **How we would know this was wrong:** if mobile performance on the primary
  flows — dashboard, roster, calendar — degrades to the point that bundle size
  is the binding constraint, the runtime cost has outgrown the maintenance
  saving. Equally, if Tailwind usage starts appearing outside its configured
  globs, the boundary is not holding and either the scope or the decision needs
  to change.
- **Revisit if:** MUI's React Server Component story stalls while the app's
  interactivity needs shrink, or the project gains enough contributors that
  maintaining headless primitives becomes affordable.

## Action items

1. [x] `lib/theme.ts` is the single source of design tokens
2. [x] Tailwind `content` globs confine utilities to marketing and docs
3. [ ] Track client-bundle size for the dashboard route in CI
