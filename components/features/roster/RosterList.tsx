"use client";

import { useState } from "react";
import { Box, Typography, Button, Grid, Divider } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DownloadIcon from "@mui/icons-material/Download";
import PlayerCard from "./PlayerCard";
import AddPlayerDialog from "./AddPlayerDialog";
import TeamOfficialCard from "./TeamOfficialCard";
import type { Player } from "@/types/roster";

type TeamOfficial = {
  id: string;
  role: string;
  usahMemberId: string | null;
  user: { id: string; name: string | null; email: string };
};

type RosterListProps = {
  players: Player[];
  teamMembers: TeamOfficial[];
  teamId: string;
  isAdmin: boolean;
};

export default function RosterList({ players, teamMembers, teamId, isAdmin }: RosterListProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);

  const handleAddClick = () => {
    setEditingPlayer(null);
    setDialogOpen(true);
  };

  const handleEditClick = (player: Player) => {
    setEditingPlayer(player);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingPlayer(null);
  };

  return (
    <>
      {/* Toolbar: Add Player + Export (Admin only) */}
      {isAdmin && (
        <Box sx={{ mb: 3, display: "flex", gap: 2, flexWrap: "wrap" }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddClick}
          >
            Add Player
          </Button>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            component="a"
            href={`/api/roster/export?teamId=${teamId}`}
            download
          >
            Export Roster (CSV)
          </Button>
        </Box>
      )}

      {/* Empty state */}
      {players.length === 0 && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "30vh",
            textAlign: "center",
          }}
        >
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No players on the roster yet
          </Typography>
          {isAdmin ? (
            <Typography variant="body2" color="text.secondary">
              Get started by adding your first player
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Contact your team admin to add players
            </Typography>
          )}
        </Box>
      )}

      {/* Players Grid */}
      <Grid container spacing={2}>
        {players.map((player) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={player.id}>
            <PlayerCard
              player={player}
              isAdmin={isAdmin}
              teamId={teamId}
              onEdit={() => handleEditClick(player)}
            />
          </Grid>
        ))}
      </Grid>

      {/* Team Officials Section (admin-only USAH ID management) */}
      {isAdmin && teamMembers.length > 0 && (
        <>
          <Divider sx={{ my: 4 }} />
          <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
            Team Officials
          </Typography>
          <Grid container spacing={2}>
            {teamMembers.map((official) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={official.id}>
                <TeamOfficialCard
                  official={official}
                  isAdmin={isAdmin}
                  teamId={teamId}
                />
              </Grid>
            ))}
          </Grid>
        </>
      )}

      {/* Add/Edit Player Dialog */}
      {isAdmin && (
        <AddPlayerDialog
          open={dialogOpen}
          onClose={handleDialogClose}
          teamId={teamId}
          player={editingPlayer}
        />
      )}
    </>
  );
}
