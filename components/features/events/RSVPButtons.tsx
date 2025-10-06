"use client";

import { useOptimistic, useTransition } from "react";
import { Box, Button, Stack } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import HelpIcon from "@mui/icons-material/Help";
import { updateRSVP } from "@/lib/actions/rsvp";

type RSVPStatus = "GOING" | "NOT_GOING" | "MAYBE" | "NO_RESPONSE";

interface RSVPButtonsProps {
  eventId: string;
  currentStatus: RSVPStatus;
  onStatusChange?: (status: RSVPStatus) => void;
}

export function RSVPButtons({
  eventId,
  currentStatus,
  onStatusChange,
}: RSVPButtonsProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] =
    useOptimistic<RSVPStatus>(currentStatus);

  const handleRSVP = (status: "GOING" | "NOT_GOING" | "MAYBE") => {
    startTransition(async () => {
      // Optimistically update the UI
      setOptimisticStatus(status);

      // Call the server action
      const result = await updateRSVP({
        eventId,
        status,
      });

      if (result.success) {
        // Notify parent component if callback provided
        onStatusChange?.(status);
      } else {
        // On error, the page will revalidate and show the actual status
        console.error("Failed to update RSVP:", result.error);
      }
    });
  };

  return (
    <Box sx={{ width: "100%" }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ width: "100%" }}
      >
        <Button
          variant={optimisticStatus === "GOING" ? "contained" : "outlined"}
          color="success"
          startIcon={<CheckCircleIcon />}
          onClick={() => handleRSVP("GOING")}
          disabled={isPending}
          fullWidth
          sx={{
            minHeight: 48,
            textTransform: "none",
            fontWeight: optimisticStatus === "GOING" ? 600 : 400,
          }}
        >
          Going
        </Button>

        <Button
          variant={optimisticStatus === "MAYBE" ? "contained" : "outlined"}
          color="warning"
          startIcon={<HelpIcon />}
          onClick={() => handleRSVP("MAYBE")}
          disabled={isPending}
          fullWidth
          sx={{
            minHeight: 48,
            textTransform: "none",
            fontWeight: optimisticStatus === "MAYBE" ? 600 : 400,
          }}
        >
          Maybe
        </Button>

        <Button
          variant={optimisticStatus === "NOT_GOING" ? "contained" : "outlined"}
          color="error"
          startIcon={<CancelIcon />}
          onClick={() => handleRSVP("NOT_GOING")}
          disabled={isPending}
          fullWidth
          sx={{
            minHeight: 48,
            textTransform: "none",
            fontWeight: optimisticStatus === "NOT_GOING" ? 600 : 400,
          }}
        >
          Not Going
        </Button>
      </Stack>
    </Box>
  );
}
