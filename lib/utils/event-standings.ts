/**
 * Read-time standings for TOURNAMENT signup events — derived from COMPLETED
 * game scores, never stored (research R10/FR-037). Two points for a win, one
 * for a tie; ranked by points, then goal differential, then goals for.
 */

export type StandingsGame = {
  status: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
};

export type StandingsRow = {
  teamId: string;
  teamName: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
};

export function computeStandings(
  teams: Array<{ id: string; name: string }>,
  games: StandingsGame[]
): StandingsRow[] {
  const rows = new Map<string, StandingsRow>(
    teams.map((team) => [
      team.id,
      {
        teamId: team.id,
        teamName: team.name,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
      },
    ])
  );

  for (const game of games) {
    if (game.status !== "COMPLETED" || game.homeScore == null || game.awayScore == null) {
      continue;
    }
    const home = rows.get(game.homeTeamId);
    const away = rows.get(game.awayTeamId);
    if (!home || !away) continue;

    home.gamesPlayed += 1;
    away.gamesPlayed += 1;
    home.goalsFor += game.homeScore;
    home.goalsAgainst += game.awayScore;
    away.goalsFor += game.awayScore;
    away.goalsAgainst += game.homeScore;

    if (game.homeScore > game.awayScore) {
      home.wins += 1;
      home.points += 2;
      away.losses += 1;
    } else if (game.awayScore > game.homeScore) {
      away.wins += 1;
      away.points += 2;
      home.losses += 1;
    } else {
      home.ties += 1;
      away.ties += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  return [...rows.values()].sort(
    (left, right) =>
      right.points - left.points ||
      right.goalsFor - right.goalsAgainst - (left.goalsFor - left.goalsAgainst) ||
      right.goalsFor - left.goalsFor ||
      left.teamName.localeCompare(right.teamName)
  );
}
