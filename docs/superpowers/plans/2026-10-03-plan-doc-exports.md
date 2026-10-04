# Practice Plan Document Exports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From the session page (hosted and static), a coach downloads the practice as a self-contained HTML bench sheet or a Word document, and three #391 leftovers are closed.

**Architecture:**
- **One model, two renderers.** `buildBenchSheetModel(session, renderers)` turns a session into plain strings and PNG data URIs (diagram and swatch drawing injected). `renderBenchSheetHtml(model)` builds an escaped string; `renderBenchSheetDocx(model)` uses the `docx` library and is reached only through `import()`.
- **Menu glue.** `exportBenchSheet(session, format, options)` draws the images with the canvas, renders, and downloads through a shared `downloadBlob`. `ExportPlanMenu` gains two items with a busy state and failure notices.
- **Guards.** ESLint forbids static imports of `docx` and the docx module in portable code; the static build check fails if the entry chunk carries `word/document.xml` or if no chunk does.

**Tech Stack:** TypeScript 5.9 (strict), React 19.2, MUI v7, `docx` 9.8 (new runtime dependency, lazy), Vite 7, Next 16 (Turbopack), Vitest 4 + Testing Library (jsdom 29), ESLint 9 flat config, Bun.

**Spec:** `docs/superpowers/specs/2026-10-03-plan-doc-exports-design.md`. Context: `docs/superpowers/specs/2026-10-03-static-planner-roadmap.md` (row 4), `docs/superpowers/specs/2026-10-03-practice-session-timeline-bench-sheet-design.md`, `docs/superpowers/specs/2026-10-03-static-planner-app-design.md`, `docs/adr/0020-exchange-practice-plans-as-a-portable-versioned-document-and-ship-a-static-local.md`.

## Global Constraints

- **Base.** Branch `feat/plan-doc-exports`, product code as at `0152ca6`. If a quoted anchor has moved, find it by its text.
- **Toolchain.** `bun` only (`bun run test <files>`, `bun run type-check`, `bun run lint`, `bun run build`, `bun add`). `/usr/bin/git`. Never `git stash`, never switch branches.
- **Dependencies.** Exactly one new **runtime** dependency: `docx` `^9.8.1` (MIT). No other runtime or dev dependency. `docx` is imported **only** by `components/features/practice-planner/export/bench-sheet-docx.ts`, and that module is loaded **only** by `import()` in `export-bench-sheet.ts`.
- **Scope.** No schema change, no migration, no change under `lib/actions/`, no new route, no page change. `SessionDetailView.tsx` is untouched (it already passes the whole `PracticeSessionView` to `ExportPlanMenu`).
- **Hosted behaviour unchanged** except the two new menu items: "Download plan file" still downloads `<slug>.olplan.json` with the same JSON, the hand-off item is untouched, and every existing `ExportPlanMenu`, `BenchSheet`, `LegendList`, `PlayLegend` and plan-document test keeps its assertions.
- **The exported HTML file** has no `<script`, `<link`, `@import`, `url(`, `href=`, or `src=` other than `data:image/png;base64,…`, and carries the CSP meta `default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`.
- **Escaping.** Every user string (title, team, venue, surface, segment, drill names, instructions, descriptions, legend labels) reaches the HTML only through `escapeHtml` (`& < > " '`) via the `html` template; image sources only after `isPngDataUri`.
- **Time zones.** Exports format with `sessionStart` + `sessionTimeZone` + `formatClockTime`/`formatLongDate` from `lib/utils/date.ts`, exactly as `BenchSheet` does: venue zone with short name when booked, else the viewer's zone with no suffix.
- **Copy, verbatim** (constants in parentheses):
  - Menu items: `Download bench sheet (HTML)`, `Download Word document (.docx)`.
  - (`PREPARING_HTML_NOTICE`) `Preparing the bench sheet…`; (`PREPARING_DOCX_NOTICE`) `Preparing the Word document…`.
  - (`DOCX_LOAD_FAILED_NOTICE`) `Couldn't load the Word export. Check your connection and try again, or download the bench sheet (HTML).`
  - (`EXPORT_FAILED_NOTICE`) `Couldn't create the file. Try again, or use Print bench sheet.`
  - (`NO_DRILLS_TEXT`) `No drills planned` (= `BenchSheet`'s `NO_DRILLS_MESSAGE`); (`DIAGRAM_UNAVAILABLE_TEXT`) `Diagram unavailable` (= `PrintDiagram`'s `DIAGRAM_UNAVAILABLE`); (`LEGEND_HEADING`) `Legend`.
- **File names.** `<slug>.html`, `<slug>.docx`, slug exactly as `planFileName` (fallback `practice-plan`).
- **Diagrams.** 720×306 logical px at `printPixelRatio(readableCount)`; Word places them at 680×289 px. Swatches 40×20 at ×2; Word places them at 30×15.
- **Theme.** League Blue `#0D47A1` headings, Action Blue `#1976D2` header rule, `#E3F2FD` table header, Penalty Box Red `#C62828` for over time; font stacks `"Cabinet Grotesk", "Avenir Next", "Segoe UI", system-ui, sans-serif` and `"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace` (named, never fetched).
- **Tests** live under `__tests__/` mirroring the source path. jsdom is the only Vitest environment (`vitest.setup.ts` touches `HTMLCanvasElement`), so no test opts into `node`.
- **Commits.** Conventional commit, blank line, `Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX`.
- **Per task:** `bun run type-check` and the task's own test files are green before the commit.

## Rulings (decided during planning)

1. **`.docx` ships now with `docx@^9.8.1`.** Measured in a scratch bundle: MIT (transitives MIT / ISC / Zlib / BlueOak; `jszip` dual-licensed, used under MIT), ≈ 404 KB min / ≈ 118 KB gzip, no `process.env`, no forbidden markers, one `new Function` inside a `setImmediate` shim that only runs when handed a string (`docx` never does), so the static CSP without `'unsafe-eval'` holds. Word's HTML import does not reliably show `data:` images, so HTML alone can't serve Word users.
2. **No `react-dom/server`.** The export needs plain elements with inline CSS; rendering MUI's `BenchSheet` would emit Emotion class names with no styles. A ~40-line `html` tagged template with escape-by-default is smaller, identical in both bundles, and unit-testable.
3. **The model is the single source of truth**; renderers never format dates or compute schedules. Image drawing is injected (`BenchSheetRenderers`), so the model, HTML and Word tests need no canvas.
4. **`docx` is reached only by `import()`**: Turbopack and Vite each emit it as a separate chunk. Enforced by ESLint (`no-restricted-imports` ignores `import()`, so the lazy path stays legal) and by the static build check (entry chunk must not contain `word/document.xml`; some chunk must). Hosted is checked by hand in the gates.
5. **The Word bytes come from `Packer.toArrayBuffer`**, wrapped in a Blob with the Word MIME type. Tests read the bytes and unzip `word/document.xml` with a 40-line `node:zlib` helper; no `jszip` import in tests (it is only a transitive dependency).
6. **Legend parity by extraction.** `LegendSwatch`'s effect body moves verbatim to `paintLegendSwatch(ctx, entry)` in `lib/utils/canvas/legend-swatch.ts`; the component and the export both call it.
7. **The static export omits the team line** (`omitTeam: planGenerator === "openleague-static"`): the static `teamName` is the placeholder "This device", not a name.
8. **ADR-0020 is amended, not superseded.** Its `affects` already covers `components/features/practice-planner/**`; the Decision and Trade-offs gain the export and the lazy dependency, and action item 4 is ticked.
9. **Build-check `if` guard is recognized strictly**: only the block directly under `if (cond)` where `cond` proves `process` exists and has no `||`. Nested blocks, `else`, object literals and later statements still count.
10. **Leftover (b) uses a `Symbol` token per choice** (`latestChoice`), taken before the `await` in `onFile` and compared after it.

## Review Focus

1. **A title that slugs to nothing** (emoji only, punctuation only) must still download `practice-plan.html` / `.docx`, not `.html`. → Task 1 test.
2. **Windows line endings in instructions** (`\r\n`, pasted from Word) must become one break, not a break plus a stray `\r`. → Task 3 (HTML) and Task 4 (Word) tests.
3. **A diagram that can't be drawn** (no 2d context, out of memory, `toDataURL` returning `data:,`) must give "Diagram unavailable" for that drill and still download the file. → Task 5 `export-images` test and Task 3 `isPngDataUri` test.
4. **A second click while an export runs** (impatient coach, slow docx chunk) must not start a second export. → Task 5 busy test.
5. **A long session** (41+ readable drills) must drop the pixel ratio to 1 like the bench sheet, keeping the file from ballooning. → Task 2 test.

## File map

| Path | Task | Responsibility |
|---|---|---|
| `lib/plan-document/document.ts` | 1 | `planSlug`, `planExportFileName` beside `planFileName` |
| `lib/utils/canvas/legend-swatch.ts` (new) | 1 | `LEGEND_SWATCH_SIZE`, `paintLegendSwatch` |
| `components/features/practice-planner/PlayLegend.tsx` | 1 | `LegendSwatch` calls `paintLegendSwatch` |
| `components/features/practice-planner/export/download.ts` (new) | 1 | `downloadBlob` |
| `components/features/practice-planner/ExportPlanMenu.tsx` | 1, 5 | uses `downloadBlob`; two new items |
| `components/features/practice-planner/export/labels.ts` (new) | 2 | shared export copy |
| `components/features/practice-planner/export/png.ts` (new) | 2 | `isPngDataUri`, `pngDataUriToBytes` |
| `components/features/practice-planner/export/bench-sheet-model.ts` (new) | 2 | `ExportSession`, `BenchSheetModel`, `buildBenchSheetModel` |
| `components/features/practice-planner/export/bench-sheet-html.ts` (new) | 3 | `escapeHtml`, `renderBenchSheetHtml`, `EXPORT_CSP` |
| `components/features/practice-planner/export/bench-sheet-docx.ts` (new) | 4 | the only `docx` importer |
| `__tests__/helpers/zip.ts` (new) | 4 | `unzipEntry`, `zipEntryNames` |
| `eslint.config.mjs` | 4 | static `docx` imports forbidden in portable code |
| `scripts/check-planner-build.ts` | 4, 6 | lazy-chunk rule; enclosing-`if` guard |
| `components/features/practice-planner/export/export-images.ts` (new) | 5 | `canvasRenderers` |
| `components/features/practice-planner/export/export-bench-sheet.ts` (new) | 5 | `exportBenchSheet`, `ExportModuleLoadError` |
| `apps/planner/src/screens/ImportScreen.tsx` | 6 | one privacy note; choice token |
| `docs/adr/0020-…md`, `docs/superpowers/specs/2026-10-03-static-planner-roadmap.md` | 7 | amendment, row 4 |

---

### Task 1: File names, swatch painter and download helper

**Files:**
- Modify: `lib/plan-document/document.ts` (the `planFileName` block under "File name and editor mapping")
- Create: `lib/utils/canvas/legend-swatch.ts`
- Modify: `components/features/practice-planner/PlayLegend.tsx` (imports, constants, `LegendSwatch`)
- Create: `components/features/practice-planner/export/download.ts`
- Modify: `components/features/practice-planner/ExportPlanMenu.tsx` (`download`)
- Test: `__tests__/lib/plan-document/document.test.ts` (append), `__tests__/lib/utils/canvas/legend-swatch.test.ts` (new), `__tests__/components/features/practice-planner/export/download.test.ts` (new)

**Interfaces:**
- Produces: `planSlug(title: string): string`; `type PlanExportExtension = "html" | "docx"`; `planExportFileName(title: string, extension: PlanExportExtension): string` (all re-exported from `@/lib/plan-document`). `LEGEND_SWATCH_SIZE = { width: 40, height: 20 }`; `paintLegendSwatch(ctx: CanvasRenderingContext2D, entry: LegendEntry): void`. `REVOKE_DELAY_MS = 1000`; `downloadBlob(blob: Blob, fileName: string): void`.

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/lib/plan-document/document.test.ts` (add `planExportFileName, planSlug` to its `@/lib/plan-document` import):

```ts
describe("planExportFileName", () => {
    it.each([
        ["Tuesday Skills Practice", "html", "tuesday-skills-practice.html"],
        ["U12 / Power-Play #2", "docx", "u12-power-play-2.docx"],
        ["🏒🏒", "html", "practice-plan.html"],
        ["!!!", "docx", "practice-plan.docx"],
    ] as const)("names %j as .%s", (title, extension, expected) => {
        expect(planExportFileName(title, extension)).toBe(expected);
    });

    it("shares the plan file's slug", () => {
        const title = "  Équipe Été!!  ";
        expect(planSlug(title)).toBe("equipe-ete");
        expect(planFileName(title)).toBe(`${planSlug(title)}.olplan.json`);
    });
});
```

Create `__tests__/lib/utils/canvas/legend-swatch.test.ts`:

```ts
/** paintLegendSwatch: the legend's swatch drawing, shared by LegendSwatch and the document exports. */
import { describe, expect, it, vi } from "vitest";
import { LEGEND_SWATCH_SIZE, paintLegendSwatch } from "@/lib/utils/canvas/legend-swatch";
import type { LegendEntry } from "@/lib/utils/canvas/legend";

/**
 * vitest.setup.ts's 2d context mock (measureText returns a width), wrapped so
 * any method it lacks (setLineDash, …) exists as a recording vi.fn too.
 */
function recordingContext() {
    const base = document.createElement("canvas").getContext("2d") as unknown as Record<string | symbol, unknown>;
    return new Proxy(base, {
        get(t, key) {
            if (!(key in t)) t[key] = vi.fn();
            return t[key];
        },
    }) as unknown as CanvasRenderingContext2D & Record<string, ReturnType<typeof vi.fn>>;
}

const ENTRIES: LegendEntry[] = [
    { key: "action-pass", label: "Pass", type: "action", action: "pass" },
    { key: "end-stop", label: "Stop", type: "end", end: "stop" },
    { key: "role-F", label: "Forward", type: "role", role: "F" },
    { key: "equipment-puck", label: "Puck", type: "equipment", kind: "puck" },
];

describe("paintLegendSwatch", () => {
    it("is 40×20", () => {
        expect(LEGEND_SWATCH_SIZE).toEqual({ width: 40, height: 20 });
    });

    it.each(ENTRIES)("clears and paints the $type swatch", (entry) => {
        const ctx = recordingContext();
        paintLegendSwatch(ctx, entry);
        expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 40, 20);
        const drew = ["stroke", "fill", "arc", "lineTo", "fillRect"].some((m) => ctx[m].mock.calls.length > 0);
        expect(drew).toBe(true);
    });
});
```

(`PLAYER_ROLES` is `["X", "O", "F", "D", "G", "C"]` and `EQUIPMENT_KINDS` starts with `"puck"`, in `types/practice-planner.ts`.)

Create `__tests__/components/features/practice-planner/export/download.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REVOKE_DELAY_MS, downloadBlob } from "@/components/features/practice-planner/export/download";

let clicks: Array<{ download: string; href: string }>;

beforeEach(() => {
    clicks = [];
    vi.useFakeTimers();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:file");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        clicks.push({ download: this.download, href: this.getAttribute("href") ?? "" });
    });
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("downloadBlob", () => {
    it("clicks a temporary download link, then removes it", () => {
        const blob = new Blob(["x"], { type: "text/html" });
        downloadBlob(blob, "tuesday.html");
        expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
        expect(clicks).toEqual([{ download: "tuesday.html", href: "blob:file" }]);
        expect(document.querySelector("a[download]")).toBeNull();
    });

    it("revokes the URL only after the delay", () => {
        downloadBlob(new Blob(["x"]), "a.docx");
        vi.advanceTimersByTime(REVOKE_DELAY_MS - 1);
        expect(URL.revokeObjectURL).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:file");
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/lib/plan-document/document.test.ts __tests__/lib/utils/canvas/legend-swatch.test.ts __tests__/components/features/practice-planner/export/download.test.ts`
Expected: FAIL — `planExportFileName`/`planSlug` not exported; the two new modules don't exist.

- [ ] **Step 3: Implement**

In `lib/plan-document/document.ts`, replace the `planFileName` function (keep `MAX_SLUG_LENGTH`) with:

```ts
/** The title as a file-name slug: lowercase ASCII, hyphen-joined, ≤ 60 chars, else `practice-plan`. */
export function planSlug(title: string): string {
    const slug = title
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, MAX_SLUG_LENGTH)
        .replace(/-+$/, "");
    return slug || "practice-plan";
}

/** `<slug>.olplan.json`. */
export function planFileName(title: string): string {
    return `${planSlug(title)}.olplan.json`;
}

export type PlanExportExtension = "html" | "docx";

/** `<slug>.html` / `<slug>.docx`: the bench sheet exports (sub-project 4). */
export function planExportFileName(title: string, extension: PlanExportExtension): string {
    return `${planSlug(title)}.${extension}`;
}
```

Create `lib/utils/canvas/legend-swatch.ts` (the body is `LegendSwatch`'s effect, moved verbatim):

```ts
/**
 * One legend symbol's sample (practice board notation). Shared by the
 * on-screen LegendSwatch and the bench sheet document exports, so a symbol
 * looks the same everywhere. Draws in logical px; callers scale for density.
 */
import type { StrokeAction } from "@/types/practice-planner";
import type { LegendEntry } from "./legend";
import { buildStrokeGeometry } from "./stroke-geometry";
import { paintStrokeGeometry } from "./drawing-utils";
import { drawEquipmentGlyph, drawPlayerGlyph } from "./glyphs";
import { BOARD_COLORS, ROLE_DEFAULT_COLORS } from "./notation";

export const LEGEND_SWATCH_SIZE = { width: 40, height: 20 } as const;

// Swatches are drawn in raw canvas px; a small pxPerFt makes the patterns' px minimums bind.
const SWATCH_PX_PER_FT = 0.5;

export function paintLegendSwatch(ctx: CanvasRenderingContext2D, entry: LegendEntry): void {
    const W = LEGEND_SWATCH_SIZE.width;
    const H = LEGEND_SWATCH_SIZE.height;
    ctx.clearRect(0, 0, W, H);
    const center = { x: W / 2, y: H / 2 };
    const strokeSwatch = (action: StrokeAction, end: "arrow" | "stop") => {
        const geometry = buildStrokeGeometry(
            { action, path: "straight", end, points: [{ x: 4, y: H / 2 }, { x: W - 6, y: H / 2 }], strokeWidth: 2 },
            SWATCH_PX_PER_FT
        );
        paintStrokeGeometry(ctx, geometry, BOARD_COLORS.ink, SWATCH_PX_PER_FT);
    };
    switch (entry.type) {
        case "action":
            strokeSwatch(entry.action, "arrow");
            break;
        case "end":
            strokeSwatch("skate", "stop");
            break;
        case "role":
            drawPlayerGlyph(ctx, { id: "", role: entry.role, label: "", color: ROLE_DEFAULT_COLORS[entry.role], position: { x: 0, y: 0 } }, center, 8, false);
            break;
        case "equipment":
            drawEquipmentGlyph(ctx, { kind: entry.kind, rotation: 0 }, center, 8, false);
            break;
    }
}
```

In `components/features/practice-planner/PlayLegend.tsx`:
- Replace the imports of `StrokeAction`, `buildStrokeGeometry`, `paintStrokeGeometry`, `drawEquipmentGlyph`, `drawPlayerGlyph`, `BOARD_COLORS`, `ROLE_DEFAULT_COLORS` and the `W`/`H`/`SWATCH_PX_PER_FT` constants with:

```ts
import type { PlayData } from "@/types/practice-planner";
import { buildLegend, type LegendEntry } from "@/lib/utils/canvas/legend";
import { LEGEND_SWATCH_SIZE, paintLegendSwatch } from "@/lib/utils/canvas/legend-swatch";
import { iceAreaLabel } from "@/lib/utils/canvas/notation";
import { isFullIce } from "@/lib/utils/ice-area";
```

- Replace `LegendSwatch` with:

```tsx
/** One symbol's sample, drawn on a small canvas. Exported for the bench sheet's LegendList (3b). */
export function LegendSwatch({ entry }: { entry: LegendEntry }) {
    const ref = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const ctx = ref.current?.getContext("2d");
        if (ctx) paintLegendSwatch(ctx, entry);
    }, [entry]);
    return <canvas ref={ref} width={LEGEND_SWATCH_SIZE.width} height={LEGEND_SWATCH_SIZE.height} aria-hidden="true" />;
}
```

Create `components/features/practice-planner/export/download.ts`:

```ts
/** Saving a generated file (plan, bench sheet, Word document) from the browser. */

/** Safari and Firefox can cut a download short if its object URL is revoked at once. */
export const REVOKE_DELAY_MS = 1000;

export function downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
```

In `ExportPlanMenu.tsx`, add `import { downloadBlob } from "./export/download";` and replace the eight lines of `download()` from `const url = URL.createObjectURL(...)` through `window.setTimeout(() => URL.revokeObjectURL(url), 1000);` (including the Safari comment) with:

```ts
        downloadBlob(new Blob([text], { type: "application/json" }), planFileName(session.title));
```

- [ ] **Step 4: Run the tests**

Run: `bun run test __tests__/lib/plan-document __tests__/lib/utils/canvas/legend-swatch.test.ts __tests__/components/features/practice-planner/export/download.test.ts __tests__/components/features/practice-planner/ExportPlanMenu.test.tsx __tests__/components/features/practice-planner/PlayLegend.test.tsx __tests__/components/features/practice-planner/print`
Expected: PASS (existing `planFileName`, revoke-delay, legend and bench sheet tests unchanged).

Run: `bun run type-check && bunx eslint lib/plan-document lib/utils/canvas/legend-swatch.ts components/features/practice-planner/PlayLegend.tsx components/features/practice-planner/export components/features/practice-planner/ExportPlanMenu.tsx`
Expected: no errors (no unused imports left in `PlayLegend.tsx`).

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add lib/plan-document/document.ts lib/utils/canvas/legend-swatch.ts components/features/practice-planner/PlayLegend.tsx components/features/practice-planner/export/download.ts components/features/practice-planner/ExportPlanMenu.tsx __tests__/lib/plan-document/document.test.ts __tests__/lib/utils/canvas/legend-swatch.test.ts __tests__/components/features/practice-planner/export/download.test.ts
/usr/bin/git commit -m "refactor(practice-planner): export file names, legend swatch painter and download helper

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 2: The bench sheet model

**Files:**
- Create: `components/features/practice-planner/export/labels.ts`, `components/features/practice-planner/export/png.ts`, `components/features/practice-planner/export/bench-sheet-model.ts`
- Test: `__tests__/components/features/practice-planner/export/bench-sheet-model.test.ts`, `__tests__/components/features/practice-planner/export/png.test.ts`

**Interfaces:**
- Consumes: `buildSchedule`, `sessionWallMinutes` (`lib/utils/session-timeline.ts`); `formatClockTime`, `formatLongDate`, `sessionStart`, `sessionTimeZone` (`lib/utils/date.ts`); `buildLegend`, `type LegendEntry` (`lib/utils/canvas/legend.ts`); `combinedLegendData` (`lib/utils/canvas/station-map.ts`); `stationsLabel`, `plannedLabel` (`../SessionTimeline`); `drillText`, `stationTag` (`../print/BenchSheetDrill`); `printPixelRatio` (`../print/PrintDiagram`).
- Produces (later tasks rely on these names):

```ts
export interface ExportSession { title; date; duration; startAt?; venueTimezone?; teamName?; venueName?; surfaceName?; segmentName?; plays: ExportSessionPlay[] }
export interface BenchSheetModel { title; teamName: string | null; when; place: string | null;
  timeline: Array<{ start: string; minutes: number; label: string; stations: string[] | null }>;
  planned: string; overTime: boolean; legend: Array<{ label: string; image: string | null }>;
  drills: Array<{ number: number; name: string; start: string; minutes: number; station: string | null; diagram: string | null; text: string | null }> }
export interface BenchSheetRenderers { diagram(playData: PlayData, pixelRatio: number): string | null; swatch(entry: LegendEntry): string | null }
export function buildBenchSheetModel(session: ExportSession, renderers: BenchSheetRenderers, options?: { omitTeam?: boolean }): BenchSheetModel
// labels.ts
export const NO_DRILLS_TEXT, DIAGRAM_UNAVAILABLE_TEXT, LEGEND_HEADING
// png.ts
export function isPngDataUri(value: string | null | undefined): value is string
export function pngDataUriToBytes(value: string): Uint8Array
```

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/features/practice-planner/export/png.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isPngDataUri, pngDataUriToBytes } from "@/components/features/practice-planner/export/png";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("isPngDataUri", () => {
    it("accepts a base64 PNG data URI", () => {
        expect(isPngDataUri(PNG)).toBe(true);
    });

    it.each([
        null,
        undefined,
        "",
        "data:,", // what toDataURL returns when the canvas is too large to encode
        "data:image/svg+xml;base64,PHN2Zz4=",
        "data:image/png;base64,abc", // length not a multiple of 4: atob would throw
        'data:image/png;base64,AAAA" onerror="alert(1)',
        "javascript:alert(1)",
        "https://example.com/a.png",
    ])("rejects %j", (value) => {
        expect(isPngDataUri(value)).toBe(false);
    });
});

describe("pngDataUriToBytes", () => {
    it("decodes the PNG signature", () => {
        expect(Array.from(pngDataUriToBytes(PNG).slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    });
});
```

Create `__tests__/components/features/practice-planner/export/bench-sheet-model.test.ts`:

```ts
/** buildBenchSheetModel: the bench sheet as plain strings and images, shared by the HTML and Word exports. */
import { describe, expect, it, vi } from "vitest";
import {
    buildBenchSheetModel,
    type BenchSheetRenderers,
    type ExportSession,
} from "@/components/features/practice-planner/export/bench-sheet-model";
import { DIAGRAM_UNAVAILABLE_TEXT, NO_DRILLS_TEXT } from "@/components/features/practice-planner/export/labels";
import { NO_DRILLS_MESSAGE } from "@/components/features/practice-planner/print/BenchSheet";
import { DIAGRAM_UNAVAILABLE } from "@/components/features/practice-planner/print/PrintDiagram";
import { buildLegend } from "@/lib/utils/canvas/legend";
import { formatClockTime, formatLongDate } from "@/lib/utils/date";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayData } from "@/types/practice-planner";

const pass = (id: string) => ({
    id,
    action: "pass" as const,
    path: "straight" as const,
    end: "arrow" as const,
    points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    color: "#000000",
    strokeWidth: 2,
});
const withPass = (id: string): PlayData => ({ ...createEmptyPlayData(), drawings: [pass(id)] });

function play(
    name: string,
    sequence: number,
    duration: number,
    runsWithPrevious = false,
    extra: { instructions?: string | null; description?: string | null; playData?: PlayData | null } = {},
): ExportSession["plays"][number] {
    return {
        sequence,
        duration,
        runsWithPrevious,
        instructions: extra.instructions ?? null,
        play: { name, description: extra.description ?? null, playData: extra.playData === undefined ? createEmptyPlayData() : extra.playData },
    };
}

const BOOKED: ExportSession = {
    title: "Tuesday Skills",
    date: "2026-04-07T22:00:00.000Z",
    duration: 60,
    startAt: "2026-04-08T00:00:00.000Z", // 6:00 PM MDT on Tuesday, April 7
    venueTimezone: "America/Denver",
    teamName: "Hawks U12",
    venueName: "Ice House",
    surfaceName: "Rink A",
    segmentName: null,
    plays: [
        play("Breakout", 0, 10, false, { instructions: "Hard to the net", playData: withPass("a") }),
        play("Regroup", 1, 8, true, { description: "Neutral zone", playData: withPass("b") }),
        play("Shooting", 2, 15, false, { playData: null }),
    ],
};

const UNBOOKED: ExportSession = { ...BOOKED, startAt: null, venueTimezone: null, venueName: null, surfaceName: null };

function renderers(overrides: Partial<BenchSheetRenderers> = {}): BenchSheetRenderers {
    return {
        diagram: vi.fn((_data: PlayData, ratio: number) => `data:image/png;base64,DIA${ratio}`),
        swatch: vi.fn(() => "data:image/png;base64,SWAT"),
        ...overrides,
    };
}

describe("buildBenchSheetModel", () => {
    it("formats a booked session in the venue's zone with its short name", () => {
        const model = buildBenchSheetModel(BOOKED, renderers());
        expect(model.title).toBe("Tuesday Skills");
        expect(model.teamName).toBe("Hawks U12");
        expect(model.when).toBe("Tuesday, April 7, 2026 · 6:00 PM – 7:00 PM MDT");
        expect(model.place).toBe("Ice House · Rink A");
    });

    it("formats an unbooked session in the viewer's zone with no suffix and no place", () => {
        const start = new Date(UNBOOKED.date);
        const end = new Date(start.getTime() + 60 * 60_000);
        const model = buildBenchSheetModel(UNBOOKED, renderers());
        expect(model.when).toBe(`${formatLongDate(start)} · ${formatClockTime(start)} – ${formatClockTime(end)}`);
        expect(model.place).toBeNull();
        expect(model.timeline[0].start).toBe(formatClockTime(start));
    });

    it("omits the team when asked (static planner) or when it is blank", () => {
        expect(buildBenchSheetModel(BOOKED, renderers(), { omitTeam: true }).teamName).toBeNull();
        expect(buildBenchSheetModel({ ...BOOKED, teamName: "   " }, renderers()).teamName).toBeNull();
    });

    it("lists one timeline row per block, with station blocks expanded", () => {
        const model = buildBenchSheetModel(BOOKED, renderers());
        expect(model.timeline).toEqual([
            { start: "6:00 PM MDT", minutes: 10, label: "Stations · 2", stations: ["Breakout · 10 min", "Regroup · 8 min"] },
            { start: "6:10 PM MDT", minutes: 15, label: "Shooting", stations: null },
        ]);
        expect(model.planned).toBe("Planned 25 of 60 min");
        expect(model.overTime).toBe(false);
    });

    it("flags a plan longer than the booking", () => {
        const model = buildBenchSheetModel({ ...BOOKED, duration: 20 }, renderers());
        expect(model.planned).toBe("Planned 25 of 20 min (over time!)");
        expect(model.overTime).toBe(true);
    });

    it("numbers drills in schedule order with station tags, block starts and text fallback", () => {
        const model = buildBenchSheetModel(BOOKED, renderers());
        expect(model.drills.map(({ number, name, start, minutes, station, text }) => ({ number, name, start, minutes, station, text }))).toEqual([
            { number: 1, name: "Breakout", start: "6:00 PM MDT", minutes: 10, station: "Station 1 of 2", text: "Hard to the net" },
            { number: 2, name: "Regroup", start: "6:00 PM MDT", minutes: 8, station: "Station 2 of 2", text: "Neutral zone" },
            { number: 3, name: "Shooting", start: "6:10 PM MDT", minutes: 15, station: null, text: null },
        ]);
    });

    it("draws readable diagrams at the bench sheet's pixel ratio and skips unreadable ones", () => {
        const r = renderers();
        const model = buildBenchSheetModel(BOOKED, r);
        expect(model.drills.map((d) => d.diagram)).toEqual(["data:image/png;base64,DIA3", "data:image/png;base64,DIA3", null]);
        expect(r.diagram).toHaveBeenCalledTimes(2);
    });

    it.each([
        [12, 3],
        [13, 2],
        [41, 1],
    ])("uses pixel ratio for %i readable drills: %i", (count, ratio) => {
        const plays = Array.from({ length: count }, (_, i) => play(`Drill ${i}`, i, 1));
        const r = renderers();
        buildBenchSheetModel({ ...BOOKED, duration: 300, plays }, r);
        expect(vi.mocked(r.diagram).mock.calls.every(([, used]) => used === ratio)).toBe(true);
    });

    it("leaves a diagram the renderer couldn't draw as null", () => {
        const model = buildBenchSheetModel(BOOKED, renderers({ diagram: () => null }));
        expect(model.drills.every((d) => d.diagram === null)).toBe(true);
    });

    it("builds one legend across all drills, each symbol once", () => {
        const model = buildBenchSheetModel(BOOKED, renderers());
        expect(model.legend).toEqual(buildLegend(withPass("x")).map((entry) => ({ label: entry.label, image: "data:image/png;base64,SWAT" })));
    });

    it("gives an empty session no rows, drills or legend", () => {
        const model = buildBenchSheetModel({ ...BOOKED, plays: [] }, renderers());
        expect([model.timeline, model.drills, model.legend]).toEqual([[], [], []]);
        expect(model.planned).toBe("Planned 0 of 60 min");
    });
});

describe("export copy", () => {
    it("matches the on-screen bench sheet", () => {
        expect(NO_DRILLS_TEXT).toBe(NO_DRILLS_MESSAGE);
        expect(DIAGRAM_UNAVAILABLE_TEXT).toBe(DIAGRAM_UNAVAILABLE);
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/components/features/practice-planner/export/png.test.ts __tests__/components/features/practice-planner/export/bench-sheet-model.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

Create `components/features/practice-planner/export/labels.ts`:

```ts
/**
 * Copy shared by the bench sheet document exports. Kept free of imports so the
 * lazily loaded Word module can use it without pulling UI code into its chunk.
 * Equal to the on-screen bench sheet's copy (a test pins it).
 */
export const NO_DRILLS_TEXT = "No drills planned";
export const DIAGRAM_UNAVAILABLE_TEXT = "Diagram unavailable";
export const LEGEND_HEADING = "Legend";
```

Create `components/features/practice-planner/export/png.ts`:

```ts
/**
 * PNG data URIs: the only image source the document exports embed. Anything
 * else (an SVG, a URL, `data:,` from an over-large canvas, malformed base64)
 * is treated as "no diagram".
 */
const PNG_DATA_URI = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/;

export function isPngDataUri(value: string | null | undefined): value is string {
    if (!value) return false;
    const match = PNG_DATA_URI.exec(value);
    return match !== null && match[1].length % 4 === 0;
}

/** The bytes of a URI that passed isPngDataUri. */
export function pngDataUriToBytes(value: string): Uint8Array {
    const binary = atob(value.slice(value.indexOf(",") + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}
```

Create `components/features/practice-planner/export/bench-sheet-model.ts`:

```ts
/**
 * The bench sheet as plain data (sub-project 4): what the HTML and Word
 * exports print, computed once. It follows BenchSheet exactly: buildSchedule
 * order, the session's zone rule (venue zone with its short name when booked,
 * else the viewer's), printPixelRatio for diagrams, one combined legend.
 * Images come from injected renderers, so this module never touches a canvas.
 */
import type { PlayData } from "@/types/practice-planner";
import { buildLegend, type LegendEntry } from "@/lib/utils/canvas/legend";
import { combinedLegendData } from "@/lib/utils/canvas/station-map";
import { buildSchedule, sessionWallMinutes } from "@/lib/utils/session-timeline";
import { formatClockTime, formatLongDate, sessionStart, sessionTimeZone } from "@/lib/utils/date";
import { plannedLabel, stationsLabel } from "../SessionTimeline";
import { drillText, stationTag } from "../print/BenchSheetDrill";
import { printPixelRatio } from "../print/PrintDiagram";

export interface ExportSessionPlay {
    sequence: number;
    duration: number;
    instructions: string | null;
    runsWithPrevious: boolean;
    play: { name: string; description: string | null; playData: PlayData | null };
}

/** What the session page hands the Export menu (a PracticeSessionView fits). */
export interface ExportSession {
    title: string;
    date: string;
    duration: number;
    startAt?: string | null;
    venueTimezone?: string | null;
    teamName?: string | null;
    venueName?: string | null;
    surfaceName?: string | null;
    segmentName?: string | null;
    plays: ExportSessionPlay[];
}

export interface BenchSheetTimelineRow {
    start: string;
    minutes: number;
    /** The drill's name, or "Stations · N" for a station block */
    label: string;
    /** "Name · N min" per station, or null for a lone drill */
    stations: string[] | null;
}

export interface BenchSheetDrillItem {
    /** 1-based, in schedule order */
    number: number;
    name: string;
    /** The block's start, formatted */
    start: string;
    minutes: number;
    /** "Station 1 of 2", or null */
    station: string | null;
    /** A PNG data URI, or null when unreadable or not drawable */
    diagram: string | null;
    /** Instructions, else description, else null */
    text: string | null;
}

export interface BenchSheetModel {
    title: string;
    /** null: omitted */
    teamName: string | null;
    /** "Tuesday, April 7, 2026 · 6:00 PM – 7:00 PM MDT" */
    when: string;
    /** "Venue · Surface · Segment", or null when unbooked */
    place: string | null;
    timeline: BenchSheetTimelineRow[];
    planned: string;
    overTime: boolean;
    legend: Array<{ label: string; image: string | null }>;
    drills: BenchSheetDrillItem[];
}

export interface BenchSheetRenderers {
    /** A 720×306 diagram as a PNG data URI at this backing scale, or null when it can't be drawn */
    diagram(playData: PlayData, pixelRatio: number): string | null;
    /** One legend symbol as a PNG data URI, or null */
    swatch(entry: LegendEntry): string | null;
}

const MS_PER_MINUTE = 60_000;

export function buildBenchSheetModel(
    session: ExportSession,
    renderers: BenchSheetRenderers,
    options: { omitTeam?: boolean } = {},
): BenchSheetModel {
    const start = sessionStart(session);
    const end = new Date(start.getTime() + session.duration * MS_PER_MINUTE);
    const { timeZone, showZone } = sessionTimeZone(session);
    const time = (date: Date, withZone = showZone) => formatClockTime(date, timeZone, withZone);

    const rows = buildSchedule(session.plays, start);
    const ordered = rows.flatMap((row) =>
        row.group.stations.map((sp, k) => ({
            sp,
            startsAt: row.startsAt,
            station: row.group.stations.length > 1 ? stationTag(k + 1, row.group.stations.length) : null,
        })),
    );
    const pixelRatio = printPixelRatio(ordered.filter(({ sp }) => sp.play.playData !== null).length);
    const legendData = combinedLegendData(session.plays.map((sp) => ({ name: sp.play.name, playData: sp.play.playData })));
    const planned = sessionWallMinutes(session.plays);
    const team = session.teamName?.trim();

    return {
        title: session.title,
        teamName: options.omitTeam || !team ? null : team,
        when: `${formatLongDate(start, timeZone)} · ${time(start, false)} – ${time(end)}`,
        place: [session.venueName, session.surfaceName, session.segmentName].filter(Boolean).join(" · ") || null,
        timeline: rows.map(({ group, startsAt }) => {
            const block = group.stations.length > 1;
            return {
                start: time(startsAt),
                minutes: group.wallMinutes,
                label: block ? stationsLabel(group.stations.length) : group.stations[0].play.name,
                stations: block ? group.stations.map((sp) => `${sp.play.name} · ${sp.duration} min`) : null,
            };
        }),
        planned: plannedLabel(planned, session.duration),
        overTime: planned > session.duration,
        legend: legendData ? buildLegend(legendData).map((entry) => ({ label: entry.label, image: renderers.swatch(entry) })) : [],
        drills: ordered.map(({ sp, startsAt, station }, index) => ({
            number: index + 1,
            name: sp.play.name,
            start: time(startsAt),
            minutes: sp.duration,
            station,
            diagram: sp.play.playData ? renderers.diagram(sp.play.playData, pixelRatio) : null,
            text: drillText(sp.instructions, sp.play.description),
        })),
    };
}
```

- [ ] **Step 4: Run the tests**

Run: `bun run test __tests__/components/features/practice-planner/export`
Expected: PASS. If the timeline's station row orders differently, the fixture is wrong, not the model: `buildSchedule` sorts by `sequence`.

Run: `bun run type-check`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add components/features/practice-planner/export/labels.ts components/features/practice-planner/export/png.ts components/features/practice-planner/export/bench-sheet-model.ts __tests__/components/features/practice-planner/export/png.test.ts __tests__/components/features/practice-planner/export/bench-sheet-model.test.ts
/usr/bin/git commit -m "feat(practice-planner): bench sheet export model

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 3: Self-contained HTML renderer

**Files:**
- Create: `components/features/practice-planner/export/bench-sheet-html.ts`
- Test: `__tests__/components/features/practice-planner/export/bench-sheet-html.test.ts`

**Interfaces:**
- Consumes: `BenchSheetModel` (Task 2), `isPngDataUri` (Task 2), `NO_DRILLS_TEXT`, `DIAGRAM_UNAVAILABLE_TEXT`, `LEGEND_HEADING` (Task 2).
- Produces: `EXPORT_CSP: string`, `escapeHtml(text: string): string`, `renderBenchSheetHtml(model: BenchSheetModel): string`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/features/practice-planner/export/bench-sheet-html.test.ts`:

```ts
/** renderBenchSheetHtml: one offline file, escaped, no scripts, no requests, two drills per page. */
import { describe, expect, it } from "vitest";
import { EXPORT_CSP, escapeHtml, renderBenchSheetHtml } from "@/components/features/practice-planner/export/bench-sheet-html";
import type { BenchSheetModel } from "@/components/features/practice-planner/export/bench-sheet-model";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function drill(number: number, extra: Partial<BenchSheetModel["drills"][number]> = {}): BenchSheetModel["drills"][number] {
    return { number, name: `Drill ${number}`, start: "6:00 PM", minutes: 10, station: null, diagram: PNG, text: null, ...extra };
}

const MODEL: BenchSheetModel = {
    title: "Tuesday Skills",
    teamName: "Hawks U12",
    when: "Tuesday, April 7, 2026 · 6:00 PM – 7:00 PM MDT",
    place: "Ice House · Rink A",
    timeline: [
        { start: "6:00 PM MDT", minutes: 10, label: "Stations · 2", stations: ["Breakout · 10 min", "Regroup · 8 min"] },
        { start: "6:10 PM MDT", minutes: 15, label: "Shooting", stations: null },
    ],
    planned: "Planned 25 of 60 min",
    overTime: false,
    legend: [{ label: "Pass", image: PNG }],
    drills: [drill(1, { station: "Station 1 of 2", text: "Hard to the net" }), drill(2), drill(3)],
};

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

describe("escapeHtml", () => {
    it("escapes the five significant characters", () => {
        expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;");
    });
});

describe("renderBenchSheetHtml", () => {
    it("renders the header, timeline, legend and drills", () => {
        const doc = parse(renderBenchSheetHtml(MODEL));
        expect(doc.title).toBe("Tuesday Skills · Bench sheet");
        expect(doc.querySelector("h1")?.textContent).toBe("Tuesday Skills");
        expect(doc.querySelector(".team")?.textContent).toBe("Hawks U12");
        expect(doc.querySelector(".when")?.textContent).toBe(MODEL.when);
        expect(doc.querySelector(".place")?.textContent).toBe("Ice House · Rink A");
        const rows = Array.from(doc.querySelectorAll(".timeline tbody tr"));
        expect(rows.map((row) => row.querySelector("td")?.textContent)).toEqual(["6:00 PM MDT", "6:10 PM MDT"]);
        expect(Array.from(rows[0].querySelectorAll("li")).map((li) => li.textContent)).toEqual(["Breakout · 10 min", "Regroup · 8 min"]);
        expect(doc.querySelector(".planned")?.textContent).toBe("Planned 25 of 60 min");
        expect(doc.querySelector(".legend li")?.textContent?.trim()).toBe("Pass");
        expect(Array.from(doc.querySelectorAll("article.drill h2")).map((h) => h.textContent)).toEqual(["1. Drill 1", "2. Drill 2", "3. Drill 3"]);
        expect(doc.querySelector("article.drill .tag")?.textContent).toBe("Station 1 of 2");
        expect(doc.querySelector("article.drill .text")?.textContent).toBe("Hard to the net");
    });

    it("pairs drills into pages that each start a new page, inline so Docs and Word keep it", () => {
        const doc = parse(renderBenchSheetHtml(MODEL));
        const pages = Array.from(doc.querySelectorAll(".drills > .page"));
        expect(pages.map((page) => page.querySelectorAll("article.drill").length)).toEqual([2, 1]);
        for (const page of pages) expect(page.getAttribute("style")).toContain("page-break-before:always");
    });

    it("marks an over-time plan", () => {
        const doc = parse(renderBenchSheetHtml({ ...MODEL, overTime: true }));
        expect(doc.querySelector(".planned")?.classList.contains("over")).toBe(true);
    });

    it("escapes every user string, so nothing in a plan can become markup", () => {
        const evil = `</title><script>alert("x")</script><img src=x onerror=alert(1)>`;
        const html = renderBenchSheetHtml({
            ...MODEL,
            title: evil,
            teamName: `O'Neil & Sons`,
            place: evil,
            timeline: [{ start: "6:00 PM", minutes: 10, label: evil, stations: [evil] }],
            legend: [{ label: evil, image: PNG }],
            drills: [drill(1, { name: evil, station: evil, text: evil })],
        });
        const doc = parse(html);
        expect(doc.querySelectorAll("script")).toHaveLength(0);
        expect(doc.querySelectorAll("img:not([src^='data:image/png;base64,'])")).toHaveLength(0);
        expect(doc.querySelector("h1")?.textContent).toBe(evil);
        expect(doc.querySelector("article.drill img")?.getAttribute("alt")).toBe(`Diagram: ${evil}`);
        expect(html).toContain("O&#39;Neil &amp; Sons");
        expect(html).not.toMatch(/<script/i);
    });

    it("keeps line breaks in drill text, including Windows ones", () => {
        const doc = parse(renderBenchSheetHtml({ ...MODEL, drills: [drill(1, { text: "One\r\nTwo\nThree" })] }));
        const text = doc.querySelector("article.drill .text");
        expect(text?.querySelectorAll("br")).toHaveLength(2);
        expect(text?.textContent).toBe("OneTwoThree");
    });

    it("loads nothing and runs nothing", () => {
        const html = renderBenchSheetHtml(MODEL);
        for (const banned of ["<script", "<link", "@import", "url(", "href="]) expect(html).not.toContain(banned);
        for (const [, src] of html.matchAll(/src="([^"]*)"/g)) expect(src.startsWith("data:image/png;base64,")).toBe(true);
        const csp = parse(html).querySelector('meta[http-equiv="Content-Security-Policy"]');
        expect(csp?.getAttribute("content")).toBe(EXPORT_CSP);
        expect(EXPORT_CSP).toContain("default-src 'none'");
    });

    it.each([null, "data:,", "data:image/svg+xml;base64,PHN2Zz4=", "javascript:alert(1)"])(
        "shows Diagram unavailable for the image %j",
        (diagram) => {
            const doc = parse(renderBenchSheetHtml({ ...MODEL, drills: [drill(1, { diagram })] }));
            expect(doc.querySelector("article.drill img")).toBeNull();
            expect(doc.querySelector("article.drill .unavailable")?.textContent).toBe("Diagram unavailable");
        },
    );

    it("omits the team, place and legend when absent", () => {
        const doc = parse(renderBenchSheetHtml({ ...MODEL, teamName: null, place: null, legend: [] }));
        expect(doc.querySelector(".team")).toBeNull();
        expect(doc.querySelector(".place")).toBeNull();
        expect(doc.querySelector(".legend")).toBeNull();
    });

    it("says No drills planned for an empty session", () => {
        const doc = parse(renderBenchSheetHtml({ ...MODEL, timeline: [], legend: [], drills: [] }));
        expect(doc.querySelector(".empty")?.textContent).toBe("No drills planned");
        expect(doc.querySelector("table")).toBeNull();
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test __tests__/components/features/practice-planner/export/bench-sheet-html.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `components/features/practice-planner/export/bench-sheet-html.ts`:

```ts
/**
 * The bench sheet as one self-contained HTML file (sub-project 4): inline CSS,
 * PNG data-URI images, no script and no external request, so it opens offline
 * in any browser and imports into Google Docs. Layout rides on plain elements
 * and inline page breaks, which Docs and Word keep when they drop <style>.
 *
 * Safety: every interpolated value goes through escapeHtml unless this module
 * itself wrapped it as Trusted; image sources must pass isPngDataUri. The CSP
 * meta is defense in depth: even an escaping bug could not run or load anything.
 */
import type { BenchSheetDrillItem, BenchSheetModel } from "./bench-sheet-model";
import { DIAGRAM_UNAVAILABLE_TEXT, LEGEND_HEADING, NO_DRILLS_TEXT } from "./labels";
import { isPngDataUri } from "./png";

export const EXPORT_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

const DRILLS_PER_PAGE = 2;

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Text made safe for element content and quoted attribute values. */
export function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/** Markup this module produced: the only value `html` inserts unescaped. Never build one from input. */
class Trusted {
    constructor(readonly value: string) {}
}

type Part = string | number | Trusted | null | undefined | false | readonly Part[];

function emit(part: Part): string {
    if (part === null || part === undefined || part === false) return "";
    if (part instanceof Trusted) return part.value;
    if (typeof part === "string" || typeof part === "number") return escapeHtml(String(part));
    return part.map(emit).join("");
}

/** Escape-by-default template. */
function html(strings: TemplateStringsArray, ...parts: Part[]): Trusted {
    let out = strings[0];
    parts.forEach((part, index) => {
        out += emit(part) + strings[index + 1];
    });
    return new Trusted(out);
}

/** Escaped text with its line breaks as <br> (Docs and Word ignore white-space: pre-wrap). */
function multiline(text: string): Trusted {
    return new Trusted(text.split(/\r?\n/).map(escapeHtml).join("<br>"));
}

function chunk<T>(items: readonly T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}

/** "Digital Playbook" on paper. Fonts are named, never fetched. */
const STYLES = new Trusted(`
@page { margin: 12mm; }
html { background: #fff; }
body { margin: 0; color: #111; background: #fff; font: 11pt/1.4 "Cabinet Grotesk", "Avenir Next", "Segoe UI", system-ui, sans-serif; }
.sheet { max-width: 190mm; margin: 0 auto; padding: 12mm 4mm; }
h1, h2 { color: #0D47A1; line-height: 1.15; margin: 0 0 4px; }
h1 { font-size: 24pt; font-weight: 900; letter-spacing: -0.01em; }
h2 { font-size: 13pt; font-weight: 800; }
header { border-bottom: 3px solid #1976D2; padding-bottom: 8px; margin-bottom: 12px; }
header p { margin: 2px 0; }
.team { font-weight: 700; }
table { width: 100%; border-collapse: collapse; border: 1px solid #90A4AE; font-size: 10pt; }
th, td { border: 1px solid #90A4AE; padding: 4px 6px; text-align: left; vertical-align: top; }
th { background: #E3F2FD; color: #0D47A1; }
.time, .meta { font-family: "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace; }
td ul { margin: 2px 0 0; padding-left: 1.1em; }
.planned { margin: 6px 0 0; }
.planned.over { font-weight: 700; color: #C62828; }
.legend { margin-top: 14px; }
.legend ul { list-style: none; margin: 0; padding: 0; columns: 3 150px; }
.legend li { margin: 2px 0; break-inside: avoid; }
.legend img { vertical-align: middle; margin-right: 6px; }
.drill { break-inside: avoid; page-break-inside: avoid; margin: 0 0 14px; }
.meta { margin: 0 0 6px; font-size: 10pt; }
.tag { font-family: "Cabinet Grotesk", "Avenir Next", "Segoe UI", system-ui, sans-serif; font-weight: 700; border: 1px solid #111; padding: 0 4px; margin-left: 6px; }
.diagram { display: block; width: 100%; height: auto; border: 1px solid #CFD8DC; }
.unavailable { border: 1px dashed #999; color: #555; text-align: center; padding: 18% 0; margin: 0; }
.text { margin: 6px 0 0; }
.empty { font-weight: 700; }
@media screen { .page { border-top: 1px dashed #B0BEC5; margin-top: 16px; padding-top: 12px; } }
@media print { .sheet { max-width: none; padding: 0; } .diagram { max-height: 85mm; width: auto; max-width: 100%; } }
`);

function header(model: BenchSheetModel): Trusted {
    return html`<header>
<h1>${model.title}</h1>
${model.teamName ? html`<p class="team">${model.teamName}</p>` : null}
<p class="when">${model.when}</p>
${model.place ? html`<p class="place">${model.place}</p>` : null}
</header>`;
}

function timeline(model: BenchSheetModel): Trusted {
    const rows = model.timeline.map(
        (row) =>
            html`<tr><td class="time">${row.start}</td><td>${row.minutes}</td><td>${
                row.stations ? html`<strong>${row.label}</strong><ul>${row.stations.map((station) => html`<li>${station}</li>`)}</ul>` : row.label
            }</td></tr>
`,
    );
    return html`<section class="timeline">
<table border="1" cellpadding="4" cellspacing="0">
<thead><tr><th scope="col">Start</th><th scope="col">Min</th><th scope="col">Drill</th></tr></thead>
<tbody>
${rows}</tbody>
</table>
<p class="${model.overTime ? "planned over" : "planned"}">${model.planned}</p>
</section>`;
}

function legend(model: BenchSheetModel): Trusted | null {
    if (model.legend.length === 0) return null;
    const items = model.legend.map(
        (entry) => html`<li>${isPngDataUri(entry.image) ? html`<img src="${entry.image}" width="40" height="20" alt="">` : null}${entry.label}</li>`,
    );
    return html`<section class="legend">
<h2>${LEGEND_HEADING}</h2>
<ul>${items}</ul>
</section>`;
}

function drill(item: BenchSheetDrillItem): Trusted {
    const diagram = isPngDataUri(item.diagram)
        ? html`<img class="diagram" src="${item.diagram}" width="720" height="306" alt="${`Diagram: ${item.name}`}">`
        : html`<p class="unavailable">${DIAGRAM_UNAVAILABLE_TEXT}</p>`;
    return html`<article class="drill">
<h2>${item.number}. ${item.name}</h2>
<p class="meta">${item.start} · ${item.minutes} min${item.station ? html` <span class="tag">${item.station}</span>` : null}</p>
${diagram}
${item.text ? html`<p class="text">${multiline(item.text)}</p>` : null}
</article>
`;
}

function drills(model: BenchSheetModel): Trusted {
    const pages = chunk(model.drills, DRILLS_PER_PAGE).map(
        (page) => html`<div class="page" style="page-break-before:always;break-before:page">
${page.map(drill)}</div>
`,
    );
    return html`<section class="drills">
${pages}</section>`;
}

export function renderBenchSheetHtml(model: BenchSheetModel): string {
    const body =
        model.drills.length === 0
            ? html`<p class="empty">${NO_DRILLS_TEXT}</p>`
            : html`${timeline(model)}
${legend(model)}
${drills(model)}`;
    return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${new Trusted(EXPORT_CSP)}">
<meta name="generator" content="OpenLeague">
<title>${model.title} · Bench sheet</title>
<style>${STYLES}</style>
</head>
<body>
<main class="sheet">
${header(model)}
${body}
</main>
</body>
</html>
`.value;
}
```

- [ ] **Step 4: Run the test**

Run: `bun run test __tests__/components/features/practice-planner/export/bench-sheet-html.test.ts`
Expected: PASS.

Run: `bun run type-check`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add components/features/practice-planner/export/bench-sheet-html.ts __tests__/components/features/practice-planner/export/bench-sheet-html.test.ts
/usr/bin/git commit -m "feat(practice-planner): self-contained HTML bench sheet renderer

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 4: Lazy Word renderer, its guards, and the build check

**Files:**
- Modify: `package.json`, `bun.lock` (via `bun add`)
- Create: `components/features/practice-planner/export/bench-sheet-docx.ts`, `__tests__/helpers/zip.ts`
- Modify: `eslint.config.mjs` (the `adr-0020/portable-practice-planner` block)
- Modify: `scripts/check-planner-build.ts` (`REQUIRED_IN_BUNDLE`, new `LAZY_ONLY_IN_BUNDLE`, `checkPlannerBuild`)
- Test: `__tests__/components/features/practice-planner/export/bench-sheet-docx.test.ts` (new), `__tests__/scripts/check-planner-build.test.ts` (fixtures + new cases)

**Interfaces:**
- Consumes: `BenchSheetModel` (Task 2), `isPngDataUri`, `pngDataUriToBytes`, labels (Task 2).
- Produces: `DOCX_MIME_TYPE`, `renderBenchSheetDocxBytes(model): Promise<Uint8Array>`, `renderBenchSheetDocx(model): Promise<Blob>` (loaded only via `import("./bench-sheet-docx")`). `unzipEntry(zip: Uint8Array, name: string): Uint8Array | null`, `zipEntryNames(zip: Uint8Array): string[]`. `LAZY_ONLY_IN_BUNDLE` in the checker.

- [ ] **Step 1: Add the dependency and confirm the types hold**

Run: `bun add docx@^9.8.1`
Then: `bun run type-check`
Expected: no errors. `docx` installs its own `@types/node@^26` under `node_modules/docx/node_modules`; with `skipLibCheck: true` it does not collide with the root `^25` (verified in a scratch project). If `tsc` does report duplicate Node declarations, add `"overrides": { "@types/node": "^25.9.7" }` to `package.json`, run `bun install`, and re-run `bun run type-check`.

- [ ] **Step 2: Write the failing tests**

Create `__tests__/helpers/zip.ts`:

```ts
/** Test-only zip reader: one entry out of an archive (stored or deflated), via the central directory. */
import { inflateRawSync } from "node:zlib";

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;

function centralDirectory(zip: Uint8Array): { view: DataView; count: number; offset: number } {
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    let eocd = zip.length - 22;
    while (eocd >= 0 && view.getUint32(eocd, true) !== END_OF_CENTRAL_DIRECTORY) eocd--;
    if (eocd < 0) throw new Error("not a zip archive");
    return { view, count: view.getUint16(eocd + 10, true), offset: view.getUint32(eocd + 16, true) };
}

function* entries(zip: Uint8Array) {
    const { view, count, offset } = centralDirectory(zip);
    const decoder = new TextDecoder();
    let entry = offset;
    for (let i = 0; i < count; i++) {
        const nameLength = view.getUint16(entry + 28, true);
        yield {
            name: decoder.decode(zip.subarray(entry + 46, entry + 46 + nameLength)),
            method: view.getUint16(entry + 10, true),
            compressedSize: view.getUint32(entry + 20, true),
            localHeader: view.getUint32(entry + 42, true),
        };
        entry += 46 + nameLength + view.getUint16(entry + 30, true) + view.getUint16(entry + 32, true);
    }
}

export function zipEntryNames(zip: Uint8Array): string[] {
    return Array.from(entries(zip), (entry) => entry.name);
}

export function unzipEntry(zip: Uint8Array, name: string): Uint8Array | null {
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    for (const entry of entries(zip)) {
        if (entry.name !== name) continue;
        const start = entry.localHeader + 30 + view.getUint16(entry.localHeader + 26, true) + view.getUint16(entry.localHeader + 28, true);
        const data = zip.subarray(start, start + entry.compressedSize);
        return entry.method === 0 ? data : new Uint8Array(inflateRawSync(data));
    }
    return null;
}
```

Create `__tests__/components/features/practice-planner/export/bench-sheet-docx.test.ts`:

```ts
/** renderBenchSheetDocx: the bench sheet as a Word document. Bytes are unzipped and read as XML. */
import { describe, expect, it } from "vitest";
import {
    DOCX_MIME_TYPE,
    renderBenchSheetDocx,
    renderBenchSheetDocxBytes,
} from "@/components/features/practice-planner/export/bench-sheet-docx";
import type { BenchSheetModel } from "@/components/features/practice-planner/export/bench-sheet-model";
import { unzipEntry, zipEntryNames } from "@/__tests__/helpers/zip";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function drill(number: number, extra: Partial<BenchSheetModel["drills"][number]> = {}): BenchSheetModel["drills"][number] {
    return { number, name: `Drill ${number}`, start: "6:00 PM", minutes: 10, station: null, diagram: PNG, text: null, ...extra };
}

const MODEL: BenchSheetModel = {
    title: "Tuesday <Skills> & Co",
    teamName: "Hawks U12",
    when: "Tuesday, April 7, 2026 · 6:00 PM – 7:00 PM MDT",
    place: "Ice House · Rink A",
    timeline: [{ start: "6:00 PM MDT", minutes: 10, label: "Stations · 2", stations: ["Breakout · 10 min", "Regroup · 8 min"] }],
    planned: "Planned 10 of 60 min",
    overTime: false,
    legend: [{ label: "Pass", image: PNG }],
    drills: [
        drill(1, { name: `Breakout "fast"`, station: "Station 1 of 2", text: "Line one\r\nLine <two>" }),
        drill(2, { diagram: null }),
        drill(3),
    ],
};

async function documentXml(model: BenchSheetModel): Promise<string> {
    const zip = await renderBenchSheetDocxBytes(model);
    return new TextDecoder().decode(unzipEntry(zip, "word/document.xml") ?? new Uint8Array());
}

describe("renderBenchSheetDocx", () => {
    it("is a Word document Blob", async () => {
        const blob = await renderBenchSheetDocx(MODEL);
        expect(blob.type).toBe(DOCX_MIME_TYPE);
        expect(DOCX_MIME_TYPE).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        expect(blob.size).toBeGreaterThan(1000);
    });

    it("is a zip with the document, its media and its properties", async () => {
        const zip = await renderBenchSheetDocxBytes(MODEL);
        expect(String.fromCharCode(zip[0], zip[1])).toBe("PK");
        const names = zipEntryNames(zip);
        expect(names).toContain("word/document.xml");
        expect(names.some((name) => /^word\/media\/.+\.png$/.test(name))).toBe(true);
        const core = new TextDecoder().decode(unzipEntry(zip, "docProps/core.xml") ?? new Uint8Array());
        expect(core).toContain("<dc:title>Tuesday &lt;Skills&gt; &amp; Co</dc:title>");
        expect(core).toContain("<dc:creator>OpenLeague</dc:creator>");
    });

    it("writes every string as escaped text", async () => {
        const xml = await documentXml(MODEL);
        expect(xml).toContain("Tuesday &lt;Skills&gt; &amp; Co");
        expect(xml).toContain("1. Breakout &quot;fast&quot;");
        expect(xml).toContain("Line &lt;two&gt;");
        expect(xml).not.toContain("<two>");
        for (const text of ["Hawks U12", "Ice House · Rink A", "Stations · 2", "• Breakout · 10 min", "Planned 10 of 60 min", "Legend", "Pass", "Station 1 of 2"]) {
            expect(xml).toContain(text);
        }
    });

    it("starts every pair of drills on a new page", async () => {
        const xml = await documentXml(MODEL);
        expect(xml.match(/<w:pageBreakBefore\/>/g)).toHaveLength(2); // drills 1 and 3
    });

    it("embeds one picture per readable diagram and swatch, and says when a diagram is missing", async () => {
        const xml = await documentXml(MODEL);
        expect(xml.match(/<pic:pic\b/g)).toHaveLength(3); // 1 swatch + drills 1 and 3
        expect(xml).toContain("Diagram unavailable");
    });

    it("keeps a Windows line break as one break", async () => {
        const xml = await documentXml(MODEL);
        expect(xml.match(/<w:br\/>/g)).toHaveLength(1);
        expect(xml).not.toContain("\r");
    });

    it("says No drills planned for an empty session", async () => {
        const xml = await documentXml({ ...MODEL, timeline: [], legend: [], drills: [] });
        expect(xml).toContain("No drills planned");
        expect(xml).not.toContain("<w:tbl>");
    });
});
```

In `__tests__/scripts/check-planner-build.test.ts`:
- Add after `GOOD_JS`:

```ts
/** The lazily loaded Word export chunk. */
const LAZY_JS = 'const PART = "word/document.xml"; export {};';
```

- In the tests "passes a relative, CSP-protected, telemetry-free bundle" and "fails on an unguarded process.env read, but not a guarded one", add `"assets/docx-abc.js": LAZY_JS` to every fixture object that is expected to produce `[]`.
- Add inside `describe("checkPlannerBuild", …)`:

```ts
    it("fails when the Word export is in the entry chunk instead of its own lazy chunk", async () => {
        const problems = await checkPlannerBuild(await fixture({ "index.html": GOOD_HTML, "assets/index-abc.js": `${GOOD_JS}\n${LAZY_JS}` }));
        expect(problems.join("\n")).toMatch(/assets\/index-abc\.js \(the entry chunk\) contains "word\/document\.xml"/);
    });

    it("fails when no chunk carries the Word export", async () => {
        const problems = await checkPlannerBuild(await fixture({ "index.html": GOOD_HTML, "assets/index-abc.js": GOOD_JS }));
        expect(problems.join("\n")).toMatch(/word\/document\.xml/);
    });
```

- [ ] **Step 3: Run them to verify they fail**

Run: `bun run test __tests__/components/features/practice-planner/export/bench-sheet-docx.test.ts __tests__/scripts/check-planner-build.test.ts`
Expected: FAIL — the docx module doesn't exist; the two new checker cases fail.

- [ ] **Step 4: Implement**

Create `components/features/practice-planner/export/bench-sheet-docx.ts`:

```ts
/**
 * The bench sheet as a Word document (sub-project 4, ADR-0020). The only
 * module that imports `docx`, and export-bench-sheet.ts reaches it only through
 * import() on click, so neither the hosted nor the static main bundle carries
 * the library (ESLint and scripts/check-planner-build.ts enforce both halves).
 * `docx` escapes all text itself; images come only from PNG data URIs.
 */
// eslint-disable-next-line no-restricted-imports -- the one module allowed to load docx; reached only through import()
import { Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import type { BenchSheetModel } from "./bench-sheet-model";
import { DIAGRAM_UNAVAILABLE_TEXT, LEGEND_HEADING, NO_DRILLS_TEXT } from "./labels";
import { isPngDataUri, pngDataUriToBytes } from "./png";

export const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** US Letter portrait in twips, with 12 mm margins (680 twips). */
const PAGE = { size: { width: 12240, height: 15840 }, margin: { top: 680, right: 680, bottom: 680, left: 680 } };
/** The print diagram's 720×306 aspect, at a width that fits the text column. */
const DIAGRAM = { width: 680, height: 289 };
const SWATCH = { width: 30, height: 15 };
const LEAGUE_BLUE = "0D47A1";
const PENALTY_RED = "C62828";
const TABLE_HEADER_FILL = "E3F2FD";
const MONO = "Consolas";

interface RunStyle {
    bold?: boolean;
    italics?: boolean;
    font?: string;
    color?: string;
}

/** One run per line, joined by line breaks (\r\n or \n). */
function textRuns(text: string, style: RunStyle = {}): TextRun[] {
    return text.split(/\r?\n/).map((line, index) => new TextRun({ ...style, text: line, break: index > 0 ? 1 : undefined }));
}

function picture(dataUri: string, size: { width: number; height: number }, alt: string): ImageRun {
    return new ImageRun({ type: "png", data: pngDataUriToBytes(dataUri), transformation: size, altText: { name: alt || "Symbol", title: alt, description: alt } });
}

function header(model: BenchSheetModel): Paragraph[] {
    return [
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: textRuns(model.title, { bold: true, color: LEAGUE_BLUE }) }),
        ...(model.teamName ? [new Paragraph({ children: textRuns(model.teamName, { bold: true }) })] : []),
        new Paragraph({ children: textRuns(model.when) }),
        ...(model.place ? [new Paragraph({ children: textRuns(model.place) })] : []),
    ];
}

function cell(children: Paragraph[], isHeader = false): TableCell {
    return new TableCell({ children, shading: isHeader ? { fill: TABLE_HEADER_FILL } : undefined });
}

function timeline(model: BenchSheetModel): Array<Paragraph | Table> {
    const head = new TableRow({
        tableHeader: true,
        children: ["Start", "Min", "Drill"].map((label) => cell([new Paragraph({ children: textRuns(label, { bold: true, color: LEAGUE_BLUE }) })], true)),
    });
    const rows = model.timeline.map(
        (row) =>
            new TableRow({
                cantSplit: true,
                children: [
                    cell([new Paragraph({ children: textRuns(row.start, { font: MONO }) })]),
                    cell([new Paragraph({ children: textRuns(String(row.minutes)) })]),
                    cell(
                        row.stations
                            ? [
                                  new Paragraph({ children: textRuns(row.label, { bold: true }) }),
                                  ...row.stations.map((station) => new Paragraph({ children: textRuns(`• ${station}`) })),
                              ]
                            : [new Paragraph({ children: textRuns(row.label) })],
                    ),
                ],
            }),
    );
    return [
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: [1800, 900, 8180], rows: [head, ...rows] }),
        new Paragraph({ spacing: { before: 120 }, children: textRuns(model.planned, model.overTime ? { bold: true, color: PENALTY_RED } : {}) }),
    ];
}

function legend(model: BenchSheetModel): Paragraph[] {
    if (model.legend.length === 0) return [];
    return [
        new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240 }, children: textRuns(LEGEND_HEADING, { bold: true, color: LEAGUE_BLUE }) }),
        ...model.legend.map(
            (entry) =>
                new Paragraph({
                    children: [
                        ...(isPngDataUri(entry.image) ? [picture(entry.image, SWATCH, entry.label), new TextRun({ text: "  " })] : []),
                        ...textRuns(entry.label),
                    ],
                }),
        ),
    ];
}

/** Two drills per page: drills 1, 3, 5… start a page (so drills begin on page 2). */
function drills(model: BenchSheetModel): Paragraph[] {
    return model.drills.flatMap((drill, index) => {
        const startsPage = index % 2 === 0;
        return [
            new Paragraph({
                heading: HeadingLevel.HEADING_2,
                pageBreakBefore: startsPage,
                keepNext: true,
                spacing: { before: startsPage ? 0 : 360 },
                children: textRuns(`${drill.number}. ${drill.name}`, { bold: true, color: LEAGUE_BLUE }),
            }),
            new Paragraph({
                keepNext: true,
                children: [
                    ...textRuns(`${drill.start} · ${drill.minutes} min`, { font: MONO }),
                    ...(drill.station ? [new TextRun({ text: "  " }), ...textRuns(drill.station, { bold: true })] : []),
                ],
            }),
            isPngDataUri(drill.diagram)
                ? new Paragraph({ keepNext: drill.text !== null, children: [picture(drill.diagram, DIAGRAM, `Diagram: ${drill.name}`)] })
                : new Paragraph({ keepNext: drill.text !== null, children: textRuns(DIAGRAM_UNAVAILABLE_TEXT, { italics: true }) }),
            ...(drill.text ? [new Paragraph({ children: textRuns(drill.text) })] : []),
        ];
    });
}

function benchSheetDocument(model: BenchSheetModel): Document {
    const body =
        model.drills.length === 0
            ? [...header(model), new Paragraph({ children: textRuns(NO_DRILLS_TEXT, { bold: true }) })]
            : [...header(model), ...timeline(model), ...legend(model), ...drills(model)];
    return new Document({
        title: model.title,
        creator: "OpenLeague",
        sections: [{ properties: { page: PAGE }, children: body }],
    });
}

/** The .docx bytes (a zip). */
export async function renderBenchSheetDocxBytes(model: BenchSheetModel): Promise<Uint8Array> {
    return new Uint8Array(await Packer.toArrayBuffer(benchSheetDocument(model)));
}

export async function renderBenchSheetDocx(model: BenchSheetModel): Promise<Blob> {
    return new Blob([await renderBenchSheetDocxBytes(model)], { type: DOCX_MIME_TYPE });
}
```

In `eslint.config.mjs`, inside the `adr-0020/portable-practice-planner` block's `no-restricted-imports` options, add a message constant next to `PLANNER_PORTABILITY_MESSAGE`:

```js
const LAZY_DOCX_MESSAGE =
  "Load the Word export with import(\"./bench-sheet-docx\") inside the click, never statically: docx must stay out of the main bundles (ADR-0020).";
```

and extend `paths` and `patterns`:

```js
          paths: [
            // …existing entries, unchanged…
          ]
            .map((name) => ({ name, message: PLANNER_PORTABILITY_MESSAGE }))
            .concat([{ name: "docx", message: LAZY_DOCX_MESSAGE }]),
          patterns: [
            {
              group: ["next/*", "@/lib/actions/*", "@/lib/db/*", "@/lib/auth/*"],
              message: PLANNER_PORTABILITY_MESSAGE,
            },
            { group: ["**/bench-sheet-docx"], message: LAZY_DOCX_MESSAGE },
          ],
```

In `scripts/check-planner-build.ts`:
- Change `REQUIRED_IN_BUNDLE` and add `LAZY_ONLY_IN_BUNDLE` below it:

```ts
export const REQUIRED_IN_BUNDLE = ["openleague.practice-plan", "word/document.xml"];

/** Code that must load only on demand, by a literal only it contains. */
export const LAZY_ONLY_IN_BUNDLE: ReadonlyArray<{ pattern: string; reason: string }> = [
    { pattern: "word/document.xml", reason: "the Word export (docx) must load only through import(), on click" },
];

/** The module scripts index.html loads up front, relative to outDir. */
function entryScripts(html: string): string[] {
    return Array.from(html.matchAll(/<script\b[^>]*\bsrc="\.\/([^"]+\.js)"/g), (match) => match[1]);
}
```

- In `checkPlannerBuild`, after the `for (const [file, text] of contents)` loop, add:

```ts
    for (const entry of entryScripts(html)) {
        const text = contents.find(([file]) => file.split(path.sep).join("/") === entry)?.[1];
        if (text === undefined) continue;
        for (const { pattern, reason } of LAZY_ONLY_IN_BUNDLE) {
            if (text.includes(pattern)) problems.push(`${entry} (the entry chunk) contains "${pattern}": ${reason}`);
        }
    }
```

- Change the `REQUIRED_IN_BUNDLE` failure text to name the missing literal generically:

```ts
            problems.push(`no emitted file contains "${needle}": a required module is missing from the bundle`);
```

(The existing test "fails when the plan-document module is missing from the bundle" matches on `/openleague\.practice-plan/`, which the message still contains.)

- [ ] **Step 5: Run the tests and the lint guard**

Run: `bun run test __tests__/components/features/practice-planner/export __tests__/scripts/check-planner-build.test.ts`
Expected: PASS.

Run: `printf 'import { renderBenchSheetDocx } from "./bench-sheet-docx";\nexport const probe = renderBenchSheetDocx;\n' > components/features/practice-planner/export/lint-probe.ts && bunx eslint components/features/practice-planner/export/lint-probe.ts; rm components/features/practice-planner/export/lint-probe.ts`
Expected: one `no-restricted-imports` error with `LAZY_DOCX_MESSAGE`; the probe file is removed afterwards.

Run: `bun run type-check && bun run lint`
Expected: no errors (the docx module's own import is covered by its `eslint-disable-next-line`).

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add package.json bun.lock components/features/practice-planner/export/bench-sheet-docx.ts __tests__/helpers/zip.ts __tests__/components/features/practice-planner/export/bench-sheet-docx.test.ts eslint.config.mjs scripts/check-planner-build.ts __tests__/scripts/check-planner-build.test.ts
/usr/bin/git commit -m "feat(practice-planner): lazy Word bench sheet renderer

Adds docx (MIT) as the planner's one runtime dependency, imported only by
bench-sheet-docx.ts. ESLint forbids static imports of it in portable code;
the static build check fails if the entry chunk carries it.

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

(If `bun add` wrote `bun.lockb` instead of `bun.lock`, add that file.)

---

### Task 5: Export flow and menu items

**Files:**
- Create: `components/features/practice-planner/export/export-images.ts`, `components/features/practice-planner/export/export-bench-sheet.ts`
- Modify: `components/features/practice-planner/ExportPlanMenu.tsx`
- Test: `__tests__/components/features/practice-planner/export/export-images.test.ts`, `__tests__/components/features/practice-planner/ExportPlanMenu.bench-sheet.test.tsx`, `__tests__/components/features/practice-planner/ExportPlanMenu.docx-load-failure.test.tsx` (all new)

**Interfaces:**
- Consumes: `buildBenchSheetModel`, `ExportSession`, `BenchSheetRenderers` (Task 2); `renderBenchSheetHtml` (Task 3); `renderBenchSheetDocx` via `import()` (Task 4); `downloadBlob` (Task 1); `planExportFileName` (Task 1); `generateThumbnail`; `paintLegendSwatch`, `LEGEND_SWATCH_SIZE` (Task 1); `PRINT_DIAGRAM_SIZE`.
- Produces: `canvasRenderers: BenchSheetRenderers`; `type BenchSheetFormat = "html" | "docx"`; `class ExportModuleLoadError extends Error`; `exportBenchSheet(session: ExportSession, format: BenchSheetFormat, options: { omitTeam: boolean }): Promise<void>`; menu constants `PREPARING_HTML_NOTICE`, `PREPARING_DOCX_NOTICE`, `DOCX_LOAD_FAILED_NOTICE`, `EXPORT_FAILED_NOTICE`; `ExportableSession` becomes `ExportSession`.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/features/practice-planner/export/export-images.test.ts`:

```ts
/** canvasRenderers: the browser side of the exports. A drawing failure becomes null, never a failed export. */
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockGenerate } = vi.hoisted(() => ({ mockGenerate: vi.fn(() => "data:image/png;base64,AAAA") }));
vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: mockGenerate }));

import { canvasRenderers } from "@/components/features/practice-planner/export/export-images";
import type { LegendEntry } from "@/lib/utils/canvas/legend";
import { createEmptyPlayData } from "@/lib/utils/play-data";

afterEach(() => {
    vi.restoreAllMocks();
    mockGenerate.mockReset();
    mockGenerate.mockReturnValue("data:image/png;base64,AAAA");
});

describe("canvasRenderers.diagram", () => {
    it("draws at the bench sheet's 720×306 and the given pixel ratio", () => {
        const data = createEmptyPlayData();
        expect(canvasRenderers.diagram(data, 2)).toBe("data:image/png;base64,AAAA");
        expect(mockGenerate).toHaveBeenCalledWith(data, { width: 720, height: 306, pixelRatio: 2 });
    });

    it("returns null and warns when drawing throws", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        mockGenerate.mockImplementation(() => {
            throw new Error("no 2d context");
        });
        expect(canvasRenderers.diagram(createEmptyPlayData(), 3)).toBeNull();
        expect(warn).toHaveBeenCalled();
    });
});

const FORWARD: LegendEntry = { key: "role-F", label: "Forward", type: "role", role: "F" };

/** vitest.setup.ts's 2d context mock, plus a recording vi.fn for any method it lacks. */
function recordingContext() {
    const base = document.createElement("canvas").getContext("2d") as unknown as Record<string | symbol, unknown>;
    return new Proxy(base, {
        get(t, key) {
            if (!(key in t)) t[key] = vi.fn();
            return t[key];
        },
    }) as unknown as CanvasRenderingContext2D;
}

describe("canvasRenderers.swatch", () => {
    it("draws a 40×20 swatch at 2× and returns its PNG", () => {
        const ctx = recordingContext();
        let drawnOn: HTMLCanvasElement | undefined;
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
            drawnOn = this;
            return ctx;
        } as never);
        expect(canvasRenderers.swatch(FORWARD)).toBe("data:image/png;base64,mockImageData"); // vitest.setup.ts's toDataURL
        expect([drawnOn?.width, drawnOn?.height]).toEqual([80, 40]);
        expect(ctx.scale).toHaveBeenCalledWith(2, 2);
    });

    it("returns null without a 2d context", () => {
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
        expect(canvasRenderers.swatch(FORWARD)).toBeNull();
    });
});
```

Create `__tests__/components/features/practice-planner/ExportPlanMenu.bench-sheet.test.tsx`:

```tsx
/** Export plan → bench sheet (HTML) and Word document (.docx), sub-project 4. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const { mockDocx } = vi.hoisted(() => ({ mockDocx: vi.fn() }));
vi.mock("@/components/features/practice-planner/export/export-images", () => ({
    canvasRenderers: { diagram: () => PNG, swatch: () => PNG },
}));
vi.mock("@/components/features/practice-planner/export/bench-sheet-docx", () => ({ renderBenchSheetDocx: mockDocx }));

import {
    ExportPlanMenu,
    PREPARING_DOCX_NOTICE,
    type ExportableSession,
} from "@/components/features/practice-planner/ExportPlanMenu";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { createHashPlatform, renderWithPlanner } from "@/__tests__/helpers/planner";

const SESSION: ExportableSession = {
    title: "Tuesday Skills",
    date: "2026-04-07T22:00:00.000Z",
    duration: 60,
    startAt: null,
    venueTimezone: null,
    teamName: "Hawks U12",
    plays: [
        { sequence: 0, duration: 10, runsWithPrevious: false, instructions: "Hard", play: { name: "Breakout", description: null, playData: createEmptyPlayData() } },
    ],
};

let downloads: Array<{ download: string; blob: Blob }>;

beforeEach(() => {
    downloads = [];
    const blobs: Blob[] = [];
    mockDocx.mockReset();
    mockDocx.mockResolvedValue(new Blob(["PK"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob: Blob | MediaSource) => {
        blobs.push(blob as Blob);
        return `blob:${blobs.length}`;
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push({ download: this.download, blob: blobs[Number((this.getAttribute("href") ?? "").split(":")[1]) - 1] });
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

function readText(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
    });
}

function choose(name: string) {
    fireEvent.click(screen.getByRole("button", { name: "Export plan" }));
    fireEvent.click(screen.getByRole("menuitem", { name }));
}

describe("ExportPlanMenu bench sheet exports", () => {
    it("offers both document exports", () => {
        renderWithPlanner(<ExportPlanMenu session={SESSION} />);
        fireEvent.click(screen.getByRole("button", { name: "Export plan" }));
        expect(screen.getByRole("menuitem", { name: "Download bench sheet (HTML)" })).toBeInTheDocument();
        expect(screen.getByRole("menuitem", { name: "Download Word document (.docx)" })).toBeInTheDocument();
    });

    it("downloads the bench sheet as <slug>.html, team included on hosted", async () => {
        renderWithPlanner(<ExportPlanMenu session={SESSION} />);
        choose("Download bench sheet (HTML)");
        await waitFor(() => expect(downloads).toHaveLength(1));
        expect(downloads[0].download).toBe("tuesday-skills.html");
        expect(downloads[0].blob.type).toBe("text/html;charset=utf-8");
        const html = await readText(downloads[0].blob);
        expect(html).toContain("<h1>Tuesday Skills</h1>");
        expect(html).toContain('<p class="team">Hawks U12</p>');
        expect(html).toContain(`src="${PNG}"`);
        expect(mockDocx).not.toHaveBeenCalled();
    });

    it("leaves the placeholder team out of a static planner export", async () => {
        renderWithPlanner(<ExportPlanMenu session={{ ...SESSION, teamName: "This device" }} />, { platform: createHashPlatform() });
        choose("Download bench sheet (HTML)");
        await waitFor(() => expect(downloads).toHaveLength(1));
        expect(await readText(downloads[0].blob)).not.toContain("This device");
    });

    it("loads the Word renderer only on click and downloads <slug>.docx", async () => {
        renderWithPlanner(<ExportPlanMenu session={SESSION} />);
        expect(mockDocx).not.toHaveBeenCalled();
        choose("Download Word document (.docx)");
        await waitFor(() => expect(downloads).toHaveLength(1));
        expect(downloads[0].download).toBe("tuesday-skills.docx");
        expect(mockDocx).toHaveBeenCalledTimes(1);
        expect(mockDocx.mock.calls[0][0]).toMatchObject({ title: "Tuesday Skills", teamName: "Hawks U12" });
    });

    it("disables both exports while one runs, so a second click can't start another", async () => {
        let finish!: (blob: Blob) => void;
        mockDocx.mockReturnValue(new Promise<Blob>((resolve) => (finish = resolve)));
        renderWithPlanner(<ExportPlanMenu session={SESSION} />);
        choose("Download Word document (.docx)");
        expect(await screen.findByText(PREPARING_DOCX_NOTICE)).toBeInTheDocument();
        await waitFor(() => expect(mockDocx).toHaveBeenCalled());
        fireEvent.click(screen.getByRole("button", { name: "Export plan" }));
        expect(screen.getByRole("menuitem", { name: "Download bench sheet (HTML)" })).toHaveAttribute("aria-disabled", "true");
        expect(screen.getByRole("menuitem", { name: "Download Word document (.docx)" })).toHaveAttribute("aria-disabled", "true");
        finish(new Blob(["PK"]));
        await waitFor(() => expect(downloads).toHaveLength(1));
        await waitFor(() =>
            expect(screen.getByRole("menuitem", { name: "Download Word document (.docx)" })).not.toHaveAttribute("aria-disabled"),
        );
    });

    it("explains a failed export", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        mockDocx.mockRejectedValue(new Error("boom"));
        renderWithPlanner(<ExportPlanMenu session={SESSION} />);
        choose("Download Word document (.docx)");
        // The "Preparing…" notice is an alert too: wait for the error to replace it.
        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't create the file. Try again, or use Print bench sheet."));
        expect(downloads).toHaveLength(0);
    });
});
```

Create `__tests__/components/features/practice-planner/ExportPlanMenu.docx-load-failure.test.tsx`:

```tsx
/** The Word export's chunk can fail to load (an offline static planner that never fetched it, or a redeploy). */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("@/components/features/practice-planner/export/bench-sheet-docx", () => {
    throw new Error("Failed to fetch dynamically imported module");
});
vi.mock("@/components/features/practice-planner/export/export-images", () => ({
    canvasRenderers: { diagram: () => null, swatch: () => null },
}));

import { DOCX_LOAD_FAILED_NOTICE, ExportPlanMenu } from "@/components/features/practice-planner/ExportPlanMenu";
import { renderWithPlanner } from "@/__tests__/helpers/planner";

describe("ExportPlanMenu Word export offline", () => {
    it("says the Word export couldn't load and points at the HTML file", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        renderWithPlanner(
            <ExportPlanMenu session={{ title: "Tuesday Skills", date: "2026-04-07T22:00:00.000Z", duration: 60, plays: [] }} />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Export plan" }));
        fireEvent.click(screen.getByRole("menuitem", { name: "Download Word document (.docx)" }));
        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(DOCX_LOAD_FAILED_NOTICE));
        expect(DOCX_LOAD_FAILED_NOTICE).toBe(
            "Couldn't load the Word export. Check your connection and try again, or download the bench sheet (HTML).",
        );
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/components/features/practice-planner/export/export-images.test.ts __tests__/components/features/practice-planner/ExportPlanMenu.bench-sheet.test.tsx __tests__/components/features/practice-planner/ExportPlanMenu.docx-load-failure.test.tsx`
Expected: FAIL — `export-images` missing; menu items and constants missing.

- [ ] **Step 3: Implement**

Create `components/features/practice-planner/export/export-images.ts`:

```ts
/**
 * The canvas half of the bench sheet exports: diagrams exactly as the printed
 * bench sheet draws them, and legend swatches with the legend's own painter.
 * A drawing failure is logged and returns null, which the files show as
 * "Diagram unavailable" (or a label without its swatch); it never fails the export.
 */
import { generateThumbnail } from "@/lib/utils/canvas/thumbnail-generator";
import { LEGEND_SWATCH_SIZE, paintLegendSwatch } from "@/lib/utils/canvas/legend-swatch";
import { PRINT_DIAGRAM_SIZE } from "../print/PrintDiagram";
import type { BenchSheetRenderers } from "./bench-sheet-model";

const SWATCH_PIXEL_RATIO = 2;

export const canvasRenderers: BenchSheetRenderers = {
    diagram(playData, pixelRatio) {
        try {
            return generateThumbnail(playData, { width: PRINT_DIAGRAM_SIZE.width, height: PRINT_DIAGRAM_SIZE.height, pixelRatio });
        } catch (error) {
            console.warn("Bench sheet export: a diagram couldn't be drawn:", error);
            return null;
        }
    },
    swatch(entry) {
        try {
            const canvas = document.createElement("canvas");
            canvas.width = LEGEND_SWATCH_SIZE.width * SWATCH_PIXEL_RATIO;
            canvas.height = LEGEND_SWATCH_SIZE.height * SWATCH_PIXEL_RATIO;
            const ctx = canvas.getContext("2d");
            if (!ctx) return null;
            ctx.scale(SWATCH_PIXEL_RATIO, SWATCH_PIXEL_RATIO);
            paintLegendSwatch(ctx, entry);
            return canvas.toDataURL("image/png");
        } catch (error) {
            console.warn(`Bench sheet export: the "${entry.label}" legend swatch couldn't be drawn:`, error);
            return null;
        }
    },
};
```

Create `components/features/practice-planner/export/export-bench-sheet.ts`:

```ts
/**
 * Bench sheet downloads (sub-project 4): build the model with the canvas
 * renderers, then render HTML here or load the Word renderer with import(),
 * so `docx` never reaches either main bundle (ADR-0020).
 */
import { planExportFileName } from "@/lib/plan-document";
import { buildBenchSheetModel, type BenchSheetModel, type ExportSession } from "./bench-sheet-model";
import { renderBenchSheetHtml } from "./bench-sheet-html";
import { canvasRenderers } from "./export-images";
import { downloadBlob } from "./download";

export type BenchSheetFormat = "html" | "docx";

/** The Word renderer's chunk didn't load: offline, or a redeploy replaced it. */
export class ExportModuleLoadError extends Error {
    constructor(cause: unknown) {
        super("The Word export couldn't be loaded", { cause });
        this.name = "ExportModuleLoadError";
    }
}

/** Lets the menu close and the busy notice paint before the canvas work starts. */
function yieldToBrowser(): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, 0));
}

export async function exportBenchSheet(
    session: ExportSession,
    format: BenchSheetFormat,
    options: { omitTeam: boolean },
): Promise<void> {
    await yieldToBrowser();
    const model = buildBenchSheetModel(session, canvasRenderers, { omitTeam: options.omitTeam });
    if (format === "html") {
        const blob = new Blob([renderBenchSheetHtml(model)], { type: "text/html;charset=utf-8" });
        downloadBlob(blob, planExportFileName(session.title, "html"));
        return;
    }
    let renderDocx: (model: BenchSheetModel) => Promise<Blob>;
    try {
        renderDocx = (await import("./bench-sheet-docx")).renderBenchSheetDocx;
    } catch (error) {
        throw new ExportModuleLoadError(error);
    }
    downloadBlob(await renderDocx(model), planExportFileName(session.title, "docx"));
}
```

In `components/features/practice-planner/ExportPlanMenu.tsx`:
- Extend the icons import with `ArticleOutlined as WordIcon,` and `WebOutlined as HtmlIcon,`.
- Remove `import type { PlayData } from "@/types/practice-planner";` and add:

```ts
import type { ExportSession } from "./export/bench-sheet-model";
import { ExportModuleLoadError, exportBenchSheet, type BenchSheetFormat } from "./export/export-bench-sheet";
```

- Replace the whole `export interface ExportableSession { … }` block with:

```ts
/** What the session page passes (a PracticeSessionView fits). Team and venue names feed the bench sheet exports. */
export type ExportableSession = ExportSession;
```

- After `export const OPENED_IN_HOSTED_NOTICE = …;` add:

```ts
export const PREPARING_HTML_NOTICE = "Preparing the bench sheet…";
export const PREPARING_DOCX_NOTICE = "Preparing the Word document…";
export const DOCX_LOAD_FAILED_NOTICE =
    "Couldn't load the Word export. Check your connection and try again, or download the bench sheet (HTML).";
export const EXPORT_FAILED_NOTICE = "Couldn't create the file. Try again, or use Print bench sheet.";
```

- Inside `ExportPlanMenu`, after `const [notice, setNotice] = …;` add `const [exporting, setExporting] = useState<BenchSheetFormat | null>(null);`, and after `download` add:

```ts
    const exportSheet = async (format: BenchSheetFormat) => {
        setAnchor(null);
        if (exporting) return;
        setExporting(format);
        setNotice({ severity: "info", text: format === "html" ? PREPARING_HTML_NOTICE : PREPARING_DOCX_NOTICE });
        try {
            // The static planner's team is the placeholder "This device", not a name.
            await exportBenchSheet(session, format, { omitTeam: planGenerator === "openleague-static" });
            setNotice(null);
        } catch (error) {
            console.error("Bench sheet export failed:", error);
            setNotice({ severity: "error", text: error instanceof ExportModuleLoadError ? DOCX_LOAD_FAILED_NOTICE : EXPORT_FAILED_NOTICE });
        } finally {
            setExporting(null);
        }
    };
```

- In the `<Menu>`, between the "Download plan file" item and `{planLink && (`, add:

```tsx
                <MenuItem onClick={() => void exportSheet("html")} disabled={exporting !== null}>
                    <ListItemIcon>
                        <HtmlIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Download bench sheet (HTML)</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => void exportSheet("docx")} disabled={exporting !== null}>
                    <ListItemIcon>
                        <WordIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Download Word document (.docx)</ListItemText>
                </MenuItem>
```

- [ ] **Step 4: Run the tests**

Run: `bun run test __tests__/components/features/practice-planner __tests__/app/SessionDetailView* __tests__/apps/planner __tests__/lib/planner-store`
Expected: PASS — the new menu tests, the unchanged `ExportPlanMenu.test.tsx`, the session view, the static app and the portability walk (it follows the `import("./bench-sheet-docx")` edge and stops at the `docx` package).

Run: `bun run type-check && bun run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add components/features/practice-planner/export/export-images.ts components/features/practice-planner/export/export-bench-sheet.ts components/features/practice-planner/ExportPlanMenu.tsx __tests__/components/features/practice-planner/export/export-images.test.ts __tests__/components/features/practice-planner/ExportPlanMenu.bench-sheet.test.tsx __tests__/components/features/practice-planner/ExportPlanMenu.docx-load-failure.test.tsx
/usr/bin/git commit -m "feat(practice-planner): bench sheet HTML and Word downloads in the export menu

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 6: #391 leftovers — privacy note, file-versus-link race, `if` guard

**Files:**
- Modify: `apps/planner/src/screens/ImportScreen.tsx`
- Modify: `scripts/check-planner-build.ts` (`unguardedProcessEnvCount` and helpers)
- Test: `__tests__/apps/planner/import-screen.test.tsx`, `__tests__/apps/planner/app.test.tsx`, `__tests__/scripts/check-planner-build.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no new exports. `unguardedProcessEnvCount(text)` keeps its signature.

- [ ] **Step 1: Write the failing tests**

In `__tests__/apps/planner/import-screen.test.tsx`:
- Add `act` to the `@testing-library/react` import.
- In "imports a plan file and opens the new practice", replace `expect(screen.getByText(PRIVACY_NOTE)).toBeInTheDocument();` with:

```ts
        // AppShell's footer carries the note; the screen doesn't repeat it.
        expect(screen.queryByText(PRIVACY_NOTE)).toBeNull();
```

- Append inside `describe("ImportScreen", …)`:

```tsx
    it("keeps a link pasted while a chosen file is still being read", async () => {
        const { store } = memoryStore();
        const view = renderScreen(<ImportScreen store={store} linkValue={null} />, store);
        let finishRead!: (text: string) => void;
        const slow = new File(["{}"], "slow.olplan.json", { type: "application/json" });
        Object.defineProperty(slow, "text", { value: () => new Promise<string>((resolve) => (finishRead = resolve)) });
        chooseFile(slow);

        const link = await encodePlanLink(serializePlan({ ...INPUT, title: "Thursday Skating" }, "openleague-hosted"));
        window.history.replaceState(null, "", `/#plan=${link}`);
        view.rerender(wrapScreen(<ImportScreen store={store} linkValue={link} />, store));
        expect(await screen.findByText("Thursday Skating")).toBeInTheDocument();

        await act(async () => finishRead(JSON.stringify(PLAN)));
        expect(screen.queryByText("Tuesday Skills")).toBeNull();
        expect(screen.getByText("Thursday Skating")).toBeInTheDocument();
    });
```

In `__tests__/apps/planner/app.test.tsx`, append inside `describe("PlannerApp", …)`:

```tsx
    it("shows the privacy note once on the import screen (the footer's)", async () => {
        const { store } = memoryStore();
        window.history.replaceState(null, "", "/#/import");
        render(app(store));
        await screen.findByRole("button", { name: /choose plan file/i });
        expect(document.body.textContent?.split(PRIVACY_NOTE)).toHaveLength(2);
    });
```

In `__tests__/scripts/check-planner-build.test.ts`, append inside `describe("unguardedProcessEnvCount", …)`:

```ts
    it("treats the block directly under a typeof-process if as guarded", () => {
        expect(unguardedProcessEnvCount('if(typeof process<"u"){process.env.A}')).toBe(0);
        expect(unguardedProcessEnvCount('if (typeof process !== "undefined") { setup(); const a = process.env.A; }')).toBe(0);
        expect(unguardedProcessEnvCount("if(typeof process!='undefined'){x=1,y=process.env.A}")).toBe(0);
        expect(unguardedProcessEnvCount('if(typeof process==="object"){process.env.A}')).toBe(0);
    });

    it("stays strict about everything else an if touches", () => {
        // the else branch, a nested block, an object literal, an escape hatch, a negated check, a later statement
        expect(unguardedProcessEnvCount('if(typeof process<"u"){}else{process.env.A}')).toBe(1);
        expect(unguardedProcessEnvCount('if(typeof process<"u"){if(x){process.env.A}}')).toBe(1);
        expect(unguardedProcessEnvCount('if(typeof process<"u"){f({a:process.env.A})}')).toBe(1);
        expect(unguardedProcessEnvCount('if(typeof process<"u"||y){process.env.A}')).toBe(1);
        expect(unguardedProcessEnvCount('if(typeof process==="undefined"){process.env.A}')).toBe(1);
        expect(unguardedProcessEnvCount('if(typeof process<"u"){a()}process.env.B')).toBe(1);
        expect(unguardedProcessEnvCount('elif(typeof process<"u"){process.env.A}')).toBe(1);
    });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/apps/planner/import-screen.test.tsx __tests__/apps/planner/app.test.tsx __tests__/scripts/check-planner-build.test.ts`
Expected: FAIL — the note appears twice / once on the bare screen; the slow file overwrites "Thursday Skating"; the four guarded cases count 1.

- [ ] **Step 3: Implement**

In `apps/planner/src/screens/ImportScreen.tsx`:
- Delete `import { PRIVACY_NOTE } from "../config";` and the trailing block

```tsx
                <Typography variant="body2" color="text.secondary">
                    {PRIVACY_NOTE}
                </Typography>
```

- Replace the `latestLink` ref and its comment with:

```ts
    // The newest choice (a link read or a file pick); an older one's result is dropped when it lands.
    const latestChoice = useRef<symbol | null>(null);
```

- Replace the `useEffect` body's token lines so it reads:

```ts
    useEffect(() => {
        if (!pending) return;
        const choice = Symbol("link");
        latestChoice.current = choice;
        // The plan must not linger in the address bar or history. This routes to
        // #/import and clears `pending`, so the read below must outlive it.
        replaceHash(staticRoutes.importPlan());
        void readPlanLink(pending).then((result) => {
            if (latestChoice.current === choice) setState(toViewState(result));
        });
    }, [pending]);
```

- Replace `onFile` with:

```ts
    const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = ""; // choosing the same file again still fires change
        if (!file) return;
        const choice = Symbol("file");
        latestChoice.current = choice;
        setSaveError(null);
        const result = await readPlanFile(file);
        // A link pasted while the file was being read wins.
        if (latestChoice.current === choice) setState(toViewState(result));
    };
```

In `scripts/check-planner-build.ts`, below `TYPEOF_PROCESS` add:

```ts
/** An if condition that proves `process` exists: `!== "undefined"`, `!= "undefined"`, minified `<"u"`, or `=== "object"`. */
const PROCESS_EXISTS = /\btypeof\s+process\s*(?:!==?\s*["']undefined["']|<\s*["']u["']|===?\s*["']object["'])/;

/** The `{` of the innermost block or object literal still open at `index`, or -1. Strings aren't parsed. */
function enclosingBrace(text: string, index: number): number {
    let depth = 0;
    for (let i = index - 1; i >= 0; i--) {
        if (text[i] === "}") depth++;
        else if (text[i] === "{") {
            if (depth === 0) return i;
            depth--;
        }
    }
    return -1;
}

/**
 * True when the `{` at `brace` opens the block of `if (cond)` and `cond` proves
 * `process` exists with no `||` to escape it. Bundlers keep guards like
 * `if(typeof process<"u"){…process.env…}`. Deliberately strict: only that
 * block's own statements count, never an `else` block, a nested block, function
 * or object literal, or anything after the closing `}`.
 */
function opensProcessGuardedIf(text: string, brace: number): boolean {
    if (brace < 0) return false;
    let close = brace - 1;
    while (close >= 0 && /\s/.test(text[close])) close--;
    if (text[close] !== ")") return false;
    let depth = 0;
    let open = -1;
    for (let i = close; i >= 0; i--) {
        if (text[i] === ")") depth++;
        else if (text[i] === "(" && --depth === 0) {
            open = i;
            break;
        }
    }
    if (open < 0) return false;
    let keyword = open - 1;
    while (keyword >= 0 && /\s/.test(text[keyword])) keyword--;
    if (text.slice(keyword - 1, keyword + 1) !== "if" || /[\w$]/.test(text[keyword - 2] ?? "")) return false;
    const condition = text.slice(open + 1, close);
    return PROCESS_EXISTS.test(condition) && !condition.includes("||");
}
```

and in `unguardedProcessEnvCount` replace the counting line with:

```ts
        const guarded =
            TYPEOF_PROCESS.test(enclosingExpression(text, match.index)) ||
            opensProcessGuardedIf(text, enclosingBrace(text, match.index));
        if (!guarded) count++;
```

and extend its doc comment with one line: `A read in the block directly under a process-proving \`if\` is guarded too (opensProcessGuardedIf).`

- [ ] **Step 4: Run the tests**

Run: `bun run test __tests__/apps/planner __tests__/scripts/check-planner-build.test.ts`
Expected: PASS, including every pre-existing `unguardedProcessEnvCount` case.

Run: `bun run type-check && bunx eslint apps/planner scripts/check-planner-build.ts`
Expected: no errors (`Typography` is still used elsewhere in `ImportScreen`).

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add apps/planner/src/screens/ImportScreen.tsx scripts/check-planner-build.ts __tests__/apps/planner/import-screen.test.tsx __tests__/apps/planner/app.test.tsx __tests__/scripts/check-planner-build.test.ts
/usr/bin/git commit -m "fix(practice-planner): static import and build-check leftovers from #391

- the import screen no longer repeats the footer's privacy note
- a link pasted while a file is being read is no longer overwritten
- the bundle check accepts process.env inside an if (typeof process ...) block

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 7: ADR-0020, roadmap and gates

**Files:**
- Modify: `docs/adr/0020-exchange-practice-plans-as-a-portable-versioned-document-and-ship-a-static-local.md`
- Modify: `docs/superpowers/specs/2026-10-03-static-planner-roadmap.md` (row 4)
- Modify: `docs/superpowers/specs/2026-10-03-plan-doc-exports-design.md` (status line only, if the gates surface a change)

**Interfaces:** none.

- [ ] **Step 1: Amend ADR-0020**

- In `## Decision`, after the "**A static local-first planner.**" bullets, add:

```markdown
**Document exports (sub-project 4).**
- Both deployables export a session as a self-contained HTML bench sheet (inline CSS, PNG data-URI diagrams, no script, no external request, a restrictive CSP meta) and as a Word document.
- The Word document is built by `docx` (MIT), the planner's only runtime dependency. Exactly one module imports it, and only through `import()` on click, so neither main bundle carries it. ESLint forbids static imports of it in portable code, and the static build check fails if the entry chunk contains it.
```

- In `## Trade-offs`, add:

```markdown
**One lazy runtime dependency.** `docx` (≈ 118 KB gzip with `jszip`) is a supply-chain and upgrade cost the planner did not have. It loads only when a coach asks for a Word file, and a Word file is the one format Word imports reliably with images; HTML alone is not.
```

- In `## Action items`, change `4. [ ] Sub-project 4: HTML and \`.docx\` exports.` to `4. [x] Sub-project 4: HTML and \`.docx\` exports.`

- [ ] **Step 2: Update the roadmap row**

In `docs/superpowers/specs/2026-10-03-static-planner-roadmap.md`, replace row 4's status `Spec to write` with:

```markdown
Built: spec `2026-10-03-plan-doc-exports-design.md`, plan `../plans/2026-10-03-plan-doc-exports.md`
```

- [ ] **Step 3: Run every gate**

Run each; all must pass:

```bash
bun run type-check
bun run lint
bun run test
bun run build
bun run planner:build && bun run planner:check
bun run adr:lint
bun run adr:check-integrity
bun run check:raw-sql
```

Expected: green. `planner:check` passes only if the docx code landed in a lazy chunk (`word/document.xml` present somewhere, absent from the `index-*.js` entry). If `planner:check` reports the entry chunk, a static import of `bench-sheet-docx` or `docx` slipped in: find it with `grep -rn "bench-sheet-docx\|from \"docx\"" components apps lib app`.

Also confirm the chunk split by hand:

```bash
grep -l "word/document.xml" dist/planner/assets/*.js
grep -o 'src="./assets/[^"]*"' dist/planner/index.html
```

Expected: the first lists one non-entry chunk; the second names an entry chunk not in that list.

- [ ] **Step 4: Manual checks (record results in the PR description)**

1. `bun run planner:preview`, open a practice, Export plan → Download bench sheet (HTML). Open the file with the network off in Chrome and Safari: header, timeline, legend on page 1; print preview shows two drills per page; DevTools Network shows no request.
2. Upload the `.html` to Google Drive → Open with Google Docs: headings, table, images and page breaks survive.
3. Download the `.docx`; open in Word (or LibreOffice) and Google Docs: title, table, legend swatches, diagrams, two drills per page.
4. Hosted (`bun run dev`), session page: DevTools Network shows no chunk containing `docx` until "Download Word document (.docx)" is clicked; a booked session's times carry the venue zone suffix in both files.
5. Static app, DevTools offline after first load without ever exporting Word: clicking the Word item shows `DOCX_LOAD_FAILED_NOTICE`; the HTML export still works.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add docs/adr/0020-exchange-practice-plans-as-a-portable-versioned-document-and-ship-a-static-local.md docs/superpowers/specs/2026-10-03-static-planner-roadmap.md
/usr/bin/git commit -m "docs(practice-planner): record document exports in ADR-0020 and the roadmap

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

## Self-review notes

- **Spec coverage.** Decisions 1–10 → Tasks 4, 3, 2, 1+5, 2, 1, 5, 1, 4, 7. Model → Task 2. HTML file → Task 3. Word document → Task 4. Export flow, menu states and both failure notices → Task 5. Leftovers (a), (b), (c) → Task 6. Testing list → Tasks 1–6; gates and manual checks → Task 7.
- **Names used across tasks.** `ExportSession`, `BenchSheetModel`, `BenchSheetRenderers`, `buildBenchSheetModel` (Task 2) → Tasks 3, 4, 5. `renderBenchSheetHtml` (3) → 5. `renderBenchSheetDocx` (4) → 5 via `import()`. `downloadBlob`, `planExportFileName`, `paintLegendSwatch`, `LEGEND_SWATCH_SIZE` (1) → 5. `isPngDataUri`, `pngDataUriToBytes`, labels (2) → 3, 4.
- **Known heuristic limits** (documented, not bugs): the build checker does not parse strings, so a `{`, `}` or `if(` inside a string literal could mislead it; it errs toward counting a read as unguarded.
