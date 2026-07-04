# Server Action Contracts: Season Scheduling

**Feature**: 005-season-scheduling | All actions return `ActionResult<T>` (`{ success: true, data } | { success: false, error, details? }`), authenticate first (`requireUserId`), validate with Zod, then authorize. Paths revalidated after mutations.

## lib/actions/seasons.ts

| Action | Input | Auth | Behavior |
| ------ | ----- | ---- | -------- |
| `createSeason` | `{ name, description?, startDate, endDate, leagueId? \| teamId? }` | League admin (league-owned) or team admin (team-owned) | Creates season; owner XOR enforced |
| `updateSeason` | `{ seasonId, name?, description?, startDate?, endDate?, format?, formatRounds? }` | Owner admin | Format may be set/cleared freely (label only) |
| `archiveSeason` / `unarchiveSeason` | `{ seasonId }` | Owner admin | Sets/clears `archivedAt`; games untouched |
| `createPhase` / `updatePhase` / `deletePhase` | phase fields + `seasonId` | Owner admin | Date range validated within season; delete only when phase has no games |
| `getSeasons` / `getSeasonDetail` | context ids | Member of owner org | Read; archived hidden by default |

## lib/actions/season-games.ts

| Action | Input | Auth | Behavior |
| ------ | ----- | ---- | -------- |
| `createSeasonGame` | game fields + `{ publish?: boolean, overrideConflicts?: boolean }` | Owner admin, or team admin of a participating team (team-owned seasons: opponents limited to teams the scheduler administers) | Runs conflict check; conflicts → returned as warning unless `overrideConflicts` (recorded). `publish: true` creates Event + dual-roster RSVPs in one transaction |
| `updateSeasonGame` | `{ gameId, ...fields, overrideConflicts? }` | Same as create | Reschedule updates linked Event, keeps RSVPs, notifies members (FR-010/011) |
| `publishSeasonGames` | `{ seasonId, gameIds? }` | Owner admin | Bulk DRAFT → SCHEDULED with per-game Event/RSVP transaction |
| `cancelSeasonGame` | `{ gameId }` | Owner admin / participating team admin | Status CANCELED; Event retained + marked; members notified |
| `deleteDraftGame` | `{ gameId }` | Owner admin | DRAFT only; hard delete |
| `recordGameScore` | `{ gameId, homeScore, awayScore }` | Owner admin / participating team admin | Rejected unless derived age level is stats-eligible (FR-040) |
| `getSeasonGames` | `{ seasonId, phaseId? }` | Member | Read with team/venue/surface includes |
| `checkGameConflicts` | `{ venueId, surfaceId?, startAt, endAt, excludeGameId? }` | Authenticated | Pure read for form-time warnings (FR-012) |

## lib/actions/season-generation.ts

| Action | Input | Auth | Behavior |
| ------ | ----- | ---- | -------- |
| `previewRoundRobin` | `{ seasonId, phaseId?, teamIds[], rounds, dateRange, eligibleDays[], startTime, gameDurationMinutes, defaultVenueId? }` | Owner admin | Pure computation via `lib/utils/round-robin.ts`; returns proposed games + per-game conflict flags; NO writes |
| `generateRoundRobin` | same input | Owner admin | Same function output persisted as DRAFT games; sets phase/season `format: ROUND_ROBIN, formatRounds`; returns created ids. Preview/create share one deterministic function (FR-016) |

## lib/actions/game-proposals.ts

| Action | Input | Auth | Behavior |
| ------ | ----- | ---- | -------- |
| `createGameProposal` | `{ receivingTeamId, seasonId?, startAt, endAt, venueId?, note? }` | Admin of proposing team; both teams same league | PENDING proposal + PROPOSE entry; notifies receiving admins |
| `counterProposal` | `{ proposalId, startAt, endAt, venueId?, note? }` | Admin of the non-last-acting team | Appends COUNTER entry; notifies other side |
| `acceptProposal` | `{ proposalId, overrideConflicts? }` | Admin of team receiving current terms | Guarded transition (`WHERE status='PENDING'`, expiry checked against latest terms); creates SCHEDULED SeasonGame + Event + RSVPs; season/phase resolved from proposed date (FR-021) |
| `declineProposal` / `withdrawProposal` | `{ proposalId, reason? }` | Receiving admin / proposing admin | Terminal status + entry; notifies |
| `getProposalsForTeam` / `getProposalsForLeague` | ids | Team admin / league admin (FR-024) | Read; lazily marks expired |

## lib/actions/placements.ts

| Action | Input | Auth | Behavior |
| ------ | ----- | ---- | -------- |
| `getPlacementBoard` | `{ seasonId, phaseId? }` | League admin | Per team: games played, opponents, W/L/T where age-eligible; manual rank + private notes where not (FR-025/026); unevaluated teams flagged |
| `recordPlacement` | `{ seasonId, teamId, divisionId?, rank?, privateNote? }` | League admin | Appends PlacementDecision + updates `Team.divisionId` in one transaction (FR-027/028) |
| `createDivisionInline` | `{ leagueId, name, ageClassification? }` | League admin | Convenience for placement flow (FR-027) |

## lib/utils (pure, unit-tested; no auth)

- `sport-catalog.ts`: `getSportCapabilities(sport: Sport)` → `{ labels, ageClassifications, surfaceUsageOptions?, suggestedFormats }`; neutral default; hockey fully populated.
- `round-robin.ts`: `buildRoundRobin(input)` → deterministic proposed-game list (circle method, home/away balanced).
- `game-conflicts.ts`: `findGameConflicts(candidate)` → conflicts from Events, SeasonGames, published VenueScheduleBlocks (venue-wide + same-surface).
- `season-standings.ts`: `computeStandings(games, grouping)` → ranked rows (2/1 points, GD/GF tiebreaks); caller enforces age gating.

## Notifications & Emails

Reuse existing notification preference + email template infrastructure: proposal created/countered/accepted/declined, game rescheduled/canceled. New templates in `lib/email/templates.ts` following existing naming (`sendGameProposalEmail`, `sendGameRescheduledEmail`).
