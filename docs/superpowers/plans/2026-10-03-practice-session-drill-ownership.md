# Practice Sessions: Drill Ownership, Inline Editing & Duplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every drill in a practice session a session-owned `Play` copy, so a coach can edit a drill's diagram for one practice, build new drills inside a session, and duplicate a past practice, while library edits and deletes never reach a converted session.

**Architecture:** `Play` gains `sessionId` (owner) and `sourcePlayId` (provenance). One server-only service (`lib/services/practice-session-drills.ts`) runs inside the existing create/update transaction: it keeps drills the session owns, clones library and legacy references into owned copies with `createManyAndReturn`, returns a `clientKey → playId` mapping, and cleans up owned orphans after the session plays are rewritten. A new action file adds `saveSessionDrill`, `copySessionDrillToLibrary`, and `duplicatePracticeSession`. The 1,600-line session editor is first split (no behavior change, under new characterization tests), then gains single-flight autosave, the playId swap, and a full-screen `SessionDrillDialog` that hosts `PlayEditor` with autosave off.

**Tech Stack:** TypeScript (strict), Next.js 16 App Router, React 19, MUI v7 (+ MUI X date pickers), Prisma 7.10 (PostgreSQL via `@prisma/adapter-neon` / `@prisma/adapter-pg`), Zod v4, Vitest 4 + Testing Library (jsdom), Bun.

**Spec:** `docs/superpowers/specs/2026-10-03-practice-session-drill-ownership-design.md`

## Global Constraints

- **Hotfix prerequisite (do this before Task 1, Step 1 checks it).** The hotfix branch `fix/practice-planner-session-bugs` (commit `3201c68`) adds the `notify` flag on `updatePracticeSession`, sequence normalization in `getPracticeSessionForEdit`, `nextPlaySequence` in the editor, and the rink-cache key fix. At planning time (2026-10-03) it is on **neither** `origin/main` nor this branch. If it has landed on `origin/main`, merge `origin/main` into this branch. If it has not, merge the hotfix branch itself (`git merge-tree --write-tree feat/practice-session-ownership fix/practice-planner-session-bugs` merged cleanly at planning time). **Never re-implement** those three fixes. Every code block in this plan is written against the post-hotfix files; line numbers cited as "pre-merge" shift by a few lines after the merge, so locate edits by the quoted anchor text.
- Use `bun` for everything (`bun run test <file>`, `bun run type-check`, `bun run lint`, `bun run build`). Never npm/yarn.
- **Migration is hand-written** (`prisma/migrations/20261003120000_session_owned_plays/migration.sql`). The dev database is ~30 migrations behind: never run `bun run db:migrate`, `db:push`, or `db:migrate:reset` against it. `bun run db:generate` (client generation only) is fine. CI applies migrations with `bun run db:migrate:deploy` against a real Postgres (ADR-0019, proposed).
- The FK being replaced is named `practice_session_plays_playId_fkey` (verified: `prisma/migrations/20251116173235_add_practice_planner_schema/migration.sql:71`, the only migration that touches it).
- `createManyAndReturn` is available: Prisma 7.10.0, PostgreSQL provider, and the generated client exposes `PlayDelegate.createManyAndReturn` (`node_modules/.prisma/client/index.d.ts:74055`). No per-row fallback is needed.
- ADRs (from `bun run adr:explain` on every touched path):
  - **0002** — mutations are Server Actions in `lib/actions/**` returning `ActionResult` (`{ success: true; data } | { success: false; error; details? }`). `lib/services/practice-session-drills.ts` is not an action (no `"use server"`); it is only ever called inside an action's transaction.
  - **0003** — PostgreSQL only through Prisma; no raw SQL in TypeScript (`bun run check:raw-sql`). The migration `.sql` is the only SQL.
  - **0004** — UI is MUI.
  - **0007** — `duplicatePracticeSession` never copies `venueId`, `surfaceId`, `segmentId`, `startAt`, `venueReservationId`, or conflict-override fields, and never creates a reservation or Event. Booking logic in create/update is unchanged.
  - **0005** — Bun toolchain. **0019** (proposed) — type-check, lint, and full suite gate the PR against a migrated database.
  - No decision governs `lib/services/practice-session-drills.ts`.
- Error copy, verbatim:
  - helper rejection: `One or more drills not found or do not belong to this session`
  - `deletePlay` FK race (Prisma `P2003`): `This drill is still used by a session`
  - library delete dialog: `Sessions that use this drill keep their copy.`
  - `updatePlay` on a session-owned play: `This drill belongs to a practice session. Edit it from that session.`
- Instructions limit in the session UI is **2000** (matches `optionalSanitizedString(2000)` on the server).
- Duplicate defaults: date = source date + 7 calendar days (local wall-clock), title `Copy of <title>` truncated to 100 characters, unshared, unbooked.
- Zod v4 (`z.object` strips unknown keys; `.issues`).
- IDs that pass through a Zod schema in tests must satisfy `z.string().cuid()` (start with `c`, at least 9 characters, no `-`), e.g. `csessionxxxxxxxxxxxxxxxxx`.
- Never `component={Link}` from a Server Component (`components/ui/NextLinkComposites.tsx`). All UI touched here is already `"use client"`.
- Commit messages: conventional commits, ending with the line
  `Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX`.
- `bun run type-check` and each task's own Vitest files must be green at the end of every task.

## Spec deviations (decided during planning — fold into the spec in Task 10)

1. **`clientKey` is the existing `PlayInSession.id`.** `PlayInSession` already carries a stable client-side `id` (a session-play id from the server, or `play-<ts>-<rand>` for a new card), so no new field is added. Wrappers send `clientKey: play.id`. The schema requires `clientKey` (1–64 chars) and rejects a payload whose keys are not unique.
2. **Helper shape.** `materializeSessionDrills(tx, { sessionId, teamId, userId, items })` takes `items: { playId, clientKey, sequence }[]` and returns `{ mapping: { clientKey, sequence, playId }[], previousPlayIds: string[] }` (`previousPlayIds` = the play ids this session referenced before the save). Orphan cleanup is a separate export, `deleteOrphanedSessionDrills`, that `updatePracticeSession` calls after the session plays are rewritten (the helper returns before the rewrite, so it cannot do step 5 itself).
3. **Orphan cleanup has a grace window.** It deletes an owned play of S with no session plays only if S referenced it before this save **or** it has not been updated for 15 minutes (`ORPHAN_GRACE_MS`). Without this, a drill that `saveSessionDrill` just created (not yet referenced, because the editor's next autosave hasn't run) could be deleted by an autosave already in flight, and the following save would fail with the rejection error.
4. **Clone order is verified.** `createManyAndReturn` is called with `select: { id, name, sourcePlayId }` and the result is matched to the input by index. PostgreSQL returns `INSERT … RETURNING` rows in `VALUES` order but Prisma does not document it, so the helper checks `name` and `sourcePlayId` at each index and aborts the transaction on a mismatch instead of mis-mapping a drill.
5. **Task 1 is purely structural.** The spec's "SessionDrillCard shows the drill's name" is a behavior change and lands in Task 8, with `PlayInSession.name`. Task 1 also extracts `SessionDrillList.tsx` and `BookingConflictAlert` (in `VenueBookingFields.tsx`) so the editor gets under 900 lines. `useVenueBooking` lives next to the editor in `components/features/practice-planner/` (`lib/hooks/` holds only app-wide hooks). There were **no** `PracticeSessionEditor` tests on this branch (the hotfix adds one), so Task 1 writes characterization tests before extracting.
6. **`PlayInSession` also gains `description?: string`.** The drill dialog needs it; without it, forking a library drill would blank its description.
7. **`updatePlay` rejects session-owned plays** (`sessionId != null`). Otherwise the library edit page (`/practice-planner/library/<id>/edit`) could edit a session's private copy and, via `isTemplate`, break invariant I1.
8. **`getPlaysByTeam` always filters `sessionId: null`**, not only when `isTemplate: true` is passed. No caller lists session copies.
9. **Play-data sanitizing moves to `lib/utils/play-data.ts`** as `sanitizePlayDataForWrite`, so `saveSessionDrill` uses the same write hygiene as `createPlay`/`updatePlay`.
10. **"Also add to library" adds one library copy per dialog opening**, on the first successful save with the box checked, not on every save.
11. **`deletePlay` returns `{ id, retired: boolean }`.**
12. **`lib/services/` already exists**, so the helper goes where the spec says. No location deviation.
13. **Creating a session now redirects to `/practice-planner/<id>/edit`** (was the detail page), as the spec requires for diagram editing.

## Open questions for the product owner (not resolved by this plan)

- **Success criterion vs. no backfill.** "Deleting or editing a library drill never changes … a drill in any session" holds for deletes (retire-on-delete) and for every session saved after this ships. A legacy session that is never re-saved still points at the library row, so **editing** that library drill changes its diagram. Options: accept it (the spec's "two shapes coexist" risk), or have `updatePlay` first fork the old version into each referencing session (copy-on-library-write).
- **Retired plays are never garbage-collected.** Once the last legacy session that referenced a retired play is re-saved, the retired row stays forever (hidden). This plan leaves them.
- **`Copy of …` title length.** The plan truncates to 100 characters (the title max). The alternative is to reject, or to drop the prefix for long titles.

## Review Focus

1. **Autosave racing a save that changes playIds.** An autosave is in flight with library id L for card K; meanwhile the coach saves the drill dialog, which forks owned copy X onto card K. When the autosave returns `K → Y`, card K must keep X, and the follow-up save must send X (Y is cleaned up). Owned by Task 8 (`applySavedPlayIds` keeps a card whose `playId` changed since the save was sent) and Task 9 (editor-level race test with the dialog stubbed).
2. **Legacy sessions referencing library plays (including plays retired after the reference was made).** The first save after deploy must succeed and convert every drill to an owned copy (I2); a session that never referenced a retired play must not be able to adopt it. Owned by Task 4 (helper classification tests) and Task 5 (action-level I2 test).
3. **Retire-on-delete.** Deleting a library drill used by any session must keep it in the session and hide it from the library; deleting an unused one must remove it; a concurrent reference (NO ACTION FK, `P2003`) must give a friendly error, not a 500. Owned by Task 3.
4. **Duplicate copying columns added later** (phase 2b's `runsWithPrevious`). A session-play column added to the schema must be carried by `duplicatePracticeSession` without anyone editing it. Owned by Task 7 (guard test driven by `Prisma.PracticeSessionPlayScalarFieldEnum`).
5. **Orphan cleanup deleting a drill the dialog just created.** An unreferenced owned play updated within the last 15 minutes must survive cleanup; one that this save dropped, or that is stale, must be deleted. Owned by Task 4 (`deleteOrphanedSessionDrills` filter test) and Task 9 (new-drill flow test).

---

### Task 1: Merge the hotfix, pin the editor with characterization tests, then split it

**Files:**
- Merge: `fix/practice-planner-session-bugs` (or `origin/main`)
- Create: `__tests__/components/features/practice-planner/PracticeSessionEditor.characterization.test.tsx`
- Create: `components/features/practice-planner/useVenueBooking.ts`
- Create: `components/features/practice-planner/VenueBookingFields.tsx`
- Create: `components/features/practice-planner/SessionDrillCard.tsx`
- Create: `components/features/practice-planner/SessionDrillList.tsx`
- Modify: `components/features/practice-planner/PracticeSessionEditor.tsx` (post-merge: `PlayCard` at :179-413, booking state :443-461, booking handlers :582-673, `handleSave` :681-789, booking JSX :1120-1296, drill list JSX :1298-1387, conflict alert :1399-1457)

**Interfaces:**
- Consumes: the hotfix's `PracticeSessionSubmitData.notify: boolean`, `handleSave(overrideConflicts?: boolean, notify?: boolean)`, and `export function nextPlaySequence(plays: ReadonlyArray<{ sequence: number }>): number` (all in `PracticeSessionEditor.tsx`).
- Produces (`components/features/practice-planner/useVenueBooking.ts`):
  - moved verbatim: `interface VenueBookingOption`, `interface VenueReservationBookingOption`, `interface PracticeVenueAttachment`, `function extractBookingConflicts(details: unknown): BookingConflict[] | undefined`
  - `interface UseVenueBookingOptions { initialData?: Partial<PracticeVenueAttachment>; venues; reservations; surfacesByVenue; segmentsBySurface; wholeLabelBySurface; onDirty(): void; onReservationSchedule(date: Date, durationMinutes: number): void; clearValidationError(key: string): void }`
  - `function useVenueBooking(options): VenueBooking`, `type VenueBooking = ReturnType<typeof useVenueBooking>`. Returned names match the editor's old locals: `reservationId, venueId, surfaceId, segmentId, startTime, overrideReason, setOverrideReason, bookingConflicts, setBookingConflicts, selectedReservation, selectedVenueTimeZone, venueSurfaces, surfaceSegments, wholeSurfaceLabel, handleVenueChange, handleReservationChange, handleSurfaceChange, handleSegmentChange, handleStartTimeChange, handleClearBooking`, plus `resolveStartAt(date: Date): { ok: true; startAt: Date | null } | { ok: false }` and `attachment(startAt: Date | null): PracticeVenueAttachment`.
- Produces (`VenueBookingFields.tsx`): `VenueBookingFields(props: { booking: VenueBooking; venues; reservations; initialVenueId: string | null | undefined; duration: number; validationErrors: Record<string, string>; disabled: boolean })` and `BookingConflictAlert(props: { booking: VenueBooking; validationErrors: Record<string, string>; clearValidationError(key: string): void; disabled: boolean; onOverride(): void })`.
- Produces (`SessionDrillCard.tsx`): `SessionDrillCard` and `SessionDrillCardProps` (the old `PlayCard`/`PlayCardProps`, unchanged).
- Produces (`SessionDrillList.tsx`): `SessionDrillList(props: SessionDrillListProps)` with `{ plays: PlayInSession[]; duration: number; editingPlayId: string | null; disabled: boolean; onOpenLibrary(): void; onDelete(id: string): void; onEdit(id: string): void; onUpdate(id: string, updates: Partial<PlayInSession>): void; onCancelEdit(): void; onMoveUp(index: number): void; onMoveDown(index: number): void }`.
- `PracticeSessionEditor.tsx` keeps exporting `extractBookingConflicts`, `VenueBookingOption`, `VenueReservationBookingOption`, `PracticeVenueAttachment` (re-exported), so `new/PracticeSessionEditorWrapper.tsx`, `[sessionId]/edit/EditSessionWrapper.tsx`, and `venue-booking-options.ts` are untouched.

- [ ] **Step 1: Check for the hotfix and merge it**

```bash
git fetch origin
git log origin/main --oneline --grep "notify on explicit save only" | head -1
```
If that prints a commit, run `git merge origin/main`. If it prints nothing, run `git merge fix/practice-planner-session-bugs`. Then confirm:

```bash
grep -n "notify: z.boolean().optional().default(false)" lib/utils/validation.ts
grep -n "export function nextPlaySequence" components/features/practice-planner/PracticeSessionEditor.tsx
bun run test __tests__/components/features/practice-planner/PracticeSessionEditor.notify.test.tsx __tests__/lib/actions/practice-session-queries.test.ts __tests__/lib/actions/practice-sessions.test.ts
```
Expected: both greps print one line; tests PASS. If the merge conflicts, stop and report — do not hand-resolve the hotfix's files.

- [ ] **Step 2: Write the characterization tests**

Create `__tests__/components/features/practice-planner/PracticeSessionEditor.characterization.test.tsx`:

```tsx
/**
 * Characterization tests: pin PracticeSessionEditor's behavior before it is
 * split into SessionDrillCard / SessionDrillList / VenueBookingFields /
 * useVenueBooking. They must pass unchanged before and after the split.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import {
    PracticeSessionEditor,
    type PracticeSessionEditorProps,
    type PracticeSessionSaveResult,
    type PracticeSessionSubmitData,
} from "@/components/features/practice-planner/PracticeSessionEditor";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayInSession } from "@/types/practice-planner";

beforeAll(() => {
    global.ResizeObserver = class {
        observe() { /* noop */ }
        unobserve() { /* noop */ }
        disconnect() { /* noop */ }
    } as unknown as typeof ResizeObserver;
});

vi.mock("@/lib/actions/plays", () => ({
    getPlaysByTeam: vi.fn().mockResolvedValue({ success: true, data: { plays: [], total: 0 } }),
    getPlayById: vi.fn(),
    deletePlay: vi.fn(),
    createPlay: vi.fn(),
}));

type SaveFn = (data: PracticeSessionSubmitData) => Promise<PracticeSessionSaveResult>;

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const VENUE = "cvenuexxxxxxxxxxxxxxxxxxx";
const RESERVATION = "cresxxxxxxxxxxxxxxxxxxxxx";
const START = new Date("2026-04-07T22:00:00.000Z");

function drill(id: string, sequence: number, duration = 10): PlayInSession {
    return {
        id,
        playId: `clib${id}xxxxxxxxxxxxxxxxxxxx`,
        sequence,
        duration,
        instructions: `Run ${id}`,
        playData: createEmptyPlayData(),
        thumbnail: "",
    };
}

function renderEditor(
    props: Partial<PracticeSessionEditorProps> = {},
    plays: PlayInSession[] = [],
    onSave = vi.fn<SaveFn>().mockResolvedValue({ success: true }),
) {
    render(
        <ThemeProvider theme={createTheme()}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <PracticeSessionEditor
                    teamId={TEAM}
                    initialData={{ title: "Practice", duration: 60, date: START, plays }}
                    onSave={onSave}
                    {...props}
                />
            </LocalizationProvider>
        </ThemeProvider>,
    );
    return { onSave };
}

async function clickSaveSession() {
    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /^save session/i }));
    });
}

describe("PracticeSessionEditor (characterization)", () => {
    it("shows the empty drill list", () => {
        renderEditor();
        expect(screen.getByText("No plays added yet")).toBeInTheDocument();
    });

    it("renders a card per drill and saves reordered sequences", async () => {
        const { onSave } = renderEditor({}, [drill("a", 0), drill("b", 1)]);
        expect(screen.getByRole("heading", { name: "Play 1" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Play 2" })).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Move play 1 down" }));
        await clickSaveSession();

        const sent = onSave.mock.calls[0][0].plays;
        expect(sent.map((p) => [p.id, p.sequence])).toEqual([["b", 0], ["a", 1]]);
    });

    it("edits a drill's duration and instructions inline", async () => {
        const { onSave } = renderEditor({}, [drill("a", 0), drill("b", 1)]);
        fireEvent.click(screen.getByRole("button", { name: "Edit play 1" }));
        fireEvent.change(screen.getByLabelText("Duration (minutes)"), { target: { value: "25" } });
        fireEvent.change(screen.getByLabelText("Instructions"), { target: { value: "Faster" } });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));

        expect(screen.getByText("Total Play Time: 35 minutes")).toBeInTheDocument();
        await clickSaveSession();
        expect(onSave.mock.calls[0][0].plays[0]).toMatchObject({ duration: 25, instructions: "Faster" });
    });

    it("deletes a drill and renumbers the rest", async () => {
        const { onSave } = renderEditor({}, [drill("a", 0), drill("b", 1)]);
        fireEvent.click(screen.getByRole("button", { name: "Delete play 1" }));
        await clickSaveSession();
        expect(onSave.mock.calls[0][0].plays.map((p) => [p.id, p.sequence])).toEqual([["b", 0]]);
    });

    it("warns when drill time exceeds the session", () => {
        renderEditor({}, [drill("a", 0, 40), drill("b", 1, 30)]);
        expect(screen.getByText(/Total play time \(70 min\) exceeds/)).toBeInTheDocument();
    });

    it("requires a start time once a venue is picked", async () => {
        const { onSave } = renderEditor({
            venues: [{ id: VENUE, name: "Test Rink", timezone: "America/New_York" }],
        });
        fireEvent.mouseDown(screen.getByRole("combobox", { name: /^Venue/ }));
        fireEvent.click(screen.getByRole("option", { name: "Test Rink" }));
        await clickSaveSession();

        expect(screen.getByText("Start time is required when booking a venue")).toBeInTheDocument();
        expect(onSave).not.toHaveBeenCalled();
    });

    it("adopts a confirmed reservation's start and length", async () => {
        const { onSave } = renderEditor({
            reservations: [{
                id: RESERVATION,
                startsAt: "2026-04-08T23:00:00.000Z",
                endsAt: "2026-04-09T00:30:00.000Z",
                timezone: "America/New_York",
                venueId: VENUE,
                venueName: "Test Rink",
                surfaceId: null,
                surfaceName: null,
                segmentId: null,
                segmentName: null,
                ownerType: "team",
            }],
        });
        fireEvent.mouseDown(screen.getByRole("combobox", { name: /Confirmed reservation/ }));
        fireEvent.click(screen.getByRole("option", { name: /Test Rink/ }));
        await clickSaveSession();

        const sent = onSave.mock.calls[0][0];
        expect(sent.reservationId).toBe(RESERVATION);
        expect(sent.duration).toBe(90);
        expect(sent.startAt?.toISOString()).toBe("2026-04-08T23:00:00.000Z");
    });

    it("shows venue conflicts and resubmits with an override reason", async () => {
        const onSave = vi.fn<SaveFn>()
            .mockResolvedValueOnce({
                success: false,
                error: "conflict",
                conflicts: [{
                    source: "venueReservation",
                    title: "Hockey Club",
                    startAt: new Date("2026-04-07T22:00:00.000Z"),
                    endAt: null,
                    surfaceId: null,
                    segmentId: null,
                    segmentName: null,
                }],
            })
            .mockResolvedValue({ success: true });
        renderEditor({}, [], onSave);

        await clickSaveSession();
        expect(screen.getByText(/overlaps 1 existing booking/)).toBeInTheDocument();
        const override = screen.getByRole("button", { name: "Override conflict" });
        expect(override).toBeDisabled();

        fireEvent.change(screen.getByLabelText(/Override reason/), { target: { value: "Coach approved" } });
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Override conflict" }));
        });
        expect(onSave.mock.calls[1][0]).toMatchObject({
            overrideConflicts: true,
            overrideReason: "Coach approved",
            notify: true,
        });
    });
});
```

- [ ] **Step 3: Run the characterization tests against the unsplit editor**

Run: `bun run test __tests__/components/features/practice-planner/PracticeSessionEditor.characterization.test.tsx`
Expected: PASS (they describe today's behavior). If one fails, fix the **test** (selector or expectation), never the editor, and note the fix in the commit body.

- [ ] **Step 4: Create `useVenueBooking.ts`**

Create `components/features/practice-planner/useVenueBooking.ts`. Move these blocks out of `PracticeSessionEditor.tsx` **verbatim** into the marked spot (they keep their JSDoc): `VenueBookingOption` (pre-merge :67-75), `VenueReservationBookingOption` (:77-89), `PracticeVenueAttachment` (:91-101), and `extractBookingConflicts` (:119-145).

```ts
"use client";

/**
 * Optional venue booking for a practice session (feature 006, FR-019):
 * reservation / venue / surface / segment / start-time state, the handlers
 * that keep them consistent, and the conflict-override state.
 * Extracted from PracticeSessionEditor without behavior change.
 */

import { useState, type ChangeEvent } from "react";
import type { BookingConflict } from "@/types/segments";
import {
    formatDateTimeLocalInput,
    parseDateTimeLocalToUtc,
    resolveTimeZone,
} from "@/lib/utils/date";

// ── moved verbatim from PracticeSessionEditor.tsx ──────────────────────────
// VenueBookingOption, VenueReservationBookingOption, PracticeVenueAttachment,
// extractBookingConflicts (keep their `export` keywords and JSDoc).
// ───────────────────────────────────────────────────────────────────────────

export interface UseVenueBookingOptions {
    initialData?: Partial<PracticeVenueAttachment>;
    venues: VenueBookingOption[];
    reservations: VenueReservationBookingOption[];
    surfacesByVenue: Record<string, Array<{ id: string; name: string }>>;
    segmentsBySurface: Record<string, Array<{ id: string; name: string }>>;
    wholeLabelBySurface: Record<string, string>;
    /** Any booking edit: the editor marks the session dirty. */
    onDirty: () => void;
    /** A reservation was picked: the practice adopts its start and length. */
    onReservationSchedule: (date: Date, durationMinutes: number) => void;
    /** Removes one key from the editor's validation errors. */
    clearValidationError: (key: string) => void;
}

export function useVenueBooking({
    initialData,
    venues,
    reservations,
    surfacesByVenue,
    segmentsBySurface,
    wholeLabelBySurface,
    onDirty,
    onReservationSchedule,
    clearValidationError,
}: UseVenueBookingOptions) {
    const [reservationId, setReservationId] = useState(initialData?.reservationId ?? "");
    const [overrideReason, setOverrideReason] = useState("");
    // startTime is a wall-clock HH:MM interpreted in the venue's timezone.
    const [venueId, setVenueId] = useState(initialData?.venueId ?? "");
    const [surfaceId, setSurfaceId] = useState(initialData?.surfaceId ?? "");
    const [segmentId, setSegmentId] = useState(initialData?.segmentId ?? "");
    const [startTime, setStartTime] = useState(() => {
        if (!initialData?.startAt) return "";
        const initialZone = resolveTimeZone(
            venues.find((venue) => venue.id === initialData.venueId)?.timezone
        );
        // formatDateTimeLocalInput returns YYYY-MM-DDTHH:MM — keep the time part.
        return formatDateTimeLocalInput(initialData.startAt, initialZone).slice(11, 16);
    });
    const [bookingConflicts, setBookingConflicts] = useState<BookingConflict[] | null>(null);

    // Timezone the booking start time is entered in (the venue's zone,
    // matching GameForm's wall-clock handling).
    const selectedReservation = reservations.find(
        (reservation) => reservation.id === reservationId,
    );
    const selectedVenueTimeZone = resolveTimeZone(
        selectedReservation?.timezone
        ?? venues.find((venue) => venue.id === venueId)?.timezone
    );

    /**
     * Changing the venue resets surface/segment (they belong to a venue —
     * stale selections would be rejected server-side, matching GameForm).
     */
    const handleVenueChange = (nextVenueId: string) => {
        setReservationId("");
        setVenueId(nextVenueId);
        setSurfaceId("");
        setSegmentId("");
        setBookingConflicts(null);
        onDirty();
    };

    const handleReservationChange = (nextReservationId: string) => {
        setReservationId(nextReservationId);
        setBookingConflicts(null);
        setOverrideReason("");
        onDirty();
        const reservation = reservations.find(
            (option) => option.id === nextReservationId,
        );
        if (!reservation) {
            setVenueId("");
            setSurfaceId("");
            setSegmentId("");
            setStartTime("");
            return;
        }

        const startsAt = new Date(reservation.startsAt);
        const endsAt = new Date(reservation.endsAt);
        onReservationSchedule(
            startsAt,
            Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000),
        );
        setVenueId(reservation.venueId);
        setSurfaceId(reservation.surfaceId ?? "");
        setSegmentId(reservation.segmentId ?? "");
        setStartTime(
            formatDateTimeLocalInput(startsAt, reservation.timezone).slice(11, 16),
        );
    };

    const handleSurfaceChange = (nextSurfaceId: string) => {
        setSurfaceId(nextSurfaceId);
        // Segments belong to a surface — reset on surface change.
        setSegmentId("");
        setBookingConflicts(null);
        onDirty();
    };

    const handleSegmentChange = (nextSegmentId: string) => {
        setSegmentId(nextSegmentId);
        setBookingConflicts(null);
        onDirty();
    };

    const handleStartTimeChange = (event: ChangeEvent<HTMLInputElement>) => {
        setStartTime(event.target.value);
        setBookingConflicts(null);
        onDirty();
        clearValidationError("startTime");
    };

    /**
     * Detach the practice from the venue entirely: on save the practice
     * loses its availability footprint and behaves exactly as before.
     */
    const handleClearBooking = () => {
        setReservationId("");
        setVenueId("");
        setSurfaceId("");
        setSegmentId("");
        setStartTime("");
        setBookingConflicts(null);
        setOverrideReason("");
        onDirty();
        clearValidationError("startTime");
    };

    /**
     * Combine the practice date with the entered wall-clock start time in the
     * venue's timezone. The booking day is derived in the venue's zone — not
     * via browser-local getters — so it doesn't shift across midnight.
     */
    const resolveStartAt = (date: Date): { ok: true; startAt: Date | null } | { ok: false } => {
        if (selectedReservation) {
            return { ok: true, startAt: new Date(selectedReservation.startsAt) };
        }
        if (!venueId) return { ok: true, startAt: null };
        const dateStr = formatDateTimeLocalInput(date, selectedVenueTimeZone).slice(0, 10);
        const startAt = parseDateTimeLocalToUtc(`${dateStr}T${startTime}`, selectedVenueTimeZone);
        return startAt ? { ok: true, startAt } : { ok: false };
    };

    const attachment = (startAt: Date | null): PracticeVenueAttachment => ({
        reservationId: reservationId || null,
        venueId: venueId || null,
        surfaceId: venueId ? surfaceId || null : null,
        segmentId: venueId && surfaceId ? segmentId || null : null,
        startAt,
    });

    // Option lists for the currently selected venue/surface (006).
    const venueSurfaces = venueId ? (surfacesByVenue[venueId] ?? []) : [];
    const surfaceSegments = surfaceId ? (segmentsBySurface[surfaceId] ?? []) : [];
    const wholeSurfaceLabel = (surfaceId && wholeLabelBySurface[surfaceId]) || "Whole surface";

    return {
        reservationId,
        venueId,
        surfaceId,
        segmentId,
        startTime,
        overrideReason,
        setOverrideReason,
        bookingConflicts,
        setBookingConflicts,
        selectedReservation,
        selectedVenueTimeZone,
        venueSurfaces,
        surfaceSegments,
        wholeSurfaceLabel,
        handleVenueChange,
        handleReservationChange,
        handleSurfaceChange,
        handleSegmentChange,
        handleStartTimeChange,
        handleClearBooking,
        resolveStartAt,
        attachment,
    };
}

export type VenueBooking = ReturnType<typeof useVenueBooking>;
```

- [ ] **Step 5: Create `VenueBookingFields.tsx`**

Create `components/features/practice-planner/VenueBookingFields.tsx`:

```tsx
"use client";

import {
    Alert,
    AlertTitle,
    Button,
    MenuItem,
    Paper,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { formatDateTimeInZone } from "@/lib/utils/date";
import type {
    VenueBooking,
    VenueBookingOption,
    VenueReservationBookingOption,
} from "./useVenueBooking";

export interface VenueBookingFieldsProps {
    booking: VenueBooking;
    venues: VenueBookingOption[];
    reservations: VenueReservationBookingOption[];
    /** The saved practice had a legacy (unreserved) venue attachment. */
    initialVenueId: string | null | undefined;
    duration: number;
    validationErrors: Record<string, string>;
    disabled: boolean;
}

/** "Venue reservation" panel (feature 006, FR-019). Renders nothing without options. */
export function VenueBookingFields({
    booking,
    venues,
    reservations,
    initialVenueId,
    duration,
    validationErrors,
    disabled,
}: VenueBookingFieldsProps) {
    const {
        reservationId,
        venueId,
        surfaceId,
        segmentId,
        startTime,
        selectedReservation,
        selectedVenueTimeZone,
        venueSurfaces,
        surfaceSegments,
        wholeSurfaceLabel,
        handleVenueChange,
        handleReservationChange,
        handleSurfaceChange,
        handleSegmentChange,
        handleStartTimeChange,
        handleClearBooking,
    } = booking;

    if (reservations.length === 0 && venues.length === 0) return null;

    return (
        /* MOVED JSX — see Step 5 instructions */
    );
}

export interface BookingConflictAlertProps {
    booking: VenueBooking;
    validationErrors: Record<string, string>;
    clearValidationError: (key: string) => void;
    disabled: boolean;
    onOverride: () => void;
}

/**
 * Venue booking conflicts (FR-019/US5): warn and allow an explicit override
 * that resubmits with overrideConflicts and a required audit reason.
 */
export function BookingConflictAlert({
    booking,
    validationErrors,
    clearValidationError,
    disabled,
    onOverride,
}: BookingConflictAlertProps) {
    const { bookingConflicts, overrideReason, setOverrideReason, selectedVenueTimeZone } = booking;
    if (!bookingConflicts) return null;

    return (
        <Alert
            severity="warning"
            action={
                <Button
                    color="inherit"
                    disabled={disabled || !overrideReason.trim()}
                    onClick={onOverride}
                    sx={{ minHeight: 44 }}
                >
                    Override conflict
                </Button>
            }
        >
            <AlertTitle>
                This time overlaps {bookingConflicts.length} existing booking
                {bookingConflicts.length === 1 ? "" : "s"} at the venue
            </AlertTitle>
            {bookingConflicts.map((conflict, index) => (
                <Typography key={`${conflict.title}-${index}`} variant="body2">
                    {conflict.title} —{" "}
                    {formatDateTimeInZone(conflict.startAt, selectedVenueTimeZone)}
                    {conflict.endAt
                        ? ` – ${formatDateTimeInZone(conflict.endAt, selectedVenueTimeZone)}`
                        : ""}
                </Typography>
            ))}
            <TextField
                label="Override reason"
                value={overrideReason}
                onChange={(event) => {
                    setOverrideReason(event.target.value);
                    clearValidationError("overrideReason");
                }}
                required
                fullWidth
                multiline
                minRows={2}
                error={Boolean(validationErrors.overrideReason)}
                helperText={
                    validationErrors.overrideReason
                    || "Required for the audit trail"
                }
                sx={{ mt: 2, "& .MuiInputBase-root": { minHeight: 44 } }}
            />
        </Alert>
    );
}
```

Then replace the `/* MOVED JSX — see Step 5 instructions */` placeholder line with the editor's booking `<Paper>` element **moved verbatim**: post-merge lines 1121-1295, from `<Paper elevation={2} sx={{ p: 2 }}>` (the one directly after `{(reservations.length > 0 || venues.length > 0) && (`) through its closing `</Paper>`. Make exactly two substitutions inside it:
- `disabled={isSaving || isSharing}` (on the "Clear booking" button) → `disabled={disabled}`
- `Boolean(initialData?.venueId)` → `Boolean(initialVenueId)`

Every other identifier in the moved JSX (`reservationId`, `venueId`, `handleVenueChange`, `validationErrors.startTime`, `duration`, `selectedVenueTimeZone`, …) is already in scope under the same name. Moving rather than retyping ~175 lines keeps the markup byte-identical.

- [ ] **Step 6: Create `SessionDrillCard.tsx`**

Create `components/features/practice-planner/SessionDrillCard.tsx` with this header, then **move** the editor's post-merge lines 179-413 (from `/**\n * Props for the PlayCard component` through the closing `}` of `function PlayCard`) below it. Rename `PlayCardProps` → `SessionDrillCardProps` and `PlayCard` → `SessionDrillCard` (the JSDoc lines too), and add `export` to both. Nothing else changes.

```tsx
"use client";

/**
 * One drill in a practice session: thumbnail, duration, instructions, and the
 * reorder / edit / delete controls. Extracted from PracticeSessionEditor.
 */

import { useState } from "react";
import {
    Box,
    Button,
    Card,
    CardActions,
    CardContent,
    CardMedia,
    Chip,
    IconButton,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import {
    ArrowDownward as ArrowDownwardIcon,
    ArrowUpward as ArrowUpwardIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
} from "@mui/icons-material";
import Image from "next/image";
import { VALIDATION_CONSTRAINTS, type PlayInSession } from "@/types/practice-planner";
```

- [ ] **Step 7: Create `SessionDrillList.tsx`**

Create `components/features/practice-planner/SessionDrillList.tsx` (this is the editor's "Play List Management" `<Paper>`, post-merge :1298-1387, with `calculateTotalPlayTime()` replaced by a local `totalPlayTime`):

```tsx
"use client";

import { Alert, Box, Button, Paper, Stack, Typography } from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";
import type { PlayInSession } from "@/types/practice-planner";
import { SessionDrillCard } from "./SessionDrillCard";

export interface SessionDrillListProps {
    plays: PlayInSession[];
    duration: number;
    editingPlayId: string | null;
    disabled: boolean;
    onOpenLibrary: () => void;
    onDelete: (playId: string) => void;
    onEdit: (playId: string) => void;
    onUpdate: (playId: string, updates: Partial<PlayInSession>) => void;
    onCancelEdit: () => void;
    onMoveUp: (index: number) => void;
    onMoveDown: (index: number) => void;
}

/** Plays in Session: totals, empty state, and one card per drill (Requirements 2.2-2.5). */
export function SessionDrillList({
    plays,
    duration,
    editingPlayId,
    disabled,
    onOpenLibrary,
    onDelete,
    onEdit,
    onUpdate,
    onCancelEdit,
    onMoveUp,
    onMoveDown,
}: SessionDrillListProps) {
    const totalPlayTime = plays.reduce((sum, play) => sum + play.duration, 0);

    return (
        <Paper elevation={2} sx={{ p: 2 }}>
            <Stack spacing={2}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="h6" component="h2">
                        Plays in Session
                    </Typography>
                    <Button
                        variant="outlined"
                        startIcon={<AddIcon />}
                        onClick={onOpenLibrary}
                        disabled={disabled}
                    >
                        Add Play
                    </Button>
                </Stack>

                {plays.length > 0 && (
                    <Box>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="body2" color="text.secondary">
                                Total Play Time: {totalPlayTime} minutes
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Session Duration: {duration} minutes
                            </Typography>
                        </Stack>
                        {totalPlayTime > duration && (
                            <Alert severity="warning" sx={{ mt: 1 }}>
                                Total play time ({totalPlayTime} min) exceeds
                                session duration ({duration} min)
                            </Alert>
                        )}
                    </Box>
                )}

                {plays.length === 0 && (
                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            minHeight: 200,
                            textAlign: "center",
                            p: 3,
                        }}
                    >
                        <Typography variant="h6" color="text.secondary" gutterBottom>
                            No plays added yet
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Add plays from your library to build your practice session
                        </Typography>
                    </Box>
                )}

                {plays.length > 0 && (
                    <Stack spacing={2}>
                        {plays.map((play, index) => (
                            <SessionDrillCard
                                key={play.id}
                                play={play}
                                index={index}
                                totalPlays={plays.length}
                                isEditing={editingPlayId === play.id}
                                onDelete={onDelete}
                                onEdit={onEdit}
                                onUpdate={onUpdate}
                                onCancelEdit={onCancelEdit}
                                onMoveUp={onMoveUp}
                                onMoveDown={onMoveDown}
                            />
                        ))}
                    </Stack>
                )}
            </Stack>
        </Paper>
    );
}
```

- [ ] **Step 8: Rewire `PracticeSessionEditor.tsx`**

1. Replace the import block (everything from `import React, …` to the second `@mui/icons-material` import) with:

```tsx
import React, { useState, useCallback, useEffect, useRef } from "react";
import {
    Box,
    Paper,
    TextField,
    Typography,
    Button,
    CircularProgress,
    Alert,
    Stack,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { Save as SaveIcon, Share as ShareIcon } from "@mui/icons-material";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import {
    PracticeSessionData,
    PlayInSession,
    SavedPlay,
    validateSessionDuration,
    VALIDATION_CONSTRAINTS,
} from "@/types/practice-planner";
import type { BookingConflict } from "@/types/segments";
import { PlayLibrary } from "./PlayLibrary";
import { SessionDrillList } from "./SessionDrillList";
import { BookingConflictAlert, VenueBookingFields } from "./VenueBookingFields";
import {
    useVenueBooking,
    type PracticeVenueAttachment,
    type VenueBookingOption,
    type VenueReservationBookingOption,
} from "./useVenueBooking";

export {
    extractBookingConflicts,
    type PracticeVenueAttachment,
    type VenueBookingOption,
    type VenueReservationBookingOption,
} from "./useVenueBooking";
```

2. Delete the moved declarations (`VenueBookingOption`, `VenueReservationBookingOption`, `PracticeVenueAttachment`, `extractBookingConflicts`, `PlayCardProps`, `PlayCard`).

3. In the component body, delete the booking `useState`s (`reservationId`, `overrideReason`, `venueId`, `surfaceId`, `segmentId`, `startTime`, `bookingConflicts`), `selectedReservation`, `selectedVenueTimeZone`, the six booking handlers (`handleVenueChange` … `handleClearBooking`), `calculateTotalPlayTime`, and the three option-list consts (`venueSurfaces`, `surfaceSegments`, `wholeSurfaceLabel`). Directly after the `handleSaveRef` declaration add:

```tsx
    const markDirty = useCallback(() => {
        setHasUnsavedChanges(true);
        setSaveSuccess(false);
    }, []);

    const clearValidationError = useCallback((key: string) => {
        setValidationErrors((prev) =>
            key in prev
                ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key))
                : prev
        );
    }, []);

    // Optional ice booking (feature 006, FR-019).
    const booking = useVenueBooking({
        initialData,
        venues,
        reservations,
        surfacesByVenue,
        segmentsBySurface,
        wholeLabelBySurface,
        onDirty: markDirty,
        onReservationSchedule: (start, minutes) => {
            setDate(start);
            setDuration(minutes);
        },
        clearValidationError,
    });
```

4. In `validateForm`, use `booking.venueId`, `booking.startTime`, `booking.overrideReason`, and set its deps to `[title, date, duration, booking.venueId, booking.startTime, booking.overrideReason]`.

5. In `handleDateChange` and `handleDurationChange`, change `setBookingConflicts(null);` to `booking.setBookingConflicts(null);`.

6. Replace `handleSave` (post-merge :681-789, the whole `useCallback`) with:

```tsx
    const handleSave = useCallback(async (overrideConflicts: boolean = false, notify: boolean = false) => {
        // Validate form (includes date validation)
        if (!validateForm(overrideConflicts)) {
            setSaveError("Please fix the validation errors");
            return;
        }

        // TypeScript narrowing: after validateForm() passes, date is guaranteed to be non-null
        if (!date) return;

        // The booking instant: the practice date + wall-clock start time in the venue's zone (FR-019).
        const resolvedStart = booking.resolveStartAt(date);
        if (!resolvedStart.ok) {
            setValidationErrors((prev) => ({
                ...prev,
                startTime: "Enter a valid start time",
            }));
            setSaveError("Please fix the validation errors");
            return;
        }

        setIsSaving(true);
        setSaveError(null);
        setSaveSuccess(false);
        booking.setBookingConflicts(null);

        try {
            const sessionData: PracticeSessionSubmitData = {
                id: sessionId,
                title: title.trim(),
                date,
                duration,
                plays,
                isShared,
                ...booking.attachment(resolvedStart.startAt),
                overrideConflicts,
                overrideReason: overrideConflicts ? booking.overrideReason.trim() : "",
                notify,
            };

            const result: PracticeSessionSaveResult = onSave
                ? await onSave(sessionData)
                : { success: true };

            if (!result.success) {
                if (result.conflicts && result.conflicts.length > 0) {
                    // FR-019/US5: warn and let the coach explicitly book anyway.
                    booking.setBookingConflicts(result.conflicts);
                } else {
                    setSaveError(result.error);
                }
                return;
            }

            setHasUnsavedChanges(false);
            setSaveSuccess(true);

            if (successTimeoutRef.current) {
                clearTimeout(successTimeoutRef.current);
            }
            successTimeoutRef.current = setTimeout(() => {
                setSaveSuccess(false);
            }, 3000);
        } catch (error) {
            console.error("Error saving session:", error);
            setSaveError(
                error instanceof Error ? error.message : "Failed to save session"
            );
        } finally {
            setIsSaving(false);
        }
    }, [title, date, duration, plays, isShared, sessionId, booking, onSave, validateForm]);
```

7. Replace every remaining two-line pair `setHasUnsavedChanges(true);` + `setSaveSuccess(false);` in the editor (title, date, duration, delete, update, add-from-library, move up, move down handlers) with `markDirty();`, and add `markDirty` to those `useCallback` dep arrays where the handler is a `useCallback`.

8. JSX: replace the whole `{(reservations.length > 0 || venues.length > 0) && ( … )}` block (post-merge :1120-1296) with

```tsx
            <VenueBookingFields
                booking={booking}
                venues={venues}
                reservations={reservations}
                initialVenueId={initialData?.venueId}
                duration={duration}
                validationErrors={validationErrors}
                disabled={isSaving || isSharing}
            />
```

replace the "Play List Management" `<Paper>` (post-merge :1298-1387, including its two leading comments) with

```tsx
            <SessionDrillList
                plays={plays}
                duration={duration}
                editingPlayId={editingPlayId}
                disabled={isSaving || isSharing}
                onOpenLibrary={handleOpenLibrary}
                onDelete={handleDeletePlay}
                onEdit={handleEditPlay}
                onUpdate={handleUpdatePlayInSession}
                onCancelEdit={handleCancelEdit}
                onMoveUp={handleMovePlayUp}
                onMoveDown={handleMovePlayDown}
            />
```

and replace the conflict block (post-merge :1399-1457, from the `{/* Venue booking conflicts …` comment through the `)}` closing `{bookingConflicts && (`) with

```tsx
                    <BookingConflictAlert
                        booking={booking}
                        validationErrors={validationErrors}
                        clearValidationError={clearValidationError}
                        disabled={isSaving || isSharing}
                        onOverride={() => handleSave(true, true)}
                    />
```

9. In the `DateTimePicker` and the duration `TextField`, `disabled={Boolean(selectedReservation)}` becomes `disabled={Boolean(booking.selectedReservation)}`.

- [ ] **Step 9: Run the editor tests, type-check, lint, and measure**

Run: `bun run test __tests__/components/features/practice-planner/PracticeSessionEditor.characterization.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.notify.test.tsx`
Expected: PASS, with no test edited since Step 3.
Run: `bun run type-check && bun run lint`
Expected: no errors, and no new warnings in the five practice-planner files.
Run: `wc -l components/features/practice-planner/PracticeSessionEditor.tsx`
Expected: under 900. If it is not, also move the share-confirmation `<Dialog>` (the block after `{/* Share Confirmation Dialog */}`) into `components/features/practice-planner/SessionShareDialog.tsx` as `SessionShareDialog({ open, isShared, isSharing, onCancel, onConfirm })` with its JSX moved verbatim (`handleCloseShareDialog` → `onCancel`, `handleShare` → `onConfirm`, `showShareDialog` → `open`), and re-run this step.

- [ ] **Step 10: Commit**

```bash
git add components/features/practice-planner __tests__/components/features/practice-planner/PracticeSessionEditor.characterization.test.tsx
git commit -m "refactor(practice-planner): split session editor into drill list, card, and booking modules

No behavior change; pinned by new characterization tests.

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 2: Schema and hand-written migration for session-owned plays

**Files:**
- Modify: `prisma/schema.prisma` (`PracticeSession` :1588-1631, `PracticeSessionPlay` :1633-1651, `Play` :1654-1675)
- Create: `prisma/migrations/20261003120000_session_owned_plays/migration.sql`

**Interfaces:**
- Produces (Prisma client): `Play.sessionId: string | null`, `Play.session`, `Play.sourcePlayId: string | null`, `Play.sourcePlay`, `Play.copies`, `PracticeSession.ownedPlays`; relation filter `Play.sessions` (session plays) is unchanged; `PracticeSessionPlay.play` is `onDelete: NoAction`.

- [ ] **Step 1: Confirm the FK name to drop**

Run: `grep -rn "practice_session_plays_playId_fkey" prisma/migrations`
Expected: exactly one hit, `prisma/migrations/20251116173235_add_practice_planner_schema/migration.sql:71`.

- [ ] **Step 2: Edit the schema**

In `model PracticeSession`, replace `  plays PracticeSessionPlay[]` with:

```prisma
  plays      PracticeSessionPlay[]
  // Private drill copies this session owns (Play.sessionId). Deleting the
  // session deletes them in the same statement.
  ownedPlays Play[]                @relation("SessionOwnedPlays")
```

In `model PracticeSessionPlay`, replace the two lines

```prisma
  // Cascade delete to preserve session integrity when library play is deleted (Req 4.5)
  play   Play   @relation(fields: [playId], references: [id], onDelete: Cascade)
```

with

```prisma
  // NO ACTION (defense in depth): a play still referenced by a session can't
  // be deleted — deletePlay retires it instead. Deleting the session still
  // works: its session plays and owned plays go in one statement, and NO
  // ACTION is only checked at the end of the statement.
  play   Play   @relation(fields: [playId], references: [id], onDelete: NoAction)
```

In `model Play`, replace `  isTemplate  Boolean  @default(false) // Library plays vs session-specific` with `  isTemplate  Boolean  @default(false) // true = library; false = session-owned (sessionId set) or retired (sessionId null)`, and replace

```prisma
  sessions PracticeSessionPlay[]

  @@index([teamId, isTemplate])
```

with

```prisma
  sessions PracticeSessionPlay[]

  // Owner when this play is a session's private copy (isTemplate = false).
  sessionId    String?
  session      PracticeSession? @relation("SessionOwnedPlays", fields: [sessionId], references: [id], onDelete: Cascade)
  // Library play this copy came from. Provenance only; never followed for rendering.
  sourcePlayId String?
  sourcePlay   Play?            @relation("PlayCopies", fields: [sourcePlayId], references: [id], onDelete: SetNull)
  copies       Play[]           @relation("PlayCopies")

  @@index([teamId, isTemplate])
  @@index([sessionId])
```

- [ ] **Step 3: Write the migration**

Create `prisma/migrations/20261003120000_session_owned_plays/migration.sql`:

```sql
-- Session-owned drill copies (practice planner 3a).
-- Hand-written and additive: the dev database is behind on migrations, so
-- `migrate dev` cannot be used. No data is rewritten; a session converts to
-- owned copies the next time it is saved.

-- AlterTable
ALTER TABLE "plays" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "plays" ADD COLUMN "sourcePlayId" TEXT;

-- CreateIndex
CREATE INDEX "plays_sessionId_idx" ON "plays"("sessionId");

-- AddForeignKey
ALTER TABLE "plays" ADD CONSTRAINT "plays_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "practice_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plays" ADD CONSTRAINT "plays_sourcePlayId_fkey"
  FOREIGN KEY ("sourcePlayId") REFERENCES "plays"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Session plays no longer cascade away when their play is deleted
-- (constraint created in 20251116173235_add_practice_planner_schema).
ALTER TABLE "practice_session_plays" DROP CONSTRAINT "practice_session_plays_playId_fkey";
ALTER TABLE "practice_session_plays" ADD CONSTRAINT "practice_session_plays_playId_fkey"
  FOREIGN KEY ("playId") REFERENCES "plays"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
```

- [ ] **Step 4: Validate, generate, and cross-check against Prisma's own diff**

Run: `bunx prisma validate && bun run db:generate`
Expected: "The schema … is valid" and the client generates.
Run:
```bash
OLD_SCHEMA="$(mktemp).prisma"
git show HEAD:prisma/schema.prisma > "$OLD_SCHEMA"
bunx prisma migrate diff --from-schema "$OLD_SCHEMA" --to-schema prisma/schema.prisma --script
```
Expected: the same statements as the migration (order may differ). In the planning environment this command printed nothing and exited 0; if it does the same here, say so in the commit body and rely on CI's `db:migrate:deploy` (ADR-0019).

- [ ] **Step 5: Type-check and run the practice-planner suites**

Run: `bun run type-check && bun run test __tests__/lib/actions __tests__/components/features/practice-planner`
Expected: PASS (the new columns are optional; no code reads them yet).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261003120000_session_owned_plays
git commit -m "feat(practice-planner): session-owned play columns and no-cascade session plays

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 3: Retire-on-delete, library filters, and owned-play guard

**Files:**
- Modify: `lib/actions/plays.ts` (`updatePlay` :163-250, `deletePlay` :252-325, `getPlaysByTeam` where :455-461)
- Modify: `components/features/practice-planner/PlayLibrary.tsx:836-840` (delete dialog copy)
- Test: `__tests__/lib/actions/plays-delete.test.ts` (create)

**Interfaces:**
- Consumes: Task 2 (`Play.sessionId`, NO ACTION FK).
- Produces: `deletePlay(input): Promise<ActionResult<{ id: string; retired: boolean }>>`; `getPlaysByTeam` never returns plays with `sessionId != null`; `updatePlay` returns `{ success: false, error: "This drill belongs to a practice session. Edit it from that session." }` for owned plays.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/actions/plays-delete.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { mockPrisma, tx } = vi.hoisted(() => {
    const tx = {
        practiceSessionPlay: { count: vi.fn() },
        play: { update: vi.fn(), delete: vi.fn() },
    };
    return {
        tx,
        mockPrisma: {
            $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
            play: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
        },
    };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/session", () => ({
    requireTeamMember: vi.fn().mockResolvedValue("cuserxxxxxxxxxxxxxxxxxxxx"),
    requireTeamAdmin: vi.fn().mockResolvedValue("cuserxxxxxxxxxxxxxxxxxxxx"),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deletePlay, getPlaysByTeam, updatePlay } from "@/lib/actions/plays";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const PLAY = "cplayxxxxxxxxxxxxxxxxxxxx";

beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.play.findUnique.mockResolvedValue({ teamId: TEAM, sessionId: null });
});

describe("deletePlay retires plays that sessions still use", () => {
    it("retires (isTemplate=false) instead of deleting when a session references the play", async () => {
        tx.practiceSessionPlay.count.mockResolvedValue(2);
        const result = await deletePlay({ id: PLAY, teamId: TEAM });

        expect(result).toEqual({ success: true, data: { id: PLAY, retired: true } });
        expect(tx.play.update).toHaveBeenCalledWith({ where: { id: PLAY }, data: { isTemplate: false } });
        expect(tx.play.delete).not.toHaveBeenCalled();
    });

    it("deletes an unreferenced play", async () => {
        tx.practiceSessionPlay.count.mockResolvedValue(0);
        const result = await deletePlay({ id: PLAY, teamId: TEAM });

        expect(result).toEqual({ success: true, data: { id: PLAY, retired: false } });
        expect(tx.play.delete).toHaveBeenCalledWith({ where: { id: PLAY } });
    });

    it("maps a racing reference (FK P2003) to a friendly error", async () => {
        tx.practiceSessionPlay.count.mockResolvedValue(0);
        tx.play.delete.mockRejectedValue(
            new Prisma.PrismaClientKnownRequestError("fk", { code: "P2003", clientVersion: "7.10.0" }),
        );
        const result = await deletePlay({ id: PLAY, teamId: TEAM });
        expect(result).toEqual({ success: false, error: "This drill is still used by a session" });
    });
});

describe("library listing", () => {
    it("never lists session-owned plays", async () => {
        mockPrisma.play.findMany.mockResolvedValue([]);
        mockPrisma.play.count.mockResolvedValue(0);
        await getPlaysByTeam({ teamId: TEAM, isTemplate: true });

        expect(mockPrisma.play.findMany.mock.calls[0][0].where).toMatchObject({
            teamId: TEAM,
            sessionId: null,
            isTemplate: true,
        });
    });
});

describe("updatePlay", () => {
    it("refuses to edit a session's private copy from the library", async () => {
        mockPrisma.play.findUnique.mockResolvedValue({ teamId: TEAM, sessionId: "csessionxxxxxxxxxxxxxxxxx" });
        const result = await updatePlay({ id: PLAY, teamId: TEAM, name: "Drill", playData: createEmptyPlayData() });

        expect(result).toEqual({
            success: false,
            error: "This drill belongs to a practice session. Edit it from that session.",
        });
        expect(mockPrisma.play.update).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/lib/actions/plays-delete.test.ts`
Expected: FAIL (`deletePlay` calls `prisma.play.delete`, there is no `retired`, the where clause has no `sessionId`, `updatePlay` updates the owned play).

- [ ] **Step 3: Implement**

In `lib/actions/plays.ts`:

1. Change `import type { Prisma } from "@prisma/client";` to `import { Prisma } from "@prisma/client";`.

2. In `updatePlay`, change the `existingPlay` select to `select: { teamId: true, sessionId: true },` and, directly after the `if (existingPlay.teamId !== validated.teamId) { … }` block, add:

```ts
        // A session's private copy is edited from its session (SessionDrillDialog),
        // never from the library editor, which would also let it become a template.
        if (existingPlay.sessionId) {
            return {
                success: false,
                error: "This drill belongs to a practice session. Edit it from that session.",
            };
        }
```

3. Replace `deletePlay` (the JSDoc and function, :252-325) with:

```ts
/**
 * Delete a play from the library.
 * Only ADMIN role can delete plays.
 * A play that any practice session still references is retired
 * (isTemplate=false: hidden from the library) instead of deleted, so practice
 * history never loses a drill. PracticeSessionPlay.play is ON DELETE NO
 * ACTION, so a reference that appears between the count and the delete
 * fails the delete (P2003) instead of removing the drill from that session.
 */
export async function deletePlay(
    input: DeletePlayInput
): Promise<ActionResult<{ id: string; retired: boolean }>> {
    try {
        const validated = deletePlaySchema.parse(input);

        const existingPlay = await prisma.play.findUnique({
            where: { id: validated.id },
            select: { teamId: true },
        });

        if (!existingPlay) {
            return {
                success: false,
                error: "Play not found",
            };
        }

        // Authorize against the play's actual teamId, not user-provided input
        await requireTeamAdmin(existingPlay.teamId);

        if (existingPlay.teamId !== validated.teamId) {
            return {
                success: false,
                error: "Unauthorized: Play does not belong to this team",
            };
        }

        const retired = await prisma.$transaction(async (tx) => {
            const references = await tx.practiceSessionPlay.count({
                where: { playId: validated.id },
            });
            if (references > 0) {
                await tx.play.update({
                    where: { id: validated.id },
                    data: { isTemplate: false },
                });
                return true;
            }
            await tx.play.delete({ where: { id: validated.id } });
            return false;
        });

        revalidatePath("/practice-planner");
        revalidatePath("/practice-planner/library");

        return {
            success: true,
            data: { id: validated.id, retired },
        };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return {
                success: false,
                error: "Invalid input",
                details: error.issues,
            };
        }

        if (
            error instanceof Prisma.PrismaClientKnownRequestError
            && error.code === "P2003"
        ) {
            return {
                success: false,
                error: "This drill is still used by a session",
            };
        }

        if (error instanceof Error && error.message.includes("Unauthorized")) {
            return {
                success: false,
                error: error.message,
            };
        }

        console.error("Error deleting play:", error);
        return {
            success: false,
            error: "Failed to delete play. Please try again.",
        };
    }
}
```

4. In `getPlaysByTeam`, change the initial where to:

```ts
        const where: Prisma.PlayWhereInput = {
            teamId: validated.teamId,
            // Session-owned copies never appear in any listing; retired plays
            // are excluded by the isTemplate: true filter the library passes.
            sessionId: null,
        };
```

In `components/features/practice-planner/PlayLibrary.tsx` (:836-840), replace the dialog text with:

```tsx
                    <DialogContentText id="delete-dialog-description">
                        Are you sure you want to delete this play from your library? This
                        action cannot be undone. Sessions that use this drill keep their copy.
                    </DialogContentText>
```

- [ ] **Step 4: Run the tests**

Run: `bun run test __tests__/lib/actions/plays-delete.test.ts __tests__/lib/actions/plays-write.test.ts __tests__/lib/actions/plays-read.test.ts __tests__/components/features/practice-planner/PlayLibrary.test.tsx`
Expected: PASS. Run `bun run type-check` — expected: no errors (`PlayLibrary` reads only `result.success` / `result.error` from `deletePlay`).
Run: `grep -n "remove this play from all" -r components __tests__` — expected: no output.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/plays.ts components/features/practice-planner/PlayLibrary.tsx __tests__/lib/actions/plays-delete.test.ts
git commit -m "feat(practice-planner): retire library drills that sessions use instead of deleting them

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 4: `materializeSessionDrills` and orphan cleanup service

**Files:**
- Create: `lib/services/practice-session-drills.ts`
- Test: `__tests__/lib/services/practice-session-drills.test.ts` (create)

**Interfaces:**
- Consumes: Task 2 columns.
- Produces (`@/lib/services/practice-session-drills`):
  - `SESSION_DRILL_REJECTED_MESSAGE = "One or more drills not found or do not belong to this session"`
  - `class SessionDrillError extends Error` (default message above)
  - `type SessionDrillItem = { playId: string; clientKey: string; sequence: number }`
  - `type SessionDrillMapping = { clientKey: string; sequence: number; playId: string }`
  - `type CloneSource = { id: string; name: string; description: string | null; thumbnail: string | null; playData: Prisma.JsonValue; sourcePlayId: string | null }`
  - `const CLONE_SOURCE_SELECT` (Prisma select for a `CloneSource` plus `isTemplate`, `sessionId`)
  - `const ORPHAN_GRACE_MS = 15 * 60_000`
  - `cloneDrillsIntoSession(tx: Prisma.TransactionClient, input: { sessionId: string; teamId: string; userId: string; sources: CloneSource[] }): Promise<string[]>` (new ids, same order as `sources`)
  - `materializeSessionDrills(tx, input: { sessionId: string; teamId: string; userId: string; items: SessionDrillItem[] }): Promise<{ mapping: SessionDrillMapping[]; previousPlayIds: string[] }>` (mapping in `items` order)
  - `deleteOrphanedSessionDrills(tx, input: { sessionId: string; previousPlayIds: string[]; now?: Date }): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/services/practice-session-drills.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import {
    ORPHAN_GRACE_MS,
    SESSION_DRILL_REJECTED_MESSAGE,
    SessionDrillError,
    deleteOrphanedSessionDrills,
    materializeSessionDrills,
} from "@/lib/services/practice-session-drills";

const SESSION = "s1";
const OTHER_SESSION = "s2";
const TEAM = "t1";
const USER = "u1";

type Row = {
    id: string;
    name: string;
    description: string | null;
    thumbnail: string | null;
    playData: unknown;
    sourcePlayId: string | null;
    isTemplate: boolean;
    sessionId: string | null;
};

function play(id: string, overrides: Partial<Row> = {}): Row {
    return {
        id,
        name: `Drill ${id}`,
        description: null,
        thumbnail: null,
        playData: { players: [{ id: "p" }] },
        sourcePlayId: null,
        isTemplate: true,
        sessionId: null,
        ...overrides,
    };
}

function fakeTx(plays: Row[], referencedPlayIds: string[] = []) {
    let next = 0;
    const mocks = {
        practiceSessionPlay: {
            findMany: vi.fn().mockResolvedValue(referencedPlayIds.map((playId) => ({ playId }))),
        },
        play: {
            // The real query filters by teamId; rows of other teams are simply absent here.
            findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
                plays.filter((p) => where.id.in.includes(p.id))),
            createManyAndReturn: vi.fn(async ({ data }: { data: Array<{ name: string; sourcePlayId: string | null }> }) =>
                data.map((row) => ({ id: `clone-${next++}`, name: row.name, sourcePlayId: row.sourcePlayId }))),
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
    };
    return { mocks, tx: mocks as unknown as Prisma.TransactionClient };
}

function items(...ids: string[]) {
    return ids.map((playId, sequence) => ({ playId, clientKey: `k${sequence}`, sequence }));
}

describe("materializeSessionDrills", () => {
    beforeEach(() => vi.clearAllMocks());

    it("keeps a drill the session already owns", async () => {
        const { mocks, tx } = fakeTx([play("o1", { isTemplate: false, sessionId: SESSION })]);
        const result = await materializeSessionDrills(tx, { sessionId: SESSION, teamId: TEAM, userId: USER, items: items("o1") });

        expect(result.mapping).toEqual([{ clientKey: "k0", sequence: 0, playId: "o1" }]);
        expect(mocks.play.createManyAndReturn).not.toHaveBeenCalled();
    });

    it("clones a library play with provenance, restricted to the team", async () => {
        const { mocks, tx } = fakeTx([play("lib1")]);
        const result = await materializeSessionDrills(tx, { sessionId: SESSION, teamId: TEAM, userId: USER, items: items("lib1") });

        expect(mocks.play.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["lib1"] }, teamId: TEAM });
        expect(result.mapping).toEqual([{ clientKey: "k0", sequence: 0, playId: "clone-0" }]);
        expect(mocks.play.createManyAndReturn.mock.calls[0][0].data).toEqual([{
            name: "Drill lib1",
            description: null,
            thumbnail: null,
            playData: { players: [{ id: "p" }] },
            isTemplate: false,
            teamId: TEAM,
            createdById: USER,
            sessionId: SESSION,
            sourcePlayId: "lib1",
        }]);
    });

    it("clones a second occurrence of an owned drill once, keeping the root provenance", async () => {
        const { mocks, tx } = fakeTx([play("o2", { isTemplate: false, sessionId: SESSION, sourcePlayId: "lib9" })]);
        const result = await materializeSessionDrills(tx, { sessionId: SESSION, teamId: TEAM, userId: USER, items: items("o2", "o2") });

        expect(result.mapping.map((m) => m.playId)).toEqual(["o2", "clone-0"]);
        expect(mocks.play.createManyAndReturn.mock.calls[0][0].data).toHaveLength(1);
        expect(mocks.play.createManyAndReturn.mock.calls[0][0].data[0].sourcePlayId).toBe("lib9");
    });

    it("clones a legacy reference to a play retired after the session used it", async () => {
        const { tx } = fakeTx([play("ret", { isTemplate: false })], ["ret"]);
        const result = await materializeSessionDrills(tx, { sessionId: SESSION, teamId: TEAM, userId: USER, items: items("ret") });

        expect(result.mapping[0].playId).toBe("clone-0");
        expect(result.previousPlayIds).toEqual(["ret"]);
    });

    it("rejects a retired play this session never referenced", async () => {
        const { mocks, tx } = fakeTx([play("ret", { isTemplate: false })]);
        await expect(
            materializeSessionDrills(tx, { sessionId: SESSION, teamId: TEAM, userId: USER, items: items("ret") }),
        ).rejects.toThrow(SESSION_DRILL_REJECTED_MESSAGE);
        expect(mocks.play.createManyAndReturn).not.toHaveBeenCalled();
    });

    it("rejects another session's private copy", async () => {
        const { tx } = fakeTx([play("x", { isTemplate: false, sessionId: OTHER_SESSION })]);
        await expect(
            materializeSessionDrills(tx, { sessionId: SESSION, teamId: TEAM, userId: USER, items: items("x") }),
        ).rejects.toBeInstanceOf(SessionDrillError);
    });

    it("rejects a play of another team or a missing play", async () => {
        const { mocks, tx } = fakeTx([play("lib1")]);
        await expect(
            materializeSessionDrills(tx, { sessionId: SESSION, teamId: TEAM, userId: USER, items: items("lib1", "gone") }),
        ).rejects.toBeInstanceOf(SessionDrillError);
        expect(mocks.play.createManyAndReturn).not.toHaveBeenCalled();
    });

    it("keys the mapping by clientKey in payload order", async () => {
        const { tx } = fakeTx([play("lib1"), play("o1", { isTemplate: false, sessionId: SESSION })]);
        const result = await materializeSessionDrills(tx, {
            sessionId: SESSION,
            teamId: TEAM,
            userId: USER,
            items: [
                { playId: "lib1", clientKey: "first", sequence: 0 },
                { playId: "o1", clientKey: "second", sequence: 1 },
                { playId: "lib1", clientKey: "third", sequence: 2 },
            ],
        });
        expect(result.mapping).toEqual([
            { clientKey: "first", sequence: 0, playId: "clone-0" },
            { clientKey: "second", sequence: 1, playId: "o1" },
            { clientKey: "third", sequence: 2, playId: "clone-1" },
        ]);
    });

    it("aborts instead of mis-mapping when clones come back out of order", async () => {
        const { mocks, tx } = fakeTx([play("a"), play("b")]);
        mocks.play.createManyAndReturn.mockResolvedValueOnce([
            { id: "x", name: "Drill b", sourcePlayId: "b" },
            { id: "y", name: "Drill a", sourcePlayId: "a" },
        ]);
        await expect(
            materializeSessionDrills(tx, { sessionId: SESSION, teamId: TEAM, userId: USER, items: items("a", "b") }),
        ).rejects.toThrow("out of order");
    });

    it("reads nothing but the previous references for an empty payload", async () => {
        const { mocks, tx } = fakeTx([], ["old"]);
        const result = await materializeSessionDrills(tx, { sessionId: SESSION, teamId: TEAM, userId: USER, items: [] });
        expect(result).toEqual({ mapping: [], previousPlayIds: ["old"] });
        expect(mocks.play.findMany).not.toHaveBeenCalled();
    });
});

describe("deleteOrphanedSessionDrills", () => {
    it("deletes unreferenced owned plays this save dropped, or that are stale; keeps fresh ones", async () => {
        const { mocks, tx } = fakeTx([]);
        const now = new Date("2026-10-03T12:00:00.000Z");
        await deleteOrphanedSessionDrills(tx, { sessionId: SESSION, previousPlayIds: ["dropped"], now });

        expect(mocks.play.deleteMany).toHaveBeenCalledWith({
            where: {
                sessionId: SESSION,
                sessions: { none: {} },
                OR: [
                    { id: { in: ["dropped"] } },
                    { updatedAt: { lt: new Date(now.getTime() - ORPHAN_GRACE_MS) } },
                ],
            },
        });
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/lib/services/practice-session-drills.test.ts`
Expected: FAIL — `Cannot find module '@/lib/services/practice-session-drills'`.

- [ ] **Step 3: Implement the service**

Create `lib/services/practice-session-drills.ts`:

```ts
/**
 * Session-owned drill copies (practice planner 3a).
 *
 * Every drill in a saved session is its own Play row (isTemplate=false,
 * sessionId=S, sourcePlayId=provenance). These helpers run INSIDE the calling
 * Server Action's transaction; they are not actions themselves (ADR-0002).
 */
import type { Prisma } from "@prisma/client";

export const SESSION_DRILL_REJECTED_MESSAGE =
    "One or more drills not found or do not belong to this session";

/** A drill in the payload the session may not use. Aborts the whole save. */
export class SessionDrillError extends Error {
    constructor(message = SESSION_DRILL_REJECTED_MESSAGE) {
        super(message);
        this.name = "SessionDrillError";
    }
}

export type SessionDrillItem = { playId: string; clientKey: string; sequence: number };
export type SessionDrillMapping = { clientKey: string; sequence: number; playId: string };

/** What a clone copies. playData is copied raw (it may still be v1; reads upgrade it). */
export type CloneSource = {
    id: string;
    name: string;
    description: string | null;
    thumbnail: string | null;
    playData: Prisma.JsonValue;
    sourcePlayId: string | null;
};

export const CLONE_SOURCE_SELECT = {
    id: true,
    name: true,
    description: true,
    thumbnail: true,
    playData: true,
    sourcePlayId: true,
    isTemplate: true,
    sessionId: true,
} as const;

/**
 * An unreferenced owned play younger than this survives cleanup: the drill
 * dialog may have just created it, and the editor's next save will reference it.
 */
export const ORPHAN_GRACE_MS = 15 * 60_000;

/** A copy's provenance is the library play it ultimately came from. */
function provenanceOf(source: CloneSource): string {
    return source.sourcePlayId ?? source.id;
}

/**
 * Creates one owned copy per source, in one round trip. Returns the new ids
 * in `sources` order.
 */
export async function cloneDrillsIntoSession(
    tx: Prisma.TransactionClient,
    input: { sessionId: string; teamId: string; userId: string; sources: CloneSource[] },
): Promise<string[]> {
    if (input.sources.length === 0) return [];

    const created = await tx.play.createManyAndReturn({
        data: input.sources.map((source) => ({
            name: source.name,
            description: source.description,
            thumbnail: source.thumbnail,
            playData: source.playData as Prisma.InputJsonValue,
            isTemplate: false,
            teamId: input.teamId,
            createdById: input.userId,
            sessionId: input.sessionId,
            sourcePlayId: provenanceOf(source),
        })),
        select: { id: true, name: true, sourcePlayId: true },
    });

    // PostgreSQL returns INSERT … RETURNING rows in VALUES order, but Prisma
    // does not document it: verify, and abort rather than mis-map a drill.
    const inOrder =
        created.length === input.sources.length
        && created.every(
            (row, index) =>
                row.name === input.sources[index].name
                && row.sourcePlayId === provenanceOf(input.sources[index]),
        );
    if (!inOrder) {
        throw new Error("Drill copies came back out of order");
    }
    return created.map((row) => row.id);
}

/**
 * Resolves a save payload to plays session S owns:
 * - owned by S: kept (a second occurrence of the same id is cloned);
 * - a library play, or a legacy play S already references: cloned;
 * - anything else (another session's copy, another team's play, a missing
 *   play, a retired play S never referenced): SessionDrillError.
 *
 * Must run BEFORE the caller deletes S's session plays: it reads them to know
 * the legacy references. Returns the mapping in `items` order and the play
 * ids S referenced before this save (for deleteOrphanedSessionDrills).
 */
export async function materializeSessionDrills(
    tx: Prisma.TransactionClient,
    input: { sessionId: string; teamId: string; userId: string; items: SessionDrillItem[] },
): Promise<{ mapping: SessionDrillMapping[]; previousPlayIds: string[] }> {
    const previous = await tx.practiceSessionPlay.findMany({
        where: { sessionId: input.sessionId },
        select: { playId: true },
    });
    const previousPlayIds = [...new Set(previous.map((row) => row.playId))];
    if (input.items.length === 0) return { mapping: [], previousPlayIds };

    const plays = await tx.play.findMany({
        where: { id: { in: [...new Set(input.items.map((item) => item.playId))] }, teamId: input.teamId },
        select: CLONE_SOURCE_SELECT,
    });
    const byId = new Map(plays.map((play) => [play.id, play]));
    const referenced = new Set(previousPlayIds);
    const kept = new Set<string>();

    // For each item: the owned id it keeps, or the index of its clone source.
    const resolved: Array<{ item: SessionDrillItem; keptId: string } | { item: SessionDrillItem; cloneIndex: number }> = [];
    const sources: CloneSource[] = [];

    for (const item of input.items) {
        const play = byId.get(item.playId);
        if (!play) throw new SessionDrillError();

        if (play.sessionId === input.sessionId && !kept.has(play.id)) {
            kept.add(play.id);
            resolved.push({ item, keptId: play.id });
            continue;
        }

        const ownedHere = play.sessionId === input.sessionId;
        const isLibrary = play.isTemplate && play.sessionId === null;
        const isLegacyReference = play.sessionId === null && referenced.has(play.id);
        if (!ownedHere && !isLibrary && !isLegacyReference) {
            throw new SessionDrillError();
        }

        resolved.push({ item, cloneIndex: sources.length });
        sources.push(play);
    }

    const cloneIds = await cloneDrillsIntoSession(tx, {
        sessionId: input.sessionId,
        teamId: input.teamId,
        userId: input.userId,
        sources,
    });

    const mapping = resolved.map((entry) => ({
        clientKey: entry.item.clientKey,
        sequence: entry.item.sequence,
        playId: "keptId" in entry ? entry.keptId : cloneIds[entry.cloneIndex],
    }));
    return { mapping, previousPlayIds };
}

/**
 * After S's session plays are rewritten: deletes S's owned plays that no
 * session play references, if S referenced them before this save or they
 * have not been touched for ORPHAN_GRACE_MS. Fresh unreferenced copies are
 * kept: the drill dialog may have just created one.
 */
export async function deleteOrphanedSessionDrills(
    tx: Prisma.TransactionClient,
    input: { sessionId: string; previousPlayIds: string[]; now?: Date },
): Promise<void> {
    const cutoff = new Date((input.now ?? new Date()).getTime() - ORPHAN_GRACE_MS);
    await tx.play.deleteMany({
        where: {
            sessionId: input.sessionId,
            sessions: { none: {} },
            OR: [
                { id: { in: input.previousPlayIds } },
                { updatedAt: { lt: cutoff } },
            ],
        },
    });
}
```

- [ ] **Step 4: Run the tests and type-check**

Run: `bun run test __tests__/lib/services/practice-session-drills.test.ts`
Expected: PASS (11 tests).
Run: `bun run type-check`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/services/practice-session-drills.ts __tests__/lib/services/practice-session-drills.test.ts
git commit -m "feat(practice-planner): materialize session drills as owned copies

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 5: Own every drill on create and update

**Files:**
- Modify: `lib/utils/validation.ts` (practice-session play items :1356-1361 and :1370-1375 pre-merge)
- Modify: `lib/actions/practice-sessions.ts` (`createPracticeSession` :436-653, `updatePracticeSession` :660-1031 pre-merge)
- Modify: `app/(dashboard)/practice-planner/new/PracticeSessionEditorWrapper.tsx`, `app/(dashboard)/practice-planner/[sessionId]/edit/EditSessionWrapper.tsx` (send `clientKey`)
- Modify: `__tests__/lib/actions/practice-sessions.test.ts` (mock shape), `__tests__/integration/reservation-writer-matrix.test.ts:557-558` (defaults)
- Test: `__tests__/lib/actions/practice-sessions-ownership.test.ts` (create)

**Interfaces:**
- Consumes: Task 4 (`materializeSessionDrills`, `deleteOrphanedSessionDrills`, `SessionDrillError`, `SessionDrillMapping`).
- Produces:
  - session play items require `clientKey: string` (1–64 chars, unique per payload)
  - `createPracticeSession` / `updatePracticeSession` return `data: { id; title; date; conflictsOverridden; plays: Array<{ clientKey: string; playId: string }> }`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/actions/practice-sessions-ownership.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuth, models, mockPrisma } = vi.hoisted(() => {
    const models = {
        play: { findMany: vi.fn(), createManyAndReturn: vi.fn(), deleteMany: vi.fn() },
        practiceSession: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
        practiceSessionPlay: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
        teamMember: { findFirst: vi.fn() },
        event: { findUnique: vi.fn(), delete: vi.fn() },
    };
    return {
        models,
        mockAuth: {
            requireTeamAdmin: vi.fn(),
            requireTeamMember: vi.fn(),
            requireLeagueRole: vi.fn(),
        },
        mockPrisma: {
            $transaction: vi.fn(async (fn: (tx: typeof models) => unknown) => fn(models)),
            ...models,
        },
    };
});

vi.mock("@/lib/auth/session", () => mockAuth);
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email/templates", () => ({ sendPracticePlanNotifications: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/services/venue-reservations", () => ({
    assignVenueReservation: vi.fn(),
    createVenueReservation: vi.fn(),
    VenueReservationConflictError: class VenueReservationConflictError extends Error {
        conflicts: unknown[] = [];
    },
    VenueReservationLifecycleError: class VenueReservationLifecycleError extends Error {},
}));

import { createPracticeSession, updatePracticeSession } from "@/lib/actions/practice-sessions";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const USER = "cuserxxxxxxxxxxxxxxxxxxxx";
const SESSION = "csessionxxxxxxxxxxxxxxxxx";
const LIB = "clibraryxxxxxxxxxxxxxxxxx";
const OWNED = "cownedxxxxxxxxxxxxxxxxxxx";
const FOREIGN = "cforeignxxxxxxxxxxxxxxxxx";

type Row = { id: string; name: string; isTemplate: boolean; sessionId: string | null; sourcePlayId: string | null };
let rows: Row[] = [];

function input(plays: Array<{ playId: string; clientKey: string }>) {
    return {
        title: "Tuesday",
        date: new Date("2026-04-07T22:00:00.000Z"),
        duration: 60,
        teamId: TEAM,
        plays: plays.map((p, sequence) => ({ ...p, sequence, duration: 10, instructions: "" })),
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    rows = [
        { id: LIB, name: "Library drill", isTemplate: true, sessionId: null, sourcePlayId: null },
        { id: OWNED, name: "Owned drill", isTemplate: false, sessionId: SESSION, sourcePlayId: LIB },
        { id: FOREIGN, name: "Other session", isTemplate: false, sessionId: "cothersessionxxxxxxxxxxxx", sourcePlayId: null },
    ];
    mockAuth.requireTeamAdmin.mockResolvedValue(USER);
    models.teamMember.findFirst.mockResolvedValue({ id: "cmemberxxxxxxxxxxxxxxxxxx" });
    models.practiceSession.create.mockResolvedValue({ id: SESSION, title: "Tuesday", date: new Date() });
    models.practiceSession.findUnique.mockResolvedValue({ id: SESSION, teamId: TEAM, isShared: false, venueReservationId: null });
    models.practiceSession.update.mockResolvedValue({ id: SESSION, title: "Tuesday", date: new Date() });
    models.practiceSessionPlay.findMany.mockResolvedValue([]);
    models.practiceSessionPlay.deleteMany.mockResolvedValue({ count: 0 });
    models.practiceSessionPlay.createMany.mockResolvedValue({ count: 0 });
    models.play.deleteMany.mockResolvedValue({ count: 0 });
    models.play.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
        rows.filter((r) => where.id.in.includes(r.id)).map((r) => ({ ...r, description: null, thumbnail: null, playData: {} })));
    let next = 0;
    models.play.createManyAndReturn.mockImplementation(async ({ data }: { data: Array<{ name: string; sourcePlayId: string }> }) =>
        data.map((d) => ({ id: `cclone${next++}xxxxxxxxxxxxxxxxxx`, name: d.name, sourcePlayId: d.sourcePlayId })));
});

describe("createPracticeSession owns its drills", () => {
    it("clones a library drill and returns the clientKey mapping", async () => {
        const result = await createPracticeSession(input([{ playId: LIB, clientKey: "k1" }]));

        expect(result).toMatchObject({ success: true, data: { plays: [{ clientKey: "k1", playId: "cclone0xxxxxxxxxxxxxxxxxx" }] } });
        expect(models.practiceSessionPlay.createMany.mock.calls[0][0].data).toEqual([
            { sessionId: SESSION, playId: "cclone0xxxxxxxxxxxxxxxxxx", sequence: 0, duration: 10, instructions: null },
        ]);
    });
});

describe("updatePracticeSession owns its drills", () => {
    it("converts a legacy library reference and cleans up after rewriting", async () => {
        models.practiceSessionPlay.findMany.mockResolvedValue([{ playId: LIB }]);
        const result = await updatePracticeSession({ id: SESSION, ...input([{ playId: LIB, clientKey: "k1" }]) });

        expect(result).toMatchObject({ success: true, data: { plays: [{ clientKey: "k1", playId: "cclone0xxxxxxxxxxxxxxxxxx" }] } });
        const created = models.practiceSession.update.mock.calls[0][0].data.plays.create;
        expect(created.map((p: { playId: string }) => p.playId)).toEqual(["cclone0xxxxxxxxxxxxxxxxxx"]);
        expect(models.play.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ sessionId: SESSION, sessions: { none: {} } }),
        }));
        expect(models.play.deleteMany.mock.invocationCallOrder[0])
            .toBeGreaterThan(models.practiceSession.update.mock.invocationCallOrder[0]);
    });

    it("leaves no session play pointing at a library play (I2)", async () => {
        models.practiceSessionPlay.findMany.mockResolvedValue([{ playId: LIB }]);
        await updatePracticeSession({
            id: SESSION,
            ...input([{ playId: OWNED, clientKey: "a" }, { playId: LIB, clientKey: "b" }, { playId: OWNED, clientKey: "c" }]),
        });
        const created: Array<{ playId: string }> = models.practiceSession.update.mock.calls[0][0].data.plays.create;
        const owned = new Set([OWNED, ...(await Promise.all(models.play.createManyAndReturn.mock.results.map((r) => r.value)))
            .flat()
            .map((r: { id: string }) => r.id)]);
        expect(created.every((p) => owned.has(p.playId))).toBe(true);
        expect(created.some((p) => p.playId === LIB)).toBe(false);
    });

    it("keeps an owned drill without cloning", async () => {
        await updatePracticeSession({ id: SESSION, ...input([{ playId: OWNED, clientKey: "k1" }]) });
        expect(models.play.createManyAndReturn).not.toHaveBeenCalled();
    });

    it("rejects another session's copy before touching session plays", async () => {
        const result = await updatePracticeSession({ id: SESSION, ...input([{ playId: FOREIGN, clientKey: "k1" }]) });

        expect(result).toEqual({ success: false, error: "One or more drills not found or do not belong to this session" });
        expect(models.practiceSessionPlay.deleteMany).not.toHaveBeenCalled();
        expect(models.practiceSession.update).not.toHaveBeenCalled();
    });

    it("rejects a payload whose clientKeys repeat", async () => {
        const result = await updatePracticeSession({
            id: SESSION,
            ...input([{ playId: OWNED, clientKey: "same" }, { playId: LIB, clientKey: "same" }]),
        });
        expect(result).toMatchObject({ success: false, error: "Invalid input" });
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/lib/actions/practice-sessions-ownership.test.ts`
Expected: FAIL (no `plays` in `data`; nested create sends `LIB`; no rejection).

- [ ] **Step 3: Require and dedupe `clientKey` in the schemas**

In `lib/utils/validation.ts`, directly after `export const practiceVenueAttachmentSchema = …;` add:

```ts
// One drill in a practice-session save. clientKey is the editor's stable
// per-card key (PlayInSession.id); the save returns clientKey → owned playId.
const practiceSessionPlayItemsSchema = z
  .array(z.object({
    playId: z.string().cuid("Invalid play ID format"),
    clientKey: z.string().min(1, "Drill key is required").max(64, "Drill key is too long"),
    sequence: z.number().int().min(0),
    duration: z.number().int().min(1, "Play duration must be at least 1 minute").max(300, "Play duration must be less than 300 minutes"),
    instructions: optionalSanitizedString(2000),
  }))
  .refine(
    (plays) => new Set(plays.map((play) => play.clientKey)).size === plays.length,
    { message: "Each drill needs a unique key" },
  )
  .optional()
  .default([]);
```

In both `createPracticeSessionSchema` and `updatePracticeSessionSchema`, replace the whole `plays: z.array(z.object({ … })).optional().default([]),` property with `plays: practiceSessionPlayItemsSchema,`.

- [ ] **Step 4: Wire the helper into the actions**

In `lib/actions/practice-sessions.ts`:

1. Add after the `runVenueReservationTransaction` import:

```ts
import {
    SessionDrillError,
    deleteOrphanedSessionDrills,
    materializeSessionDrills,
    type SessionDrillMapping,
} from "@/lib/services/practice-session-drills";
```

and after `normalizePracticeAttachment`:

```ts
/** Drill key and owned play id, returned so the editor can swap ids. */
type SavedDrill = { clientKey: string; playId: string };

function drillItems(plays: Array<{ playId: string; clientKey: string; sequence: number }>) {
    return plays.map(({ playId, clientKey, sequence }) => ({ playId, clientKey, sequence }));
}

function toSavedDrills(mapping: SessionDrillMapping[]): SavedDrill[] {
    return mapping.map(({ clientKey, playId }) => ({ clientKey, playId }));
}
```

2. `createPracticeSession`: change the return type to `Promise<ActionResult<{ id: string; title: string; date: Date; conflictsOverridden: boolean; plays: SavedDrill[] }>>`. Delete the pre-transaction ownership check (pre-merge :464-478, from `const playIds = validated.plays.map(p => p.playId);` through the closing `}` of `if (plays.length !== playIds.length)`); the sequence and duration checks above it stay. In `tx.practiceSession.create`, delete the `plays: validated.plays.length > 0 ? { create: … } : undefined,` property (:571-580). Directly after that `create(...)` call add:

```ts
            // Every drill becomes a copy this session owns (needs the session id).
            const { mapping } = await materializeSessionDrills(tx, {
                sessionId: createdSession.id,
                teamId: validated.teamId,
                userId,
                items: drillItems(validated.plays),
            });
            if (mapping.length > 0) {
                await tx.practiceSessionPlay.createMany({
                    data: validated.plays.map((play, index) => ({
                        sessionId: createdSession.id,
                        playId: mapping[index].playId,
                        sequence: play.sequence,
                        duration: play.duration,
                        instructions: play.instructions
                            ? sanitizeText(play.instructions, 2000)
                            : null,
                    })),
                });
            }
```

and change the transaction's final `return createdSession;` to `return { ...createdSession, plays: toSavedDrills(mapping) };`.

3. `updatePracticeSession`: same return-type change. Delete the pre-transaction ownership check (:744-758, same shape as above). Replace

```ts
            await tx.practiceSessionPlay.deleteMany({
                where: { sessionId: validated.id },
            });
```

with

```ts
            // Before the old session plays are deleted: the helper reads them
            // to recognize legacy references it may clone.
            const { mapping, previousPlayIds } = await materializeSessionDrills(tx, {
                sessionId: validated.id,
                teamId: validated.teamId,
                userId,
                items: drillItems(validated.plays),
            });

            await tx.practiceSessionPlay.deleteMany({
                where: { sessionId: validated.id },
            });
```

In the `tx.practiceSession.update` nested create, change `create: validated.plays.map(play => ({` + `playId: play.playId,` to `create: validated.plays.map((play, index) => ({` + `playId: mapping[index].playId,`. Directly after that `const updated = await tx.practiceSession.update(…);` add:

```ts
            await deleteOrphanedSessionDrills(tx, {
                sessionId: validated.id,
                previousPlayIds,
            });
            const saved = { ...updated, plays: toSavedDrills(mapping) };
```

and change both `return updated;` statements inside the transaction callback to `return saved;`.

4. In both actions' `catch`, before the `"Unauthorized"` branch, add:

```ts
        if (error instanceof SessionDrillError) {
            return {
                success: false,
                error: error.message,
            };
        }
```

- [ ] **Step 5: Send `clientKey` from the wrappers**

In both `app/(dashboard)/practice-planner/new/PracticeSessionEditorWrapper.tsx` and `app/(dashboard)/practice-planner/[sessionId]/edit/EditSessionWrapper.tsx`, change the play mapping to:

```ts
        plays: session.plays.map((play) => ({
          playId: play.playId,
          clientKey: play.id,
          sequence: play.sequence,
          duration: play.duration,
          instructions: play.instructions || "",
        })),
```

- [ ] **Step 6: Update existing mocks**

`__tests__/lib/actions/practice-sessions.test.ts`: in the hoisted `models`, change `play: { findMany: vi.fn() },` to `play: { findMany: vi.fn(), createManyAndReturn: vi.fn(), deleteMany: vi.fn() },` and `practiceSessionPlay: { deleteMany: vi.fn() },` to `practiceSessionPlay: { deleteMany: vi.fn(), findMany: vi.fn(), createMany: vi.fn() },`. At the end of the top-level `beforeEach`, add:

```ts
  mockTx.practiceSessionPlay.findMany.mockResolvedValue([]);
  mockTx.play.findMany.mockResolvedValue([]);
  mockTx.play.deleteMany.mockResolvedValue({ count: 0 });
```

`__tests__/integration/reservation-writer-matrix.test.ts`: after `mockPrisma.play.findMany.mockResolvedValue([]);` (:558) add

```ts
  mockPrisma.practiceSessionPlay.findMany.mockResolvedValue([]);
  mockPrisma.play.deleteMany.mockResolvedValue({ count: 0 });
```

- [ ] **Step 7: Run the tests and type-check**

Run: `bun run test __tests__/lib/actions/practice-sessions-ownership.test.ts __tests__/lib/actions/practice-sessions.test.ts __tests__/integration/reservation-writer-matrix.test.ts __tests__/lib/utils/segment-validation.test.ts`
Expected: PASS.
Run: `bun run type-check && bun run check:raw-sql`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add lib/utils/validation.ts lib/actions/practice-sessions.ts "app/(dashboard)/practice-planner/new/PracticeSessionEditorWrapper.tsx" "app/(dashboard)/practice-planner/[sessionId]/edit/EditSessionWrapper.tsx" __tests__/lib/actions/practice-sessions-ownership.test.ts __tests__/lib/actions/practice-sessions.test.ts __tests__/integration/reservation-writer-matrix.test.ts
git commit -m "feat(practice-planner): sessions own copies of every drill on save

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 6: `saveSessionDrill` and `copySessionDrillToLibrary`

**Files:**
- Modify: `lib/utils/play-data.ts` (add `sanitizePlayDataForWrite`)
- Modify: `lib/actions/plays.ts:32-82` (use it; delete local `sanitizeText`, `sanitizePlayData`)
- Modify: `lib/utils/validation.ts` (new schemas after `sharePracticeSessionSchema`)
- Create: `lib/actions/practice-session-drills.ts`
- Test: `__tests__/lib/actions/practice-session-drills.test.ts` (create), `__tests__/lib/utils/play-data.test.ts` (append)

**Interfaces:**
- Consumes: Task 4 (`SessionDrillError`).
- Produces:
  - `@/lib/utils/play-data`: `sanitizePlayDataForWrite(playData: PlayData): { ok: true; data: PlayData } | { ok: false; issues: z.ZodError["issues"] }`
  - `@/lib/utils/validation`: `saveSessionDrillSchema`, `type SaveSessionDrillInput` (`{ sessionId; teamId; playId?; name; description?; thumbnail?; playData }`), `copySessionDrillToLibrarySchema`, `type CopySessionDrillToLibraryInput` (`{ playId; teamId }`)
  - `@/lib/actions/practice-session-drills` (`"use server"`): `saveSessionDrill(input: SaveSessionDrillInput): Promise<ActionResult<{ playId: string }>>`, `copySessionDrillToLibrary(input: CopySessionDrillToLibraryInput): Promise<ActionResult<{ playId: string }>>`, `type ActionResult<T>`

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/lib/utils/play-data.test.ts`:

```ts
import { sanitizePlayDataForWrite } from "@/lib/utils/play-data";

describe("sanitizePlayDataForWrite", () => {
    it("strips control characters from labels and annotation text", () => {
        const data = {
            ...createEmptyPlayData(),
            annotations: [{ id: "a", text: "Go\u0001", position: { x: 5, y: 5 }, fontSize: 8, color: "#000000" }],
        };
        const result = sanitizePlayDataForWrite(data);
        expect(result.ok && result.data.annotations[0].text).toBe("Go");
    });

    it("rejects data that sanitizes to blank", () => {
        const data = {
            ...createEmptyPlayData(),
            annotations: [{ id: "a", text: "\u0001", position: { x: 5, y: 5 }, fontSize: 8, color: "#000000" }],
        };
        expect(sanitizePlayDataForWrite(data).ok).toBe(false);
    });
});
```

Create `__tests__/lib/actions/practice-session-drills.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuth, tx, mockPrisma } = vi.hoisted(() => {
    const tx = {
        practiceSession: { findUnique: vi.fn(), create: vi.fn() },
        practiceSessionPlay: { findFirst: vi.fn(), createMany: vi.fn() },
        play: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), createManyAndReturn: vi.fn() },
    };
    return {
        tx,
        mockAuth: { requireTeamAdmin: vi.fn() },
        mockPrisma: {
            $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
            ...tx,
        },
    };
});

vi.mock("@/lib/auth/session", () => mockAuth);
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { copySessionDrillToLibrary, saveSessionDrill } from "@/lib/actions/practice-session-drills";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const USER = "cuserxxxxxxxxxxxxxxxxxxxx";
const SESSION = "csessionxxxxxxxxxxxxxxxxx";
const LIB = "clibraryxxxxxxxxxxxxxxxxx";
const OWNED = "cownedxxxxxxxxxxxxxxxxxxx";
const NEW_ID = "cnewplayxxxxxxxxxxxxxxxxx";

function drillInput(playId?: string) {
    return { sessionId: SESSION, teamId: TEAM, playId, name: "Breakout", description: "Quick", playData: createEmptyPlayData() };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.requireTeamAdmin.mockResolvedValue(USER);
    tx.practiceSession.findUnique.mockResolvedValue({ teamId: TEAM });
    tx.play.create.mockResolvedValue({ id: NEW_ID });
    tx.play.update.mockResolvedValue({ id: OWNED });
});

describe("saveSessionDrill", () => {
    it("updates a drill the session owns in place", async () => {
        tx.play.findFirst.mockResolvedValue({ id: OWNED, sessionId: SESSION, isTemplate: false, sourcePlayId: LIB });
        const result = await saveSessionDrill(drillInput(OWNED));

        expect(result).toEqual({ success: true, data: { playId: OWNED } });
        expect(tx.play.update).toHaveBeenCalledWith({
            where: { id: OWNED },
            data: expect.objectContaining({ name: "Breakout", description: "Quick" }),
        });
        expect(tx.play.create).not.toHaveBeenCalled();
    });

    it("forks a library drill into an owned copy with provenance", async () => {
        tx.play.findFirst.mockResolvedValue({ id: LIB, sessionId: null, isTemplate: true, sourcePlayId: null });
        const result = await saveSessionDrill(drillInput(LIB));

        expect(result).toEqual({ success: true, data: { playId: NEW_ID } });
        expect(tx.play.create.mock.calls[0][0].data).toMatchObject({
            isTemplate: false, sessionId: SESSION, teamId: TEAM, createdById: USER, sourcePlayId: LIB,
        });
    });

    it("forks a retired play only when this session references it", async () => {
        tx.play.findFirst.mockResolvedValue({ id: LIB, sessionId: null, isTemplate: false, sourcePlayId: null });
        tx.practiceSessionPlay.findFirst.mockResolvedValue(null);
        const result = await saveSessionDrill(drillInput(LIB));
        expect(result).toEqual({ success: false, error: "One or more drills not found or do not belong to this session" });
        expect(tx.play.create).not.toHaveBeenCalled();
    });

    it("creates a brand-new owned drill without provenance", async () => {
        const result = await saveSessionDrill(drillInput());
        expect(result).toEqual({ success: true, data: { playId: NEW_ID } });
        expect(tx.play.create.mock.calls[0][0].data).toMatchObject({ sessionId: SESSION, sourcePlayId: null, isTemplate: false });
    });

    it("rejects another session's copy", async () => {
        tx.play.findFirst.mockResolvedValue({ id: OWNED, sessionId: "cothersessionxxxxxxxxxxxx", isTemplate: false, sourcePlayId: null });
        const result = await saveSessionDrill(drillInput(OWNED));
        expect(result.success).toBe(false);
    });

    it("rejects a session of another team", async () => {
        tx.practiceSession.findUnique.mockResolvedValue({ teamId: "cotherteamxxxxxxxxxxxxxxx" });
        const result = await saveSessionDrill(drillInput());
        expect(result).toEqual({ success: false, error: "Practice session not found" });
    });

    it("returns validation errors without writing", async () => {
        const result = await saveSessionDrill({ ...drillInput(), name: "" });
        expect(result).toMatchObject({ success: false, error: "Invalid input" });
        expect(tx.play.create).not.toHaveBeenCalled();
    });
});

describe("copySessionDrillToLibrary", () => {
    it("creates a library play from an owned copy", async () => {
        tx.play.findFirst.mockResolvedValue({ name: "Breakout", description: null, thumbnail: null, playData: { v: 1 }, sessionId: SESSION });
        const result = await copySessionDrillToLibrary({ playId: OWNED, teamId: TEAM });

        expect(result).toEqual({ success: true, data: { playId: NEW_ID } });
        expect(tx.play.create.mock.calls[0][0].data).toEqual({
            name: "Breakout", description: null, thumbnail: null, playData: { v: 1 },
            isTemplate: true, teamId: TEAM, createdById: USER,
        });
    });

    it("refuses a play that is not a session copy", async () => {
        tx.play.findFirst.mockResolvedValue({ name: "Lib", description: null, thumbnail: null, playData: {}, sessionId: null });
        const result = await copySessionDrillToLibrary({ playId: LIB, teamId: TEAM });
        expect(result).toEqual({ success: false, error: "Drill not found in this session" });
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/lib/utils/play-data.test.ts __tests__/lib/actions/practice-session-drills.test.ts`
Expected: FAIL — `sanitizePlayDataForWrite` is not exported; `@/lib/actions/practice-session-drills` does not exist.

- [ ] **Step 3: Move play-data sanitizing into `play-data.ts`**

Append to `lib/utils/play-data.ts`:

```ts
/** Write-path text hygiene: strip control characters, trim, truncate. */
function cleanText(text: string | null | undefined, maxLength: number): string {
    if (!text) return "";
    return text
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
        .trim()
        .slice(0, maxLength);
}

/**
 * Sanitizes player labels and annotation text, then re-validates: sanitizing
 * can blank a field the schema checked as non-blank (e.g. "\u0001"), and
 * storing that would leave a play the strict read path rejects.
 */
export function sanitizePlayDataForWrite(
    playData: PlayData,
): { ok: true; data: PlayData } | { ok: false; issues: z.ZodError["issues"] } {
    const sanitized: PlayData = {
        ...playData,
        players: playData.players.map((player) => ({
            ...player,
            label: cleanText(player.label, C.MAX_PLAYER_LABEL_LENGTH),
        })),
        annotations: playData.annotations.map((annotation) => ({
            ...annotation,
            text: cleanText(annotation.text, C.MAX_ANNOTATION_LENGTH),
        })),
    };
    const check = playDataSchema.safeParse(sanitized);
    return check.success ? { ok: true, data: sanitized } : { ok: false, issues: check.error.issues };
}
```

In `lib/actions/plays.ts`, delete `sanitizeText` and `sanitizePlayData` (:32-64), replace the body of `sanitizeAndRevalidate` (:73-82, keep its JSDoc) with

```ts
function sanitizeAndRevalidate(
    playData: PlayData
): { ok: true; data: PlayData } | { ok: false; result: { success: false; error: string; details: unknown } } {
    const result = sanitizePlayDataForWrite(playData);
    if (!result.ok) {
        return { ok: false, result: { success: false, error: "Invalid play data", details: result.issues } };
    }
    return { ok: true, data: result.data };
}
```

change `import { VALIDATION_CONSTRAINTS, type PlayData } from "@/types/practice-planner";` to `import type { PlayData } from "@/types/practice-planner";`, and add `sanitizePlayDataForWrite,` to the `@/lib/utils/play-data` import (drop `playDataSchema` from it if it is now unused).

- [ ] **Step 4: Add the schemas**

In `lib/utils/validation.ts`, after `sharePracticeSessionSchema`, add:

```ts
// A drill's diagram edited inside a session (practice planner 3a).
// playId: the drill being edited (owned → updated in place; library or
// legacy reference → forked); omitted for a brand-new drill.
export const saveSessionDrillSchema = z.object({
  sessionId: z.string().cuid("Invalid session ID format"),
  teamId: z.string().cuid("Invalid team ID format"),
  playId: z.string().cuid("Invalid play ID format").optional(),
  name: sanitizedStringWithMin(1, 100),
  description: optionalSanitizedString(1000),
  thumbnail: base64ImageSchema,
  playData: playDataSchema,
});

export const copySessionDrillToLibrarySchema = z.object({
  playId: z.string().cuid("Invalid play ID format"),
  teamId: z.string().cuid("Invalid team ID format"),
});
```

and after `export type SharePracticeSessionInput …` add:

```ts
export type SaveSessionDrillInput = z.infer<typeof saveSessionDrillSchema>;
export type CopySessionDrillToLibraryInput = z.infer<typeof copySessionDrillToLibrarySchema>;
```

- [ ] **Step 5: Create the action file**

Create `lib/actions/practice-session-drills.ts`:

```ts
"use server";

/**
 * Session-owned drills (practice planner 3a): edit a drill's diagram for one
 * session, add a session drill to the library, duplicate a session.
 * No action here sends email.
 */
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireTeamAdmin } from "@/lib/auth/session";
import {
    copySessionDrillToLibrarySchema,
    saveSessionDrillSchema,
    type CopySessionDrillToLibraryInput,
    type SaveSessionDrillInput,
} from "@/lib/utils/validation";
import { sanitizePlayDataForWrite } from "@/lib/utils/play-data";
import { SessionDrillError } from "@/lib/services/practice-session-drills";

export type ActionResult<T> =
    | { success: true; data: T }
    | { success: false; error: string; details?: unknown };

function failure(error: unknown, fallback: string): { success: false; error: string; details?: unknown } {
    if (error instanceof z.ZodError) {
        const isPlayData = error.issues.some((issue) => issue.path[0] === "playData");
        return { success: false, error: isPlayData ? "Invalid play data" : "Invalid input", details: error.issues };
    }
    if (error instanceof SessionDrillError) {
        return { success: false, error: error.message };
    }
    if (error instanceof Error && error.message.includes("Unauthorized")) {
        return { success: false, error: error.message };
    }
    console.error(fallback, error);
    return { success: false, error: fallback };
}

/**
 * Save a drill's diagram for one session.
 * - playId owned by the session: updated in place.
 * - playId is a library play, or a retired play this session references:
 *   forked into a new owned copy (sourcePlayId = provenance).
 * - no playId: a brand-new owned drill.
 * Does not touch the session's plays: the editor's next session save
 * references the returned id.
 */
export async function saveSessionDrill(
    input: SaveSessionDrillInput,
): Promise<ActionResult<{ playId: string }>> {
    try {
        const validated = saveSessionDrillSchema.parse(input);
        const userId = await requireTeamAdmin(validated.teamId);

        const sanitized = sanitizePlayDataForWrite(validated.playData);
        if (!sanitized.ok) {
            return { success: false, error: "Invalid play data", details: sanitized.issues };
        }
        const fields = {
            name: validated.name,
            description: validated.description || null,
            thumbnail: validated.thumbnail || null,
            playData: sanitized.data as unknown as Prisma.InputJsonValue,
        };

        const playId = await prisma.$transaction(async (tx) => {
            const session = await tx.practiceSession.findUnique({
                where: { id: validated.sessionId },
                select: { teamId: true },
            });
            if (!session || session.teamId !== validated.teamId) {
                throw new SessionDrillError("Practice session not found");
            }

            const ownedCopy = {
                isTemplate: false,
                teamId: validated.teamId,
                createdById: userId,
                sessionId: validated.sessionId,
            };

            if (!validated.playId) {
                const created = await tx.play.create({
                    data: { ...fields, ...ownedCopy, sourcePlayId: null },
                    select: { id: true },
                });
                return created.id;
            }

            const play = await tx.play.findFirst({
                where: { id: validated.playId, teamId: validated.teamId },
                select: { id: true, sessionId: true, isTemplate: true, sourcePlayId: true },
            });
            if (!play) throw new SessionDrillError();

            if (play.sessionId === validated.sessionId) {
                await tx.play.update({ where: { id: play.id }, data: fields });
                return play.id;
            }
            if (play.sessionId !== null) throw new SessionDrillError();
            if (!play.isTemplate) {
                const reference = await tx.practiceSessionPlay.findFirst({
                    where: { sessionId: validated.sessionId, playId: play.id },
                    select: { id: true },
                });
                if (!reference) throw new SessionDrillError();
            }

            const forked = await tx.play.create({
                data: { ...fields, ...ownedCopy, sourcePlayId: play.sourcePlayId ?? play.id },
                select: { id: true },
            });
            return forked.id;
        });

        revalidatePath(`/practice-planner/${validated.sessionId}`);
        return { success: true, data: { playId } };
    } catch (error) {
        return failure(error, "Failed to save drill. Please try again.");
    }
}

/** Add a session's private drill to the team library as a new template. */
export async function copySessionDrillToLibrary(
    input: CopySessionDrillToLibraryInput,
): Promise<ActionResult<{ playId: string }>> {
    try {
        const validated = copySessionDrillToLibrarySchema.parse(input);
        const userId = await requireTeamAdmin(validated.teamId);

        const play = await prisma.play.findFirst({
            where: { id: validated.playId, teamId: validated.teamId },
            select: { name: true, description: true, thumbnail: true, playData: true, sessionId: true },
        });
        if (!play || play.sessionId === null) {
            return { success: false, error: "Drill not found in this session" };
        }

        const created = await prisma.play.create({
            data: {
                name: play.name,
                description: play.description,
                thumbnail: play.thumbnail,
                playData: play.playData as Prisma.InputJsonValue,
                isTemplate: true,
                teamId: validated.teamId,
                createdById: userId,
            },
            select: { id: true },
        });

        revalidatePath("/practice-planner/library");
        return { success: true, data: { playId: created.id } };
    } catch (error) {
        return failure(error, "Failed to add drill to the library. Please try again.");
    }
}
```

- [ ] **Step 6: Run the tests and type-check**

Run: `bun run test __tests__/lib/utils/play-data.test.ts __tests__/lib/actions/practice-session-drills.test.ts __tests__/lib/actions/plays-write.test.ts __tests__/lib/actions/plays-delete.test.ts`
Expected: PASS.
Run: `bun run type-check && bun run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/utils/play-data.ts lib/actions/plays.ts lib/utils/validation.ts lib/actions/practice-session-drills.ts __tests__/lib/utils/play-data.test.ts __tests__/lib/actions/practice-session-drills.test.ts
git commit -m "feat(practice-planner): save a drill's diagram per session and copy it to the library

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 7: `duplicatePracticeSession`

**Files:**
- Modify: `lib/services/practice-session-drills.ts` (add `copySessionPlayScalars`, `duplicateSessionTitle`)
- Modify: `lib/utils/validation.ts` (add `duplicatePracticeSessionSchema`)
- Modify: `lib/actions/practice-session-drills.ts` (add `duplicatePracticeSession`)
- Test: `__tests__/lib/actions/practice-session-drills.test.ts` (append), `__tests__/lib/services/practice-session-drills.test.ts` (append)

**Interfaces:**
- Consumes: Task 4 (`cloneDrillsIntoSession`, `CLONE_SOURCE_SELECT`), Task 6 (action file, `failure`).
- Produces:
  - `@/lib/services/practice-session-drills`: `SESSION_PLAY_FIELDS_NOT_COPIED: ReadonlySet<string>` (`id`, `sessionId`, `playId`, `createdAt`, `updatedAt`), `type CopiedSessionPlayFields`, `copySessionPlayScalars(row: Record<string, unknown>): CopiedSessionPlayFields`, `duplicateSessionTitle(title: string): string`
  - `@/lib/utils/validation`: `duplicatePracticeSessionSchema`, `type DuplicatePracticeSessionInput` (`{ id; teamId; date }`)
  - `duplicatePracticeSession(input: DuplicatePracticeSessionInput): Promise<ActionResult<{ id: string }>>`

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/lib/services/practice-session-drills.test.ts`:

```ts
import { Prisma as PrismaRuntime } from "@prisma/client";
import {
    SESSION_PLAY_FIELDS_NOT_COPIED,
    copySessionPlayScalars,
    duplicateSessionTitle,
} from "@/lib/services/practice-session-drills";

describe("copySessionPlayScalars", () => {
    it("copies every session-play scalar except ids, foreign keys, and timestamps", () => {
        const row: Record<string, unknown> = { play: { id: "relation, not a scalar" } };
        for (const field of Object.values(PrismaRuntime.PracticeSessionPlayScalarFieldEnum)) row[field] = `value-${field}`;

        const copied = copySessionPlayScalars(row) as Record<string, unknown>;
        for (const field of Object.values(PrismaRuntime.PracticeSessionPlayScalarFieldEnum)) {
            if (SESSION_PLAY_FIELDS_NOT_COPIED.has(field)) expect(copied).not.toHaveProperty(field);
            else expect(copied).toHaveProperty(field, `value-${field}`);
        }
        expect(copied).not.toHaveProperty("play");
    });
});

describe("duplicateSessionTitle", () => {
    it("prefixes and keeps the 100-character limit", () => {
        expect(duplicateSessionTitle("Tuesday")).toBe("Copy of Tuesday");
        expect(duplicateSessionTitle("x".repeat(100))).toHaveLength(100);
    });
});
```

Append to `__tests__/lib/actions/practice-session-drills.test.ts` (and add `duplicatePracticeSession` to its import from `@/lib/actions/practice-session-drills`; add `import { Prisma } from "@prisma/client";` at the top):

```ts
describe("duplicatePracticeSession", () => {
    const SOURCE = "csourcexxxxxxxxxxxxxxxxxx";
    const COPY = "ccopyxxxxxxxxxxxxxxxxxxxx";
    const DATE = new Date("2026-04-14T22:00:00.000Z");

    // One source session-play row carrying EVERY scalar column the generated
    // client knows — so a column added later (e.g. runsWithPrevious) is in
    // the fixture automatically and must come out the other side.
    function sourceRow(index: number) {
        const row: Record<string, unknown> = {};
        for (const field of Object.values(Prisma.PracticeSessionPlayScalarFieldEnum)) row[field] = `${field}-${index}`;
        return {
            ...row,
            sequence: index,
            duration: 10 + index,
            instructions: `Do ${index}`,
            play: { id: `cplay${index}xxxxxxxxxxxxxxxxxxx`, name: `Drill ${index}`, description: null, thumbnail: null, playData: {}, sourcePlayId: null },
        };
    }

    beforeEach(() => {
        mockPrisma.practiceSession.findUnique.mockResolvedValue({
            teamId: TEAM, title: "Tuesday", duration: 75, plays: [sourceRow(0), sourceRow(1)],
        });
        tx.practiceSession.create.mockResolvedValue({ id: COPY });
        tx.play.createManyAndReturn.mockImplementation(async ({ data }: { data: Array<{ name: string; sourcePlayId: string }> }) =>
            data.map((d, i) => ({ id: `cclone${i}xxxxxxxxxxxxxxxxxx`, name: d.name, sourcePlayId: d.sourcePlayId })));
        tx.practiceSessionPlay.createMany.mockResolvedValue({ count: 2 });
    });

    it("creates an unshared, unbooked copy on the chosen date", async () => {
        const result = await duplicatePracticeSession({ id: SOURCE, teamId: TEAM, date: DATE });

        expect(result).toEqual({ success: true, data: { id: COPY } });
        const data = tx.practiceSession.create.mock.calls[0][0].data;
        expect(data).toEqual({
            title: "Copy of Tuesday", date: DATE, duration: 75, isShared: false, teamId: TEAM, createdById: USER,
        });
        for (const key of ["venueId", "surfaceId", "segmentId", "startAt", "venueReservationId", "conflictOverriddenById"]) {
            expect(data).not.toHaveProperty(key);
        }
    });

    it("clones every drill into the new session", async () => {
        await duplicatePracticeSession({ id: SOURCE, teamId: TEAM, date: DATE });
        expect(tx.play.createManyAndReturn.mock.calls[0][0].data.map((d: { sessionId: string }) => d.sessionId))
            .toEqual([COPY, COPY]);
    });

    it("copies every session-play column except ids and foreign keys (new-column guard)", async () => {
        await duplicatePracticeSession({ id: SOURCE, teamId: TEAM, date: DATE });
        const copied: Array<Record<string, unknown>> = tx.practiceSessionPlay.createMany.mock.calls[0][0].data;
        const source = sourceRow(0) as Record<string, unknown>;

        expect(copied[0].sessionId).toBe(COPY);
        expect(copied[0].playId).toBe("cclone0xxxxxxxxxxxxxxxxxx");
        for (const field of Object.values(Prisma.PracticeSessionPlayScalarFieldEnum)) {
            if (["id", "createdAt", "updatedAt"].includes(field)) expect(copied[0]).not.toHaveProperty(field);
            else if (field !== "sessionId" && field !== "playId") expect(copied[0][field]).toEqual(source[field]);
        }
    });

    it("refuses a session of another team", async () => {
        mockPrisma.practiceSession.findUnique.mockResolvedValue({ teamId: "cotherteamxxxxxxxxxxxxxxx", title: "x", duration: 60, plays: [] });
        const result = await duplicatePracticeSession({ id: SOURCE, teamId: TEAM, date: DATE });
        expect(result).toEqual({ success: false, error: "Practice session not found" });
        expect(tx.practiceSession.create).not.toHaveBeenCalled();
    });

    it("requires a team admin", async () => {
        mockAuth.requireTeamAdmin.mockRejectedValue(new Error("Unauthorized: Only team admins can perform this action"));
        const result = await duplicatePracticeSession({ id: SOURCE, teamId: TEAM, date: DATE });
        expect(result.success).toBe(false);
        expect(tx.practiceSession.create).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/lib/services/practice-session-drills.test.ts __tests__/lib/actions/practice-session-drills.test.ts`
Expected: FAIL — missing exports.

- [ ] **Step 3: Implement the service pieces**

In `lib/services/practice-session-drills.ts`, change `import type { Prisma } from "@prisma/client";` to `import { Prisma } from "@prisma/client";` and append:

```ts
/** Session-play columns a duplicate never copies: ids, foreign keys, timestamps. */
export const SESSION_PLAY_FIELDS_NOT_COPIED: ReadonlySet<string> = new Set([
    "id",
    "sessionId",
    "playId",
    "createdAt",
    "updatedAt",
]);

export type CopiedSessionPlayFields = Omit<
    Prisma.PracticeSessionPlayCreateManyInput,
    "id" | "sessionId" | "playId" | "createdAt" | "updatedAt"
>;

/**
 * Copies every PracticeSessionPlay scalar column except ids, foreign keys and
 * timestamps. Driven by the generated scalar-field enum, so a column added
 * later (e.g. phase 2b's runsWithPrevious) is carried without editing this.
 */
export function copySessionPlayScalars(row: Record<string, unknown>): CopiedSessionPlayFields {
    const copy: Record<string, unknown> = {};
    for (const field of Object.values(Prisma.PracticeSessionPlayScalarFieldEnum)) {
        if (!SESSION_PLAY_FIELDS_NOT_COPIED.has(field)) copy[field] = row[field];
    }
    return copy as CopiedSessionPlayFields;
}

/** "Copy of <title>", kept within the 100-character title limit. */
export function duplicateSessionTitle(title: string): string {
    return `Copy of ${title}`.slice(0, 100);
}
```

- [ ] **Step 4: Add the schema**

In `lib/utils/validation.ts`, after `copySessionDrillToLibrarySchema`, add:

```ts
export const duplicatePracticeSessionSchema = z.object({
  id: z.string().cuid("Invalid session ID format"),
  teamId: z.string().cuid("Invalid team ID format"),
  date: z.coerce.date({ message: "Valid date is required" }),
});
```

and after `CopySessionDrillToLibraryInput`: `export type DuplicatePracticeSessionInput = z.input<typeof duplicatePracticeSessionSchema>;`

- [ ] **Step 5: Implement the action**

In `lib/actions/practice-session-drills.ts`, extend the imports:

```ts
import {
    CLONE_SOURCE_SELECT,
    SessionDrillError,
    cloneDrillsIntoSession,
    copySessionPlayScalars,
    duplicateSessionTitle,
} from "@/lib/services/practice-session-drills";
```

(add `duplicatePracticeSessionSchema` and `type DuplicatePracticeSessionInput` to the validation import) and append:

```ts
/**
 * Duplicate a session onto a new date: same duration and drills (each cloned
 * into the new session), same per-drill duration/instructions and every other
 * session-play column. Unshared, and never booked: no venue, surface,
 * segment, start time, reservation, or Event (ADR-0007).
 */
export async function duplicatePracticeSession(
    input: DuplicatePracticeSessionInput,
): Promise<ActionResult<{ id: string }>> {
    try {
        const validated = duplicatePracticeSessionSchema.parse(input);
        const userId = await requireTeamAdmin(validated.teamId);

        const source = await prisma.practiceSession.findUnique({
            where: { id: validated.id },
            select: {
                teamId: true,
                title: true,
                duration: true,
                plays: {
                    orderBy: { sequence: "asc" },
                    include: { play: { select: CLONE_SOURCE_SELECT } },
                },
            },
        });
        if (!source || source.teamId !== validated.teamId) {
            return { success: false, error: "Practice session not found" };
        }

        const created = await prisma.$transaction(async (tx) => {
            const session = await tx.practiceSession.create({
                data: {
                    title: duplicateSessionTitle(source.title),
                    date: validated.date,
                    duration: source.duration,
                    isShared: false,
                    teamId: validated.teamId,
                    createdById: userId,
                },
                select: { id: true },
            });

            const playIds = await cloneDrillsIntoSession(tx, {
                sessionId: session.id,
                teamId: validated.teamId,
                userId,
                sources: source.plays.map((row) => row.play),
            });
            if (source.plays.length > 0) {
                await tx.practiceSessionPlay.createMany({
                    data: source.plays.map((row, index) => ({
                        ...copySessionPlayScalars(row),
                        sessionId: session.id,
                        playId: playIds[index],
                    })),
                });
            }
            return session;
        });

        revalidatePath("/practice-planner");
        return { success: true, data: { id: created.id } };
    } catch (error) {
        return failure(error, "Failed to duplicate practice session. Please try again.");
    }
}
```

- [ ] **Step 6: Run the tests and type-check**

Run: `bun run test __tests__/lib/services/practice-session-drills.test.ts __tests__/lib/actions/practice-session-drills.test.ts`
Expected: PASS.
Run: `bun run type-check`
Expected: no errors. (If `copySessionPlayScalars(row)` does not accept the Prisma row type, pass `row as Record<string, unknown>`.)

- [ ] **Step 7: Commit**

```bash
git add lib/services/practice-session-drills.ts lib/utils/validation.ts lib/actions/practice-session-drills.ts __tests__/lib/services/practice-session-drills.test.ts __tests__/lib/actions/practice-session-drills.test.ts
git commit -m "feat(practice-planner): duplicate a practice session onto a new date

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 8: Editor — drill names, 2000-char instructions, playId swap, single-flight autosave

**Files:**
- Modify: `types/practice-planner.ts:110-118` (`PlayInSession`)
- Modify: `lib/actions/practice-session-queries.ts` (`getPracticeSessionForEdit` :201-278)
- Create: `lib/utils/session-drill-ids.ts`
- Modify: `components/features/practice-planner/PracticeSessionEditor.tsx`, `SessionDrillCard.tsx`
- Modify: `app/(dashboard)/practice-planner/[sessionId]/edit/EditSessionWrapper.tsx`, `app/(dashboard)/practice-planner/new/PracticeSessionEditorWrapper.tsx`
- Test: `__tests__/lib/utils/session-drill-ids.test.ts` (create), `__tests__/components/features/practice-planner/PracticeSessionEditor.drill-ids.test.tsx` (create), `__tests__/components/features/practice-planner/PracticeSessionEditor.characterization.test.tsx`, `__tests__/lib/actions/practice-session-queries.test.ts`, `__tests__/types/practice-planner.test.ts`

**Interfaces:**
- Consumes: Task 5 (`data.plays: { clientKey; playId }[]` from both actions).
- Produces:
  - `PlayInSession` gains `name: string` and `description?: string`.
  - `getPracticeSessionForEdit` plays gain `name: string; description: string`.
  - `@/lib/utils/session-drill-ids`: `type SavedDrillId = { clientKey: string; playId: string }`; `applySavedPlayIds(plays: PlayInSession[], sentPlayIds: ReadonlyMap<string, string>, saved: readonly SavedDrillId[] | undefined): PlayInSession[]`; `type SessionDrillPatch = { playId: string; name: string; description: string; thumbnail: string; playData: PlayData }`; `upsertSessionDrill(plays: PlayInSession[], clientKey: string, patch: SessionDrillPatch): PlayInSession[]`
  - `PracticeSessionSaveResult` success variant: `{ success: true; plays?: SavedDrillId[] }`
  - Editor: `markDirty()` bumps an edit version; saves are single-flight.

- [ ] **Step 1: Write the failing pure tests**

Create `__tests__/lib/utils/session-drill-ids.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applySavedPlayIds, upsertSessionDrill } from "@/lib/utils/session-drill-ids";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayInSession } from "@/types/practice-planner";

function card(id: string, playId: string, sequence = 0): PlayInSession {
    return { id, playId, name: id, sequence, duration: 10, instructions: "", playData: createEmptyPlayData(), thumbnail: "" };
}

describe("applySavedPlayIds", () => {
    it("swaps each card's playId for the owned id the save returned", () => {
        const plays = [card("k1", "lib"), card("k2", "owned")];
        const sent = new Map([["k1", "lib"], ["k2", "owned"]]);
        const next = applySavedPlayIds(plays, sent, [{ clientKey: "k1", playId: "copy" }, { clientKey: "k2", playId: "owned" }]);
        expect(next.map((p) => p.playId)).toEqual(["copy", "owned"]);
    });

    it("keeps a card whose playId changed while the save was in flight", () => {
        const plays = [card("k1", "forked-by-dialog")];
        const sent = new Map([["k1", "lib"]]);
        const next = applySavedPlayIds(plays, sent, [{ clientKey: "k1", playId: "autosave-copy" }]);
        expect(next[0].playId).toBe("forked-by-dialog");
    });

    it("ignores unknown clientKeys and a missing mapping", () => {
        const plays = [card("k1", "lib")];
        expect(applySavedPlayIds(plays, new Map([["k1", "lib"]]), [{ clientKey: "zz", playId: "x" }])).toEqual(plays);
        expect(applySavedPlayIds(plays, new Map(), undefined)).toBe(plays);
    });
});

describe("upsertSessionDrill", () => {
    const patch = { playId: "new", name: "Breakout", description: "d", thumbnail: "t", playData: createEmptyPlayData() };

    it("updates the matching card's drill fields, keeping duration and instructions", () => {
        const plays = [{ ...card("k1", "lib"), duration: 12, instructions: "Hard" }];
        const next = upsertSessionDrill(plays, "k1", patch);
        expect(next[0]).toMatchObject({ playId: "new", name: "Breakout", duration: 12, instructions: "Hard" });
    });

    it("appends a new card at max sequence + 1", () => {
        const next = upsertSessionDrill([card("a", "x", 0), card("b", "y", 2)], "k9", patch);
        expect(next[2]).toMatchObject({ id: "k9", playId: "new", sequence: 3, duration: 10, instructions: "" });
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/lib/utils/session-drill-ids.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Extend `PlayInSession` and implement the pure helpers**

In `types/practice-planner.ts`, replace the `PlayInSession` interface with:

```ts
export interface PlayInSession {
    /** Stable client-side key for this card; sent to the server as clientKey. */
    id: string;
    playId: string;
    /** Drill name (the session's own copy once saved). */
    name: string;
    description?: string;
    sequence: number;
    duration: number; // minutes
    instructions: string;
    playData: PlayData;
    thumbnail?: string; // base64 PNG thumbnail
}
```

Create `lib/utils/session-drill-ids.ts`:

```ts
/**
 * Pure helpers for the session editor's drill cards (practice planner 3a).
 * A card's `id` is its clientKey; `playId` is the Play row it shows.
 */
import type { PlayData, PlayInSession } from "@/types/practice-planner";

export type SavedDrillId = { clientKey: string; playId: string };

export type SessionDrillPatch = {
    playId: string;
    name: string;
    description: string;
    thumbnail: string;
    playData: PlayData;
};

/**
 * Applies a save's clientKey → owned playId mapping. A card is only swapped
 * if its playId is still the one that save sent: if the drill dialog forked a
 * new copy onto it while the save was in flight, the newer id wins (the next
 * save sends it, and cleanup removes the copy this save made).
 */
export function applySavedPlayIds(
    plays: PlayInSession[],
    sentPlayIds: ReadonlyMap<string, string>,
    saved: readonly SavedDrillId[] | undefined,
): PlayInSession[] {
    if (!saved || saved.length === 0) return plays;
    const byKey = new Map(saved.map((entry) => [entry.clientKey, entry.playId]));
    let changed = false;
    const next = plays.map((play) => {
        const ownedId = byKey.get(play.id);
        if (!ownedId || ownedId === play.playId || sentPlayIds.get(play.id) !== play.playId) return play;
        changed = true;
        return { ...play, playId: ownedId };
    });
    return changed ? next : plays;
}

/** Updates the card's drill after a dialog save, or appends a new drill card. */
export function upsertSessionDrill(
    plays: PlayInSession[],
    clientKey: string,
    patch: SessionDrillPatch,
): PlayInSession[] {
    if (plays.some((play) => play.id === clientKey)) {
        return plays.map((play) => (play.id === clientKey ? { ...play, ...patch } : play));
    }
    const sequence = plays.reduce((max, play) => Math.max(max, play.sequence), -1) + 1;
    return [...plays, { id: clientKey, ...patch, sequence, duration: 10, instructions: "" }];
}
```

Run `bun run test __tests__/lib/utils/session-drill-ids.test.ts` — expected: PASS.

- [ ] **Step 4: Fix the fixtures and the query that the new required `name` breaks**

Run:
```bash
perl -0pi -e 's/^(\s*)playId: ("[^"]+"),\n/$1playId: $2,\n$1name: "Drill",\n/mg' __tests__/types/practice-planner.test.ts
```
In `__tests__/components/features/practice-planner/PracticeSessionEditor.characterization.test.tsx`, add `name: \`Drill ${id}\`,` to the object `drill()` returns, and change the two heading expectations to `{ name: "Drill a" }` and `{ name: "Drill b" }`.

In `lib/actions/practice-session-queries.ts` (`getPracticeSessionForEdit`), add `name: string;` and `description: string;` to the plays item type, and in the mapping add `name: sp.play.name,` and `description: sp.play.description ?? "",` after `playId: sp.play.id,`. Append to `__tests__/lib/actions/practice-session-queries.test.ts` inside its `describe`:

```ts
  it("returns each drill's name and description", async () => {
    mockPrisma.practiceSession.findUnique.mockResolvedValue({
      id: "s1", teamId: "t1", title: "T", date: new Date("2026-01-01T00:00:00Z"), duration: 60, isShared: false,
      venueId: null, surfaceId: null, segmentId: null, startAt: null,
      plays: [row("a", 0)],
    });
    const result = await getPracticeSessionForEdit("s1");
    expect(result?.initialData.plays[0]).toMatchObject({ name: "a", description: "" });
  });
```

In `PracticeSessionEditor.tsx`'s `handleAddPlayFromLibrary`, add `name: savedPlay.name,` and `description: savedPlay.description || "",` to `playInstance` after `playId: savedPlay.id,`.

- [ ] **Step 5: Show the name and raise the instructions limit on the card**

In `SessionDrillCard.tsx`: the `<Typography variant="h6" component="h3">` content `Play {index + 1}` becomes `{play.name || \`Drill ${index + 1}\`}`; the thumbnail `alt={\`Play ${index + 1}\`}` becomes `alt={play.name || \`Drill ${index + 1}\`}`; the instructions field's `inputProps={{ maxLength: 500 }}` becomes `inputProps={{ maxLength: 2000 }}` and its `helperText={\`${editInstructions.length}/500 characters\`}` becomes `helperText={\`${editInstructions.length}/2000 characters\`}`.

- [ ] **Step 6: Write the failing editor tests**

Create `__tests__/components/features/practice-planner/PracticeSessionEditor.drill-ids.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeAll } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import {
    PracticeSessionEditor,
    type PracticeSessionSaveResult,
    type PracticeSessionSubmitData,
} from "@/components/features/practice-planner/PracticeSessionEditor";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayInSession } from "@/types/practice-planner";

beforeAll(() => {
    global.ResizeObserver = class {
        observe() { /* noop */ }
        unobserve() { /* noop */ }
        disconnect() { /* noop */ }
    } as unknown as typeof ResizeObserver;
});

vi.mock("@/lib/actions/plays", () => ({
    getPlaysByTeam: vi.fn().mockResolvedValue({ success: true, data: { plays: [], total: 0 } }),
    getPlayById: vi.fn(),
    deletePlay: vi.fn(),
    createPlay: vi.fn(),
}));

type SaveFn = (data: PracticeSessionSubmitData) => Promise<PracticeSessionSaveResult>;

const LIB = "clibraryxxxxxxxxxxxxxxxxx";
const OWNED = "cownedxxxxxxxxxxxxxxxxxxx";

function drill(id: string, playId: string): PlayInSession {
    return { id, playId, name: "Breakout", sequence: 0, duration: 10, instructions: "", playData: createEmptyPlayData(), thumbnail: "" };
}

function renderEditor(onSave: SaveFn, plays: PlayInSession[] = []) {
    render(
        <ThemeProvider theme={createTheme()}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <PracticeSessionEditor
                    sessionId="csessionxxxxxxxxxxxxxxxxx"
                    teamId="cteamxxxxxxxxxxxxxxxxxxxx"
                    initialData={{ title: "Practice", duration: 60, date: new Date("2026-04-07T22:00:00Z"), plays }}
                    onSave={onSave}
                />
            </LocalizationProvider>
        </ThemeProvider>,
    );
}

async function editTitleAndWait(value: string) {
    fireEvent.change(screen.getByLabelText(/session title/i), { target: { value } });
    await act(async () => {
        await vi.advanceTimersByTimeAsync(2100);
    });
}

describe("PracticeSessionEditor drill ids and autosave", () => {
    it("swaps a drill's playId for the owned copy the save returns", async () => {
        vi.useFakeTimers();
        try {
            const onSave = vi.fn<SaveFn>()
                .mockResolvedValueOnce({ success: true, plays: [{ clientKey: "k1", playId: OWNED }] })
                .mockResolvedValue({ success: true, plays: [] });
            renderEditor(onSave, [drill("k1", LIB)]);

            await editTitleAndWait("Practice v2");
            expect(onSave.mock.calls[0][0].plays[0].playId).toBe(LIB);

            await editTitleAndWait("Practice v3");
            expect(onSave.mock.calls[1][0].plays[0].playId).toBe(OWNED);
        } finally {
            vi.useRealTimers();
        }
    });

    it("never runs two saves at once and follows up with the latest edits", async () => {
        vi.useFakeTimers();
        try {
            const releases: Array<() => void> = [];
            let inFlight = 0;
            let maxInFlight = 0;
            const onSave = vi.fn<SaveFn>(async () => {
                inFlight += 1;
                maxInFlight = Math.max(maxInFlight, inFlight);
                await new Promise<void>((resolve) => releases.push(resolve));
                inFlight -= 1;
                return { success: true, plays: [] };
            });
            renderEditor(onSave);

            await editTitleAndWait("A");
            expect(onSave).toHaveBeenCalledTimes(1);

            await editTitleAndWait("AB");
            expect(onSave).toHaveBeenCalledTimes(1);

            await act(async () => {
                releases[0]();
                await vi.advanceTimersByTimeAsync(0);
            });
            expect(onSave).toHaveBeenCalledTimes(2);
            expect(onSave.mock.calls[1][0].title).toBe("AB");

            await act(async () => {
                releases[1]();
                await vi.advanceTimersByTimeAsync(0);
            });
            expect(maxInFlight).toBe(1);
            expect(onSave).toHaveBeenCalledTimes(2);
            expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
        } finally {
            vi.useRealTimers();
        }
    });
});
```

Run: `bun run test __tests__/components/features/practice-planner/PracticeSessionEditor.drill-ids.test.tsx`
Expected: FAIL (no swap; the second edit during flight is never saved).

- [ ] **Step 7: Implement the swap and single-flight saves in the editor**

In `PracticeSessionEditor.tsx`:

1. Import `import { applySavedPlayIds, type SavedDrillId } from "@/lib/utils/session-drill-ids";` and change the success variant of `PracticeSessionSaveResult` to `| { success: true; plays?: SavedDrillId[] }`.

2. Directly after the `handleSaveRef` declaration (before `markDirty`) add:

```tsx
    // Single-flight saves: a save requested while one is running is queued
    // and runs once, after the running save's state has rendered.
    const saveInFlightRef = useRef(false);
    const saveQueuedRef = useRef(false);
    const editVersionRef = useRef(0);
    const [queuedSaveTick, setQueuedSaveTick] = useState(0);
```

and change `markDirty` to bump the version:

```tsx
    const markDirty = useCallback(() => {
        editVersionRef.current += 1;
        setHasUnsavedChanges(true);
        setSaveSuccess(false);
    }, []);
```

3. In `handleSave`: make its first statement

```tsx
        if (saveInFlightRef.current) {
            saveQueuedRef.current = true;
            return;
        }
```

directly before `setIsSaving(true);` add

```tsx
        saveInFlightRef.current = true;
        const startedVersion = editVersionRef.current;
        const sentPlayIds = new Map(plays.map((play) => [play.id, play.playId]));
```

replace `setHasUnsavedChanges(false);` (the one after the `if (!result.success) { … }` block) with

```tsx
            setPlays((current) => applySavedPlayIds(current, sentPlayIds, result.plays));
            if (editVersionRef.current === startedVersion) {
                setHasUnsavedChanges(false);
            } else {
                // Edited while saving: save again once this one settles.
                saveQueuedRef.current = true;
            }
```

and replace the `finally { setIsSaving(false); }` block with

```tsx
        } finally {
            setIsSaving(false);
            saveInFlightRef.current = false;
            if (saveQueuedRef.current) {
                saveQueuedRef.current = false;
                setQueuedSaveTick((tick) => tick + 1);
            }
        }
```

4. Directly after the `useEffect` that assigns `handleSaveRef.current = handleSave;`, add (order matters: this effect must run after the ref has the latest `handleSave`):

```tsx
    // Run a queued save after the previous save's state updates have rendered.
    useEffect(() => {
        if (queuedSaveTick > 0) void handleSaveRef.current?.();
    }, [queuedSaveTick]);
```

- [ ] **Step 8: Forward the mapping and redirect new sessions to their edit page**

`EditSessionWrapper.tsx`: change the success return to `return { success: true, plays: result.data.plays };`.

`PracticeSessionEditorWrapper.tsx`: change `router.push(\`/practice-planner/${result.data.id}\`);` and its comment to:

```ts
      // Diagram editing needs a saved session, so continue on its edit page.
      router.push(`/practice-planner/${result.data.id}/edit`);
```

- [ ] **Step 9: Run the tests, type-check, and measure**

Run: `bun run test __tests__/lib/utils/session-drill-ids.test.ts __tests__/components/features/practice-planner/PracticeSessionEditor.drill-ids.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.characterization.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.notify.test.tsx __tests__/lib/actions/practice-session-queries.test.ts __tests__/types/practice-planner.test.ts`
Expected: PASS.
Run: `bun run type-check && bun run lint && wc -l components/features/practice-planner/PracticeSessionEditor.tsx`
Expected: no errors; editor under 900 lines.

- [ ] **Step 10: Commit**

```bash
git add types/practice-planner.ts lib/actions/practice-session-queries.ts lib/utils/session-drill-ids.ts components/features/practice-planner "app/(dashboard)/practice-planner" __tests__/lib/utils/session-drill-ids.test.ts __tests__/components/features/practice-planner __tests__/lib/actions/practice-session-queries.test.ts __tests__/types/practice-planner.test.ts
git commit -m "feat(practice-planner): drill names, owned-id swap, and single-flight session autosave

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 9: `SessionDrillDialog` — edit a drill's diagram, or build a new drill, inside a session

**Files:**
- Modify: `components/features/practice-planner/PlayEditor.tsx:42-50, 58-64, 254-272` (`autoSave` prop)
- Create: `components/features/practice-planner/SessionDrillDialog.tsx`
- Modify: `components/features/practice-planner/SessionDrillCard.tsx`, `SessionDrillList.tsx`, `PracticeSessionEditor.tsx`
- Test: `__tests__/components/features/practice-planner/PlayEditor.test.tsx` (append), `__tests__/components/features/practice-planner/SessionDrillDialog.test.tsx` (create), `__tests__/components/features/practice-planner/PracticeSessionEditor.drill-dialog.test.tsx` (create), `PracticeSessionEditor.characterization.test.tsx` (button label)

**Interfaces:**
- Consumes: Task 6 (`saveSessionDrill`, `copySessionDrillToLibrary`), Task 8 (`upsertSessionDrill`, `SessionDrillPatch`, `markDirty`).
- Produces:
  - `PlayEditorProps.autoSave?: boolean` (default `true`)
  - `SessionDrillDialogDrill = { clientKey: string; playId: string | null; name: string; description: string; playData: PlayData; thumbnail: string }`
  - `SessionDrillDialog(props: { open: boolean; sessionId: string; teamId: string; drill: SessionDrillDialogDrill | null; onSaved(clientKey: string, patch: SessionDrillPatch): void; onClose(): void })`
  - `SessionDrillCardProps` adds `canEditDiagram: boolean; onEditDiagram(clientKey: string): void`
  - `SessionDrillListProps` adds `canEditDiagram: boolean; onEditDiagram(clientKey: string): void; onNewDrill(): void`; "Add Play" is renamed "Add from library".

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/components/features/practice-planner/PlayEditor.test.tsx` (inside the top-level `describe("PlayEditor", …)`; add `act` and `fireEvent` to the Testing Library import):

```tsx
    describe("autoSave={false}", () => {
        it("never saves on its own, even for an existing play", async () => {
            vi.useFakeTimers();
            try {
                const onSave = vi.fn().mockResolvedValue(undefined);
                renderWithTheme(createDefaultProps({
                    playId: "play-123",
                    autoSave: false,
                    initialData: { name: "Drill", playData: { version: 2, players: [], drawings: [], equipment: [], annotations: [] } },
                    onSave,
                }));
                fireEvent.change(screen.getByLabelText(/Play Name/i), { target: { value: "Drill 2" } });
                await act(async () => {
                    await vi.advanceTimersByTimeAsync(2500);
                });
                expect(onSave).not.toHaveBeenCalled();
            } finally {
                vi.useRealTimers();
            }
        });
    });
```

Create `__tests__/components/features/practice-planner/SessionDrillDialog.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { PlayEditorProps } from "@/components/features/practice-planner/PlayEditor";
import type { SavedPlay } from "@/types/practice-planner";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const captured = vi.hoisted(() => ({ props: null as PlayEditorProps | null }));
const actions = vi.hoisted(() => ({ saveSessionDrill: vi.fn(), copySessionDrillToLibrary: vi.fn() }));

vi.mock("@/components/features/practice-planner/PlayEditor", () => ({
    PlayEditor: (props: PlayEditorProps) => {
        captured.props = props;
        return <div>play editor</div>;
    },
}));
vi.mock("@/lib/actions/practice-session-drills", () => actions);

import { SessionDrillDialog } from "@/components/features/practice-planner/SessionDrillDialog";

const SESSION = "csessionxxxxxxxxxxxxxxxxx";
const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const LIB = "clibraryxxxxxxxxxxxxxxxxx";
const OWNED = "cownedxxxxxxxxxxxxxxxxxxx";

const saved: SavedPlay = {
    id: "", name: "Breakout", description: "Quick", thumbnail: "data:image/png;base64,AA",
    playData: createEmptyPlayData(), isTemplate: false, createdAt: new Date(), updatedAt: new Date(),
};

function renderDialog(playId: string | null, onSaved = vi.fn()) {
    render(
        <SessionDrillDialog
            open
            sessionId={SESSION}
            teamId={TEAM}
            drill={{ clientKey: "k1", playId, name: "Breakout", description: "Quick", playData: createEmptyPlayData(), thumbnail: "" }}
            onSaved={onSaved}
            onClose={vi.fn()}
        />,
    );
    return { onSaved };
}

async function saveFromEditor() {
    await act(async () => {
        await captured.props?.onSave?.(saved);
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    captured.props = null;
    actions.saveSessionDrill.mockResolvedValue({ success: true, data: { playId: OWNED } });
    actions.copySessionDrillToLibrary.mockResolvedValue({ success: true, data: { playId: "clibcopyxxxxxxxxxxxxxxxxx" } });
});

describe("SessionDrillDialog", () => {
    it("hosts PlayEditor with autosave off and the template box locked", () => {
        renderDialog(LIB);
        expect(captured.props).toMatchObject({ autoSave: false, lockTemplate: true, playId: LIB });
    });

    it("forks on the first save, then keeps saving the owned copy", async () => {
        const { onSaved } = renderDialog(LIB);
        await saveFromEditor();
        expect(actions.saveSessionDrill).toHaveBeenLastCalledWith(expect.objectContaining({ sessionId: SESSION, teamId: TEAM, playId: LIB, name: "Breakout" }));
        expect(onSaved).toHaveBeenCalledWith("k1", expect.objectContaining({ playId: OWNED, name: "Breakout" }));

        await saveFromEditor();
        expect(actions.saveSessionDrill).toHaveBeenLastCalledWith(expect.objectContaining({ playId: OWNED }));
    });

    it("creates a brand-new drill without a playId", async () => {
        renderDialog(null);
        await saveFromEditor();
        expect(actions.saveSessionDrill.mock.calls[0][0].playId).toBeUndefined();
    });

    it("adds the drill to the library once when the box is checked", async () => {
        renderDialog(LIB);
        fireEvent.click(screen.getByLabelText("Also add to library"));
        await saveFromEditor();
        await saveFromEditor();
        expect(actions.copySessionDrillToLibrary).toHaveBeenCalledTimes(1);
        expect(actions.copySessionDrillToLibrary).toHaveBeenCalledWith({ playId: OWNED, teamId: TEAM });
    });

    it("does not add to the library by default", async () => {
        renderDialog(LIB);
        await saveFromEditor();
        expect(actions.copySessionDrillToLibrary).not.toHaveBeenCalled();
    });

    it("surfaces a save error to PlayEditor and reports nothing", async () => {
        actions.saveSessionDrill.mockResolvedValue({ success: false, error: "Invalid play data" });
        const { onSaved } = renderDialog(LIB);
        await expect(captured.props?.onSave?.(saved)).rejects.toThrow("Invalid play data");
        expect(onSaved).not.toHaveBeenCalled();
    });
});
```

Create `__tests__/components/features/practice-planner/PracticeSessionEditor.drill-dialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeAll } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import {
    PracticeSessionEditor,
    type PracticeSessionSaveResult,
    type PracticeSessionSubmitData,
} from "@/components/features/practice-planner/PracticeSessionEditor";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayInSession } from "@/types/practice-planner";

beforeAll(() => {
    global.ResizeObserver = class {
        observe() { /* noop */ }
        unobserve() { /* noop */ }
        disconnect() { /* noop */ }
    } as unknown as typeof ResizeObserver;
});

vi.mock("@/lib/actions/plays", () => ({
    getPlaysByTeam: vi.fn().mockResolvedValue({ success: true, data: { plays: [], total: 0 } }),
    getPlayById: vi.fn(),
    deletePlay: vi.fn(),
    createPlay: vi.fn(),
}));

const FORK = "cforkxxxxxxxxxxxxxxxxxxxx";

// Stand-in for the dialog: one button that reports a successful drill save.
vi.mock("@/components/features/practice-planner/SessionDrillDialog", () => ({
    SessionDrillDialog: ({ open, drill, onSaved }: {
        open: boolean;
        drill: { clientKey: string } | null;
        onSaved: (clientKey: string, patch: Record<string, unknown>) => void;
    }) => {
        if (!open || !drill) return null;
        const clientKey = drill.clientKey;
        return (
            <button
                type="button"
                onClick={() => onSaved(clientKey, {
                    playId: "cforkxxxxxxxxxxxxxxxxxxxx", name: "Forked", description: "", thumbnail: "", playData: { version: 2, players: [], drawings: [], equipment: [], annotations: [] },
                })}
            >
                stub save drill
            </button>
        );
    },
}));

type SaveFn = (data: PracticeSessionSubmitData) => Promise<PracticeSessionSaveResult>;
const LIB = "clibraryxxxxxxxxxxxxxxxxx";

function drill(id: string, playId: string): PlayInSession {
    return { id, playId, name: "Breakout", sequence: 0, duration: 10, instructions: "", playData: createEmptyPlayData(), thumbnail: "" };
}

// sessionId null = a session that has never been saved.
function renderEditor(onSave: SaveFn, plays: PlayInSession[], sessionId: string | null = "csessionxxxxxxxxxxxxxxxxx") {
    render(
        <ThemeProvider theme={createTheme()}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <PracticeSessionEditor
                    sessionId={sessionId ?? undefined}
                    teamId="cteamxxxxxxxxxxxxxxxxxxxx"
                    initialData={{ title: "Practice", duration: 60, date: new Date("2026-04-07T22:00:00Z"), plays }}
                    onSave={onSave}
                />
            </LocalizationProvider>
        </ThemeProvider>,
    );
}

describe("PracticeSessionEditor drill dialog wiring", () => {
    it("disables diagram editing and new drills before the session is saved", () => {
        renderEditor(vi.fn<SaveFn>(), [drill("k1", LIB)], null);
        expect(screen.getByRole("button", { name: /edit diagram/i })).toBeDisabled();
        expect(screen.getByRole("button", { name: /new drill/i })).toBeDisabled();
    });

    it("appends a drill built in the dialog and saves its id", async () => {
        const onSave = vi.fn<SaveFn>().mockResolvedValue({ success: true, plays: [] });
        renderEditor(onSave, []);
        fireEvent.click(screen.getByRole("button", { name: /new drill/i }));
        fireEvent.click(screen.getByRole("button", { name: "stub save drill" }));

        expect(screen.getByRole("heading", { name: "Forked" })).toBeInTheDocument();
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /^save session/i }));
        });
        expect(onSave.mock.calls[0][0].plays.map((p) => p.playId)).toEqual([FORK]);
    });

    it("keeps the dialog's fork when an autosave in flight returns an older copy", async () => {
        vi.useFakeTimers();
        try {
            const releases: Array<() => void> = [];
            const onSave = vi.fn<SaveFn>()
                .mockImplementationOnce(async () => {
                    await new Promise<void>((resolve) => releases.push(resolve));
                    return { success: true, plays: [{ clientKey: "k1", playId: "cautosavecopyxxxxxxxxxxxx" }] };
                })
                .mockResolvedValue({ success: true, plays: [] });
            renderEditor(onSave, [drill("k1", LIB)]);

            fireEvent.change(screen.getByLabelText(/session title/i), { target: { value: "Practice v2" } });
            await act(async () => {
                await vi.advanceTimersByTimeAsync(2100);
            });
            expect(onSave.mock.calls[0][0].plays[0].playId).toBe(LIB);

            fireEvent.click(screen.getByRole("button", { name: /edit diagram/i }));
            fireEvent.click(screen.getByRole("button", { name: "stub save drill" }));

            await act(async () => {
                releases[0]();
                await vi.advanceTimersByTimeAsync(0);
            });
            expect(onSave).toHaveBeenCalledTimes(2);
            expect(onSave.mock.calls[1][0].plays[0].playId).toBe(FORK);
        } finally {
            vi.useRealTimers();
        }
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test __tests__/components/features/practice-planner/PlayEditor.test.tsx __tests__/components/features/practice-planner/SessionDrillDialog.test.tsx __tests__/components/features/practice-planner/PracticeSessionEditor.drill-dialog.test.tsx`
Expected: FAIL (`autoSave` ignored; no `SessionDrillDialog`; no "Edit diagram"/"New drill" buttons).

- [ ] **Step 3: Add `autoSave` to `PlayEditor`**

In `PlayEditorProps`, after `lockTemplate?: boolean;` add:

```ts
    /**
     * Debounced autosave of an existing play (default true). The session drill
     * dialog turns it off: each save there could fork a new session copy.
     */
    autoSave?: boolean;
```

add `autoSave = true,` to the destructured props after `lockTemplate = false,`, and in the autosave effect change `if (hasUnsavedChanges && playId) {` to `if (autoSave && hasUnsavedChanges && playId) {` and its deps to `[autoSave, hasUnsavedChanges, playId]`.

- [ ] **Step 4: Create `SessionDrillDialog.tsx`**

```tsx
"use client";

/**
 * Full-screen editor for one drill's diagram inside a practice session
 * (practice planner 3a). Saves go through saveSessionDrill, so a library
 * drill is forked into a copy only this session owns; PlayEditor's own
 * autosave is off so each save is deliberate.
 */

import { useState } from "react";
import { Box, Checkbox, Dialog, FormControlLabel } from "@mui/material";
import type { PlayData, SavedPlay } from "@/types/practice-planner";
import type { SessionDrillPatch } from "@/lib/utils/session-drill-ids";
import { copySessionDrillToLibrary, saveSessionDrill } from "@/lib/actions/practice-session-drills";
import { PlayEditor } from "./PlayEditor";

export interface SessionDrillDialogDrill {
    clientKey: string;
    /** null for a brand-new drill. */
    playId: string | null;
    name: string;
    description: string;
    playData: PlayData;
    thumbnail: string;
}

export interface SessionDrillDialogProps {
    open: boolean;
    sessionId: string;
    teamId: string;
    drill: SessionDrillDialogDrill | null;
    /** Every successful save: the editor updates (or appends) the card. */
    onSaved: (clientKey: string, patch: SessionDrillPatch) => void;
    onClose: () => void;
}

export function SessionDrillDialog({ open, sessionId, teamId, drill, onSaved, onClose }: SessionDrillDialogProps) {
    const [playId, setPlayId] = useState<string | null>(drill?.playId ?? null);
    const [alsoAddToLibrary, setAlsoAddToLibrary] = useState(false);
    const [addedToLibrary, setAddedToLibrary] = useState(false);

    if (!drill) return null;

    const handleSave = async (saved: SavedPlay) => {
        const result = await saveSessionDrill({
            sessionId,
            teamId,
            playId: playId ?? undefined,
            name: saved.name,
            description: saved.description || undefined,
            thumbnail: saved.thumbnail || undefined,
            playData: saved.playData,
        });
        // PlayEditor catches this and shows it in its error alert; the dialog stays open.
        if (!result.success) throw new Error(result.error);

        setPlayId(result.data.playId);
        onSaved(drill.clientKey, {
            playId: result.data.playId,
            name: saved.name,
            description: saved.description,
            thumbnail: saved.thumbnail,
            playData: saved.playData,
        });

        if (alsoAddToLibrary && !addedToLibrary) {
            const copy = await copySessionDrillToLibrary({ playId: result.data.playId, teamId });
            if (!copy.success) {
                throw new Error(`Saved to this session, but not added to the library: ${copy.error}`);
            }
            setAddedToLibrary(true);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullScreen aria-label="Edit drill diagram">
            <Box sx={{ px: { xs: 2, md: 3 }, pt: 2 }}>
                <FormControlLabel
                    control={
                        <Checkbox
                            checked={alsoAddToLibrary}
                            onChange={(event) => setAlsoAddToLibrary(event.target.checked)}
                            disabled={addedToLibrary}
                        />
                    }
                    label="Also add to library"
                />
            </Box>
            <PlayEditor
                teamId={teamId}
                playId={playId ?? undefined}
                initialData={{
                    name: drill.name,
                    description: drill.description,
                    playData: drill.playData,
                    thumbnail: drill.thumbnail,
                    isTemplate: false,
                }}
                lockTemplate
                autoSave={false}
                onSave={handleSave}
                onCancel={onClose}
            />
        </Dialog>
    );
}
```

- [ ] **Step 5: Add the entry points**

`SessionDrillCard.tsx`: add to `SessionDrillCardProps`

```ts
    /** Diagram editing needs a saved session. */
    canEditDiagram: boolean;
    onEditDiagram: (clientKey: string) => void;
```

destructure them, add `Tooltip` to the MUI import and `Draw as DrawIcon` to the icons import, and directly before the `{/* Edit Actions */}` comment add:

```tsx
                    {!isEditing && (
                        <Tooltip title={canEditDiagram ? "" : "Save the session first"}>
                            <span>
                                <Button
                                    size="small"
                                    startIcon={<DrawIcon />}
                                    onClick={() => onEditDiagram(play.id)}
                                    disabled={!canEditDiagram}
                                    aria-label={`Edit diagram for ${play.name || `drill ${index + 1}`}`}
                                    sx={{ minHeight: 44 }}
                                >
                                    Edit diagram
                                </Button>
                            </span>
                        </Tooltip>
                    )}
```

`SessionDrillList.tsx`: add `canEditDiagram: boolean; onEditDiagram: (clientKey: string) => void; onNewDrill: () => void;` to the props (and destructure them), pass `canEditDiagram={canEditDiagram}` and `onEditDiagram={onEditDiagram}` to each `SessionDrillCard`, add `Tooltip` to the MUI import and `Draw as DrawIcon` to the icons import, and replace the single "Add Play" `<Button>` with:

```tsx
                    <Stack direction="row" spacing={1}>
                        <Tooltip title={canEditDiagram ? "" : "Save the session first"}>
                            <span>
                                <Button
                                    variant="outlined"
                                    startIcon={<DrawIcon />}
                                    onClick={onNewDrill}
                                    disabled={disabled || !canEditDiagram}
                                    sx={{ minHeight: 44 }}
                                >
                                    New drill
                                </Button>
                            </span>
                        </Tooltip>
                        <Button
                            variant="outlined"
                            startIcon={<AddIcon />}
                            onClick={onOpenLibrary}
                            disabled={disabled}
                            sx={{ minHeight: 44 }}
                        >
                            Add from library
                        </Button>
                    </Stack>
```

`PracticeSessionEditor.tsx`:

1. Imports: `import { SessionDrillDialog, type SessionDrillDialogDrill } from "./SessionDrillDialog";`, add `upsertSessionDrill, type SessionDrillPatch` to the `@/lib/utils/session-drill-ids` import, and `import { createEmptyPlayData } from "@/lib/utils/play-data";`.

2. After the `editingPlayId` state: `const [drillDialog, setDrillDialog] = useState<SessionDrillDialogDrill | null>(null);`

3. After `handleCancelEdit`, add:

```tsx
    const handleEditDiagram = useCallback((clientKey: string) => {
        const play = plays.find((p) => p.id === clientKey);
        if (!play) return;
        setDrillDialog({
            clientKey,
            playId: play.playId,
            name: play.name,
            description: play.description ?? "",
            playData: play.playData,
            thumbnail: play.thumbnail ?? "",
        });
    }, [plays]);

    const handleNewDrill = useCallback(() => {
        setDrillDialog({
            clientKey: `drill-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            playId: null,
            name: "",
            description: "",
            playData: createEmptyPlayData(),
            thumbnail: "",
        });
    }, []);

    // Every dialog save: point the card at the saved copy and let autosave persist it.
    const handleDrillSaved = useCallback((clientKey: string, patch: SessionDrillPatch) => {
        setPlays((prev) => upsertSessionDrill(prev, clientKey, patch));
        markDirty();
    }, [markDirty]);
```

4. Pass `canEditDiagram={Boolean(sessionId)}`, `onEditDiagram={handleEditDiagram}`, `onNewDrill={handleNewDrill}` to `<SessionDrillList>`.

5. Directly before the `{/* Play Library Dialog */}` comment add:

```tsx
            {sessionId && (
                <SessionDrillDialog
                    key={drillDialog?.clientKey ?? "closed"}
                    open={drillDialog !== null}
                    sessionId={sessionId}
                    teamId={teamId}
                    drill={drillDialog}
                    onSaved={handleDrillSaved}
                    onClose={() => setDrillDialog(null)}
                />
            )}
```

6. In `PracticeSessionEditor.characterization.test.tsx` nothing references "Add Play"; confirm with `grep -n "Add Play" __tests__/components/features/practice-planner/*.tsx` (expected: no output).

- [ ] **Step 6: Run the tests, type-check, lint**

Run: `bun run test __tests__/components/features/practice-planner`
Expected: PASS.
Run: `bun run type-check && bun run lint && wc -l components/features/practice-planner/PracticeSessionEditor.tsx`
Expected: no errors; under 900 lines.

- [ ] **Step 7: Commit**

```bash
git add components/features/practice-planner __tests__/components/features/practice-planner
git commit -m "feat(practice-planner): edit a drill's diagram or build a new drill inside a session

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 10: Duplicate UI, spec amendments, full gates

**Files:**
- Create: `components/features/practice-planner/DuplicateSessionDialog.tsx`
- Modify: `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx` (admin actions :281-313)
- Modify: `app/(dashboard)/practice-planner/PracticePlannerList.tsx` (`SessionCard` :277-412, props :50-54), `app/(dashboard)/practice-planner/page.tsx`
- Modify: `docs/superpowers/specs/2026-10-03-practice-session-drill-ownership-design.md`
- Test: `__tests__/components/features/practice-planner/DuplicateSessionDialog.test.tsx` (create)

**Interfaces:**
- Consumes: Task 7 (`duplicatePracticeSession`).
- Produces: `DuplicateSessionDialog(props: { open: boolean; sessionId: string; teamId: string; sourceDate: string; onClose(): void })`; `PracticePlannerList` gains a required `teamId: string` prop.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/features/practice-planner/DuplicateSessionDialog.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const actions = vi.hoisted(() => ({ duplicatePracticeSession: vi.fn() }));
vi.mock("@/lib/actions/practice-session-drills", () => actions);

import { DuplicateSessionDialog } from "@/components/features/practice-planner/DuplicateSessionDialog";

const SESSION = "csessionxxxxxxxxxxxxxxxxx";
const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const SOURCE_DATE = "2026-04-07T22:00:00.000Z";

function plusSevenDays(iso: string): Date {
    const date = new Date(iso);
    date.setDate(date.getDate() + 7);
    return date;
}

beforeEach(() => vi.clearAllMocks());

describe("DuplicateSessionDialog", () => {
    it("defaults to a week later and opens the copy's edit page", async () => {
        actions.duplicatePracticeSession.mockResolvedValue({ success: true, data: { id: "ccopyxxxxxxxxxxxxxxxxxxxx" } });
        render(<DuplicateSessionDialog open sessionId={SESSION} teamId={TEAM} sourceDate={SOURCE_DATE} onClose={vi.fn()} />);

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
        });

        const sent = actions.duplicatePracticeSession.mock.calls[0][0];
        expect(sent).toMatchObject({ id: SESSION, teamId: TEAM });
        expect(sent.date.toISOString()).toBe(plusSevenDays(SOURCE_DATE).toISOString());
        expect(push).toHaveBeenCalledWith("/practice-planner/ccopyxxxxxxxxxxxxxxxxxxxx/edit");
    });

    it("shows the error and stays open when duplication fails", async () => {
        actions.duplicatePracticeSession.mockResolvedValue({ success: false, error: "Practice session not found" });
        render(<DuplicateSessionDialog open sessionId={SESSION} teamId={TEAM} sourceDate={SOURCE_DATE} onClose={vi.fn()} />);

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
        });
        expect(screen.getByText("Practice session not found")).toBeInTheDocument();
        expect(push).not.toHaveBeenCalled();
    });
});
```

Run: `bun run test __tests__/components/features/practice-planner/DuplicateSessionDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 2: Create `DuplicateSessionDialog.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    Alert,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Stack,
} from "@mui/material";
import { DateTimeField } from "@/components/ui/date";
import { formatDateTimeValue, parseDateTimeValue } from "@/components/ui/date/internal";
import { duplicatePracticeSession } from "@/lib/actions/practice-session-drills";

export interface DuplicateSessionDialogProps {
    open: boolean;
    sessionId: string;
    teamId: string;
    /** The source session's date (ISO string). */
    sourceDate: string;
    onClose: () => void;
}

/** Same local wall-clock time, one week later. */
function aWeekLater(iso: string): string {
    const date = new Date(iso);
    date.setDate(date.getDate() + 7);
    return formatDateTimeValue(date);
}

export function DuplicateSessionDialog({ open, sessionId, teamId, sourceDate, onClose }: DuplicateSessionDialogProps) {
    const router = useRouter();
    const [value, setValue] = useState(() => aWeekLater(sourceDate));
    const [isDuplicating, setIsDuplicating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleDuplicate = async () => {
        const date = parseDateTimeValue(value);
        if (!date) {
            setError("Choose a date and time for the copy");
            return;
        }
        setIsDuplicating(true);
        setError(null);
        const result = await duplicatePracticeSession({ id: sessionId, teamId, date });
        if (!result.success) {
            setError(result.error);
            setIsDuplicating(false);
            return;
        }
        router.push(`/practice-planner/${result.data.id}/edit`);
    };

    return (
        <Dialog open={open} onClose={onClose} aria-labelledby="duplicate-session-title" fullWidth maxWidth="xs">
            <DialogTitle id="duplicate-session-title">Duplicate practice session</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <DialogContentText>
                        The copy has the same drills, durations, and instructions. It isn&apos;t shared
                        and has no ice booked.
                    </DialogContentText>
                    <DateTimeField label="Date & time" value={value} onChange={setValue} required />
                    {error && <Alert severity="error">{error}</Alert>}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={isDuplicating} sx={{ minHeight: 44 }}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    onClick={handleDuplicate}
                    disabled={isDuplicating}
                    startIcon={isDuplicating ? <CircularProgress size={18} color="inherit" /> : null}
                    sx={{ minHeight: 44 }}
                >
                    Duplicate
                </Button>
            </DialogActions>
        </Dialog>
    );
}
```

Run the test again — expected: PASS.

- [ ] **Step 3: Wire the detail view**

In `SessionDetailView.tsx`: add `ContentCopy as DuplicateIcon,` to the icons import, `import { DuplicateSessionDialog } from "@/components/features/practice-planner/DuplicateSessionDialog";`, and `const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);` next to the other dialog state. In the admin actions `<Stack>`, between the "Edit" and "Delete" buttons, add:

```tsx
              <Button
                variant="outlined"
                startIcon={<DuplicateIcon />}
                onClick={() => setShowDuplicateDialog(true)}
                size={isMobile ? "small" : "medium"}
              >
                Duplicate
              </Button>
```

and, before the `{/* Delete dialog */}` comment:

```tsx
      {isAdmin && showDuplicateDialog && (
        <DuplicateSessionDialog
          open
          sessionId={session.id}
          teamId={session.teamId}
          sourceDate={session.date}
          onClose={() => setShowDuplicateDialog(false)}
        />
      )}
```

- [ ] **Step 4: Wire the session list**

`app/(dashboard)/practice-planner/page.tsx`: pass `teamId={data.teamId}` to `<PracticePlannerList>`.

`PracticePlannerList.tsx`:
1. Add `teamId: string;` to `PracticePlannerListProps` and destructure it; add `CardActions` to the MUI import, `import ContentCopyIcon from "@mui/icons-material/ContentCopy";`, and `import { DuplicateSessionDialog } from "@/components/features/practice-planner/DuplicateSessionDialog";`.
2. In `PracticePlannerList`, add `const [duplicating, setDuplicating] = useState<SessionSummary | null>(null);`, pass `isAdmin={isAdmin}` and `onDuplicate={setDuplicating}` to each `<SessionCard>`, and directly before the component's closing `</>` add:

```tsx
      {duplicating && (
        <DuplicateSessionDialog
          open
          sessionId={duplicating.id}
          teamId={teamId}
          sourceDate={duplicating.date}
          onClose={() => setDuplicating(null)}
        />
      )}
```

3. `SessionCard` takes two more props, `isAdmin: boolean` and `onDuplicate: (session: SessionSummary) => void` (add them to its destructuring and inline prop type), and directly after `</CardActionArea>` renders:

```tsx
      {isAdmin && (
        <CardActions sx={{ justifyContent: "flex-end", pt: 0 }}>
          <Button
            size="small"
            startIcon={<ContentCopyIcon />}
            onClick={() => onDuplicate(session)}
            sx={{ minHeight: 44 }}
          >
            Duplicate
          </Button>
        </CardActions>
      )}
```

- [ ] **Step 5: Amend the spec**

In `docs/superpowers/specs/2026-10-03-practice-session-drill-ownership-design.md`, fold the thirteen "Spec deviations" items at the top of this plan into the relevant sections (Server → Helper: signature, grace window, order check; Server → Actions: `clientKey` = `PlayInSession.id`, unique keys, `updatePlay` guard, `getPlaysByTeam` filter, `deletePlay` return; Components: structural Task 1, extra extracted modules, `description`, library-copy-once, edit-page redirect), add an "Open questions" section with the three items from this plan, and set the Status line to `Implemented (3a)`.

- [ ] **Step 6: Run every gate**

Run: `bun run type-check && bun run lint && bun run check:raw-sql && bun run test && bun run build`
Expected: all green. `bun run build` catches Next route/RSC issues type-check misses. Report any failure verbatim; if a failure is outside the practice planner, check `gh run list --branch main --limit 3` before attributing it to this branch.
Run: `wc -l components/features/practice-planner/PracticeSessionEditor.tsx`
Expected: under 900; report the number.

Manual check: the dev database is far behind on migrations, so do not click through live pages against it. If a migrated database is available (e.g. a CI preview), check: open a legacy session → edit → save → reload (drills unchanged, now owned); "Edit diagram" → change a player → Save → reload (persists; library unchanged); delete that drill's library source (session keeps it); duplicate (new date, unshared, unbooked). Report which of these you did.

- [ ] **Step 7: Commit**

```bash
git add components/features/practice-planner/DuplicateSessionDialog.tsx "app/(dashboard)/practice-planner" docs/superpowers/specs/2026-10-03-practice-session-drill-ownership-design.md __tests__/components/features/practice-planner/DuplicateSessionDialog.test.tsx
git commit -m "feat(practice-planner): duplicate a session from its page or the session list

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

## Self-Review

**1. Spec coverage.**

| Spec requirement | Task |
|---|---|
| `Play.sessionId`/`sourcePlayId`, relations, index; `PracticeSessionPlay.play` NO ACTION; verified constraint name | 2 |
| Invariants I1 (owned ⇒ non-template, same team) | 4 (clones set `isTemplate=false`, `teamId`), 3 (`updatePlay` guard), 6 |
| I2 (every session play owned after save) | 4, 5 (I2 test), 7 (duplicate clones all) |
| I3 (owned by S referenced only by S) | 4 (another session's copy rejected) |
| I4 states (library / retired / owned) | 3 (retire), 4 (classification) |
| Helper classification, `createManyAndReturn`, provenance, mapping, orphan cleanup | 4 |
| Create/update call the helper inside the transaction; `clientKey`; return mapping; ownership check moved | 5 |
| `saveSessionDrill`, `copySessionDrillToLibrary` | 6 |
| `duplicatePracticeSession` incl. new-column guard; no venue/reservation/share | 7 |
| `deletePlay` retire-on-delete; dialog copy | 3 |
| Library listings exclude owned and retired | 3 |
| Editor split first, no behavior change, <900 lines | 1 (verified again in 8, 9, 10) |
| `PlayInSession.name` (+ clientKey); playId swap; single-flight autosave | 8 |
| Instructions 2000 in UI | 8 |
| `SessionDrillDialog`, `PlayEditor` `autoSave={false}`/`lockTemplate`, "Also add to library", entry points, disabled before first save, create → edit redirect | 8 (redirect), 9 |
| Duplicate button on detail view (admins) and list; date dialog (+7 days); route to edit | 10 |
| Error handling: rejection message, dialog keeps errors, P2003 message, unknown clientKey ignored | 5, 9, 3, 8 |
| Testing list (helper, actions, editor, migration via CI, gates) | 4-10; migration applied by CI (ADR-0019) |

No gaps.

**2. Placeholder scan.** No "TBD"/"TODO"/"similar to Task N". Three steps move existing code verbatim by exact post-merge line range with listed substitutions (Task 1 Steps 5, 6; Task 1 Step 9's conditional share-dialog move). That is deliberate: retyping ~400 lines of unchanged JSX would risk silent drift, and the characterization tests guard the result.

**3. Type consistency.** `SessionDrillItem`/`SessionDrillMapping` (Task 4) are used by `drillItems`/`toSavedDrills` (Task 5). The action's `plays: { clientKey; playId }[]` (Task 5) matches `SavedDrillId` (Task 8). `SessionDrillPatch` (Task 8) is used by `SessionDrillDialog.onSaved` and `handleDrillSaved` (Task 9). `CLONE_SOURCE_SELECT` and `cloneDrillsIntoSession` (Task 4) are reused by `duplicatePracticeSession` (Task 7). `markDirty` is introduced in Task 1, changed in Task 8, and consumed in Task 9. `PlayEditorProps.autoSave` (Task 9) matches the dialog's usage. `PracticePlannerList.teamId` is added and passed in the same task (10).

**4. Review Focus.** Each of the five lines has its test in its owning task: (1) Task 8 `applySavedPlayIds` "keeps a card whose playId changed…" + Task 9 "keeps the dialog's fork…"; (2) Task 4 legacy-retired / never-referenced tests + Task 5 I2 test; (3) Task 3 retire / delete / P2003 tests; (4) Task 7 enum-driven guard tests (service and action); (5) Task 4 `deleteOrphanedSessionDrills` filter test + Task 9 new-drill flow.
