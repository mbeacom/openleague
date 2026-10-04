# Practice Plan Document Exports — Design

**Date:** 2026-10-03
**Status:** Accepted
**Sub-project:** 4 of the static planner. Order and decisions are in `2026-10-03-static-planner-roadmap.md` (row 4: "self-contained HTML bench sheet (opens in Google Docs and Word), optional lazy-loaded `.docx`").
**ADR:** ADR-0020 (amended here: one lazy-loaded runtime dependency). ADR-0008 (free, provider-portable) and ADR-0005 (Bun) also apply.

## Goal

From the session page, hosted **and** static, a coach can download the practice as:

1. **A bench sheet file (`.html`).** One self-contained file: inline CSS, diagrams and legend swatches embedded as PNG `data:` URIs, no scripts, no external requests. It opens offline in any browser, prints like the bench sheet (header, timeline, legend on page 1, then two drills per page), and imports into Google Docs with a readable layout.
2. **A Word document (`.docx`).** The same content as native Word paragraphs, tables and images. It is the reliable path into Word and Pages, and it is built by a library that loads only when the coach clicks the item.

Plus three leftovers from #391 (one task): the static import screen's doubled privacy note, a file read that can overwrite a newer pasted link, and the build checker's false positive on `if (typeof process …) { …process.env… }`.

## Context (verified at `0152ca6`)

- **Export menu.** `components/features/practice-planner/ExportPlanMenu.tsx` renders "Download plan file" and the platform's hand-off item (`PlannerPlatform.planLink`). Its `session` prop is `ExportableSession` (title, date, duration, `startAt`, `venueTimezone`, plays with name/description/playData). `SessionDetailView` passes its whole `PracticeSessionView`, which also carries `teamName`, `venueName`, `surfaceName`, `segmentName`. The download code (Blob → `<a download>` → revoke after 1 s) is inline in `download()`.
- **Bench sheet.** `print/BenchSheet.tsx` builds its rows with `buildSchedule` (`lib/utils/session-timeline.ts`), formats with `useClockText` over `sessionTimeZone`/`formatClockTime`/`formatLongDate` (`lib/utils/date.ts`), draws diagrams through `PrintDiagram` (`generateThumbnail(playData, { width: 720, height: 306, pixelRatio: printPixelRatio(readableCount) })`, 3/2/1 for ≤12/≤40/more), and the legend through `LegendList` → `buildLegend(combinedLegendData(...))` → `LegendSwatch` (a 40×20 canvas painted inside a `useEffect`). Text helpers already exist: `stationsLabel`, `plannedLabel` (`SessionTimeline.tsx`), `drillText`, `stationTag` (`print/BenchSheetDrill.tsx`). Print rules (`app/(print)/print.css`): drills in `.bench-page` pairs, each pair after the first breaks to a new page, drills never split, diagrams capped at 85 mm in print.
- **File names.** `planFileName(title)` (`lib/plan-document/document.ts`) slugs the title (NFKD, lowercase ASCII, hyphens, ≤ 60 chars, fallback `practice-plan`) and appends `.olplan.json`.
- **Static app.** Vite SPA (`apps/planner/`), CSP `script-src 'self'; img-src 'self' data: blob:; connect-src 'self'`. Viewer's zone only (no venue). `LOCAL_TEAM_NAME = "This device"` fills the view's `teamName`. `scripts/check-planner-build.ts` scans `dist/planner` for forbidden markers and unguarded `process.env`.
- **Hosted CSP** already allows `'unsafe-eval'`; the static one does not.
- **Canvas in tests.** `vitest.setup.ts` stubs `getContext("2d")` and `toDataURL` (`data:image/png;base64,mockImageData`); component tests mock `generateThumbnail`.

### The `docx` library, measured

Probed in a scratch project (`docx@9.8.1`, bundled with esbuild for the browser, minified):

| Fact | Value |
|---|---|
| License | MIT. Transitive: `jszip` (MIT OR GPL-3.0, used under MIT), `pako` (MIT AND Zlib), `sax` (BlueOak-1.0.0), `inherits`/`minimalistic-assert` (ISC), the rest MIT. All permissive, no service, no key (ADR-0008). |
| Size | ≈ 404 KB minified, ≈ 118 KB gzip, including `jszip` and its shims. |
| `process.env` reads | none. `NEXT_PUBLIC_`, `next/dist`, telemetry hosts: none. |
| `new Function` | one, inside the `setImmediate` shim, reached only when passed a string; `docx` never does. The static CSP (no `'unsafe-eval'`) is safe. |
| Browser API | `Packer.toBlob(doc)` returns a Blob typed `application/vnd.openxmlformats-officedocument.wordprocessingml.document`. Works under Bun and jsdom. |
| Typings | `dist/index.d.ts` imports `Stream` from `"stream"`; `docx` lists `@types/node ^26` as a dependency while the repo pins `^25`. `skipLibCheck` is on, so a nested copy should not surface; the plan verifies with `bun run type-check` right after install. |
| Marker | The bundle contains the literal `word/document.xml`; the build check keys on it. |

## Decisions

1. **`.docx` ships now**, built with **`docx` `^9.8.1`** as a runtime dependency, loaded only by `import()` inside the menu click, in both deployables. Next (Turbopack) and Vite each split a dynamic import into its own chunk, so neither main bundle grows. Rejected:
   - *HTML only, "open it in Word".* Word's HTML import shares Outlook's rendering engine, which does not reliably show `data:` images, so diagrams would vanish in the one app the roadmap names. `.docx` is the dependable path.
   - *A hand-written OOXML + zip writer.* About 300 lines of zip, CRC and DrawingML to maintain against Word's strictness, to save a lazy 118 KB chunk.
   - *Server-side generation.* The static app has no server, and hosted would need a new route (ADR-0002).
2. **One model, two renderers.** `buildBenchSheetModel(session, renderers)` turns a session into plain strings, numbers and PNG data URIs. `renderBenchSheetHtml(model)` and `renderBenchSheetDocx(model)` only lay it out. Images come from injected renderers, so the model and both renderers are testable without a canvas, and the docx module imports nothing but `docx` and the model's types.
3. **HTML is built as a string with mandatory escaping**, not with `react-dom/server`. The export needs plain elements with inline CSS, so rendering the MUI `BenchSheet` would produce Emotion class names with no styles. A small `html` tagged template escapes every interpolation (`& < > " '`) unless wrapped in a `trusted()` value that only the renderer creates. Image sources pass `isPngDataUri` (`^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$`) or the drill shows "Diagram unavailable". Defense in depth: the file carries `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">`, so even an escaping bug could neither run script nor fetch anything.
4. **Diagrams** use the bench sheet's exact settings: `generateThumbnail(playData, { width: 720, height: 306, pixelRatio: printPixelRatio(readableCount) })`. Legend swatches reuse the legend's painting code, moved out of `LegendSwatch`'s effect into `paintLegendSwatch(ctx, entry)` (`lib/utils/canvas/legend-swatch.ts`), drawn at 40×20 × 2.
5. **Time zones** follow the bench sheet: `sessionStart` + `sessionTimeZone` + `formatClockTime`/`formatLongDate`. A booked hosted session prints in the venue zone with its short name ("6:00 PM MDT"); anything else, including every static session, prints in the exporting viewer's zone with no suffix. The export runs in a click handler, so there is no hydration concern and `useClockText` is not needed. Times are baked into the file as text.
6. **File names** reuse the plan slug: `planSlug(title)` is extracted from `planFileName` (whose output stays byte-identical), and `planExportFileName(title, "html" | "docx")` returns `<slug>.html` / `<slug>.docx`.
7. **Menu.** `ExportPlanMenu` gains **Download bench sheet (HTML)** and **Download Word document (.docx)** between "Download plan file" and the hand-off item. `ExportableSession` gains optional `teamName`, `venueName`, `surfaceName`, `segmentName`, so existing callers and tests are unchanged. The static app passes the same `PracticeSessionView`, but its `teamName` is the placeholder "This device", so the export omits the team line when `planGenerator === "openleague-static"`.
8. **Shared download helper.** The Blob-anchor-revoke sequence moves to `downloadBlob(blob, fileName)` and all three downloads use it.
9. **Bundle isolation is enforced, not hoped for.**
   - ESLint: the ADR-0020 portable block forbids static imports of `docx` and of `@/components/features/practice-planner/export/bench-sheet-docx`. `no-restricted-imports` does not see `import()`, so the lazy path stays legal; the docx module's own `import … from "docx"` carries a reasoned `eslint-disable-next-line`.
   - Static build check: the entry chunk named by `index.html` must not contain `word/document.xml`, and some emitted chunk must (the export was bundled).
   - Hosted: a manual check in the gates (DevTools Network: no docx chunk until the click).
10. **ADR-0020 is amended**, not superseded: the Decision gains "document exports", the trade-offs gain "one lazy runtime dependency", and action item 4 is ticked. Paths are already covered by `components/features/practice-planner/**`. A new ADR would be heavier than the decision: one MIT dependency, lazily loaded, behind an existing seam.

## The bench sheet model

`components/features/practice-planner/export/bench-sheet-model.ts`:

```ts
export interface ExportSession {           // = ExportableSession (ExportPlanMenu re-exports it)
    title: string; date: string; duration: number;
    startAt?: string | null; venueTimezone?: string | null;
    teamName?: string | null; venueName?: string | null; surfaceName?: string | null; segmentName?: string | null;
    plays: Array<{ sequence: number; duration: number; instructions: string | null; runsWithPrevious: boolean;
                   play: { name: string; description: string | null; playData: PlayData | null } }>;
}
export interface BenchSheetModel {
    title: string;
    teamName: string | null;                 // null: omitted (static, or blank)
    when: string;                            // "Tuesday, April 7, 2026 · 6:00 PM – 7:00 PM MDT"
    place: string | null;                    // "Rink · Sheet A · Half", null when unbooked
    timeline: Array<{ start: string; minutes: number; name: string | null; stations: string[] | null }>;
    planned: string;                         // plannedLabel(...)
    overTime: boolean;
    legend: Array<{ label: string; image: string | null }>;
    drills: Array<{ number: number; name: string; start: string; minutes: number;
                    station: string | null; diagram: string | null; text: string | null }>;
}
export interface BenchSheetRenderers {
    diagram(playData: PlayData, pixelRatio: number): string | null;   // null: render failed
    swatch(entry: LegendEntry): string | null;
}
```

- A timeline row for a lone drill has `name` and `stations: null`; a station block has `name: null` and `stations: ["Breakout · 10 min", …]`, labelled `stationsLabel(n)` by the renderers.
- `drills` follow `buildSchedule` order, numbered from 1; `station` is `stationTag(k, n)` in a block; `text` is `drillText(instructions, description)`; `diagram` is null for an unreadable drill or a failed render.
- An empty session gives `timeline: []`, `drills: []`, `legend: []`; the renderers then print "No drills planned" (`NO_DRILLS_MESSAGE`).

## HTML file

```html
<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="…as above…">
<meta name="generator" content="OpenLeague">
<title>{title} · Bench sheet</title>
<style>…</style>
</head><body><main class="sheet">
  <header> h1 title · p team · p when · p place </header>
  <section class="timeline"> table (Start | Min | Drill) + p planned </section>
  <section class="legend"> h2 Legend · ul of (img swatch + label) </section>
  <section class="drills"> div.page (two article.drill each) … </section>
</main></body></html>
```

- **Structure carries the layout**, because Google Docs and Word drop most `<style>` rules: real `h1`/`h2`/`table`/`th`/`ul`, `border="1"` and `cellpadding` on the table, `width`/`height` attributes on every `img`, and the page breaks as **inline** `style="page-break-before:always;break-before:page"` on each `.page` (drills start on page 2). Newlines in instructions become `<br>`.
- **The stylesheet** is the "Digital Playbook" look on paper: League Blue `#0D47A1` headings, an Action Blue `#1976D2` rule under the header, a pale `#E3F2FD` timeline header row, times in a mono stack, black body text on white. Fonts are named, never fetched: `"Cabinet Grotesk", "Avenir Next", "Segoe UI", system-ui, sans-serif` and `"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace`. `@page { margin: 12mm }`; `.drill { break-inside: avoid }`; in print, diagrams cap at 85 mm, as in `print.css`.
- **No `<script>`, `<link>`, `@import`, `url(`, `src=` other than PNG data URIs, or `href=`.** A test pins every one.

## Word document

- Letter portrait, 12 mm (680 twip) margins; title and creator ("OpenLeague") in the document properties.
- Page 1: `Heading1` title, team, when, place; the timeline as a full-width table with a repeating header row (station blocks: a bold "Stations · N" line plus one "• name · N min" line per drill); the planned line (bold when over time); "Legend" (`Heading2`) with one paragraph per entry (a 30×15 swatch image, then the label).
- Drills: `Heading2` "1. Breakout" with `pageBreakBefore` on drills 1, 3, 5 … (two per page) and `keepNext`; a line "6:00 PM · 10 min · Station 1 of 2"; the diagram as an `ImageRun` 680×289 px (the 720×306 aspect) with alt text "Diagram: <name>", or the italic text "Diagram unavailable"; the text, one run per line with breaks.
- `docx` escapes all text itself; PNG bytes come from the data URI (`dataUriToBytes`), never from a URL.

## Export flow (`export/export-bench-sheet.ts`)

```ts
export type BenchSheetFormat = "html" | "docx";
export async function exportBenchSheet(session: ExportSession, format: BenchSheetFormat, options: { omitTeam: boolean }): Promise<void>
```

1. Yield one task (`setTimeout 0`) so the menu closes and the busy notice paints.
2. `buildBenchSheetModel(session, canvasRenderers, options)`. `canvasRenderers` wrap `generateThumbnail` and `paintLegendSwatch` in `try`, returning null and `console.warn`ing on failure.
3. HTML: `downloadBlob(new Blob([renderBenchSheetHtml(model)], { type: "text/html;charset=utf-8" }), planExportFileName(title, "html"))`.
4. Word: `const { renderBenchSheetDocx } = await import("./bench-sheet-docx")`, then `downloadBlob(await renderBenchSheetDocx(model), planExportFileName(title, "docx"))`.

**Menu states.** While an export runs, both export items are disabled and an info notice reads "Preparing the bench sheet…" or "Preparing the Word document…". On success the notice clears. Errors:

| Failure | Notice (error) |
|---|---|
| The docx chunk fails to load (offline static app that never loaded it, a deploy replaced the chunk) | "Couldn't load the Word export. Check your connection and try again, or download the bench sheet (HTML)." |
| Anything else throws | "Couldn't create the file. Try again, or use Print bench sheet." |

An unreadable or unrenderable diagram never fails the export: the drill says "Diagram unavailable".

## Leftovers from #391

- **(a) One privacy note on Import.** `ImportScreen` renders inside `AppShell`, whose footer already carries `PRIVACY_NOTE`; the screen's own copy goes. Tests: the screen alone shows none; the app on `#/import` shows it exactly once.
- **(b) A pasted link beats a slower file.** `latestLink` becomes `latestChoice`, a ref holding a fresh `Symbol` per choice (each link read and each file pick). `onFile` takes its token before `await readPlanFile(file)` and drops the result if the token changed. Test: a file whose `text()` is held open, a link pasted meanwhile, then the file resolves; the link's plan stays on screen.
- **(c) The build check recognizes an enclosing `if` guard.** When the scan back from a `process.env` read stops at a `{` that opens the block of `if ( … )` whose condition proves `process` exists (`typeof process !== "undefined"`, `!= "undefined"`, minified `<"u"`, `=== "object"`) and contains no `||`, the read counts as guarded. Only the block directly under the `if`: a nested block, an `else` block, or a later statement still counts. The strictness is documented in a comment and pinned by tests.

## Testing

- **Model:** header lines in a venue zone with suffix and in the viewer zone without; place joins and omits; team omitted with `omitTeam` or a blank name; timeline rows for lone drills and station blocks; planned/over time; drills numbered in schedule order with station tags and text fallback; pixel ratio from `printPixelRatio(readable count)`; a renderer returning null leaves `diagram: null`; legend de-duplicated across drills; empty session.
- **HTML:** escaping of title, team, names, text and alt (`<script>`, `"`, `'`, `&`); newline → `<br>`; no `<script`, `<link`, `@import`, `url(`, `href=`, non-data `src=`; the CSP meta; a non-PNG or malformed data URI becomes "Diagram unavailable"; inline page breaks on every drill pair; empty session text.
- **Word:** the Blob is a zip (`PK`) with the Word MIME type; `word/document.xml` (read with a small `node:zlib` unzip helper) holds the escaped title and drill text, one `w:pageBreakBefore` per pair, and one `<pic:pic>` per readable diagram plus swatches; `word/media/` holds the PNGs.
- **Menu:** both items render; HTML downloads `<slug>.html` whose text is the rendered sheet; the static generator omits the team; Word loads the docx module only on click (mocked module, asserted not called before) and downloads `<slug>.docx`; a rejected import shows the load-failure notice; items disable while busy.
- **Swatch refactor:** `LegendSwatch` still paints through `paintLegendSwatch` (existing `PlayLegend`/`LegendList` tests stay green).
- **Build checker:** entry chunk with `word/document.xml` fails; lazy chunk passes; missing marker fails; the `if` guard cases.
- **Gates:** `bun run type-check`, `lint`, `test`, `build`, `planner:build && planner:check`, `adr:lint`, `check:raw-sql`. Manual: open the HTML file offline in Chrome and Safari and print it (two drills per page); upload it to Google Drive and open with Google Docs; open the `.docx` in Word (or LibreOffice) and Google Docs; on hosted, confirm in DevTools that no docx chunk loads before the click.

## Out of scope

- PDF files (print to PDF already exists), Drive/OneDrive saving (sub-project 5).
- Exporting more than one session at a time; editable round-trips from `.docx` back into a plan.
- Self-hosting or embedding fonts in the files (the files name fonts and fall back).
