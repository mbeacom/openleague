---
schemaVersion: 0.1.0
id: "0021"
title: "Compute placement ratings client-side from public results"
status: proposed
date: 2026-10-07
created: 2026-10-07
deciders: ["@mbeacom"]
tags: [rankings, static-site, local-first, interchange]
scope: component
reversibility: two-way-door
blastRadius: component
relatesTo: ["0008", "0010", "0020"]
affects:
  - type: path
    pattern: "lib/ratings/**"
    note: The placement-rating calculation and the pasted-page parsers.
  - type: path
    pattern: "lib/rankings-document/**"
    note: The portable openleague.rankings document, its parser and merge.
  - type: path
    pattern: "apps/planner/src/screens/rankings/**"
    note: The static app's rankings screens.
  - type: path
    pattern: "apps/planner/src/store/rankings.ts"
    note: Device-local storage of the rankings document.
provenance:
  authoredBy: agent-drafted
  sourceArtifact: docs/superpowers/specs/2026-10-07-static-rankings-design.md
review:
  tier: async
  tierReason: Adds a second portable document type to the static deployable; sole maintainer reviews.
reviewBy: 2027-04-07
---

# ADR-0021: Compute placement ratings client-side from public results

## Context

Youth hockey leagues place teams into divisions after a pre-season. They use
ratings built from published game results; CSHL calls its rating "RPI" and
publishes the results but not the full method. Coaches want to see where their
team stands, why, and what a remaining game could change. Leagues need a
transparent, reproducible replacement for spreadsheet ratings.

The hosted platform deliberately withholds win/loss records below the
score-recording age (FR-026, `lib/actions/placements.ts`). 8U, where this need
is sharpest, is below that threshold. League sites are third-party pages whose
structure changes and whose terms may not allow automated collection.

## Decision

We will compute placement ratings entirely on the user's device in the static
app (ADR-0020's deployable). Data comes only from text or files the user pastes
or chooses. We will exchange the data as a portable, versioned
`openleague.rankings` document that follows ADR-0020's conventions (format
discriminant, strict parser, newer-version refusal).

- The calculation (`lib/ratings`) is pure and parameterised by a `RatingMethod`. League rules are presets, never hard-coded.
- The app makes no network request to league or third-party sites.
- Placement ratings for ages below the score-recording threshold stay off the hosted platform.

## Consequences

- Coaches get the tool with no account, and nothing about their league leaves the device unless they export it.
- Import depends on the shape of pasted page text, so parser drift is fixed in code, not by a server.
- A second document type now exists, so a shared storage connector (Drive/OneDrive) can be designed against two real consumers.

## Alternatives considered

- **Hosted league feature.** Rejected for now: it conflicts with FR-026 for sub-threshold ages, and it would require accounts for a one-coach task.
- **Fetching or scraping league pages.** Rejected: browsers block cross-origin reads, page structure changes, and site terms may forbid it.
- **Hard-coding CSHL's formula.** Rejected: other leagues differ, and CSHL's Walkush component is unpublished, so it is approximated and labelled.

## What would make this wrong

- A league publishes a machine-readable results API with permissive terms. Fetching would then be better than pasting.
- FR-026 changes for placement contexts, or a league asks to publish ratings through the hosted platform.
