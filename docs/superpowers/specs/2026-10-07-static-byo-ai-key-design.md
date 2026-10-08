# Bring-Your-Own AI Key Assistance (Static) — Design

**Date:** 2026-10-07
**Status:** Proposed (design for owner review). Phase 1 plan: `docs/superpowers/plans/2026-10-07-static-byo-ai-phase-1.md`.
**Applies to:** the static, local-first app in `apps/planner/` (deployed to `https://openleague.dev/planner/`). Nothing on the hosted platform changes.
**Depends on:** ADR-0020 (portable documents and the static app), ADR-0021 (client-side rankings), ADR-0008 (core stays free and provider-portable), the portability guard (`adr-0020/portable-practice-planner` in `eslint.config.mjs`), the static CSP (`PLANNER_CSP` in `apps/planner/build-config.ts`) and the build check (`scripts/check-planner-build.ts`).
**Proposed ADR:** ADR-0023, "Call coach-supplied AI providers directly from the static app, never through OpenLeague".

## Context

The static planner is a zero-account tool. Plans, drills and rankings live in the browser's IndexedDB and move as files. Coaches can already:

- build a practice from a template, the drill library or a plan file;
- paste a league schedule page and get deterministic ratings, with every unparsed line listed back to them.

Two kinds of work are still slow:

- **Retyping.** Coaches often have a practice on paper, in a notes app or in a PDF from a clinic, and rebuilding it row by row in the session editor takes minutes per practice.
- **Odd inputs.** A schedule page whose layout the parser doesn't know comes back as a list of unparsed lines that the coach has to enter by hand.

Many coaches already pay for, or can run, a large language model. The owner wants coaches to be able to paste their **own** credentials so the static app can speed up these jobs. OpenLeague must never pay for, proxy, log or see the key or the traffic. This fits the project's direction: the static app has no server, no account and no telemetry (`scripts/check-planner-build.ts` fails the build on analytics), and the project is non-commercial (ADR-0010).

What exists (verified at `2b07846`):

- **A strict plan parser.** `parsePlan` in `lib/plan-document/document.ts` validates an `openleague.practice-plan` v1 document with Zod v4, including the row rules, staff rules and timeline length. Every drill row needs a diagram (`playData`).
- **An import preview.** `apps/planner/src/screens/ImportScreen.tsx` shows a parsed plan in `PlanPreview` and saves only when the coach confirms.
- **A schedule parser that never drops lines.** `lib/ratings/import/schedule.ts` returns `{ games, teams, unparsed }`.
- **A locked-down CSP.** `PLANNER_CSP` is injected as a `<meta>` at build time, with `connect-src 'self'`, `img-src 'self' data: blob:` and `form-action 'none'`. Today the app can't send data to any other origin with `fetch`.
- **A shared origin.** The planner is a subfolder of the GitHub Pages site, so it shares the `https://openleague.dev` origin, and its IndexedDB, with the docs pages.

## Goal

A coach who chooses to can connect their own AI provider, then:

1. paste practice notes and get a **draft** plan in the existing import preview;
2. later, hand a schedule page the deterministic parser couldn't fully read to their model, and review the games it proposes.

Every result is a draft the coach reviews before anything is saved. With no provider connected, the app is exactly what it is today.

### Success criteria

1. **Off by default.** No AI control appears until the coach turns on "AI assistance" in settings. With it off, the built app makes no request to any AI provider. A test checks this.
2. **Direct only.** Requests go from the browser straight to the coach's chosen provider. One build-time origin allowlist (R4) drives both the CSP `connect-src` and the adapters' URL checks, so a `fetch` anywhere else is refused in code and fails in the browser.
3. **The key stays local.** The key never appears in a plan file, rankings file, plan link, bench sheet, Word export, URL or console message. In phase 1 it is held in memory only. "Remember on this device" ships only after the planner has its own origin (R5).
4. **The coach sees what's sent.** Before the first request to each provider, a disclosure explains where the data goes. Each request shows a preview of the exact text being sent, and the coach must press "Send".
5. **Drafts, never writes.** AI output passes the same parser as a file import (`parsePlan`, or the schedule's game shape) and lands in the existing review screens. Ratings, scores and saved documents never change without the coach confirming.
6. **Provider-portable.** At least Anthropic, OpenAI and one OpenAI-compatible local server (Ollama or LM Studio) work in phase 1. No provider SDK is bundled.
7. **No real traffic in CI.** Every adapter is tested against fakes and fixtures.

## Rulings

### R1. Use cases, ranked; the first slice is "notes to a draft plan"

Ranked by value to a coach, then by how reliably the output can be checked:

| Rank | Use case | Value | Feasibility | Decision |
|---|---|---|---|---|
| 1 | **Practice notes → draft plan.** Pasted text becomes rows (drills and blocks) with names, minutes, instructions, focus and age groups. | High: it removes the slowest manual step. | High: the output is text and numbers, and `parsePlan` checks all of it. | **Phase 1** |
| 2 | **Schedule fallback.** Lines the deterministic parser left in `unparsed` go to the model, which returns proposed games. | Medium: it only matters when a league changes its page layout, but then it matters a lot. | High: games are small records checked against the same rules as parsed games, and the source lines are shown beside them. | **Phase 2** |
| 3 | **PDF notes.** A clinic PDF becomes a draft plan. | Medium. | Medium: Anthropic and OpenAI accept PDF input, but local models usually don't, and extracting text in the browser needs a new lazy dependency. | **Phase 2**, text extraction first |
| 4 | **Drill suggestions** for an age group and an objective. | Medium: the starter library already covers common cases. | Low to medium: a useful drill needs a diagram, and generated diagrams are often wrong. | **Phase 3**, behind diagram drafting |
| 5 | **Diagram drafting** from a drill's description. | Medium. | Low: `PlayData` geometry is easy to produce and hard to make sensible. | **Phase 3**, experimental |
| 6 | **Explain a rating or a what-if result** in plain language. | Low: the team screen already shows the arithmetic ("AGD +2.0 + SCHED −4.2 = Lodin −2.2"). | Medium: a model restating numbers can misstate them. | **Later**, only as a rewording of numbers the app computed and passes in |
| 7 | **Draft a parent message.** | Low in the static app, which has no roster or messaging. | High technically, but the input is the most sensitive (minors' names). | **Rejected** for the static app. Team communication is a hosted feature. |

**Why notes-to-plan first.** It has the best value, and its output can be fully checked by code that already exists and is already tested. It also exercises every part of the design: settings, the key, the disclosure, the preview, structured output and the review screen.

**The first slice has no diagrams.** Each drafted drill gets an empty full-ice diagram (`emptyDraftDiagram()`), so the plan parses and the coach can draw it later. The preview labels these drills "no diagram yet". If the coach's library has a drill with the same name, ignoring case, the review screen offers to use that drill's diagram instead. This matching is deterministic and runs on the device.

Rejected: **generating diagrams in phase 1.** It would make the first slice depend on the least reliable output, and a wrong diagram looks authoritative on a bench sheet.

### R2. One small provider interface; adapters use `fetch`, not vendor SDKs

A portable module, `lib/ai/`, holds the interface, the adapters, the draft schemas and the redaction helper. It is added to the `adr-0020/portable-practice-planner` lint block, so it can never import Next.js or server code.

```ts
/** What a task asks of any provider. */
interface AiRequest {
    model: string;
    system: string;
    /** The user's turn as plain text. It is already redacted and already shown in the preview. */
    input: string;
    /** When set, the provider must return JSON matching this schema. */
    output?: { name: string; schema: JsonSchema };
    maxOutputTokens: number;
}

type AiEvent =
    | { type: "text"; delta: string }
    | { type: "done"; text: string; usage?: { inputTokens: number; outputTokens: number } }
    | { type: "error"; code: AiErrorCode; message: string };

type AiErrorCode = "auth" | "rate-limit" | "spend-limit" | "network" | "cors" | "refused" | "bad-output" | "aborted" | "other";

interface AiProvider {
    readonly kind: ProviderKind;
    /** Streams events. Cancelled through the signal. Never throws: every failure ends with an error event. */
    send(request: AiRequest, signal: AbortSignal): AsyncIterable<AiEvent>;
}

type ProviderKind = "anthropic" | "openai" | "openai-compatible";
```

There are three adapters:

- **`anthropic`**: the Messages API, with streaming and `output_config.format` for structured output.
- **`openai`**: the Responses API, with streaming and `text.format` (`json_schema`, `strict: true`).
- **`openai-compatible`**: Chat Completions (`/v1/chat/completions`) with `response_format` at a coach-supplied local base URL. This covers Ollama and LM Studio.

Tasks (`notes-to-plan`, later `schedule-fallback`) are plain functions over `AiProvider`. They never know which vendor they're talking to.

The interface has no model-list call. Settings never contact a provider (R9, R10).

**Streaming.** The UI shows progress as text arrives, and a "Stop" button aborts the request. Structured output is parsed only once, on `done`. Partial JSON is never shown as a plan.

**Loading.** All of `lib/ai/` and the AI screens load through `import()` when the coach opens an AI feature, the same way `docx` loads. A new `LAZY_ONLY_IN_BUNDLE` entry in the build check fails the build if adapter code reaches the entry chunk.

**No vendor SDKs.** Each adapter is about 150 lines of `fetch` and server-sent-event parsing.

Rejected:

- **The official SDKs** (`@anthropic-ai/sdk`, `openai`). They add bundle weight and a supply-chain surface for three endpoints. Both disable browser use by default and need `dangerouslyAllowBrowser: true`, which is a warning, not an obstacle, for a bring-your-own-key app. They also differ in how they report errors, which the interface above would have to normalize anyway.
- **A multi-provider framework such as the Vercel AI SDK.** It's a larger dependency than the problem, and its provider packages assume a server by default.
- **One OpenAI-compatible adapter for everything**, including Anthropic's compatibility endpoint. Structured output and error shapes differ enough that a thin native adapter per vendor is simpler to test than one adapter full of exceptions.

### R3. Which providers, and how a browser reaches them

All claims below were checked against official documentation on **2026-10-07**. Sources are listed at the end.

| Provider | Browser-direct? | How | Phase |
|---|---|---|---|
| **Anthropic (Claude)** | Yes | Anthropic answers cross-origin requests when the request carries `anthropic-dangerous-direct-browser-access: true`. Its TypeScript SDK sends this header only when `dangerouslyAllowBrowser` is set, and its README warns that the key is then exposed to the page. Structured output is GA: `output_config.format` with `type: "json_schema"`, no beta header. The schema subset excludes `minimum`/`maximum`, `minLength`/`maxLength` and recursion, and `additionalProperties` must be `false`. | 1 |
| **OpenAI** | Yes, with a manual check | The official SDK supports browsers behind `dangerouslyAllowBrowser: true`. Its FAQ warns that this exposes the key to the page, and lists trusted internal tools as an acceptable case. A key the coach pastes into their own browser is the same situation: the only person who can read it is the key's owner. The API docs don't state the CORS policy itself, so the implementation plan's first task is a one-off manual check from a browser (not in CI). Structured output uses `text.format` (Responses API) with `strict: true`. Every property must be listed in `required` and `additionalProperties` must be `false`. | 1 |
| **Ollama** (local) | Yes, after setup | Its OpenAI-compatible endpoint is `http://localhost:11434/v1/`. Structured output goes through `response_format`. The client must send an API key value, but Ollama ignores it. By default Ollama accepts cross-origin requests only from `127.0.0.1` and `0.0.0.0`, so the coach sets `OLLAMA_ORIGINS=https://openleague.dev` and restarts Ollama. The settings screen shows that command. | 1 |
| **LM Studio** (local) | Yes, after setup | The server accepts same-origin requests only until the coach turns on **Enable CORS** in the Developer tab's server settings, or starts it with `lms server start --cors`. | 1 |
| **GitHub Models** | **No: retired** | GitHub retired GitHub Models on **2026-07-30**. The playground, catalog, inference API and its bring-your-own-key feature are no longer available to anyone. There is nothing to integrate. | — |
| **GitHub Copilot** | **No** | No documented endpoint lets a web page use a Copilot subscription with a personal token. The Copilot SDK (GA 2026-06-02) is for server and desktop runtimes (Node.js/TypeScript, Python, Go, .NET, Rust, Java). It talks to the Copilot CLI over JSON-RPC, or to a headless CLI server that a backend connects to. Pulling a Copilot token out of an editor or the CLI and calling Copilot's internal endpoints is undocumented and isn't a supported use of the subscription. **We will not offer a Copilot option.** A coach with only Copilot can use a local model or one of the providers above. | Not offered |
| **Others** (Google Gemini, Mistral, OpenRouter, Azure/Microsoft Foundry, …) | Not assessed | Each would need its own CORS and terms check and its own entry on the origin allowlist (R4). Adding one is an amendment to ADR-0023, not a code-only change. | Open question |

**Browser caveats for local servers.** These are discovered at runtime and explained in the UI; they aren't worked around:

- Chrome now gates requests from a public site to loopback or local-network addresses behind a **Local Network Access** permission prompt, and Chrome's guidance is to mark such requests with the `targetAddressSpace` fetch option. Its post shows `"local"`, but the phase 1 browser check found Chrome refuses a `localhost` server for a request marked `"local"`: the value must name the target's address space, so the `openai-compatible` adapter sets `targetAddressSpace: "loopback"` when the base URL is loopback. The settings screen tells the coach to expect a browser prompt, and to allow it.
- An `https` page calling `http://localhost` can still be blocked as mixed content in browsers that don't exempt loopback. When a request to a local server fails, the adapter reports `cors`/`network` with a message naming both causes (the server's CORS setting, and the browser) rather than guessing which one.

### R4. One origin allowlist drives both the CSP and the adapters

**The allowlist.** One build-time module, `apps/planner/ai-origins.ts`, exports `resolveAiOrigins(env)`, the list of origins AI features may reach. The public build's list is:

- the official provider origins, `https://api.anthropic.com` and `https://api.openai.com`;
- loopback, `http://localhost` and `http://127.0.0.1` on any port, for local servers.

A self-hoster adds origins in one place: the `OPENLEAGUE_AI_CONNECT_ORIGINS` build variable (comma-separated), for example an HTTPS model server on their own network. Nothing else needs editing.

**Validation.** Each added entry must be:

- `https:` only. Loopback is already on the list and is the only `http:` allowed.
- An exact origin: scheme, host and an optional port. No path, query, fragment, user info or trailing slash. An entry passes only if `new URL(entry).origin === entry`.
- Free of wildcards. No `*` in the host or port.

A malformed entry fails the build, the way `resolveHostedUrl` fails on a bad `OPENLEAGUE_HOSTED_URL`. Duplicates are dropped.

**Both consumers read the same list.**

- `PLANNER_CSP` builds `connect-src` from it: `'self'`, each listed origin, and loopback written as `http://localhost:* http://127.0.0.1:*`. The public build's result is:

  ```
  connect-src 'self' https://api.anthropic.com https://api.openai.com http://localhost:* http://127.0.0.1:*
  ```

- The same list reaches the app as a build-time constant. The `openai-compatible` adapter accepts a base URL only if its origin is loopback on any port (`http:` or `https:`, since a CSP `http:` source also allows the `https:` form) or exactly equals a listed origin. The Anthropic and OpenAI adapters call fixed origins, and a test checks both are on the list.

So the public build rejects every non-loopback custom base URL, in code and in the browser, and a self-hoster's HTTPS server is allowed in both places by the one entry.

**A test that they can't diverge.** For the public list and a sample list with extra origins, a test builds the CSP and the adapter's URL check from the same input and runs a table of URLs through both: listed origins, `http:` and `https:` loopback on several ports, a listed host on another port, `http:` for a listed `https:` host, a subdomain of a listed host, and an unlisted host. The adapter must accept a URL if and only if the generated `connect-src` allows it. The CSP side is checked with a source-expression matcher written for the test, independent of the generator, so the list isn't checked against itself. The build check then confirms that the built HTML's `connect-src` equals what `resolveAiOrigins` returns for the build's environment.

**What the CSP does, and what it doesn't.** `PLANNER_CSP` is a static `<meta>`, and a page can't loosen it at runtime.

- **It does** stop the planner page from sending data to an unlisted origin with `fetch`, `XMLHttpRequest`, `EventSource`, WebSocket or `sendBeacon`. `img-src` (no third-party hosts) and `form-action 'none'` stay as they are and close image beacons and form posts. This guards against a bug sending text or a key to the wrong place.
- **It doesn't** govern top-level navigation. Script on the page could still carry a key away in a URL with `window.location` or `window.open`.
- **It doesn't** cover other pages. A `<meta>` CSP applies only to the page that carries it. The docs pages on `https://openleague.dev` don't carry it, yet they share the planner's origin, so they can read its IndexedDB and script any planner window they hold a reference to.

So the CSP is not a defence against script running on the origin. That defence is R6, and it is why the key stays out of persistent storage until the planner has its own origin (R5).

Rejected:

- **`connect-src https:`** (any secure origin). It would allow sending to anywhere, which removes the CSP's value as a guarantee about where data can go.
- **Adding origins only when the coach turns AI on.** A meta CSP can't be widened after load, and two builds (with and without AI) double the deploy and test surface. The allowlist is three fixed origins plus loopback, and it is harmless while no key is entered.
- **Separate lists for the CSP and the adapters.** A self-hoster who edits one and not the other gets a server the adapter rejects or a CSP that blocks it. One list removes that failure.

### R5. Key handling

**Where the key lives.**

- **Phase 1: memory only.** The key is held in a module-level variable for the life of the tab. A reload forgets it. Phase 1 has no "remember" option.
- **Later: "Remember on this device", only on its own origin.** This option ships only after the planner moves to its own origin, for example a dedicated subdomain, where no other page can read its storage. The key then goes in a separate IndexedDB object store, `ai-credentials`. It is never in the `sessions`, `plays`, `rankings` or `team-profile` stores, so no export or document path can reach it. The checkbox's label says it plainly: anyone who can use this browser profile can use the key.
- **Why not sooner.** On the shared `https://openleague.dev` origin, every page on the site, including docs pages that don't carry the planner's CSP, can read the planner's IndexedDB and navigate anywhere (R4). A stored key would be exposed to all of them for as long as it was stored, not only while the planner is open.
- **Per provider.** Each provider has its own key, model and (for local servers) base URL. At most one provider is active at a time. The settings other than the key (kind, model, base URL, acknowledgement) hold no secret and are kept in IndexedDB.

**Never stored in plain sight.** The key is never written to `localStorage`, `sessionStorage`, a URL, a hash route, a document, a log line or an error message. Adapter errors keep only the provider's status code and its error type, never the request headers.

**Never sent anywhere else.** Adapters attach the key only to requests for their own provider's fixed origin (`x-api-key` for Anthropic, `Authorization: Bearer` for OpenAI and local servers). A contract test asserts that a sentinel key appears in no request to any other URL and in no serialized plan, rankings file, plan link or export.

**Clearing the key.**

- Settings has a "Forget key" button for each provider, and one "Turn off AI assistance" that clears every key from memory (and, once remembering ships, from `ai-credentials`).
- Turning AI assistance off removes every AI control from the app.
- The settings screen also says how to revoke the key at the provider, which is the only real fix for a key that may have leaked.

**Spend.** OpenLeague can't enforce a cap on someone else's account, so the app does four things:

1. **Recommends a dedicated key with a low limit.** At the provider, the coach should create a separate Anthropic workspace with a monthly spend limit, or a separate OpenAI project with a monthly spend limit and **"Enforce a hard limit"** turned on. Without that setting, OpenAI's limit only sends alerts. The app links each provider's own instructions.
2. **Bounds each request.** Each request has a `maxOutputTokens` limit per task (for example 4,000 for notes-to-plan), and input is capped at 20,000 characters.
3. **Shows the size before sending.** The preview shows a rough size ("about 1,800 words in, up to 3,000 out") before the coach presses Send. No cost estimate is shown, because provider rates change and differ by model.
4. **Counts requests.** It counts the requests made in this tab and warns after 20.

Recognized errors (`spend-limit`, `rate-limit`, `auth`) get specific messages that point back to the provider's console.

Rejected:

- **Offering "remember on this device" in phase 1 behind a warning.** A warning doesn't change who can read the store. The risk is the shared origin, and only moving the planner removes it.
- **Encrypting the stored key with a WebCrypto key from the same origin.** Any script that can read IndexedDB can also call `decrypt`, so this would add complexity without adding protection. Calling it "encrypted" would mislead coaches.
- **`sessionStorage` as a middle option.** It adds little over memory-only (it survives a reload in one tab) and is easy to confuse with "remembered".
- **An OAuth sign-in with the provider instead of a pasted key.** Neither Anthropic nor OpenAI offers an OAuth flow that a third-party static page can use to get API access for a user. If one appears, it would be better than a pasted key. See the open questions.

### R6. XSS is the main threat; reduce what a script could reach

Script running on the planner's origin can read a key held by the planner, and can send it away by navigation even though `connect-src` blocks `fetch` (R4). That origin is shared with the docs pages, which don't carry the planner's CSP. The mitigations:

- **No third-party scripts, and a strict script policy.** `script-src 'self'` with no inline scripts, no `'unsafe-eval'` and no third-party scripts. The build check already fails on analytics and telemetry. It gains a rule that the bundle contains no `eval`-style dynamic code from AI features.
- **Trusted Types, once compatible.** Phase 1 ships the strict `script-src` above. `PLANNER_CSP` then adds `require-trusted-types-for 'script'`, so in browsers that support it, DOM sinks such as `innerHTML` reject plain strings. It is enabled when the phase 1 plan's check confirms that React, the lazy chunks (such as `docx`) and bench-sheet printing run under it. A dependency that needs a policy gets one named, reviewed policy.
- **Keep the key out of persistent storage.** In phase 1 the key lives only in the planner tab's memory (R5). A script on a docs page can't read it from IndexedDB, and it is gone when the tab closes.
- **Isolate the origin before persisting anything secret.** Moving the planner to its own origin, for example a dedicated subdomain, separates it from the docs pages. It is the precondition for "remember on this device" (R5). It also changes the `OLLAMA_ORIGINS` value coaches set, and coaches' existing IndexedDB data doesn't move between origins by itself, so their plans and drills would move by file export and import.
- **Never render AI output as HTML.** Model text goes to React text nodes or to the plan parser, never to `dangerouslySetInnerHTML`. A drafted plan renders through `PlanPreview` like any imported plan. A lint rule bans `dangerouslySetInnerHTML` in `lib/ai/**` and the AI screens.
- **Treat the prompt input as untrusted.** Pasted notes and schedule pages could contain text written to manipulate the model ("ignore the instructions and…"). The model has no tools, can't make requests, and its only output is a draft that is schema-checked and reviewed. So the worst an injected instruction can do is produce a bad draft, which the coach sees before saving.

### R7. The determinism boundary: AI makes drafts, the coach decides

- **Plans.** Model output is checked against a dedicated **draft schema** (R8). It is then turned into a plan input, passed through `serializePlan`, and parsed again with `parsePlan`, the same parser a plan file goes through. The result opens in the existing import preview, labelled "Draft from your AI provider: check every row". Nothing is saved until the coach presses the same "Import" button as for a file. If parsing fails, the coach sees the parser's readable issues ("Drill 3: …") and can retry or edit the notes. The app never quietly repairs the output beyond what `parsePlan` already normalizes.
- **Schedules (phase 2).** Proposed games are checked against the `ParsedGame` shape and the same date, team-number and goal rules as parsed games. They are shown beside the source lines they came from. A proposed game becomes part of the rankings document only when the coach accepts it, and then it is marked with its source, so the team screen can show "added from AI draft".
- **Ratings stay deterministic.** `lib/ratings` never calls a model. No AI feature computes, adjusts or overrides a rating, rank, level or what-if result. A later "explain" feature (R1, rank 6) may only reword numbers the app has already computed and passed in, and it would display them from the app's values, not the model's.
- **Saved documents never change in place.** An AI feature produces a new draft. It never edits an existing session, drill or rankings document directly.

### R8. Structured output: one draft schema per task, written in Zod, sent as JSON Schema

`planDocumentSchema` can't be sent to a provider as-is:

- it relies on `preprocess`, `transform` and `superRefine`;
- it uses numeric and length limits that Anthropic's structured-output subset rejects;
- it includes `playData`, which the model shouldn't write in phase 1.

So each task defines a small **draft schema** in Zod v4, in `lib/ai/tasks/*`, made of plain objects, strings, integers, enums and arrays. It is converted with Zod v4's `z.toJSONSchema()` and sent as the structured-output schema.

- **One subset for every provider.** The draft schema uses only features every phase-1 provider supports: every property listed in `required` (optional fields are nullable instead), `additionalProperties: false`, no numeric or length bounds, and no recursion. A unit test walks the generated JSON Schema and fails on any keyword outside that subset.
- **Two layers of checking.** The output is checked first against the draft schema, which catches malformed JSON, and then through `parsePlan`, which enforces the plan's real rules. A model that ignores the schema (local models enforce it less strictly) fails at the first layer with a `bad-output` error. Nothing is half-saved.
- **The task owns the prompt.** Each task owns its system prompt, its draft schema and the function that maps a draft to a plan input. Prompts are versioned strings in code, so a prompt change shows up in review.

### R9. Privacy

**Nothing is sent by default.** No provider is configured when the app ships, AI assistance is off, and turning it on sends nothing until the coach runs a task and presses Send. Settings never contact a provider: there is no model-list request and no connection test (R10). The first request that carries the key is the first previewed task.

**Disclosure, once per provider.** Before the first request to a provider, a dialog explains, in plain words, only the mechanics the coach controls:

- that pressing Send sends the request shown in the preview from this page to the provider address the coach configured, with the coach's key;
- that the coach should review the provider's terms and privacy policy before use, with a link to the provider's policy page only where it is a stable official URL;
- that "Replace names" swaps only the names the coach lists, and finds nothing on its own;
- that nothing is sent before Send, and a draft is saved only if the coach chooses Save.

**Owner ruling (2026-10-07), replacing this section's earlier list (which promised that OpenLeague never receives the text and that a local server keeps it on the computer).** OpenLeague isn't the processor of the coach's data, so the app makes no assertion about what is or isn't sent, retained or processed by a provider: no claims about retention, training, logging, privacy or compliance, and no privacy promises such as "never leaves your device" or "OpenLeague never sees your data". This applies to the disclosure, the settings and preview copy, and the disclosure constant (`AI_DISCLOSURE`). Redaction is presented as a tool the coach uses, never as making anything safe.

The coach's acknowledgement is stored with the provider settings. Changing the provider or its base URL shows the dialog again.

**A preview of every request.** The preview shows the system prompt and the exact user text, after redaction, in a scrollable read-only box with a character count. The Send button names the destination ("Send to Anthropic", "Send to Ollama on this computer").

**Redaction.**

- **Staff names.** Staff names from the session or the team profile are replaced with "Coach 1", "Coach 2", … before sending and restored in the draft, by a deterministic, reversible mapping (`redact(text, names) → { text, restore }`).
- **Names the coach lists.** Plans and notes may include players' names, and players may be minors. The disclosure says so, and the preview offers "Replace names": the coach types or pastes the names to hide, and each is replaced with "Player 1", "Player 2", … and restored in the draft.
- **Matching rules.** Matching ignores case and respects word boundaries. The preview highlights each replacement so the coach can confirm it.

Rejected: **detecting names automatically** with a local model or a name list. It is unreliable both ways, missing unusual names and catching drill names like "Hilltop breakout", and a false sense of safety is worse than an explicit list. The disclosure says plainly that only the listed names are replaced.

**No logging.** Prompts, responses and keys are not written to IndexedDB, the console or any history. The only AI data kept is the provider settings (kind, model, base URL, acknowledgement). Once "remember on this device" ships on the planner's own origin (R5), the key is kept too, but only if the coach opts in. The draft lives only in the review screen until it is imported or discarded.

**Privacy note.** `PRIVACY_NOTE` in `apps/planner/src/config.ts` describes the mechanics only (owner ruling above): "The planner uploads nothing on its own, and there's no account or tracking. If you turn on AI assistance, pressing Send sends the request you previewed from this browser to the AI provider you set up, using your key."

### R10. Model defaults are data, not logic

- The model is a free-text field on each provider's settings. It starts with the provider's suggested default and offers a few suggestions from the presets file. The coach can type any other model ID, which is how local servers, whose model names depend on what the coach installed, are handled.
- **The app never fetches a model list.** Listing models is a provider request that carries the key, and R9 promises no provider request until the coach presses Send on a previewed task. Keeping the field local keeps that promise without an exception. A mistyped model fails on the first Send with the provider's own error, which costs one request and names the problem.
- Each provider's suggested default model and suggestions live in one data file, `apps/planner/src/ai/presets.ts`, beside its display name, documentation links and the CORS help text. Updating a default is a one-line data change.
- No task or adapter branches on a model ID. When a model rejects structured output or doesn't exist, the provider's error is shown as-is, with a hint to choose another model.
- Tasks state their needs (structured output, a minimum context size) and the settings screen shows them. They never name a model.

Rejected:

- **Filling a picker from the provider's model-list endpoint when settings open.** It sends the key before any disclosure or preview, which breaks R9.
- **An explicit "Load models" button after the disclosure.** It would keep the key behind the disclosure, but R9 would need an exception for a request with nothing to preview, and the disclosure would have to describe it. A short preset list plus free text covers the need without that.

### R11. Where it lives, and what stays out

- **`lib/ai/`** (portable, lazy): the provider interface, the adapters, the SSE parser, redaction, the task modules and the draft schemas. It goes under the `adr-0020/portable-practice-planner` lint block and gets its own ADR-0023 `affects` entry.
- **`apps/planner/ai-origins.ts`** (build time): the origin allowlist and its validation (R4), read by `build-config.ts` for the CSP and passed to the app for the adapters.
- **`apps/planner/src/ai/`**: settings, the in-memory key holder, the disclosure dialog, the request preview and the task screens. The `ai-credentials` object store (with an IndexedDB version bump) arrives only with "remember on this device", after origin isolation (R5).
- **New hash routes:** `#/ai` (settings) and `#/import/notes` (the notes task, which ends in the existing import preview).
- **The hosted platform is out of scope.** Bring-your-own-key there would put a key into a signed-in app with server-side data and multi-user access. That needs its own decision (see the open questions).

## Testing

No test calls a real provider, in CI or by default locally.

- **A fake provider.** `createFakeProvider(script)` implements `AiProvider` and replays a scripted list of events: text deltas, done, errors and aborts. It drives the task and screen tests: the disclosure appears once per provider, Send is disabled until the preview has rendered, Stop aborts, `bad-output` shows the parser's issues, and nothing is saved until Import.
- **Adapter contract tests.** Each adapter runs against a stubbed `fetch` that returns **hand-written fixtures** in the documented formats (SSE streams, error bodies for 401, 429 and spend limits, and a refusal). No recorded traffic, and never a real key. The tests check:
  - the exact URL, method and headers, including `anthropic-dangerous-direct-browser-access: true` for Anthropic, and the key in exactly one header;
  - the request body's structured-output field for that vendor;
  - the event stream the adapter produces, including events split across chunks;
  - that every error maps to its `AiErrorCode`;
  - that `targetAddressSpace: "loopback"` is set for loopback base URLs only.
- **Key containment.**
  - With a sentinel key, every task runs and every export path (plan file, plan link, bench sheet HTML, Word, rankings file) is serialized. The test asserts the sentinel appears nowhere except the one provider request header.
  - A test asserts that no IndexedDB store receives it in phase 1, and that the `sessions`, `plays`, `rankings` and `team-profile` stores never do.
- **Schema compatibility.** For each draft schema, a test walks `z.toJSONSchema()` output and fails on any keyword outside the shared subset (R8).
- **Draft to plan.** Property-style tests cover drafts with too many rows, gaps in sequence, a timeline longer than the session, unknown kinds and over-long names. Every such draft must be rejected or normalized by `parsePlan` exactly as a file would be.
- **Redaction.** Round trip (`restore(redact(x)) === x` for the replaced spans), word boundaries, case, overlapping names, and names that are substrings of drill names.
- **CSP and build.**
  - Unit tests pin the public build's `connect-src` and cover `OPENLEAGUE_AI_CONNECT_ORIGINS` validation: `http:` for a non-loopback host, a path, a trailing slash, user info and a wildcard each fail the build.
  - The no-divergence test (R4) checks that the adapter's URL check and the generated `connect-src` accept exactly the same URLs, for the public list and a sample self-hosted list.
  - `scripts/check-planner-build.ts` checks that the built CSP matches `resolveAiOrigins`, that adapter code is lazy-only, and, once Trusted Types is enabled (R6), that the CSP carries `require-trusted-types-for 'script'`.
  - With AI off, a test drives the app shell with a `fetch` spy and asserts that no request goes to a provider origin.
  - With AI on and a key entered, a test opens and edits every settings field with a `fetch` spy and asserts that no request goes out until Send (R9, R10).
- **Manual smoke test (not in CI).** A short checklist in the implementation plan, run by a maintainer with their own key against each phase-1 provider, before release. It covers the OpenAI CORS check (R3), the Chrome Local Network Access prompt, and Safari's and Firefox's handling of loopback from an `https` page.

## Phasing

| Phase | Scope |
|---|---|
| 0 | This spec and ADR-0023 (proposed). Owner review. |
| 1 | The `lib/ai/` seam and the three adapters; the origin allowlist and the CSP change, with Trusted Types once its compatibility check passes; settings with a **memory-only** key, disclosure and preview; redaction; **notes → draft plan** (pasted text, no diagrams, library-name matching for diagrams). |
| 2 | **Schedule fallback** for unparsed lines; **PDF notes** through lazy, in-browser text extraction (the dependency is chosen in that phase's plan, and loaded lazily like `docx`). |
| 3 | Drill suggestions and experimental diagram drafting, both reviewed in the drill editor before saving. |
| Later | Origin isolation (the planner on its own origin), then **"remember on this device"** with the `ai-credentials` store, which ships only after isolation; plain-language rating explanations limited to app-computed numbers; more providers through ADR amendments. |

Each phase gets its own implementation plan in `docs/superpowers/plans/`.

## Out of scope

- Any OpenLeague-run proxy, relay, key vault, shared key or usage pool.
- GitHub Copilot or GitHub Models integration (R3).
- AI on the hosted platform.
- Tool use or agents: the model never calls functions, browses or reads the store. It sees only the previewed text.
- Storing prompts or responses, or any analytics about AI use.

## Open questions for the owner

Decided, no longer open: "remember on this device" is not offered in phase 1, and ships only after the planner has its own origin (R5).

1. **Origin isolation.** When, and to which origin (for example a dedicated subdomain), should the planner move? "Remember on this device" waits on it. Coaches' existing IndexedDB data doesn't move between origins by itself, so the move needs a file-based handover, and the `OLLAMA_ORIGINS` help text changes with it.
2. **Provider list.** Are Anthropic, OpenAI and local servers enough for phase 1? Are any of Google Gemini, Mistral, OpenRouter or Azure/Microsoft Foundry wanted? Each needs its own CORS and terms check and a place on the origin allowlist.
3. **Marking AI drafts in files.** Should a plan imported from an AI draft carry a marker in the plan document (an additive field under ADR-0020's amendment rules), or is a marker only in the import preview enough?
4. **Hosted platform.** Is bring-your-own-key on the hosted platform ever wanted? If so, it needs its own ADR: server data, multiple users and roles change the threat model.
5. **Copilot.** If GitHub later documents a browser-callable, personal-use endpoint for Copilot subscribers, should it be added? Until then this spec doesn't offer Copilot.
6. **Wording review.** Partly decided (owner ruling, 2026-10-07, recorded in R9): the disclosure, settings and preview copy make no statements about third-party data handling; they describe only the mechanics the coach controls and point the coach to the provider's own terms and privacy policy. Still open: the owner's review of the drafted `AI_DISCLOSURE` text before release.

## Sources (checked 2026-10-07)

- Anthropic, TypeScript SDK README (browser support and `dangerouslyAllowBrowser`): https://github.com/anthropics/anthropic-sdk-typescript
- Anthropic, structured outputs (`output_config.format`, supported schema subset): https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- Anthropic, the `anthropic-dangerous-direct-browser-access` header (announced August 2024; the SDK sets it when browser use is enabled): https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access/ (secondary source; to be confirmed by the manual smoke test)
- Anthropic, workspaces and workspace spend limits: https://platform.claude.com/docs/en/manage-claude/workspaces
- OpenAI, TypeScript SDK FAQ on `dangerouslyAllowBrowser`: https://developers.openai.com/api/reference/typescript
- OpenAI, structured outputs (`text.format`, strict mode): https://developers.openai.com/api/docs/guides/structured-outputs
- OpenAI, project spend limits and "Enforce a hard limit": https://developers.openai.com/api/docs/guides/spend-limits
- GitHub, "GitHub Models is now retired" (2026-07-30): https://github.blog/changelog/2026-07-30-github-models-is-now-retired/ and https://docs.github.com/en/github-models
- GitHub, Copilot SDK GA (2026-06-02): https://github.blog/changelog/2026-06-02-copilot-sdk-is-now-generally-available/ ; setup and authentication: https://docs.github.com/en/copilot/how-tos/copilot-sdk/setup , https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth
- Ollama, FAQ (`OLLAMA_ORIGINS`, default origins): https://docs.ollama.com/faq ; OpenAI compatibility: https://docs.ollama.com/api/openai-compatibility ; structured outputs: https://docs.ollama.com/capabilities/structured-outputs
- LM Studio, `lms server start --cors`: https://lmstudio.ai/docs/cli/server-start
- Chrome, Local Network Access: https://developer.chrome.com/blog/local-network-access
- Zod v4, `z.toJSONSchema()`: https://zod.dev/json-schema
