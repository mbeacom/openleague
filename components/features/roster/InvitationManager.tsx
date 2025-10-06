"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  Button,
  Chip,
  Alert,
  CircularProgress,
  TextField,
} from "@mui/material";
import { sendInvitation, resendInvitation } from "@/lib/actions/invitations";
import type { InvitationWithDates } from "@/types/invitations";

interface InvitationManagerProps {
  invitations: InvitationWithDates[];
  teamId: string;
}

export default function InvitationManager({
  invitations,
  teamId,
}: InvitationManagerProps) {
  const router = useRouter();
  const [newEmail, setNewEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [resendingId, setResendingId] = useState<string | null>(null);

  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setSuccess("");

    try {
      const result = await sendInvitation({
        email: newEmail,
        teamId,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      if (result.data.addedDirectly) {
        setSuccess(`${newEmail} was added to the team directly (they already have an account)`);
      } else {
        setSuccess(`Invitation sent to ${newEmail}`);
      }

      setNewEmail("");

      // Refresh server data to show updated invitations
      router.refresh();
    } catch {
      setError("Failed to send invitation");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async (invitationId: string) => {
    setResendingId(invitationId);
    setError("");
    setSuccess("");

    try {
      const result = await resendInvitation(invitationId);

      if (!result.success) {
        setError(result.error);
        return;
      }

      setSuccess("Invitation resent successfully");

      // Refresh server data to show updated invitations
      router.refresh();
    } catch {
      setError("Failed to resend invitation");
    } finally {
      setResendingId(null);
    }
  };

  const getStatusColor = (status: string, expiresAt: Date) => {
    if (status === "ACCEPTED") return "success";
    if (status === "EXPIRED" || new Date(expiresAt) < new Date()) return "error";
    return "warning";
  };

  const getStatusLabel = (status: string, expiresAt: Date) => {
    if (status === "ACCEPTED") return "Accepted";
    if (status === "EXPIRED" || new Date(expiresAt) < new Date()) return "Expired";
    return "Pending";
  };

  const isExpired = (status: string, expiresAt: Date) => {
    return status === "EXPIRED" || new Date(expiresAt) < new Date();
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Team Invitations
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess("")}>
          {success}
        </Alert>
      )}

      <Box
        component="form"
        onSubmit={handleSendInvitation}
        sx={{
          display: "flex",
          gap: 1,
          mb: 3,
          flexDirection: { xs: "column", sm: "row" },
        }}
      >
        <TextField
          type="email"
          placeholder="Email address"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          required
          fullWidth
          size="small"
        />
        <Button
          type="submit"
          variant="contained"
          disabled={isLoading || !newEmail}
          sx={{ minWidth: { xs: "100%", sm: "120px" } }}
        >
          {isLoading ? <CircularProgress size={24} /> : "Send Invite"}
        </Button>
      </Box>

      {invitations.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No invitations sent yet
        </Typography>
      ) : (
        <List>
          {invitations.map((invitation) => (
            <ListItem
              key={invitation.id}
              sx={{
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                mb: 1,
                flexDirection: { xs: "column", sm: "row" },
                alignItems: { xs: "flex-start", sm: "center" },
                gap: 1,
              }}
            >
              <ListItemText
                primary={invitation.email}
                secondary={`Sent ${new Date(invitation.createdAt).toLocaleDateString()}`}
                sx={{ flex: 1 }}
              />
              <Box
                sx={{
                  display: "flex",
                  gap: 1,
                  alignItems: "center",
                  width: { xs: "100%", sm: "auto" },
                  justifyContent: { xs: "space-between", sm: "flex-end" },
                }}
              >
                <Chip
                  label={getStatusLabel(invitation.status, invitation.expiresAt)}
                  color={getStatusColor(invitation.status, invitation.expiresAt)}
                  size="small"
                />
                {isExpired(invitation.status, invitation.expiresAt) && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleResend(invitation.id)}
                    disabled={resendingId === invitation.id}
                  >
                    {resendingId === invitation.id ? (
                      <CircularProgress size={20} />
                    ) : (
                      "Resend"
                    )}
                  </Button>
                )}
              </Box>
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
}
