# Implementation Plan: Sport-Aware Season & Game Scheduling via Events

**Branch**: `005-season-scheduling` | **Date**: 2026-07-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-season-scheduling/spec.md`

## Summary

Replace the legacy `GameSchedule`/`ScheduleGame` feature (whose round-robin toggle is a stored no-op and whose schedules are create-only) with season-based scheduling: `Season` → optional `SeasonPhase`s → `SeasonGame`s referencing real `Team` records. Games link 1:1 to calendar `Event` rows (reusing the existing inter-team `homeTeamId`/`awayTeamId` + dual-roster RSVP fan-out pattern). Schedule format becomes an optional enum honored honestly (round-robin is the only generator; other values are labels). Team-to-team `GameProposal` threads support pre-season coordination; `PlacementDecision` records skill-based division placement. A typed sport capability catalog keyed by the existing `Sport` enum drives terminology, age classifications, surface-usage options, and suggested formats — hockey fully populated, other sports degrading to neutral defaults with undefined fields hidden. The legacy feature is deleted outright (pre-launch; no data migration).

## Technical Context

**Language/Version**: TypeScript (strict) on Next.js 16 App Router, React 19
**Primary Dependencies**: MUI v7 + Emotion, Prisma 7 (Neon PostgreSQL adapter), Auth.js v5, Zod v4, Bun
**Storage**: PostgreSQL via Prisma; new models `Season`, `SeasonPhase`, `SeasonGame`, `GameProposal`, `GameProposalEntry`, `PlacementDecision`; `Division.ageClassification` added; `GameSchedule`/`ScheduleGame` dropped
**Testing**: Vitest (+ Testing Library for components); unit tests for validation schemas, generation math, standings, sport catalog, conflict logic
**Target Platform**: Vercel (web), mobile-first responsive UI
**Project Type**: Web application (Next.js App Router monolith)
**Performance Goals**: Generation preview + publish for 8 teams × 2 rounds (56 games) completes interactively; RSVP fan-out batched per game transaction as today
**Constraints**: Server Actions only (no new API routes); every action authenticates then authorizes; Zod validation on all inputs; `revalidatePath` after mutations; amounts N/A (no payments in this feature)
**Scale/Scope**: ~6 new Prisma models + 1 enum change, ~5 new server-action modules, ~1 new dashboard route group (`/seasons`), removal of `/schedules` feature, ~15–20 new components

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is an unfilled template; the operative constitution is `CLAUDE.md`. Gates applied:

| Gate | Status | Notes |
| ---- | ------ | ----- |
| Server Actions first, API routes only for webhooks/cron | PASS | No new API routes; all mutations are Server Actions |
| Auth-first pattern (`requireUserId` → Zod → authorization → Prisma → revalidate) | PASS | All new actions follow the standard template |
| No raw SQL; Prisma parameterized queries only | PASS | |
| Zod v4 validation on every input | PASS | New schemas in `lib/utils/validation.ts` |
| Mobile-first MUI v7 UI | PASS | Card layouts on mobile, tables on desktop, 44px touch targets |
| Emergency-contact/admin-only data protection | PASS | Placement notes are league-admin-only (analogous pattern) |
| Commit schema + migration together | PASS | Single migration for adds + legacy drops |
| Pre-existing test failures not touched | PASS | `theme-marketing`, `DragDropTeams` untouched |

**Post-design re-check**: PASS — no violations introduced; no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/005-season-scheduling/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── server-actions.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
prisma/
└── schema.prisma                     # +Season, SeasonPhase, SeasonGame, GameProposal,
                                      #  GameProposalEntry, PlacementDecision, ScheduleFormat,
                                      #  SeasonPhaseType, SeasonGameStatus, GameProposalStatus enums;
                                      #  Division.ageClassification; −GameSchedule, −ScheduleGame

lib/
├── utils/
│   ├── sport-catalog.ts              # NEW: per-Sport capability catalog (hockey first-class)
│   ├── season-standings.ts           # NEW: generalized standings (adapted from event-standings)
│   ├── round-robin.ts                # NEW: pure pairing/slot math (unit-testable)
│   ├── game-conflicts.ts             # NEW: unified venue/surface availability check for games
│   └── validation.ts                 # +season/game/proposal/placement schemas; −schedule schemas
├── actions/
│   ├── seasons.ts                    # NEW: season + phase CRUD, archive
│   ├── season-games.ts               # NEW: game create/update/cancel/publish + Event/RSVP fan-out
│   ├── season-generation.ts          # NEW: draft round-robin generation + preview
│   ├── game-proposals.ts             # NEW: propose/counter/accept/decline/withdraw/expire
│   ├── placements.ts                 # NEW: placement view data + decisions + division assignment
│   └── game-schedules.ts             # REMOVED

components/features/
├── seasons/                          # NEW: SeasonList, SeasonForm, SeasonDetail, PhaseEditor,
│   │                                 #      GameForm, GamesTable, GenerationWizard, ProposalInbox,
│   │                                 #      ProposalThread, PlacementBoard, StandingsTable
└── schedules/                        # REMOVED (ScheduleBuilder, ScheduleDetail, ScheduleList)

app/(dashboard)/
├── seasons/                          # NEW: list, [seasonId], [seasonId]/games, [seasonId]/placement,
│   │                                 #      proposals routes
└── schedules/                        # REMOVED

types/
└── seasons.ts                        # NEW: shared types for seasons/games/proposals/placement

__tests__/
├── lib/utils/{sport-catalog,round-robin,season-standings,game-conflicts}.test.ts
└── components/features/seasons/*.test.tsx
```

**Structure Decision**: Standard OpenLeague layout — Server Components fetch in `app/(dashboard)/seasons/*`, mutations in `lib/actions/*`, pure logic in `lib/utils/*` for unit testability, feature components under `components/features/seasons/`.

## Design Decisions (Phase 0/1 summary)

1. **One calendar Event per game, anchored on the home team** — matches the existing inter-team pattern (`Event.homeTeamId/awayTeamId`, RSVPs created for the union of both rosters). `SeasonGame.eventId` is a nullable 1:1; DRAFT games have no Event, publishing creates it, canceling marks status and notifies rather than deleting.
2. **Format lives on Season and SeasonPhase as optional enum + rounds** — never required; the UI presents it only inside the generation wizard or as an explicit "label this phase" affordance (FR-004/005/007).
3. **Round-robin as pure function** — `lib/utils/round-robin.ts` computes pairings × rounds and slot assignment from (date range, eligible days/times, optional default venue); actions wrap it in draft-game creation. Preview and creation share the same function output (FR-016).
4. **Proposal thread = `GameProposal` + append-only `GameProposalEntry`** — entries of kind PROPOSE/COUNTER/ACCEPT/DECLINE/WITHDRAW carry terms (startAt/endAt/venueId/note); current terms = latest PROPOSE/COUNTER; expiry compares latest terms' startAt to now (FR-020/022); acceptance races resolved by transactional status transition (first decision wins).
5. **Placement = append-only `PlacementDecision`** — team + season + division + optional rank + private note + actor; team's `divisionId` updated alongside; history preserved (FR-027/028).
6. **Age gating via `Division.ageClassification`** (new nullable enum field reusing `AgeClassification`); a game's level = most restrictive of the two teams' division classifications; none recorded → score-eligible (FR-040). Reuses `isStatsEligible` from `lib/utils/age-level.ts`.
7. **Sport catalog is code, not data** — `lib/utils/sport-catalog.ts` keyed by the existing `Sport` enum; entries define labels, age-classification sets, surface-usage options, and suggested formats; missing entry → neutral defaults with surface-usage hidden (FR-031/033). Hockey entry fully populated (FR-032).
8. **Unified game conflict check** — `lib/utils/game-conflicts.ts` overlap-checks a candidate (venue, optional surface, time range) against calendar Events at the venue, SeasonGames, and PUBLISHED VenueScheduleBlocks; returns warnings; saves with conflicts require `overrideConflicts: true` and record actor/time on the game (FR-012/013). Sub-surface segment math deferred to spec 006.
9. **Legacy drop in the same migration** — `GameSchedule`/`ScheduleGame` tables dropped, `Event.scheduleGame` relation removed, `/schedules` routes/components/actions/validation deleted, nav entries repointed to `/seasons` (FR-035).

## Complexity Tracking

No constitution violations to justify.
