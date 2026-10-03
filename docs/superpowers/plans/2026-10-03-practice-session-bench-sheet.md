# Practice Sessions: Timeline & Bench Sheet (3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show coaches when each block of a practice runs (start clock times, block lengths, planned versus booked minutes) on the session page, and let them print a bench sheet: page 1 with the header, timeline and one combined legend, then every drill's diagram and instructions, two per page.

**Architecture:**
- A pure `buildSchedule` in `lib/utils/session-timeline.ts` turns the 2b station groups into instants. Formatting lives in `lib/utils/date.ts`. A small client hook, `useClockText`, decides when a time can be rendered without a hydration mismatch.
- A new `SessionTimeline` component, with a screen variant and a print variant, is mounted in `SessionDetailView`. The view also gets a zone-aware header and a "Print bench sheet" link.
- A new `(print)` route group serves `/practice-planner/[sessionId]/print`. Its layout has auth, a light-scheme pin and `print.css`, and no dashboard chrome. The page is a server component that reuses `getPracticeSessionDetail` and renders a client `BenchSheet`.
- `BenchSheet` draws each diagram once through `generateThumbnail`, which gains a `pixelRatio` option, into an `<img>`.

**Tech Stack:** TypeScript (strict), Next.js 16 App Router, React 19, MUI v7, Prisma 7, Vitest 4 + Testing Library (jsdom), Bun.

**Spec:** `docs/superpowers/specs/2026-10-03-practice-session-timeline-bench-sheet-design.md` (accepted decisions: `docs/superpowers/specs/2026-10-03-practice-planner-roadmap.md`, "Phase 3b").

## Global Constraints

- **Base.** Branch `feat/practice-bench-sheet`. Line numbers in this plan are taken at commit `45a5507`. If a line has shifted, find the edit by its quoted anchor text.
- Use `bun` for everything: `bun run test <file>`, `bun run type-check`, `bun run lint`, `bun run build`. Never use npm or yarn. Never use `git stash`.
- **No new dependencies**, no schema change and no migration. `Venue.timezone` already exists (`String @default("America/New_York")`).
- **ADRs** that touch these paths:
  - **0002:** no new mutation. The query change is read-only and stays in `lib/actions/practice-session-queries.ts`.
  - **0003:** Prisma only; the query adds one field to an existing `select`.
  - **0004:** MUI is the component library. The print variant uses a plain `<table>` because the spec asks for one.
  - **0005:** Bun toolchain.
  - **0011:** no public or shareable print link. The print route sits behind the same gate as the detail page.
  - **0019:** type-check, lint and the full suite gate the PR.
- **Diagram size, verbatim:** `generateThumbnail(playData, { width: 720, height: 306, pixelRatio: 3 })`, which gives a 2160×918 backing canvas. `pixelRatio` defaults to 1 and is clamped to [1, 4].
- **Copy, verbatim** (`·` is U+00B7 with a space on each side; `–` is U+2013; `—` is U+2014):
  - detail-page button: `Print bench sheet` (`PrintOutlined` icon, `href="/practice-planner/<id>/print"`, `target="_blank"`, `rel="noopener"`)
  - timeline footer: `Planned X of Y min`, plus ` (over time!)` when X > Y
  - station row label: `Stations · N`
  - bench-sheet station tag: `Station k of N`
  - toolbar: `Print`, `Back to session`
  - missing diagram: `Diagram unavailable`; while rendering: `Rendering diagram…`
  - empty session: `No drills planned`
  - clock time: `6:00 PM`, or `6:00 PM EDT` with a venue zone
  - not-yet-mounted time placeholder: `—`
- **`app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx` must stay at or under 900 lines.** It is 822 at `45a5507`. From Task 4 on, a Vitest test enforces this.
- **Never use `component={Link}` from a Server Component.** The two new server files (`app/(print)/layout.tsx` and the print `page.tsx`) render only `LightThemeScope` and `BenchSheet`. `BenchSheet` is `"use client"` and uses `LinkButton` from `components/ui/NextLinkComposites.tsx`.
- **Dates in tests are fixed ISO strings.** No test reads the real clock. A test that depends on the runtime's zone compares against the same helper called with no zone, never against a literal.
- IDs that pass through a Zod schema in tests must look like cuids (`csessionxxxxxxxxxxxxxxxxx`).
- Commit messages are conventional commits, with a blank line and then `Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX` at the end.
- At the end of every task, `bun run type-check` and that task's own Vitest files must be green.

## Rulings (spec gaps and contradictions, decided during planning)

1. **Hydration: client-only viewer-zone times, not `suppressHydrationWarning`.**
   - `suppressHydrationWarning` only silences the warning: React keeps the server's text, so an unbooked session would keep showing the server's zone (UTC on Vercel).
   - Instead, `useClockText(timeZone, showZone)` (`lib/hooks/useClockText.ts`) is built on `useMounted()` (`useSyncExternalStore`, whose server snapshot is `false`).
   - With a venue zone (`showZone` true), server and browser format the same instant in the same zone, so the time renders immediately.
   - Without one, the server and the hydration pass render `—`, and the real time appears right after mount.
   - `formatClockTime` replaces ICU's narrow no-break space (U+202F) before AM/PM with a plain space, so server and browser strings match across ICU versions.
2. **One start for the header.** The detail-page header formats `sessionStart(session)`, which is `startAt ?? date`, for both its date and its time, using the zone rule. The booking line (`venue · surface · segment`) drops its separate start time, because the header now shows it.
3. **"X / Y min" moves into the timeline.** The header keeps the "Time allocation" caption and the progress bar. The numbers move to the timeline footer, `Planned X of Y min`, which keeps the existing over-time styling (`error.main`, weight 700, ` (over time!)`).
   - Two 2b assertions change as a result. In `__tests__/app/practice-session-detail-stations.test.tsx`, `"25 / 60 min"` becomes `"Planned 25 of 60 min"` and `"45 / 60 min"` becomes `"Planned 45 of 60 min"`. Task 4 makes those edits.
4. **The screen timeline renders only when the session has drills.** An empty session keeps its existing `EmptyState`. The bench sheet prints `No drills planned` in place of the timeline, legend and drills.
5. **A bench-sheet drill's time and number.**
   - Its start time is its block's start.
   - Its minutes are the drill's own `duration`, not the block's wall time.
   - Its number is its 1-based position in sequence order, which is how the detail view numbers drills.
   - Instructions fall back to the description after trimming, so whitespace-only instructions count as none. When both are empty, no text block renders.
6. **Page breaks.**
   - The drills section has `break-before: page`, so drills start on page 2.
   - `break-after: page` goes on every second drill **except the last**. Otherwise an even drill count would print a blank final page.
   - Every drill has `break-inside: avoid`.
7. **Legend swatches.** `PlayLegend.tsx`'s private `Swatch` is renamed and exported as `LegendSwatch`. This is a rename and an `export` only; `PlayLegend`'s output does not change. `LegendList` reuses it.
   - `combinedLegendData` returns `null` when no drill is readable, and `LegendList` then renders nothing.
   - De-duplication comes from `buildLegend`'s `Set`s. A test pins it.
8. **`pixelRatio` details.**
   - A non-finite value (`NaN`, `±Infinity`) means the default, 1. Anything else is clamped to [1, 4].
   - At ratio 1 the canvas size is assigned exactly as today, without `Math.round`, and `scale` is not called, so the output is byte-identical.
   - Above ratio 1, the rink is drawn with `cachedRink: false`. `drawRink`'s direct path fills white under an identity transform, sized to the *logical* canvas, so under `scale(pr)` that fill covers only the top-left of the backing store. This is invisible: `generateThumbnail`'s own background fill (default `#FFFFFF`) runs after `scale` and covers everything, and `PrintDiagram` uses the default. `drawRink` is not changed.
9. **`<img>`, not `next/image`.** `next/image` lazy-loads by default, and a lazy image below the fold may be missing from the printout. `PrintDiagram` renders a plain `<img loading="eager">` with a scoped `eslint-disable-next-line @next/next/no-img-element`.
10. **The diagram is computed in a memo after mount, not in `useEffect` with `setState`.** This avoids the repo's `react-hooks/set-state-in-effect` warning. Before mount the memo returns `null`, because `document` doesn't exist on the server. A failure logs `console.warn` and shows `Diagram unavailable`.
11. **`sessionTimeZone` checks `venueTimezone`, not `venueId`.** The query returns `venueTimezone` only when a venue is attached, so the two agree. Keying on the zone's validity also covers a stored value that `Intl` rejects.
12. **`print.css` is global CSS imported by `app/(print)/layout.tsx`.** After a client-side "Back to session" it stays loaded in that tab. Every rule in it is either print-only or scoped to `bench-*` / `no-print` classes, except `@page { margin: 12mm }`, which then also applies to printing a dashboard page in that tab. That is accepted.
13. **The bench-sheet time range shows the zone once, at the end:** `6:00 PM – 7:00 PM MDT`.
14. **A zero-minute session** (bad stored data) shows `Planned X of 0 min (over time!)`, and its progress bar reads 100, not `NaN`.
15. **Manual print checks** in Chrome and Safari (the spec's test plan) go into the PR description as a reviewer checklist. The dev database is far behind on migrations, so the executor can't click through a live page.
16. **Extra exports** beyond the spec, which later tasks rely on:
    - `formatLongDate` and `SessionClockSource` (`lib/utils/date.ts`)
    - `useMounted`, `useClockText`, `ClockText` and `TIME_PLACEHOLDER` (`lib/hooks/useClockText.ts`)
    - the `PracticeSessionDetail` type (`lib/actions/practice-session-queries.ts`)
    - `stationsLabel`, `plannedLabel` and `SessionTimelinePlay` (`SessionTimeline.tsx`)
    - `PRINT_DIAGRAM_SIZE` and `DIAGRAM_UNAVAILABLE` (`PrintDiagram.tsx`)
    - `drillText` and `stationTag` (`BenchSheetDrill.tsx`)
    - `NO_DRILLS_MESSAGE` and `BenchSheetSession` (`BenchSheet.tsx`)
    - `MAX_THUMBNAIL_PIXEL_RATIO` (`thumbnail-generator.ts`)

## Review Focus

1. **Unbooked sessions must hydrate without showing the server's zone.** A server render of the timeline or header with no venue zone contains `—` and no clock time. A booked one contains `6:00 PM EDT`. Owned by Task 4 (`useClockText` SSR tests and the `SessionTimeline` SSR test).
2. **A stored `Venue.timezone` that `Intl` rejects** must fall back to the viewer's zone with no suffix, and never throw. Owned by Task 2 (`sessionTimeZone`, `formatClockTime` with `Not/AZone`) and Task 6 (a bench sheet with `venueTimezone: "Not/AZone"`).
3. **An even number of drills must not print a blank last page.** Owned by Task 6 (4 drills: only the second drill carries the page-end class; 5 drills: the second and fourth).
4. **Whitespace-only instructions, or a drill with neither instructions nor description.** The first falls back to the description; the second renders no text block. Owned by Task 5 (`drillText`) and Task 6 (the rendered drill).
5. **A zero-minute session** must not render `NaN`. Owned by Task 4 (`Planned 25 of 0 min (over time!)`, progress `aria-valuenow` 100).

A related case already covered: pressing Print right after the page loads. Diagrams are generated in the first render after mount, so Task 6 asserts that every readable drill has its `<img>` immediately after `render`.

---

### Task 1: `generateThumbnail` pixel ratio

**Files:**
- Modify: `lib/utils/canvas/thumbnail-generator.ts:35-82` (`ThumbnailOptions` and `generateThumbnail`)
- Test: `__tests__/lib/utils/canvas/thumbnail-pixel-ratio.test.ts` (create)

**Interfaces:**
- Consumes: `drawBoardScene(ctx, transform, playData, { maskRect, cachedRink })` from `lib/utils/canvas/drawing-utils.ts:341`, where `cachedRink` defaults to `true`.
- Produces: `ThumbnailOptions.pixelRatio?: number`, and `export const MAX_THUMBNAIL_PIXEL_RATIO = 4`. `generateThumbnail(playData, { width: 720, height: 306, pixelRatio: 3 })` returns a PNG data URL from a 2160×918 canvas. Task 5's `PrintDiagram` calls it.

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/utils/canvas/thumbnail-pixel-ratio.test.ts`:

```ts
/** generateThumbnail's pixelRatio (3b): a sharper backing store for print, same geometry. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateThumbnail, THUMBNAIL_DIMENSIONS } from "@/lib/utils/canvas/thumbnail-generator";
import { clearRinkCache } from "@/lib/utils/canvas/rink-renderer";
import { createEmptyPlayData } from "@/lib/utils/play-data";

type Call = { name: string; args: unknown[] };
type FakeCanvas = { width: number; height: number; calls: Call[] };

function recordingCtx(calls: Call[]): CanvasRenderingContext2D {
    const target: Record<string, unknown> = {};
    return new Proxy(target, {
        get(t, prop) {
            if (typeof prop !== "string") return undefined;
            if (prop in t) return t[prop];
            return (...args: unknown[]) => {
                calls.push({ name: prop, args });
                return { width: 10 };
            };
        },
        set(t, prop, value) {
            if (typeof prop === "string") t[prop] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
}

describe("generateThumbnail pixelRatio", () => {
    let canvases: FakeCanvas[];

    beforeEach(() => {
        clearRinkCache();
        canvases = [];
        const real = document.createElement.bind(document);
        vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
            if (tag !== "canvas") return real(tag);
            const calls: Call[] = [];
            const ctx = recordingCtx(calls);
            const canvas = { width: 0, height: 0, calls, getContext: () => ctx, toDataURL: () => "data:image/png;base64,AA==" };
            canvases.push(canvas);
            return canvas as unknown as HTMLCanvasElement;
        }) as typeof document.createElement);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        clearRinkCache();
    });

    it("sizes the backing store by the ratio and scales before any drawing", () => {
        generateThumbnail(createEmptyPlayData(), { width: 720, height: 306, pixelRatio: 3 });
        const [thumb] = canvases;
        expect([thumb.width, thumb.height]).toEqual([2160, 918]);
        expect(thumb.calls[0]).toEqual({ name: "scale", args: [3, 3] });
        // The background is filled in logical pixels, which scale(3) stretches over the whole backing store.
        expect(thumb.calls.find((c) => c.name === "fillRect")?.args).toEqual([0, 0, 720, 306]);
    });

    it("draws the rink as vectors above ratio 1, so no cached rink bitmap is created or blitted", () => {
        generateThumbnail(createEmptyPlayData(), { width: 720, height: 306, pixelRatio: 3 });
        expect(canvases).toHaveLength(1);
        expect(canvases[0].calls.some((c) => c.name === "drawImage")).toBe(false);
    });

    it("is unchanged without a ratio: logical size, no scale, cached rink blitted", () => {
        generateThumbnail(createEmptyPlayData());
        const [thumb] = canvases;
        expect([thumb.width, thumb.height]).toEqual([THUMBNAIL_DIMENSIONS.width, THUMBNAIL_DIMENSIONS.height]);
        expect(thumb.calls.some((c) => c.name === "scale")).toBe(false);
        expect(canvases).toHaveLength(2); // the thumbnail, then the rink cache
        expect(thumb.calls.some((c) => c.name === "drawImage")).toBe(true);
    });

    it.each([
        [10, 4],
        [4, 4],
        [2.5, 2.5],
        [0.5, 1],
        [0, 1],
        [-2, 1],
        [Number.NaN, 1],
        [Number.POSITIVE_INFINITY, 1],
    ])("clamps pixelRatio %s to %s", (input, expected) => {
        generateThumbnail(createEmptyPlayData(), { width: 300, height: 128, pixelRatio: input });
        expect(canvases[0].width).toBe(Math.round(300 * expected));
        expect(canvases[0].calls.some((c) => c.name === "scale")).toBe(expected !== 1);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test __tests__/lib/utils/canvas/thumbnail-pixel-ratio.test.ts`
Expected: FAIL. The first test reads `[720, 306]` instead of `[2160, 918]`, and the clamp cases above 1 find no `scale` call.

- [ ] **Step 3: Implement**

In `lib/utils/canvas/thumbnail-generator.ts`, replace the `ThumbnailOptions` interface (lines 35-40) with:

```ts
export interface ThumbnailOptions {
    width?: number;
    height?: number;
    quality?: number; // 0-1, for JPEG quality (not used for PNG)
    backgroundColor?: string;
    /**
     * Backing-store scale for print (3b). Default 1; clamped to [1, 4]; a
     * non-finite value means 1. Geometry and stroke widths stay in logical
     * pixels, so they scale uniformly.
     */
    pixelRatio?: number;
}

/** The largest pixelRatio generateThumbnail accepts. */
export const MAX_THUMBNAIL_PIXEL_RATIO = 4;

function clampPixelRatio(value: number | undefined): number {
    if (value === undefined || !Number.isFinite(value)) return 1;
    return Math.min(MAX_THUMBNAIL_PIXEL_RATIO, Math.max(1, value));
}
```

Then replace the body of `generateThumbnail`, from `const {` through `return canvas.toDataURL("image/png");`, with:

```ts
    const {
        width = THUMBNAIL_DIMENSIONS.width,
        height = THUMBNAIL_DIMENSIONS.height,
        backgroundColor = "#FFFFFF",
    } = options;
    const pixelRatio = clampPixelRatio(options.pixelRatio);
    const scaled = pixelRatio !== 1;

    // Create off-screen canvas. At ratio 1 the size is assigned exactly as before (byte-identical output).
    const canvas = document.createElement("canvas");
    canvas.width = scaled ? Math.round(width * pixelRatio) : width;
    canvas.height = scaled ? Math.round(height * pixelRatio) : height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("Failed to get 2D context for thumbnail generation");
    }

    // Scale before any drawing, so everything below works in logical pixels.
    if (scaled) ctx.scale(pixelRatio, pixelRatio);

    // Fill background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // Thumbnails always show the whole rink, so card sizes stay consistent;
    // the drill's area is shown by shading everything outside it. The cached
    // rink is a logical-size bitmap that would print blurry under scale(), so
    // a scaled thumbnail draws the rink as vectors.
    const transform = createTransformContext(width, height, 10);
    drawBoardScene(ctx, transform, playData, { maskRect: areaRect(playData.area), cachedRink: !scaled });

    // Export as base64 PNG
    return canvas.toDataURL("image/png");
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test __tests__/lib/utils/canvas/thumbnail-pixel-ratio.test.ts __tests__/lib/utils/canvas/thumbnail-area.test.ts __tests__/lib/utils/canvas/thumbnail-generator.test.ts`
Expected: PASS. `thumbnail-area.test.ts` still finds the rink cache as `canvases[1]`, because the default ratio keeps the cache.

Run: `bun run type-check`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/canvas/thumbnail-generator.ts __tests__/lib/utils/canvas/thumbnail-pixel-ratio.test.ts
git commit -m "feat(practice-planner): pixelRatio option for generateThumbnail

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 2: `buildSchedule` and the session clock helpers

**Files:**
- Modify: `lib/utils/session-timeline.ts` (insert after `sessionWallMinutes`, around line 78)
- Modify: `lib/utils/date.ts` (append after `formatDateTimeInZone`, around line 140)
- Test: `__tests__/lib/utils/session-schedule.test.ts` (create)
- Test: `__tests__/lib/utils/date-session-clock.test.ts` (create)

**Interfaces:**
- Consumes: `groupStations`, `StationGroup<T>` and `TimelinePlay` (same module), and `isValidTimeZone` (`lib/utils/date.ts:13`).
- Produces:
  - `interface ScheduleRow<T extends TimelinePlay> { group: StationGroup<T>; startsAt: Date; endsAt: Date }`
  - `buildSchedule<T extends TimelinePlay>(plays: readonly T[], sessionStart: Date): ScheduleRow<T>[]`
  - `interface SessionClockSource { date: string | Date; startAt?: string | Date | null; venueTimezone?: string | null }`
  - `formatClockTime(date: Date, timeZone?: string, withZone = false): string`, e.g. `"6:00 PM"` or `"6:00 PM EDT"`
  - `formatLongDate(date: Date, timeZone?: string): string`, e.g. `"Tuesday, April 7, 2026"`
  - `sessionTimeZone(session: Pick<SessionClockSource, "venueTimezone">): { timeZone?: string; showZone: boolean }`
  - `sessionStart(session: Pick<SessionClockSource, "date" | "startAt">): Date`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/utils/session-schedule.test.ts`:

```ts
/** buildSchedule (3b): each block's start and end instant. */
import { describe, expect, it } from "vitest";
import { buildSchedule } from "@/lib/utils/session-timeline";

const START = new Date("2026-04-07T22:00:00.000Z");

const play = (id: string, sequence: number, duration: number, runsWithPrevious = false) => ({
    id,
    sequence,
    duration,
    runsWithPrevious,
});

const iso = (date: Date) => date.toISOString();

describe("buildSchedule", () => {
    it("returns no rows for a session with no drills", () => {
        expect(buildSchedule([], START)).toEqual([]);
    });

    it("starts sequential drills back to back", () => {
        const rows = buildSchedule([play("a", 0, 15), play("b", 1, 10), play("c", 2, 20)], START);
        expect(rows.map((row) => [row.group.stations[0].id, iso(row.startsAt), iso(row.endsAt)])).toEqual([
            ["a", "2026-04-07T22:00:00.000Z", "2026-04-07T22:15:00.000Z"],
            ["b", "2026-04-07T22:15:00.000Z", "2026-04-07T22:25:00.000Z"],
            ["c", "2026-04-07T22:25:00.000Z", "2026-04-07T22:45:00.000Z"],
        ]);
    });

    it("gives a station block its longest drill's minutes, and starts the next block after it", () => {
        const rows = buildSchedule(
            [play("a", 0, 10), play("b", 1, 15, true), play("c", 2, 5, true), play("d", 3, 10)],
            START,
        );
        expect(rows).toHaveLength(2);
        expect(rows[0].group.stations.map((station) => station.id)).toEqual(["a", "b", "c"]);
        expect(iso(rows[0].endsAt)).toBe("2026-04-07T22:15:00.000Z");
        expect(iso(rows[1].startsAt)).toBe("2026-04-07T22:15:00.000Z");
        expect(iso(rows[1].endsAt)).toBe("2026-04-07T22:25:00.000Z");
    });

    it("orders by sequence, not by array order", () => {
        const rows = buildSchedule([play("b", 1, 10), play("a", 0, 5)], START);
        expect(rows.map((row) => [row.group.stations[0].id, iso(row.startsAt)])).toEqual([
            ["a", "2026-04-07T22:00:00.000Z"],
            ["b", "2026-04-07T22:05:00.000Z"],
        ]);
    });

    it("keeps the caller's objects and leaves the start untouched", () => {
        const a = play("a", 0, 5);
        const rows = buildSchedule([a], START);
        expect(rows[0].group.stations[0]).toBe(a);
        expect(iso(START)).toBe("2026-04-07T22:00:00.000Z");
    });
});
```

Create `__tests__/lib/utils/date-session-clock.test.ts`:

```ts
/** Session clock helpers (3b): venue-zone times with a suffix, viewer-zone times without. */
import { describe, expect, it } from "vitest";
import { formatClockTime, formatLongDate, sessionStart, sessionTimeZone } from "@/lib/utils/date";

const SIX_PM_EDT = new Date("2026-04-07T22:00:00.000Z");

describe("formatClockTime", () => {
    it("formats in the venue's zone with its short name", () => {
        expect(formatClockTime(SIX_PM_EDT, "America/New_York", true)).toBe("6:00 PM EDT");
    });

    it("leaves the suffix off unless asked", () => {
        expect(formatClockTime(SIX_PM_EDT, "America/New_York")).toBe("6:00 PM");
    });

    it("follows the zone across the DST change (2026-11-01, America/New_York)", () => {
        expect(formatClockTime(new Date("2026-11-01T05:30:00.000Z"), "America/New_York", true)).toBe("1:30 AM EDT");
        expect(formatClockTime(new Date("2026-11-01T06:30:00.000Z"), "America/New_York", true)).toBe("1:30 AM EST");
    });

    it("falls back to the runtime's zone with no suffix for an invalid zone", () => {
        const text = formatClockTime(SIX_PM_EDT, "Not/AZone", true);
        expect(text).toBe(formatClockTime(SIX_PM_EDT));
        expect(text).toMatch(/^\d{1,2}:\d{2} [AP]M$/);
    });

    it("never emits ICU's narrow no-break space", () => {
        expect(formatClockTime(SIX_PM_EDT, "America/New_York", true)).not.toContain("\u202f");
        expect(formatClockTime(SIX_PM_EDT)).not.toContain("\u202f");
    });
});

describe("formatLongDate", () => {
    it("formats the calendar date in the venue's zone", () => {
        // 01:00 UTC on the 8th is still the evening of the 7th in Denver.
        expect(formatLongDate(new Date("2026-04-08T01:00:00.000Z"), "America/Denver")).toBe("Tuesday, April 7, 2026");
    });

    it("falls back to the runtime's zone for an invalid zone", () => {
        expect(formatLongDate(SIX_PM_EDT, "Not/AZone")).toBe(formatLongDate(SIX_PM_EDT));
    });
});

describe("sessionTimeZone", () => {
    it("uses a valid venue zone and shows its name", () => {
        expect(sessionTimeZone({ venueTimezone: "America/Chicago" })).toEqual({ timeZone: "America/Chicago", showZone: true });
    });

    it.each([null, undefined, "", "Not/AZone"])("falls back to the viewer's zone for %s", (venueTimezone) => {
        expect(sessionTimeZone({ venueTimezone })).toEqual({ timeZone: undefined, showZone: false });
    });
});

describe("sessionStart", () => {
    it("prefers the booked start", () => {
        expect(sessionStart({ date: "2026-04-07T12:00:00.000Z", startAt: "2026-04-07T22:00:00.000Z" }).toISOString()).toBe(
            "2026-04-07T22:00:00.000Z",
        );
    });

    it("falls back to the session date", () => {
        expect(sessionStart({ date: "2026-04-07T12:00:00.000Z", startAt: null }).toISOString()).toBe("2026-04-07T12:00:00.000Z");
        expect(sessionStart({ date: new Date("2026-04-07T12:00:00.000Z") }).toISOString()).toBe("2026-04-07T12:00:00.000Z");
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test __tests__/lib/utils/session-schedule.test.ts __tests__/lib/utils/date-session-clock.test.ts`
Expected: FAIL with `buildSchedule is not a function` and `formatClockTime is not a function` (and the same for the other new helpers).

- [ ] **Step 3: Implement `buildSchedule`**

In `lib/utils/session-timeline.ts`, insert directly after the `sessionWallMinutes` function (the one ending `return groupStations(plays).reduce((total, group) => total + group.wallMinutes, 0);\n}`):

```ts
const MS_PER_MINUTE = 60_000;

export interface ScheduleRow<T extends TimelinePlay> {
    group: StationGroup<T>;
    /** sessionStart + group.startMinute */
    startsAt: Date;
    /** startsAt + group.wallMinutes */
    endsAt: Date;
}

/**
 * Each block's start and end instant (3b). Instants only: formatting, and so
 * the timezone, belong to the caller (lib/utils/date.ts), which keeps this
 * module zone-free.
 */
export function buildSchedule<T extends TimelinePlay>(plays: readonly T[], sessionStart: Date): ScheduleRow<T>[] {
    const base = sessionStart.getTime();
    return groupStations(plays).map((group) => {
        const startsAt = new Date(base + group.startMinute * MS_PER_MINUTE);
        return { group, startsAt, endsAt: new Date(startsAt.getTime() + group.wallMinutes * MS_PER_MINUTE) };
    });
}
```

- [ ] **Step 4: Implement the date helpers**

Append to `lib/utils/date.ts`, after `formatDateTimeInZone` and before the deprecated `formatDateTimeLocal`:

```ts
/**
 * The fields of a practice session that pick its clock (3b). Structural, so
 * this module never imports from lib/actions.
 */
export interface SessionClockSource {
  date: string | Date;
  startAt?: string | Date | null;
  /** The booked venue's IANA zone; null when no venue is attached. */
  venueTimezone?: string | null;
}

/**
 * Clock time such as "6:00 PM", or "6:00 PM EDT" with `withZone`. A missing or
 * invalid zone formats in the runtime's zone with no suffix. ICU's narrow
 * no-break space before AM/PM becomes a plain space, so server and browser
 * output agree across ICU versions.
 */
export function formatClockTime(date: Date, timeZone?: string, withZone = false): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : undefined;
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    ...(zone ? { timeZone: zone } : {}),
    ...(zone && withZone ? { timeZoneName: "short" as const } : {}),
  })
    .format(date)
    .replace(/\u202f/g, " ");
}

/** "Tuesday, April 7, 2026", in `timeZone` when it is valid, else in the runtime's zone. */
export function formatLongDate(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    ...(isValidTimeZone(timeZone) ? { timeZone } : {}),
  }).format(date);
}

/**
 * Which zone a session's times use (3b): a booked session's valid venue zone,
 * shown with its short name; otherwise the viewer's zone with no suffix.
 */
export function sessionTimeZone(
  session: Pick<SessionClockSource, "venueTimezone">
): { timeZone?: string; showZone: boolean } {
  return isValidTimeZone(session.venueTimezone)
    ? { timeZone: session.venueTimezone, showZone: true }
    : { timeZone: undefined, showZone: false };
}

/** When a session's first block starts: the booked start, else the session date. */
export function sessionStart(session: Pick<SessionClockSource, "date" | "startAt">): Date {
  return new Date(session.startAt ?? session.date);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test __tests__/lib/utils/session-schedule.test.ts __tests__/lib/utils/date-session-clock.test.ts __tests__/lib/utils/session-timeline.test.ts __tests__/lib/utils/date.test.ts`
Expected: PASS.

Run: `bun run type-check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/utils/session-timeline.ts lib/utils/date.ts __tests__/lib/utils/session-schedule.test.ts __tests__/lib/utils/date-session-clock.test.ts
git commit -m "feat(practice-planner): session schedule and venue-zone clock helpers

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 3: The detail query returns the venue's timezone

**Files:**
- Modify: `lib/actions/practice-session-queries.ts:79-209` (`getPracticeSessionDetail`'s return type, `include.venue` and mapping; add a type export after the function)
- Test: `__tests__/lib/actions/practice-session-queries.test.ts` (append a `describe`)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `getPracticeSessionDetail(sessionId)` now also returns `session.venueTimezone: string | null`.
  - `export type PracticeSessionDetail = NonNullable<Awaited<ReturnType<typeof getPracticeSessionDetail>>>`. Task 6's `BenchSheet` uses `PracticeSessionDetail["session"]`.
  - The access logic is unchanged.

- [ ] **Step 1: Write the failing test**

Append to `__tests__/lib/actions/practice-session-queries.test.ts`:

```ts
describe("getPracticeSessionDetail: venue timezone and unchanged access (3b)", () => {
  function detailRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "s1", teamId: "t1", title: "T", date: new Date("2026-04-07T22:00:00Z"), duration: 60, isShared: false,
      createdBy: { name: "Coach" }, team: { id: "t1", name: "Team" },
      venueId: "v1", venue: { name: "Rink", timezone: "America/Denver" },
      surfaceId: null, surface: null, segmentId: null, segment: null,
      startAt: new Date("2026-04-08T00:00:00Z"),
      plays: [],
      ...overrides,
    };
  }

  /** The query reads membership twice: any team (first), then the session's team (second). */
  function memberships(sessionTeam: { role: "ADMIN" | "MEMBER" } | null) {
    mockPrisma.teamMember.findFirst
      .mockResolvedValueOnce({ id: "m-any", role: "MEMBER" })
      .mockResolvedValueOnce(sessionTeam ? { id: "m", ...sessionTeam } : null);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.teamMember.findFirst.mockReset();
  });

  it("returns the venue's timezone, selected alongside its name", async () => {
    memberships({ role: "ADMIN" });
    mockPrisma.practiceSession.findUnique.mockResolvedValue(detailRow());

    const result = await getPracticeSessionDetail("s1");

    expect(result?.session.venueTimezone).toBe("America/Denver");
    expect(mockPrisma.practiceSession.findUnique.mock.calls[0][0].include.venue).toEqual({
      select: { name: true, timezone: true },
    });
  });

  it("returns a null timezone for an unbooked session", async () => {
    memberships({ role: "ADMIN" });
    mockPrisma.practiceSession.findUnique.mockResolvedValue(detailRow({ venueId: null, venue: null, startAt: null }));

    expect((await getPracticeSessionDetail("s1"))?.session.venueTimezone).toBeNull();
  });

  it.each([
    ["an admin, unshared", { role: "ADMIN" as const }, false, true],
    ["a member, shared", { role: "MEMBER" as const }, true, true],
    ["a member, unshared", { role: "MEMBER" as const }, false, false],
    ["a non-member, shared", null, true, false],
  ])("keeps the access rule: %s", async (_label, sessionTeam, isShared, visible) => {
    memberships(sessionTeam);
    mockPrisma.practiceSession.findUnique.mockResolvedValue(detailRow({ isShared }));

    const result = await getPracticeSessionDetail("s1");

    expect(result !== null).toBe(visible);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test __tests__/lib/actions/practice-session-queries.test.ts`
Expected: FAIL. `venueTimezone` is `undefined`, and `include.venue` equals `{ select: { name: true } }`. The four access cases already pass.

- [ ] **Step 3: Implement**

In `lib/actions/practice-session-queries.ts`, inside `getPracticeSessionDetail`:

1. In the return type, after `venueName: string | null;`, add:

```ts
    /** The booked venue's IANA zone (3b); null when no venue is attached. */
    venueTimezone: string | null;
```

2. Replace `      venue: { select: { name: true } },` (in the `findUnique` include) with:

```ts
      venue: { select: { name: true, timezone: true } },
```

3. In the returned `session` object, after `venueName: session.venue?.name ?? null,`, add:

```ts
      venueTimezone: session.venue?.timezone ?? null,
```

4. Directly after the closing `}` of `getPracticeSessionDetail` (before the `editorPlayData` doc comment), add:

```ts
/** What the session detail page and the bench sheet read (3b). */
export type PracticeSessionDetail = NonNullable<Awaited<ReturnType<typeof getPracticeSessionDetail>>>;
```

Other `"use server"` modules in `lib/actions/` already export types. A type export is erased at compile time.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test __tests__/lib/actions/practice-session-queries.test.ts`
Expected: PASS. The existing detail tests mock `venue: { name: "Rink" }` and now read `venueTimezone` as `null`, which they don't assert.

Run: `bun run type-check`
Expected: no errors. `SessionDetailView`'s `SessionData` doesn't declare `venueTimezone` yet, but an object with an extra property passed through a variable is assignable.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/practice-session-queries.ts __tests__/lib/actions/practice-session-queries.test.ts
git commit -m "feat(practice-planner): return the venue timezone with the session detail

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 4: `SessionTimeline` on the session page, zone-aware header, print link

**Files:**
- Create: `lib/hooks/useClockText.ts`
- Create: `components/features/practice-planner/SessionTimeline.tsx`
- Modify: `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx`
- Modify: `__tests__/app/practice-session-detail-stations.test.tsx` (two assertions, Ruling 3)
- Test: `__tests__/lib/hooks/useClockText.test.tsx` (create)
- Test: `__tests__/components/features/practice-planner/SessionTimeline.test.tsx` (create)
- Test: `__tests__/app/practice-session-detail-timeline.test.tsx` (create)
- Test: `__tests__/app/SessionDetailView.line-budget.test.ts` (create)

**Interfaces:**
- Consumes: `buildSchedule` and `sessionWallMinutes` (`lib/utils/session-timeline.ts`), and `formatClockTime`, `formatLongDate`, `sessionStart` and `sessionTimeZone` (`lib/utils/date.ts`, Task 2).
- Produces:
  - `useMounted(): boolean`
  - `const TIME_PLACEHOLDER = "—"`
  - `interface ClockText { time(date: Date, withZone?: boolean): string; longDate(date: Date): string }`
  - `useClockText(timeZone: string | undefined, showZone: boolean): ClockText`. `time`'s `withZone` defaults to `showZone`.
  - `interface SessionTimelinePlay extends TimelinePlay { id: string; play: { name: string } }`
  - `stationsLabel(count: number): string`, e.g. `"Stations · 2"`
  - `plannedLabel(planned: number, booked: number): string`
  - `SessionTimeline<T extends SessionTimelinePlay>(props: { plays: readonly T[]; sessionStart: Date; timeZone?: string; showZone: boolean; durationMinutes: number; activePlayId?: string; onSelectPlay?: (playId: string) => void; variant?: "screen" | "print" })`. Both variants render a table labelled `Session timeline`.
  - Task 6 uses `SessionTimeline` with `variant="print"`, and `useClockText`.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/hooks/useClockText.test.tsx`:

```tsx
/** useClockText (3b): viewer-zone times render only after mount; venue-zone times render at once. */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { TIME_PLACEHOLDER, useClockText } from "@/lib/hooks/useClockText";
import { formatClockTime } from "@/lib/utils/date";

const SIX_PM_EDT = new Date("2026-04-07T22:00:00.000Z");

function Probe({ timeZone, showZone }: { timeZone?: string; showZone: boolean }) {
    const clock = useClockText(timeZone, showZone);
    return <p>{`${clock.longDate(SIX_PM_EDT)} | ${clock.time(SIX_PM_EDT)}`}</p>;
}

describe("useClockText", () => {
    it("renders a placeholder on the server when the time depends on the viewer's zone", () => {
        const html = renderToStaticMarkup(<Probe showZone={false} />);
        expect(html).toContain(`${TIME_PLACEHOLDER} | ${TIME_PLACEHOLDER}`);
        expect(html).not.toMatch(/\d:\d\d [AP]M/);
    });

    it("renders a venue-zone time on the server, since server and browser agree", () => {
        expect(renderToStaticMarkup(<Probe timeZone="America/New_York" showZone />)).toContain(
            "Tuesday, April 7, 2026 | 6:00 PM EDT",
        );
    });

    it("renders the viewer-zone time once mounted", () => {
        render(<Probe showZone={false} />);
        expect(screen.getByText(new RegExp(`\\| ${formatClockTime(SIX_PM_EDT)}$`))).toBeInTheDocument();
    });
});
```

Create `__tests__/components/features/practice-planner/SessionTimeline.test.tsx`:

```tsx
/** SessionTimeline (3b): one row per block, start times, minutes, drill names, planned footer. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { SessionTimeline } from "@/components/features/practice-planner/SessionTimeline";
import { TIME_PLACEHOLDER } from "@/lib/hooks/useClockText";

const play = (name: string, sequence: number, duration: number, runsWithPrevious = false) => ({
    id: `row-${name}`,
    sequence,
    duration,
    runsWithPrevious,
    play: { name },
});

const PLAYS = [play("Breakout", 0, 15), play("Regroup", 1, 10, true), play("Shooting", 2, 10)];
const START = new Date("2026-04-07T22:00:00.000Z"); // 6:00 PM EDT

type Props = Partial<React.ComponentProps<typeof SessionTimeline<(typeof PLAYS)[number]>>>;

function ui(props: Props = {}) {
    return (
        <ThemeProvider theme={createTheme()}>
            <SessionTimeline
                plays={PLAYS}
                sessionStart={START}
                timeZone="America/New_York"
                showZone
                durationMinutes={60}
                {...props}
            />
        </ThemeProvider>
    );
}

function bodyRows() {
    return within(screen.getByRole("table", { name: "Session timeline" })).getAllByRole("row").slice(1);
}

describe("SessionTimeline (screen)", () => {
    it("shows one row per block with its start, minutes and drills", () => {
        render(ui());
        const [stations, shooting] = bodyRows();
        expect(bodyRows()).toHaveLength(2);

        expect(within(stations).getByText("6:00 PM EDT")).toBeInTheDocument();
        expect(within(stations).getByText("15")).toBeInTheDocument();
        expect(within(stations).getByText("Stations · 2")).toBeInTheDocument();
        expect(within(stations).getByText("Breakout")).toBeInTheDocument();
        expect(within(stations).getByText("Regroup")).toBeInTheDocument();

        expect(within(shooting).getByText("6:15 PM EDT")).toBeInTheDocument();
        expect(within(shooting).getByText("Shooting")).toBeInTheDocument();
        expect(within(shooting).queryByText(/^Stations/)).not.toBeInTheDocument();
    });

    it("uses the viewer's zone with no suffix when the session isn't booked", () => {
        render(ui({ timeZone: undefined, showZone: false }));
        expect(within(bodyRows()[0]).getAllByRole("cell")[0].textContent).toMatch(/^\d{1,2}:\d{2} [AP]M$/);
    });

    it("reads Planned X of Y min, and flags over time", () => {
        const { unmount } = render(ui());
        expect(screen.getByText("Planned 25 of 60 min")).toBeInTheDocument();
        unmount();

        render(ui({ durationMinutes: 20 }));
        expect(screen.getByText("Planned 25 of 20 min (over time!)")).toBeInTheDocument();
    });

    it("selects a drill when its name is clicked, and highlights the active block", () => {
        const onSelectPlay = vi.fn();
        render(ui({ onSelectPlay, activePlayId: "row-Regroup" }));

        fireEvent.click(screen.getByRole("button", { name: "Shooting" }));
        expect(onSelectPlay).toHaveBeenCalledWith("row-Shooting");

        expect(bodyRows()[0]).toHaveClass("Mui-selected");
        expect(bodyRows()[1]).not.toHaveClass("Mui-selected");
    });

    it("emits no viewer-zone clock text from the server (hydration)", () => {
        const unbooked = renderToStaticMarkup(ui({ timeZone: undefined, showZone: false }));
        expect(unbooked).toContain(TIME_PLACEHOLDER);
        expect(unbooked).not.toMatch(/\d:\d\d [AP]M/);

        expect(renderToStaticMarkup(ui())).toContain("6:00 PM EDT");
    });
});

describe("SessionTimeline (print)", () => {
    it("renders a plain table with no controls", () => {
        render(ui({ variant: "print", onSelectPlay: vi.fn() }));
        expect(screen.queryAllByRole("button")).toHaveLength(0);
        expect(within(bodyRows()[0]).getByText("Stations · 2")).toBeInTheDocument();
        expect(within(bodyRows()[0]).getByText(/Regroup · 10 min/)).toBeInTheDocument();
        expect(screen.getByText("Planned 25 of 60 min")).toBeInTheDocument();
    });
});
```

Create `__tests__/app/practice-session-detail-timeline.test.tsx`:

```tsx
/** Session detail view (3b): timeline, venue-zone header and the bench-sheet link. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { formatClockTime, formatLongDate } from "@/lib/utils/date";

vi.mock("@/lib/actions/practice-sessions", () => ({ deletePracticeSession: vi.fn(), sharePracticeSession: vi.fn() }));
vi.mock("@/lib/actions/practice-session-drills", () => ({ duplicatePracticeSession: vi.fn() }));
vi.mock("@/components/features/practice-planner/StationMap", () => ({
    StationMap: () => <div data-testid="station-map" />,
}));

import { SessionDetailView } from "@/app/(dashboard)/practice-planner/[sessionId]/SessionDetailView";

function sessionPlay(name: string, sequence: number, runsWithPrevious: boolean, duration: number) {
    return {
        id: `row-${name}`,
        sequence,
        duration,
        runsWithPrevious,
        instructions: null,
        play: { id: `play-${name}`, name, description: null, thumbnail: null, playData: createEmptyPlayData() },
    };
}

const SESSION = {
    id: "csessionxxxxxxxxxxxxxxxxx",
    title: "Tuesday",
    date: "2026-04-07T22:00:00.000Z",
    duration: 60,
    isShared: false,
    createdByName: "Coach",
    teamId: "cteamxxxxxxxxxxxxxxxxxxxx",
    teamName: "Team",
    venueId: null,
    venueName: null,
    venueTimezone: null,
    surfaceName: null,
    segmentName: null,
    segmentKind: null,
    startAt: null,
    plays: [sessionPlay("Breakout", 0, false, 15), sessionPlay("Regroup", 1, true, 10), sessionPlay("Shooting", 2, false, 10)],
};

const BOOKED = {
    ...SESSION,
    venueId: "cvenuexxxxxxxxxxxxxxxxxxx",
    venueName: "Test Rink",
    venueTimezone: "America/Denver",
    startAt: "2026-04-08T00:00:00.000Z", // 6:00 PM MDT on April 7
};

type SessionProp = React.ComponentProps<typeof SessionDetailView>["session"];

function renderView(session: SessionProp = SESSION) {
    render(
        <ThemeProvider theme={createTheme()}>
            <SessionDetailView session={session} isAdmin={false} />
        </ThemeProvider>,
    );
}

const timeline = () => screen.getByRole("table", { name: "Session timeline" });

describe("SessionDetailView timeline and print (3b)", () => {
    it("links to the bench sheet in a new tab, for members too", () => {
        renderView();
        const link = screen.getByRole("link", { name: /print bench sheet/i });
        expect(link).toHaveAttribute("href", "/practice-planner/csessionxxxxxxxxxxxxxxxxx/print");
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noopener");
    });

    it("formats a booked session's header and timeline in the venue's zone", () => {
        renderView(BOOKED);
        expect(screen.getByText("Tuesday, April 7, 2026 at 6:00 PM MDT")).toBeInTheDocument();
        expect(within(timeline()).getByText("6:00 PM MDT")).toBeInTheDocument();
        expect(within(timeline()).getByText("6:15 PM MDT")).toBeInTheDocument();
    });

    it("formats an unbooked session in the viewer's zone with no suffix", () => {
        renderView();
        const start = new Date(SESSION.date);
        expect(screen.getByText(`${formatLongDate(start)} at ${formatClockTime(start)}`)).toBeInTheDocument();
    });

    it("falls back to the viewer's zone for a venue zone Intl rejects", () => {
        renderView({ ...BOOKED, venueTimezone: "Not/AZone" });
        const start = new Date(BOOKED.startAt);
        expect(screen.getByText(`${formatLongDate(start)} at ${formatClockTime(start)}`)).toBeInTheDocument();
    });

    it("opens the drill whose name is clicked in the timeline", () => {
        renderView();
        fireEvent.click(within(timeline()).getByRole("button", { name: "Shooting" }));
        expect(screen.getByText("Play 3 of 3")).toBeInTheDocument();
        expect(within(timeline()).getByRole("button", { name: "Shooting" }).closest("tr")).toHaveClass("Mui-selected");
    });

    it("reads a zero-minute session as over time, with a full bar rather than NaN", () => {
        renderView({ ...SESSION, duration: 0 });
        expect(screen.getByText("Planned 25 of 0 min (over time!)")).toBeInTheDocument();
        expect(screen.getByRole("progressbar", { name: "Time allocation" })).toHaveAttribute("aria-valuenow", "100");
    });

    it("shows no timeline for a session with no drills", () => {
        renderView({ ...SESSION, plays: [] });
        expect(screen.queryByRole("table", { name: "Session timeline" })).not.toBeInTheDocument();
    });
});
```

Create `__tests__/app/SessionDetailView.line-budget.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const VIEW = path.join(process.cwd(), "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx");

describe("SessionDetailView line budget", () => {
    it("stays at or under 900 lines (new session-page logic belongs in SessionTimeline or a hook)", () => {
        const lines = readFileSync(VIEW, "utf8").trimEnd().split("\n").length;
        expect(lines).toBeLessThanOrEqual(900);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test __tests__/lib/hooks/useClockText.test.tsx __tests__/components/features/practice-planner/SessionTimeline.test.tsx __tests__/app/practice-session-detail-timeline.test.tsx`
Expected: FAIL. The hook and the component modules don't exist, and the view has no print link.

- [ ] **Step 3: Create the hook**

Create `lib/hooks/useClockText.ts`:

```ts
"use client";

import { useSyncExternalStore } from "react";
import { formatClockTime, formatLongDate } from "@/lib/utils/date";

const noopSubscribe = () => () => {};

/** false while server-rendering and hydrating, true afterwards. */
export function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** Stands in for a viewer-zone time until the browser can format it. */
export const TIME_PLACEHOLDER = "—";

export interface ClockText {
  /** "6:00 PM", or "6:00 PM EDT" when `withZone` (default: the session's showZone) */
  time: (date: Date, withZone?: boolean) => string;
  /** "Tuesday, April 7, 2026" */
  longDate: (date: Date) => string;
}

/**
 * Session clock formatting that hydrates cleanly (3b). A venue zone formats
 * the same instant identically on the server and in the browser, so it renders
 * at once. Without one, the text depends on the viewer's zone, which the
 * server can't know, so it renders TIME_PLACEHOLDER until mount.
 * suppressHydrationWarning would only hide the warning: React keeps the
 * server's text.
 */
export function useClockText(timeZone: string | undefined, showZone: boolean): ClockText {
  const ready = useMounted() || showZone;
  return {
    time: (date, withZone = showZone) => (ready ? formatClockTime(date, timeZone, withZone) : TIME_PLACEHOLDER),
    longDate: (date) => (ready ? formatLongDate(date, timeZone) : TIME_PLACEHOLDER),
  };
}
```

- [ ] **Step 4: Create `SessionTimeline`**

Create `components/features/practice-planner/SessionTimeline.tsx`:

```tsx
"use client";

/**
 * Session timeline (practice planner 3b): one row per block (a standalone
 * drill or a station group) with its start clock time, its minutes and its
 * drills, and a "Planned X of Y min" footer. The screen variant is a compact
 * MUI table whose drill names select the drill. The print variant is a plain
 * table for the bench sheet, styled by app/(print)/print.css.
 */
import { Box, Link, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { buildSchedule, sessionWallMinutes, type TimelinePlay } from "@/lib/utils/session-timeline";
import { useClockText } from "@/lib/hooks/useClockText";

export interface SessionTimelinePlay extends TimelinePlay {
    /** The session-play row id */
    id: string;
    play: { name: string };
}

export interface SessionTimelineProps<T extends SessionTimelinePlay> {
    plays: readonly T[];
    /** startAt when booked, else date (lib/utils/date `sessionStart`) */
    sessionStart: Date;
    /** The venue's zone; undefined means the viewer's */
    timeZone?: string;
    /** Append the short zone name ("EDT"); true only with a venue zone */
    showZone: boolean;
    /** The session's booked length */
    durationMinutes: number;
    /** Session-play id of the drill on screen; its block is highlighted */
    activePlayId?: string;
    /** Screen only: called with a session-play id when a drill name is clicked */
    onSelectPlay?: (playId: string) => void;
    variant?: "screen" | "print";
}

/** "Stations · 3": a station group's label in the timeline. */
export function stationsLabel(count: number): string {
    return `Stations · ${count}`;
}

/** "Planned 25 of 60 min", with " (over time!)" when the plan runs past the booking. */
export function plannedLabel(planned: number, booked: number): string {
    return `Planned ${planned} of ${booked} min${planned > booked ? " (over time!)" : ""}`;
}

function DrillName({ id, name, onSelect }: { id: string; name: string; onSelect?: (id: string) => void }) {
    if (!onSelect) return <>{name}</>;
    return (
        <Link
            component="button"
            type="button"
            variant="body2"
            underline="hover"
            onClick={() => onSelect(id)}
            sx={{ textAlign: "left", fontWeight: 600 }}
        >
            {name}
        </Link>
    );
}

export function SessionTimeline<T extends SessionTimelinePlay>({
    plays,
    sessionStart,
    timeZone,
    showZone,
    durationMinutes,
    activePlayId,
    onSelectPlay,
    variant = "screen",
}: SessionTimelineProps<T>) {
    const clock = useClockText(timeZone, showZone);
    const rows = buildSchedule(plays, sessionStart);
    const planned = sessionWallMinutes(plays);
    const overTime = planned > durationMinutes;
    const footer = plannedLabel(planned, durationMinutes);

    if (variant === "print") {
        return (
            <div className="bench-timeline">
                <table aria-label="Session timeline">
                    <thead>
                        <tr>
                            <th scope="col">Start</th>
                            <th scope="col">Min</th>
                            <th scope="col">Drill</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(({ group, startsAt }) => (
                            <tr key={group.stations[0].id}>
                                <td>{clock.time(startsAt)}</td>
                                <td>{group.wallMinutes}</td>
                                <td>
                                    {group.stations.length > 1 ? (
                                        <>
                                            <strong>{stationsLabel(group.stations.length)}</strong>
                                            <ul>
                                                {group.stations.map((sp) => (
                                                    <li key={sp.id}>{`${sp.play.name} · ${sp.duration} min`}</li>
                                                ))}
                                            </ul>
                                        </>
                                    ) : (
                                        group.stations[0].play.name
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <p className={overTime ? "bench-over-time" : undefined}>{footer}</p>
            </div>
        );
    }

    return (
        <Stack spacing={1}>
            <Table size="small" aria-label="Session timeline">
                <TableHead>
                    <TableRow>
                        <TableCell sx={{ width: 120 }}>Start</TableCell>
                        <TableCell sx={{ width: 56 }} align="right">
                            Min
                        </TableCell>
                        <TableCell>Drill</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {rows.map(({ group, startsAt }) => {
                        const grouped = group.stations.length > 1;
                        return (
                            <TableRow key={group.stations[0].id} selected={group.stations.some((sp) => sp.id === activePlayId)}>
                                <TableCell sx={{ whiteSpace: "nowrap", fontFamily: "var(--font-mono), monospace" }}>
                                    {clock.time(startsAt)}
                                </TableCell>
                                <TableCell align="right">{group.wallMinutes}</TableCell>
                                <TableCell>
                                    {grouped ? (
                                        <>
                                            <Typography
                                                variant="caption"
                                                component="p"
                                                sx={{ fontWeight: 800, color: "primary.main", textTransform: "uppercase", letterSpacing: 1 }}
                                            >
                                                {stationsLabel(group.stations.length)}
                                            </Typography>
                                            <Box component="ul" sx={{ m: 0, pl: 2 }}>
                                                {group.stations.map((sp) => (
                                                    <li key={sp.id}>
                                                        <DrillName id={sp.id} name={sp.play.name} onSelect={onSelectPlay} />
                                                        <Typography component="span" variant="caption" color="text.secondary">
                                                            {` · ${sp.duration} min`}
                                                        </Typography>
                                                    </li>
                                                ))}
                                            </Box>
                                        </>
                                    ) : (
                                        <DrillName id={group.stations[0].id} name={group.stations[0].play.name} onSelect={onSelectPlay} />
                                    )}
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
            <Typography
                variant="caption"
                color={overTime ? "error.main" : "text.secondary"}
                fontWeight={overTime ? 700 : 400}
                sx={{ alignSelf: "flex-end" }}
            >
                {footer}
            </Typography>
        </Stack>
    );
}
```

- [ ] **Step 5: Wire it into `SessionDetailView`**

In `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx`:

1. In the icon import, after `  Place as PlaceIcon,` add:

```tsx
  PrintOutlined as PrintIcon,
```

2. After `import { StationMap } from "@/components/features/practice-planner/StationMap";` add:

```tsx
import { SessionTimeline } from "@/components/features/practice-planner/SessionTimeline";
```

3. After the closing `} from "@/lib/utils/session-timeline";` add:

```tsx
import { sessionStart, sessionTimeZone } from "@/lib/utils/date";
import { useClockText } from "@/lib/hooks/useClockText";
```

4. In `interface SessionData`, after `  venueName?: string | null;` add:

```tsx
  venueTimezone?: string | null;
```

5. Replace:

```tsx
  const durationPercent = Math.min(
    (totalPlayTime / session.duration) * 100,
    100
  );
  const isOverTime = totalPlayTime > session.duration;
  const sessionDate = new Date(session.date);
```

with:

```tsx
  // A zero-minute session (bad stored data) reads as full, not NaN%.
  const durationPercent =
    session.duration > 0 ? Math.min((totalPlayTime / session.duration) * 100, 100) : 100;
  // Booked: startAt in the venue's zone, with its short name; else date in the viewer's zone (3b).
  const start = sessionStart(session);
  const { timeZone, showZone } = sessionTimeZone(session);
  const clock = useClockText(timeZone, showZone);
```

`isOverTime` is gone: the timeline owns the over-time styling, and item 10 replaces its one remaining use (the progress bar's `color`). Don't re-add the variable between items 5 and 10. `totalPlayTime` stays, because it still feeds `durationPercent`.

6. Delete the two local formatters (the block from `  const formatDate = (d: Date) =>` through `    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });`).

7. Replace `                  {formatDate(sessionDate)} at {formatTime(sessionDate)}` with:

```tsx
                  {clock.longDate(start)} at {clock.time(start)}
```

8. In the booking line, replace:

```tsx
                    {[
                      session.venueName,
                      session.surfaceName,
                      session.segmentName,
                      session.startAt
                        ? formatTime(new Date(session.startAt))
                        : null,
                    ]
```

with (the header now shows the booked start; Ruling 2):

```tsx
                    {[session.venueName, session.surfaceName, session.segmentName]
```

9. Replace:

```tsx
          {/* Admin actions */}
          {isAdmin && (
            <Stack direction="row" spacing={1} flexShrink={0}>
```

with:

```tsx
          {/* Actions: the bench sheet for everyone who can see the session (3b); the rest for admins */}
          <Stack direction="row" spacing={1} flexShrink={0} flexWrap="wrap" useFlexGap>
            <Button
              component="a"
              href={`/practice-planner/${session.id}/print`}
              target="_blank"
              rel="noopener"
              variant="outlined"
              startIcon={<PrintIcon />}
              size={isMobile ? "small" : "medium"}
            >
              Print bench sheet
            </Button>
            {isAdmin && (
              <>
```

Then close the fragment. Replace the end of that block:

```tsx
                Delete
              </Button>
            </Stack>
          )}
        </Stack>
```

with:

```tsx
                Delete
              </Button>
              </>
            )}
          </Stack>
        </Stack>
```

Re-indent the four admin buttons (Share tooltip, Edit, Duplicate, Delete) two spaces deeper so they sit inside the fragment.

10. Replace the progress-bar caption row:

```tsx
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              Time allocation
            </Typography>
            <Typography
              variant="caption"
              color={isOverTime ? "error.main" : "text.secondary"}
              fontWeight={isOverTime ? 700 : 400}
            >
              {totalPlayTime} / {session.duration} min
              {isOverTime && " (over time!)"}
            </Typography>
          </Stack>
```

with:

```tsx
          {/* The numbers are in the timeline's "Planned X of Y min" footer (3b) */}
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 0.5 }}>
            Time allocation
          </Typography>
```

In the `<LinearProgress` that follows, change `color={isOverTime ? "error" : "primary"}` to `color={totalPlayTime > session.duration ? "error" : "primary"}` and add `aria-label="Time allocation"` after `variant="determinate"`.

11. Directly after the header's closing `      </Paper>` and before `      {/* Content area */}`, insert:

```tsx
      {/* Timeline (3b): when each block runs */}
      {session.plays.length > 0 && (
        <Paper sx={{ p: { xs: 2, md: 3 } }}>
          <Typography
            variant="subtitle2"
            color="text.secondary"
            sx={{ mb: 1, textTransform: "uppercase", letterSpacing: 1 }}
          >
            Timeline
          </Typography>
          <SessionTimeline
            plays={session.plays}
            sessionStart={start}
            timeZone={timeZone}
            showZone={showZone}
            durationMinutes={session.duration}
            activePlayId={activePlay?.id}
            onSelectPlay={(id) =>
              setActivePlayIndex(Math.max(0, session.plays.findIndex((sp) => sp.id === id)))
            }
          />
        </Paper>
      )}
```

12. In `__tests__/app/practice-session-detail-stations.test.tsx` (Ruling 3), change `expect(screen.getByText("25 / 60 min")).toBeInTheDocument();` to `expect(screen.getByText("Planned 25 of 60 min")).toBeInTheDocument();`, and change `expect(screen.getByText("45 / 60 min")).toBeInTheDocument();` to `expect(screen.getByText("Planned 45 of 60 min")).toBeInTheDocument();`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run test __tests__/lib/hooks/useClockText.test.tsx __tests__/components/features/practice-planner/SessionTimeline.test.tsx __tests__/app/practice-session-detail-timeline.test.tsx __tests__/app/practice-session-detail-stations.test.tsx __tests__/app/SessionDetailView.line-budget.test.ts`
Expected: PASS. If a 2b `getByText(<drill name>)` turns ambiguous because the timeline repeats drill names, scope it with `within(...)` as the existing tests do. Don't loosen it to `getAllByText`.

Run: `bun run type-check && bun run lint`
Expected: no errors, and no new warnings in the touched files.

Run: `wc -l "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx"`
Expected: about 840, and at most 900.

- [ ] **Step 7: Commit**

```bash
git add lib/hooks/useClockText.ts components/features/practice-planner/SessionTimeline.tsx "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx" __tests__/lib/hooks/useClockText.test.tsx __tests__/components/features/practice-planner/SessionTimeline.test.tsx __tests__/app/practice-session-detail-timeline.test.tsx __tests__/app/practice-session-detail-stations.test.tsx __tests__/app/SessionDetailView.line-budget.test.ts
git commit -m "feat(practice-planner): session timeline, venue-zone header and bench sheet link

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 5: Bench-sheet building blocks: `PrintDiagram`, `LegendList`, `BenchSheetDrill`

**Files:**
- Modify: `components/features/practice-planner/PlayLegend.tsx` (rename `Swatch` to an exported `LegendSwatch`; Ruling 7)
- Create: `components/features/practice-planner/print/PrintDiagram.tsx`
- Create: `components/features/practice-planner/print/LegendList.tsx`
- Create: `components/features/practice-planner/print/BenchSheetDrill.tsx`
- Test: `__tests__/components/features/practice-planner/print/PrintDiagram.test.tsx` (create)
- Test: `__tests__/components/features/practice-planner/print/LegendList.test.tsx` (create)
- Test: `__tests__/components/features/practice-planner/print/BenchSheetDrill.test.tsx` (create)

**Interfaces:**
- Consumes: `generateThumbnail(playData, { width, height, pixelRatio })` (Task 1); `useMounted` (Task 4); `buildLegend` (`lib/utils/canvas/legend.ts`).
- Produces:
  - `export function LegendSwatch({ entry }: { entry: LegendEntry })` from `PlayLegend.tsx`
  - `PRINT_DIAGRAM_SIZE = { width: 720, height: 306, pixelRatio: 3 }`, `DIAGRAM_UNAVAILABLE = "Diagram unavailable"`, and `PrintDiagram({ playData: PlayData | null; name: string })`
  - `LegendList({ playData: PlayData | null })`, which renders a `section` labelled `Legend`, or nothing
  - `stationTag(position: number, count: number): string`
  - `drillText(instructions: string | null, description: string | null): string | null`
  - `interface BenchSheetDrillProps { number: number; name: string; startLabel: string; minutes: number; station: { position: number; count: number } | null; playData: PlayData | null; text: string | null; breakAfter: boolean }`
  - `BenchSheetDrill(props)`, which renders `<article class="bench-drill [bench-drill--page-end]" aria-label="Drill N: name">`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/features/practice-planner/print/PrintDiagram.test.tsx`:

```tsx
/** PrintDiagram (3b): one high-resolution PNG per drill, or "Diagram unavailable". */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const { mockGenerate } = vi.hoisted(() => ({ mockGenerate: vi.fn(() => "data:image/png;base64,AA==") }));
vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: mockGenerate }));

import { PrintDiagram } from "@/components/features/practice-planner/print/PrintDiagram";

const wrap = (ui: React.ReactElement) => <ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>;

afterEach(() => {
    vi.restoreAllMocks();
    mockGenerate.mockReset();
    mockGenerate.mockReturnValue("data:image/png;base64,AA==");
});

describe("PrintDiagram", () => {
    it("renders the diagram at 720×306 with pixel ratio 3, as an eager image", () => {
        const data = createEmptyPlayData();
        render(wrap(<PrintDiagram playData={data} name="Breakout" />));
        const img = screen.getByRole("img", { name: "Diagram: Breakout" });
        expect(img).toHaveAttribute("src", "data:image/png;base64,AA==");
        expect(img).toHaveAttribute("loading", "eager");
        expect(mockGenerate).toHaveBeenCalledWith(data, { width: 720, height: 306, pixelRatio: 3 });
    });

    it("shows the placeholder for an unreadable drill without rendering", () => {
        render(wrap(<PrintDiagram playData={null} name="Lost" />));
        expect(screen.getByText("Diagram unavailable")).toBeInTheDocument();
        expect(mockGenerate).not.toHaveBeenCalled();
    });

    it("shows the placeholder and warns when rendering throws", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        mockGenerate.mockImplementation(() => {
            throw new Error("Failed to get 2D context for thumbnail generation");
        });
        render(wrap(<PrintDiagram playData={createEmptyPlayData()} name="Breakout" />));
        expect(screen.getByText("Diagram unavailable")).toBeInTheDocument();
        expect(warn).toHaveBeenCalled();
    });

    it("renders a placeholder on the server, where there is no canvas", () => {
        const html = renderToStaticMarkup(wrap(<PrintDiagram playData={createEmptyPlayData()} name="Breakout" />));
        expect(html).toContain("Rendering diagram…");
        expect(mockGenerate).not.toHaveBeenCalled();
    });
});
```

Create `__tests__/components/features/practice-planner/print/LegendList.test.tsx`:

```tsx
/** LegendList (3b): one static legend for the whole bench sheet, each symbol once. */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { combinedLegendData } from "@/lib/utils/canvas/station-map";

// Swatch drawing is PlayLegend's concern; here, only which entries are listed.
vi.mock("@/components/features/practice-planner/PlayLegend", () => ({
    LegendSwatch: () => <span data-testid="swatch" />,
}));

import { LegendList } from "@/components/features/practice-planner/print/LegendList";

const pass = (id: string) => ({
    id,
    action: "pass" as const,
    path: "straight" as const,
    end: "arrow" as const,
    points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    color: "#000000",
    strokeWidth: 2,
});

const wrap = (ui: React.ReactElement) => render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);

describe("LegendList", () => {
    it("lists each symbol once across every readable drill", () => {
        const legend = combinedLegendData([
            { name: "A", playData: { ...createEmptyPlayData(), drawings: [pass("d1")] } },
            { name: "B", playData: { ...createEmptyPlayData(), drawings: [pass("d2")], equipment: [{ id: "c", kind: "cone" as const, position: { x: 1, y: 1 }, rotation: 0 }] } },
            { name: "Lost", playData: null },
        ]);
        wrap(<LegendList playData={legend} />);
        const region = screen.getByRole("region", { name: "Legend" });
        expect(within(region).getAllByText("Pass")).toHaveLength(1);
        expect(within(region).getByText("Cone")).toBeInTheDocument();
        expect(within(region).getAllByTestId("swatch")).toHaveLength(2);
    });

    it("renders nothing when no drill is readable, or no symbol is used", () => {
        const { container } = wrap(<LegendList playData={combinedLegendData([{ name: "Lost", playData: null }])} />);
        expect(container).toBeEmptyDOMElement();
        const { container: empty } = wrap(<LegendList playData={createEmptyPlayData()} />);
        expect(empty).toBeEmptyDOMElement();
    });
});
```

Create `__tests__/components/features/practice-planner/print/BenchSheetDrill.test.tsx`:

```tsx
/** BenchSheetDrill (3b): one printed drill: number, name, time, station tag, diagram, text. */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createEmptyPlayData } from "@/lib/utils/play-data";

vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: vi.fn(() => "data:image/png;base64,AA==") }));

import { BenchSheetDrill, drillText, stationTag } from "@/components/features/practice-planner/print/BenchSheetDrill";

const BASE = {
    number: 2,
    name: "Regroup",
    startLabel: "6:00 PM MDT",
    minutes: 10,
    station: { position: 2, count: 2 },
    playData: createEmptyPlayData(),
    text: "Hard tape-to-tape passes.",
    breakAfter: false,
};

function renderDrill(props: Partial<React.ComponentProps<typeof BenchSheetDrill>> = {}) {
    render(
        <ThemeProvider theme={createTheme()}>
            <BenchSheetDrill {...BASE} {...props} />
        </ThemeProvider>,
    );
    return screen.getByRole("article", { name: `Drill ${props.number ?? BASE.number}: ${props.name ?? BASE.name}` });
}

describe("drillText", () => {
    it("prefers instructions, then the description, trimming whitespace", () => {
        expect(drillText("Go hard", "A drill")).toBe("Go hard");
        expect(drillText(null, "A drill")).toBe("A drill");
        expect(drillText("   \n ", " A drill ")).toBe("A drill");
        expect(drillText(null, null)).toBeNull();
        expect(drillText("  ", "")).toBeNull();
    });
});

describe("stationTag", () => {
    it("reads Station k of N", () => {
        expect(stationTag(2, 3)).toBe("Station 2 of 3");
    });
});

describe("BenchSheetDrill", () => {
    it("shows its number, name, block start, minutes, station tag, diagram and text", () => {
        const article = renderDrill();
        expect(article).toHaveClass("bench-drill");
        expect(article).not.toHaveClass("bench-drill--page-end");
        expect(screen.getByRole("heading", { name: "2. Regroup" })).toBeInTheDocument();
        expect(screen.getByText("6:00 PM MDT · 10 min")).toBeInTheDocument();
        expect(screen.getByText("Station 2 of 2")).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "Diagram: Regroup" })).toBeInTheDocument();
        expect(screen.getByText("Hard tape-to-tape passes.")).toBeInTheDocument();
    });

    it("carries the page-end class when it closes a page", () => {
        expect(renderDrill({ breakAfter: true })).toHaveClass("bench-drill--page-end");
    });

    it("drops the tag for a standalone drill and the text block when there is none", () => {
        const article = renderDrill({ station: null, text: null });
        expect(screen.queryByText(/^Station /)).not.toBeInTheDocument();
        expect(article.querySelector(".bench-drill-text")).toBeNull();
    });

    it("prints its text with a Diagram unavailable box when unreadable", () => {
        renderDrill({ playData: null });
        expect(screen.getByText("Diagram unavailable")).toBeInTheDocument();
        expect(screen.getByText("Hard tape-to-tape passes.")).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test __tests__/components/features/practice-planner/print`
Expected: FAIL with module-not-found errors for the three new components.

- [ ] **Step 3: Export the swatch from `PlayLegend`**

In `components/features/practice-planner/PlayLegend.tsx`:
- Change `function Swatch({ entry }: { entry: LegendEntry }) {` to:

```tsx
/** One symbol's sample, drawn on a small canvas. Exported for the bench sheet's LegendList (3b). */
export function LegendSwatch({ entry }: { entry: LegendEntry }) {
```

- Change `<Swatch entry={entry} />` to `<LegendSwatch entry={entry} />`.

Nothing else in the file changes.

- [ ] **Step 4: Create `PrintDiagram`**

Create `components/features/practice-planner/print/PrintDiagram.tsx`:

```tsx
"use client";

/**
 * A drill's diagram on the bench sheet (3b): drawn once into a PNG at 720×306
 * logical px with a 3× backing store, and shown as an <img>, which browsers
 * print more reliably than a live canvas. It is computed in a memo after
 * mount: there is no canvas on the server, and a memo avoids a setState in an
 * effect.
 */
import { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import type { PlayData } from "@/types/practice-planner";
import { generateThumbnail } from "@/lib/utils/canvas/thumbnail-generator";
import { useMounted } from "@/lib/hooks/useClockText";

export const PRINT_DIAGRAM_SIZE = { width: 720, height: 306, pixelRatio: 3 } as const;
export const DIAGRAM_UNAVAILABLE = "Diagram unavailable";

type Diagram = { src: string } | { failed: true };

function renderDiagram(playData: PlayData, name: string): Diagram {
    try {
        return { src: generateThumbnail(playData, { ...PRINT_DIAGRAM_SIZE }) };
    } catch (error) {
        console.warn(`Bench sheet: couldn't render the diagram for "${name}":`, error);
        return { failed: true };
    }
}

function DiagramBox({ text, busy = false }: { text: string; busy?: boolean }) {
    return (
        <Box
            aria-busy={busy || undefined}
            sx={{
                width: "100%",
                aspectRatio: `${PRINT_DIAGRAM_SIZE.width} / ${PRINT_DIAGRAM_SIZE.height}`,
                border: "1px dashed #999",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            <Typography variant="body2" sx={{ color: "#555" }}>
                {text}
            </Typography>
        </Box>
    );
}

export function PrintDiagram({ playData, name }: { playData: PlayData | null; name: string }) {
    const mounted = useMounted();
    const diagram = useMemo(
        () => (mounted && playData ? renderDiagram(playData, name) : null),
        [mounted, playData, name]
    );

    if (!playData || (diagram && "failed" in diagram)) return <DiagramBox text={DIAGRAM_UNAVAILABLE} />;
    if (!diagram) return <DiagramBox text="Rendering diagram…" busy />;
    return (
        // A data URL printed as-is: next/image would lazy-load it and could miss the printout.
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={diagram.src}
            alt={`Diagram: ${name}`}
            loading="eager"
            className="bench-diagram"
            width={PRINT_DIAGRAM_SIZE.width}
            height={PRINT_DIAGRAM_SIZE.height}
            style={{ width: "100%", height: "auto", display: "block" }}
        />
    );
}
```

- [ ] **Step 5: Create `LegendList`**

Create `components/features/practice-planner/print/LegendList.tsx`:

```tsx
"use client";

/**
 * The bench sheet's one legend (3b): every symbol any readable drill uses,
 * listed once with no toggle. Pass it combinedLegendData over all the
 * session's drills; buildLegend's Sets remove duplicates.
 */
import { Box, Typography } from "@mui/material";
import type { PlayData } from "@/types/practice-planner";
import { buildLegend } from "@/lib/utils/canvas/legend";
import { LegendSwatch } from "../PlayLegend";

export function LegendList({ playData }: { playData: PlayData | null }) {
    if (!playData) return null;
    const entries = buildLegend(playData);
    if (entries.length === 0) return null;
    return (
        <Box component="section" aria-label="Legend" className="bench-legend" sx={{ mt: 3 }}>
            <Typography variant="subtitle2" component="h2" sx={{ fontWeight: 800, mb: 1 }}>
                Legend
            </Typography>
            <Box
                component="ul"
                sx={{ listStyle: "none", m: 0, p: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 1 }}
            >
                {entries.map((entry) => (
                    <Box component="li" key={entry.key} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <LegendSwatch entry={entry} />
                        <Typography variant="body2">{entry.label}</Typography>
                    </Box>
                ))}
            </Box>
        </Box>
    );
}
```

- [ ] **Step 6: Create `BenchSheetDrill`**

Create `components/features/practice-planner/print/BenchSheetDrill.tsx`:

```tsx
"use client";

/** One drill on the bench sheet (3b). print.css keeps it on one page and breaks after every second drill. */
import { Box, Stack, Typography } from "@mui/material";
import type { PlayData } from "@/types/practice-planner";
import { PrintDiagram } from "./PrintDiagram";

/** "Station 2 of 3": a grouped drill's place in its block. */
export function stationTag(position: number, count: number): string {
    return `Station ${position} of ${count}`;
}

/** The drill's instructions, else its description, else nothing. Whitespace-only text counts as none. */
export function drillText(instructions: string | null, description: string | null): string | null {
    return instructions?.trim() || description?.trim() || null;
}

export interface BenchSheetDrillProps {
    /** 1-based position in sequence order */
    number: number;
    name: string;
    /** The block's start, already formatted ("6:00 PM EDT") */
    startLabel: string;
    /** The drill's own minutes */
    minutes: number;
    /** Set when the drill runs in a station block */
    station: { position: number; count: number } | null;
    playData: PlayData | null;
    /** drillText(instructions, description) */
    text: string | null;
    /** This drill ends a printed page (every second drill, never the last) */
    breakAfter: boolean;
}

export function BenchSheetDrill({ number, name, startLabel, minutes, station, playData, text, breakAfter }: BenchSheetDrillProps) {
    return (
        <Box
            component="article"
            aria-label={`Drill ${number}: ${name}`}
            className={breakAfter ? "bench-drill bench-drill--page-end" : "bench-drill"}
            sx={{ mb: 3 }}
        >
            <Stack direction="row" alignItems="baseline" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                <Typography variant="h6" component="h2" sx={{ fontWeight: 800 }}>
                    {`${number}. ${name}`}
                </Typography>
                <Typography variant="body2">{`${startLabel} · ${minutes} min`}</Typography>
                {station && (
                    <Typography variant="body2" sx={{ fontWeight: 700, border: "1px solid #000", px: 0.75 }}>
                        {stationTag(station.position, station.count)}
                    </Typography>
                )}
            </Stack>
            <PrintDiagram playData={playData} name={name} />
            {text && (
                <Typography variant="body2" className="bench-drill-text" sx={{ mt: 1, whiteSpace: "pre-wrap" }}>
                    {text}
                </Typography>
            )}
        </Box>
    );
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun run test __tests__/components/features/practice-planner/print __tests__/components/features/practice-planner/PlayLegend.test.tsx __tests__/components/features/practice-planner/StationMap.test.tsx`
Expected: PASS. `PlayLegend.test.tsx` and `StationMap.test.tsx` pass unchanged, which shows the rename changed nothing visible.

Run: `bun run type-check && bun run lint`
Expected: no errors. The only `no-img-element` site is disabled inline with its reason.

- [ ] **Step 8: Commit**

```bash
git add components/features/practice-planner/PlayLegend.tsx components/features/practice-planner/print __tests__/components/features/practice-planner/print
git commit -m "feat(practice-planner): bench sheet drill, diagram and legend components

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 6: `BenchSheet` and the `(print)` route

**Files:**
- Create: `components/features/practice-planner/print/BenchSheet.tsx`
- Create: `app/(print)/layout.tsx`
- Create: `app/(print)/print.css`
- Create: `app/(print)/practice-planner/[sessionId]/print/page.tsx`
- Test: `__tests__/components/features/practice-planner/print/BenchSheet.test.tsx` (create)
- Test: `__tests__/app/practice-session-bench-sheet-page.test.tsx` (create)

**Interfaces:**
- Consumes:
  - `PracticeSessionDetail` and `getPracticeSessionDetail` (Task 3)
  - `buildSchedule` (Task 2), and `sessionStart` and `sessionTimeZone` (Task 2)
  - `useClockText` (Task 4) and `SessionTimeline` with `variant="print"` (Task 4)
  - `BenchSheetDrill`, `drillText` and `LegendList` (Task 5)
  - `combinedLegendData` (`lib/utils/canvas/station-map.ts:115`)
  - `LinkButton` (`components/ui/NextLinkComposites.tsx:34`)
  - `requireAuth` (`lib/auth/session.ts:42`)
  - `LightThemeScope` (default export, `components/ui/LightThemeScope.tsx`)
- Produces:
  - `type BenchSheetSession = PracticeSessionDetail["session"]`, `NO_DRILLS_MESSAGE = "No drills planned"` and `BenchSheet({ session }: { session: BenchSheetSession })`
  - the route `/practice-planner/[sessionId]/print`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/features/practice-planner/print/BenchSheet.test.tsx`:

```tsx
/** BenchSheet (3b): header, timeline, one legend, then two drills per page. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayData } from "@/types/practice-planner";

const { mockGenerate } = vi.hoisted(() => ({ mockGenerate: vi.fn(() => "data:image/png;base64,AA==") }));
vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: mockGenerate }));
vi.mock("@/components/features/practice-planner/PlayLegend", () => ({
    LegendSwatch: () => <span data-testid="swatch" />,
}));

import { BenchSheet, type BenchSheetSession } from "@/components/features/practice-planner/print/BenchSheet";

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

function sessionPlay(
    name: string,
    sequence: number,
    runsWithPrevious: boolean,
    duration: number,
    extra: { instructions?: string | null; description?: string | null; playData?: PlayData | null } = {},
): BenchSheetSession["plays"][number] {
    return {
        id: `row-${name}`,
        sequence,
        duration,
        runsWithPrevious,
        instructions: extra.instructions ?? null,
        play: {
            id: `play-${name}`,
            name,
            description: extra.description ?? null,
            thumbnail: null,
            playData: extra.playData === undefined ? createEmptyPlayData() : extra.playData,
        },
    };
}

const SESSION: BenchSheetSession = {
    id: "csessionxxxxxxxxxxxxxxxxx",
    title: "Tuesday Skills",
    date: "2026-04-07T22:00:00.000Z",
    duration: 60,
    isShared: true,
    createdByName: "Coach",
    teamId: "cteamxxxxxxxxxxxxxxxxxxxx",
    teamName: "Ice Hawks U12",
    venueId: "cvenuexxxxxxxxxxxxxxxxxxx",
    venueName: "Test Rink",
    venueTimezone: "America/Denver",
    surfaceId: "csurfacexxxxxxxxxxxxxxxxx",
    surfaceName: "Main",
    segmentId: "csegmentxxxxxxxxxxxxxxxxx",
    segmentName: "Half A",
    segmentKind: "HALF",
    startAt: "2026-04-08T00:00:00.000Z", // 6:00 PM MDT on April 7
    plays: [
        sessionPlay("Breakout", 0, false, 15, { instructions: "Hard first pass.", playData: withPass("d1") }),
        sessionPlay("Regroup", 1, true, 10, { instructions: "  ", description: "Neutral-zone regroup.", playData: withPass("d2") }),
        sessionPlay("Shooting", 2, false, 10, { description: "Quick release." }),
        sessionPlay("Lost", 3, false, 5, { playData: null }),
        sessionPlay("Cooldown", 4, false, 5),
    ],
};

function renderSheet(session: BenchSheetSession = SESSION) {
    render(
        <ThemeProvider theme={createTheme()}>
            <BenchSheet session={session} />
        </ThemeProvider>,
    );
}

const drills = () => screen.queryAllByRole("article");

afterEach(() => {
    vi.restoreAllMocks();
    mockGenerate.mockClear();
});

describe("BenchSheet", () => {
    it("prints the header: title, team, date and time range in the venue's zone, and the booking", () => {
        renderSheet();
        expect(screen.getByRole("heading", { level: 1, name: "Tuesday Skills" })).toBeInTheDocument();
        expect(screen.getByText("Ice Hawks U12")).toBeInTheDocument();
        expect(screen.getByText("Tuesday, April 7, 2026 · 6:00 PM – 7:00 PM MDT")).toBeInTheDocument();
        expect(screen.getByText("Test Rink · Main · Half A")).toBeInTheDocument();
    });

    it("prints the timeline and one combined, de-duplicated legend on page 1", () => {
        renderSheet();
        expect(screen.getByRole("table", { name: "Session timeline" })).toBeInTheDocument();
        expect(screen.getByText("Planned 35 of 60 min")).toBeInTheDocument();
        const legend = screen.getByRole("region", { name: "Legend" });
        expect(within(legend).getAllByText("Pass")).toHaveLength(1);
    });

    it("starts drills on a new page and breaks after every second drill, never after the last", () => {
        renderSheet();
        expect(screen.getByRole("region", { name: "Drills" })).toHaveClass("bench-page-break");
        expect(drills().map((article) => article.classList.contains("bench-drill--page-end"))).toEqual([
            false, true, false, true, false,
        ]);
    });

    it("leaves no blank trailing page for an even number of drills", () => {
        renderSheet({ ...SESSION, plays: SESSION.plays.slice(0, 4) });
        expect(drills().map((article) => article.classList.contains("bench-drill--page-end"))).toEqual([
            false, true, false, false,
        ]);
    });

    it("tags stations with the block's start and prints each drill's own minutes", () => {
        renderSheet();
        const [breakout, regroup, shooting] = drills();
        expect(within(breakout).getByText("Station 1 of 2")).toBeInTheDocument();
        expect(within(breakout).getByText("6:00 PM MDT · 15 min")).toBeInTheDocument();
        expect(within(regroup).getByText("Station 2 of 2")).toBeInTheDocument();
        expect(within(regroup).getByText("6:00 PM MDT · 10 min")).toBeInTheDocument();
        expect(within(shooting).queryByText(/^Station /)).not.toBeInTheDocument();
        expect(within(shooting).getByText("6:15 PM MDT · 10 min")).toBeInTheDocument();
    });

    it("prints instructions, else the description, and nothing for a drill with neither", () => {
        renderSheet();
        const [breakout, regroup, shooting, , cooldown] = drills();
        expect(within(breakout).getByText("Hard first pass.")).toBeInTheDocument();
        expect(within(regroup).getByText("Neutral-zone regroup.")).toBeInTheDocument();
        expect(within(shooting).getByText("Quick release.")).toBeInTheDocument();
        expect(cooldown.querySelector(".bench-drill-text")).toBeNull();
    });

    it("has every readable diagram ready on first render, and a placeholder for an unreadable one", () => {
        renderSheet();
        const lost = drills()[3];
        expect(within(lost).getByText("Diagram unavailable")).toBeInTheDocument();
        expect(screen.getAllByRole("img", { name: /^Diagram: / })).toHaveLength(4);
        expect(mockGenerate).toHaveBeenCalledTimes(4);
        expect(mockGenerate).toHaveBeenCalledWith(expect.anything(), { width: 720, height: 306, pixelRatio: 3 });
    });

    it("prints the header and No drills planned for an empty session", () => {
        renderSheet({ ...SESSION, plays: [] });
        expect(screen.getByRole("heading", { level: 1, name: "Tuesday Skills" })).toBeInTheDocument();
        expect(screen.getByText("No drills planned")).toBeInTheDocument();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
        expect(drills()).toHaveLength(0);
    });

    it("falls back to the viewer's zone with no suffix for a venue zone Intl rejects", () => {
        renderSheet({ ...SESSION, venueTimezone: "Not/AZone" });
        const firstCell = within(screen.getByRole("table", { name: "Session timeline" })).getAllByRole("cell")[0];
        expect(firstCell.textContent).toMatch(/^\d{1,2}:\d{2} [AP]M$/);
    });

    it("prints on request only, and links back to the session", () => {
        const print = vi.spyOn(window, "print").mockImplementation(() => {});
        renderSheet();
        expect(print).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Print" }));
        expect(print).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("link", { name: "Back to session" })).toHaveAttribute(
            "href",
            "/practice-planner/csessionxxxxxxxxxxxxxxxxx",
        );
    });
});
```

Create `__tests__/app/practice-session-bench-sheet-page.test.tsx`:

```tsx
/** The bench-sheet route (3b): the detail page's gate, no dashboard chrome, light scheme. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockGetDetail, mockNotFound, mockRequireAuth } = vi.hoisted(() => ({
    mockGetDetail: vi.fn(),
    mockNotFound: vi.fn(() => {
        throw new Error("NEXT_NOT_FOUND");
    }),
    mockRequireAuth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    notFound: () => mockNotFound(),
    redirect: vi.fn(),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/actions/practice-session-queries", () => ({
    getPracticeSessionDetail: (...args: unknown[]) => mockGetDetail(...args),
}));
vi.mock("@/lib/auth/session", () => ({ requireAuth: (...args: unknown[]) => mockRequireAuth(...args) }));
vi.mock("@/components/features/practice-planner/print/BenchSheet", () => ({
    BenchSheet: ({ session }: { session: { title: string } }) => <div data-testid="bench-sheet">{session.title}</div>,
}));

import BenchSheetPage from "@/app/(print)/practice-planner/[sessionId]/print/page";
import PrintLayout from "@/app/(print)/layout";

const SESSION_ID = "csessionxxxxxxxxxxxxxxxxx";
const params = () => Promise.resolve({ sessionId: SESSION_ID });

beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ user: { id: "cuserxxxxxxxxxxxxxxxxxxxx" } });
});

describe("bench sheet page", () => {
    it("404s when the detail query rejects the viewer or finds nothing", async () => {
        mockGetDetail.mockResolvedValue(null);
        await expect(BenchSheetPage({ params: params() })).rejects.toThrow("NEXT_NOT_FOUND");
        expect(mockGetDetail).toHaveBeenCalledWith(SESSION_ID);
    });

    it("renders the bench sheet for a session the viewer can see", async () => {
        mockGetDetail.mockResolvedValue({ session: { title: "Tuesday Skills" }, isAdmin: false });
        render(await BenchSheetPage({ params: params() }));
        expect(screen.getByTestId("bench-sheet")).toHaveTextContent("Tuesday Skills");
        expect(mockNotFound).not.toHaveBeenCalled();
    });
});

describe("print layout", () => {
    it("requires sign-in before rendering anything", async () => {
        mockRequireAuth.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/login"));
        await expect(PrintLayout({ children: <p>sheet</p> })).rejects.toThrow("NEXT_REDIRECT:/login");
    });

    it("pins its children to the light scheme", async () => {
        render(await PrintLayout({ children: <p>sheet</p> }));
        expect(screen.getByText("sheet").closest("[data-mui-color-scheme='light']")).not.toBeNull();
        expect(mockRequireAuth).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test __tests__/components/features/practice-planner/print/BenchSheet.test.tsx __tests__/app/practice-session-bench-sheet-page.test.tsx`
Expected: FAIL with module-not-found errors for `BenchSheet`, the print page and the print layout.

- [ ] **Step 3: Create `BenchSheet`**

Create `components/features/practice-planner/print/BenchSheet.tsx`:

```tsx
"use client";

/**
 * Bench sheet (practice planner 3b). Page 1: the header, the timeline and one
 * combined legend. Then the drills, two per page. app/(print)/print.css does
 * the paging. Nothing auto-prints: the toolbar's Print button calls
 * window.print(), and the toolbar itself is hidden in print.
 */
import { Box, Button, Stack, Typography } from "@mui/material";
import { ArrowBack as ArrowBackIcon, PrintOutlined as PrintIcon } from "@mui/icons-material";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import type { PracticeSessionDetail } from "@/lib/actions/practice-session-queries";
import { buildSchedule } from "@/lib/utils/session-timeline";
import { combinedLegendData } from "@/lib/utils/canvas/station-map";
import { sessionStart, sessionTimeZone } from "@/lib/utils/date";
import { useClockText } from "@/lib/hooks/useClockText";
import { SessionTimeline } from "../SessionTimeline";
import { BenchSheetDrill, drillText } from "./BenchSheetDrill";
import { LegendList } from "./LegendList";

export type BenchSheetSession = PracticeSessionDetail["session"];

export const NO_DRILLS_MESSAGE = "No drills planned";

const MS_PER_MINUTE = 60_000;

export function BenchSheet({ session }: { session: BenchSheetSession }) {
    const start = sessionStart(session);
    const end = new Date(start.getTime() + session.duration * MS_PER_MINUTE);
    const { timeZone, showZone } = sessionTimeZone(session);
    const clock = useClockText(timeZone, showZone);
    const place = [session.venueName, session.surfaceName, session.segmentName].filter(Boolean).join(" · ");
    const legend = combinedLegendData(session.plays.map((sp) => ({ name: sp.play.name, playData: sp.play.playData })));
    const drills = buildSchedule(session.plays, start).flatMap((row) =>
        row.group.stations.map((sp, k) => ({
            sp,
            startsAt: row.startsAt,
            station: row.group.stations.length > 1 ? { position: k + 1, count: row.group.stations.length } : null,
        }))
    );

    return (
        <Box className="bench-sheet" sx={{ maxWidth: 820, mx: "auto", p: { xs: 2, sm: 4 }, bgcolor: "#fff", color: "#000" }}>
            <Stack direction="row" spacing={1} className="no-print" sx={{ mb: 3 }}>
                <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
                    Print
                </Button>
                <LinkButton href={`/practice-planner/${session.id}`} variant="outlined" startIcon={<ArrowBackIcon />}>
                    Back to session
                </LinkButton>
            </Stack>

            <Box component="header" sx={{ mb: 3 }}>
                <Typography variant="h4" component="h1" sx={{ fontWeight: 800 }}>
                    {session.title}
                </Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {session.teamName}
                </Typography>
                <Typography variant="body1">
                    {`${clock.longDate(start)} · ${clock.time(start, false)} – ${clock.time(end)}`}
                </Typography>
                {place && <Typography variant="body1">{place}</Typography>}
            </Box>

            {drills.length === 0 ? (
                <Typography variant="body1" sx={{ fontWeight: 700 }}>
                    {NO_DRILLS_MESSAGE}
                </Typography>
            ) : (
                <>
                    <SessionTimeline
                        variant="print"
                        plays={session.plays}
                        sessionStart={start}
                        timeZone={timeZone}
                        showZone={showZone}
                        durationMinutes={session.duration}
                    />
                    <LegendList playData={legend} />
                    <Box component="section" aria-label="Drills" className="bench-page-break" sx={{ mt: 4 }}>
                        {drills.map(({ sp, startsAt, station }, i) => (
                            <BenchSheetDrill
                                key={sp.id}
                                number={i + 1}
                                name={sp.play.name}
                                startLabel={clock.time(startsAt)}
                                minutes={sp.duration}
                                station={station}
                                playData={sp.play.playData}
                                text={drillText(sp.instructions, sp.play.description)}
                                breakAfter={i % 2 === 1 && i < drills.length - 1}
                            />
                        ))}
                    </Box>
                </>
            )}
        </Box>
    );
}
```

- [ ] **Step 4: Create the print CSS and layout**

Create `app/(print)/print.css`:

```css
/*
 * Bench sheet print rules (practice planner 3b). Imported only by
 * app/(print)/layout.tsx. Every rule is print-only or scoped to bench-* and
 * no-print classes, so the sheet stays harmless if a client navigation keeps
 * it loaded.
 */
@page {
  margin: 12mm;
}

.bench-timeline table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.bench-timeline th,
.bench-timeline td {
  border-bottom: 1px solid #999;
  padding: 4px 6px;
  text-align: left;
  vertical-align: top;
}

.bench-timeline ul {
  margin: 2px 0 0;
  padding-left: 1.1em;
}

.bench-over-time {
  font-weight: 700;
}

/* A drill never splits across pages. No forced heights: a full-width 720x306
   diagram is about 79 mm tall, so two drills with their text fit on A4 or Letter. */
.bench-drill {
  break-inside: avoid;
  page-break-inside: avoid;
}

@media print {
  html,
  body {
    background: #fff !important;
    color: #000 !important;
  }

  .no-print {
    display: none !important;
  }

  /* Drills start on page 2. */
  .bench-page-break {
    break-before: page;
    page-break-before: always;
  }

  /* Two drills per page: every second drill ends a page (BenchSheet skips the last). */
  .bench-drill--page-end {
    break-after: page;
    page-break-after: always;
  }

  .bench-sheet {
    max-width: none !important;
    padding: 0 !important;
  }
}
```

Create `app/(print)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import LightThemeScope from "@/components/ui/LightThemeScope";
import { requireAuth } from "@/lib/auth/session";
import "./print.css";

/**
 * Print surfaces (practice planner 3b bench sheet). No dashboard chrome, and
 * pinned to the light scheme, so paper gets black on white whatever the
 * viewer's theme. requireAuth is defense in depth: each page's own query also
 * redirects to login.
 */
export default async function PrintLayout({ children }: { children: ReactNode }) {
  await requireAuth();
  return (
    <LightThemeScope component="main" sx={{ minHeight: "100vh", bgcolor: "#fff", color: "#000" }}>
      {children}
    </LightThemeScope>
  );
}
```

- [ ] **Step 5: Create the page**

Create `app/(print)/practice-planner/[sessionId]/print/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BenchSheet } from "@/components/features/practice-planner/print/BenchSheet";
import { getPracticeSessionDetail } from "@/lib/actions/practice-session-queries";

export const metadata: Metadata = {
  title: "Bench Sheet | OpenLeague",
  description: "Printable practice session bench sheet",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

/**
 * The same gate as the session detail page: the query redirects an
 * unauthenticated visitor to login (requireUserId), and returns null for a
 * non-member or for a member viewing an unshared session, which is a 404 here.
 * There is no public or shareable link (ADR-0011).
 */
export default async function BenchSheetPage({ params }: PageProps) {
  const { sessionId } = await params;

  const data = await getPracticeSessionDetail(sessionId);
  if (data === null) notFound();

  return <BenchSheet session={data.session} />;
}
```

The dynamic segment is named `[sessionId]`, the same as `app/(dashboard)/practice-planner/[sessionId]`. Next requires one slug name per level across route groups, and Task 7's `bun run build` checks it.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run test __tests__/components/features/practice-planner/print __tests__/app/practice-session-bench-sheet-page.test.tsx`
Expected: PASS.

Run: `bun run type-check && bun run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/features/practice-planner/print/BenchSheet.tsx "app/(print)" __tests__/components/features/practice-planner/print/BenchSheet.test.tsx __tests__/app/practice-session-bench-sheet-page.test.tsx
git commit -m "feat(practice-planner): printable bench sheet route

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 7: Full gates and the roadmap

**Files:**
- Modify: `docs/superpowers/specs/2026-10-03-practice-planner-roadmap.md:14` (row 6)

**Interfaces:**
- Consumes: everything above.
- Produces: a green branch, ready for a PR.

- [ ] **Step 1: Run every gate**

Run: `bun run type-check`
Expected: no errors.

Run: `bun run lint`
Expected: no errors.

Run: `bun run check:raw-sql`
Expected: passes (no SQL was added).

Run: `bun run test`
Expected: the whole suite passes. If something outside the files this plan touched fails, check `gh run list --branch main` before treating it as a regression: absolute-date fixtures have rotted on `main` before.

Run: `bun run build`
Expected: the build succeeds and lists `/practice-planner/[sessionId]/print` next to `/practice-planner/[sessionId]` and `/practice-planner/[sessionId]/edit`. A slug-name mismatch between `(print)` and `(dashboard)` shows up only here. So would a problem with the global CSS import in the nested layout.

- [ ] **Step 2: Update the roadmap**

In `docs/superpowers/specs/2026-10-03-practice-planner-roadmap.md`, replace:

```markdown
| 6 | 3b: timeline and bench sheet | Spec `2026-10-03-practice-session-timeline-bench-sheet-design.md` |
```

with:

```markdown
| 6 | 3b: timeline and bench sheet | Implemented on `feat/practice-bench-sheet` |
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-10-03-practice-planner-roadmap.md
git commit -m "docs(practice-planner): mark 3b implemented on the roadmap

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

- [ ] **Step 4: Carry the manual checks into the PR description (Ruling 15)**

Add this reviewer checklist to the PR body:
- [ ] Chrome: Print preview shows page 1 (header, timeline, legend), then two drills per page, with no drill split and no blank last page.
- [ ] Safari: the same, and the diagrams are sharp at 100% zoom.
- [ ] Dark mode: the bench sheet is still black on white, on screen and in print.
- [ ] A booked session shows venue-zone times with the zone name, and an unbooked one shows the viewer's times with no suffix.

---

## Self-review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Timeline rows, start time, duration, names, "Stations · N", footer, over-time styling | 4 |
| Venue zone with short name when booked; otherwise viewer zone with no suffix | 2 (helpers), 4 (screen), 6 (print) |
| Header date and time use the zone rule | 4 |
| "Print bench sheet" button for everyone, new tab, `rel="noopener"` | 4 |
| Print route: same gate, login redirect, 404 | 3 (access matrix), 6 (page and layout) |
| Page 1: header, timeline, combined legend; then two drills per page with number, name, time, minutes, station tag, diagram, text | 5, 6 |
| `break-inside: avoid`; toolbar hidden in print; no auto-print | 6 (CSS, `window.print` test) |
| 720×306 at `pixelRatio: 3`; clamp; uncached rink; ratio 1 unchanged | 1, 5 |
| Unreadable drill shows "Diagram unavailable"; empty session shows "No drills planned"; a thrown render warns | 5, 6 |
| `buildSchedule` and the date helpers, with a DST test | 2 |
| Query returns `venueTimezone`; access unchanged | 3 |
| `SessionDetailView` stays at or under 900 lines | 4 (line-budget test) |
| `LightThemeScope`, no dashboard chrome, `requireAuth` in the layout | 6 |
| Legend de-duplicated, with a pinning test | 5, 6 |
| Hydration risk | Ruling 1; 4 (SSR tests) |
| Gates, including `build` | 7 |

**Placeholder scan:** every code step carries its code, and every test step carries its test.

**Type consistency:**
- `buildSchedule`, `ScheduleRow`, `formatClockTime`, `formatLongDate`, `sessionTimeZone` and `sessionStart` (Task 2) are used with the same signatures in Tasks 4 and 6.
- `useClockText(timeZone, showZone).time(date, withZone?)` is used the same way in `SessionTimeline`, `SessionDetailView` and `BenchSheet`.
- `useMounted` is imported from `@/lib/hooks/useClockText` in `PrintDiagram`.
- `PracticeSessionDetail["session"]` (Task 3) is `BenchSheetSession` (Task 6).
- `LegendSwatch` (Task 5) is the only name the `LegendList` and `BenchSheet` tests mock.
