---
schemaVersion: 0.2.0
id: "0022"
title: "Wrap portable documents in one envelope and sync them through client-only storage connectors"
status: proposed
date: 2026-10-07
deciders: ["@mbeacom"]
tags: [static-site, local-first, interchange, storage, privacy]
scope: component
reversibility: two-way-door
blastRadius: component
relatesTo: ["0008", "0010", "0011", "0015", "0017", "0020", "0021"]
affects:
  - type: path
    pattern: "lib/document-envelope/**"
    note: The shared envelope schema, readDocument and the registry of document kinds.
  - type: path
    pattern: "apps/planner/src/storage/**"
    note: The StorageConnector interface, the sync engine, and the Local, Google Drive and OneDrive connectors.
  - type: path
    pattern: "apps/planner/src/store/links.ts"
    note: The local link table that ties a local document to its remote file and last-seen revision.
  - type: path
    pattern: "apps/planner/src/store/idb-repo.ts"
    note: IndexedDB version 5 adds the links store and keys rankings by id.
  - type: path
    pattern: "apps/planner/build-config.ts"
    note: The planner CSP, which gains provider hosts only when a connector is configured at build time.
  - type: path
    pattern: "lib/plan-document/**"
    note: Plan readers accept the envelope as well as the bare format.
  - type: path
    pattern: "lib/rankings-document/**"
    note: Rankings readers accept the envelope as well as the bare format.
provenance:
  authoredBy: agent-drafted
  sourceArtifact: docs/superpowers/specs/2026-10-07-static-storage-connectors-design.md
review:
  tier: async
  tierReason: Adds third-party OAuth integrations and a shared wrapper to public document formats; sole maintainer reviews.
reviewBy: 2027-04-07
---

# ADR-0022: Wrap portable documents in one envelope and sync them through client-only storage connectors

## Context

The static app (ADR-0020) now holds two portable documents, practice plans and
rankings (ADR-0021), with goalie rotation, game schedules and mentorship to
follow. Each lives in one browser's IndexedDB and moves only as a downloaded
file. Coaches who work across devices, or share a team with another coach,
have to move files by hand and guess which copy is newer.

The documents share conventions (a `format` discriminant, an integer version,
strict parsing, newer-version refusal) but nothing identifies a document across
copies: there is no stable id and no last-modified time. Any sync needs that
first.

The project runs no data-holding service for the static app and wants none
(ADR-0008, ADR-0010, ADR-0015). Some documents will carry minors' names. Google
offers a per-file grant (`drive.file` with the Picker); Microsoft does not: the
OneDrive File Picker v8 only shows what the app's token can already reach.

## Decision

We will wrap portable documents in one envelope and save them to the coach's own
storage through browser-only connectors.

- **Envelope.** `{ format: "openleague.document", envelope: 1, kind, version, id, updatedAt, generator, payload }`. The payload is the existing bare document, unchanged and parsed by its existing parser. Readers accept both bare and wrapped forms indefinitely, with no migration. Wrapped files are written only where every reader understands them, and the plan URL fragment stays bare.
- **Local first.** IndexedDB stays the working copy and the source of truth offline. A connector is a remote: list, pick, open, save (with an expected revision) and optional delete. Per-device sync state lives in a local link table, never in the file.
- **Conflicts.** Detection uses the provider's revision, never client clocks: atomic `if-match` on OneDrive, a `version` check right before writing on Google Drive (which documents no precondition header), and `lastModified` for local file handles. A detected conflict is the coach's choice: keep mine, use theirs, or keep both.
- **Google Drive.** `drive.file` only, the Picker for files the app did not create, and the Google Identity Services token model. The token stays in memory and no refresh token is issued.
- **OneDrive.** `Files.ReadWrite.AppFolder` by default, with MSAL authorization code + PKCE and tokens in `sessionStorage`. The Picker v8 with `Files.ReadWrite` is a separate, explicit opt-in, because it grants the whole drive.
- **No backend.** No OpenLeague server sees a token or a document. Cloud connectors exist only in builds configured with their public client identifiers, and the CSP widens only for a configured provider.

## Options considered

### Option A: Envelope plus client-only connectors over the coach's storage (chosen)

| Dimension | Assessment |
|---|---|
| Reach | Cross-device and coach-to-coach use with no OpenLeague account. |
| Privacy | Data stays in the coach's storage. Google access is per-file. OneDrive access is one folder by default. |
| Security | No new server surface. New third-party scripts (Google) and a new runtime dependency (MSAL), both behind build-time opt-in. |
| Cost | Two OAuth registrations to maintain, a provider-specific connector each, and a contract test suite. |

### Option B: An OpenLeague sync service or relay

**Pros:** one consistent conflict model; could offer real-time updates.
**Cons:** holds tokens or data; needs abuse controls the project lacks (ADR-0015); contradicts ADR-0008's provider portability and the no-server goal.

### Option C: Identity fields added to each bare format, files only

**Pros:** no wrapper; smallest change.
**Cons:** every kind repeats the sync fields; older readers strip unknown keys, so identity is lost on any round trip through an older build; still no cloud saving.

### Option D: Do nothing

Files and IndexedDB only. It works, but every cross-device or two-coach workflow stays manual and error-prone.

## Trade-offs

- **The envelope is a second public contract** on top of each kind's. It is versioned on its own and kept small for that reason.
- **Uneven guarantees.** Drive conflict detection has a small race window that OneDrive's does not. The connector exposes this as a capability, not a hidden difference.
- **Uneven privacy.** OneDrive sharing between coaches needs either download-and-open or the broader picker scope. Microsoft has nothing as narrow as `drive.file`.
- **Third-party script hosts.** Google's loaders cannot carry subresource integrity, which loosens the planner's `script-src 'self'` in builds that enable Drive.
- **Re-consent.** Microsoft SPA refresh tokens last 24 hours (fixed), and Google issues none, so coaches will see sign-in popups more often than in a server-backed app.

## Consequences

- Easier: cross-device work; coach-to-coach sharing through the provider; adding later document kinds, which get identity and connectors by adopting the envelope.
- Harder: OAuth app upkeep, provider API drift, and CSP maintenance; testing needs fakes because CI cannot call the providers.
- **How we would know this was wrong:**
  - six months after the Drive phase ships, the providers' own consoles (Drive API usage for the Cloud project, Entra sign-in counts) show fewer than 25 distinct users a month, so the upkeep outweighs the use (the static app itself has no telemetry); or
  - more than two lost-write or conflict-handling bugs reported in a quarter; or
  - a provider removes the narrow scope (`drive.file`, `Files.ReadWrite.AppFolder`) this depends on.
- Revisit if: a provider offers a change feed usable from a static page, real-time co-editing becomes a requirement, or the hosted platform needs to read coaches' cloud files.

## Action items

1. [ ] Phase 1: `lib/document-envelope/`; hosted plan import and static file open read both forms.
2. [ ] Phase 2: `StorageConnector`, sync engine, link table (IndexedDB v5), rankings keyed by id, Local connector, conflict dialog, contract tests.
3. [ ] Phase 3: Google Drive connector, once the owner registers the Google Cloud project.
4. [ ] Phase 4a: OneDrive app-folder connector, once the owner registers the Entra app.
5. [ ] Phase 4b (owner's decision): OneDrive Picker v8 with `Files.ReadWrite`.
