"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Snackbar } from "@mui/material";
import { cancelMyRegistration } from "@/lib/actions/session-registrations";

interface CancelRegistrationButtonProps {
  registrationId: string;
}

export function CancelRegistrationButton({ registrationId }: CancelRegistrationButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleCancel = () => {
    startTransition(async () => {
      setError(null);
      const result = await cancelMyRegistration({ registrationId });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <>
      <Button size="small" color="error" variant="text" onClick={handleCancel} disabled={isPending}>
        {isPending ? "Canceling…" : "Cancel"}
      </Button>
      <Snackbar open={Boolean(error)} autoHideDuration={6000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}
