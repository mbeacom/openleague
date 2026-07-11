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
} from "@mui/material";
import { addPlayer, updatePlayer } from "@/lib/actions/roster";
import { addPlayerSchema, pickField, type AddPlayerInput } from "@/lib/utils/validation";
import { useToast } from "@/components/ui/Toast";
import type { Player } from "@/types/roster";
import type { z } from "zod";

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
  const isEditing = !!player;
  const { showSuccess, showError, showWarning } = useToast();

  const [formData, setFormData] = useState<AddPlayerInput>({
    name: "",
    email: "",
    phone: "",
    emergencyContact: "",
    emergencyPhone: "",
    teamId,
    jerseyNumber: null,
    position: "",
    usahMemberId: null,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when dialog opens/closes or player changes
  useEffect(() => {
    if (open) {
      setFormData({
        name: player?.name || "",
        email: player?.email || "",
        phone: player?.phone || "",
        emergencyContact: player?.emergencyContact || "",
        emergencyPhone: player?.emergencyPhone || "",
        teamId,
        jerseyNumber: player?.jerseyNumber ?? null,
        position: player?.position || "",
        usahMemberId: player?.usahMemberId ?? null,
      });
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

  const handleBlur = (field: keyof AddPlayerInput) => (
    e: React.FocusEvent<HTMLInputElement>
  ) => {
    const { value } = e.target;

    // Validate individual field on blur
    if (Object.prototype.hasOwnProperty.call(addPlayerSchema.shape, field)) {
      const fieldSchema = pickField(addPlayerSchema, field);
      const validationResult = fieldSchema.safeParse({ [field]: value });

      if (validationResult.success) {
        // Clear error if validation passes
        if (errors[field]) {
          setErrors((prev) => {
            const newErrors = { ...prev };
            delete newErrors[field];
            return newErrors;
          });
        }
      } else {
        // Set error if validation fails
        const fieldError = validationResult.error.issues[0]?.message;
        if (fieldError) {
          setErrors((prev) => ({ ...prev, [field]: fieldError }));
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrors({});

    // Client-side validation
    const validationResult = addPlayerSchema.safeParse(formData);
    if (!validationResult.success) {
      const fieldErrors: Record<string, string> = {};
      validationResult.error.issues.forEach((issue) => {
        if (issue.path.length > 0) {
          fieldErrors[String(issue.path[0])] = issue.message;
        }
      });
      setErrors(fieldErrors);
      setIsSubmitting(false);
      return;
    }

    try {
      const result = isEditing
        ? await updatePlayer({ ...formData, id: player.id })
        : await addPlayer(formData);

      if (result.error) {
        if (result.details) {
          // Zod validation errors
          const fieldErrors: Record<string, string> = {};
          result.details.forEach((error: z.ZodIssue) => {
            if (error.path && error.path.length > 0) {
              const fieldName = String(error.path[0]);
              fieldErrors[fieldName] = error.message;
            }
          });
          setErrors(fieldErrors);
        } else {
          // General error
          showError(result.error);
        }
      } else {
        // Success — show warning if duplicate jersey number
        if ("warning" in result && result.warning) {
          showWarning(result.warning);
        }
        showSuccess(
          isEditing
            ? "Player updated successfully"
            : "Player added successfully"
        );
        // revalidatePath in server action handles the update
        onClose();
      }
    } catch (error) {
      console.error("Error submitting player form:", error);
      showError("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
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
              onBlur={handleBlur("name")}
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
              onBlur={handleBlur("email")}
              error={!!errors.email}
              helperText={errors.email}
              fullWidth
              inputProps={{
                inputMode: 'email',
              }}
            />

            {/* Phone */}
            <TextField
              label="Phone"
              type="tel"
              value={formData.phone}
              onChange={handleChange("phone")}
              onBlur={handleBlur("phone")}
              error={!!errors.phone}
              helperText={errors.phone}
              fullWidth
              inputProps={{
                inputMode: 'tel',
              }}
            />

            {/* Emergency Contact */}
            <TextField
              label="Emergency Contact"
              value={formData.emergencyContact}
              onChange={handleChange("emergencyContact")}
              onBlur={handleBlur("emergencyContact")}
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
              onBlur={handleBlur("emergencyPhone")}
              error={!!errors.emergencyPhone}
              helperText={errors.emergencyPhone}
              fullWidth
              inputProps={{
                inputMode: 'tel',
              }}
            />

            {/* Jersey Number */}
            <TextField
              label="Jersey Number"
              type="number"
              value={formData.jerseyNumber ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "") {
                  setFormData((prev) => ({ ...prev, jerseyNumber: null }));
                } else {
                  const num = Number(val);
                  if (!Number.isNaN(num) && Number.isInteger(num)) {
                    setFormData((prev) => ({ ...prev, jerseyNumber: num }));
                  }
                }
                if (errors.jerseyNumber) {
                  setErrors((prev) => { const n = { ...prev }; delete n.jerseyNumber; return n; });
                }
              }}
              error={!!errors.jerseyNumber}
              helperText={errors.jerseyNumber || "Optional — 1 to 99"}
              fullWidth
              inputProps={{ min: 1, max: 99, step: 1 }}
            />

            {/* Position */}
            <TextField
              label="Position"
              value={formData.position ?? ""}
              onChange={handleChange("position")}
              onBlur={handleBlur("position")}
              error={!!errors.position}
              helperText={errors.position || "Optional — e.g. Center, Goalie, Midfielder"}
              fullWidth
              inputProps={{ maxLength: 50 }}
            />

            {/* USA Hockey Member ID */}
            <TextField
              label="USA Hockey Member ID"
              value={formData.usahMemberId ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                setFormData((prev) => ({
                  ...prev,
                  usahMemberId: val === "" ? null : val,
                }));
                if (errors.usahMemberId) {
                  setErrors((prev) => { const n = { ...prev }; delete n.usahMemberId; return n; });
                }
              }}
              onBlur={handleBlur("usahMemberId")}
              error={!!errors.usahMemberId}
              helperText={errors.usahMemberId || "Optional — alphanumeric, up to 20 characters"}
              fullWidth
              inputProps={{ maxLength: 20 }}
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
            disabled={
              isSubmitting ||
              !formData.name ||
              Object.keys(errors).some(key => errors[key])
            }
          >
            {isSubmitting
              ? "Saving..."
              : isEditing
                ? "Update"
                : "Add Player"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
