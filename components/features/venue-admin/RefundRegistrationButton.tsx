"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Snackbar } from "@mui/material";
import { refundRegistration } from "@/lib/actions/session-registrations";

interface RefundRegistrationButtonProps {
  organizationId: string;
  venueId: string;
  registrationId: string;
}

export function RefundRegistrationButton({ organizationId, venueId, registrationId }: RefundRegistrationButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleRefund = () => {
    if (!window.confirm("Refund this registration in full? This cannot be undone.")) return;
    startTransition(async () => {
      setError(null);
      const result = await refundRegistration({ organizationId, venueId, registrationId });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <>
      <Button size="small" color="error" variant="outlined" onClick={handleRefund} disabled={isPending}>
        {isPending ? "Refunding…" : "Refund"}
      </Button>
      <Snackbar open={Boolean(error)} autoHideDuration={6000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}
