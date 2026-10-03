# Practice Sessions: Drill Ownership, Inline Editing & Duplication — Design

**Date:** 2026-10-03
**Status:** Implemented (3a)
**Phase:** 3a of the practice-planner iteration. Build order: hotfix → **3a** → 2a → 2b → 3b.
**Depends on:** phase 1 (`2026-10-02-practice-board-notation-design.md`, PR #369) and the hotfix branch `fix/practice-planner-session-bugs`, which adds the `notify` flag on session updates and normalizes edit-query sequences.

## Context

A `PracticeSession` is an ordered list of `PracticeSessionPlay` rows (`sequence`, `duration`, `instructions`). Each row points at a `Play` by `playId`.

`Play.isTemplate` was meant to separate library plays from session-specific ones, but nothing ever writes a session-specific play:
- the library editor locks `isTemplate=true`;
- the library lists only templates.

Consequences today:

- **Per-session drill edits do not persist.** The session editor deep-copies a library drill's `playData` into client state (`PracticeSessionEditor.tsx` ~936). No UI edits that copy, and save sends only `playId`.
- **Sessions share the library row.** Editing a library drill silently changes the diagram of every past session that uses it.
- **Deleting a library drill cascades.** `PracticeSessionPlay.play` is `onDelete: Cascade`, so the drill disappears from every session, past ones included. The delete dialog warns about this, but practice history is still lost.

## Goal

A session's drills belong to that session. A coach can tweak a drill's diagram for one practice, build a new drill inside a session, and reuse a past practice. Library edits and deletes never change a session.

### Success criteria

- Editing a drill's diagram inside a session changes only that session. The edit survives reload. The library and other sessions are untouched.
- A drill built inside a session can optionally also be added to the library ("Also add to library", off by default).
- Deleting or editing a library drill never changes or removes a drill in any session.
- "Duplicate" creates a new session with the same drills, durations, and instructions on a chosen date (default: original date + 7 days). The new session is unbooked and unshared.
- Existing sessions keep working without a data backfill. A session converts to owned copies on its next save, or earlier if a library drill it references is edited or deleted (detach-on-write).

### Non-goals

- The timeline, the bench sheet, and printing (3b).
- Stations and ice area (phase 2).
- Session templates detached from dates.
- Converting existing rows with a SQL data migration.

## Approach

**Session-owned `Play` copies, made on the server when the session is saved (copy-on-add).**

Every drill in a session is its own `Play` row with:
- `isTemplate = false`
- `sessionId` = the owning session
- `sourcePlayId` = the library play it came from, for provenance only

The server makes the copies inside the existing create/update transaction whenever a payload item references a play the session doesn't own. Client-side ids and the 2-second autosave therefore never matter.

This reuses the `Play` validation, `parseStoredPlayData`, thumbnails, and `PlayEditor` unchanged. Phase-2 drill-level data (ice area lives in `playData`) comes along with every copy automatically.

Rejected alternatives:
- **Copy-on-write** (reference the library drill until the first edit). Library edits and deletes would still reach every session that was never edited, and every read and write would need two code paths.
- **Snapshot columns on `PracticeSessionPlay`.** This duplicates the `Play` shape and its validation. Because save deletes and recreates all session plays, every autosave would also re-send every diagram.

## Data model

All changes are additive. The migration is hand-written, because the dev database is about 30 migrations behind and `migrate dev` would demand a reset.

```prisma
model Play {
  // …existing…
  // Owner when this play is a session's private copy (isTemplate = false).
  sessionId    String?
  session      PracticeSession? @relation("SessionOwnedPlays", fields: [sessionId], references: [id], onDelete: Cascade)
  // Library play this copy came from. Provenance only; never followed for rendering.
  sourcePlayId String?
  sourcePlay   Play?   @relation("PlayCopies", fields: [sourcePlayId], references: [id], onDelete: SetNull)
  copies       Play[]  @relation("PlayCopies")

  @@index([sessionId])
  @@index([sourcePlayId]) // the SET NULL FK looks copies up by sourcePlayId on every play delete
}

model PracticeSessionPlay {
  // …existing…
  @@index([playId]) // detach, orphan cleanup, and the FK check all filter by playId
}

model PracticeSession {
  // …existing…
  ownedPlays Play[] @relation("SessionOwnedPlays")
}
```

`PracticeSessionPlay.play` changes from `onDelete: Cascade` to `onDelete: NoAction`, as defense in depth. The constraint is also `DEFERRABLE INITIALLY DEFERRED`, so it is checked once, at commit:
- Deleting a session or a team still works. A team delete reaches the same rows along two cascade paths: Team → practice_sessions → practice_session_plays, and Team → plays (a session delete similarly removes session plays and owned plays through separate cascades). Each cascade runs as its own nested statement, so an immediate NO ACTION check passes or fails depending on the order the RI triggers fire, which follows trigger names and can change after a `pg_dump`/restore. A review reproduced `DELETE FROM "Team"` failing this way after a restore. Deferred to commit, the check runs after every cascade has finished, whatever the order.
- A stray delete of a play that a session still references still fails loudly instead of silently removing the drill from that session. A single-statement delete fails at its implicit commit as Prisma `P2003`. Inside an interactive `prisma.$transaction` the violation surfaces at commit, where Prisma 7 rethrows the driver adapter's raw `DriverAdapterError` (`cause.kind` `"ForeignKeyConstraintViolation"`, SQLSTATE 23503) rather than a `P2003`; `isStillReferenced` in `lib/actions/plays.ts` matches both shapes.
- Prisma can't model deferrability, so the schema only shows `onDelete: NoAction`; a comment there points at the migration. `prisma migrate diff` from a migrated database to the schema stays empty, but a regenerated migration for this FK would silently drop `DEFERRABLE` and must be fixed by hand.

Migration (`prisma/migrations/<timestamp>_session_owned_plays/migration.sql`):

```sql
ALTER TABLE "plays" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "plays" ADD COLUMN "sourcePlayId" TEXT;
CREATE INDEX "plays_sessionId_idx" ON "plays"("sessionId");
ALTER TABLE "plays" ADD CONSTRAINT "plays_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "practice_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "plays_sourcePlayId_idx" ON "plays"("sourcePlayId");
ALTER TABLE "plays" ADD CONSTRAINT "plays_sourcePlayId_fkey"
  FOREIGN KEY ("sourcePlayId") REFERENCES "plays"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "practice_session_plays" DROP CONSTRAINT "practice_session_plays_playId_fkey";
ALTER TABLE "practice_session_plays" ADD CONSTRAINT "practice_session_plays_playId_fkey"
  FOREIGN KEY ("playId") REFERENCES "plays"("id") ON DELETE NO ACTION ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX "practice_session_plays_playId_idx" ON "practice_session_plays"("playId");
```

The implementation plan must verify the actual constraint name before dropping it.

### Invariants

- **I1.** `sessionId != null` ⇒ `isTemplate = false` and `teamId = session.teamId`.
- **I2.** After any create, update, or duplicate, every session play of that session points at a play the session owns.
- **I3.** A play owned by session S is referenced only by S's session plays.
- **I4.** States of a `Play` row:

  | State | `isTemplate` | `sessionId` | Meaning |
  |---|---|---|---|
  | Library | `true` | `null` | Listed in the play library |
  | Session-owned | `false` | set | A session's private copy |

  There is no "retired" state (product-owner decision, 2026-10-03): a library play is detached from its sessions before it is changed, so a delete is always a real delete. `isTemplate = false` with `sessionId = null` occurs only in pre-3a rows written through the API. The helper still clones such a row when the session already references it.

## Server

### Helper: `materializeSessionDrills` (`lib/services/practice-session-drills.ts`)

It is not a Server Action. It runs inside the caller's transaction:

```ts
materializeSessionDrills(tx, { sessionId, teamId, userId, items })
// items: { playId, clientKey, sequence }[]
// returns: { mapping: { clientKey, sequence, playId }[], previousPlayIds: string[] }
```

`previousPlayIds` is the set of play ids the session referenced before this save. Orphan cleanup is a separate export, `deleteOrphanedSessionDrills`, which the update action calls after the session plays are rewritten (the helper returns before the rewrite, so it cannot clean up itself). The cloning itself is `cloneDrillsIntoSessions` (one round trip, a session per copy), shared by the helper, detach-on-write, and `duplicatePracticeSession`.

1. Load the referenced plays, restricted to this team.
2. Classify each item:
   - **Owned by this session:** keep it. A second occurrence of the same id is cloned.
   - **An unowned play L that a stale editor still sends after detach-on-write:** map it to S's existing copy C instead of cloning. This applies when S referenced C before this save, C's `sourcePlayId` is L, no payload item sends C itself, and S no longer references L. Each C is matched at most once; a further occurrence of the same L (a legacy session that held L on several rows got one copy for all of them) clones C, not L. Without this, an editor opened before L was edited would clone L's *new* content and drop-only cleanup would delete C, undoing the detach. Trade-off: removing a copy's card and re-adding the same library drill within one save window also reuses that copy (with its session edits) rather than taking a fresh library copy.
   - **A library play, or a legacy play this session already references:** clone it.
   - **Anything else** (another session's copy, another team's play, or a missing play): reject the whole save.
3. Clone with `createManyAndReturn`:
   - Copy the name, description, thumbnail, and raw `playData`. The data may still be v1; reads upgrade it.
   - Set `isTemplate=false`, `sessionId=S`, and `createdById` = the current user.
   - Set `sourcePlayId` to the source's own `sourcePlayId` if it has one, otherwise to the source's id.
   - Generate each copy's id before the insert (`newPlayId`, cuid-shaped) and map copies to sources by that id, not by result position. Prisma does not document the order of `createManyAndReturn` rows, and two copies can share a name, provenance, and session while carrying different diagrams (duplicating a session that holds two edited copies of one library drill). Every generated id must come back, or the transaction aborts instead of mapping a drill to the wrong card.
4. Return the `clientKey → playId` mapping, plus `previousPlayIds`.
5. After the session plays are rewritten, `deleteOrphanedSessionDrills` deletes owned plays of S that S referenced before this save (`previousPlayIds`) and that nothing references now (drop-only orphan cleanup, no time window). A copy S has never referenced, such as one the drill dialog just created, is never deleted by a save. That way an autosave already in flight can't remove it. Copies that are never referenced go with the session's cascade.

### Actions

- **`createPracticeSession` / `updatePracticeSession`**
  - Call the helper inside the existing transaction, before the session plays are created.
  - Play items gain a required `clientKey` (1–64 characters). The client sends the card's existing `PlayInSession.id` (a server session-play id, or `play-<ts>-<rand>` for a new card), so no new field is added. The schema rejects a payload whose keys are not unique.
  - Return `plays: { clientKey, playId }[]` in `data`.
  - The existing team-ownership check on referenced plays moves into the helper.
  - Auth, validation, and reservation logic are otherwise unchanged.
- **New file `lib/actions/practice-session-drills.ts`** (`"use server"`, ADR-0002 `ActionResult` shape, `requireTeamAdmin`):
  - **`saveSessionDrill({ sessionId, teamId, playId?, name, description, thumbnail, playData })`**
    - If `playId` is owned by the session: update it.
    - Otherwise (a library play, a legacy reference, or a brand-new drill): create an owned copy, setting `sourcePlayId` when forking.
    - Returns `{ playId }`. Validates with `playDataSchema` and the existing play field schemas, and sanitizes `playData` with `sanitizePlayDataForWrite` (`lib/utils/play-data.ts`), the same write hygiene as `createPlay` and `updatePlay`. Sends no email. Does not touch session plays; the next session save persists the reference.
  - **`copySessionDrillToLibrary({ playId, teamId })`**: creates a new library play from an owned copy. It looks the play up with `session: { teamId }`, so a play owned by another team's session is not found.
  - **`duplicatePracticeSession({ id, teamId, date })`**
    - Creates a new session titled "Copy of …" with the same `duration`. It is unshared, with no venue, surface, segment, `startAt`, or reservation (ADR-0007).
    - Clones every drill into the new session's owned plays.
    - Copies every session-play scalar except ids and foreign keys, so columns added later (e.g. phase 2b's `runsWithPrevious`) are carried over. A test fails if a new column is not copied.
    - Returns the new session's id.
- **Detach-on-write: `updatePlay` and `deletePlay`** (`lib/actions/plays.ts`). Product-owner decision, 2026-10-03; replaces retire-on-delete.
  - "Library play" here means any unowned play (`sessionId` null), not only `isTemplate` ones, so pre-3a rows saved with `isTemplate=false` are detached too. Before such a play is updated or deleted, every session whose session-play rows still reference it gets its own owned copy of the play's *current* content. That is one copy per session, made with the helper's clone logic (`cloneDrillsIntoSessions`), and that session's rows are repointed to the copy.
  - The detach and the update or delete run in one transaction.
  - A session that references the play in several rows gets one copy for all of them. If that session is saved later, the helper keeps the first row and clones the rest, as with any repeated owned drill.
  - After detaching, `deletePlay` really deletes the library row and returns `{ id, detachedSessions }` (the number of sessions that received a copy).
  - `deletePlay` rejects a session-owned play ("This drill belongs to a practice session. Remove it from that session.").
  - Library edits and deletes therefore never reach any session, re-saved or not.
  - `updatePlay` rejects a session-owned play ("This drill belongs to a practice session. Edit it from that session.").
  - The dialog copy becomes: "Sessions that use this drill keep their own copy."
- **Library listings** keep filtering on `isTemplate: true`, and also on `sessionId: null`, so session-owned plays never appear in the library. `getPlaysByTeam` always filters `sessionId: null`, not only when `isTemplate: true` is passed; no caller lists session copies.

## Components

- **Split `PracticeSessionEditor.tsx` (~1600 lines) first, with no behavior change**, under the existing tests:
  - The structural step (Task 1) changes no behavior. `SessionDrillCard.tsx` is extracted from `PlayCard`; showing the drill's name instead of "Play {n}" is a behavior change and lands with `PlayInSession.name`.
  - `SessionDrillList.tsx`, `VenueBookingFields.tsx` (including `BookingConflictAlert`), and a `useVenueBooking` hook are extracted from the list, booking state, and UI. The hook lives next to the editor in `components/features/practice-planner/`, because `lib/hooks/` holds only app-wide hooks.
  - Characterization tests are written before extracting, because the branch had no `PracticeSessionEditor` tests.
  - Later tasks extracted more modules to hold the line budget: `useSingleFlightSave` (single-flight saves), `useSessionDrillDialog.ts` (dialog state and how a dialog save lands on the cards), and `ShareSessionDialog.tsx` (the share confirmation).
  - Target: the editor ends up under 900 lines.
- **`PlayInSession`** gains `name: string` and an optional `description` (the drill dialog needs it; without it, forking a library drill would blank its description). The existing `id` is the `clientKey`.
  - `playId` is replaced from the mapping each save returns, except for a card whose `playId` changed since the save was sent (for example, the dialog forked it meanwhile); that card keeps its newer id.
  - Saves are single-flight, in the `useSingleFlightSave` hook: autosave is skipped while a save is in flight, and a queued save runs once afterwards. Queued Save and "Book anyway" intent is OR-merged, so a queued explicit save is never downgraded. No follow-up save runs on create (there is no `sessionId` yet).
  - **Fork durability.** A dialog save that forks a library or legacy drill, or creates a new drill, produces an id the session does not reference until a session save sends it. Waiting for the 2-second autosave is not enough: if an earlier save failed, `hasUnsavedChanges` is already true and the autosave timer does not re-arm, so the fork would wait for an explicit Save and a coach leaving the page would lose the edit. So `useSessionDrillDialog`'s `onSaved` asks for a session save at once through `useSingleFlightSave.request`: it is queued behind an in-flight save, or published as a follow-up that runs after the render holding the new id. Editing a copy the session already owns keeps the same id and is left to autosave.
- **Instructions limit:** raised to 2000 in the UI to match the server.
- **`SessionDrillDialog`**: a full-screen MUI `Dialog` that hosts `PlayEditor`.
  - `PlayEditor` gets `lockTemplate` and a new `autoSave={false}` prop. Its built-in autosave would otherwise fork a new copy on every save.
  - The dialog has an "Also add to library" checkbox. It calls `copySessionDrillToLibrary` once per dialog opening, after the first successful save with the box checked, not on every save. If the session save succeeds and the library copy fails, `onSaved` still runs (the session has the change), the error is shown, and the next save retries the copy.
  - A drill dialog's state lives in `useSessionDrillDialog.ts`.
  - Entry points: "Edit diagram" on each drill card, and "New drill" next to "Add from library".
  - It is enabled only once the session has an id, and is disabled while the editor is saving or sharing (both "New drill" and "Edit diagram"). Creating a session redirects to its edit page (`/practice-planner/<id>/edit`, previously the detail page), where diagram editing is available.
- **Duplicate:** a button on the session detail view (admins only) and on the session list (`PracticePlannerList` takes a required `teamId`). `DuplicateSessionDialog` asks for the date (default: original date + 7 days, same local wall-clock time), then routes to the new session's edit page. The copy's title is "Copy of <title>", truncated to 100 characters.

## Error handling

- **The helper rejects a play the session can't use** → `ActionResult` error "One or more drills not found or do not belong to this session". A clone failure aborts the whole transaction, so a session is never half-saved.
  - The server text stays verbatim. When the editor gets exactly this message it appends "Reload the page to get the latest drills." (`describeSaveError` in `lib/utils/session-drill-ids.ts`): a library drill deleted while the editor still holds its id makes every save fail this way until the page is reloaded.
- **`saveSessionDrill` validation errors** show inside the dialog through `PlayEditor`'s existing save-error UI, and the dialog stays open.
- **An FK violation from `deletePlay` or `updatePlay`**, meaning a session referenced the play between the detach and the write (the deferred NO ACTION FK stays as defense in depth) → "This drill is still used by a session". The coach retries; the retry detaches the new reference. Because the FK is deferred, the violation surfaces when the action's `$transaction` commits, as a `DriverAdapterError` rather than a `P2003`; `isStillReferenced` matches both. The normal path (detach, then delete) is unaffected: it leaves no reference behind, so the commit check passes.
- **An unknown `clientKey` in a save response** is ignored. The next save re-sends the library id, which clones again; drop-only cleanup removes the extra row, because the earlier save referenced it.

## Testing

- **Helper** (Prisma mocked, fake transaction):
  - Owned plays are kept.
  - Library plays are cloned with `sourcePlayId`.
  - Legacy references are cloned.
  - A duplicated owned id is cloned once.
  - Another session's or another team's play is rejected.
  - Orphans this save dropped are deleted; a never-referenced copy survives.
  - Detach makes one copy per referencing session, copies the current content, and repoints the rows.
  - The mapping is keyed by `clientKey`.
- **Actions:**
  - Create and update return the mapping, and afterwards no session play points at a library play (I2).
  - Editing a library play detaches referencing sessions first, and their `playData` is unchanged afterwards.
  - Deleting a referenced play detaches it, then hard-deletes it. An unreferenced play is deleted directly. A play referenced by several sessions gets one copy per session.
  - `duplicatePracticeSession` copies drills and session-play fields, and never the venue, reservation, or shared flag. It includes the new-column guard test.
  - `saveSessionDrill` updates owned copies and forks non-owned ones.
  - `copySessionDrillToLibrary` creates a library play.
  - Library listings exclude session-owned plays.
- **Editor** (Testing Library):
  - `playId`s are swapped after a save.
  - Autosave is single-flight.
  - The drill dialog wiring works.
  - "Also add to library" calls the copy action.
  - "Edit diagram" is disabled before the first save.
  - Extracted components render as before.
- **Migration** applies against CI Postgres (ADR-0019).
- **Gates:** `bun run type-check`, `lint`, `test`, `build`.

## Risks

- **Row growth.** Each drill in each session is one `Play` row, and a thumbnail is typically ≤ ~30 KB. Drop-only cleanup and the session cascade keep it bounded. The only uncollected rows are dialog-created drills that were abandoned before any save; they go with their session.
- **Two shapes coexist** (legacy library references) until each session is next saved, or until the library drill is edited or deleted, which detaches it. Reads are identical. Library writes never leak into a legacy session.
- **Detach cost on library writes.** The library editor autosaves, so `updatePlay` runs the detach query on every save. Only the first save after a session last referenced the play actually clones; later saves find no rows (one `findMany` on `practice_session_plays.playId`, served by `practice_session_plays_playId_idx`; without that index it, orphan cleanup's `sessions: { none: {} }`, and every FK check on a play delete would scan the table). A library drill used by many old sessions makes its first edit or delete clone once per session, in one `createManyAndReturn` plus one `updateMany` per session.
- **Transaction length.** Clones run inside the venue-reservation transaction on Neon. `createManyAndReturn` keeps that to one round trip.
- **Editor refactor regressions.** Extract with no behavior change first, under the existing tests, before adding features.
- **Phase-2 coupling.** Ice area travels inside `playData` copies, and duplicate copies all session-play scalars.
- **Phase-3b coupling.** 3b's timeline uses phase 2's shared `session-timeline` module (one timeline module, not two).
