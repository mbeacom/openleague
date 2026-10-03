# Static Planner App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the zero-account practice planner as a Vite single-page app in `apps/planner/`, storing plans in IndexedDB, reusing the hosted planner components through the `PlannerStore`/`PlannerPlatform` seam, and deploying to `https://openleague.dev/planner/` with the GitHub Pages docs site.

**Architecture:**
- **Shared changes (small, hosted-neutral):** the platform carries the plan hand-off (`planGenerator`, `planLink`) so `ExportPlanMenu` stops reading `process.env`; the session editor shows Share only with a share handler; `readPlanFile` and `duplicateSessionTitle` move to portable modules.
- **Static store:** a transactional `PlannerRepo` (IndexedDB adapter, plus an in-memory adapter used as the production fallback and as the second contract target) under one implementation of the hosted semantics, `createLocalPlannerStore`.
- **Static app:** hash routes, a module-constant platform (`<a>`, a `fill`-style `<img>`, `location.hash`), screens that are thin glue around the reused components, and an import screen for files and `#plan=` links.
- **Delivery:** root scripts drive Vite; `dist/planner` is checked by a bundle checker and copied into the Pages artifact; pull requests build it too.

**Tech Stack:** TypeScript 5.9 (strict), React 19.2, MUI v7 + MUI X date pickers, Vite 7 + `@vitejs/plugin-react` 4.7, Zod v4, IndexedDB, Vitest 4 + Testing Library (jsdom) + `fake-indexeddb` 6, ESLint 9 flat config, Bun.

**Spec:** `docs/superpowers/specs/2026-10-03-static-planner-app-design.md`. Context: `docs/superpowers/specs/2026-10-03-static-planner-roadmap.md` (row 3), `docs/superpowers/specs/2026-10-03-planner-store-design.md`, `docs/superpowers/specs/2026-10-03-plan-document-design.md` and `docs/adr/0020-exchange-practice-plans-as-a-portable-versioned-document-and-ship-a-static-local.md`.

## Global Constraints

- **Base.** Branch `feat/static-planner`. Product code is unchanged since `c1b7dce`; line numbers below are taken there. If a line has shifted, find the edit by its quoted anchor text.
- **Toolchain.**
  - Use `bun` for everything: `bun run test <files>`, `bun run type-check`, `bun run lint`, `bun run build`, `bun add -d …`. Never npm or yarn (ADR-0005).
  - Use `/usr/bin/git`. Never `git stash`, never switch branches.
- **Dependencies.** Exactly two new **devDependencies**: `vite` (`^7.1.9`, the version Vitest already resolves) and `fake-indexeddb` (`^6`). No runtime dependency, no IndexedDB wrapper library, no `apps/planner/package.json`, no workspace.
- **Scope.** No schema change, no migration, no change to any file in `lib/actions/`, to any page, or to the hosted editor wrappers. `PlanImportView.tsx` changes only by importing and re-exporting the moved `readPlanFile`/`FILE_TOO_LARGE_MESSAGE`.
- **Hosted behaviour must not change.** Hosted keeps every server-action argument, every path, `next/image` thumbnails, the "Copy “Open in planner” link" item (shown only when `NEXT_PUBLIC_STATIC_PLANNER_URL` is set) and `generator: "openleague-hosted"` in exported files. Existing tests keep their assertions; the only allowed edits are `render` → `renderWithPlanner` in `ExportPlanMenu.test.tsx`.
- **Portability.** Nothing under `apps/planner/` may import `next`, `next/*`, `@/lib/{actions,db,auth}/*`, `@/auth`, `@prisma/client`, `server-only`, `@/components/ui/NextLinkComposites`, or the hosted provider modules. The ESLint block and the portability walk enforce it.
- **No telemetry** in the static app: no analytics, no Sentry, no service worker, no network calls except the two font stylesheets.
- **IndexedDB rule.** Inside `repo.write(work)`/`repo.read(work)`, `work` awaits only `RepoTx` calls; everything else in it is synchronous. Thumbnails, sanitizing and parsing that can run earlier run before the transaction.
- **Clock in store tests.** Inject `now` through the store options. Do **not** use `vi.useFakeTimers` in any test that touches `fake-indexeddb`: it schedules with timers and hangs.
- **Copy, verbatim** (constants named in parentheses):
  - Privacy (`PRIVACY_NOTE`): `Your practices stay in this browser. Nothing is uploaded, and there's no account or tracking. Browsers can clear site data, so download plan files to keep a backup.`
  - Fallback storage (`NOT_SAVING_MESSAGE`): `This browser isn't letting the planner save. Your work will be lost when you close this tab. Download plan files to keep it.`
  - Stale tab (`STALE_TAB_MESSAGE`): `The planner was updated in another tab. Reload to continue.`
  - Storage full (`STORAGE_FULL_MESSAGE`): `Your browser is out of storage space for this site. Download plan files to back up, then delete old practices or drills.`
  - Missing session (`SESSION_NOT_ON_DEVICE_MESSAGE`): `This practice isn't on this device.`
  - Missing drill (`DRILL_NOT_ON_DEVICE_MESSAGE`): `This drill isn't on this device.`
  - Owned-copy delete (`OWNED_DRILL_DELETE_MESSAGE`, hosted's text): `This drill belongs to a practice session. Remove it from that session.`
  - Hand-off label: `Open in OpenLeague`; success (`OPENED_IN_HOSTED_NOTICE`): `Opened OpenLeague in a new tab. Sign in there to save this plan to a team.`
  - Crash (`CRASH_MESSAGE`): `Something went wrong. Your saved practices are safe in this browser.`
- **Static constants.** `LOCAL_TEAM_ID = "local"`, `LOCAL_TEAM_NAME = "This device"`, `LOCAL_AUTHOR_NAME = "You"`, `DEFAULT_HOSTED_URL = "https://openl.app"`. Hosted import URL: `${HOSTED_URL}/practice-planner/import` (from `PLAN_IMPORT_PATH`).
- **Hash routes, verbatim:** `#/`, `#/sessions/new`, `#/sessions/<id>`, `#/sessions/<id>/edit`, `#/sessions/<id>/print`, `#/library`, `#/library/new`, `#/library/<id>/edit`, `#/import`; a hash holding `plan=` is a plan link.
- **Line budgets.** `SessionDetailView.tsx` ≤ 900 lines (untouched here); `PracticeSessionEditor.tsx` ≤ 900 (878 at `c1b7dce`; this plan changes one line).
- **Tests** live under `__tests__/` mirroring the source path (`__tests__/apps/planner/…`).
- **Commits** are conventional commits, then a blank line, then `Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX`.
- **Per task:** at the end of every task, `bun run type-check` and the task's own Vitest files are green.

## Rulings (decided during planning)

1. **One package, one lockfile.** `apps/planner` is driven by root scripts (`planner:dev|build|preview|check`) with `vite.config.ts` in `apps/planner/`. A Bun workspace would change `bun install` repo-wide and risk two copies of React/MUI/Zod across the `@/` boundary.
2. **`vite` becomes an explicit devDependency** because the scripts call its CLI; relying on Vitest's transitive copy would break silently on a Vitest bump. `fake-indexeddb` is test-only: jsdom has no IndexedDB and the adapter's upgrade/abort paths need a real implementation. Raw IndexedDB (≈120 lines) instead of `idb`.
3. **No `vite/client` types.** `next-env.d.ts` already references `next/image-types/global`, which declares the same asset modules; mixing them in one program risks conflicting declarations. The one build constant is `define`d as `__OPENLEAGUE_HOSTED_URL__`, declared in `apps/planner/src/env.d.ts`, and read with a `typeof` guard so Vitest (no `define`) falls back to the default.
4. **Root `tsc`, `eslint .` and `vitest` already cover `apps/planner`**; no extra tsconfig. The ADR-0020 ESLint block gains `apps/planner/**`; the portability walk gains `apps/planner/src/main.tsx`.
5. **`base: "./"` and `outDir: dist/planner`.** Relative assets work at `/planner/`, on forks, and under `vite preview`; hash routing needs no server fallback. The docs build deletes `dist/docs-pages`, so the workflow copies `dist/planner` in afterwards.
6. **The platform carries the hand-off** (`planGenerator`, `planLink`, both required). `ExportPlanMenu` reads them and never `process.env`. Hosted keeps "copy"; static uses "open", which opens its tab inside the click (before any `await`) so popup blockers allow it, then points it at the hosted import page.
7. **Repo layer + one semantic implementation.** IndexedDB and memory adapters implement `PlannerRepo`; `createLocalPlannerStore` holds the hosted semantics once. The memory adapter lives in `apps/planner/` because it is the production fallback; sub-project 2's "no in-memory store in product code" ruling was scoped to hosted code.
8. **Every stored session is a valid plan document.** Session writes run `parsePlan(serializePlan(…))` inside the transaction, after checking keys, contiguous sequences and station groups, so every local session exports and imports into hosted.
9. **The static store has no `sharePracticeSession`** (Share hidden in the detail view), and `PracticeSessionEditor` renders Share only when `onShare` is passed.
10. **Screens receive the `LocalPlannerStore` as a prop**; reused components get the same object through `PlannerProvider`. `main.tsx` creates it once and the platform is a module constant (the sub-project 2 stability carry-over).
11. **The import screen has one stable key for `import` and `planLink`** and keeps a pending link in state (adjusted during render), so replacing `#plan=…` with `#/import` never remounts it or cancels decoding.
12. **Fonts as hosted** (Fontshare Cabinet Grotesk, Google Fonts JetBrains Mono); a build-only CSP `<meta>`; no `InitColorSchemeScript` (inline script, SSR-only value).
13. **Seeding is not a user write**: it skips the persistence request, so no browser permission prompt appears at first load.
14. **Pages triggers widen** to every bundled source, and `quality-gates.yml` builds and checks the planner on every PR.
15. **The bundle check bans *unguarded* `process.env` reads.** A read behind a `typeof process` guard is safe in a browser, so a dependency that guards its own check must not fail the build; this refines the spec's literal "no `process.env`" rule without weakening it.

## Review Focus

1. **A `#plan=` link reaching a tab where the app is already open** (pasted into the address bar): the import screen must show the new plan, not the old one or a blank. Pinned in Task 6 ("shows a second link pasted into the open screen").
2. **The URL replacement after reading `#plan=` re-rendering the app** (StrictMode replays effects; the hash subscription re-checks its snapshot): the preview must still appear. Pinned in Task 7 ("opens a #plan= link under StrictMode and lands on the new session").
3. **Store code awaiting something other than the repo inside a transaction** (IndexedDB commits early): the write must fail loudly and store nothing, never half-apply. Pinned in Task 3 ("rejects a write that awaits a timer before touching the store, and stores nothing").
4. **A full disk** (`QuotaExceededError` from a request or the commit): the coach gets the storage-full message and nothing is half-written. Pinned in Task 4 ("maps a quota error to the storage-full message").
5. **A browser that refuses IndexedDB** (private mode, blocked site data) or a stale second tab: the app still works for the session and says so. Pinned in Task 7 ("falls back to memory when IndexedDB fails to open" and the two banner tests).

---

### Task 1: Shared seam changes for the static app

**Files:**
- Modify: `lib/planner-store/types.ts`
- Modify: `components/providers/hosted-planner-platform.tsx`
- Modify: `components/features/practice-planner/ExportPlanMenu.tsx`
- Modify: `components/features/practice-planner/PracticeSessionEditor.tsx:800` (anchor `{/* Share Button */}`)
- Create: `lib/plan-document/file.ts`; Modify: `lib/plan-document/index.ts`, `components/features/practice-planner/PlanImportView.tsx:29-46`
- Modify: `lib/utils/session-drill-ids.ts`, `lib/services/practice-session-drills.ts:8-12,322-327`
- Modify: `__tests__/helpers/planner.tsx` (`createHashPlatform`)
- Modify: `docs/adr/0020-exchange-practice-plans-as-a-portable-versioned-document-and-ship-a-static-local.md` (`affects`)
- Test: `__tests__/components/features/practice-planner/ExportPlanMenu.test.tsx` (modify), `__tests__/components/providers/hosted-planner-platform.test.tsx` (modify), `__tests__/components/features/practice-planner/PracticeSessionEditor.share.test.tsx` (create), `__tests__/lib/plan-document/file.test.ts` (create), `__tests__/lib/utils/duplicate-session-title.test.ts` (create)

**Interfaces:**
- Produces: `PlannerPlanLink { label: string; mode: "copy" | "open"; baseUrl: string }`; `PlannerPlatform.planGenerator: PlanGenerator`; `PlannerPlatform.planLink: PlannerPlanLink | null`; `hostedPlanLink(url?: string): PlannerPlanLink | null`; `buildPlanDocument(session, now?: Date, generator?: PlanGenerator)`; `LINK_COPIED_NOTICE`, `OPENED_IN_HOSTED_NOTICE` (exported from `ExportPlanMenu.tsx`); `readPlanFile(file: File): Promise<ParsePlanResult>` and `FILE_TOO_LARGE_MESSAGE` from `@/lib/plan-document`; `duplicateSessionTitle(title: string): string` from `@/lib/utils/session-drill-ids`.

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/components/providers/hosted-planner-platform.test.tsx` (inside the existing `describe`):

```tsx
    it("hands plans off with the copy-link item only when NEXT_PUBLIC_STATIC_PLANNER_URL is set", () => {
        try {
            vi.stubEnv("NEXT_PUBLIC_STATIC_PLANNER_URL", "");
            expect(renderHook(() => useHostedPlannerPlatform()).result.current).toMatchObject({
                planGenerator: "openleague-hosted",
                planLink: null,
            });
            vi.stubEnv("NEXT_PUBLIC_STATIC_PLANNER_URL", " https://openleague.dev/planner/ ");
            expect(renderHook(() => useHostedPlannerPlatform()).result.current.planLink).toEqual({
                label: "Copy “Open in planner” link",
                mode: "copy",
                baseUrl: "https://openleague.dev/planner/",
            });
        } finally {
            vi.unstubAllEnvs();
        }
    });
```

In `__tests__/components/features/practice-planner/ExportPlanMenu.test.tsx`:
- add `import { createHashPlatform, renderWithPlanner } from "@/__tests__/helpers/planner";`, `import type { PlannerPlatform } from "@/lib/planner-store";` and `OPENED_IN_HOSTED_NOTICE` to the `ExportPlanMenu` import;
- replace every `render(<ExportPlanMenu` with `renderWithPlanner(<ExportPlanMenu` (the hosted platform reads the stubbed env, so the existing assertions hold) and drop `render` from the Testing Library import if unused;
- append this `describe`:

```tsx
describe("ExportPlanMenu in the static planner", () => {
    const STATIC_PLATFORM: PlannerPlatform = {
        ...createHashPlatform(),
        planGenerator: "openleague-static",
        planLink: { label: "Open in OpenLeague", mode: "open", baseUrl: "https://openl.app/practice-planner/import" },
    };

    function fakeTab() {
        return { opener: {} as unknown, location: { replace: vi.fn() }, close: vi.fn() };
    }

    it("writes generator openleague-static into the downloaded file", async () => {
        renderWithPlanner(<ExportPlanMenu session={SESSION} />, { platform: STATIC_PLATFORM });
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: "Download plan file" }));
        const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
        expect(JSON.parse(await blob.text()).generator).toBe("openleague-static");
    });

    it("opens the hosted import page in a tab opened inside the click", async () => {
        const tab = fakeTab();
        const open = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
        renderWithPlanner(<ExportPlanMenu session={SESSION} />, { platform: STATIC_PLATFORM });
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: "Open in OpenLeague" }));

        // Synchronous: no await has run yet, so a popup blocker sees the click.
        expect(open).toHaveBeenCalledWith("", "_blank");
        expect(tab.opener).toBeNull();
        await waitFor(() => expect(tab.location.replace).toHaveBeenCalledTimes(1));
        const url = tab.location.replace.mock.calls[0][0] as string;
        expect(url).toMatch(/^https:\/\/openl\.app\/practice-planner\/import#plan=[A-Za-z0-9_-]+$/);
        const result = parsePlan(await decodePlanLink(url.split("#plan=")[1]));
        expect(result.ok && result.plan.generator).toBe("openleague-static");
        expect(result.ok && result.plan.session.title).toBe("Tuesday Skills");
        expect(await screen.findByText(OPENED_IN_HOSTED_NOTICE)).toBeInTheDocument();
    });

    it("closes the blank tab and says so when the plan is too large for a link", async () => {
        const tab = fakeTab();
        vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
        const big: ExportableSession = {
            ...SESSION,
            duration: 300,
            plays: Array.from({ length: 40 }, (_, i) => ({ ...sessionPlay(`Drill ${i}`, i), duration: 1, instructions: "a".repeat(2000) })),
        };
        renderWithPlanner(<ExportPlanMenu session={big} />, { platform: STATIC_PLATFORM });
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: "Open in OpenLeague" }));
        expect(await screen.findByText(LINK_TOO_LARGE_MESSAGE)).toBeInTheDocument();
        expect(tab.close).toHaveBeenCalled();
        expect(tab.location.replace).not.toHaveBeenCalled();
    });

    it("navigates this tab when the browser blocks the new one", async () => {
        vi.spyOn(window, "open").mockReturnValue(null);
        const platform = { ...STATIC_PLATFORM, navigate: vi.fn() };
        renderWithPlanner(<ExportPlanMenu session={SESSION} />, { platform });
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: "Open in OpenLeague" }));
        await waitFor(() => expect(platform.navigate).toHaveBeenCalledTimes(1));
        expect(platform.navigate.mock.calls[0][0]).toMatch(/^https:\/\/openl\.app\/practice-planner\/import#plan=/);
    });

    it("opens nothing for a plan the import page would refuse", async () => {
        const open = vi.spyOn(window, "open");
        const tooMany: ExportableSession = {
            ...SESSION,
            duration: 300,
            plays: Array.from({ length: MAX_PLAN_DRILLS + 1 }, (_, i) => ({ ...sessionPlay(`Drill ${i}`, i), duration: 1 })),
        };
        renderWithPlanner(<ExportPlanMenu session={tooMany} />, { platform: STATIC_PLATFORM });
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: "Open in OpenLeague" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("This file can't be imported as-is");
        expect(open).not.toHaveBeenCalled();
    });
});
```

Create `__tests__/components/features/practice-planner/PracticeSessionEditor.share.test.tsx`:

```tsx
/** The editor offers team sharing only when its host can share (the static planner can't). */
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import { PracticeSessionEditor } from "@/components/features/practice-planner/PracticeSessionEditor";

function renderEditor(onShare?: (id: string) => Promise<void>) {
    return renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <PracticeSessionEditor
                    sessionId="csessionxxxxxxxxxxxxxxxxx"
                    teamId="cteamxxxxxxxxxxxxxxxxxxxx"
                    initialData={{ title: "Practice", duration: 60, date: new Date("2026-04-07T22:00:00Z"), plays: [] }}
                    onSave={vi.fn().mockResolvedValue({ success: true })}
                    onShare={onShare}
                />
            </LocalizationProvider>
        </ThemeProvider>,
    );
}

describe("PracticeSessionEditor share control", () => {
    it("shows Share with Team when the host passes onShare", () => {
        renderEditor(vi.fn().mockResolvedValue(undefined));
        expect(screen.getByRole("button", { name: /share with team/i })).toBeInTheDocument();
    });

    it("hides it without onShare, so it can't 'succeed' as a no-op", () => {
        renderEditor();
        expect(screen.queryByRole("button", { name: /share with team/i })).not.toBeInTheDocument();
    });
});
```

Create `__tests__/lib/plan-document/file.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
    FILE_TOO_LARGE_MESSAGE,
    MAX_PLAN_FILE_BYTES,
    NOT_A_PLAN_MESSAGE,
    readPlanFile,
    serializePlan,
} from "@/lib/plan-document";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const PLAN = serializePlan(
    {
        title: "Tuesday Skills",
        durationMinutes: 60,
        date: "2026-10-06",
        startTime: "19:00",
        drills: [{ sequence: 0, duration: 10, runsWithPrevious: false, instructions: null, name: "Breakout", description: null, playData: createEmptyPlayData() }],
    },
    "openleague-static",
);

describe("readPlanFile", () => {
    it("parses a plan file", async () => {
        const result = await readPlanFile(new File([JSON.stringify(PLAN)], "tuesday.olplan.json"));
        expect(result.ok && result.plan.session.title).toBe("Tuesday Skills");
    });

    it("refuses an oversized file before reading it", async () => {
        const result = await readPlanFile(new File(["a".repeat(MAX_PLAN_FILE_BYTES + 1)], "big.json"));
        expect(result).toEqual({ ok: false, error: { code: "invalid", message: FILE_TOO_LARGE_MESSAGE } });
    });

    it("says a non-JSON file isn't a plan", async () => {
        const result = await readPlanFile(new File(["not json"], "notes.txt"));
        expect(result).toEqual({ ok: false, error: { code: "not-a-plan", message: NOT_A_PLAN_MESSAGE } });
    });
});
```

Create `__tests__/lib/utils/duplicate-session-title.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { duplicateSessionTitle } from "@/lib/utils/session-drill-ids";
import { duplicateSessionTitle as serviceExport } from "@/lib/services/practice-session-drills";

describe("duplicateSessionTitle (portable home)", () => {
    it("prefixes and caps at 100 characters", () => {
        expect(duplicateSessionTitle("Tuesday")).toBe("Copy of Tuesday");
        expect(duplicateSessionTitle("x".repeat(100))).toHaveLength(100);
    });

    it("is the same function the hosted service re-exports", () => {
        expect(serviceExport).toBe(duplicateSessionTitle);
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/components/providers/hosted-planner-platform.test.tsx __tests__/components/features/practice-planner/ExportPlanMenu.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.share.test.tsx __tests__/lib/plan-document/file.test.ts __tests__/lib/utils/duplicate-session-title.test.ts`
Expected: FAIL — `planGenerator` missing, no "Open in OpenLeague" item, Share still shown without `onShare`, `readPlanFile` and `duplicateSessionTitle` not exported from the new homes.

- [ ] **Step 3: Extend the platform type**

In `lib/planner-store/types.ts`, add after the `import type { PlayData } …` line:

```ts
import type { PlanGenerator } from "@/lib/plan-document";
```

Add before `export interface PlannerPlatform`:

```ts
/**
 * The Export menu's hand-off item (ADR-0020). Hosted copies an "Open in
 * planner" link to the static app; the static app opens the hosted import
 * page. The menu appends `#plan=<encoded>` to `baseUrl` (dropping any fragment).
 */
export interface PlannerPlanLink {
    label: string;
    mode: "copy" | "open";
    baseUrl: string;
}
```

Replace the `PlannerPlatform` interface with:

```ts
export interface PlannerPlatform {
    Link: ComponentType<PlannerLinkProps>;
    Image: ComponentType<PlannerImageProps>;
    navigate(href: string): void;
    routes: PlannerRoutes;
    /** Written into exported plan documents. */
    planGenerator: PlanGenerator;
    /** The Export menu's link item; null hides it. */
    planLink: PlannerPlanLink | null;
}
```

- [ ] **Step 4: Hosted platform**

In `components/providers/hosted-planner-platform.tsx`, change the type import to `import type { PlannerImageProps, PlannerLinkProps, PlannerPlanLink, PlannerPlatform, PlannerRoutes } from "@/lib/planner-store";`, add before `useHostedPlannerPlatform`:

```tsx
/**
 * The Export menu's "Open in planner" item, only when the static planner's URL
 * is configured. Next inlines NEXT_PUBLIC_* at build; tests stub the env.
 */
export function hostedPlanLink(url: string | undefined = process.env.NEXT_PUBLIC_STATIC_PLANNER_URL): PlannerPlanLink | null {
    const baseUrl = url?.trim();
    return baseUrl ? { label: "Copy “Open in planner” link", mode: "copy", baseUrl } : null;
}
```

and replace `useHostedPlannerPlatform` with:

```tsx
export function useHostedPlannerPlatform(): PlannerPlatform {
    const router = useRouter();
    return useMemo<PlannerPlatform>(
        () => ({
            Link: HostedLink,
            Image: HostedImage,
            navigate: (href: string) => router.push(href),
            routes: hostedPlannerRoutes,
            planGenerator: "openleague-hosted",
            planLink: hostedPlanLink(),
        }),
        [router],
    );
}
```

- [ ] **Step 5: Test helper**

In `__tests__/helpers/planner.tsx`, inside `createHashPlatform()`'s returned object, after `routes: {…},` add:

```ts
        planGenerator: "openleague-static",
        planLink: null,
```

- [ ] **Step 6: `ExportPlanMenu` reads the platform**

In `components/features/practice-planner/ExportPlanMenu.tsx`:
- Replace the header comment's second sentence with: `Downloads the session as a portable plan file and, when the platform offers one (PlannerPlatform.planLink), hands the plan off through a #plan= link: hosted copies an "Open in planner" link, the static planner opens the hosted import page. Built from the page's own session data: no new server read.`
- Change the icon import to also bring `OpenInNew as OpenIcon`.
- Add `type PlanGenerator` to the `@/lib/plan-document` import, and add `import { usePlannerPlatform, type PlannerPlanLink } from "@/lib/planner-store";`.
- Change `buildPlanDocument`'s signature and its `serializePlan` call:

```tsx
export function buildPlanDocument(
    session: ExportableSession,
    now: Date = new Date(),
    generator: PlanGenerator = "openleague-hosted",
): PlanDocument {
```

  and replace the literal `"openleague-hosted",` argument inside it with `generator,`.

- Replace everything from `interface ExportPlanMenuProps {` to the end of the file with:

```tsx
interface ExportPlanMenuProps {
    session: ExportableSession;
    size?: ButtonProps["size"];
}

export const LINK_COPIED_NOTICE = "Link copied. Paste it to open this plan in the planner.";
export const OPENED_IN_HOSTED_NOTICE = "Opened OpenLeague in a new tab. Sign in there to save this plan to a team.";

export function ExportPlanMenu({ session, size = "medium" }: ExportPlanMenuProps) {
    const { planGenerator, planLink, navigate } = usePlannerPlatform();
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [notice, setNotice] = useState<Notice | null>(null);
    const unreadable = unreadableDiagramNotice(session.plays.filter((sp) => sp.play.playData === null).length);

    const download = () => {
        setAnchor(null);
        const doc = buildPlanDocument(session, new Date(), planGenerator);
        const text = JSON.stringify(doc, null, 2);
        const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = planFileName(session.title);
        document.body.appendChild(link);
        link.click();
        link.remove();
        // Safari and Firefox can cut the download short if the URL is revoked right away.
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        const warnings = [unreadable, importProblemNotice(doc, text)].filter((text): text is string => text !== null);
        setNotice(warnings.length > 0 ? { severity: "warning", text: warnings.join(" ") } : null);
    };

    const handOff = async (link: PlannerPlanLink) => {
        setAnchor(null);
        const doc = buildPlanDocument(session, new Date(), planGenerator);
        // A link the import page would refuse is worse than none: warn instead.
        const problem = importProblemNotice(doc);
        if (problem) {
            setNotice({ severity: "warning", text: problem });
            return;
        }
        // "open" must open its tab inside the click, before any await, or popup blockers refuse it.
        const tab = link.mode === "open" ? window.open("", "_blank") : null;
        if (tab) tab.opener = null;
        try {
            const url = `${link.baseUrl.split("#")[0]}#plan=${await encodePlanLink(doc)}`;
            if (link.mode === "copy") {
                await navigator.clipboard.writeText(url);
            } else if (tab) {
                tab.location.replace(url);
            } else {
                // The browser blocked the new tab: go in this one.
                navigate(url);
                return;
            }
            const done = link.mode === "copy" ? LINK_COPIED_NOTICE : OPENED_IN_HOSTED_NOTICE;
            setNotice(unreadable ? { severity: "warning", text: unreadable } : { severity: "success", text: done });
        } catch (error) {
            tab?.close();
            setNotice(
                error instanceof PlanLinkTooLargeError
                    ? { severity: "info", text: LINK_TOO_LARGE_MESSAGE }
                    : {
                          severity: "error",
                          text:
                              link.mode === "copy"
                                  ? "Couldn't copy the link. Download the file instead."
                                  : "Couldn't open OpenLeague. Download the file instead.",
                      },
            );
        }
    };

    return (
        <>
            <Button
                variant="outlined"
                startIcon={<ExportIcon />}
                size={size}
                aria-haspopup="menu"
                aria-controls={anchor ? "export-plan-menu" : undefined}
                aria-expanded={anchor ? "true" : undefined}
                onClick={(event) => setAnchor(event.currentTarget)}
            >
                Export plan
            </Button>
            <Menu id="export-plan-menu" anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
                <MenuItem onClick={download}>
                    <ListItemIcon>
                        <DownloadIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Download plan file</ListItemText>
                </MenuItem>
                {planLink && (
                    <MenuItem onClick={() => void handOff(planLink)}>
                        <ListItemIcon>
                            {planLink.mode === "open" ? <OpenIcon fontSize="small" /> : <LinkIcon fontSize="small" />}
                        </ListItemIcon>
                        <ListItemText>{planLink.label}</ListItemText>
                    </MenuItem>
                )}
            </Menu>
            {notice && (
                <Snackbar
                    open
                    autoHideDuration={6000}
                    onClose={() => setNotice(null)}
                    anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                >
                    <Alert severity={notice.severity} variant="filled" onClose={() => setNotice(null)}>
                        {notice.text}
                    </Alert>
                </Snackbar>
            )}
        </>
    );
}
```

Confirm no `process.env` remains: `grep -n "process.env" components/features/practice-planner/ExportPlanMenu.tsx` → no output.

- [ ] **Step 7: Editor Share gate**

In `components/features/practice-planner/PracticeSessionEditor.tsx`, under `{/* Requirements: 3.1 - Share button with confirmation */}`, change `{sessionId && (` to `{sessionId && onShare && (`.

- [ ] **Step 8: Move `readPlanFile`**

Create `lib/plan-document/file.ts`:

```ts
/**
 * Reading a chosen plan file (ADR-0020), shared by the hosted import page and
 * the static planner. Size first, then JSON, then parsePlan. Never throws.
 */
import { MAX_PLAN_FILE_BYTES, NOT_A_PLAN_MESSAGE, parsePlan, type ParsePlanResult } from "./document";

export const FILE_TOO_LARGE_MESSAGE = `This file is too large to be a practice plan (the limit is ${MAX_PLAN_FILE_BYTES / 1000} KB).`;

export async function readPlanFile(file: File): Promise<ParsePlanResult> {
    if (file.size > MAX_PLAN_FILE_BYTES) {
        return { ok: false, error: { code: "invalid", message: FILE_TOO_LARGE_MESSAGE } };
    }
    let raw: unknown;
    try {
        raw = JSON.parse(await file.text());
    } catch {
        return { ok: false, error: { code: "not-a-plan", message: NOT_A_PLAN_MESSAGE } };
    }
    return parsePlan(raw);
}
```

Append to `lib/plan-document/index.ts`: `export * from "./file";`

In `components/features/practice-planner/PlanImportView.tsx`, delete the `export const FILE_TOO_LARGE_MESSAGE = …` line and the whole `readPlanFile` function (with its doc comment), add `FILE_TOO_LARGE_MESSAGE` and `readPlanFile` to the existing `@/lib/plan-document` import, and add below the imports:

```tsx
export { FILE_TOO_LARGE_MESSAGE, readPlanFile };
```

Then run `grep -n "NOT_A_PLAN_MESSAGE\|parsePlan(" components/features/practice-planner/PlanImportView.tsx`; remove from the import list any name with no remaining use.

- [ ] **Step 9: Move `duplicateSessionTitle`**

Append to `lib/utils/session-drill-ids.ts`:

```ts
/** "Copy of <title>", kept within the 100-character title limit (hosted and static duplicates). */
export function duplicateSessionTitle(title: string): string {
    return `Copy of ${title}`.slice(0, 100);
}
```

In `lib/services/practice-session-drills.ts`, replace

```ts
import { SESSION_DRILL_REJECTED_MESSAGE } from "@/lib/utils/session-drill-ids";
```
and
```ts
export { SESSION_DRILL_REJECTED_MESSAGE };
```
with
```ts
import { SESSION_DRILL_REJECTED_MESSAGE, duplicateSessionTitle } from "@/lib/utils/session-drill-ids";
```
and
```ts
export { SESSION_DRILL_REJECTED_MESSAGE, duplicateSessionTitle };
```
and delete the local `duplicateSessionTitle` function and its doc comment at the end of the file.

- [ ] **Step 10: ADR-0020 `affects`**

In the ADR's front matter, append under `affects:` (after the `lib/planner-store/**` entry):

```yaml
  - type: path
    pattern: "components/features/practice-planner/**"
    note: The portable planner components both deployables render.
  - type: path
    # `*`, not `[sessionId]`: brackets are a glob character class and would match nothing.
    pattern: "app/(dashboard)/practice-planner/*/SessionDetailView.tsx"
    note: The portable session detail view, imported by the static app.
  - type: path
    pattern: "components/providers/HostedPlannerProvider.tsx"
    note: The hosted PlannerStore (the server actions).
  - type: path
    pattern: "components/providers/hosted-planner-platform.tsx"
    note: The hosted PlannerPlatform (next/link, next/image, router, plan hand-off).
```

- [ ] **Step 11: Run the tests**

Run: `bun run test __tests__/components/providers/hosted-planner-platform.test.tsx __tests__/components/features/practice-planner/ExportPlanMenu.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.share.test.tsx __tests__/lib/plan-document/file.test.ts __tests__/lib/utils/duplicate-session-title.test.ts __tests__/components/features/practice-planner/PlanImportView.test.tsx __tests__/lib/services/practice-session-drills.test.ts __tests__/app/practice-session-detail-portable.test.tsx`
Expected: PASS.

Run: `bun run type-check && bun run adr:lint && bun run test __tests__/components/features/practice-planner __tests__/app __tests__/lib/planner-store`
Expected: PASS.

Run: `bun run adr:explain "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx"` and `bun run adr:explain components/features/practice-planner/PlayLibrary.tsx`
Expected: both list ADR-0020 (proves the new `affects` patterns match real files).

- [ ] **Step 12: Commit**

```bash
/usr/bin/git add lib/planner-store/types.ts components/providers/hosted-planner-platform.tsx components/features/practice-planner/ExportPlanMenu.tsx components/features/practice-planner/PracticeSessionEditor.tsx lib/plan-document/file.ts lib/plan-document/index.ts components/features/practice-planner/PlanImportView.tsx lib/utils/session-drill-ids.ts lib/services/practice-session-drills.ts __tests__/helpers/planner.tsx docs/adr/0020-*.md __tests__/components/providers/hosted-planner-platform.test.tsx __tests__/components/features/practice-planner/ExportPlanMenu.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.share.test.tsx __tests__/lib/plan-document/file.test.ts __tests__/lib/utils/duplicate-session-title.test.ts
/usr/bin/git commit -m "refactor(practice-planner): plan hand-off on the platform seam for the static planner

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 2: Vite scaffold, hash routes and the static platform

**Files:**
- Modify: `package.json` (scripts, devDependency `vite`)
- Create: `apps/planner/build-config.ts`, `apps/planner/vite.config.ts`, `apps/planner/src/env.d.ts`, `apps/planner/src/config.ts`, `apps/planner/src/routes.ts`, `apps/planner/src/platform.tsx`
- Modify: `eslint.config.mjs` (block `adr-0020/portable-practice-planner`)
- Test: `__tests__/apps/planner/routes.test.ts`, `__tests__/apps/planner/platform.test.tsx`, `__tests__/apps/planner/build-config.test.ts`

**Interfaces:**
- Consumes: `PlannerPlatform`, `PlannerPlanLink` (Task 1); `planFragmentValue`, `PLAN_IMPORT_PATH` from `@/lib/plan-document/pending`.
- Produces:
  - `build-config.ts`: `DEFAULT_HOSTED_URL`, `resolveHostedUrl(raw?: string): string`, `PLANNER_CSP: string`.
  - `config.ts`: `HOSTED_URL`, `HOSTED_IMPORT_URL`, `LOCAL_TEAM_ID`, `LOCAL_TEAM_NAME`, `LOCAL_AUTHOR_NAME`, `PRIVACY_NOTE`.
  - `routes.ts`: `StaticRoutes extends PlannerRoutes { library(); sessionNew(); importPlan() }`, `staticRoutes`, `type StaticRoute`, `matchRoute(hash: string): StaticRoute`.
  - `platform.tsx`: `StaticLink`, `StaticImage`, `navigateTo(href)`, `staticPlannerPlatform: PlannerPlatform`, `useHashRoute(): StaticRoute`.

- [ ] **Step 1: Add Vite and the scripts**

Run: `bun add -d "vite@^7.1.9"`
Expected: `package.json` devDependencies gain `"vite": "^7.1.9"`; `bun.lock` keeps the single `vite@7.1.9` entry.

In `package.json` `scripts`, after `"docs:build-pages": …,` add:

```json
    "planner:dev": "vite --config apps/planner/vite.config.ts",
    "planner:build": "vite build --config apps/planner/vite.config.ts",
    "planner:preview": "vite preview --config apps/planner/vite.config.ts",
```

- [ ] **Step 2: Write the failing tests**

Create `__tests__/apps/planner/routes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { matchRoute, staticRoutes, type StaticRoute } from "@/apps/planner/src/routes";

describe("matchRoute", () => {
    it.each<[string, StaticRoute]>([
        ["", { name: "list" }],
        ["#", { name: "list" }],
        ["#/", { name: "list" }],
        ["#/sessions/new", { name: "sessionNew" }],
        ["#/sessions/abc", { name: "session", id: "abc" }],
        ["#/sessions/abc/edit", { name: "sessionEdit", id: "abc" }],
        ["#/sessions/abc/print", { name: "sessionPrint", id: "abc" }],
        ["#/sessions/a%20b", { name: "session", id: "a b" }],
        ["#/library", { name: "library" }],
        ["#/library/", { name: "library" }],
        ["#/library/new", { name: "libraryNew" }],
        ["#/library/p1/edit", { name: "libraryEdit", id: "p1" }],
        ["#/import", { name: "import" }],
        ["#plan=abc_-1", { name: "planLink", value: "abc_-1" }],
        ["#/plan=abc", { name: "planLink", value: "abc" }],
        ["#plan=", { name: "notFound" }],
        ["#/sessions/a%2Fb", { name: "notFound" }],
        ["#/sessions/%E0%A4%A", { name: "notFound" }],
        ["#/sessions/abc/delete", { name: "notFound" }],
        ["#/library/p1", { name: "notFound" }],
        ["#/nope", { name: "notFound" }],
    ])("%s", (hash, expected) => {
        expect(matchRoute(hash)).toEqual(expected);
    });

    it("matches every href staticRoutes builds", () => {
        expect(matchRoute(staticRoutes.list())).toEqual({ name: "list" });
        expect(matchRoute(staticRoutes.session("s-1"))).toEqual({ name: "session", id: "s-1" });
        expect(matchRoute(staticRoutes.sessionEdit("s-1"))).toEqual({ name: "sessionEdit", id: "s-1" });
        expect(matchRoute(staticRoutes.sessionPrint("s-1"))).toEqual({ name: "sessionPrint", id: "s-1" });
        expect(matchRoute(staticRoutes.libraryNew())).toEqual({ name: "libraryNew" });
        expect(matchRoute(staticRoutes.libraryEdit("p-1"))).toEqual({ name: "libraryEdit", id: "p-1" });
        expect(matchRoute(staticRoutes.library())).toEqual({ name: "library" });
        expect(matchRoute(staticRoutes.sessionNew())).toEqual({ name: "sessionNew" });
        expect(matchRoute(staticRoutes.importPlan())).toEqual({ name: "import" });
    });
});
```

Create `__tests__/apps/planner/platform.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StaticImage, StaticLink, navigateTo, staticPlannerPlatform } from "@/apps/planner/src/platform";
import { staticRoutes } from "@/apps/planner/src/routes";
import { HOSTED_IMPORT_URL } from "@/apps/planner/src/config";

afterEach(() => {
    window.location.hash = "";
});

describe("static planner platform", () => {
    it("fills its positioned parent the way next/image's fill does", () => {
        render(
            <div style={{ position: "relative", width: 160, height: 90 }}>
                <StaticImage src="data:image/png;base64,AAAA" alt="Breakout" fit="cover" />
            </div>,
        );
        const img = screen.getByAltText("Breakout");
        expect(img).toHaveStyle({ position: "absolute", width: "100%", height: "100%", objectFit: "cover" });
        expect([img.style.top, img.style.left, img.style.right, img.style.bottom]).toEqual(["0px", "0px", "0px", "0px"]);
    });

    it("renders links as plain anchors with hash hrefs", () => {
        render(<StaticLink href={staticRoutes.library()} className="nav">Library</StaticLink>);
        const link = screen.getByRole("link", { name: "Library" });
        expect(link).toHaveAttribute("href", "#/library");
        expect(link).toHaveClass("nav");
    });

    it("navigates hash routes by setting location.hash", () => {
        navigateTo("#/sessions/s-1");
        expect(window.location.hash).toBe("#/sessions/s-1");
    });

    it("is a module constant with the static generator and the hosted import hand-off", () => {
        expect(staticPlannerPlatform).toMatchObject({
            Link: StaticLink,
            Image: StaticImage,
            navigate: navigateTo,
            routes: staticRoutes,
            planGenerator: "openleague-static",
            planLink: { label: "Open in OpenLeague", mode: "open", baseUrl: HOSTED_IMPORT_URL },
        });
        expect(HOSTED_IMPORT_URL).toBe("https://openl.app/practice-planner/import");
    });
});
```

Create `__tests__/apps/planner/build-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PLANNER_CSP, resolveHostedUrl } from "@/apps/planner/build-config";

describe("resolveHostedUrl", () => {
    it("defaults to the hosted platform", () => {
        expect(resolveHostedUrl(undefined)).toBe("https://openl.app");
        expect(resolveHostedUrl("  ")).toBe("https://openl.app");
    });

    it("trims whitespace and trailing slashes", () => {
        expect(resolveHostedUrl(" https://example.org/// ")).toBe("https://example.org");
    });

    it("allows http only for localhost", () => {
        expect(resolveHostedUrl("http://localhost:3000")).toBe("http://localhost:3000");
        expect(() => resolveHostedUrl("http://openl.app")).toThrow(/must be https/);
        expect(() => resolveHostedUrl("not a url")).toThrow(/not a URL/);
    });
});

describe("PLANNER_CSP", () => {
    it("allows only same-origin scripts and the two font hosts", () => {
        expect(PLANNER_CSP).toContain("script-src 'self'");
        expect(PLANNER_CSP).toContain("connect-src 'self'");
        expect(PLANNER_CSP).toContain("https://api.fontshare.com");
        expect(PLANNER_CSP).toContain("https://fonts.gstatic.com");
        expect(PLANNER_CSP).not.toMatch(/unsafe-eval/);
        expect(PLANNER_CSP).not.toMatch(/script-src[^;]*unsafe-inline/);
    });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `bun run test __tests__/apps/planner`
Expected: FAIL — cannot resolve `@/apps/planner/src/routes`, `platform`, `build-config`.

- [ ] **Step 4: Build config and Vite config**

Create `apps/planner/build-config.ts`:

```ts
/**
 * Build-time settings for the static planner (ADR-0020). Pure, so the Vite
 * config and the tests share it without loading Vite.
 */
export const DEFAULT_HOSTED_URL = "https://openl.app";

/** OPENLEAGUE_HOSTED_URL, normalized. https only; http is allowed for localhost testing. */
export function resolveHostedUrl(raw: string | undefined): string {
    const value = (raw ?? "").trim().replace(/\/+$/, "") || DEFAULT_HOSTED_URL;
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`OPENLEAGUE_HOSTED_URL is not a URL: ${value}`);
    }
    const local = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (url.protocol !== "https:" && !local) {
        throw new Error(`OPENLEAGUE_HOSTED_URL must be https: ${value}`);
    }
    return value;
}

/**
 * Added as a <meta> at build time only (the dev server injects inline scripts).
 * Emotion needs inline styles; thumbnails are data: PNGs; downloads use blob:.
 */
export const PLANNER_CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://api.fontshare.com https://fonts.googleapis.com",
    "font-src 'self' https://cdn.fontshare.com https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
].join("; ");
```

Create `apps/planner/vite.config.ts`:

```ts
/**
 * The static practice planner (ADR-0020, sub-project 3). Driven by the root
 * scripts: `bun run planner:build` writes dist/planner, which the Pages
 * workflow copies to /planner/ on openleague.dev.
 */
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { PLANNER_CSP, resolveHostedUrl } from "./build-config";

const ROOT = path.resolve(__dirname, "../..");

function contentSecurityPolicy(): Plugin {
    return {
        name: "openleague-planner-csp",
        apply: "build",
        transformIndexHtml: () => [
            { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: PLANNER_CSP }, injectTo: "head-prepend" },
        ],
    };
}

export default defineConfig(({ mode }) => ({
    root: path.join(ROOT, "apps/planner"),
    // Relative assets: works at /planner/, on forks' subpaths, and under vite preview.
    base: "./",
    plugins: [react(), contentSecurityPolicy()],
    resolve: { alias: { "@": ROOT } },
    define: {
        __OPENLEAGUE_HOSTED_URL__: JSON.stringify(resolveHostedUrl(process.env.OPENLEAGUE_HOSTED_URL)),
        "process.env.NODE_ENV": JSON.stringify(mode === "production" ? "production" : "development"),
    },
    server: { fs: { allow: [ROOT] } },
    build: {
        outDir: path.join(ROOT, "dist/planner"),
        emptyOutDir: true,
        target: "es2022",
        sourcemap: false,
        rollupOptions: {
            onwarn(warning, warn) {
                // The shared modules' "use client" lines mean nothing outside Next.
                if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
                warn(warning);
            },
        },
    },
}));
```

- [ ] **Step 5: Constants and routes**

Create `apps/planner/src/env.d.ts`:

```ts
/** Defined by apps/planner/vite.config.ts; undefined under Vitest (read it with a typeof guard). */
declare const __OPENLEAGUE_HOSTED_URL__: string;
```

Create `apps/planner/src/config.ts`:

```ts
/** Static planner constants (ADR-0020). */
import { PLAN_IMPORT_PATH } from "@/lib/plan-document/pending";
import { DEFAULT_HOSTED_URL } from "../build-config";

/** The hosted platform. Set at build from OPENLEAGUE_HOSTED_URL; the default under tests. */
export const HOSTED_URL: string =
    typeof __OPENLEAGUE_HOSTED_URL__ === "string" ? __OPENLEAGUE_HOSTED_URL__ : DEFAULT_HOSTED_URL;

/** Where "Open in OpenLeague" sends a plan (the signed-in import page, sub-project 1). */
export const HOSTED_IMPORT_URL = `${HOSTED_URL}${PLAN_IMPORT_PATH}`;

/** The static app has one implicit "team": this browser. The store ignores teamId. */
export const LOCAL_TEAM_ID = "local";
export const LOCAL_TEAM_NAME = "This device";
export const LOCAL_AUTHOR_NAME = "You";

export const PRIVACY_NOTE =
    "Your practices stay in this browser. Nothing is uploaded, and there's no account or tracking. " +
    "Browsers can clear site data, so download plan files to keep a backup.";
```

Create `apps/planner/src/routes.ts`:

```ts
/**
 * Hash routes for the static planner. The shapes match createHashPlatform()
 * in __tests__/helpers/planner.tsx, which sub-project 2 pinned.
 */
import type { PlannerRoutes } from "@/lib/planner-store";
import { planFragmentValue } from "@/lib/plan-document/pending";

export interface StaticRoutes extends PlannerRoutes {
    library(): string;
    sessionNew(): string;
    importPlan(): string;
}

const enc = encodeURIComponent;

export const staticRoutes: StaticRoutes = {
    list: () => "#/",
    session: (id) => `#/sessions/${enc(id)}`,
    sessionEdit: (id) => `#/sessions/${enc(id)}/edit`,
    sessionPrint: (id) => `#/sessions/${enc(id)}/print`,
    libraryNew: () => "#/library/new",
    libraryEdit: (playId) => `#/library/${enc(playId)}/edit`,
    library: () => "#/library",
    sessionNew: () => "#/sessions/new",
    importPlan: () => "#/import",
};

export type StaticRoute =
    | { name: "list" }
    | { name: "sessionNew" }
    | { name: "session"; id: string }
    | { name: "sessionEdit"; id: string }
    | { name: "sessionPrint"; id: string }
    | { name: "library" }
    | { name: "libraryNew" }
    | { name: "libraryEdit"; id: string }
    | { name: "import" }
    | { name: "planLink"; value: string }
    | { name: "notFound" };

const NOT_FOUND: StaticRoute = { name: "notFound" };

function decodeId(raw: string): string | null {
    try {
        const id = decodeURIComponent(raw);
        return id && !id.includes("/") ? id : null;
    } catch {
        return null;
    }
}

/** Pure: location.hash in, route out. A hash holding `plan=` is a plan link (the hosted Export menu's). */
export function matchRoute(hash: string): StaticRoute {
    const body = (hash.startsWith("#") ? hash.slice(1) : hash).replace(/^\/+/, "");
    const plan = planFragmentValue(body);
    if (plan) return { name: "planLink", value: plan };

    const parts = body.replace(/\/+$/, "").split("/");
    if (parts.length === 1 && parts[0] === "") return { name: "list" };
    const [section, second, third, ...rest] = parts;
    if (rest.length > 0) return NOT_FOUND;

    if (section === "sessions") {
        if (second === "new" && third === undefined) return { name: "sessionNew" };
        const id = second === undefined ? null : decodeId(second);
        if (!id) return NOT_FOUND;
        if (third === undefined) return { name: "session", id };
        if (third === "edit") return { name: "sessionEdit", id };
        if (third === "print") return { name: "sessionPrint", id };
        return NOT_FOUND;
    }
    if (section === "library") {
        if (second === undefined) return { name: "library" };
        if (second === "new" && third === undefined) return { name: "libraryNew" };
        const id = decodeId(second);
        return id && third === "edit" ? { name: "libraryEdit", id } : NOT_FOUND;
    }
    if (section === "import" && second === undefined) return { name: "import" };
    return NOT_FOUND;
}
```

- [ ] **Step 6: The platform**

Create `apps/planner/src/platform.tsx`:

```tsx
/**
 * The static half of the planner's platform seam (ADR-0020): plain anchors,
 * an <img> laid out like next/image's `fill`, and hash navigation. A module
 * constant, so its identity never changes between renders.
 */
import { useMemo, useSyncExternalStore, type CSSProperties } from "react";
import type { PlannerImageProps, PlannerLinkProps, PlannerPlatform } from "@/lib/planner-store";
import { HOSTED_IMPORT_URL } from "./config";
import { matchRoute, staticRoutes, type StaticRoute } from "./routes";

export function StaticLink({ href, children, ...rest }: PlannerLinkProps) {
    return (
        <a href={href} {...rest}>
            {children}
        </a>
    );
}

/** next/image `fill`: absolutely positioned over its (positioned) parent. A bare <img> would overflow it. */
const FILL: CSSProperties = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" };

export function StaticImage({ src, alt, fit }: PlannerImageProps) {
    // eslint-disable-next-line @next/next/no-img-element -- the static app has no next/image; this mirrors its fill layout
    return <img src={src} alt={alt} decoding="async" style={{ ...FILL, objectFit: fit }} />;
}

export function navigateTo(href: string): void {
    if (href.startsWith("#")) window.location.hash = href;
    else window.location.assign(href);
}

export const staticPlannerPlatform: PlannerPlatform = {
    Link: StaticLink,
    Image: StaticImage,
    navigate: navigateTo,
    routes: staticRoutes,
    planGenerator: "openleague-static",
    planLink: { label: "Open in OpenLeague", mode: "open", baseUrl: HOSTED_IMPORT_URL },
};

function subscribe(onChange: () => void): () => void {
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
}

export function useHashRoute(): StaticRoute {
    const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => "");
    return useMemo(() => matchRoute(hash), [hash]);
}
```

- [ ] **Step 7: Lint coverage**

In `eslint.config.mjs`, in the `adr-0020/portable-practice-planner` block's `files` array, add after `` `lib/plan-document/**/${SOURCE_GLOB}`, ``:

```js
      // The static planner itself (sub-project 3): it must never reach Next.js or the server.
      `apps/planner/**/${SOURCE_GLOB}`,
```

- [ ] **Step 8: Run the tests**

Run: `bun run test __tests__/apps/planner`
Expected: PASS.

Run: `bun run type-check && bunx eslint apps/planner eslint.config.mjs`
Expected: PASS (no errors).

- [ ] **Step 9: Commit**

```bash
/usr/bin/git add package.json bun.lock apps/planner eslint.config.mjs __tests__/apps/planner
/usr/bin/git commit -m "feat(practice-planner): static planner scaffold, hash routes and platform

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 3: Record repositories (IndexedDB and memory)

**Files:**
- Modify: `package.json`, `bun.lock` (devDependency `fake-indexeddb`)
- Create: `apps/planner/src/store/records.ts`, `apps/planner/src/store/memory-repo.ts`, `apps/planner/src/store/idb-repo.ts`
- Test: `__tests__/apps/planner/repos.test.ts`

**Interfaces:**
- Produces:
  - `records.ts`: `StoredPlay`, `StoredSessionRow`, `StoredSession`, `RepoTx`, `PlannerRepo`, `META_STARTERS_SEEDED = "startersSeeded"`, `META_PERSIST_REQUESTED = "persistRequested"`.
  - `memory-repo.ts`: `createMemoryRepo(): PlannerRepo` (`durable: false`).
  - `idb-repo.ts`: `DB_NAME = "openleague-planner"`, `DB_VERSION = 1`, `StorageBlockedError`, `upgradeDatabase(db, oldVersion)`, `openIdbRepo(options?: { factory?: IDBFactory; name?: string; onVersionChange?: () => void }): Promise<PlannerRepo>` (`durable: true`).

- [ ] **Step 1: Add the test dependency**

Run: `bun add -d "fake-indexeddb@^6"`
Expected: `package.json` devDependencies gain `fake-indexeddb`.

- [ ] **Step 2: Write the failing test**

Create `__tests__/apps/planner/repos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRepo } from "@/apps/planner/src/store/memory-repo";
import { openIdbRepo } from "@/apps/planner/src/store/idb-repo";
import type { PlannerRepo, StoredPlay, StoredSession } from "@/apps/planner/src/store/records";

let dbSeq = 0;
const AT = new Date("2026-10-03T12:00:00.000Z");

function play(id: string, sessionId: string | null = null): StoredPlay {
    return { id, name: `Drill ${id}`, description: null, thumbnail: null, playData: { version: 2 }, isTemplate: sessionId === null, sessionId, sourcePlayId: null, createdAt: AT, updatedAt: AT };
}

function session(id: string): StoredSession {
    return { id, title: "Tuesday", date: AT, duration: 60, rows: [], createdAt: AT, updatedAt: AT };
}

const REPOS: Array<[string, () => Promise<PlannerRepo>]> = [
    ["memory", async () => createMemoryRepo()],
    ["indexeddb", () => openIdbRepo({ factory: new IDBFactory(), name: `repo-test-${++dbSeq}` })],
];

describe.each(REPOS)("%s repo", (_name, open) => {
    it("stores and returns copies, never live objects", async () => {
        const repo = await open();
        await repo.write((tx) => tx.putPlay(play("p1")));
        const first = await repo.read((tx) => tx.getPlay("p1"));
        first!.name = "changed";
        expect((await repo.read((tx) => tx.getPlay("p1")))?.name).toBe("Drill p1");
        expect((await repo.read((tx) => tx.getPlay("p1")))?.createdAt).toEqual(AT);
    });

    it("lists a session's owned copies by session", async () => {
        const repo = await open();
        await repo.write(async (tx) => {
            await tx.putPlay(play("lib"));
            await tx.putPlay(play("a", "s1"));
            await tx.putPlay(play("b", "s2"));
        });
        const owned = await repo.read((tx) => tx.sessionPlays("s1"));
        expect(owned.map((p) => p.id)).toEqual(["a"]);
        expect((await repo.read((tx) => tx.allPlays())).map((p) => p.id).sort()).toEqual(["a", "b", "lib"]);
    });

    it("stores sessions and meta", async () => {
        const repo = await open();
        await repo.write(async (tx) => {
            await tx.putSession(session("s1"));
            await tx.putMeta("startersSeeded", true);
        });
        expect((await repo.read((tx) => tx.getSession("s1")))?.title).toBe("Tuesday");
        expect(await repo.read((tx) => tx.getMeta("startersSeeded"))).toBe(true);
        expect(await repo.read((tx) => tx.getMeta("missing"))).toBeUndefined();
        await repo.write((tx) => tx.deleteSession("s1"));
        expect(await repo.read((tx) => tx.allSessions())).toEqual([]);
    });

    it("rolls back every write of a work that throws", async () => {
        const repo = await open();
        await expect(
            repo.write(async (tx) => {
                await tx.putPlay(play("p1"));
                throw new Error("refused");
            }),
        ).rejects.toThrow("refused");
        expect(await repo.read((tx) => tx.getPlay("p1"))).toBeUndefined();
    });

    it("refuses writes in a read", async () => {
        const repo = await open();
        await expect(repo.read((tx) => tx.putPlay(play("p1")))).rejects.toBeDefined();
        expect(await repo.read((tx) => tx.getPlay("p1"))).toBeUndefined();
    });

    it("applies concurrent writes one after another", async () => {
        const repo = await open();
        await Promise.all([repo.write((tx) => tx.putPlay(play("a"))), repo.write((tx) => tx.putPlay(play("b")))]);
        expect((await repo.read((tx) => tx.allPlays())).length).toBe(2);
    });
});

describe("memory repo", () => {
    it("is not durable", () => {
        expect(createMemoryRepo().durable).toBe(false);
    });
});

describe("IndexedDB repo", () => {
    it("is durable and keeps data across a close and reopen", async () => {
        const factory = new IDBFactory();
        const first = await openIdbRepo({ factory, name: "reopen" });
        expect(first.durable).toBe(true);
        await first.write((tx) => tx.putPlay(play("p1")));
        first.close();
        const second = await openIdbRepo({ factory, name: "reopen" });
        expect((await second.read((tx) => tx.getPlay("p1")))?.name).toBe("Drill p1");
    });

    it("rejects a write that awaits a timer before touching the store, and stores nothing", async () => {
        const repo = await openIdbRepo({ factory: new IDBFactory(), name: "early-commit" });
        await expect(
            repo.write(async (tx) => {
                // 20 ms, not 0: fake-indexeddb auto-commits on a setImmediate tick, and setTimeout(0) can race it.
                await new Promise((resolve) => setTimeout(resolve, 20));
                await tx.putPlay(play("late"));
            }),
        ).rejects.toBeDefined();
        expect(await repo.read((tx) => tx.getPlay("late"))).toBeUndefined();
    });

    it("tells the app when a newer tab upgrades the database", async () => {
        const factory = new IDBFactory();
        let notified = false;
        await openIdbRepo({ factory, name: "upgrade", onVersionChange: () => (notified = true) });
        await new Promise<void>((resolve, reject) => {
            const request = factory.open("upgrade", 2);
            request.onsuccess = () => {
                request.result.close();
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
        expect(notified).toBe(true);
    });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bun run test __tests__/apps/planner/repos.test.ts`
Expected: FAIL — cannot resolve the store modules.

- [ ] **Step 4: Records**

Create `apps/planner/src/store/records.ts`:

```ts
/**
 * What the static planner stores (ADR-0020), and the transactional repo the
 * store logic runs on. Two adapters implement PlannerRepo: IndexedDB (the
 * real one) and memory (the fallback when IndexedDB is unavailable).
 */

export interface StoredPlay {
    id: string;
    name: string;
    description: string | null;
    thumbnail: string | null;
    /** Validated on read (parseStoredPlayData), as hosted. */
    playData: unknown;
    isTemplate: boolean;
    /** Set: a session-owned copy (practice planner 3a). Null: a library play. */
    sessionId: string | null;
    /** Provenance of a fork or clone. */
    sourcePlayId: string | null;
    createdAt: Date;
    updatedAt: Date;
}

/** One drill in a session. `id` is the editor's clientKey, so card keys survive reloads. */
export interface StoredSessionRow {
    id: string;
    playId: string;
    sequence: number;
    duration: number;
    instructions: string;
    runsWithPrevious: boolean;
}

export interface StoredSession {
    id: string;
    title: string;
    date: Date;
    duration: number;
    rows: StoredSessionRow[];
    createdAt: Date;
    updatedAt: Date;
}

/**
 * One transaction. Work given to read/write must await only these calls:
 * awaiting anything else lets IndexedDB commit the transaction early.
 */
export interface RepoTx {
    getPlay: (id: string) => Promise<StoredPlay | undefined>;
    putPlay: (play: StoredPlay) => Promise<void>;
    deletePlay: (id: string) => Promise<void>;
    allPlays: () => Promise<StoredPlay[]>;
    sessionPlays: (sessionId: string) => Promise<StoredPlay[]>;
    getSession: (id: string) => Promise<StoredSession | undefined>;
    putSession: (session: StoredSession) => Promise<void>;
    deleteSession: (id: string) => Promise<void>;
    allSessions: () => Promise<StoredSession[]>;
    getMeta: (key: string) => Promise<unknown>;
    putMeta: (key: string, value: unknown) => Promise<void>;
}

export interface PlannerRepo {
    /** False for the in-memory fallback: nothing survives the tab. */
    readonly durable: boolean;
    read: <T>(work: (tx: RepoTx) => Promise<T>) => Promise<T>;
    /** All or nothing: resolves once committed; a throwing work rolls everything back. */
    write: <T>(work: (tx: RepoTx) => Promise<T>) => Promise<T>;
    close: () => void;
}

export const META_STARTERS_SEEDED = "startersSeeded";
export const META_PERSIST_REQUESTED = "persistRequested";
```

- [ ] **Step 5: Memory adapter**

Create `apps/planner/src/store/memory-repo.ts`:

```ts
/**
 * In-memory PlannerRepo: the fallback when IndexedDB is unavailable (private
 * modes, blocked site data), and the contract suite's second target. Mirrors
 * IndexedDB's semantics: values are structured clones, writes are serialized
 * and all-or-nothing, reads can't write.
 */
import type { PlannerRepo, RepoTx, StoredPlay, StoredSession } from "./records";

interface Tables {
    plays: Map<string, StoredPlay>;
    sessions: Map<string, StoredSession>;
    meta: Map<string, unknown>;
}

const copy = <T,>(value: T): T => structuredClone(value);

function readOnly(): never {
    throw new Error("ReadOnlyError: a read transaction can't write");
}

function txOver(tables: Tables, writable: boolean): RepoTx {
    return {
        getPlay: async (id) => copy(tables.plays.get(id)),
        putPlay: async (play) => {
            if (!writable) readOnly();
            tables.plays.set(play.id, copy(play));
        },
        deletePlay: async (id) => {
            if (!writable) readOnly();
            tables.plays.delete(id);
        },
        allPlays: async () => [...tables.plays.values()].map(copy),
        sessionPlays: async (sessionId) => [...tables.plays.values()].filter((p) => p.sessionId === sessionId).map(copy),
        getSession: async (id) => copy(tables.sessions.get(id)),
        putSession: async (session) => {
            if (!writable) readOnly();
            tables.sessions.set(session.id, copy(session));
        },
        deleteSession: async (id) => {
            if (!writable) readOnly();
            tables.sessions.delete(id);
        },
        allSessions: async () => [...tables.sessions.values()].map(copy),
        getMeta: async (key) => copy(tables.meta.get(key)),
        putMeta: async (key, value) => {
            if (!writable) readOnly();
            tables.meta.set(key, copy(value));
        },
    };
}

export function createMemoryRepo(): PlannerRepo {
    let tables: Tables = { plays: new Map(), sessions: new Map(), meta: new Map() };
    let queue: Promise<unknown> = Promise.resolve();

    function enqueue<T>(job: () => Promise<T>): Promise<T> {
        const run = queue.then(job, job);
        queue = run.catch(() => undefined);
        return run;
    }

    return {
        durable: false,
        read: (work) => enqueue(() => work(txOver(tables, false))),
        write: (work) =>
            enqueue(async () => {
                const draft = structuredClone(tables);
                const result = await work(txOver(draft, true));
                tables = draft;
                return result;
            }),
        close: () => undefined,
    };
}
```

- [ ] **Step 6: IndexedDB adapter**

Create `apps/planner/src/store/idb-repo.ts`:

```ts
/**
 * IndexedDB PlannerRepo (ADR-0020). Database "openleague-planner":
 * - plays (keyPath id; index bySession on sessionId: null isn't a valid key,
 *   so library plays never enter it and it holds exactly the owned copies);
 * - sessions (keyPath id), with their rows embedded;
 * - meta (keyPath key).
 * Every operation is one transaction over all three stores. Schema changes
 * add a case to upgradeDatabase and never drop data.
 */
import type { PlannerRepo, RepoTx, StoredPlay, StoredSession } from "./records";

export const DB_NAME = "openleague-planner";
export const DB_VERSION = 1;
const STORES = ["plays", "sessions", "meta"];

export class StorageBlockedError extends Error {
    constructor() {
        super("The planner's storage is held open by an older tab.");
        this.name = "StorageBlockedError";
    }
}

function request<T>(req: IDBRequest): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
    });
}

export function upgradeDatabase(db: IDBDatabase, oldVersion: number): void {
    if (oldVersion < 1) {
        const plays = db.createObjectStore("plays", { keyPath: "id" });
        plays.createIndex("bySession", "sessionId", { unique: false });
        db.createObjectStore("sessions", { keyPath: "id" });
        db.createObjectStore("meta", { keyPath: "key" });
    }
}

function txApi(tx: IDBTransaction): RepoTx {
    const plays = tx.objectStore("plays");
    const sessions = tx.objectStore("sessions");
    const meta = tx.objectStore("meta");
    return {
        getPlay: (id) => request<StoredPlay | undefined>(plays.get(id)),
        putPlay: async (play) => {
            await request(plays.put(play));
        },
        deletePlay: async (id) => {
            await request(plays.delete(id));
        },
        allPlays: () => request<StoredPlay[]>(plays.getAll()),
        sessionPlays: (sessionId) => request<StoredPlay[]>(plays.index("bySession").getAll(sessionId)),
        getSession: (id) => request<StoredSession | undefined>(sessions.get(id)),
        putSession: async (session) => {
            await request(sessions.put(session));
        },
        deleteSession: async (id) => {
            await request(sessions.delete(id));
        },
        allSessions: () => request<StoredSession[]>(sessions.getAll()),
        getMeta: async (key) => (await request<{ key: string; value: unknown } | undefined>(meta.get(key)))?.value,
        putMeta: async (key, value) => {
            await request(meta.put({ key, value }));
        },
    };
}

/** Resolves only on `complete`, so callers see committed data; aborts when the work throws. */
function run<T>(db: IDBDatabase, mode: IDBTransactionMode, work: (tx: RepoTx) => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        let tx: IDBTransaction;
        try {
            tx = db.transaction(STORES, mode);
        } catch (error) {
            reject(error);
            return;
        }
        let outcome: { value: T } | null = null;
        let settled = false;
        const fail = (error: unknown) => {
            if (settled) return;
            settled = true;
            reject(error);
        };
        tx.oncomplete = () => {
            if (settled) return;
            settled = true;
            if (outcome) resolve(outcome.value);
            // The work awaited something other than the repo, and IndexedDB committed without it.
            else reject(new Error("The transaction finished before its work did"));
        };
        tx.onabort = () => fail(tx.error ?? new Error("The transaction was aborted"));
        work(txApi(tx)).then(
            (value) => {
                outcome = { value };
            },
            (error: unknown) => {
                fail(error);
                try {
                    tx.abort();
                } catch {
                    // Already finished.
                }
            },
        );
    });
}

export interface IdbRepoOptions {
    factory?: IDBFactory;
    name?: string;
    /** A newer tab upgraded the schema: this connection is closed and the app must reload. */
    onVersionChange?: () => void;
}

export function openIdbRepo({ factory = globalThis.indexedDB, name = DB_NAME, onVersionChange }: IdbRepoOptions = {}): Promise<PlannerRepo> {
    return new Promise<PlannerRepo>((resolve, reject) => {
        if (!factory) {
            reject(new Error("IndexedDB is not available"));
            return;
        }
        let open: IDBOpenDBRequest;
        try {
            open = factory.open(name, DB_VERSION);
        } catch (error) {
            reject(error);
            return;
        }
        open.onupgradeneeded = (event) => upgradeDatabase(open.result, event.oldVersion);
        open.onblocked = () => reject(new StorageBlockedError());
        open.onerror = () => reject(open.error ?? new Error("IndexedDB failed to open"));
        open.onsuccess = () => {
            const db = open.result;
            db.onversionchange = () => {
                db.close();
                onVersionChange?.();
            };
            resolve({
                durable: true,
                read: (work) => run(db, "readonly", work),
                write: (work) => run(db, "readwrite", work),
                close: () => db.close(),
            });
        };
    });
}
```

- [ ] **Step 7: Run the test**

Run: `bun run test __tests__/apps/planner/repos.test.ts`
Expected: PASS (both repos, all cases).

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
/usr/bin/git add package.json bun.lock apps/planner/src/store __tests__/apps/planner/repos.test.ts
/usr/bin/git commit -m "feat(practice-planner): IndexedDB and memory record repos for the static planner

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 4: Local store, part 1 — the drill library

**Files:**
- Create: `apps/planner/src/store/types.ts`, `apps/planner/src/store/shared.ts`, `apps/planner/src/store/library.ts`
- Create (test helper): `__tests__/apps/planner/store-harness.ts`
- Test: `__tests__/apps/planner/local-store.library.test.ts`

**Interfaces:**
- Consumes: `PlannerRepo`, `RepoTx`, `StoredPlay`, `META_STARTERS_SEEDED` (Task 3); `STARTER_PLAYS`; `parseStoredPlayData`, `sanitizePlayDataForWrite`, `PLAY_DATA_UNREADABLE_*` from `@/lib/utils/play-data`.
- Produces:
  - `types.ts`: `LocalSessionSummary`, `LocalSessionDrill`, `LocalSessionSave`, `LocalSessionSaved`, `LocalSessionEdit`, `LocalPlayUpdate`, `PlanImportOptions`, `LocalStoreOptions`, `LocalPlannerStore`.
  - `shared.ts`: `StoreContext`, `createStoreContext(repo, options?, afterWrite?)`, `write(ctx, work)`, `attempt(fallback, work)`, `StoreRefusal`, `ok(data)`, `summary(play)`, `drillText(name, description)`, `writablePlayData(playData)`, `thumbnailOrNull(value)`, the message constants `STORAGE_FULL_MESSAGE`, `OWNED_DRILL_DELETE_MESSAGE`, `PLAY_NOT_FOUND_MESSAGE`.
  - `library.ts`: `LibraryOps`, `dateFilterStart(filter, now)`, `createLibraryOps(ctx)`.
  - Harness: `REPOS`, `Clock`, `openHarness(open)`, `addLibraryPlay(store, name, extra?)`.
  - Task 6 helper `render-screen.tsx`: `memoryStore()`, `wrapScreen(ui, store)`, `renderScreen(ui, store)`.

- [ ] **Step 1: Write the test harness and the failing tests**

Create `__tests__/apps/planner/store-harness.ts`:

```ts
/**
 * The local-store contract runs against both repos (ADR-0020): the in-memory
 * fallback and IndexedDB (fake-indexeddb, a fresh factory per test). The clock
 * and ids are injected: never vi.useFakeTimers with fake-indexeddb.
 */
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRepo } from "@/apps/planner/src/store/memory-repo";
import { openIdbRepo } from "@/apps/planner/src/store/idb-repo";
import type { PlannerRepo } from "@/apps/planner/src/store/records";
import type { LocalStoreOptions } from "@/apps/planner/src/store/types";
import type { PlannerStore } from "@/lib/planner-store";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { LOCAL_TEAM_ID } from "@/apps/planner/src/config";

let dbSeq = 0;

export const REPOS: Array<[string, () => Promise<PlannerRepo>]> = [
    ["memory", async () => createMemoryRepo()],
    ["indexeddb", () => openIdbRepo({ factory: new IDBFactory(), name: `store-test-${++dbSeq}` })],
];

export interface Clock {
    now: Date;
}

export async function openHarness(open: () => Promise<PlannerRepo>) {
    const repo = await open();
    const clock: Clock = { now: new Date("2026-10-07T12:00:00") };
    let id = 0;
    const options: Required<Pick<LocalStoreOptions, "now" | "newId">> & LocalStoreOptions = {
        now: () => new Date(clock.now),
        newId: () => `id-${++id}`,
    };
    return { repo, clock, options };
}

export async function addLibraryPlay(
    store: Pick<PlannerStore, "createPlay">,
    name: string,
    extra: { description?: string } = {},
): Promise<string> {
    const result = await store.createPlay({ name, playData: createEmptyPlayData(), isTemplate: true, teamId: LOCAL_TEAM_ID, ...extra });
    if (!result.success) throw new Error(result.error);
    return result.data.id;
}
```

Create `__tests__/apps/planner/local-store.library.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { REPOS, addLibraryPlay, openHarness } from "./store-harness";
import { createLibraryOps, dateFilterStart } from "@/apps/planner/src/store/library";
import { STORAGE_FULL_MESSAGE, createStoreContext } from "@/apps/planner/src/store/shared";
import { createMemoryRepo } from "@/apps/planner/src/store/memory-repo";
import type { StoredPlay } from "@/apps/planner/src/store/records";
import { LOCAL_TEAM_ID } from "@/apps/planner/src/config";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import { PLAY_DATA_UNREADABLE_CODE, PLAY_DATA_UNREADABLE_MESSAGE, createEmptyPlayData } from "@/lib/utils/play-data";

const QUERY = { teamId: LOCAL_TEAM_ID, isTemplate: true, page: 1, limit: 20, dateFilter: "all" as const };

describe.each(REPOS)("library (%s)", (_name, open) => {
    async function setup() {
        const h = await openHarness(open);
        return { ...h, library: createLibraryOps(createStoreContext(h.repo, h.options)) };
    }

    it("lists only unowned templates, newest first, with page totals", async () => {
        const { repo, clock, library } = await setup();
        clock.now = new Date("2026-10-05T09:00:00");
        await addLibraryPlay(library, "Older");
        clock.now = new Date("2026-10-06T09:00:00");
        await addLibraryPlay(library, "Newer");
        await repo.write((tx) =>
            tx.putPlay({ id: "owned", name: "Owned copy", description: null, thumbnail: null, playData: createEmptyPlayData(), isTemplate: false, sessionId: "s1", sourcePlayId: null, createdAt: clock.now, updatedAt: clock.now }),
        );
        const result = await library.getPlaysByTeam(QUERY);
        expect(result.success && result.data.plays.map((p) => p.name)).toEqual(["Newer", "Older"]);
        expect(result.success && result.data).toMatchObject({ total: 2, page: 1, limit: 20 });

        const page2 = await library.getPlaysByTeam({ ...QUERY, limit: 1, page: 2 });
        expect(page2.success && page2.data.plays.map((p) => p.name)).toEqual(["Older"]);
        expect(page2.success && page2.data.total).toBe(2);
    });

    it("searches name and description, case-insensitively", async () => {
        const { library } = await setup();
        await addLibraryPlay(library, "Breakout");
        await addLibraryPlay(library, "Regroup", { description: "Neutral-zone BREAKOUT support" });
        await addLibraryPlay(library, "Shooting");
        const result = await library.getPlaysByTeam({ ...QUERY, search: "  breakout " });
        expect(result.success && result.data.plays.map((p) => p.name).sort()).toEqual(["Breakout", "Regroup"]);
    });

    it("filters by creation date: today, this week from Sunday, this month", async () => {
        const { clock, library } = await setup();
        for (const [when, name] of [
            ["2026-09-20T09:00:00", "September"],
            ["2026-10-02T09:00:00", "Last week"],
            ["2026-10-05T09:00:00", "Monday"],
            ["2026-10-07T09:00:00", "Today"],
        ] as const) {
            clock.now = new Date(when);
            await addLibraryPlay(library, name);
        }
        clock.now = new Date("2026-10-07T12:00:00"); // a Wednesday
        const names = async (dateFilter: "today" | "week" | "month" | "all") => {
            const result = await library.getPlaysByTeam({ ...QUERY, dateFilter });
            return result.success ? result.data.plays.map((p) => p.name) : [];
        };
        expect(await names("today")).toEqual(["Today"]);
        expect(await names("week")).toEqual(["Today", "Monday"]);
        expect(await names("month")).toEqual(["Today", "Monday", "Last week"]);
        expect(await names("all")).toHaveLength(4);
    });

    it("validates a new drill's name, description and diagram", async () => {
        const { library } = await setup();
        const base = { playData: createEmptyPlayData(), isTemplate: true, teamId: LOCAL_TEAM_ID };
        expect(await library.createPlay({ ...base, name: " \u0001 " })).toEqual({ success: false, error: "Name is required" });
        expect(await library.createPlay({ ...base, name: "x".repeat(101) })).toEqual({ success: false, error: "Name must be at most 100 characters" });
        expect(await library.createPlay({ ...base, name: "Ok", description: "d".repeat(1001) })).toEqual({ success: false, error: "Description must be at most 1000 characters" });
        const bad = await library.createPlay({ ...base, name: "Ok", playData: { version: 2 } as never });
        expect(bad).toMatchObject({ success: false, error: "Invalid play data" });
    });

    it("reads a library play, refusing owned copies and flagging unreadable diagrams", async () => {
        const { repo, clock, library } = await setup();
        const id = await addLibraryPlay(library, "Breakout");
        const found = await library.getPlayById({ id, teamId: LOCAL_TEAM_ID });
        expect(found.success && found.data).toMatchObject({ id, name: "Breakout", isTemplate: true });

        const raw = (overrides: Partial<StoredPlay>): StoredPlay => ({ id: "x", name: "x", description: null, thumbnail: null, playData: createEmptyPlayData(), isTemplate: true, sessionId: null, sourcePlayId: null, createdAt: clock.now, updatedAt: clock.now, ...overrides });
        await repo.write(async (tx) => {
            await tx.putPlay(raw({ id: "owned", sessionId: "s1", isTemplate: false }));
            await tx.putPlay(raw({ id: "broken", playData: { version: 99 } }));
        });
        expect(await library.getPlayById({ id: "owned", teamId: LOCAL_TEAM_ID })).toEqual({ success: false, error: "Play not found" });
        expect(await library.getPlayById({ id: "broken", teamId: LOCAL_TEAM_ID })).toEqual({
            success: false,
            error: PLAY_DATA_UNREADABLE_MESSAGE,
            details: { code: PLAY_DATA_UNREADABLE_CODE },
        });
    });

    it("updates library plays only", async () => {
        const { repo, clock, library } = await setup();
        const id = await addLibraryPlay(library, "Breakout");
        expect(await library.updatePlay({ id, name: "Breakout 2", description: "new", playData: createEmptyPlayData() })).toEqual({ success: true, data: { id } });
        const read = await library.getPlayById({ id, teamId: LOCAL_TEAM_ID });
        expect(read.success && [read.data.name, read.data.description]).toEqual(["Breakout 2", "new"]);
        await repo.write((tx) =>
            tx.putPlay({ id: "owned", name: "Owned", description: null, thumbnail: null, playData: createEmptyPlayData(), isTemplate: false, sessionId: "s1", sourcePlayId: null, createdAt: clock.now, updatedAt: clock.now }),
        );
        expect(await library.updatePlay({ id: "owned", name: "No", playData: createEmptyPlayData() })).toEqual({ success: false, error: "Play not found" });
    });

    it("deletes library plays and refuses owned copies with the hosted message", async () => {
        const { repo, clock, library } = await setup();
        const id = await addLibraryPlay(library, "Breakout");
        expect(await library.deletePlay({ id, teamId: LOCAL_TEAM_ID })).toEqual({ success: true, data: { id, detachedSessions: 0 } });
        await repo.write((tx) =>
            tx.putPlay({ id: "owned", name: "Owned", description: null, thumbnail: null, playData: createEmptyPlayData(), isTemplate: false, sessionId: "s1", sourcePlayId: null, createdAt: clock.now, updatedAt: clock.now }),
        );
        expect(await library.deletePlay({ id: "owned", teamId: LOCAL_TEAM_ID })).toEqual({
            success: false,
            error: "This drill belongs to a practice session. Remove it from that session.",
        });
        expect(await library.deletePlay({ id: "nope", teamId: LOCAL_TEAM_ID })).toEqual({ success: false, error: "Play not found" });
    });

    it("seeds the starter drills once, skipping names already in the library, and never re-seeds", async () => {
        const { library } = await setup();
        await addLibraryPlay(library, STARTER_PLAYS[0].name.toUpperCase());
        await library.seedStarterDrills();
        const all = await library.getPlaysByTeam({ ...QUERY, limit: 100 });
        expect(all.success && all.data.total).toBe(STARTER_PLAYS.length);

        const starterId = all.success ? all.data.plays.find((p) => p.name === STARTER_PLAYS[1].name)!.id : "";
        await library.deletePlay({ id: starterId, teamId: LOCAL_TEAM_ID });
        await library.seedStarterDrills();
        const after = await library.getPlaysByTeam({ ...QUERY, limit: 100 });
        expect(after.success && after.data.total).toBe(STARTER_PLAYS.length - 1);
    });
});

describe("dateFilterStart", () => {
    it("starts the week on Sunday at midnight", () => {
        expect(dateFilterStart("week", new Date("2026-10-07T12:00:00"))).toEqual(new Date("2026-10-04T00:00:00"));
        expect(dateFilterStart("all", new Date())).toBeNull();
    });
});

describe("store failures", () => {
    it("maps a quota error to the storage-full message", async () => {
        const repo = createMemoryRepo();
        const full = { ...repo, write: () => Promise.reject(Object.assign(new Error("full"), { name: "QuotaExceededError" })) };
        const library = createLibraryOps(createStoreContext(full));
        expect(await library.createPlay({ name: "Breakout", playData: createEmptyPlayData(), isTemplate: true, teamId: LOCAL_TEAM_ID })).toEqual({
            success: false,
            error: STORAGE_FULL_MESSAGE,
        });
    });

    it("logs an unexpected error and returns the hosted fallback message", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const repo = createMemoryRepo();
        const broken = { ...repo, read: () => Promise.reject(new Error("boom")) };
        const library = createLibraryOps(createStoreContext(broken));
        expect(await library.getPlaysByTeam(QUERY)).toEqual({ success: false, error: "Failed to fetch plays. Please try again." });
        expect(error).toHaveBeenCalled();
        error.mockRestore();
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test __tests__/apps/planner/local-store.library.test.ts`
Expected: FAIL — cannot resolve `library` / `shared`.

- [ ] **Step 3: The store interface**

Create `apps/planner/src/store/types.ts`:

```ts
/**
 * The static planner's store (ADR-0020): PlannerStore plus what the static
 * glue needs, which hosted gets from server components and editor wrappers.
 * Function properties, as in PlannerStore, so strictFunctionTypes checks them.
 * There is no sharePracticeSession: team sharing is hosted-only.
 */
import type { ActionResult, PlannerStore } from "@/lib/planner-store";
import type { PlanDocument } from "@/lib/plan-document";
import type { SavedDrillId } from "@/lib/utils/session-drill-ids";
import type { PlayData, PracticeSessionData, PracticeSessionView } from "@/types/practice-planner";

export interface LocalSessionSummary {
    id: string;
    title: string;
    date: Date;
    duration: number;
    drillCount: number;
    updatedAt: Date;
}

/** One drill in a session save: the editor's card, as EditSessionWrapper maps it for hosted. */
export interface LocalSessionDrill {
    playId: string;
    clientKey: string;
    sequence: number;
    runsWithPrevious: boolean;
    duration: number;
    instructions: string;
}

export interface LocalSessionSave {
    title: string;
    date: Date;
    duration: number;
    plays: LocalSessionDrill[];
}

export interface LocalSessionSaved {
    id: string;
    /** clientKey → owned playId, as updatePracticeSession returns it. */
    plays: SavedDrillId[];
}

export interface LocalSessionEdit {
    sessionId: string;
    initialData: PracticeSessionData;
}

export interface LocalPlayUpdate {
    id: string;
    name: string;
    description?: string;
    thumbnail?: string;
    playData: PlayData;
}

export interface PlanImportOptions {
    date: Date;
    addToLibrary: boolean;
}

export interface LocalStoreOptions {
    now?: () => Date;
    newId?: () => string;
    /** A thumbnail for a drill the store creates itself (starters, imports). Errors are swallowed. */
    makeThumbnail?: (playData: PlayData) => string | null;
}

export interface LocalPlannerStore extends PlannerStore {
    listSessions: () => Promise<ActionResult<LocalSessionSummary[]>>;
    getSessionView: (id: string) => Promise<ActionResult<PracticeSessionView>>;
    getSessionForEdit: (id: string) => Promise<ActionResult<LocalSessionEdit>>;
    createSession: (input: LocalSessionSave) => Promise<ActionResult<LocalSessionSaved>>;
    updateSession: (id: string, input: LocalSessionSave) => Promise<ActionResult<LocalSessionSaved>>;
    updatePlay: (input: LocalPlayUpdate) => Promise<ActionResult<{ id: string }>>;
    importPlan: (plan: PlanDocument, options: PlanImportOptions) => Promise<ActionResult<{ sessionId: string }>>;
    seedStarterDrills: () => Promise<void>;
}
```

- [ ] **Step 4: Shared helpers**

Create `apps/planner/src/store/shared.ts`:

```ts
/** Helpers every local-store operation shares (ADR-0020). */
import type { ActionResult, LibraryPlaySummary } from "@/lib/planner-store";
import { sanitizePlayDataForWrite } from "@/lib/utils/play-data";
import type { PlayData } from "@/types/practice-planner";
import type { PlannerRepo, RepoTx, StoredPlay } from "./records";
import type { LocalStoreOptions } from "./types";

export const STORAGE_FULL_MESSAGE =
    "Your browser is out of storage space for this site. Download plan files to back up, then delete old practices or drills.";
/** Hosted's text (lib/actions/plays.ts deletePlay). */
export const OWNED_DRILL_DELETE_MESSAGE = "This drill belongs to a practice session. Remove it from that session.";
export const PLAY_NOT_FOUND_MESSAGE = "Play not found";

/** An expected refusal with a friendly message. Thrown inside repo.write, it also aborts the transaction. */
export class StoreRefusal extends Error {
    constructor(
        message: string,
        readonly details?: unknown,
    ) {
        super(message);
        this.name = "StoreRefusal";
    }
}

export interface StoreContext {
    repo: PlannerRepo;
    now: () => Date;
    newId: () => string;
    makeThumbnail: (playData: PlayData) => string | null;
    /** Runs after every successful user write (the persistence request). */
    afterWrite: () => void;
}

export function createStoreContext(repo: PlannerRepo, options: LocalStoreOptions = {}, afterWrite: () => void = () => undefined): StoreContext {
    const makeThumbnail = options.makeThumbnail;
    return {
        repo,
        now: options.now ?? (() => new Date()),
        newId: options.newId ?? (() => crypto.randomUUID()),
        makeThumbnail: (playData) => {
            if (!makeThumbnail) return null;
            try {
                return makeThumbnail(playData);
            } catch {
                return null;
            }
        },
        afterWrite,
    };
}

/** A user write: the repo write, then afterWrite. */
export async function write<T>(ctx: StoreContext, work: (tx: RepoTx) => Promise<T>): Promise<T> {
    const result = await ctx.repo.write(work);
    ctx.afterWrite();
    return result;
}

export const ok = <T,>(data: T): ActionResult<T> => ({ success: true, data });

function isQuotaError(error: unknown): boolean {
    return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "QuotaExceededError";
}

/** Runs an operation and turns every failure into an ActionResult, as the server actions do. */
export async function attempt<T>(fallback: string, work: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
    try {
        return await work();
    } catch (error) {
        if (error instanceof StoreRefusal) {
            return error.details === undefined
                ? { success: false, error: error.message }
                : { success: false, error: error.message, details: error.details };
        }
        if (isQuotaError(error)) return { success: false, error: STORAGE_FULL_MESSAGE };
        console.error(fallback, error);
        return { success: false, error: fallback };
    }
}

export function summary(play: StoredPlay): LibraryPlaySummary {
    return {
        id: play.id,
        name: play.name,
        description: play.description,
        thumbnail: play.thumbnail,
        isTemplate: play.isTemplate,
        createdAt: play.createdAt,
        updatedAt: play.updatedAt,
    };
}

const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/** Hosted's limits (createPlaySchema): name 1–100, description ≤ 1000, both cleaned. */
export function drillText(name: string, description: string | null | undefined): { name: string; description: string | null } {
    const cleanName = name.replace(CONTROL_CHARS, "").trim();
    if (!cleanName) throw new StoreRefusal("Name is required");
    if (cleanName.length > 100) throw new StoreRefusal("Name must be at most 100 characters");
    const cleanDescription = (description ?? "").replace(CONTROL_CHARS, "").trim();
    if (cleanDescription.length > 1000) throw new StoreRefusal("Description must be at most 1000 characters");
    return { name: cleanName, description: cleanDescription || null };
}

export function writablePlayData(playData: PlayData): PlayData {
    let sanitized: ReturnType<typeof sanitizePlayDataForWrite>;
    try {
        sanitized = sanitizePlayDataForWrite(playData);
    } catch {
        throw new StoreRefusal("Invalid play data");
    }
    if (!sanitized.ok) throw new StoreRefusal("Invalid play data", sanitized.issues);
    return sanitized.data;
}

/** Only image data URLs are kept; anything else is dropped rather than stored. */
export function thumbnailOrNull(value: string | null | undefined): string | null {
    return value && value.startsWith("data:image/") ? value : null;
}
```

- [ ] **Step 5: Library operations**

Create `apps/planner/src/store/library.ts`:

```ts
/** The drill library, mirroring lib/actions/plays.ts (ADR-0020). */
import type { LibraryDateFilter } from "@/lib/planner-store";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import { PLAY_DATA_UNREADABLE_CODE, PLAY_DATA_UNREADABLE_MESSAGE, parseStoredPlayData } from "@/lib/utils/play-data";
import { META_STARTERS_SEEDED, type StoredPlay } from "./records";
import {
    OWNED_DRILL_DELETE_MESSAGE,
    PLAY_NOT_FOUND_MESSAGE,
    StoreRefusal,
    attempt,
    drillText,
    ok,
    summary,
    thumbnailOrNull,
    writablePlayData,
    write,
    type StoreContext,
} from "./shared";
import type { LocalPlannerStore } from "./types";

export type LibraryOps = Pick<
    LocalPlannerStore,
    "getPlaysByTeam" | "getPlayById" | "createPlay" | "updatePlay" | "deletePlay" | "seedStarterDrills"
>;

/** Hosted's date filter (getPlaysByTeam): local midnight today, Sunday this week, the 1st this month. */
export function dateFilterStart(filter: LibraryDateFilter, now: Date): Date | null {
    switch (filter) {
        case "today":
            return new Date(now.getFullYear(), now.getMonth(), now.getDate());
        case "week": {
            const start = new Date(now);
            start.setDate(now.getDate() - now.getDay());
            start.setHours(0, 0, 0, 0);
            return start;
        }
        case "month":
            return new Date(now.getFullYear(), now.getMonth(), 1);
        default:
            return null;
    }
}

export function createLibraryOps(ctx: StoreContext): LibraryOps {
    return {
        getPlaysByTeam: (input) =>
            attempt("Failed to fetch plays. Please try again.", async () => {
                const plays = await ctx.repo.read((tx) => tx.allPlays());
                const since = dateFilterStart(input.dateFilter, ctx.now());
                const term = input.search?.trim().toLowerCase();
                const matches = plays
                    // Session-owned copies never appear in any listing.
                    .filter((p) => p.sessionId === null)
                    .filter((p) => input.isTemplate === undefined || p.isTemplate === input.isTemplate)
                    .filter((p) => !since || p.createdAt >= since)
                    .filter((p) => !term || p.name.toLowerCase().includes(term) || (p.description ?? "").toLowerCase().includes(term))
                    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.name.localeCompare(b.name));
                const start = (input.page - 1) * input.limit;
                return ok({
                    plays: matches.slice(start, start + input.limit).map(summary),
                    total: matches.length,
                    page: input.page,
                    limit: input.limit,
                });
            }),

        getPlayById: (input) =>
            attempt("Failed to fetch play. Please try again.", async () => {
                const play = await ctx.repo.read((tx) => tx.getPlay(input.id));
                // A session-owned copy is read through its session, never by id.
                if (!play || play.sessionId !== null) return { success: false, error: PLAY_NOT_FOUND_MESSAGE };
                const parsed = parseStoredPlayData(play.playData);
                if (!parsed.ok) {
                    console.error(`Unreadable playData for play ${play.id}:`, parsed.error);
                    return { success: false, error: PLAY_DATA_UNREADABLE_MESSAGE, details: { code: PLAY_DATA_UNREADABLE_CODE } };
                }
                return ok({ ...summary(play), playData: parsed.data });
            }),

        createPlay: (input) =>
            attempt("Failed to create play. Please try again.", async () => {
                const text = drillText(input.name, input.description);
                const playData = writablePlayData(input.playData);
                const at = ctx.now();
                const play: StoredPlay = {
                    id: ctx.newId(),
                    ...text,
                    thumbnail: thumbnailOrNull(input.thumbnail),
                    playData,
                    isTemplate: input.isTemplate,
                    sessionId: null,
                    sourcePlayId: null,
                    createdAt: at,
                    updatedAt: at,
                };
                await write(ctx, (tx) => tx.putPlay(play));
                return ok({ id: play.id, name: play.name, isTemplate: play.isTemplate });
            }),

        updatePlay: (input) =>
            attempt("Failed to update play. Please try again.", async () => {
                const text = drillText(input.name, input.description);
                const playData = writablePlayData(input.playData);
                const thumbnail = thumbnailOrNull(input.thumbnail);
                const at = ctx.now();
                await write(ctx, async (tx) => {
                    const play = await tx.getPlay(input.id);
                    // Sessions hold their own copies, so a library edit never reaches one.
                    if (!play || play.sessionId !== null) throw new StoreRefusal(PLAY_NOT_FOUND_MESSAGE);
                    await tx.putPlay({ ...play, ...text, thumbnail, playData, updatedAt: at });
                });
                return ok({ id: input.id });
            }),

        deletePlay: (input) =>
            attempt("Failed to delete play. Please try again.", async () => {
                await write(ctx, async (tx) => {
                    const play = await tx.getPlay(input.id);
                    if (!play) throw new StoreRefusal(PLAY_NOT_FOUND_MESSAGE);
                    if (play.sessionId !== null) throw new StoreRefusal(OWNED_DRILL_DELETE_MESSAGE);
                    await tx.deletePlay(play.id);
                });
                // No session ever references a library play here, so nothing is detached.
                return ok({ id: input.id, detachedSessions: 0 });
            }),

        seedStarterDrills: async () => {
            if (await ctx.repo.read((tx) => tx.getMeta(META_STARTERS_SEEDED))) return;
            // Thumbnails first: nothing but repo calls may be awaited inside a transaction.
            const prepared = STARTER_PLAYS.map((starter) => ({ starter, thumbnail: ctx.makeThumbnail(starter.playData) }));
            // Not a user write (ctx.repo.write, not write): no persistence prompt at first load.
            await ctx.repo.write(async (tx) => {
                if (await tx.getMeta(META_STARTERS_SEEDED)) return;
                const existing = new Set(
                    (await tx.allPlays()).filter((p) => p.sessionId === null).map((p) => p.name.trim().toLowerCase()),
                );
                const at = ctx.now();
                for (const { starter, thumbnail } of prepared) {
                    if (existing.has(starter.name.trim().toLowerCase())) continue;
                    await tx.putPlay({
                        id: ctx.newId(),
                        name: starter.name,
                        description: starter.description || null,
                        thumbnail,
                        playData: structuredClone(starter.playData),
                        isTemplate: true,
                        sessionId: null,
                        sourcePlayId: null,
                        createdAt: at,
                        updatedAt: at,
                    });
                }
                await tx.putMeta(META_STARTERS_SEEDED, true);
            });
        },
    };
}
```

- [ ] **Step 6: Run the tests**

Run: `bun run test __tests__/apps/planner/local-store.library.test.ts`
Expected: PASS for both repos.

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add apps/planner/src/store __tests__/apps/planner/store-harness.ts __tests__/apps/planner/local-store.library.test.ts
/usr/bin/git commit -m "feat(practice-planner): local drill library for the static planner

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 5: Local store, part 2 — sessions, session drills, import and persistence

**Files:**
- Create: `apps/planner/src/store/sessions.ts`, `apps/planner/src/store/local-store.ts`
- Test: `__tests__/apps/planner/local-store.sessions.test.ts`

**Interfaces:**
- Consumes: Task 3 records; Task 4 `StoreContext`, `createStoreContext`, `write`, `attempt`, `StoreRefusal`, `drillText`, `writablePlayData`, `thumbnailOrNull`, `createLibraryOps`, `LocalPlannerStore` and friends; `LOCAL_*` from `config.ts`; `SESSION_DRILL_REJECTED_MESSAGE`, `duplicateSessionTitle`, `SavedDrillId` from `@/lib/utils/session-drill-ids`; `normalizeGroups`, `stationGroupError` from `@/lib/utils/session-timeline`; `parsePlan`, `serializePlan`, `type PlanDocument` from `@/lib/plan-document`.
- Produces:
  - `sessions.ts`: `SessionOps`, `createSessionOps(ctx)`, `SESSION_NOT_ON_DEVICE_MESSAGE`.
  - `local-store.ts`: `createLocalPlannerStore(repo: PlannerRepo, options?: LocalStoreOptions): LocalPlannerStore`, `requestPersistence(repo, storage?)`.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/apps/planner/local-store.sessions.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { REPOS, addLibraryPlay, openHarness } from "./store-harness";
import { createLocalPlannerStore, requestPersistence } from "@/apps/planner/src/store/local-store";
import { SESSION_NOT_ON_DEVICE_MESSAGE } from "@/apps/planner/src/store/sessions";
import { createMemoryRepo } from "@/apps/planner/src/store/memory-repo";
import type { LocalSessionDrill, LocalSessionSave } from "@/apps/planner/src/store/types";
import { LOCAL_AUTHOR_NAME, LOCAL_TEAM_ID, LOCAL_TEAM_NAME } from "@/apps/planner/src/config";
import { buildPlanDocument } from "@/components/features/practice-planner/ExportPlanMenu";
import { parsePlan, serializePlan } from "@/lib/plan-document";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { SESSION_DRILL_REJECTED_MESSAGE } from "@/lib/utils/session-drill-ids";

const T = LOCAL_TEAM_ID;

function drill(playId: string, clientKey: string, sequence: number, overrides: Partial<LocalSessionDrill> = {}): LocalSessionDrill {
    return { playId, clientKey, sequence, runsWithPrevious: false, duration: 10, instructions: "", ...overrides };
}

function save(plays: LocalSessionDrill[], overrides: Partial<LocalSessionSave> = {}): LocalSessionSave {
    return { title: "Tuesday Skills", date: new Date("2026-10-06T19:00:00"), duration: 60, plays, ...overrides };
}

describe.each(REPOS)("sessions (%s)", (_name, open) => {
    async function setup() {
        const h = await openHarness(open);
        return { ...h, store: createLocalPlannerStore(h.repo, h.options) };
    }

    async function ownedIds(store: Awaited<ReturnType<typeof setup>>["store"], id: string): Promise<string[]> {
        const view = await store.getSessionView(id);
        return view.success ? view.data.plays.map((p) => p.play.id) : [];
    }

    it("creates a session whose library picks become owned clones, mapped per client key", async () => {
        const { store } = await setup();
        const lib = await addLibraryPlay(store, "Breakout");
        const created = await store.createSession(save([drill(lib, "k1", 0)]));
        expect(created.success).toBe(true);
        if (!created.success) return;
        const [mapped] = created.data.plays;
        expect(mapped.clientKey).toBe("k1");
        expect(mapped.playId).not.toBe(lib);

        // The library play is unchanged and the clone never lists.
        const listing = await store.getPlaysByTeam({ teamId: T, isTemplate: true, page: 1, limit: 20, dateFilter: "all" });
        expect(listing.success && listing.data.plays.map((p) => p.id)).toEqual([lib]);
        const edit = await store.getSessionForEdit(created.data.id);
        expect(edit.success && edit.data.initialData.plays[0]).toMatchObject({ id: "k1", playId: mapped.playId, name: "Breakout" });
    });

    it("keeps owned copies on update, clones a second card on the same copy, and drops removed copies", async () => {
        const { store } = await setup();
        const a = await addLibraryPlay(store, "A");
        const b = await addLibraryPlay(store, "B");
        const created = await store.createSession(save([drill(a, "ka", 0), drill(b, "kb", 1)]));
        if (!created.success) throw new Error(created.error);
        const [ownedA, ownedB] = created.data.plays.map((p) => p.playId);

        const updated = await store.updateSession(created.data.id, save([drill(ownedA, "ka", 0), drill(ownedA, "ka2", 1)]));
        if (!updated.success) throw new Error(updated.error);
        expect(updated.data.plays[0].playId).toBe(ownedA);
        expect(updated.data.plays[1].playId).not.toBe(ownedA);
        const ids = await ownedIds(store, created.data.id);
        expect(ids).toEqual([ownedA, updated.data.plays[1].playId]);
        expect(ids).not.toContain(ownedB);
    });

    it("keeps a dialog-created copy the editor hasn't sent yet, and deletes it with the session", async () => {
        const { repo, store } = await setup();
        const created = await store.createSession(save([]));
        if (!created.success) throw new Error(created.error);
        const fresh = await store.saveSessionDrill({ sessionId: created.data.id, teamId: T, name: "Fresh", playData: createEmptyPlayData() });
        if (!fresh.success) throw new Error(fresh.error);

        await store.updateSession(created.data.id, save([], { title: "Renamed" }));
        expect((await repo.read((tx) => tx.getPlay(fresh.data.playId)))?.sessionId).toBe(created.data.id);

        await store.deletePracticeSession({ id: created.data.id, teamId: T });
        expect(await repo.read((tx) => tx.getPlay(fresh.data.playId))).toBeUndefined();
        expect(await store.listSessions()).toEqual({ success: true, data: [] });
    });

    it("rejects an unknown or foreign drill atomically", async () => {
        const { repo, store } = await setup();
        const other = await store.createSession(save([]));
        if (!other.success) throw new Error(other.error);
        const foreign = await store.saveSessionDrill({ sessionId: other.data.id, teamId: T, name: "Theirs", playData: createEmptyPlayData() });
        if (!foreign.success) throw new Error(foreign.error);
        const lib = await addLibraryPlay(store, "Mine");
        const before = (await repo.read((tx) => tx.allPlays())).length;

        expect(await store.createSession(save([drill(lib, "k1", 0), drill(foreign.data.playId, "k2", 1)]))).toEqual({
            success: false,
            error: SESSION_DRILL_REJECTED_MESSAGE,
        });
        expect(await store.createSession(save([drill("missing", "k1", 0)]))).toMatchObject({ success: false, error: SESSION_DRILL_REJECTED_MESSAGE });
        // The clone of `lib` made before the rejection was rolled back.
        expect((await repo.read((tx) => tx.allPlays())).length).toBe(before);
        expect((await repo.read((tx) => tx.allSessions())).length).toBe(1);
    });

    it("enforces the hosted save rules through the plan document, writing nothing", async () => {
        const { repo, store } = await setup();
        const lib = await addLibraryPlay(store, "Long");
        const tooLong = await store.createSession(save([drill(lib, "k1", 0, { duration: 90 })], { duration: 60 }));
        expect(tooLong).toMatchObject({ success: false, error: "Practice timeline (90 min) exceeds session duration (60 min)" });
        expect(await store.createSession(save([], { title: "  " }))).toMatchObject({ success: false, error: "Title is required" });
        expect(await store.createSession(save([drill(lib, "k1", 0), drill(lib, "k1", 1)]))).toEqual({ success: false, error: "Each drill needs a unique key" });
        expect(await store.createSession(save([drill(lib, "k1", 0), drill(lib, "k2", 2)]))).toEqual({
            success: false,
            error: "Drill sequences must run 0, 1, 2… with no gaps or repeats",
        });
        expect(await store.createSession(save([], { date: new Date("nope") }))).toEqual({ success: false, error: "Valid date is required" });
        expect((await repo.read((tx) => tx.allSessions())).length).toBe(0);
    });

    it("saves session drills like hosted: create, update in place, fork a library play, refuse others", async () => {
        const { repo, store } = await setup();
        const s1 = await store.createSession(save([]));
        const s2 = await store.createSession(save([]));
        if (!s1.success || !s2.success) throw new Error("setup");
        const base = { sessionId: s1.data.id, teamId: T, name: "Drill", playData: createEmptyPlayData() };

        const created = await store.saveSessionDrill(base);
        if (!created.success) throw new Error(created.error);
        const updated = await store.saveSessionDrill({ ...base, playId: created.data.playId, name: "Renamed" });
        expect(updated).toEqual({ success: true, data: { playId: created.data.playId } });
        expect((await repo.read((tx) => tx.getPlay(created.data.playId)))?.name).toBe("Renamed");

        const lib = await addLibraryPlay(store, "Library");
        const forked = await store.saveSessionDrill({ ...base, playId: lib });
        if (!forked.success) throw new Error(forked.error);
        expect(forked.data.playId).not.toBe(lib);
        expect(await repo.read((tx) => tx.getPlay(forked.data.playId))).toMatchObject({ sessionId: s1.data.id, sourcePlayId: lib, isTemplate: false });

        expect(await store.saveSessionDrill({ ...base, sessionId: s2.data.id, playId: created.data.playId })).toEqual({
            success: false,
            error: SESSION_DRILL_REJECTED_MESSAGE,
        });
        expect(await store.saveSessionDrill({ ...base, sessionId: "missing" })).toEqual({ success: false, error: "Practice session not found" });
    });

    it("copies an owned drill into the library, and nothing else", async () => {
        const { store } = await setup();
        const s = await store.createSession(save([]));
        if (!s.success) throw new Error(s.error);
        const owned = await store.saveSessionDrill({ sessionId: s.data.id, teamId: T, name: "Keeper", playData: createEmptyPlayData() });
        if (!owned.success) throw new Error(owned.error);
        const copy = await store.copySessionDrillToLibrary({ playId: owned.data.playId, teamId: T });
        if (!copy.success) throw new Error(copy.error);
        const read = await store.getPlayById({ id: copy.data.playId, teamId: T });
        expect(read.success && read.data).toMatchObject({ name: "Keeper", isTemplate: true });
        expect(await store.copySessionDrillToLibrary({ playId: copy.data.playId, teamId: T })).toEqual({
            success: false,
            error: "Drill not found in this session",
        });
    });

    it("duplicates a session onto a new date with its own clones and the same row settings", async () => {
        const { store } = await setup();
        const lib = await addLibraryPlay(store, "Breakout");
        const s = await store.createSession(save([drill(lib, "k1", 0, { instructions: "Hard", duration: 15 })]));
        if (!s.success) throw new Error(s.error);
        const date = new Date("2026-10-13T19:00:00");
        const copy = await store.duplicatePracticeSession({ id: s.data.id, teamId: T, date });
        if (!copy.success) throw new Error(copy.error);
        const view = await store.getSessionView(copy.data.id);
        expect(view.success && view.data).toMatchObject({ title: "Copy of Tuesday Skills", date: date.toISOString() });
        expect(view.success && view.data.plays[0]).toMatchObject({ instructions: "Hard", duration: 15 });
        const [original] = await ownedIds(store, s.data.id);
        expect(view.success && view.data.plays[0].play.id).not.toBe(original);
    });

    it("lists sessions newest date first", async () => {
        const { store } = await setup();
        await store.createSession(save([], { title: "Early", date: new Date("2026-10-01T19:00:00") }));
        await store.createSession(save([], { title: "Late", date: new Date("2026-10-08T19:00:00") }));
        const result = await store.listSessions();
        expect(result.success && result.data.map((s) => [s.title, s.drillCount])).toEqual([["Late", 0], ["Early", 0]]);
    });

    it("reads views with local constants, null for unreadable diagrams, and normalized editor groups", async () => {
        const { repo, store } = await setup();
        const lib = await addLibraryPlay(store, "Breakout");
        const s = await store.createSession(save([drill(lib, "k1", 0)]));
        if (!s.success) throw new Error(s.error);
        const ownedId = s.data.plays[0].playId;
        await repo.write(async (tx) => {
            const play = await tx.getPlay(ownedId);
            await tx.putPlay({ ...play!, playData: { version: 99 } });
        });
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const view = await store.getSessionView(s.data.id);
        expect(view.success && view.data).toMatchObject({ teamId: T, teamName: LOCAL_TEAM_NAME, createdByName: LOCAL_AUTHOR_NAME, isShared: false, venueId: null });
        expect(view.success && view.data.plays[0].play.playData).toBeNull();
        const edit = await store.getSessionForEdit(s.data.id);
        expect(edit.success && edit.data.initialData.plays[0]).toMatchObject({ playDataUnreadable: true, sequence: 0, runsWithPrevious: false });
        error.mockRestore();
        expect(await store.getSessionView("missing")).toEqual({ success: false, error: SESSION_NOT_ON_DEVICE_MESSAGE });
    });

    it("exports every saved session as a plan the hosted platform accepts", async () => {
        const { store } = await setup();
        const a = await addLibraryPlay(store, "A");
        const b = await addLibraryPlay(store, "B");
        const s = await store.createSession(save([drill(a, "k1", 0), drill(b, "k2", 1, { runsWithPrevious: true })]));
        if (!s.success) throw new Error(s.error);
        const view = await store.getSessionView(s.data.id);
        if (!view.success) throw new Error(view.error);
        const doc = buildPlanDocument(view.data, new Date(), "openleague-static");
        expect(parsePlan(JSON.parse(JSON.stringify(doc))).ok).toBe(true);
    });

    it("imports a plan as a session with owned drills, plus library copies on request", async () => {
        const { store } = await setup();
        const plan = serializePlan(
            {
                title: "Imported",
                durationMinutes: 45,
                date: "2026-10-06",
                startTime: "19:00",
                drills: [
                    { sequence: 0, duration: 10, runsWithPrevious: false, instructions: "Go", name: "One", description: null, playData: createEmptyPlayData() },
                    { sequence: 1, duration: 10, runsWithPrevious: true, instructions: null, name: "Two", description: "d", playData: createEmptyPlayData() },
                ],
            },
            "openleague-hosted",
        );
        const date = new Date("2026-10-06T19:00:00");
        const plain = await store.importPlan(plan, { date, addToLibrary: false });
        if (!plain.success) throw new Error(plain.error);
        const view = await store.getSessionView(plain.data.sessionId);
        expect(view.success && view.data).toMatchObject({ title: "Imported", duration: 45, date: date.toISOString() });
        expect(view.success && view.data.plays.map((p) => [p.play.name, p.runsWithPrevious, p.instructions])).toEqual([
            ["One", false, "Go"],
            ["Two", true, null],
        ]);
        const libraryBefore = await store.getPlaysByTeam({ teamId: T, isTemplate: true, page: 1, limit: 20, dateFilter: "all" });
        expect(libraryBefore.success && libraryBefore.data.total).toBe(0);

        await store.importPlan(plan, { date, addToLibrary: true });
        const libraryAfter = await store.getPlaysByTeam({ teamId: T, isTemplate: true, page: 1, limit: 20, dateFilter: "all" });
        expect(libraryAfter.success && libraryAfter.data.plays.map((p) => p.name).sort()).toEqual(["One", "Two"]);
    });

    it("refuses an import that isn't a valid plan", async () => {
        const { store } = await setup();
        const result = await store.importPlan({ format: "nope" } as never, { date: new Date(), addToLibrary: false });
        expect(result).toMatchObject({ success: false, error: "This file isn't an OpenLeague practice plan." });
    });
});

describe("requestPersistence", () => {
    it("asks the browser once per database, after the first user write", async () => {
        const persist = vi.fn().mockResolvedValue(true);
        const repo = { ...createMemoryRepo(), durable: true };
        await requestPersistence(repo, { persist } as unknown as StorageManager);
        await requestPersistence(repo, { persist } as unknown as StorageManager);
        expect(persist).toHaveBeenCalledTimes(1);
    });

    it("never throws when the API is missing or refuses", async () => {
        const repo = { ...createMemoryRepo(), durable: true };
        await expect(requestPersistence(repo, undefined)).resolves.toBeUndefined();
        await expect(requestPersistence(repo, { persist: vi.fn().mockRejectedValue(new Error("no")) } as unknown as StorageManager)).resolves.toBeUndefined();
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/apps/planner/local-store.sessions.test.ts`
Expected: FAIL — cannot resolve `local-store` / `sessions`.

- [ ] **Step 3: Session operations**

Create `apps/planner/src/store/sessions.ts`:

```ts
/**
 * Sessions and their owned drills, mirroring lib/actions/practice-sessions.ts,
 * practice-session-drills.ts and practice-plan-import.ts (ADR-0020, 3a).
 * Every stored session is a valid plan document, so it always exports.
 */
import type { PracticeSessionView, PlayInSession } from "@/types/practice-planner";
import { parsePlan, serializePlan } from "@/lib/plan-document";
import { createEmptyPlayData, parseStoredPlayData } from "@/lib/utils/play-data";
import { normalizeGroups, stationGroupError } from "@/lib/utils/session-timeline";
import { SESSION_DRILL_REJECTED_MESSAGE, duplicateSessionTitle, type SavedDrillId } from "@/lib/utils/session-drill-ids";
import { LOCAL_AUTHOR_NAME, LOCAL_TEAM_ID, LOCAL_TEAM_NAME } from "../config";
import type { RepoTx, StoredPlay, StoredSession, StoredSessionRow } from "./records";
import { StoreRefusal, attempt, drillText, ok, thumbnailOrNull, writablePlayData, write, type StoreContext } from "./shared";
import type { LocalPlannerStore, LocalSessionDrill, LocalSessionSave } from "./types";

export const SESSION_NOT_ON_DEVICE_MESSAGE = "This practice isn't on this device.";
const SESSION_NOT_FOUND = "Practice session not found";

export type SessionOps = Pick<
    LocalPlannerStore,
    | "listSessions"
    | "getSessionView"
    | "getSessionForEdit"
    | "createSession"
    | "updateSession"
    | "saveSessionDrill"
    | "copySessionDrillToLibrary"
    | "duplicatePracticeSession"
    | "deletePracticeSession"
    | "importPlan"
>;

const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

function validDate(date: Date): Date {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new StoreRefusal("Valid date is required");
    return date;
}

/** Checks the payload's shape before the transaction starts. */
function checkDrills(plays: LocalSessionDrill[]): void {
    if (new Set(plays.map((p) => p.clientKey)).size !== plays.length) throw new StoreRefusal("Each drill needs a unique key");
    const sequences = plays.map((p) => p.sequence).sort((a, b) => a - b);
    if (sequences.some((sequence, index) => sequence !== index)) {
        throw new StoreRefusal("Drill sequences must run 0, 1, 2… with no gaps or repeats");
    }
    const groupError = stationGroupError([...plays].sort((a, b) => a.sequence - b.sequence));
    if (groupError) throw new StoreRefusal(groupError);
}

/** Synchronous, so it can run inside a transaction: the session must be a valid plan document. */
function assertExportable(meta: { title: string; duration: number }, rows: StoredSessionRow[], plays: Map<string, StoredPlay>, at: Date): void {
    const doc = serializePlan(
        {
            title: meta.title,
            durationMinutes: meta.duration,
            date: null,
            startTime: null,
            drills: rows.map((row) => {
                const play = plays.get(row.playId);
                const parsed = parseStoredPlayData(play?.playData);
                return {
                    sequence: row.sequence,
                    duration: row.duration,
                    runsWithPrevious: row.runsWithPrevious,
                    instructions: row.instructions,
                    name: play?.name ?? "",
                    description: play?.description ?? null,
                    playData: parsed.ok ? parsed.data : null,
                };
            }),
        },
        "openleague-static",
        at,
    );
    const result = parsePlan(doc);
    if (!result.ok) throw new StoreRefusal(result.error.issues?.[0] ?? result.error.message, result.error.issues);
}

function cloneInto(source: StoredPlay, sessionId: string, id: string, at: Date): StoredPlay {
    return {
        ...source,
        id,
        isTemplate: false,
        sessionId,
        sourcePlayId: source.sourcePlayId ?? source.id,
        createdAt: at,
        updatedAt: at,
    };
}

/** Keep an owned copy (once), clone a library play or a repeated copy, reject anything else. */
async function materialize(tx: RepoTx, ctx: StoreContext, sessionId: string, items: LocalSessionDrill[], at: Date) {
    const kept = new Set<string>();
    const plays = new Map<string, StoredPlay>();
    const rows: StoredSessionRow[] = [];
    const mapping: SavedDrillId[] = [];
    for (const item of items) {
        const play = await tx.getPlay(item.playId);
        if (!play) throw new StoreRefusal(SESSION_DRILL_REJECTED_MESSAGE);
        let owned: StoredPlay;
        if (play.sessionId === sessionId && !kept.has(play.id)) {
            owned = play;
        } else if (play.sessionId === sessionId || (play.sessionId === null && play.isTemplate)) {
            owned = cloneInto(play, sessionId, ctx.newId(), at);
            await tx.putPlay(owned);
        } else {
            throw new StoreRefusal(SESSION_DRILL_REJECTED_MESSAGE);
        }
        kept.add(owned.id);
        plays.set(owned.id, owned);
        rows.push({
            id: item.clientKey,
            playId: owned.id,
            sequence: item.sequence,
            duration: item.duration,
            instructions: item.instructions,
            runsWithPrevious: item.runsWithPrevious,
        });
        mapping.push({ clientKey: item.clientKey, playId: owned.id });
    }
    rows.sort((a, b) => a.sequence - b.sequence);
    return { rows, plays, mapping };
}

function sessionMeta(input: LocalSessionSave): { title: string; date: Date; duration: number } {
    return { title: input.title.replace(CONTROL_CHARS, "").trim(), date: validDate(input.date), duration: input.duration };
}

async function readSession(ctx: StoreContext, id: string): Promise<{ session: StoredSession; plays: Map<string, StoredPlay> } | null> {
    return ctx.repo.read(async (tx) => {
        const session = await tx.getSession(id);
        if (!session) return null;
        const owned = await tx.sessionPlays(id);
        return { session, plays: new Map(owned.map((p) => [p.id, p])) };
    });
}

function sortedRows(session: StoredSession): StoredSessionRow[] {
    return [...session.rows].sort((a, b) => a.sequence - b.sequence);
}

export function createSessionOps(ctx: StoreContext): SessionOps {
    return {
        listSessions: () =>
            attempt("Failed to load practices. Please try again.", async () => {
                const sessions = await ctx.repo.read((tx) => tx.allSessions());
                return ok(
                    sessions
                        .map((s) => ({ id: s.id, title: s.title, date: s.date, duration: s.duration, drillCount: s.rows.length, updatedAt: s.updatedAt }))
                        .sort((a, b) => b.date.getTime() - a.date.getTime() || b.updatedAt.getTime() - a.updatedAt.getTime()),
                );
            }),

        getSessionView: (id) =>
            attempt("Failed to load the practice. Please try again.", async () => {
                const found = await readSession(ctx, id);
                if (!found) return { success: false, error: SESSION_NOT_ON_DEVICE_MESSAGE };
                const { session, plays } = found;
                const view: PracticeSessionView = {
                    id: session.id,
                    title: session.title,
                    date: session.date.toISOString(),
                    duration: session.duration,
                    isShared: false,
                    createdByName: LOCAL_AUTHOR_NAME,
                    teamId: LOCAL_TEAM_ID,
                    teamName: LOCAL_TEAM_NAME,
                    venueId: null,
                    venueName: null,
                    venueTimezone: null,
                    surfaceId: null,
                    surfaceName: null,
                    segmentId: null,
                    segmentName: null,
                    segmentKind: null,
                    startAt: null,
                    plays: sortedRows(session).flatMap((row) => {
                        const play = plays.get(row.playId);
                        if (!play) return [];
                        const parsed = parseStoredPlayData(play.playData);
                        if (!parsed.ok) console.error(`Unreadable playData (play ${play.id}):`, parsed.error);
                        return [
                            {
                                id: row.id,
                                sequence: row.sequence,
                                duration: row.duration,
                                instructions: row.instructions || null,
                                runsWithPrevious: row.runsWithPrevious,
                                play: {
                                    id: play.id,
                                    name: play.name,
                                    description: play.description,
                                    thumbnail: play.thumbnail,
                                    playData: parsed.ok ? parsed.data : null,
                                },
                            },
                        ];
                    }),
                };
                return ok(view);
            }),

        getSessionForEdit: (id) =>
            attempt("Failed to load the practice. Please try again.", async () => {
                const found = await readSession(ctx, id);
                if (!found) return { success: false, error: SESSION_NOT_ON_DEVICE_MESSAGE };
                const { session, plays } = found;
                const editorPlays: PlayInSession[] = sortedRows(session).flatMap((row) => {
                    const play = plays.get(row.playId);
                    if (!play) return [];
                    const parsed = parseStoredPlayData(play.playData);
                    if (!parsed.ok) console.error(`Unreadable playData (play ${play.id}):`, parsed.error);
                    return [
                        {
                            id: row.id,
                            playId: play.id,
                            name: play.name,
                            description: play.description ?? "",
                            sequence: row.sequence,
                            runsWithPrevious: row.runsWithPrevious,
                            duration: row.duration,
                            instructions: row.instructions,
                            ...(parsed.ok ? { playData: parsed.data } : { playData: createEmptyPlayData(), playDataUnreadable: true }),
                            thumbnail: play.thumbnail ?? "",
                        },
                    ];
                });
                return ok({
                    sessionId: session.id,
                    initialData: {
                        id: session.id,
                        title: session.title,
                        date: session.date,
                        duration: session.duration,
                        isShared: false,
                        plays: normalizeGroups(editorPlays),
                    },
                });
            }),

        createSession: (input) =>
            attempt("Failed to create practice session. Please try again.", async () => {
                const meta = sessionMeta(input);
                checkDrills(input.plays);
                const saved = await write(ctx, async (tx) => {
                    const at = ctx.now();
                    const id = ctx.newId();
                    const { rows, plays, mapping } = await materialize(tx, ctx, id, input.plays, at);
                    assertExportable(meta, rows, plays, at);
                    await tx.putSession({ id, ...meta, rows, createdAt: at, updatedAt: at });
                    return { id, plays: mapping };
                });
                return ok(saved);
            }),

        updateSession: (id, input) =>
            attempt("Failed to update practice session. Please try again.", async () => {
                const meta = sessionMeta(input);
                checkDrills(input.plays);
                const saved = await write(ctx, async (tx) => {
                    const existing = await tx.getSession(id);
                    if (!existing) throw new StoreRefusal(SESSION_NOT_FOUND);
                    const at = ctx.now();
                    const { rows, plays, mapping } = await materialize(tx, ctx, id, input.plays, at);
                    assertExportable(meta, rows, plays, at);
                    await tx.putSession({ ...existing, ...meta, rows, updatedAt: at });
                    // Drop-only cleanup: copies this session referenced before and no longer does.
                    // A copy the drill dialog made but the editor hasn't sent is never touched here.
                    const referenced = new Set(rows.map((row) => row.playId));
                    for (const playId of new Set(existing.rows.map((row) => row.playId))) {
                        if (referenced.has(playId)) continue;
                        const play = await tx.getPlay(playId);
                        if (play?.sessionId === id) await tx.deletePlay(playId);
                    }
                    return { id, plays: mapping };
                });
                return ok(saved);
            }),

        saveSessionDrill: (input) =>
            attempt("Failed to save drill. Please try again.", async () => {
                const text = drillText(input.name, input.description);
                const playData = writablePlayData(input.playData);
                const thumbnail = thumbnailOrNull(input.thumbnail);
                const playId = await write(ctx, async (tx) => {
                    const session = await tx.getSession(input.sessionId);
                    if (!session) throw new StoreRefusal(SESSION_NOT_FOUND);
                    const at = ctx.now();
                    const fields = { ...text, thumbnail, playData, updatedAt: at };
                    if (!input.playId) {
                        const created: StoredPlay = { id: ctx.newId(), ...fields, isTemplate: false, sessionId: session.id, sourcePlayId: null, createdAt: at };
                        await tx.putPlay(created);
                        return created.id;
                    }
                    const play = await tx.getPlay(input.playId);
                    if (!play) throw new StoreRefusal(SESSION_DRILL_REJECTED_MESSAGE);
                    if (play.sessionId === session.id) {
                        await tx.putPlay({ ...play, ...fields });
                        return play.id;
                    }
                    if (play.sessionId !== null || !play.isTemplate) throw new StoreRefusal(SESSION_DRILL_REJECTED_MESSAGE);
                    const forked: StoredPlay = {
                        id: ctx.newId(),
                        ...fields,
                        isTemplate: false,
                        sessionId: session.id,
                        sourcePlayId: play.sourcePlayId ?? play.id,
                        createdAt: at,
                    };
                    await tx.putPlay(forked);
                    return forked.id;
                });
                return ok({ playId });
            }),

        copySessionDrillToLibrary: (input) =>
            attempt("Failed to add drill to the library. Please try again.", async () => {
                const playId = await write(ctx, async (tx) => {
                    const play = await tx.getPlay(input.playId);
                    if (!play || play.sessionId === null) throw new StoreRefusal("Drill not found in this session");
                    const at = ctx.now();
                    const copy: StoredPlay = { ...play, id: ctx.newId(), isTemplate: true, sessionId: null, sourcePlayId: null, createdAt: at, updatedAt: at };
                    await tx.putPlay(copy);
                    return copy.id;
                });
                return ok({ playId });
            }),

        duplicatePracticeSession: (input) =>
            attempt("Failed to duplicate practice session. Please try again.", async () => {
                const date = validDate(input.date);
                const id = await write(ctx, async (tx) => {
                    const source = await tx.getSession(input.id);
                    if (!source) throw new StoreRefusal(SESSION_NOT_FOUND);
                    const at = ctx.now();
                    const newId = ctx.newId();
                    const plays = new Map<string, StoredPlay>();
                    const rows: StoredSessionRow[] = [];
                    for (const row of sortedRows(source)) {
                        const play = await tx.getPlay(row.playId);
                        if (!play) throw new StoreRefusal(SESSION_DRILL_REJECTED_MESSAGE);
                        const copy = cloneInto(play, newId, ctx.newId(), at);
                        await tx.putPlay(copy);
                        plays.set(copy.id, copy);
                        rows.push({ ...row, id: ctx.newId(), playId: copy.id });
                    }
                    const meta = { title: duplicateSessionTitle(source.title), date, duration: source.duration };
                    assertExportable(meta, rows, plays, at);
                    await tx.putSession({ id: newId, ...meta, rows, createdAt: at, updatedAt: at });
                    return newId;
                });
                return ok({ id });
            }),

        deletePracticeSession: (input) =>
            attempt("Failed to delete practice session. Please try again.", async () => {
                await write(ctx, async (tx) => {
                    const session = await tx.getSession(input.id);
                    if (!session) throw new StoreRefusal(SESSION_NOT_FOUND);
                    for (const play of await tx.sessionPlays(input.id)) await tx.deletePlay(play.id);
                    await tx.deleteSession(input.id);
                });
                return ok({ id: input.id });
            }),

        importPlan: (plan, options) =>
            attempt("Failed to import the plan. Please try again.", async () => {
                // Parse again: the caller's object may not have come through parsePlan.
                const parsed = parsePlan(plan);
                if (!parsed.ok) throw new StoreRefusal(parsed.error.message, parsed.error.issues);
                const date = validDate(options.date);
                const drills = parsed.plan.session.drills.map((d) => {
                    const playData = writablePlayData(d.drill.playData);
                    return { d, playData, thumbnail: ctx.makeThumbnail(playData) };
                });
                const sessionId = await write(ctx, async (tx) => {
                    const at = ctx.now();
                    const id = ctx.newId();
                    const rows: StoredSessionRow[] = [];
                    for (const { d, playData, thumbnail } of drills) {
                        const base = {
                            name: d.drill.name,
                            description: d.drill.description || null,
                            thumbnail,
                            playData,
                            sourcePlayId: null,
                            createdAt: at,
                            updatedAt: at,
                        };
                        const owned: StoredPlay = { id: ctx.newId(), ...base, isTemplate: false, sessionId: id };
                        await tx.putPlay(owned);
                        rows.push({
                            id: ctx.newId(),
                            playId: owned.id,
                            sequence: d.sequence,
                            duration: d.durationMinutes,
                            instructions: d.instructions,
                            runsWithPrevious: d.runsWithPrevious,
                        });
                        if (options.addToLibrary) {
                            await tx.putPlay({ id: ctx.newId(), ...base, isTemplate: true, sessionId: null });
                        }
                    }
                    await tx.putSession({
                        id,
                        title: parsed.plan.session.title,
                        date,
                        duration: parsed.plan.session.durationMinutes,
                        rows,
                        createdAt: at,
                        updatedAt: at,
                    });
                    return id;
                });
                return ok({ sessionId });
            }),
    };
}
```

- [ ] **Step 4: Compose the store**

Create `apps/planner/src/store/local-store.ts`:

```ts
/**
 * The static planner's store (ADR-0020): the hosted semantics over a
 * PlannerRepo. main.tsx creates it once; components get it through
 * PlannerProvider, so its identity never changes between renders.
 */
import { createLibraryOps } from "./library";
import { META_PERSIST_REQUESTED, type PlannerRepo } from "./records";
import { createSessionOps } from "./sessions";
import { createStoreContext } from "./shared";
import type { LocalPlannerStore, LocalStoreOptions } from "./types";

/**
 * Asks the browser, once per database, to keep the planner's data. The answer
 * is ignored: browsers may still evict, and the privacy note says so.
 */
export async function requestPersistence(
    repo: PlannerRepo,
    storage: StorageManager | undefined = globalThis.navigator?.storage,
): Promise<void> {
    try {
        if (!storage?.persist) return;
        const first = await repo.write(async (tx) => {
            if (await tx.getMeta(META_PERSIST_REQUESTED)) return false;
            await tx.putMeta(META_PERSIST_REQUESTED, true);
            return true;
        });
        if (first) await storage.persist();
    } catch {
        // Best effort.
    }
}

export function createLocalPlannerStore(repo: PlannerRepo, options: LocalStoreOptions = {}): LocalPlannerStore {
    let asked = false;
    const ctx = createStoreContext(repo, options, () => {
        if (asked || !repo.durable) return;
        asked = true;
        void requestPersistence(repo);
    });
    return { ...createLibraryOps(ctx), ...createSessionOps(ctx) };
}
```

- [ ] **Step 5: Run the tests**

Run: `bun run test __tests__/apps/planner`
Expected: PASS (library and sessions contracts on both repos, repos, routes, platform).

Run: `bun run type-check`
Expected: PASS. (`createLocalPlannerStore` returning the spread proves the two op sets cover `LocalPlannerStore`.)

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add apps/planner/src/store __tests__/apps/planner/local-store.sessions.test.ts
/usr/bin/git commit -m "feat(practice-planner): local sessions, session drills and plan import for the static planner

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 6: Editing and import screens

**Files:**
- Create: `apps/planner/src/screens/useStoreResult.ts`, `apps/planner/src/screens/StatusScreens.tsx`, `apps/planner/src/screens/SessionEditorScreen.tsx`, `apps/planner/src/screens/DrillEditorScreen.tsx`, `apps/planner/src/screens/ImportScreen.tsx`
- Create (test helper): `__tests__/apps/planner/render-screen.tsx`
- Test: `__tests__/apps/planner/editor-screens.test.tsx`, `__tests__/apps/planner/import-screen.test.tsx`

**Interfaces:**
- Consumes: `LocalPlannerStore` and `LocalSessionSave` (Tasks 4–5); `staticRoutes`, `staticPlannerPlatform` (Task 2); `LOCAL_TEAM_ID`, `PRIVACY_NOTE`; `PracticeSessionEditor`, `PracticeSessionSubmitData`, `PlayEditor`, `PlanPreview`; `readPlanFile`, `readPlanLink` from `@/lib/plan-document`.
- Produces:
  - `useStoreResult<T>(load: () => Promise<ActionResult<T>>): LoadState<T>`; `type LoadState<T> = { kind: "loading" } | { kind: "error"; message: string; details?: unknown } | { kind: "ready"; data: T }`.
  - `StatusScreens.tsx`: `LoadingScreen`, `MissingScreen({ message, backHref?, backLabel? })`, `NotFoundScreen`, `DRILL_NOT_ON_DEVICE_MESSAGE`.
  - `SessionEditorScreen({ store, id? })`, `toLocalSessionSave(session: PracticeSessionSubmitData): LocalSessionSave`.
  - `DrillEditorScreen({ store, id? })`.
  - `ImportScreen({ store, linkValue: string | null })`, `planStartDate(plan: PlanDocument, now?: Date): Date`.

- [ ] **Step 1: Write the render helper and the failing tests**

Create `__tests__/apps/planner/render-screen.tsx`:

```tsx
/** Renders a static-planner screen with the real theme, date adapter, static platform and a memory store. */
import type { ReactElement } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import theme from "@/lib/theme";
import { PlannerProvider } from "@/lib/planner-store";
import { staticPlannerPlatform } from "@/apps/planner/src/platform";
import { createLocalPlannerStore } from "@/apps/planner/src/store/local-store";
import { createMemoryRepo } from "@/apps/planner/src/store/memory-repo";
import type { LocalPlannerStore } from "@/apps/planner/src/store/types";

export function memoryStore(): { store: LocalPlannerStore; repo: ReturnType<typeof createMemoryRepo> } {
    const repo = createMemoryRepo();
    let id = 0;
    return { repo, store: createLocalPlannerStore(repo, { newId: () => `id-${++id}` }) };
}

/** The provider tree, also for `rerender`, which replaces the whole root element. */
export function wrapScreen(ui: ReactElement, store: LocalPlannerStore): ReactElement {
    return (
        <ThemeProvider theme={theme}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <PlannerProvider store={store} platform={staticPlannerPlatform}>
                    {ui}
                </PlannerProvider>
            </LocalizationProvider>
        </ThemeProvider>
    );
}

export function renderScreen(ui: ReactElement, store: LocalPlannerStore): RenderResult {
    return render(wrapScreen(ui, store));
}
```

Create `__tests__/apps/planner/editor-screens.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { memoryStore, renderScreen } from "./render-screen";
import { SessionEditorScreen, toLocalSessionSave } from "@/apps/planner/src/screens/SessionEditorScreen";
import { DrillEditorScreen } from "@/apps/planner/src/screens/DrillEditorScreen";
import { DRILL_NOT_ON_DEVICE_MESSAGE } from "@/apps/planner/src/screens/StatusScreens";
import { SESSION_NOT_ON_DEVICE_MESSAGE } from "@/apps/planner/src/store/sessions";
import { LOCAL_TEAM_ID } from "@/apps/planner/src/config";
import type { PracticeSessionSubmitData } from "@/components/features/practice-planner/PracticeSessionEditor";
import { createEmptyPlayData } from "@/lib/utils/play-data";

afterEach(() => {
    window.location.hash = "";
});

describe("toLocalSessionSave", () => {
    it("maps the editor's payload exactly as EditSessionWrapper does for hosted", () => {
        const date = new Date("2026-10-06T19:00:00");
        const submitted = {
            title: "Tuesday",
            date,
            duration: 60,
            isShared: false,
            plays: [{ id: "k1", playId: "p1", name: "A", sequence: 0, runsWithPrevious: false, duration: 10, instructions: "", playData: createEmptyPlayData() }],
            overrideConflicts: false,
            overrideReason: "",
            notify: true,
        } as unknown as PracticeSessionSubmitData;
        expect(toLocalSessionSave(submitted)).toEqual({
            title: "Tuesday",
            date,
            duration: 60,
            plays: [{ playId: "p1", clientKey: "k1", sequence: 0, runsWithPrevious: false, duration: 10, instructions: "" }],
        });
    });
});

describe("SessionEditorScreen", () => {
    it("creates a practice and continues on its edit page", async () => {
        const { store } = memoryStore();
        renderScreen(<SessionEditorScreen store={store} />, store);
        fireEvent.change(screen.getByLabelText(/session title/i), { target: { value: "Tuesday Skills" } });
        fireEvent.click(screen.getByRole("button", { name: /^save session/i }));
        await waitFor(() => expect(window.location.hash).toMatch(/^#\/sessions\/[^/]+\/edit$/));
        const listed = await store.listSessions();
        expect(listed.success && listed.data.map((s) => s.title)).toEqual(["Tuesday Skills"]);
    });

    it("edits a saved practice without offering team sharing", async () => {
        const { store } = memoryStore();
        const lib = await store.createPlay({ name: "Breakout", playData: createEmptyPlayData(), isTemplate: true, teamId: LOCAL_TEAM_ID });
        if (!lib.success) throw new Error(lib.error);
        const created = await store.createSession({
            title: "Tuesday Skills",
            date: new Date("2026-10-06T19:00:00"),
            duration: 60,
            plays: [{ playId: lib.data.id, clientKey: "k1", sequence: 0, runsWithPrevious: false, duration: 10, instructions: "" }],
        });
        if (!created.success) throw new Error(created.error);

        renderScreen(<SessionEditorScreen store={store} id={created.data.id} />, store);
        expect(await screen.findByDisplayValue("Tuesday Skills")).toBeInTheDocument();
        expect(screen.getAllByText("Breakout").length).toBeGreaterThan(0);
        expect(screen.queryByRole("button", { name: /share with team/i })).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText(/session title/i), { target: { value: "Renamed" } });
        fireEvent.click(screen.getByRole("button", { name: /^save session/i }));
        await waitFor(async () => {
            const view = await store.getSessionView(created.data.id);
            expect(view.success && view.data.title).toBe("Renamed");
        });
    });

    it("says when the practice isn't on this device", async () => {
        const { store } = memoryStore();
        renderScreen(<SessionEditorScreen store={store} id="missing" />, store);
        expect(await screen.findByText(SESSION_NOT_ON_DEVICE_MESSAGE)).toBeInTheDocument();
    });
});

describe("DrillEditorScreen", () => {
    it("creates a library drill and returns to the library", async () => {
        const { store } = memoryStore();
        renderScreen(<DrillEditorScreen store={store} />, store);
        fireEvent.change(screen.getByLabelText(/play name/i), { target: { value: "Breakout" } });
        fireEvent.click(screen.getByRole("button", { name: /^save play/i }));
        await waitFor(() => expect(window.location.hash).toBe("#/library"));
        const listing = await store.getPlaysByTeam({ teamId: LOCAL_TEAM_ID, isTemplate: true, page: 1, limit: 20, dateFilter: "all" });
        expect(listing.success && listing.data.plays.map((p) => p.name)).toEqual(["Breakout"]);
    });

    it("refuses to edit an unreadable diagram", async () => {
        const { store, repo } = memoryStore();
        const at = new Date();
        await repo.write((tx) =>
            tx.putPlay({ id: "broken", name: "Broken", description: null, thumbnail: null, playData: { version: 99 }, isTemplate: true, sessionId: null, sourcePlayId: null, createdAt: at, updatedAt: at }),
        );
        renderScreen(<DrillEditorScreen store={store} id="broken" />, store);
        expect(await screen.findByText(/Editing is disabled so the stored drawing isn't overwritten/)).toBeInTheDocument();
    });

    it("says when the drill isn't on this device", async () => {
        const { store } = memoryStore();
        renderScreen(<DrillEditorScreen store={store} id="missing" />, store);
        expect(await screen.findByText(DRILL_NOT_ON_DEVICE_MESSAGE)).toBeInTheDocument();
    });
});
```

Create `__tests__/apps/planner/import-screen.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { memoryStore, renderScreen, wrapScreen } from "./render-screen";
import { ImportScreen, planStartDate } from "@/apps/planner/src/screens/ImportScreen";
import { PRIVACY_NOTE } from "@/apps/planner/src/config";
import { FILE_TOO_LARGE_MESSAGE, MAX_PLAN_FILE_BYTES, NOT_A_PLAN_MESSAGE, encodePlanLink, serializePlan, type PlanSessionInput } from "@/lib/plan-document";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const INPUT: PlanSessionInput = {
    title: "Tuesday Skills",
    durationMinutes: 60,
    date: "2026-10-06",
    startTime: "19:00",
    drills: [{ sequence: 0, duration: 10, runsWithPrevious: false, instructions: "Hard", name: "Breakout", description: null, playData: createEmptyPlayData() }],
};
const PLAN = serializePlan(INPUT, "openleague-hosted");

afterEach(() => {
    window.history.replaceState(null, "", "/");
});

function chooseFile(file: File) {
    fireEvent.change(screen.getByTestId("plan-file-input"), { target: { files: [file] } });
}

describe("planStartDate", () => {
    it("combines the plan's local date and start in the browser's zone", () => {
        expect(planStartDate(PLAN)).toEqual(new Date(2026, 9, 6, 19, 0));
    });

    it("uses midnight without a start, and now without a date", () => {
        const now = new Date("2026-10-03T12:00:00");
        expect(planStartDate(serializePlan({ ...INPUT, startTime: null }, "openleague-hosted"), now)).toEqual(new Date(2026, 9, 6, 0, 0));
        expect(planStartDate(serializePlan({ ...INPUT, date: null, startTime: null }, "openleague-hosted"), now)).toBe(now);
    });
});

describe("ImportScreen", () => {
    it("imports a plan file and opens the new practice", async () => {
        const { store } = memoryStore();
        renderScreen(<ImportScreen store={store} linkValue={null} />, store);
        expect(screen.getByText(PRIVACY_NOTE)).toBeInTheDocument();
        chooseFile(new File([JSON.stringify(PLAN)], "tuesday.olplan.json", { type: "application/json" }));
        expect(await screen.findByText("Tuesday Skills")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("checkbox", { name: /also add these drills to my library/i }));
        fireEvent.click(screen.getByRole("button", { name: /save to my practices/i }));
        await waitFor(() => expect(window.location.hash).toMatch(/^#\/sessions\/[^/]+$/));
        const library = await store.getPlaysByTeam({ teamId: "local", isTemplate: true, page: 1, limit: 20, dateFilter: "all" });
        expect(library.success && library.data.plays.map((p) => p.name)).toEqual(["Breakout"]);
    });

    it("shows the reason a file can't be imported", async () => {
        const { store } = memoryStore();
        renderScreen(<ImportScreen store={store} linkValue={null} />, store);
        chooseFile(new File(["not json"], "notes.txt"));
        expect(await screen.findByText(NOT_A_PLAN_MESSAGE)).toBeInTheDocument();
        chooseFile(new File(["a".repeat(MAX_PLAN_FILE_BYTES + 1)], "big.json"));
        expect(await screen.findByText(FILE_TOO_LARGE_MESSAGE)).toBeInTheDocument();
    });

    it("reads a #plan= link and takes the plan out of the address bar", async () => {
        const { store } = memoryStore();
        const value = await encodePlanLink(PLAN);
        window.history.replaceState(null, "", `/#plan=${value}`);
        renderScreen(<ImportScreen store={store} linkValue={value} />, store);
        expect(await screen.findByText("Tuesday Skills")).toBeInTheDocument();
        expect(window.location.hash).toBe("#/import");
    });

    it("shows a second link pasted into the open screen", async () => {
        const { store } = memoryStore();
        const first = await encodePlanLink(PLAN);
        const second = await encodePlanLink(serializePlan({ ...INPUT, title: "Thursday Skating" }, "openleague-hosted"));
        const view = renderScreen(<ImportScreen store={store} linkValue={first} />, store);
        expect(await screen.findByText("Tuesday Skills")).toBeInTheDocument();
        // The route flips to #/import: the screen keeps its plan.
        view.rerender(wrapScreen(<ImportScreen store={store} linkValue={null} />, store));
        expect(screen.getByText("Tuesday Skills")).toBeInTheDocument();
        // A new link pasted into the address bar replaces it.
        view.rerender(wrapScreen(<ImportScreen store={store} linkValue={second} />, store));
        expect(await screen.findByText("Thursday Skating")).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/apps/planner/editor-screens.test.tsx __tests__/apps/planner/import-screen.test.tsx`
Expected: FAIL — cannot resolve the screen modules.

- [ ] **Step 3: Shared screen pieces**

Create `apps/planner/src/screens/useStoreResult.ts`:

```ts
import { useEffect, useState } from "react";
import type { ActionResult } from "@/lib/planner-store";

export type LoadState<T> =
    | { kind: "loading" }
    | { kind: "error"; message: string; details?: unknown }
    | { kind: "ready"; data: T };

/** Runs a store read when `load` changes (memoize it with useCallback). Screens are keyed by id, so state resets per record. */
export function useStoreResult<T>(load: () => Promise<ActionResult<T>>): LoadState<T> {
    const [state, setState] = useState<LoadState<T>>({ kind: "loading" });
    useEffect(() => {
        let cancelled = false;
        load().then(
            (result) => {
                if (cancelled) return;
                setState(
                    result.success
                        ? { kind: "ready", data: result.data }
                        : { kind: "error", message: result.error, details: result.details },
                );
            },
            () => {
                if (!cancelled) setState({ kind: "error", message: "Something went wrong. Please try again." });
            },
        );
        return () => {
            cancelled = true;
        };
    }, [load]);
    return state;
}
```

Create `apps/planner/src/screens/StatusScreens.tsx`:

```tsx
import { Alert, Box, Button, CircularProgress, Stack } from "@mui/material";
import { ArrowBack as ArrowBackIcon } from "@mui/icons-material";
import { staticRoutes } from "../routes";

export const DRILL_NOT_ON_DEVICE_MESSAGE = "This drill isn't on this device.";

export function LoadingScreen() {
    return (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }} role="status" aria-label="Loading">
            <CircularProgress />
        </Box>
    );
}

export function MissingScreen({
    message,
    backHref = staticRoutes.list(),
    backLabel = "Back to practices",
}: {
    message: string;
    backHref?: string;
    backLabel?: string;
}) {
    return (
        <Stack spacing={2} alignItems="flex-start">
            <Alert severity="info" sx={{ alignSelf: "stretch" }}>
                {message}
            </Alert>
            <Button href={backHref} startIcon={<ArrowBackIcon />}>
                {backLabel}
            </Button>
        </Stack>
    );
}

export function NotFoundScreen() {
    return <MissingScreen message="This page doesn't exist." />;
}
```

- [ ] **Step 4: Session editor screen**

Create `apps/planner/src/screens/SessionEditorScreen.tsx`:

```tsx
/**
 * Static glue for PracticeSessionEditor: what PracticeSessionEditorWrapper and
 * EditSessionWrapper do for hosted, against the local store. No venue
 * booking (no venues are passed, so the fields render nothing) and no Share.
 */
import { useCallback } from "react";
import {
    PracticeSessionEditor,
    type PracticeSessionSaveResult,
    type PracticeSessionSubmitData,
} from "@/components/features/practice-planner/PracticeSessionEditor";
import { usePlannerPlatform } from "@/lib/planner-store";
import { LOCAL_TEAM_ID } from "../config";
import { staticRoutes } from "../routes";
import type { LocalPlannerStore, LocalSessionSave } from "../store/types";
import { LoadingScreen, MissingScreen } from "./StatusScreens";
import { useStoreResult } from "./useStoreResult";

export function toLocalSessionSave(session: PracticeSessionSubmitData): LocalSessionSave {
    return {
        title: session.title,
        date: session.date,
        duration: session.duration,
        plays: session.plays.map((play) => ({
            playId: play.playId,
            clientKey: play.id,
            sequence: play.sequence,
            runsWithPrevious: play.runsWithPrevious,
            duration: play.duration,
            instructions: play.instructions || "",
        })),
    };
}

export function SessionEditorScreen({ store, id }: { store: LocalPlannerStore; id?: string }) {
    return id ? <ExistingSessionEditor store={store} id={id} /> : <NewSessionEditor store={store} />;
}

function NewSessionEditor({ store }: { store: LocalPlannerStore }) {
    const { navigate } = usePlannerPlatform();
    const handleSave = useCallback(
        async (session: PracticeSessionSubmitData): Promise<PracticeSessionSaveResult> => {
            const result = await store.createSession(toLocalSessionSave(session));
            if (!result.success) return { success: false, error: result.error };
            // Diagram editing needs a saved session, so continue on its edit page (as hosted).
            navigate(staticRoutes.sessionEdit(result.data.id));
            return { success: true };
        },
        [store, navigate],
    );
    return <PracticeSessionEditor teamId={LOCAL_TEAM_ID} onSave={handleSave} onCancel={() => navigate(staticRoutes.list())} />;
}

function ExistingSessionEditor({ store, id }: { store: LocalPlannerStore; id: string }) {
    const { navigate } = usePlannerPlatform();
    const load = useCallback(() => store.getSessionForEdit(id), [store, id]);
    const state = useStoreResult(load);
    const handleSave = useCallback(
        async (session: PracticeSessionSubmitData): Promise<PracticeSessionSaveResult> => {
            const result = await store.updateSession(id, toLocalSessionSave(session));
            return result.success ? { success: true, plays: result.data.plays } : { success: false, error: result.error };
        },
        [store, id],
    );

    if (state.kind === "loading") return <LoadingScreen />;
    if (state.kind === "error") return <MissingScreen message={state.message} />;
    return (
        <PracticeSessionEditor
            sessionId={state.data.sessionId}
            teamId={LOCAL_TEAM_ID}
            initialData={state.data.initialData}
            onSave={handleSave}
            onCancel={() => navigate(staticRoutes.session(id))}
        />
    );
}
```

- [ ] **Step 5: Drill editor screen**

Create `apps/planner/src/screens/DrillEditorScreen.tsx`:

```tsx
/** Static glue for PlayEditor, as PlayEditorWrapper and the library edit page do for hosted. */
import { useCallback } from "react";
import { Alert, Button, Stack } from "@mui/material";
import { ArrowBack as ArrowBackIcon } from "@mui/icons-material";
import { PlayEditor } from "@/components/features/practice-planner/PlayEditor";
import { usePlannerPlatform } from "@/lib/planner-store";
import { PLAY_DATA_UNREADABLE_CODE } from "@/lib/utils/play-data";
import type { SavedPlay } from "@/types/practice-planner";
import { LOCAL_TEAM_ID } from "../config";
import { staticRoutes } from "../routes";
import type { LocalPlannerStore } from "../store/types";
import { DRILL_NOT_ON_DEVICE_MESSAGE, LoadingScreen, MissingScreen } from "./StatusScreens";
import { useStoreResult } from "./useStoreResult";

export function DrillEditorScreen({ store, id }: { store: LocalPlannerStore; id?: string }) {
    return id ? <ExistingDrill store={store} id={id} /> : <DrillEditor store={store} />;
}

function ExistingDrill({ store, id }: { store: LocalPlannerStore; id: string }) {
    const load = useCallback(() => store.getPlayById({ id, teamId: LOCAL_TEAM_ID }), [store, id]);
    const state = useStoreResult(load);
    if (state.kind === "loading") return <LoadingScreen />;
    if (state.kind === "error") {
        const unreadable = (state.details as { code?: string } | undefined)?.code === PLAY_DATA_UNREADABLE_CODE;
        if (!unreadable) {
            return <MissingScreen message={DRILL_NOT_ON_DEVICE_MESSAGE} backHref={staticRoutes.library()} backLabel="Back to the drill library" />;
        }
        return (
            <Stack spacing={2} alignItems="flex-start">
                <Alert severity="error" sx={{ alignSelf: "stretch" }}>
                    {state.message} Editing is disabled so the stored drawing isn&apos;t overwritten.
                </Alert>
                <Button href={staticRoutes.library()} startIcon={<ArrowBackIcon />}>
                    Back to the drill library
                </Button>
            </Stack>
        );
    }
    const play: SavedPlay = {
        id: state.data.id,
        name: state.data.name,
        description: state.data.description ?? "",
        thumbnail: state.data.thumbnail ?? "",
        playData: state.data.playData,
        isTemplate: state.data.isTemplate,
        createdAt: state.data.createdAt,
        updatedAt: state.data.updatedAt,
    };
    return <DrillEditor store={store} play={play} />;
}

function DrillEditor({ store, play }: { store: LocalPlannerStore; play?: SavedPlay }) {
    const { navigate } = usePlannerPlatform();
    const handleSave = useCallback(
        async (saved: SavedPlay) => {
            const fields = {
                name: saved.name,
                description: saved.description || undefined,
                thumbnail: saved.thumbnail || undefined,
                playData: saved.playData,
            };
            const result = play
                ? await store.updatePlay({ id: play.id, ...fields })
                : await store.createPlay({ ...fields, isTemplate: true, teamId: LOCAL_TEAM_ID });
            // PlayEditor catches this and shows the message.
            if (!result.success) throw new Error(result.error);
            // Edits autosave and stay; a new drill returns to the library (as hosted).
            if (!play) navigate(staticRoutes.library());
        },
        [store, play, navigate],
    );
    return (
        <PlayEditor
            teamId={LOCAL_TEAM_ID}
            playId={play?.id}
            initialData={play ?? { isTemplate: true }}
            lockTemplate
            onSave={handleSave}
            onCancel={() => navigate(staticRoutes.library())}
        />
    );
}
```

- [ ] **Step 6: Import screen**

Create `apps/planner/src/screens/ImportScreen.tsx`:

```tsx
/**
 * Import a practice plan into this browser (ADR-0020): a chosen file, or a
 * #plan= link from the hosted Export menu. The link is read once and the
 * address bar is replaced with #/import, so the plan never lingers in the
 * URL or history. One instance serves both routes (App keys it "import"), and
 * the pending link lives in state, so the URL change can't cancel decoding.
 */
import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Checkbox, FormControlLabel, Paper, Stack, Typography } from "@mui/material";
import { FileUploadOutlined as UploadIcon } from "@mui/icons-material";
import { PageHeader } from "@/components/ui/PageHeader";
import { PlanPreview } from "@/components/features/practice-planner/PlanPreview";
import { usePlannerPlatform } from "@/lib/planner-store";
import { readPlanFile, readPlanLink, type ParsePlanResult, type PlanDocument, type PlanError } from "@/lib/plan-document";
import { parseDateTimeLocalToUtc, resolveTimeZone } from "@/lib/utils/date";
import { PRIVACY_NOTE } from "../config";
import { staticRoutes } from "../routes";
import type { LocalPlannerStore } from "../store/types";

/** The plan's local date and start in this browser's zone; midnight without a start; now without a date. */
export function planStartDate(plan: PlanDocument, now: Date = new Date()): Date {
    const { date, startTime } = plan.session;
    if (!date) return now;
    return parseDateTimeLocalToUtc(`${date}T${startTime ?? "00:00"}`, resolveTimeZone(null)) ?? now;
}

type ViewState = { kind: "pick" } | { kind: "reading" } | { kind: "error"; error: PlanError } | { kind: "ready"; plan: PlanDocument };

function toViewState(result: ParsePlanResult): ViewState {
    return result.ok ? { kind: "ready", plan: result.plan } : { kind: "error", error: result.error };
}

export function ImportScreen({ store, linkValue }: { store: LocalPlannerStore; linkValue: string | null }) {
    const { navigate } = usePlannerPlatform();
    const fileInput = useRef<HTMLInputElement>(null);
    const [pending, setPending] = useState<string | null>(linkValue);
    const [state, setState] = useState<ViewState>(linkValue ? { kind: "reading" } : { kind: "pick" });
    // A newly pasted link replaces the current one (adjusting state during render, not in an effect).
    if (linkValue && linkValue !== pending) {
        setPending(linkValue);
        setState({ kind: "reading" });
    }
    const [addToLibrary, setAddToLibrary] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    useEffect(() => {
        if (!pending) return;
        // The plan must not linger in the address bar or history (no hashchange fires).
        window.history.replaceState(window.history.state, "", staticRoutes.importPlan());
        let cancelled = false;
        void readPlanLink(pending).then((result) => {
            if (!cancelled) setState(toViewState(result));
        });
        return () => {
            cancelled = true;
        };
    }, [pending]);

    const chooseFile = () => fileInput.current?.click();

    const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = ""; // choosing the same file again still fires change
        if (!file) return;
        setSaveError(null);
        setState(toViewState(await readPlanFile(file)));
    };

    const save = async (plan: PlanDocument) => {
        setSaving(true);
        setSaveError(null);
        const result = await store.importPlan(plan, { date: planStartDate(plan), addToLibrary });
        setSaving(false);
        if (!result.success) {
            setSaveError(result.error);
            return;
        }
        navigate(staticRoutes.session(result.data.sessionId));
    };

    return (
        <>
            <PageHeader title="Import a practice plan" subtitle="Open a plan file, or a link from OpenLeague." />
            <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                hidden
                data-testid="plan-file-input"
                onChange={(event) => void onFile(event)}
            />
            <Stack spacing={2}>
                {state.kind === "pick" && (
                    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
                        <Typography sx={{ mb: 2 }}>Choose a plan file (.olplan.json) exported from OpenLeague or this planner.</Typography>
                        <Button variant="contained" startIcon={<UploadIcon />} onClick={chooseFile}>
                            Choose plan file
                        </Button>
                    </Paper>
                )}

                {state.kind === "reading" && <Typography color="text.secondary">Reading the plan…</Typography>}

                {state.kind === "error" && (
                    <Alert
                        severity="error"
                        action={
                            <Button color="inherit" size="small" onClick={chooseFile}>
                                Choose another file
                            </Button>
                        }
                    >
                        <Typography fontWeight={600}>{state.error.message}</Typography>
                        {state.error.issues && state.error.issues.length > 0 && (
                            <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5 }}>
                                {state.error.issues.map((issue, index) => (
                                    <li key={index}>{issue}</li>
                                ))}
                            </Box>
                        )}
                    </Alert>
                )}

                {state.kind === "ready" && (
                    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
                        <PlanPreview plan={state.plan} />
                        <FormControlLabel
                            sx={{ mt: 2 }}
                            control={<Checkbox checked={addToLibrary} onChange={(event) => setAddToLibrary(event.target.checked)} />}
                            label="Also add these drills to my library"
                        />
                        {saveError && (
                            <Alert severity="error" sx={{ mt: 2 }}>
                                {saveError}
                            </Alert>
                        )}
                        <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
                            <Button variant="contained" disabled={saving} onClick={() => void save(state.plan)}>
                                {saving ? "Saving…" : "Save to my practices"}
                            </Button>
                            <Button onClick={chooseFile} disabled={saving}>
                                Choose another file
                            </Button>
                        </Stack>
                    </Paper>
                )}

                <Typography variant="body2" color="text.secondary">
                    {PRIVACY_NOTE}
                </Typography>
            </Stack>
        </>
    );
}
```

- [ ] **Step 7: Run the tests**

Run: `bun run test __tests__/apps/planner/editor-screens.test.tsx __tests__/apps/planner/import-screen.test.tsx`
Expected: PASS. If the preview renders the title more than once, change the affected `findByText("…")` to `findAllByText("…")` and assert `length > 0`; do not change product code to satisfy a query.

Run: `bun run type-check && bunx eslint apps/planner`
Expected: PASS (warnings from the demoted React Compiler rules are acceptable; errors are not).

If `bunx eslint apps/planner/src/screens/ImportScreen.tsx` reports an **error** from a `react-hooks/*` rule on the adjust-during-render block (`if (linkValue && linkValue !== pending) { … }`), replace that block with

```tsx
    useEffect(() => {
        if (!linkValue) return;
        setPending(linkValue);
        setState({ kind: "reading" });
    }, [linkValue]);
```

(placed before the `[pending]` effect). It trips only `react-hooks/set-state-in-effect`, which is warn-level here, and the screen still never remounts or cancels decoding because `pending` keeps its value when `linkValue` returns to `null`. Re-run this task's tests.

- [ ] **Step 8: Commit**

```bash
/usr/bin/git add apps/planner/src/screens __tests__/apps/planner/render-screen.tsx __tests__/apps/planner/editor-screens.test.tsx __tests__/apps/planner/import-screen.test.tsx
/usr/bin/git commit -m "feat(practice-planner): static planner editor and plan import screens

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 7: App frame, read screens, boot and the first build

**Files:**
- Create: `apps/planner/index.html`, `apps/planner/src/static.css`, `apps/planner/src/theme.tsx`, `apps/planner/src/store/open-store.ts`, `apps/planner/src/screens/AppShell.tsx`, `apps/planner/src/screens/SessionListScreen.tsx`, `apps/planner/src/screens/SessionDetailScreen.tsx`, `apps/planner/src/screens/BenchSheetScreen.tsx`, `apps/planner/src/screens/LibraryScreen.tsx`, `apps/planner/src/App.tsx`, `apps/planner/src/main.tsx`
- Modify: `__tests__/lib/planner-store/portability.test.ts` (`ENTRIES`)
- Test: `__tests__/apps/planner/app.test.tsx`, `__tests__/apps/planner/open-store.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `open-store.ts`: `StaleSignal { subscribe(listener): () => void; isStale(): boolean; markStale(): void }`, `createStaleSignal()`, `openPlannerStore(options?: { open?: () => Promise<PlannerRepo>; stale?: StaleSignal; storeOptions?: LocalStoreOptions }): Promise<{ store: LocalPlannerStore; durable: boolean }>`.
  - `AppShell.tsx`: `AppShell({ durable, stale, children })`, `NOT_SAVING_MESSAGE`, `STALE_TAB_MESSAGE`.
  - `App.tsx`: `PlannerApp({ store, durable, stale })`, `CRASH_MESSAGE`.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/apps/planner/open-store.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createStaleSignal, openPlannerStore } from "@/apps/planner/src/store/open-store";
import { createMemoryRepo } from "@/apps/planner/src/store/memory-repo";
import { StorageBlockedError } from "@/apps/planner/src/store/idb-repo";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";

const QUERY = { teamId: "local", isTemplate: true, page: 1, limit: 100, dateFilter: "all" as const };

describe("openPlannerStore", () => {
    it("uses the opened repo and seeds the starter drills", async () => {
        const { store, durable } = await openPlannerStore({ open: async () => ({ ...createMemoryRepo(), durable: true }) });
        expect(durable).toBe(true);
        const library = await store.getPlaysByTeam(QUERY);
        expect(library.success && library.data.total).toBe(STARTER_PLAYS.length);
    });

    it("falls back to memory when IndexedDB fails to open", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const { store, durable } = await openPlannerStore({ open: () => Promise.reject(new Error("SecurityError")) });
        expect(durable).toBe(false);
        expect((await store.listSessions()).success).toBe(true);
        error.mockRestore();
    });

    it("marks the tab stale when an older tab blocks the upgrade", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const stale = createStaleSignal();
        await openPlannerStore({ open: () => Promise.reject(new StorageBlockedError()), stale });
        expect(stale.isStale()).toBe(true);
        error.mockRestore();
    });
});

describe("createStaleSignal", () => {
    it("notifies subscribers once", () => {
        const stale = createStaleSignal();
        const listener = vi.fn();
        stale.subscribe(listener);
        stale.markStale();
        stale.markStale();
        expect(stale.isStale()).toBe(true);
        expect(listener).toHaveBeenCalledTimes(1);
    });
});
```

Create `__tests__/apps/planner/app.test.tsx`:

```tsx
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act as rtlAct, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PlannerApp } from "@/apps/planner/src/App";
import { NOT_SAVING_MESSAGE, STALE_TAB_MESSAGE } from "@/apps/planner/src/screens/AppShell";
import { createStaleSignal } from "@/apps/planner/src/store/open-store";
import { SESSION_NOT_ON_DEVICE_MESSAGE } from "@/apps/planner/src/store/sessions";
import { memoryStore } from "./render-screen";
import { encodePlanLink, serializePlan } from "@/lib/plan-document";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import { createEmptyPlayData } from "@/lib/utils/play-data";

afterEach(() => {
    window.history.replaceState(null, "", "/");
});

async function savedSession(store: ReturnType<typeof memoryStore>["store"], title = "Tuesday Skills") {
    const created = await store.createSession({ title, date: new Date("2026-10-06T19:00:00"), duration: 60, plays: [] });
    if (!created.success) throw new Error(created.error);
    return created.data.id;
}

function app(store: ReturnType<typeof memoryStore>["store"], durable = true, stale = createStaleSignal()) {
    return <PlannerApp store={store} durable={durable} stale={stale} />;
}

describe("PlannerApp", () => {
    it("shows the empty practice list with both actions", async () => {
        const { store } = memoryStore();
        render(app(store));
        expect(await screen.findByText("Plan your first practice")).toBeInTheDocument();
        expect(screen.getAllByRole("link", { name: /new practice/i })[0]).toHaveAttribute("href", "#/sessions/new");
        expect(screen.getAllByRole("link", { name: /import plan/i })[0]).toHaveAttribute("href", "#/import");
    });

    it("lists saved practices linking to their detail", async () => {
        const { store } = memoryStore();
        const id = await savedSession(store);
        render(app(store));
        const card = await screen.findByRole("link", { name: /tuesday skills/i });
        expect(card).toHaveAttribute("href", `#/sessions/${id}`);
    });

    it("keeps store identity across re-renders: one list load, one library load", async () => {
        const { store } = memoryStore();
        const stale = createStaleSignal();
        const list = vi.spyOn(store, "listSessions");
        const view = render(app(store, true, stale));
        await screen.findByText("Plan your first practice");
        view.rerender(app(store, true, stale));
        await screen.findByText("Plan your first practice");
        expect(list).toHaveBeenCalledTimes(1);

        const plays = vi.spyOn(store, "getPlaysByTeam");
        await rtlAct(async () => {
            window.location.hash = "#/library";
            window.dispatchEvent(new HashChangeEvent("hashchange"));
        });
        await screen.findByRole("heading", { name: "Drill library" });
        view.rerender(app(store, true, stale));
        await waitFor(() => expect(plays).toHaveBeenCalledTimes(1));
    });

    it("shows a session's detail without team sharing", async () => {
        const { store } = memoryStore();
        const id = await savedSession(store);
        window.location.hash = `#/sessions/${id}`;
        render(app(store));
        expect(await screen.findByRole("heading", { name: "Tuesday Skills" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^share$/i })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Export plan" })).toBeInTheDocument();
    });

    it("says when a session isn't on this device", async () => {
        const { store } = memoryStore();
        window.location.hash = "#/sessions/missing";
        render(app(store));
        expect(await screen.findByText(SESSION_NOT_ON_DEVICE_MESSAGE)).toBeInTheDocument();
    });

    it("renders the bench sheet without the app chrome", async () => {
        const { store } = memoryStore();
        const id = await savedSession(store);
        window.location.hash = `#/sessions/${id}/print`;
        render(app(store));
        expect(await screen.findByRole("link", { name: /back to session/i })).toHaveAttribute("href", `#/sessions/${id}`);
        expect(screen.queryByText("OpenLeague Planner")).not.toBeInTheDocument();
    });

    it("shows the seeded starter drills in the library", async () => {
        const { store } = memoryStore();
        await store.seedStarterDrills();
        window.location.hash = "#/library";
        render(app(store));
        expect(await screen.findByText(STARTER_PLAYS[0].name)).toBeInTheDocument();
    });

    it("opens a #plan= link under StrictMode and lands on the new session", async () => {
        const { store } = memoryStore();
        const plan = serializePlan(
            {
                title: "Linked Practice",
                durationMinutes: 60,
                date: "2026-10-06",
                startTime: "19:00",
                drills: [{ sequence: 0, duration: 10, runsWithPrevious: false, instructions: null, name: "Breakout", description: null, playData: createEmptyPlayData() }],
            },
            "openleague-hosted",
        );
        window.history.replaceState(null, "", `/#plan=${await encodePlanLink(plan)}`);
        render(<StrictMode>{app(store)}</StrictMode>);
        expect(await screen.findByText("Linked Practice")).toBeInTheDocument();
        expect(window.location.hash).toBe("#/import");
        fireEvent.click(screen.getByRole("button", { name: /save to my practices/i }));
        await waitFor(() => expect(window.location.hash).toMatch(/^#\/sessions\/[^/]+$/));
        expect(await screen.findByRole("heading", { name: "Linked Practice" })).toBeInTheDocument();
    });

    it("warns when the browser isn't letting the planner save", async () => {
        const { store } = memoryStore();
        render(app(store, false));
        expect(await screen.findByText(NOT_SAVING_MESSAGE)).toBeInTheDocument();
    });

    it("asks for a reload when another tab upgraded the planner", async () => {
        const { store } = memoryStore();
        const stale = createStaleSignal();
        render(app(store, true, stale));
        await screen.findByText("Plan your first practice");
        rtlAct(() => stale.markStale());
        expect(await screen.findByText(STALE_TAB_MESSAGE)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    });
});
```

In `__tests__/lib/planner-store/portability.test.ts`, add to `ENTRIES` after `"lib/planner-store/index.ts",`:

```ts
    // The static planner's whole bundle (sub-project 3).
    "apps/planner/src/main.tsx",
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/apps/planner/app.test.tsx __tests__/apps/planner/open-store.test.ts __tests__/lib/planner-store/portability.test.ts`
Expected: FAIL — `App`, `open-store` and `main.tsx` don't exist.

- [ ] **Step 3: Page, base styles and theme**

Create `apps/planner/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0D47A1" />
    <meta name="referrer" content="no-referrer" />
    <meta
      name="description"
      content="A free practice planner for coaches: draw drills, build practices and print bench sheets. Everything stays in your browser."
    />
    <title>OpenLeague Planner</title>
    <link rel="stylesheet" href="https://api.fontshare.com/css?f[]=cabinet-grotesk@100,200,300,400,500,600,700,800,900" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap" />
  </head>
  <body>
    <noscript>The OpenLeague Planner needs JavaScript.</noscript>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

Create `apps/planner/src/static.css`:

```css
/* Static planner base (ADR-0020). lib/theme.ts does the rest; these mirror app/globals.css. */
:root {
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
}

html,
body {
  max-width: 100vw;
  overflow-x: hidden;
}

a {
  color: inherit;
  text-decoration: none;
}
```

Create `apps/planner/src/theme.tsx`:

```tsx
/**
 * The hosted ThemeProvider minus its Next-only parts: no AppRouterCacheProvider
 * (Next), no InitColorSchemeScript (an inline pre-paint script for SSR, which
 * the CSP forbids and a client-rendered app doesn't need).
 */
import type { ReactNode } from "react";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import theme from "@/lib/theme";

export function StaticThemeProvider({ children }: { children: ReactNode }) {
    return (
        <ThemeProvider theme={theme} defaultMode="system" disableTransitionOnChange>
            {/* PracticeSessionEditor's DateTimePicker needs the adapter. */}
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <CssBaseline />
                {children}
            </LocalizationProvider>
        </ThemeProvider>
    );
}
```

- [ ] **Step 4: Opening storage**

Create `apps/planner/src/store/open-store.ts`:

```ts
/**
 * Boot-time storage (ADR-0020): IndexedDB when the browser allows it, else the
 * in-memory fallback (the shell warns). Seeds the starter drills once.
 */
import { StorageBlockedError, openIdbRepo } from "./idb-repo";
import { createLocalPlannerStore } from "./local-store";
import { createMemoryRepo } from "./memory-repo";
import type { PlannerRepo } from "./records";
import type { LocalPlannerStore, LocalStoreOptions } from "./types";

/** Set when another tab upgraded (or holds) the database: this tab must reload. */
export interface StaleSignal {
    subscribe: (listener: () => void) => () => void;
    isStale: () => boolean;
    markStale: () => void;
}

export function createStaleSignal(): StaleSignal {
    let stale = false;
    const listeners = new Set<() => void>();
    return {
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        isStale: () => stale,
        markStale: () => {
            if (stale) return;
            stale = true;
            for (const listener of listeners) listener();
        },
    };
}

export interface OpenStoreOptions {
    open?: () => Promise<PlannerRepo>;
    stale?: StaleSignal;
    storeOptions?: LocalStoreOptions;
}

export async function openPlannerStore({ open, stale, storeOptions }: OpenStoreOptions = {}): Promise<{ store: LocalPlannerStore; durable: boolean }> {
    let repo: PlannerRepo;
    try {
        repo = await (open ?? (() => openIdbRepo({ onVersionChange: () => stale?.markStale() })))();
    } catch (error) {
        if (error instanceof StorageBlockedError) stale?.markStale();
        console.error("The planner can't use IndexedDB here; keeping work in memory for this tab:", error);
        repo = createMemoryRepo();
    }
    const store = createLocalPlannerStore(repo, storeOptions);
    try {
        await store.seedStarterDrills();
    } catch (error) {
        console.error("Couldn't add the starter drills:", error);
    }
    return { store, durable: repo.durable };
}
```

- [ ] **Step 5: Shell and read screens**

Create `apps/planner/src/screens/AppShell.tsx`:

```tsx
/**
 * The static planner's chrome: a League Blue bar, the storage banners, a
 * playbook-grid canvas and the privacy footer.
 */
import { useSyncExternalStore, type ReactNode } from "react";
import { Alert, AppBar, Box, Button, Container, Link, Stack, Toolbar, Typography } from "@mui/material";
import { HOSTED_URL, PRIVACY_NOTE } from "../config";
import { staticRoutes } from "../routes";
import type { StaleSignal } from "../store/open-store";

export const NOT_SAVING_MESSAGE =
    "This browser isn't letting the planner save. Your work will be lost when you close this tab. Download plan files to keep it.";
export const STALE_TAB_MESSAGE = "The planner was updated in another tab. Reload to continue.";

export function AppShell({ durable, stale, children }: { durable: boolean; stale: StaleSignal; children: ReactNode }) {
    const isStale = useSyncExternalStore(stale.subscribe, stale.isStale, () => false);
    return (
        <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", bgcolor: "background.default" }}>
            <AppBar
                position="sticky"
                elevation={0}
                sx={{ borderBottom: "4px solid", borderImage: "linear-gradient(90deg, #0D47A1 0%, #1976D2 50%, #42A5F5 100%) 1" }}
            >
                <Toolbar sx={{ gap: 1, flexWrap: "wrap", py: { xs: 1, sm: 0 } }}>
                    <Typography
                        component="a"
                        href={staticRoutes.list()}
                        variant="h6"
                        sx={{ fontWeight: 800, letterSpacing: "-0.02em", color: "inherit", flexGrow: 1 }}
                    >
                        OpenLeague Planner
                    </Typography>
                    <Button color="inherit" href={staticRoutes.list()}>
                        Practices
                    </Button>
                    <Button color="inherit" href={staticRoutes.library()}>
                        Drill library
                    </Button>
                    <Button color="inherit" href={staticRoutes.importPlan()}>
                        Import
                    </Button>
                </Toolbar>
            </AppBar>
            {!durable && (
                <Alert severity="warning" square>
                    {NOT_SAVING_MESSAGE}
                </Alert>
            )}
            {isStale && (
                <Alert
                    severity="info"
                    square
                    action={
                        <Button color="inherit" size="small" onClick={() => window.location.reload()}>
                            Reload
                        </Button>
                    }
                >
                    {STALE_TAB_MESSAGE}
                </Alert>
            )}
            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    backgroundImage:
                        "linear-gradient(rgba(13, 71, 161, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(13, 71, 161, 0.04) 1px, transparent 1px)",
                    backgroundSize: "24px 24px",
                }}
            >
                <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 3 } }}>
                    {children}
                </Container>
            </Box>
            <Box component="footer" sx={{ borderTop: 1, borderColor: "divider", py: 2 }}>
                <Container maxWidth="lg">
                    <Stack spacing={0.5}>
                        <Typography variant="body2" color="text.secondary">
                            {PRIVACY_NOTE}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Team sharing, RSVPs and venue booking live in{" "}
                            <Link href={HOSTED_URL} underline="always">
                                OpenLeague
                            </Link>
                            .
                        </Typography>
                    </Stack>
                </Container>
            </Box>
        </Box>
    );
}
```

Create `apps/planner/src/screens/SessionListScreen.tsx`:

```tsx
import { useCallback } from "react";
import { Alert, Button, Card, CardActionArea, CardContent, Stack, Typography } from "@mui/material";
import { Add as AddIcon, FileUploadOutlined as UploadIcon, SportsHockey as HockeyIcon } from "@mui/icons-material";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatClockTime, formatLongDate } from "@/lib/utils/date";
import { PRIVACY_NOTE } from "../config";
import { staticRoutes } from "../routes";
import type { LocalPlannerStore } from "../store/types";
import { LoadingScreen } from "./StatusScreens";
import { useStoreResult } from "./useStoreResult";

function Actions() {
    return (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button variant="contained" startIcon={<AddIcon />} href={staticRoutes.sessionNew()}>
                New practice
            </Button>
            <Button variant="outlined" startIcon={<UploadIcon />} href={staticRoutes.importPlan()}>
                Import plan
            </Button>
        </Stack>
    );
}

export function SessionListScreen({ store }: { store: LocalPlannerStore }) {
    const load = useCallback(() => store.listSessions(), [store]);
    const state = useStoreResult(load);

    if (state.kind === "loading") return <LoadingScreen />;
    if (state.kind === "error") return <Alert severity="error">{state.message}</Alert>;
    if (state.data.length === 0) {
        return (
            <EmptyState
                icon={<HockeyIcon sx={{ fontSize: 48 }} />}
                title="Plan your first practice"
                description={`Build a practice from drills, print a bench sheet, and share it as a file. ${PRIVACY_NOTE}`}
                action={<Actions />}
            />
        );
    }
    return (
        <>
            <PageHeader title="Practices" subtitle="Saved in this browser" actions={<Actions />} />
            <Stack spacing={1.5}>
                {state.data.map((session) => (
                    <Card key={session.id} variant="outlined">
                        <CardActionArea href={staticRoutes.session(session.id)}>
                            <CardContent>
                                <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
                                    {session.title}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {formatLongDate(session.date)} · {formatClockTime(session.date)} · {session.duration} min ·{" "}
                                    {session.drillCount} drill{session.drillCount === 1 ? "" : "s"}
                                </Typography>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                ))}
            </Stack>
        </>
    );
}
```

Create `apps/planner/src/screens/SessionDetailScreen.tsx`:

```tsx
import { useCallback } from "react";
import { SessionDetailView } from "@/app/(dashboard)/practice-planner/[sessionId]/SessionDetailView";
import type { LocalPlannerStore } from "../store/types";
import { LoadingScreen, MissingScreen } from "./StatusScreens";
import { useStoreResult } from "./useStoreResult";

/** Everything on this device is the coach's own, so the admin controls show (Share stays hidden: no sharePracticeSession). */
export function SessionDetailScreen({ store, id }: { store: LocalPlannerStore; id: string }) {
    const load = useCallback(() => store.getSessionView(id), [store, id]);
    const state = useStoreResult(load);
    if (state.kind === "loading") return <LoadingScreen />;
    if (state.kind === "error") return <MissingScreen message={state.message} />;
    return <SessionDetailView session={state.data} isAdmin />;
}
```

Create `apps/planner/src/screens/BenchSheetScreen.tsx`:

```tsx
/** The bench sheet print surface: no chrome, pinned light, with the hosted print stylesheet. */
import { useCallback } from "react";
import { Box } from "@mui/material";
import LightThemeScope from "@/components/ui/LightThemeScope";
import { BenchSheet } from "@/components/features/practice-planner/print/BenchSheet";
import "@/app/(print)/print.css";
import type { LocalPlannerStore } from "../store/types";
import { LoadingScreen, MissingScreen } from "./StatusScreens";
import { useStoreResult } from "./useStoreResult";

export function BenchSheetScreen({ store, id }: { store: LocalPlannerStore; id: string }) {
    const load = useCallback(() => store.getSessionView(id), [store, id]);
    const state = useStoreResult(load);
    return (
        <LightThemeScope component="main" className="bench-print-root" sx={{ minHeight: "100vh", bgcolor: "#fff", color: "#000" }}>
            {state.kind === "ready" ? (
                <BenchSheet session={state.data} />
            ) : (
                <Box sx={{ p: 3 }}>{state.kind === "loading" ? <LoadingScreen /> : <MissingScreen message={state.message} />}</Box>
            )}
        </LightThemeScope>
    );
}
```

Create `apps/planner/src/screens/LibraryScreen.tsx`:

```tsx
import { PageHeader } from "@/components/ui/PageHeader";
import { PlayLibrary } from "@/components/features/practice-planner/PlayLibrary";
import { LOCAL_TEAM_ID } from "../config";

export function LibraryScreen() {
    return (
        <>
            <PageHeader title="Drill library" subtitle="Your drills, plus starter drills to copy and change." />
            <PlayLibrary teamId={LOCAL_TEAM_ID} mode="manage" />
        </>
    );
}
```

- [ ] **Step 6: The app and boot**

Create `apps/planner/src/App.tsx`:

```tsx
/**
 * The static planner (ADR-0020). The store comes in as a prop, created once
 * in main.tsx, and the platform is a module constant, so neither identity
 * changes between renders (PlayLibrary's loadPlays depends on the store).
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Alert, Box, Button } from "@mui/material";
import { PlannerProvider } from "@/lib/planner-store";
import { staticPlannerPlatform, useHashRoute } from "./platform";
import type { StaticRoute } from "./routes";
import type { StaleSignal } from "./store/open-store";
import type { LocalPlannerStore } from "./store/types";
import { StaticThemeProvider } from "./theme";
import { AppShell } from "./screens/AppShell";
import { BenchSheetScreen } from "./screens/BenchSheetScreen";
import { DrillEditorScreen } from "./screens/DrillEditorScreen";
import { ImportScreen } from "./screens/ImportScreen";
import { LibraryScreen } from "./screens/LibraryScreen";
import { SessionDetailScreen } from "./screens/SessionDetailScreen";
import { SessionEditorScreen } from "./screens/SessionEditorScreen";
import { SessionListScreen } from "./screens/SessionListScreen";
import { NotFoundScreen } from "./screens/StatusScreens";

export const CRASH_MESSAGE = "Something went wrong. Your saved practices are safe in this browser.";

class RootErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error: unknown, info: ErrorInfo) {
        console.error("Planner crashed:", error, info.componentStack);
    }

    render() {
        if (!this.state.failed) return this.props.children;
        return (
            <Box sx={{ p: 3 }}>
                <Alert
                    severity="error"
                    action={
                        <Button color="inherit" size="small" onClick={() => window.location.reload()}>
                            Reload
                        </Button>
                    }
                >
                    {CRASH_MESSAGE}
                </Alert>
            </Box>
        );
    }
}

function RouteView({ route, store }: { route: StaticRoute; store: LocalPlannerStore }) {
    switch (route.name) {
        case "list":
            return <SessionListScreen store={store} />;
        case "sessionNew":
            return <SessionEditorScreen key="new" store={store} />;
        case "sessionEdit":
            return <SessionEditorScreen key={route.id} store={store} id={route.id} />;
        case "session":
            return <SessionDetailScreen key={route.id} store={store} id={route.id} />;
        case "library":
            return <LibraryScreen />;
        case "libraryNew":
            return <DrillEditorScreen key="new" store={store} />;
        case "libraryEdit":
            return <DrillEditorScreen key={route.id} store={store} id={route.id} />;
        case "import":
        case "planLink":
            // One key for both: replacing #plan=… with #/import must not remount the screen.
            return <ImportScreen key="import" store={store} linkValue={route.name === "planLink" ? route.value : null} />;
        default:
            return <NotFoundScreen />;
    }
}

export interface PlannerAppProps {
    store: LocalPlannerStore;
    durable: boolean;
    stale: StaleSignal;
}

export function PlannerApp({ store, durable, stale }: PlannerAppProps) {
    const route = useHashRoute();
    return (
        <StaticThemeProvider>
            <RootErrorBoundary>
                <PlannerProvider store={store} platform={staticPlannerPlatform}>
                    {route.name === "sessionPrint" ? (
                        <BenchSheetScreen key={route.id} store={store} id={route.id} />
                    ) : (
                        <AppShell durable={durable} stale={stale}>
                            <RouteView route={route} store={store} />
                        </AppShell>
                    )}
                </PlannerProvider>
            </RootErrorBoundary>
        </StaticThemeProvider>
    );
}
```

Create `apps/planner/src/main.tsx`:

```tsx
/** Boot: open storage, seed starters, create the store once, render once. */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { generateThumbnail } from "@/lib/utils/canvas/thumbnail-generator";
import { PlannerApp } from "./App";
import { createStaleSignal, openPlannerStore } from "./store/open-store";
import "./static.css";

async function boot(): Promise<void> {
    const container = document.getElementById("root");
    if (!container) throw new Error("index.html has no #root");
    const stale = createStaleSignal();
    const { store, durable } = await openPlannerStore({
        stale,
        storeOptions: { makeThumbnail: (playData) => generateThumbnail(playData) },
    });
    createRoot(container).render(
        <StrictMode>
            <PlannerApp store={store} durable={durable} stale={stale} />
        </StrictMode>,
    );
}

void boot();
```

- [ ] **Step 7: Run the tests**

Run: `bun run test __tests__/apps/planner __tests__/lib/planner-store/portability.test.ts`
Expected: PASS. The portability walk now reaches the static bundle and reports no violations.

- [ ] **Step 8: First build and a manual check**

Run: `bun run planner:build`
Expected: exits 0 and writes `dist/planner/index.html` plus `dist/planner/assets/*.js`. A Rollup chunk-size warning is acceptable.

Run: `grep -c 'http-equiv="Content-Security-Policy"' dist/planner/index.html && grep -c 'src="./assets/' dist/planner/index.html`
Expected: both print `1`.

Run (manual): `bun run planner:preview`, open the printed URL, and confirm: Cabinet Grotesk and JetBrains Mono load (Network tab: both stylesheets and their font files return 200 with `no-referrer`); the starter drills are in the library; a new practice saves and survives a reload; Print opens the bench sheet in a new tab; Export → Download writes a `.olplan.json`; importing that file creates a second practice; the browser console has no CSP errors. Stop the preview server.

Run: `bun run type-check && bunx eslint apps/planner __tests__/apps/planner`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
/usr/bin/git add apps/planner __tests__/apps/planner __tests__/lib/planner-store/portability.test.ts
/usr/bin/git commit -m "feat(practice-planner): static planner app shell, screens and boot

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 8: Bundle check, Pages deploy and CI

**Files:**
- Create: `scripts/check-planner-build.ts`
- Modify: `package.json` (`planner:check`, `deployment:check`)
- Modify: `.github/workflows/docs-pages.yml`, `.github/workflows/quality-gates.yml`, `.github/workflows/deployment-checks.yml`
- Modify: `.env.example` (planner URL comment), `CLAUDE.md` (structure + commands)
- Test: `__tests__/scripts/check-planner-build.test.ts`

**Interfaces:**
- Produces: `checkPlannerBuild(outDir: string): Promise<string[]>`, `unguardedProcessEnvCount(text: string): number`, `FORBIDDEN_IN_BUNDLE`, `REQUIRED_IN_BUNDLE`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/scripts/check-planner-build.test.ts`:

```ts
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkPlannerBuild, unguardedProcessEnvCount } from "@/scripts/check-planner-build";

const GOOD_HTML =
    '<html><head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'">' +
    '<script type="module" src="./assets/index-abc.js"></script></head><body></body></html>';
const GOOD_JS = 'const FORMAT = "openleague.practice-plan"; export {};';

async function fixture(files: Record<string, string>): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "planner-build-"));
    for (const [name, text] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
        await writeFile(path.join(dir, name), text);
    }
    return dir;
}

describe("checkPlannerBuild", () => {
    it("passes a relative, CSP-protected, telemetry-free bundle", async () => {
        expect(await checkPlannerBuild(await fixture({ "index.html": GOOD_HTML, "assets/index-abc.js": GOOD_JS }))).toEqual([]);
    });

    it("fails when nothing was built", async () => {
        const problems = await checkPlannerBuild(await fixture({}));
        expect(problems[0]).toMatch(/index\.html is missing/);
    });

    it("fails on absolute asset URLs and a missing CSP", async () => {
        const html = '<html><head><script type="module" src="/assets/index.js"></script></head></html>';
        const problems = await checkPlannerBuild(await fixture({ "index.html": html, "assets/index.js": GOOD_JS }));
        expect(problems).toEqual(
            expect.arrayContaining([expect.stringMatching(/absolute \/assets\//), expect.stringMatching(/Content-Security-Policy/)]),
        );
    });

    it.each([
        ['fetch("https://o1.ingest.sentry.io/api")', "ingest.sentry"],
        ['load("https://www.googletagmanager.com/gtag/js")', "googletagmanager.com"],
        ["const u = window.__NEXT_DATA__;", "__NEXT_DATA__"],
        ['const k = "NEXT_PUBLIC_X";', "NEXT_PUBLIC_"],
    ])("fails on %s", async (snippet, pattern) => {
        const problems = await checkPlannerBuild(await fixture({ "index.html": GOOD_HTML, "assets/a.js": `${GOOD_JS}\n${snippet}` }));
        expect(problems.join("\n")).toContain(pattern);
    });

    it("fails on an unguarded process.env read, but not a guarded one", async () => {
        const guarded = 'const m = typeof process !== "undefined" && process.env.DEBUG;';
        expect(await checkPlannerBuild(await fixture({ "index.html": GOOD_HTML, "assets/a.js": `${GOOD_JS}\n${guarded}` }))).toEqual([]);
        const bare = "const m = process.env.DEBUG;";
        const problems = await checkPlannerBuild(await fixture({ "index.html": GOOD_HTML, "assets/a.js": `${GOOD_JS}\n${bare}` }));
        expect(problems.join("\n")).toMatch(/process\.env/);
    });

    it("fails when the plan-document module is missing from the bundle", async () => {
        const problems = await checkPlannerBuild(await fixture({ "index.html": GOOD_HTML, "assets/a.js": "export {};" }));
        expect(problems.join("\n")).toMatch(/openleague\.practice-plan/);
    });
});

describe("unguardedProcessEnvCount", () => {
    it("counts only reads without a typeof process guard just before them", () => {
        expect(unguardedProcessEnvCount("process.env.A; x; process.env.B")).toBe(2);
        expect(unguardedProcessEnvCount('typeof process !== "undefined" && process.env.A')).toBe(0);
        expect(unguardedProcessEnvCount("globalThis.process?.env.A")).toBe(0);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test __tests__/scripts/check-planner-build.test.ts`
Expected: FAIL — cannot resolve `@/scripts/check-planner-build`.

- [ ] **Step 3: The checker**

Create `scripts/check-planner-build.ts`:

```ts
/**
 * Checks dist/planner after `bun run planner:build` (ADR-0020): the static
 * planner must work from any subfolder, carry its CSP, contain no Next.js
 * runtime or unguarded process.env (both crash or bloat a browser-only
 * bundle), contain no telemetry, and actually include the plan format.
 */
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const FORBIDDEN_IN_BUNDLE: ReadonlyArray<{ pattern: string; reason: string }> = [
    { pattern: "NEXT_PUBLIC_", reason: "a Next.js environment variable reached the static bundle" },
    { pattern: "__NEXT_DATA__", reason: "Next.js runtime code reached the static bundle" },
    { pattern: "next/dist", reason: "Next.js runtime code reached the static bundle" },
    { pattern: "sentry.io", reason: "telemetry is not allowed in the static planner" },
    { pattern: "ingest.sentry", reason: "telemetry is not allowed in the static planner" },
    { pattern: "googletagmanager.com", reason: "analytics are not allowed in the static planner" },
    { pattern: "google-analytics.com", reason: "analytics are not allowed in the static planner" },
    { pattern: "umami", reason: "analytics are not allowed in the static planner" },
    { pattern: "_vercel/insights", reason: "analytics are not allowed in the static planner" },
    { pattern: "vitals.vercel", reason: "analytics are not allowed in the static planner" },
];

export const REQUIRED_IN_BUNDLE = ["openleague.practice-plan"];

const GUARD = /typeof process|process\s*&&|process\s*!==?\s*["']?undefined/;

/** `process.env` reads without a `typeof process` style guard in the 60 characters before them. */
export function unguardedProcessEnvCount(text: string): number {
    let count = 0;
    let index = text.indexOf("process.env");
    while (index !== -1) {
        if (!GUARD.test(text.slice(Math.max(0, index - 60), index))) count++;
        index = text.indexOf("process.env", index + 1);
    }
    return count;
}

async function listFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(
        entries.map((entry) => {
            const full = path.join(dir, entry.name);
            return entry.isDirectory() ? listFiles(full) : Promise.resolve([full]);
        }),
    );
    return nested.flat();
}

export async function checkPlannerBuild(outDir: string): Promise<string[]> {
    const indexPath = path.join(outDir, "index.html");
    if (!existsSync(indexPath)) return [`${indexPath} is missing: run bun run planner:build first`];

    const problems: string[] = [];
    const html = await readFile(indexPath, "utf8");
    if (/(?:src|href)="\/assets\//.test(html)) {
        problems.push('index.html uses absolute /assets/ URLs; the planner must work from any subfolder (base: "./")');
    }
    if (!html.includes('http-equiv="Content-Security-Policy"')) {
        problems.push("index.html has no Content-Security-Policy meta");
    }

    const files = (await listFiles(outDir)).filter((file) => /\.(?:js|html)$/.test(file));
    const contents = await Promise.all(files.map(async (file) => [path.relative(outDir, file), await readFile(file, "utf8")] as const));
    for (const [file, text] of contents) {
        const bare = unguardedProcessEnvCount(text);
        if (bare > 0) problems.push(`${file} reads process.env ${bare} time(s) without a guard (Vite has no process)`);
        for (const { pattern, reason } of FORBIDDEN_IN_BUNDLE) {
            if (text.includes(pattern)) problems.push(`${file} contains "${pattern}": ${reason}`);
        }
    }
    for (const needle of REQUIRED_IN_BUNDLE) {
        if (!contents.some(([, text]) => text.includes(needle))) {
            problems.push(`no emitted file contains "${needle}": the plan-document module is missing from the bundle`);
        }
    }
    return problems;
}

async function main() {
    const outDir = path.join(process.cwd(), "dist", "planner");
    const problems = await checkPlannerBuild(outDir);
    if (problems.length > 0) {
        console.error(`Static planner bundle check failed (${problems.length}):`);
        for (const problem of problems) console.error(`  - ${problem}`);
        process.exit(1);
    }
    console.log(`Static planner bundle OK (${path.relative(process.cwd(), outDir)})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
```

- [ ] **Step 4: Scripts**

In `package.json` `scripts`, after `"planner:preview": …,` add:

```json
    "planner:check": "bun scripts/check-planner-build.ts",
```

and change `deployment:check` to:

```json
    "deployment:check": "bun run validate-deployment-config && bun run docs:build-pages && bun run planner:build && bun run planner:check"
```

- [ ] **Step 5: Run the checker tests and the real bundle**

Run: `bun run test __tests__/scripts/check-planner-build.test.ts`
Expected: PASS.

Run: `bun run planner:build && bun run planner:check`
Expected: `Static planner bundle OK (dist/planner)`. If a dependency trips a rule, read the offending context (`grep -o '.\{80\}PATTERN.\{40\}' dist/planner/assets/*.js`): an unguarded `process.env` or a Next.js/telemetry string means a forbidden module reached the bundle — find it with the portability walk and remove the import. Never weaken the checker to pass.

- [ ] **Step 6: Pages workflow**

In `.github/workflows/docs-pages.yml`:
- In `on.push.paths`, after `- 'lib/docs/**'`, add:

```yaml
      # The static planner (ADR-0020) bundles shared components, utilities and
      # types, so any of them can change the deployed /planner/ build.
      - 'apps/planner/**'
      - 'components/**'
      - 'lib/**'
      - 'types/**'
      - 'app/(dashboard)/practice-planner/**'
      - 'app/(print)/**'
      - 'scripts/check-planner-build.ts'
```

- After the `Build docs pages artifact` step, add:

```yaml
      - name: Build the static planner
        run: bun run planner:build

      - name: Check the static planner bundle
        run: bun run planner:check

      # The docs build empties dist/docs-pages first, so the planner goes in last.
      - name: Add the planner to the Pages artifact
        run: cp -R dist/planner dist/docs-pages/planner
```

- [ ] **Step 7: Pull-request gate and deployment checks**

In `.github/workflows/quality-gates.yml`, after

```yaml
      - name: Unit tests
        run: bun run test
```

add:

```yaml

      # ADR-0020: shared planner code also ships in the static planner. A change
      # that breaks its bundle fails here, not in the next Pages deploy.
      - name: Build the static planner
        run: bun run planner:build

      - name: Check the static planner bundle
        run: bun run planner:check
```

In `.github/workflows/deployment-checks.yml`, in **both** `paths:` lists, after `- 'scripts/build-docs-pages.ts'`, add:

```yaml
      - 'scripts/check-planner-build.ts'
      - 'apps/planner/**'
```

- [ ] **Step 8: Env example and CLAUDE.md**

In `.env.example`, replace

```
# Static practice planner (ADR-0020). When set, the session page's Export plan
# menu offers 'Copy "Open in planner" link' pointing here.
# NEXT_PUBLIC_STATIC_PLANNER_URL="https://example.github.io/openleague/planner/"
```

with

```
# Static practice planner (ADR-0020). When set, the session page's Export plan
# menu offers 'Copy "Open in planner" link' pointing here. Production value:
# https://openleague.dev/planner/ (deployed by .github/workflows/docs-pages.yml).
# NEXT_PUBLIC_STATIC_PLANNER_URL="https://openleague.dev/planner/"
```

In `CLAUDE.md`:
- Under `### Essential Commands`, after the `bun run lint` line, add:

```bash
bun run planner:dev      # Static practice planner (apps/planner, Vite) at localhost:5173
bun run planner:build    # Build it to dist/planner; bun run planner:check verifies the bundle
```

- In the `### Application Structure` tree, after the `app/` block's closing `└── docs/` line, add:

```
apps/
└── planner/                     # Static, local-first practice planner (ADR-0020): Vite SPA,
                                 # IndexedDB store, hash routes; reuses components via @/;
                                 # deployed to openleague.dev/planner/ by docs-pages.yml
```

- [ ] **Step 9: Verify**

Run: `bun run validate-deployment-config && bun run lint && bun run type-check`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
/usr/bin/git add scripts/check-planner-build.ts __tests__/scripts/check-planner-build.test.ts package.json .github/workflows/docs-pages.yml .github/workflows/quality-gates.yml .github/workflows/deployment-checks.yml .env.example CLAUDE.md
/usr/bin/git commit -m "ci(practice-planner): build, check and deploy the static planner with the Pages site

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 9: Gates and roadmap status

**Files:**
- Modify: `docs/superpowers/specs/2026-10-03-static-planner-roadmap.md` (row 3)
- Modify: `docs/adr/0020-exchange-practice-plans-as-a-portable-versioned-document-and-ship-a-static-local.md` (action item 3)

- [ ] **Step 1: Run every gate**

Run each and expect it to pass:
- `bun run type-check`
- `bun run lint` (errors fail; the demoted React Compiler warnings are acceptable)
- `bun run test` (the full suite)
- `bun run build` (hosted: shared components changed)
- `bun run planner:build && bun run planner:check`
- `bun run adr:lint && bun run adr:check-integrity`
- `bun run check:raw-sql`
- `bun run validate-deployment-config`

If a test outside `__tests__/apps/planner` fails, check `gh run list --branch main --limit 3` before treating it as a regression (absolute-date fixtures have rotted on main before).

- [ ] **Step 2: Roadmap row 3 and the ADR action item**

In `docs/superpowers/specs/2026-10-03-static-planner-roadmap.md`, replace the row-3 status `Spec to write` with:

```
Built: spec `2026-10-03-static-planner-app-design.md`, plan `../plans/2026-10-03-static-planner-app.md`
```

In ADR-0020, change `3. [ ] Sub-project 3: static app and Pages deploy.` to `3. [x] Sub-project 3: static app and Pages deploy.`

Run: `bun run adr:lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
/usr/bin/git add docs/superpowers/specs/2026-10-03-static-planner-roadmap.md docs/adr/0020-*.md
/usr/bin/git commit -m "docs(practice-planner): mark the static planner app built

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

- [ ] **Step 4: Owner actions (report, don't perform)**

List these in the PR description:
1. Vercel: set `NEXT_PUBLIC_STATIC_PLANNER_URL=https://openleague.dev/planner/` (Production, optionally Preview) and redeploy.
2. GitHub Pages: nothing beyond the merge; the next Pages run publishes `/planner/`.
3. Optional: set `OPENLEAGUE_HOSTED_URL` only if the hosted domain ever changes from `https://openl.app`.

## Self-Review

**Spec coverage.**
- §1 build/layout/tooling → Task 2 (deps, scripts, config, define, CSP, alias, lint), Task 7 (index.html, first build), Task 8 (checker).
- §2a hand-off on the platform → Task 1; §2b Share gate → Task 1; §2c/§2d moves → Task 1; §2e ADR → Task 1 (affects) and Task 9 (action item).
- §3 store → Tasks 3 (repos), 4 (library, seeding, failures), 5 (sessions, import, valid-plan invariant, persistence); stability → Task 7 test.
- §4 platform/routing → Task 2; §5 screens → Tasks 6 and 7; §6 import/export → Tasks 1, 6, 7; §7 theme/print → Task 7; §8 privacy → Tasks 2 (copy), 6, 7; §9 deploy/CI → Task 8.
- Error handling table: fallback and stale (Task 7), quota and generic failures (Task 4), missing records (Tasks 6, 7), unreadable diagrams (Tasks 4, 5, 6), file/link errors (Tasks 1, 6), popup blocked / too large (Task 1), crash boundary (Task 7).

**Placeholder scan.** No TBDs. Two judgment points are stated as instructions with a rule: query adjustments in Task 6 Step 7 (tests only, never product code) and bundle-check hits in Task 8 Step 5 (fix the import, never the checker).

**Type consistency.** `LocalPlannerStore` members are defined in Task 4 and implemented across `library.ts` (Task 4) and `sessions.ts` (Task 5); `createLocalPlannerStore` composes both. `PlannerPlatform.planGenerator/planLink` (Task 1) are set by `staticPlannerPlatform` (Task 2), the hosted platform and the test helper (Task 1). `StaleSignal` (Task 7) is consumed by `AppShell` and `PlannerApp` in the same task. `SESSION_NOT_ON_DEVICE_MESSAGE` lives in `sessions.ts` and `DRILL_NOT_ON_DEVICE_MESSAGE` in `StatusScreens.tsx`, and tests import them from there.

**Review Focus.** Each of the five lines has a named test in its owning task (Tasks 6, 7, 3, 4, 7).
