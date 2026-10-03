# Planner Store Seam — Design

**Date:** 2026-10-03
**Status:** Accepted
**Sub-project:** 2 of the static planner. Order and decisions are in `2026-10-03-static-planner-roadmap.md`.
**ADR:** ADR-0020 (the static app needs a storage seam). ADR-0002 still holds: hosted mutations stay server actions, and the store is only a client-side facade over them.

## Goal

Put a `PlannerStore` seam and a `PlannerPlatform` seam between the practice-planner UI and the hosted runtime, so the components the static app (sub-project 3) reuses no longer import server actions, `next/link`, `next/image`, `next/navigation` or `@prisma/client`.

Hosted behaviour is **unchanged**. This is a pure refactor plus adapters:
- the hosted store's methods *are* the existing server actions;
- the hosted platform's `Link`, `Image` and `navigate` *are* `next/link`, `next/image` and `router.push`.

## Context (verified at `8ce6e25`)

**Coupled components.** These are all the direct runtime couplings in the components the static app reuses:

| File | Coupling |
|---|---|
| `components/features/practice-planner/PlayLibrary.tsx` | `getPlaysByTeam`, `getPlayById`, `deletePlay`, `createPlay` (`lib/actions/plays`); `useRouter` (two pushes: library edit, library new); `next/image` ×2 |
| `components/features/practice-planner/SessionDrillDialog.tsx` | `saveSessionDrill`, `copySessionDrillToLibrary` (`lib/actions/practice-session-drills`) |
| `components/features/practice-planner/DuplicateSessionDialog.tsx` | `duplicatePracticeSession` (`lib/actions/practice-session-drills`, not `practice-sessions`); `useRouter` (push to the copy's edit page) |
| `components/features/practice-planner/SessionDrillCard.tsx` | `next/image` ×1 |
| `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx` | `deletePracticeSession`, `sharePracticeSession`; `useRouter` (push to the list after delete); `next/link` ×3; `next/image` ×2; `type SegmentKind` from `@prisma/client`. It is 846 lines, with a ≤ 900-line budget test (`__tests__/app/SessionDetailView.line-budget.test.ts`). |
| `components/features/practice-planner/print/BenchSheet.tsx` | `LinkButton` from `components/ui/NextLinkComposites` (which imports `next/link`); `type PracticeSessionDetail` from `lib/actions/practice-session-queries` |

**Prisma types in pure modules.** `type SegmentKind` from `@prisma/client` appears in `lib/utils/session-timeline.ts`, `SessionDrillList.tsx`, `useVenueBooking.ts` and `types/segments.ts`. The Prisma enum is `HALF | CROSS | CUSTOM`.

**Already decoupled.**
- `PracticeSessionEditor` and `PlayEditor` take `onSave` and `onShare` callbacks and import no actions. They couple only through their children, `PlayLibrary`, `SessionDrillDialog` and `SessionDrillCard`.
- `ExportPlanMenu`, `PlanPreview`, `SessionTimeline`, `StationMap`, the canvas utilities and `lib/plan-document/` are free of server and Next imports.

**Transitive scan.** A walk of value imports from the editor, the library, the detail view, the bench sheet and `lib/plan-document` finds **only** the couplings above. The one transitive hole is BenchSheet → `NextLinkComposites` → `next/link`.

**The route glue is hosted-only and stays as it is:**
- the pages;
- the wrappers `PracticeSessionEditorWrapper`, `EditSessionWrapper` and `PlayEditorWrapper`, which call `createPracticeSession`, `updatePracticeSession`, `createPlay` and `updatePlay` and pass them to the editors as callbacks;
- `PracticePlannerList`;
- `PlanImportView`, the hosted import flow.

**The bench sheet lives in another route group.** It renders at `app/(print)/practice-planner/[sessionId]/print/page.tsx`, outside `(dashboard)`, so a provider in the dashboard tree does not reach it.

**Tests cannot load the real actions.** Importing `lib/actions/plays` under Vitest fails: `next-auth` → `next/server` does not resolve (probed at planning time). Every existing test therefore mocks each action module its component imports. A hosted provider that imports all three action modules would break every test that mocks only one of them, so tests need a store double rather than the real hosted store.

**Results already share one shape.** All three action files declare the same `ActionResult<T> = { success: true; data: T } | { success: false; error: string; details?: unknown }`.

## Design

### Module layout

| Path | Contents | Guarded? |
|---|---|---|
| `lib/planner-store/types.ts` | `ActionResult`, the input and data types, `PlannerStore`, `PlannerPlatform`, `PlannerRoutes`, `PlannerLinkProps`, `PlannerImageProps` | yes |
| `lib/planner-store/context.tsx` | `"use client"`: `PlannerProvider`, `usePlannerStore`, `usePlannerPlatform` | yes |
| `lib/planner-store/index.ts` | Re-exports both | yes |
| `components/providers/hosted-planner-platform.tsx` | `"use client"`: `hostedPlannerRoutes`, `HostedLink` (`next/link`), `HostedImage` (`next/image`), `useHostedPlannerPlatform()` (`useRouter`) | no (hosted) |
| `components/providers/HostedPlannerProvider.tsx` | `"use client"`: `hostedPlannerStore` (the actions), `HostedPlannerProvider` | no (hosted) |
| `app/(dashboard)/practice-planner/layout.tsx` | Server layout that wraps `children` in `HostedPlannerProvider` | no |
| `app/(print)/practice-planner/layout.tsx` | The same, for the bench sheet | no |

The platform and the store are in separate hosted files so that tests can use the real hosted platform (which needs only `next/link` and the globally mocked `next/navigation`) without importing the action modules.

### `PlannerStore` (the methods the reusable components call, and no others)

The method names, inputs and results **mirror the server actions one to one**. IDs are strings. Inputs are declared explicitly in `types.ts` and are not imported from `lib/utils/validation.ts`:
- `z.input` there gives `duplicate.date: unknown`;
- `.default()` fields blur which fields are optional.

A planning-time `tsc` probe confirmed that each explicit input is assignable to its action's Zod-inferred input. The hosted store is typed `PlannerStore` and assigns each action directly, so the compiler re-proves that parity on every type-check.

```ts
export type ActionResult<T> =
    | { success: true; data: T }
    | { success: false; error: string; details?: unknown };

export type LibraryDateFilter = "all" | "today" | "week" | "month";
export interface LibraryPlaySummary { id: string; name: string; description: string | null; thumbnail: string | null; isTemplate: boolean; createdAt: Date; updatedAt: Date }
export interface LibraryPlay extends LibraryPlaySummary { playData: PlayData }
export interface LibraryPage { plays: LibraryPlaySummary[]; total: number; page: number; limit: number }

export interface LibraryQuery { teamId: string; isTemplate?: boolean; page: number; limit: number; search?: string; dateFilter: LibraryDateFilter }
export interface PlayRef { id: string; teamId: string }
export interface NewLibraryPlay { name: string; description?: string; thumbnail?: string; playData: PlayData; isTemplate: boolean; teamId: string }
export interface SessionDrillSave { sessionId: string; teamId: string; playId?: string; name: string; description?: string; thumbnail?: string; playData: PlayData }
export interface SessionDrillRef { playId: string; teamId: string }
export interface SessionRef { id: string; teamId: string }
export interface SessionCopy extends SessionRef { date: Date }
export interface SessionShare extends SessionRef { isShared: boolean }

export interface PlannerStore {
    getPlaysByTeam(input: LibraryQuery): Promise<ActionResult<LibraryPage>>;
    getPlayById(input: PlayRef): Promise<ActionResult<LibraryPlay>>;
    createPlay(input: NewLibraryPlay): Promise<ActionResult<{ id: string; name: string; isTemplate: boolean }>>;
    deletePlay(input: PlayRef): Promise<ActionResult<{ id: string; detachedSessions: number }>>;
    saveSessionDrill(input: SessionDrillSave): Promise<ActionResult<{ playId: string }>>;
    copySessionDrillToLibrary(input: SessionDrillRef): Promise<ActionResult<{ playId: string }>>;
    duplicatePracticeSession(input: SessionCopy): Promise<ActionResult<{ id: string }>>;
    deletePracticeSession(input: SessionRef): Promise<ActionResult<{ id: string }>>;
    /** Team sharing is hosted-only; a store without it hides the Share control. */
    sharePracticeSession?(input: SessionShare): Promise<ActionResult<{ id: string; isShared: boolean }>>;
}
```

| Method | Hosted implementation | Called by |
|---|---|---|
| `getPlaysByTeam`, `getPlayById`, `createPlay`, `deletePlay` | `lib/actions/plays` | `PlayLibrary` |
| `saveSessionDrill`, `copySessionDrillToLibrary` | `lib/actions/practice-session-drills` | `SessionDrillDialog` |
| `duplicatePracticeSession` | `lib/actions/practice-session-drills` | `DuplicateSessionDialog` |
| `deletePracticeSession`, `sharePracticeSession` | `lib/actions/practice-sessions` | `SessionDetailView` |

**Not in the store:**
- Session create/update and play update. The editors already take those as callbacks from route glue. The static app writes its own glue against its own store in sub-project 3, and extends this interface there if it needs to.
- Reads that server components do (`getPracticeSessionDetail`, `getPracticeSessionForEdit`, `getPlayLibraryContext`).

**Server components keep passing initial data as props, exactly as today.** The store covers only client-side calls.

### `PlannerPlatform`

```ts
export type PlannerLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string; ref?: Ref<HTMLAnchorElement> };
export interface PlannerImageProps { src: string; alt: string; fit: "contain" | "cover" }
export interface PlannerRoutes {
    list(): string;                       // "/practice-planner"
    session(id: string): string;          // "/practice-planner/<id>"
    sessionEdit(id: string): string;      // "/practice-planner/<id>/edit"
    sessionPrint(id: string): string;     // "/practice-planner/<id>/print"
    libraryNew(): string;                 // "/practice-planner/library/new"
    libraryEdit(playId: string): string;  // "/practice-planner/library/<id>/edit"
}
export interface PlannerPlatform {
    Link: ComponentType<PlannerLinkProps>;
    Image: ComponentType<PlannerImageProps>;
    navigate(href: string): void;
    routes: PlannerRoutes;
}
```

**Hosted adapters:**
- `HostedLink` renders `<NextLink {...props} />`, which keeps prefetching and client navigation.
- `HostedImage` renders `<NextImage src alt fill style={{ objectFit: fit }} unoptimized />`, which is exactly what all five call sites pass today.
- `navigate` is `router.push`, memoized over `router`.

The routes cover the six paths the reusable components use today. The static app supplies hash routes (`#/…`) and a plain `<a>` and `<img>` in sub-project 3. The print button stays a plain `<a target="_blank">` with `href={routes.sessionPrint(id)}`.

### Context and provider placement

- `PlannerProvider({ store, platform, children })` provides two contexts.
- `usePlannerStore()` and `usePlannerPlatform()` **throw** outside a provider, with a message that names the provider. A silent default is ruled out:
  - a default using the actions would put `next/*` into the shared module;
  - a default using a plain anchor would quietly turn hosted navigation into full page loads.
- `HostedPlannerProvider` is mounted once per route group, in `app/(dashboard)/practice-planner/layout.tsx` and in `app/(print)/practice-planner/layout.tsx`. Both are server layouts that render the client provider around `children`, as in the Next 16 "Context providers" guide.

### Component changes

| Component | Change |
|---|---|
| `PlayLibrary` | Actions become `store.*`. Pushes become `navigate(routes.libraryEdit(id))` and `navigate(routes.libraryNew())`. `PlayCard` and `StarterPlayCard` use `platform.Image`. |
| `SessionDrillDialog` | `store.saveSessionDrill` and `store.copySessionDrillToLibrary` |
| `DuplicateSessionDialog` | `store.duplicatePracticeSession`, then `navigate(routes.sessionEdit(id))` |
| `SessionDrillCard` | `platform.Image` |
| `SessionDetailView` | Uses `store.deletePracticeSession`, then `navigate(routes.list())`. Uses `store.sharePracticeSession` and renders the Share control only when the store has it. Back, Edit and Edit Session use `component={Link}` with the routes. Print uses `routes.sessionPrint`. Both thumbnails use `platform.Image`. |
| `BenchSheet` | Uses `<Button component={Link} href={routes.session(id)}>`, which is what `LinkButton` renders. `BenchSheetSession` becomes the shared `PracticeSessionView` type, so the type import from `lib/actions` goes. |

**Types:**
- `types/segments.ts` exports `type SegmentKind = "HALF" | "CROSS" | "CUSTOM"`, and the four modules import it from there.
  - A type-level test asserts it equals Prisma's `SegmentKind`, so adding an enum value to the schema fails `type-check` until the union is updated.
  - The two are assignment-compatible both ways, so server components keep passing Prisma-typed data unchanged.
- `types/practice-planner.ts` gains `PracticeSessionView` and `PracticeSessionViewPlay`.
  - These are lifted from `SessionDetailView`'s inline `SessionData` and `SessionPlay`, with the venue fields still optional.
  - `SessionDetailView` (which gets shorter) and `BenchSheet` both use them.

### Guards

**1. ESLint** (`eslint.config.mjs`, block `planner/portable-components`). The core `no-restricted-imports` rule applies with **no type-import exemption**, because the type imports are removed instead.

- **Files:**
  - `components/features/practice-planner/**`
  - `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx` (glob-escaped)
  - `lib/planner-store/**`
  - `lib/plan-document/**`
  - `lib/utils/session-timeline.ts`
  - `types/segments.ts`
  - `types/practice-planner.ts`
- **Ignores:** `components/features/practice-planner/PlanImportView.tsx`, which is hosted-only.
- **Banned imports:**
  - `next` and `next/*`
  - `@/lib/actions/*`, `@/lib/db/*`, `@/lib/auth/*` and `@/auth`
  - `@prisma/client`
  - `server-only`
  - `@/components/ui/NextLinkComposites`
  - the two hosted provider modules
- **Message:** "Portable practice-planner code (ADR-0020): go through usePlannerStore()/usePlannerPlatform() from @/lib/planner-store."

**2. Portability test** (`__tests__/lib/planner-store/portability.test.ts`). It walks **transitive** value imports from these entry points:
- `PracticeSessionEditor`
- `PlayEditor`
- `PlayLibrary`
- `SessionDetailView`
- `BenchSheet`
- `lib/plan-document`
- `lib/planner-store`

It fails on any `next/*`, `@/lib/{actions,db,auth}/*`, `@/auth` or `@prisma/client` import (for `@prisma/client`, type imports count too). This catches leaks through unguarded shared modules (`components/ui/*`, `lib/utils/*`, `lib/hooks/*`) that the per-file lint rule cannot see. The two layers mirror ADR-0003's lint-plus-gate pair.

### Testing

**Test double:** `__tests__/helpers/planner.tsx`.
- `createMockPlannerStore()` returns a `vi.fn` for every method. `getPlaysByTeam` defaults to an empty page.
- `renderWithPlanner(ui, { store?, platform? })` wraps the UI in `PlannerProvider`. The platform defaults to the **real** hosted platform:
  - `next/navigation` is mocked globally in `vitest.setup.ts`, so existing `push` assertions still hold;
  - `next/link` and `next/image` render as they do today.

**No in-memory store in product code.** The static app's real store is IndexedDB, and its contract tests belong with it in sub-project 3.

**Mocks move from `vi.mock("@/lib/actions/…")` to the store double.** Assertions keep the same method names and arguments. These files change:
- `PlayLibrary.test.tsx`
- `SessionDrillDialog.test.tsx`
- `DuplicateSessionDialog.test.tsx`
- all eight `PracticeSessionEditor.*.test.tsx`
- `__tests__/app/practice-session-detail-{stations,timeline}.test.tsx`

**Wrapper only, with no mocks to move:**
- `print/BenchSheet.test.tsx`
- `SessionDrillCard.station.test.tsx`
- `SessionDrillList.busy.test.tsx`

**Dead mock removed:** in `__tests__/app/practice-planner-list-import.test.tsx`, nothing in the list's import graph reaches `practice-session-drills` any more.

**Unchanged and must stay green:**
- `SessionDetailView.line-budget`
- `practice-session-bench-sheet-page`, which mocks `BenchSheet`
- `PlanImportView.test`
- `rsc-boundary-guard`
- every other practice-planner test

**New tests:**
- **Context:** each hook throws outside a provider and returns the provided value inside one.
- **Hosted provider** (all three action modules mocked):
  - each `hostedPlannerStore` method **is** its action, by identity, so no wrapper changes timing or errors;
  - `navigate` calls `router.push`;
  - `routes` return today's literal paths;
  - `HostedLink` and `HostedImage` forward to `next/link` and `next/image` with today's props;
  - both layouts provide the store.
- **Portable behaviour:** with a hash-route platform and a store without `sharePracticeSession`:
  - `SessionDetailView` hides Share, links to `#/…`, and navigates to `routes.list()` after delete;
  - `PlayLibrary` navigates through `routes.libraryNew()`.
- `SegmentKind` equals Prisma's (type-level).
- The portability walk is clean.

**Gates:** `bun run type-check`, `bun run lint`, `bun run test`, `bun run build` (two new layouts), `bun run adr:lint` and `bun run check:raw-sql`. ADR-0020's `affects` gains `lib/planner-store/**`.

## Out of scope

- The static app itself, its IndexedDB store, hash router, starter drills and Pages deploy (sub-project 3), along with any store methods only it needs (session create and update, local list).
- `PracticePlannerList`. It is team-scoped: it shows team name, sharing and the hosted Import page. The static app gets its own list.
- `PlanImportView` and the editor wrappers, which are hosted glue.
- `ExportPlanMenu`'s `process.env.NEXT_PUBLIC_STATIC_PLANNER_URL`. Vite has no `process`, so sub-project 3 handles it with `define`, or replaces the link with "Open in OpenLeague".
- `replace` and `refresh` on the platform. No reusable component calls them, and they get added when one does.
- Moving `SessionDetailView` out of `app/`. The static app can import it through `@/`, and sub-project 3 may move it.
