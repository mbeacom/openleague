# Practice Sessions: Timeline & Bench Sheet — Design

**Date:** 2026-10-03
**Status:** Implemented (3b)
**Phase:** 3b, the last phase of the practice-planner iteration. Build order: hotfix ✓ → 3a ✓ → 2a ✓ → 2b ✓ (#379) → **3b**.
**Depends on:**
- 2b `lib/utils/session-timeline.ts`. `groupStations` already yields `startMinute` and `wallMinutes` for each block.
- 2a `PlayData.area`, plus `drawBoardScene` / `generateThumbnail`.

The accepted decisions are in `2026-10-03-practice-planner-roadmap.md` (Phase 3b). This spec makes them concrete.

## Context

- `getPracticeSessionDetail` (`lib/actions/practice-session-queries.ts`) is the only read for the session page.
  - It gates on team membership: an admin always gets the session; a member gets it only once `isShared` is set. Otherwise it returns null, and the page calls `notFound()`.
  - It returns `date`, `duration`, `startAt` (UTC, set when booked), venue, surface and segment names, `segmentKind`, and plays with `playData` (null when it can't be read).
  - It does **not** select `venue.timezone`.
- `Venue.timezone` exists (`String @default("America/New_York")`). `PracticeSession` has no timezone.
- `SessionDetailView` formats `date` and `startAt` with `toLocale*String("en-US")` and no `timeZone`, so it shows the viewer's zone even for a booked venue.
- `generateThumbnail(playData, {width,height,quality,backgroundColor})` sets the canvas's backing size to its logical size. There is no pixel-ratio handling anywhere.
- No print CSS, `window.print` or `(print)` route group exists.
- The `(dashboard)` layout adds the nav chrome.
- The root layout carries the theme (light/dark), toast, session, analytics and service-worker providers.
- `LightThemeScope` pins the light scheme.

## Goal

1. A coach sees, on the session page, **when each block runs**: start clock times, block lengths, and planned versus booked minutes.
2. A coach can **print a bench sheet**: one clean paper document with that timeline and every drill's diagram and instructions, to carry onto the bench.

### Success criteria

- **A timeline on the session detail page.**
  - It has one row per block: a standalone drill, or a station group.
  - Each row shows a start clock time, a duration, and the drill name(s). For a station group the label is "Stations · N" and lists each station's drill.
  - A footer reads "Planned X of Y min". When over, the existing over-time styling applies.
- **Clock times:**
  - When the session is booked (`venueId` set), times start at `startAt` and are formatted in the **venue's timezone**, with a short zone name (e.g. "6:00 PM EDT").
  - Otherwise times start at `date` and use the viewer's timezone, with no zone suffix.
- **The header date and time** use the same timezone rule, which fixes the current viewer-zone rendering for booked sessions.
- **Opening the bench sheet.** A "Print bench sheet" button on the detail page opens `/practice-planner/<id>/print` in a new tab. It is visible to everyone who can see the page.
- **The print route** uses the same gate as the detail page (the same query). An unauthenticated visitor is redirected to login (`requireUserId` in the query). A signed-in user the gate rejects gets a 404.
- **Print layout (A4/Letter portrait):**
  - **Page 1:**
    - A header: title, team, date, time range, venue · surface · segment;
    - the timeline table;
    - one combined legend covering every readable drill.
  - **Then two drills per page.** Each drill has:
    - its sequence number and name, and its block start time and duration;
    - a "Station k of N" tag when it is grouped;
    - the diagram;
    - its instructions, or its description when there are no instructions.
  - Drills never split across pages (`break-inside: avoid`).
  - On screen, the page shows a toolbar ("Print", "Back to session") that is hidden in print. Nothing auto-prints.
- **Diagram quality.** Diagrams render at 720×306 logical pixels with `pixelRatio: 3`, so the backing canvas is 2160×918 and the strokes stay crisp on paper.
- **Missing parts:**
  - An unreadable drill prints its text with a "Diagram unavailable" box.
  - A session with no drills prints the header plus "No drills planned".

### Non-goals

- A live countdown or running clock; break or transition rows; rotation scheduling.
- Server-side PDF, new dependencies, or a public or shareable print link (ADR-0011).
- Editing anything from the print page.

## Approach

**Recommended: a dedicated `(print)` route group, with client-rendered diagrams and print CSS.**

- `app/(print)/layout.tsx` calls `requireAuth()`, which is defense in depth: the query also redirects. It wraps its children in `LightThemeScope` and renders no dashboard chrome.
- `app/(print)/practice-planner/[sessionId]/print/page.tsx` is a server component. It calls `getPracticeSessionDetail` and calls `notFound()` on null.
- It renders `<BenchSheet session=… />`, a client component, because the diagrams need a canvas.

Rejected alternatives:
- **A print stylesheet on the existing detail page.** That page's layout (sidebar, one drill at a time) and dashboard chrome don't suit paper. Hiding everything with print CSS is fragile.
- **Server-side PDF** (`@react-pdf`, Puppeteer). It needs new dependencies and server rendering of the canvas, and the roadmap rejected it.

Route note: the URL `/practice-planner/[sessionId]/print` sits beside `(dashboard)/practice-planner/[sessionId]`. The dynamic segment must have the same name, `[sessionId]`, and `bun run build` must pass because route collisions only show up at build time.

## Shared logic

### `lib/utils/session-timeline.ts`: add a pure schedule builder

```ts
export interface ScheduleRow<T extends TimelinePlay> {
  group: StationGroup<T>;
  startsAt: Date;          // sessionStart + group.startMinute
  endsAt: Date;            // startsAt + group.wallMinutes
}
export function buildSchedule<T extends TimelinePlay>(plays: T[], sessionStart: Date): ScheduleRow<T>[];
```

It does no formatting. Formatting happens through the date helpers, so the module stays timezone-free and easy to test.

### `lib/utils/date.ts`: formatting helpers

- `formatClockTime(date: Date, timeZone?: string, withZone = false): string`. Output looks like "6:00 PM", or "6:00 PM EDT" when `withZone` is true. It uses `Intl.DateTimeFormat("en-US", {hour:"numeric", minute:"2-digit", timeZone, timeZoneName: withZone ? "short" : undefined})`.
- `sessionTimeZone(session): { timeZone?: string; showZone: boolean }`:
  - When the venue's `timezone` is set and valid (it reuses `isValidTimeZone` / `resolveTimeZone`), it returns `{timeZone: tz, showZone: true}`.
  - Otherwise it returns `{timeZone: undefined, showZone: false}`.
- `sessionStart(session): Date`: `startAt ?? date`.

### Query

- `getPracticeSessionDetail` adds `venue: { select: { name: true, timezone: true } }` and returns `venueTimezone: string | null`.
- The access logic does not change.
- The print page uses the same query.

## Components

- **`SessionTimeline.tsx`** (new, client).
  - Props: `{ plays, sessionStart: Date, timeZone?, showZone, durationMinutes, activePlayId?, onSelectPlay? }`.
  - It renders a compact MUI table. In print mode it renders a plain table.
  - Each row has: start time, minutes, and names. Station rows list each drill.
  - On screen, clicking a drill name calls `onSelectPlay`, which sets the active drill in `SessionDetailView`. The active row is highlighted.
  - It has a `variant: "screen" | "print"` prop.
- **`SessionDetailView.tsx`:**
  - Mounts `SessionTimeline` above the drill sidebar and main panel. It replaces the separate "X / Y min" text but keeps the progress bar and the over-time styling.
  - Formats the header date and time with the timezone rule.
  - Adds a "Print bench sheet" button (`PrintOutlined` icon, `href` to the print route, `target="_blank"`, `rel="noopener"`).
  - The file is 822 lines and must stay at or under 900, so new logic goes into `SessionTimeline`.
- **`BenchSheet.tsx`** (new, client; under `components/features/practice-planner/print/`):
  - Renders the on-screen toolbar (`className="no-print"`), the page-1 header, the timeline (print variant), the combined legend, and the drill pages.
  - A drill unit is `BenchSheetDrill`, which renders its diagram through `PrintDiagram`.
- **`PrintDiagram.tsx`** (client):
  - In `useEffect`, it calls `generateThumbnail(playData, {width: 720, height: 306, pixelRatio: 3})` and renders an `<img>` with `width:100%`.
  - It shows a placeholder until the image is ready, and "Diagram unavailable" when `playData` is null.
  - Using an `<img>` rather than a live canvas makes printing reliable across browsers.
- **Legend:** a new `LegendList` (print folder) renders `buildLegend(combinedLegendData(allReadableDrills))` as a static list with no toggle. `PlayLegend` stays unchanged.
  - `combinedLegendData` (2b, `station-map.ts`) is applied to **all** the session's readable drills.
  - The legend de-duplicates entries by kind, done in `buildLegend` or in the combiner. A test pins this.
- **Print CSS** (`app/(print)/print.css`, imported by the `(print)` layout):
  - `@page { margin: 12mm }`;
  - `.no-print { display: none }` under `@media print`;
  - `.bench-drill { break-inside: avoid }`;
  - `.bench-page-break { break-before: page }`;
  - two drills per page come from `break-inside: avoid` on each drill and `break-after: page` on every second one. Heights are not forced (no `vh`): a full-width 720×306 diagram is about 79 mm tall, so two drills with their text fit on Letter or A4;
  - black text on white.

## `generateThumbnail` pixel ratio

- `ThumbnailOptions` gains `pixelRatio?: number`, defaulting to 1 and clamped to the range [1, 4].
- The canvas backing size is `round(width*pr) × round(height*pr)`.
- `ctx.scale(pr, pr)` is applied before any drawing.
- The transform is still built from the logical `width`/`height`, so geometry and stroke widths scale uniformly.
- The rink-background cache (`getCachedRinkCanvas` in `rink-renderer.ts`) is a logical-size offscreen canvas that is blitted with `drawImage`. Under `scale(pr)` it would print blurry, so when `pr > 1` `generateThumbnail` passes `cachedRink: false` to `drawBoardScene` and the rink is drawn as vectors. A test pins this.
- When `pixelRatio` is 1, the output is byte-identical to today's. Existing callers are unchanged.

## Error handling

- Exactly as on the detail page: an unauthenticated visitor is redirected to login. A non-member, or a member viewing an unshared session, gets a 404.
- An unreadable drill (`playData` null) shows its text plus a "Diagram unavailable" box. It never throws.
- An invalid venue timezone falls back to the viewer's zone with no suffix.
- If thumbnail generation throws (for example, no 2d context), `PrintDiagram` shows "Diagram unavailable" and logs a `console.warn`.

## Testing

- **`buildSchedule`:**
  - sequential drills;
  - station groups, where a block takes the longest drill's minutes;
  - start offsets add up;
  - an empty list.
- **Date helpers:**
  - a venue zone formats in that zone with its suffix, including across a DST boundary (e.g. 2026-11-01 America/New_York);
  - an invalid zone falls back;
  - `sessionStart` prefers `startAt`.
- **`generateThumbnail`:**
  - With `pixelRatio: 3`, the canvas has the scaled backing size and `scale(3,3)` is called.
  - Without it, `scale` is not called and the size is unchanged.
  - The pixel ratio is clamped.
- **Query:** `venueTimezone` is returned. The access matrix does not change: admin; member + shared; member + unshared → null; non-member → null.
- **`SessionTimeline`:**
  - rows, times and zone suffix;
  - station rows list their drills;
  - "Planned X of Y min" and the over-time state;
  - clicking a row selects its drill.
- **`SessionDetailView`:**
  - the print button links to `/practice-planner/<id>/print` in a new tab;
  - a booked session's header uses the venue zone.
- **`BenchSheet`:**
  - the header fields;
  - a page break after every second drill;
  - instructions fall back to the description;
  - "Station k of N" tags;
  - an unreadable drill shows the placeholder;
  - the empty session;
  - the combined legend is de-duplicated;
  - the toolbar's Print button calls `window.print`. Tests stub it with `vi.spyOn(window, "print").mockImplementation(() => {})`, because jsdom doesn't implement it.
- **Print page (server):** `notFound()` when the query returns null.
- **Gates:** `bun run type-check`, `lint`, `test`, and **`build`** (to catch a route collision).

## Risks

- **Two route groups resolve under `/practice-planner/[sessionId]/…`.** This is legal while the dynamic segment names match. The build gate catches a mismatch.
- **Hydration.** Clock times formatted without a fixed zone differ between the server and the browser. Timeline and header times therefore render client-side, or with `suppressHydrationWarning` on the time text, matching the existing header behaviour.
- **Browser print engines differ** in how they handle `break-inside` with images. Keeping a fixed diagram aspect ratio and using `<img>` keeps this predictable. Manual print checks in Chrome and Safari are part of the test plan.
