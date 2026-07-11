"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Chip,
  Typography,
  Alert,
  CircularProgress,
  Divider,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import {
  addGuardian,
  listGuardians,
  removeGuardian,
} from "@/lib/actions/guardians";
import { useToast } from "@/components/ui/Toast";
import type { GuardianWithUser } from "@/types/roster";

type ManageGuardiansDialogProps = {
  open: boolean;
  onClose: () => void;
  playerId: string;
  playerName: string;
  /**
   * Fires whenever the guardian list is loaded or mutated so the parent
   * (PlayerCard chips) can stay in sync without its own fetch.
   */
  onGuardiansChange?: (guardians: GuardianWithUser[]) => void;
};

export default function ManageGuardiansDialog({
  open,
  onClose,
  playerId,
  playerName,
  onGuardiansChange,
}: ManageGuardiansDialogProps) {
  const { showSuccess, showError } = useToast();

  // Guardian list — loaded lazily when the dialog opens (kept out of the
  // roster query on purpose).
  const [guardians, setGuardians] = useState<GuardianWithUser[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Add-guardian form
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  // Server-side add errors (e.g. "no account with that email") render inline,
  // not as a toast — account-less guardian invites are out of scope this tier.
  const [addError, setAddError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadGuardians = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await listGuardians(playerId);
      if (result.success) {
        setGuardians(result.data);
        onGuardiansChange?.(result.data);
      } else {
        setLoadError(result.error);
      }
    } catch (error) {
      console.error("Error loading guardians:", error);
      setLoadError("Failed to load guardians. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [playerId, onGuardiansChange]);

  // Reset the form and (re)load the list each time the dialog opens
  useEffect(() => {
    if (open) {
      setEmail("");
      setRelationship("");
      setEmailError(null);
      setAddError(null);
      void loadGuardians();
    }
  }, [open, loadGuardians]);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      setEmailError("Enter a valid email address");
      return;
    }

    setIsSubmitting(true);
    setEmailError(null);
    setAddError(null);

    try {
      const result = await addGuardian({
        playerId,
        email: trimmedEmail,
        relationship: relationship.trim() || undefined,
      });

      if (result.success) {
        showSuccess("Guardian added");
        setEmail("");
        setRelationship("");
        await loadGuardians();
      } else {
        // Friendly server message (no matching account, already linked, ...)
        setAddError(result.error);
      }
    } catch (error) {
      console.error("Error adding guardian:", error);
      setAddError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (guardianId: string) => {
    setRemovingId(guardianId);
    try {
      const result = await removeGuardian({ guardianId });
      if (result.success) {
        showSuccess("Guardian removed");
        setGuardians((prev) => {
          const next = (prev ?? []).filter((g) => g.id !== guardianId);
          onGuardiansChange?.(next);
          return next;
        });
      } else {
        showError(result.error);
      }
    } catch (error) {
      console.error("Error removing guardian:", error);
      showError("An unexpected error occurred. Please try again.");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Guardians — {playerName}</DialogTitle>

      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Guardians can view {playerName}&apos;s schedule and RSVP on their
          behalf.
        </Typography>

        {/* Current guardians */}
        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={28} aria-label="Loading guardians" />
          </Box>
        ) : loadError ? (
          <Alert
            severity="error"
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => void loadGuardians()}
              >
                Retry
              </Button>
            }
          >
            {loadError}
          </Alert>
        ) : guardians && guardians.length > 0 ? (
          <List disablePadding>
            {guardians.map((guardian) => (
              <ListItem
                key={guardian.id}
                disableGutters
                secondaryAction={
                  <IconButton
                    edge="end"
                    aria-label={`Remove guardian ${guardian.user.name || guardian.user.email}`}
                    color="error"
                    disabled={removingId === guardian.id}
                    onClick={() => void handleRemove(guardian.id)}
                    sx={{ minWidth: 44, minHeight: 44 }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                }
              >
                <ListItemText
                  primary={
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        flexWrap: "wrap",
                      }}
                    >
                      <Typography variant="body1" component="span">
                        {guardian.user.name || guardian.user.email}
                      </Typography>
                      <Chip
                        size="small"
                        variant="outlined"
                        color={guardian.canRsvp ? "success" : "default"}
                        label={guardian.canRsvp ? "Can RSVP" : "View only"}
                      />
                    </Box>
                  }
                  secondary={[guardian.user.email, guardian.relationship]
                    .filter(Boolean)
                    .join(" · ")}
                />
              </ListItem>
            ))}
          </List>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
            No guardians linked yet. Add a parent or guardian below so they can
            RSVP for {playerName}.
          </Typography>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Add guardian */}
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Add a guardian
        </Typography>

        {addError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {addError}
          </Alert>
        )}

        <Box
          component="form"
          onSubmit={handleAddSubmit}
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailError(null);
              setAddError(null);
            }}
            error={!!emailError}
            helperText={
              emailError || "Must match an existing OpenLeague account"
            }
            required
            fullWidth
            inputProps={{ inputMode: "email" }}
          />

          <TextField
            label="Relationship"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            helperText="Optional — e.g. Mother, Father, Grandparent"
            fullWidth
            inputProps={{ maxLength: 50 }}
          />

          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <Button
              type="submit"
              variant="contained"
              startIcon={<PersonAddIcon />}
              disabled={isSubmitting || !email.trim()}
            >
              {isSubmitting ? "Adding..." : "Add Guardian"}
            </Button>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
