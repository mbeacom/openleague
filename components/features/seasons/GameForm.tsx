"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  AlertTitle,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { Sport } from "@prisma/client";
import { DateTimeField } from "@/components/ui/date";
import { createSeasonGame, updateSeasonGame } from "@/lib/actions/season-games";
import { getSportCapabilities } from "@/lib/utils/sport-catalog";
import {
  formatDateTimeInZone,
  formatDateTimeLocalInput,
  isValidTimeZone,
  parseDateTimeLocalToUtc,
  resolveTimeZone,
} from "@/lib/utils/date";
import type { GameConflictView, SeasonGameView } from "@/types/seasons";

interface GameFormProps {
  open: boolean;
  onClose: () => void;
  seasonId: string;
  /** Owning league/team sport — drives surface terminology. */
  sport: Sport;
  teams: Array<{ id: string; name: string }>;
  venues: Array<{ id: string; name: string; timezone: string }>;
  /** Active surfaces per venue (already filtered server-side — FR-014). */
  surfacesByVenue: Record<string, Array<{ id: string; name: string }>>;
  /** Active segments per surface (006) — the select renders only when the chosen surface has some. */
  segmentsBySurface?: Record<string, Array<{ id: string; name: string }>>;
  /** Display name of the implicit whole-surface option per surface ("Full ice"). */
  wholeLabelBySurface?: Record<string, string>;
  /** Present in edit mode; teams are fixed after creation. */
  game?: SeasonGameView | null;
}

/** Wall-clock form values, parsed against the effective timezone on submit. */
type GamePayload = {
  homeTeamId: string;
  awayTeamId: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  venueId: string;
  surfaceId: string;
  segmentId: string;
  locationText: string;
  notes: string;
};

function extractConflicts(details: unknown): GameConflictView[] | null {
  if (details && typeof details === "object" && "conflicts" in details) {
    const conflicts = (details as { conflicts: unknown }).conflicts;
    if (Array.isArray(conflicts) && conflicts.length > 0) {
      return conflicts as GameConflictView[];
    }
  }
  return null;
}

/**
 * Schedule/edit a single season game. No format input anywhere on this path
 * (FR-003/FR-008). Venue conflicts come back as a warning with an explicit
 * "Schedule anyway" override that the server records (FR-012/013).
 *
 * Stateless Dialog wrapper: the body (which owns all form state) is mounted
 * as Dialog children, so it unmounts on close and every open starts fresh
 * for the current target game — no reset effects needed.
 */
export function GameForm({ open, onClose, ...bodyProps }: GameFormProps) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <GameFormBody key={bodyProps.game?.id ?? "new"} onClose={onClose} {...bodyProps} />
    </Dialog>
  );
}

function GameFormBody({
  onClose,
  seasonId,
  sport,
  teams,
  venues,
  surfacesByVenue,
  segmentsBySurface = {},
  wholeLabelBySurface = {},
  game,
}: Omit<GameFormProps, "open">) {
  const router = useRouter();
  const isEdit = Boolean(game);
  const capabilities = getSportCapabilities(sport);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<GameConflictView[] | null>(null);
  const [pendingPayload, setPendingPayload] = useState<GamePayload | null>(null);
  const [venueId, setVenueId] = useState(game?.venue?.id ?? "");
  const [surfaceId, setSurfaceId] = useState(game?.surface?.id ?? "");
  const [segmentId, setSegmentId] = useState(game?.segment?.id ?? "");
  // Zone the wall-clock inputs are interpreted in: the game's stored zone
  // (edit) or the scheduler's local zone (create); follows the venue once one
  // is actively picked. datetime-local values stay as wall-clock text and are
  // parsed against this zone only on submit (matching EventForm).
  const initialTimeZone = resolveTimeZone(game?.timezone);
  const [effectiveTimeZone, setEffectiveTimeZone] = useState(initialTimeZone);

  const handleVenueChange = (nextVenueId: string) => {
    setVenueId(nextVenueId);
    // Surfaces belong to a venue — a stale selection would be rejected server-side.
    setSurfaceId("");
    setSegmentId("");
    const nextVenueTimeZone = venues.find((venue) => venue.id === nextVenueId)?.timezone;
    setEffectiveTimeZone(
      isValidTimeZone(nextVenueTimeZone) ? nextVenueTimeZone : resolveTimeZone(game?.timezone)
    );
  };

  const handleSurfaceChange = (nextSurfaceId: string) => {
    setSurfaceId(nextSurfaceId);
    // Segments belong to a surface — a stale selection would be rejected server-side.
    setSegmentId("");
  };

  const venueSurfaces = venueId ? (surfacesByVenue[venueId] ?? []) : [];
  const surfaceSegments = surfaceId ? (segmentsBySurface[surfaceId] ?? []) : [];
  const wholeSurfaceLabel = (surfaceId && wholeLabelBySurface[surfaceId]) || "Whole surface";
  const surfaceLabel = capabilities.surfaceLabel;

  const submitPayload = (payload: GamePayload, overrideConflicts: boolean) => {
    startTransition(async () => {
      setError(null);
      const result = isEdit && game
        ? await updateSeasonGame({
            gameId: game.id,
            startAt: payload.startAt,
            endAt: payload.endAt,
            timezone: payload.timezone,
            venueId: payload.venueId || null,
            surfaceId: payload.surfaceId || null,
            segmentId: payload.segmentId || null,
            locationText: payload.locationText,
            notes: payload.notes,
            overrideConflicts,
          })
        : await createSeasonGame({
            seasonId,
            homeTeamId: payload.homeTeamId,
            awayTeamId: payload.awayTeamId,
            startAt: payload.startAt,
            endAt: payload.endAt,
            timezone: payload.timezone,
            venueId: payload.venueId || undefined,
            surfaceId: payload.surfaceId || undefined,
            segmentId: payload.segmentId || undefined,
            locationText: payload.locationText,
            notes: payload.notes,
            publish: true,
            overrideConflicts,
          });

      if (!result.success) {
        const detected = extractConflicts(result.details);
        if (detected) {
          // FR-012: warn before saving; keep the payload so "Schedule anyway"
          // resubmits the exact same game with an explicit override (FR-013).
          setConflicts(detected);
          setPendingPayload(payload);
          return;
        }
        setConflicts(null);
        setPendingPayload(null);
        setError(result.error);
        return;
      }

      setConflicts(null);
      setPendingPayload(null);
      onClose();
      router.refresh();
    });
  };

  const handleSubmit = (formData: FormData) => {
    const text = (name: string) => String(formData.get(name) ?? "").trim();
    const homeTeamId = isEdit && game ? game.homeTeam.id : text("homeTeamId");
    const awayTeamId = isEdit && game ? game.awayTeam.id : text("awayTeamId");
    if (!isEdit && homeTeamId === awayTeamId) {
      setError("Home and away teams must be different.");
      return;
    }
    const startAt = parseDateTimeLocalToUtc(text("startAt"), effectiveTimeZone);
    const endAt = parseDateTimeLocalToUtc(text("endAt"), effectiveTimeZone);
    if (!startAt || !endAt) {
      setError("Enter a valid start and end time.");
      return;
    }
    if (endAt <= startAt) {
      setError("End time must be after the start time.");
      return;
    }
    submitPayload(
      {
        homeTeamId,
        awayTeamId,
        startAt,
        endAt,
        timezone: effectiveTimeZone,
        venueId,
        surfaceId,
        segmentId,
        locationText: text("locationText"),
        notes: text("notes"),
      },
      false
    );
  };

  const selectedVenueTimeZone = venues.find((venue) => venue.id === venueId)?.timezone;

  return (
    <>
      <DialogTitle>{isEdit ? "Edit game" : "Schedule a game"}</DialogTitle>
      <Stack component="form" action={(formData: FormData) => handleSubmit(formData)}>
        <DialogContent>
          <Stack spacing={2}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            {conflicts ? (
              <Alert
                severity="warning"
                action={
                  <Button
                    color="inherit"
                    size="small"
                    disabled={isPending || !pendingPayload}
                    onClick={() => pendingPayload && submitPayload(pendingPayload, true)}
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
                    {conflict.title} — {formatDateTimeInZone(conflict.startAt, effectiveTimeZone)}
                    {conflict.endAt
                      ? ` – ${formatDateTimeInZone(conflict.endAt, effectiveTimeZone)}`
                      : ""}
                  </Typography>
                ))}
              </Alert>
            ) : null}

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              {isEdit && game ? (
                <>
                  <TextField label="Home team" value={game.homeTeam.name} fullWidth disabled />
                  <TextField label="Away team" value={game.awayTeam.name} fullWidth disabled />
                </>
              ) : (
                <>
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
                </>
              )}
            </Stack>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <DateTimeField
                name="startAt"
                label="Starts"
                required
                fullWidth
                defaultValue={
                  game ? formatDateTimeLocalInput(game.startAt, initialTimeZone) : ""
                }
              />
              <DateTimeField
                name="endAt"
                label="Ends"
                required
                fullWidth
                defaultValue={game ? formatDateTimeLocalInput(game.endAt, initialTimeZone) : ""}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Times are entered in {effectiveTimeZone}
              {effectiveTimeZone === selectedVenueTimeZone ? " (the venue's timezone)" : ""}.
            </Typography>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                select
                label="Venue (optional)"
                fullWidth
                value={venueId}
                onChange={(event) => handleVenueChange(event.target.value)}
              >
                <MenuItem value="">No venue / enter location below</MenuItem>
                {venues.map((venue) => (
                  <MenuItem key={venue.id} value={venue.id}>
                    {venue.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                name="locationText"
                label="Location (optional)"
                fullWidth
                defaultValue={game?.locationText ?? ""}
                placeholder="Community park, field 3"
                slotProps={{ htmlInput: { maxLength: 255 } }}
              />
            </Stack>

            {venueSurfaces.length > 0 ? (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  select
                  label={`${surfaceLabel} (optional)`}
                  fullWidth
                  value={surfaceId}
                  onChange={(event) => handleSurfaceChange(event.target.value)}
                >
                  <MenuItem value="">Any {surfaceLabel.toLowerCase()}</MenuItem>
                  {venueSurfaces.map((surface) => (
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
            ) : null}

            <TextField
              name="notes"
              label="Notes (optional)"
              multiline
              minRows={2}
              defaultValue={game?.notes ?? ""}
              slotProps={{ htmlInput: { maxLength: 1000 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={isPending} sx={{ minHeight: 44 }}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={isPending} sx={{ minHeight: 44 }}>
            {isPending ? "Saving…" : isEdit ? "Save changes" : "Schedule game"}
          </Button>
        </DialogActions>
      </Stack>
    </>
  );
}
