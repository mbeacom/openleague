# Practice planner favorites: design

Date: 2026-10-07
Status: accepted
Governing decisions: ADR-0002 (server actions), ADR-0003 (Prisma only), ADR-0020 (the PlannerStore seam the hosted and static planners share), ADR-0022 (portable documents)

## Goal

A coach can star the drills and practices they reach for most, find them again
quickly, and see the star wherever the item appears: the drill library, the
practice list and the session editor's drill picker. It works on the hosted
app and on the static planner, with the same components.

## Rulings

### R1. Where favorites live

| | Hosted | Static |
|---|---|---|
| Scope | Per user, across devices | Per device (per browser profile) |
| Storage | New table `planner_favorites` (`PlannerFavorite { userId, kind, targetId, createdAt }`), unique on `(userId, kind, targetId)`, cascade on user delete | One record in the IndexedDB `meta` store under the key `plannerFavorites`: `{ DRILL: string[], PRACTICE: string[] }` |
| Schema change | Additive, hand-written migration | None: the `meta` store already exists, so `DB_VERSION` stays at 4 |

`kind` is `DRILL` or `PRACTICE`. `targetId` is polymorphic (a library play, a
starter drill or a practice session), so there is no foreign key to the target.

### R2. Favorites do not travel in exported files

Plan files (ADR-0020) and envelopes (ADR-0022) describe one practice. A star is
a personal bookmark, not part of the plan: a coach who shares a plan with
another coach is not telling them which drills to like, and an imported plan
gets a fresh session id anyway, so a carried star would point at nothing.
Favorites therefore stay out of `PlanDocument`, the envelope and every export,
in the same way the static "Your team" profile does. A test pins that an
exported plan from a store holding favorites has no favorite data.

### R3. Starter drills

The starter drills in `lib/data/starter-plays.ts` have stable ids such as
`starter-breakout-5man`.

- **Hosted:** an uncopied starter appears as a starter card in the library.
  Starring it stores `kind = DRILL, targetId = <starter id>`. The action accepts
  either a CUID or one of the known starter ids (a closed set derived from
  `STARTER_PLAYS`), so no other free-form id reaches the database. When a
  starred starter is added to the library, the new copy is starred too; the
  starter's own star is kept, so if the copy is deleted later the starter card
  comes back still starred.
- **Static:** starters are seeded into the device library at first load as
  ordinary library drills with their own ids, so starring one stars that drill.
  If a coach deletes a seeded starter, its starter card returns and can be
  starred by its starter id, as on hosted.

### R4. Deleted targets (orphans)

Orphans are tolerated, not cleaned up. Ids are never reused (CUIDs on hosted,
random UUIDs on static), so a star left behind by a deleted drill or practice
can never attach to anything else, and every screen only draws stars for items
it is already showing. Deletion code in `deletePlay` and
`deletePracticeSession` is left alone: it is shared by other work in flight,
and a cleanup step there would add a write to every delete for no visible
benefit. Unstarring never checks the target, so an orphan can always be
removed.

### R5. Authorization (hosted)

`setPlannerFavorite` and `listPlannerFavorites` follow the house pattern:
authenticate first (`requireUserId`), validate with Zod, then authorize.

- Starring a library drill requires membership of the drill's team (the same
  rule as reading the library). Session-owned drill copies cannot be starred.
- Starring a starter drill requires only a signed-in user: starters are the
  same for everyone.
- Starring a practice requires the user to be able to see it: team admins see
  every practice of the team, members only shared ones (the rule in
  `getPracticePlannerListData`). A practice the user cannot see answers "not
  found", so the action does not reveal that it exists.
- Unstarring only deletes the caller's own row, so it needs no target lookup.
- A user only ever reads and writes their own rows: `userId` comes from the
  session, never from the input.
- No `revalidatePath`: stars render from client state, and a router refresh on
  every tap would only add work.

### R6. The seam

`PlannerStore` gains two **optional** members, mirroring the actions one to one:

```ts
listPlannerFavorites?: (input: { kind: PlannerFavoriteKind }) => Promise<ActionResult<string[]>>;
setPlannerFavorite?: (input: { kind: PlannerFavoriteKind; targetId: string; favorite: boolean }) =>
    Promise<ActionResult<{ kind: PlannerFavoriteKind; targetId: string; favorite: boolean }>>;
```

Optional, like `sharePracticeSession`: a store without them hides every star
and the Favorites filter. `PlannerFavoriteKind` is a plain string union in
`lib/planner-store`, never the Prisma enum, so shared code stays free of
`@prisma/client`.

Components read favorites through one hook, `usePlannerFavorites(kind)`, which
returns `isFavorite(id)`, the current id set, and an optimistic
`setFavorite(id, next)`. A pure `favoritesFirst(isFavorite, compare)` helper in
`lib/utils/planner-favorites.ts` lets later work (for example, sorting drill
suggestions) put favorites first without touching these components.

### R7. Interface

- **Star toggle** on every drill card (library and picker), starter card and
  practice card: a 44 × 44 px icon button with `aria-pressed`, a fixed label
  ("Favorite <name>") and an outline or filled star. On hosted the change shows
  at once and is undone with an error message if the save fails. In the picker,
  tapping the star does not select the drill. On practice cards the star sits
  outside the card's link, never inside it.
- **Favorites filter**: a toggle chip in the library (and therefore the picker)
  and in both practice lists. With it on, the library walks every page of the
  current query (100 drills per request, bounded by the first total), keeps the
  starred ones and paginates them on the client, so the count and pages stay
  exact. Starter cards are filtered the same way.
- **Favorites first** in both practice lists, before the date order the coach
  chose: the whole list is in memory, so the order is exact. The library is
  server-paginated, so it keeps its newest-first order; re-sorting one page at
  a time would show favorites first on page 2 but after page 1's drills, which
  is misleading. Coaches who want favorites first there use the filter.

## Out of scope

Syncing static favorites between devices (a later storage connector could
carry them), favorites for other planner objects, and team-wide shared
favorites.
