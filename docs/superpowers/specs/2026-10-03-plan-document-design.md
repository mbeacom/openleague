# Plan Document Format & Hosted Hand-off — Design

**Date:** 2026-10-03
**Status:** Accepted
**Sub-project:** 1 of the static planner. Order and decisions are in `2026-10-03-static-planner-roadmap.md`.
**ADR:** ADR-0020

## Goal

Define one portable, versioned practice-plan document. Add two things to the hosted platform:
- an **Export plan** action, which downloads the file and, behind a flag, copies an "Open in planner" link;
- an **Import plan** flow, which takes a file or a fragment link, shows a preview, lets you pick a team, and creates the session.

The static planner (sub-project 3) uses the same module.

## Context

- **Drill data.** `PlayData` v2 is validated by `playDataSchema`, and `upgradePlayData` lifts v1 data (`lib/utils/play-data.ts`). `sanitizePlayDataForWrite` cleans data before persistence.
- **Sessions.** A session holds ordered drills: `sequence`, `duration`, `instructions`, and `runsWithPrevious` for stations. Since 3a, each session row points at a session-owned `Play` copy (`Play.sessionId` set).
- **Session creation needs existing drills.** `createPracticeSession` accepts only drills already in the team's library (by `playId`), which `materializeSessionDrills` then clones. An import has no existing drills, so it needs its own action.
- **Authorization.** Creating a session is gated by `requirePracticeScheduler(teamId)`.
- **Timeline helpers.** `lib/utils/session-timeline.ts` provides `groupStations`, `sessionWallMinutes`, `stationGroupError`, and `MAX_STATIONS_PER_GROUP = 4`.
- **No existing exchange format.** There is no import/export or interchange code today.

## Document format (`lib/plan-document/`, pure, no server or Next imports)

```jsonc
{
  "format": "openleague.practice-plan",
  "version": 1,
  "exportedAt": "2026-10-03T18:00:00.000Z",
  "generator": "openleague-hosted",          // or "openleague-static"
  "session": {
    "title": "Tuesday Skills Practice",       // 1–100 chars
    "durationMinutes": 60,                    // 1–300
    "date": "2026-10-06",                     // YYYY-MM-DD local calendar date, or null
    "startTime": "19:00",                     // HH:mm local wall clock, or null
    "drills": [                               // 0–50
      {
        "sequence": 0,                        // 0..n-1, contiguous
        "durationMinutes": 10,                // 1–300
        "runsWithPrevious": false,            // first drill must be false; ≤4 per group
        "instructions": "…",                  // ≤ 2000 chars, may be empty
        "drill": {
          "name": "Warmup Laps",              // 1–100 chars
          "description": "…",                 // ≤ 500 chars, may be empty
          "playData": { "version": 2 }        // full PlayData; v1 accepted and upgraded on parse
        }
      }
    ]
  }
}
```

**Rules**
- **Self-contained.** The document carries no database IDs, team, user, venue, segment, reservation, or thumbnail. Import ignores any extra keys: parsing strips unknown fields.
- **Times are local, not instants.** `date` and `startTime` are local values because the static app has no venue time zone.
  - On hosted export they come from `sessionStart(session)`, formatted in the session's time zone: the venue zone when booked, otherwise the viewer's.
  - On import, the coach confirms or edits them. The server combines them in the coach's browser zone to produce `date`. A venue booking is added later in the editor, which uses the venue zone.
- **Version rules.**
  - A `version` higher than supported is rejected with: "This plan was made by a newer version of OpenLeague. Update to open it."
  - A wrong or missing `format` is rejected with: "This file isn't an OpenLeague practice plan."
- **Diagrams.** Every drill's `playData` must parse, after a v1 upgrade. If one doesn't, the document is rejected and the drill is named in the error. The format is new, so there is no legacy data to tolerate.
- **Wall time** (`sessionWallMinutes`) must be ≤ `durationMinutes`. Station-group rules match the server.

**Module API** (`lib/plan-document/index.ts`)
- `PLAN_FORMAT = "openleague.practice-plan"`, `PLAN_VERSION = 1`, `MAX_PLAN_DRILLS = 50`, `MAX_PLAN_FILE_BYTES = 2_000_000`, `MAX_PLAN_LINK_BYTES = 65_536`
- `planDocumentSchema`, the Zod v4 schema, which reuses `playDataSchema` and `upgradePlayData`
- `type PlanDocument`, inferred from the schema after upgrade
- `serializePlan(input: PlanSessionInput, generator): PlanDocument`
  - `PlanSessionInput` is the minimal session view: title, duration, local date and time, and drills with `{sequence, duration, runsWithPrevious, instructions, name, description, playData}`.
  - It drops thumbnails and IDs and normalizes sequences.
- `parsePlan(raw: unknown): { ok: true; plan: PlanDocument } | { ok: false; error: PlanError }`
  - `PlanError` is `{ code: "not-a-plan" | "newer-version" | "invalid"; message: string; issues?: string[] }`.
- `planFileName(title): string` returns `<slug>.olplan.json`. The slug is lowercase, ASCII, hyphen-joined, and capped at 60 chars, with `practice-plan` as the fallback.
- `encodePlanLink(plan): Promise<string>`
  - It applies `CompressionStream("deflate-raw")` and then base64url-encodes the result.
  - It throws `PlanLinkTooLargeError` when the raw JSON exceeds `MAX_PLAN_LINK_BYTES`.
- `decodePlanLink(fragmentValue): Promise<unknown>`, the inverse. It rejects inflated data larger than `MAX_PLAN_LINK_BYTES`.
- `planToEditorSession(plan)` is a pure mapping used by the import preview.

## Hosted export

- **Where.** An "Export plan" menu on the session detail page, next to "Print bench sheet". It is visible to everyone who can see the page.
  - **Download plan file.** Builds `serializePlan(...)` from the page's own `session` data, so there is no new server read. It downloads via a Blob as `planFileName(title)` with type `application/json`.
  - **Copy "Open in planner" link.** Shown only when `NEXT_PUBLIC_STATIC_PLANNER_URL` is set; sub-project 3 sets it. It copies `${url}#plan=${await encodePlanLink(doc)}`. When the plan is too large, a message says "This plan is too large for a link. Download the file instead."
- **Unreadable diagrams.** A drill whose `playData` is null exports as an empty board (`createEmptyPlayData()`), and a notice says "N drills had unreadable diagrams and were exported blank."

## Hosted import

**Entry points**
- **File.** An "Import plan" button on the practice-planner list page (`PracticePlannerList`), visible to users who can schedule a practice for at least one team. It goes to `/practice-planner/import`, which opens a file picker.
- **Link.** `/practice-planner/import#plan=<encoded>`, which the static app's "Open in OpenLeague" button produces.

**Route** `app/(dashboard)/practice-planner/import/page.tsx`
- The server component loads the teams where the user passes the scheduler check. Its team query mirrors what `requirePracticeScheduler` allows.
- It renders a client `PlanImportView` with those teams.
- The `(dashboard)` layout already requires auth.

**Getting the plan into the page**
- **Fragment.** On mount, `PlanImportView` reads `location.hash`.
  - If it holds `plan=`, the view decodes and parses it, then clears the hash with `history.replaceState`, so the plan doesn't linger in the URL or history.
  - Fragments never reach the server or logs.
- **Surviving login.** The dashboard layout redirects signed-out users to login. That redirect drops the fragment. To keep it, a tiny client script on the **login page** checks for `#plan=` in the URL. If it finds one, it stores the value in `sessionStorage` under `openleague.pendingPlan` and sets the `callbackUrl` to `/practice-planner/import`.
  - It is shared with the import page as a `lib/plan-document/pending.ts` helper.
  - The import view consumes and deletes that key on mount.
  - The direct path also works, because the static app links straight to `/practice-planner/import#plan=…`. Next's auth redirect sends the user to `/login?callbackUrl=...`, and browsers carry the fragment across same-origin redirects.
  - **Implementation note:** check whether the fragment survives the redirect. If it does, the `sessionStorage` handoff covers only the login form's own navigation.

**Preview UI**
- Title, duration, and "Planned X of Y min".
- A station-grouped drill list built with `groupStations`.
- Diagram thumbnails produced by `generateThumbnail` after mount.
- Problems as a list.

**Form**
- **Team.** A select. If the user can schedule only one team, it is auto-selected.
- **Date and start time.** Prefilled from the plan, or blank when absent. Both are required to import.
- **"Also add these drills to the team library."** A checkbox, off by default.
- **Import button.** Runs the action, then redirects to `/practice-planner/<id>/edit`.

**Errors**
- Each `PlanError` code shows its own message with a "Choose another file" button.
- A file larger than `MAX_PLAN_FILE_BYTES` is refused before parsing.

**Server action** `importPracticePlan` (`lib/actions/practice-plan-import.ts`, `"use server"`)
- **Input:** `{ teamId: cuid; document: unknown; date: ISO datetime (combined client-side); addToLibrary: boolean }`.
- **Steps**
  1. `requireUserId()`.
  2. Validate `teamId`, `date`, and `addToLibrary` with Zod.
  3. Run `parsePlan(document)` again on the server, because the client is never trusted. Return `{ success:false, error, details: issues }` on failure.
  4. Run `requirePracticeScheduler(teamId)`.
  5. In one `prisma.$transaction`:
     - Create the `PracticeSession`: title, date, `duration = durationMinutes`, `teamId`, `createdById`, `isShared:false`, no venue.
     - For each drill, create a session-owned `Play` with `teamId`, `createdById`, `sessionId = session.id`, name, description, `playData = sanitizePlayDataForWrite(...)`, and `thumbnail: null`.
     - Create the `PracticeSessionPlay` rows: `sessionId`, `playId`, `sequence`, `duration`, `instructions`, `runsWithPrevious`.
     - If `addToLibrary` is set, create separate library `Play` copies (`sessionId: null`) with the same fields.
  6. `revalidatePath("/practice-planner")`.
  7. Return `{ success:true, data:{ sessionId } }`.
- **Rules**
  - Field validation matches the server, and wall time must be ≤ duration.
  - Prisma only (ADR-0003). No raw SQL.
  - Any `Play` fields 3a requires, such as `sourcePlayId`, must be checked against the schema. Where a field means "copied from", leave it null for imported drills.
- **Errors.** It follows the existing `ActionResult` pattern and returns friendly messages. An authorization failure returns "You can't schedule practices for this team."

## Security & privacy

- **No new public surface.** There is no API route and no unauthenticated endpoint. The import action is a normal authenticated server action (ADR-0002), and ADR-0011's capability-link rules are untouched because the link carries data, not a credential.
- **Client input is never trusted.** The document is parsed again on the server, and diagrams are sanitized on write.
- **Fragment hygiene.** Plans in fragments never reach server logs. The import page clears the hash right after reading it. Analytics and Sentry never record the fragment (Sentry URL scrubbing: confirm `location.hash` is not captured, or strip `#plan=`).

## Testing

- **`lib/plan-document`**
  - Round trip: `parsePlan(serializePlan(x))` equals the normalized `x`.
  - A v1 diagram is upgraded.
  - Each limit is enforced: title, durations, instructions, 50 drills, station cap, first-drill flag, wall time.
  - Errors: not-a-plan, newer-version, and a bad diagram that names the drill.
  - Unknown keys are stripped, and no IDs or thumbnails appear in the output.
  - `planFileName` slugging.
  - Link encode and decode round trip, including the size cap on encode and on decode (zip-bomb guard).
  - The cases cover jsdom's `CompressionStream` or a polyfill check: use Node's built-in global in Vitest.
- **`importPracticePlan`** (Prisma mocked, existing patterns)
  - Unauthenticated callers are rejected.
  - Non-scheduler callers are rejected.
  - An invalid document is rejected with details.
  - The transaction creates the session, the owned plays carrying `sessionId`, and the rows with flags and sequence.
  - `addToLibrary` creates the extra library copies.
  - Wall time over the duration is rejected.
- **UI**
  - The export menu downloads a file. Mock `URL.createObjectURL`.
  - The link item is hidden when `NEXT_PUBLIC_STATIC_PLANNER_URL` is unset.
  - The import view: the fragment is parsed and the hash cleared, the `sessionStorage` pending plan is consumed, the preview renders station groups, the team select auto-picks when only one team qualifies, each error state renders, and the import calls the action and redirects.
- **Gates.** `bun run type-check`, `lint`, `test`, and `build` (a new route).

## Out of scope (later sub-projects)

- The `PlannerStore` seam (2), the static app (3), HTML and DOCX export (4), and Drive and OneDrive (5).
- Bulk or multi-session plan files: the format reserves the top-level shape, and a future `plans: []` would be version 2.
