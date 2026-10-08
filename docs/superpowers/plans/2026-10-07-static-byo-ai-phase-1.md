# Bring-Your-Own AI Key, Phase 1 (Static Planner) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A coach who turns on "AI assistance" in the static planner can paste practice notes, see exactly what will be sent to their own AI provider, press Send, and get a **draft** plan in the existing import preview. With AI assistance off, the app behaves exactly as before and makes no provider request.

**Architecture:** A portable, lazily loaded `lib/ai/` module holds the provider interface, three `fetch` adapters (Anthropic Messages, OpenAI Responses, OpenAI-compatible Chat Completions for local servers), a server-sent-events reader, redaction, and the `notes-to-plan` task (prompt, Zod draft schema, draft → plan mapping). One build-time allowlist, `apps/planner/ai-origins.ts`, produces both the CSP `connect-src` and the runtime list the adapters check base URLs against. The planner's AI screens (`apps/planner/src/ai/`) load through `React.lazy`; the key is held in a module variable only. Non-secret settings live in the existing IndexedDB `meta` store under one key.

**Tech Stack:** TypeScript, React 19, MUI v7, Zod v4 (`z.toJSONSchema`), Vite, Vitest with stubbed `fetch` (no real provider traffic, ever).

**Spec:** `docs/superpowers/specs/2026-10-07-static-byo-ai-key-design.md` (R1–R11, Testing, Phasing row 1). **ADR:** ADR-0023 (proposed; unchanged by this plan).

## Global Constraints

- No vendor SDKs and no new runtime dependency. Adapters are `fetch` plus an SSE reader.
- No provider request before the coach presses Send on a rendered preview. Settings never contact a provider (no model list, no connection test).
- The key is held in memory only (a module variable). It is never written to IndexedDB, `localStorage`, `sessionStorage`, a URL, a document, a log line or an error message. There is no "remember" option.
- `lib/ai/**` is under the `adr-0020/portable-practice-planner` lint block, and `dangerouslySetInnerHTML` is banned in `lib/ai/**` and `apps/planner/src/ai/**`.
- All adapter code stays out of the entry chunk (`LAZY_ONLY_IN_BUNDLE`).
- CI never calls a real API: every adapter takes an injectable `fetch`.
- Public text (code comments, UI copy, this plan) uses fictional teams only and no local paths.
- Always `bun`. Gates: `bun run type-check`, `bun run lint` (0 errors), `bun run test`, `bun run planner:build && bun run planner:check`, `bun run adr:lint`.

## Rulings

Points the spec leaves open, decided here so the work can proceed. Each is easy to revisit.

1. **Allowlist representation.** `resolveAiOrigins(raw)` returns the list exactly as `connect-src` writes it: `https://api.anthropic.com`, `https://api.openai.com`, `http://localhost:*`, `http://127.0.0.1:*`, then each validated `OPENLEAGUE_AI_CONNECT_ORIGINS` entry. `aiConnectSrc(list)` is `connect-src 'self' ` plus the list joined by spaces. The same array reaches the app through a Vite `define` (`__OPENLEAGUE_AI_ORIGINS__`), with the public list as the fallback under tests.
2. **Who checks base URLs.** `lib/ai/origins.ts` exports `isAllowedUrl(url, list)`; `lib/ai` never imports `apps/planner`. Every adapter, not only the local one, checks its target URL against the list before sending, so a test can prove the two fixed origins are on it.
3. **Loopback match.** Hostname `localhost` or `127.0.0.1`, any port, `http:` or `https:` (a CSP `http:` source also allows `https:`). `[::1]` is not on the list and is refused by both sides.
4. **Nullable fields in the draft schema** are sent as `anyOf: [{…}, {type: "null"}]` rather than a type array, and Zod's safe-integer `minimum`/`maximum` on `.int()` and the top-level `$schema` are stripped (`toProviderSchema`). The subset test allows only `type`, `properties`, `required`, `additionalProperties: false`, `items`, `enum`, `anyOf` and `description`.
5. **The draft has no sequence numbers.** Array order is the order; `serializePlan` numbers rows 0…n−1. So "gaps in sequence" can't come from a draft, and the test pins that instead.
6. **Draft → plan.** Draft rows become a `PlanSessionInput`, go through `serializePlan(…, "openleague-static")`, then `JSON.parse(JSON.stringify(…))`, then `parsePlan`, exactly what a file import does. `serializePlan`'s export rules (sorting, station grouping, dropping row staff not on the session's list) are the only normalization; nothing else repairs model output.
7. **Spend-limit detection.** Anthropic: HTTP 402 or `billing_error` → `spend-limit`; a 400 or 429 whose error message mentions a spend limit, credit balance or billing → `spend-limit`; other 429 → `rate-limit`. OpenAI: 429 with code `insufficient_quota` → `spend-limit`, other 429 → `rate-limit`. Messages are read to classify and then dropped; the event carries our own wording.
8. **A reply cut off at the output limit** (`stop_reason: "max_tokens"`, `response.incomplete` with `max_output_tokens`, `finish_reason: "length"`) is reported as `bad-output` with a "cut off" message, so the coach is told why rather than seeing a JSON error.
9. **OpenAI `store: false`.** The Responses API's `store` parameter defaults to `true`; the request sets it to `false`. This is a request parameter only; the planner makes no statement about what a provider does with a request (Ruling 20).
10. **Local base URL.** The coach enters the server's OpenAI-compatible base, for example `http://localhost:11434/v1` (Ollama) or `http://localhost:1234/v1` (LM Studio). Trailing slashes are dropped and `/chat/completions` is appended. The URL must be `http:`/`https:` with no user info, query or fragment. The `Authorization` header is sent only when the coach enters a key (Ollama and LM Studio don't need one over HTTP; only their SDK clients require a placeholder).
11. **`targetAddressSpace: "loopback"`** is set on requests to loopback base URLs only. The spec (R3) and Chrome's Local Network Access post name `"local"`, but in the browser check Chrome refused a `localhost` server for a request marked `"local"` ("Request had a target IP address space of `local` yet the resource is in address space `loopback`"), so the value must name the target's space; loopback is the only space the public allowlist reaches. TypeScript's `RequestInit` doesn't declare the option, so the adapter widens the type locally.
12. **Settings storage.** `{ enabled, active, providers: { [kind]: { model, baseUrl, acknowledged } } }` in the `meta` store under `ai-settings`, validated on read and write like the team profile; no IndexedDB version bump. `acknowledged` records the kind and base URL the disclosure was shown for, so a new base URL shows it again.
13. **Staff redaction for notes.** A pasted note has no session and the team profile has no staff list, so the notes screen offers two lists: staff names (sent as "Coach 1", "Coach 2", …) and other names such as players (sent as "Player 1", …). Matching ignores case and respects word boundaries; longer names win over names they contain. A placeholder whose text already appears in the notes is skipped (the next number is used), so restoring can't rewrite the coach's own words. Restoring uses the spelling first seen in the notes.
14. **Library-name matching.** After a draft parses, the screen lists the library (`getPlaysByTeam`, every page) and, for each drafted drill whose name equals a library drill's name ignoring case and surrounding spaces, offers "Use my library's diagrams for N drills". It is on by default and can be turned off before saving; it only swaps `playData` (and, where the draft left them at their defaults, nothing else).
15. **Where the controls live.** A footer link, "AI assistance settings", always leads to `#/ai` (settings; it is not an AI control and sends nothing). With AI assistance on, the import screen's start view shows a "Draft a plan from notes" card linking to `#/import/notes`. The app bar keeps its four sections (it is already full at 360px). `#/import/notes` belongs to the Import section.
16. **The review panel.** ImportScreen's "ready" panel becomes a shared `PlanReviewPanel` used by both the file import and the notes draft, so a draft lands in the same preview with the same Save button. A draft adds the label "Draft from your AI provider: check every row" and `PlanPreview` gains an optional caption for drills whose diagram is empty ("No diagram yet").
17. **Request counting** is per tab, kept beside the key holder; the preview warns from the 21st request on.
18. **Trusted Types** is enabled only if a Chromium run of the production build, with `require-trusted-types-for 'script'` in the CSP, shows no Trusted Types violations across every route, printing, the HTML and Word exports, the drill editor and the rankings import. Otherwise it stays off and the build check's Trusted Types rule stays dormant. **Result (2026-10-07): off.** The run covered the practice list, a template import and save, the session view, the HTML and Word exports, the print route, the session and drill editors, the library, rankings, AI settings, and a notes draft sent to a local fake server and saved. Everything worked, but Chromium logged one violation: Zod v4's start-up probe for code generation (`new Function("")`, inside a `try`, in the entry chunk through `lib/plan-document`) is refused under Trusted Types. Zod falls back to its non-generated path, so nothing broke, but the check requires zero violations. The likely next step is `z.config({ jitless: true })` at the static app's boot, which skips the probe, followed by a repeat of this run; `TRUSTED_TYPES_ENABLED` in `apps/planner/build-config.ts` is the one switch.
19. **Disclosure wording** lives in one constant, `AI_DISCLOSURE` in `apps/planner/src/ai/disclosure.ts`, and is a draft pending owner review (spec open question 6).
20. **Owner ruling on wording (2026-10-07).** OpenLeague isn't the processor of the coach's data, so the planner makes no statement about what a provider does with a request: nothing about retention, training, logging, privacy or compliance, and no privacy promises. UI copy (disclosure, settings, preview) describes only the mechanics the coach controls: the request goes from this page to the provider address they configured, with their key, and the preview shows it before Send. It tells the coach to review their provider's terms and privacy policy, and links a provider's policy page only where it is a stable official URL that could be confirmed (Anthropic's privacy policy; OpenAI's policy page refused automated checks, so it is not linked until the owner confirms it; none for local servers). Redaction is described as a tool that swaps the names the coach lists, never as making anything safe. The spec's R9 and open question 6 record this ruling.

## Review Focus

1. **The key.** It appears only in the provider request header, never in an error, a stored record or an export. Pinned by the sentinel test (Task 9).
2. **No silent requests.** Turning AI on, entering a key and editing every settings field makes no request; with AI off, browsing the app makes none to a provider origin (Task 10).
3. **One allowlist.** The adapter's URL check and the generated `connect-src` accept exactly the same URLs, checked with an independent source-expression matcher (Task 2), and the built HTML matches (Task 3).
4. **Drafts only.** A draft is saved only by the same Save button as a file import; a draft that fails the draft schema or `parsePlan` shows readable issues and saves nothing (Tasks 7, 12).
5. **Lazy loading.** The Anthropic browser-access header string, unique to adapter code, must not appear in the entry chunk (Task 3).

---

## File Structure

| File | Responsibility |
|---|---|
| Create `apps/planner/ai-origins.ts` | `PUBLIC_AI_ORIGINS`, `resolveAiOrigins(raw)`, `aiConnectSrc(list)` |
| Modify `apps/planner/build-config.ts` | `plannerCsp(origins, { trustedTypes })`; `PLANNER_CSP` = the public build's policy |
| Modify `apps/planner/vite.config.ts`, `apps/planner/src/env.d.ts` | CSP from the resolved list; `__OPENLEAGUE_AI_ORIGINS__` define |
| Modify `scripts/check-planner-build.ts` | Built `connect-src` equals the resolved list; adapter code lazy-only and present; no `eval`/`new Function` in AI chunks |
| Create `lib/ai/types.ts` | `AiRequest`, `AiEvent`, `AiErrorCode`, `AiProvider`, `ProviderKind`, `JsonSchema` |
| Create `lib/ai/origins.ts` | `isAllowedUrl`, `isLoopbackHost` |
| Create `lib/ai/sse.ts` | `readSse(body)`: SSE frames from a byte stream, split anywhere |
| Create `lib/ai/adapters/shared.ts` | Request/abort/error plumbing shared by the adapters |
| Create `lib/ai/adapters/anthropic.ts`, `openai.ts`, `openai-compatible.ts` | The three adapters |
| Create `lib/ai/providers.ts` | `createProvider(config, deps)` |
| Create `lib/ai/redact.ts` | `redact(text, groups)` → `{ text, restore, segments, replacements }` |
| Create `lib/ai/schema.ts` | `toProviderSchema(zod)`, `schemaSubsetViolations(schema)` |
| Create `lib/ai/tasks/notes-to-plan.ts` | Prompt, draft schema, `buildNotesRequest`, `parseNotesDraft`, `draftToPlan` |
| Create `lib/ai/library-match.ts` | `libraryMatches(plan, library)`, `withLibraryDiagrams(plan, matches)` |
| Create `lib/ai/index.ts` | The lazy entry the planner imports |
| Modify `eslint.config.mjs` | `lib/ai/**` in the portable block; `dangerouslySetInnerHTML` ban |
| Create `apps/planner/src/ai/settings.ts` | `AiSettings` type, defaults, `readAiSettings`, validation |
| Create `apps/planner/src/ai/presets.ts` | Display names, default models, suggestions, links, CORS help |
| Create `apps/planner/src/ai/key-holder.ts` | Memory-only keys and the per-tab request count |
| Create `apps/planner/src/ai/disclosure.ts` | `AI_DISCLOSURE` (draft wording) |
| Create `apps/planner/src/ai/AiSettingsScreen.tsx` | `#/ai` |
| Create `apps/planner/src/ai/NotesDraftScreen.tsx` | `#/import/notes`: notes, names, preview, Send/Stop, review |
| Create `apps/planner/src/ai/RequestPreview.tsx`, `DisclosureDialog.tsx` | The preview and the once-per-provider dialog |
| Create `apps/planner/src/screens/PlanReviewPanel.tsx` | The shared review-and-save panel |
| Modify `apps/planner/src/screens/ImportScreen.tsx` | Uses the panel; offers the notes card when AI is on |
| Modify `components/features/practice-planner/PlanPreview.tsx` | Optional empty-diagram caption |
| Modify `apps/planner/src/store/*` | `getAiSettings`/`saveAiSettings`/subscribe in the `meta` store |
| Modify `apps/planner/src/routes.ts`, `App.tsx`, `screens/AppShell.tsx` | Routes `#/ai`, `#/import/notes`; lazy screens; footer link |
| Modify `apps/planner/src/config.ts` | `PRIVACY_NOTE` per spec R9 |

---

### Task 1: The origin allowlist

**Files:** Create `apps/planner/ai-origins.ts`; Test `__tests__/apps/planner/ai-origins.test.ts`

**Interfaces:**
- `PUBLIC_AI_ORIGINS: readonly string[]` = the four public entries (Ruling 1).
- `resolveAiOrigins(raw: string | undefined): string[]`: public list plus each comma-separated entry, trimmed; empty entries ignored; duplicates dropped. Throws `OPENLEAGUE_AI_CONNECT_ORIGINS …` on an entry that is not `https:`, has a path, query, fragment, user info or trailing slash (`new URL(entry).origin !== entry`), or contains `*`.
- `aiConnectSrc(origins): string`.

- [ ] Write failing tests: public list and pinned `connect-src` string from spec R4; an added `https://models.example:8443`; each invalid form fails (`http://models.example`, a path, a trailing slash, user info, a wildcard host and port, a non-URL); duplicates dropped.
- [ ] Implement; run the tests green.

### Task 2: The runtime URL check and the no-divergence test

**Files:** Create `lib/ai/origins.ts`; Test `__tests__/lib/ai/origins.test.ts`

**Interfaces:** `isLoopbackHost(hostname)`, `isAllowedUrl(url: string, origins: readonly string[]): boolean`.

- [ ] Write a CSP3 source-expression matcher inside the test (scheme `http` source admits `https`, exact host, port `*` any, no port = scheme default) that reads the generated `connect-src` string, independent of `isAllowedUrl`.
- [ ] Table: listed origins; `http:`/`https:` loopback on several ports; `https://api.anthropic.com:443` (both accept); `https://api.anthropic.com:8443`, `http://api.anthropic.com`, a subdomain, an unlisted host, `http://[::1]:11434` (both reject). Run it for the public list and a sample self-hosted list; assert the two sides agree on every row.
- [ ] Implement `isAllowedUrl`; green.

### Task 3: CSP and the build check

**Files:** Modify `apps/planner/build-config.ts`, `apps/planner/vite.config.ts`, `apps/planner/src/env.d.ts`, `apps/planner/src/config.ts`, `scripts/check-planner-build.ts`; Tests `__tests__/apps/planner/build-config.test.ts`, `__tests__/scripts/check-planner-build.test.ts`

- [ ] `plannerCsp(origins, { trustedTypes = false })`; `PLANNER_CSP = plannerCsp(PUBLIC_AI_ORIGINS)`. Update the pinned CSP test to the full public `connect-src`.
- [ ] Vite: CSP from `resolveAiOrigins(process.env.OPENLEAGUE_AI_CONNECT_ORIGINS)`; define `__OPENLEAGUE_AI_ORIGINS__`. `config.ts` exports `AI_ORIGINS` with a `typeof` guard.
- [ ] `checkPlannerBuild(outDir, { aiOrigins })`: the meta's `connect-src` must equal `aiConnectSrc(aiOrigins)`; `LAZY_ONLY_IN_BUNDLE` and `REQUIRED_IN_BUNDLE` gain `anthropic-dangerous-direct-browser-access`; files carrying that marker must not contain `eval(` or `new Function(`; when `trustedTypes` is on, the CSP must carry `require-trusted-types-for 'script'`. `main()` resolves the list from the environment.
- [ ] Fixture tests: matching CSP passes; a different `connect-src` fails; the marker in the entry chunk fails; `new Function(` in the AI chunk fails.

### Task 4: Types, SSE reader and shared adapter plumbing

**Files:** Create `lib/ai/types.ts`, `lib/ai/sse.ts`, `lib/ai/adapters/shared.ts`; Test `__tests__/lib/ai/sse.test.ts`

- [ ] SSE tests: frames split across chunks at every byte offset, CRLF and LF, multi-line `data:`, comments and `event:` names, a trailing frame without a blank line, UTF-8 split inside a character.
- [ ] Implement `readSse(body: ReadableStream<Uint8Array>): AsyncIterable<{ event: string | null; data: string }>`.
- [ ] `shared.ts`: `postStream(…)` that never throws (network `TypeError` → `network`, or `cors` for loopback; abort → `aborted`), and `httpError(status, body)` helpers.

### Task 5: The three adapters and their contract tests

**Files:** Create `lib/ai/adapters/{anthropic,openai,openai-compatible}.ts`, `lib/ai/providers.ts`; Test `__tests__/lib/ai/adapters.contract.test.ts`, fixtures in `__tests__/lib/ai/fixtures.ts`

Request shapes (checked 2026-10-07, see Sources):
- **Anthropic:** `POST https://api.anthropic.com/v1/messages`; headers `content-type: application/json`, `x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true`; body `{ model, max_tokens, system, messages: [{ role: "user", content }], stream: true, output_config: { format: { type: "json_schema", schema } } }`. Stream: `content_block_delta` / `text_delta`, `message_start.message.usage.input_tokens`, `message_delta.delta.stop_reason` (`refusal`, `max_tokens`) and `usage.output_tokens`, `message_stop`, `error`, `ping`.
- **OpenAI:** `POST https://api.openai.com/v1/responses`; `Authorization: Bearer`; body `{ model, instructions, input, max_output_tokens, stream: true, store: false, text: { format: { type: "json_schema", name, schema, strict: true } } }`. Stream: `response.output_text.delta`, `response.refusal.delta`, `response.completed` (usage), `response.incomplete`, `response.failed`, `error`.
- **OpenAI-compatible:** `POST {base}/chat/completions`; optional `Authorization: Bearer`; body `{ model, messages: [system, user], max_tokens, stream: true, response_format: { type: "json_schema", json_schema: { name, schema, strict: true } } }`. Stream: `choices[0].delta.content`, `finish_reason`, `data: [DONE]`. Fetch option `targetAddressSpace: "loopback"` for loopback (Ruling 11).

- [ ] For each adapter, tests with a stubbed `fetch` and hand-written fixtures: exact URL, method and headers; the key in exactly one header; the vendor's structured-output field; events from a stream split across chunks; 401 → `auth`, 429 → `rate-limit`, spend limit → `spend-limit`, a refusal → `refused`, a cut-off reply → `bad-output`, a network failure → `network`/`cors`, an abort → `aborted`; `targetAddressSpace` only for loopback; a URL off the allowlist → `other` with no request made; and no error message contains the key.
- [ ] Implement; green.

### Task 6: Redaction

**Files:** Create `lib/ai/redact.ts`; Test `__tests__/lib/ai/redact.test.ts`

- [ ] Tests: round trip; case-insensitive matching restored to the first spelling; word boundaries ("Sam" not in "Samuel"); longer names first ("Sam Lee" before "Sam"); a name inside a drill name only on word boundaries; a placeholder already in the text is skipped; segments for highlighting; regex characters in names.
- [ ] Implement; green.

### Task 7: The notes-to-plan task and schema subset

**Files:** Create `lib/ai/schema.ts`, `lib/ai/tasks/notes-to-plan.ts`, `lib/ai/library-match.ts`, `lib/ai/index.ts`; Tests `__tests__/lib/ai/schema.test.ts`, `__tests__/lib/ai/notes-to-plan.test.ts`, `__tests__/lib/ai/library-match.test.ts`

- [ ] Schema walker test: `toProviderSchema(notesDraftSchema)` uses only the allowed keywords, every object lists every property in `required` with `additionalProperties: false`, no bounds, no `$schema`.
- [ ] Draft tests: a good draft becomes a plan that `parsePlan` accepts, with empty diagrams; 51 rows, a timeline longer than the session, an over-long drill name each give the same `parsePlan` issues as a file with that content; an unknown kind and malformed JSON fail the draft schema (`bad-output`); placeholders are restored in names, instructions and staff; sequences run 0…n−1.
- [ ] Library-match tests: case-insensitive exact name match, blocks ignored, no partial matches.
- [ ] Implement with Zod v4; green.

### Task 8: Lint rules

**Files:** Modify `eslint.config.mjs`

- [ ] Add `lib/ai/**` to the portable block; add a block banning `dangerouslySetInnerHTML` (JSX attribute selector) in `lib/ai/**` and `apps/planner/src/ai/**`. `bun run lint` clean.

### Task 9: Settings store, key holder and key containment

**Files:** Create `apps/planner/src/ai/{settings,key-holder,presets,disclosure}.ts`; Modify `apps/planner/src/store/{records,types,local-store}.ts` (plus a small `ai-settings.ts` ops file); Tests `__tests__/apps/planner/ai-settings.test.ts`, `__tests__/apps/planner/ai-key-containment.test.ts`

- [ ] Store ops `getAiSettings`, `saveAiSettings`, `subscribeAiSettings`, `aiSettingsVersion`, against both repos; a damaged record reads as the defaults; a record carrying any extra field (such as `apiKey`) is stripped on write.
- [ ] Sentinel test: run the notes task through each adapter with a recording `fetch`, save the draft through the import, save settings; assert the sentinel is in exactly one header of exactly one request (to the provider's origin), and absent from every stored record (dumped from the repo), the plan file JSON, the decoded plan link, the bench sheet HTML, the Word document's `word/document.xml`, and the rankings file.

### Task 10: Settings screen, routes and the off-by-default tests

**Files:** Create `apps/planner/src/ai/AiSettingsScreen.tsx`; Modify `routes.ts`, `App.tsx`, `AppShell.tsx`, `config.ts`; Tests `__tests__/apps/planner/ai-settings-screen.test.tsx`, additions to `routes.test.ts` and `app.test.tsx`

- [ ] Routes `#/ai` (`aiSettings`) and `#/import/notes` (`importNotes`, Import section).
- [ ] Settings: the on/off switch; provider choice; key field (password type, memory only, "Forget key"); model field with preset suggestions (free text); base URL for the local kind with CORS/Local Network Access help; spend and revoke guidance with each provider's links; "Turn off AI assistance" clears every key.
- [ ] Test: with a `fetch` spy, turning AI on and editing every field sends nothing. Test: with AI off, the app shell across routes sends nothing to a provider origin and shows no AI control besides the footer settings link.
- [ ] `PRIVACY_NOTE` updated per spec R9.

### Task 11: Notes screen: preview, disclosure, Send/Stop

**Files:** Create `apps/planner/src/ai/{NotesDraftScreen,RequestPreview,DisclosureDialog}.tsx`; Test `__tests__/apps/planner/ai-notes-screen.test.tsx` using `createFakeProvider` (`__tests__/helpers/ai.ts`)

- [ ] Fake provider replays scripted events (text deltas, done, errors, a hang that only an abort ends).
- [ ] Tests: Send is absent until the preview renders, and editing the notes withdraws the preview; the preview shows the system prompt and the redacted text with highlights and a character count; the disclosure appears before the first Send per provider and not again; Stop aborts; `bad-output` shows the issues and saves nothing; a good draft lands in the review panel labelled as a draft; nothing is saved until Save.
- [ ] Trusted Types compatibility run (Ruling 18), recorded here.

### Task 12: Review panel and library diagrams

**Files:** Create `apps/planner/src/screens/PlanReviewPanel.tsx`; Modify `ImportScreen.tsx`, `PlanPreview.tsx`

- [ ] Extract the ready panel without changing `import-screen.test.tsx` behaviour.
- [ ] Draft label, "No diagram yet" captions, the library-diagram switch.

### Task 13: Gates, browser check, self-review

- [ ] `bun run type-check`, `bun run lint`, `bun run test`, `bun run planner:build && bun run planner:check`, `bun run adr:lint`.
- [ ] Browser (Playwright against `planner:dev`): fictional notes for "Riverside 9U"; the preview shows exactly the text sent, names replaced; a local fake OpenAI-compatible server (CORS-enabled, streaming) returns a draft that reaches the import preview; 360px and 1280px, light and dark.

## Manual smoke test before release (not in CI)

Run by a maintainer with their own keys, on the deployed build:

1. Anthropic: a notes draft completes; DevTools shows one request to `api.anthropic.com` with the key only in `x-api-key`.
2. OpenAI: confirm the Responses API answers a browser request from the planner's origin (spec R3's CORS check). If it doesn't, file an ADR-0023 amendment before release.
3. Ollama with `OLLAMA_ORIGINS` set, and LM Studio with CORS on: Chrome shows the Local Network Access prompt; allowing it completes a draft.
4. Safari and Firefox: note how each handles `http://localhost` from the `https` page (works, blocked as mixed content, or prompts), and adjust the settings help text.
5. Owner review of `AI_DISCLOSURE` and the settings and preview copy against Ruling 20 (mechanics only, no statements about provider data handling), and a check that each linked policy URL still resolves.
6. Chrome, page served over https: the `targetAddressSpace: "loopback"` request to Ollama passes the Local Network Access check (Ruling 11).

## Sources (checked 2026-10-07)

- Anthropic structured outputs (`output_config.format`, schema limits): https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- Anthropic streaming events: https://platform.claude.com/docs/en/build-with-claude/streaming
- Anthropic errors (400 on a spend limit, 402 billing, 429 rate limit): https://platform.claude.com/docs/en/api/errors
- Anthropic TypeScript SDK client source (`anthropic-dangerous-direct-browser-access: true` when browser use is enabled; `anthropic-version: 2023-06-01`): https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/client.ts
- OpenAI Responses create and streaming events: https://developers.openai.com/api/reference/resources/responses/methods/create
- OpenAI structured outputs (`text.format`, strict): https://developers.openai.com/api/docs/guides/structured-outputs
- Ollama OpenAI compatibility: https://docs.ollama.com/api/openai-compatibility
- Chrome Local Network Access (`targetAddressSpace`; the value used is "loopback", Ruling 11): https://developer.chrome.com/blog/local-network-access
- Zod v4 JSON Schema: https://zod.dev/json-schema
