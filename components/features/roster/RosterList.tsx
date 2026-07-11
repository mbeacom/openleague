"use client";

import { useState } from "react";
import { Box, Typography, Button, Grid, Divider } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DownloadIcon from "@mui/icons-material/Download";
import GroupsIcon from "@mui/icons-material/Groups";
import PlayerCard from "./PlayerCard";
import AddPlayerDialog from "./AddPlayerDialog";
import AddOfficialDialog from "./AddOfficialDialog";
import TeamOfficialCard from "./TeamOfficialCard";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Player, TeamOfficial } from "@/types/roster";

type RosterListProps = {
  players: Player[];
  /** Officials from the TeamOfficial model; section renders empty when omitted. */
  officials?: TeamOfficial[];
  /**
   * @deprecated Ignored. Legacy TeamMember listing removed — update
   * app/(dashboard)/team/[teamId]/roster/page.tsx to pass `officials` instead.
   */
  teamMembers?: unknown;
  teamId: string;
  isAdmin: boolean;
};

export default function RosterList({ players, officials = [], teamId, isAdmin }: RosterListProps) {
  const [playerDialogOpen, setPlayerDialogOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [officialDialogOpen, setOfficialDialogOpen] = useState(false);
  const [editingOfficial, setEditingOfficial] = useState<TeamOfficial | null>(null);

  const handleAddPlayerClick = () => {
    setEditingPlayer(null);
    setPlayerDialogOpen(true);
  };

  const handleEditPlayerClick = (player: Player) => {
    setEditingPlayer(player);
    setPlayerDialogOpen(true);
  };

  const handlePlayerDialogClose = () => {
    setPlayerDialogOpen(false);
    setEditingPlayer(null);
  };

  const handleAddOfficialClick = () => {
    setEditingOfficial(null);
    setOfficialDialogOpen(true);
  };

  const handleEditOfficialClick = (official: TeamOfficial) => {
    setEditingOfficial(official);
    setOfficialDialogOpen(true);
  };

  const handleOfficialDialogClose = () => {
    setOfficialDialogOpen(false);
    setEditingOfficial(null);
  };

  return (
    <>
      {/* Toolbar: Add Player + Export (Admin only) */}
      {isAdmin && (
        <Box sx={{ mb: 3, display: "flex", gap: 2, flexWrap: "wrap" }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddPlayerClick}
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

      {/* Players */}
      {players.length === 0 ? (
        <EmptyState
          title="No players on the roster yet"
          description={
            isAdmin
              ? "Get started by adding your first player"
              : "Contact your team admin to add players"
          }
        />
      ) : (
        <Grid container spacing={2}>
          {players.map((player) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={player.id}>
              <PlayerCard
                player={player}
                isAdmin={isAdmin}
                teamId={teamId}
                onEdit={() => handleEditPlayerClick(player)}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Team Officials */}
      <Divider sx={{ my: 4 }} />
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 1,
          mb: 2,
        }}
      >
        <Typography variant="h6" component="h2">
          Team Officials
        </Typography>
        {isAdmin && (
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={handleAddOfficialClick}
          >
            Add Official
          </Button>
        )}
      </Box>

      {officials.length === 0 ? (
        <EmptyState
          icon={<GroupsIcon />}
          title="No officials yet"
          description={
            isAdmin
              ? "Add your coaches, managers, and volunteers"
              : "Coaches, managers, and volunteers will appear here once added"
          }
        />
      ) : (
        <Grid container spacing={2}>
          {officials.map((official) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={official.id}>
              <TeamOfficialCard
                official={official}
                isAdmin={isAdmin}
                teamId={teamId}
                onEdit={() => handleEditOfficialClick(official)}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Add/Edit Dialogs (Admin only) */}
      {isAdmin && (
        <>
          <AddPlayerDialog
            open={playerDialogOpen}
            onClose={handlePlayerDialogClose}
            teamId={teamId}
            player={editingPlayer}
          />
          <AddOfficialDialog
            open={officialDialogOpen}
            onClose={handleOfficialDialogClose}
            teamId={teamId}
            official={editingOfficial}
          />
        </>
      )}
    </>
  );
}
