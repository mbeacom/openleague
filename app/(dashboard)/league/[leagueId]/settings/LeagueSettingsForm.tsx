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
import { updateLeagueSettings } from "@/lib/actions/league";
import {
  updateLeagueSettingsSchema,
  SPORTS,
  SPORT_LABELS,
  FEATURED_SPORTS,
  type SportValue,
} from "@/lib/utils/validation";

interface LeagueSettingsFormProps {
  league: {
    id: string;
    name: string;
    sport: SportValue;
    contactEmail: string;
    contactPhone: string | null;
  };
}

type FormData = {
  name: string;
  sport: SportValue;
  contactEmail: string;
  contactPhone: string;
};

type FieldErrors = Partial<Record<keyof FormData, string>>;

export default function LeagueSettingsForm({ league }: LeagueSettingsFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<FormData>({
    name: league.name,
    sport: league.sport,
    contactEmail: league.contactEmail,
    contactPhone: league.contactPhone ?? "",
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
      id: league.id,
      name: formData.name,
      sport: formData.sport,
      contactEmail: formData.contactEmail,
      contactPhone: formData.contactPhone || undefined,
    };

    const validation = updateLeagueSettingsSchema.safeParse(input);
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
      const result = await updateLeagueSettings(input);

      if (result.success) {
        setSuccess(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch (err) {
      console.error("Unexpected error updating league settings:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
            League settings saved.
          </Alert>
        )}

        <TextField
          label="League / Association Name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
          fullWidth
          disabled={isSubmitting}
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
          label="Contact Email"
          name="contactEmail"
          type="email"
          value={formData.contactEmail}
          onChange={handleChange}
          required
          fullWidth
          disabled={isSubmitting}
          error={!!fieldErrors.contactEmail}
          helperText={
            fieldErrors.contactEmail ??
            "Used for league-wide communications and member inquiries"
          }
        />

        <TextField
          label="Contact Phone"
          name="contactPhone"
          type="tel"
          value={formData.contactPhone}
          onChange={handleChange}
          fullWidth
          disabled={isSubmitting}
          error={!!fieldErrors.contactPhone}
          helperText={fieldErrors.contactPhone ?? "Optional"}
        />

        <Box>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={
              isSubmitting ||
              !formData.name ||
              !formData.contactEmail ||
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
      </Box>
    </Paper>
  );
}
