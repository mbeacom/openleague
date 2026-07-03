"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Stack } from "@mui/material";
import { claimWaitlistOffer, declineWaitlistOffer } from "@/lib/actions/event-registrations";

interface WaitlistOfferActionsProps {
  registrationId: string;
  participantName: string;
}

export function WaitlistOfferActions({ registrationId, participantName }: WaitlistOfferActionsProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = (action: "claim" | "decline") => {
    if (action === "decline" && !window.confirm(`Give up ${participantName}'s waitlist spot?`)) {
      return;
    }
    startTransition(async () => {
      setError(null);
      const result =
        action === "claim"
          ? await claimWaitlistOffer({ registrationId })
          : await declineWaitlistOffer({ registrationId });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <Stack spacing={1} alignItems="flex-end">
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Stack direction="row" spacing={1}>
        <Button size="small" variant="contained" onClick={() => run("claim")} disabled={isPending}>
          {isPending ? "Working…" : "Claim spot"}
        </Button>
        <Button size="small" color="error" onClick={() => run("decline")} disabled={isPending}>
          Decline
        </Button>
      </Stack>
    </Stack>
  );
}
