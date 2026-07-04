"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  AlertTitle,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CloseIcon from "@mui/icons-material/Close";
import { deleteEventGame, setGameRotation, upsertEventGame } from "@/lib/actions/event-teams";
import { GameResultForm } from "./GameResultForm";
import { formatDateTime, parseDateTimeLocalToUtc, resolveTimeZone } from "@/lib/utils/date";
import type { BookingConflict } from "@/types/segments";

type GameParticipant = {
  registrationId: string;
  eventTeamId: string;
  registration: { participantName: string; isFloater: boolean };
};

type Game = {
  id: string;
  name: string | null;
  startAt: Date;
  endAt: Date;
  homeScore: number | null;
  awayScore: number | null;
  surface: { id: string; name: string } | null;
  /** null = whole surface (or no surface selected). */
  segment: { id: string; name: string } | null;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  participants: GameParticipant[];
};

interface GameSchedulerProps {
  eventId: string;
  teams: Array<{ id: string; name: string }>;
  games: Game[];
  surfaces: Array<{ id: string; name: string }>;
  /** Active segments per surface (006) — the select renders only when the chosen surface has some. */
  segmentsBySurface?: Record<string, Array<{ id: string; name: string }>>;
  /** Display name of the implicit whole-surface option per surface ("Full ice"). */
  wholeLabelBySurface?: Record<string, string>;
  /** Confirmed participants selectable for rotations. */
  participants: Array<{ id: string; participantName: string; isFloater: boolean }>;
  /** Scores/stats allowed for this event's age classification (Squirt+). */
  statsEligible?: boolean;
  /** IANA zone the event's wall-clock times are entered/displayed in. */
  timeZone?: string;
}

/** Wall-clock-parsed game values, kept so "Schedule anyway" resubmits them. */
type GamePayload = {
  name?: string;
  homeTeamId: string;
  awayTeamId: string;
  startAt: Date;
  endAt: Date;
  surfaceId?: string;
  segmentId?: string;
};

function extractConflicts(details: unknown): BookingConflict[] | null {
  if (details && typeof details === "object" && "conflicts" in details) {
    const conflicts = (details as { conflicts: unknown }).conflicts;
    if (Array.isArray(conflicts) && conflicts.length > 0) {
      return conflicts as BookingConflict[];
    }
  }
  return null;
}

export function GameScheduler({
  eventId,
  teams,
  games,
  surfaces,
  segmentsBySurface = {},
  wholeLabelBySurface = {},
  participants,
  statsEligible = false,
  timeZone,
}: GameSchedulerProps) {
  const router = useRouter();
  const tz = resolveTimeZone(timeZone);
  const [message, setMessage] = useState<{ severity: "success" | "error" | "warning"; text: string } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [surfaceId, setSurfaceId] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [conflicts, setConflicts] = useState<BookingConflict[] | null>(null);
  const [pendingPayload, setPendingPayload] = useState<GamePayload | null>(null);
  const [rotationTarget, setRotationTarget] = useState<Game | null>(null);
  const [rotationDraft, setRotationDraft] = useState<Array<{ registrationId: string; eventTeamId: string }>>([]);
  const [addParticipantId, setAddParticipantId] = useState("");
  const [addSideId, setAddSideId] = useState("");
  const [isPending, startTransition] = useTransition();

  const surfaceSegments = surfaceId ? (segmentsBySurface[surfaceId] ?? []) : [];
  const wholeSurfaceLabel = (surfaceId && wholeLabelBySurface[surfaceId]) || "Whole surface";

  const openRotation = (game: Game) => {
    setRotationTarget(game);
    setRotationDraft(
      game.participants.map((participant) => ({
        registrationId: participant.registrationId,
        eventTeamId: participant.eventTeamId,
      }))
    );
    setAddParticipantId("");
    setAddSideId(game.homeTeam.id);
  };

  const submitGame = (payload: GamePayload, overrideConflicts: boolean) => {
    startTransition(async () => {
      setMessage(null);
      const result = await upsertEventGame({ eventId, ...payload, overrideConflicts });
      if (!result.success) {
        const detected = extractConflicts(result.details);
        if (detected) {
          // FR-011: warn before saving; keep the payload so "Schedule anyway"
          // resubmits the exact same game with an explicit recorded override.
          setConflicts(detected);
          setPendingPayload(payload);
          return;
        }
        setConflicts(null);
        setPendingPayload(null);
        setMessage({ severity: "error", text: result.error });
        return;
      }
      setConflicts(null);
      setPendingPayload(null);
      setDialogOpen(false);
      if (result.data.warnings.length > 0) {
        setMessage({ severity: "warning", text: result.data.warnings.join(" ") });
      }
      router.refresh();
    });
  };

  const handleCreate = (formData: FormData) => {
    const text = (name: string) => String(formData.get(name) ?? "").trim();
    const startAt = parseDateTimeLocalToUtc(text("startAt"), tz);
    const endAt = parseDateTimeLocalToUtc(text("endAt"), tz);
    if (!startAt || !endAt) {
      setMessage({ severity: "error", text: "Enter a valid start and end time." });
      return;
    }
    submitGame(
      {
        name: text("name") || undefined,
        homeTeamId: text("homeTeamId"),
        awayTeamId: text("awayTeamId"),
        startAt,
        endAt,
        surfaceId: surfaceId || undefined,
        segmentId: segmentId || undefined,
      },
      false
    );
  };

  const saveRotation = () => {
    if (!rotationTarget) return;
    startTransition(async () => {
      setMessage(null);
      const result = await setGameRotation({ gameId: rotationTarget.id, entries: rotationDraft });
      if (!result.success) {
        setMessage({ severity: "error", text: result.error });
        return;
      }
      setRotationTarget(null);
      if (result.data.warnings.length > 0) {
        setMessage({ severity: "warning", text: result.data.warnings.join(" ") });
      }
      router.refresh();
    });
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h6">Games</Typography>
        <Button
          startIcon={<AddIcon />}
          disabled={teams.length < 2}
          onClick={() => {
            setSurfaceId("");
            setSegmentId("");
            setConflicts(null);
            setPendingPayload(null);
            setDialogOpen(true);
          }}
        >
          Schedule game
        </Button>
      </Stack>
      {teams.length < 2 ? (
        <Typography variant="body2" color="text.secondary">
          Create at least two teams to schedule games.
        </Typography>
      ) : null}
      {message ? <Alert severity={message.severity}>{message.text}</Alert> : null}

      {games.map((game) => (
        <Card key={game.id} variant="outlined">
          <CardContent>
            <Stack spacing={1}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                justifyContent="space-between"
                alignItems={{ sm: "center" }}
              >
                <Stack spacing={0.25}>
                  <Typography variant="subtitle1">
                    {game.homeTeam.name} vs {game.awayTeam.name}
                    {game.name ? ` — ${game.name}` : ""}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatDateTime(game.startAt, tz)} – {formatDateTime(game.endAt, tz)}
                    {game.surface ? ` · ${game.surface.name}` : ""}
                    {game.segment ? ` · ${game.segment.name}` : ""}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={1}>
                  {statsEligible ? (
                    <GameResultForm
                      gameId={game.id}
                      homeTeamName={game.homeTeam.name}
                      awayTeamName={game.awayTeam.name}
                      homeScore={game.homeScore}
                      awayScore={game.awayScore}
                    />
                  ) : null}
                  <Button size="small" onClick={() => openRotation(game)}>
                    Rotation ({game.participants.length})
                  </Button>
                  <Tooltip title="Delete game">
                    <IconButton
                      size="small"
                      disabled={isPending}
                      aria-label={`Delete ${game.homeTeam.name} vs ${game.awayTeam.name}`}
                      onClick={() => {
                        if (!window.confirm("Delete this game?")) return;
                        startTransition(async () => {
                          setMessage(null);
                          const result = await deleteEventGame({ gameId: game.id });
                          if (!result.success) {
                            setMessage({ severity: "error", text: result.error });
                            return;
                          }
                          router.refresh();
                        });
                      }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>
              {game.participants.length > 0 ? (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {game.participants.map((participant) => (
                    <Chip
                      key={participant.registrationId}
                      size="small"
                      variant="outlined"
                      label={`${participant.registration.participantName}${participant.registration.isFloater ? " ↻" : ""} → ${
                        participant.eventTeamId === game.homeTeam.id ? game.homeTeam.name : game.awayTeam.name
                      }`}
                    />
                  ))}
                </Stack>
              ) : null}
            </Stack>
          </CardContent>
        </Card>
      ))}

      {/* Create game dialog */}
      <Dialog open={dialogOpen} onClose={() => (isPending ? undefined : setDialogOpen(false))} fullWidth maxWidth="sm">
        <DialogTitle>Schedule a game</DialogTitle>
        <Stack
          component="form"
          action={(formData: FormData) => handleCreate(formData)}
        >
          <DialogContent>
            <Stack spacing={2}>
              {conflicts ? (
                <Alert
                  severity="warning"
                  action={
                    <Button
                      color="inherit"
                      size="small"
                      disabled={isPending || !pendingPayload}
                      onClick={() => pendingPayload && submitGame(pendingPayload, true)}
                    >
                      Schedule anyway
                    </Button>
                  }
                >
                  <AlertTitle>
                    This time overlaps {conflicts.length} existing booking
                    {conflicts.length === 1 ? "" : "s"} at the venue
                  </AlertTitle>
                  {conflicts.map((conflict, index) => (
                    <Typography key={`${conflict.title}-${index}`} variant="body2">
                      {conflict.title} — {formatDateTime(conflict.startAt, tz)}
                      {conflict.endAt ? ` – ${formatDateTime(conflict.endAt, tz)}` : ""}
                    </Typography>
                  ))}
                </Alert>
              ) : null}
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField select name="homeTeamId" label="Home team" required fullWidth defaultValue="">
                  {teams.map((team) => (
                    <MenuItem key={team.id} value={team.id}>
                      {team.name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField select name="awayTeamId" label="Away team" required fullWidth defaultValue="">
                  {teams.map((team) => (
                    <MenuItem key={team.id} value={team.id}>
                      {team.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  name="startAt"
                  label="Starts"
                  type="datetime-local"
                  required
                  fullWidth
                  defaultValue=""
                  helperText={`Times are in ${tz}`}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  name="endAt"
                  label="Ends"
                  type="datetime-local"
                  required
                  fullWidth
                  defaultValue=""
                  helperText={`Times are in ${tz}`}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  select
                  label="Surface (optional)"
                  fullWidth
                  value={surfaceId}
                  onChange={(event) => {
                    setSurfaceId(event.target.value);
                    // Segments belong to a surface — reset on change.
                    setSegmentId("");
                  }}
                >
                  <MenuItem value="">No surface</MenuItem>
                  {surfaces.map((surface) => (
                    <MenuItem key={surface.id} value={surface.id}>
                      {surface.name}
                    </MenuItem>
                  ))}
                </TextField>
                {surfaceSegments.length > 0 ? (
                  <TextField
                    select
                    label="Segment (optional)"
                    fullWidth
                    value={segmentId}
                    onChange={(event) => setSegmentId(event.target.value)}
                  >
                    <MenuItem value="">{wholeSurfaceLabel}</MenuItem>
                    {surfaceSegments.map((segment) => (
                      <MenuItem key={segment.id} value={segment.id}>
                        {segment.name}
                      </MenuItem>
                    ))}
                  </TextField>
                ) : null}
              </Stack>
              <TextField name="name" label="Game label (optional)" placeholder="Game 1" slotProps={{ htmlInput: { maxLength: 100 } }} />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={isPending}>
              {isPending ? "Saving…" : "Schedule"}
            </Button>
          </DialogActions>
        </Stack>
      </Dialog>

      {/* Rotation dialog */}
      <Dialog
        open={Boolean(rotationTarget)}
        onClose={() => (isPending ? undefined : setRotationTarget(null))}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          Rotation — {rotationTarget?.homeTeam.name} vs {rotationTarget?.awayTeam.name}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Add floaters (↻) or extra skaters to this game and pick which side they play for.
              Non-floaters in overlapping games trigger a warning.
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {rotationDraft.map((entry) => {
                const participant = participants.find((candidate) => candidate.id === entry.registrationId);
                const side =
                  entry.eventTeamId === rotationTarget?.homeTeam.id
                    ? rotationTarget?.homeTeam.name
                    : rotationTarget?.awayTeam.name;
                return (
                  <Chip
                    key={entry.registrationId}
                    size="small"
                    label={`${participant?.participantName ?? entry.registrationId} → ${side}`}
                    onDelete={() =>
                      setRotationDraft((current) =>
                        current.filter((candidate) => candidate.registrationId !== entry.registrationId)
                      )
                    }
                    deleteIcon={<CloseIcon />}
                  />
                );
              })}
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <TextField
                select
                label="Participant"
                fullWidth
                value={addParticipantId}
                onChange={(event) => setAddParticipantId(event.target.value)}
              >
                {participants
                  .filter((participant) => !rotationDraft.some((entry) => entry.registrationId === participant.id))
                  .map((participant) => (
                    <MenuItem key={participant.id} value={participant.id}>
                      {participant.participantName}
                      {participant.isFloater ? " ↻" : ""}
                    </MenuItem>
                  ))}
              </TextField>
              <TextField
                select
                label="Plays for"
                sx={{ minWidth: 160 }}
                value={addSideId}
                onChange={(event) => setAddSideId(event.target.value)}
              >
                {rotationTarget
                  ? [rotationTarget.homeTeam, rotationTarget.awayTeam].map((team) => (
                      <MenuItem key={team.id} value={team.id}>
                        {team.name}
                      </MenuItem>
                    ))
                  : null}
              </TextField>
              <Button
                startIcon={<AddIcon />}
                disabled={!addParticipantId || !addSideId}
                onClick={() => {
                  setRotationDraft((current) => [
                    ...current,
                    { registrationId: addParticipantId, eventTeamId: addSideId },
                  ]);
                  setAddParticipantId("");
                }}
              >
                Add
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRotationTarget(null)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="contained" onClick={saveRotation} disabled={isPending}>
            {isPending ? "Saving…" : "Save rotation"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
