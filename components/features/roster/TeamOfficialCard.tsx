"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  Typography,
  Box,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import EmailIcon from "@mui/icons-material/Email";
import LinkIcon from "@mui/icons-material/Link";
import { removeTeamOfficial } from "@/lib/actions/team-officials";
import { TEAM_OFFICIAL_ROLE_LABELS } from "@/lib/utils/validation";
import { useToast } from "@/components/ui/Toast";
import type { TeamOfficial } from "@/types/roster";

type TeamOfficialCardProps = {
  official: TeamOfficial;
  isAdmin: boolean;
  teamId: string;
  onEdit: () => void;
};

export default function TeamOfficialCard({
  official,
  isAdmin,
  teamId,
  onEdit,
}: TeamOfficialCardProps) {
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const { showSuccess, showError } = useToast();

  const roleLabel = TEAM_OFFICIAL_ROLE_LABELS[official.role];

  const handleRemoveConfirm = async () => {
    setRemoving(true);
    const result = await removeTeamOfficial({
      teamId,
      officialId: official.id,
    });
    setRemoving(false);
    setRemoveDialogOpen(false);

    if (!result.success) {
      showError(result.error);
    } else {
      showSuccess("Official removed");
      // revalidatePath in server action handles the update
    }
  };

  return (
    <>
      <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <CardContent sx={{ flex: 1 }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              mb: 1,
            }}
          >
            <Typography variant="h6" component="h3">
              {official.name}
            </Typography>

            {/* Edit/Remove Buttons (Admin only) */}
            {isAdmin && (
              <Box sx={{ display: "flex", gap: 0.5 }}>
                <IconButton
                  size="small"
                  onClick={onEdit}
                  aria-label="Edit official"
                  sx={{ minWidth: 44, minHeight: 44 }}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => setRemoveDialogOpen(true)}
                  aria-label="Remove official"
                  color="error"
                  sx={{ minWidth: 44, minHeight: 44 }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            )}
          </Box>

          {/* Role + status chips */}
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1 }}>
            <Chip
              label={roleLabel}
              size="small"
              color="primary"
              variant="outlined"
            />
            {official.status === "INVITED" && (
              <Chip label="Invited" size="small" color="warning" variant="outlined" />
            )}
            {official.userId && (
              <Chip
                icon={<LinkIcon />}
                label="Linked account"
                size="small"
                color="success"
                variant="outlined"
              />
            )}
          </Box>

          {/* Free-text detail (always set for OTHER) */}
          {official.roleDetail && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {official.roleDetail}
            </Typography>
          )}

          {official.email && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <EmailIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                {official.email}
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Remove Confirmation Dialog */}
      <Dialog open={removeDialogOpen} onClose={() => setRemoveDialogOpen(false)}>
        <DialogTitle>Remove Official</DialogTitle>
        <DialogContent>
          <Typography>
            Remove {official.name} ({roleLabel}) from the officials list? Any
            team admin access they have is not affected.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveDialogOpen(false)} disabled={removing}>
            Cancel
          </Button>
          <Button
            onClick={handleRemoveConfirm}
            color="error"
            variant="contained"
            disabled={removing}
          >
            {removing ? "Removing..." : "Remove"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
