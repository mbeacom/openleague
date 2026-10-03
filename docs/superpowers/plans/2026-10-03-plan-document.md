# Plan Document Format & Hosted Hand-off Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define one portable, versioned practice-plan document (`lib/plan-document/`). On the hosted platform, add an **Export plan** menu (file download, plus an optional "Open in planner" link) and an **Import plan** flow (file or `#plan=` fragment → preview → team → new session).

**Architecture:**
- `lib/plan-document/` is pure, with no server, Next or DOM-at-import-time code:
  - `document.ts` holds the Zod v4 schema, `parsePlan`, `serializePlan`, `planFileName` and `planToEditorSession`.
  - `link.ts` holds the `deflate-raw` and base64url link codec. It has a streaming size cap.
  - `pending.ts` holds the `sessionStorage` hand-off that carries a fragment across login.
  - `index.ts` re-exports `document` and `link`.
- A new server action, `importPracticePlan` (`lib/actions/practice-plan-import.ts`), re-parses the document. It then creates the session, the session-owned `Play` copies and the `PracticeSessionPlay` rows, plus optional library copies, all in one `prisma.$transaction`.
- **UI:**
  - `ExportPlanMenu` is mounted in `SessionDetailView`.
  - A new `/practice-planner/import` route renders `PlanImportView` and `PlanPreview`.
  - The login page stashes a `#plan=` fragment.
  - The list page gets an "Import plan" button.
  - The Sentry scrubber redacts `#plan=`.

**Tech Stack:** TypeScript 5.9 (strict), Next.js 16.3 App Router, React 19, MUI v7, Prisma 7, Zod 4.6, Vitest 4 + Testing Library (jsdom 29), Bun.

**Spec:** `docs/superpowers/specs/2026-10-03-plan-document-design.md`. Context: `docs/superpowers/specs/2026-10-03-static-planner-roadmap.md` (sub-project 1) and `docs/adr/0020-exchange-practice-plans-as-a-portable-versioned-document-and-ship-a-static-local.md`.

## Global Constraints

- **Base.** Branch `feat/plan-document`, commit `342cdf9`. Line numbers are taken at that commit. If a line has shifted, find the edit by its quoted anchor text.
- **Toolchain.** Use `bun` for everything: `bun run test <file>`, `bun run type-check`, `bun run lint`, `bun run build`. Never use npm or yarn, and never use `git stash`. Use `/usr/bin/git`.
- **Scope.** No new dependencies. No schema change and no migration.
- **ADRs.**
  - **0002:** the import is a server action with no API route.
  - **0003:** Prisma only, no raw SQL (`bun run check:raw-sql`).
  - **0004:** MUI.
  - **0005:** Bun.
  - **0011:** the `#plan=` fragment is scrubbed from telemetry the same way capability tokens are.
  - **0020:** this is the format.
- **Module purity.** Nothing in `lib/plan-document/` may import `next/*`, `@/lib/db/*`, `@/lib/auth/*` or any `"use server"` file. It may import `zod`, `@/lib/utils/play-data`, `@/lib/utils/session-timeline` and `@/types/practice-planner`.
  - `pending.ts` touches `window` only inside its functions, never at module load.
- **Constants, verbatim:** `PLAN_FORMAT = "openleague.practice-plan"`, `PLAN_VERSION = 1`, `MAX_PLAN_DRILLS = 50`, `MAX_PLAN_FILE_BYTES = 2_000_000`, `MAX_PLAN_LINK_BYTES = 65_536`, `PENDING_PLAN_KEY = "openleague.pendingPlan"`, file suffix `.olplan.json`, slug cap 60, fallback slug `practice-plan`.
- **Copy, verbatim.** `“ ”` are U+201C/U+201D and `·` is U+00B7.
  - not a plan: `This file isn't an OpenLeague practice plan.`
  - newer version: `This plan was made by a newer version of OpenLeague. Update to open it.`
  - link too large (export): `This plan is too large for a link. Download the file instead.`
  - unreadable diagrams: `N drills had unreadable diagrams and were exported blank.` When N is 1: `1 drill had an unreadable diagram and was exported blank.`
  - not a scheduler: `You can't schedule practices for this team.`
  - detail page: button `Export plan`; menu items `Download plan file` and `Copy “Open in planner” link`
  - list page: button `Import plan`
  - import page:
    - heading `Import practice plan`
    - buttons `Choose plan file`, `Choose another file` and `Import plan`
    - checkbox `Also add these drills to the team library`
    - fields `Team`, `Date` and `Start time`
  - preview: `Planned X of Y min` (the existing `plannedLabel`) and `Stations · N · M min` (the existing `stationBlockLabel`)
  - breadcrumb: `Import Plan`
- **`app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx` must stay at or under 900 lines.** It is 844 at `342cdf9` and is enforced by `__tests__/app/SessionDetailView.line-budget.test.ts`. This plan adds two lines.
- **Never use `component={Link}` from a Server Component.** The only new server file, `import/page.tsx`, renders `PageContainer` and the client `PlanImportView`. No links are needed.
- **Server-action files export only async functions** (and types). Message constants used by tests live in `lib/plan-document/` or in client component files, never in `practice-plan-import.ts`.
- **Tests never read the real clock for expectations.** Pass `now` explicitly, or compare against the same helper called with the same zone.
  - Zone-dependent expectations use `parseDateTimeLocalToUtc(..., resolveTimeZone())` or `formatDateTimeLocalInput(..., resolveTimeZone(null))`, never a literal.
- **IDs that pass through Zod `.cuid()` in tests look like cuids:** `c` followed by 24 lowercase alphanumerics, for example `cteamxxxxxxxxxxxxxxxxxxxx`.
- **Commits** are conventional commits and end with a blank line, then `Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX`.
- **Per task:** at the end of every task, `bun run type-check` and that task's own Vitest files must be green.

## Rulings (spec gaps and contradictions, decided during planning)

1. **The scheduler check is `requireTeamAdmin(teamId)`.**
   - `requirePracticeScheduler` is module-private in `lib/actions/practice-sessions.ts:89`. Exporting it from a `"use server"` file would make it a callable action.
   - With no `reservationId` it is exactly `requireTeamAdmin(teamId)`, and an import never carries a reservation.
   - The import page's team query mirrors it: `teamMember.findMany({ where: { userId, role: "ADMIN" } })`, with no `isActive` filter, because `requireTeamAdmin` has none.
2. **Login and the fragment, resolved concretely.**
   - `requireAuth()` (`lib/auth/session.ts:46`) calls `redirect("/login")` with **no `callbackUrl`**, so the spec's `/login?callbackUrl=...` does not happen. After login the form pushes `callbackUrl ?? "/"`, which is `/`.
   - The `(dashboard)` layout awaits `requireAuth()` before any Suspense boundary. `app/(dashboard)/loading.tsx` wraps the layout's *children*, not the layout itself. There is no `app/loading.tsx` and no `template.tsx`. It was also verified at planning time that `app/layout.tsx` renders `{children}` inside providers with no `<Suspense>`, and that no provider in `components/providers/` uses one. So nothing has streamed, and Next answers a full navigation with an HTTP **307** `Location: /login` (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md:12`).
   - By RFC 7231 §7.1.2, a `Location` without a fragment inherits the original request's fragment. The browser therefore lands on `/login#plan=…`.
   - The login page then:
     - moves the value into `sessionStorage` (`stashPlanFragment`) and clears the hash;
     - after a successful sign-in, pushes `PLAN_IMPORT_PATH` instead of `callbackUrl` whenever a fresh pending plan exists (`hasPendingPlan`).
   - If a future change streamed that redirect (as a `<meta refresh>`), the fragment would be lost, so Task 8's PR checklist re-verifies the 307.
   - A stale stash must not hijack a later login, so pending plans expire after `PENDING_PLAN_TTL_MS = 30 min`.
3. **The drill description cap is 1000, not 500.** Hosted `createPlaySchema` allows 1000. With a 500 cap, a hosted export of a 600-character description could not be re-imported, which would break the round trip. Truncating silently would lose data.
4. **Date combining.** The spec says the server combines the date and time, but the action input is an ISO instant "combined client-side", so the two contradict. The rule:
   - The **client** combines them with `parseDateTimeLocalToUtc(\`${date}T${startTime}\`, resolveTimeZone())`, which uses the browser zone.
   - The server validates the result with `z.iso.datetime({ offset: true })`.
5. **Export date and time.**
   - Export uses `formatDateTimeLocalInput(sessionStart(session), resolveTimeZone(session.venueTimezone))`, split on `"T"`.
   - `resolveTimeZone` returns the venue zone when it is valid, or else the browser's zone. This is the same rule as `sessionTimeZone`.
6. **Lenient optional fields on parse.**
   - A missing or `null` `date` or `startTime` becomes `null`.
   - A missing or `null` `instructions`, `description` or `runsWithPrevious` becomes `""`, `""` and `false`.
   - `generator` is informational: any string from 1 to 100 characters, so a future generator name never breaks import.
   - Text is cleaned the way `sanitizedString` cleans it: trimmed, with control characters stripped, before the length checks.
7. **Order and naming of `parsePlan` errors.**
   - The checks run in this order: the object and `format` (`not-a-plan`), then `version` > 1 (`newer-version`), then the schema (`invalid`).
   - A non-integer or older `version` is `invalid`.
   - Each Zod issue under `session.drills[i]` is reported as `Drill ${i+1} ("${name}"): ${message}`. The `("…")` part appears only when the raw drill has a string name. A bad diagram therefore reads `Drill 2 ("Breakout"): The diagram can't be read`.
   - Sequences must be a permutation of `0..n-1`. The message is `Drill sequences must run 0, 1, 2… with no gaps or repeats`. Parsed drills come back sorted by sequence.
8. **Link errors.**
   - `decodePlanLink` throws `PlanLinkTooLargeError` in two cases: when the inflated data exceeds `MAX_PLAN_LINK_BYTES` (enforced while streaming, as a zip-bomb guard), and when the fragment string exceeds `MAX_PLAN_LINK_ENCODED_LENGTH`.
   - It throws `PlanLinkError` for anything undecodable.
   - `readPlanLink` maps these to `PlanError` values:
     - too large becomes `invalid`, with the message `This link's plan is larger than OpenLeague accepts.`
     - anything else, including valid JSON that isn't a plan, becomes `not-a-plan`, with the message `This link doesn't hold a readable OpenLeague practice plan.`
9. **Written rows.**
   - A session-owned `Play` gets `isTemplate: false`, `sessionId`, `sourcePlayId: null`, `thumbnail: null`, and an id pre-generated with `newPlayId()`, so the rows can reference it.
   - A library copy gets `isTemplate: true`, `sessionId: null`, `sourcePlayId: null` and `thumbnail: null`. `isTemplate: true` is what marks a play as part of the library (`prisma/schema.prisma`, `Play.isTemplate`).
   - `description` and `instructions` are written as `value || null`.
   - A diagram that parses but fails `sanitizePlayDataForWrite` is rejected with `Drill N ("name") has a diagram that can't be saved.` One example is an annotation whose text is only a control character.
10. **Auth inside the action.**
    - `requireUserId()` is called **before** the `try`. It signals a redirect by throwing, and a `catch` would swallow that.
    - `requireTeamAdmin` is wrapped in its own `try`, which returns the not-a-scheduler message.
    - The order follows the spec: authenticate, validate input, `parsePlan`, authorize.
11. **Telemetry.**
    - Sentry's browser SDK records `location.href` (fragment included) in `request.url` and in navigation breadcrumbs. So `scrubCapabilityTokens` gains `#plan=` and `%23plan%3D` patterns, which redact the value to `[redacted]`.
    - Umami and GA need no change, because `trackManualPageView` (`components/providers/AnalyticsProvider.tsx`) sends a bare `pathname` and both vendors' auto-tracking is off.
12. **Import page with no eligible team.** It renders and shows `Only team admins can import practice plans. Ask an admin of your team to import it.` with Import disabled. It does not redirect, which would silently drop the plan the coach just opened.
13. **The list page's Import button** uses `canImport = (await getPlanImportTeams()).length > 0`. It does not use `isAdmin`, because `getPracticePlannerListData` looks only at the user's primary team, and the spec says "at least one team".
14. **StrictMode.** `PlanImportView` keeps the taken fragment value in a `useRef`. `takeIncomingPlan()` consumes both the hash and the stash, so when React replays the effect in development, a second take would find nothing.
15. **Clearing the hash** uses `history.replaceState(history.state, "", pathname + search)`. It keeps `history.state`, which Next's App Router stores its tree in.
16. **Export notices.**
    - A download with unreadable diagrams shows the unreadable-diagrams warning, and a clean download shows nothing.
    - A copied link shows `Link copied. Paste it to open this plan in the planner.`, or the unreadable warning when one applies.
    - A clipboard failure shows `Couldn't copy the link. Download the file instead.`
17. **The file input** uses `accept=".json,application/json"`. `.olplan.json` is not a valid `accept` token, but `.json` matches it.
    - A file over the size cap shows `This file is too large to be a practice plan (the limit is 2 MB).`
    - A file that isn't JSON is `not-a-plan`.
18. **Breadcrumbs.** `getBreadcrumbs` has no `import` branch, so `/practice-planner/import` would read "… > Session". Task 5 adds `Dashboard > Practice Planner > Import Plan`.
19. **Extra exports beyond the spec**, which later tasks rely on:
    - from `document.ts`: `PlanSessionInput`, `PlanGenerator`, `PlanErrorCode`, `PlanError`, `ParsePlanResult`, `PlanDrill`, `PlanEditorSession`, `PlanEditorDrill`, the three message constants, and `MAX_DRILL_DESCRIPTION_LENGTH`
    - from `link.ts`: `PlanLinkError`, `MAX_PLAN_LINK_ENCODED_LENGTH`, `deflateRaw`, `inflateRaw`, `base64UrlEncode`, `base64UrlDecode`, `readPlanLink` and the three link message constants
    - from `pending.ts`: everything in it
    - `getPlanImportTeams` (`practice-session-queries.ts`)
    - `buildPlanDocument` and `unreadableDiagramNotice` (`ExportPlanMenu.tsx`)
    - `readPlanFile`, `FILE_TOO_LARGE_MESSAGE` and `NO_IMPORT_TEAMS_MESSAGE` (`PlanImportView.tsx`)
20. **The environment variable is read inside the component**, as `process.env.NEXT_PUBLIC_STATIC_PLANNER_URL?.trim()`. Next inlines it at build time, and tests set it with `vi.stubEnv`. It is added, commented out, to `.env.example`.

## Review Focus

1. **React StrictMode replays the import view's mount effect in development.** Expected: the fragment plan still appears. Owned by Task 5 (the `<StrictMode>` test).
2. **A stale pending plan, saved in an earlier abandoned visit, must not redirect a later, unrelated login.** Expected: after the TTL it is ignored, and login goes to `callbackUrl`. Owned by Task 2 (the TTL tests) and Task 6 (a login with no fragment pushes `/`).
3. **A file that isn't JSON, a file over 2 MB, and garbage in the fragment.** Expected: a specific error with "Choose another file", never a crash or a blank page. Owned by Task 5 (the three error tests) and Task 2 (`decodePlanLink` garbage and the zip-bomb).
4. **A plan's contents reaching Sentry through `location.href` or a navigation breadcrumb.** Expected: the value is redacted. Owned by Task 7 (scrubber tests on a Sentry-shaped event).
5. **A diagram that parses but can't be written, and a zero-drill plan.** Expected: the first is rejected with the drill named, and nothing is written. The second creates an empty session with no `Play` writes. Owned by Task 3.

---

### Task 1: Plan document: schema, parse, serialize, file name

**Files:**
- Create: `lib/plan-document/document.ts`
- Create: `lib/plan-document/index.ts` (re-exports; Task 2 adds `link`)
- Test: `__tests__/lib/plan-document/document.test.ts`

**Interfaces:**
- Consumes:
  - `parseStoredPlayData(raw): { ok: true; data: PlayData } | { ok: false; error }` and `createEmptyPlayData(): PlayData` (`lib/utils/play-data.ts`)
  - `stationGroupError(plays: readonly TimelinePlay[]): string | null`, `sessionWallMinutes(plays): number`, `FIRST_DRILL_STATION_ERROR` and `STATION_GROUP_CAP_ERROR` (`lib/utils/session-timeline.ts`), where `TimelinePlay = { sequence; duration; runsWithPrevious }`
- Produces (all exported from `@/lib/plan-document`):
  - constants: `PLAN_FORMAT`, `PLAN_VERSION`, `MAX_PLAN_DRILLS`, `MAX_PLAN_FILE_BYTES`, `MAX_PLAN_LINK_BYTES`, `MAX_DRILL_DESCRIPTION_LENGTH`
  - messages: `NOT_A_PLAN_MESSAGE`, `NEWER_VERSION_MESSAGE`, `INVALID_PLAN_MESSAGE`
  - `planDocumentSchema`
  - types: `type PlanDocument`, `type PlanDrill`, `type PlanGenerator = "openleague-hosted" | "openleague-static"`
  - `interface PlanSessionInput { title: string; durationMinutes: number; date: string | null; startTime: string | null; drills: Array<{ sequence: number; duration: number; runsWithPrevious: boolean; instructions: string | null; name: string; description: string | null; playData: PlayData | null }> }`
  - `serializePlan(input: PlanSessionInput, generator: PlanGenerator, now?: Date): PlanDocument`
  - `type PlanErrorCode`, `interface PlanError { code; message; issues?: string[] }`, and `type ParsePlanResult = { ok: true; plan: PlanDocument } | { ok: false; error: PlanError }`
  - `parsePlan(raw: unknown): ParsePlanResult`
  - `planFileName(title: string): string`
  - `interface PlanEditorDrill { key; sequence; duration; runsWithPrevious; instructions; name; description; playData }`, `interface PlanEditorSession { title; duration; date; startTime; plays: PlanEditorDrill[] }`, and `planToEditorSession(plan): PlanEditorSession`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/plan-document/document.test.ts`:

```ts
/** The portable practice-plan document (ADR-0020): parse, serialize, limits, file name. */
import { describe, expect, it } from "vitest";
import {
    INVALID_PLAN_MESSAGE,
    MAX_DRILL_DESCRIPTION_LENGTH,
    MAX_PLAN_DRILLS,
    NEWER_VERSION_MESSAGE,
    NOT_A_PLAN_MESSAGE,
    PLAN_FORMAT,
    PLAN_VERSION,
    parsePlan,
    planFileName,
    planToEditorSession,
    serializePlan,
    type PlanSessionInput,
} from "@/lib/plan-document";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { FIRST_DRILL_STATION_ERROR, STATION_GROUP_CAP_ERROR, groupStations } from "@/lib/utils/session-timeline";
import type { PlayData } from "@/types/practice-planner";

const NOW = new Date("2026-10-03T18:00:00.000Z");

const BOARD: PlayData = {
    version: 2,
    players: [{ id: "p1", position: { x: 50, y: 40 }, role: "X", label: "F1", color: "#1976D2" }],
    drawings: [],
    equipment: [],
    annotations: [],
};

/** A v1 diagram: no version key, a player off the rink, an old-style arrow. */
const V1_BOARD = {
    players: [{ id: "p1", position: { x: 250, y: 40 }, label: "A", color: "#FF0000" }],
    drawings: [{ id: "d1", type: "arrow", points: [{ x: 10, y: 10 }, { x: 20, y: 20 }], color: "#000000", strokeWidth: 2 }],
    annotations: [],
};

function input(overrides: Partial<PlanSessionInput> = {}): PlanSessionInput {
    return {
        title: "Tuesday Skills Practice",
        durationMinutes: 60,
        date: "2026-10-06",
        startTime: "19:00",
        drills: [
            { sequence: 0, duration: 10, runsWithPrevious: false, instructions: "Two laps", name: "Warmup Laps", description: "", playData: BOARD },
            { sequence: 1, duration: 15, runsWithPrevious: false, instructions: null, name: "Breakout", description: "D to D", playData: BOARD },
            { sequence: 2, duration: 10, runsWithPrevious: true, instructions: "", name: "Regroup", description: null, playData: null },
        ],
        ...overrides,
    };
}

type RawDrill = {
    sequence: unknown;
    durationMinutes: unknown;
    runsWithPrevious: unknown;
    instructions: unknown;
    drill: { name: unknown; description: unknown; playData: unknown; [key: string]: unknown };
    [key: string]: unknown;
};
type RawDoc = {
    format: unknown;
    version: unknown;
    session: { title: unknown; durationMinutes: unknown; date?: unknown; startTime?: unknown; drills: RawDrill[]; [key: string]: unknown };
    [key: string]: unknown;
};

/** A serialized document as plain JSON, so a test can break it the way a hand-edited file would. */
function rawDoc(mutate?: (doc: RawDoc) => void): RawDoc {
    const doc = JSON.parse(JSON.stringify(serializePlan(input(), "openleague-hosted", NOW))) as RawDoc;
    mutate?.(doc);
    return doc;
}

function drill(sequence: number, overrides: Partial<RawDrill> = {}): RawDrill {
    return {
        sequence,
        durationMinutes: 1,
        runsWithPrevious: false,
        instructions: "",
        drill: { name: `Drill ${sequence}`, description: "", playData: BOARD },
        ...overrides,
    };
}

function issuesOf(raw: unknown): string[] {
    const result = parsePlan(raw);
    if (result.ok) throw new Error("expected the plan to be rejected");
    expect(result.error.code).toBe("invalid");
    expect(result.error.message).toBe(INVALID_PLAN_MESSAGE);
    return result.error.issues ?? [];
}

describe("serializePlan", () => {
    it("builds the documented envelope", () => {
        const doc = serializePlan(input(), "openleague-hosted", NOW);
        expect(doc.format).toBe(PLAN_FORMAT);
        expect(doc.version).toBe(PLAN_VERSION);
        expect(doc.exportedAt).toBe("2026-10-03T18:00:00.000Z");
        expect(doc.generator).toBe("openleague-hosted");
        expect(doc.session).toMatchObject({ title: "Tuesday Skills Practice", durationMinutes: 60, date: "2026-10-06", startTime: "19:00" });
    });

    it("sorts by sequence, renumbers from 0, and never flags the first drill", () => {
        const doc = serializePlan(
            input({
                drills: [
                    { sequence: 7, duration: 5, runsWithPrevious: false, instructions: null, name: "Late", description: null, playData: BOARD },
                    { sequence: 3, duration: 5, runsWithPrevious: true, instructions: null, name: "Early", description: null, playData: BOARD },
                ],
            }),
            "openleague-static",
            NOW,
        );
        expect(doc.session.drills.map((d) => [d.sequence, d.drill.name, d.runsWithPrevious])).toEqual([
            [0, "Early", false],
            [1, "Late", false],
        ]);
    });

    it("fills a missing diagram with an empty board and nulls with empty strings", () => {
        const regroup = serializePlan(input(), "openleague-hosted", NOW).session.drills[2];
        expect(regroup.drill.playData).toEqual(createEmptyPlayData());
        expect(regroup.drill.description).toBe("");
        expect(regroup.instructions).toBe("");
    });

    it("carries no ids, thumbnails or other extra fields", () => {
        const base = input();
        const withIds = Object.assign({}, base.drills[0], { id: "row-1", playId: "cplayxxxxxxxxxxxxxxxxxxxx", thumbnail: "data:image/png;base64,AA==" });
        const doc = serializePlan(Object.assign({}, base, { drills: [withIds], teamId: "cteamxxxxxxxxxxxxxxxxxxxx" }), "openleague-hosted", NOW);
        expect(Object.keys(doc).sort()).toEqual(["exportedAt", "format", "generator", "session", "version"]);
        expect(Object.keys(doc.session).sort()).toEqual(["date", "drills", "durationMinutes", "startTime", "title"]);
        expect(Object.keys(doc.session.drills[0]).sort()).toEqual(["drill", "durationMinutes", "instructions", "runsWithPrevious", "sequence"]);
        expect(Object.keys(doc.session.drills[0].drill).sort()).toEqual(["description", "name", "playData"]);
    });
});

describe("parsePlan", () => {
    it("round-trips: parse(serialize(x)) equals the normalized document", () => {
        const doc = serializePlan(input(), "openleague-hosted", NOW);
        const result = parsePlan(JSON.parse(JSON.stringify(doc)));
        expect(result).toEqual({ ok: true, plan: doc });
    });

    it("accepts a plan with no drills", () => {
        const result = parsePlan(rawDoc((doc) => { doc.session.drills = []; }));
        expect(result.ok && result.plan.session.drills).toEqual([]);
    });

    it("upgrades a v1 diagram", () => {
        const result = parsePlan(rawDoc((doc) => { doc.session.drills[0].drill.playData = V1_BOARD; }));
        if (!result.ok) throw new Error(JSON.stringify(result.error));
        const board = result.plan.session.drills[0].drill.playData;
        expect(board.version).toBe(2);
        expect(board.players[0].position.x).toBe(200);
        expect(board.drawings[0]).toMatchObject({ action: "skate", end: "arrow" });
    });

    it("strips unknown keys at every level", () => {
        const result = parsePlan(
            rawDoc((doc) => {
                doc.teamId = "cteamxxxxxxxxxxxxxxxxxxxx";
                doc.session.id = "csessionxxxxxxxxxxxxxxxxx";
                doc.session.venueId = "cvenuexxxxxxxxxxxxxxxxxxx";
                doc.session.drills[0].playId = "cplayxxxxxxxxxxxxxxxxxxxx";
                doc.session.drills[0].drill.thumbnail = "data:image/png;base64,AA==";
                doc.session.drills[0].drill.id = "cplayxxxxxxxxxxxxxxxxxxxx";
            }),
        );
        if (!result.ok) throw new Error(JSON.stringify(result.error));
        expect(result.plan).not.toHaveProperty("teamId");
        expect(result.plan.session).not.toHaveProperty("id");
        expect(result.plan.session).not.toHaveProperty("venueId");
        expect(result.plan.session.drills[0]).not.toHaveProperty("playId");
        expect(result.plan.session.drills[0].drill).not.toHaveProperty("thumbnail");
        expect(result.plan.session.drills[0].drill).not.toHaveProperty("id");
    });

    it("returns drills in sequence order", () => {
        const result = parsePlan(rawDoc((doc) => { doc.session.drills.reverse(); }));
        expect(result.ok && result.plan.session.drills.map((d) => d.drill.name)).toEqual(["Warmup Laps", "Breakout", "Regroup"]);
    });

    it("reads a missing date, start time, instructions or description as empty", () => {
        const result = parsePlan(
            rawDoc((doc) => {
                delete doc.session.date;
                delete doc.session.startTime;
                delete doc.session.drills[0].instructions;
                delete doc.session.drills[0].drill.description;
            }),
        );
        if (!result.ok) throw new Error(JSON.stringify(result.error));
        expect([result.plan.session.date, result.plan.session.startTime]).toEqual([null, null]);
        expect([result.plan.session.drills[0].instructions, result.plan.session.drills[0].drill.description]).toEqual(["", ""]);
    });

    it.each([null, [], "plan", 42, {}, { format: "openleague.something-else", version: 1 }])("rejects %j as not a plan", (raw) => {
        expect(parsePlan(raw)).toEqual({ ok: false, error: { code: "not-a-plan", message: NOT_A_PLAN_MESSAGE } });
    });

    it("rejects a newer version before looking at anything else", () => {
        expect(parsePlan({ format: PLAN_FORMAT, version: 2 })).toEqual({
            ok: false,
            error: { code: "newer-version", message: NEWER_VERSION_MESSAGE },
        });
    });

    it("treats a non-integer version as invalid, not newer", () => {
        expect(issuesOf(rawDoc((doc) => { doc.version = "1"; })).length).toBeGreaterThan(0);
    });

    it("names the drill whose diagram can't be read", () => {
        const issues = issuesOf(rawDoc((doc) => { doc.session.drills[1].drill.playData = { version: 2, players: "nope" }; }));
        expect(issues).toContain('Drill 2 ("Breakout"): The diagram can\'t be read');
    });

    it.each([
        ["an empty title", (doc: RawDoc) => { doc.session.title = "   "; }, "Title is required"],
        ["a 101-character title", (doc: RawDoc) => { doc.session.title = "x".repeat(101); }, "Title must be at most 100 characters"],
        ["a 0-minute session", (doc: RawDoc) => { doc.session.durationMinutes = 0; }, "Session length must be at least 1 minute"],
        ["a 301-minute session", (doc: RawDoc) => { doc.session.durationMinutes = 301; }, "Session length must be at most 300 minutes"],
        ["a fractional drill length", (doc: RawDoc) => { doc.session.drills[0].durationMinutes = 1.5; }, 'Drill 1 ("Warmup Laps"): Drill length must be a whole number of minutes'],
        ["a 0-minute drill", (doc: RawDoc) => { doc.session.drills[0].durationMinutes = 0; }, 'Drill 1 ("Warmup Laps"): Drill length must be at least 1 minute'],
        ["2001-character instructions", (doc: RawDoc) => { doc.session.drills[0].instructions = "x".repeat(2001); }, 'Drill 1 ("Warmup Laps"): Instructions must be at most 2000 characters'],
        ["a 1001-character description", (doc: RawDoc) => { doc.session.drills[0].drill.description = "x".repeat(1001); }, 'Drill 1 ("Warmup Laps"): Description must be at most 1000 characters'],
        ["a blank drill name", (doc: RawDoc) => { doc.session.drills[0].drill.name = ""; }, "Drill 1: Drill name is required"],
        ["an impossible date", (doc: RawDoc) => { doc.session.date = "2026-02-30"; }, "Date must be a real calendar date (YYYY-MM-DD)"],
        ["a 24:00 start", (doc: RawDoc) => { doc.session.startTime = "24:00"; }, "Start time must be HH:mm (24-hour)"],
        ["a sequence gap", (doc: RawDoc) => { doc.session.drills[2].sequence = 5; }, "Drill sequences must run 0, 1, 2… with no gaps or repeats"],
        ["a flagged first drill", (doc: RawDoc) => { doc.session.drills[0].runsWithPrevious = true; }, FIRST_DRILL_STATION_ERROR],
        ["a timeline longer than the session", (doc: RawDoc) => { doc.session.durationMinutes = 20; }, "Practice timeline (25 min) exceeds session duration (20 min)"],
        ["a bad exportedAt", (doc: RawDoc) => { doc.exportedAt = "yesterday"; }, "exportedAt must be an ISO date-time"],
    ])("rejects %s", (_label, mutate, message) => {
        expect(issuesOf(rawDoc(mutate))).toContain(message);
    });

    it(`accepts a ${MAX_DRILL_DESCRIPTION_LENGTH}-character description (hosted plays allow 1000)`, () => {
        expect(parsePlan(rawDoc((doc) => { doc.session.drills[0].drill.description = "x".repeat(1000); })).ok).toBe(true);
    });

    it(`accepts ${MAX_PLAN_DRILLS} drills and rejects ${MAX_PLAN_DRILLS + 1}`, () => {
        const withDrills = (count: number) =>
            rawDoc((doc) => {
                doc.session.durationMinutes = 300;
                doc.session.drills = Array.from({ length: count }, (_, i) => drill(i));
            });
        expect(parsePlan(withDrills(MAX_PLAN_DRILLS)).ok).toBe(true);
        expect(issuesOf(withDrills(MAX_PLAN_DRILLS + 1))).toContain("A plan can hold at most 50 drills");
    });

    it("rejects a station block of five", () => {
        const issues = issuesOf(
            rawDoc((doc) => {
                doc.session.drills = Array.from({ length: 5 }, (_, i) => drill(i, { runsWithPrevious: i > 0 }));
            }),
        );
        expect(issues).toContain(STATION_GROUP_CAP_ERROR);
    });
});

describe("planFileName", () => {
    it.each([
        ["Tuesday Skills Practice", "tuesday-skills-practice.olplan.json"],
        ["  Équipe Été!!  ", "equipe-ete.olplan.json"],
        ["U12 / Power-Play #2", "u12-power-play-2.olplan.json"],
        ["🏒🏒", "practice-plan.olplan.json"],
        ["", "practice-plan.olplan.json"],
    ])("slugs %j", (title, expected) => {
        expect(planFileName(title)).toBe(expected);
    });

    it("caps the slug at 60 characters without a trailing hyphen", () => {
        const name = planFileName("ab ".repeat(40));
        const slug = name.replace(/\.olplan\.json$/, "");
        expect(slug.length).toBeLessThanOrEqual(60);
        expect(slug.endsWith("-")).toBe(false);
    });
});

describe("planToEditorSession", () => {
    it("maps drills to timeline plays that groupStations understands", () => {
        const session = planToEditorSession(serializePlan(input(), "openleague-hosted", NOW));
        expect(session).toMatchObject({ title: "Tuesday Skills Practice", duration: 60, date: "2026-10-06", startTime: "19:00" });
        const groups = groupStations(session.plays);
        expect(groups.map((g) => g.stations.map((p) => p.name))).toEqual([["Warmup Laps"], ["Breakout", "Regroup"]]);
        expect(new Set(session.plays.map((p) => p.key)).size).toBe(3);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test __tests__/lib/plan-document/document.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/plan-document"`.

- [ ] **Step 3: Write the implementation**

Create `lib/plan-document/document.ts`:

```ts
/**
 * The portable practice-plan document (ADR-0020): one versioned JSON format
 * shared by the hosted app's export/import and the static planner.
 *
 * Pure: no server, Next or DOM imports. Self-contained by design: no database
 * ids, team, user, venue, segment, reservation or thumbnail. Parsing strips
 * unknown keys, and every diagram goes through upgradePlayData (v1 → v2).
 */

import { z } from "zod";
import type { PlayData } from "@/types/practice-planner";
import { createEmptyPlayData, parseStoredPlayData } from "@/lib/utils/play-data";
import { sessionWallMinutes, stationGroupError } from "@/lib/utils/session-timeline";

export const PLAN_FORMAT = "openleague.practice-plan" as const;
export const PLAN_VERSION = 1 as const;
export const MAX_PLAN_DRILLS = 50;
export const MAX_PLAN_FILE_BYTES = 2_000_000;
export const MAX_PLAN_LINK_BYTES = 65_536;

const MAX_TITLE_LENGTH = 100;
const MAX_MINUTES = 300;
const MAX_DRILL_NAME_LENGTH = 100;
/** Matches hosted createPlaySchema, so every hosted drill round-trips. */
export const MAX_DRILL_DESCRIPTION_LENGTH = 1000;
const MAX_INSTRUCTIONS_LENGTH = 2000;
const MAX_GENERATOR_LENGTH = 100;

export const NOT_A_PLAN_MESSAGE = "This file isn't an OpenLeague practice plan.";
export const NEWER_VERSION_MESSAGE = "This plan was made by a newer version of OpenLeague. Update to open it.";
export const INVALID_PLAN_MESSAGE = "This practice plan has problems and can't be opened.";

export type PlanGenerator = "openleague-hosted" | "openleague-static";

// ---------------------------------------------------------------------------
// Field schemas
// ---------------------------------------------------------------------------

const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const clean = (text: string) => text.replace(CONTROL_CHARS, "").trim();

function requiredText(max: number, label: string) {
    return z
        .string({ message: `${label} must be text` })
        .transform(clean)
        .pipe(z.string().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`));
}

/** Missing or null reads as "". */
function optionalText(max: number, label: string) {
    return z
        .string({ message: `${label} must be text` })
        .transform(clean)
        .pipe(z.string().max(max, `${label} must be at most ${max} characters`))
        .nullish()
        .transform((value) => value ?? "");
}

function minutes(label: string) {
    return z
        .number({ message: `${label} must be a number of minutes` })
        .int(`${label} must be a whole number of minutes`)
        .min(1, `${label} must be at least 1 minute`)
        .max(MAX_MINUTES, `${label} must be at most ${MAX_MINUTES} minutes`);
}

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isCalendarDate(value: string): boolean {
    const match = LOCAL_DATE.exec(value);
    if (!match) return false;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const localDateSchema = z
    .string()
    .refine(isCalendarDate, "Date must be a real calendar date (YYYY-MM-DD)")
    .nullish()
    .transform((value) => value ?? null);

const localTimeSchema = z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Start time must be HH:mm (24-hour)")
    .nullish()
    .transform((value) => value ?? null);

/** Any stored diagram version; upgraded to v2. An unreadable one is an issue, not a blank board. */
const diagramSchema = z.unknown().transform((raw, ctx): PlayData => {
    const parsed = parseStoredPlayData(raw);
    if (parsed.ok) return parsed.data;
    ctx.addIssue({ code: "custom", message: "The diagram can't be read" });
    return z.NEVER;
});

const planDrillSchema = z.object({
    sequence: z.number({ message: "Sequence must be a number" }).int("Sequence must be a whole number").min(0, "Sequence can't be negative"),
    durationMinutes: minutes("Drill length"),
    runsWithPrevious: z.boolean({ message: "runsWithPrevious must be true or false" }).nullish().transform((value) => value ?? false),
    instructions: optionalText(MAX_INSTRUCTIONS_LENGTH, "Instructions"),
    drill: z.object({
        name: requiredText(MAX_DRILL_NAME_LENGTH, "Drill name"),
        description: optionalText(MAX_DRILL_DESCRIPTION_LENGTH, "Description"),
        playData: diagramSchema,
    }),
});

const planSessionSchema = z
    .object({
        title: requiredText(MAX_TITLE_LENGTH, "Title"),
        durationMinutes: minutes("Session length"),
        date: localDateSchema,
        startTime: localTimeSchema,
        drills: z.array(planDrillSchema).max(MAX_PLAN_DRILLS, `A plan can hold at most ${MAX_PLAN_DRILLS} drills`),
    })
    .superRefine((session, ctx) => {
        // The same rules the hosted save enforces (createPracticeSession).
        const timeline = session.drills.map((d) => ({
            sequence: d.sequence,
            duration: d.durationMinutes,
            runsWithPrevious: d.runsWithPrevious,
        }));
        const sequences = timeline.map((t) => t.sequence).sort((a, b) => a - b);
        if (sequences.some((sequence, index) => sequence !== index)) {
            ctx.addIssue({ code: "custom", path: ["drills"], message: "Drill sequences must run 0, 1, 2… with no gaps or repeats" });
            return;
        }
        const groupError = stationGroupError(timeline);
        if (groupError) ctx.addIssue({ code: "custom", path: ["drills"], message: groupError });
        const wall = sessionWallMinutes(timeline);
        if (wall > session.durationMinutes) {
            ctx.addIssue({
                code: "custom",
                path: ["durationMinutes"],
                message: `Practice timeline (${wall} min) exceeds session duration (${session.durationMinutes} min)`,
            });
        }
    })
    .transform((session) => ({ ...session, drills: [...session.drills].sort((a, b) => a.sequence - b.sequence) }));

export const planDocumentSchema = z.object({
    format: z.literal(PLAN_FORMAT),
    version: z.literal(PLAN_VERSION),
    exportedAt: z.iso.datetime({ offset: true, message: "exportedAt must be an ISO date-time" }),
    generator: z.string().trim().min(1).max(MAX_GENERATOR_LENGTH),
    session: planSessionSchema,
});

export type PlanDocument = z.output<typeof planDocumentSchema>;
export type PlanDrill = PlanDocument["session"]["drills"][number];

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

/** The minimal session view an exporter supplies (hosted detail page, static store). */
export interface PlanSessionInput {
    title: string;
    durationMinutes: number;
    /** YYYY-MM-DD, local calendar date */
    date: string | null;
    /** HH:mm, local wall clock */
    startTime: string | null;
    drills: Array<{
        sequence: number;
        duration: number;
        runsWithPrevious: boolean;
        instructions: string | null;
        name: string;
        description: string | null;
        /** null = unreadable; exported as an empty board */
        playData: PlayData | null;
    }>;
}

/**
 * Builds a document from a session. Picks fields explicitly, so ids and
 * thumbnails on the input never leak; sorts and renumbers sequences; the
 * first drill never runs with a previous one.
 */
export function serializePlan(input: PlanSessionInput, generator: PlanGenerator, now: Date = new Date()): PlanDocument {
    const drills = [...input.drills]
        .sort((a, b) => a.sequence - b.sequence)
        .map((d, index) => ({
            sequence: index,
            durationMinutes: d.duration,
            runsWithPrevious: index === 0 ? false : d.runsWithPrevious,
            instructions: d.instructions ?? "",
            drill: {
                name: d.name,
                description: d.description ?? "",
                playData: d.playData ?? createEmptyPlayData(),
            },
        }));
    return {
        format: PLAN_FORMAT,
        version: PLAN_VERSION,
        exportedAt: now.toISOString(),
        generator,
        session: {
            title: input.title,
            durationMinutes: input.durationMinutes,
            date: input.date,
            startTime: input.startTime,
            drills,
        },
    };
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

export type PlanErrorCode = "not-a-plan" | "newer-version" | "invalid";

export interface PlanError {
    code: PlanErrorCode;
    message: string;
    /** For "invalid": one readable line per problem */
    issues?: string[];
}

export type ParsePlanResult = { ok: true; plan: PlanDocument } | { ok: false; error: PlanError };

function drillNameAt(raw: unknown, index: number): string | null {
    const drills = (raw as { session?: { drills?: unknown } }).session?.drills;
    if (!Array.isArray(drills)) return null;
    const name = (drills[index] as { drill?: { name?: unknown } } | undefined)?.drill?.name;
    return typeof name === "string" && name.trim() ? clean(name).slice(0, MAX_DRILL_NAME_LENGTH) : null;
}

function describeIssue(issue: z.ZodError["issues"][number], raw: unknown): string {
    const [scope, list, index] = issue.path;
    if (scope === "session" && list === "drills" && typeof index === "number") {
        const name = drillNameAt(raw, index);
        return `Drill ${index + 1}${name ? ` ("${name}")` : ""}: ${issue.message}`;
    }
    return issue.message;
}

/** format → version → schema, so a newer file never reports field noise. */
export function parsePlan(raw: unknown): ParsePlanResult {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw) || (raw as { format?: unknown }).format !== PLAN_FORMAT) {
        return { ok: false, error: { code: "not-a-plan", message: NOT_A_PLAN_MESSAGE } };
    }
    const version = (raw as { version?: unknown }).version;
    if (typeof version === "number" && Number.isInteger(version) && version > PLAN_VERSION) {
        return { ok: false, error: { code: "newer-version", message: NEWER_VERSION_MESSAGE } };
    }
    const result = planDocumentSchema.safeParse(raw);
    if (!result.success) {
        return {
            ok: false,
            error: {
                code: "invalid",
                message: INVALID_PLAN_MESSAGE,
                issues: result.error.issues.map((issue) => describeIssue(issue, raw)),
            },
        };
    }
    return { ok: true, plan: result.data };
}

// ---------------------------------------------------------------------------
// File name and editor mapping
// ---------------------------------------------------------------------------

const MAX_SLUG_LENGTH = 60;

/** `<slug>.olplan.json`: lowercase ASCII, hyphen-joined, ≤ 60 chars, else `practice-plan`. */
export function planFileName(title: string): string {
    const slug = title
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, MAX_SLUG_LENGTH)
        .replace(/-+$/, "");
    return `${slug || "practice-plan"}.olplan.json`;
}

export interface PlanEditorDrill {
    /** Stable per-drill key for React lists */
    key: string;
    sequence: number;
    duration: number;
    runsWithPrevious: boolean;
    instructions: string;
    name: string;
    description: string;
    playData: PlayData;
}

export interface PlanEditorSession {
    title: string;
    duration: number;
    date: string | null;
    startTime: string | null;
    plays: PlanEditorDrill[];
}

/** The plan as timeline plays (TimelinePlay-compatible), for the import preview. */
export function planToEditorSession(plan: PlanDocument): PlanEditorSession {
    return {
        title: plan.session.title,
        duration: plan.session.durationMinutes,
        date: plan.session.date,
        startTime: plan.session.startTime,
        plays: plan.session.drills.map((d) => ({
            key: `plan-drill-${d.sequence}`,
            sequence: d.sequence,
            duration: d.durationMinutes,
            runsWithPrevious: d.runsWithPrevious,
            instructions: d.instructions,
            name: d.drill.name,
            description: d.drill.description,
            playData: d.drill.playData,
        })),
    };
}
```

Create `lib/plan-document/index.ts`:

```ts
/** Portable practice-plan document (ADR-0020). Pure; see document.ts. */
export * from "./document";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test __tests__/lib/plan-document/document.test.ts`
Expected: PASS.

If the "names the drill whose diagram can't be read" case reports the session-level superRefine issue as well, that is fine: the assertion uses `toContain`.

Then run `bun run type-check`. Expected: no errors.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add lib/plan-document/document.ts lib/plan-document/index.ts __tests__/lib/plan-document/document.test.ts
/usr/bin/git commit -m "$(cat <<'EOF'
feat(practice-planner): portable plan document format

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX
EOF
)"
```

---

### Task 2: Link codec and pending-plan hand-off

**Files:**
- Create: `lib/plan-document/link.ts`
- Create: `lib/plan-document/pending.ts`
- Modify: `lib/plan-document/index.ts` (add `export * from "./link";`)
- Test: `__tests__/lib/plan-document/link.test.ts`
- Test: `__tests__/lib/plan-document/pending.test.ts`

**Interfaces:**
- Consumes: `MAX_PLAN_LINK_BYTES`, `NOT_A_PLAN_MESSAGE`, `parsePlan`, `type PlanDocument` and `type ParsePlanResult` (Task 1).
- Produces:
  - `link.ts`, also re-exported from `@/lib/plan-document`:
    - `class PlanLinkTooLargeError extends Error { bytes: number }` and `class PlanLinkError extends Error`
    - `MAX_PLAN_LINK_ENCODED_LENGTH`
    - `deflateRaw(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>>` and `inflateRaw(bytes, limit: number): Promise<Uint8Array<ArrayBuffer>>`
    - `base64UrlEncode(bytes: Uint8Array): string` and `base64UrlDecode(value: string): Uint8Array<ArrayBuffer>`
    - `encodePlanLink(plan: PlanDocument): Promise<string>` and `decodePlanLink(fragmentValue: string): Promise<unknown>`
    - `readPlanLink(fragmentValue: string): Promise<ParsePlanResult>`
    - `LINK_TOO_LARGE_MESSAGE`, `LINK_UNREADABLE_MESSAGE` and `LINK_TOO_LARGE_TO_OPEN_MESSAGE`
  - `pending.ts`, imported as `@/lib/plan-document/pending`:
    - `PENDING_PLAN_KEY`, `PLAN_IMPORT_PATH = "/practice-planner/import"` and `PENDING_PLAN_TTL_MS`
    - `planFragmentValue(hash: string): string | null` and `clearLocationHash(): void`
    - `stashPlanFragment(now?: number): boolean`, `hasPendingPlan(now?: number): boolean` and `takePendingPlan(now?: number): string | null`
    - `takeIncomingPlan(now?: number): string | null`

`CompressionStream` and `DecompressionStream` exist as Node 22 globals inside Vitest's jsdom environment. This was verified at planning time. jsdom's `Blob` has no `.stream()`, so the codec feeds the streams through `getWriter()`/`getReader()` and never through `Blob` or `Response`. No polyfill is needed.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/plan-document/link.test.ts`:

```ts
/** Plan links (ADR-0020): deflate-raw + base64url in a #plan= fragment, with size caps both ways. */
import { describe, expect, it } from "vitest";
import {
    LINK_TOO_LARGE_TO_OPEN_MESSAGE,
    LINK_UNREADABLE_MESSAGE,
    MAX_PLAN_LINK_BYTES,
    MAX_PLAN_LINK_ENCODED_LENGTH,
    PlanLinkError,
    PlanLinkTooLargeError,
    base64UrlDecode,
    base64UrlEncode,
    decodePlanLink,
    deflateRaw,
    encodePlanLink,
    readPlanLink,
    serializePlan,
    type PlanSessionInput,
} from "@/lib/plan-document";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const NOW = new Date("2026-10-03T18:00:00.000Z");

function plan(drillCount = 2, instructions = "Go") {
    const input: PlanSessionInput = {
        title: "Tuesday",
        durationMinutes: 300,
        date: null,
        startTime: null,
        drills: Array.from({ length: drillCount }, (_, i) => ({
            sequence: i,
            duration: 1,
            runsWithPrevious: false,
            instructions,
            name: `Drill ${i}`,
            description: null,
            playData: createEmptyPlayData(),
        })),
    };
    return serializePlan(input, "openleague-hosted", NOW);
}

const encoder = new TextEncoder();

describe("base64url", () => {
    it("round-trips every byte value without padding or + /", () => {
        const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
        const encoded = base64UrlEncode(bytes);
        expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(Array.from(base64UrlDecode(encoded))).toEqual(Array.from(bytes));
    });

    it.each(["has space", "plus+slash/", "A"])("rejects %j", (value) => {
        expect(() => base64UrlDecode(value)).toThrow(PlanLinkError);
    });
});

describe("encodePlanLink / decodePlanLink", () => {
    it("round-trips a plan", async () => {
        const doc = plan();
        const encoded = await encodePlanLink(doc);
        expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(await decodePlanLink(encoded)).toEqual(JSON.parse(JSON.stringify(doc)));
    });

    it("refuses to encode a plan whose JSON exceeds the link cap", async () => {
        const big = plan(40, "a".repeat(2000));
        expect(encoder.encode(JSON.stringify(big)).byteLength).toBeGreaterThan(MAX_PLAN_LINK_BYTES);
        await expect(encodePlanLink(big)).rejects.toBeInstanceOf(PlanLinkTooLargeError);
    });

    it("decodes data that inflates to exactly the cap", async () => {
        const text = JSON.stringify("x".repeat(MAX_PLAN_LINK_BYTES - 2));
        const value = base64UrlEncode(await deflateRaw(encoder.encode(text)));
        expect(await decodePlanLink(value)).toBe("x".repeat(MAX_PLAN_LINK_BYTES - 2));
    });

    it("stops inflating past the cap (zip-bomb guard)", async () => {
        const bomb = base64UrlEncode(await deflateRaw(encoder.encode(" ".repeat(MAX_PLAN_LINK_BYTES * 8))));
        expect(bomb.length).toBeLessThan(MAX_PLAN_LINK_ENCODED_LENGTH);
        await expect(decodePlanLink(bomb)).rejects.toBeInstanceOf(PlanLinkTooLargeError);
    });

    it("rejects a fragment longer than any valid link before decoding", async () => {
        await expect(decodePlanLink("A".repeat(MAX_PLAN_LINK_ENCODED_LENGTH + 1))).rejects.toBeInstanceOf(PlanLinkTooLargeError);
    });

    it.each([
        ["empty", ""],
        ["not base64url", "@@@"],
        ["not deflate data", base64UrlEncode(encoder.encode("definitely not deflate"))],
    ])("rejects %s input", async (_label, value) => {
        await expect(decodePlanLink(value)).rejects.toBeInstanceOf(PlanLinkError);
    });

    it("rejects inflated bytes that aren't JSON", async () => {
        const value = base64UrlEncode(await deflateRaw(encoder.encode("{not json")));
        await expect(decodePlanLink(value)).rejects.toBeInstanceOf(PlanLinkError);
    });
});

describe("readPlanLink", () => {
    it("decodes and parses a plan", async () => {
        const result = await readPlanLink(await encodePlanLink(plan()));
        expect(result.ok && result.plan.session.title).toBe("Tuesday");
    });

    it("reports garbage as not a plan, with link wording", async () => {
        expect(await readPlanLink("@@@")).toEqual({ ok: false, error: { code: "not-a-plan", message: LINK_UNREADABLE_MESSAGE } });
    });

    it("reports valid JSON that isn't a plan with link wording", async () => {
        const value = base64UrlEncode(await deflateRaw(encoder.encode(JSON.stringify({ hello: "world" }))));
        expect(await readPlanLink(value)).toEqual({ ok: false, error: { code: "not-a-plan", message: LINK_UNREADABLE_MESSAGE } });
    });

    it("reports an oversized link as invalid", async () => {
        const bomb = base64UrlEncode(await deflateRaw(encoder.encode(" ".repeat(MAX_PLAN_LINK_BYTES * 2))));
        expect(await readPlanLink(bomb)).toEqual({ ok: false, error: { code: "invalid", message: LINK_TOO_LARGE_TO_OPEN_MESSAGE } });
    });
});
```

Create `__tests__/lib/plan-document/pending.test.ts`:

```ts
/** The #plan= hand-off across login (ADR-0020): fragment → sessionStorage → import page. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    PENDING_PLAN_KEY,
    PENDING_PLAN_TTL_MS,
    hasPendingPlan,
    planFragmentValue,
    stashPlanFragment,
    takeIncomingPlan,
    takePendingPlan,
} from "@/lib/plan-document/pending";

const NOW = Date.parse("2026-10-03T18:00:00.000Z");

beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState(null, "", "/");
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("planFragmentValue", () => {
    it.each([
        ["#plan=abc", "abc"],
        ["plan=abc", "abc"],
        ["#other=1&plan=x_y-z", "x_y-z"],
        ["#plan=", null],
        ["#planning", null],
        ["", null],
    ])("reads %j", (hash, expected) => {
        expect(planFragmentValue(hash)).toBe(expected);
    });
});

describe("stashPlanFragment", () => {
    it("moves the fragment into sessionStorage and clears the hash, keeping path and query", () => {
        window.history.replaceState(null, "", "/login?callbackUrl=%2Fx#plan=abc");
        expect(stashPlanFragment(NOW)).toBe(true);
        expect(window.location.hash).toBe("");
        expect(window.location.pathname + window.location.search).toBe("/login?callbackUrl=%2Fx");
        expect(JSON.parse(sessionStorage.getItem(PENDING_PLAN_KEY) ?? "null")).toEqual({ value: "abc", savedAt: NOW });
    });

    it("keeps history.state (the App Router stores its tree there)", () => {
        window.history.replaceState({ marker: 1 }, "", "/login#plan=abc");
        stashPlanFragment(NOW);
        expect(window.history.state).toEqual({ marker: 1 });
    });

    it("does nothing without a plan fragment", () => {
        window.history.replaceState(null, "", "/login#section");
        expect(stashPlanFragment(NOW)).toBe(false);
        expect(window.location.hash).toBe("#section");
        expect(sessionStorage.getItem(PENDING_PLAN_KEY)).toBeNull();
    });

    it("still clears the hash when storage refuses the write", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new DOMException("full", "QuotaExceededError");
        });
        window.history.replaceState(null, "", "/login#plan=abc");
        expect(stashPlanFragment(NOW)).toBe(false);
        expect(window.location.hash).toBe("");
    });
});

describe("pending plan expiry", () => {
    it("is fresh up to the TTL and stale after it", () => {
        window.history.replaceState(null, "", "/login#plan=abc");
        stashPlanFragment(NOW);
        expect(hasPendingPlan(NOW + PENDING_PLAN_TTL_MS)).toBe(true);
        expect(hasPendingPlan(NOW + PENDING_PLAN_TTL_MS + 1)).toBe(false);
    });

    it("take returns a fresh value once, then nothing", () => {
        window.history.replaceState(null, "", "/login#plan=abc");
        stashPlanFragment(NOW);
        expect(takePendingPlan(NOW + 1000)).toBe("abc");
        expect(takePendingPlan(NOW + 2000)).toBeNull();
    });

    it("take drops a stale value", () => {
        sessionStorage.setItem(PENDING_PLAN_KEY, JSON.stringify({ value: "old", savedAt: NOW }));
        expect(takePendingPlan(NOW + PENDING_PLAN_TTL_MS + 1)).toBeNull();
        expect(sessionStorage.getItem(PENDING_PLAN_KEY)).toBeNull();
    });

    it.each(["{", JSON.stringify({ value: 3, savedAt: NOW }), JSON.stringify({ value: "x" })])("ignores a corrupt entry %j", (stored) => {
        sessionStorage.setItem(PENDING_PLAN_KEY, stored);
        expect(hasPendingPlan(NOW)).toBe(false);
    });
});

describe("takeIncomingPlan", () => {
    it("prefers the fragment, clears the hash and drops any stash", () => {
        sessionStorage.setItem(PENDING_PLAN_KEY, JSON.stringify({ value: "stashed", savedAt: NOW }));
        window.history.replaceState(null, "", "/practice-planner/import#plan=fresh");
        expect(takeIncomingPlan(NOW)).toBe("fresh");
        expect(window.location.hash).toBe("");
        expect(sessionStorage.getItem(PENDING_PLAN_KEY)).toBeNull();
    });

    it("falls back to the stash", () => {
        sessionStorage.setItem(PENDING_PLAN_KEY, JSON.stringify({ value: "stashed", savedAt: NOW }));
        window.history.replaceState(null, "", "/practice-planner/import");
        expect(takeIncomingPlan(NOW)).toBe("stashed");
    });

    it("returns null when there is nothing", () => {
        expect(takeIncomingPlan(NOW)).toBeNull();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test __tests__/lib/plan-document/link.test.ts __tests__/lib/plan-document/pending.test.ts`
Expected: FAIL. `link.test.ts` fails on missing exports (`base64UrlEncode is not a function` or a similar import error). `pending.test.ts` fails with `Failed to resolve import "@/lib/plan-document/pending"`.

- [ ] **Step 3: Write the implementation**

Create `lib/plan-document/link.ts`:

```ts
/**
 * Plan links (ADR-0020): the plan's JSON, deflate-raw compressed and
 * base64url encoded, carried in a `#plan=` fragment so it never reaches a
 * server or its logs. Uses the platform's CompressionStream (browsers and
 * Node 22+). Streams are driven through getWriter/getReader rather than
 * Blob.stream(), which jsdom lacks.
 */

import {
    MAX_PLAN_LINK_BYTES,
    NOT_A_PLAN_MESSAGE,
    parsePlan,
    type ParsePlanResult,
    type PlanDocument,
} from "./document";

export const LINK_TOO_LARGE_MESSAGE = "This plan is too large for a link. Download the file instead.";
export const LINK_UNREADABLE_MESSAGE = "This link doesn't hold a readable OpenLeague practice plan.";
export const LINK_TOO_LARGE_TO_OPEN_MESSAGE = "This link's plan is larger than OpenLeague accepts.";

/** Deflate can grow incompressible data slightly; base64 adds a third. Longer fragments are refused unread. */
export const MAX_PLAN_LINK_ENCODED_LENGTH = Math.ceil(((MAX_PLAN_LINK_BYTES + 1024) * 4) / 3);

export class PlanLinkTooLargeError extends Error {
    constructor(readonly bytes: number) {
        super(`Plan link data is ${bytes} bytes; the limit is ${MAX_PLAN_LINK_BYTES}`);
        this.name = "PlanLinkTooLargeError";
    }
}

export class PlanLinkError extends Error {
    constructor(message: string, cause?: unknown) {
        super(message, { cause });
        this.name = "PlanLinkError";
    }
}

async function pump(
    bytes: Uint8Array<ArrayBuffer>,
    stream: CompressionStream | DecompressionStream,
    limit: number,
): Promise<Uint8Array<ArrayBuffer>> {
    const writer = stream.writable.getWriter();
    // Not awaited: the readable side must drain concurrently, or a large
    // write stalls on backpressure. Failures surface through the reader.
    writer.write(bytes).catch(() => {});
    writer.close().catch(() => {});

    const reader = stream.readable.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > limit) {
            await reader.cancel().catch(() => {});
            throw new PlanLinkTooLargeError(total);
        }
        chunks.push(value);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return out;
}

export function deflateRaw(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
    return pump(bytes, new CompressionStream("deflate-raw"), Number.POSITIVE_INFINITY);
}

/** Throws PlanLinkTooLargeError as soon as the output passes `limit`. */
export function inflateRaw(bytes: Uint8Array<ArrayBuffer>, limit: number): Promise<Uint8Array<ArrayBuffer>> {
    return pump(bytes, new DecompressionStream("deflate-raw"), limit);
}

const CHUNK = 0x8000;

export function base64UrlEncode(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
    if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new PlanLinkError("Plan link isn't base64url");
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    let binary: string;
    try {
        binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
    } catch (error) {
        throw new PlanLinkError("Plan link isn't base64url", error);
    }
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Throws PlanLinkTooLargeError when the plan's JSON exceeds MAX_PLAN_LINK_BYTES. */
export async function encodePlanLink(plan: PlanDocument): Promise<string> {
    const bytes = new TextEncoder().encode(JSON.stringify(plan));
    if (bytes.byteLength > MAX_PLAN_LINK_BYTES) throw new PlanLinkTooLargeError(bytes.byteLength);
    return base64UrlEncode(await deflateRaw(bytes));
}

/** The inverse of encodePlanLink. Returns unparsed JSON: call parsePlan on it. */
export async function decodePlanLink(fragmentValue: string): Promise<unknown> {
    if (fragmentValue.length > MAX_PLAN_LINK_ENCODED_LENGTH) throw new PlanLinkTooLargeError(fragmentValue.length);
    if (fragmentValue.length === 0) throw new PlanLinkError("Plan link is empty");
    const compressed = base64UrlDecode(fragmentValue);

    let inflated: Uint8Array<ArrayBuffer>;
    try {
        inflated = await inflateRaw(compressed, MAX_PLAN_LINK_BYTES);
    } catch (error) {
        if (error instanceof PlanLinkTooLargeError) throw error;
        throw new PlanLinkError("Plan link data is damaged", error);
    }

    let text: string;
    try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(inflated);
    } catch (error) {
        throw new PlanLinkError("Plan link data isn't text", error);
    }
    try {
        return JSON.parse(text) as unknown;
    } catch (error) {
        throw new PlanLinkError("Plan link data isn't JSON", error);
    }
}

/** decode + parse, with every failure as a PlanError worded for a link. */
export async function readPlanLink(fragmentValue: string): Promise<ParsePlanResult> {
    let raw: unknown;
    try {
        raw = await decodePlanLink(fragmentValue);
    } catch (error) {
        return error instanceof PlanLinkTooLargeError
            ? { ok: false, error: { code: "invalid", message: LINK_TOO_LARGE_TO_OPEN_MESSAGE } }
            : { ok: false, error: { code: "not-a-plan", message: LINK_UNREADABLE_MESSAGE } };
    }
    const result = parsePlan(raw);
    if (!result.ok && result.error.message === NOT_A_PLAN_MESSAGE) {
        return { ok: false, error: { code: "not-a-plan", message: LINK_UNREADABLE_MESSAGE } };
    }
    return result;
}
```

Edit `lib/plan-document/index.ts` so that it reads:

```ts
/** Portable practice-plan document (ADR-0020). Pure; see document.ts and link.ts. */
export * from "./document";
export * from "./link";
```

Create `lib/plan-document/pending.ts`:

```ts
/**
 * Carries a `#plan=` fragment across login (ADR-0020). The dashboard's auth
 * redirect to /login keeps the fragment (a 307 Location without a fragment
 * inherits it, RFC 7231 §7.1.2) but not the path, so the login page stashes
 * the value here and sends the coach to the import page after sign-in.
 *
 * Browser-only: every function touches `window`, none at module load.
 */

export const PENDING_PLAN_KEY = "openleague.pendingPlan";
export const PLAN_IMPORT_PATH = "/practice-planner/import";
/** A stash older than this is ignored, so an abandoned plan can't hijack a later login. */
export const PENDING_PLAN_TTL_MS = 30 * 60_000;
/** Tolerated clock skew for a savedAt slightly in the future. */
const FUTURE_SKEW_MS = 60_000;

/** The `plan` value of a `#plan=…` fragment (or of `plan=…`), or null. */
export function planFragmentValue(hash: string): string | null {
    const value = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash).get("plan");
    return value ? value : null;
}

/** Drops the fragment from the address bar and this history entry. Keeps history.state. */
export function clearLocationHash(): void {
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, "", `${pathname}${search}`);
}

function storage(): Storage | null {
    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
}

function readPending(now: number): string | null {
    let stored: string | null;
    try {
        stored = storage()?.getItem(PENDING_PLAN_KEY) ?? null;
    } catch {
        return null;
    }
    if (!stored) return null;
    try {
        const parsed = JSON.parse(stored) as { value?: unknown; savedAt?: unknown };
        if (typeof parsed.value !== "string" || !parsed.value || typeof parsed.savedAt !== "number") return null;
        const age = now - parsed.savedAt;
        return age <= PENDING_PLAN_TTL_MS && age >= -FUTURE_SKEW_MS ? parsed.value : null;
    } catch {
        return null;
    }
}

/** Login page: moves a `#plan=` fragment into sessionStorage. Returns whether it was stored. */
export function stashPlanFragment(now: number = Date.now()): boolean {
    const value = planFragmentValue(window.location.hash);
    if (!value) return false;
    let stored = false;
    try {
        storage()?.setItem(PENDING_PLAN_KEY, JSON.stringify({ value, savedAt: now }));
        stored = storage() !== null;
    } catch {
        stored = false;
    }
    // Clear the hash either way: a plan must not linger in the URL or history.
    clearLocationHash();
    return stored;
}

export function hasPendingPlan(now: number = Date.now()): boolean {
    return readPending(now) !== null;
}

/** Returns a fresh stashed value and always removes the stash. */
export function takePendingPlan(now: number = Date.now()): string | null {
    const value = readPending(now);
    try {
        storage()?.removeItem(PENDING_PLAN_KEY);
    } catch {
        // Storage unavailable: nothing to remove.
    }
    return value;
}

/** Import page: the fragment's plan (clearing the hash), else the stashed one. Clears both. */
export function takeIncomingPlan(now: number = Date.now()): string | null {
    const fromHash = planFragmentValue(window.location.hash);
    if (fromHash) clearLocationHash();
    const stashed = takePendingPlan(now);
    return fromHash ?? stashed;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test __tests__/lib/plan-document/`
Expected: all three files pass.

Then run `bun run type-check`. Expected: no errors.

`Uint8Array<ArrayBuffer>` needs TS ≥ 5.7, and the repo is on 5.9.3. If `writer.write(bytes)` reports a `BufferSource` mismatch, the parameter type must stay `Uint8Array<ArrayBuffer>`. Do not widen it.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add lib/plan-document/link.ts lib/plan-document/pending.ts lib/plan-document/index.ts __tests__/lib/plan-document/link.test.ts __tests__/lib/plan-document/pending.test.ts
/usr/bin/git commit -m "$(cat <<'EOF'
feat(practice-planner): plan link codec and login hand-off

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX
EOF
)"
```

---

### Task 3: `importPracticePlan` server action

**Files:**
- Create: `lib/actions/practice-plan-import.ts`
- Test: `__tests__/lib/actions/practice-plan-import.test.ts`

**Interfaces:**
- Consumes:
  - from Task 1: `parsePlan`
  - from `lib/auth/session.ts`: `requireUserId(): Promise<string>` (redirects when signed out) and `requireTeamAdmin(teamId): Promise<string>` (throws `Error("Unauthorized: …")`)
  - `newPlayId(): string` (`lib/services/play-ids.ts`)
  - `sanitizePlayDataForWrite(playData): { ok: true; data } | { ok: false; issues }` (`lib/utils/play-data.ts`)
- Produces:
  - `importPracticePlan(input: ImportPracticePlanInput): Promise<ActionResult<{ sessionId: string }>>`
  - `type ImportPracticePlanInput = { teamId: string; document: unknown; date: string; addToLibrary?: boolean }`
  - `type ActionResult<T>` (the same shape as `practice-sessions.ts`)

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/actions/practice-plan-import.test.ts`:

```ts
/** importPracticePlan (ADR-0020): re-parse, authorize, then one transaction of session + owned drills (+ library). */
import { beforeEach, describe, expect, it, vi } from "vitest";

const playIds = vi.hoisted(() => ({ next: 0 }));
vi.mock("@/lib/services/play-ids", () => ({ newPlayId: () => `cowned${playIds.next++}xxxxxxxxxxxxxxxxxx` }));

const { mockAuth, models, mockPrisma, mockCache } = vi.hoisted(() => {
    const models = {
        practiceSession: { create: vi.fn() },
        play: { createMany: vi.fn() },
        practiceSessionPlay: { createMany: vi.fn() },
    };
    return {
        models,
        mockAuth: { requireUserId: vi.fn(), requireTeamAdmin: vi.fn() },
        mockPrisma: { $transaction: vi.fn(async (fn: (tx: typeof models) => unknown) => fn(models)), ...models },
        mockCache: { revalidatePath: vi.fn() },
    };
});

vi.mock("@/lib/auth/session", () => mockAuth);
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("next/cache", () => mockCache);

import { importPracticePlan } from "@/lib/actions/practice-plan-import";
import { INVALID_PLAN_MESSAGE, NOT_A_PLAN_MESSAGE, serializePlan, type PlanSessionInput } from "@/lib/plan-document";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayData } from "@/types/practice-planner";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const USER = "cuserxxxxxxxxxxxxxxxxxxxx";
const SESSION = "csessionxxxxxxxxxxxxxxxxx";
const DATE = "2026-10-06T23:00:00.000Z";

const BOARD: PlayData = {
    version: 2,
    players: [{ id: "p1", position: { x: 50, y: 40 }, role: "X", label: "F1", color: "#1976D2" }],
    drawings: [],
    equipment: [],
    annotations: [],
};

function doc(overrides: Partial<PlanSessionInput> = {}) {
    return serializePlan(
        {
            title: "Tuesday Skills Practice",
            durationMinutes: 60,
            date: "2026-10-06",
            startTime: "19:00",
            drills: [
                { sequence: 0, duration: 10, runsWithPrevious: false, instructions: "Two laps", name: "Warmup Laps", description: "", playData: BOARD },
                { sequence: 1, duration: 15, runsWithPrevious: false, instructions: "", name: "Breakout", description: "D to D", playData: BOARD },
                { sequence: 2, duration: 10, runsWithPrevious: true, instructions: "", name: "Regroup", description: "", playData: createEmptyPlayData() },
            ],
            ...overrides,
        },
        "openleague-static",
        new Date("2026-10-03T18:00:00.000Z"),
    );
}

function call(overrides: Record<string, unknown> = {}) {
    return importPracticePlan({ teamId: TEAM, document: doc(), date: DATE, addToLibrary: false, ...overrides });
}

beforeEach(() => {
    vi.clearAllMocks();
    playIds.next = 0;
    mockAuth.requireUserId.mockResolvedValue(USER);
    mockAuth.requireTeamAdmin.mockResolvedValue(USER);
    models.practiceSession.create.mockResolvedValue({ id: SESSION });
    models.play.createMany.mockResolvedValue({ count: 3 });
    models.practiceSessionPlay.createMany.mockResolvedValue({ count: 3 });
});

describe("importPracticePlan", () => {
    it("lets the sign-in redirect propagate instead of swallowing it", async () => {
        mockAuth.requireUserId.mockRejectedValue(new Error("NEXT_REDIRECT"));
        await expect(call()).rejects.toThrow("NEXT_REDIRECT");
        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("rejects a caller who can't schedule for the team", async () => {
        mockAuth.requireTeamAdmin.mockRejectedValue(new Error("Unauthorized: Only team admins can perform this action"));
        expect(await call()).toEqual({ success: false, error: "You can't schedule practices for this team." });
        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("rejects bad input fields", async () => {
        const result = await call({ teamId: "nope", date: "tomorrow" });
        expect(result).toMatchObject({ success: false, error: "Invalid input" });
        expect(mockAuth.requireTeamAdmin).not.toHaveBeenCalled();
    });

    it("re-parses the document: not a plan", async () => {
        expect(await call({ document: { format: "other" } })).toEqual({ success: false, error: NOT_A_PLAN_MESSAGE, details: undefined });
        expect(mockAuth.requireTeamAdmin).not.toHaveBeenCalled();
    });

    it("re-parses the document: invalid, with details", async () => {
        const broken = JSON.parse(JSON.stringify(doc()));
        broken.session.drills[0].durationMinutes = 0;
        const result = await call({ document: broken });
        expect(result).toMatchObject({ success: false, error: INVALID_PLAN_MESSAGE });
        expect(result.success === false && result.details).toContain('Drill 1 ("Warmup Laps"): Drill length must be at least 1 minute');
    });

    it("rejects a timeline longer than the session", async () => {
        const result = await call({ document: { ...doc(), session: { ...doc().session, durationMinutes: 20 } } });
        expect(result.success === false && result.details).toContain("Practice timeline (25 min) exceeds session duration (20 min)");
        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("creates the session, its owned drills and the ordered rows in one transaction", async () => {
        const result = await call();

        expect(result).toEqual({ success: true, data: { sessionId: SESSION } });
        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
        expect(models.practiceSession.create).toHaveBeenCalledWith({
            data: {
                title: "Tuesday Skills Practice",
                date: new Date(DATE),
                duration: 60,
                isShared: false,
                teamId: TEAM,
                createdById: USER,
            },
            select: { id: true },
        });

        expect(models.play.createMany).toHaveBeenCalledTimes(1);
        const owned = models.play.createMany.mock.calls[0][0].data;
        expect(owned).toHaveLength(3);
        expect(owned[0]).toEqual({
            id: "cowned0xxxxxxxxxxxxxxxxxx",
            name: "Warmup Laps",
            description: null,
            thumbnail: null,
            playData: BOARD,
            isTemplate: false,
            teamId: TEAM,
            createdById: USER,
            sessionId: SESSION,
            sourcePlayId: null,
        });
        expect(owned[1].description).toBe("D to D");

        const rows = models.practiceSessionPlay.createMany.mock.calls[0][0].data;
        expect(rows).toEqual([
            { sessionId: SESSION, playId: "cowned0xxxxxxxxxxxxxxxxxx", sequence: 0, duration: 10, instructions: "Two laps", runsWithPrevious: false },
            { sessionId: SESSION, playId: "cowned1xxxxxxxxxxxxxxxxxx", sequence: 1, duration: 15, instructions: null, runsWithPrevious: false },
            { sessionId: SESSION, playId: "cowned2xxxxxxxxxxxxxxxxxx", sequence: 2, duration: 10, instructions: null, runsWithPrevious: true },
        ]);
        expect(mockCache.revalidatePath).toHaveBeenCalledWith("/practice-planner");
    });

    it("adds separate library copies when asked", async () => {
        await call({ addToLibrary: true });

        expect(models.play.createMany).toHaveBeenCalledTimes(2);
        const library = models.play.createMany.mock.calls[1][0].data;
        expect(library).toHaveLength(3);
        for (const row of library) {
            expect(row).toMatchObject({ isTemplate: true, sessionId: null, sourcePlayId: null, thumbnail: null, teamId: TEAM, createdById: USER });
            expect(row).not.toHaveProperty("id");
        }
        expect(mockCache.revalidatePath).toHaveBeenCalledWith("/practice-planner/library");
    });

    it("imports a plan with no drills as an empty session", async () => {
        const result = await call({ document: doc({ drills: [] }) });
        expect(result).toEqual({ success: true, data: { sessionId: SESSION } });
        expect(models.play.createMany).not.toHaveBeenCalled();
        expect(models.practiceSessionPlay.createMany).not.toHaveBeenCalled();
    });

    it("rejects a diagram that parses but can't be written, naming the drill", async () => {
        const controlOnly: PlayData = {
            ...BOARD,
            annotations: [{ id: "a1", text: "\u0001", position: { x: 10, y: 10 }, fontSize: 14, color: "#000000" }],
        };
        const result = await call({
            document: doc({
                drills: [{ sequence: 0, duration: 10, runsWithPrevious: false, instructions: "", name: "Warmup Laps", description: "", playData: controlOnly }],
            }),
        });
        expect(result).toMatchObject({ success: false, error: 'Drill 1 ("Warmup Laps") has a diagram that can\'t be saved.' });
        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("returns a friendly error when the database fails", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        models.practiceSession.create.mockRejectedValue(new Error("connection reset"));
        expect(await call()).toEqual({ success: false, error: "Failed to import the practice plan. Please try again." });
        consoleError.mockRestore();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test __tests__/lib/actions/practice-plan-import.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/actions/practice-plan-import"`.

- [ ] **Step 3: Write the implementation**

Create `lib/actions/practice-plan-import.ts`:

```ts
"use server";

/**
 * Import a portable practice plan (ADR-0020) as a new session. The document
 * is re-parsed here: the client's parse is never trusted. Every drill becomes
 * a session-owned Play copy (3a); "add to library" adds separate library
 * copies. Prisma only (ADR-0003), one transaction.
 */

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireTeamAdmin, requireUserId } from "@/lib/auth/session";
import { newPlayId } from "@/lib/services/play-ids";
import { sanitizePlayDataForWrite } from "@/lib/utils/play-data";
import { parsePlan } from "@/lib/plan-document";
import type { PlayData } from "@/types/practice-planner";

export type ActionResult<T> =
    | { success: true; data: T }
    | { success: false; error: string; details?: unknown };

// Not exported: a "use server" file may export only async functions.
const NOT_SCHEDULER_MESSAGE = "You can't schedule practices for this team.";
const IMPORT_FAILED_MESSAGE = "Failed to import the practice plan. Please try again.";

const importPracticePlanSchema = z.object({
    teamId: z.string().cuid("Invalid team ID format"),
    /** The plan's local date + start time, combined in the coach's browser zone. */
    date: z.iso.datetime({ offset: true, message: "Valid date is required" }),
    addToLibrary: z.boolean().default(false),
    document: z.unknown(),
});

export type ImportPracticePlanInput = z.input<typeof importPracticePlanSchema>;

export async function importPracticePlan(
    input: ImportPracticePlanInput,
): Promise<ActionResult<{ sessionId: string }>> {
    // Outside the try: a signed-out caller is redirected by a thrown signal,
    // which a catch would swallow.
    await requireUserId();

    try {
        const validated = importPracticePlanSchema.safeParse(input);
        if (!validated.success) {
            return { success: false, error: "Invalid input", details: validated.error.issues };
        }
        const { teamId, addToLibrary } = validated.data;

        const parsed = parsePlan(validated.data.document);
        if (!parsed.ok) {
            return { success: false, error: parsed.error.message, details: parsed.error.issues };
        }
        const { session: planSession } = parsed.plan;

        // createPracticeSession's requirePracticeScheduler without a reservation.
        let userId: string;
        try {
            userId = await requireTeamAdmin(teamId);
        } catch {
            return { success: false, error: NOT_SCHEDULER_MESSAGE };
        }

        const diagrams: PlayData[] = [];
        for (const drill of planSession.drills) {
            const clean = sanitizePlayDataForWrite(drill.drill.playData);
            if (!clean.ok) {
                return {
                    success: false,
                    error: `Drill ${drill.sequence + 1} ("${drill.drill.name}") has a diagram that can't be saved.`,
                    details: clean.issues,
                };
            }
            diagrams.push(clean.data);
        }

        const sessionId = await prisma.$transaction(async (tx) => {
            const session = await tx.practiceSession.create({
                data: {
                    title: planSession.title,
                    date: new Date(validated.data.date),
                    duration: planSession.durationMinutes,
                    isShared: false,
                    teamId,
                    createdById: userId,
                },
                select: { id: true },
            });
            if (planSession.drills.length === 0) return session.id;

            const drillFields = planSession.drills.map((drill, index) => ({
                name: drill.drill.name,
                description: drill.drill.description || null,
                thumbnail: null,
                playData: diagrams[index] as unknown as Prisma.InputJsonValue,
                teamId,
                createdById: userId,
                sourcePlayId: null,
            }));

            // Ids first, so the rows can point at their copies.
            const ownedIds = planSession.drills.map(() => newPlayId());
            await tx.play.createMany({
                data: drillFields.map((fields, index) => ({
                    id: ownedIds[index],
                    ...fields,
                    isTemplate: false,
                    sessionId: session.id,
                })),
            });
            await tx.practiceSessionPlay.createMany({
                data: planSession.drills.map((drill, index) => ({
                    sessionId: session.id,
                    playId: ownedIds[index],
                    sequence: drill.sequence,
                    duration: drill.durationMinutes,
                    instructions: drill.instructions || null,
                    runsWithPrevious: drill.runsWithPrevious,
                })),
            });
            if (addToLibrary) {
                await tx.play.createMany({
                    data: drillFields.map((fields) => ({ ...fields, isTemplate: true, sessionId: null })),
                });
            }
            return session.id;
        });

        revalidatePath("/practice-planner");
        if (addToLibrary) revalidatePath("/practice-planner/library");

        return { success: true, data: { sessionId } };
    } catch (error) {
        console.error("Error importing practice plan:", error);
        return { success: false, error: IMPORT_FAILED_MESSAGE };
    }
}
```

The test's `owned[0]` uses `toEqual` with a fixed key set. Because the row object is built by spreading `fields`, the key order differs, but `toEqual` ignores order. Keep these exact keys: `id`, `name`, `description`, `thumbnail`, `playData`, `isTemplate`, `teamId`, `createdById`, `sessionId` and `sourcePlayId`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test __tests__/lib/actions/practice-plan-import.test.ts`
Expected: PASS.

Then run `bun run type-check && bun run check:raw-sql`. Expected: both clean.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add lib/actions/practice-plan-import.ts __tests__/lib/actions/practice-plan-import.test.ts
/usr/bin/git commit -m "$(cat <<'EOF'
feat(practice-planner): import a plan document as a new session

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX
EOF
)"
```

---

### Task 4: Export plan menu on the session detail page

**Files:**
- Create: `components/features/practice-planner/ExportPlanMenu.tsx`
- Modify: `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx`. The import block is at lines 47–51, after `import { SessionTimeline } …`. The element goes after the `Print bench sheet` `</Button>` at line 327.
- Modify: `.env.example`. The addition goes after the `NEXT_PUBLIC_GA_MEASUREMENT_ID=""` line (58).
- Test: `__tests__/components/features/practice-planner/ExportPlanMenu.test.tsx`
- Test: `__tests__/app/practice-session-detail-timeline.test.tsx` (add one `it`)

**Interfaces:**
- Consumes:
  - from Tasks 1–2: `serializePlan`, `planFileName`, `encodePlanLink`, `PlanLinkTooLargeError`, `LINK_TOO_LARGE_MESSAGE` and `type PlanDocument`
  - from `lib/utils/date.ts`: `formatDateTimeLocalInput(date, timeZone): string`, `resolveTimeZone(preferred?): string` and `sessionStart({ date, startAt }): Date`
- Produces:
  - `interface ExportableSession { title: string; date: string; duration: number; startAt?: string | null; venueTimezone?: string | null; plays: Array<{ sequence: number; duration: number; instructions: string | null; runsWithPrevious: boolean; play: { name: string; description: string | null; playData: PlayData | null } }> }`. `SessionDetailView`'s `SessionData` satisfies this structurally.
  - `buildPlanDocument(session: ExportableSession, now?: Date): PlanDocument`
  - `unreadableDiagramNotice(count: number): string | null`
  - `ExportPlanMenu({ session, size? })`

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/features/practice-planner/ExportPlanMenu.test.tsx`:

```tsx
/** Export plan (ADR-0020): download the plan file; optionally copy an "Open in planner" link. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
    ExportPlanMenu,
    buildPlanDocument,
    unreadableDiagramNotice,
    type ExportableSession,
} from "@/components/features/practice-planner/ExportPlanMenu";
import { LINK_TOO_LARGE_MESSAGE, decodePlanLink, parsePlan } from "@/lib/plan-document";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { formatDateTimeLocalInput, resolveTimeZone } from "@/lib/utils/date";

const NOW = new Date("2026-10-03T18:00:00.000Z");

function sessionPlay(name: string, sequence: number, runsWithPrevious = false, readable = true) {
    return {
        sequence,
        duration: 10,
        runsWithPrevious,
        instructions: null,
        play: { name, description: null, playData: readable ? createEmptyPlayData() : null },
    };
}

const SESSION: ExportableSession = {
    title: "Tuesday Skills",
    date: "2026-04-07T22:00:00.000Z",
    duration: 60,
    startAt: null,
    venueTimezone: null,
    plays: [sessionPlay("Breakout", 0), sessionPlay("Regroup", 1, true)],
};

const BOOKED: ExportableSession = {
    ...SESSION,
    venueTimezone: "America/Denver",
    startAt: "2026-04-08T00:00:00.000Z", // 6:00 PM MDT on April 7
};

let clicks: Array<{ download: string; href: string }>;

beforeEach(() => {
    clicks = [];
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:plan");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        clicks.push({ download: this.download, href: this.getAttribute("href") ?? "" });
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

function openMenu() {
    fireEvent.click(screen.getByRole("button", { name: "Export plan" }));
}

describe("buildPlanDocument", () => {
    it("formats a booked session's date and start in the venue's zone", () => {
        const doc = buildPlanDocument(BOOKED, NOW);
        expect([doc.session.date, doc.session.startTime]).toEqual(["2026-04-07", "18:00"]);
        expect(doc.generator).toBe("openleague-hosted");
        expect(doc.exportedAt).toBe(NOW.toISOString());
    });

    it("formats an unbooked session in the viewer's zone", () => {
        const [date, time] = formatDateTimeLocalInput(new Date(SESSION.date), resolveTimeZone(null)).split("T");
        const doc = buildPlanDocument(SESSION, NOW);
        expect([doc.session.date, doc.session.startTime]).toEqual([date, time]);
    });

    it("exports an unreadable diagram as an empty board and still parses", () => {
        const doc = buildPlanDocument({ ...SESSION, plays: [sessionPlay("Broken", 0, false, false)] }, NOW);
        expect(doc.session.drills[0].drill.playData).toEqual(createEmptyPlayData());
        expect(parsePlan(JSON.parse(JSON.stringify(doc))).ok).toBe(true);
    });
});

describe("unreadableDiagramNotice", () => {
    it.each([
        [0, null],
        [1, "1 drill had an unreadable diagram and was exported blank."],
        [3, "3 drills had unreadable diagrams and were exported blank."],
    ])("for %i", (count, expected) => {
        expect(unreadableDiagramNotice(count)).toBe(expected);
    });
});

describe("ExportPlanMenu", () => {
    it("downloads the plan as <slug>.olplan.json", () => {
        render(<ExportPlanMenu session={SESSION} />);
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: "Download plan file" }));

        expect(clicks).toEqual([{ download: "tuesday-skills.olplan.json", href: "blob:plan" }]);
        const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
        expect(blob.type).toBe("application/json");
    });

    it("warns when drills were exported blank", async () => {
        render(<ExportPlanMenu session={{ ...SESSION, plays: [sessionPlay("Broken", 0, false, false)] }} />);
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: "Download plan file" }));
        expect(await screen.findByText("1 drill had an unreadable diagram and was exported blank.")).toBeInTheDocument();
    });

    it("hides the link item when no static planner URL is configured", () => {
        vi.stubEnv("NEXT_PUBLIC_STATIC_PLANNER_URL", "");
        render(<ExportPlanMenu session={SESSION} />);
        openMenu();
        expect(screen.queryByRole("menuitem", { name: /open in planner/i })).not.toBeInTheDocument();
    });

    it("copies a planner link whose fragment decodes back to the plan", async () => {
        vi.stubEnv("NEXT_PUBLIC_STATIC_PLANNER_URL", "https://planner.example/app/");
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

        render(<ExportPlanMenu session={SESSION} />);
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: /open in planner/i }));

        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
        const link = writeText.mock.calls[0][0] as string;
        expect(link).toMatch(/^https:\/\/planner\.example\/app\/#plan=[A-Za-z0-9_-]+$/);
        const result = parsePlan(await decodePlanLink(link.split("#plan=")[1]));
        expect(result.ok && result.plan.session.title).toBe("Tuesday Skills");
        expect(await screen.findByText("Link copied. Paste it to open this plan in the planner.")).toBeInTheDocument();
    });

    it("says when the plan is too large for a link", async () => {
        vi.stubEnv("NEXT_PUBLIC_STATIC_PLANNER_URL", "https://planner.example/app/");
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn() } });
        const big: ExportableSession = {
            ...SESSION,
            duration: 300,
            plays: Array.from({ length: 40 }, (_, i) => ({ ...sessionPlay(`Drill ${i}`, i), duration: 1, instructions: "a".repeat(2000) })),
        };

        render(<ExportPlanMenu session={big} />);
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: /open in planner/i }));
        expect(await screen.findByText(LINK_TOO_LARGE_MESSAGE)).toBeInTheDocument();
    });
});
```

Append this `it` inside the `describe("SessionDetailView timeline and print (3b)", …)` block of `__tests__/app/practice-session-detail-timeline.test.tsx`, directly after the `"links to the bench sheet in a new tab, for members too"` test:

```tsx
    it("offers Export plan to members too (ADR-0020)", () => {
        renderView();
        expect(screen.getByRole("button", { name: "Export plan" })).toBeInTheDocument();
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test __tests__/components/features/practice-planner/ExportPlanMenu.test.tsx __tests__/app/practice-session-detail-timeline.test.tsx`
Expected: FAIL. The first file fails with `Failed to resolve import "@/components/features/practice-planner/ExportPlanMenu"`. The new detail-view case fails because it can't find the button `Export plan`.

- [ ] **Step 3: Write the implementation**

Create `components/features/practice-planner/ExportPlanMenu.tsx`:

```tsx
"use client";

/**
 * "Export plan" (ADR-0020): downloads the session as a portable plan file and,
 * when NEXT_PUBLIC_STATIC_PLANNER_URL is set, copies an "Open in planner" link
 * carrying the plan in its #plan= fragment. Built from the page's own session
 * data: no new server read.
 */

import { useState } from "react";
import { Alert, Button, ListItemIcon, ListItemText, Menu, MenuItem, Snackbar, type ButtonProps } from "@mui/material";
import {
    FileDownloadOutlined as DownloadIcon,
    IosShareOutlined as ExportIcon,
    LinkOutlined as LinkIcon,
} from "@mui/icons-material";
import type { PlayData } from "@/types/practice-planner";
import { formatDateTimeLocalInput, resolveTimeZone, sessionStart } from "@/lib/utils/date";
import {
    LINK_TOO_LARGE_MESSAGE,
    PlanLinkTooLargeError,
    encodePlanLink,
    planFileName,
    serializePlan,
    type PlanDocument,
} from "@/lib/plan-document";

export interface ExportableSession {
    title: string;
    date: string;
    duration: number;
    startAt?: string | null;
    venueTimezone?: string | null;
    plays: Array<{
        sequence: number;
        duration: number;
        instructions: string | null;
        runsWithPrevious: boolean;
        play: { name: string; description: string | null; playData: PlayData | null };
    }>;
}

/** Local date and start come from sessionStart in the venue's zone when booked, else the viewer's. */
export function buildPlanDocument(session: ExportableSession, now: Date = new Date()): PlanDocument {
    const local = formatDateTimeLocalInput(sessionStart(session), resolveTimeZone(session.venueTimezone));
    const [date, startTime] = local ? local.split("T") : [null, null];
    return serializePlan(
        {
            title: session.title,
            durationMinutes: session.duration,
            date: date ?? null,
            startTime: startTime ?? null,
            drills: session.plays.map((sp) => ({
                sequence: sp.sequence,
                duration: sp.duration,
                runsWithPrevious: sp.runsWithPrevious,
                instructions: sp.instructions,
                name: sp.play.name,
                description: sp.play.description,
                playData: sp.play.playData,
            })),
        },
        "openleague-hosted",
        now,
    );
}

export function unreadableDiagramNotice(count: number): string | null {
    if (count === 0) return null;
    return count === 1
        ? "1 drill had an unreadable diagram and was exported blank."
        : `${count} drills had unreadable diagrams and were exported blank.`;
}

type Notice = { severity: "success" | "info" | "warning" | "error"; text: string };

interface ExportPlanMenuProps {
    session: ExportableSession;
    size?: ButtonProps["size"];
}

export function ExportPlanMenu({ session, size = "medium" }: ExportPlanMenuProps) {
    const plannerUrl = process.env.NEXT_PUBLIC_STATIC_PLANNER_URL?.trim();
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [notice, setNotice] = useState<Notice | null>(null);
    const unreadable = unreadableDiagramNotice(session.plays.filter((sp) => sp.play.playData === null).length);

    const download = () => {
        setAnchor(null);
        const doc = buildPlanDocument(session);
        const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = planFileName(session.title);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
        setNotice(unreadable ? { severity: "warning", text: unreadable } : null);
    };

    const copyLink = async () => {
        setAnchor(null);
        if (!plannerUrl) return;
        try {
            const encoded = await encodePlanLink(buildPlanDocument(session));
            await navigator.clipboard.writeText(`${plannerUrl.split("#")[0]}#plan=${encoded}`);
            setNotice(
                unreadable
                    ? { severity: "warning", text: unreadable }
                    : { severity: "success", text: "Link copied. Paste it to open this plan in the planner." },
            );
        } catch (error) {
            setNotice(
                error instanceof PlanLinkTooLargeError
                    ? { severity: "info", text: LINK_TOO_LARGE_MESSAGE }
                    : { severity: "error", text: "Couldn't copy the link. Download the file instead." },
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
                {plannerUrl && (
                    <MenuItem onClick={() => void copyLink()}>
                        <ListItemIcon>
                            <LinkIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText>Copy “Open in planner” link</ListItemText>
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

In `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx`, add the import directly after `import { SessionTimeline } from "@/components/features/practice-planner/SessionTimeline";`:

```tsx
import { ExportPlanMenu } from "@/components/features/practice-planner/ExportPlanMenu";
```

In the same file, insert the element directly after the `Print bench sheet` button's closing `</Button>` and before `{isAdmin && (`:

```tsx
            <ExportPlanMenu session={session} size={isMobile ? "small" : "medium"} />
```

In `.env.example`, add after `NEXT_PUBLIC_GA_MEASUREMENT_ID=""`:

```bash

# Static practice planner (ADR-0020). When set, the session page's Export plan
# menu offers 'Copy "Open in planner" link' pointing here.
# NEXT_PUBLIC_STATIC_PLANNER_URL="https://example.github.io/openleague/planner/"
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test __tests__/components/features/practice-planner/ExportPlanMenu.test.tsx __tests__/app/practice-session-detail-timeline.test.tsx __tests__/app/practice-session-detail-stations.test.tsx __tests__/app/SessionDetailView.line-budget.test.ts`
Expected: PASS. The line budget should read 846 ≤ 900.

Then run `bun run type-check`. Expected: no errors.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add components/features/practice-planner/ExportPlanMenu.tsx "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx" .env.example __tests__/components/features/practice-planner/ExportPlanMenu.test.tsx __tests__/app/practice-session-detail-timeline.test.tsx
/usr/bin/git commit -m "$(cat <<'EOF'
feat(practice-planner): export a session as a plan file or planner link

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX
EOF
)"
```

---

### Task 5: Import route, `PlanImportView`, preview, eligible teams, breadcrumb

**Files:**
- Modify: `lib/actions/practice-session-queries.ts` (append `getPlanImportTeams` at the end of the file)
- Create: `components/features/practice-planner/PlanPreview.tsx`
- Create: `components/features/practice-planner/PlanImportView.tsx`
- Create: `app/(dashboard)/practice-planner/import/page.tsx`
- Modify: `components/providers/LeagueProvider.tsx:168`. The new branch goes before `} else if (segments[1] === 'library') {`.
- Test: `__tests__/lib/actions/plan-import-teams.test.ts`
- Test: `__tests__/components/features/practice-planner/PlanImportView.test.tsx`
- Test: `__tests__/components/providers/LeagueProvider.test.tsx` (add one case)

**Interfaces:**
- Consumes:
  - from Tasks 1–2: `parsePlan`, `readPlanLink`, `planToEditorSession`, `MAX_PLAN_FILE_BYTES`, `NOT_A_PLAN_MESSAGE` and the `PlanError`/`PlanDocument`/`ParsePlanResult` types, plus `takeIncomingPlan` (`@/lib/plan-document/pending`)
  - from Task 3: `importPracticePlan`
  - from `lib/utils/session-timeline.ts`: `groupStations`, `sessionWallMinutes` and `stationBlockLabel(count, minutes)`
  - `plannedLabel(planned, booked)` (`components/features/practice-planner/SessionTimeline.tsx`)
  - `useMounted()` (`lib/hooks/useClockText.ts`)
  - `generateThumbnail(playData, options?)` (`lib/utils/canvas/thumbnail-generator.ts`)
  - `parseDateTimeLocalToUtc(value, zone)` and `resolveTimeZone()` (`lib/utils/date.ts`)
- Produces:
  - `getPlanImportTeams(): Promise<Array<{ id: string; name: string }>>`
  - `PlanImportView({ teams })`
  - `readPlanFile(file: File): Promise<ParsePlanResult>`
  - `FILE_TOO_LARGE_MESSAGE` and `NO_IMPORT_TEAMS_MESSAGE`
  - `PlanPreview({ plan })`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/actions/plan-import-teams.test.ts`:

```ts
/** The teams a plan may be imported into: the ones where the scheduler check (team ADMIN) passes. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({ mockPrisma: { teamMember: { findMany: vi.fn() } } }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ requireUserId: vi.fn().mockResolvedValue("cuserxxxxxxxxxxxxxxxxxxxx") }));

import { getPlanImportTeams } from "@/lib/actions/practice-session-queries";

describe("getPlanImportTeams", () => {
    beforeEach(() => vi.clearAllMocks());

    it("lists the user's ADMIN teams by name", async () => {
        mockPrisma.teamMember.findMany.mockResolvedValue([
            { team: { id: "cbearsxxxxxxxxxxxxxxxxxxx", name: "Bears" } },
            { team: { id: "clionsxxxxxxxxxxxxxxxxxxx", name: "Lions" } },
        ]);
        expect(await getPlanImportTeams()).toEqual([
            { id: "cbearsxxxxxxxxxxxxxxxxxxx", name: "Bears" },
            { id: "clionsxxxxxxxxxxxxxxxxxxx", name: "Lions" },
        ]);
        expect(mockPrisma.teamMember.findMany).toHaveBeenCalledWith({
            where: { userId: "cuserxxxxxxxxxxxxxxxxxxxx", role: "ADMIN" },
            select: { team: { select: { id: true, name: true } } },
            orderBy: { team: { name: "asc" } },
        });
    });
});
```

Create `__tests__/components/features/practice-planner/PlanImportView.test.tsx`:

```tsx
/** Import a practice plan (ADR-0020): file or #plan= link → preview → team → new session. */
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push }) }));
const actions = vi.hoisted(() => ({ importPracticePlan: vi.fn() }));
vi.mock("@/lib/actions/practice-plan-import", () => actions);
vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({
    generateThumbnail: vi.fn(() => "data:image/png;base64,AA=="),
}));

import {
    FILE_TOO_LARGE_MESSAGE,
    NO_IMPORT_TEAMS_MESSAGE,
    PlanImportView,
} from "@/components/features/practice-planner/PlanImportView";
import {
    INVALID_PLAN_MESSAGE,
    LINK_UNREADABLE_MESSAGE,
    MAX_PLAN_FILE_BYTES,
    NEWER_VERSION_MESSAGE,
    NOT_A_PLAN_MESSAGE,
    PLAN_FORMAT,
    encodePlanLink,
    serializePlan,
    type PlanSessionInput,
} from "@/lib/plan-document";
import { PENDING_PLAN_KEY } from "@/lib/plan-document/pending";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { parseDateTimeLocalToUtc, resolveTimeZone } from "@/lib/utils/date";

const LIONS = { id: "clionsxxxxxxxxxxxxxxxxxxx", name: "Lions" };
const BEARS = { id: "cbearsxxxxxxxxxxxxxxxxxxx", name: "Bears" };
const NEW_SESSION = "cnewsessionxxxxxxxxxxxxxx";

function plan(overrides: Partial<PlanSessionInput> = {}) {
    return serializePlan(
        {
            title: "Tuesday Skills Practice",
            durationMinutes: 60,
            date: "2026-10-06",
            startTime: "19:00",
            drills: [
                { sequence: 0, duration: 10, runsWithPrevious: false, instructions: "Two laps", name: "Warmup Laps", description: "", playData: createEmptyPlayData() },
                { sequence: 1, duration: 15, runsWithPrevious: false, instructions: "", name: "Breakout", description: "", playData: createEmptyPlayData() },
                { sequence: 2, duration: 10, runsWithPrevious: true, instructions: "", name: "Regroup", description: "", playData: createEmptyPlayData() },
            ],
            ...overrides,
        },
        "openleague-static",
        new Date("2026-10-03T18:00:00.000Z"),
    );
}

function upload(contents: BlobPart, name = "plan.olplan.json") {
    fireEvent.change(screen.getByTestId("plan-file-input"), {
        target: { files: [new File([contents], name, { type: "application/json" })] },
    });
}

const title = () => screen.findByRole("heading", { name: "Tuesday Skills Practice" });

beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    window.history.replaceState(null, "", "/practice-planner/import");
});

afterEach(() => {
    sessionStorage.clear();
});

describe("PlanImportView: getting the plan in", () => {
    it("reads a #plan= fragment and clears the hash", async () => {
        window.history.replaceState(null, "", `/practice-planner/import#plan=${await encodePlanLink(plan())}`);
        render(<PlanImportView teams={[LIONS]} />);
        expect(await title()).toBeInTheDocument();
        expect(window.location.hash).toBe("");
    });

    it("still shows the fragment's plan when StrictMode replays the mount effect", async () => {
        window.history.replaceState(null, "", `/practice-planner/import#plan=${await encodePlanLink(plan())}`);
        render(
            <StrictMode>
                <PlanImportView teams={[LIONS]} />
            </StrictMode>,
        );
        expect(await title()).toBeInTheDocument();
    });

    it("consumes a plan stashed by the login page", async () => {
        sessionStorage.setItem(PENDING_PLAN_KEY, JSON.stringify({ value: await encodePlanLink(plan()), savedAt: Date.now() }));
        render(<PlanImportView teams={[LIONS]} />);
        expect(await title()).toBeInTheDocument();
        expect(sessionStorage.getItem(PENDING_PLAN_KEY)).toBeNull();
    });

    it("reads a chosen file", async () => {
        render(<PlanImportView teams={[LIONS]} />);
        upload(JSON.stringify(plan()));
        expect(await title()).toBeInTheDocument();
    });
});

describe("PlanImportView: preview", () => {
    it("shows duration, planned minutes and station groups", async () => {
        render(<PlanImportView teams={[LIONS]} />);
        upload(JSON.stringify(plan()));
        await title();
        expect(screen.getByText("60 min · Planned 25 of 60 min")).toBeInTheDocument();
        expect(screen.getByText("Stations · 2 · 15 min")).toBeInTheDocument();
        expect(screen.getByText("Warmup Laps")).toBeInTheDocument();
        expect(screen.getAllByRole("img", { name: /diagram$/ })).toHaveLength(3);
    });
});

describe("PlanImportView: errors", () => {
    it.each([
        ["a file that isn't JSON", "not json at all", NOT_A_PLAN_MESSAGE],
        ["a newer plan", JSON.stringify({ format: PLAN_FORMAT, version: 2 }), NEWER_VERSION_MESSAGE],
    ])("shows %s with a way to choose another file", async (_label, contents, message) => {
        render(<PlanImportView teams={[LIONS]} />);
        upload(contents);
        expect(await screen.findByText(message)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Choose another file" })).toBeInTheDocument();
    });

    it("lists each problem in an invalid plan", async () => {
        const broken = JSON.parse(JSON.stringify(plan()));
        broken.session.drills[0].durationMinutes = 0;
        render(<PlanImportView teams={[LIONS]} />);
        upload(JSON.stringify(broken));
        expect(await screen.findByText(INVALID_PLAN_MESSAGE)).toBeInTheDocument();
        expect(screen.getByText('Drill 1 ("Warmup Laps"): Drill length must be at least 1 minute')).toBeInTheDocument();
    });

    it("refuses a file over the size cap before reading it", async () => {
        render(<PlanImportView teams={[LIONS]} />);
        upload(new Uint8Array(MAX_PLAN_FILE_BYTES + 1));
        expect(await screen.findByText(FILE_TOO_LARGE_MESSAGE)).toBeInTheDocument();
    });

    it("shows a damaged link as unreadable", async () => {
        window.history.replaceState(null, "", "/practice-planner/import#plan=@@@");
        render(<PlanImportView teams={[LIONS]} />);
        expect(await screen.findByText(LINK_UNREADABLE_MESSAGE)).toBeInTheDocument();
    });
});

describe("PlanImportView: form", () => {
    it("auto-selects the only team and imports, then opens the editor", async () => {
        actions.importPracticePlan.mockResolvedValue({ success: true, data: { sessionId: NEW_SESSION } });
        render(<PlanImportView teams={[LIONS]} />);
        upload(JSON.stringify(plan()));
        await title();

        expect(screen.getByRole("combobox", { name: /team/i })).toHaveTextContent("Lions");
        fireEvent.click(screen.getByLabelText("Also add these drills to the team library"));
        fireEvent.click(screen.getByRole("button", { name: "Import plan" }));

        await waitFor(() => expect(nav.push).toHaveBeenCalledWith(`/practice-planner/${NEW_SESSION}/edit`));
        expect(actions.importPracticePlan).toHaveBeenCalledWith({
            teamId: LIONS.id,
            document: plan(),
            date: parseDateTimeLocalToUtc("2026-10-06T19:00", resolveTimeZone())!.toISOString(),
            addToLibrary: true,
        });
    });

    it("needs a team chosen when there are several", async () => {
        render(<PlanImportView teams={[BEARS, LIONS]} />);
        upload(JSON.stringify(plan()));
        await title();
        expect(screen.getByRole("button", { name: "Import plan" })).toBeDisabled();
    });

    it("needs both date and start time when the plan has none", async () => {
        render(<PlanImportView teams={[LIONS]} />);
        upload(JSON.stringify(plan({ date: null, startTime: null })));
        await title();
        const button = screen.getByRole("button", { name: "Import plan" });
        expect(button).toBeDisabled();
        fireEvent.change(screen.getByLabelText(/^date/i), { target: { value: "2026-10-06" } });
        expect(button).toBeDisabled();
        fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "19:00" } });
        expect(button).toBeEnabled();
    });

    it("shows the action's error and stays on the page", async () => {
        actions.importPracticePlan.mockResolvedValue({ success: false, error: "You can't schedule practices for this team." });
        render(<PlanImportView teams={[LIONS]} />);
        upload(JSON.stringify(plan()));
        await title();
        fireEvent.click(screen.getByRole("button", { name: "Import plan" }));
        expect(await screen.findByText("You can't schedule practices for this team.")).toBeInTheDocument();
        expect(nav.push).not.toHaveBeenCalled();
    });

    it("explains when the user can't import into any team", async () => {
        render(<PlanImportView teams={[]} />);
        expect(screen.getByText(NO_IMPORT_TEAMS_MESSAGE)).toBeInTheDocument();
        upload(JSON.stringify(plan()));
        await title();
        expect(screen.getByRole("button", { name: "Import plan" })).toBeDisabled();
    });
});
```

In `__tests__/components/providers/LeagueProvider.test.tsx`, add this case inside `describe('single-team mode', …)`, directly after the `it.each([...])('covers %s', …)` block:

```tsx
    it('labels the practice plan import page', () => {
      mocks.pathname.mockReturnValue('/practice-planner/import');
      renderCrumbs(singleTeamData);
      expect(screen.getByTestId('crumbs')).toHaveTextContent('Dashboard > Practice Planner > Import Plan');
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test __tests__/lib/actions/plan-import-teams.test.ts __tests__/components/features/practice-planner/PlanImportView.test.tsx __tests__/components/providers/LeagueProvider.test.tsx`
Expected: FAIL.
- `getPlanImportTeams` is not exported.
- `PlanImportView` cannot be resolved.
- The breadcrumb reads `Dashboard > Practice Planner > Session`.

- [ ] **Step 3: Write the implementation**

Append to `lib/actions/practice-session-queries.ts`:

```ts
/**
 * Teams the current user may import a practice plan into (ADR-0020): those
 * where createPracticeSession's scheduler check passes without a reservation,
 * i.e. a team ADMIN membership (requireTeamAdmin has no isActive filter, so
 * neither does this).
 */
export async function getPlanImportTeams(): Promise<Array<{ id: string; name: string }>> {
  const userId = await requireUserId();
  const memberships = await prisma.teamMember.findMany({
    where: { userId, role: "ADMIN" },
    select: { team: { select: { id: true, name: true } } },
    orderBy: { team: { name: "asc" } },
  });
  return memberships.map((membership) => membership.team);
}
```

Create `components/features/practice-planner/PlanPreview.tsx`:

```tsx
"use client";

/** Read-only preview of a plan being imported: header, station-grouped drills, diagram thumbnails. */

import { useMemo } from "react";
import { Box, Paper, Stack, Typography } from "@mui/material";
import { groupStations, sessionWallMinutes, stationBlockLabel } from "@/lib/utils/session-timeline";
import { generateThumbnail } from "@/lib/utils/canvas/thumbnail-generator";
import { useMounted } from "@/lib/hooks/useClockText";
import { plannedLabel } from "@/components/features/practice-planner/SessionTimeline";
import { planToEditorSession, type PlanDocument } from "@/lib/plan-document";

const THUMB = { width: 120, height: 51 } as const;

export function PlanPreview({ plan }: { plan: PlanDocument }) {
    const session = useMemo(() => planToEditorSession(plan), [plan]);
    const groups = useMemo(() => groupStations(session.plays), [session]);
    const mounted = useMounted();

    // Canvas needs the DOM: thumbnails are drawn in the first render after mount.
    const thumbnails = useMemo(() => {
        const map = new Map<string, string>();
        if (!mounted) return map;
        for (const play of session.plays) {
            try {
                map.set(play.key, generateThumbnail(play.playData));
            } catch (error) {
                console.warn("Plan preview: couldn't draw a diagram", error);
            }
        }
        return map;
    }, [mounted, session]);

    return (
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography variant="h5" component="h2" fontWeight={800}>
                {session.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {`${session.duration} min · ${plannedLabel(sessionWallMinutes(session.plays), session.duration)}`}
            </Typography>
            {session.plays.length === 0 ? (
                <Typography color="text.secondary">No drills in this plan</Typography>
            ) : (
                <Stack component="ol" aria-label="Drills in this plan" spacing={2} sx={{ listStyle: "none", p: 0, m: 0 }}>
                    {groups.map((group) => (
                        <Box component="li" key={group.index}>
                            {group.stations.length > 1 && (
                                <Typography variant="overline" color="secondary.main">
                                    {stationBlockLabel(group.stations.length, group.wallMinutes)}
                                </Typography>
                            )}
                            <Stack spacing={1}>
                                {group.stations.map((play) => {
                                    const src = thumbnails.get(play.key);
                                    return (
                                        <Stack key={play.key} direction="row" spacing={1.5} alignItems="center">
                                            {src ? (
                                                <Box
                                                    component="img"
                                                    src={src}
                                                    alt={`${play.name} diagram`}
                                                    sx={{ ...THUMB, flexShrink: 0, borderRadius: 1, border: 1, borderColor: "divider" }}
                                                />
                                            ) : (
                                                <Box aria-hidden sx={{ ...THUMB, flexShrink: 0, borderRadius: 1, bgcolor: "action.hover" }} />
                                            )}
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography fontWeight={600}>{play.name}</Typography>
                                                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-line" }}>
                                                    {play.instructions ? `${play.duration} min · ${play.instructions}` : `${play.duration} min`}
                                                </Typography>
                                            </Box>
                                        </Stack>
                                    );
                                })}
                            </Stack>
                        </Box>
                    ))}
                </Stack>
            )}
        </Paper>
    );
}
```

Create `components/features/practice-planner/PlanImportView.tsx`:

```tsx
"use client";

/**
 * Import a practice plan (ADR-0020). The plan arrives as a chosen file, a
 * `#plan=` fragment, or a fragment the login page stashed (pending.ts). The
 * coach previews it, picks a team, confirms the date and start, and the
 * import opens the new session in the editor.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { FileUploadOutlined as UploadIcon } from "@mui/icons-material";
import { PageHeader } from "@/components/ui/PageHeader";
import { PlanPreview } from "@/components/features/practice-planner/PlanPreview";
import { importPracticePlan } from "@/lib/actions/practice-plan-import";
import { parseDateTimeLocalToUtc, resolveTimeZone } from "@/lib/utils/date";
import {
    MAX_PLAN_FILE_BYTES,
    NOT_A_PLAN_MESSAGE,
    parsePlan,
    readPlanLink,
    type ParsePlanResult,
    type PlanDocument,
    type PlanError,
} from "@/lib/plan-document";
import { takeIncomingPlan } from "@/lib/plan-document/pending";

export const FILE_TOO_LARGE_MESSAGE = `This file is too large to be a practice plan (the limit is ${MAX_PLAN_FILE_BYTES / 1_000_000} MB).`;
export const NO_IMPORT_TEAMS_MESSAGE = "Only team admins can import practice plans. Ask an admin of your team to import it.";

/** Size check first, then JSON, then parsePlan. Never throws. */
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

type ViewState = { kind: "pick" } | { kind: "error"; error: PlanError } | { kind: "ready"; plan: PlanDocument };

function toViewState(result: ParsePlanResult): ViewState {
    return result.ok ? { kind: "ready", plan: result.plan } : { kind: "error", error: result.error };
}

type Team = { id: string; name: string };

interface PlanImportViewProps {
    teams: Team[];
}

export function PlanImportView({ teams }: PlanImportViewProps) {
    const router = useRouter();
    const fileInput = useRef<HTMLInputElement>(null);
    // undefined = not looked yet. takeIncomingPlan consumes the hash and the
    // stash, so StrictMode's effect replay must reuse this value, not take again.
    const incoming = useRef<string | null | undefined>(undefined);
    const [state, setState] = useState<ViewState>({ kind: "pick" });

    useEffect(() => {
        if (incoming.current === undefined) incoming.current = takeIncomingPlan();
        const value = incoming.current;
        if (!value) return;
        let cancelled = false;
        void readPlanLink(value).then((result) => {
            if (!cancelled) setState(toViewState(result));
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const chooseFile = () => fileInput.current?.click();

    const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = ""; // so choosing the same file again still fires change
        if (!file) return;
        setState(toViewState(await readPlanFile(file)));
    };

    return (
        <>
            <PageHeader title="Import practice plan" subtitle="Open a plan file or a link from the OpenLeague planner" />
            <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                hidden
                data-testid="plan-file-input"
                onChange={(event) => void onFile(event)}
            />
            <Stack spacing={2}>
                {teams.length === 0 && <Alert severity="info">{NO_IMPORT_TEAMS_MESSAGE}</Alert>}

                {state.kind === "pick" && (
                    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
                        <Typography sx={{ mb: 2 }}>Choose a plan file (.olplan.json) exported from OpenLeague.</Typography>
                        <Button variant="contained" startIcon={<UploadIcon />} onClick={chooseFile}>
                            Choose plan file
                        </Button>
                    </Paper>
                )}

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
                    <PlanImportForm
                        // A new plan resets the form's prefilled fields.
                        key={state.plan.exportedAt + state.plan.session.title}
                        plan={state.plan}
                        teams={teams}
                        onChooseAnother={chooseFile}
                        onImported={(sessionId) => router.push(`/practice-planner/${sessionId}/edit`)}
                    />
                )}
            </Stack>
        </>
    );
}

interface PlanImportFormProps {
    plan: PlanDocument;
    teams: Team[];
    onChooseAnother: () => void;
    onImported: (sessionId: string) => void;
}

function PlanImportForm({ plan, teams, onChooseAnother, onImported }: PlanImportFormProps) {
    const [teamId, setTeamId] = useState(teams.length === 1 ? teams[0].id : "");
    const [date, setDate] = useState(plan.session.date ?? "");
    const [startTime, setStartTime] = useState(plan.session.startTime ?? "");
    const [addToLibrary, setAddToLibrary] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<{ message: string; details: string[] } | null>(null);

    // Combined in the coach's browser zone; a venue booking added later in the editor uses the venue's zone.
    const when = date && startTime ? parseDateTimeLocalToUtc(`${date}T${startTime}`, resolveTimeZone()) : null;
    const canImport = Boolean(teamId) && when !== null && !submitting;

    const submit = async () => {
        if (!teamId || !when) return;
        setSubmitting(true);
        setError(null);
        try {
            const result = await importPracticePlan({ teamId, document: plan, date: when.toISOString(), addToLibrary });
            if (result.success) {
                onImported(result.data.sessionId); // stays "submitting" while the editor loads
                return;
            }
            const details = Array.isArray(result.details)
                ? result.details.filter((detail): detail is string => typeof detail === "string")
                : [];
            setError({ message: result.error, details });
        } catch (caught) {
            console.error("Import practice plan failed:", caught);
            setError({ message: "Couldn't reach OpenLeague. Please try again.", details: [] });
        }
        setSubmitting(false);
    };

    return (
        <Stack spacing={2}>
            <PlanPreview plan={plan} />
            <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
                <Stack spacing={2}>
                    {teams.length > 0 && (
                        <TextField select label="Team" value={teamId} onChange={(event) => setTeamId(event.target.value)} fullWidth>
                            {teams.map((team) => (
                                <MenuItem key={team.id} value={team.id}>
                                    {team.name}
                                </MenuItem>
                            ))}
                        </TextField>
                    )}
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                        <TextField
                            type="date"
                            label="Date"
                            value={date}
                            onChange={(event) => setDate(event.target.value)}
                            slotProps={{ inputLabel: { shrink: true } }}
                            fullWidth
                        />
                        <TextField
                            type="time"
                            label="Start time"
                            value={startTime}
                            onChange={(event) => setStartTime(event.target.value)}
                            slotProps={{ inputLabel: { shrink: true } }}
                            fullWidth
                        />
                    </Stack>
                    <FormControlLabel
                        control={<Checkbox checked={addToLibrary} onChange={(event) => setAddToLibrary(event.target.checked)} />}
                        label="Also add these drills to the team library"
                    />
                    {error && (
                        <Alert severity="error">
                            {error.message}
                            {error.details.length > 0 && (
                                <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5 }}>
                                    {error.details.map((detail, index) => (
                                        <li key={index}>{detail}</li>
                                    ))}
                                </Box>
                            )}
                        </Alert>
                    )}
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button onClick={onChooseAnother}>Choose another file</Button>
                        <Button variant="contained" disabled={!canImport} onClick={() => void submit()}>
                            Import plan
                        </Button>
                    </Stack>
                </Stack>
            </Paper>
        </Stack>
    );
}
```

Create `app/(dashboard)/practice-planner/import/page.tsx`:

```tsx
import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/PageContainer";
import { PlanImportView } from "@/components/features/practice-planner/PlanImportView";
import { getPlanImportTeams } from "@/lib/actions/practice-session-queries";

export const metadata: Metadata = {
  title: "Import Practice Plan | OpenLeague",
  description: "Import a practice plan file or link",
};

// The (dashboard) layout requires sign-in. A user with no eligible team still
// gets the page (with an explanation) so an opened plan isn't silently dropped.
export default async function ImportPracticePlanPage() {
  const teams = await getPlanImportTeams();

  return (
    <PageContainer>
      <PlanImportView teams={teams} />
    </PageContainer>
  );
}
```

In `components/providers/LeagueProvider.tsx`, insert this branch directly after the `segments[1] === 'new'` branch, which ends with `breadcrumbs.push({ label: 'New Session' });`, and before `} else if (segments[1] === 'library') {`:

```tsx
        } else if (segments[1] === 'import') {
          breadcrumbs.push({ label: 'Practice Planner', href: '/practice-planner' });
          breadcrumbs.push({ label: 'Import Plan' });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test __tests__/lib/actions/plan-import-teams.test.ts __tests__/components/features/practice-planner/PlanImportView.test.tsx __tests__/components/providers/LeagueProvider.test.tsx __tests__/lib/actions/practice-session-queries.test.ts`
Expected: PASS.

Then run `bun run type-check && bun run lint`. Expected: no errors, and no new `react-hooks/set-state-in-effect` warning, because the effect only calls `setState` inside a `.then`.

`/practice-planner/import` is a static segment beside `[sessionId]`, and static segments win. Task 8's `bun run build` confirms this.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add lib/actions/practice-session-queries.ts components/features/practice-planner/PlanPreview.tsx components/features/practice-planner/PlanImportView.tsx "app/(dashboard)/practice-planner/import/page.tsx" components/providers/LeagueProvider.tsx __tests__/lib/actions/plan-import-teams.test.ts __tests__/components/features/practice-planner/PlanImportView.test.tsx __tests__/components/providers/LeagueProvider.test.tsx
/usr/bin/git commit -m "$(cat <<'EOF'
feat(practice-planner): import page for plan files and links

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX
EOF
)"
```

---

### Task 6: Keep a `#plan=` link across login

**Files:**
- Modify: `app/(auth)/login/page.tsx`:
  - imports, after line 22 (`import { trackAuth } from "@/lib/analytics/umami";`)
  - a new effect after the `useEffect` that ends `}, [message, verified, urlError]);` (line 59)
  - the redirect in `handleSubmit` (line 167, `router.push(callbackUrl);`)
- Test: `__tests__/app/login-pending-plan.test.tsx`

**Interfaces:**
- Consumes: from Task 2 (`@/lib/plan-document/pending`), `stashPlanFragment(): boolean`, `hasPendingPlan(): boolean` and `PLAN_IMPORT_PATH`.
- Produces: nothing new. After sign-in, the login page sends the coach to `/practice-planner/import` whenever a fresh plan is stashed.

- [ ] **Step 1: Write the failing test**

Create `__tests__/app/login-pending-plan.test.tsx`:

```tsx
/**
 * An "Open in OpenLeague" link (#plan=…) that hits the auth redirect lands on
 * /login with its fragment (Ruling 2). The login page keeps the plan and sends
 * the coach to the import page after sign-in.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: nav.push, refresh: nav.refresh }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-auth/react", () => ({ signIn: vi.fn().mockResolvedValue({ ok: true, error: undefined, status: 200, url: null }) }));
vi.mock("@/lib/actions/account-lifecycle", () => ({ resendVerificationEmail: vi.fn() }));

import LoginPage from "@/app/(auth)/login/page";
import { PENDING_PLAN_KEY, PLAN_IMPORT_PATH } from "@/lib/plan-document/pending";

function logIn() {
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "coach@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "correct-horse-battery" } });
    fireEvent.click(screen.getByRole("button", { name: "Log In" }));
}

beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    window.history.replaceState(null, "", "/login");
});

describe("login with a pending plan", () => {
    it("stashes a #plan= fragment, clears it, and goes to the import page after sign-in", async () => {
        window.history.replaceState(null, "", "/login#plan=abc123");
        render(<LoginPage />);

        await waitFor(() => expect(window.location.hash).toBe(""));
        expect(JSON.parse(sessionStorage.getItem(PENDING_PLAN_KEY) ?? "null")).toMatchObject({ value: "abc123" });

        logIn();
        await waitFor(() => expect(nav.push).toHaveBeenCalledWith(PLAN_IMPORT_PATH));
    });

    it("goes to the callback as before when there is no plan", async () => {
        render(<LoginPage />);
        logIn();
        await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/"));
    });

    it("ignores a stale stash from an abandoned visit", async () => {
        sessionStorage.setItem(PENDING_PLAN_KEY, JSON.stringify({ value: "old", savedAt: Date.now() - 31 * 60_000 }));
        render(<LoginPage />);
        logIn();
        await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/"));
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test __tests__/app/login-pending-plan.test.tsx`
Expected: FAIL. The first case's hash stays `#plan=abc123`. The second and third cases already pass.

- [ ] **Step 3: Write the implementation**

In `app/(auth)/login/page.tsx`, add after `import { trackAuth } from "@/lib/analytics/umami";`:

```tsx
import { hasPendingPlan, PLAN_IMPORT_PATH, stashPlanFragment } from "@/lib/plan-document/pending";
```

Insert after the effect that ends `}, [message, verified, urlError]);`:

```tsx
  // An "Open in OpenLeague" plan link (#plan=…) that reached login: keep the
  // plan for the import page and drop it from the URL (ADR-0020). The auth
  // redirect carries no callbackUrl, so the redirect below picks the target.
  useEffect(() => {
    stashPlanFragment();
  }, []);
```

In `handleSubmit`, replace:

```tsx
      // Redirect to callback URL or dashboard
      router.push(callbackUrl);
```

with:

```tsx
      // A fresh stashed plan wins: the coach came here to import it.
      router.push(hasPendingPlan() ? PLAN_IMPORT_PATH : callbackUrl);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test __tests__/app/login-pending-plan.test.tsx`
Expected: PASS.

Then run `bun run type-check`. Expected: no errors.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add "app/(auth)/login/page.tsx" __tests__/app/login-pending-plan.test.tsx
/usr/bin/git commit -m "$(cat <<'EOF'
feat(auth): keep a practice plan link across login

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX
EOF
)"
```

---

### Task 7: List-page Import button and telemetry fragment scrub

**Files:**
- Modify: `app/(dashboard)/practice-planner/PracticePlannerList.tsx`:
  - imports, after `import ContentCopyIcon from "@mui/icons-material/ContentCopy";` (line 39)
  - props at lines 53–58 and 63–68
  - header actions at lines 135–158
- Modify: `app/(dashboard)/practice-planner/page.tsx`
- Modify: `lib/telemetry/capability-privacy.ts`:
  - patterns after `ENCODED_QUERY_PATTERNS` (around line 104)
  - the list inside `scrubCapabilityTokens`
  - the module header comment
- Test: `__tests__/app/practice-planner-list-import.test.tsx`
- Test: `__tests__/lib/telemetry/capability-privacy.test.ts` (append a `describe`)

**Interfaces:**
- Consumes: from Task 5, `getPlanImportTeams()`.
- Produces: the `PracticePlannerList` prop `canImport: boolean`. `scrubCapabilityTokens` and `scrubTelemetryPayload` now also redact `#plan=` values.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/app/practice-planner-list-import.test.tsx`:

```tsx
/** The practice-planner list offers "Import plan" to anyone who can schedule for at least one team (ADR-0020). */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/actions/practice-session-drills", () => ({ duplicatePracticeSession: vi.fn() }));

import PracticePlannerList from "@/app/(dashboard)/practice-planner/PracticePlannerList";

function renderList(props: { isAdmin: boolean; canImport: boolean }) {
    render(<PracticePlannerList sessions={[]} teamId="cteamxxxxxxxxxxxxxxxxxxxx" teamName="Lions" {...props} />);
}

describe("PracticePlannerList Import plan", () => {
    it("links to the import page when the user can import", () => {
        renderList({ isAdmin: true, canImport: true });
        expect(screen.getByRole("link", { name: /import plan/i })).toHaveAttribute("href", "/practice-planner/import");
    });

    it("shows it to a member of this team who administers another team", () => {
        renderList({ isAdmin: false, canImport: true });
        expect(screen.getByRole("link", { name: /import plan/i })).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /new session/i })).not.toBeInTheDocument();
    });

    it("hides it when the user can't schedule anywhere", () => {
        renderList({ isAdmin: false, canImport: false });
        expect(screen.queryByRole("link", { name: /import plan/i })).not.toBeInTheDocument();
    });
});
```

Append to `__tests__/lib/telemetry/capability-privacy.test.ts`:

```ts
describe('practice plan fragments (ADR-0020)', () => {
  const PLAN = 'eJzLSM3JyQcABiwCFQ_-x';

  it('redacts a #plan= fragment on the import page and on login', () => {
    expect(scrubCapabilityTokens(`https://openleague.app/practice-planner/import#plan=${PLAN}`)).toBe(
      `https://openleague.app/practice-planner/import#plan=${CAPABILITY_TOKEN_REDACTION}`
    );
    expect(scrubCapabilityTokens(`/login#plan=${PLAN}`)).toBe(`/login#plan=${CAPABILITY_TOKEN_REDACTION}`);
  });

  it('redacts a percent-encoded plan fragment nested in another URL', () => {
    expect(scrubCapabilityTokens(`/login?callbackUrl=%2Fpractice-planner%2Fimport%23plan%3D${PLAN}`)).toBe(
      `/login?callbackUrl=%2Fpractice-planner%2Fimport%23plan%3D${CAPABILITY_TOKEN_REDACTION}`
    );
  });

  it('scrubs a Sentry-shaped browser event: request.url and a navigation breadcrumb', () => {
    const event = {
      request: { url: `https://openleague.app/practice-planner/import#plan=${PLAN}` },
      breadcrumbs: [{ category: 'navigation', data: { from: `/login#plan=${PLAN}`, to: '/practice-planner/import' } }],
    };
    scrubTelemetryPayload(event);
    expect(event.request.url).toBe(`https://openleague.app/practice-planner/import#plan=${CAPABILITY_TOKEN_REDACTION}`);
    expect(event.breadcrumbs[0].data.from).toBe(`/login#plan=${CAPABILITY_TOKEN_REDACTION}`);
  });

  it('leaves other fragments alone', () => {
    expect(scrubCapabilityTokens('/docs#planning')).toBe('/docs#planning');
    expect(scrubCapabilityTokens('/practice-planner#plans')).toBe('/practice-planner#plans');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test __tests__/app/practice-planner-list-import.test.tsx __tests__/lib/telemetry/capability-privacy.test.ts`
Expected: FAIL.
- The list test can't find the "Import plan" link. Type-wise, `canImport` is an unknown prop, but Vitest doesn't type-check, so this shows up only as a missing link.
- The plan-fragment strings come back unredacted.

- [ ] **Step 3: Write the implementation**

In `app/(dashboard)/practice-planner/PracticePlannerList.tsx`:

1. Add the import after `import ContentCopyIcon from "@mui/icons-material/ContentCopy";`:

```tsx
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
```

2. In `interface PracticePlannerListProps`, add after `isAdmin: boolean;`:

```tsx
  /** The user can schedule practices for at least one team (getPlanImportTeams). */
  canImport: boolean;
```

3. In the component's destructured props, add `canImport,` after `isAdmin,`. The block at lines 63–68 starts `export default function PracticePlannerList({`.

4. Replace the `PageHeader`'s `actions={ … }` expression (lines 135–158) with:

```tsx
        actions={
          isAdmin || canImport ? (
            <>
              {canImport && (
                <Button
                  component={Link}
                  href="/practice-planner/import"
                  variant="outlined"
                  startIcon={<FileUploadOutlinedIcon />}
                  size={isMobile ? "small" : "medium"}
                >
                  Import plan
                </Button>
              )}
              {isAdmin && (
                <>
                  <Button
                    component={Link}
                    href="/practice-planner/library"
                    variant="outlined"
                    startIcon={<LibraryBooksIcon />}
                    size={isMobile ? "small" : "medium"}
                  >
                    Play Library
                  </Button>
                  <Button
                    component={Link}
                    href="/practice-planner/new"
                    variant="contained"
                    startIcon={<AddIcon />}
                    size={isMobile ? "small" : "medium"}
                  >
                    New Session
                  </Button>
                </>
              )}
            </>
          ) : undefined
        }
```

`PracticePlannerList` is `"use client"`, so `component={Link}` is allowed here.

Replace the body of `app/(dashboard)/practice-planner/page.tsx`'s `PracticePlannerPage` with:

```tsx
export default async function PracticePlannerPage() {
  const [data, importTeams] = await Promise.all([
    getPracticePlannerListData(),
    getPlanImportTeams(),
  ]);

  if (!data) {
    redirect("/dashboard");
  }

  return (
    <PageContainer>
      <PracticePlannerList
        sessions={data.sessions}
        teamId={data.teamId}
        isAdmin={data.isAdmin}
        canImport={importTeams.length > 0}
        teamName={data.teamName}
      />
    </PageContainer>
  );
}
```

Also change its import to `import { getPlanImportTeams, getPracticePlannerListData } from "@/lib/actions/practice-session-queries";`.

In `lib/telemetry/capability-privacy.ts`, add after the `ENCODED_QUERY_PATTERNS` declaration:

```ts
/**
 * `#plan=<data>` (ADR-0020) carries a whole practice plan in a URL fragment.
 * It is coach content, not a credential, but Sentry's browser SDK records
 * `location.href` (fragment included) in request URLs and navigation
 * breadcrumbs, so the value is redacted on the way out. Raw and
 * percent-encoded (a fragment nested in a `callbackUrl`).
 */
const PLAN_FRAGMENT_PATTERNS = [
  /(#plan=)([^&#\s"'`\\]+)/gi,
  /(%23plan%3D)([^&#\s"'`\\%]+)/gi,
];
```

In `scrubCapabilityTokens`, extend the pattern list so it reads:

```ts
  for (const pattern of [
    ...RAW_TOKEN_PATTERNS,
    ...ENCODED_TOKEN_PATTERNS,
    ...RAW_QUERY_PATTERNS,
    ...ENCODED_QUERY_PATTERNS,
    ...PLAN_FRAGMENT_PATTERNS,
  ]) {
```

In the module's header comment, after the paragraph that ends "leaks the credential to a third-party processor.", add:

```ts
 *
 * The same scrub also redacts `#plan=` practice-plan fragments (ADR-0020):
 * not credentials, but user content that must not reach a processor.
 * Analytics needs no change: page views send a bare pathname.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test __tests__/app/practice-planner-list-import.test.tsx __tests__/lib/telemetry/capability-privacy.test.ts`
Expected: PASS.

Then run `bun run type-check`. Expected: no errors. The page now passes `canImport`.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add "app/(dashboard)/practice-planner/PracticePlannerList.tsx" "app/(dashboard)/practice-planner/page.tsx" lib/telemetry/capability-privacy.ts __tests__/app/practice-planner-list-import.test.tsx __tests__/lib/telemetry/capability-privacy.test.ts
/usr/bin/git commit -m "$(cat <<'EOF'
feat(practice-planner): Import plan entry point and plan-fragment telemetry scrub

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX
EOF
)"
```

---

### Task 8: Gates and roadmap status

**Files:**
- Modify: `docs/superpowers/specs/2026-10-03-static-planner-roadmap.md` (the sub-project 1 row in the table)

**Interfaces:**
- Consumes: everything above.
- Produces: a branch that passes every gate.

- [ ] **Step 1: Run the full gates**

Run each command and expect it to be clean:

```bash
bun run type-check
bun run lint
bun run test
bun run build
bun run adr:lint
bun run check:raw-sql
```

The repo memory notes that type-check and tests miss route collisions. `bun run build` must list `/practice-planner/import` as a route beside `/practice-planner/[sessionId]`.

If `bun run test` reports a failure outside the files this plan touched, check `gh run list --branch main --limit 3` before treating it as a regression. Date-rot failures on main are not regressions.

- [ ] **Step 2: Update the roadmap status**

In `docs/superpowers/specs/2026-10-03-static-planner-roadmap.md`, replace the sub-project 1 row's status cell:

```markdown
| 1 | Plan document format, plus hosted export and import (file and fragment link) | Spec `2026-10-03-plan-document-design.md` |
```

with:

```markdown
| 1 | Plan document format, plus hosted export and import (file and fragment link) | Built: spec `2026-10-03-plan-document-design.md`, plan `../plans/2026-10-03-plan-document.md` |
```

- [ ] **Step 3: Write the PR's manual checklist**

These checks go in the PR description. The dev database is behind on migrations, so the executor can't click through a live page.

- **Signed-out link.** Open `/practice-planner/import#plan=<link>` while signed out.
  - `curl -sI <deploy>/practice-planner/import` shows `307` and `location: /login` with no fragment (Ruling 2).
  - In the browser, the address bar briefly reads `/login#plan=…`, then `/login`.
  - After sign-in, the import page shows the plan.
- **Round trip.** Export a hosted session ("Download plan file"), then import that file into another team. The drills, stations, durations and instructions match. The new session's drills are owned copies: editing a diagram does not change the library.
- **Add to library.** Import with "Also add these drills to the team library" checked. The drills appear in the Play Library.
- **Planner link.** With `NEXT_PUBLIC_STATIC_PLANNER_URL` set on a preview deployment, "Copy “Open in planner” link" copies `…#plan=…`. With it unset, the item is absent.
- **Sentry.** With a Sentry DSN on a preview deployment, trigger a client error on `/practice-planner/import` right after opening a link. The event's `request.url` shows `#plan=[redacted]`, or no fragment at all.

- [ ] **Step 4: Commit**

```bash
/usr/bin/git add docs/superpowers/specs/2026-10-03-static-planner-roadmap.md
/usr/bin/git commit -m "$(cat <<'EOF'
docs(practice-planner): mark the plan document sub-project built

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX
EOF
)"
```

---

## Self-Review

**Spec coverage** (spec section → task):

| Spec section | Task |
|---|---|
| Document format and rules | Task 1 |
| Module API: constants, schema, `parsePlan`, `serializePlan`, `planFileName`, `planToEditorSession` | Task 1 |
| `encodePlanLink` / `decodePlanLink` with caps both ways | Task 2 |
| Hosted export: menu, download, flagged link, too-large message, unreadable-diagram notice | Task 4 |
| Hosted import entry (list button, gated on at least one team) | Task 7 |
| Hosted import route and server team query | Task 5 |
| Fragment read and hash clear | Tasks 2 and 5 |
| Surviving login | Tasks 2 and 6, Ruling 2 |
| Preview: header, planned minutes, station groups, thumbnails after mount, problems list | Task 5 |
| Form: team auto-select, date and time required, library checkbox, redirect to edit | Task 5 |
| Errors: per-code messages, "Choose another file", file size refused before parsing | Task 5 |
| Server action: every step and rule | Task 3 |
| Security: telemetry | Task 7, Ruling 11 |
| Testing list | Tasks 1–7 |
| Gates | Task 8 |

**Spec gaps resolved:** Rulings 1–20.

**Consistency.** Names match across tasks:
- `serializePlan(input, generator, now)`, `parsePlan`, `readPlanLink` and `takeIncomingPlan`
- `PLAN_IMPORT_PATH`, `importPracticePlan({ teamId, document, date, addToLibrary })` and `getPlanImportTeams`
- `ExportableSession` and `PlanPreview({ plan })`

**Review Focus:**

| Item | Owning task and test |
|---|---|
| 1 | Task 5, StrictMode test |
| 2 | Task 2 TTL tests and Task 6 "stale stash" |
| 3 | Task 5 error tests and Task 2 garbage and zip-bomb tests |
| 4 | Task 7, Sentry-shaped event test |
| 5 | Task 3, sanitize-failure and zero-drill tests |
