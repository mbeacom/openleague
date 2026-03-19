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
  Stepper,
  Step,
  StepLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  type SelectChangeEvent,
  Chip,
  Stack,
  Checkbox,
  FormControlLabel,
} from "@mui/material";
import { createGameSchedule } from "@/lib/actions/game-schedules";

interface ScheduleBuilderProps {
  teams: Array<{ id: string; name: string }>;
  venues: Array<{ id: string; name: string; surfaceType: string }>;
  leagueId?: string;
  teamId?: string;
}

const steps = ["Schedule Info", "Select Teams", "Venues & Times", "Review"];

const dayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function ScheduleBuilder({
  teams,
  venues,
  leagueId,
  teamId,
}: ScheduleBuilderProps) {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    seasonName: "",
    startDate: "",
    endDate: "",
    roundRobin: true,
    rounds: 1,
    notes: "",
    teamIds: [] as string[],
    venueIds: [] as string[],
    dayOfWeek: "" as string,
    preferredStartTime: "19:00",
    gameDurationMinutes: 90,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    const parsed = type === "number" ? (value === "" ? "" : Number(value)) : value;
    setFormData((prev) => ({ ...prev, [name]: parsed }));
    setError(null);
  };

  const handleSelectChange = (e: SelectChangeEvent) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const toggleTeam = (teamId: string) => {
    setFormData((prev) => ({
      ...prev,
      teamIds: prev.teamIds.includes(teamId)
        ? prev.teamIds.filter((id) => id !== teamId)
        : [...prev.teamIds, teamId],
    }));
  };

  const toggleVenue = (venueId: string) => {
    setFormData((prev) => ({
      ...prev,
      venueIds: prev.venueIds.includes(venueId)
        ? prev.venueIds.filter((id) => id !== venueId)
        : [...prev.venueIds, venueId],
    }));
  };

  const canAdvance = (): boolean => {
    switch (activeStep) {
      case 0:
        return !!formData.name && !!formData.startDate && !!formData.endDate;
      case 1:
        return formData.teamIds.length >= 2;
      case 2:
        return formData.venueIds.length >= 1;
      default:
        return true;
    }
  };

  const totalGames = formData.roundRobin
    ? (formData.teamIds.length * (formData.teamIds.length - 1)) / 2 * formData.rounds
    : 0;

  const handleSubmit = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await createGameSchedule({
        name: formData.name,
        seasonName: formData.seasonName || undefined,
        startDate: new Date(formData.startDate),
        endDate: new Date(formData.endDate),
        roundRobin: formData.roundRobin,
        rounds: formData.rounds,
        notes: formData.notes || undefined,
        leagueId: leagueId || undefined,
        teamId: teamId || undefined,
        teamIds: formData.teamIds,
        venueIds: formData.venueIds,
        dayOfWeek: formData.dayOfWeek ? Number(formData.dayOfWeek) : undefined,
        preferredStartTime: formData.preferredStartTime || undefined,
        gameDurationMinutes: formData.gameDurationMinutes,
      });

      if (result.success) {
        router.push(`/schedules/${result.data.id}`);
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
    <Box sx={{ maxWidth: 700, width: "100%" }}>
      <Typography variant="h5" component="h2" gutterBottom>
        Create Game Schedule
      </Typography>

      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Step 0: Schedule Info */}
      {activeStep === 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            label="Schedule Name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            fullWidth
            placeholder="e.g., Fall 2026 League Schedule"
          />
          <TextField
            label="Season Name (optional)"
            name="seasonName"
            value={formData.seasonName}
            onChange={handleChange}
            fullWidth
            placeholder="e.g., Fall 2026"
          />
          <Box sx={{ display: "flex", gap: 2 }}>
            <TextField
              label="Start Date"
              name="startDate"
              type="date"
              value={formData.startDate}
              onChange={handleChange}
              required
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="End Date"
              name="endDate"
              type="date"
              value={formData.endDate}
              onChange={handleChange}
              required
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>
          <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.roundRobin}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, roundRobin: e.target.checked }))
                  }
                />
              }
              label="Round Robin"
            />
            <TextField
              label="Rounds"
              name="rounds"
              type="number"
              value={formData.rounds}
              onChange={handleChange}
              sx={{ width: 100 }}
              slotProps={{ htmlInput: { min: 1, max: 4 } }}
            />
          </Box>
          <TextField
            label="Notes (optional)"
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            multiline
            rows={2}
            fullWidth
          />
        </Box>
      )}

      {/* Step 1: Select Teams */}
      {activeStep === 1 && (
        <Box>
          <Typography variant="subtitle1" sx={{ mb: 2 }}>
            Select at least 2 teams ({formData.teamIds.length} selected)
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {teams.map((team) => (
              <Chip
                key={team.id}
                label={team.name}
                onClick={() => toggleTeam(team.id)}
                color={formData.teamIds.includes(team.id) ? "primary" : "default"}
                variant={formData.teamIds.includes(team.id) ? "filled" : "outlined"}
                sx={{ fontSize: "0.95rem", py: 2.5 }}
              />
            ))}
          </Stack>
          {formData.teamIds.length >= 2 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              {totalGames} total games will be generated ({formData.rounds} round{formData.rounds > 1 ? "s" : ""})
            </Typography>
          )}
        </Box>
      )}

      {/* Step 2: Venues & Times */}
      {activeStep === 2 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Typography variant="subtitle1">
            Select venues to rotate through ({formData.venueIds.length} selected)
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {venues.map((venue) => (
              <Chip
                key={venue.id}
                label={venue.name}
                onClick={() => toggleVenue(venue.id)}
                color={formData.venueIds.includes(venue.id) ? "primary" : "default"}
                variant={formData.venueIds.includes(venue.id) ? "filled" : "outlined"}
                sx={{ fontSize: "0.95rem", py: 2.5 }}
              />
            ))}
          </Stack>

          {venues.length === 0 && (
            <Alert severity="info">
              No venues available. Add venues first before creating a schedule.
            </Alert>
          )}

          <FormControl fullWidth>
            <InputLabel>Preferred Day of Week</InputLabel>
            <Select
              name="dayOfWeek"
              value={formData.dayOfWeek}
              onChange={handleSelectChange}
              label="Preferred Day of Week"
            >
              <MenuItem value="">Any day</MenuItem>
              {dayLabels.map((label, idx) => (
                <MenuItem key={idx} value={String(idx)}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ display: "flex", gap: 2 }}>
            <TextField
              label="Preferred Start Time"
              name="preferredStartTime"
              type="time"
              value={formData.preferredStartTime}
              onChange={handleChange}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Game Duration (min)"
              name="gameDurationMinutes"
              type="number"
              value={formData.gameDurationMinutes}
              onChange={handleChange}
              fullWidth
              slotProps={{ htmlInput: { min: 30, max: 300 } }}
            />
          </Box>
        </Box>
      )}

      {/* Step 3: Review */}
      {activeStep === 3 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Typography variant="h6">Review Schedule</Typography>

          <Box sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
            <Typography variant="body1">
              <strong>Name:</strong> {formData.name}
            </Typography>
            {formData.seasonName && (
              <Typography variant="body1">
                <strong>Season:</strong> {formData.seasonName}
              </Typography>
            )}
            <Typography variant="body1">
              <strong>Dates:</strong> {formData.startDate} to {formData.endDate}
            </Typography>
            <Typography variant="body1">
              <strong>Teams:</strong> {formData.teamIds.length}
            </Typography>
            <Typography variant="body1">
              <strong>Total Games:</strong> {totalGames}
            </Typography>
            <Typography variant="body1">
              <strong>Venues:</strong> {formData.venueIds.length}
            </Typography>
            {formData.dayOfWeek && (
              <Typography variant="body1">
                <strong>Day:</strong> {dayLabels[Number(formData.dayOfWeek)]}
              </Typography>
            )}
            <Typography variant="body1">
              <strong>Start Time:</strong> {formData.preferredStartTime}
            </Typography>
            <Typography variant="body1">
              <strong>Duration:</strong> {formData.gameDurationMinutes} minutes
            </Typography>
          </Box>

          <Alert severity="info">
            Games will be created as a DRAFT schedule. You can review and edit individual games before publishing.
          </Alert>
        </Box>
      )}

      {/* Navigation Buttons */}
      <Box sx={{ display: "flex", justifyContent: "space-between", mt: 4 }}>
        <Button
          disabled={activeStep === 0}
          onClick={() => setActiveStep((prev) => prev - 1)}
        >
          Back
        </Button>
        {activeStep < steps.length - 1 ? (
          <Button
            variant="contained"
            disabled={!canAdvance()}
            onClick={() => setActiveStep((prev) => prev + 1)}
          >
            Next
          </Button>
        ) : (
          <Button
            variant="contained"
            disabled={isSubmitting}
            onClick={handleSubmit}
            sx={{ minHeight: 48 }}
          >
            {isSubmitting ? (
              <>
                <CircularProgress size={20} sx={{ mr: 1 }} color="inherit" />
                Generating...
              </>
            ) : (
              "Create Schedule"
            )}
          </Button>
        )}
      </Box>
    </Box>
  );
}
