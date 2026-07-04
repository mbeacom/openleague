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
  FormControl,
  FormControlLabel,
  FormLabel,
  IconButton,
  Radio,
  RadioGroup,
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
  /** True when this signup will join the waitlist (slot full or viewer's phase not open). */
  waitlistMode?: boolean;
  waitlistEnabled?: boolean;
  /** Payment methods available for priced slots. */
  onlineAvailable?: boolean;
  manualAvailable?: boolean;
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
  waitlistMode = false,
  waitlistEnabled = true,
  onlineAvailable = false,
  manualAvailable = true,
}: RegisterDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<"CONFIRMED" | "WAITLISTED" | null>(null);
  const [isPending, startTransition] = useTransition();
  const [participants, setParticipants] = useState<ParticipantRow[]>([{ ...EMPTY_PARTICIPANT }]);
  const [method, setMethod] = useState<"ONLINE" | "MANUAL">(manualAvailable ? "MANUAL" : "ONLINE");

  const isPaid = (priceAmount ?? 0) > 0;
  const showMethodChoice = isPaid && !waitlistMode && onlineAvailable && manualAvailable;
  const paysOnline = isPaid && !waitlistMode && (method === "ONLINE" || !manualAvailable) && onlineAvailable;
  const isFull = spotsRemaining != null && spotsRemaining <= 0;
  const joinsWaitlist = waitlistMode || (isFull && waitlistEnabled);
  const disabled = isFull && !waitlistEnabled;
  const ctaLabel = disabled
    ? "Full"
    : joinsWaitlist
      ? "Join waitlist"
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
    setSuccess(null);
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
        paymentMethod: isPaid && !waitlistMode ? (paysOnline ? "ONLINE" : "MANUAL") : undefined,
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

      if (result.data.status === "PENDING_PAYMENT") {
        if (result.data.checkoutUrl) {
          // Off to Stripe Checkout — the webhook confirms on payment.
          window.location.href = result.data.checkoutUrl;
          return;
        }
        setError("Checkout could not be started. Please try again.");
        return;
      }

      setSuccess(result.data.status);
      setTimeout(() => {
        setOpen(false);
        router.refresh();
      }, 1500);
    });
  };

  return (
    <>
      <Button variant={joinsWaitlist ? "outlined" : "contained"} size="small" onClick={handleOpen} disabled={disabled}>
        {ctaLabel}
      </Button>

      <Dialog open={open} onClose={() => (isPending ? undefined : setOpen(false))} fullWidth maxWidth="sm">
        <DialogTitle>{joinsWaitlist ? "Join the waitlist" : "Sign up"} — {slotName}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {joinsWaitlist ? (
              <Alert severity="info">
                You&apos;ll be added to the waitlist and offered a spot automatically when one opens up.
              </Alert>
            ) : isPaid ? (
              <Alert severity="info">
                {formatCurrencyFromCents(priceAmount ?? 0, currency)} per participant.
                {paysOnline
                  ? " You'll pay securely by card at checkout."
                  : paymentNote
                    ? ` ${paymentNote}`
                    : ""}
              </Alert>
            ) : (
              <Alert severity="info">This slot is free.</Alert>
            )}

            {showMethodChoice ? (
              <FormControl>
                <FormLabel id={`payment-method-${slotId}`}>How would you like to pay?</FormLabel>
                <RadioGroup
                  row
                  aria-labelledby={`payment-method-${slotId}`}
                  value={method}
                  onChange={(event) => setMethod(event.target.value as "ONLINE" | "MANUAL")}
                >
                  <FormControlLabel value="ONLINE" control={<Radio />} label="Pay online now" />
                  <FormControlLabel
                    value="MANUAL"
                    control={<Radio />}
                    label="Venmo / Zelle / Cash App / cash"
                  />
                </RadioGroup>
              </FormControl>
            ) : null}
            {paysOnline && participants.length > 1 ? (
              <Alert severity="warning">
                Online payment covers one participant per checkout — remove extra participants or
                choose a manual payment method.
              </Alert>
            ) : null}
            {spotsRemaining != null && !joinsWaitlist ? (
              <Typography variant="body2" color="text.secondary">
                {spotsRemaining} spot{spotsRemaining === 1 ? "" : "s"} remaining
              </Typography>
            ) : null}
            {error ? <Alert severity="error">{error}</Alert> : null}
            {success === "CONFIRMED" ? (
              <Alert severity="success">You&apos;re signed up! Check your email for confirmation.</Alert>
            ) : null}
            {success === "WAITLISTED" ? (
              <Alert severity="success">You&apos;re on the waitlist — we&apos;ll email you when a spot opens up.</Alert>
            ) : null}

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

            {participants.length < 10 && !paysOnline ? (
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
            disabled={
              isPending ||
              participants.every((participant) => !participant.name.trim()) ||
              (paysOnline && participants.filter((participant) => participant.name.trim()).length > 1)
            }
          >
            {isPending
              ? "Working…"
              : joinsWaitlist
                ? "Join waitlist"
                : paysOnline
                  ? "Continue to payment"
                  : "Confirm signup"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
