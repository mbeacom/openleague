"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Stack } from "@mui/material";
import { acceptVenueStaffInvite, declineVenueStaffInvite } from "@/lib/actions/venue-staff";

interface InviteResponseButtonsProps {
  staffId: string;
}

/**
 * Accept/decline controls for the viewer's own pending venue staff
 * invitation. Successful responses revalidate the venue-admin pages, so the
 * surrounding RSC refreshes itself.
 */
export function InviteResponseButtons({ staffId }: InviteResponseButtonsProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const respond = (action: "accept" | "decline") => {
    startTransition(async () => {
      setError(null);
      const result =
        action === "accept"
          ? await acceptVenueStaffInvite(staffId)
          : await declineVenueStaffInvite(staffId);
      if (!result.success) {
        setError(result.error);
      }
    });
  };

  return (
    <Stack spacing={1} alignItems={{ xs: "flex-start", sm: "flex-end" }}>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Stack direction="row" spacing={1}>
        <Button
          variant="contained"
          size="small"
          disabled={isPending}
          onClick={() => respond("accept")}
        >
          Accept
        </Button>
        <Button
          variant="outlined"
          color="inherit"
          size="small"
          disabled={isPending}
          onClick={() => respond("decline")}
        >
          Decline
        </Button>
      </Stack>
    </Stack>
  );
}
