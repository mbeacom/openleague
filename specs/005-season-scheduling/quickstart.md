# Quickstart: Season Scheduling (005)

## What this feature is

Seasons ("Fall 2026") with optional phases (pre-season / regular season / playoffs) containing games between real teams. No format is ever required — round-robin generation is opt-in and honest. Coaches negotiate games via propose/accept threads; league admins place teams into divisions by skill after pre-season. The legacy `/schedules` builder is deleted.

## Try it (after implementation)

```bash
bun run dev:wake            # wake Neon + start dev server
```

1. **Manual path (US1)**: Dashboard → Seasons → New Season (name + dates only) → Add Game (teams, time, venue, optional surface) → game appears on both team calendars with RSVPs; overlapping venue bookings warn before save.
2. **Generation (US2)**: Season → Generate → pick round-robin, teams (division defaults), rounds, date range → review draft games (preview count = created count, always) → edit/remove → Publish.
3. **Proposals (US3)**: Team admin → Seasons → Proposals → New proposal to another team → other admin accepts/counters → accepted game lands on both calendars.
4. **Placement (US4)**: League admin → Season → Placement → review pre-season records (or manual ranks below Squirt age) → assign divisions → regular-season generation defaults to division teams.
5. **Sport awareness (US5)**: Hockey teams see ice usage + USA Hockey ages; a soccer league sees neutral labels and no ice fields.

## Key files

| Area | Path |
| ---- | ---- |
| Schema | `prisma/schema.prisma` (Season, SeasonPhase, SeasonGame, GameProposal*, PlacementDecision) |
| Actions | `lib/actions/{seasons,season-games,season-generation,game-proposals,placements}.ts` |
| Pure logic | `lib/utils/{sport-catalog,round-robin,game-conflicts,season-standings}.ts` |
| UI | `components/features/seasons/`, `app/(dashboard)/seasons/` |
| Tests | `__tests__/lib/utils/*.test.ts`, `__tests__/components/features/seasons/` |

## Verify

```bash
bun run type-check && bun run lint && bun run test
bun run build        # required: route additions/removals (Next route collisions aren't caught by type-check)
```

Database: `bun run db:migrate` (dev) — the migration adds the new tables, `Division.ageClassification`, and DROPS `game_schedules`/`schedule_games` (pre-launch; no data migration).
