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
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { registerForSignupEvent } from "@/lib/actions/event-registrations";
import { formatCurrencyFromCents } from "@/lib/utils/currency";

interface RegisterDialogProps {
  eventId: string;
  slotId: string;
  slotName: string;
  priceAmount: number | null;
  currency: string;
  /** null = unlimited; otherwise remaining spots in this slot. */
  spotsRemaining: number | null;
  isAuthenticated: boolean;
  loginRedirect: string;
  linkToken?: string;
  paymentNote?: string | null;
}

type ParticipantRow = { name: string; email: string; phone: string; notes: string };

const EMPTY_PARTICIPANT: ParticipantRow = { name: "", email: "", phone: "", notes: "" };

export function RegisterDialog({
  eventId,
  slotId,
  slotName,
  priceAmount,
  currency,
  spotsRemaining,
  isAuthenticated,
  loginRedirect,
  linkToken,
  paymentNote,
}: RegisterDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [participants, setParticipants] = useState<ParticipantRow[]>([{ ...EMPTY_PARTICIPANT }]);

  const isPaid = (priceAmount ?? 0) > 0;
  const isFull = spotsRemaining != null && spotsRemaining <= 0;
  const ctaLabel = isFull
    ? "Full"
    : isPaid
      ? `Sign up · ${formatCurrencyFromCents(priceAmount ?? 0, currency)}`
      : "Sign up";

  const updateParticipant = (index: number, patch: Partial<ParticipantRow>) => {
    setParticipants((current) =>
      current.map((participant, i) => (i === index ? { ...participant, ...patch } : participant))
    );
  };

  const handleOpen = () => {
    if (!isAuthenticated) {
      router.push(`/login?callbackUrl=${encodeURIComponent(loginRedirect)}`);
      return;
    }
    setError(null);
    setSuccess(false);
    setParticipants([{ ...EMPTY_PARTICIPANT }]);
    setOpen(true);
  };

  const handleSubmit = () => {
    startTransition(async () => {
      setError(null);
      const result = await registerForSignupEvent({
        eventId,
        slotId,
        linkToken,
        participants: participants
          .filter((participant) => participant.name.trim().length > 0)
          .map((participant) => ({
            name: participant.name.trim(),
            email: participant.email.trim() || undefined,
            phone: participant.phone.trim() || undefined,
            notes: participant.notes.trim() || undefined,
          })),
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        setOpen(false);
        router.refresh();
      }, 1200);
    });
  };

  return (
    <>
      <Button variant="contained" size="small" onClick={handleOpen} disabled={isFull}>
        {ctaLabel}
      </Button>

      <Dialog open={open} onClose={() => (isPending ? undefined : setOpen(false))} fullWidth maxWidth="sm">
        <DialogTitle>Sign up — {slotName}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {isPaid ? (
              <Alert severity="info">
                {formatCurrencyFromCents(priceAmount ?? 0, currency)} per participant.
                {paymentNote ? ` ${paymentNote}` : ""}
              </Alert>
            ) : (
              <Alert severity="info">This slot is free.</Alert>
            )}
            {spotsRemaining != null ? (
              <Typography variant="body2" color="text.secondary">
                {spotsRemaining} spot{spotsRemaining === 1 ? "" : "s"} remaining
              </Typography>
            ) : null}
            {error ? <Alert severity="error">{error}</Alert> : null}
            {success ? <Alert severity="success">You&apos;re signed up! Check your email for confirmation.</Alert> : null}

            {participants.map((participant, index) => (
              <Stack key={index} spacing={1.5} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 2 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="subtitle2">Participant {index + 1}</Typography>
                  {participants.length > 1 ? (
                    <IconButton
                      size="small"
                      aria-label={`Remove participant ${index + 1}`}
                      onClick={() => setParticipants((current) => current.filter((_, i) => i !== index))}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  ) : null}
                </Stack>
                <TextField
                  label="Name"
                  required
                  value={participant.name}
                  onChange={(event) => updateParticipant(index, { name: event.target.value })}
                  slotProps={{ htmlInput: { maxLength: 100 } }}
                />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                  <TextField
                    label="Email (optional)"
                    type="email"
                    fullWidth
                    value={participant.email}
                    onChange={(event) => updateParticipant(index, { email: event.target.value })}
                    slotProps={{ htmlInput: { maxLength: 254 } }}
                  />
                  <TextField
                    label="Phone (optional)"
                    fullWidth
                    value={participant.phone}
                    onChange={(event) => updateParticipant(index, { phone: event.target.value })}
                    slotProps={{ htmlInput: { maxLength: 30 } }}
                  />
                </Stack>
                <TextField
                  label="Notes for the organizer (optional)"
                  value={participant.notes}
                  onChange={(event) => updateParticipant(index, { notes: event.target.value })}
                  slotProps={{ htmlInput: { maxLength: 500 } }}
                />
              </Stack>
            ))}

            {participants.length < 10 ? (
              <Button
                startIcon={<AddIcon />}
                onClick={() => setParticipants((current) => [...current, { ...EMPTY_PARTICIPANT }])}
              >
                Add another participant
              </Button>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={isPending || participants.every((participant) => !participant.name.trim())}
          >
            {isPending ? "Signing up…" : "Confirm signup"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
