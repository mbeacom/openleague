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
import SupervisorAccountIcon from "@mui/icons-material/SupervisorAccount";
import Chip from "@mui/material/Chip";
import { deletePlayer } from "@/lib/actions/roster";
import { isUnder13 } from "@/lib/utils/coppa";
import ManageGuardiansDialog from "./ManageGuardiansDialog";
import type { GuardianWithUser, Player } from "@/types/roster";

// Date-only values come back as UTC midnight — format in UTC so the
// birthday doesn't shift a day for viewers west of Greenwich.
const dobFormatter = new Intl.DateTimeFormat(undefined, {
  timeZone: "UTC",
  dateStyle: "medium",
});

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
  const [guardiansDialogOpen, setGuardiansDialogOpen] = useState(false);

  const dateOfBirth = player.dateOfBirth ? new Date(player.dateOfBirth) : null;
  const activeConsent = player.parentalConsents?.[0] ?? null;
  const isMinorUnder13 = dateOfBirth ? isUnder13(dateOfBirth) : false;
  // Guardian names for the chips row. null = not loaded yet — guardians load
  // lazily inside the manage dialog to keep the roster query lean.
  const [guardians, setGuardians] = useState<GuardianWithUser[] | null>(null);
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
          {/* Player Name + Jersey Number */}
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              mb: 2,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {player.jerseyNumber != null && (
                <Chip
                  label={`#${player.jerseyNumber}`}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 700, fontSize: "0.75rem" }}
                />
              )}
              <Typography variant="h6" component="h2">
                {player.name}
              </Typography>
              {player.position && (
                <Chip
                  label={player.position}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: "0.75rem" }}
                />
              )}
            </Box>

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

          {/* Admin-only fields */}
          {isAdmin && dateOfBirth && (
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
                sx={{ fontWeight: 600, display: "block" }}
              >
                Date of Birth
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {dobFormatter.format(dateOfBirth)}
              </Typography>
              {isMinorUnder13 && (
                <Box sx={{ mt: 0.5 }}>
                  {activeConsent ? (
                    <Chip
                      size="small"
                      color="success"
                      variant="outlined"
                      label={`Parental consent on file · ${dobFormatter.format(new Date(activeConsent.grantedAt))}`}
                    />
                  ) : (
                    <Chip
                      size="small"
                      color="warning"
                      variant="outlined"
                      label="Parental consent missing"
                    />
                  )}
                </Box>
              )}
            </Box>
          )}

          {isAdmin && (player.emergencyContact || player.emergencyPhone || player.usahMemberId) && (
            <Box
              sx={{
                mt: 2,
                pt: 2,
                borderTop: 1,
                borderColor: "divider",
              }}
            >
              {(player.emergencyContact || player.emergencyPhone) && (
                <>
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
                </>
              )}
              {player.usahMemberId && (
                <Box sx={{ mt: player.emergencyContact || player.emergencyPhone ? 1 : 0 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontWeight: 600, display: "block" }}
                  >
                    USA Hockey ID
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {player.usahMemberId}
                  </Typography>
                </Box>
              )}
            </Box>
          )}

          {/* Guardians (Admin only) */}
          {isAdmin && (
            <Box
              sx={{
                mt: 2,
                pt: 1,
                borderTop: 1,
                borderColor: "divider",
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: 600 }}
                >
                  Guardians
                </Typography>
                <Button
                  size="small"
                  startIcon={<SupervisorAccountIcon />}
                  onClick={() => setGuardiansDialogOpen(true)}
                  aria-label={`Manage guardians for ${player.name}`}
                  sx={{ minHeight: 44 }}
                >
                  Manage guardians
                </Button>
              </Box>
              {guardians && guardians.length > 0 && (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
                  {guardians.map((guardian) => (
                    <Chip
                      key={guardian.id}
                      size="small"
                      variant="outlined"
                      icon={<SupervisorAccountIcon />}
                      label={guardian.user.name || guardian.user.email}
                    />
                  ))}
                </Box>
              )}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Manage Guardians Dialog (Admin only) */}
      {isAdmin && (
        <ManageGuardiansDialog
          open={guardiansDialogOpen}
          onClose={() => setGuardiansDialogOpen(false)}
          playerId={player.id}
          playerName={player.name}
          onGuardiansChange={setGuardians}
        />
      )}

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
