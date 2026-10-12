---
schemaVersion: 0.2.0
id: "0026"
title: "Model imported teams as a portable directory document, unclaimed until a grant claims them"
status: proposed
date: 2026-10-11
deciders: ["@mbeacom"]
tags: [static-site, local-first, interchange, rankings, privacy, hosted, authorization]
scope: component
reversibility: two-way-door
blastRadius: component
relatesTo: ["0009", "0011", "0014", "0020", "0021", "0022", "0023", "0024", "0025"]
affects:
  - type: path
    pattern: "lib/team-directory/**"
    note: The openleague.team-directory document, its merge, rating-method mapping, validation metrics and pull handoff.
  - type: path
    pattern: "lib/document-envelope/kinds.ts"
    note: Registers the new kind in the envelope.
  - type: path
    pattern: "lib/ratings/import/**"
    note: New division, team and published-placement page readers beside the existing parsers.
  - type: path
    pattern: "lib/rankings-document/document.ts"
    note: Optional, additive directory and directoryTeamId references on a rankings document.
  - type: path
    pattern: "lib/league-fetch/**"
    note: The robots.txt check and per-host spacing for directory page fetches (the same check is applied to the existing schedule fetch in a separate change).
  - type: path
    pattern: "lib/actions/directory-*.ts"
    note: Hosted directory fetch, private records, public listings and claims.
  - type: path
    pattern: "apps/planner/src/store/directories.ts"
    note: The static directories store (IndexedDB version 7).
  - type: path
    pattern: "apps/planner/src/store/my-teams.ts"
    note: The device-level "my teams" record, never written into a directory.
  - type: path
    pattern: "apps/planner/src/screens/directory/**"
    note: Directory browse, team, opponent picker and import screens.
  - type: path
    pattern: "types/practice-planner.ts"
    note: The optional directoryRef on TeamProfile.
  - type: path
    pattern: "prisma/schema.prisma"
    note: The proposed DirectoryRecord and Directory* listing models, kept separate from Team.
provenance:
  authoredBy: agent-drafted
  sourceArtifact: docs/superpowers/specs/2026-10-11-team-directory-import-design.md
review:
  tier: async
  tierReason: Adds a third portable document kind and the first public pages built from third-party data; sole maintainer reviews.
reviewBy: 2027-04-11
---

# ADR-0026: Model imported teams as a portable directory document, unclaimed until a grant claims them

## Context

Coaches retype the same team facts in "Your team" and in every rankings
document. Public league schedule sites already list every team by season and
level, with stable ids in their URLs. The hosted app can fetch an allowlisted
page on a user's tap (ADR-0024), and the static app can parse pasted pages
(ADR-0021). The envelope (ADR-0022) can carry new kinds. Nothing yet gives a
team an identity that outlives one rankings document, and nothing says how
other people's teams may appear on hosted without becoming `Team` rows that
nobody operates.

The forces:
- the data is public but belongs to third parties;
- the people behind it include minors;
- some levels publish no official ratings;
- source sites set `robots.txt` rules and terms;
- hosted authority must stay inside ADR-0009 grants.

## Decision

We will add a portable `openleague.team-directory` v1 document and treat its
teams as unclaimed listings until an ADR-0009 grant claims them.

- **Document.**
  - The document carries its own top-level UUID, so a bare file has a stable identity; when wrapped, the envelope id must equal it. It holds an organization, its programs, seasons, levels and teams, each with a UUID that survives re-import.
  - Each entry keeps external references (source URL and the source's own id; the host is derived from the URL, never supplied), colors, a small PNG logo (stored once per program and overridden per team), home rink names, and `handSet`: which of those fields a person set rather than a source.
  - There are no people of any kind and never a roster.
  - The bare file is at most 2 MB.
  - It follows ADR-0020's parsing rules and is registered in ADR-0022's envelope.
- **Optional.** The planner, "Your team" and rankings keep working with no directory. A one-team directory is a first-class case.
- **Rankings per level.**
  - A rankings document may reference a directory level, and its teams may reference directory team ids.
  - The team number stays the rankings key.
  - A level carries an optional rating method: `composite` (a complete `RatingMethod`, the only method a rankings document accepts today), `none` or `unknown`. Standalone `srs` or `walkush` per level would need a method union in the rankings document and dispatch in its screens first, and is not part of v1.
  - A rankings document's own method is the coach's override.
- **Estimates.**
  - Every computed rating is labelled an estimate.
  - It is labelled an "unverified estimate" until its method has been backtested against a past season with published final placements.
  - The level keeps a short history of validation results, one per season, each recording matched placements, the mean absolute rank difference and the team with the largest miss.
- **Import.**
  - Import reuses the existing parsers, plus new division, team and published-placement readers.
  - Re-import matches by source id (derived host and ref), then by team number within a level, then by normalized name. A name-only or contradictory match goes to a review step. An import never overwrites a hand-set field, and a page without dates is placed only in the season the coach selects.
  - Imports are user-initiated only.
  - Hosted directory fetches reuse ADR-0024's guard unchanged, one page per call. They add a fail-closed `robots.txt` check and per-host spacing from `Crawl-delay`.
  - The owner has ruled that OpenLeague does not break source sites' rules: every hosted "Fetch it for me", the existing schedule fetch included, honors `robots.txt` and fails closed. Paste or a saved page is the fallback, and a per-host written-permission allowlist is the only override. The schedule-fetch change ships in a separate pull request.
- **Hosted.**
  - A user's imported directory is a private, owner-only record (as in ADR-0025).
  - Public listings live in separate tables, never as `Team` rows. Only an operator or a claimed association creates them, and only for an allowlisted host.
  - A listing shows only source-published, non-hand-set fields, with attribution: names, levels, numbers and colors. v1 listings show no schedules or results, because a directory stores no games; adding them needs its own ingestion design under FR-026.
  - An organization claim is the only bootstrap. After verification, it creates a `League` through the existing creation path with the claimant as its administration (or links a League whose administration confirms). The verifying operator mints no grant, so ADR-0009 point 6 holds.
  - A team claim is approved only by that association's administration, which grants `TEAM_MANAGER` at `TEAM` scope through the existing grant action. Under an unclaimed organization there is no `leagueId` for a grant, so a team claim stays pending until the organization is claimed.
- **Storage.**
  - Connectors save the directory like any other kind.
  - In a shared provider folder, the directory is the team folder's manifest. Rankings reference it by id and are grouped under it. Practice plans carry no directory reference, so they are listed beside it, not grouped.

## Options considered

### Option A: Directory document plus unclaimed listings (chosen)

| Dimension | Assessment |
|---|---|
| Reuse | Existing parsers, guard, envelope, connectors and grant model |
| Privacy | No people in the schema; computed ratings stay private |
| Authority | Listings have no members; only grants confer control |
| Portability | Same file on static and hosted, through one parser |
| Cost | A third kind, new listing tables, and a claim flow to build |

### Option B: Extend the rankings document's team list instead

**Pros:** no new kind, and teams are already there.
**Cons:** a rankings document covers one level for one coach. Organization,
program and season structure would bloat it, and one directory couldn't serve
many rankings documents, "Your team" and hosted pages.

### Option C: Create hosted `Team` rows for imported teams

**Pros:** the existing public team pages work at once.
**Cons:** memberless Team rows enter every team query and permission check,
invite edits by people with no authority, and blur "operated by OpenLeague
users" with "listed from a public site". Rejected.

### Option D: Do nothing

Coaches keep retyping teams per document. Hosted program pages show only
teams created by hand.

## Trade-offs

- A third portable kind to version and test, and a new IndexedDB version.
- Public listings of third-party data need an opt-out process and a
  verification process before claims can be approved without an association
  admin.
- Honoring `robots.txt` means using division and team pages, never paths a
  site disallows. Applied to ADR-0024's existing schedule fetch as well, it
  means some sites' schedules can only be pasted or opened from a saved page
  until their operator gives written permission.
- Validation needs a past season's published placements, which some leagues
  don't publish. Those levels stay "unverified" indefinitely.

## Consequences

- Easier:
  - names, colors and logos follow a team across rankings, "Your team" and seasons;
  - hosted can list a whole organization without owning it;
  - a shared folder has a manifest.
- Harder:
  - three systems now name teams (directory listings, rankings numbers and hosted Team rows), joined by ids that must stay stable;
  - claim and opt-out handling is ongoing operational work.
- **How we would know this was wrong:**
  - re-imports regularly produce more review items than automatic matches;
  - leagues ask to be unlisted more often than programs claim listings;
  - no coach uses a directory with rankings within two seasons of shipping.
- Revisit if:
  - a league offers a machine-readable team feed;
  - FR-026 changes;
  - a portable roster kind is proposed.

## Action items

1. [x] Owner ruled on robots and the existing schedule fetch: honor `robots.txt`, fail closed, paste/upload fallback, written-permission allowlist as the only override (implemented in a separate pull request).
2. [ ] Owner answers the remaining open questions (opt-out channel, logo fetching, claim verification, source terms, validation bar, public listings in v1).
3. [ ] Phase 0: estimate labels on existing rankings screens and exports.
4. [ ] Phase 1: `lib/team-directory/document.ts` and the envelope registry entry.
