"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import PublishIcon from "@mui/icons-material/Publish";
import type { IceUsage, SeasonGameStatus, Sport } from "@prisma/client";
import {
  cancelSeasonGame,
  deleteDraftGame,
  publishSeasonGames,
  recordSeasonGameScore,
} from "@/lib/actions/season-games";
import { getSportCapabilities } from "@/lib/utils/sport-catalog";
import { formatDateTimeInZone, isValidTimeZone } from "@/lib/utils/date";
import type { SeasonGameView } from "@/types/seasons";

const STATUS_CHIPS: Record<
  SeasonGameStatus,
  { label: string; color: "default" | "success" | "warning" | "error" }
> = {
  DRAFT: { label: "Draft", color: "warning" },
  SCHEDULED: { label: "Scheduled", color: "success" },
  COMPLETED: { label: "Completed", color: "default" },
  CANCELED: { label: "Canceled", color: "error" },
};

interface GamesTableProps {
  seasonId: string;
  games: SeasonGameView[];
  /** League admin or team admin for this season — gates all mutations. */
  canManage: boolean;
  /** Owning league/team sport — labels surface usage via the sport catalog. */
  sport: Sport;
  /** Opens the shared GameForm dialog in edit mode (wired by SeasonDetail). */
  onEditGame?: (game: SeasonGameView) => void;
}

type ConfirmTarget = { kind: "cancel" | "delete"; game: SeasonGameView };

const formatEndTime = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    ...(isValidTimeZone(timeZone) ? { timeZone } : {}),
  }).format(new Date(date));

/**
 * Chronological list of a season's games: table on desktop, cards on mobile.
 * Cancel keeps history (never deletes); only drafts can be hard-deleted; the
 * score dialog surfaces the server's age-gating message verbatim (FR-040).
 */
export function GamesTable({ seasonId, games, canManage, sport, onEditGame }: GamesTableProps) {
  const router = useRouter();
  const capabilities = getSportCapabilities(sport);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    severity: "success" | "error" | "warning";
    text: string;
  } | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  const [scoreTarget, setScoreTarget] = useState<SeasonGameView | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [homeScore, setHomeScore] = useState("");
  const [awayScore, setAwayScore] = useState("");

  const sorted = [...games].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
  );
  const draftCount = sorted.filter((game) => game.status === "DRAFT").length;

  const usageLabel = (usage: IceUsage | null) =>
    usage
      ? (capabilities.surfaceUsageOptions?.find((option) => option.value === usage)?.label ?? null)
      : null;

  const whereText = (game: SeasonGameView) =>
    [game.venue?.name ?? game.locationText, game.surface?.name, usageLabel(game.surfaceUsage), game.zoneLabel]
      .filter(Boolean)
      .join(" · ") || "TBD";

  const whenText = (game: SeasonGameView) =>
    `${formatDateTimeInZone(game.startAt, game.timezone)} – ${formatEndTime(game.endAt, game.timezone)}`;

  const scoreText = (game: SeasonGameView) =>
    game.homeScore != null && game.awayScore != null ? `${game.homeScore} – ${game.awayScore}` : null;

  const handlePublishAll = () => {
    startTransition(async () => {
      setMessage(null);
      const result = await publishSeasonGames({ seasonId });
      if (!result.success) {
        setMessage({ severity: "error", text: result.error });
        return;
      }
      const { published, failed } = result.data;
      setMessage(
        failed > 0
          ? {
              severity: "warning",
              text: `Published ${published} game${published === 1 ? "" : "s"}; ${failed} failed — try again.`,
            }
          : {
              severity: "success",
              text: `Published ${published} game${published === 1 ? "" : "s"} to team calendars.`,
            }
      );
      router.refresh();
    });
  };

  const handleConfirm = () => {
    if (!confirmTarget) return;
    const { kind, game } = confirmTarget;
    startTransition(async () => {
      setMessage(null);
      const result =
        kind === "cancel"
          ? await cancelSeasonGame({ gameId: game.id })
          : await deleteDraftGame({ gameId: game.id });
      setConfirmTarget(null);
      if (!result.success) {
        setMessage({ severity: "error", text: result.error });
        return;
      }
      router.refresh();
    });
  };

  const openScoreDialog = (game: SeasonGameView) => {
    setScoreTarget(game);
    setScoreError(null);
    setHomeScore(game.homeScore != null ? String(game.homeScore) : "");
    setAwayScore(game.awayScore != null ? String(game.awayScore) : "");
  };

  const handleRecordScore = () => {
    if (!scoreTarget) return;
    startTransition(async () => {
      setScoreError(null);
      const result = await recordSeasonGameScore({
        gameId: scoreTarget.id,
        homeScore: Number(homeScore),
        awayScore: Number(awayScore),
      });
      if (!result.success) {
        // Age-gating (and any other) server message shown verbatim.
        setScoreError(result.error);
        return;
      }
      setScoreTarget(null);
      router.refresh();
    });
  };

  const rowActions = (game: SeasonGameView, buttonSx?: object) => {
    if (!canManage) return null;
    return (
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {game.status !== "CANCELED" ? (
          <Button size="small" sx={buttonSx} disabled={isPending} onClick={() => onEditGame?.(game)}>
            Edit
          </Button>
        ) : null}
        {game.status === "SCHEDULED" ? (
          <Button size="small" sx={buttonSx} disabled={isPending} onClick={() => openScoreDialog(game)}>
            Record score
          </Button>
        ) : null}
        {game.status === "SCHEDULED" ? (
          <Button
            size="small"
            color="error"
            sx={buttonSx}
            disabled={isPending}
            onClick={() => setConfirmTarget({ kind: "cancel", game })}
          >
            Cancel game
          </Button>
        ) : null}
        {game.status === "DRAFT" ? (
          <Button
            size="small"
            color="error"
            sx={buttonSx}
            disabled={isPending}
            onClick={() => setConfirmTarget({ kind: "delete", game })}
          >
            Delete draft
          </Button>
        ) : null}
      </Stack>
    );
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h6">Games</Typography>
        {canManage && draftCount > 0 ? (
          <Button
            startIcon={<PublishIcon />}
            variant="outlined"
            disabled={isPending}
            onClick={handlePublishAll}
            sx={{ minHeight: 44 }}
          >
            Publish {draftCount} draft{draftCount === 1 ? "" : "s"}
          </Button>
        ) : null}
      </Stack>

      {message ? <Alert severity={message.severity}>{message.text}</Alert> : null}

      {sorted.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No games scheduled yet.
        </Typography>
      ) : (
        <>
          {/* Mobile: cards */}
          <Stack spacing={2} sx={{ display: { xs: "flex", sm: "none" } }}>
            {sorted.map((game) => (
              <Card key={game.id} variant="outlined">
                <CardContent>
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Chip
                        size="small"
                        label={STATUS_CHIPS[game.status].label}
                        color={STATUS_CHIPS[game.status].color}
                      />
                      {scoreText(game) ? (
                        <Chip size="small" variant="outlined" label={scoreText(game)} />
                      ) : null}
                    </Stack>
                    <Typography variant="subtitle1">
                      {game.homeTeam.name} vs {game.awayTeam.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {whenText(game)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {whereText(game)}
                    </Typography>
                    {rowActions(game, { minHeight: 44 })}
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>

          {/* Desktop: table */}
          <Box sx={{ display: { xs: "none", sm: "block" } }}>
            <TableContainer component={Card} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>When</TableCell>
                    <TableCell>Matchup</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Location</TableCell>
                    <TableCell>Score</TableCell>
                    {canManage ? <TableCell align="right">Actions</TableCell> : null}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sorted.map((game) => (
                    <TableRow key={game.id} hover>
                      <TableCell>{whenText(game)}</TableCell>
                      <TableCell>
                        {game.homeTeam.name} vs {game.awayTeam.name}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={STATUS_CHIPS[game.status].label}
                          color={STATUS_CHIPS[game.status].color}
                        />
                      </TableCell>
                      <TableCell>{whereText(game)}</TableCell>
                      <TableCell>{scoreText(game) ?? "—"}</TableCell>
                      {canManage ? (
                        <TableCell align="right">{rowActions(game)}</TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </>
      )}

      {/* Cancel / delete confirmation */}
      <Dialog
        open={Boolean(confirmTarget)}
        onClose={() => (isPending ? undefined : setConfirmTarget(null))}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          {confirmTarget?.kind === "cancel" ? "Cancel this game?" : "Delete this draft game?"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirmTarget
              ? `${confirmTarget.game.homeTeam.name} vs ${confirmTarget.game.awayTeam.name} — ${whenText(confirmTarget.game)}. `
              : ""}
            {confirmTarget?.kind === "cancel"
              ? "The game is marked canceled on both team calendars (history is kept) and members are notified."
              : "Draft games have no calendar presence and are removed permanently."}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmTarget(null)} disabled={isPending} sx={{ minHeight: 44 }}>
            Keep game
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleConfirm}
            disabled={isPending}
            sx={{ minHeight: 44 }}
          >
            {isPending
              ? "Working…"
              : confirmTarget?.kind === "cancel"
                ? "Cancel game"
                : "Delete draft"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Record score */}
      <Dialog
        open={Boolean(scoreTarget)}
        onClose={() => (isPending ? undefined : setScoreTarget(null))}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          Record score — {scoreTarget?.homeTeam.name} vs {scoreTarget?.awayTeam.name}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {scoreError ? <Alert severity="error">{scoreError}</Alert> : null}
            <Stack direction="row" spacing={2}>
              <TextField
                label={scoreTarget?.homeTeam.name ?? "Home"}
                type="number"
                fullWidth
                value={homeScore}
                onChange={(event) => setHomeScore(event.target.value)}
                slotProps={{ htmlInput: { min: 0, max: 99 } }}
              />
              <TextField
                label={scoreTarget?.awayTeam.name ?? "Away"}
                type="number"
                fullWidth
                value={awayScore}
                onChange={(event) => setAwayScore(event.target.value)}
                slotProps={{ htmlInput: { min: 0, max: 99 } }}
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setScoreTarget(null)} disabled={isPending} sx={{ minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleRecordScore}
            disabled={isPending || homeScore.trim() === "" || awayScore.trim() === ""}
            sx={{ minHeight: 44 }}
          >
            {isPending ? "Saving…" : "Save score"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
