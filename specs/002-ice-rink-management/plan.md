# Implementation Plan: Ice Rink Management

**Branch**: `002-ice-rink-management` | **Date**: 2026-05-10 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/002-ice-rink-management/spec.md`

## Summary

Build first-class ice rink and venue organization management on top of OpenLeague's existing venue foundation. The implementation will evolve the current team/league-owned venue model into venue organizations with branded public profiles, logo and color configuration, bookable ice surfaces, operating hours, recurring schedule blocks, lessons, events, available ice-time requests, content posts, and preferred/home rink relationships with teams and organizations. The first implementation phase will focus on profile setup, staff permissions, schedule/availability publishing, request workflows, and relationship invitations without direct payment collection.

## Technical Context

**Language/Version**: TypeScript with Next.js 16 App Router and React 19  
**Primary Dependencies**: MUI v7/Emotion, Prisma 7, Neon PostgreSQL adapter, Auth.js v5, Zod v4, Bun  
**Storage**: PostgreSQL through Prisma; public logo assets require object/file storage integration selected during implementation  
**Testing**: Vitest, Testing Library, existing Prisma/auth/action mocks  
**Target Platform**: Web application deployed through the existing Vercel/Bun workflow  
**Project Type**: Full-stack web application using Server Components for reads and Server Actions for mutations  
**Performance Goals**: Venue profile pages and schedule views should feel immediate to users; schedule filters should narrow results within 2 user actions per SC-008; conflict checks should prevent duplicate publication in standard manager workflows per SC-009  
**Constraints**: Preserve existing team/league venue and event behavior; do not expose manager-only notes, private contacts, or request details publicly; use server-side authorization for every venue organization, schedule, request, content, and relationship mutation  
**Scale/Scope**: First release supports multi-surface rinks, recurring weekly schedules, public venue discovery, request/inquiry lifecycle, lesson/event publishing, content posts, and team/organization venue relationships; direct payments, deposits, invoices, and external USA Hockey/US Figure Skating verification are out of initial implementation scope

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution file currently contains placeholder principles and no ratified gates. This plan applies the repository's active development conventions instead:

- Use Bun scripts and existing validation/test tooling.
- Prefer Server Components for read views and Server Actions for mutations.
- Authenticate through existing session helpers and authorize exact venue/team/league resources before mutation.
- Validate reusable inputs with Zod in `lib/utils/validation.ts`.
- Route database access through `lib/db/prisma.ts`.
- Protect sensitive venue, staff, request, and relationship data in selects/includes.
- When changing `prisma/schema.prisma`, create a migration and regenerate Prisma Client.

**Gate Result**: PASS. No constitution violations or unresolved clarifications.

## Project Structure

### Documentation (this feature)

```text
specs/002-ice-rink-management/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── server-actions.md
│   └── public-routes.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
app/
├── (dashboard)/
│   ├── venue-admin/                 # venue organization management shell
│   └── venues/                      # existing venue pages extended for richer rink data
├── (marketing)/
│   └── rinks/                       # public rink discovery/profile routes if separated from dashboard venues
└── api/
    └── roster/export/               # unchanged; API routes remain limited to file/webhook-style endpoints

components/
└── features/
    ├── venue-admin/                 # profile, staff, schedule, requests, content, relationships
    ├── venues/                      # existing venue cards/details/forms extended or shared
    └── scheduling/                  # reusable schedule grid/block editors if extracted

lib/
├── actions/
│   ├── venue-organizations.ts       # organization/profile/staff actions
│   ├── venue-schedules.ts           # operating hours, schedule blocks, conflict checks
│   ├── venue-requests.ts            # ice-time and lesson request lifecycle
│   ├── venue-content.ts             # posts/events/lesson offerings
│   └── venue-relationships.ts       # preferred/home rink invitations and relationships
├── auth/
│   └── session.ts                   # add/reuse venue role helpers
├── db/
│   └── prisma.ts                    # unchanged Prisma client singleton
└── utils/
    ├── validation.ts                # shared Zod schemas
    └── venue-schedule.ts            # deterministic recurrence/conflict helpers if shared

prisma/
├── schema.prisma                    # venue organization, staff, surface, schedule, request, content models
└── migrations/

types/
└── venue-management.ts              # shared view/input types when not inferable from validation

__tests__/
├── lib/
│   ├── actions/
│   │   ├── venue-organizations.test.ts
│   │   ├── venue-schedules.test.ts
│   │   ├── venue-requests.test.ts
│   │   ├── venue-content.test.ts
│   │   └── venue-relationships.test.ts
│   └── utils/
│       └── venue-schedule.test.ts
└── components/
    └── features/
        └── venue-admin/
```

**Structure Decision**: Use the existing single Next.js application structure. Extend current `Venue` functionality where it represents physical locations, add a `VenueOrganization` ownership layer for rink businesses, and add new feature-specific Server Action files/components rather than expanding the already broad `lib/actions/venues.ts` indefinitely.

## Complexity Tracking

No constitution violations require justification. The feature is broad, but the planned model separates concerns into venue profile, staff, surfaces, schedule blocks, requests, content, and relationships so each user story can be implemented and tested independently.

## Phase 0: Research Summary

See [research.md](./research.md). Key decisions:

- Introduce `VenueOrganization` and staff roles instead of forcing rink ownership into team/league models.
- Extend existing `Venue` for public rink profile/location data and preserve current team/league venue compatibility.
- Represent operating hours and publishable availability with explicit schedule block models rather than generating only team `Event` records.
- Use request/inquiry status workflows first; defer payments and external governing-body verification.
- Store USA skating/hockey levels as internal reference labels initially.

## Phase 1: Design Summary

See [data-model.md](./data-model.md) for proposed entities, relationships, validation rules, and state transitions.

Contracts:

- [server-actions.md](./contracts/server-actions.md): Server Action inputs, outputs, authorization, and revalidation behavior.
- [public-routes.md](./contracts/public-routes.md): Public and authenticated route behavior for venue profiles, schedules, admin flows, and relationship invitations.

Quickstart:

- [quickstart.md](./quickstart.md): Implementation and validation workflow.

## Post-Design Constitution Check

The design remains aligned with the active repository conventions:

- All write paths are planned as Server Actions with Zod validation and explicit authorization.
- Public profile and schedule reads separate public-safe data from manager-only data.
- Prisma schema changes are isolated to migration-backed models and preserve existing venue/event references.
- Tests are planned around validation schemas, action authorization, schedule conflict helpers, and component-level manager workflows.

**Gate Result**: PASS. No unresolved clarifications.
