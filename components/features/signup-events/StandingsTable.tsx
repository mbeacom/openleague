import {
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { StandingsRow } from "@/lib/utils/event-standings";

interface StandingsTableProps {
  standings: StandingsRow[];
}

/** Tournament standings — only rendered for age-eligible tournament events. */
export function StandingsTable({ standings }: StandingsTableProps) {
  return (
    <Stack spacing={1.5}>
      <Typography variant="h6">Standings</Typography>
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
            {standings.map((row) => (
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
    </Stack>
  );
}
