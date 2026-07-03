"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Chip,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import ReplayIcon from "@mui/icons-material/Replay";
import BlockIcon from "@mui/icons-material/Block";
import {
  sendEventInvitations,
  resendEventInvitation,
  revokeEventInvitation,
} from "@/lib/actions/event-invitations";
import { formatDateTime } from "@/lib/utils/date";

const STATUS_COLORS: Record<string, "default" | "success" | "warning"> = {
  PENDING: "warning",
  ACCEPTED: "success",
  REVOKED: "default",
};

type Invitation = {
  id: string;
  email: string;
  status: string;
  sentAt: Date;
  acceptedAt: Date | null;
  invitedUser: { id: string; name: string | null } | null;
};

interface InvitePanelProps {
  eventId: string;
  invitations: Invitation[];
  isInviteOnly: boolean;
}

export function InvitePanel({ eventId, invitations, isInviteOnly }: InvitePanelProps) {
  const router = useRouter();
  const [emailsText, setEmailsText] = useState("");
  const [message, setMessage] = useState<{ severity: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const parseEmails = () =>
    emailsText
      .split(/[\s,;]+/)
      .map((email) => email.trim())
      .filter(Boolean);

  const handleSend = () => {
    const emails = parseEmails();
    if (emails.length === 0) return;
    startTransition(async () => {
      setMessage(null);
      const result = await sendEventInvitations({ eventId, emails });
      if (!result.success) {
        setMessage({ severity: "error", text: result.error });
        return;
      }
      setMessage({
        severity: "success",
        text:
          result.data.skipped.length > 0
            ? `Sent ${result.data.sent} invitation(s); failed for: ${result.data.skipped.join(", ")}`
            : `Sent ${result.data.sent} invitation(s).`,
      });
      setEmailsText("");
      router.refresh();
    });
  };

  const run = (fn: () => Promise<{ success: boolean; error?: string }>) => {
    startTransition(async () => {
      setMessage(null);
      const result = await fn();
      if (!result.success) {
        setMessage({ severity: "error", text: result.error ?? "Something went wrong." });
        return;
      }
      router.refresh();
    });
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h6">Invitations</Typography>
      {isInviteOnly ? (
        <Alert severity="info">
          This event is invite-only — only people on this list can view it and register.
        </Alert>
      ) : null}
      {message ? <Alert severity={message.severity}>{message.text}</Alert> : null}

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "flex-start" }}>
        <TextField
          label="Email addresses"
          placeholder="parent1@example.com, parent2@example.com…"
          helperText="Separate addresses with commas or new lines"
          multiline
          minRows={2}
          fullWidth
          value={emailsText}
          onChange={(event) => setEmailsText(event.target.value)}
        />
        <Button
          variant="contained"
          startIcon={<SendIcon />}
          onClick={handleSend}
          disabled={isPending || parseEmails().length === 0}
          sx={{ whiteSpace: "nowrap", mt: { sm: 1 } }}
        >
          {isPending ? "Sending…" : "Send invites"}
        </Button>
      </Stack>

      {invitations.length === 0 ? (
        <Typography color="text.secondary">No invitations sent yet.</Typography>
      ) : (
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Email</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Sent</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {invitations.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell>
                    <Typography variant="body2">{invitation.email}</Typography>
                    {invitation.invitedUser ? (
                      <Typography variant="caption" color="text.secondary">
                        {invitation.invitedUser.name ?? "Registered member"}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={invitation.status.toLowerCase()}
                      color={STATUS_COLORS[invitation.status] ?? "default"}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {formatDateTime(invitation.sentAt)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {invitation.status !== "REVOKED" ? (
                      <>
                        <Tooltip title="Re-send invitation">
                          <IconButton
                            size="small"
                            disabled={isPending}
                            aria-label={`Re-send invitation to ${invitation.email}`}
                            onClick={() => run(() => resendEventInvitation({ invitationId: invitation.id }))}
                          >
                            <ReplayIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Revoke invitation">
                          <IconButton
                            size="small"
                            disabled={isPending}
                            aria-label={`Revoke invitation for ${invitation.email}`}
                            onClick={() => run(() => revokeEventInvitation({ invitationId: invitation.id }))}
                          >
                            <BlockIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </>
                    ) : (
                      <Tooltip title="Re-invite">
                        <IconButton
                          size="small"
                          disabled={isPending}
                          aria-label={`Re-invite ${invitation.email}`}
                          onClick={() => run(() => sendEventInvitations({ eventId, emails: [invitation.email] }))}
                        >
                          <ReplayIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}
