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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
} from "@mui/material";
import { addTeamToLeague } from "@/lib/actions/league";
import { addTeamToLeagueSchema, type AddTeamToLeagueInput } from "@/lib/utils/validation";

interface Division {
  id: string;
  name: string;
  ageGroup: string | null;
  skillLevel: string | null;
}

interface CreateLeagueTeamFormProps {
  leagueId: string;
  divisions: Division[];
  onSuccess?: (team: { id: string; name: string; sport: string; season: string }) => void;
}

export default function CreateLeagueTeamForm({ 
  leagueId, 
  divisions, 
  onSuccess 
}: CreateLeagueTeamFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<Omit<AddTeamToLeagueInput, 'leagueId'>>({
    name: "",
    sport: "",
    season: "",
    divisionId: undefined,
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof AddTeamToLeagueInput, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
    // Clear field-level error when user types
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ 
      ...prev, 
      [name]: value === "" ? undefined : value 
    }));
    setError(null);
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    // Validate individual field on blur
    if (name === 'name' || name === 'sport' || name === 'season') {
      const fieldSchema = addTeamToLeagueSchema.shape[name];
      const validationResult = fieldSchema.safeParse(value);

      if (validationResult.success) {
        // Clear error if validation passes
        setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
      } else {
        // Set error if validation fails
        const fieldError = validationResult.error.issues[0]?.message;
        if (fieldError) {
          setFieldErrors((prev) => ({ ...prev, [name]: fieldError }));
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const fullFormData: AddTeamToLeagueInput = {
      ...formData,
      leagueId,
    };

    // Client-side validation
    const validation = addTeamToLeagueSchema.safeParse(fullFormData);
    if (!validation.success) {
      const errors: Partial<Record<keyof AddTeamToLeagueInput, string>> = {};
      validation.error.issues.forEach((issue) => {
        const field = issue.path[0] as keyof AddTeamToLeagueInput;
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
      const result = await addTeamToLeague(fullFormData);

      if (result.success) {
        if (onSuccess) {
          onSuccess(result.data);
        } else {
          // Redirect to league teams page after successful creation
          router.push(`/league/${leagueId}/teams`);
        }
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
        Add Team to League
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
        placeholder="e.g., Thunder FC"
        error={!!fieldErrors.name}
        helperText={fieldErrors.name}
      />

      <TextField
        label="Sport"
        name="sport"
        value={formData.sport}
        onChange={handleChange}
        onBlur={handleBlur}
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
        onBlur={handleBlur}
        required
        fullWidth
        disabled={isSubmitting}
        placeholder="e.g., Fall 2025, Spring 2026"
        error={!!fieldErrors.season}
        helperText={fieldErrors.season}
      />

      <FormControl fullWidth error={!!fieldErrors.divisionId}>
        <InputLabel>Division (Optional)</InputLabel>
        <Select
          value={formData.divisionId || ""}
          onChange={(e) => handleSelectChange("divisionId", e.target.value)}
          label="Division (Optional)"
          disabled={isSubmitting}
        >
          <MenuItem value="">
            <em>No Division</em>
          </MenuItem>
          {divisions.map((division) => (
            <MenuItem key={division.id} value={division.id}>
              {division.name}
              {(division.ageGroup || division.skillLevel) && (
                <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                  ({[division.ageGroup, division.skillLevel].filter(Boolean).join(", ")})
                </Typography>
              )}
            </MenuItem>
          ))}
        </Select>
        {fieldErrors.divisionId && (
          <FormHelperText>{fieldErrors.divisionId}</FormHelperText>
        )}
      </FormControl>

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
          Object.keys(fieldErrors).some(key => fieldErrors[key as keyof AddTeamToLeagueInput])
        }
        sx={{ mt: 1 }}
      >
        {isSubmitting ? (
          <>
            <CircularProgress size={20} sx={{ mr: 1 }} color="inherit" />
            Adding Team...
          </>
        ) : (
          "Add Team"
        )}
      </Button>
    </Box>
  );
}