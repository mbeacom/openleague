# Practice Sessions: Drill Ownership, Inline Editing & Duplication — Design

**Date:** 2026-10-03
**Status:** Draft for review
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
- Existing sessions keep working without a data backfill. A session converts to owned copies on its next save.

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
}

model PracticeSession {
  // …existing…
  ownedPlays Play[] @relation("SessionOwnedPlays")
}
```

`PracticeSessionPlay.play` changes from `onDelete: Cascade` to `onDelete: NoAction`, as defense in depth:
- Deleting a session still works. The session cascade removes its session plays and owned plays in one statement, and NO ACTION is only checked at the end of the statement.
- A stray delete of a play that a session still references fails loudly (Prisma `P2003`) instead of silently removing the drill from that session.

Migration (`prisma/migrations/<timestamp>_session_owned_plays/migration.sql`):

```sql
ALTER TABLE "plays" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "plays" ADD COLUMN "sourcePlayId" TEXT;
CREATE INDEX "plays_sessionId_idx" ON "plays"("sessionId");
ALTER TABLE "plays" ADD CONSTRAINT "plays_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "practice_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plays" ADD CONSTRAINT "plays_sourcePlayId_fkey"
  FOREIGN KEY ("sourcePlayId") REFERENCES "plays"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "practice_session_plays" DROP CONSTRAINT "practice_session_plays_playId_fkey";
ALTER TABLE "practice_session_plays" ADD CONSTRAINT "practice_session_plays_playId_fkey"
  FOREIGN KEY ("playId") REFERENCES "plays"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
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
  | Retired | `false` | `null` | Hidden from the library; still readable through older sessions' references until those sessions are next saved |
  | Session-owned | `false` | set | A session's private copy |

## Server

### Helper: `materializeSessionDrills` (`lib/services/practice-session-drills.ts`)

It is not a Server Action. It runs inside the caller's transaction:

```ts
materializeSessionDrills(tx, { sessionId, teamId, userId, items })
// items: { playId, clientKey }[]
// returns: { clientKey, sequence, playId }[]
```

1. Load the referenced plays, restricted to this team.
2. Classify each item:
   - **Owned by this session:** keep it. A second occurrence of the same id is cloned.
   - **A library play, or a legacy play this session already references:** clone it.
   - **Anything else** (another session's copy, another team's play, or a missing play): reject the whole save.
3. Clone with `createManyAndReturn`:
   - Copy the name, description, thumbnail, and raw `playData`. The data may still be v1; reads upgrade it.
   - Set `isTemplate=false`, `sessionId=S`, and `createdById` = the current user.
   - Set `sourcePlayId` to the source's own `sourcePlayId` if it has one, otherwise to the source's id.
4. Return the `clientKey → playId` mapping.
5. After the session plays are rewritten, delete owned plays of S that are no longer referenced (orphan cleanup).

### Actions

- **`createPracticeSession` / `updatePracticeSession`**
  - Call the helper inside the existing transaction, before the session plays are created.
  - Play items gain `clientKey: z.string().max(64)`.
  - Return `plays: { clientKey, playId }[]` in `data`.
  - The existing team-ownership check on referenced plays moves into the helper.
  - Auth, validation, and reservation logic are otherwise unchanged.
- **New file `lib/actions/practice-session-drills.ts`** (`"use server"`, ADR-0002 `ActionResult` shape, `requireTeamAdmin`):
  - **`saveSessionDrill({ sessionId, teamId, playId?, name, description, thumbnail, playData })`**
    - If `playId` is owned by the session: update it.
    - Otherwise (a library play, a legacy reference, or a brand-new drill): create an owned copy, setting `sourcePlayId` when forking.
    - Returns `{ playId }`. Validates with `playDataSchema` and the existing play field schemas. Sends no email. Does not touch session plays; the next session save persists the reference.
  - **`copySessionDrillToLibrary({ playId, teamId })`**: creates a new library play from an owned copy.
  - **`duplicatePracticeSession({ id, teamId, date })`**
    - Creates a new session titled "Copy of …" with the same `duration`. It is unshared, with no venue, surface, segment, `startAt`, or reservation (ADR-0007).
    - Clones every drill into the new session's owned plays.
    - Copies every session-play scalar except ids and foreign keys, so columns added later (e.g. phase 2b's `runsWithPrevious`) are carried over. A test fails if a new column is not copied.
    - Returns the new session's id.
- **`deletePlay`** (`lib/actions/plays.ts`)
  - Inside a transaction: if any session play references the play, retire it (`isTemplate=false`) instead of deleting it. Otherwise delete it.
  - The dialog copy becomes: "Sessions that use this drill keep their copy."
- **Library listings** keep filtering on `isTemplate: true`, and also on `sessionId: null`, so owned and retired plays never appear in the library.

## Components

- **Split `PracticeSessionEditor.tsx` (~1600 lines) first, with no behavior change**, under the existing tests:
  - `SessionDrillCard.tsx`, extracted from `PlayCard`. It shows the drill's name instead of "Play {n}", plus duration, instructions, and an "Edit diagram" button.
  - `VenueBookingFields.tsx` and a `useVenueBooking` hook, extracted from the booking state and UI.
  - Target: the editor ends up under 900 lines.
- **`PlayInSession`** gains `name: string` and `clientKey: string`.
  - `playId` is replaced from the mapping each save returns.
  - Saves are single-flight: autosave is skipped while a save is in flight, and a "dirty again" ref triggers one follow-up save.
- **Instructions limit:** raised to 2000 in the UI to match the server.
- **`SessionDrillDialog`**: a full-screen MUI `Dialog` that hosts `PlayEditor`.
  - `PlayEditor` gets `lockTemplate` and a new `autoSave={false}` prop. Its built-in autosave would otherwise fork a new copy on every save.
  - The dialog has an "Also add to library" checkbox, which calls `copySessionDrillToLibrary` after a successful save.
  - Entry points: "Edit diagram" on each drill card, and "New drill" next to "Add from library".
  - It is enabled only once the session has an id. Creating a session redirects to its edit page, where diagram editing is available.
- **Duplicate:** a button on the session detail view (admins only) and on the session list. A dialog asks for the date (default: original date + 7 days), then routes to the new session's edit page.

## Error handling

- **The helper rejects a play the session can't use** → `ActionResult` error "One or more drills not found or do not belong to this session". A clone failure aborts the whole transaction, so a session is never half-saved.
- **`saveSessionDrill` validation errors** show inside the dialog through `PlayEditor`'s existing save-error UI, and the dialog stays open.
- **A `P2003` from `deletePlay`** (a referenced play) → "This drill is still used by a session". Retire-on-delete should make this unreachable.
- **An unknown `clientKey` in a save response** is ignored. The next save re-sends the library id, which clones again; orphan cleanup removes the extra row.

## Testing

- **Helper** (Prisma mocked, fake transaction):
  - Owned plays are kept.
  - Library plays are cloned with `sourcePlayId`.
  - Legacy references are cloned.
  - A duplicated owned id is cloned once.
  - Another session's or another team's play is rejected.
  - Orphans are deleted.
  - The mapping is keyed by `clientKey`.
- **Actions:**
  - Create and update return the mapping, and afterwards no session play points at a library play (I2).
  - `deletePlay` retires referenced plays and deletes unreferenced ones.
  - `duplicatePracticeSession` copies drills and session-play fields, and never the venue, reservation, or shared flag. It includes the new-column guard test.
  - `saveSessionDrill` updates owned copies and forks non-owned ones.
  - `copySessionDrillToLibrary` creates a library play.
  - Library listings exclude owned and retired plays.
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

- **Row growth.** Each drill in each session is one `Play` row, and a thumbnail is typically ≤ ~30 KB. Orphan cleanup and the session cascade keep it bounded.
- **Two shapes coexist** (legacy library references) until each session is next saved. Reads are identical; only the save path differs, and it converges after one save.
- **Transaction length.** Clones run inside the venue-reservation transaction on Neon. `createManyAndReturn` keeps that to one round trip.
- **Editor refactor regressions.** Extract with no behavior change first, under the existing tests, before adding features.
- **Phase-2 coupling.** Ice area travels inside `playData` copies, and duplicate copies all session-play scalars.
- **Phase-3b coupling.** 3b's timeline uses phase 2's shared `session-timeline` module (one timeline module, not two).
