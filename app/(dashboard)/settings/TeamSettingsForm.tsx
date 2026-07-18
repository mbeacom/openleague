"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  MenuItem,
  Paper,
  TextField,
} from "@mui/material";
import { updateTeam } from "@/lib/actions/team";
import {
  updateTeamSchema,
  SPORTS,
  SPORT_LABELS,
  FEATURED_SPORTS,
  type SportValue,
} from "@/lib/utils/validation";

interface TeamSettingsFormProps {
  team: {
    id: string;
    name: string;
    sport: SportValue;
    season: string;
  };
  canEdit: boolean;
}

type FormData = {
  name: string;
  sport: SportValue;
  season: string;
};

type FieldErrors = Partial<Record<keyof FormData, string>>;

export default function TeamSettingsForm({ team, canEdit }: TeamSettingsFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<FormData>({
    name: team.name,
    sport: team.sport,
    season: team.season,
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setSuccess(false);
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setFieldErrors({});

    const input = {
      id: team.id,
      name: formData.name,
      sport: formData.sport,
      season: formData.season,
    };

    const validation = updateTeamSchema.safeParse(input);
    if (!validation.success) {
      const errors: FieldErrors = {};
      validation.error.issues.forEach((issue) => {
        const field = issue.path[0] as keyof FormData;
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
      const result = await updateTeam(input);

      if (result.success) {
        setSuccess(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch (err) {
      console.error("Unexpected error updating team settings:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const disabled = isSubmitting || !canEdit;

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 500 }}
      >
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" onClose={() => setSuccess(false)}>
            Team settings saved.
          </Alert>
        )}

        <TextField
          label="Team Name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
          fullWidth
          disabled={disabled}
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
          disabled={disabled}
          error={!!fieldErrors.sport}
          helperText={fieldErrors.sport}
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
          required
          fullWidth
          disabled={disabled}
          error={!!fieldErrors.season}
          helperText={fieldErrors.season ?? 'e.g. "Fall 2026" or "2026 Spring"'}
        />

        {canEdit && (
          <Box>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={
                isSubmitting ||
                !formData.name ||
                !formData.season ||
                Object.values(fieldErrors).some((err) => !!err)
              }
              sx={{ minHeight: 44 }}
            >
              {isSubmitting ? (
                <>
                  <CircularProgress size={20} sx={{ mr: 1 }} color="inherit" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </Box>
        )}
      </Box>
    </Paper>
  );
}
