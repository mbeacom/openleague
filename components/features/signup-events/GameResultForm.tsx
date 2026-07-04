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
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ScoreboardIcon from "@mui/icons-material/Scoreboard";
import { recordGameResult } from "@/lib/actions/event-teams";

interface GameResultFormProps {
  gameId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
}

/** Score entry for age-eligible events (Squirt+ by default) — never mounted for mite-level events. */
export function GameResultForm({ gameId, homeTeamName, awayTeamName, homeScore, awayScore }: GameResultFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [home, setHome] = useState(homeScore != null ? String(homeScore) : "");
  const [away, setAway] = useState(awayScore != null ? String(awayScore) : "");
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    startTransition(async () => {
      setError(null);
      const result = await recordGameResult({
        gameId,
        homeScore: Number(home),
        awayScore: Number(away),
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <Button size="small" startIcon={<ScoreboardIcon />} onClick={() => setOpen(true)}>
        {homeScore != null && awayScore != null ? `${homeScore}–${awayScore}` : "Record result"}
      </Button>

      <Dialog open={open} onClose={() => (isPending ? undefined : setOpen(false))} fullWidth maxWidth="xs">
        <DialogTitle>Record result</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <Stack direction="row" spacing={2} alignItems="center">
              <Stack flex={1} spacing={0.5}>
                <Typography variant="body2">{homeTeamName}</Typography>
                <TextField
                  type="number"
                  value={home}
                  onChange={(event) => setHome(event.target.value)}
                  slotProps={{ htmlInput: { min: 0, max: 99, "aria-label": `${homeTeamName} score` } }}
                />
              </Stack>
              <Typography variant="h6">–</Typography>
              <Stack flex={1} spacing={0.5}>
                <Typography variant="body2">{awayTeamName}</Typography>
                <TextField
                  type="number"
                  value={away}
                  onChange={(event) => setAway(event.target.value)}
                  slotProps={{ htmlInput: { min: 0, max: 99, "aria-label": `${awayTeamName} score` } }}
                />
              </Stack>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={isPending || home.trim() === "" || away.trim() === ""}
          >
            {isPending ? "Saving…" : "Save result"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
