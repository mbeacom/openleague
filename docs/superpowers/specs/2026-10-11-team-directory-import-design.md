# Team Directory Import (Static and Hosted) — Design

**Date:** 2026-10-11
**Status:** Proposed (design for owner review); no implementation yet
**Applies to:** the static, local-first app in `apps/planner/` (openleague.dev/planner/), the portable document modules in `lib/`, and the hosted app's program (association) pages.
**Depends on:** ADR-0009 (scoped role grants), ADR-0011 (capability links are bearer credentials), ADR-0014 (public reads go through a column whitelist), ADR-0020 (portable versioned documents, the static app), ADR-0021 (client-side placement ratings), ADR-0022 (document envelope and storage connectors), ADR-0023 (no OpenLeague relay for coach-supplied providers), ADR-0024 (allowlisted server-side league page fetch), ADR-0025 (private hosted rankings documents).
**Proposes:** ADR-0026.

## Context

Coaches keep typing the same facts into OpenLeague: their team's name, colors and logo in "Your team", and every opponent's number, name and logo in each rankings document. A youth league's public schedule site already lists every team, grouped by age level, with a stable page per team. This design turns that public list into a reusable **team directory**: one portable document that names the organization, its seasons, its levels and its teams, with stable ids. The planner, rankings, and the hosted program pages all read from it.

What exists (verified in the code):

- **Page parsers, pure and shared by both apps** (`lib/ratings/import/`):
  - `parseSchedule` (`schedule.ts:248`) returns `{ games, teams, unparsed }` (`schedule.ts:28-32`). Each team is a 3-digit number and a display name, matched by `TEAM = /^(\d{3})\s+(\S.*)$/` (`schedule.ts:39`). Each game carries date, time, home, away, goals and a rink name (`schedule.ts:18-26`). The parser knows nothing about levels, external ids or team page URLs.
  - `parseSnakeChart` (`snake-chart.ts`) reads one table per age division (`SnakeDivision`, `snake-chart.ts:17-24`). It reads a "Program" header row with a colour per column (`snake-chart.ts:115-129`) and each team cell's `title` attribute as the team's name (`snake-chart.ts:79-80`). Starting brackets come out as "<colour> <strength>" labels.
  - `htmlToText` and `decodeEntities` (`html.ts`) handle HTML without a DOM. `savedPageText` (`html.ts`) also reads a Safari web archive through the bounded `bplist.ts` reader.
- **The rankings document** (`lib/rankings-document/document.ts`): `openleague.rankings` v1. A team is `{ number, name, startingBracket, excluded, logo? }` (`:90-96`), keyed by `number` (the static rankings spec R3; `:49` allows 1-8 letters or digits). Other limits: at most 400 teams (`:20`); a 3 MB file (`:19`); logos are PNG data URLs within 128 px and 12 KB, 600 KB in all (`:76-83`). `myTeam` is a single team number (`:176`). `sources` keeps only page addresses and read times, never content (`:139-158`; `sources.ts:24`). `withTeamLogo` enforces the logo budgets (`team-logos.ts:38-54`).
- **Re-import merge** (`merge.ts:85-144`). Games match on date, the unordered pair of teams, then time. A score that disagrees becomes a `GameConflict`. New team numbers are appended, and a known number keeps its saved name (`merge.ts:131-143`). There is no rename detection, and there is no identity beyond the number.
- **Hosted "Fetch it for me"** (ADR-0024). `lib/league-fetch/guard.ts:1-19` documents the controls:
  - https and port 443 only, against an exact host allowlist (`DEFAULT_ALLOWED_HOSTS`, `:25`, overridable by `LEAGUE_FETCH_ALLOWED_HOSTS`);
  - at most 3 redirects, same host only (`:31`), with every resolved address checked to be public;
  - one total deadline, 60 s by default and clamped to 5-90 s (`:27-29`; `config.ts:20-26`);
  - a 2 MB streamed cap (`:30`), `text/html` only, and a fixed User-Agent (`:24`).

  `lib/actions/league-fetch.ts` requires sign-in (`:68`) and rate-limits through the durable limiter, fail-closed (`:79`; 10 per user per hour, `lib/utils/durable-rate-limit.ts:65`). It parses on the server (`:85`) and hands the result to the static app in a `#/rankings/import?pull=` fragment (`config.ts:9`). The fragment carries a versioned, deflated `openleague.schedule-pull` payload with hard caps (`lib/rankings-document/pull.ts:15-28`). Nothing is stored.
- **The envelope** (`lib/document-envelope/`): `{ format: "openleague.document", envelope: 1, kind, version, id, updatedAt, generator, payload }` (`envelope.ts:14-41`). The kinds registry (`kinds.ts:25-28`, `:62-84`) holds exactly two kinds: `openleague.practice-plan` and `openleague.rankings`. An unknown kind gets "needs a newer version" (storage connectors spec R2).
- **Static "Your team"**: `TeamProfile { name, logo, primaryColor, secondaryColor }` (`types/practice-planner.ts:160-165`). It is one device-level record under `META_TEAM_PROFILE` (`apps/planner/src/store/team-profile.ts`; `records.ts:118`). Its logo allows 512 px and 200 KB (`lib/media/logo-rules.ts:23,27`). Plan files never carry it (`YourTeam.tsx:32`). Rankings are also one device-level document under `META_RANKINGS` (`apps/planner/src/store/rankings.ts`; `records.ts:120`). The IndexedDB schema is at `DB_VERSION = 6` (`idb-repo.ts:24`). Every upgrade so far has been additive (`idb-repo.ts:41-73`).
- **Hosted organization model** (`prisma/schema.prisma`):
  - An association is a `League` (`:605`) with a unique `slug`, a public profile, brand colors and `profileStatus`.
  - `Division` (`:690`) has `ageGroup` and `skillLevel`, and belongs to one league.
  - `Team` (`:211`) has a per-association `slug`, `logoUrl`, brand colors, `profileStatus`, an optional `leagueId` and `divisionId`, and many member, player and event relations. A Team row is an operating team with members, not a listing.
  - Delegated authority is `AssociationRoleGrant` (`:3607`): one role (`:3575`, including `ASSOCIATION_ADMIN`, `TEAM_MANAGER` and `COACH`) at exactly one scope (`:3590`), and only association administration may delegate (ADR-0009, point 6).
  - Public program pages exist already: `/associations/[slug]` and `/associations/[slug]/teams` list published teams through `resolvePublicAssociation` and `getPublicAssociationTeams` (`lib/actions/association-profile.ts:376,412`).
- **Storage connectors spec** (2026-10-07). IndexedDB is the working copy and connectors are remotes (R3). Rankings move from one `meta` key to a store keyed by id (R3). Sharing goes through the provider, and the provider's permissions are the whole permission model (R8). "Folders and organisation inside the app" is out of scope there. No "team folder" is defined yet. This design supplies one (R12).

What a public league schedule site of the kind this targets looks like. A CrossBar-hosted league site was inspected once, by hand, and none of its content is kept in the repository:

- **Stable numeric ids in its URLs**: `/team/<id>` for a team, `/division/<id>` for a level, and `/club/<slug>/<id>` for a program (a club that fields several teams).
- **Standings tables** on each division page, linking every team in the level.
- **A logo per team and per club**, served from a different storage host.
- **A team contact directory page** with adults' contact details.
- **A `robots.txt`** that disallows the site's `/schedule` path for every user agent and sets `Crawl-delay: 5`.

The last two facts drive rulings R2 and R6.

## Goal

A coach can build a directory of their organization once: they paste or save the league's pages, or ask the hosted app to fetch them. They then browse it by season and level on a phone, mark their own teams, pick opponents, and have names, colors and logos flow into "Your team" and into rankings without retyping. A coach with one team never has to import a league. On hosted, the same directory can back public program pages that show what the source already publishes, with attribution. An entry becomes a real OpenLeague team only when someone with authority claims it.

### Success criteria

1. **One portable document.** `openleague.team-directory` v1 is a kind in the envelope registry. It is parsed by one pure parser shared by both apps, and saved, exported, shared and imported like plans and rankings.
2. **Optional, never required.** The planner, "Your team" and rankings work exactly as today with no directory. A one-team directory is a first-class case.
3. **Stable identity.** Every organization, season, level, program and team has a UUID that survives re-import. Re-import matches on the source's own id first, so a renamed team is the same team.
4. **No personal data of minors, ever.** The schema has no field that can hold a player, and the parsers drop people.
5. **User-initiated only.** No crawler, no schedule, no background refresh. Every fetch is one person's tap, rate-limited and robots-aware.
6. **Estimates are labelled.** Every computed rating or rank reads as an estimate, and a stronger "unverified estimate" when its method has not been validated against a past season.
7. **Mobile first.** Every directory screen works at 360 px wide with 44 px targets.

## Rulings

### R1. A new kind: `openleague.team-directory` v1

A bare document (wrapped in the envelope like any other kind):

```json
{
  "format": "openleague.team-directory",
  "version": 1,
  "organization": {
    "id": "7d0c2e2a-6a51-4f7e-9f0e-2b8f3d1a9c01",
    "name": "Example Youth Hockey League",
    "shortName": "EYHL",
    "sport": "HOCKEY",
    "colors": { "primary": "#0D47A1", "secondary": "#FFFFFF" },
    "logo": null,
    "source": { "url": "https://league.example.org/", "host": "league.example.org", "platform": "crossbar", "ref": null }
  },
  "programs": [
    {
      "id": "3e5b…",
      "name": "Riverside",
      "colors": { "primary": "#B71C1C", "secondary": null },
      "logo": { "dataUrl": "data:image/png;base64,…", "width": 96, "height": 96 },
      "homeRinks": ["Rink A"],
      "source": { "url": "https://league.example.org/club/riverside/400101", "ref": "400101" }
    }
  ],
  "seasons": [
    {
      "id": "a1f0…",
      "label": "2026-27",
      "startsOn": "2026-08-01",
      "levels": [
        {
          "id": "c9d2…",
          "name": "8U",
          "ageGroup": "8U",
          "order": 1,
          "ratingMethod": { "kind": "composite", "preset": "league-8u", "params": { "goalCap": 8, "walkushVariant": "plus-one", "lowConfidenceGames": 3 } },
          "validation": null,
          "source": { "url": "https://league.example.org/division/500201", "ref": "500201" }
        }
      ],
      "teams": [
        {
          "id": "f4a8…",
          "levelId": "c9d2…",
          "programId": "3e5b…",
          "number": "901",
          "name": "Riverside 8U Red",
          "colors": null,
          "logo": null,
          "homeRinks": [],
          "status": "active",
          "previousId": null,
          "sources": [{ "url": "https://league.example.org/team/600301", "host": "league.example.org", "ref": "600301" }]
        }
      ]
    }
  ],
  "importedFrom": [{ "url": "https://league.example.org/division/500201", "readAt": "2026-10-11T18:00:00.000Z" }]
}
```

- **Ids.** Every `id` is a UUID minted on first import and kept for life. Ids are unique within the document. A team id is per season: next season's "Riverside 8U Red" is a new entry that points back through `previousId`, because a season team is a different group of players.
- **External references.** A `source` (or a team's `sources[]`) records the page `url` (https, the same `sourceUrlProblem` rule as rankings, `document.ts:122-133`), its `host`, and the source's own id `ref` taken from the URL path. `platform` is a parser hint (`"crossbar"` or `"generic"`), never trusted for security. A team may have more than one source (a schedule host and a standings host, say), but at most one per host.
- **Colors** are `#RRGGBB` or null (the `isTeamColor` rule, `lib/utils/team-mark.ts:41`). A team with no colors inherits its program's, then the organization's. The Crest's derived hue is the last fallback.
- **Logos** are PNG data URLs within the rankings bounds (128 px, 12 KB, `TEAM_LOGO_BOUNDS`), so a logo moves between the two documents unchanged. A logo is stored **once per program**, and a team carries its own only to differ. One program logo serves a dozen teams, which is what keeps a whole league inside the cap.
- **Home rinks** are display names only (at most 5 per entry, 100 characters each). They are not linked to hosted `Venue` rows. A rink seen in a schedule is offered as a suggestion, and the user confirms it (R4).
- **`ratingMethod`** and **`validation`** are R9 and R10.
- **`status`** is `active` or `inactive`. A team that disappears from a re-import is marked inactive, never deleted, so rankings that reference it keep resolving.
- **Limits** (checked on every write, like `fitsRankingsFile`):

| Limit | Value |
|---|---|
| File (bare) | 2 MB, plus the envelope's 4 KB |
| Seasons | 6 |
| Levels per season | 40 |
| Teams per season | 600 |
| Programs | 300 |
| One logo | 128 px, 12 KB (rankings bounds) |
| All logos in one document | 900 KB |
| Text fields | name 100, short name 20, label 20, URL 2,000 |

- **Parsing** follows ADR-0020. The parser checks `format` first and refuses a newer integer `version` with its own message ("This directory was made by a newer version of OpenLeague"). It validates with Zod v4 and strips unknown keys, so additive fields need no bump. Its referential checks are: every `levelId` and `programId` resolves; team numbers are unique within a level; `previousId` points to an earlier season. The file name is `<slug>.directory.json`, and it may also be written as YAML, TOML or JSONC per the config-format exports spec.
- **Registry.** `kinds.ts` gains the entry (`maxBytes`, messages, `parse`). The kind is written wrapped only where every reader understands it, per storage connectors R2. Because the kind is new, the first release that writes it is also the first that reads it.

### R2. What a directory never holds

- **No people at all.** There are no players, rosters, jersey numbers, birth dates, guardians, coaches, managers, referees, emails or phone numbers, adult or minor. The schema has no field that could carry one, and there is no free-text "notes" field. The parsers ignore every person-shaped cell, and the import never follows a link to a contact directory page.
- **Rosters are never allowed in this kind.** A roster belongs to a claimed hosted Team (R8), with its existing consent and guardian model, or to the practice plan's own roster field (practice roster suggestions spec), which never leaves the device unless exported. A future need for a portable roster would be its own kind and its own ADR.
- **No page content.** As with rankings `sources`, the document keeps addresses, ids and read times, never fetched HTML.
- **Team names may contain a birth year** ("Riverside 2018 Blue"). That describes the team's age group, not a person, and is allowed.

### R3. Relationship to rankings: per level, shared ids

- **A rankings document covers one level.** It gains an optional, additive (v1) `directory: { id, seasonId, levelId }`. Each rankings team gains an optional `directoryTeamId`. The team number stays the rankings key (static rankings spec R3). The directory id is what lets names, colors and logos follow a team across documents and seasons.
- **Seeding.** "New rankings from directory level" creates a rankings document with that level's teams: number, name and `directoryTeamId`, with `excluded: false`. Its `method` is filled from the level's `ratingMethod` (R9).
- **Logos and names are read through, never forked silently.** When a rankings team has a `directoryTeamId` and no logo of its own, the screens draw the directory's logo. The rankings file still embeds that logo on export, so the file stays self-contained (hosted rankings spec R5). A name or logo edited in rankings stays local to that document unless the coach taps "Also update the directory".
- **No directory, no change.** A rankings document without `directory` behaves exactly as today. A merge from a schedule (`merge.ts:85`) still adds unknown numbers. If a directory is linked, it also offers to add them to the directory, through the R5 review.
- **Hosted rankings** (ADR-0025) carry the same fields and stay private to their owner. A directory reference never makes a rankings record visible to anyone else.

### R4. Import pipeline: the same parsers, new readers, one review step

The import accepts what the coach has:

1. **A schedule page** (paste, saved page, or fetched). `parseSchedule` gives team numbers, names and rinks. A rink a team uses most for its home games becomes a suggested home rink.
2. **A division or standings page** (new reader, `parseDivisionPage`). It reads the level's name, the source's level id, and each linked team's number, name and source id from the team link's path.
3. **A team page** (new reader, `parseTeamPage`). It reads the team's name, number, source id, its program link (name and source id), and the logo image's URL. It is used for one team at a time, such as "my team", never in bulk.
4. **A snake chart** (`parseSnakeChart`). Its divisions become levels, its "Program" columns become program names, and the cell `title` attributes become team names.

The new readers live beside the others in `lib/ratings/import/` (or a new `lib/team-directory/import/` that re-exports `htmlToText`). They are pure and DOM-free, and tested against fictional fixtures. Each one recognizes its page by structure, not by host. They report lines they could not use, as `parseSchedule` does, and never drop them silently.

**Logos are not fetched automatically in v1.** The team page reader records the logo's URL as a hint only (`logoHint`, never stored in the document). The image lives on another host, the static app's CSP blocks it (`img-src`), and fetching it on hosted would widen ADR-0024's guard to a second host. The coach adds a logo by upload, through the existing `normalizeLogoFile` pipeline. Whether hosted should later fetch logo images is open question 4.

**The preview.** Every import ends in the same preview the rankings import uses. It lists what will be added, renamed, moved between levels or marked inactive, and what needs a decision. Nothing is saved until the coach taps Save.

### R5. Re-import and merge: external id, then number, then name

Incoming teams are matched to existing ones within the same season, in this order:

1. **Source id**: same host and same `ref`. This is certain, even if the name and number changed.
2. **Team number within the level**: the rankings key (static rankings spec R3). This is certain when the existing entry has no source id for that host.
3. **Normalized name within the level**. The name is folded to lower case, with accents removed, punctuation and whitespace collapsed, and a leading team number dropped. A match here is a *proposal*, shown in the review, never applied silently.

Outcomes:

- **Exact match** (1 or 2): new facts are applied. A changed name, number, level or program is listed in the preview as "renamed" or "moved". Fields the user set by hand (colors, logo, home rinks) are never overwritten by an import.
- **Ambiguous**: two candidates, or a name-only match, or a number that now points at a team with a different source id. These go to **Needs review**, where the coach chooses "same team", "new team" or "skip". The rest of the import saves without waiting.
- **Missing**: an existing team that is absent from an import covering its whole level is marked `inactive`. A team-page import, which covers one team, never marks others inactive.
- **New season**: a page whose dates fall in a season the directory doesn't have creates that season. Teams that match a previous-season team by source id (or number plus program) get `previousId` and inherit hand-set colors, logo and home rinks.
- **Conflicts are only about structure.** A directory holds no scores, so there is nothing like `GameConflict`. Game merges remain the rankings document's job.

### R6. User-initiated only; robots, terms and rate limits

- **No crawling, no schedule.** There is no cron, no background refresh, no link-following beyond what one import names, and no "check for updates" timer. A directory says "as of <readAt>". Refreshing it is a tap.
- **Static path.** The static app still never requests a league site (ADR-0021, ADR-0024). It reads pasted text and saved pages. "Fetch it for me" opens the hosted confirm page, as today.
- **Hosted path.** A new action, `fetchDirectoryPage`, reuses `lib/league-fetch/guard.ts` unchanged: allowlist, https/443, same-host redirects, public addresses, the 60 s deadline, 2 MB, `text/html`, the fixed User-Agent, and no cookies. It fetches **one page per call**. A multi-level import is a sequence of taps (or one tap per level in a checklist), never a server-side loop.
- **Robots.** `fetchDirectoryPage` reads the host's `robots.txt` with the same guard. It caches the result per server instance for up to 24 hours, and refuses any path disallowed for its User-Agent or for `*`. It also honors `Crawl-delay` as the minimum spacing between fetches to that host, across all users, through a durable per-host bucket. A missing `robots.txt` (404) means no restriction. Any other failure means refusal (fail closed). Directory imports therefore use division, team and club pages, which the inspected site allows, not the schedule path.
- **The existing schedule fetch.** The inspected site's `robots.txt` disallows its `/schedule` path, which is the page ADR-0024's "Fetch it for me" targets. ADR-0024 treats a user-triggered single fetch as not crawling. This design does not change that path, but it flags the inconsistency to the owner (open question 1). The directory path does not inherit the exemption.
- **Rate limits.** `DIRECTORY_FETCH_PER_USER` is 30 per hour, fail-closed, separate from `LEAGUE_FETCH_PER_USER`. A per-host floor comes from `Crawl-delay`, or 5 s when unset. Both are checked before any network work, after the URL rules pass.
- **Terms.** A host joins the allowlist only after its terms of use have been read and permit it, and this is recorded in the allowlist's config comment. The allowlist stays the off switch: a league that asks is removed by configuration, with no deploy of code (ADR-0024's "what would make this wrong").
- **Handoff to static.** A new `openleague.directory-pull` v1 fragment has the same shape and caps as `openleague.schedule-pull`: versioned JSON, deflate-raw, base64url, a 24,000-character encoded cap, a 192 KB inflated cap, and at most 600 teams. It goes to `#/directory/import?pull=`, and the static preview reads it like a pasted page.

### R7. Static app: browse, "my teams", opponents

**Storage.**
- A new `directories` object store keyed by envelope id (IndexedDB version 7, additive; nothing to migrate). A device may hold several directories: an organization's, plus a one-team directory, plus a tournament's.
- "My teams" is device-level, like "Your team". It is a `META_MY_TEAMS` record of `{ directoryId, teamId }` pairs, at most 10, with one marked primary. It is never written into the directory, because the directory is shareable and "mine" is personal.

**Routes** (hash, like the rest of the planner):
- `#/directory` lists directories and offers New and Import.
- `#/directory/<id>` shows an organization.
- `#/directory/<id>/level/<levelId>` shows one level.
- `#/directory/<id>/team/<teamId>` shows one team.
- `#/directory/import` covers paste, file and `?pull=`.

**Organization screen.** A header shows the organization's Crest, name and "as of" date. Below it:
- a season selector;
- level chips in one horizontally scrolling row (never wrapping into a wall at 360 px);
- under the chips, the level's teams as full-width rows (Crest 40 px, number, name, program, a star toggle), at least 44 px tall;
- a search field filters by number, name or program.

On wider screens the levels become a left rail and the teams a grid of cards, using the Crest and EntityHeader identity components, never a bare Avatar.

**Team screen.** It shows the Crest, name, number, level, program, colors and home rinks, with these actions:
- **Star / Make primary**: sets "my teams".
- **Use as Your team**: copies name, colors and logo into `TeamProfile`. The profile gains an optional `directoryRef`, so YourTeam can say "From <organization> directory" and offer "Update from directory" when the directory changes. Copying is explicit: the profile stays a plain device record that works with no directory, and plan files still never carry it.
- **Edit details**: colors, logo upload (rankings logo bounds) and home rinks. Edits are hand-set, so an import never overwrites them (R5).
- **Rankings for this level**: opens the linked rankings document, or offers to create one (R3).
- **Pick as opponent**: available from a "my team" context. It opens a matchup view: both Crests, the two teams' games from the level's rankings document if one exists, each team's estimate rank with its label (R10), and links to each rankings team page.

**Opponent picker.** It is a full-screen sheet at phone width and a dialog on desktop. It is scoped to the primary team's level by default, can switch level, and is searchable. Recent opponents come first.

**One-team directory.** YourTeam gets "Add to a directory" (optional). It creates a directory with one organization (name editable, may be "Independent"), one season, one level and one team, filled from the profile. That lets a lone coach set a level `ratingMethod`, link rankings, and share the team folder (R12) without importing anything. The `TeamProfile` alone keeps working, so this is never a prerequisite.

### R8. Hosted: directory entries are listings, not Team rows

- **Separate tables, proposed for the phase that needs them:**
  - `DirectoryOrganization`: source host and ref, name, slug, colors, logo URL, nullable `leagueId`.
  - `DirectoryProgram`.
  - `DirectorySeason`.
  - `DirectoryLevel`: rating method JSON, validation JSON, nullable `divisionId`.
  - `DirectoryTeam`: the document's UUID kept as a stable public id, external refs, number, name, colors, logo URL, home rink names, status, and a nullable unique `teamId`.

  None of them has members, players, events or invitations. An imported team is an **unclaimed listing**, and nothing in the Team-centred permission code ever sees it.
- **Why not Team rows.** A Team row means people operate it: `TeamMember`, `Player`, consent, RSVP and email all key off it (`schema.prisma:211-283`). Creating hundreds of memberless Team rows for other people's teams would put unowned entities into every team query and invite a "who may edit this?" question that ADR-0009 answers only for claimed things.
- **Private first.** A signed-in user's imported directory is first a private `DirectoryRecord`: owner-only and JSON, the same pattern as `RankingsRecord` (`schema.prisma:117`; ADR-0025). Every write runs the kind's parser. A user's private import never becomes public on its own.
- **Listing tables are written only by publication** (R11) or by a claim (below).

### R9. Rating methods per level, with a team-side override

- **A level's `ratingMethod`** is one of:
  - `{ kind: "composite", preset, params }`: `composite` (`lib/ratings/composite.ts:145`), the blend of `srs` and `walkushApprox` the rankings tool runs today;
  - `{ kind: "srs", params: { goalCap } }`: `srs` alone (`srs.ts:22`);
  - `{ kind: "walkush", params: { variant } }`: `walkushApprox` alone (`walkush.ts:22`);
  - `{ kind: "none" }`: the level doesn't rate teams, so no rankings are offered;
  - `{ kind: "unknown" }`, the default: the level rates teams, but how is not known.

  Params are a subset of `RatingMethod` (`lib/ratings/types.ts:29-35`), so a level method maps to a rankings `method` with no new calculation code. A new method needs code in `lib/ratings` first. The kind list is an allowlist, and an unrecognized kind reads as `unknown`.
- **Different levels, different methods.** An organization may use the known method at its youngest level and something else, or nothing, elsewhere. The method is per level per season, because leagues change rules between seasons.
- **Team-side override.** The rankings document's own `method` is the override. A coach can change it for their document without touching the directory. When it differs from the level's method, the rankings screens say "Your method differs from the level's", and the estimate label follows R10. A coach with a one-team directory sets the level method themselves.

### R10. Ratings are estimates; methods are validated by backtest

- **Always "estimate".** Every computed rating, rank, level placement and tier reads as an estimate, and never as official. The label appears:
  - on the rankings screens;
  - in exports: PDF, image and the file's `meta`;
  - in the matchup view;
  - on any hosted surface that ever shows one.

  The label is "Estimate". It is "Unverified estimate", styled more strongly, when the method in use has no passing validation for that level, or when the coach's override differs from the validated method.
- **Backtest before trust.** A level's method earns `validation` by being run against a past season whose published final placements are known:
  1. The coach imports that season's schedule and results into a scratch rankings document for the level (the existing import).
  2. They import the league's published final placements. A new reader, `parsePublishedPlacements`, takes a standings-archive or level-assignment page, or a two-column paste of team number and level or rank.
  3. The app runs the chosen method and compares the results.
- **Metrics:**
  - the share of teams placed in exactly the published level;
  - the share of levels whose membership matches exactly;
  - the mean absolute rank difference;
  - the largest single rank miss, named, so a coach can see where it disagrees.
- **Stored result.** `validation` is `{ seasonLabel, method (a copy), teamsCompared, teamsMatched, levelsCompared, levelsMatched, meanAbsRankDiff, maxRankDiff, ranAt }` on the level. It is display data and changes no calculation. One season is enough to show a status. Two seasons is the recommended bar and is shown as such.
- **Display.** Each level shows its status. Examples, with fictional numbers: "Validated against 2025-26: 41 of 44 placements matched, mean rank difference 0.6", or "Not validated", or "No rating method". A validation older than two seasons is shown as stale.
- **Privacy.** The backtest runs on the device (ADR-0021), or on hosted inside the owner's private record (ADR-0025). Its inputs are public pages the coach chose. Nothing is published.

### R11. Public program pages show only what the source publishes

- **What may be public.** For a listed organization, hosted may show the facts its source publishes with no login: organization, program and team names, levels, numbers, and schedules. Results are subject to the FR-026 rule below.
- **Attribution.** Every such page names the source and links to it, and shows "as of <date>". It also carries a "This listing is not managed by the league. Is this yours? Claim it" notice until claimed.
- **Nothing more is public** unless a claimed team's admin opts in: no logos the source didn't publish, no colors a user typed, no home rinks a user typed, and never a rating. Computed ratings stay private under ADR-0025, and publishing one would be league publication.
- **FR-026 still applies.** Hosted hides results below the score-recording age. Relaying a source's results for those levels is still the platform showing them, so v1 public pages show schedules for every level and results only at or above the threshold. Whether relayed results should be exempt is open question 3.
- **Who publishes.** A listing is created only for a host on the fetch allowlist, by a site operator, or by the association's own admin once claimed. One user's private import cannot create a public page.
- **Public reads** go through a column-whitelist module (ADR-0014), like `lib/actions/association-profile.ts`. Unclaimed listings render under `/directory/<org-slug>`, so they never collide with or impersonate a published association at `/associations/<slug>`. A claimed organization's listing redirects to its association page.
- **Opt-out.** A program or league that asks is unlisted at once by an operator action (status `UNLISTED`; rows kept for audit). The host comes off the allowlist if the league asks. How requests arrive is open question 2.

### R12. Storage and sharing: the directory is the team folder manifest

- **Static.** IndexedDB is the working copy (storage connectors R3). Connectors save the directory wrapped (`<slug>.directory.json`) with the same link table, revisions and conflict choices as any other kind. The directory is the "offline schema" a coach carries between devices.
- **Team folder.** The storage connectors spec leaves folders out of scope. This design defines the smallest useful one: a provider folder (a Drive folder, the OneDrive app folder, or a local directory) that holds one `*.directory.json` plus any number of `*.rankings.json` and `*.olplan.json` files. The directory is the folder's **manifest**. Rankings point to it by `directory.id`, and the planner groups files under the organization and level they reference. There is no separate manifest file to keep in sync: a rankings file found without its directory still opens, without enrichment.
- **Sharing** is the provider's (storage connectors R8). A coach shares the folder or the directory file. Recipients open it, and the provider's permissions are the whole permission model. There is no OpenLeague share link for directories in v1. If one is ever added, it is a bearer capability under ADR-0011 and goes into the capability-privacy registry.
- **No new origins.** Directory screens add no `connect-src` or `img-src` origin to the static CSP. AI providers (ADR-0023) are not involved, and no page or directory is sent to one by this feature.

### R13. Promotion from static to hosted, and the claim flow

- **Promotion** (ADR-0020's import direction). A signed-in user opens a directory file (bare or wrapped) on hosted. It becomes their private `DirectoryRecord` (R8), and export writes the same file back. Promotion never publishes and never creates Team rows.
- **Claiming a team.** On a listed or private directory team, an authenticated user taps "Claim this team". The request records who, which entry and an optional message. Approval depends on who already holds authority:
  - **Organization already claimed** (it has a `leagueId`): only that association's administration approves, per ADR-0009 point 6. Approval creates or links a `Team` row (`leagueId`, `divisionId` from the level's linked Division, name, number, colors). It sets `DirectoryTeam.teamId` and grants the claimant `TEAM_MANAGER` at `TEAM` scope. The approval is written to `AuditLog`.
  - **Organization unclaimed**: no association admin exists to delegate, so a team claim waits for verification (open question 5). It is never self-approved.
- **Claiming an organization** creates or links a `League`, and grants the verified claimant `ASSOCIATION_ADMIN` at `ASSOCIATION` scope. From then on, team claims route to that admin. Verification is open question 5. Candidates are an invitation from a known league contact, or manual operator review.
- **After a claim**, the Team row is the source of truth for anything the team publishes (profile, logo, colors), under the existing `profileStatus` rules. The listing keeps its source references for re-import. A re-import never edits a claimed Team row, and only proposes changes to its admin.
- **Unclaim / revoke** follows ADR-0009 grant revocation. The listing returns to unclaimed and the Team row is kept, because it may have members.

## Architecture

```
lib/team-directory/            pure, portable (ADR-0020)
  document.ts                  schema, parse, serialize, limits, file name     R1, R2
  merge.ts                     match (source ref → number → name), review set  R5
  from-parsed.ts               ParsedSchedule / division / team / snake → incoming entries  R4
  rating-method.ts             level method ⇄ RatingMethod; label state      R9, R10
  validation.ts                backtest metrics                               R10
  pull.ts                      openleague.directory-pull v1                  R6
lib/ratings/import/
  division-page.ts, team-page.ts, published-placements.ts                    R4, R10
lib/document-envelope/kinds.ts + "openleague.team-directory"                 R1
lib/league-fetch/robots.ts     robots.txt parse + per-host spacing            R6
lib/actions/directory-fetch.ts fetchDirectoryPage (sign-in, limits, guard)   R6
apps/planner/src/store/directories.ts, my-teams.ts                          R7
apps/planner/src/screens/directory/…                                        R7
(hosted, later) lib/actions/directory-records.ts, directory-listings.ts, directory-claims.ts   R8, R11, R13
```

## Phasing

Each phase ships alone and leaves the app working.

| # | Phase | Contents | Depends on |
|---|---|---|---|
| 0 | **Estimate labels** | "Estimate" / "Unverified estimate" on the existing rankings screens and exports; no directory needed | — |
| 1 | **Document kind** | `lib/team-directory/document.ts`, the parser, limits, envelope registry entry, fixtures | — |
| 2 | **Static import and browse** | New readers (division and team page), merge with review, IndexedDB v7 `directories` store, directory screens, "my teams" | 1 |
| 3 | **Planner and rankings integration** | `TeamProfile.directoryRef` and "Use as Your team"; rankings `directory` / `directoryTeamId`; seeding a level's rankings; one-team directory; opponent picker and matchup view | 2 |
| 4 | **Rating methods and validation** | Level `ratingMethod`, the override notice, `parsePublishedPlacements`, the backtest, the per-level status | 3 (method mapping), 0 (labels) |
| 5 | **Hosted fetch for directories** | `robots.ts`, per-host spacing, `fetchDirectoryPage`, `openleague.directory-pull` handoff | 2 |
| 6 | **Hosted private directories** | `DirectoryRecord` (migration), import/export with the shared parser, the screens through the ADR-0025 seam | 1, 3 |
| 7 | **Public listings** | Listing tables (migration), operator publication, `/directory/<slug>` pages via a whitelist module, attribution, opt-out | 6 |
| 8 | **Claims** | Claim requests, admin approval, Team linking and `TEAM_MANAGER` grant, organization claim with verification | 7, open question 5 |
| 9 | **Team folder** | Grouping by `directory.id` in connector listings | Storage connectors phases 2-4 |

## Testing

All fixtures are fictional:
- the organization is "Example Youth Hockey League" at `league.example.org`;
- the programs are Riverside, Lakeview, Hilltop, Brookside and Pinewood;
- the team numbers are 901-960, and the rinks are "Rink A" and "Rink B";
- source ids are made-up six-digit numbers;
- the HTML is hand-built to the structural shape described in Context, never copied from a real page (the static rankings spec's R6 rule).

- **Document**:
  - round trip;
  - unknown keys stripped;
  - newer version refused;
  - every limit at and past its edge;
  - referential errors (missing level, duplicate number in a level, `previousId` forward in time);
  - a person-shaped field is stripped, never stored.
- **Readers**: division, team, snake-chart-to-levels and published placements. Cases:
  - clean HTML;
  - a glued plain-text copy;
  - a saved web archive;
  - a page with a contact table, whose people must not appear in the output;
  - unread lines reported.
- **Merge**:
  - rename by source id;
  - number reuse with a different source id, which goes to review;
  - name-only match, which goes to review;
  - a missing team, marked inactive only on whole-level imports;
  - season rollover with `previousId` and inherited hand-set fields;
  - a hand-set field never overwritten.
- **Rating methods**:
  - every kind maps to a `RatingMethod` and back;
  - an unknown kind reads as `unknown`;
  - the override notice.
- **Validation**: a fictional prior season with known published levels, where the method misplaces 3 of 44 teams. Expected: 41 of 44 matched, the exact mean rank difference, the max miss named, and the label state for validated, unvalidated, stale and override cases.
- **Robots and fetch**: no network, with injectable fetch and DNS as in the guard's tests. Cases:
  - a disallowed path refused before any page fetch;
  - `Crawl-delay` spacing enforced across two users;
  - 404 robots means allowed, while 500 or a timeout means refused;
  - the rate limit is checked fail-closed and only after the URL rules pass.
- **Pull**: encode and decode, caps on both sides, newer version refused.
- **Static screens**:
  - 360 px layout with no horizontal page scroll and 44 px targets;
  - star and primary;
  - "Use as Your team";
  - one-team directory;
  - opponent picker;
  - the app with no directory (every existing test still passes unchanged).
- **Hosted** (phases 6-8):
  - owner scoping, where another user's record reads as not found;
  - the public whitelist module returns only the R11 columns;
  - FR-026: results hidden below the threshold on public pages;
  - a claim can't be self-approved;
  - approval creates exactly one Team row and one TEAM-scope grant;
  - revoke keeps the Team row.

## Risks

- **Parser drift.** Source sites change markup. The readers match structure and report what they skip. A broken reader shows "couldn't read this page", never a wrong directory.
- **Robots and terms.** The inspected site's `robots.txt` disallows the path ADR-0024 already fetches (open question 1). A league could object to listings. The allowlist and the opt-out are the controls, and both need only configuration or an operator action.
- **Impersonation.** An unclaimed listing could be mistaken for the league's own page. Separate routes, attribution, the "not managed by the league" notice and no logos on unclaimed listings reduce this.
- **Claim abuse.** A false claimant could take over a team listing. Claims never self-approve, organization claims need verification, and grants are revocable and audited.
- **Estimate misuse.** A screenshot of an estimate could circulate as "the rankings". The label is in every export and image, and ratings never appear on public pages.
- **Size.** A very large organization could pass the caps. The caps are per document, and splitting by season is the escape hatch.

## Out of scope

- Rosters, people and contacts of any kind (R2).
- Automatic or scheduled refresh, crawling, and following links beyond the page named.
- Automatic logo fetching (open question 4).
- Linking home rinks to hosted `Venue` rows.
- Merging two organizations' directories, and teams that play in two leagues at once (several `sources[]` cover a team listed on two hosts, but not two organizations).
- Publishing ratings anywhere.

## Open questions for the owner

1. **The existing schedule fetch and robots.** The inspected league site disallows its schedule path for all user agents and sets a 5 s crawl delay. ADR-0024 fetches that path on a user's tap. Keep it, as user-triggered rather than crawling, or bring it under the same robots rule this design applies to directory fetches? The second option would mean importing schedules from team pages instead.
2. **Opt-out channel.** How does a league or program ask to be unlisted: a contact address on every listing page, a form, or a GitHub issue? Who acts on it, and how fast?
3. **FR-026 and relayed results.** Should results that the source publishes publicly for levels below the score-recording age be shown on unclaimed public listings, with attribution? Or should FR-026 hold as v1 proposes (schedules only for those levels)?
4. **Logos.** Allow hosted to fetch a team or club logo image from the source's image host, under a second, image-only allowlist and the same guard? Or keep logos upload-only?
5. **Claim verification.** For an unclaimed organization, which verification counts? Options: an invitation sent to a contact the league publishes, manual operator review, a DNS or page token on the league's site, or a combination. Which is required for an organization claim, and which for a team claim, before any association admin exists?
6. **Source terms.** For each host proposed for the allowlist, who reads the terms, and where is the decision recorded (the config comment, an ADR amendment, or both)?
7. **Validation bar.** Is one past season enough to drop "unverified", or should two be required? Is there a minimum exact-match share below which a method is shown as "poor fit" rather than "validated"?
8. **Public listings at all in v1?** Phases 7 and 8 add the first public pages built from third-party data. Ship them, or stop at private hosted directories (phase 6) until questions 2, 3 and 5 are settled?

## ADR

This design proposes **ADR-0026**: model imported teams as a portable directory document, unclaimed until a grant claims them. It extends ADR-0022's kinds registry, applies ADR-0024's guard to directory pages under a robots rule, keeps ADR-0025's privacy for anything computed, and routes every claim through ADR-0009 grants.
