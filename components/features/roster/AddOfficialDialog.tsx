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
  MenuItem,
  Checkbox,
  FormControlLabel,
  Typography,
} from "@mui/material";
import {
  createTeamOfficial,
  updateTeamOfficial,
} from "@/lib/actions/team-officials";
import {
  createTeamOfficialSchema,
  TEAM_OFFICIAL_ROLES,
  TEAM_OFFICIAL_ROLE_LABELS,
  type TeamOfficialRoleValue,
} from "@/lib/utils/validation";
import { useToast } from "@/components/ui/Toast";
import type { TeamOfficial } from "@/types/roster";
import type { z } from "zod";

type AddOfficialDialogProps = {
  open: boolean;
  onClose: () => void;
  teamId: string;
  /** When set, the dialog edits this official instead of creating one. */
  official?: TeamOfficial | null;
};

type OfficialFormState = {
  name: string;
  email: string;
  role: TeamOfficialRoleValue;
  roleDetail: string;
  grantTeamAdmin: boolean;
};

export default function AddOfficialDialog({
  open,
  onClose,
  teamId,
  official,
}: AddOfficialDialogProps) {
  const isEditing = !!official;
  const { showSuccess, showError } = useToast();

  const [formData, setFormData] = useState<OfficialFormState>({
    name: "",
    email: "",
    role: "HEAD_COACH",
    roleDetail: "",
    grantTeamAdmin: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when dialog opens/closes or official changes
  useEffect(() => {
    if (open) {
      setFormData({
        name: official?.name || "",
        email: official?.email || "",
        role: official?.role || "HEAD_COACH",
        roleDetail: official?.roleDetail || "",
        grantTeamAdmin: false,
      });
      setErrors({});
    }
  }, [open, official]);

  const emailSet = formData.email.trim().length > 0;

  const clearError = (field: string) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleTextChange =
    (field: "name" | "email" | "roleDetail") =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({ ...prev, [field]: e.target.value }));
      clearError(field);
    };

  const buildInput = () => ({
    teamId,
    name: formData.name,
    email: formData.email,
    role: formData.role,
    // Detail is only surfaced for OTHER; drop stale values after a role change
    roleDetail: formData.role === "OTHER" ? formData.roleDetail : "",
    // The checkbox is hidden without an email — never submit a stale true
    grantTeamAdmin: emailSet && formData.grantTeamAdmin,
  });

  const applyIssues = (issues: z.ZodIssue[]) => {
    const fieldErrors: Record<string, string> = {};
    issues.forEach((issue) => {
      if (issue.path.length > 0) {
        fieldErrors[String(issue.path[0])] = issue.message;
      }
    });
    setErrors(fieldErrors);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrors({});

    const input = buildInput();

    // Client-side validation (create and update share the base fields)
    const validationResult = createTeamOfficialSchema.safeParse(input);
    if (!validationResult.success) {
      applyIssues(validationResult.error.issues);
      setIsSubmitting(false);
      return;
    }

    try {
      const result = isEditing
        ? await updateTeamOfficial({ ...input, officialId: official.id })
        : await createTeamOfficial(input);

      if (!result.success) {
        const issues = result.details as z.ZodIssue[] | undefined;
        if (issues && issues.length > 0) {
          applyIssues(issues);
        } else {
          showError(result.error);
        }
      } else {
        showSuccess(
          isEditing ? "Official updated successfully" : "Official added successfully"
        );
        // revalidatePath in server action handles the update
        onClose();
      }
    } catch (error) {
      console.error("Error submitting official form:", error);
      showError("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
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
      <DialogTitle>{isEditing ? "Edit Official" : "Add Official"}</DialogTitle>

      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          {/* Name */}
          <TextField
            label="Name"
            value={formData.name}
            onChange={handleTextChange("name")}
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
            onChange={handleTextChange("email")}
            error={!!errors.email}
            helperText={errors.email || "Links to their account if they have one"}
            fullWidth
            inputProps={{ inputMode: "email" }}
          />

          {/* Role */}
          <TextField
            label="Role"
            select
            value={formData.role}
            onChange={(e) => {
              setFormData((prev) => ({
                ...prev,
                role: e.target.value as TeamOfficialRoleValue,
              }));
              clearError("role");
              clearError("roleDetail");
            }}
            error={!!errors.role}
            helperText={errors.role}
            required
            fullWidth
          >
            {TEAM_OFFICIAL_ROLES.map((role) => (
              <MenuItem key={role} value={role}>
                {TEAM_OFFICIAL_ROLE_LABELS[role]}
              </MenuItem>
            ))}
          </TextField>

          {/* Role detail — required when role is OTHER */}
          {formData.role === "OTHER" && (
            <TextField
              label="Role description"
              value={formData.roleDetail}
              onChange={handleTextChange("roleDetail")}
              error={!!errors.roleDetail}
              helperText={
                errors.roleDetail || "Describe the role, e.g. Equipment Manager"
              }
              required
              fullWidth
              inputProps={{ maxLength: 100 }}
            />
          )}

          {/* Team admin grant — only meaningful with an email */}
          {emailSet && (
            <Box>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.grantTeamAdmin}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        grantTeamAdmin: e.target.checked,
                      }))
                    }
                  />
                }
                label="Also grant team admin access"
              />
              <Typography variant="caption" color="text.secondary" display="block">
                Permissions are separate from the title above. This grants team
                management access and requires the email to match an existing
                account. Leaving it unchecked does not revoke existing access.
              </Typography>
            </Box>
          )}
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
            !formData.name.trim() ||
            (formData.role === "OTHER" && !formData.roleDetail.trim()) ||
            Object.keys(errors).length > 0
          }
        >
          {isSubmitting ? "Saving..." : isEditing ? "Update" : "Add Official"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
