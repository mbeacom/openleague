"use client";

import { useState, useEffect, useMemo } from "react";
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
  SelectChangeEvent,
} from "@mui/material";
import ConflictWarning from "./ConflictWarning";
import {
  createInterTeamGame,
  type CreateInterTeamGameInput,
} from "@/lib/actions/events";
import { createInterTeamGameSchema } from "@/lib/utils/validation";
import { formatDateTimeLocal } from "@/lib/utils/date";

interface InterTeamGameFormProps {
  leagueId: string;
  teams: Array<{
    id: string;
    name: string;
    division?: {
      id: string;
      name: string;
    } | null;
  }>;
}

interface SchedulingConflict {
  teamId: string;
  teamName: string;
  conflictingEvent: {
    id: string;
    title: string;
    startAt: Date;
  };
}

interface TimeSlotSuggestion {
  startAt: Date;
  reason: string;
}

export default function InterTeamGameForm({
  leagueId,
  teams,
}: InterTeamGameFormProps) {
  const router = useRouter();

  const [formData, setFormData] = useState<CreateInterTeamGameInput>({
    title: "",
    startAt: new Date(),
    location: "",
    notes: "",
    leagueId,
    homeTeamId: "",
    awayTeamId: "",
    overrideConflicts: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<SchedulingConflict[]>([]);
  const [suggestions, setSuggestions] = useState<TimeSlotSuggestion[]>([]);
  const [canOverride, setCanOverride] = useState(false);
  const [isOverriding, setIsOverriding] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof CreateInterTeamGameInput, string>>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-generate title when teams are selected
  useEffect(() => {
    if (formData.homeTeamId && formData.awayTeamId) {
      const homeTeam = teams.find(t => t.id === formData.homeTeamId);
      const awayTeam = teams.find(t => t.id === formData.awayTeamId);

      if (homeTeam && awayTeam) {
        setFormData(prev => ({
          ...prev,
          title: `${homeTeam.name} vs ${awayTeam.name}`,
        }));
      }
    }
  }, [formData.homeTeamId, formData.awayTeamId, teams]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setConflicts([]);
    setSuggestions([]);
    setCanOverride(false);
    setIsOverriding(false);
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSelectChange = (e: SelectChangeEvent) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setConflicts([]);
    setSuggestions([]);
    setCanOverride(false);
    setIsOverriding(false);
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setFormData((prev) => ({ ...prev, startAt: new Date(value) }));
    setError(null);
    setConflicts([]);
    setSuggestions([]);
    setCanOverride(false);
    setIsOverriding(false);
    setFieldErrors((prev) => ({ ...prev, startAt: undefined }));
  };

  const handleSuggestionSelect = (suggestion: TimeSlotSuggestion) => {
    setFormData((prev) => ({ ...prev, startAt: suggestion.startAt }));
    setConflicts([]);
    setSuggestions([]);
    setCanOverride(false);
    setIsOverriding(false);
    setError(null);
  };

  const handleOverrideConflicts = async () => {
    setIsOverriding(true);

    try {
      const result = await createInterTeamGame({
        ...formData,
        overrideConflicts: true,
      });

      if (result.success) {
        router.push(`/league/${leagueId}/schedule`);
      } else {
        setError(result.error);
      }
    } catch (err) {
      console.error("Error overriding conflicts:", err);
      setError("Failed to override conflicts. Please try again.");
    } finally {
      setIsOverriding(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setConflicts([]);
    setFieldErrors({});

    // Client-side validation
    const validation = createInterTeamGameSchema.safeParse(formData);
    if (!validation.success) {
      const errors: Partial<Record<keyof CreateInterTeamGameInput, string>> = {};
      validation.error.issues.forEach((issue) => {
        const field = issue.path[0] as keyof CreateInterTeamGameInput;
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
      const result = await createInterTeamGame(formData);

      if (result.success) {
        // Redirect to league schedule after successful creation
        router.push(`/league/${leagueId}/schedule`);
      } else {
        setError(result.error);

        // Handle scheduling conflicts
        if (result.details && typeof result.details === 'object' && 'conflicts' in result.details) {
          const details = result.details as {
            conflicts: SchedulingConflict[];
            suggestions?: TimeSlotSuggestion[];
            canOverride?: boolean;
          };
          setConflicts(details.conflicts);
          setSuggestions(details.suggestions || []);
          setCanOverride(details.canOverride || false);
        }
      }
    } catch (err) {
      console.error("An unexpected error occurred during game creation:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTeamDisplayName = (team: { name: string; division?: { name: string } | null }) => {
    return team.division ? `${team.name} (${team.division.name})` : team.name;
  };

  const availableAwayTeams = useMemo(
    () => teams.filter(team => team.id !== formData.homeTeamId),
    [teams, formData.homeTeamId]
  );

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        maxWidth: 600,
        width: "100%",
      }}
    >
      <Typography variant="h5" component="h2" gutterBottom>
        Schedule Inter-Team Game
      </Typography>

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {conflicts.length > 0 && (
        <ConflictWarning
          conflicts={conflicts}
          suggestions={suggestions}
          canOverride={canOverride}
          onSuggestionSelect={handleSuggestionSelect}
          onOverrideConflicts={handleOverrideConflicts}
          isOverriding={isOverriding}
        />
      )}

      <FormControl fullWidth error={!!fieldErrors.homeTeamId}>
        <InputLabel id="home-team-label">Home Team</InputLabel>
        <Select
          labelId="home-team-label"
          name="homeTeamId"
          value={formData.homeTeamId}
          onChange={handleSelectChange}
          label="Home Team"
          disabled={isSubmitting}
        >
          {teams.map(team => (
            <MenuItem key={team.id} value={team.id}>
              {getTeamDisplayName(team)}
            </MenuItem>
          ))}
        </Select>
        {fieldErrors.homeTeamId && (
          <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.75 }}>
            {fieldErrors.homeTeamId}
          </Typography>
        )}
      </FormControl>

      <FormControl fullWidth error={!!fieldErrors.awayTeamId}>
        <InputLabel id="away-team-label">Away Team</InputLabel>
        <Select
          labelId="away-team-label"
          name="awayTeamId"
          value={formData.awayTeamId}
          onChange={handleSelectChange}
          label="Away Team"
          disabled={isSubmitting || !formData.homeTeamId}
        >
          {availableAwayTeams.map(team => (
            <MenuItem key={team.id} value={team.id}>
              {getTeamDisplayName(team)}
            </MenuItem>
          ))}
        </Select>
        {fieldErrors.awayTeamId && (
          <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.75 }}>
            {fieldErrors.awayTeamId}
          </Typography>
        )}
      </FormControl>

      <TextField
        label="Game Title"
        name="title"
        value={formData.title}
        onChange={handleChange}
        required
        fullWidth
        disabled={isSubmitting}
        placeholder="e.g., Hawks vs Eagles"
        error={!!fieldErrors.title}
        helperText={fieldErrors.title || "Auto-generated when teams are selected"}
      />

      <TextField
        label="Date & Time"
        name="startAt"
        type="datetime-local"
        value={formatDateTimeLocal(formData.startAt)}
        onChange={handleDateChange}
        required
        fullWidth
        disabled={isSubmitting}
        error={!!fieldErrors.startAt}
        helperText={fieldErrors.startAt || "Select the game date and time"}
        InputLabelProps={{
          shrink: true,
        }}
      />

      <TextField
        label="Location"
        name="location"
        value={formData.location}
        onChange={handleChange}
        required
        fullWidth
        disabled={isSubmitting}
        placeholder="e.g., Main Field, Community Center"
        error={!!fieldErrors.location}
        helperText={fieldErrors.location}
      />

      <TextField
        label="Notes"
        name="notes"
        value={formData.notes}
        onChange={handleChange}
        fullWidth
        multiline
        rows={4}
        disabled={isSubmitting}
        placeholder="Additional information about the game..."
        error={!!fieldErrors.notes}
        helperText={fieldErrors.notes}
      />

      <Button
        type="submit"
        variant="contained"
        color="primary"
        size="large"
        disabled={isSubmitting || (conflicts.length > 0 && !canOverride) || isOverriding}
        sx={{
          mt: 1,
          minHeight: 48,
        }}
      >
        {isSubmitting ? (
          <>
            <CircularProgress size={20} sx={{ mr: 1 }} color="inherit" />
            Creating Game...
          </>
        ) : (
          "Create Inter-Team Game"
        )}
      </Button>

      {conflicts.length > 0 && !canOverride && (
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
          Resolve conflicts above to enable game creation
        </Typography>
      )}
    </Box>
  );
}