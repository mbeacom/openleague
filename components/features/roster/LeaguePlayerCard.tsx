"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  Typography,
  Box,
  IconButton,
  Menu,
  MenuItem,
  Chip,
  Avatar,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PersonIcon from "@mui/icons-material/Person";
import EmailIcon from "@mui/icons-material/Email";
import PhoneIcon from "@mui/icons-material/Phone";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import PlayerTransferDialog from "./PlayerTransferDialog";
import type { PlayerWithTeam } from "@/types/roster";

interface LeaguePlayerCardProps {
  player: PlayerWithTeam;
  isLeagueAdmin: boolean;
  leagueId: string;
}

export default function LeaguePlayerCard({
  player,
  isLeagueAdmin,
  leagueId,
}: LeaguePlayerCardProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleTransferClick = () => {
    setTransferDialogOpen(true);
    handleMenuClose();
  };

  const getPlayerInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <>
      <Card sx={{ height: "100%", position: "relative" }}>
        <CardContent>
          {/* Player Header */}
          <Box sx={{ display: "flex", alignItems: "flex-start", mb: 2 }}>
            <Avatar sx={{ mr: 2, bgcolor: "primary.main" }}>
              {getPlayerInitials(player.name)}
            </Avatar>
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="h6" component="h3" noWrap>
                {player.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {player.team.name}
              </Typography>
            </Box>
            {isLeagueAdmin && (
              <IconButton
                size="small"
                onClick={handleMenuOpen}
                sx={{ ml: 1 }}
              >
                <MoreVertIcon />
              </IconButton>
            )}
          </Box>

          {/* Player Status */}
          <Box sx={{ mb: 2 }}>
            {player.user ? (
              <Chip
                icon={<PersonIcon />}
                label="Registered"
                size="small"
                color="success"
                variant="outlined"
              />
            ) : (
              <Chip
                icon={<PersonIcon />}
                label="Not Registered"
                size="small"
                color="default"
                variant="outlined"
              />
            )}
          </Box>

          {/* Contact Information */}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {player.email && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <EmailIcon fontSize="small" color="action" />
                <Typography variant="body2" noWrap>
                  {player.email}
                </Typography>
              </Box>
            )}
            {player.phone && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <PhoneIcon fontSize="small" color="action" />
                <Typography variant="body2">
                  {player.phone}
                </Typography>
              </Box>
            )}
          </Box>

          {/* Emergency Contact (League Admin Only) */}
          {isLeagueAdmin && (player.emergencyContact || player.emergencyPhone) && (
            <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: "divider" }}>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                Emergency Contact
              </Typography>
              {player.emergencyContact && (
                <Typography variant="body2" fontSize="0.75rem">
                  {player.emergencyContact}
                </Typography>
              )}
              {player.emergencyPhone && (
                <Typography variant="body2" fontSize="0.75rem">
                  {player.emergencyPhone}
                </Typography>
              )}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Action Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        anchorOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
      >
        <MenuItem onClick={handleTransferClick}>
          <SwapHorizIcon sx={{ mr: 1 }} />
          Transfer Player
        </MenuItem>
      </Menu>

      {/* Transfer Dialog */}
      <PlayerTransferDialog
        open={transferDialogOpen}
        onClose={() => setTransferDialogOpen(false)}
        player={player}
        leagueId={leagueId}
      />
    </>
  );
}