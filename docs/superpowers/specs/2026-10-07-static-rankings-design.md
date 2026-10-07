# Pre-Season Placement Rankings (Static) — Design

**Date:** 2026-10-07
**Status:** Approved (design); implementation plan to follow in `../plans/2026-10-07-static-rankings.md`
**Applies to:** the static, local-first app in `apps/planner/` (deployed to openleague.dev/planner/). Nothing on the hosted platform changes.
**Depends on:** ADR-0020 (portable versioned documents and the static app), the static app's store pattern (`apps/planner/src/store/`), the portability guard (`adr-0020/portable-practice-planner` lint block and `__tests__/lib/planner-store/portability.test.ts`).

## Context

Many youth hockey leagues place teams into divisions after a short pre-season. The Cleveland Suburban Hockey League (CSHL) does it this way:

- **Starting brackets.** A published "snake chart" gives each team a number by starting bracket. For 8U these are Red strong/mid/weak and White strong/mid/weak. The number's leading digit is the age group (`1xx` = 8U). In 2026, number ranges follow bracket order. In 2025 they did not. So the tool takes starting brackets from the snake chart, never from number ranges.
- **Results.** Every pre-season game and final score is published on the division schedule page as `date · time · home team · score · away team · rink`, e.g. `9/26 · 3:40pm · 903 Hilltop M1 · 4 - 9 · 901 Riverside M1 · Rink A`. Teams play anywhere from about 6 to 15 games.
- **Ratings and placement.** The league publishes an "RPI" in versions (V1, V2, V3-final). Final levels are cut by division sizes it picks each year; in 2025 that was R1–R3 and W1–W4. Programs can then petition to move up or down.
- **The formula.** The league states that "RPI score is average of Lodin & Walkush scaled scores". It does not publish how those two are computed.

What exists (verified):
- **The RPI method, partly reconstructed.** A local, unpublished cross-check against the league's public 2025 results established the following:
  - **Lodin raw = AGD + SCHED.** AGD is the average goal margin per game, with each game's margin capped at **8**. SCHED is the average rating of the team's opponents. Together this is a simple rating system (SRS) solved iteratively.
  - **Walkush raw** comes from a ratio-based rating in the KRACH family. A close approximation is a multiplicative rating on `(GF+1)/(GA+1)` per game, reported as the log of the rating. Its rank order agrees with the published Walkush (Spearman 0.993), but it is not exact.
  - **RPI** is `(Lodin scaled + Walkush scaled) / 2`. Each part is min–max scaled to 0–20 within the age group.
  - **How close a rebuild gets.** Rebuilding the full 2025 8U table with these formulas puts 44 of 46 teams in the published level. The only miss is one swap at a boundary between two teams the league itself had tied.
- **Hosted placements deliberately withhold 8U results.** The hosted placements feature hides W/L/T below the score-recording threshold (FR-026, `lib/actions/placements.ts`), and 8U is below it.
- **Planner screens.** The static app has hash routes (`apps/planner/src/routes.ts`), an IndexedDB store with an in-memory fallback, and file import/export. It has no rankings screens.

## Goal

A coach can paste the league's public schedule page into the static app and see a CSHL-compatible ranking of the pool. It shows where their team stands and why, and what the remaining games could change. The calculation, settings and file format are built to also serve a later league-facing view (phase 2) that could replace a league's spreadsheet.

### Success criteria

1. **Import.** Pasting the schedule page text, or opening a saved copy of the page, yields every completed and scheduled game. Each line the parser doesn't understand is listed verbatim, never dropped silently. Pasting the snake chart sets each team's starting bracket.
2. **Ratings.** The tool shows AGD, SCHED, Lodin, Walkush (approx.), the scaled values, CSHL-compatible RPI, rank and suggested level for every team. Levels are cut by division sizes the user sets.
3. **Explanation.** Any team's detail page shows its game log and the arithmetic behind its numbers ("AGD +2.0 + SCHED −4.2 = Lodin −2.2").
4. **What-if.** A user can enter a score for an unplayed or hypothetical game and immediately see the new RPI, rank and level for every team. A margin sweep shows the selected team's level and rank at every final margin from −cap to +cap. What-if results never change the imported games unless the user records them as final.
5. **Honest labelling.** The Walkush value is labelled "approx." everywhere it appears. The composite is called "CSHL-compatible RPI" and never presented as the league's official number. Every method setting is visible.
6. **Portability.** The data exports and imports as an `openleague.rankings` v1 JSON file, and survives a reload through IndexedDB. If IndexedDB is unavailable it falls back to in-memory storage, and the app says so.
7. **Mobile first.** Every screen works at phone width with 44px tap targets. The chart has an equivalent table view.

## Rulings

### R1. Static only; nothing on the hosted platform

Ratings and results for 8U teams stay in the static app, which computes from public data on the user's device. The hosted platform's FR-026 withholding stays as it is. Bringing placement ratings to the hosted platform would need its own ADR.

### R2. Paste-in, never fetch or scrape

The app parses text or HTML that the user supplies. It makes no request to league or third-party sites: browsers would block such requests (CORS), page structures change, and automated collection may conflict with site terms. The parser checks against the page structure, but nothing depends on a live site.

### R3. The team number is the key

Snake chart, schedule and standings all carry the 3-digit team number, but display names differ between pages (e.g. "Riverside Red 1"). Teams are matched on number, and the first name seen is shown unless the user edits it.

### R4. Method settings are data, CSHL is a preset

Nothing is hard-coded to CSHL. One `RatingMethod` object carries every setting, and the **CSHL 8U** preset fills it in:
- goal cap 8;
- Walkush variant `plus-one`;
- low-confidence threshold 3 games;
- default levels R1–R3 and W1–W4, sizes editable.

The plain SRS (the Lodin part) is accurate enough to use on its own. The Walkush part stays labelled as an approximation until the league's exact rule is available.

### R5. Excluded teams still count as opponents

A team marked `excluded` (for example "will not be playing in league play") stays in the game graph, so its opponents' SCHED stays correct. It is left out of scaling, ranks and levels.

### R6. No league data in the repository

Tests use synthetic leagues and a made-up page fixture shaped like the real one. The 2025 cross-check stays a local, uncommitted script.

## Architecture

Four units, each with one job:

1. **`lib/ratings/` (the calculation).** Pure TypeScript with no React, DOM or `next/*`, so the portability guard covers it.
   - `srs(games, method)` returns `{ agd, sched, rating }` per team. It iterates until changes are below `1e-9` (max 10 000 iterations), with ratings centered on 0.
   - `walkushApprox(games, method)` returns a raw value per team, computed in log space.
   - `scale0to20(values, teams)` uses min–max scaling over the teams that aren't excluded. If every value is equal, everyone gets 10.
   - `composite(games, teams, method)` returns the full per-team row: W/L/T, GF, GA, AGD, SCHED, Lodin, Walkush, scaled values, RPI, rank, level, `lowConfidence` and `component`.
   - `components(games)` finds groups of teams connected by games. If there is more than one group, the screens show a warning that ratings aren't comparable across groups.
   - `whatIf(games, hypotheticals, teams, method)` applies hypothetical results, then calls `composite`.
   - `marginSweep(games, gameRef, teamNumber, teams, method)` returns rank and level for each margin from −cap to +cap.
2. **`lib/ratings/import/` (the parsers).**
   - `parseSchedule(textOrHtml)` returns `{ games, teams, unparsed: string[] }`. HTML is reduced to text nodes first, then both inputs go through one line-token parser.
   - A row with a score is `final`. A row without one is `scheduled`.
   - Repeat meetings between the same two teams are separate games.
   - `parseSnakeChart(textOrHtml)` returns `{ teams: { number, name, startingBracket }[], brackets: string[], unparsed }`.
     - A "Program" header row names each column's colour and a "Strength" header row its strength (str/mid/weak). Together they name the column's bracket, such as "Red Strong". Header rows reset the columns, so a page with several tables works.
     - `brackets` lists the starting brackets in the chart's column order, left to right. A bracket keeps its first position when it appears in more than one table, and only brackets that hold at least one team are listed.
     - `unparsed` lists team numbers found in a column with no bracket.
3. **`lib/rankings-document/` (the portable format).** It follows ADR-0020's conventions:
   - a `format` and `version` discriminant, and a strict parser returning a typed result;
   - files from a newer version are rejected with a clear message;
   - unknown fields are dropped, not fatal.
4. **`apps/planner/src/screens/rankings/` (the screens).** They are routed under `#/rankings`, use a rankings repository in the static store (IndexedDB plus the in-memory fallback), and are reached from a top-level "Practice planner | Rankings" switch in the app shell.

Data flow: paste → parser → review and edit the games → `composite` with the selected method → screens. Every change is saved locally. Export writes the document.

## Bracket order

Movement needs to know which starting brackets are stronger. That order comes from the snake chart's columns, never from team numbers: in some seasons the number ranges follow bracket order, and in others they don't.

- The document stores it as `bracketOrder`, strongest first. Reading a snake chart replaces it with the chart's `brackets` (when the chart has any).
- A bracket that a team uses but `bracketOrder` doesn't list follows the listed ones, in the order it first appears in the team list. Older v1 files have no `bracketOrder`, so all their brackets are ordered this way.
- Setup shows the full order and lets the user move a bracket up or down, rename it (every team in it follows), add one, and remove one that no team uses. Saving writes the whole order to `bracketOrder`.
- Movement: the ranked teams are laid out by starting bracket in this order and cut by the level sizes. Each bracket's seeded positions cover a span of levels, and every position past the last level counts as one extra level after it. A team whose suggested level is above its bracket's span moves up, below it moves down, and inside it stays the same.

## Calculation

| Output | Definition |
|---|---|
| AGD | Mean over a team's final games of `clamp(GF − GA, −cap, +cap)` |
| SCHED | Mean of the opponents' converged `rating`, one entry per game, so repeat opponents count each time |
| Lodin | `AGD + SCHED`. This is the converged SRS rating. |
| Walkush (approx.) | Per game `ratio = (GF + 1) / (GA + 1)`. The ratings solve `rating_t / rating_o ≈ ratio` on average, iterated multiplicatively with the geometric mean held at 1. Reported as `ln(rating)`. |
| Scaled | `20 × (x − min) / (max − min)` over the teams that aren't excluded |
| CSHL-compatible RPI | `(Lodin scaled + Walkush scaled) / 2` |
| Rank | Sorted by RPI descending. Ties are broken by Lodin, then by team number. |
| Level | Rank order cut by `method.levels` sizes. Teams past the total size get no level. |
| Low confidence | Fewer than `method.lowConfidenceGames` final games |
| Movement | The suggested level against the span of levels the team's starting bracket was seeded into (see Bracket order) |

Edge cases:
- 0–0 and other ties give a margin of 0 and a ratio of 1.
- A team with no final games has no rating. It is listed as "no games yet" and is not ranked.
- A disconnected graph gets a warning, and ratings are still computed within each group.

## Import and editing

- **Import screen (`#/rankings/import`).** There are two inputs: the schedule (paste, or open a saved HTML file) and the snake chart (paste).
  - A preview reports the counts ("171 completed games, 4 scheduled, 52 teams") and lists the lines that weren't understood.
  - The user picks a preset and confirms.
  - After a snake chart is read, the preview says how many of the teams in the schedule just read got a starting bracket from the chart (or, when only a chart is read, how many of the saved teams did), how many chart teams matched no team, and which non-excluded teams still have no bracket.
- **Re-import merges.** Games are matched on date + the unordered pair of teams + the order within that day.
  - A new score fills in a scheduled game.
  - A conflicting score is shown for the user to choose, never overwritten silently.
- **Games editor.** The user can add, edit or delete a game, mark a team excluded, and edit names, starting brackets, the bracket order and level sizes.
  - Setup and Rankings warn when the levels hold fewer teams than are ranked (not excluded, with at least one final game). Both screens count the same way, so they show the same number.

## Screens and charts

- **Rankings (`#/rankings`).**
  - **"My team" tiles.** The user picks their team once, and three tiles show CSHL-compatible RPI, rank of N, and suggested level. Movement against the starting bracket is shown as ▲/▬/▼ with a word, never colour alone.
  - **The ladder.** One row per team, sorted by RPI, with a dot on a 0–20 scale. Level bands are light background shading with labelled cut lines, and a small marker shows each team's starting bracket.
  - **On phones** the ladder collapses to a compact list: rank · team · RPI · level · ▲▬▼.
  - **Table toggle.** All the league's columns, sortable. This is also the accessible view.
  - **Filters (one row).** Team search, starting bracket, and "my team's opponents".
- **Team detail (`#/rankings/team/:number`).**
  - The game log: opponent and their rating · score · capped margin, marked "capped at 8" where a game was capped.
  - Inline margin bars around 0.
  - The plain arithmetic behind the team's numbers, and a low-confidence note when it applies.
- **What-if (`#/rankings/what-if`).**
  - Unplayed games involving the chosen team, plus "add hypothetical game", each with score entry.
  - A **margin sweep strip** with one cell per margin, showing level and rank.
  - A **who-moves** list of rank changes, before → after.
  - "Record as final" writes a result into the games.
- **Colour.**
  - Level bands use one League Blue sequential ramp, lighter for lower levels, and each band is labelled with its name.
  - Red and white fills are not used for Red and White levels: red is the error colour and white disappears on the background.
  - The user's team gets the single Action Blue highlight.
  - Light and dark palettes are each validated with the dataviz palette validator during implementation.
- **Interaction.** Dots and cells have hover/tap tooltips showing RPI, Lodin, Walkush and record. Targets are at least 44px.

## Document: `openleague.rankings` v1

```jsonc
{
  "format": "openleague.rankings",
  "version": 1,
  "meta": { "title": "08 Mite Preseason 2026", "ageGroup": "8U", "seasonLabel": "2026", "source": "optional URL text" },
  "method": {
    "preset": "cshl-8u",
    "goalCap": 8,
    "walkush": { "variant": "plus-one" },
    "lowConfidenceGames": 3,
    "levels": [{ "name": "R1", "size": 6 }]
  },
  "teams": [{ "number": "901", "name": "Riverside M1", "startingBracket": "White Strong", "excluded": false }],
  "games": [{ "date": "2026-09-26", "time": "15:40", "home": "903", "away": "901", "homeGoals": 4, "awayGoals": 9, "status": "final", "rink": "Rink A" }],
  "myTeam": "901",
  "bracketOrder": ["Red Strong", "White Strong"],
  "snapshots": []
}
```

- `snapshots` is reserved for phase 2 (published V1/V2/V3). v1 parsers accept it and keep it as-is.
- Hypothetical what-if games are never written to the document.
- Validation:
  - Goals are integers between 0 and 99.
  - `home` ≠ `away`.
  - Both teams of a game exist in `teams`.
  - Level sizes are positive integers.

## Testing

- **Calculation (unit).**
  - Small synthetic leagues with hand-computed AGD, SCHED and Lodin.
  - Cap clamping at ±cap.
  - Ties and 0–0.
  - Repeat opponents.
  - Excluded teams kept as opponents.
  - Detection of disconnected groups.
  - Equal-value scaling.
  - Rank tie-breaks.
  - Level cuts, including fewer teams than the total level size.
- **Properties.**
  - Swapping home and away leaves results unchanged.
  - Relabelling team numbers permutes the results and nothing else.
  - Game order in the input does not change any output.
  - A team's own Lodin never decreases when one of its final margins increases.
- **What-if.** Hypothetical results don't change the stored games, and the sweep is monotone in margin for the chosen team's own Lodin.
- **Parsers.**
  - A made-up fixture in the schedule page's shape, as both text and HTML.
  - Unplayed rows.
  - Junk lines reported in `unparsed`.
  - A snake-chart fixture.
- **Document.**
  - Round-trip.
  - A newer version is rejected.
  - Malformed games are rejected with field paths.
- **Portability.** `lib/ratings/**` and `lib/rankings-document/**` are added to the portability test and the lint block.
- **Screens.**
  - Testing Library: import preview, table toggle, sweep strip, record-as-final.
  - Before merge, the app is checked in a real browser at phone and desktop widths.

## Out of scope (this phase)

- Phase 2, the league view, gets its own spec:
  - published V1/V2/V3 snapshots;
  - a self-contained HTML results page with the method write-up;
  - "rank last week";
  - petition notes.
- Google Drive and OneDrive saving, and a shared storage connector across document types. These come after a second document type exists, which this provides.
- Any hosted-platform feature (R1).
- Fetching from league sites (R2).
- Other tools discussed for the static app: goalie rotation, schedule management, goalie mentorship. Each will get its own spec.

## Related, separate change

Links to the static tools from openleague.dev (docs nav and home page), plus a "free practice planner, no account" link on the hosted marketing pages. This is a small, independent change and does not wait on this design.

## ADR

A new record, which extends ADR-0020, will cover:
- placement ratings are computed client-side from public results;
- ratings for ages below the score threshold stay off the hosted platform (R1);
- no fetching or scraping (R2).

It is written with the implementation plan. Its `affects` covers `lib/ratings/**`, `lib/rankings-document/**` and `apps/planner/src/screens/rankings/**`.
