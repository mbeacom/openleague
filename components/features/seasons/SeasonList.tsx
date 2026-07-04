"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  FormControlLabel,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { ScheduleFormat } from "@prisma/client";
import { SCHEDULE_FORMAT_LABELS } from "@/lib/utils/sport-catalog";

export interface SeasonListItem {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  archivedAt: Date | null;
  format: ScheduleFormat | null;
  formatRounds: number | null;
  ownerName: string;
  gameCount: number;
}

interface SeasonListProps {
  seasons: SeasonListItem[];
  showArchived: boolean;
}

// Season dates are date-only values stored at UTC midnight — format in UTC so
// they never drift a day in the viewer's local zone.
const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(date));

const formatChipLabel = (format: ScheduleFormat, rounds: number | null) =>
  `${SCHEDULE_FORMAT_LABELS[format]}${
    format === "ROUND_ROBIN" && rounds ? ` · ${rounds} round${rounds === 1 ? "" : "s"}` : ""
  }`;

/**
 * Season list: cards on mobile, table on desktop. The format chip appears only
 * when a season actually carries a format label (FR-004 — never implied).
 */
export function SeasonList({ seasons, showArchived }: SeasonListProps) {
  const router = useRouter();

  return (
    <Stack spacing={2}>
      <FormControlLabel
        control={
          <Switch
            checked={showArchived}
            onChange={(event) =>
              router.replace(event.target.checked ? "/seasons?archived=1" : "/seasons")
            }
          />
        }
        label="Show archived seasons"
      />

      {/* Mobile: cards */}
      <Stack spacing={2} sx={{ display: { xs: "flex", sm: "none" } }}>
        {seasons.map((season) => (
          <Card key={season.id}>
            <CardActionArea component={Link} href={`/seasons/${season.id}`} sx={{ minHeight: 44 }}>
              <CardContent>
                <Stack spacing={0.75}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="h6">{season.name}</Typography>
                    {season.archivedAt ? <Chip size="small" label="Archived" /> : null}
                    {season.format ? (
                      <Chip
                        size="small"
                        variant="outlined"
                        label={formatChipLabel(season.format, season.formatRounds)}
                      />
                    ) : null}
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {formatDate(season.startDate)} – {formatDate(season.endDate)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {season.ownerName} · {season.gameCount} game{season.gameCount === 1 ? "" : "s"}
                  </Typography>
                </Stack>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Stack>

      {/* Desktop: table */}
      <Box sx={{ display: { xs: "none", sm: "block" } }}>
        {seasons.length > 0 ? (
          <TableContainer component={Card} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Season</TableCell>
                  <TableCell>Dates</TableCell>
                  <TableCell>Owner</TableCell>
                  <TableCell align="right">Games</TableCell>
                  <TableCell>Format</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {seasons.map((season) => (
                  <TableRow key={season.id} hover>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography
                          component={Link}
                          href={`/seasons/${season.id}`}
                          sx={{
                            color: "primary.main",
                            textDecoration: "none",
                            fontWeight: 600,
                            "&:hover": { textDecoration: "underline" },
                          }}
                        >
                          {season.name}
                        </Typography>
                        {season.archivedAt ? <Chip size="small" label="Archived" /> : null}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      {formatDate(season.startDate)} – {formatDate(season.endDate)}
                    </TableCell>
                    <TableCell>{season.ownerName}</TableCell>
                    <TableCell align="right">{season.gameCount}</TableCell>
                    <TableCell>
                      {season.format ? (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={formatChipLabel(season.format, season.formatRounds)}
                        />
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          —
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : null}
      </Box>
    </Stack>
  );
}
