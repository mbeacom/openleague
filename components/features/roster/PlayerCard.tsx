"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  Typography,
  Box,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Snackbar,
  Alert,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import EmailIcon from "@mui/icons-material/Email";
import PhoneIcon from "@mui/icons-material/Phone";
import { deletePlayer } from "@/lib/actions/roster";
import type { Player } from "@/types/roster";

type PlayerCardProps = {
  player: Player;
  isAdmin: boolean;
  teamId: string;
  onEdit: () => void;
};

export default function PlayerCard({
  player,
  isAdmin,
  teamId,
  onEdit,
}: PlayerCardProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({
    open: false,
    message: "",
    severity: "success",
  });

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    const result = await deletePlayer(player.id, teamId);

    if (result.error) {
      setSnackbar({
        open: true,
        message: result.error,
        severity: "error",
      });
    } else {
      setSnackbar({
        open: true,
        message: "Player deleted successfully",
        severity: "success",
      });
      // revalidatePath in server action handles the update
    }

    setDeleteDialogOpen(false);
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
  };

  const handleSnackbarClose = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  return (
    <>
      <Card
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <CardContent sx={{ flex: 1 }}>
          {/* Player Name */}
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              mb: 2,
            }}
          >
            <Typography variant="h6" component="h2">
              {player.name}
            </Typography>

            {/* Edit/Delete Buttons (Admin only) */}
            {isAdmin && (
              <Box sx={{ display: "flex", gap: 0.5 }}>
                <IconButton
                  size="small"
                  onClick={onEdit}
                  aria-label="Edit player"
                  sx={{ minWidth: 44, minHeight: 44 }}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={handleDeleteClick}
                  aria-label="Delete player"
                  color="error"
                  sx={{ minWidth: 44, minHeight: 44 }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            )}
          </Box>

          {/* Contact Information */}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {player.email && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <EmailIcon fontSize="small" color="action" />
                <Typography variant="body2" color="text.secondary">
                  {player.email}
                </Typography>
              </Box>
            )}

            {player.phone && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <PhoneIcon fontSize="small" color="action" />
                <Typography variant="body2" color="text.secondary">
                  {player.phone}
                </Typography>
              </Box>
            )}
          </Box>

          {/* Emergency Contact (Admin only) */}
          {isAdmin && (player.emergencyContact || player.emergencyPhone) && (
            <Box
              sx={{
                mt: 2,
                pt: 2,
                borderTop: 1,
                borderColor: "divider",
              }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontWeight: 600, display: "block", mb: 1 }}
              >
                Emergency Contact
              </Typography>
              {player.emergencyContact && (
                <Typography variant="body2" color="text.secondary">
                  {player.emergencyContact}
                </Typography>
              )}
              {player.emergencyPhone && (
                <Typography variant="body2" color="text.secondary">
                  {player.emergencyPhone}
                </Typography>
              )}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={handleDeleteCancel}>
        <DialogTitle>Delete Player</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to remove {player.name} from the roster? This
            action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={handleSnackbarClose}
          severity={snackbar.severity}
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
