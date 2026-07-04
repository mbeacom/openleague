"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import ArchiveIcon from "@mui/icons-material/Archive";
import UnarchiveIcon from "@mui/icons-material/Unarchive";
import type { ScheduleFormat, Sport } from "@prisma/client";
import { archiveSeason, unarchiveSeason } from "@/lib/actions/seasons";
import { SCHEDULE_FORMAT_LABELS } from "@/lib/utils/sport-catalog";
import { GameForm } from "./GameForm";
import { GamesTable } from "./GamesTable";
import { SeasonForm } from "./SeasonForm";
import type { SeasonGameView } from "@/types/seasons";

export interface SeasonDetailSeason {
  id: string;
  name: string;
  description: string | null;
  startDate: Date;
  endDate: Date;
  archivedAt: Date | null;
  format: ScheduleFormat | null;
  formatRounds: number | null;
  ownerName: string;
}

interface SeasonDetailProps {
  season: SeasonDetailSeason;
  games: SeasonGameView[];
  /** Eligible opponents: league teams, or teams the viewer administers. */
  teams: Array<{ id: string; name: string }>;
  venues: Array<{ id: string; name: string; timezone: string }>;
  surfacesByVenue: Record<string, Array<{ id: string; name: string }>>;
  /** Active segments per surface for the game form's segment picker (006). */
  segmentsBySurface?: Record<string, Array<{ id: string; name: string }>>;
  /** Whole-surface display label per surface ("Full ice"). */
  wholeLabelBySurface?: Record<string, string>;
  sport: Sport;
  canManage: boolean;
  /**
   * Rendered after the games section — seam for the generation wizard,
   * standings, and phases that land in follow-up stories.
   */
  extraSections?: React.ReactNode;
}

// Season dates are date-only values stored at UTC midnight — format in UTC.
const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(date));

/**
 * Season detail composition: header (format chip only when a label was
 * actually chosen — FR-004), games, and manual game scheduling (FR-008).
 */
export function SeasonDetail({
  season,
  games,
  teams,
  venues,
  surfacesByVenue,
  segmentsBySurface,
  wholeLabelBySurface,
  sport,
  canManage,
  extraSections,
}: SeasonDetailProps) {
  const router = useRouter();
  const [gameFormOpen, setGameFormOpen] = useState(false);
  const [editingGame, setEditingGame] = useState<SeasonGameView | null>(null);
  const [editSeasonOpen, setEditSeasonOpen] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isArchived = Boolean(season.archivedAt);

  const handleArchiveToggle = () => {
    startTransition(async () => {
      setArchiveError(null);
      const result = isArchived
        ? await unarchiveSeason({ seasonId: season.id })
        : await archiveSeason({ seasonId: season.id });
      if (!result.success) {
        setArchiveError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        justifyContent="space-between"
        alignItems={{ sm: "flex-start" }}
      >
        <Stack spacing={0.5}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="h4" component="h1">
              {season.name}
            </Typography>
            {season.format ? (
              <Chip
                size="small"
                variant="outlined"
                label={`${SCHEDULE_FORMAT_LABELS[season.format]}${
                  season.format === "ROUND_ROBIN" && season.formatRounds
                    ? ` · ${season.formatRounds} round${season.formatRounds === 1 ? "" : "s"}`
                    : ""
                }`}
              />
            ) : null}
          </Stack>
          <Typography color="text.secondary">
            {formatDate(season.startDate)} – {formatDate(season.endDate)} · {season.ownerName}
          </Typography>
          {season.description ? (
            <Typography variant="body2" color="text.secondary">
              {season.description}
            </Typography>
          ) : null}
        </Stack>

        {canManage ? (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              startIcon={<EditIcon />}
              onClick={() => setEditSeasonOpen(true)}
              sx={{ minHeight: 44 }}
            >
              Edit season
            </Button>
            <Button
              startIcon={isArchived ? <UnarchiveIcon /> : <ArchiveIcon />}
              onClick={handleArchiveToggle}
              disabled={isPending}
              sx={{ minHeight: 44 }}
            >
              {isArchived ? "Unarchive" : "Archive"}
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              disabled={teams.length < 2}
              onClick={() => {
                setEditingGame(null);
                setGameFormOpen(true);
              }}
              sx={{ minHeight: 44 }}
            >
              Add game
            </Button>
          </Stack>
        ) : null}
      </Stack>

      {archiveError ? <Alert severity="error">{archiveError}</Alert> : null}

      {isArchived ? (
        <Alert severity="info">
          This season is archived — hidden from default views. Its games, calendar entries, and
          history are unchanged.
        </Alert>
      ) : null}

      {canManage && teams.length < 2 ? (
        <Typography variant="body2" color="text.secondary">
          At least two teams are needed to schedule games.
        </Typography>
      ) : null}

      <Card>
        <CardContent>
          <GamesTable
            seasonId={season.id}
            games={games}
            canManage={canManage}
            sport={sport}
            onEditGame={(game) => {
              setEditingGame(game);
              setGameFormOpen(true);
            }}
          />
        </CardContent>
      </Card>

      {extraSections}

      <GameForm
        open={gameFormOpen}
        onClose={() => {
          setGameFormOpen(false);
          setEditingGame(null);
        }}
        seasonId={season.id}
        sport={sport}
        teams={teams}
        venues={venues}
        surfacesByVenue={surfacesByVenue}
        segmentsBySurface={segmentsBySurface}
        wholeLabelBySurface={wholeLabelBySurface}
        game={editingGame}
      />

      <Dialog
        open={editSeasonOpen}
        onClose={() => setEditSeasonOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Edit season</DialogTitle>
        <DialogContent>
          <SeasonForm
            initialValues={{
              seasonId: season.id,
              name: season.name,
              description: season.description,
              startDate: season.startDate,
              endDate: season.endDate,
              format: season.format,
            }}
            onSaved={() => setEditSeasonOpen(false)}
            onCancel={() => setEditSeasonOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
