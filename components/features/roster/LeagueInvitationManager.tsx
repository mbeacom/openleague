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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Divider,
} from "@mui/material";
import { sendLeagueInvitation, resendInvitation } from "@/lib/actions/invitations";
import type { TeamWithDivision } from "@/types/roster";

interface Invitation {
  id: string;
  email: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  team: {
    name: string;
    division: {
      name: string;
    } | null;
  };
}

interface LeagueInvitationManagerProps {
  teams: TeamWithDivision[];
  invitations: Invitation[];
  leagueId: string;
  isLeagueAdmin: boolean;
}

export default function LeagueInvitationManager({
  teams,
  invitations,
  leagueId,
  isLeagueAdmin,
}: LeagueInvitationManagerProps) {
  const router = useRouter();
  const [newEmail, setNewEmail] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [resendingId, setResendingId] = useState<string | null>(null);

  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeamId) return;

    setIsLoading(true);
    setError("");
    setSuccess("");

    try {
      const result = await sendLeagueInvitation({
        email: newEmail,
        teamId: selectedTeamId,
        leagueId,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      const selectedTeam = teams.find(t => t.id === selectedTeamId);
      if (result.data.addedDirectly) {
        setSuccess(`${newEmail} was added to ${selectedTeam?.name} directly (they already have an account)`);
      } else {
        setSuccess(`Invitation sent to ${newEmail} for ${selectedTeam?.name}`);
      }

      setNewEmail("");
      setSelectedTeamId("");

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

  // Helper function to determine if an invitation is expired
  const isInvitationExpired = (status: string, expiresAt: string | Date) => {
    return status === "EXPIRED" || new Date(expiresAt) < new Date();
  };

  const getStatusColor = (status: string, expiresAt: string | Date) => {
    if (status === "ACCEPTED") return "success";
    if (isInvitationExpired(status, expiresAt)) return "error";
    return "warning";
  };

  const getStatusLabel = (status: string, expiresAt: string | Date) => {
    if (status === "ACCEPTED") return "Accepted";
    if (isInvitationExpired(status, expiresAt)) return "Expired";
    return "Pending";
  };

  if (!isLeagueAdmin) {
    return (
      <Alert severity="info">
        Only league administrators can manage invitations across all teams.
      </Alert>
    );
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        League Invitations
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        As a league admin, you can invite players to any team in the league.
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
          gap: 2,
          mb: 3,
          flexDirection: { xs: "column", md: "row" },
        }}
      >
        <TextField
          type="email"
          placeholder="Email address"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          required
          sx={{ flex: 1 }}
          size="small"
        />

        <FormControl sx={{ minWidth: 200 }} size="small">
          <InputLabel>Select Team</InputLabel>
          <Select
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
            label="Select Team"
            required
          >
            {teams.map((team) => (
              <MenuItem key={team.id} value={team.id}>
                {team.name}
                {team.division && ` (${team.division.name})`}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Button
          type="submit"
          variant="contained"
          disabled={isLoading || !newEmail || !selectedTeamId}
          sx={{ minWidth: 120 }}
        >
          {isLoading ? <CircularProgress size={24} /> : "Send Invite"}
        </Button>
      </Box>

      <Divider sx={{ my: 3 }} />

      <Typography variant="h6" gutterBottom>
        Recent Invitations
      </Typography>

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
                primary={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                    <Typography variant="body1">{invitation.email}</Typography>
                    <Chip
                      label={invitation.team.name}
                      size="small"
                      variant="outlined"
                      color="primary"
                    />
                    {invitation.team.division && (
                      <Chip
                        label={invitation.team.division.name}
                        size="small"
                        variant="outlined"
                      />
                    )}
                  </Box>
                }
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
                {isInvitationExpired(invitation.status, invitation.expiresAt) && (
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
    </Paper>
  );
}