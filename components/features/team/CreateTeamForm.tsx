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
  Divider,
  MenuItem,
} from "@mui/material";
import { createTeam } from "@/lib/actions/team";
import {
  createTeamSchema,
  pickField,
  type CreateTeamInput,
  SPORTS,
  SPORT_LABELS,
  FEATURED_SPORTS,
} from "@/lib/utils/validation";
import { trackTeam } from "@/lib/analytics/umami";

export default function CreateTeamForm() {
  const router = useRouter();
  const [formData, setFormData] = useState<CreateTeamInput>({
    name: "",
    sport: "HOCKEY",
    season: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CreateTeamInput, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    if (name === "name" || name === "season") {
      const fieldSchema = pickField(createTeamSchema, name);
      const validationResult = fieldSchema.safeParse({ [name]: value });

      if (!validationResult.success) {
        const fieldError = validationResult.error.issues[0]?.message;
        if (fieldError) {
          setFieldErrors((prev) => ({ ...prev, [name]: fieldError }));
        }
      } else {
        setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

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
        trackTeam("create", {
          sport: formData.sport,
          season: formData.season,
        });
        router.push("/");
      } else {
        setError(result.error);
      }
    } catch (err) {
      console.error("An unexpected error occurred during team creation:", err);
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
        onBlur={handleBlur}
        required
        fullWidth
        disabled={isSubmitting}
        placeholder="e.g., Northside Wolves"
        error={!!fieldErrors.name}
        helperText={fieldErrors.name}
      />

      <TextField
        select
        label="Sport"
        name="sport"
        value={formData.sport}
        onChange={handleChange}
        required
        fullWidth
        disabled={isSubmitting}
        error={!!fieldErrors.sport}
        helperText={fieldErrors.sport ?? "Select the sport your team plays"}
      >
        {FEATURED_SPORTS.map((sport) => (
          <MenuItem key={sport} value={sport}>
            {SPORT_LABELS[sport]}
          </MenuItem>
        ))}
        <Divider />
        {SPORTS.filter((s) => !FEATURED_SPORTS.includes(s)).map((sport) => (
          <MenuItem key={sport} value={sport}>
            {SPORT_LABELS[sport]}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        label="Season"
        name="season"
        value={formData.season}
        onChange={handleChange}
        onBlur={handleBlur}
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
        disabled={
          isSubmitting ||
          !formData.name ||
          !formData.sport ||
          !formData.season ||
          Object.keys(fieldErrors).some(
            (key) => fieldErrors[key as keyof CreateTeamInput]
          )
        }
        sx={{ mt: 1 }}
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
