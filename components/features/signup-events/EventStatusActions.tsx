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
  Stack,
  TextField,
} from "@mui/material";
import {
  cancelSignupEvent,
  duplicateSignupEvent,
  publishSignupEvent,
  regenerateEventLink,
} from "@/lib/actions/signup-events";

interface EventStatusActionsProps {
  eventId: string;
  status: "DRAFT" | "PUBLISHED" | "CANCELED" | "COMPLETED";
  visibility: "PRIVATE" | "INVITE_ONLY" | "LINK" | "PUBLIC";
}

export function EventStatusActions({ eventId, status, visibility }: EventStatusActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ severity: "success" | "error"; text: string } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const run = (fn: () => Promise<{ success: boolean; error?: string; note?: string }>) => {
    startTransition(async () => {
      setMessage(null);
      const result = await fn();
      if (!result.success) {
        setMessage({ severity: "error", text: result.error ?? "Something went wrong." });
        return;
      }
      if (result.note) {
        setMessage({ severity: "success", text: result.note });
      }
      router.refresh();
    });
  };

  return (
    <Stack spacing={1.5}>
      {message ? <Alert severity={message.severity}>{message.text}</Alert> : null}
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
        {status === "DRAFT" ? (
          <Button
            variant="contained"
            disabled={isPending}
            onClick={() =>
              run(async () => {
                const result = await publishSignupEvent({ eventId });
                return result.success
                  ? { success: true, note: "Event published." }
                  : { success: false, error: result.error };
              })
            }
          >
            Publish
          </Button>
        ) : null}
        {status !== "CANCELED" ? (
          <Button color="error" disabled={isPending} onClick={() => setCancelOpen(true)}>
            Cancel event
          </Button>
        ) : null}
        <Button
          disabled={isPending}
          onClick={() =>
            run(async () => {
              const result = await duplicateSignupEvent({ eventId });
              if (result.success) {
                router.push(`/signup-events/${result.data.eventId}`);
                return { success: true };
              }
              return { success: false, error: result.error };
            })
          }
        >
          Duplicate
        </Button>
        {visibility === "LINK" ? (
          <Button
            disabled={isPending}
            onClick={() =>
              run(async () => {
                const result = await regenerateEventLink({ eventId });
                return result.success
                  ? { success: true, note: "Link regenerated — the old link no longer works." }
                  : { success: false, error: result.error };
              })
            }
          >
            Regenerate link
          </Button>
        ) : null}
      </Stack>

      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Cancel this event?</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="warning">
              All registered participants will be notified. Online payments will be flagged for refunds.
            </Alert>
            <TextField
              label="Reason (optional)"
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              multiline
              minRows={2}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelOpen(false)} disabled={isPending}>
            Keep event
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={isPending}
            onClick={() => {
              setCancelOpen(false);
              run(async () => {
                const result = await cancelSignupEvent({ eventId, reason: cancelReason || undefined });
                return result.success
                  ? {
                      success: true,
                      note:
                        result.data.paidRegistrations > 0
                          ? `Event canceled. ${result.data.paidRegistrations} paid registration(s) need refunds.`
                          : "Event canceled.",
                    }
                  : { success: false, error: result.error };
              });
            }}
          >
            Cancel event
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
