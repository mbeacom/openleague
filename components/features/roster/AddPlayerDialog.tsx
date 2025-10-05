"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Snackbar,
  Alert,
} from "@mui/material";
import { addPlayer, updatePlayer } from "@/lib/actions/roster";
import type { AddPlayerInput } from "@/lib/actions/roster";
import { useRouter } from "next/navigation";

type Player = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
};

type AddPlayerDialogProps = {
  open: boolean;
  onClose: () => void;
  teamId: string;
  player?: Player | null;
};

export default function AddPlayerDialog({
  open,
  onClose,
  teamId,
  player,
}: AddPlayerDialogProps) {
  const router = useRouter();
  const isEditing = !!player;

  const [formData, setFormData] = useState<AddPlayerInput>({
    name: "",
    email: "",
    phone: "",
    emergencyContact: "",
    emergencyPhone: "",
    teamId,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({
    open: false,
    message: "",
    severity: "success",
  });

  // Reset form when dialog opens/closes or player changes
  useEffect(() => {
    if (open) {
      if (player) {
        setFormData({
          name: player.name,
          email: player.email || "",
          phone: player.phone || "",
          emergencyContact: player.emergencyContact || "",
          emergencyPhone: player.emergencyPhone || "",
          teamId,
        });
      } else {
        setFormData({
          name: "",
          email: "",
          phone: "",
          emergencyContact: "",
          emergencyPhone: "",
          teamId,
        });
      }
      setErrors({});
    }
  }, [open, player, teamId]);

  const handleChange = (field: keyof AddPlayerInput) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: e.target.value,
    }));
    // Clear error for this field
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrors({});

    try {
      const result = isEditing
        ? await updatePlayer({ ...formData, id: player.id })
        : await addPlayer(formData);

      if (result.error) {
        if (result.details) {
          // Zod validation errors
          const fieldErrors: Record<string, string> = {};
          result.details.forEach((error) => {
            if (error.path && error.path.length > 0) {
              const fieldName = String(error.path[0]);
              fieldErrors[fieldName] = error.message;
            }
          });
          setErrors(fieldErrors);
        } else {
          // General error
          setSnackbar({
            open: true,
            message: result.error,
            severity: "error",
          });
        }
      } else {
        // Success
        setSnackbar({
          open: true,
          message: isEditing
            ? "Player updated successfully"
            : "Player added successfully",
          severity: "success",
        });
        router.refresh();
        onClose();
      }
    } catch {
      setSnackbar({
        open: true,
        message: "An unexpected error occurred",
        severity: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSnackbarClose = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          component: "form",
          onSubmit: handleSubmit,
        }}
      >
        <DialogTitle>
          {isEditing ? "Edit Player" : "Add Player"}
        </DialogTitle>

        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            {/* Name */}
            <TextField
              label="Name"
              value={formData.name}
              onChange={handleChange("name")}
              error={!!errors.name}
              helperText={errors.name}
              required
              fullWidth
              autoFocus
            />

            {/* Email */}
            <TextField
              label="Email"
              type="email"
              value={formData.email}
              onChange={handleChange("email")}
              error={!!errors.email}
              helperText={errors.email}
              fullWidth
            />

            {/* Phone */}
            <TextField
              label="Phone"
              type="tel"
              value={formData.phone}
              onChange={handleChange("phone")}
              error={!!errors.phone}
              helperText={errors.phone}
              fullWidth
            />

            {/* Emergency Contact */}
            <TextField
              label="Emergency Contact"
              value={formData.emergencyContact}
              onChange={handleChange("emergencyContact")}
              error={!!errors.emergencyContact}
              helperText={errors.emergencyContact}
              fullWidth
            />

            {/* Emergency Phone */}
            <TextField
              label="Emergency Phone"
              type="tel"
              value={formData.emergencyPhone}
              onChange={handleChange("emergencyPhone")}
              error={!!errors.emergencyPhone}
              helperText={errors.emergencyPhone}
              fullWidth
            />
          </Box>
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting || !formData.name}
          >
            {isSubmitting
              ? "Saving..."
              : isEditing
              ? "Update"
              : "Add Player"}
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
