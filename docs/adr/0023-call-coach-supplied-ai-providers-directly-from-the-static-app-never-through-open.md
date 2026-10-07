---
schemaVersion: 0.2.0
id: "0023"
title: "Call coach-supplied AI providers directly from the static app, never through OpenLeague"
status: proposed
date: 2026-10-07
deciders: ["@mbeacom"]
tags: [static-site, local-first, ai, privacy, security, portability]
scope: component
reversibility: two-way-door
blastRadius: component
relatesTo: ["0008", "0010", "0011", "0020", "0021"]
affects:
  - type: path
    pattern: "lib/ai/**"
    note: The provider interface, the fetch-based adapters, redaction, and the per-task draft schemas and prompts.
  - type: path
    pattern: "apps/planner/src/ai/**"
    note: AI settings, the in-memory key holder, the disclosure dialog, the request preview and the task screens.
  - type: path
    pattern: "apps/planner/ai-origins.ts"
    note: The one validated origin allowlist that drives both connect-src and the adapters' base-URL check.
  - type: path
    pattern: "apps/planner/build-config.ts"
    note: PLANNER_CSP's connect-src, generated from the origin allowlist, and Trusted Types.
  - type: path
    pattern: "apps/planner/src/store/**"
    note: No document store may hold a key; the ai-credentials store arrives only after origin isolation.
  - type: path
    pattern: "apps/planner/src/config.ts"
    note: The privacy note shown to coaches.
  - type: path
    pattern: "scripts/check-planner-build.ts"
    note: The built CSP and the lazy-only rule for AI code.
provenance:
  authoredBy: agent-drafted
  sourceArtifact: docs/superpowers/specs/2026-10-07-static-byo-ai-key-design.md
review:
  tier: async
  tierReason: Opens the static app's CSP to third-party origins and adds credential handling; sole maintainer reviews.
reviewBy: 2027-04-07
---

# ADR-0023: Call coach-supplied AI providers directly from the static app, never through OpenLeague

## Context

The static planner (ADR-0020) and its rankings tool (ADR-0021) run entirely in
the browser. They have no account, no server and no telemetry, and their CSP
allows `connect-src 'self'` only. Two jobs in them are still slow by hand:
turning a coach's practice notes into a plan, and recovering schedule lines the
deterministic parser can't read.

Language models do these jobs well, and many coaches already pay for one or
can run one locally. But OpenLeague is non-commercial (ADR-0010) and keeps its
core free and provider-portable (ADR-0008). It can't pay for inference or run a
relay, and it shouldn't hold anyone's credentials. Plans and notes can also
contain minors' names.

The decision is therefore whether the static app should talk to AI providers
at all, and if so, through what path, with whose credentials, and with what
guarantees about where data and keys can go.

## Decision

We will let a coach connect **their own** AI provider to the static app, and
the browser will call that provider **directly**. OpenLeague never proxies,
pays for, logs or sees the key or the traffic.

- **Off by default.** No request goes to any provider until the coach turns the feature on, sees a disclosure for that provider, and presses Send on a preview of the exact text. Settings never contact a provider: the model is a local field with preset defaults and free text, and no model list is fetched.
- **One fixed allowlist.** A single build-time list of origins drives both the CSP `connect-src` and the adapters' base-URL check. The public build lists only `https://api.anthropic.com`, `https://api.openai.com` and loopback (`http://localhost:*`, `http://127.0.0.1:*`) for local OpenAI-compatible servers such as Ollama and LM Studio. Self-hosters add exact `https` origins, without wildcards, in one build variable. A test checks that the CSP and the adapters accept exactly the same URLs. Adding a provider to the public build amends this ADR.
- **Where keys live.** In phase 1 a key is held in memory only. "Remember on this device" ships only after the planner moves to its own origin, and then in a separate IndexedDB store that no export or document path reads. A key is never put in a document, URL, link or log.
- **No vendor SDKs.** A small `lib/ai/` interface (streamed completion with JSON-Schema structured output) is implemented with `fetch` per provider and loaded lazily.
- **Drafts only.** AI output is a draft. It is validated by a task's draft schema and then by the same parsers as a file import (`parsePlan`), and it lands in the existing review screens. It never changes a rating, a score or a saved document without the coach confirming. `lib/ratings` never calls a model.
- **No Copilot or GitHub Models.** GitHub Models was retired on 2026-07-30, and no documented browser path lets a Copilot subscription be used by a third-party page.

## Options considered

### Option A: Bring-your-own key, browser-direct, fixed CSP allowlist (chosen)

| Dimension | Assessment |
|---|---|
| Cost to the project | None: the coach's account pays, or their own machine runs it. |
| Privacy | The text goes only to the provider the coach picked, after a preview, with optional name redaction. A local model keeps it on the computer. |
| Security | A key is exposed to scripts on the page's origin. The planner's CSP stops `fetch`, XHR and similar requests from the planner page to unlisted origins, but not a top-level navigation carrying the key in a URL, and it doesn't apply to the docs pages that share the origin and its IndexedDB. The real mitigations are no third-party scripts, a strict `script-src` with Trusted Types, keeping the key out of persistent storage, and origin isolation before any key is stored. |
| Portability | Three adapters, including OpenAI-compatible local servers. No vendor lock-in or SDK. |

### Option B: An OpenLeague-run relay or proxy

**Pros:**
- One integration point, with keys kept off the page.
- Could add shared rate limits and abuse controls.

**Cons:**
- OpenLeague would see every prompt (including minors' names) and every key, or would have to hold its own key and pay for traffic. That contradicts ADR-0008 and ADR-0010 and the static app's no-server premise.
- It adds a public endpoint to secure and operate.

### Option C: Bundle an in-browser model (WebGPU or WASM)

**Pros:**
- Nothing leaves the device, and no key is needed.

**Cons:**
- Downloads of hundreds of megabytes to gigabytes, and uneven WebGPU support on the phones and school laptops coaches use.
- Small models are much weaker at following structured-output schemas. This remains a later option behind the same interface.

### Option D: Do nothing

Coaches keep retyping plans and hand-entering unparsed schedule lines. Those who
want AI help copy text into a chat app and back, with no schema checks and no
redaction.

## Trade-offs

- **A key on the page is readable by any script on `openleague.dev`.** That includes the docs pages, which share the origin and don't carry the planner's CSP. Mitigations: memory-only keys in phase 1, no third-party scripts, a strict `script-src` with Trusted Types, no HTML rendering of model output, and no stored key until the planner has its own origin.
- **Widening `connect-src` weakens a strong guarantee.** Today the planner page can `fetch` nothing beyond its own origin. Afterwards it can reach three fixed destinations, but only those. The CSP never covered navigation, so it limits where a bug can send data, not what injected script can do.
- **Third-party behaviour we don't control.** Provider CORS policies, schema subsets and model names change. Adapters, presets and contract fixtures need maintenance, and a provider can withdraw browser access.
- **Coaches carry the spend risk.** The app can bound each request and recommend hard spend limits, but it can't enforce a cap on a coach's account.

## Consequences

- Easier: faster plan entry from notes, recovering odd schedule pages, and using a local model with no data leaving the computer.
- Harder: the CSP and its tests now encode a list of third parties. Prompt and schema changes need review. Disclosure text must track provider policies.
- **How we would know this was wrong:**
  - a key is reported leaked through the static app;
  - an AI-drafted change reaches a saved document or a rating without the coach confirming;
  - more than two adapter breakages per quarter caused by provider changes;
  - or, at the 2027-04-07 review, AI features see negligible use.
- Revisit if:
  - a provider offers a third-party OAuth flow for browser apps, which would beat pasted keys;
  - in-browser models become strong enough at structured output;
  - the planner moves to its own origin;
  - AI on the hosted platform is proposed, which needs its own ADR.

## Action items

1. [ ] Owner review of `docs/superpowers/specs/2026-10-07-static-byo-ai-key-design.md` and its open questions.
2. [ ] Phase 1 plan: `lib/ai/` seam and three adapters, the origin allowlist and CSP change (Trusted Types once confirmed compatible), settings with a memory-only key, disclosure and preview, redaction, notes → draft plan.
3. [ ] Manual browser check of each phase-1 provider's CORS behaviour before release.
4. [ ] Decide when and where the planner moves to its own origin. "Remember on this device" ships only after that move.
