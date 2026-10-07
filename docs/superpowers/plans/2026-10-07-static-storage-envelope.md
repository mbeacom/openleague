# Shared Document Envelope (Storage Connectors Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every OpenLeague reader of a plan or rankings file accepts both today's bare documents and the new `openleague.document` envelope, so a later phase can start writing wrapped files without breaking anyone. Nothing writes the envelope yet.

**Architecture:** A new pure module, `lib/document-envelope/`, owns the envelope schema, a registry of known document kinds (practice plan, rankings), `readDocument` (a parsed JSON value) and `readDocumentText` (text, with the size rules), plus `wrapDocument`/`serializeDocument` for the round trip. The existing file readers, `readPlanFile` and `readRankingsFile`, switch to `readDocumentText` with an expected kind and keep their own messages and result types, so the hosted import page, the static plan import and the static rankings open all read both forms with no change to their screens.

**Tech Stack:** TypeScript, Zod v4, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-07-static-storage-connectors-design.md` (R1, R2, Phasing row 1, Testing "Envelope (phase 1)"). **ADR:** ADR-0022 (proposed).

## Global Constraints

- Phase 1 only. No surface writes the envelope: "Download plan file", the plan URL fragment (`#plan=`), the hosted export and every store keep writing bare documents. `wrapDocument` exists for the round-trip test and phase 2, and no app code calls it.
- The kind schemas (`planDocumentSchema`, `rankingsSchema`) and parsers (`parsePlan`, `parseRankings`) do not change. The envelope hands the payload to them.
- `lib/document-envelope/` is portable (ADR-0020): no Next.js, server, Prisma or DOM-only imports. It is added to the ESLint `adr-0020/portable-practice-planner` block and to the portability test's entries.
- `TextEncoder` and `JSON` only; no new dependency.
- Always `bun`. Gates: `bun run type-check`, `bun run lint` (0 errors), `bun run test`, `bun run planner:build && bun run planner:check`, `bun run adr:lint`.

## Rulings

Where the spec leaves a choice open, this plan decides it:

1. **Raw value vs text.** R2 describes `readDocument(raw, source?)` over a parsed value (`raw.format === …`), while the Architecture notes have the sync engine pass text. Both exist: `readDocument(raw, source?, expect?)` takes a parsed JSON value and applies no size limit (a parsed value has no byte size); `readDocumentText(text, source?, expect?)` measures the UTF-8 bytes, parses JSON, then calls `readDocument`. The "oversized" tests run against `readDocumentText`.
2. **Size rule.** A kind's limit applies to a bare document; a wrapped one may be up to the kind's limit plus `ENVELOPE_OVERHEAD_BYTES` (4,096). Text that is neither wrapped nor a bare known kind (including text that is not JSON) is held to the plain limit (the expected kind's, or, with no expected kind, the largest registered limit); a wrapped file of an unknown kind is held only to that limit plus the overhead, so it gets the unknown-kind message rather than "too large". A known kind other than the expected one is not size-checked against its own limit; it is refused as the wrong kind. This keeps today's behaviour exactly: a 900,001-byte non-JSON file on the plan import is still "too large", and a 900,000-byte one is still "not a plan". Text over the limit plus the overhead is refused before it is parsed.
3. **Expected kind.** A reader that wants one kind passes `{ kind }`. Anything that is not that kind (not JSON, not an OpenLeague document, or a different known kind, bare or wrapped) gets that kind's own "isn't a …" message, so the plan import still says "This file isn't an OpenLeague practice plan." A wrapped file with an unknown kind still gets the unknown-kind message, and a newer envelope the newer-envelope message, whichever kind was expected.
4. **Messages.** The spec gives the text for "not an OpenLeague file", the newer envelope ("made by a newer version of OpenLeague") and the unknown kind ("needs a newer version"). This plan adds an invalid-envelope message ("This file has problems and can't be opened.") and a generic too-large message ("This file is too large to be an OpenLeague file."). A kind's own messages (newer version, invalid with issues, too large) pass through unchanged.
5. **Check order for a wrapped document** (mirrors the kind parsers, so a newer file never reports field noise): `format` → an integer `envelope` above 1 is refused → envelope schema → kind lookup (unknown kind) → the payload's `format` and `version` must equal `kind` and `version` (else invalid) → the kind's parser. The envelope never compares `version` with the kind's current version itself; the kind's parser does, so its newer-version message survives.
6. **Envelope fields.** `id` is `z.uuid()`; `updatedAt` is an ISO date-time with offset; `generator` is 1–100 characters (the plan document's bound); `version` is a positive integer; `payload` is `z.unknown()` (the kind parser strips its own unknown keys). Unknown envelope keys are stripped.
7. **`source.modifiedAt`** is used only if it is an ISO date-time; anything else counts as absent. Phase 1's file readers pass no source (they return only the payload); phase 2 threads `File.lastModified` and connector times through.
8. **Where the hosted import unwraps.** The hosted page reads the file in the browser (`readPlanFile`) and sends the bare payload to `importPracticePlan`, which keeps calling `parsePlan`. The server action does not learn the envelope: it never receives a file, and the payload it gets is the bare document it already validates. The spec's "hosted `parsePlan` must accept the envelope" is met by the hosted import reading it.
9. **No cycle.** `lib/document-envelope/kinds.ts` imports `lib/plan-document/document` and `lib/rankings-document/document` directly (never their `index.ts`), and the two `file.ts` readers import the envelope. The too-large messages move from each `file.ts` into its `document.ts` so the registry can use them; both stay exported from the same index.
10. **The URL fragment stays bare and bare-only.** `readPlanLink` is unchanged.

## File Structure

| File | Responsibility |
|---|---|
| Create `lib/document-envelope/kinds.ts` | `DocumentPayloads`, `DocumentKind`, `DOCUMENT_KINDS` registry, `isDocumentKind` |
| Create `lib/document-envelope/envelope.ts` | Envelope constants, messages and schema; `readDocument`, `readDocumentText`, `wrapDocument`, `serializeDocument` |
| Create `lib/document-envelope/index.ts` | Re-exports |
| Modify `lib/plan-document/document.ts` | Gains `FILE_TOO_LARGE_MESSAGE` (moved) |
| Modify `lib/plan-document/file.ts` | `readPlanFile` reads both forms |
| Modify `lib/rankings-document/document.ts` | Gains `RANKINGS_FILE_TOO_LARGE_MESSAGE` (moved) |
| Modify `lib/rankings-document/file.ts` | `readRankingsFile` reads both forms |
| Modify `eslint.config.mjs` | `lib/document-envelope/**` joins the ADR-0020 portability block |
| Modify `__tests__/lib/planner-store/portability.test.ts` | `lib/document-envelope/index.ts` joins `ENTRIES` |
| Create `__tests__/lib/document-envelope/envelope.test.ts` | The spec's phase 1 unit tests |
| Modify `__tests__/lib/plan-document/file.test.ts` | Wrapped plan file, wrapped rankings refused as not a plan |
| Create `__tests__/lib/rankings-document/file.test.ts` | Bare and wrapped rankings files |
| Modify `__tests__/components/features/practice-planner/PlanImportView.test.tsx` | A wrapped plan file imports; the action gets the bare payload |
| Modify `__tests__/apps/planner/import-screen.test.tsx` | The static app opens a wrapped plan file |
| Modify `__tests__/apps/planner/rankings-import.test.tsx` | The static app opens a wrapped rankings file |

---

### Task 1: The kind registry and `readDocument` for bare documents

**Files:** Create `lib/document-envelope/kinds.ts`, `lib/document-envelope/envelope.ts`, `lib/document-envelope/index.ts`; move the two too-large messages into the kinds' `document.ts`. Test: `__tests__/lib/document-envelope/envelope.test.ts`.

**Interfaces:**

```ts
// kinds.ts
export interface DocumentPayloads {
    "openleague.practice-plan": PlanDocument;
    "openleague.rankings": RankingsDocument;
}
export type DocumentKind = keyof DocumentPayloads;
export type KindParseResult<K extends DocumentKind> =
    | { ok: true; payload: DocumentPayloads[K] }
    | { ok: false; error: { code: "newer-version" | "invalid"; message: string; issues?: string[] } };
export interface DocumentKindEntry<K extends DocumentKind> {
    kind: K;
    maxBytes: number;              // the bare limit; wrapped adds ENVELOPE_OVERHEAD_BYTES
    notThisKindMessage: string;    // NOT_A_PLAN_MESSAGE / NOT_RANKINGS_MESSAGE
    tooLargeMessage: string;       // FILE_TOO_LARGE_MESSAGE / RANKINGS_FILE_TOO_LARGE_MESSAGE
    parse(raw: unknown): KindParseResult<K>;           // adapts parsePlan / parseRankings
    updatedAtOf?(payload: DocumentPayloads[K]): string | null;  // plans: exportedAt; rankings: none
}
export const DOCUMENT_KINDS: { readonly [K in DocumentKind]: DocumentKindEntry<K> };
export function isDocumentKind(value: unknown): value is DocumentKind;

// envelope.ts
export interface DocumentSource { modifiedAt?: string }
export type DocumentErrorCode = "not-a-document" | "wrong-kind" | "too-large" | "newer-envelope" | "unknown-kind" | "newer-version" | "invalid";
export interface DocumentError { code: DocumentErrorCode; message: string; issues?: string[] }
export type ReadDocument<K extends DocumentKind = DocumentKind> = {
    [P in K]: { kind: P; version: number; payload: DocumentPayloads[P]; id: string | null; updatedAt: string | null; wrapped: boolean };
}[K];
export type ReadDocumentResult<K extends DocumentKind = DocumentKind> = { ok: true; document: ReadDocument<K> } | { ok: false; error: DocumentError };
export function readDocument(raw: unknown, source?: DocumentSource): ReadDocumentResult;
export function readDocument<K extends DocumentKind>(raw: unknown, source: DocumentSource | undefined, expect: { kind: K }): ReadDocumentResult<K>;
```

- [ ] **Step 1: failing tests** — bare plan (`id: null`, `wrapped: false`, `updatedAt` = `exportedAt` even with a source), bare rankings (`updatedAt: null` with no source; `source.modifiedAt` with one; an invalid `modifiedAt` counts as absent), not an OpenLeague file (`NOT_A_DOCUMENT_MESSAGE`), a kind's newer version and invalid payload pass through, and with `{ kind }` a different known kind is `wrong-kind` with the expected kind's message.
- [ ] **Step 2: run** `bun run test __tests__/lib/document-envelope` → fails (module missing).
- [ ] **Step 3: implement** the registry and the bare branch.
- [ ] **Step 4: run** → passes.

### Task 2: Wrapped documents

**Files:** `lib/document-envelope/envelope.ts`; same test file.

**Interfaces:**

```ts
export const DOCUMENT_ENVELOPE_FORMAT = "openleague.document";
export const DOCUMENT_ENVELOPE_VERSION = 1;
export const NOT_A_DOCUMENT_MESSAGE = "This file isn't an OpenLeague file.";
export const NEWER_ENVELOPE_MESSAGE = "This file was made by a newer version of OpenLeague. Update to open it.";
export const UNKNOWN_KIND_MESSAGE = "This file needs a newer version of OpenLeague. Update to open it.";
export const INVALID_ENVELOPE_MESSAGE = "This file has problems and can't be opened.";
export const documentEnvelopeSchema; // Ruling 6
export type DocumentEnvelope = z.output<typeof documentEnvelopeSchema>;
export type DocumentGenerator = PlanGenerator;
export function wrapDocument<K extends DocumentKind>(kind: K, payload: DocumentPayloads[K], meta: { id: string; updatedAt: string; generator: DocumentGenerator }): DocumentEnvelope;
export function serializeDocument(envelope: DocumentEnvelope): string; // pretty JSON + "\n"
```

- [ ] **Step 1: failing tests** — wrapped plan and wrapped rankings return the envelope's `id`, `updatedAt` (even when a source is given, and even though the plan has its own `exportedAt`) and `wrapped: true`; unknown envelope keys are stripped; `kind`/payload `format` mismatch and `version` mismatch are `invalid` with `INVALID_ENVELOPE_MESSAGE`; `envelope: 2` is `newer-envelope` (even with otherwise broken fields); an unknown `kind` in a valid envelope is `unknown-kind`; a bad `id` or `updatedAt` is `invalid`; a wrapped plan whose payload is version 2 returns `NEWER_VERSION_MESSAGE` and a wrapped rankings version 2 returns `NEWER_RANKINGS_MESSAGE`; an invalid wrapped plan returns the plan's issues; with `{ kind: plan }`, a wrapped rankings document is `wrong-kind` and an unknown kind is still `unknown-kind`.
- [ ] **Step 2: run** → fails.
- [ ] **Step 3: implement** the wrapped branch (Ruling 5), `wrapDocument`, `serializeDocument`.
- [ ] **Step 4: run** → passes.

### Task 3: Text, size and the round trip

**Files:** `lib/document-envelope/envelope.ts`; same test file.

**Interfaces:**

```ts
export const ENVELOPE_OVERHEAD_BYTES = 4096;
export const DOCUMENT_TOO_LARGE_MESSAGE = "This file is too large to be an OpenLeague file.";
export function readDocumentText(text: string, source?: DocumentSource): ReadDocumentResult;
export function readDocumentText<K extends DocumentKind>(text: string, source: DocumentSource | undefined, expect: { kind: K }): ReadDocumentResult<K>;
```

- [ ] **Step 1: failing tests** — round trip (`wrapDocument` → `serializeDocument` → `readDocumentText` gives back the payload, id and time) for a plan and for rankings; a bare plan padded with whitespace past `MAX_PLAN_FILE_BYTES` is `too-large` with `FILE_TOO_LARGE_MESSAGE`; a wrapped plan padded to exactly `MAX_PLAN_FILE_BYTES + ENVELOPE_OVERHEAD_BYTES` reads; one byte more is `too-large`; non-JSON is `not-a-document` (or, with `{ kind }`, that kind's message), unless it is over the limit, which is `too-large`; text over the largest limit plus the overhead with no expected kind is `too-large` with `DOCUMENT_TOO_LARGE_MESSAGE`.
- [ ] **Step 2: run** → fails.
- [ ] **Step 3: implement** `readDocumentText` (Ruling 2).
- [ ] **Step 4: run** → passes.

### Task 4: The file readers read both forms

**Files:** `lib/plan-document/file.ts`, `lib/rankings-document/file.ts`. Tests: `__tests__/lib/plan-document/file.test.ts`, new `__tests__/lib/rankings-document/file.test.ts`.

`readPlanFile(file)` keeps its signature and result type (`ParsePlanResult`): it refuses a file over `MAX_PLAN_FILE_BYTES + ENVELOPE_OVERHEAD_BYTES` before reading, then calls `readDocumentText(text, undefined, { kind: PLAN_FORMAT })` and maps the error code: `not-a-document`/`wrong-kind` → `not-a-plan`; `too-large`/`invalid` → `invalid`; `newer-envelope`/`unknown-kind`/`newer-version` → `newer-version`. Messages and issues pass through. `readRankingsFile` does the same with `not-rankings`.

- [ ] **Step 1: failing tests** — a wrapped plan file reads to the bare plan; a wrapped rankings file on the plan reader is "not a plan"; a newer envelope is `newer-version` with `NEWER_ENVELOPE_MESSAGE`; the existing three plan-file tests stay as they are. Rankings: bare reads, wrapped reads, oversized, non-JSON, a plan file is "not rankings".
- [ ] **Step 2: run** → the wrapped cases fail.
- [ ] **Step 3: implement.**
- [ ] **Step 4: run** the two file tests plus `__tests__/lib/plan-document` and `__tests__/lib/rankings-document` → pass.

### Task 5: The three surfaces

**Tests only** (the screens already call the readers):

- `PlanImportView.test.tsx`: "imports a wrapped plan file": upload `serializeDocument(wrapDocument(PLAN_FORMAT, plan(), …))`, see the title, import, and assert `importPracticePlan` was called with `document: plan()` (the bare payload).
- `import-screen.test.tsx`: the static app opens a wrapped plan file and saves it.
- `rankings-import.test.tsx`: the static app opens a wrapped rankings file.

- [ ] **Step 1: write the tests; run** → pass (Task 4 already made them work; they pin the behaviour per surface).

### Task 6: Portability guard

- [ ] Add `` `lib/document-envelope/**/${SOURCE_GLOB}` `` to the `adr-0020/portable-practice-planner` files and `"lib/document-envelope/index.ts"` to `ENTRIES` in `__tests__/lib/planner-store/portability.test.ts`.
- [ ] Run `bun run test __tests__/lib/planner-store/portability.test.ts` and `bun run lint`.

### Task 7: Gates and self-review

- [ ] `bun run type-check`, `bun run lint`, `bun run test`, `bun run planner:build && bun run planner:check`, `bun run adr:lint`.
- [ ] Re-read R1, R2 and the Testing section against the diff: every listed unit test exists; nothing writes the envelope; the fragment is untouched.
