# Static Practice Planner — Roadmap & Accepted Decisions

**Date:** 2026-10-03
**Status:** Accepted

The goal is a zero-account practice planner on GitHub Pages that any coach can use indefinitely. It uses the same board, session builder, timeline, and bench sheet as the hosted platform. It **supplements** the hosted platform and never limits it: hosted keeps every feature, and team features such as sharing, RSVPs, venue booking, and accounts stay hosted-only.

## Accepted decisions

- **Audience.** Coaches without an account, as a permanent tool. The hosted platform is an optional upgrade for team features. The static planner is not a demo.
- **Storage (v1).** Plans stay in the browser in IndexedDB. Coaches move them with files: a plan file, a self-contained HTML bench sheet, and PDF via print. Direct Google Drive / OneDrive saves are a later phase, which needs owner-registered OAuth apps.
- **Hand-off, both ways.** One portable plan document format.
  - The hosted platform can import and export it.
  - "Open in OpenLeague" carries the plan in a URL **fragment** to a signed-in hosted import page. There is no public endpoint.
- **Static build.** A Vite single-page app in `apps/planner/` that reuses the shared modules through the `@/` alias. It deploys as a subfolder of the existing GitHub Pages site built by `docs-pages.yml`.
  - Rejected: a second Next.js `output: "export"` project, because cross-folder imports under Turbopack are awkward.
  - Rejected: an export flag on the main app, because server actions, `proxy.ts`, and API routes can't be statically exported.
- **ADR.** ADR-0020 records the portable format and the static deployable.

## Sub-projects (build order)

| # | Sub-project | Status |
|---|---|---|
| 1 | Plan document format, plus hosted export and import (file and fragment link) | Built: spec `2026-10-03-plan-document-design.md`, plan `../plans/2026-10-03-plan-document.md` |
| 2 | `PlannerStore` seam. Hosted implements it with server actions. Library, drill dialog, duplicate, and detail view go through it. `next/link`, `next/image`, and router go behind adapters. | Built: spec `2026-10-03-planner-store-design.md`, plan `../plans/2026-10-03-planner-store.md` |
| 3 | Static app: IndexedDB store, starter drills, file import/export, "Open in OpenLeague", Pages deploy | Built: spec `2026-10-03-static-planner-app-design.md`, plan `../plans/2026-10-03-static-planner-app.md` |
| 4 | Document exports: self-contained HTML bench sheet (opens in Google Docs and Word), optional lazy-loaded `.docx` | Built: spec `2026-10-03-plan-doc-exports-design.md`, plan `../plans/2026-10-03-plan-doc-exports.md` |
| 5 | Direct Google Drive / OneDrive save via pickers with narrow file scopes | Later; needs OAuth app registration |
