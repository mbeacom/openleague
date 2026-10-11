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
    note: The robots.txt check and per-host spacing for directory page fetches.
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
  - The document holds an organization, its programs, seasons, levels and teams. Each has a UUID that survives re-import.
  - Each entry keeps external references (source URL, host, and the source's own id), colors, a small PNG logo (stored once per program and overridden per team), and home rink names.
  - There are no people of any kind and never a roster.
  - The bare file is at most 2 MB.
  - It follows ADR-0020's parsing rules and is registered in ADR-0022's envelope.
- **Optional.** The planner, "Your team" and rankings keep working with no directory. A one-team directory is a first-class case.
- **Rankings per level.**
  - A rankings document may reference a directory level, and its teams may reference directory team ids.
  - The team number stays the rankings key.
  - A level carries an optional rating method (`composite`, `srs`, `walkush`, `none` or `unknown`) drawn from what `lib/ratings` implements.
  - A rankings document's own method is the coach's override.
- **Estimates.**
  - Every computed rating is labelled an estimate.
  - It is labelled an "unverified estimate" until its method has been backtested against a past season with published final placements.
  - The stored validation result records matched placements and the mean absolute rank difference.
- **Import.**
  - Import reuses the existing parsers, plus new division, team and published-placement readers.
  - Re-import matches by source id, then by team number within a level, then by normalized name. A name-only or contradictory match goes to a review step.
  - Imports are user-initiated only.
  - Hosted directory fetches reuse ADR-0024's guard unchanged, one page per call. They add a fail-closed `robots.txt` check and per-host spacing from `Crawl-delay`.
- **Hosted.**
  - A user's imported directory is a private, owner-only record (as in ADR-0025).
  - Public listings live in separate tables, never as `Team` rows. Only an operator or a claimed association creates them, and only for an allowlisted host.
  - A listing shows only what the source publishes, with attribution. FR-026 still hides results below the score-recording age.
  - A claim is approved by the association's administration, or by verification while no administration exists. Approval links or creates a `Team` and grants `TEAM_MANAGER` at `TEAM` scope (or `ASSOCIATION_ADMIN` for an organization claim).
- **Storage.**
  - Connectors save the directory like any other kind.
  - In a shared provider folder, the directory is the team folder's manifest that rankings and plans reference by id.

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
- Honoring `robots.txt` for directory fetches means using division and team
  pages, never schedule paths that a site disallows. This sits awkwardly
  beside ADR-0024's existing schedule fetch, which the design flags for the
  owner rather than changing.
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

1. [ ] Owner answers the spec's open questions (robots and the existing schedule fetch, opt-out channel, FR-026 for relayed results, logo fetching, claim verification, validation bar).
2. [ ] Phase 0: estimate labels on existing rankings screens and exports.
3. [ ] Phase 1: `lib/team-directory/document.ts` and the envelope registry entry.
