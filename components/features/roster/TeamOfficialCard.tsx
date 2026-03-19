"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  Typography,
  Box,
  IconButton,
  Chip,
  TextField,
  Button,
  CircularProgress,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import { updateTeamMemberUsahId } from "@/lib/actions/roster";
import { useToast } from "@/components/ui/Toast";

type TeamOfficial = {
  id: string;
  role: string;
  usahMemberId: string | null;
  user: { id: string; name: string | null; email: string };
};

type TeamOfficialCardProps = {
  official: TeamOfficial;
  isAdmin: boolean;
  teamId: string;
};

export default function TeamOfficialCard({
  official,
  isAdmin,
  teamId,
}: TeamOfficialCardProps) {
  const [editing, setEditing] = useState(false);
  const [usahId, setUsahId] = useState(official.usahMemberId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { showSuccess, showError } = useToast();

  const displayName = official.user.name || official.user.email;

  const handleEditClick = () => {
    setUsahId(official.usahMemberId ?? "");
    setError(null);
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setError(null);
  };

  const validate = (val: string) => {
    if (val.length > 20) return "USA Hockey Member ID must be 20 characters or fewer";
    if (val && !/^[a-zA-Z0-9]+$/.test(val)) return "USA Hockey Member ID must be alphanumeric";
    return null;
  };

  const handleSave = async () => {
    const validationError = validate(usahId);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    const result = await updateTeamMemberUsahId({
      teamMemberId: official.id,
      teamId,
      usahMemberId: usahId || null,
    });
    setSaving(false);

    if (!result.success) {
      showError(result.error);
    } else {
      showSuccess("USA Hockey ID updated");
      setEditing(false);
    }
  };

  return (
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
          <Box>
            <Typography variant="h6" component="h2">
              {displayName}
            </Typography>
            {official.user.name && (
              <Typography variant="body2" color="text.secondary">
                {official.user.email}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Chip
              label={official.role === "ADMIN" ? "Admin" : "Member"}
              size="small"
              color={official.role === "ADMIN" ? "primary" : "default"}
              variant="outlined"
            />
            {isAdmin && !editing && (
              <IconButton
                size="small"
                onClick={handleEditClick}
                aria-label="Edit USA Hockey ID"
                sx={{ minWidth: 44, minHeight: 44 }}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        </Box>

        {/* USA Hockey ID — view or edit */}
        {isAdmin && (
          <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: "divider" }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 600, display: "block", mb: 1 }}
            >
              USA Hockey ID
            </Typography>

            {editing ? (
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                <TextField
                  value={usahId}
                  onChange={(e) => {
                    setUsahId(e.target.value);
                    setError(validate(e.target.value));
                  }}
                  error={!!error}
                  helperText={error || "Alphanumeric, up to 20 characters"}
                  size="small"
                  slotProps={{ htmlInput: { maxLength: 20 } }}
                  sx={{ flex: 1 }}
                  autoFocus
                />
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleSave}
                  disabled={saving || !!error}
                  sx={{ minWidth: 44, minHeight: 40, mt: 0.25 }}
                >
                  {saving ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    <CheckIcon fontSize="small" />
                  )}
                </Button>
                <Button
                  size="small"
                  onClick={handleCancel}
                  disabled={saving}
                  sx={{ minWidth: 44, minHeight: 40, mt: 0.25 }}
                >
                  <CloseIcon fontSize="small" />
                </Button>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {official.usahMemberId || (
                  <Typography
                    component="span"
                    variant="body2"
                    color="text.disabled"
                    sx={{ fontStyle: "italic" }}
                  >
                    Not set
                  </Typography>
                )}
              </Typography>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
