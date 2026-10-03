# Planner Store Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every runtime coupling of the reusable practice-planner components through a `PlannerStore` and a `PlannerPlatform` provided by React context. Hosted behaviour stays identical: the hosted store's methods *are* the server actions, and the hosted platform *is* `next/link`, `next/image` and `router.push`.

**Architecture:**
- **Shared and guarded:** `lib/planner-store/` holds the types and the context hooks.
- **Hosted adapters:**
  - `components/providers/hosted-planner-platform.tsx` (Next only);
  - `components/providers/HostedPlannerProvider.tsx` (the server actions).
- **Mounting:** two route-group layouts mount the provider.
- **Components moved behind the seam:** `PlayLibrary`, `SessionDrillDialog`, `SessionDrillCard`, `DuplicateSessionDialog`, `SessionDetailView` and `BenchSheet`.
- **Portable types:** `SegmentKind` and the session-view types become local types.
- **Two guards keep it that way:**
  - an ESLint `no-restricted-imports` block (per file, authoring time);
  - a Vitest walk of transitive imports (the merge gate).

**Tech Stack:** TypeScript 5.9 (strict), Next.js 16.3 App Router, React 19.2, MUI v7, Vitest 4 + Testing Library (jsdom), ESLint 9 flat config, Bun.

**Spec:** `docs/superpowers/specs/2026-10-03-planner-store-design.md`. Context: `docs/superpowers/specs/2026-10-03-static-planner-roadmap.md` (row 2) and `docs/adr/0020-exchange-practice-plans-as-a-portable-versioned-document-and-ship-a-static-local.md`.

## Global Constraints

- **Base.** Branch `feat/planner-store`. Product code is unchanged since `8ce6e25`, and every line number below is taken there. If a line has shifted, find the edit by its quoted anchor text.
- **Toolchain.**
  - Use `bun` for everything: `bun run test <files>`, `bun run type-check`, `bun run lint`, `bun run build`. Never use npm or yarn.
  - Use `/usr/bin/git`. Never `git stash`, and never switch branches.
- **Scope.**
  - No new dependencies, no schema change and no migration.
  - No change to any file in `lib/actions/`, to any page, or to the editor wrappers (`PracticeSessionEditorWrapper`, `EditSessionWrapper`, `PlayEditorWrapper`). The same applies to `PracticePlannerList`, `PlanImportView` and `ExportPlanMenu`.
- **Behaviour.** Hosted behaviour must not change:
  - every server action receives exactly the arguments it receives today;
  - every link and navigation goes to exactly today's path;
  - every thumbnail renders through `next/image` with `fill`, `unoptimized` and today's `objectFit`.
- **Existing tests.** Practice-planner tests keep their assertions. The only edits allowed are:
  - moving a mock from `vi.mock("@/lib/actions/…")` to the store double;
  - switching `render` to `renderWithPlanner`;
  - deleting the one dead mock named in Task 4.

  Any other change to an existing test is a defect in the refactor, not the test.
- **ADRs.**
  - **0002:** mutations stay server actions. The store is a client-side facade with no API route.
  - **0003:** no SQL is touched (`bun run check:raw-sql`).
  - **0004:** MUI.
  - **0005:** Bun.
  - **0020:** this is the storage seam it calls for.
- **Copy, verbatim.**
  - The missing-provider error: `Practice-planner components must render inside <PlannerProvider>. Hosted routes get one from HostedPlannerProvider in app/(dashboard)/practice-planner/layout.tsx and app/(print)/practice-planner/layout.tsx.`
  - The lint message: `Portable practice-planner code (ADR-0020) must not import server actions, Prisma, auth or Next.js runtime modules. Use usePlannerStore()/usePlannerPlatform() from @/lib/planner-store, and local types.`
- **Hosted routes, verbatim:**
  - `list` → `/practice-planner`
  - `session(id)` → `/practice-planner/${id}`
  - `sessionEdit(id)` → `/practice-planner/${id}/edit`
  - `sessionPrint(id)` → `/practice-planner/${id}/print`
  - `libraryNew` → `/practice-planner/library/new`
  - `libraryEdit(id)` → `/practice-planner/library/${id}/edit`
- **Line budget.** `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx` must stay at or under 900 lines (`__tests__/app/SessionDetailView.line-budget.test.ts`). It is 846 at `8ce6e25`. This plan removes about 45 lines.
- **Next 16 RSC boundary.** Never pass `component={Link}` from a Server Component. Every file in this plan that does it is a `"use client"` component, and the two new layouts render only `<HostedPlannerProvider>{children}</HostedPlannerProvider>`.
- **Test IDs that pass through Zod `.cuid()`** look like cuids: `c` plus 24 lowercase alphanumerics, for example `cteamxxxxxxxxxxxxxxxxxxxx`.
- **Commits** are conventional commits ending with a blank line, then `Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX`.
- **Per task:** at the end of every task, `bun run type-check` and that task's own Vitest files must be green.

## Rulings (decided during planning)

1. **Store method names mirror the server actions:**
   - `getPlaysByTeam`, `getPlayById`, `createPlay`, `deletePlay`;
   - `saveSessionDrill`, `copySessionDrillToLibrary`, `duplicatePracticeSession`;
   - `deletePracticeSession`, `sharePracticeSession`.

   This keeps the hosted store a set of identity assignments and the test migration mechanical (`actions.saveSessionDrill` keeps its name). The static store in sub-project 3 implements the same names.
2. **Store inputs are declared explicitly** in `lib/planner-store/types.ts` and not imported from `lib/utils/validation.ts`, because `z.input` gives `date: unknown` and `.default()` blurs which fields are optional. A planning-time `tsc` probe confirmed that each explicit input is assignable to its action's Zod type. `hostedPlannerStore: PlannerStore = { getPlaysByTeam, … }` re-proves it on every type-check.
3. **`sharePracticeSession` is optional** (capability by presence). Team sharing is hosted-only, and `SessionDetailView` renders Share only when the store has it. Hosted always has it.
4. **Thumbnails go through `platform.Image`, not a plain `<img>`.** Hosted keeps `next/image` byte for byte, and the static app passes an `<img>`. `PrintDiagram`'s own `<img>` is untouched.
5. **The platform has `navigate` only.** No reusable component calls `replace` or `refresh`.
6. **The hooks throw outside a provider.** There is no silent default: one would either import `next/*` into shared code or quietly turn hosted navigation into full page loads.
   - **Providers:** `app/(dashboard)/practice-planner/layout.tsx`, plus `app/(print)/practice-planner/layout.tsx` for the bench sheet, which lives in another route group.
7. **The hosted platform and the hosted store are in separate files.** The real action modules cannot load under Vitest (`next-auth` → `next/server` fails to resolve; probed at planning time), so tests use the **real hosted platform** with a **store double**.
   - Existing `useRouter().push` and `next/link` `href` assertions keep working unchanged.
8. **No in-memory store in product code.** The test double is `createMockPlannerStore()` (one `vi.fn` per method) in `__tests__/helpers/planner.tsx`. The IndexedDB store, and its contract tests, belong to sub-project 3.
9. **`BenchSheet` is in scope.** The roadmap reuses it, and its link is a transitive `next/link` through `NextLinkComposites`.
   - `PracticePlannerList`, `PlanImportView`, the pages and the editor wrappers stay hosted-only.
   - `SessionDetailView` stays at its `app/` path; sub-project 3 may move it.
10. **The ESLint guard uses core `no-restricted-imports` with no type-import exemption.** The two type imports go instead:
    - `SegmentKind` becomes a local union in `types/segments.ts`;
    - `BenchSheetSession` becomes the lifted `PracticeSessionView` in `types/practice-planner.ts`.
11. **The portability walk is the second guard layer**, the same lint-plus-gate pairing as ADR-0003. It starts as a ratchet with a known-violations list, so every commit stays green. Task 4 makes it strict.

## Review Focus

1. **The bench-sheet route has no provider.** `/practice-planner/<id>/print` is in `app/(print)`, outside the dashboard layout. Without its own layout the page would throw at render, and `next build` would not catch it. Pinned in Task 2: the print layout must provide the hosted store.
2. **Hosted links become plain anchors.** If `HostedLink` stopped being `next/link`, every planner link would do a full page reload with no prefetch, and no existing test would notice. Pinned in Task 2: `HostedLink` must forward its props to `next/link`, and `HostedImage` must forward to `next/image` with `fill`, `unoptimized` and `style.objectFit`.
3. **The hosted store adds a wrapper.** An `async (i) => action(i)` wrapper, or one that catches errors, adds a tick and can swallow errors that today reach the component. Pinned in Task 2: each hosted store method must be the action itself, checked by identity.
4. **The lint glob silently misses `[sessionId]`.** In a glob, `[...]` is a character class, so an unescaped path leaves `SessionDetailView` unguarded with no error. Pinned in Task 5: `--print-config` must show the rule on that exact path, and a piped violation on that path must fail.
5. **A store without sharing still offers Share.** The static store has no `sharePracticeSession`. The Share button must disappear, not throw `store.sharePracticeSession is not a function`. Pinned in Task 4's portable detail-view test.

---

### Task 1: Portable types and the portability ratchet

**Files:**
- Modify: `types/segments.ts:1`
- Modify: `types/practice-planner.ts` (add an import after the header comment, and two interfaces after `PracticeSessionData`)
- Modify: `lib/utils/session-timeline.ts:18`
- Modify: `components/features/practice-planner/SessionDrillList.tsx:4`
- Modify: `components/features/practice-planner/useVenueBooking.ts:11-12`
- Modify: `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx:53-54, 69-108, 744`
- Modify: `components/features/practice-planner/print/BenchSheet.tsx:14, 24`
- Create: `__tests__/types/planner-portable-types.test.ts`
- Create: `__tests__/lib/planner-store/portability.test.ts`

**Interfaces:**
- Produces:
  - `export type SegmentKind = "HALF" | "CROSS" | "CUSTOM"` from `@/types/segments`.
  - `export interface PracticeSessionViewPlay` and `export interface PracticeSessionView` from `@/types/practice-planner`.
  - `BenchSheetSession` is now an alias of `PracticeSessionView`.
  - The portability test file has `ENTRIES` and `KNOWN_VIOLATIONS`. Later tasks edit both.

- [ ] **Step 1: Write the failing type test**

Create `__tests__/types/planner-portable-types.test.ts`:

```ts
/**
 * Portable planner types (ADR-0020). These are type-level checks:
 * `bun run type-check` enforces them, and Vitest only runs them as no-ops.
 */
import { describe, expectTypeOf, it } from "vitest";
import type { SegmentKind as PrismaSegmentKind } from "@prisma/client";
import type { PracticeSessionDetail } from "@/lib/actions/practice-session-queries";
import type { SegmentKind } from "@/types/segments";
import type { PracticeSessionView } from "@/types/practice-planner";

describe("portable practice-planner types", () => {
    it("SegmentKind is exactly Prisma's enum, so a new schema value fails type-check", () => {
        expectTypeOf<SegmentKind>().toEqualTypeOf<PrismaSegmentKind>();
    });

    it("the detail query's session is a PracticeSessionView", () => {
        expectTypeOf<PracticeSessionDetail["session"]>().toExtend<PracticeSessionView>();
    });
});
```

- [ ] **Step 2: Write the portability ratchet test**

Create `__tests__/lib/planner-store/portability.test.ts`:

```ts
/**
 * ADR-0020: the static planner (sub-project 3) reuses these modules, so nothing
 * they reach may load server actions, Prisma, auth or Next.js runtime modules.
 * This walks *transitive* value imports, which the per-file ESLint block
 * (eslint.config.mjs, adr-0020/portable-practice-planner) cannot see — for
 * example, a shared components/ui module that imports next/link.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

const ENTRIES = [
    "components/features/practice-planner/PracticeSessionEditor.tsx",
    "components/features/practice-planner/PlayEditor.tsx",
    "components/features/practice-planner/PlayLibrary.tsx",
    "components/features/practice-planner/print/BenchSheet.tsx",
    "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx",
    "lib/plan-document/index.ts",
];

/** Forbidden even as `import type`: the static app has no generated Prisma client. */
const FORBIDDEN_ANY = /^@prisma\/client$/;
/** Forbidden as value imports. */
const FORBIDDEN_VALUE = /^(next$|next\/|@\/lib\/(actions|db|auth)\/|@\/auth$|server-only$)/;

const STATIC_IMPORT = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:[^;]*?\s+from\s+)?["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /import\(\s*["']([^"']+)["']\s*\)/g;

function resolveSource(spec: string, from: string): string | null {
    let base: string;
    if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
    else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
    else return null; // a package: not walked
    for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx"), base]) {
        if (/\.tsx?$/.test(candidate) && existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
    return null;
}

function scanPortability(entries: readonly string[]): { violations: string[]; visited: number } {
    const seen = new Set<string>();
    const found = new Set<string>();
    const visit = (file: string) => {
        if (seen.has(file)) return;
        seen.add(file);
        const source = readFileSync(file, "utf8");
        const imports: Array<{ spec: string; typeOnly: boolean }> = [];
        for (const match of source.matchAll(STATIC_IMPORT)) imports.push({ spec: match[2], typeOnly: Boolean(match[1]) });
        for (const match of source.matchAll(DYNAMIC_IMPORT)) imports.push({ spec: match[1], typeOnly: false });
        for (const { spec, typeOnly } of imports) {
            if (FORBIDDEN_ANY.test(spec) || (!typeOnly && FORBIDDEN_VALUE.test(spec))) {
                found.add(`${path.relative(ROOT, file)} -> ${spec}`);
                continue; // never descend into a forbidden module
            }
            if (typeOnly) continue;
            const next = resolveSource(spec, file);
            if (next) visit(next);
        }
    };
    for (const entry of entries) visit(path.join(ROOT, entry));
    return { violations: [...found].sort(), visited: seen.size };
}

// Tasks 3 and 4 move these components behind lib/planner-store; each deletes its lines here.
const KNOWN_VIOLATIONS = [
    "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx -> @/lib/actions/practice-sessions",
    "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx -> next/image",
    "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx -> next/link",
    "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx -> next/navigation",
    "components/features/practice-planner/DuplicateSessionDialog.tsx -> @/lib/actions/practice-session-drills",
    "components/features/practice-planner/DuplicateSessionDialog.tsx -> next/navigation",
    "components/features/practice-planner/PlayLibrary.tsx -> @/lib/actions/plays",
    "components/features/practice-planner/PlayLibrary.tsx -> next/image",
    "components/features/practice-planner/PlayLibrary.tsx -> next/navigation",
    "components/features/practice-planner/SessionDrillCard.tsx -> next/image",
    "components/features/practice-planner/SessionDrillDialog.tsx -> @/lib/actions/practice-session-drills",
    "components/ui/NextLinkComposites.tsx -> next/link",
];

describe("portable practice-planner import graph (ADR-0020)", () => {
    const { violations, visited } = scanPortability(ENTRIES);

    it("walks the planner's modules (guards against a resolver that silently finds nothing)", () => {
        expect(visited).toBeGreaterThan(40);
    });

    it("reaches no server, Prisma, auth or Next.js runtime module beyond the known list", () => {
        expect(violations.filter((violation) => !KNOWN_VIOLATIONS.includes(violation))).toEqual([]);
    });

    it("keeps the known list current (delete a line once its import is gone)", () => {
        expect(KNOWN_VIOLATIONS.filter((violation) => !violations.includes(violation))).toEqual([]);
    });
});
```

- [ ] **Step 3: Run both checks and confirm they fail**

Run: `bun run test __tests__/lib/planner-store/portability.test.ts`
Expected: FAIL in "beyond the known list", with exactly these four extra entries:

```
app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx -> @prisma/client
components/features/practice-planner/SessionDrillList.tsx -> @prisma/client
components/features/practice-planner/useVenueBooking.ts -> @prisma/client
lib/utils/session-timeline.ts -> @prisma/client
```

Run: `bun run type-check`
Expected: FAIL. `@/types/segments` has no exported member `SegmentKind`, and `@/types/practice-planner` has no exported member `PracticeSessionView`.

- [ ] **Step 4: Make `SegmentKind` a local type**

In `types/segments.ts`, replace line 1 (`import type { SegmentKind } from "@prisma/client";`) with:

```ts
/**
 * A segment's shape class. It mirrors Prisma's `SegmentKind` enum, so portable
 * planner code (ADR-0020) needs no @prisma/client import. The two types are
 * assignable both ways, and __tests__/types/planner-portable-types.test.ts
 * fails type-check if the schema enum gains a value.
 */
export type SegmentKind = "HALF" | "CROSS" | "CUSTOM";
```

In `lib/utils/session-timeline.ts`, line 18, replace `import type { SegmentKind } from "@prisma/client";` with:

```ts
import type { SegmentKind } from "@/types/segments";
```

In `components/features/practice-planner/SessionDrillList.tsx`, line 4, make the same replacement:

```ts
import type { SegmentKind } from "@/types/segments";
```

In `components/features/practice-planner/useVenueBooking.ts`, replace these two lines (11–12):

```ts
import type { SegmentKind } from "@prisma/client";
import type { BookingConflict } from "@/types/segments";
```

with:

```ts
import type { BookingConflict, SegmentKind } from "@/types/segments";
```

- [ ] **Step 5: Lift the session-view types**

In `types/practice-planner.ts`, insert this after the closing `*/` of the header comment (line 9) and before `// ====… Core Play Data Types`:

```ts

import type { SegmentKind } from "@/types/segments";
```

In the same file, insert this directly after the closing `}` of `export interface PracticeSessionData { … }`:

```ts

/**
 * One drill row on the read-only session views (the detail page and the bench sheet).
 * playData is null when the stored diagram can't be read.
 */
export interface PracticeSessionViewPlay {
    id: string;
    sequence: number;
    duration: number;
    instructions: string | null;
    runsWithPrevious: boolean;
    play: {
        id: string;
        name: string;
        description: string | null;
        thumbnail: string | null;
        playData: PlayData | null;
    };
}

/**
 * A session as the detail page and the bench sheet show it. The venue fields
 * are absent or null for an unbooked practice (feature 006, FR-019).
 */
export interface PracticeSessionView {
    id: string;
    title: string;
    date: string;
    duration: number;
    isShared: boolean;
    createdByName: string;
    teamId: string;
    teamName: string;
    venueId?: string | null;
    venueName?: string | null;
    venueTimezone?: string | null;
    surfaceId?: string | null;
    surfaceName?: string | null;
    segmentId?: string | null;
    segmentName?: string | null;
    segmentKind?: SegmentKind | null;
    startAt?: string | null;
    plays: PracticeSessionViewPlay[];
}
```

In `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx`:
- replace line 53 (`import type { PlayData } from "@/types/practice-planner";`) with:
  ```ts
  import type { PracticeSessionView, PracticeSessionViewPlay } from "@/types/practice-planner";
  ```
- delete line 54 (`import type { SegmentKind } from "@prisma/client";`);
- delete the whole of `interface SessionPlay { … }` and `interface SessionData { … }` (lines 69–104, from `interface SessionPlay {` through the `}` after `plays: SessionPlay[];`), along with the blank line that follows them;
- in `interface SessionDetailViewProps`, replace `session: SessionData;` with `session: PracticeSessionView;`;
- in `interface SidebarPlayCardProps`, replace `sp: SessionPlay;` with `sp: PracticeSessionViewPlay;`.

In `components/features/practice-planner/print/BenchSheet.tsx`:
- replace line 14 (`import type { PracticeSessionDetail } from "@/lib/actions/practice-session-queries";`) with:
  ```ts
  import type { PracticeSessionView } from "@/types/practice-planner";
  ```
- replace line 24 (`export type BenchSheetSession = PracticeSessionDetail["session"];`) with:
  ```ts
  export type BenchSheetSession = PracticeSessionView;
  ```

- [ ] **Step 6: Run the checks and confirm they pass**

Run: `bun run type-check`
Expected: PASS.

Run: `bun run test __tests__/lib/planner-store/portability.test.ts __tests__/types/planner-portable-types.test.ts __tests__/app/SessionDetailView.line-budget.test.ts __tests__/app/practice-session-detail-stations.test.tsx __tests__/app/practice-session-detail-timeline.test.tsx __tests__/components/features/practice-planner/print/BenchSheet.test.tsx __tests__/lib/utils/session-timeline.test.ts __tests__/components/features/practice-planner/SessionDrillList.busy.test.tsx __tests__/app/practice-session-bench-sheet-page.test.tsx`
Expected: PASS (all files).

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add types/segments.ts types/practice-planner.ts lib/utils/session-timeline.ts components/features/practice-planner/SessionDrillList.tsx components/features/practice-planner/useVenueBooking.ts "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx" components/features/practice-planner/print/BenchSheet.tsx __tests__/types/planner-portable-types.test.ts __tests__/lib/planner-store/portability.test.ts
/usr/bin/git commit -m "refactor(practice-planner): portable SegmentKind and session view types

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 2: The seam, the hosted adapters and the layouts

**Files:**
- Create: `lib/planner-store/types.ts`
- Create: `lib/planner-store/context.tsx`
- Create: `lib/planner-store/index.ts`
- Create: `components/providers/hosted-planner-platform.tsx`
- Create: `components/providers/HostedPlannerProvider.tsx`
- Create: `app/(dashboard)/practice-planner/layout.tsx`
- Create: `app/(print)/practice-planner/layout.tsx`
- Create: `__tests__/lib/planner-store/context.test.tsx`
- Create: `__tests__/components/providers/hosted-planner-platform.test.tsx`
- Create: `__tests__/components/providers/HostedPlannerProvider.test.tsx`
- Modify: `__tests__/lib/planner-store/portability.test.ts` (`ENTRIES`)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces, from `@/lib/planner-store`:
  - **Store types:** `ActionResult<T>`, `LibraryDateFilter`, `LibraryPlaySummary`, `LibraryPlay`, `LibraryPage`, `LibraryQuery`, `PlayRef`, `NewLibraryPlay`, `SessionDrillSave`, `SessionDrillRef`, `SessionRef`, `SessionCopy`, `SessionShare`, `PlannerStore`.
  - **Platform types:** `PlannerLinkProps`, `PlannerImageProps`, `PlannerRoutes`, `PlannerPlatform`.
  - **Provider and hooks:** `PlannerProvider({ store, platform, children })`, `usePlannerStore(): PlannerStore`, `usePlannerPlatform(): PlannerPlatform`, `MISSING_PROVIDER_MESSAGE`.
- Produces, from `@/components/providers/hosted-planner-platform`: `hostedPlannerRoutes: PlannerRoutes`, `HostedLink`, `HostedImage`, `useHostedPlannerPlatform(): PlannerPlatform`.
- Produces, from `@/components/providers/HostedPlannerProvider`: `hostedPlannerStore: PlannerStore`, `HostedPlannerProvider({ children })`.

- [ ] **Step 1: Write the failing context test**

Create `__tests__/lib/planner-store/context.test.tsx`:

```tsx
/** The planner seam's context: no silent default outside a provider (ADR-0020). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import {
    MISSING_PROVIDER_MESSAGE,
    PlannerProvider,
    usePlannerPlatform,
    usePlannerStore,
    type PlannerPlatform,
    type PlannerStore,
} from "@/lib/planner-store";

const store = { getPlaysByTeam: vi.fn() } as unknown as PlannerStore;
const platform = { navigate: vi.fn() } as unknown as PlannerPlatform;

function wrapper({ children }: { children: ReactNode }) {
    return <PlannerProvider store={store} platform={platform}>{children}</PlannerProvider>;
}

afterEach(() => vi.restoreAllMocks());

describe("planner context", () => {
    it("throws a named error outside a provider", () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        expect(() => renderHook(() => usePlannerStore())).toThrow(MISSING_PROVIDER_MESSAGE);
        expect(() => renderHook(() => usePlannerPlatform())).toThrow(MISSING_PROVIDER_MESSAGE);
    });

    it("returns the provided store and platform", () => {
        expect(renderHook(() => usePlannerStore(), { wrapper }).result.current).toBe(store);
        expect(renderHook(() => usePlannerPlatform(), { wrapper }).result.current).toBe(platform);
    });
});
```

- [ ] **Step 2: Write the failing hosted-platform test**

Create `__tests__/components/providers/hosted-planner-platform.test.tsx`:

```tsx
/** The hosted platform is next/link, next/image and router.push, with today's paths (behaviour unchanged). */
import { describe, expect, it, vi } from "vitest";
import { render, renderHook } from "@testing-library/react";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const captured = vi.hoisted(() => ({ link: null as Record<string, unknown> | null, image: null as Record<string, unknown> | null }));
vi.mock("next/link", () => ({
    default: (props: Record<string, unknown>) => {
        captured.link = props;
        return null;
    },
}));
vi.mock("next/image", () => ({
    default: (props: Record<string, unknown>) => {
        captured.image = props;
        return null;
    },
}));

import { HostedImage, HostedLink, hostedPlannerRoutes, useHostedPlannerPlatform } from "@/components/providers/hosted-planner-platform";

const ID = "csessionxxxxxxxxxxxxxxxxx";

describe("hosted planner platform", () => {
    it("builds today's practice-planner paths", () => {
        expect(hostedPlannerRoutes.list()).toBe("/practice-planner");
        expect(hostedPlannerRoutes.session(ID)).toBe(`/practice-planner/${ID}`);
        expect(hostedPlannerRoutes.sessionEdit(ID)).toBe(`/practice-planner/${ID}/edit`);
        expect(hostedPlannerRoutes.sessionPrint(ID)).toBe(`/practice-planner/${ID}/print`);
        expect(hostedPlannerRoutes.libraryNew()).toBe("/practice-planner/library/new");
        expect(hostedPlannerRoutes.libraryEdit(ID)).toBe(`/practice-planner/library/${ID}/edit`);
    });

    it("navigates with router.push", () => {
        const { result } = renderHook(() => useHostedPlannerPlatform());
        result.current.navigate("/practice-planner");
        expect(router.push).toHaveBeenCalledWith("/practice-planner");
        expect(result.current.routes).toBe(hostedPlannerRoutes);
        expect(result.current.Link).toBe(HostedLink);
        expect(result.current.Image).toBe(HostedImage);
    });

    it("renders links with next/link, forwarding every prop", () => {
        render(<HostedLink href="/practice-planner" className="back">Back</HostedLink>);
        expect(captured.link).toMatchObject({ href: "/practice-planner", className: "back", children: "Back" });
    });

    it("renders thumbnails with next/image exactly as the call sites did (fill, unoptimized, objectFit)", () => {
        render(<HostedImage src="data:image/png;base64,AA==" alt="Breakout" fit="cover" />);
        expect(captured.image).toEqual({
            src: "data:image/png;base64,AA==",
            alt: "Breakout",
            fill: true,
            style: { objectFit: "cover" },
            unoptimized: true,
        });
    });
});
```

- [ ] **Step 3: Write the failing hosted-provider test**

Create `__tests__/components/providers/HostedPlannerProvider.test.tsx`:

```tsx
/**
 * The hosted store is the server actions themselves, by identity, so no
 * wrapper can change their arguments, timing or errors. Both route groups
 * provide it.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const plays = vi.hoisted(() => ({ getPlaysByTeam: vi.fn(), getPlayById: vi.fn(), createPlay: vi.fn(), deletePlay: vi.fn() }));
const drills = vi.hoisted(() => ({ saveSessionDrill: vi.fn(), copySessionDrillToLibrary: vi.fn(), duplicatePracticeSession: vi.fn() }));
const sessions = vi.hoisted(() => ({ deletePracticeSession: vi.fn(), sharePracticeSession: vi.fn() }));
vi.mock("@/lib/actions/plays", () => plays);
vi.mock("@/lib/actions/practice-session-drills", () => drills);
vi.mock("@/lib/actions/practice-sessions", () => sessions);

import { HostedPlannerProvider, hostedPlannerStore } from "@/components/providers/HostedPlannerProvider";
import { usePlannerPlatform, usePlannerStore } from "@/lib/planner-store";
import PracticePlannerLayout from "@/app/(dashboard)/practice-planner/layout";
import PracticePlannerPrintLayout from "@/app/(print)/practice-planner/layout";

function Probe() {
    const store = usePlannerStore();
    const { routes } = usePlannerPlatform();
    return <p>{`${store === hostedPlannerStore ? "hosted" : "other"} ${routes.list()}`}</p>;
}

describe("HostedPlannerProvider", () => {
    it.each([
        ["getPlaysByTeam", plays.getPlaysByTeam],
        ["getPlayById", plays.getPlayById],
        ["createPlay", plays.createPlay],
        ["deletePlay", plays.deletePlay],
        ["saveSessionDrill", drills.saveSessionDrill],
        ["copySessionDrillToLibrary", drills.copySessionDrillToLibrary],
        ["duplicatePracticeSession", drills.duplicatePracticeSession],
        ["deletePracticeSession", sessions.deletePracticeSession],
        ["sharePracticeSession", sessions.sharePracticeSession],
    ] as const)("store.%s is the server action itself", (name, action) => {
        expect(hostedPlannerStore[name]).toBe(action);
    });

    it("provides the hosted store and platform", () => {
        render(<HostedPlannerProvider><Probe /></HostedPlannerProvider>);
        expect(screen.getByText("hosted /practice-planner")).toBeInTheDocument();
    });

    it("is mounted by the dashboard practice-planner layout", () => {
        render(<PracticePlannerLayout><Probe /></PracticePlannerLayout>);
        expect(screen.getByText("hosted /practice-planner")).toBeInTheDocument();
    });

    it("is mounted by the print layout, so the bench sheet has it too", () => {
        render(<PracticePlannerPrintLayout><Probe /></PracticePlannerPrintLayout>);
        expect(screen.getByText("hosted /practice-planner")).toBeInTheDocument();
    });
});
```

- [ ] **Step 4: Run the tests and confirm they fail**

Run: `bun run test __tests__/lib/planner-store/context.test.tsx __tests__/components/providers/hosted-planner-platform.test.tsx __tests__/components/providers/HostedPlannerProvider.test.tsx`
Expected: FAIL. None of `@/lib/planner-store`, `@/components/providers/hosted-planner-platform`, `@/components/providers/HostedPlannerProvider` or the layouts can be resolved.

- [ ] **Step 5: Write `lib/planner-store/types.ts`**

```ts
/**
 * The practice planner's storage and platform seam (ADR-0020, sub-project 2).
 * Portable components call these interfaces, never server actions or Next.js
 * directly:
 * - hosted implements them with the server actions, next/link, next/image and
 *   router.push (components/providers/HostedPlannerProvider.tsx);
 * - the static app (sub-project 3) implements them with IndexedDB and hash routes.
 *
 * Method names, inputs and results mirror the server actions one to one.
 */
import type { AnchorHTMLAttributes, ComponentType, Ref } from "react";
import type { PlayData } from "@/types/practice-planner";

/** Same shape as the ActionResult each lib/actions file declares. */
export type ActionResult<T> =
    | { success: true; data: T }
    | { success: false; error: string; details?: unknown };

export type LibraryDateFilter = "all" | "today" | "week" | "month";

export interface LibraryPlaySummary {
    id: string;
    name: string;
    description: string | null;
    thumbnail: string | null;
    isTemplate: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface LibraryPlay extends LibraryPlaySummary {
    playData: PlayData;
}

export interface LibraryPage {
    plays: LibraryPlaySummary[];
    total: number;
    page: number;
    limit: number;
}

export interface LibraryQuery {
    teamId: string;
    isTemplate?: boolean;
    page: number;
    limit: number;
    search?: string;
    dateFilter: LibraryDateFilter;
}

export interface PlayRef {
    id: string;
    teamId: string;
}

export interface NewLibraryPlay {
    name: string;
    description?: string;
    thumbnail?: string;
    playData: PlayData;
    isTemplate: boolean;
    teamId: string;
}

export interface SessionDrillSave {
    sessionId: string;
    teamId: string;
    /** Omitted for a brand-new drill. */
    playId?: string;
    name: string;
    description?: string;
    thumbnail?: string;
    playData: PlayData;
}

export interface SessionDrillRef {
    playId: string;
    teamId: string;
}

export interface SessionRef {
    id: string;
    teamId: string;
}

export interface SessionCopy extends SessionRef {
    date: Date;
}

export interface SessionShare extends SessionRef {
    isShared: boolean;
}

export interface PlannerStore {
    getPlaysByTeam(input: LibraryQuery): Promise<ActionResult<LibraryPage>>;
    getPlayById(input: PlayRef): Promise<ActionResult<LibraryPlay>>;
    createPlay(input: NewLibraryPlay): Promise<ActionResult<{ id: string; name: string; isTemplate: boolean }>>;
    deletePlay(input: PlayRef): Promise<ActionResult<{ id: string; detachedSessions: number }>>;
    saveSessionDrill(input: SessionDrillSave): Promise<ActionResult<{ playId: string }>>;
    copySessionDrillToLibrary(input: SessionDrillRef): Promise<ActionResult<{ playId: string }>>;
    duplicatePracticeSession(input: SessionCopy): Promise<ActionResult<{ id: string }>>;
    deletePracticeSession(input: SessionRef): Promise<ActionResult<{ id: string }>>;
    /** Team sharing is hosted-only. A store without it hides the Share control. */
    sharePracticeSession?(input: SessionShare): Promise<ActionResult<{ id: string; isShared: boolean }>>;
}

export type PlannerLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    href: string;
    ref?: Ref<HTMLAnchorElement>;
};

/** A thumbnail that fills its positioned parent. */
export interface PlannerImageProps {
    src: string;
    alt: string;
    fit: "contain" | "cover";
}

export interface PlannerRoutes {
    list(): string;
    session(id: string): string;
    sessionEdit(id: string): string;
    sessionPrint(id: string): string;
    libraryNew(): string;
    libraryEdit(playId: string): string;
}

export interface PlannerPlatform {
    Link: ComponentType<PlannerLinkProps>;
    Image: ComponentType<PlannerImageProps>;
    navigate(href: string): void;
    routes: PlannerRoutes;
}
```

- [ ] **Step 6: Write `lib/planner-store/context.tsx` and `index.ts`**

`lib/planner-store/context.tsx`:

```tsx
"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PlannerPlatform, PlannerStore } from "./types";

const PlannerStoreContext = createContext<PlannerStore | null>(null);
const PlannerPlatformContext = createContext<PlannerPlatform | null>(null);

export const MISSING_PROVIDER_MESSAGE =
    "Practice-planner components must render inside <PlannerProvider>. Hosted routes get one from " +
    "HostedPlannerProvider in app/(dashboard)/practice-planner/layout.tsx and app/(print)/practice-planner/layout.tsx.";

export interface PlannerProviderProps {
    store: PlannerStore;
    platform: PlannerPlatform;
    children: ReactNode;
}

export function PlannerProvider({ store, platform, children }: PlannerProviderProps) {
    return (
        <PlannerStoreContext.Provider value={store}>
            <PlannerPlatformContext.Provider value={platform}>{children}</PlannerPlatformContext.Provider>
        </PlannerStoreContext.Provider>
    );
}

/** No default: a fallback would either pull Next.js into shared code or quietly change hosted behaviour. */
export function usePlannerStore(): PlannerStore {
    const store = useContext(PlannerStoreContext);
    if (!store) throw new Error(MISSING_PROVIDER_MESSAGE);
    return store;
}

export function usePlannerPlatform(): PlannerPlatform {
    const platform = useContext(PlannerPlatformContext);
    if (!platform) throw new Error(MISSING_PROVIDER_MESSAGE);
    return platform;
}
```

`lib/planner-store/index.ts`:

```ts
export * from "./types";
export * from "./context";
```

- [ ] **Step 7: Write the hosted platform**

`components/providers/hosted-planner-platform.tsx`:

```tsx
"use client";

/**
 * The hosted half of the planner's platform seam: Next.js links, images and
 * navigation. It is kept apart from HostedPlannerProvider's store so tests can
 * use the real hosted platform without loading the server actions, which
 * don't import under Vitest.
 */
import { useMemo } from "react";
import NextImage from "next/image";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import type { PlannerImageProps, PlannerLinkProps, PlannerPlatform, PlannerRoutes } from "@/lib/planner-store";

export const hostedPlannerRoutes: PlannerRoutes = {
    list: () => "/practice-planner",
    session: (id) => `/practice-planner/${id}`,
    sessionEdit: (id) => `/practice-planner/${id}/edit`,
    sessionPrint: (id) => `/practice-planner/${id}/print`,
    libraryNew: () => "/practice-planner/library/new",
    libraryEdit: (playId) => `/practice-planner/library/${playId}/edit`,
};

/** next/link: keeps prefetch and client-side navigation. */
export function HostedLink(props: PlannerLinkProps) {
    return <NextLink {...props} />;
}

/** Thumbnails are base64 data URLs: unoptimized, exactly as every call site passed before the seam. */
export function HostedImage({ src, alt, fit }: PlannerImageProps) {
    return <NextImage src={src} alt={alt} fill style={{ objectFit: fit }} unoptimized />;
}

export function useHostedPlannerPlatform(): PlannerPlatform {
    const router = useRouter();
    return useMemo(
        () => ({
            Link: HostedLink,
            Image: HostedImage,
            navigate: (href: string) => router.push(href),
            routes: hostedPlannerRoutes,
        }),
        [router],
    );
}
```

- [ ] **Step 8: Write the hosted provider and the two layouts**

`components/providers/HostedPlannerProvider.tsx`:

```tsx
"use client";

/**
 * Hosted implementation of the practice planner's seam (ADR-0020). The store
 * is the server actions themselves (ADR-0002), with no wrapper, so arguments,
 * results, timing and errors are exactly what the components saw before the
 * seam. Typing it as PlannerStore makes tsc prove that the store's inputs are
 * assignable to the actions' inputs.
 */
import type { ReactNode } from "react";
import { PlannerProvider, type PlannerStore } from "@/lib/planner-store";
import { createPlay, deletePlay, getPlayById, getPlaysByTeam } from "@/lib/actions/plays";
import {
    copySessionDrillToLibrary,
    duplicatePracticeSession,
    saveSessionDrill,
} from "@/lib/actions/practice-session-drills";
import { deletePracticeSession, sharePracticeSession } from "@/lib/actions/practice-sessions";
import { useHostedPlannerPlatform } from "./hosted-planner-platform";

export const hostedPlannerStore: PlannerStore = {
    getPlaysByTeam,
    getPlayById,
    createPlay,
    deletePlay,
    saveSessionDrill,
    copySessionDrillToLibrary,
    duplicatePracticeSession,
    deletePracticeSession,
    sharePracticeSession,
};

export function HostedPlannerProvider({ children }: { children: ReactNode }) {
    const platform = useHostedPlannerPlatform();
    return (
        <PlannerProvider store={hostedPlannerStore} platform={platform}>
            {children}
        </PlannerProvider>
    );
}
```

`app/(dashboard)/practice-planner/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { HostedPlannerProvider } from "@/components/providers/HostedPlannerProvider";

/** Planner components read their store and platform from context (ADR-0020). */
export default function PracticePlannerLayout({ children }: { children: ReactNode }) {
    return <HostedPlannerProvider>{children}</HostedPlannerProvider>;
}
```

`app/(print)/practice-planner/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { HostedPlannerProvider } from "@/components/providers/HostedPlannerProvider";

/** The bench sheet is outside the dashboard route group, so it needs its own provider (ADR-0020). */
export default function PracticePlannerPrintLayout({ children }: { children: ReactNode }) {
    return <HostedPlannerProvider>{children}</HostedPlannerProvider>;
}
```

- [ ] **Step 9: Add the seam to the portability walk**

In `__tests__/lib/planner-store/portability.test.ts`, add one entry to the end of `ENTRIES`, after `"lib/plan-document/index.ts",`:

```ts
    "lib/planner-store/index.ts",
```

- [ ] **Step 10: Run the tests and type-check, and confirm they pass**

Run: `bun run test __tests__/lib/planner-store/context.test.tsx __tests__/components/providers/hosted-planner-platform.test.tsx __tests__/components/providers/HostedPlannerProvider.test.tsx __tests__/lib/planner-store/portability.test.ts`
Expected: PASS.

Run: `bun run type-check`
Expected: PASS. This is the compile-time proof that each `PlannerStore` input is assignable to its action's input.

- [ ] **Step 11: Commit**

```bash
/usr/bin/git add lib/planner-store components/providers/hosted-planner-platform.tsx components/providers/HostedPlannerProvider.tsx "app/(dashboard)/practice-planner/layout.tsx" "app/(print)/practice-planner/layout.tsx" __tests__/lib/planner-store/context.test.tsx __tests__/components/providers/hosted-planner-platform.test.tsx __tests__/components/providers/HostedPlannerProvider.test.tsx __tests__/lib/planner-store/portability.test.ts
/usr/bin/git commit -m "feat(practice-planner): planner store and platform seam with hosted adapters

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 3: Library and drill editing behind the seam

**Files:**
- Create: `__tests__/helpers/planner.tsx`
- Create: `__tests__/components/features/practice-planner/PlayLibrary.portable.test.tsx`
- Modify: `components/features/practice-planner/PlayLibrary.tsx`
- Modify: `components/features/practice-planner/SessionDrillDialog.tsx`
- Modify: `components/features/practice-planner/SessionDrillCard.tsx`
- Modify (mocks move to the store double):
  - `__tests__/components/features/practice-planner/PlayLibrary.test.tsx`
  - `__tests__/components/features/practice-planner/SessionDrillDialog.test.tsx`
  - `__tests__/components/features/practice-planner/PracticeSessionEditor.{characterization,create-lock,drill-dialog,drill-ids,noop-edits,notify,stale-drill,stations}.test.tsx` (8 files)
- Modify (wrapper only):
  - `__tests__/components/features/practice-planner/SessionDrillCard.station.test.tsx`
  - `__tests__/components/features/practice-planner/SessionDrillList.busy.test.tsx`
- Modify: `__tests__/lib/planner-store/portability.test.ts` (`KNOWN_VIOLATIONS`)

**Interfaces:**
- Consumes (Task 2):
  - `usePlannerStore()` and `usePlannerPlatform()` from `@/lib/planner-store`;
  - the types `PlannerStore`, `PlannerPlatform`, `PlannerLinkProps` and `PlannerImageProps`;
  - `useHostedPlannerPlatform()` from `@/components/providers/hosted-planner-platform`.
- Produces, from `@/__tests__/helpers/planner`:
  - `type MockPlannerStore = { [K in keyof PlannerStore]: Mock }`;
  - `EMPTY_LIBRARY_PAGE`;
  - `createMockPlannerStore(): MockPlannerStore`;
  - `createHashPlatform(): PlannerPlatform & { navigate: Mock }`;
  - `renderWithPlanner(ui, { store?, platform?, ...RenderOptions }): RenderResult`.

- [ ] **Step 1: Write the test helper**

Create `__tests__/helpers/planner.tsx`:

```tsx
/**
 * Test doubles for the practice-planner seam (lib/planner-store, ADR-0020).
 * - createMockPlannerStore(): every PlannerStore method as a vi.fn. Tests set
 *   results with mockResolvedValue and assert with the action's own name.
 * - renderWithPlanner(ui, { store, platform }): renders inside PlannerProvider.
 *   The platform defaults to the REAL hosted one, so next/link and next/image
 *   render as they do on the site, and navigate is router.push from the
 *   next/navigation mock (global in vitest.setup.ts, or the test's own).
 * - createHashPlatform(): a platform shaped like the static app's: hash routes,
 *   a plain <a> and <img>, and a navigate spy.
 */
import type { ReactElement, ReactNode } from "react";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { vi, type Mock } from "vitest";
import {
    PlannerProvider,
    type PlannerImageProps,
    type PlannerLinkProps,
    type PlannerPlatform,
    type PlannerStore,
} from "@/lib/planner-store";
import { useHostedPlannerPlatform } from "@/components/providers/hosted-planner-platform";

export type MockPlannerStore = { [K in keyof PlannerStore]: Mock };

export const EMPTY_LIBRARY_PAGE = { success: true, data: { plays: [], total: 0, page: 1, limit: 20 } };

export function createMockPlannerStore(): MockPlannerStore {
    return {
        getPlaysByTeam: vi.fn().mockResolvedValue(EMPTY_LIBRARY_PAGE),
        getPlayById: vi.fn(),
        createPlay: vi.fn(),
        deletePlay: vi.fn(),
        saveSessionDrill: vi.fn(),
        copySessionDrillToLibrary: vi.fn(),
        duplicatePracticeSession: vi.fn(),
        deletePracticeSession: vi.fn(),
        sharePracticeSession: vi.fn(),
    };
}

function HashLink({ href, children, ...rest }: PlannerLinkProps) {
    return (
        <a href={href} {...rest}>
            {children}
        </a>
    );
}

function PlainImage({ src, alt, fit }: PlannerImageProps) {
    // eslint-disable-next-line @next/next/no-img-element -- stands in for the static app's adapter
    return <img src={src} alt={alt} data-fit={fit} />;
}

export function createHashPlatform(): PlannerPlatform & { navigate: Mock } {
    return {
        Link: HashLink,
        Image: PlainImage,
        navigate: vi.fn(),
        routes: {
            list: () => "#/",
            session: (id) => `#/sessions/${id}`,
            sessionEdit: (id) => `#/sessions/${id}/edit`,
            sessionPrint: (id) => `#/sessions/${id}/print`,
            libraryNew: () => "#/library/new",
            libraryEdit: (playId) => `#/library/${playId}/edit`,
        },
    };
}

function HostedPlatformProvider({ store, children }: { store: PlannerStore; children: ReactNode }) {
    const platform = useHostedPlannerPlatform();
    return (
        <PlannerProvider store={store} platform={platform}>
            {children}
        </PlannerProvider>
    );
}

export interface PlannerRenderOptions extends Omit<RenderOptions, "wrapper"> {
    store?: MockPlannerStore;
    platform?: PlannerPlatform;
}

export function renderWithPlanner(
    ui: ReactElement,
    { store = createMockPlannerStore(), platform, ...options }: PlannerRenderOptions = {},
): RenderResult {
    const plannerStore = store as unknown as PlannerStore;
    function Wrapper({ children }: { children: ReactNode }) {
        return platform ? (
            <PlannerProvider store={plannerStore} platform={platform}>
                {children}
            </PlannerProvider>
        ) : (
            <HostedPlatformProvider store={plannerStore}>{children}</HostedPlatformProvider>
        );
    }
    return render(ui, { wrapper: Wrapper, ...options });
}
```

- [ ] **Step 2: Write the failing portable library test**

Create `__tests__/components/features/practice-planner/PlayLibrary.portable.test.tsx`:

```tsx
/** PlayLibrary on a non-hosted platform: the static app's shape (ADR-0020). */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createHashPlatform, createMockPlannerStore, renderWithPlanner } from "@/__tests__/helpers/planner";

vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: () => "data:image/png;base64,AA==" }));

import { PlayLibrary } from "@/components/features/practice-planner/PlayLibrary";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const PLAY_ID = "cplayxxxxxxxxxxxxxxxxxxxx";
const PLAY = {
    id: PLAY_ID,
    name: "Saturday Skate",
    description: null,
    thumbnail: "data:image/png;base64,AA==",
    isTemplate: true,
    createdAt: new Date("2026-04-01T00:00:00Z"),
    updatedAt: new Date("2026-04-01T00:00:00Z"),
};

function renderLibrary() {
    const store = createMockPlannerStore();
    store.getPlaysByTeam.mockResolvedValue({ success: true, data: { plays: [PLAY], total: 1, page: 1, limit: 20 } });
    const platform = createHashPlatform();
    renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <PlayLibrary teamId={TEAM} mode="manage" />
        </ThemeProvider>,
        { store, platform },
    );
    return { store, platform };
}

describe("PlayLibrary on a portable platform", () => {
    it("reads the library from the store", async () => {
        const { store } = renderLibrary();
        expect(await screen.findByText("Saturday Skate")).toBeInTheDocument();
        expect(store.getPlaysByTeam).toHaveBeenCalledWith({
            teamId: TEAM,
            isTemplate: true,
            page: 1,
            limit: 20,
            search: undefined,
            dateFilter: "all",
        });
    });

    it("navigates with the platform's routes", async () => {
        const { platform } = renderLibrary();
        fireEvent.click(await screen.findByRole("button", { name: "Edit Saturday Skate" }));
        expect(platform.navigate).toHaveBeenCalledWith(`#/library/${PLAY_ID}/edit`);
        fireEvent.click(screen.getByRole("button", { name: "New Play" }));
        expect(platform.navigate).toHaveBeenCalledWith("#/library/new");
    });

    it("draws thumbnails with the platform's Image", async () => {
        renderLibrary();
        expect(await screen.findByRole("img", { name: "Saturday Skate" })).toHaveAttribute("data-fit", "contain");
    });
});
```

- [ ] **Step 3: Move the existing tests' mocks to the store double (they fail until Step 5)**

These edits change only *where* the mocks live and *how* the UI is rendered. Every assertion stays as it is.

**`PlayLibrary.test.tsx`**
- Change `import { render, screen, waitFor, within } from "@testing-library/react";` to `import { screen, waitFor, within } from "@testing-library/react";`.
- Delete the line `import { getPlaysByTeam, getPlayById, deletePlay } from "@/lib/actions/plays";`.
- Add this line after the `PlayLibrary` import:
  ```ts
  import { createMockPlannerStore, renderWithPlanner } from "@/__tests__/helpers/planner";
  ```
- Delete the block that starts `// Mock the server actions` and runs through the `}));` of `vi.mock("@/lib/actions/plays", …)`.
- Replace the four lines from `// Cast to mock types for proper typing` through `const mockDeletePlay = deletePlay as ReturnType<typeof vi.fn>;` with:

  ```ts
  // The planner store double stands in for the server actions
  const store = createMockPlannerStore();
  const mockGetPlaysByTeam = store.getPlaysByTeam;
  const mockGetPlayById = store.getPlayById;
  const mockDeletePlay = store.deletePlay;
  ```
- Replace `renderWithTheme` with:

  ```tsx
  const renderWithTheme = (props: PlayLibraryProps) => {
      return renderWithPlanner(
          <ThemeProvider theme={theme}>
              <PlayLibrary {...props} />
          </ThemeProvider>,
          { store },
      );
  };
  ```

**`SessionDrillDialog.test.tsx`**
- Change `import { act, fireEvent, render, screen } from "@testing-library/react";` to `import { act, fireEvent, screen } from "@testing-library/react";`.
- Add this line under the imports:
  ```ts
  import { createMockPlannerStore, renderWithPlanner } from "@/__tests__/helpers/planner";
  ```
- Delete `const actions = vi.hoisted(() => ({ saveSessionDrill: vi.fn(), copySessionDrillToLibrary: vi.fn() }));` and `vi.mock("@/lib/actions/practice-session-drills", () => actions);`.
- Directly after `import { SessionDrillDialog } from "@/components/features/practice-planner/SessionDrillDialog";`, add:

  ```ts
  const actions = createMockPlannerStore();
  ```
- In `renderDialog`, change the call to the following. The JSX itself is unchanged:

  ```tsx
      renderWithPlanner(
          <SessionDrillDialog
              open
              sessionId={SESSION}
              teamId={TEAM}
              drill={{ clientKey: "k1", playId, name: "Breakout", description: "Quick", playData: createEmptyPlayData(), thumbnail: "" }}
              onSaved={onSaved}
              onClose={onClose}
          />,
          { store: actions },
      );
  ```

**The eight `PracticeSessionEditor.*.test.tsx` files.** Apply the same three edits to each:
1. Delete the `vi.mock("@/lib/actions/plays", () => ({ … }));` block.
2. Delete the `vi.mock("@/lib/actions/practice-session-drills", …)` block if the file has one, together with the `//` comment line directly above it, if there is one. The files that have that comment are characterization (`// The editor hosts SessionDrillDialog, which imports these server actions.`), drill-ids, notify, and stations (`// The drill dialog's actions import the auth stack; the editor tests never call them.`). `drill-dialog` has no drills mock. Leave its `SessionDrillDialog` component mock alone.
3. Remove `render` from the `@testing-library/react` import, add `import { renderWithPlanner } from "@/__tests__/helpers/planner";`, and change the file's single `render(` call to `renderWithPlanner(`. In `notify` the call is `return render(`, which becomes `return renderWithPlanner(`.

The blocks to delete (line numbers at `8ce6e25`):

| File | plays mock | drills mock |
|---|---|---|
| `characterization` | 28–33 | 35–39 (comment line 35) |
| `create-lock` | 21–26 | 27 |
| `drill-dialog` | 22–27 | — |
| `drill-ids` | 22–27 | 29–33 (comment line 29) |
| `noop-edits` | 16–21 | 22 (keep the `session-timeline` mock that follows) |
| `notify` | 24–28 | 30–34 (comment line 30) |
| `stale-drill` | 21–26 | 28–31 |
| `stations` | 17–22 | 23–24 (comment line 23) |

The store double's default `getPlaysByTeam` resolves to an empty page, just as the deleted mock did.

**`SessionDrillCard.station.test.tsx` and `SessionDrillList.busy.test.tsx`** (wrapper only)
- Remove `render` from the `@testing-library/react` import.
- Add `import { renderWithPlanner } from "@/__tests__/helpers/planner";`.
- Change the single `render(` to `renderWithPlanner(`.

- [ ] **Step 4: Run the tests and confirm they fail for the right reason**

Run: `bun run test __tests__/components/features/practice-planner/PlayLibrary.portable.test.tsx __tests__/components/features/practice-planner/PlayLibrary.test.tsx __tests__/components/features/practice-planner/SessionDrillDialog.test.tsx`
Expected: FAIL. Imports of the real `@/lib/actions/*` modules fail (`next-auth` → `next/server`), or calls go to the actions instead of the store double, so `store.*` mocks are never called.

- [ ] **Step 5: Move `PlayLibrary` behind the seam**

In `components/features/practice-planner/PlayLibrary.tsx`, replace these three lines:

```ts
import Image from "next/image";
import { useRouter } from "next/navigation";
```

and

```ts
import { getPlaysByTeam, getPlayById, deletePlay, createPlay } from "@/lib/actions/plays";
```

with one line, placed where the actions import was:

```ts
import { usePlannerPlatform, usePlannerStore } from "@/lib/planner-store";
```

In `PlayCard`, directly after `const theme = useTheme();`, add:

```ts
    const { Image } = usePlannerPlatform();
```

Then replace its `<Image … />` element (`src={play.thumbnail}`) with:

```tsx
                    <Image src={play.thumbnail} alt={play.name} fit="contain" />
```

In `StarterPlayCard`, directly after `}: StarterPlayCardProps) {`, add:

```ts
    const { Image } = usePlannerPlatform();
```

Then replace its `<Image … />` element (`src={thumbnail}`) with:

```tsx
                    <Image src={thumbnail} alt={starter.name} fit="contain" />
```

In `PlayLibrary`, replace `const router = useRouter();` with:

```ts
    const store = usePlannerStore();
    const { navigate, routes } = usePlannerPlatform();
```

Then make these replacements in the same component:
- in `loadPlays`, change `const result = await getPlaysByTeam({` to `const result = await store.getPlaysByTeam({`, and change its dependency list `}, [teamId, currentPage]);` to `}, [store, teamId, currentPage]);`;
- in `handleAddStarter`, change `const result = await createPlay({` to `const result = await store.createPlay({`, and change its dependency list `[starterThumbnails, teamId, loadPlays, searchQuery, dateFilter]` to `[store, starterThumbnails, teamId, loadPlays, searchQuery, dateFilter]`;
- in `handleSelectPlay`, change `const result = await getPlayById({ id: play.id, teamId });` to `const result = await store.getPlayById({ id: play.id, teamId });`, and change its dependency list `[mode, onSelectPlay, teamId]` to `[store, mode, onSelectPlay, teamId]`;
- in `handleEditPlay`, change ``router.push(`/practice-planner/library/${playId}/edit`);`` to `navigate(routes.libraryEdit(playId));`, and change `[onEditPlay, router]` to `[onEditPlay, navigate, routes]`;
- in `handleDeleteConfirm`, change `const result = await deletePlay({` to `const result = await store.deletePlay({`, and change its dependency list `[playToDelete, teamId, loadPlays, searchQuery, dateFilter]` to `[store, playToDelete, teamId, loadPlays, searchQuery, dateFilter]`;
- replace both occurrences of `onClick={() => router.push("/practice-planner/library/new")}` with `onClick={() => navigate(routes.libraryNew())}`.

- [ ] **Step 6: Move `SessionDrillDialog` and `SessionDrillCard` behind the seam**

In `components/features/practice-planner/SessionDrillDialog.tsx`:
- replace `import { copySessionDrillToLibrary, saveSessionDrill } from "@/lib/actions/practice-session-drills";` with:
  ```ts
  import { usePlannerStore } from "@/lib/planner-store";
  ```
- in the header comment, change `Saves go through saveSessionDrill,` to `Saves go through the planner store's saveSessionDrill,`;
- as the first line of `SessionDrillDialog`'s body, before `const [playId, setPlayId]`, add:
  ```ts
      const store = usePlannerStore();
  ```
- change `const result = await saveSessionDrill({` to `const result = await store.saveSessionDrill({`;
- change `const copy = await copySessionDrillToLibrary({ playId: result.data.playId, teamId });` to `const copy = await store.copySessionDrillToLibrary({ playId: result.data.playId, teamId });`.

In `components/features/practice-planner/SessionDrillCard.tsx`:
- replace `import Image from "next/image";` with:
  ```ts
  import { usePlannerPlatform } from "@/lib/planner-store";
  ```
- directly after `}: SessionDrillCardProps) {`, add:
  ```ts
      const { Image } = usePlannerPlatform();
  ```
- replace its `<Image … />` element (`src={thumbnail}`) with:
  ```tsx
                      <Image src={thumbnail} alt={play.name || `Drill ${index + 1}`} fit="contain" />
  ```

- [ ] **Step 7: Shrink the ratchet**

In `__tests__/lib/planner-store/portability.test.ts`, delete these five lines from `KNOWN_VIOLATIONS`:

```ts
    "components/features/practice-planner/PlayLibrary.tsx -> @/lib/actions/plays",
    "components/features/practice-planner/PlayLibrary.tsx -> next/image",
    "components/features/practice-planner/PlayLibrary.tsx -> next/navigation",
    "components/features/practice-planner/SessionDrillCard.tsx -> next/image",
    "components/features/practice-planner/SessionDrillDialog.tsx -> @/lib/actions/practice-session-drills",
```

- [ ] **Step 8: Run the task's tests and type-check, and confirm they pass**

Run: `bun run test __tests__/components/features/practice-planner/PlayLibrary.portable.test.tsx __tests__/components/features/practice-planner/PlayLibrary.test.tsx __tests__/components/features/practice-planner/SessionDrillDialog.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.characterization.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.create-lock.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.drill-dialog.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.drill-ids.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.noop-edits.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.notify.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.stale-drill.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.stations.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.line-budget.test.ts __tests__/components/features/practice-planner/SessionDrillCard.station.test.tsx __tests__/components/features/practice-planner/SessionDrillList.busy.test.tsx __tests__/lib/planner-store/portability.test.ts`
Expected: PASS (all files).

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
/usr/bin/git add __tests__/helpers/planner.tsx __tests__/components/features/practice-planner components/features/practice-planner/PlayLibrary.tsx components/features/practice-planner/SessionDrillDialog.tsx components/features/practice-planner/SessionDrillCard.tsx __tests__/lib/planner-store/portability.test.ts
/usr/bin/git commit -m "refactor(practice-planner): library and drill editing through the planner store

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 4: Session views behind the seam

**Files:**
- Create: `__tests__/app/practice-session-detail-portable.test.tsx`
- Modify: `components/features/practice-planner/DuplicateSessionDialog.tsx`
- Modify: `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx`
- Modify: `components/features/practice-planner/print/BenchSheet.tsx`
- Modify: `__tests__/components/features/practice-planner/DuplicateSessionDialog.test.tsx` (the mock moves; the `next/navigation` `push` mock stays)
- Modify: `__tests__/app/practice-session-detail-stations.test.tsx` and `__tests__/app/practice-session-detail-timeline.test.tsx` (the mocks move)
- Modify: `__tests__/components/features/practice-planner/print/BenchSheet.test.tsx` (wrapper only)
- Modify: `__tests__/app/practice-planner-list-import.test.tsx` (delete the dead mock)
- Modify: `__tests__/lib/planner-store/portability.test.ts` (make it strict)

**Interfaces:**
- Consumes (Tasks 1–3): `usePlannerStore`, `usePlannerPlatform`, `PracticeSessionView`, `createMockPlannerStore`, `createHashPlatform` and `renderWithPlanner`.
- Produces: no new exports.

- [ ] **Step 1: Write the failing portable detail-view test**

Create `__tests__/app/practice-session-detail-portable.test.tsx`:

```tsx
/** SessionDetailView on the static app's shape: hash routes, and no team sharing (ADR-0020). */
import { describe, expect, it } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { createHashPlatform, createMockPlannerStore, renderWithPlanner, type MockPlannerStore } from "@/__tests__/helpers/planner";
import { SessionDetailView } from "@/app/(dashboard)/practice-planner/[sessionId]/SessionDetailView";

const ID = "csessionxxxxxxxxxxxxxxxxx";
const SESSION = {
    id: ID,
    title: "Tuesday",
    date: "2026-04-07T22:00:00.000Z",
    duration: 60,
    isShared: false,
    createdByName: "Coach",
    teamId: "cteamxxxxxxxxxxxxxxxxxxxx",
    teamName: "Team",
    plays: [
        {
            id: "row-1",
            sequence: 0,
            duration: 10,
            runsWithPrevious: false,
            instructions: null,
            play: { id: "play-1", name: "Breakout", description: null, thumbnail: "data:image/png;base64,AA==", playData: createEmptyPlayData() },
        },
    ],
};

function renderPortable(store: MockPlannerStore) {
    const platform = createHashPlatform();
    renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <SessionDetailView session={SESSION} isAdmin />
        </ThemeProvider>,
        { store, platform },
    );
    return platform;
}

function storeWithoutSharing(): MockPlannerStore {
    const store = createMockPlannerStore();
    delete store.sharePracticeSession;
    return store;
}

describe("SessionDetailView on a portable platform", () => {
    it("hides Share when the store has no team sharing, and keeps the other admin actions", () => {
        renderPortable(storeWithoutSharing());
        expect(screen.queryByRole("button", { name: /share/i })).toBeNull();
        expect(screen.getByRole("button", { name: "Duplicate" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    });

    it("shows Share when the store has it", () => {
        renderPortable(createMockPlannerStore());
        expect(screen.getByRole("button", { name: /share/i })).toBeInTheDocument();
    });

    it("links with the platform's routes", () => {
        renderPortable(storeWithoutSharing());
        expect(screen.getByRole("link", { name: "Practice Planner" })).toHaveAttribute("href", "#/");
        expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute("href", `#/sessions/${ID}/edit`);
        expect(screen.getByRole("link", { name: "Print bench sheet" })).toHaveAttribute("href", `#/sessions/${ID}/print`);
    });

    it("deletes through the store, then navigates to the list route", async () => {
        const store = storeWithoutSharing();
        store.deletePracticeSession.mockResolvedValue({ success: true, data: { id: ID } });
        const platform = renderPortable(store);
        fireEvent.click(screen.getByRole("button", { name: "Delete" }));
        const dialog = screen.getByRole("dialog", { name: "Delete Practice Session?" });
        await act(async () => {
            fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
        });
        expect(store.deletePracticeSession).toHaveBeenCalledWith({ id: ID, teamId: SESSION.teamId });
        expect(platform.navigate).toHaveBeenCalledWith("#/");
    });

    it("draws the active drill with the platform's Image", () => {
        renderPortable(storeWithoutSharing());
        expect(screen.getByRole("img", { name: "Breakout" })).toHaveAttribute("data-fit", "contain");
    });
});
```

- [ ] **Step 2: Move the existing tests' mocks (they fail until Step 4)**

**`DuplicateSessionDialog.test.tsx`**
- Change `import { act, fireEvent, render, screen } from "@testing-library/react";` to `import { act, fireEvent, screen } from "@testing-library/react";`.
- Add `import { createMockPlannerStore, renderWithPlanner } from "@/__tests__/helpers/planner";` under the imports.
- Delete `const actions = vi.hoisted(() => ({ duplicatePracticeSession: vi.fn() }));` and `vi.mock("@/lib/actions/practice-session-drills", () => actions);`.
- Keep `const push = vi.fn();` and `vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));`. The real hosted platform navigates with that `push`.
- Directly after `import { DuplicateSessionDialog } from "@/components/features/practice-planner/DuplicateSessionDialog";`, add:
  ```ts
  const actions = createMockPlannerStore();
  ```
- Change both renders to:
  ```tsx
  renderWithPlanner(<DuplicateSessionDialog open sessionId={SESSION} teamId={TEAM} sourceDate={SOURCE_DATE} onClose={vi.fn()} />, { store: actions });
  ```

**`__tests__/app/practice-session-detail-stations.test.tsx` and `__tests__/app/practice-session-detail-timeline.test.tsx`**
- Delete:
  ```ts
  vi.mock("@/lib/actions/practice-sessions", () => ({ deletePracticeSession: vi.fn(), sharePracticeSession: vi.fn() }));
  vi.mock("@/lib/actions/practice-session-drills", () => ({ duplicatePracticeSession: vi.fn() }));
  ```
- Remove `render` from the `@testing-library/react` import, and add `import { renderWithPlanner } from "@/__tests__/helpers/planner";`.
- In `renderView`, change `render(` to `renderWithPlanner(`. The store double's `vi.fn`s replace the deleted `vi.fn`s.

**`print/BenchSheet.test.tsx`** (wrapper only)
- Remove `render` from the `@testing-library/react` import, and add `import { renderWithPlanner } from "@/__tests__/helpers/planner";`.
- Change the single `render(` to `renderWithPlanner(`.
- The "Back to session" `href` assertion stays: the real hosted platform renders `next/link`.

**`__tests__/app/practice-planner-list-import.test.tsx`** (dead mock)
- Delete line 5, `vi.mock("@/lib/actions/practice-session-drills", () => ({ duplicatePracticeSession: vi.fn() }));`. `PracticePlannerList` no longer reaches that module.

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `bun run test __tests__/app/practice-session-detail-portable.test.tsx __tests__/components/features/practice-planner/DuplicateSessionDialog.test.tsx __tests__/app/practice-session-detail-stations.test.tsx`
Expected: FAIL. The components still import the real actions (`next-auth` → `next/server`), and the portable test finds `/practice-planner…` hrefs where it expects `#/…`.

- [ ] **Step 4: Move `DuplicateSessionDialog` behind the seam**

In `components/features/practice-planner/DuplicateSessionDialog.tsx`:
- delete `import { useRouter } from "next/navigation";`;
- replace `import { duplicatePracticeSession } from "@/lib/actions/practice-session-drills";` with:
  ```ts
  import { usePlannerPlatform, usePlannerStore } from "@/lib/planner-store";
  ```
- replace `const router = useRouter();` with:
  ```ts
      const store = usePlannerStore();
      const { navigate, routes } = usePlannerPlatform();
  ```
- change `const result = await duplicatePracticeSession({ id: sessionId, teamId, date });` to `const result = await store.duplicatePracticeSession({ id: sessionId, teamId, date });`;
- change ``router.push(`/practice-planner/${result.data.id}/edit`);`` to `navigate(routes.sessionEdit(result.data.id));`.

- [ ] **Step 5: Move `SessionDetailView` behind the seam**

In `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx`:
- delete these three imports: `import { useRouter } from "next/navigation";`, `import Link from "next/link";` and `import Image from "next/image";`;
- replace the four-line import:

  ```ts
  import {
    deletePracticeSession,
    sharePracticeSession,
  } from "@/lib/actions/practice-sessions";
  ```

  with:

  ```ts
  import { usePlannerPlatform, usePlannerStore } from "@/lib/planner-store";
  ```
- in `SessionDetailView`, replace `const router = useRouter();` with:

  ```ts
    const store = usePlannerStore();
    const { Link, Image, navigate, routes } = usePlannerPlatform();
  ```
- replace the whole `handleDelete` and `handleShare` callbacks with:

  ```tsx
    const handleDelete = useCallback(async () => {
      setIsDeleting(true);
      setError(null);

      const result = await store.deletePracticeSession({
        id: session.id,
        teamId: session.teamId,
      });

      if (result.success) {
        navigate(routes.list());
      } else {
        setError(result.error);
        setIsDeleting(false);
        setShowDeleteDialog(false);
      }
    }, [session.id, session.teamId, store, navigate, routes]);

    const handleShare = useCallback(async () => {
      // Team sharing is hosted-only; the button is hidden when the store lacks it.
      if (!store.sharePracticeSession) return;
      setIsSharing(true);
      setError(null);
      setShowShareDialog(false);

      const result = await store.sharePracticeSession({
        id: session.id,
        teamId: session.teamId,
        isShared: !isShared,
      });

      if (result.success) {
        setIsShared(result.data.isShared);
      } else {
        setError(result.error);
      }
      setIsSharing(false);
    }, [session.id, session.teamId, isShared, store]);
  ```
- in the back button, change `href="/practice-planner"` to `href={routes.list()}`;
- in the print button, change ``href={`/practice-planner/${session.id}/print`}`` to `href={routes.sessionPrint(session.id)}`;
- in both Edit buttons (header "Edit" and empty-state "Edit Session"), change ``href={`/practice-planner/${session.id}/edit`}`` to `href={routes.sessionEdit(session.id)}`;
- wrap the Share `<Tooltip …>…</Tooltip>` (the one whose title is `{isShared ? "Unshare from team" : "Share with team"}`) like this, leaving its contents unchanged:

  ```tsx
                  {store.sharePracticeSession && (
                    <Tooltip title={isShared ? "Unshare from team" : "Share with team"}>
                      {/* …the existing Button, unchanged… */}
                    </Tooltip>
                  )}
  ```
- replace the main-board `<Image … />` (`src={activePlay.play.thumbnail}`) with:

  ```tsx
                      <Image src={activePlay.play.thumbnail} alt={activePlay.play.name} fit="contain" />
  ```
- in `SidebarPlayCard`, directly after `function SidebarPlayCard({ sp, index, active, onSelect }: SidebarPlayCardProps) {`, add:

  ```ts
    const { Image } = usePlannerPlatform();
  ```

  Then replace its `<Image … />` (`src={sp.play.thumbnail}`) with:

  ```tsx
                <Image src={sp.play.thumbnail} alt="" fit="cover" />
  ```

- [ ] **Step 6: Move `BenchSheet`'s link behind the seam**

In `components/features/practice-planner/print/BenchSheet.tsx`:
- replace `import { LinkButton } from "@/components/ui/NextLinkComposites";` with:
  ```ts
  import { usePlannerPlatform } from "@/lib/planner-store";
  ```
- as the first line of `BenchSheet`'s body, before `const start = sessionStart(session);`, add:
  ```ts
      const { Link, routes } = usePlannerPlatform();
  ```
- replace:

  ```tsx
                <LinkButton href={`/practice-planner/${session.id}`} variant="outlined" startIcon={<ArrowBackIcon />}>
                    Back to session
                </LinkButton>
  ```

  with this, which is exactly what `LinkButton` rendered:

  ```tsx
                <Button component={Link} href={routes.session(session.id)} variant="outlined" startIcon={<ArrowBackIcon />}>
                    Back to session
                </Button>
  ```

- [ ] **Step 7: Make the portability test strict**

In `__tests__/lib/planner-store/portability.test.ts`:
- delete the `// Tasks 3 and 4 move…` comment and the whole `KNOWN_VIOLATIONS` array;
- delete the `it("keeps the known list current …")` test;
- replace the second test with:

  ```ts
      it("reaches no server, Prisma, auth or Next.js runtime module", () => {
          expect(violations).toEqual([]);
      });
  ```

- [ ] **Step 8: Run the task's tests, the budget test and type-check, and confirm they pass**

Run: `bun run test __tests__/app/practice-session-detail-portable.test.tsx __tests__/components/features/practice-planner/DuplicateSessionDialog.test.tsx __tests__/app/practice-session-detail-stations.test.tsx __tests__/app/practice-session-detail-timeline.test.tsx __tests__/components/features/practice-planner/print/BenchSheet.test.tsx __tests__/app/practice-planner-list-import.test.tsx __tests__/app/practice-session-bench-sheet-page.test.tsx __tests__/app/SessionDetailView.line-budget.test.ts __tests__/rsc-boundary-guard.test.ts __tests__/lib/planner-store/portability.test.ts __tests__/components/features/practice-planner/ExportPlanMenu.test.tsx`
Expected: PASS (all files).

Run: `bun run type-check`
Expected: PASS.

Run: `wc -l "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx"`
Expected: under 846, and well under 900.

- [ ] **Step 9: Commit**

```bash
/usr/bin/git add __tests__/app/practice-session-detail-portable.test.tsx components/features/practice-planner/DuplicateSessionDialog.tsx "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx" components/features/practice-planner/print/BenchSheet.tsx __tests__/components/features/practice-planner/DuplicateSessionDialog.test.tsx __tests__/app/practice-session-detail-stations.test.tsx __tests__/app/practice-session-detail-timeline.test.tsx __tests__/components/features/practice-planner/print/BenchSheet.test.tsx __tests__/app/practice-planner-list-import.test.tsx __tests__/lib/planner-store/portability.test.ts
/usr/bin/git commit -m "refactor(practice-planner): session detail, duplicate and bench sheet through the planner seam

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 5: ESLint guard and ADR-0020 coverage

**Files:**
- Modify: `eslint.config.mjs` (add constants after `SOURCE_GLOB`, and a block at the end of `eslintConfig`)
- Modify: `docs/adr/0020-exchange-practice-plans-as-a-portable-versioned-document-and-ship-a-static-local.md` (frontmatter `affects`)

**Interfaces:**
- Consumes: the clean import graph from Task 4.
- Produces: the lint block `adr-0020/portable-practice-planner`.

- [ ] **Step 1: Confirm the guard is absent (the failing check)**

Run:

```bash
printf 'import Link from "next/link";\nexport const L = Link;\n' | bunx eslint --stdin --stdin-filename "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx"; echo "exit=$?"
```

Expected: `exit=0`, because nothing forbids `next/link` there yet.

- [ ] **Step 2: Add the lint block**

In `eslint.config.mjs`, directly after the line `const SOURCE_GLOB = "*.{js,jsx,mjs,cjs,ts,tsx}";`, add:

```js

/**
 * ADR-0020: the static planner (apps/planner, sub-project 3) reuses these
 * modules, so they reach server actions and Next.js only through
 * usePlannerStore()/usePlannerPlatform() from lib/planner-store. Type imports
 * are banned too: the portable code declares its own types (SegmentKind in
 * types/segments.ts, PracticeSessionView in types/practice-planner.ts).
 *
 * This is the per-file, authoring-time half. The transitive half, which
 * catches a shared components/ui or lib/utils module that pulls in next/*, is
 * __tests__/lib/planner-store/portability.test.ts, and that is the gate.
 */
const PLANNER_PORTABILITY_MESSAGE =
  "Portable practice-planner code (ADR-0020) must not import server actions, Prisma, auth " +
  "or Next.js runtime modules. Use usePlannerStore()/usePlannerPlatform() from " +
  "@/lib/planner-store, and local types.";

/** Glob-escaped: `[sessionId]` would otherwise be a character class and match nothing. */
const SESSION_DETAIL_VIEW = "app/\\(dashboard\\)/practice-planner/\\[sessionId\\]/SessionDetailView.tsx";
```

Then add this as the **last** element of the `eslintConfig` array, after the `adr-0003/no-raw-sql-in-application-code` block:

```js
  {
    name: "adr-0020/portable-practice-planner",
    files: [
      `components/features/practice-planner/**/${SOURCE_GLOB}`,
      SESSION_DETAIL_VIEW,
      `lib/planner-store/**/${SOURCE_GLOB}`,
      `lib/plan-document/**/${SOURCE_GLOB}`,
      "lib/utils/session-timeline.ts",
      "types/segments.ts",
      "types/practice-planner.ts",
    ],
    // The hosted import flow (sub-project 1): it calls importPracticePlan and useRouter by design.
    ignores: ["components/features/practice-planner/PlanImportView.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "next",
            "@/auth",
            "@prisma/client",
            "server-only",
            "@/components/ui/NextLinkComposites",
            "@/components/providers/HostedPlannerProvider",
            "@/components/providers/hosted-planner-platform",
          ].map((name) => ({ name, message: PLANNER_PORTABILITY_MESSAGE })),
          patterns: [
            {
              group: ["next/*", "@/lib/actions/*", "@/lib/db/*", "@/lib/auth/*"],
              message: PLANNER_PORTABILITY_MESSAGE,
            },
          ],
        },
      ],
    },
  },
```

- [ ] **Step 3: Verify the guard reaches the escaped path and rejects violations**

Run:

```bash
bunx eslint --print-config "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx" | grep -c '"no-restricted-imports"'
```

Expected: `1` or more. A `0` means the glob escape is wrong.

Run:

```bash
printf 'import Link from "next/link";\nexport const L = Link;\n' | bunx eslint --stdin --stdin-filename "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx"; echo "exit=$?"
printf 'import type { SegmentKind } from "@prisma/client";\nexport type K = SegmentKind;\n' | bunx eslint --stdin --stdin-filename components/features/practice-planner/Probe.tsx; echo "exit=$?"
printf 'import { deletePlay } from "@/lib/actions/plays";\nexport const d = deletePlay;\n' | bunx eslint --stdin --stdin-filename lib/planner-store/probe.ts; echo "exit=$?"
printf 'import { useRouter } from "next/navigation";\nexport const r = useRouter;\n' | bunx eslint --stdin --stdin-filename components/features/practice-planner/PlanImportView.tsx; echo "exit=$?"
```

Expected:
- the first three each print the portability message and `exit=1`;
- the fourth prints `exit=0`, because `PlanImportView` is exempt.

These are stdin probes, so no file is created.

Run: `bun run lint`
Expected: 0 errors. The existing warnings are unchanged.

- [ ] **Step 4: Extend ADR-0020's `affects`**

In the frontmatter of `docs/adr/0020-exchange-practice-plans-as-a-portable-versioned-document-and-ship-a-static-local.md`, add this entry to the end of the `affects:` list, after the `apps/planner/**` entry:

```yaml
  - type: path
    pattern: "lib/planner-store/**"
    note: The client-side store and platform seam the static app implements; hosted implements it with the server actions.
```

Run: `bun run adr:lint`
Expected: PASS.

Run: `bun run adr:explain lib/planner-store/types.ts`
Expected: lists ADR-0020.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add eslint.config.mjs docs/adr/0020-exchange-practice-plans-as-a-portable-versioned-document-and-ship-a-static-local.md
/usr/bin/git commit -m "chore(practice-planner): lint guard for portable planner imports

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 6: Gates and roadmap status

**Files:**
- Modify: `docs/superpowers/specs/2026-10-03-static-planner-roadmap.md` (row 2)

- [ ] **Step 1: Run every gate**

Run each of these and expect it to pass:

```bash
bun run type-check
bun run lint
bun run test
bun run build
bun run adr:lint
bun run check:raw-sql
```

- **`bun run test`:** the whole suite must be green, including every pre-existing practice-planner file listed in the spec.
- **If a test fails:** do not edit its assertions. Behaviour preservation means the refactor is wrong.
- **`bun run build`:** this covers the two new layouts. Confirm that the output lists `/practice-planner` and `/practice-planner/[sessionId]/print`.

- [ ] **Step 2: Verify that hosted behaviour is unchanged in the diff**

Run:

```bash
/usr/bin/git diff 8ce6e25 --stat -- lib/actions app/\(dashboard\)/practice-planner/page.tsx app/\(dashboard\)/practice-planner/new app/\(dashboard\)/practice-planner/library app/\(dashboard\)/practice-planner/\[sessionId\]/edit app/\(dashboard\)/practice-planner/import app/\(dashboard\)/practice-planner/PracticePlannerList.tsx components/features/practice-planner/PlanImportView.tsx components/features/practice-planner/ExportPlanMenu.tsx
```

Expected: empty. No action, page, wrapper, list, import view or export menu changed.

- [ ] **Step 3: Update roadmap row 2**

In `docs/superpowers/specs/2026-10-03-static-planner-roadmap.md`, in the row that begins `| 2 | \`PlannerStore\` seam.`, replace the final cell `Spec to write` with:

```
Built: spec `2026-10-03-planner-store-design.md`, plan `../plans/2026-10-03-planner-store.md`
```

- [ ] **Step 4: Commit**

```bash
/usr/bin/git add docs/superpowers/specs/2026-10-03-static-planner-roadmap.md
/usr/bin/git commit -m "docs(practice-planner): planner store seam built

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

## Self-Review

**Spec coverage.** Each section of the spec maps to a task:

| Spec section | Task |
|---|---|
| Module layout | 2 |
| `PlannerStore`, all 9 methods, optional share | 2, 4 |
| `PlannerPlatform` with `Link`, `Image`, `navigate` and 6 routes | 2 |
| Context that throws | 2 |
| Two layouts | 2 |
| Component changes: `PlayLibrary`, `SessionDrillDialog`, `SessionDrillCard` | 3 |
| Component changes: `DuplicateSessionDialog`, `SessionDetailView`, `BenchSheet` | 4 |
| Types: `SegmentKind` and `PracticeSessionView` | 1 |
| ESLint guard | 5 |
| Portability walk | 1, tightened in 2–4 |
| Test double, plus every listed test file migrated | 3, 4 |
| New tests: context, hosted identity, layouts, platform forwarding, portable library and detail, type equality | 1–4 |
| Gates, ADR `affects` and roadmap | 5, 6 |

**Out-of-scope items stay out:** no memory store, no change to `PracticePlannerList` or `PlanImportView`, no `replace` or `refresh`, and no move of `SessionDetailView`.

**Placeholders.** Every code step shows the code itself. Edits to existing files quote their anchors.

**Type consistency:**
- Names match across tasks: `usePlannerStore`, `usePlannerPlatform`, `PlannerProvider`, `MISSING_PROVIDER_MESSAGE`, `hostedPlannerStore`, `hostedPlannerRoutes`, `HostedLink`, `HostedImage`, `useHostedPlannerPlatform`, `createMockPlannerStore`, `createHashPlatform`, `renderWithPlanner`, `MockPlannerStore`, `PracticeSessionView`, `PracticeSessionViewPlay` and `SegmentKind`.
- The route names (`list`, `session`, `sessionEdit`, `sessionPrint`, `libraryNew`, `libraryEdit`) match in types, the hosted platform, the hash platform and every consumer.
- `MockPlannerStore` keeps `sharePracticeSession` optional (a homomorphic mapped type), so `delete store.sharePracticeSession` type-checks in Task 4.

**Review Focus.** Each of the five lines has a pinned test in the task that owns the code:
1. Print layout: Task 2.
2. `next/link` and `next/image` forwarding: Task 2.
3. Identity store: Task 2.
4. Escaped glob: Task 5, Step 3.
5. Share hidden: Task 4.
