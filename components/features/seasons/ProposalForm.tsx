"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
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
import { createGameProposal } from "@/lib/actions/game-proposals";
import {
  isValidTimeZone,
  parseDateTimeLocalToUtc,
  resolveTimeZone,
} from "@/lib/utils/date";

export interface ProposalFormTeam {
  id: string;
  name: string;
  leagueId: string;
}

interface ProposalFormProps {
  open: boolean;
  onClose: () => void;
  /** Teams the viewer administers (league teams only) — the proposing side. */
  myTeams: ProposalFormTeam[];
  /** Active teams per league — opponents come from the proposing team's league. */
  leagueTeams: Record<string, Array<{ id: string; name: string }>>;
  venues: Array<{ id: string; name: string; timezone: string }>;
}

/**
 * Propose a game to another team in the same league (FR-019). Venue is
 * optional — "To be determined" is the default. Times are wall-clock values
 * parsed against the venue's timezone once one is picked (matching GameForm).
 *
 * Stateless Dialog wrapper: the body owns all form state and unmounts on
 * close, so every open starts fresh — no reset effects needed.
 */
export function ProposalForm({ open, onClose, ...bodyProps }: ProposalFormProps) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <ProposalFormBody onClose={onClose} {...bodyProps} />
    </Dialog>
  );
}

function ProposalFormBody({
  onClose,
  myTeams,
  leagueTeams,
  venues,
}: Omit<ProposalFormProps, "open">) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [proposingTeamId, setProposingTeamId] = useState(
    myTeams.length === 1 ? myTeams[0].id : ""
  );
  const [receivingTeamId, setReceivingTeamId] = useState("");
  const [venueId, setVenueId] = useState("");
  // Zone the wall-clock inputs are interpreted in: the proposer's local zone,
  // following the venue once one is actively picked (matching GameForm).
  const [effectiveTimeZone, setEffectiveTimeZone] = useState(() => resolveTimeZone());

  const proposingLeagueId = myTeams.find((team) => team.id === proposingTeamId)?.leagueId;
  const opponents = proposingLeagueId
    ? (leagueTeams[proposingLeagueId] ?? []).filter((team) => team.id !== proposingTeamId)
    : [];

  const handleProposingTeamChange = (nextTeamId: string) => {
    setProposingTeamId(nextTeamId);
    // Opponents belong to the proposing team's league — a stale pick would be
    // rejected server-side, so clear it when the proposing side changes.
    setReceivingTeamId("");
  };

  const handleVenueChange = (nextVenueId: string) => {
    setVenueId(nextVenueId);
    const nextVenueTimeZone = venues.find((venue) => venue.id === nextVenueId)?.timezone;
    setEffectiveTimeZone(
      isValidTimeZone(nextVenueTimeZone) ? nextVenueTimeZone : resolveTimeZone()
    );
  };

  const handleSubmit = (formData: FormData) => {
    const text = (name: string) => String(formData.get(name) ?? "").trim();
    if (!proposingTeamId || !receivingTeamId) {
      setError("Choose your team and an opponent.");
      return;
    }
    const startAt = parseDateTimeLocalToUtc(text("startAt"), effectiveTimeZone);
    const endAt = parseDateTimeLocalToUtc(text("endAt"), effectiveTimeZone);
    if (!startAt || !endAt) {
      setError("Enter a valid proposed start and end time.");
      return;
    }
    if (endAt <= startAt) {
      setError("End time must be after the start time.");
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await createGameProposal({
        proposingTeamId,
        receivingTeamId,
        startAt,
        endAt,
        venueId: venueId || undefined,
        note: text("note") || undefined,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  };

  const selectedVenueTimeZone = venues.find((venue) => venue.id === venueId)?.timezone;

  return (
    <>
      <DialogTitle>Propose a game</DialogTitle>
      <Stack component="form" action={(formData: FormData) => handleSubmit(formData)}>
        <DialogContent>
          <Stack spacing={2}>
            {error ? <Alert severity="error">{error}</Alert> : null}

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                select
                label="Your team"
                required
                fullWidth
                value={proposingTeamId}
                onChange={(event) => handleProposingTeamChange(event.target.value)}
              >
                {myTeams.map((team) => (
                  <MenuItem key={team.id} value={team.id}>
                    {team.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Opponent"
                required
                fullWidth
                value={receivingTeamId}
                onChange={(event) => setReceivingTeamId(event.target.value)}
                disabled={!proposingTeamId}
                helperText={
                  proposingTeamId && opponents.length === 0
                    ? "No other teams in this league yet."
                    : undefined
                }
              >
                {opponents.map((team) => (
                  <MenuItem key={team.id} value={team.id}>
                    {team.name}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                name="startAt"
                label="Proposed start"
                type="datetime-local"
                required
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                name="endAt"
                label="Proposed end"
                type="datetime-local"
                required
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Times are entered in {effectiveTimeZone}
              {effectiveTimeZone === selectedVenueTimeZone ? " (the venue's timezone)" : ""}.
            </Typography>

            <TextField
              select
              label="Venue (optional)"
              fullWidth
              value={venueId}
              onChange={(event) => handleVenueChange(event.target.value)}
            >
              <MenuItem value="">To be determined</MenuItem>
              {venues.map((venue) => (
                <MenuItem key={venue.id} value={venue.id}>
                  {venue.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              name="note"
              label="Note (optional)"
              multiline
              minRows={2}
              placeholder="Looking for a pre-season scrimmage — flexible on the time."
              slotProps={{ htmlInput: { maxLength: 1000 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={isPending} sx={{ minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isPending || !proposingTeamId || !receivingTeamId}
            sx={{ minHeight: 44 }}
          >
            {isPending ? "Sending…" : "Send proposal"}
          </Button>
        </DialogActions>
      </Stack>
    </>
  );
}
