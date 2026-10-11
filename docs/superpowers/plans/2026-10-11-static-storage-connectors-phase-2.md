# Storage Connectors Phase 2 (Local Connector) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A coach can save a practice plan or a rankings document to a local file and keep saving to it, with every collision detected and turned into a choice (keep mine, use theirs, keep both), and "Download" writes wrapped files. Phase 2 ships in two pull requests: **2a**, the connector seam with no real provider, and **2b**, the Local connector and its screens.

**Architecture:** `apps/planner/src/storage/` holds the `StorageConnector` interface (`connector.ts`), a sync engine over connectors, the link table and the local working copies (`sync.ts`), and an in-memory connector for tests (`fake.ts`). IndexedDB version 7 adds a `links` store (`store/links.ts`) and a `rankings` store keyed by id, which takes over the single rankings record from `meta`. The file readers gain variants that return the envelope `id` and `updatedAt`, with `File.lastModified` as the fallback time. 2b adds `storage/local-file.ts` (the File System Access tier and the download tier), store adapters for the engine, and the "Save to…", "Open from…" and conflict screens.

**Tech Stack:** TypeScript, Zod v4, IndexedDB (fake-indexeddb in tests), Web Crypto (`crypto.subtle` for the base hash), Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-07-static-storage-connectors-design.md` (R3, R4, R7, "The StorageConnector interface", "Sync and conflicts", Phasing row 2, Testing). **ADR:** ADR-0022 (proposed).

## Global Constraints

- The static app never imports `next/*`, `lib/actions` or `@prisma/client`. `apps/planner/**` is in the ESLint `adr-0020/portable-practice-planner` block, and `storage/sync.ts` and `storage/fake.ts` join the portability test's entries until the app itself reaches them.
- No OpenLeague server is involved. Connectors move text; parsing stays in `lib/document-envelope` and `lib/document-formats`.
- No real league or team names anywhere: fixtures use made-up programs and 9xx team numbers.
- Every IndexedDB change is additive and keeps data; a version bump makes a tab on an older build reload before it can write.
- Always `bun`. Gates: `bun run type-check`, `bun run lint` (0 errors), `bun run test`, `bun run planner:build && bun run planner:check`, `bun run adr:lint`.

## Owner decisions this plan follows

- **Download writes wrapped files starting with this phase** (spec open question 7). The hosted reader shipped in phase 1, so no current reader is left behind.
- **The hosted plan export writes the envelope too** (open question 5). It lands in 2b with the static Download change, so both apps start writing wrapped files together.
- **OneDrive accepts personal and work or school accounts** (open question 4, revised 2026-10-11 after publisher domain verification). This affects phase 4a, not phase 2; the app folder still needs a live check on a work or school account.

## Rulings

Where the spec leaves a choice open, this plan decides it:

1. **IndexedDB version 7, not 5.** Versions 5 and 6 went to practice equipment and the practice roster. One upgrade adds both new stores: `links` (keyPath `docKey`) and `rankings` (keyPath `id`).
2. **Moving the rankings record.** The upgrade reads `meta["rankings"]` in the upgrade transaction. A non-null value becomes the first `rankings` record, exactly as stored, so a record that failed parsing before still reports itself and the screen still offers "Start over". A cleared record (null) moves as nothing. The meta key is deleted either way. The moved record gets a fresh UUID as both its local `id` and its `documentId`, and the upgrade time as `createdAt` and `updatedAt` (the meta record kept no time).
3. **Schema steps run only up to the version being opened.** From version 7 on, a step that changes the schema checks `db.version`, so tests (and any future partial upgrade) that open an older version don't create stores early.
4. **Rankings record shape.** `{ id, documentId, document, createdAt, updatedAt }`. `id` is the local key, as the hosted app keys its records by id (ADR-0025); `documentId` is the envelope id, equal to `id` when the record is made, replaced only by "Keep both". `document` is validated on every read.
5. **"The" rankings document.** The screens keep the one-document `RankingsOps` seam (hosted implements it too, so it does not change). Locally, it reads and writes the most recently updated record (ties by creation time, then id); saving updates that record in place; "Start over" (`clearRankings`) deletes it and its link. `RankingsDocumentOps` (`list`, `get`, `create`, `save`, `delete` by id) is static-only and is what the connector screens will use.
6. **Link records.** Exactly the spec's `DocumentLink`. `docKey` is `${kind}:${localId}`. A stored link that fails a shape check reads as no link, so a damaged record never breaks a save. Deleting a document deletes its link; the remote file is left alone.
7. **Dirty.** A document has unsaved changes when its link's `dirty` flag is set (a local edit calls `noteLocalEdit`) **or** the SHA-256 of its payload no longer matches `baseHash`. The hash catches an edit made through a path that forgot to set the flag.
8. **The engine's operations.** `saveNew`, `openLinked`, `check`, `recheck` (at most once a minute per document), `save`, `resolve` and `noteLocalEdit`. A "Save" with no edits is a check, so an overwrite is still noticed. "Use theirs", and opening a file over an existing working copy, keep the replaced copy through `LocalDocuments.recover` ("Recovered copies"). A silent refresh ("Newer copy available") does not, because the remote already holds that copy.
9. **Keep both.** The new file's name is the linked file's name with " (my copy)" before its document extension (`fall (my copy).rankings.json`). The working copy takes the new envelope id and the link moves to the new file.
10. **What a connector save writes.** The JSON envelope (`serializeDocument`). Writing a remote `.yaml`, `.toml` or `.jsonc` file in its own format is 2b's job, alongside the Local connector, which is the first connector that can hold such a file.
11. **The fake connector.** One `FakeRemote` per provider storage, one `createFakeConnector` per device. Both conditional-write modes. A `beforeWrite` hook runs after the revision check and before the write (check-then-write), or before the atomic compare-and-set (atomic), so the race test can interleave two saves step by step.
12. **Readers.** `readPlanFile` and `readRankingsFile` keep returning only the document, so no caller changes. New `readPlanFileDocument` and `readRankingsFileDocument` also return `id`, `updatedAt` and `wrapped`, and pass `File.lastModified` (through `fileSource`) as `source.modifiedAt`. `readAnyDocumentText` already threads `source` and returns `id`.

## File Structure

| File | Responsibility | PR |
|---|---|---|
| Create `apps/planner/src/storage/connector.ts` | `StorageConnector`, `RemoteRef`, `RemoteFile`, `ConnectorError`, `Result` | 2a |
| Create `apps/planner/src/storage/sync.ts` | `syncStateOf`, `linkFromRemote`, `copyName`, `hashPayload`, `createSyncEngine` | 2a |
| Create `apps/planner/src/storage/fake.ts` | `createFakeRemote`, `createFakeConnector` | 2a |
| Create `apps/planner/src/store/links.ts` | `docKeyOf`, `isDocumentLink`, `createLinkStore` | 2a |
| Modify `apps/planner/src/store/records.ts` | `StoredRankings`, `DocumentLink`, the `RepoTx` methods for both stores | 2a |
| Modify `apps/planner/src/store/idb-repo.ts` | Version 7: the two stores and the move out of meta | 2a |
| Modify `apps/planner/src/store/memory-repo.ts` | The same two tables | 2a |
| Modify `apps/planner/src/store/rankings.ts` | Rankings by id; `RankingsOps` over the current record | 2a |
| Modify `apps/planner/src/store/types.ts` | `LocalPlannerStore` gains `RankingsDocumentOps` | 2a |
| Modify `lib/plan-document/file.ts`, `lib/rankings-document/file.ts`, `lib/document-formats/read.ts` | `read…FileDocument`, `fileSource` | 2a |
| Create `apps/planner/src/storage/local-file.ts` | The File System Access tier and the download tier (R7) | 2b |
| Create `apps/planner/src/storage/documents.ts` | `LocalDocuments` over the store: sessions and rankings, recovered copies | 2b |
| Create `apps/planner/src/screens/storage/` | "Save to…", "Open from…", the conflict dialog, connections | 2b |
| Modify the static Download and the hosted plan export | Write the envelope | 2b |

---

## PR 2a: docs and the connector seam

### Task 1: Docs

- [x] ADR-0022: tick action item 1 (phase 1 shipped in #442); correct "IndexedDB v5" to v7. Its status stays `proposed`.
- [x] Spec: correct the version in R3, Architecture and Phasing; record the owner's answers to open questions 4, 5 and 7.
- [x] This plan.

### Task 2: The connector interface and the fake

- [x] `connector.ts` exactly as the spec's interface.
- [x] `fake.ts`, and `describeConnectorContract(name, make)` in `__tests__/apps/planner/storage/connector-contract.ts`: create then open returns the same text; a stale `expectedRevision` is a `conflict` carrying the remote's revision; saving with that revision succeeds ("Keep mine"); a rename doesn't move the revision; `not-found` after a remote delete; `auth-required` when the token is withdrawn, until `connect`; `offline`; `list` filters by kind; a cancelled pick returns `[]`. It runs against the fake in both modes.

### Task 3: IndexedDB version 7

- [x] The `links` and `rankings` stores, the move out of meta (Ruling 2), and the `RepoTx` methods on both repos.
- [x] Tests in `__tests__/apps/planner/repos.test.ts`: version 7; a tab still open at version 6 reloads first; the version 6 record moves (other meta keys and sessions untouched); the store still shows it, and a damaged one still reports damaged; a cleared record moves as nothing; a version 6 database with no rankings gets none; a fresh install has all five stores with the right key paths; both repos store and delete rankings records and links.

### Task 4: Rankings by id and the link table

- [x] `rankings.ts` (Ruling 5) and `links.ts` (Ruling 6).
- [x] Tests: the existing rankings store tests unchanged in substance (the damaged record is now written to the rankings store); several documents by id, the current one being the most recently updated; deleting or clearing drops the link; the link table on both repos, a damaged link reading as none.

### Task 5: The sync engine

- [x] `sync.ts` (Rulings 7–10).
- [x] State-table tests in `__tests__/apps/planner/storage/sync.test.ts`: every combination for `syncStateOf`, then each row through the engine against the fake (in sync, unsaved, newer copy available, overwritten, conflict), plus Keep mine (including a third write after the dialog opened), Use theirs (a recovered copy), Keep both (a new id and file), offline, the once-a-minute re-check, a rename, an unreadable remote, a bare file, and opening over an existing copy.
- [x] The race, step by step, in `sync-race.test.ts`, in check-then-write mode and in atomic mode, exactly as the spec's Testing section describes.

### Task 6: Readers

- [x] `readPlanFileDocument`, `readRankingsFileDocument`, `fileSource` (Ruling 12), with tests for wrapped and bare files, every format, and a file with no usable time.

### Task 7: Gates

- [x] `bun run type-check`, `bun run lint`, `bun run test`, `bun run planner:build && bun run planner:check`, `bun run adr:lint`.

---

## PR 2b: the Local connector

### Rulings made in 2b

13. **Recovered copies live in meta**, under `recoveredCopies`, not a version 8 store. The list is small and rarely written, and older builds never read the key, so no version bump (and no forced reload of other tabs) is needed. Each entry keeps the bare document, its title, its document key and envelope id, and when it was replaced. Boot drops entries older than 30 days.
14. **File handles live in meta too**, under `fileHandles`, by the Local connector's own file id. A handle is not a credential (the browser asks again after a reload). Boot drops handles no link uses.
15. **Two connector error codes are added**: `cancelled` (the coach dismissed the save picker; nothing was written) and `unwritable` (the file's format can't hold the document, such as TOML and a null inside a drill diagram; the message is the encoder's own). Neither carries provider text.
16. **The contract's offline case is optional.** A local file has no network; the Local connector's subject leaves `goOffline` out and that case is skipped. A drive that can't be read reports `unavailable`.
17. **The Local connector's revision is `lastModified:size:digest`**, all from one `getFile()`, where the digest is a SHA-256 of the file's text. Size and time alone miss a same-size edit inside the timestamp's resolution; the digest catches it.
18. **The base hash is taken from the working copy as the store reads it back** after a refresh or an open, not from the remote's payload. A practice's plan is rebuilt from the store (as "Download plan file" builds it, with the practice's last edit as `exportedAt`), so the two can differ in form without any edit.
19. **Connector saves leave roster names out**, as the plan URL fragment does (roster spec R10's default). A file opened with names keeps them in this browser; a later save from here writes positions only. Offering the "Include player names" choice on Save to… is a follow-up.
20. **Hosted exports derive their id** from the record: SHA-256 of a namespace and the record id, shaped as a version 8 UUID (`derivedDocumentId`), so every download of one hosted session or rankings record carries the same id. The static planner keeps a stored id per document. The hosted rankings export is wrapped too: the rankings screens are shared, and the hosted rankings import already reads both forms.
21. **Every download format is wrapped**: JSON, YAML, TOML and JSONC all carry the envelope, so an id survives whichever format the coach picks. The wrapper's own indentation counts against a wrapped file's allowance (the kind's limit plus 4 KB); "Download plan file" warns when a plan near the limit no longer fits once wrapped.
22. **Where a download is the only option (no File System Access API), the screens say so**: saving downloads a copy, later changes stay in the browser, and opening a file imports a copy.

### Task 8: Store adapters

- [x] `storage/documents.ts`: `LocalDocuments` for rankings (over `RankingsDocumentOps`) and sessions (a session's plan document is built and imported through the existing plan functions). Sessions need an envelope id: add an optional `documentId` to `StoredSession`, made on first save to a connector or first wrapped download and kept for the session's life.
- [x] Recovered copies: meta (Ruling 13), with the 30-day sweep on boot.
- [x] Every store write to a linked document marks its link dirty in the same transaction (`noteLocalEditInTx`): practice saves, a practice's drill edits, rankings saves. Deleting a practice drops its link.

### Task 9: The Local connector (R7)

- [x] File System Access tier: `showSaveFilePicker` / `showOpenFilePicker`, handles stored in IndexedDB, permission asked before each read or write (a check without a tap reports `auth-required`, and the screen offers "Allow access"), revision from `lastModified`, size and a content digest (Ruling 17), check-then-write.
- [x] Download tier: no link, no conflict detection; an opened wrapped file whose `id` matches a local document offers "Replace my copy" or "Keep both" (the import screen for plans, "Open rankings file" for rankings, and "Open from…" for a linked open).
- [x] The contract suite over a fake file handle.
- [x] Saves in the linked file's own format (Ruling 10), including a format the coach types into the save picker.

### Task 10: Wrapped writes

- [x] Static "Download plan file" and the rankings download write the envelope, with the document's id; YAML, TOML and JSONC too (Ruling 21).
- [x] The hosted plan export writes the envelope (owner decision), with a derived id (Ruling 20). The plan URL fragment stays bare.

### Task 11: Screens

- [x] "Save to…", "Open from…", the conflict dialog (both sides' "last saved", and who saved theirs where known), the overwritten wording, and a Saved files page (where this browser can save, linked files with Unlink, Recovered copies). Phone width, 44px targets; without the File System Access API (mobile Safari, Firefox) the menus offer the download tier and say what it can't do. Google Drive and OneDrive will join the same menus when configured and are absent otherwise.

### Task 12: Gates and ADR

- [x] The existing gates, plus a build check that the Saved files screen stays out of the entry chunk. The storage bar and the engine are in it: a practice's page needs them on open.
- [ ] Tick ADR-0022 action item 2 when 2b merges. Its status remains the owner's call.
