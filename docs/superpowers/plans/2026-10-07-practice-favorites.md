# Practice planner favorites: implementation plan

Spec: `docs/superpowers/specs/2026-10-07-practice-favorites-design.md`

Each step is test first: write the failing test, make it pass, then move on.

1. **Shared rules** (`lib/utils/planner-favorites.ts`): `PLANNER_FAVORITE_KINDS`,
   `isStarterDrillId`, the Zod schemas for the two hosted actions (target id is
   a CUID or a known starter id), and `favoritesFirst`. Unit tests.
2. **Seam** (`lib/planner-store/types.ts`): `PlannerFavoriteKind`, the two
   optional `PlannerStore` members and their input and result types.
3. **Schema and migration**: `PlannerFavoriteKind` enum and `PlannerFavorite`
   model with a `User` relation; hand-written additive migration
   `20261007120000_planner_favorites`; `bun run db:generate`.
4. **Hosted actions** (`lib/actions/planner-favorites.ts`):
   `listPlannerFavorites`, `setPlannerFavorite`. Tests with mocked Prisma and
   session: auth first, validation, the three visibility rules, unstarring
   without a lookup, idempotent upsert. Add both to the action-id sweep table.
   Wire both into `hostedPlannerStore`.
5. **Static store** (`apps/planner/src/store/favorites.ts`): one `meta` record,
   validated on write and read leniently; target checks mirror hosted (library
   drill, starter id, or existing session). Spread into
   `createLocalPlannerStore`. Contract tests against both repos, including
   "an exported plan carries no favorites".
6. **Hook and controls** (`usePlannerFavorites.ts`, `FavoriteToggle.tsx`,
   `favorite-plays.ts` for the favorites-only library walk): component tests
   for the optimistic update and revert.
7. **Library and picker** (`PlayLibrary.tsx`): stars on drill and starter
   cards, the Favorites chip, favorites-only paging, star the copy of a starred
   starter, star click never selects.
8. **Practice lists**: hosted `PracticePlannerList` (initial ids from the page's
   server render) and static `SessionListScreen`: star, Favorites chip,
   favorites first.
9. **Gates**: type-check, lint, full test suite, build, planner build and
   check, raw-SQL check, ADR lint; Playwright check of the static planner at
   360 and 1280 px, light and dark.
