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
  MenuItem,
} from "@mui/material";
import { createLeague } from "@/lib/actions/league";
import {
  createLeagueSchema,
  SPORTS,
  SPORT_LABELS,
  FEATURED_SPORTS,
  type SportValue,
} from "@/lib/utils/validation";

type FormData = {
  name: string;
  sport: SportValue;
  contactEmail: string;
  contactPhone: string;
};

type FieldErrors = Partial<Record<keyof FormData, string>>;

export default function CreateLeagueOnboardingForm() {
  const router = useRouter();
  const [formData, setFormData] = useState<FormData>({
    name: "",
    sport: "HOCKEY",
    contactEmail: "",
    contactPhone: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const validation = createLeagueSchema.safeParse(formData);
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
      const result = await createLeague({
        name: formData.name,
        sport: formData.sport,
        contactEmail: formData.contactEmail,
        contactPhone: formData.contactPhone || undefined,
      });

      if (result.success) {
        router.push(`/league/${result.data.id}/dashboard`);
      } else {
        setError(result.error);
      }
    } catch (err) {
      console.error("Unexpected error during league creation:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const orderedSports: SportValue[] = [
    ...FEATURED_SPORTS,
    ...SPORTS.filter((s) => !FEATURED_SPORTS.includes(s)),
  ];

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
      <Box>
        <Typography variant="h5" component="h2" fontWeight={700} gutterBottom>
          Create Your League or Association
        </Typography>
        <Typography variant="body2" color="text.secondary">
          You&apos;ll be set up as the league admin. You can add divisions and
          teams after creating your league.
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
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
        placeholder="e.g., Northside Hockey Association"
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
        {orderedSports.map((sport, index) => [
          index === FEATURED_SPORTS.length && (
            <MenuItem key="divider" disabled divider sx={{ opacity: 0 }} />
          ),
          <MenuItem key={sport} value={sport}>
            {SPORT_LABELS[sport]}
          </MenuItem>,
        ])}
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
        placeholder="admin@yourleague.com"
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
        placeholder="e.g., (555) 123-4567"
        error={!!fieldErrors.contactPhone}
        helperText={fieldErrors.contactPhone ?? "Optional"}
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
          !formData.contactEmail
        }
        sx={{ mt: 1 }}
      >
        {isSubmitting ? (
          <>
            <CircularProgress size={20} sx={{ mr: 1 }} color="inherit" />
            Creating...
          </>
        ) : (
          "Create League"
        )}
      </Button>
    </Box>
  );
}
