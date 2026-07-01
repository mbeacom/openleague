"use client";

import { type FormEvent, useState, useTransition } from "react";
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
import { registerForSession } from "@/lib/actions/session-registrations";
import { formatCurrencyFromCents } from "@/lib/utils/currency";

interface SessionRegisterButtonProps {
  venueId: string;
  scheduleBlockId?: string;
  lessonOfferingId?: string;
  title: string;
  priceAmount: number | null;
  currency: string;
  /** null = unlimited/not tracked; otherwise remaining spots for the session. */
  spotsRemaining?: number | null;
  isAuthenticated: boolean;
  defaultName?: string;
  defaultEmail?: string;
  loginRedirect: string;
}

type FormMessage = { severity: "success" | "error"; text: string };

export function SessionRegisterButton({
  venueId,
  scheduleBlockId,
  lessonOfferingId,
  title,
  priceAmount,
  currency,
  spotsRemaining,
  isAuthenticated,
  defaultName,
  defaultEmail,
  loginRedirect,
}: SessionRegisterButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<FormMessage | null>(null);
  const [isPending, startTransition] = useTransition();

  const isPaid = (priceAmount ?? 0) > 0;
  const isFull = spotsRemaining != null && spotsRemaining <= 0;
  const ctaLabel = isFull
    ? "Full"
    : isPaid
      ? `Buy · ${formatCurrencyFromCents(priceAmount ?? 0, currency)}`
      : "Register free";

  const handleOpen = () => {
    if (!isAuthenticated) {
      router.push(`/login?callbackUrl=${encodeURIComponent(loginRedirect)}`);
      return;
    }
    setMessage(null);
    setOpen(true);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const optional = (name: string) => {
      const value = String(formData.get(name) ?? "").trim();
      return value.length > 0 ? value : undefined;
    };

    startTransition(async () => {
      setMessage(null);
      const result = await registerForSession({
        venueId,
        scheduleBlockId,
        lessonOfferingId,
        participantName: String(formData.get("participantName") ?? ""),
        participantEmail: String(formData.get("participantEmail") ?? ""),
        participantPhone: optional("participantPhone"),
        skillLevelNote: optional("skillLevelNote"),
        notes: optional("notes"),
        quantity: Number(formData.get("quantity") ?? 1),
      });

      if (!result.success) {
        setMessage({ severity: "error", text: result.error });
        return;
      }

      if (result.data.checkoutUrl) {
        // Redirect to Stripe Checkout for payment.
        window.location.href = result.data.checkoutUrl;
        return;
      }

      setMessage({ severity: "success", text: "You're registered! Check your email for confirmation." });
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
        <DialogTitle>Register for {title}</DialogTitle>
        <Stack component="form" onSubmit={handleSubmit}>
          <DialogContent>
            <Stack spacing={2}>
              {isPaid ? (
                <Alert severity="info">
                  Payment of {formatCurrencyFromCents(priceAmount ?? 0, currency)} per spot is collected securely by
                  the rink via Stripe.
                </Alert>
              ) : (
                <Alert severity="info">This session is free. Reserve your spot below.</Alert>
              )}
              {spotsRemaining != null ? (
                <Typography variant="body2" color="text.secondary">
                  {spotsRemaining} spot{spotsRemaining === 1 ? "" : "s"} remaining
                </Typography>
              ) : null}
              {message ? <Alert severity={message.severity}>{message.text}</Alert> : null}
              <TextField
                name="participantName"
                label="Skater name"
                required
                defaultValue={defaultName ?? ""}
                slotProps={{ htmlInput: { maxLength: 100 } }}
              />
              <TextField
                name="participantEmail"
                label="Email"
                type="email"
                required
                defaultValue={defaultEmail ?? ""}
                slotProps={{ htmlInput: { maxLength: 254 } }}
              />
              <TextField name="participantPhone" label="Phone (optional)" slotProps={{ htmlInput: { maxLength: 30 } }} />
              <TextField
                name="skillLevelNote"
                label="Skill level (optional)"
                placeholder="e.g. Learn to Play, Snowplow Sam 1"
                slotProps={{ htmlInput: { maxLength: 120 } }}
              />
              <TextField
                name="quantity"
                label="Number of spots"
                type="number"
                defaultValue={1}
                slotProps={{ htmlInput: { min: 1, max: 20 } }}
              />
              <TextField
                name="notes"
                label="Notes for the rink (optional)"
                multiline
                minRows={2}
                slotProps={{ htmlInput: { maxLength: 1000 } }}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={isPending}>
              {isPending ? "Processing…" : isPaid ? "Continue to payment" : "Confirm registration"}
            </Button>
          </DialogActions>
        </Stack>
      </Dialog>
    </>
  );
}
