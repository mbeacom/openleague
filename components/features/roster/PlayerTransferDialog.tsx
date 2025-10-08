"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Box,
  Alert,
  CircularProgress,
} from "@mui/material";
import { transferPlayer } from "@/lib/actions/roster";
import { useToast } from "@/components/ui/Toast";

interface Player {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  team: {
    id: string;
    name: string;
    division: {
      id: string;
      name: string;
      ageGroup: string | null;
      skillLevel: string | null;
    } | null;
  };
}

interface PlayerTransferDialogProps {
  open: boolean;
  onClose: () => void;
  player: Player;
  leagueId: string;
}

export default function PlayerTransferDialog({
  open,
  onClose,
  player,
  leagueId,
}: PlayerTransferDialogProps) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [availableTeams, setAvailableTeams] = useState<Array<{
    id: string;
    name: string;
    division: { name: string } | null;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamsLoaded, setTeamsLoaded] = useState(false);

  // Load available teams when dialog opens
  const loadAvailableTeams = useCallback(async () => {
    if (teamsLoaded) return;

    try {
      const response = await fetch(`/api/leagues/${leagueId}/teams`);
      if (response.ok) {
        const teams = await response.json() as Array<{ id: string; name: string; division: { name: string } | null }>;
        // Filter out current team
        const otherTeams = teams.filter((team) => team.id !== player.team.id);
        setAvailableTeams(otherTeams);
        setTeamsLoaded(true);
      } else {
        setError("Failed to load available teams");
      }
    } catch {
      setError("Failed to load available teams");
    }
  }, [teamsLoaded, leagueId, player.team.id]);

  const handleTransfer = async () => {
    if (!selectedTeamId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await transferPlayer({
        playerId: player.id,
        fromTeamId: player.team.id,
        toTeamId: selectedTeamId,
        leagueId,
      });

      if (result.error) {
        setError(result.error);
        showError(result.error);
      } else {
        const targetTeam = availableTeams.find(t => t.id === selectedTeamId);
        showSuccess(`${player.name} transferred to ${targetTeam?.name} successfully`);
        onClose();
        router.refresh(); // Properly revalidate Next.js cache
      }
    } catch {
      const errorMsg = "Failed to transfer player. Please try again.";
      setError(errorMsg);
      showError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setSelectedTeamId("");
      setError(null);
      onClose();
    }
  };

  // Load teams when dialog opens
  useEffect(() => {
    if (open) {
      loadAvailableTeams();
    }
  }, [open, loadAvailableTeams]);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Transfer Player</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            {player.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Currently on: {player.team.name}
            {player.team.division && ` (${player.team.division.name})`}
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Transfer to Team</InputLabel>
          <Select
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
            label="Transfer to Team"
            disabled={loading || availableTeams.length === 0}
          >
            {availableTeams.map((team) => (
              <MenuItem key={team.id} value={team.id}>
                {team.name}
                {team.division && ` (${team.division.name})`}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {availableTeams.length === 0 && teamsLoaded && (
          <Alert severity="info">
            No other teams available for transfer in this league.
          </Alert>
        )}

        <Alert severity="warning" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>Important:</strong> This will move the player to the selected team.
            The player will lose access to their current team&apos;s events and roster,
            and gain access to the new team&apos;s activities.
          </Typography>
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleTransfer}
          variant="contained"
          disabled={!selectedTeamId || loading || availableTeams.length === 0}
          startIcon={loading ? <CircularProgress size={16} /> : null}
        >
          {loading ? "Transferring..." : "Transfer Player"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}