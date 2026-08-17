"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { assignVenueReservation } from "@/lib/actions/venue-reservations";

export interface ReservationPracticeOption {
  id: string;
  title: string;
  teamName: string;
}

interface VenueReservationAssignmentDialogProps {
  reservationId: string;
  venueName: string;
  localTime: string;
  practices: ReservationPracticeOption[];
}

export function VenueReservationAssignmentDialog(
  props: VenueReservationAssignmentDialogProps,
) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="contained"
        size="small"
        onClick={() => setOpen(true)}
        sx={{ minHeight: 44 }}
      >
        Assign practice
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        {open ? (
          <AssignmentDialogBody {...props} onClose={() => setOpen(false)} />
        ) : null}
      </Dialog>
    </>
  );
}

function AssignmentDialogBody({
  reservationId,
  venueName,
  localTime,
  practices,
  onClose,
}: VenueReservationAssignmentDialogProps & { onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [practiceId, setPracticeId] = useState("");
  const [overrideConflicts, setOverrideConflicts] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAssign = () => {
    if (!practiceId) {
      setError("Select a planned practice.");
      return;
    }
    if (overrideConflicts && !overrideReason.trim()) {
      setError("Enter a reason for the conflict override.");
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await assignVenueReservation({
        reservationId,
        targetType: "PRACTICE",
        targetId: practiceId,
        overrideConflicts,
        overrideReason: overrideConflicts ? overrideReason.trim() : undefined,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  };

  return (
    <>
      <DialogTitle>Assign reservation to practice</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Stack spacing={0.5}>
            <Typography fontWeight={700}>{venueName}</Typography>
            <Typography variant="body2" color="text.secondary">
              {localTime}
            </Typography>
          </Stack>

          {practices.length === 0 ? (
            <Alert severity="info">
              No unassigned planned practices match this venue, space, and time.
            </Alert>
          ) : (
            <TextField
              select
              required
              fullWidth
              label="Planned practice"
              value={practiceId}
              onChange={(event) => setPracticeId(event.target.value)}
              disabled={isPending}
              sx={{ "& .MuiInputBase-root": { minHeight: 44 } }}
            >
              {practices.map((practice) => (
                <MenuItem key={practice.id} value={practice.id} sx={{ minHeight: 44 }}>
                  {practice.teamName} — {practice.title}
                </MenuItem>
              ))}
            </TextField>
          )}

          <FormControlLabel
            control={
              <Checkbox
                checked={overrideConflicts}
                onChange={(event) => setOverrideConflicts(event.target.checked)}
                disabled={isPending}
                sx={{ minWidth: 44, minHeight: 44 }}
              />
            }
            label="Override detected conflicts"
          />
          {overrideConflicts ? (
            <TextField
              required
              fullWidth
              multiline
              minRows={2}
              label="Override reason"
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value)}
              disabled={isPending}
              slotProps={{ htmlInput: { maxLength: 1000 } }}
              helperText="A reason is required and is included with the assignment request."
            />
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isPending} sx={{ minHeight: 44 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleAssign}
          disabled={
            isPending
            || !practiceId
            || practices.length === 0
            || (overrideConflicts && !overrideReason.trim())
          }
          sx={{ minHeight: 44 }}
        >
          {isPending ? "Assigning…" : "Assign practice"}
        </Button>
      </DialogActions>
    </>
  );
}
