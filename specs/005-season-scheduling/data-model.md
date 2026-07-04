# Data Model: Sport-Aware Season & Game Scheduling

**Feature**: 005-season-scheduling | **Date**: 2026-07-04

## New Enums

```prisma
enum ScheduleFormat {
  ROUND_ROBIN        // only format with a generator initially
  SINGLE_ELIMINATION // label only
  DOUBLE_ELIMINATION // label only
  POOL_PLAY          // label only
  LADDER             // label only
  CUSTOM             // label only
}

enum SeasonPhaseType {
  PRE_SEASON
  REGULAR_SEASON
  PLAYOFFS
  CUSTOM
}

enum SeasonGameStatus {
  DRAFT      // generated/created but unpublished; no calendar Event exists
  SCHEDULED  // published; calendar Event + RSVPs exist
  COMPLETED
  CANCELED   // Event marked canceled, history preserved
}

enum GameProposalStatus {
  PENDING
  ACCEPTED
  DECLINED
  WITHDRAWN
  EXPIRED    // latest proposed start passed without acceptance (set lazily on read/action)
}

enum GameProposalEntryKind {
  PROPOSE
  COUNTER
  ACCEPT
  DECLINE
  WITHDRAW
}
```

## Changed Models

```prisma
model Division {
  // ... existing fields ...
  // NEW: structured age level driving score/standings gating (FR-040).
  // Free-text ageGroup retained for display; forms set both going forward.
  ageClassification AgeClassification?
}

model Event {
  // REMOVED: scheduleGame ScheduleGame?  (legacy relation)
  // NEW back-relation:
  seasonGame SeasonGame?
}

model Team {
  // NEW back-relations: seasonsOwned Season[], homeSeasonGames SeasonGame[],
  // awaySeasonGames SeasonGame[], proposalsSent GameProposal[],
  // proposalsReceived GameProposal[], placementDecisions PlacementDecision[]
}

model League {
  // NEW back-relations: seasons Season[], gameProposals GameProposal[]
}
```

## Removed Models

`GameSchedule`, `ScheduleGame` (tables dropped in the same migration; pre-launch, no data migration). `ScheduleStatus` enum removed if unreferenced after drop.

## New Models

```prisma
// A scheduling container ("Fall 2026") owned by a league or a standalone team.
// Format is an OPTIONAL descriptive label — never required (FR-003/004).
model Season {
  id          String    @id @default(cuid())
  name        String
  description String?
  startDate   DateTime
  endDate     DateTime
  archivedAt  DateTime? // archive hides from default views; games untouched (FR-001)

  format       ScheduleFormat? // optional label
  formatRounds Int?            // meaningful when format = ROUND_ROBIN

  // Owner — exactly one of these is set (DB CHECK constraint, XOR)
  leagueId String?
  league   League? @relation(fields: [leagueId], references: [id], onDelete: Cascade)
  teamId   String?
  team     Team?   @relation(fields: [teamId], references: [id], onDelete: Cascade)

  createdById String
  createdBy   User   @relation("SeasonCreator", fields: [createdById], references: [id], onDelete: Restrict)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  phases     SeasonPhase[]
  games      SeasonGame[]
  placements PlacementDecision[]
  proposals  GameProposal[]

  @@index([leagueId, startDate])
  @@index([teamId, startDate])
  @@map("seasons")
}

// Ordered subdivision of a season (FR-002). A season without phases behaves
// as a single implicit phase (games may attach directly to the season).
model SeasonPhase {
  id        String          @id @default(cuid())
  name      String
  type      SeasonPhaseType @default(CUSTOM)
  sortOrder Int             @default(0)
  startDate DateTime
  endDate   DateTime

  format       ScheduleFormat? // optional label (FR-004/005)
  formatRounds Int?

  seasonId String
  season   Season @relation(fields: [seasonId], references: [id], onDelete: Cascade)

  games SeasonGame[]

  @@index([seasonId, sortOrder])
  @@map("season_phases")
}

// A scheduled matchup between two real Teams (FR-008). Pattern follows
// signup-events EventGame; Event linkage follows legacy ScheduleGame.
model SeasonGame {
  id       String           @id @default(cuid())
  status   SeasonGameStatus @default(DRAFT)
  startAt  DateTime
  endAt    DateTime
  timezone String           @default("America/New_York")

  // Location (all optional; FR-008)
  venueId      String?
  venue        Venue?      @relation(fields: [venueId], references: [id], onDelete: SetNull)
  surfaceId    String?
  surface      IceSurface? @relation(fields: [surfaceId], references: [id], onDelete: SetNull)
  surfaceUsage IceUsage?   // null when sport catalog defines no usage options (FR-033)
  zoneLabel    String?     // "North half"
  locationText String?     // free text when no venue

  homeTeamId String
  homeTeam   Team   @relation("SeasonGameHome", fields: [homeTeamId], references: [id], onDelete: Cascade)
  awayTeamId String
  awayTeam   Team   @relation("SeasonGameAway", fields: [awayTeamId], references: [id], onDelete: Cascade)

  // Writable only when the derived age level is stats-eligible (FR-040)
  homeScore Int?
  awayScore Int?
  notes     String?

  // Recorded venue-conflict override (FR-013)
  conflictOverriddenById String?
  conflictOverriddenBy   User?     @relation("SeasonGameConflictOverride", fields: [conflictOverriddenById], references: [id], onDelete: SetNull)
  conflictOverriddenAt   DateTime?

  seasonId String
  season   Season       @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  phaseId  String?
  phase    SeasonPhase? @relation(fields: [phaseId], references: [id], onDelete: SetNull)

  // 1:1 calendar Event (home-team anchored, dual-roster RSVPs); null while DRAFT (FR-009/017)
  eventId String? @unique
  event   Event?  @relation(fields: [eventId], references: [id], onDelete: SetNull)

  // Origin proposal when created via accept (FR-021)
  proposalId String?       @unique
  proposal   GameProposal? @relation(fields: [proposalId], references: [id])

  createdById String
  createdBy   User   @relation("SeasonGameCreator", fields: [createdById], references: [id], onDelete: Restrict)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([seasonId, startAt])
  @@index([phaseId, startAt])
  @@index([homeTeamId, startAt])
  @@index([awayTeamId, startAt])
  @@index([venueId, startAt])
  @@index([surfaceId, startAt])
  @@map("season_games")
}

// A negotiation thread between two teams for a prospective game (FR-019–024).
model GameProposal {
  id     String             @id @default(cuid())
  status GameProposalStatus @default(PENDING)

  leagueId String // proposals are same-league in v1 (assumption)
  league   League @relation(fields: [leagueId], references: [id], onDelete: Cascade)

  proposingTeamId String
  proposingTeam   Team   @relation("ProposalsSent", fields: [proposingTeamId], references: [id], onDelete: Cascade)
  receivingTeamId String
  receivingTeam   Team   @relation("ProposalsReceived", fields: [receivingTeamId], references: [id], onDelete: Cascade)

  seasonId String?
  season   Season? @relation(fields: [seasonId], references: [id], onDelete: SetNull)
  phaseId  String? // resolved at accept time when season set (FR-021)

  createdById String
  createdBy   User   @relation("GameProposalCreator", fields: [createdById], references: [id], onDelete: Restrict)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  resolvedAt  DateTime?

  entries       GameProposalEntry[]
  resultingGame SeasonGame?

  @@index([receivingTeamId, status])
  @@index([proposingTeamId, status])
  @@index([leagueId, status])
  @@map("game_proposals")
}

// Append-only negotiation log; the latest PROPOSE/COUNTER entry holds the
// current terms, whose startAt drives expiry (FR-022).
model GameProposalEntry {
  id   String                @id @default(cuid())
  kind GameProposalEntryKind

  // Terms (set on PROPOSE/COUNTER; null on ACCEPT/DECLINE/WITHDRAW)
  startAt DateTime?
  endAt   DateTime?
  venueId String?
  venue   Venue?  @relation(fields: [venueId], references: [id], onDelete: SetNull)
  note    String?

  proposalId String
  proposal   GameProposal @relation(fields: [proposalId], references: [id], onDelete: Cascade)

  actorTeamId String // which side acted
  actorUserId String
  actorUser   User   @relation("GameProposalActor", fields: [actorUserId], references: [id], onDelete: Restrict)
  createdAt   DateTime @default(now())

  @@index([proposalId, createdAt])
  @@map("game_proposal_entries")
}

// A recorded league-admin placement action (FR-027/028). Append-only; the
// latest decision per (seasonId, teamId) is current. Team.divisionId is
// updated in the same transaction.
model PlacementDecision {
  id String @id @default(cuid())

  seasonId String
  season   Season @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  teamId   String
  team     Team   @relation(fields: [teamId], references: [id], onDelete: Cascade)

  divisionId String?
  division   Division? @relation(fields: [divisionId], references: [id], onDelete: SetNull)

  rank        Int?    // manual ordering for sub-threshold age levels (FR-026)
  privateNote String? // league-admin-only (FR-026)

  decidedById String
  decidedBy   User   @relation("PlacementDecider", fields: [decidedById], references: [id], onDelete: Restrict)
  createdAt   DateTime @default(now())

  @@index([seasonId, teamId, createdAt])
  @@map("placement_decisions")
}
```

## DB Constraints (raw SQL in migration, matching existing patterns)

- `seasons`: CHECK — exactly one of (`leagueId`, `teamId`) is non-null (mirrors SignupEvent host XOR).
- `season_games`: CHECK — `homeTeamId <> awayTeamId`.
- Drop `game_schedules`, `schedule_games` tables; drop `ScheduleStatus` enum value usage.

## State Transitions

**SeasonGame.status**: `DRAFT → SCHEDULED` (publish: create Event + RSVPs in transaction) · `SCHEDULED → COMPLETED` (scores recorded / end passed) · `SCHEDULED → CANCELED` (Event marked canceled, members notified) · `DRAFT → (deleted)` (drafts are hard-deletable; FR-017, edge case).

**GameProposal.status**: `PENDING → ACCEPTED` (guarded transactional update `WHERE status = 'PENDING'` — first decision wins) · `PENDING → DECLINED | WITHDRAWN` · `PENDING → EXPIRED` (lazily when latest terms' startAt < now at read/action time).

## Derived Rules

- **Game age level** (FR-040): `min(homeTeam.division.ageClassification, awayTeam.division.ageClassification)` by rank order (younger = more restrictive); null when both unset → score-eligible. Enforced in score-recording actions via `isStatsEligible`.
- **RSVP fan-out** (FR-009): on publish, create one `Event` (`type: GAME`, `teamId = homeTeamId`, `homeTeamId`/`awayTeamId` set, `leagueId` from season owner) with `RSVP` rows for the deduplicated union of both teams' members — identical to legacy generator behavior.
- **Reschedule** (FR-011): update Event startAt/endAt/venue, keep RSVP rows, notify members; RSVPs flagged for re-confirmation via notification message (no schema change — reuses event-update notification path).
- **Standings** (FR-030): computed from COMPLETED games with scores, grouped by phase and division; 2 pts win / 1 tie, goal-diff then goals-for tiebreak (same convention as `lib/utils/event-standings.ts`).

## Validation Rules (Zod, `lib/utils/validation.ts`)

- Season: name 1–120 chars; endDate ≥ startDate; owner resolved server-side from route context (league vs team), never client-trusted.
- Phase: date range within season range; sortOrder int ≥ 0.
- Game: endAt > startAt; homeTeamId ≠ awayTeamId; venue/surface/usage optional; surfaceUsage must be one of the sport catalog's options when provided; scores int ≥ 0, only when age-eligible.
- Generation input: 2–20 teams; rounds 1–4 (legacy bound retained); date range ≥ 1 day; eligible days non-empty.
- Proposal: terms required on PROPOSE/COUNTER; note ≤ 1000 chars.
- Placement: rank int ≥ 1 when provided; privateNote ≤ 2000 chars.
