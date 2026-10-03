# Static Planner App — Design

**Date:** 2026-10-03
**Status:** Accepted
**Sub-project:** 3 of the static planner. Order and decisions are in `2026-10-03-static-planner-roadmap.md`.
**ADR:** ADR-0020 (the static local-first planner). ADR-0005 (Bun), ADR-0004 (MUI), ADR-0011 (fragments carry data, not credentials) also apply.

## Goal

Ship a zero-account practice planner as a Vite single-page app in `apps/planner/`, deployed to GitHub Pages at `https://openleague.dev/planner/`. It reuses the hosted planner's board, library, session editor, detail view, timeline and bench sheet through the `PlannerStore`/`PlannerPlatform` seam from sub-project 2, and keeps every plan in the browser's IndexedDB.

A coach can:
- draw drills in a library that starts with the starter drills;
- build, duplicate, view and print practice sessions (no venue booking, no sharing);
- download a session as a plan file and import plan files;
- open a plan link (`…/planner/#plan=…`) that the hosted **Export plan** menu copies;
- send a session to the hosted platform with **Open in OpenLeague**, which lands on the signed-in hosted import page.

Nothing leaves the browser except a file the coach downloads or a link the coach opens. The static app has no analytics, no telemetry and no backend.

## Context (verified at `c1b7dce`)

**The seam exists and the hosted side implements it.**
- `lib/planner-store/types.ts` declares `PlannerStore` (nine function-property members, `sharePracticeSession` optional) and `PlannerPlatform` (`Link`, `Image`, `navigate`, `routes`).
- `lib/planner-store/context.tsx`: `PlannerProvider`, and `usePlannerStore()`/`usePlannerPlatform()`, which throw outside a provider.
- Hosted adapters: `components/providers/HostedPlannerProvider.tsx` (the server actions, by identity) and `components/providers/hosted-planner-platform.tsx` (`next/link`, `next/image` with `fill` + `style={{ objectFit }}` + `unoptimized`, `router.push`, memoized over `router`).
- Hash routes are already pinned by `createHashPlatform()` in `__tests__/helpers/planner.tsx`: `#/`, `#/sessions/<id>`, `#/sessions/<id>/edit`, `#/sessions/<id>/print`, `#/library/new`, `#/library/<id>/edit`.

**Guards that the static app must pass.**
- ESLint block `adr-0020/portable-practice-planner` (`eslint.config.mjs`) bans `next`, `next/*`, `@/lib/{actions,db,auth}/*`, `@/auth`, `@prisma/client`, `server-only`, `NextLinkComposites` and both hosted provider modules in the portable files.
- `__tests__/lib/planner-store/portability.test.ts` walks transitive imports from seven entries (editor, play editor, library, bench sheet, detail view, `lib/plan-document`, `lib/planner-store`).

**What the reused components need from a host.**

| Component | Props the static app supplies | Notes |
|---|---|---|
| `PlayLibrary` | `teamId`, `mode` (`"manage"` on the library screen; the editor uses `"select"` internally) | `loadPlays` is a `useCallback` over `[store, teamId, currentPage]` and an effect reloads on `[currentPage, dateFilter]`. In manage mode it shows `STARTER_PLAYS` not yet in the library (by name) as "add" cards. Select mode shows only the library. |
| `PlayEditor` | `playId?`, `initialData`, `lockTemplate`, `onSave(play)`, `onCancel` | Autosaves an existing play. |
| `PracticeSessionEditor` | `sessionId?`, `teamId`, `initialData?`, `onSave`, `onShare?`, `onCancel` | `onSave(PracticeSessionSubmitData)` must return `{ success: true, plays?: SavedDrillId[] }` or `{ success: false, error }`. `VenueBookingFields` renders nothing when `venues` and `reservations` are empty. The **Share with Team** button renders whenever `sessionId` is set, even without `onShare`: it would show and "succeed" as a no-op in the static app. |
| `SessionDetailView` (`app/(dashboard)/practice-planner/[sessionId]/`) | `session: PracticeSessionView`, `isAdmin` | Renders `createdByName` with a person icon unconditionally; `teamId`, `teamName`, `createdByName` are required strings. Share renders only when the store has `sharePracticeSession`. Print is `<a href={routes.sessionPrint(id)} target="_blank">`. |
| `BenchSheet` | `session: PracticeSessionView` | Needs `app/(print)/print.css` and a `.bench-print-root` ancestor (hosted: `LightThemeScope` in `app/(print)/layout.tsx`). |
| `ExportPlanMenu` (inside the detail view) | — | Reads `process.env.NEXT_PUBLIC_STATIC_PLANNER_URL` and hard-codes the generator `"openleague-hosted"` in `buildPlanDocument`. |
| `PlanPreview` | `plan` | Portable. |

**Hosted-only glue the static app replaces.** The editor wrappers (`PracticeSessionEditorWrapper`, `EditSessionWrapper`, `PlayEditorWrapper`), the pages, `PracticePlannerList` and `PlanImportView`. `readPlanFile` (size check, JSON, `parsePlan`) lives in `PlanImportView.tsx`, which imports a server action and `next/navigation`, so the static app cannot import it. `duplicateSessionTitle` lives in `lib/services/practice-session-drills.ts`, which imports `@prisma/client`.

**Hosted semantics the UI depends on** (from `lib/actions/plays.ts`, `practice-session-drills.ts`, `practice-sessions.ts`, `lib/services/practice-session-drills.ts`, `practice-session-queries.ts`):
- Library listings show only unowned plays (`sessionId: null`), filtered by `isTemplate`, newest `createdAt` first, 20 per page with `total/page/limit`, search on name or description (case-insensitive), and a date filter on `createdAt` (today, this week from Sunday, this month).
- `getPlayById` returns only unowned plays; an unreadable diagram fails with `details: { code: PLAY_DATA_UNREADABLE_CODE }`.
- `deletePlay` refuses a session-owned copy ("This drill belongs to a practice session. Remove it from that session.").
- `saveSessionDrill`: no `playId` → new owned copy; owned by this session → updated in place; a library play → forked into a new owned copy with `sourcePlayId`; anything else → `SESSION_DRILL_REJECTED_MESSAGE`.
- `copySessionDrillToLibrary` copies an owned drill into a new library template; otherwise "Drill not found in this session".
- A session save materializes each drill: an owned copy is kept (a second card on the same copy gets a clone), a library play is cloned, anything else rejects the whole save. It returns `clientKey → playId`. Afterwards, owned copies the session referenced before and no longer references are deleted ("drop-only": a copy the drill dialog created but the editor has not yet sent survives).
- `duplicatePracticeSession` clones every drill into a new unshared session titled `Copy of <title>` (≤ 100 chars) on the chosen date.
- Deleting a session deletes its owned copies.
- The edit read path runs `normalizeGroups` and flags unreadable diagrams `playDataUnreadable`; the detail read path maps them to `playData: null`.

**Tooling facts.**
- `vite@7.1.9` is installed only transitively (through Vitest); `@vitejs/plugin-react@4.7.0` is a direct devDependency and accepts `vite ^7`.
- The root `tsconfig.json` includes `**/*.ts(x)`, so `apps/planner` is type-checked by `bun run type-check` with no new config. `next-env.d.ts` references `next/image-types/global`, which declares `*.svg`-style modules; `vite/client` declares the same module names, so referencing it in the shared program risks conflicting declarations.
- `vitest.config.ts` uses the default test glob and the `@` alias, so tests under `__tests__/apps/planner/` run in `bun run test`.
- `eslint .` lints everything except `dist/**` and friends.
- jsdom has no IndexedDB.
- `lib/theme.ts` is MUI-only. Cabinet Grotesk comes from a Fontshare `@import` in `app/globals.css`; `--font-mono` (JetBrains Mono) comes from `next/font` in `app/layout.tsx` and is used by `SessionTimeline`.
- `process.env` appears in portable code only in `ExportPlanMenu` (`NEXT_PUBLIC_STATIC_PLANNER_URL`). Other hits (`lib/utils/error-handling.ts`, `security.ts`, `rate-limit.ts`, `durable-rate-limit.ts`, `components/ui/ErrorBoundary.tsx`) are outside the planner's import graph today; the build check below catches any that arrive.

**Domains.** The hosted platform is `https://openl.app` (`app/robots.ts`, README, DEPLOYMENT.md). The Pages site is `openleague.dev` (`scripts/build-docs-pages.ts` writes the `CNAME`). The planner URL is therefore `https://openleague.dev/planner/`, and the hosted import page is `https://openl.app/practice-planner/import` (`PLAN_IMPORT_PATH`).

**Pages pipeline.** `docs-pages.yml` runs `bun run docs:build-pages`, which deletes and rewrites `dist/docs-pages`, then uploads that directory. Its `paths:` filter covers docs sources only, so a change to a shared planner component would not redeploy a planner built from it.

## Design

### 1. Build, layout and tooling

**One package, one lockfile.** `apps/planner/` has no `package.json`. Root scripts drive it, and the root lockfile pins it:
- a second package would need a Bun workspace, which changes `bun install` for the whole repository and splits the dependency graph that `@/` imports share (React, MUI, Zod must be the same instances);
- ADR-0005's single-toolchain rule stays simple.

**New devDependencies** (no runtime dependencies):
- `vite` `^7.1.9`, made explicit because the scripts call its CLI. It is the version Vitest already resolves, so the lockfile adds no new copy.
- `fake-indexeddb` `^6`, test-only: jsdom has no IndexedDB, and this is the only way to run the real IndexedDB adapter's upgrade, transaction and abort paths under Vitest.

No IndexedDB wrapper library: the adapter is about 120 lines over three object stores, and `idb` would add a runtime dependency for convenience only.

**Files.**

```
apps/planner/
  index.html            # <div id="root">, module script, font links, theme-color
  vite.config.ts        # root, base, alias, define, CSP plugin, onwarn, outDir
  src/
    main.tsx            # boot: open storage, seed starters, render once
    env.d.ts            # declare const __OPENLEAGUE_HOSTED_URL__: string
    config.ts           # hosted URL, local team constants
    routes.ts           # staticRoutes, matchRoute(hash)
    platform.tsx        # StaticLink, StaticImage, staticPlannerPlatform, useHashRoute
    theme.tsx           # StaticThemeProvider
    static.css          # --font-mono, base body rules
    App.tsx             # providers, shell, route switch
    store/
      records.ts        # StoredPlay/StoredSession, PlannerRepo/RepoTx
      idb-repo.ts       # IndexedDB adapter
      memory-repo.ts    # in-memory adapter (fallback + tests)
      shared.ts         # results, errors, ids, play-record helpers
      library.ts        # library and drill operations
      sessions.ts       # session operations, import
      local-store.ts    # createLocalPlannerStore: composes the two
      open-store.ts     # IndexedDB or fallback, persistence request
    screens/            # one file per screen (§5)
```

**Root scripts.**
- `planner:dev` → `vite --config apps/planner/vite.config.ts`
- `planner:build` → `vite build --config apps/planner/vite.config.ts`
- `planner:preview` → `vite preview --config apps/planner/vite.config.ts`
- `planner:check` → `bun scripts/check-planner-build.ts`

**`vite.config.ts`.**
- `root: apps/planner`, `base: "./"`. Relative asset URLs work at `/planner/`, at a fork's `/<repo>/planner/`, and under `vite preview`. Hash routing means the server never sees app paths, so no 404 fallback is needed.
- `resolve.alias`: `@` → repository root (the same alias as `tsconfig.json` and `vitest.config.ts`).
- `plugins: [react()]`.
- `define`:
  - `__OPENLEAGUE_HOSTED_URL__`: `OPENLEAGUE_HOSTED_URL` from the build environment, trimmed and stripped of trailing slashes, default `https://openl.app`. The config throws when the value is not an `https:` URL (or `http://localhost…` for local testing).
  - `process.env.NODE_ENV`: `JSON.stringify(mode)`, explicit.
- `build.outDir`: `dist/planner` (repository root), `emptyOutDir: true`, `target: "es2022"`, `sourcemap: false`.
- `build.rollupOptions.onwarn`: drops `MODULE_LEVEL_DIRECTIVE` warnings (the shared modules' `"use client"` lines) and forwards everything else.
- A build-only plugin (`apply: "build"`) adds the Content-Security-Policy `<meta>` in `transformIndexHtml`. It is build-only because the dev server injects inline scripts for React Refresh.

**Type-checking.** The root `tsc` covers `apps/planner`. The app does not reference `vite/client`; it declares the one build constant in `apps/planner/src/env.d.ts` and reads it through `typeof __OPENLEAGUE_HOSTED_URL__ === "string"`, so the module also loads under Vitest, where the constant is not defined.

**Lint.**
- `apps/planner/**` joins the `adr-0020/portable-practice-planner` file list, so the app can never import `next/*`, actions, auth, Prisma or the hosted providers.
- `StaticImage` renders a real `<img>`, so it carries an `eslint-disable-next-line @next/next/no-img-element` with its reason, as the test helper already does.

**Portability walk.** `apps/planner/src/main.tsx` joins `ENTRIES` in `portability.test.ts`. The walk then covers every module the static bundle reaches.

**Build check** (`scripts/check-planner-build.ts`, run after `planner:build`). It reads `dist/planner` and fails when:
- `index.html` is missing, references an absolute `/assets/` path, or lacks the CSP meta;
- any emitted `.js` or `.html` contains `process.env`, `NEXT_PUBLIC_`, `__NEXT_DATA__`, `next/dist`, or a telemetry host (`sentry.io`, `ingest.sentry`, `googletagmanager.com`, `google-analytics.com`, `umami`, `_vercel/insights`, `vitals.vercel`);
- the bundle contains no `#plan=` handling (a guard against a build that silently dropped the import route): it must contain the literal `openleague.practice-plan`.

The checker's rules are unit-tested against fixture directories.

### 2. Changes to shared code

Each is small, keeps hosted behaviour, and removes something the static app cannot otherwise do.

**a. The platform carries the plan hand-off.** `PlannerPlatform` gains two required members:

```ts
export interface PlannerPlanLink {
    /** Menu item label. */
    label: string;
    /** "copy" writes the link to the clipboard; "open" opens it in a new tab. */
    mode: "copy" | "open";
    /** Absolute URL; the menu appends `#plan=<encoded>` (any existing fragment is dropped). */
    baseUrl: string;
}

export interface PlannerPlatform {
    // …existing members
    /** Written into exported plan documents. */
    planGenerator: PlanGenerator;
    /** The Export menu's link item, or null for none. */
    planLink: PlannerPlanLink | null;
}
```

- Required, not optional, so the compiler proves both platforms and the test helper set them.
- **Hosted:** `planGenerator: "openleague-hosted"`; `planLink` is `{ label: 'Copy “Open in planner” link', mode: "copy", baseUrl }` when `NEXT_PUBLIC_STATIC_PLANNER_URL` is set (read in `useHostedPlannerPlatform`, which Next inlines at build), otherwise `null`. That is exactly today's menu.
- **Static:** `planGenerator: "openleague-static"`; `planLink` is `{ label: "Open in OpenLeague", mode: "open", baseUrl: \`${HOSTED_URL}${PLAN_IMPORT_PATH}\` }`.
- `ExportPlanMenu` reads both from `usePlannerPlatform()` and no longer touches `process.env`. `buildPlanDocument(session, now?, generator = "openleague-hosted")` gains a trailing parameter, so existing calls are unchanged.
- **Open mode** runs inside the click. The import check is synchronous, so the tab is opened before anything is awaited and popup blockers allow it: `window.open("", "_blank")`, then `tab.opener = null`, then the link is encoded and the tab is sent there with `tab.location.replace(url)`. If the browser returned no tab, the current tab navigates instead (plans are already saved). On a too-large plan or an encoding error, the blank tab is closed and the same notices as copy mode appear. Success notice: "Opened OpenLeague in a new tab. Sign in there to save this plan to a team."

**b. The editor shows Share only with a share handler.** `PracticeSessionEditor` renders the Share button when `sessionId && onShare`. Hosted `EditSessionWrapper` always passes `onShare`; the new-session wrapper has no `sessionId`. Hosted output is unchanged.

**c. `readPlanFile` moves to `lib/plan-document/file.ts`**, with `FILE_TOO_LARGE_MESSAGE`. `PlanImportView` imports and re-exports both, so its tests and callers are unchanged.

**d. `duplicateSessionTitle` moves to `lib/utils/session-drill-ids.ts`** (already the portable home of `SESSION_DRILL_REJECTED_MESSAGE`). `lib/services/practice-session-drills.ts` re-exports it.

**e. ADR-0020 `affects`** gains `components/features/practice-planner/**`, `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx`, `components/providers/HostedPlannerProvider.tsx` and `components/providers/hosted-planner-platform.tsx` (the sub-project 2 carry-over), and action item 3 is ticked.

### 3. The local store

**Layers.**
1. `PlannerRepo`: a transactional record store with two adapters, IndexedDB and memory.
2. `createLocalPlannerStore(repo, options)`: the hosted semantics over records, written once, implementing `LocalPlannerStore`.

```ts
/** PlannerStore plus what the static glue needs (the hosted equivalents are server components and wrappers). */
export interface LocalPlannerStore extends PlannerStore {
    listSessions: () => Promise<ActionResult<LocalSessionSummary[]>>;
    getSessionView: (id: string) => Promise<ActionResult<PracticeSessionView>>;
    getSessionForEdit: (id: string) => Promise<ActionResult<LocalSessionEdit>>;
    createSession: (input: LocalSessionSave) => Promise<ActionResult<LocalSessionSaved>>;
    updateSession: (id: string, input: LocalSessionSave) => Promise<ActionResult<LocalSessionSaved>>;
    updatePlay: (input: LocalPlayUpdate) => Promise<ActionResult<{ id: string }>>;
    importPlan: (plan: PlanDocument, options: { date: Date; addToLibrary: boolean }) => Promise<ActionResult<{ sessionId: string }>>;
    seedStarterDrills: () => Promise<void>;
}
```

The members are function properties, as in `PlannerStore`, so `strictFunctionTypes` checks their parameters. `sharePracticeSession` is **absent**, which hides Share in the detail view.

**Records.**

```ts
interface StoredPlay {
    id: string;
    name: string;
    description: string | null;
    thumbnail: string | null;
    playData: unknown;            // validated on read, as hosted
    isTemplate: boolean;
    sessionId: string | null;     // set = a session-owned copy
    sourcePlayId: string | null;  // provenance of a fork or clone
    createdAt: Date;
    updatedAt: Date;
}
interface StoredSessionRow { id: string; playId: string; sequence: number; duration: number; instructions: string; runsWithPrevious: boolean }
interface StoredSession { id: string; title: string; date: Date; duration: number; rows: StoredSessionRow[]; createdAt: Date; updatedAt: Date }
```

A session embeds its rows, so a session save is one record write plus play writes.

**IndexedDB.**
- Database `openleague-planner`, version 1.
- Object stores: `plays` (keyPath `id`, index `bySession` on `sessionId`), `sessions` (keyPath `id`), `meta` (keyPath `key`).
- `null` is not a valid IndexedDB key, so library plays never enter `bySession`, and the index holds exactly the owned copies.
- `onupgradeneeded` switches on `oldVersion` (`< 1` creates everything). Later versions add cases and never drop data.
- Every store operation is one transaction over all three object stores. The repo resolves only on the transaction's `complete` event and aborts it when the work throws, so a rejected save leaves nothing behind.
- **Rule for store code:** inside `repo.write(work)`, `work` awaits only `RepoTx` calls and otherwise runs synchronously (validation, `parsePlan`, sanitizing). Awaiting anything else lets IndexedDB commit the transaction early. Thumbnails are therefore generated before a transaction starts.
- `onversionchange` closes the connection and shows a "reload to continue" banner (a newer tab upgraded the schema).

**Memory adapter.** Maps, cloned with `structuredClone` on every read and write (IndexedDB's copy semantics), with writes applied to a draft and committed only when the work resolves, and serialized through a promise queue. `durable: false`. It is the production fallback when IndexedDB is missing or fails to open, and the second target of the contract suite. Sub-project 2's "no in-memory store in product code" ruling was about hosted code; it does not extend to `apps/planner/**`, where the fallback has a production job.

**Semantics.** Each store method mirrors its hosted action (Context above) with these local specifics:

| Method | Local behaviour |
|---|---|
| `getPlaysByTeam` | All plays, filtered and paginated in memory (libraries are small). Ties on `createdAt` sort by name. |
| `getPlayById` | Unowned plays only; unreadable → `{ error: PLAY_DATA_UNREADABLE_MESSAGE, details: { code: PLAY_DATA_UNREADABLE_CODE } }`. |
| `createPlay` | Validates name (1–100 after cleaning), description (≤ 1000), `sanitizePlayDataForWrite`. Owned copies never come from here. |
| `updatePlay` | Library plays only. Sessions hold their own copies, so nothing else changes. |
| `deletePlay` | Refuses owned copies with the hosted message. `detachedSessions` is always `0`: no session ever references a library play. |
| `saveSessionDrill`, `copySessionDrillToLibrary`, `duplicatePracticeSession`, `deletePracticeSession` | As hosted. |
| `createSession`, `updateSession` | Materialize (keep / clone / reject), write rows, delete orphans (drop-only), return `{ id, plays: SavedDrillId[] }`. |
| `importPlan` | One session plus one owned copy per drill; with `addToLibrary`, separate library templates too. Thumbnails come from `options.makeThumbnail`. |
| `seedStarterDrills` | Once per database: when `meta.startersSeeded` is unset, adds every `STARTER_PLAYS` entry whose name is not already in the library, then sets the flag. Deleting a starter later never re-seeds it, and `PlayLibrary`'s "add starter" card offers it again. |

**Every stored session is a valid plan.** `createSession`, `updateSession`, `duplicatePracticeSession` and `importPlan` validate the final session by building its plan document (`serializePlan`) and running `parsePlan` inside the transaction, after checking sequences are contiguous and client keys unique. That enforces the hosted save rules (title, durations, ≤ 50 drills, instructions length, station groups, wall time ≤ duration) and guarantees every session can be exported and imported by the hosted platform. A failure returns the first issue as `error` and all issues in `details`.

**Seeding** runs once in `main.tsx` before the first render, so the editor's select-mode library (which shows no starter cards) is never empty on first run.

**Persistence.** After the first successful write, the store calls `navigator.storage.persist()` once (guarded by `meta.persistRequested`) and ignores the answer. Browsers may still evict site data, Safari after 7 days without a visit; the privacy note says so and recommends downloading plan files as backups.

**Options.** `createLocalPlannerStore(repo, { now?, newId?, makeThumbnail? })`. Defaults: `() => new Date()`, `crypto.randomUUID`, and no thumbnail. `main.tsx` passes `generateThumbnail` wrapped in a `try`.

**Referential stability (sub-project 2 carry-over).** `main.tsx` creates the store exactly once and passes it into `<PlannerApp store>`; `staticPlannerPlatform` is a module-level constant. `PlayLibrary.loadPlays` depends on `store`, so a store or platform rebuilt per render would refetch in a loop. A test re-renders the app and asserts `getPlaysByTeam` ran once.

### 4. Platform and routing

**Constants** (`config.ts`):
- `HOSTED_URL`: the build constant, else `https://openl.app`.
- `LOCAL_TEAM_ID = "local"`, `LOCAL_TEAM_NAME = "This device"`, `LOCAL_AUTHOR_NAME = "You"`. These fill `PracticeSessionView`'s required `teamId`, `teamName` and `createdByName`; the team ID is what the static glue passes as `teamId` to every component, and the store ignores it.

**Routes** (`routes.ts`). `staticRoutes` implements `PlannerRoutes` with the pinned hash shapes and adds `library()` → `#/library`, `sessionNew()` → `#/sessions/new` and `importPlan()` → `#/import`. `matchRoute(hash)` is pure and returns:

```ts
type StaticRoute =
    | { name: "list" }
    | { name: "sessionNew" }
    | { name: "session" | "sessionEdit" | "sessionPrint"; id: string }
    | { name: "library" }
    | { name: "libraryNew" }
    | { name: "libraryEdit"; id: string }
    | { name: "import" }
    | { name: "planLink"; value: string }
    | { name: "notFound" };
```

- `""`, `#`, `#/` → `list`.
- A hash holding `plan=` (with or without a leading `/`) → `planLink`, read with `planFragmentValue` from `lib/plan-document/pending.ts`.
- IDs are decoded with `decodeURIComponent` and must be non-empty and contain no `/`.

**Platform** (`platform.tsx`):
- `StaticLink`: a plain `<a>` with the given props (hash `href`s navigate natively).
- `StaticImage`: an `<img>` with `position: absolute; inset: 0; width: 100%; height: 100%; object-fit: <fit>`, which is what `next/image`'s `fill` renders. A bare `<img>` would overflow or collapse the positioned thumbnail boxes.
- `navigate(href)`: assigns `window.location.hash` for `#…` hrefs, otherwise `window.location.assign(href)`.
- `useHashRoute()`: `useSyncExternalStore` over `hashchange`, returning `matchRoute(location.hash)`.

### 5. Screens

All screens render inside `AppShell` except the bench sheet. `AppShell` is an MUI `AppBar` titled "OpenLeague Planner" with navigation to Practices (`#/`), Drill library (`#/library`) and Import (`#/import`), a fallback-storage banner when `durable` is false, and a footer with the privacy note and a link to `https://openl.app` ("Team sharing, RSVPs and venue booking live in OpenLeague").

| Route | Screen | Behaviour |
|---|---|---|
| `list` | `SessionListScreen` | `store.listSessions()`, newest date first, as cards with title, long date and time, duration and drill count, linking to the detail. **New practice** (`#/sessions/new`), **Import plan** (`#/import`). Empty state: "Plan your first practice" with both actions. |
| `sessionNew` | `SessionEditorScreen` | `PracticeSessionEditor` with no `sessionId`, `teamId={LOCAL_TEAM_ID}` and no venue props. Save → `createSession` → `navigate(routes.sessionEdit(id))` (diagram editing needs a saved session, as hosted). Cancel → list. |
| `sessionEdit` | `SessionEditorScreen` | `getSessionForEdit(id)` → editor with `sessionId` and `initialData`, `onSave` → `updateSession`, mapped exactly like `EditSessionWrapper`'s payload (`clientKey: play.id`, `instructions \|\| ""`). No `onShare`. Cancel → detail. |
| `session` | `SessionDetailScreen` | `getSessionView(id)` → `SessionDetailView` with `isAdmin`. |
| `sessionPrint` | `BenchSheetScreen` | `getSessionView(id)` → `BenchSheet` inside `LightThemeScope className="bench-print-root"`, importing `@/app/(print)/print.css`. No shell. |
| `library` | `LibraryScreen` | `PlayLibrary mode="manage"` with a header. |
| `libraryNew`, `libraryEdit` | `DrillEditorScreen` | Mirrors `PlayEditorWrapper`: `lockTemplate`, create → `createPlay({ isTemplate: true })` then `#/library`; edit → `updatePlay`, stays (autosave); unreadable diagram → error alert with editing disabled. |
| `import`, `planLink` | `ImportScreen` | §6. |
| `notFound` | inline | "This page doesn't exist." with a link to the list. |

A missing session or play shows "This practice isn't on this device." (or "…drill…") with a link back, never a blank page.

### 6. Import, export and hand-off

**File import** (`#/import`): a file picker; `readPlanFile` (size first, then JSON, then `parsePlan`); errors render like `PlanImportView` (message plus issues, "Choose another file").

**Link import** (`#planLink`): on mount, the screen captures the value once (a ref, so StrictMode's replay doesn't lose it), replaces the URL with `#/import` through `history.replaceState` so the plan never lingers in the address bar or history (no `hashchange` fires, so the screen stays), then `readPlanLink(value)`. A `#plan=` link pasted into an already-open tab arrives as a `hashchange` and routes the same way.

**Preview and save.** `PlanPreview`, then a form with one checkbox, "Also add these drills to my library" (off), and **Save to my practices**. The session date is the plan's local date and start time in the browser's zone (`parseDateTimeLocalToUtc`), or now when the plan has none; the coach changes it in the editor. Save → `importPlan` → `navigate(routes.session(id))`.

**Export.** The detail view's **Export plan** menu downloads `planFileName(title)` with `generator: "openleague-static"` and offers **Open in OpenLeague** (§2a). A hosted coach who isn't signed in goes through the login stash flow sub-project 1 built.

**Hosted → static.** The hosted menu's "Copy “Open in planner” link" produces `https://openleague.dev/planner/#plan=…`, which `matchRoute` sends to `planLink`. It works once the owner sets `NEXT_PUBLIC_STATIC_PLANNER_URL`.

### 7. Theme and print

`StaticThemeProvider`: MUI `ThemeProvider` with `lib/theme.ts`, `defaultMode="system"`, `disableTransitionOnChange`, plus `CssBaseline` and `LocalizationProvider` with `AdapterDateFns` (the editor's `DateTimePicker` needs it). It drops `AppRouterCacheProvider` (Next-only) and `InitColorSchemeScript` (its value is an inline pre-paint script for SSR; the CSP forbids inline scripts, and a client-rendered SPA has no server markup to flash).

Fonts follow the hosted app so the "Digital Playbook" typography matches:
- Cabinet Grotesk from the same Fontshare stylesheet, via `<link>` in `index.html`;
- JetBrains Mono from Google Fonts, and `static.css` sets `--font-mono: "JetBrains Mono", ui-monospace, monospace` for `SessionTimeline` and friends.

These are the only third-party requests. They carry no plan data, and the privacy note names them.

**CSP** (build meta): `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://api.fontshare.com https://fonts.googleapis.com; font-src 'self' https://cdn.fontshare.com https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'`. Emotion needs `'unsafe-inline'` styles; thumbnails are `data:` PNGs; downloads use `blob:` URLs.

### 8. Privacy

The footer and the import screen carry the same note (the empty practice list relies on the footer's, so it shows once):

> Your practices stay in this browser. Nothing is uploaded, and there's no account or tracking. Browsers can clear site data, so download plan files to keep a backup. Fonts load from Fontshare and Google Fonts, which see your IP address like any website.

There is no analytics provider, no Sentry, no service worker and no network call besides the two font stylesheets. The build check enforces the telemetry part.

### 9. Deploy and CI

**Pages** (`docs-pages.yml`):
- Steps after `docs:build-pages`: `bun run planner:build`, `bun run planner:check`, then `cp -R dist/planner dist/docs-pages/planner`. The docs build deletes `dist/docs-pages` first, so the planner is copied in last.
- The `paths:` filter adds every source the planner bundles: `apps/planner/**`, `components/**`, `lib/**`, `types/**`, `app/(dashboard)/practice-planner/**`, `app/(print)/**`, `scripts/check-planner-build.ts`. Without that, a shared-component fix would leave the deployed planner stale.
- `OPENLEAGUE_HOSTED_URL` is not set in the workflow; the default `https://openl.app` is the production value.

**Pull requests** (`quality-gates.yml`): after the unit tests, `bun run planner:build` and `bun run planner:check`. A shared change that breaks the static bundle fails its PR instead of the next Pages deploy (ADR-0020's "a planner build failure can block a docs deploy" trade-off).

**Deployment check**: `deployment:check` also runs the two planner scripts, so `deployment-checks.yml` exercises the same pipeline as Pages.

## Error handling

| Condition | Behaviour |
|---|---|
| `indexedDB` undefined, or `open` rejects (private mode, blocked storage) | Memory store; a persistent warning banner: "This browser isn't letting the planner save. Your work will be lost when you close this tab. Download plan files to keep it." |
| `open` blocked by an older tab, or `versionchange` | "The planner was updated in another tab. Reload to continue." with a Reload button. Writes are refused until reload. |
| `QuotaExceededError` (by name, from a request or the commit) | `{ success: false, error: "Your browser is out of storage space for this site. Download plan files to back up, then delete old practices or drills." }`. The transaction is aborted. |
| Any other store exception | Logged with `console.error`; the method's hosted fallback message ("Failed to … Please try again."). |
| Missing session or play on a route | The not-on-this-device message with a link back. |
| Unreadable stored diagram | Library edit refuses (as hosted); detail and bench sheet show "unreadable" as hosted; the editor gets an empty board flagged `playDataUnreadable`. |
| Plan file > `MAX_PLAN_FILE_BYTES` | Refused before parsing (`FILE_TOO_LARGE_MESSAGE`). |
| Plan file or link not a plan / newer version / invalid | `parsePlan` messages; link decode failures use `readPlanLink`'s messages (`LINK_UNREADABLE_MESSAGE`, `LINK_TOO_LARGE_TO_OPEN_MESSAGE`). |
| Open in OpenLeague: plan too large / can't be imported / popup blocked | Too large → `LINK_TOO_LARGE_MESSAGE` and the blank tab closes; import problem → the existing warning; no tab → navigate the current tab. |
| `navigator.storage.persist` missing or rejecting | Ignored. |
| An uncaught render error | A root error boundary: "Something went wrong. Your saved practices are safe in this browser." with Reload. |

## Testing

**Contract suite** (`__tests__/apps/planner/local-store.contract.test.ts`): one `describe.each` over `memory` (`createMemoryRepo()`) and `indexeddb` (`openIdbRepo(new IDBFactory(), uniqueName)` from `fake-indexeddb`). Cases:
- Library: lists only unowned templates, newest first, search, pagination totals, date filters with a pinned clock (`vi.useFakeTimers` + `setSystemTime`; absolute-date fixtures have rotted in this suite before).
- `createPlay` validation; `getPlayById` refuses owned copies and reports unreadable diagrams with the code; `updatePlay` library-only; `deletePlay` refuses owned copies and leaves sessions untouched.
- Session create: library picks become owned clones with `sourcePlayId`; the mapping comes back per client key; the library play is unchanged and the clones never list.
- Session update: owned copies kept; a second card on the same copy gets a clone; a dropped drill's copy is deleted; a dialog-created copy that was never sent survives the update and goes with the session delete.
- Rejections are atomic: an unknown or foreign play ID returns `SESSION_DRILL_REJECTED_MESSAGE` and changes nothing; wall time over the duration returns the plan issue and writes nothing.
- `saveSessionDrill` (create, update in place, fork a library play, reject another session's copy, missing session), `copySessionDrillToLibrary`, `duplicatePracticeSession` (title, date, distinct clones, row scalars), `deletePracticeSession` (cascade only its copies).
- Read models: `getSessionView` maps unreadable diagrams to `null`; `getSessionForEdit` normalizes groups and flags unreadable diagrams.
- `importPlan` with and without `addToLibrary`.
- Every saved session exports: `parsePlan(buildPlanDocument(view))` succeeds.
- `seedStarterDrills` is idempotent and doesn't re-seed a deleted starter.

**IndexedDB-only** (`idb-repo.test.ts`): data survives close and reopen; the upgrade creates the stores and index; a throwing `work` aborts the transaction; a quota error maps to the storage-full result.

**App** (Testing Library, memory repo, the real static platform):
- `matchRoute` table, including `#plan=` with and without `/`, encoded IDs, and junk.
- `StaticImage` styles (absolute fill and `object-fit`), not just a `data-` attribute; `StaticLink` renders a hash `href`.
- Stability: re-rendering `PlannerApp` with the same store calls `getPlaysByTeam` once on `#/library`.
- Each screen renders its component with the right props, including the not-on-this-device states.
- Import: a `#plan=` hash is captured, replaced by `#/import`, previewed and saved, then the app navigates to the new session; file import errors.
- `ExportPlanMenu` open mode: opens a blank tab synchronously, sends it to `https://openl.app/practice-planner/import#plan=…` whose payload decodes to the plan with `generator: "openleague-static"`; closes it on a too-large plan; falls back to the current tab when no tab opens.
- The fallback banner appears when `open-store` reports `durable: false`.

**Shared changes:** existing `ExportPlanMenu` tests move from `render` to `renderWithPlanner` and keep their assertions; the editor hides Share without `onShare`; the helper's `createHashPlatform()` gains `planGenerator` and `planLink`; `portability.test.ts` gains the static entry.

**Build:** `scripts/check-planner-build.ts` unit tests over fixtures, and `bun run planner:build && bun run planner:check` in the gates.

**Gates:** `bun run type-check`, `bun run lint`, `bun run test`, `bun run build` (hosted, because shared components changed), `bun run planner:build`, `bun run planner:check`, `bun run adr:lint`, `bun run check:raw-sql`.

## Out of scope

- HTML and `.docx` bench-sheet exports (sub-project 4); Drive and OneDrive saving (sub-project 5).
- Offline install (service worker, web manifest). The app works offline once loaded, but nothing caches it for a cold start.
- Backup or restore of everything at once (a multi-plan file is format version 2).
- Venue booking, sharing, RSVPs, accounts and notifications in the static app.
- Moving `SessionDetailView` out of `app/`; the static app imports it through `@/`.
- Self-hosting the fonts.
- A link to the planner from the docs site navigation or the hosted planner (copy and placement are an owner decision).

## Owner actions

1. **Vercel:** set `NEXT_PUBLIC_STATIC_PLANNER_URL=https://openleague.dev/planner/` for Production (and Preview if wanted), then redeploy. Until then the hosted Export menu has no "Open in planner" item.
2. **GitHub Pages:** none beyond the merge. The custom domain `openleague.dev` comes from the `CNAME` the docs build writes, and the planner deploys at `/planner/` with the next Pages run.
3. **Optional:** set `OPENLEAGUE_HOSTED_URL` as a workflow variable only if the hosted domain ever changes from `https://openl.app`.
