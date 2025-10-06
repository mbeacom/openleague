"use client";

import { useState } from "react";
import { Box, Typography, Button, Grid } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import PlayerCard from "./PlayerCard";
import AddPlayerDialog from "./AddPlayerDialog";
import type { Player } from "@/types/roster";

type RosterListProps = {
  players: Player[];
  teamId: string;
  isAdmin: boolean;
};

export default function RosterList({ players, teamId, isAdmin }: RosterListProps) {
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

  // Empty state
  if (players.length === 0) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "50vh",
          textAlign: "center",
        }}
      >
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No players on the roster yet
        </Typography>
        {isAdmin && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Get started by adding your first player
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddClick}
            >
              Add Player
            </Button>
          </>
        )}
        {!isAdmin && (
          <Typography variant="body2" color="text.secondary">
            Contact your team admin to add players
          </Typography>
        )}
      </Box>
    );
  }

  return (
    <>
      {/* Add Player Button (Admin only) */}
      {isAdmin && (
        <Box sx={{ mb: 3 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddClick}
          >
            Add Player
          </Button>
        </Box>
      )}

      {/* Responsive Grid using MUI v7 Grid */}
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
