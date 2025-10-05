"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
} from "@mui/material";
import { createTeam } from "@/lib/actions/team";
import { createTeamSchema, type CreateTeamInput } from "@/lib/utils/validation";

export default function CreateTeamForm() {
  const router = useRouter();
  const [formData, setFormData] = useState<CreateTeamInput>({
    name: "",
    sport: "",
    season: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CreateTeamInput, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
    // Clear field-level error when user types
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // Client-side validation
    const validation = createTeamSchema.safeParse(formData);
    if (!validation.success) {
      const errors: Partial<Record<keyof CreateTeamInput, string>> = {};
      validation.error.issues.forEach((issue) => {
        const field = issue.path[0] as keyof CreateTeamInput;
        if (field && !errors[field]) {
          errors[field] = issue.message;
        }
      });
      setFieldErrors(errors);
      setError("Please fix the errors below.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await createTeam(formData);

      if (result.success) {
        // Redirect to dashboard after successful creation
        router.push("/");
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        maxWidth: 500,
        width: "100%",
      }}
    >
      <Typography variant="h5" component="h2" gutterBottom>
        Create Your Team
      </Typography>

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <TextField
        label="Team Name"
        name="name"
        value={formData.name}
        onChange={handleChange}
        required
        fullWidth
        disabled={isSubmitting}
        placeholder="e.g., Thunder FC"
        error={!!fieldErrors.name}
        helperText={fieldErrors.name}
      />

      <TextField
        label="Sport"
        name="sport"
        value={formData.sport}
        onChange={handleChange}
        required
        fullWidth
        disabled={isSubmitting}
        placeholder="e.g., Soccer, Basketball, Baseball"
        error={!!fieldErrors.sport}
        helperText={fieldErrors.sport}
      />

      <TextField
        label="Season"
        name="season"
        value={formData.season}
        onChange={handleChange}
        required
        fullWidth
        disabled={isSubmitting}
        placeholder="e.g., Fall 2025, Spring 2026"
        error={!!fieldErrors.season}
        helperText={fieldErrors.season}
      />

      <Button
        type="submit"
        variant="contained"
        color="primary"
        size="large"
        disabled={isSubmitting}
        sx={{
          mt: 1,
          minHeight: 48, // Ensure 44x44px minimum touch target
        }}
      >
        {isSubmitting ? (
          <>
            <CircularProgress size={20} sx={{ mr: 1 }} color="inherit" />
            Creating...
          </>
        ) : (
          "Create Team"
        )}
      </Button>
    </Box>
  );
}
