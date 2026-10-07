# Shared Document Envelope and Storage Connectors (Static) — Design

**Date:** 2026-10-07
**Status:** Proposed (design for owner review); no implementation yet
**Applies to:** the static, local-first app in `apps/planner/` (deployed to openleague.dev/planner/) and the portable document modules in `lib/`. The hosted platform changes only in that its plan import learns to read the envelope (phase 1).
**Depends on:** ADR-0020 (portable versioned documents, the static app), ADR-0021 (the `openleague.rankings` document), ADR-0008 and ADR-0010 (free, provider-portable, non-commercial), ADR-0011 (capability links are bearer credentials).
**Proposes:** ADR-0022.
**Roadmap:** sub-project 5 of `2026-10-03-static-planner-roadmap.md` ("Direct Google Drive / OneDrive save via pickers with narrow file scopes").

## Context

The static app is taking on work the hosted platform does today: practice plans and pre-season rankings now, and later goalie rotation, game schedules and goalie mentorship. Each of these is a document a coach owns. Today each one lives in that browser's IndexedDB and moves only as a downloaded file. A coach who plans on a laptop and runs practice from a phone has to email files to themselves. Two coaches who share a team have to send files back and forth and work out which copy is newer.

The owner wants a "shared data plane" made of the coach's own storage — Google Drive, OneDrive, or local files and the browser — with no OpenLeague server holding, relaying or indexing the data.

What exists (verified in the code):

- **Two portable documents, same conventions, no shared wrapper.**
  - `lib/plan-document/document.ts`: `format: "openleague.practice-plan"`, `version: 1`, `exportedAt`, `generator`, `session`. File name `<slug>.olplan.json`, at most 900,000 bytes (`MAX_PLAN_FILE_BYTES`). Also encoded into a URL fragment for the hosted import page, at most 65,536 bytes (`MAX_PLAN_LINK_BYTES`).
  - `lib/rankings-document/document.ts`: `format: "openleague.rankings"`, `version: 1`, `meta`, `method`, `teams`, `games`, `myTeam`, `bracketOrder`, `snapshots`. File name `<slug>.rankings.json`, at most 2,000,000 bytes.
  - Both parsers check `format` first, refuse a newer integer `version` with their own message, validate with Zod v4, and strip unknown keys. Neither document has a stable id or a last-modified time, so nothing can tell that two files are the same document.
- **The static store** (`apps/planner/src/store/`): IndexedDB database `openleague-planner` at `DB_VERSION = 4` with `plays`, `sessions` and `meta` stores, behind a `PlannerRepo` with an in-memory fallback. Sessions have local ids and `updatedAt`. Rankings are a **single** document stored under one `meta` key (`META_RANKINGS`), so a device holds one rankings document at a time.
- **CSP** (`apps/planner/build-config.ts`, `PLANNER_CSP`): `default-src 'self'`, `script-src 'self'`, `connect-src 'self'`, `form-action 'none'`, delivered as a `<meta>` tag. Today the app talks to no third-party host except font CDNs.
- **Personal data.** Plans carry practice staff names (adults). Later documents — goalie rotation, mentorship — will carry players' names, and players are often minors.

## Goal

A coach can save any OpenLeague portable document to their own Google Drive, OneDrive, or a local file, open it again on another device, and share it with another coach through the provider's own sharing. Edits made offline are kept and saved later. When two saves collide, the coach is told and chooses what to keep; nothing is overwritten silently. No OpenLeague server ever sees a token or a document.

### Success criteria

1. **One envelope.** Every document the static app writes to a connector has the same wrapper (kind, version, id, updatedAt, payload). Every reader accepts both the wrapped form and today's bare files, with no migration step.
2. **Local first.** IndexedDB stays the working copy and the source of truth while offline. A connector is a remote the app saves to and opens from, never a requirement to keep working.
3. **Least privilege.** Google access uses `drive.file` only. OneDrive access uses the narrowest Microsoft scope that does the job (see R6), and the design says plainly where Microsoft offers nothing as narrow as Google.
4. **No lost writes.** A save against a file that changed since this device last read it is detected and becomes a user choice: keep mine, use theirs, or keep both.
5. **Independently shippable phases**: envelope, then Local, then Drive, then OneDrive. A fork that registers no OAuth apps still gets the envelope and the Local connector; the cloud options are simply absent.
6. **Mobile first.** Every connector flow works at phone width with 44px tap targets, and in mobile Safari and Chrome. Where a browser can't do something (the File System Access API on iOS, for example), the app falls back rather than failing.

## Rulings

### R1. One envelope, payload unchanged

A wrapped document is:

```json
{
  "format": "openleague.document",
  "envelope": 1,
  "kind": "openleague.practice-plan",
  "version": 1,
  "id": "0b7c1f0e-5a3e-4c1e-9a47-6f0d7b2f8a11",
  "updatedAt": "2026-10-07T18:04:00.000Z",
  "generator": "openleague-static",
  "payload": { "format": "openleague.practice-plan", "version": 1, "...": "the bare document, exactly as today" }
}
```

- `format` / `envelope`: the envelope's own discriminant and integer version. They change only when the wrapper itself changes.
- `kind` / `version`: copies of the payload's `format` and `version`. They let a list or a router decide what a file is without parsing the payload, and the reader checks that they match the payload (a mismatch is "invalid").
- `id`: a UUID made when the document is first created and kept for its life. It is how a downloaded copy, a Drive file and a local record are recognised as the same document. "Save as a copy" makes a new id.
- `updatedAt`: the writer's clock at save time. **Informational only** (shown as "last saved"); it is never used to decide conflicts, because device clocks drift. Conflicts use the provider's revision (R4).
- `generator`: as in the plan document (`openleague-static` | `openleague-hosted`).
- `payload`: the existing bare document, validated by its existing parser. The kind schemas do not change.

Kept out of the envelope on purpose: anything about sync state on one device (the remote file id, the last-seen revision, a dirty flag). That lives in the local link table (R3), so a file copied to another drive or emailed does not carry stale sync state.

### R2. Read both forms forever; write wrapped only where every reader understands it

A new pure module, `lib/document-envelope/`, owns the envelope schema and one entry point, `readDocument(raw)`:

1. `raw.format === "openleague.document"` → validate the envelope; refuse `envelope > 1` with "made by a newer version of OpenLeague"; look up `kind` in a registry of known kinds; check `kind`/`version` against the payload; pass the payload to that kind's existing parser (`parsePlan`, `parseRankings`), which keeps its own newer-version message.
2. `raw.format` is a known bare kind (`openleague.practice-plan`, `openleague.rankings`) → parse it as today, and return it as an envelope with `id: null` (unknown) and `updatedAt` taken from the plan's `exportedAt` or the file's modified time.
3. Anything else → "This file isn't an OpenLeague file."

An unknown `kind` inside a valid envelope gets its own message ("This file needs a newer version of OpenLeague"), never a generic failure, so an older app meeting a future kind (goalie rotation, say) explains itself.

Where wrapped files are written, by phase:

| Surface | Phase 1 | After phase 1 |
|---|---|---|
| Hosted plan import (file) | Reads both | Reads both |
| Static: connector saves (Local file handle, Drive, OneDrive) | — | Wrapped |
| Static: "Download plan file" | Bare (unchanged) | Wrapped, once a hosted release that reads the envelope has been live for one release cycle |
| Plan URL fragment ("Open in OpenLeague") | Bare | **Bare, always** — the fragment has a 64 KB budget and its target is a one-shot import that needs no id |
| Hosted plan export | Bare | Owner's call (open question 5) |

The order matters: hosted `parsePlan` must accept the envelope **before** the static app writes a wrapped `.olplan.json`, or a coach's file would fail on the hosted import page. Phase 1 therefore ships the hosted reader first.

**Versioning rules**

- The envelope and each kind are versioned independently. A kind change follows ADR-0020 (additive fields without a bump; a bump only with an upgrader). An envelope change is rare and bumps `envelope`.
- Readers strip unknown envelope keys (as the kind parsers do), so an additive envelope field never needs a bump.
- Size limits are per kind; the envelope allows the kind's limit plus 4 KB.
- File names keep their kind's extension (`.olplan.json`, `.rankings.json`); new kinds pick their own (`.<kind>.json`). The extension is a hint for pickers and people; the reader trusts only the content.

### R3. IndexedDB is the working copy; connectors are remotes

The app never edits a remote file in place. It edits the local record and **saves** it to a remote. A new local **link table** records, per local document, which remote it is linked to:

```ts
interface DocumentLink {
  docKey: string;             // `${kind}:${localId}`
  documentId: string;         // the envelope id
  connector: ConnectorId;     // "local-file" | "google-drive" | "onedrive"
  remote: { fileId: string; name: string; driveId?: string };
  baseRevision: string | null; // the remote revision this device last read or wrote
  baseHash: string;           // SHA-256 of the payload at that revision
  dirty: boolean;             // local edits since baseRevision
  lastSyncedAt: string;
}
```

It is a new `links` object store (an IndexedDB upgrade to version 5, additive, nothing to migrate). A document has at most one link in v1 (one remote per document); several remotes per document is out of scope.

The single-rankings limit has to go: a connector needs per-document identity, so rankings move from one `meta` key to a `rankings` store keyed by id, and the existing record becomes the first entry. This is a store change this design implies, scheduled in phase 2.

### R4. Conflict detection uses the provider's revision, and the connector says how strong it is

Every save carries the `baseRevision` it expects. The providers differ, and the interface says so instead of hiding it:

- **OneDrive (Microsoft Graph)**: atomic. Upload and update accept `if-match` with the item's eTag or cTag and return `412 Precondition Failed` on mismatch ([createUploadSession](https://learn.microsoft.com/graph/api/driveitem-createuploadsession?view=graph-rest-1.0), [update](https://learn.microsoft.com/graph/api/driveitem-update?view=graph-rest-1.0), [delete](https://learn.microsoft.com/graph/api/driveitem-delete?view=graph-rest-1.0)).
- **Google Drive (API v3)**: check, then write. The `File` resource has a `version` that increases on every change, and `headRevisionId` and `md5Checksum` for binary content ([File resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/files)). Neither the File reference nor the upload guide ([manage uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads)) documents an `If-Match` precondition for updates. So the connector reads `version` immediately before writing and refuses if it moved. Two saves in the same second can still race; the next open on either device will see the other's write through the payload hash and flag it.
- **Local file (File System Access API)**: check, then write, using the file's `lastModified` from `getFile()`.
- **Download/upload fallback**: none. A downloaded file is a copy, not a link.

### R5. Google Drive: Picker plus `drive.file`, token model, no refresh token

- **Scope: `https://www.googleapis.com/auth/drive.file` only.** Google classifies `drive.file` as non-sensitive and recommends it; it gives the app access only to files the app created or the user opened with the app. `drive` and `drive.readonly` are restricted scopes that need a restricted-scope verification ([Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)).
- **Picker.** To open a file the app did not create (a file another coach shared), the user picks it in the Google Picker. The builder must be given the Cloud project number with `setAppId`, which is what lets the app reach picked files under `drive.file`, plus a browser API key (`setDeveloperKey`) and the user's access token (`setOAuthToken`) ([PickerBuilder](https://developers.google.com/workspace/drive/picker/reference/picker.pickerbuilder)). Google's sample loads `https://apis.google.com/js/api.js` and `https://accounts.google.com/gsi/client` ([Picker sample](https://developers.google.com/workspace/drive/picker/guides/sample)).
- **Tokens: the Google Identity Services token model** (`google.accounts.oauth2.initTokenClient` → `requestAccessToken`). It runs entirely in the browser with no client secret, issues a short-lived access token and **no refresh token**, and is revoked with `google.accounts.oauth2.revoke` ([token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)).
  - Rejected: the authorization-code model. Google's web clients redeem codes with a client secret, which a static site cannot hold, so it would need an OpenLeague backend.
- **Where the token lives:** in memory only, in the connector instance. A reload means asking again; GIS usually returns a token without a consent screen once consent is given, but the request must come from a user gesture.
- **Revocation:** "Disconnect Google Drive" calls `revoke`, drops the token, and keeps the local link table so a later reconnect resumes (the links hold no credential).
- **Listing:** with `drive.file`, a files list returns only files this app can see. Each saved file gets private `appProperties` (`olKind`, `olId`; private to the app per the File resource) so the app can list "my OpenLeague plans" on a new device without a picker.

### R6. OneDrive: app folder by default; the Picker v8 is a separate, broader opt-in

This ruling corrects an assumption in the roadmap's wording ("pickers with narrow file scopes"). **The OneDrive File Picker v8 grants nothing.** It runs on the delegated permissions the app's token already has, so it can only show what the token can already read. It also needs SharePoint-resource tokens, not Graph tokens; the docs say the two can't be swapped ([File Picker v8](https://learn.microsoft.com/onedrive/developer/controls/file-pickers/?view=odsp-graph-online)). For personal accounts the picker is hosted at `https://onedrive.live.com/picker` with `OneDrive.ReadOnly` or `OneDrive.ReadWrite` (equivalent to `Files.Read` / `Files.ReadWrite`, i.e. all of the user's files); for work or school accounts it needs at least SharePoint `MyFiles.Read`, and Microsoft's setup lists `Files.Read.All` and `Sites.Read.All`. Microsoft has no equivalent of Google's per-file `drive.file` grant. `Files.Read.Selected` and `Files.ReadWrite.Selected` exist, but the permissions reference limits them to work or school accounts and Office file handlers, and says they must not be used for direct Graph calls ([permissions reference](https://learn.microsoft.com/onedrive/developer/rest-api/concepts/permissions_reference?view=odsp-graph-online)).

So:

- **Phase 4a (default): `Files.ReadWrite.AppFolder`.** The app reads and writes only its own folder, `Apps/<app name>/`, created on first use at `/me/drive/special/approot`. Users can see, move and share files there like any other folder ([App folder](https://learn.microsoft.com/graph/onedrive-sharepoint-appfolder), [Get special folder](https://learn.microsoft.com/graph/api/drive-get-specialfolder?view=graph-rest-1.0)). No picker: the app lists its folder itself.
- **Phase 4b (opt-in, owner's call): the Picker v8 with `Files.ReadWrite`** (personal: `OneDrive.ReadWrite`), to open files outside the app folder, including ones another coach shared. This is a broader grant — every file in the user's OneDrive — and the consent screen says so. It would be requested incrementally, only when the coach taps "Open from OneDrive…", never at connect.
- **Account types: open question.** The OneDrive permissions reference says `Files.ReadWrite.AppFolder` is valid only for personal accounts ([permissions reference](https://learn.microsoft.com/onedrive/developer/rest-api/concepts/permissions_reference?view=odsp-graph-online)), while the newer Graph app-folder article describes it for OneDrive and SharePoint ([App folder](https://learn.microsoft.com/graph/onedrive-sharepoint-appfolder)). Phase 4a should be verified against a work or school account before it is promised to one.
- **Tokens: MSAL Browser (`@azure/msal-browser`), authorization code with PKCE.** No client secret. PKCE is required for single-page apps, and the redirect URI must be registered as type `spa` ([third-party cookies and SPAs](https://learn.microsoft.com/entra/identity-platform/reference-third-party-cookies-spas)). Access tokens last about an hour. Refresh tokens issued to an SPA last **24 hours, fixed, not sliding**; after that MSAL tries a hidden iframe, which browsers that block third-party cookies (Safari) defeat, so the app falls back to a popup ([refresh tokens](https://learn.microsoft.com/entra/identity-platform/refresh-tokens), [MSAL token lifetimes](https://learn.microsoft.com/entra/msal/javascript/browser/token-lifetimes), [acquire a token](https://learn.microsoft.com/entra/identity-platform/scenario-spa-acquire-token)).
- **Where tokens live:** MSAL `cacheLocation: "sessionStorage"` (cleared when the tab closes; MSAL keeps temporary request state in session storage or memory regardless — [MSAL caching](https://learn.microsoft.com/entra/msal/javascript/browser/caching)). Not `localStorage`: a 24-hour refresh token at rest in `localStorage` outlives the tab and is readable by any script that runs on the origin.
- **Revocation:** "Disconnect OneDrive" clears MSAL's cache for the account (`logoutPopup` with the account, or `clearCache`). A browser app cannot revoke a Microsoft refresh token by API; the coach removes the app's consent at their Microsoft account's app permissions page, which the disconnect dialog links to.
- MSAL is bundled from npm (lazy-loaded on first use, like `docx` under ADR-0020), so the Microsoft path adds no third-party script host.

### R7. Local connector: three tiers by browser capability

1. **File System Access API** (Chromium desktop): `showSaveFilePicker` / `showOpenFilePicker` return a file handle the app stores in IndexedDB (handles are structured-cloneable). Saves write through the handle after a `lastModified` check (R4). Permission is re-requested once per session with `requestPermission`, from a user gesture. This is the only tier where "Save" updates a local file in place.
2. **Download / file input** (all browsers, including iOS Safari): today's behaviour. A download is a copy, has no link and no conflict detection; opening a file imports it. If the opened file is wrapped and its `id` matches a local document, the app offers "Replace my copy" / "Keep both" instead of silently duplicating.
3. **The browser itself**: IndexedDB, as now. "Local" in the UI means tiers 1–2; tier 3 is always on.

### R8. Sharing goes through the provider; hosted keeps team features

- **Google Drive.** The coach shares the file in Drive. The recipient opens the static planner, taps "Open from Google Drive", and picks it in the Picker; under `drive.file` that pick is what grants this app access to that one file. An editor can save back (with conflict detection); a viewer's save fails with 403, and the app offers "Save a copy to my Drive".
- **OneDrive (4a, app folder).** The coach shares the file or the whole app folder from OneDrive. The recipient cannot reach someone else's app folder with `Files.ReadWrite.AppFolder`, so they download it and open it (Local tier 2), or, if phase 4b ships, pick it with the Picker v8. Sharing therefore works, but round-tripping edits on OneDrive needs 4b.
- **Local.** Email or message the file, as today.
- **What a recipient sees**: the same document in their own static planner, with "last saved" (the envelope `updatedAt`) and, where the provider supplies it, who last modified the file. There is no presence, no live co-editing, no comments and no per-person permissions inside OpenLeague; the provider's sharing settings are the whole permission model.
- **Hosted-only, per the roadmap's "supplements, never limits" rule**: team rosters and accounts, RSVPs, notifications and email, team sharing with roles, venue booking, audit logs, and any record that needs an authority (official league results). The static app never gains a relay server to emulate these.

### R9. Build-time configuration; no credentials, no connector

Cloud connectors are compiled in only when their public identifiers are set at build time:

- `OPENLEAGUE_GOOGLE_CLIENT_ID`, `OPENLEAGUE_GOOGLE_API_KEY`, `OPENLEAGUE_GOOGLE_APP_ID` (the Cloud project number)
- `OPENLEAGUE_MICROSOFT_CLIENT_ID`

All four are public by nature (they ship in the page). With none set, the build is today's app plus the envelope and the Local connector, and its CSP is unchanged. This mirrors ADR-0017's "degrades to a no-op" stance and means forks need nothing to build.

## Architecture

```
lib/document-envelope/            pure, portable (both deployables)
  envelope.ts                     schema, readDocument, wrapDocument, kind registry
apps/planner/src/storage/         static-only
  connector.ts                    StorageConnector interface + error/result types
  sync.ts                         save/open/refresh state machine over a connector + the link table
  local-file.ts                   R7 tiers 1–2
  google-drive.ts                 R5 (lazy chunk)
  onedrive.ts                     R6 (lazy chunk; imports @azure/msal-browser)
  fake.ts                         in-memory connector for tests and dev
apps/planner/src/store/links.ts   the DocumentLink table (IndexedDB v5)
apps/planner/src/screens/storage/ "Save to…", "Open from…", conflict dialog, connections settings
```

`lib/document-envelope/` follows the portability guard ADR-0020 set up for `lib/plan-document/` (no Next, server or DOM imports).

### The `StorageConnector` interface

```ts
type ConnectorId = "local-file" | "google-drive" | "onedrive";

interface RemoteRef { connector: ConnectorId; fileId: string; name: string; driveId?: string }
interface RemoteFile extends RemoteRef { revision: string; modifiedAt: string; modifiedBy?: string; size: number; kind?: string }

type ConnectorError =
  | { code: "conflict"; remote: RemoteFile }   // revision moved since expectedRevision
  | { code: "not-found" }                      // deleted, or access withdrawn
  | { code: "forbidden" }                      // e.g. view-only share
  | { code: "auth-required" }                  // token missing/expired and silent renewal failed
  | { code: "offline" }
  | { code: "too-large" }
  | { code: "quota" }
  | { code: "unavailable"; retryAfterSeconds?: number }
  | { code: "provider"; status: number };      // anything else, with no body text

type Result<T> = { ok: true; value: T } | { ok: false; error: ConnectorError };

interface StorageConnector {
  readonly id: ConnectorId;
  readonly capabilities: {
    list: boolean;                                   // can enumerate its own files
    pick: boolean;                                   // has a provider picker
    delete: boolean;
    conditionalWrite: "atomic" | "check-then-write" | "none";
  };
  status(): "unconfigured" | "disconnected" | "connected";
  connect(): Promise<Result<void>>;                  // interactive; call from a user gesture
  disconnect(): Promise<void>;                       // revoke/clear tokens; links are kept
  list(filter?: { kind?: string }): Promise<Result<RemoteFile[]>>;
  pickToOpen(filter?: { kind?: string }): Promise<Result<RemoteRef[]>>;   // [] when cancelled
  open(ref: RemoteRef): Promise<Result<{ file: RemoteFile; text: string }>>;
  save(input: {
    ref: RemoteRef | null;                           // null = create
    name: string;
    text: string;                                    // the serialized envelope
    kind: string; documentId: string;                // for provider metadata (appProperties)
    expectedRevision: string | null;                 // null with ref = overwrite unconditionally (user chose "keep mine")
  }): Promise<Result<RemoteFile>>;
  delete?(ref: RemoteRef, expectedRevision: string): Promise<Result<void>>;
}
```

Notes:
- Connectors move **text**, not parsed documents; parsing and validation stay in `lib/document-envelope/` so every connector gets identical checks.
- `delete` is optional and not exposed in v1 UI: "Unlink" removes the local link only. Deleting a coach's cloud file is left to the provider's own UI, which has a trash.
- Errors carry codes, never provider response bodies, so nothing a provider echoes back (a file name, an email) reaches logs.

## Sync and conflicts

States per linked document, derived from the link and the remote's current revision:

| Local | Remote vs `baseRevision` | State | What happens |
|---|---|---|---|
| clean | same | **In sync** | nothing |
| dirty | same | **Unsaved changes** | "Save" writes with `expectedRevision = baseRevision` |
| clean | moved | **Newer copy available** | on open, refresh silently from remote (local had nothing to lose) |
| dirty | moved | **Conflict** | the conflict dialog |

The remote revision is checked when a linked document is opened, when the app regains focus or comes back online (at most once a minute per document), and as part of every save. There is no background polling and no service-worker sync in v1.

**The conflict dialog** (from a failed save, or on open):
- **Keep mine** — overwrite the remote (`expectedRevision` set to the revision just seen, so a third write still gets caught).
- **Use theirs** — replace the local copy with the remote one. The replaced local version is kept as a dated local copy for 30 days ("Recovered copies").
- **Keep both** — save mine as a new file with a new envelope id ("<title> (my copy)"), and relink the local document to it; the other remains as it is.
- The dialog shows both sides' "last saved" time and, where the provider gives it, who saved the other one. A side-by-side diff is out of scope; rankings, which already has a merge module (`lib/rankings-document/merge.ts`), could later offer "Merge" as a fourth choice.

**Offline.** Edits always land in IndexedDB first. A save attempted offline fails with `offline`, leaves `dirty: true`, and the document shows "Saved on this device — will need saving to Drive". The app does not queue writes to replay automatically; the coach taps Save again (or a single "Save all" when back online). This keeps every remote write tied to a moment the coach chose, which matters when the conflict choice needs a person.

**Multiple devices.** Device B finds the document by listing (Drive `appProperties`, OneDrive app folder) or by picking. On first open it gets a link with `baseRevision` = the revision read. From then on the table above applies. The envelope `id` lets B recognise that a file it opens matches a document it already has (from an earlier download, say) and offer to link them instead of duplicating.

**Autosave.** Off in v1: saving to the cloud is explicit. Whether a connected document should save automatically after edits (debounced) is open question 3.

## Owner prerequisites

### Google Cloud (Drive)

1. Create a Google Cloud project; note the **project number** (for `setAppId`).
2. Enable the **Google Drive API** and the **Google Picker API**.
3. Configure the OAuth consent screen: user type External, app name, support email, homepage `https://openleague.dev/`, privacy policy URL (open question 6), and the single scope `drive.file`.
4. Create an **OAuth client ID** of type *Web application*. **Authorized JavaScript origins** only — origins are scheme, host and port with no path ([browser OAuth rules](https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow)):
   - `https://openleague.dev`
   - `http://localhost:5173` (planner dev server; localhost may use http)
   - The GIS token model uses a popup, so no redirect URI is needed (to confirm in implementation).
5. Create an **API key**, restricted to the Picker API and to HTTP referrer `https://openleague.dev/planner/*` (and the localhost origin for development).
6. **Verification.** `drive.file` is non-sensitive, so no sensitive- or restricted-scope review is needed ([Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)). Showing the app name and logo on the consent screen to external users still needs Google's brand verification, which needs proof of ownership of `openleague.dev`. Until then users see a generic consent screen; while the project is in "Testing" mode, only listed test users can connect.

### Microsoft Entra (OneDrive)

1. Register an application in Microsoft Entra. Supported account types: **personal Microsoft accounts** at least; "any organizational directory and personal accounts" if work/school support is wanted (open question 4).
2. Add the platform **Single-page application** with redirect URIs (Microsoft redirect URIs are full URLs, paths included):
   - `https://openleague.dev/planner/auth/redirect.html` — a blank page the planner ships for MSAL popups, so the app itself never re-runs inside the popup.
   - `http://localhost:5173/planner/auth/redirect.html` (or the dev server's equivalent path).
3. API permissions (delegated): Microsoft Graph `Files.ReadWrite.AppFolder` and `User.Read` (sign-in). Only for phase 4b: `Files.ReadWrite` and the SharePoint/OneDrive picker permissions the Picker v8 setup lists.
4. No client secret or certificate: an SPA must not have one.
5. **Verification.** Personal-account consent works without publisher verification. Work or school tenants commonly block users from consenting to multitenant apps from unverified publishers; becoming a verified publisher needs a Microsoft partner program ID tied to a verified domain. If that is not available, work/school support stays off.

### Forks

A fork's Pages site lives on another origin (`https://<owner>.github.io`) and usually under a subpath (`/<repo>/planner/`). OAuth registrations are tied to origins (Google) and exact URLs (Microsoft), so **a fork registers its own apps** and sets the R9 build variables; it never reuses openleague.dev's client ids. For the fork:
- Google: add origin `https://<owner>.github.io` (no path).
- Microsoft: add SPA redirect URI `https://<owner>.github.io/<repo>/planner/auth/redirect.html`.
- The planner already builds with a relative base (`base: "./"`), so the redirect page path is computed from the page's own location at runtime, not hard-coded.

The deployment docs gain a "Cloud saving for forks" section with these steps. A fork that skips them ships without cloud connectors and loses nothing else.

## Security and privacy

- **Data.** Documents can hold adults' names (practice staff) today and minors' names in later kinds. They go only to the coach's chosen storage. Guidance for new kinds: hold the least identifying form that works (first name and last initial, or jersey number), and never contact details, dates of birth or medical notes. Each new kind's spec states what personal data it carries.
- **No OpenLeague backend.** The browser talks to Google and Microsoft directly. No proxy, no token exchange service, no relay, no index of who saved what. Nothing here adds a server route to the hosted app.
- **Least privilege.** Google: `drive.file` only. Microsoft: `Files.ReadWrite.AppFolder` by default; anything broader is an explicit, separate opt-in (R6) requested only when used.
- **Token storage.** Google tokens in memory only (about an hour). Microsoft tokens in `sessionStorage` through MSAL (access about an hour; refresh 24 hours, fixed). Neither is ever written to IndexedDB, `localStorage`, the link table, a document, a URL or a log. The residual risk is script injection on the planner's origin, which could use a live token; the defence is the CSP below, no `innerHTML` with document content, and a narrow dependency set (MSAL is the only new runtime dependency, lazy-loaded).
- **CSP.** Changes only when a connector is configured at build time, and only for that provider. Expected additions (to confirm against the providers' current behaviour during implementation, since Google's scripts are not versioned):
  - Google: `script-src https://apis.google.com https://accounts.google.com`; `frame-src https://docs.google.com https://accounts.google.com https://content.googleapis.com`; `connect-src https://www.googleapis.com https://content.googleapis.com https://oauth2.googleapis.com`; `style-src https://accounts.google.com`.
  - Microsoft: `connect-src https://login.microsoftonline.com https://graph.microsoft.com`, and for 4b the user's SharePoint host (`https://*.sharepoint.com`) and `https://onedrive.live.com`. The picker and sign-in run in popups, so no `frame-src` is needed unless MSAL's silent iframe is used (`frame-src https://login.microsoftonline.com`).
  - `form-action 'none'` stays. The Picker v8 is started by a form POST, but into a popup window it opens, so the planner page's own `form-action` should not apply; this must be checked in implementation, and if it does apply, `form-action` gains only the picker host.
  - Subresource integrity is not possible for Google's scripts (they change without notice). That is a known cost of the Drive connector and a reason it is a build-time opt-in.
- **Logging.** The static app has no telemetry and this adds none. Console errors carry the connector id and the `ConnectorError` code (and HTTP status for `provider`) only — never tokens, file names, file ids, document content or provider response bodies.
- **Bearer links.** Provider share links are bearer-like credentials (ADR-0011's reasoning). The app never generates, stores or logs them; sharing happens in the provider's UI.
- **Revocation and exit.** Disconnect is one tap per provider and is reversible. The coach's files stay in their storage, in an open JSON format, readable without OpenLeague.

## Phasing

Each phase ships alone and leaves the app fully working.

| # | Phase | Ships | Depends on |
|---|---|---|---|
| 1 | **Envelope** | `lib/document-envelope/`; hosted plan import and static file open read both forms; nothing writes wrapped yet | — |
| 2 | **Local connector** | `StorageConnector`, sync engine, link table (IndexedDB v5), rankings keyed by id, conflict dialog, FSA tier and download tier; wrapped writes through file handles; "Download" switches to wrapped one release after phase 1's hosted reader is live | 1 |
| 3 | **Google Drive** | Drive connector (GIS token model, Picker, `drive.file`, `appProperties` listing); CSP additions behind build config | 2; owner's Google setup |
| 4a | **OneDrive (app folder)** | OneDrive connector with MSAL and `Files.ReadWrite.AppFolder` | 2; owner's Entra setup |
| 4b | **OneDrive picker (optional)** | Picker v8 with `Files.ReadWrite`, requested incrementally | 4a; owner's decision |

### Testing

- **Envelope (phase 1):** unit tests for bare plan, bare rankings, wrapped of each, `kind`/payload mismatch, newer `envelope`, unknown `kind`, newer payload version (the kind's own message survives), oversized, and round trip (`wrap → serialize → read`). The hosted import gets a test that a wrapped plan file imports.
- **Connector contract tests.** One shared suite, `describeConnectorContract(make)`, that every connector must pass: create then open returns the same text; save with a stale `expectedRevision` returns `conflict` with the remote's revision; unconditional save after a conflict succeeds; `not-found` after a remote delete; `auth-required` when the token is withdrawn; `offline` when the network fails; list filters by kind. It runs against:
  - `fake.ts` (in memory; simulates revisions, concurrent writers, expiry and offline);
  - the Drive and OneDrive connectors over a fake `fetch` that reproduces the documented request and response shapes (metadata, `version`, `If-Match`/412, 401, 403, 404, 429). CI makes no calls to Google or Microsoft;
  - the Local connector over a fake FSA handle.
  The Drive run asserts its `conditionalWrite` is `"check-then-write"` and that it reads `version` before every overwrite; OneDrive asserts every overwrite sends `if-match`.
- **Sync engine:** state-table tests against the fake (every row of the table above, plus offline save, focus re-check throttling, "keep both" assigning a new id, "use theirs" keeping a recovered copy).
- **CSP:** a build test that the CSP is unchanged with no connector variables set, and contains exactly the provider's hosts when they are.
- **Manual, owner-run** (needs real accounts): connect, save, open on a second browser, edit both, resolve a conflict, share to a second account, revoke — once per provider, on desktop and on a phone.
- The existing gates apply: `bun run type-check`, `bun run lint`, the full suite, and `bun run planner:build && bun run planner:check`, which also checks that MSAL and the Google loaders stay out of the entry chunk.

## Alternatives considered

**Envelope**
- *Add `id` and `updatedAt` to each bare format instead of wrapping.* Rejected: every present and future kind would repeat the same sync fields and rules, and old readers would quietly drop them (they strip unknown keys), losing identity on any round trip through an older build.
- *Sidecar metadata files next to each document.* Rejected: two files to keep together; provider sharing and downloads separate them.
- *Keep identity only in provider metadata (Drive `appProperties`, OneDrive item ids).* Rejected as the only mechanism: it is not portable between providers and is lost on download. Kept as a listing aid (R5).
- *A new envelope that replaces the bare formats outright, with a migration.* Rejected: files already exist on coaches' drives (ADR-0020's "public contract"), and the fragment link must stay small.

**Storage**
- *An OpenLeague sync server or relay (even one that stores nothing).* Rejected: it would hold tokens or data, needs abuse controls the project does not have (ADR-0015), and contradicts the "no OpenLeague server holds data" goal and ADR-0008's provider portability.
- *Google `drive.appdata` (hidden app data folder).* Rejected: also non-sensitive, but the files are invisible in Drive, so coaches can neither see nor share them.
- *Google `drive` / `drive.readonly`.* Rejected: restricted scopes, a security assessment, and access to everything.
- *OneDrive `Files.ReadWrite` by default.* Rejected as a default: every file in the user's OneDrive for a feature that needs one folder. Kept as the 4b opt-in.
- *Third-party sync backends (Dropbox, iCloud, WebDAV, a hosted CRDT service).* Not rejected on principle; out of scope until Drive and OneDrive prove the interface. The `StorageConnector` interface is meant to admit them.
- *Real-time co-editing (CRDTs over the provider).* Rejected for now: providers offer no change feed a static app can use cheaply, and coaches' documents are small and edited by one person at a time. Conflict choice covers the realistic case.
- *Automatic last-writer-wins.* Rejected: silently loses a coach's work, which success criterion 4 forbids.
- *Do nothing (files only).* The current state; it works, but every cross-device or two-coach workflow is manual and error-prone.

## Out of scope

- Several remotes per document; folders and organisation inside the app; trash or delete from the app.
- Background sync, push notifications, change feeds.
- Hosted-platform connectors (the hosted app keeps its own database).
- Any document kind beyond plans and rankings (each later kind adopts the envelope in its own spec).

## Open questions for the owner

1. **Register both OAuth apps under which identity?** The Google Cloud project and the Entra app are tied to an account and, for verification, to the `openleague.dev` domain. Is the owner willing to complete Google brand verification and, for work/school OneDrive, Microsoft publisher verification?
2. **OneDrive 4b.** Is the broader `Files.ReadWrite` grant acceptable as an opt-in, so OneDrive users can open files other coaches share? Without it, OneDrive sharing is download-and-open.
3. **Autosave.** Should a linked document save to the cloud automatically a few seconds after edits, or stay explicit (v1 default)?
4. **Account types for OneDrive.** Personal accounts only at first, or work/school too? The docs disagree on whether `Files.ReadWrite.AppFolder` works for work/school accounts (R6); this needs a live check.
5. **Hosted export.** Should the hosted platform's plan export write the envelope too (giving hosted-exported files an id), or stay bare?
6. **Privacy policy.** Google's consent screen needs a privacy policy URL. Does the existing site policy cover "the static planner stores your files in your own Drive/OneDrive and OpenLeague receives nothing", or does it need a section?
7. **Download default.** After phase 2, should "Download" write wrapped files immediately (better identity) or wait for a release cycle after the hosted reader ships (safer for coaches on older hosted builds)? The design assumes wait.

## ADR

ADR-0022 (proposed) records the envelope, the connector seam, the local-first rule, and the scope choices. It relates to ADR-0020 and ADR-0021 and does not supersede either: the bare formats stay valid.
