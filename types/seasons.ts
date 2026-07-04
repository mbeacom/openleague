import type {
  GameProposalEntryKind,
  GameProposalStatus,
  IceUsage,
  ScheduleFormat,
  SeasonGameStatus,
  SeasonPhaseType,
  Sport,
} from "@prisma/client";

/** Season list/detail view model shared by server pages and client components. */
export interface SeasonSummary {
  id: string;
  name: string;
  description: string | null;
  startDate: Date;
  endDate: Date;
  archivedAt: Date | null;
  format: ScheduleFormat | null;
  formatRounds: number | null;
  leagueId: string | null;
  teamId: string | null;
  sport: Sport;
  gameCount: number;
}

export interface SeasonPhaseView {
  id: string;
  name: string;
  type: SeasonPhaseType;
  sortOrder: number;
  startDate: Date;
  endDate: Date;
  format: ScheduleFormat | null;
  formatRounds: number | null;
}

export interface SeasonGameView {
  id: string;
  status: SeasonGameStatus;
  startAt: Date;
  endAt: Date;
  timezone: string;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  venue: { id: string; name: string } | null;
  surface: { id: string; name: string } | null;
  surfaceUsage: IceUsage | null;
  zoneLabel: string | null;
  locationText: string | null;
  homeScore: number | null;
  awayScore: number | null;
  notes: string | null;
  phaseId: string | null;
  eventId: string | null;
  conflictOverriddenAt: Date | null;
}

/** A detected booking conflict surfaced to the scheduler before saving. */
export interface GameConflictView {
  source: "event" | "seasonGame" | "scheduleBlock";
  title: string;
  startAt: Date;
  endAt: Date | null;
  surfaceId: string | null;
}

export interface GameProposalEntryView {
  id: string;
  kind: GameProposalEntryKind;
  startAt: Date | null;
  endAt: Date | null;
  venue: { id: string; name: string } | null;
  note: string | null;
  actorTeamId: string;
  createdAt: Date;
}

export interface GameProposalView {
  id: string;
  status: GameProposalStatus;
  leagueId: string;
  proposingTeam: { id: string; name: string };
  receivingTeam: { id: string; name: string };
  seasonId: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  entries: GameProposalEntryView[];
  resultingGameId: string | null;
  /** True when the latest proposed start has passed without acceptance. */
  isExpired: boolean;
}

export interface PlacementBoardRow {
  teamId: string;
  teamName: string;
  divisionId: string | null;
  divisionName: string | null;
  gamesPlayed: number;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  opponents: string[];
  /** Latest manual rank recorded for this season, if any. */
  rank: number | null;
  /** League-admin-only note from the latest placement decision. */
  privateNote: string | null;
  /** True when score display is age-gated for this team's level. */
  scoresGated: boolean;
}
