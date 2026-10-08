# Hosted Rankings and Team Logos — Design

**Date:** 2026-10-07
**Status:** Proposed; phase 1 implemented
**Decision record:** [ADR-0025](../../adr/0025-store-a-signed-in-coach-s-rankings-documents-privately-on-the-hosted-app.md) (amends ADR-0021)
**Applies to:** the hosted Next.js app (openl.app) and the static planner (`apps/planner/`)
**Depends on:**
- the static rankings tool (`2026-10-07-static-rankings-design.md`, ADR-0021);
- the document envelope (ADR-0022);
- the hosted league page fetch (`2026-10-07-hosted-league-page-fetch-design.md`, ADR-0024);
- the practice logo pipeline (`2026-10-05-practice-logo-design.md`).

## Context

The rankings tool exists only in the static planner. It stores one
`openleague.rankings` v1 document per browser. Coaches who use the hosted app
look for it there and can't find it. They also want to tell opponents apart at
a glance, and today a team in the rankings is only a number and a name.

What exists (verified):
- **Format and calculation.** `lib/rankings-document` (strict parser,
  `MAX_RANKINGS_FILE_BYTES`, merge, sources, pull) and `lib/ratings` (pure
  composite rating). Both are portable under ADR-0020's lint rule.
- **Screens.** `apps/planner/src/screens/rankings/*` take a store and load
  through `useRankingsDoc`. They hard-coded the static hash routes,
  `navigateTo` and the "Fetch it for me" link.
- **Static storage.** `RankingsOps` (`getRankings`, `saveRankings`,
  `clearRankings`) over IndexedDB, holding one document.
- **Logos.** Hosted Crest logos live in Vercel Blob under an owned-entity
  prefix. The static "Your team" logo is a PNG data URL normalized in the
  browser (`lib/utils/canvas/logo-file.ts`, `lib/media/logo-rules.ts`),
  checked by `isLogoImage`. `Crest` draws a logo or initials.
- **Fetch.** ADR-0024's action fetches an allowlisted league page and hands
  the parsed games to the static app in a URL fragment. Nothing is stored.

## Goals

1. A signed-in coach finds **Rankings** on hosted: in the sidebar next to
   Practice Planner (and Seasons in league mode), in the mobile menu, and from
   the dashboard.
2. They keep several private rankings documents, and can list, open, import,
   edit (Setup, What-if, team details), save, export and delete them.
3. A rankings file moves between hosted and static unchanged, both ways.
4. Any team in a rankings document can carry a logo. It shows wherever the
   team appears, with the Crest as the fallback, on both apps.
5. Hosted and static don't fork: they share one format, one calculation and
   one set of screens.

## Rulings

### R1. Storage is per user, private

A `RankingsRecord` (`rankings_records`) has `id`, `ownerId` → `User` (cascade
on delete), `title` (≤ 100 characters, mirroring `meta.title` for the list),
`document Json?` and timestamps. It is indexed on `(ownerId, updatedAt)`, and
a user keeps at most 20.

**Why per user, not per team:**
- Rankings are a coach's own analysis, often of divisions their team isn't in.
- The static app has no team to map to.
- Sharing among a team's admins would be publication (see R4).

A share feature, if wanted, gets its own decision.

`document` is null after "Start over". The record stays and waits for a new
import, so the screens behave as they do on the static app, where clearing
leaves no document.

### R2. Server actions

`lib/actions/rankings.ts` provides `listRankingsRecords`,
`createRankingsRecord({ title?, document? })`, `getRankingsRecord(id)`,
`saveRankingsRecord({ id, document })`, `clearRankingsRecord(id)` and
`deleteRankingsRecord(id)`. They follow the house pattern:
- `requireUserId()` first, outside the `try`;
- ids through `parseId` before any query;
- every query scoped by `{ id, ownerId }`;
- a document measured against `MAX_RANKINGS_FILE_BYTES` before
  `parseRankings` validates it;
- friendly errors, with logs that name only the error type.

Another user's record reads as "not found". All six actions are in the
action-id sweep table.

### R3. One set of screens, through a seam

The screens' store prop is typed `RankingsOps`, and they read a
`RankingsPlatform` from context (`apps/planner/src/screens/rankings/rankings-platform.tsx`):
- `routes`: rankings, import, update, setup, what-if, team;
- `navigate(href)`;
- `fetchAction(source)`: the Update results panel's second action.

The default is the static platform (hash routes, `navigateTo`,
`FetchForMeAction`), so the static app and its tests need no provider. Hosted
(`components/features/rankings/HostedRankingsScreen.tsx`) binds one record:
- a store made of the record's actions, memoized on the id;
- path routes under `/rankings/<id>`;
- `router.push` for navigation;
- no fetch action in phase 1.

The edits to the screens are mechanical: `staticRoutes.x()` became
`routes.x()`, and `navigateTo` became `navigate`. Hosted importing from
`apps/planner` is safe because those files stay under ADR-0020's portability
rule.

### R4. FR-026 and privacy

FR-026 (season scheduling spec) withholds scores and standings below the
score-recording age in what the platform shows a league. A hosted rankings
document is the owner's own computation from public pages they chose. Hosted
shows its owner every result in it, at any age, as the static app does.

**Forbidden.** Any of the following would make the document league
publication, so FR-026 would apply:
- a shared or public view of a rankings record;
- reading one through a team or league role;
- writing ranking results into league, season, division, team or placement
  models.

The list page says the documents are private to the account.

### R5. Team logos

- **Field.** `teams[].logo?: { dataUrl, width, height }`. It is optional and
  additive under v1: older files have none, and older readers strip it.
- **Bounds.**
  - A logo is a real PNG data URL whose IHDR matches the stored sides.
  - It fits within 128×128 and is at most 12 KB decoded (`isPngLogo` with
    `TEAM_LOGO_BOUNDS`).
  - All logos in one document together are at most 600 KB.
- **Normalizing (both apps).** In the browser,
  `normalizeLogoFile(file, RANKINGS_TEAM_LOGO_OPTIONS)` applies the practice
  logo pipeline:
  - PNG, JPEG or WebP, sniffed from the bytes (SVG refused);
  - 2 MB raw at most;
  - the pixel limit is checked before decoding;
  - drawn within 128, then 64, and stored as PNG.
- **Validation.** The parser enforces both caps, so a hand-edited file can't
  get past them. The hosted actions run the same parser.
- **Storage (both apps).** The logo lives in the document. Hosted doesn't use
  Vercel Blob: the file must stay self-contained, and an opponent isn't an
  entity the user owns, so the Blob ownership prefix has nothing to name.
  - Phase 1 shows a logo only where the user set one. Copying an OpenLeague
    team's Crest logo would read another tenant's data, and is out of scope.
  - Practice plan files are unaffected and still never carry logos (practice
    logo spec R4).
- **Where to set it.** The team page has a **Team details** button. Its dialog
  shows the mark and offers Choose/Replace logo and Remove logo; changes save
  through the screen's store. The control itself is `TeamLogoField`
  (`TeamLogoDialog.tsx`), self-contained so the Setup redesign's team edit
  dialog can slot it in rather than the old Setup layout growing a logo row. Logos also arrive by opening a rankings file,
  and leave in an exported one.
- **Where it shows.** Logos render through `TeamMark`
  (`apps/planner/src/screens/rankings/TeamMark.tsx`): `Crest` with an optional
  `logoUrl`, seeded by `rankings-team:<number>`. `RankingsTeamMark` looks the
  logo up from a `TeamLogosProvider`. Logos appear on:
  - the ladder and table rows;
  - the team page header;
  - the team page's opponent links.
- **Coordination.** The Setup redesign is building a `TeamMark` at the same
  time. This component is the shared one: same name, same optional `logoUrl`.
  Whichever change lands second keeps one component.

### R6. Size caps

| Limit | Value | Why |
|---|---|---|
| One logo | 128 px, 12 KB | Drawn at 28–48 px; about 4–8 KB is typical |
| All logos in a document | 600 KB | About 50 logos at the cap, many more at typical sizes |
| `MAX_RANKINGS_FILE_BYTES` | 2 MB → 3 MB | 5,000 games (about 1.2 MB) plus a full logo budget |
| Server action body | 1 MB → 4 MB | The largest file either app writes can be saved on hosted |
| Records per user | 20 | Bounds storage per account |

An older static build refuses a file of more than 2 MB as too large. It can
only meet one through a stale cache, and it would strip the logos anyway.

### R7. Routes and navigation

| Route | Screen |
|---|---|
| `/rankings` | The list: New rankings, Open a rankings file, delete |
| `/rankings/<id>` | Rankings (ladder and table) |
| `/rankings/<id>/import` (`/import/update`) | Import / Update results |
| `/rankings/<id>/setup` | Setup |
| `/rankings/<id>/what-if` | What-if |
| `/rankings/<id>/team/<number>` | Team detail and Team details dialog |

The routes are top level, not under `/practice-planner`, because rankings
aren't team-scoped and the planner page redirects users without a team.

**Where to find it:**
- "Rankings" in the sidebar, after Practice Planner (single-team) or Seasons
  (league mode);
- the mobile More menu, in both modes;
- a "Placement rankings" button on the dashboard;
- a breadcrumb label.

The (dashboard) layout requires sign-in.

### R8. Import and export between the apps

Hosted "Open a rankings file" and static Import read with the same
`readRankingsFile`, which accepts bare or enveloped files (ADR-0022). Hosted
"Export rankings file" is the shared screen's export, so it writes the same
bare file. The static app opens a hosted export, logos included, and the
other way round.

### R9. "Fetch it for me" on hosted (phase 2)

On hosted the panel's second action becomes direct. A new action reuses
ADR-0024's guard, allowlist and durable per-user rate limit. It returns the
parsed schedule (no fragment, no link) to the hosted import screen, which shows
its usual preview. Only the coach's Save merges and writes the record, and the
saved page's `lastReadAt` updates then. The static app keeps the fragment
handoff.

## Phasing

- **Phase 1 (this change).**
  - The `RankingsRecord` model and migration, with the actions and the sweep
    table entries.
  - The rankings seam, plus the hosted list and the five screens.
  - Navigation and dashboard entries.
  - Team logos on both apps (field, caps, dialog, `TeamMark`).
  - The raised file and action body caps.
- **Phase 2.** Direct fetch on hosted (R9). Client-side navigation inside the
  shared screens (a `Link` slot in the seam), so moving between screens
  doesn't reload the page.
- **Phase 3.**
  - "Send to OpenLeague" from the static app and "Open in planner" from
    hosted, in one step: a signed-in import page, like plan import, with a
    size cap that suits rankings.
  - Optionally, suggest a logo from an OpenLeague team that the user is a
    member of.
- **Later, only with its own decision.** Sharing a rankings record with a
  team's admins (FR-026 applies).

## Testing

- **Document.** `__tests__/lib/rankings-document/team-logos.test.ts`:
  - additive read;
  - round trip through the file;
  - per-logo and declared-size refusals;
  - the shared budget, and that 5,000 games plus a full budget fit the file
    cap;
  - removal;
  - logos surviving a merge.
- **Actions.** `__tests__/lib/actions/rankings.test.ts`: owner scoping on
  every query, the per-user cap, the size check before parsing, invalid and
  damaged documents, clear and delete. The id sweep covers all six actions.
- **Static screens.** `__tests__/apps/planner/rankings-team-logos.test.tsx`:
  the ladder draws a logo and Crests otherwise, and the dialog sets, refuses
  and removes a logo through the store.
- **Hosted pages.** Component tests in
  `__tests__/components/features/rankings/hosted-rankings.test.tsx`: the
  screens load through the record's action, links stay within
  `/rankings/<id>`, saves go to the record, there is no static fetch handoff,
  and the list covers new, open file, bad file and delete. The development
  database is behind on migrations, so there is no live click-through.
- **Browser check.** Static logos at 360 px and 1280 px.
