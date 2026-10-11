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

---

## Phase 3: Google Drive, and the build variables for every cloud connector

**Goal:** A coach can save a practice plan or a rankings document to their own Google Drive, open it on another device or browser, open a file another coach shared through the Google Picker, and keep every save conflict-checked, all from the browser with no OpenLeague server. Forks that set no variables build exactly what they built before.

**Spec:** R4, R5, R8, R9, Security and privacy (CSP), Sync and conflicts, Phasing row 3, Owner prerequisites. **Owner setup:** done (the `github-pages` environment holds the three ids as variables and the API key as a secret; Google is in Testing mode with `drive.file` only).

### Rulings made in phase 3

23. **One module resolves the cloud variables.** `apps/planner/cloud-config.ts` is pure and build-time, like `ai-origins.ts`: `resolveCloudSettings(process.env)` reads `OPENLEAGUE_GOOGLE_CLIENT_ID`, `OPENLEAGUE_GOOGLE_API_KEY`, `OPENLEAGUE_GOOGLE_APP_ID` and `OPENLEAGUE_MICROSOFT_CLIENT_ID`. The Vite config passes the result to the CSP and, as four string constants, to the app (`GOOGLE_DRIVE_SETTINGS` and `ONEDRIVE_SETTINGS` in `src/config.ts`). A provider with some but not all of its values, or a value of the wrong shape, fails the build without echoing the value.
24. **CSP additions are per provider and exact.** `googleCsp` and `microsoftCsp` return each provider's sources by directive; `plannerCsp(origins, { cloud })` appends them. With no provider the policy is byte-identical to the one before (a test pins the literal). `frame-src` appears only when a provider adds frames, and then starts with `'self'`. `microsoftCsp` is keyed on `OPENLEAGUE_MICROSOFT_CLIENT_ID` and holds the spec's list; phase 4a owns any change to it (whether personal sign-in passes through `login.live.com`, and where Graph content downloads redirect).
25. **Google hosts, confirmed 2026-10-11** against Google's GIS setup page ("Content Security Policy"), the Picker web guide and the Picker sample: `script-src https://apis.google.com https://accounts.google.com/gsi/client`; `style-src https://accounts.google.com/gsi/style`; `connect-src https://accounts.google.com/gsi/ https://www.googleapis.com https://content.googleapis.com https://oauth2.googleapis.com`; `frame-src 'self' https://docs.google.com https://accounts.google.com/gsi/ https://content.googleapis.com`. Google publishes no CSP list for the Picker; its frame host (`docs.google.com`) and loader host (`apis.google.com`) come from the guide and sample, and the owner's manual check confirms nothing else is blocked.
26. **The API key needs `https://docs.google.com/*` in its referrer list.** The Picker guide says a website-restricted key fails with "API developer key is invalid" without it, because the Picker checks the key from its `docs.google.com` frame. This is an owner action on the existing key.
27. **Lazy by construction.** `storage/google-drive-lazy.ts` (entry chunk) is a stand-in that `import()`s `storage/google-drive.ts` on first use. The service creates it only behind the build constant, so a build without Google settings folds the branch away and emits neither the stand-in nor the chunk. `PLANNER_CSP` is marked pure so the app's import of `build-config.ts` doesn't carry the policy's host strings into the bundle.
28. **Drive REST through `fetch`.** No gapi client library: metadata and content from `www.googleapis.com/drive/v3`, multipart uploads to `www.googleapis.com/upload/drive/v3`, the token in the `Authorization` header only. Every overwrite reads the file's metadata immediately before the multipart `PATCH` and refuses if `headRevisionId` moved; a file whose `capabilities.canEdit` is false is refused as `forbidden` before any write. An open reads metadata first, then content, so a write landing between the two leaves the older revision recorded and the next save reports a conflict instead of overwriting unseen content. A trashed file counts as `not-found`.
29. **Error mapping.** 401 drops the token and is `auth-required`; 403 is read for Drive's reason only (rate limits are `unavailable` with `Retry-After`, `storageQuotaExceeded` is `quota`, `appNotAuthorizedToFile` is `not-found`, anything else `forbidden`); 404 `not-found`; 413 `too-large`; 429 and 5xx `unavailable`; a rejected `fetch` is `offline`; anything else `provider` with the status. No provider text leaves the connector.
30. **Tokens.** The GIS token model with `prompt: ""`, in the connector's closure only, treated as expired a minute early. Granular consent that leaves `drive.file` unticked is `auth-required`. Disconnect revokes the token (`google.accounts.oauth2.revoke`) and keeps every link.
31. **Sign-in happens inside the tap that needs it.** `connector.prepare()` (a new optional `StorageConnector` method) loads the chunk, the GIS client and the Picker when the "Save to…" or "Open from…" menu opens, so the popup opens while the browser still counts the tap. "Save to… → Google Drive…", "Save", "Allow access", "Open from… → Google Drive…" and Saved files' Connect call `connect()` first when the connector is disconnected. The privacy note says that opening those menus loads Google's sign-in and picker when Google Drive is available.
32. **Files go in an "OpenLeague" folder** the app creates, tagged `olFolder: documents`; each file carries `olKind` and `olId`. Listing queries `olKind` (one kind, or every registered kind joined with `or`), newest first, across pages.
33. **"Save a copy to my Drive" (R8)** is the sync engine's `saveCopy`: the "Keep both" path without a conflict (a new envelope id, `<name> (my copy)`, relinked). The storage bar offers it when a save fails as `forbidden`.
34. **The Pages build job reads the `github-pages` environment with `deployment: false`.** Environment variables and secrets are readable only by a job that names the environment; `deployment: false` (GitHub's "using environments without deployments") reads them without recording a second deployment. Required reviewers, wait timers and any branch rule on the environment still apply to such a job; the build runs on pushes to main, the branch Pages deploys from. A custom deployment protection rule (a GitHub App) would fail it, since those need a deployment object; the environment has none. The values reach only the planner build and bundle check steps (the check needs them to verify the CSP). `scripts/validate-deployment-config.ts` asserts this wiring.

### Files

| File | Responsibility |
|---|---|
| Create `apps/planner/cloud-config.ts` | `resolveCloudSettings`, `googleCsp`, `microsoftCsp`, `cloudCspAdditions` |
| Modify `apps/planner/build-config.ts`, `vite.config.ts`, `src/config.ts`, `src/env.d.ts` | The CSP additions and the app constants |
| Create `apps/planner/src/storage/google-drive-lazy.ts` | The entry-chunk stand-in; `GOOGLE_DRIVE_CAPABILITIES` |
| Create `apps/planner/src/storage/google-drive.ts` | The connector, the GIS token client and the Picker (lazy chunk) |
| Modify `apps/planner/src/storage/connector.ts`, `sync.ts`, `service.ts` | `prepare?`, `saveCopy`, Drive in the service when configured |
| Create `apps/planner/src/screens/storage/connection.ts`, `CloudConnections.tsx` | Sign-in from the tap; Connect and Disconnect on Saved files |
| Modify `DocumentStorageBar.tsx`, `OpenFromMenu.tsx`, `StorageScreen.tsx`, `messages.ts` | The menus, "Save a copy to my Drive", the wording |
| Modify `scripts/check-planner-build.ts`, `scripts/validate-deployment-config.ts`, `.github/workflows/docs-pages.yml` | The bundle check (whole CSP, Google lazy and absent when unset), the workflow wiring |
| Modify `DEPLOYMENT.md` | "Cloud saving for forks" |

### Tasks

- [x] Build variables, CSP additions, workflow wiring and the validator, with tests for each provider's exact hosts and the unset case.
- [x] The Drive connector over a fake Drive (`__tests__/apps/planner/storage/fake-drive.ts`): the connector contract, check-then-write with the metadata read before every overwrite, `headRevisionId`, appProperties listing across pages, the folder, view-only shares, the error table, token expiry and revocation, the Picker inputs, and the lazy stand-in.
- [x] The screens: Google Drive only when configured, sign-in from the tap, "Save a copy to my Drive", opening a picked file as a linked document, Connect and Disconnect.
- [x] `bun run planner:build && bun run planner:check` with no variables (no Google code or host anywhere in the output) and with fictional values (the Google hosts in the CSP, the connector in its own chunk).
- [ ] Owner: add `https://docs.google.com/*` to the API key's website restrictions (Ruling 26).
- [ ] Owner: the manual check below, once on desktop and once on a phone, with test users while the app is in Testing mode.

### Manual check (owner, real Google accounts)

1. **Connect.** On openleague.dev/planner, open Saved files and tap Connect Google Drive. The Google popup asks only to "see, edit, create and delete only the specific Google Drive files you use with this app". Saved files says "connected in this tab". No errors in the console (in particular, no CSP violations).
2. **Save.** On a practice, Save to… → Google Drive…. An "OpenLeague" folder appears in Drive with the file in it; the bar says "Saved to … in Google Drive". Edit the practice, tap Save, and confirm Drive shows a new version.
3. **Second browser.** In another browser (or a phone), Open from… → Google Drive… and pick the file. It opens as a linked practice. Edit and save there.
4. **Conflict.** Back in the first browser, edit without reloading, then Save: the conflict dialog appears. Try Keep mine, Use theirs (a Recovered copy appears) and Keep both (a "(my copy)" file appears in Drive).
5. **Overwritten.** Save in browser A, then save in browser B without A editing. Focus browser A: it says the save was replaced and offers the choice; it never refreshes silently.
6. **Share read-only, then Save a copy.** Share the file with a second test user as Viewer. As that user, Open from… → Google Drive… (the file is under "Shared with me"), edit, Save: the bar says the file may be view-only and offers "Save a copy to my Drive", which writes "(my copy)" into that user's own OpenLeague folder and links to it.
7. **Expiry.** Leave a tab open for more than an hour, then Save: the bar asks for permission; Allow access reopens Google's popup and the save completes.
8. **Disconnect.** Saved files → Disconnect Google Drive. The note links to the Google Account's third-party connections page; the app is still listed there until removed. Saving again asks to connect. Remove the app's access on that page and confirm the next connect shows consent again.
9. **A fork-style build.** `bun run planner:build` with no variables shows no Google Drive item anywhere and the CSP has no Google host.

---

## Phase 4a: OneDrive (app folder)

Spec R6, R8, R9, "Security and privacy" (CSP), "Sync and conflicts", Phasing row 4a, and the Microsoft Entra prerequisites. The owner's Entra registration is done: any organizational directory and personal accounts, publisher domain verified, SPA redirect URIs `https://openleague.dev/planner/auth/redirect.html` and `http://localhost:5173/planner/auth/redirect.html`, delegated `Files.ReadWrite.AppFolder` and `User.Read`, no secret. The client id is the build variable `OPENLEAGUE_MICROSOFT_CLIENT_ID`.

### Rulings made in 4a

35. **MSAL is `@azure/msal-browser` 5.23.0, pinned exactly.** The newest release at least two weeks old when 4a was written; 5.24.0 and 5.25.0 were younger. It is the only new runtime dependency and loads only through `import()`.
36. **The entry chunk holds a stand-in, not the connector.** `storage/onedrive-loader.ts` implements `StorageConnector` and loads `storage/onedrive.ts` (MSAL and Graph) on first use. Its status is "disconnected" until MSAL has read its cache. Its `prepare()` (phase 3's optional method, Ruling 31) loads the chunk and lets MSAL read its cache, so by the time the coach taps "OneDrive…" in a menu that called `prepareConnectors`, the sign-in popup opens inside that tap. The service creates it only when `ONEDRIVE_SETTINGS` is set (Ruling 23), written against the build constant so an unset build drops the connector's chunk.
37. **Sign-in.** Authority `https://login.microsoftonline.com/common` (both account types), cache in `sessionStorage`, `redirectUri` and `postLogoutRedirectUri` both the redirect page, computed from the page's own address (`new URL("auth/redirect.html", location.href)`), so forks on a subpath need no code change. A menu item for a connector that isn't connected signs in first through phase 3's `connectIfNeeded` (a popup). Every Graph call gets its token from `acquireTokenSilent`; when that needs interaction, a popup opens only if the browser reports user activation (a check on focus never opens one) and the call otherwise reports `auth-required`, which the storage bar turns into "Allow access".
38. **Graph calls.** The app folder is `/me/drive/special/approot`. Create: `PUT approot:/{name}:/content?@microsoft.graph.conflictBehavior=fail`; a 409 tries "name (2).kind.ext" up to (9), because OneDrive's own `rename` ("fall.rankings 1.json") breaks the document extension. Overwrite: `PUT /me/drive/items/{id}/content` with `If-Match: <cTag>`; 412 is a conflict carrying the current item. The revision is the cTag (content only; a rename moves the eTag). A 401 renews the token once (`forceRefresh`) and retries. Paged listing follows `@odata.nextLink` only when it is a Graph URL.
39. **Reads use `@microsoft.graph.downloadUrl`.** Graph's `/content` answers with a 302 that a browser refuses after a CORS preflight (Microsoft's documented limitation), so `open` reads the item's metadata with the download URL, fetches that pre-authenticated URL without a token, cookies or referrer, then reads the metadata again; if the cTag moved in between it reads again (at most three times), so a link's base revision always matches the text it holds. The URL is a bearer link and is never stored or logged.
40. **Error codes.** 401 after renewal → `auth-required`; 403 → `forbidden`; 404/410 → `not-found`; 413 → `too-large`; 507 → `quota`; 429/503/509 → `unavailable` with `retryAfterSeconds` from `Retry-After` (seconds or an HTTP date); a network failure → `offline`; anything else → `provider` with the status. MSAL's `user_cancelled` → `cancelled`.
41. **Work or school accounts get their own error.** A new `ConnectorError` code, `app-folder-unavailable`, is returned when an app-folder call (connect, list, create) fails with 400, 403, 404 or 501 for an organizational account. "Connect" opens the app folder right after sign-in so the coach hears it at once. The message says the organization may not allow it and offers a local file or a personal account. The same refusal for a personal account stays `forbidden`.
42. **Open from… lists the folder.** OneDrive has `list` and no picker in 4a, so "Open from… → OneDrive…" signs in if needed and shows the app folder's files of that kind (newest first) in a dialog; choosing one continues exactly as a picked file does (id match → "Replace my copy" / "Keep both").
43. **Disconnect** is phase 3's Saved files row (`CloudConnections`), with OneDrive's account type in its status. It clears MSAL's cache for the account (`clearCache`; no logout popup, no Microsoft session sign-out), keeps the links, and links to where access is removed: `https://account.live.com/consent/Manage` for a personal account, `https://myapps.microsoft.com/` for work or school (both when the account type is unknown). `CONNECTOR_ACCOUNT_PAGES.onedrive` is the personal page; `ONEDRIVE_WORK_ACCOUNT_PAGE` the other. The row also notes that sharing is download-and-open in 4a (spec R8), and reads MSAL's cache on mount, because a OneDrive session survives a reload.
44. **CSP.** Only when the client id is set, through phase 3's `microsoftCsp()` in `cloud-config.ts` (Ruling 24), which 4a extends: `connect-src` gains `https://login.microsoftonline.com https://graph.microsoft.com https://*.files.1drv.com https://my.microsoftpersonalcontent.com https://*.sharepoint.com` (the last three are where download URLs point: personal OneDrive's content hosts and a tenant's SharePoint host); `frame-src 'self' https://login.microsoftonline.com https://login.live.com` is added. `login.live.com` is listed because a personal account's sign-in through `/common` hands off to it, and the silent-renewal iframe's navigation would otherwise be blocked; Microsoft documents no CSP host list, so the manual checklist confirms it. Unset, the policy is byte-for-byte the one before connectors.
45. **The redirect page** is `apps/planner/auth/redirect.html`, a second Vite input, loading only `src/auth/redirect.ts`, which calls MSAL's `broadcastResponseToMainFrame()` from `@azure/msal-browser/redirect-bridge`. It carries the same CSP meta, a static title, and nothing of the app. It is a build input only when the client id is set, so a build without it is unchanged (R9). The dev server now serves the planner at `/planner/` so the dev redirect URI matches its registration.

### Task 13: The connector

- [x] `storage/onedrive.ts`: `createMsalAuth`, `createOneDriveConnector`, `createOneDriveFromConfig` (Rulings 37–41).
- [x] `storage/onedrive-loader.ts` (Ruling 36); `service.ts` adds OneDrive next to Google Drive, only when `ONEDRIVE_SETTINGS` is set.
- [x] The contract suite over a fake Graph (`fake-graph.ts`: eTag/cTag, `If-Match`/412, 409 on create, paged children, pre-authenticated downloads, 401, throttling) with a fake MSAL client; plus `If-Match` on every overwrite, the cTag as revision, the re-read on a mid-open change, the token never leaving Graph, the work-account error, and the popup only from a tap.

### Task 14: Screens

- [x] "Save to…" and "Open from…" sign in from the tap; "Open from…" lists the app folder (Ruling 42); Saved files has Connect and Disconnect (Ruling 43). Phone width, 44px targets.

### Task 15: Build

- [x] Microsoft's hosts in `microsoftCsp()` (Ruling 44); the redirect entry (Ruling 45).
- [x] `planner:check`: with the client id set, connect-src and frame-src must be exactly the connector's; without it, no OneDrive host and no frame-src. MSAL (by one of its error codes) must never be in index.html's entry chunk, and must be in the bundle when the connector is built. `auth/redirect.html` is required when the connector is built (a CSP, the bridge, and none of index.html's own script or app code), and neither the page nor the bridge may be in a build without it.
- [x] Gates with no variables, with Google and Microsoft values, and with Microsoft only. The Pages workflow already passes `OPENLEAGUE_MICROSOFT_CLIENT_ID` (phase 3, Ruling 34).

### Task 16: Manual checklist (owner, real accounts)

CI makes no calls to Microsoft. Before 4a is announced, on the deployed site, on desktop Chrome, desktop Safari and a phone:

Personal Microsoft account:
- [ ] Saved files → Connect OneDrive: the consent screen lists only "access the app folder" and sign-in; the page says "connected (personal Microsoft account)"; `Apps/<app name>/` appears in OneDrive.
- [ ] Save to… → OneDrive… on a practice and on rankings: the files appear in the app folder; edit and Save writes back.
- [ ] Second browser: Open from… → OneDrive… lists both files; opening one links it.
- [ ] Edit on both browsers, save on one, then on the other: the conflict dialog appears; each of Keep mine, Use theirs and Keep both does what it says.
- [ ] DevTools: no CSP violations for sign-in, Graph, or the download URL; note the download host actually used (expected `*.files.1drv.com` or `my.microsoftpersonalcontent.com`).
- [ ] Silent renewal: leave a signed-in tab open past 24 hours (the SPA refresh token's fixed lifetime), then Save. In Chrome with third-party cookies allowed, no popup appears; confirm in the network log whether the hidden iframe passes through `login.live.com` (if it never does, that host can leave frame-src). In Safari, a popup or "Allow access" is expected.
- [ ] Disconnect OneDrive: the page says not connected; Save on a linked document asks to sign in again; the link opens the account's app permissions page, where the planner can be removed.

Work or school account:
- [ ] Connect OneDrive. Either the app folder opens (then repeat save, open and conflict above) or the planner shows the "couldn't open the planner's folder for this work or school account" message. Record which, and whether the tenant asked for admin approval. Until this passes on at least one tenant, the UI makes no promise for work or school accounts.
