---
schemaVersion: 0.2.0
id: "0025"
title: "Store a signed-in coach's rankings documents privately on the hosted app"
status: proposed
date: 2026-10-07
deciders: ["@mbeacom"]
tags: [rankings, privacy, interchange, local-first, hosted]
scope: component
reversibility: two-way-door
blastRadius: component
relatesTo: ["0002", "0003", "0008", "0020", "0021", "0022", "0024"]
affects:
  - type: path
    pattern: "lib/actions/rankings.ts"
    note: The owner-scoped server actions that list, create, read, save, clear and delete rankings records.
  - type: path
    pattern: "prisma/schema.prisma"
    note: The RankingsRecord model (owner, title, document JSON).
  - type: path
    pattern: "prisma/migrations/20261007170000_rankings_records/**"
    note: The additive migration for rankings_records.
  - type: path
    pattern: "app/**/rankings/**"
    note: The hosted rankings pages (list, view, import, setup, what-if, team).
  - type: path
    pattern: "components/features/rankings/**"
    note: The hosted list and the binding of the shared screens to one record.
  - type: path
    pattern: "apps/planner/src/screens/rankings/**"
    note: The shared rankings screens, their platform seam, TeamMark and the team details dialog.
  - type: path
    pattern: "lib/rankings-document/**"
    note: The portable document, now with optional team logos and a 3 MB file cap.
  - type: path
    pattern: "lib/utils/canvas/logo-file.ts"
    note: The browser logo normalizer, parameterized for the rankings document's smaller bounds.
  - type: path
    pattern: "next.config.ts"
    note: The server action body limit, raised so a full rankings document can be saved.
provenance:
  authoredBy: agent-drafted
  sourceArtifact: docs/superpowers/specs/2026-10-07-hosted-rankings-and-team-logos-design.md
review:
  tier: async
  tierReason: Adds the first user-owned (not team- or league-owned) document store on hosted and amends ADR-0021; sole maintainer reviews.
reviewBy: 2027-04-07
---

# ADR-0025: Store a signed-in coach's rankings documents privately on the hosted app

## Context

ADR-0021 put placement rankings only in the static app, computed on the
device from pages the coach pastes. It kept them off the hosted platform for
two reasons: FR-026 (the season scheduling spec) withholds scores and
standings below the score-recording age, and an account seemed too much for a
one-coach task.

Coaches who already use the hosted app (openl.app) look for the tool there and
can't find it. They also want their rankings on more than one device without
moving files by hand, and they want to recognise opponents at a glance, which
means logos for teams that aren't theirs. ADR-0024 already fetches a league
page for a signed-in user, then hands the result to the static app, because
hosted had nowhere to keep it.

The question is whether hosted may store a coach's rankings at all, whose they
are, how that squares with FR-026, and how to avoid a second copy of the
screens and format.

## Decision

We will let a signed-in user keep their own rankings documents on the hosted
app, private to them, in the same portable format and through the same
screens as the static app.

- **Owner, not team.** A `RankingsRecord` belongs to one user (`ownerId`,
  cascade on account deletion). It holds the whole `openleague.rankings` v1
  document as JSON, a denormalized title, and nothing else. At most 20 per
  user. Every action requires sign-in and scopes every query by the session's
  user; another user's record reads as not found. There is no team, league,
  share or public read path.
- **One format, one parser.** Every write runs `parseRankings` after a size
  check against `MAX_RANKINGS_FILE_BYTES`; every read parses again. Import
  reads a bare or enveloped rankings file (ADR-0022) with the static app's own
  reader, and export writes the same file, so a document moves between the two
  apps unchanged.
- **One set of screens.** The static app's rankings screens read their store
  (`RankingsOps`) and platform (routes, navigation, the Update results panel's
  second action) through a seam. The static app's own platform is the default;
  hosted supplies path routes under `/rankings/<id>` and a store made of the
  record's server actions. This is the reverse of ADR-0020's usual direction
  (hosted imports from `apps/planner`), which is safe because the screens stay
  portable under ADR-0020's lint rule.
- **FR-026 amendment.** FR-026 governs results the platform publishes for a
  league: placement views, standings and scores shown to its members. A hosted
  rankings document is not that. It is one user's private calculation from
  public pages they chose, readable only by them, and never written into league,
  season, division, team or placement models. So hosted shows the owner every
  result in their own document, at any age, exactly as the static app does,
  and the following stay forbidden: sharing a rankings record, making it
  public, showing it to league or team roles, or feeding it into league
  placement. Any of those would be league publication and FR-026 would apply.
- **Team logos travel in the document.** A team entry may carry an optional
  `logo`: a PNG data URL within 128×128 and 12 KB, with all logos in one
  document together at most 600 KB. This field is additive under v1, and older
  readers strip it. Both apps store logos this way. Hosted does not put them in
  Vercel Blob, because the file must stay self-contained and the opponents
  aren't entities the user owns. The file cap rises from 2 MB to 3 MB, and the
  server action body limit from the 1 MB default to 4 MB, so the largest file
  either app writes can be saved on hosted.
- **Fetch on hosted (phase 2).** On hosted, "Fetch it for me" becomes a direct
  action under ADR-0024's guard and rate limit. It returns the parsed schedule
  to the page for the usual preview, and only the coach's Save writes it into
  their record. The ADR-0024 fragment handoff stays for the static app.

## Options considered

### Option A: Private per-user records, shared format and screens (chosen)

| Dimension | Assessment |
|---|---|
| Discoverability | In the hosted sidebar, the mobile menu and the dashboard |
| Privacy | Owner-only; no path to league publication |
| Divergence | None in format or calculation; screens shared through a seam |
| Cost | One table, six actions, a context; a larger action body limit |

### Option B: Per-team records

**Pros:** a team's admins would see the same rankings.
**Cons:** sharing among a team's admins is publication, which brings FR-026
into play below the threshold. A coach may also follow divisions their team
isn't in, and the static app has no team to map to. Rejected for phase 1. A
deliberate share feature would need its own decision.

### Option C: Keep rankings static-only (ADR-0021 as written)

**Pros:** no stored third-party results on the platform at all.
**Cons:** the coaches already on hosted don't find the tool, and their work
stays on one browser. Rejected.

### Option D: Logos in Vercel Blob on hosted

**Pros:** reuses the Crest logo storage, and documents stay small.
**Cons:** an export would have to fetch and inline each logo, and an import
would have to upload them. The ownership check (`entityLogoPrefix`) has no
entity for an opponent. Deleting a record would orphan blobs. Rejected; the
shared rule (`lib/media/logo-rules`, the browser normalizer, `isPngLogo`) is
what's reused instead.

## Trade-offs

- Hosted now stores results computed from third-party pages. They are the
  user's own data, as if they had uploaded a spreadsheet, but deleting the
  account must delete them (it does, by cascade).
- A 4 MB server action body limit applies to every action, not only these.
  Each action still validates its own input, and the rankings actions check
  the document's size before parsing it.
- Logos inside the document make every save resend them. They are capped
  small for that reason.
- Hosted pages use plain links inside the shared screens, so moving between
  rankings screens reloads the page. That is acceptable for phase 1.

## Consequences

- Easier: a coach finds rankings on hosted, keeps several documents, and opens
  the same file on either app; opponents are recognisable by their logos.
- Harder: the document schema now has two storage back ends, so a v2 needs a
  migration path for stored JSON as well as for files.
- **How we would know this was wrong:** a request to share rankings with a
  team or league (that is publication, and needs its own decision under
  FR-026); stored documents routinely nearing the 3 MB cap; or logo budgets
  that coaches hit in normal use.
- Revisit if: a league wants to publish ratings through the platform, or the
  static app gains a sync connector (ADR-0022) that makes hosted storage
  redundant.

## Action items

1. [x] Phase 1: list, view, import, edit, save, export and team logos on hosted; logos on static.
2. [ ] Phase 2: direct "Fetch it for me" on hosted, merging after the preview.
3. [ ] Phase 3: copy a rankings document between hosted and the static app in one step.
