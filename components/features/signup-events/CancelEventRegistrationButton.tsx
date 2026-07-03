"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Stack } from "@mui/material";
import { cancelMyEventRegistration } from "@/lib/actions/event-registrations";

interface CancelEventRegistrationButtonProps {
  registrationId: string;
  participantName: string;
}

export function CancelEventRegistrationButton({
  registrationId,
  participantName,
}: CancelEventRegistrationButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleCancel = () => {
    if (!window.confirm(`Cancel ${participantName}'s registration?`)) {
      return;
    }
    startTransition(async () => {
      setError(null);
      const result = await cancelMyEventRegistration({ registrationId });
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
      <Button size="small" color="error" onClick={handleCancel} disabled={isPending}>
        {isPending ? "Canceling…" : "Cancel registration"}
      </Button>
    </Stack>
  );
}
