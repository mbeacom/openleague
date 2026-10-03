---
schemaVersion: 0.1.0
id: "0020"
title: "Exchange practice plans as a portable versioned document and ship a static local-first planner"
status: accepted
date: 2026-10-03
created: 2026-10-03
deciders: ["@mbeacom"]
tags: [practice-planner, interchange, static-site, local-first]
scope: component
reversibility: two-way-door
blastRadius: component
relatesTo: ["0002", "0003", "0004", "0005", "0008", "0011"]
affects:
  - type: path
    pattern: "lib/plan-document/**"
    note: The portable plan format, its parser, and its link encoding.
  - type: path
    pattern: "lib/actions/practice-plan-import.ts"
    note: The authenticated import action that turns a plan document into a session.
  - type: path
    pattern: "app/(dashboard)/practice-planner/import/**"
    note: The hosted import page, which reads plans from files and URL fragments.
  - type: path
    pattern: "apps/planner/**"
    note: The static, local-first planner deployed to GitHub Pages.
  - type: path
    pattern: "lib/planner-store/**"
    note: The client-side store and platform seam the static app implements; hosted implements it with the server actions.
  - type: path
    pattern: "components/features/practice-planner/**"
    note: The portable planner components both deployables render.
  - type: path
    # `*`, not `[sessionId]`: brackets are a glob character class and would match nothing.
    pattern: "app/(dashboard)/practice-planner/*/SessionDetailView.tsx"
    note: The portable session detail view, imported by the static app.
  - type: path
    pattern: "components/providers/HostedPlannerProvider.tsx"
    note: The hosted PlannerStore (the server actions).
  - type: path
    pattern: "components/providers/hosted-planner-platform.tsx"
    note: The hosted PlannerPlatform (next/link, next/image, router, plan hand-off).
provenance:
  authoredBy: agent-drafted
  ratifiedBy: "@mbeacom"
  sourceArtifact: docs/superpowers/specs/2026-10-03-static-planner-roadmap.md
review:
  tier: async
  tierReason: Adds a second deployable and a public data format; sole maintainer ratified in session.
reviewBy: 2027-04-03
---

# ADR-0020: Exchange practice plans as a portable versioned document and ship a static local-first planner

## Context

The practice planner works only inside a signed-in team on the hosted platform. Many coaches only want to draw drills and run a practice. They won't create an account to do it, and the project is open source on GitHub with no plans to monetize it (ADR-0008, ADR-0010).

Three facts make a no-account variant cheap now:
- The board, canvas rendering, timeline, drill data, and bench sheet are already client-side and free of server dependencies.
- Drill diagrams are versioned JSON (`PlayData` v2, with an upgrade path).
- The repository already publishes a GitHub Pages site.

Nothing lets a plan leave the hosted database. There is no export and no import, and no format another tool, another team, or a future static app could read. Any offline or static variant needs that format first. So does handing a plan back to the hosted platform. The question is whether plans should have a portable shape at all, and if so, where the planner lives without a server.

## Decision

**A versioned, self-contained JSON document.** We will define a practice plan as `openleague.practice-plan`, version 1.
- It carries the session's title, duration, local date and time, and ordered drills, each with full diagram data.
- It carries no database IDs and no credentials.
- One pure module, `lib/plan-document/`, owns the schema, parsing, upgrades, file naming, and URL-fragment encoding. It is shared by the hosted app and the static app.

**Hosted export and import.**
- The hosted platform exports this document from a session.
- It imports the document through an authenticated server action, `importPracticePlan`, from either a file or a URL **fragment** (`/practice-planner/import#plan=…`).
- The server parses the document again before writing.
- The import action follows ADR-0002 and ADR-0003. There is no public endpoint.

**A static local-first planner.**
- We will ship it as a Vite single-page app in `apps/planner/` that reuses the shared modules, deployed as a subfolder of the existing GitHub Pages site.
- It stores plans in the browser.
- It exchanges plans as files and as fragment links to the hosted import page.
- It supplements the hosted platform: team features stay hosted-only.

## Options considered

### Option A: Portable document, plus a static Vite planner (chosen)

| Dimension | Assessment |
|---|---|
| Reach | Any coach can plan with no account, from a GitHub Pages URL. |
| Hosted impact | It adds export and import. No existing behaviour changes. |
| Security | No new public surface. Fragments never reach the server, and imports are re-validated on the server. |
| Cost | A format to version and support indefinitely, a second deployable, and Vite as a dev dependency. |

### Option B: A public, unauthenticated hosted planner

**Pros:**
- One deployable.
- A trivial hand-off.

**Cons:**
- It needs anonymous storage or abuse controls on the hosted database, which rate limiting can't provide (ADR-0015).
- Anonymous users are not a fit for the team-scoped data model.
- It still offers no way to work offline or to move plans as files.

### Option C: Static export of the existing Next.js app

**Pros:**
- No second framework setup.

**Cons:**
- Server actions, `proxy.ts`, and API routes can't be statically exported.
- It would force a flag through the whole app, or a fork.

### Option D: Do nothing

Plans stay locked in the hosted database, and coaches without an account can't use the planner at all.

## Trade-offs

**The format is a public contract.** Once files exist on coaches' drives, version 1 must stay readable. Changes need explicit version bumps with upgraders, which is how `PlayData` already works.

**The static app needs a storage seam.** It duplicates the storage layer behind an interface. Four hosted components must stop importing server actions directly. Those components get easier to test, but the planner has two implementations to keep in step.

**Two GitHub Pages sources share one site.** The docs and the planner deploy together, so a planner build failure can block a docs deploy.

## Consequences

- Easier:
  - offline and no-account planning;
  - sharing a plan between coaches or teams;
  - moving a plan into the hosted platform;
  - backups;
  - later exports, such as HTML, `.docx`, and cloud drives.
- Harder:
  - every future session field must decide whether it belongs in the document;
  - format versions must be maintained;
  - two deploy targets must be maintained.
- **How we would know this was wrong:**
  - The static planner sees negligible use: no measurable traffic on the Pages site after 6 months, when reviewed on 2027-04-03.
  - Or format versioning becomes a recurring source of import bugs: more than 2 format-related fixes in a quarter.
- Revisit if:
  - a hosted anonymous mode becomes desirable for other features;
  - GitHub Pages stops fitting, for example because of custom-domain or header needs.

## Action items

1. [ ] Sub-project 1: plan document plus hosted export and import (`docs/superpowers/specs/2026-10-03-plan-document-design.md`).
2. [ ] Sub-project 2: `PlannerStore` seam.
3. [x] Sub-project 3: static app and Pages deploy.
4. [ ] Sub-project 4: HTML and `.docx` exports.
5. [ ] Sub-project 5: Drive and OneDrive saving, once the OAuth apps are registered.
