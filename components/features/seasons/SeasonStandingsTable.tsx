import {
  Card,
  CardContent,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { SeasonStandingsRow } from "@/lib/utils/season-standings";

interface SeasonStandingsTableProps {
  /** Precomputed on the server from the season's COMPLETED games (FR-030). */
  rows: SeasonStandingsRow[];
  /**
   * True when any participating team's age level is below the score-recording
   * threshold (FR-040) — standings are suppressed entirely, matching the
   * platform's age-gating elsewhere.
   */
  gated: boolean;
}

/**
 * Season standings per the platform convention (2 points for a win, 1 for a
 * tie; GD then GF tiebreaks — see lib/utils/season-standings.ts). Mirrors the
 * signup-events StandingsTable layout; the table scrolls horizontally inside
 * its container on small screens.
 */
export function SeasonStandingsTable({ rows, gated }: SeasonStandingsTableProps) {
  return (
    <Card>
      <CardContent>
        <Stack spacing={1.5}>
          <Typography variant="h6">Standings</Typography>
          {gated ? (
            <Typography variant="body2" color="text.secondary">
              Standings are not displayed for this age level.
            </Typography>
          ) : rows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Standings appear once games are scheduled and scores are recorded.
            </Typography>
          ) : (
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Team</TableCell>
                    <TableCell align="right">GP</TableCell>
                    <TableCell align="right">W</TableCell>
                    <TableCell align="right">L</TableCell>
                    <TableCell align="right">T</TableCell>
                    <TableCell align="right">GF</TableCell>
                    <TableCell align="right">GA</TableCell>
                    <TableCell align="right">PTS</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.teamId}>
                      <TableCell>{row.teamName}</TableCell>
                      <TableCell align="right">{row.gamesPlayed}</TableCell>
                      <TableCell align="right">{row.wins}</TableCell>
                      <TableCell align="right">{row.losses}</TableCell>
                      <TableCell align="right">{row.ties}</TableCell>
                      <TableCell align="right">{row.goalsFor}</TableCell>
                      <TableCell align="right">{row.goalsAgainst}</TableCell>
                      <TableCell align="right">{row.points}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
