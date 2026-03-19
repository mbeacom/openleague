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
  FormControl,
  InputLabel,
  Select,
  SelectChangeEvent,
} from "@mui/material";
import { createEvent, updateEvent } from "@/lib/actions/events";
import type { CreateEventInput } from "@/lib/utils/validation";
import { createEventSchema, updateEventSchema } from "@/lib/utils/validation";
import { formatDateTimeLocal } from "@/lib/utils/date";
import { trackEventAction } from "@/lib/analytics/umami";
import VenueSelector from "@/components/features/venues/VenueSelector";

interface EventFormProps {
  teamId: string;
  eventId?: string;
  initialData?: {
    type: "GAME" | "PRACTICE";
    title: string;
    startAt: Date;
    endAt?: Date;
    location: string;
    venueId?: string;
    opponent: string;
    notes: string;
  };
}

export default function EventForm({
  teamId,
  eventId,
  initialData,
}: EventFormProps) {
  const router = useRouter();
  const isEditMode = !!eventId;

  const [formData, setFormData] = useState<CreateEventInput>({
    type: initialData?.type || "PRACTICE",
    title: initialData?.title || "",
    startAt: initialData?.startAt || new Date(),
    endAt: initialData?.endAt || undefined,
    location: initialData?.location || "",
    venueId: initialData?.venueId || "",
    opponent: initialData?.opponent || "",
    notes: initialData?.notes || "",
    teamId,
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof CreateEventInput, string>>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSelectChange = (e: SelectChangeEvent) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === "endAt") {
      setFormData((prev) => ({ ...prev, endAt: value ? new Date(value) : undefined }));
      setFieldErrors((prev) => ({ ...prev, endAt: undefined }));
    } else {
      setFormData((prev) => ({ ...prev, startAt: new Date(value) }));
      setFieldErrors((prev) => ({ ...prev, startAt: undefined }));
    }
    setError(null);
  };

  const handleVenueChange = (venueId: string, venueName: string) => {
    setFormData((prev) => ({
      ...prev,
      venueId: venueId || "",
      location: venueName || prev.location,
    }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // Client-side validation
    const validationSchema = isEditMode ? updateEventSchema : createEventSchema;
    const dataToValidate = isEditMode
      ? { ...formData, id: eventId! }
      : formData;

    const validation = validationSchema.safeParse(dataToValidate);
    if (!validation.success) {
      const errors: Partial<Record<keyof CreateEventInput, string>> = {};
      validation.error.issues.forEach((issue) => {
        const field = issue.path[0] as keyof CreateEventInput;
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
      const result = isEditMode
        ? await updateEvent({ ...formData, id: eventId! })
        : await createEvent(formData);

      if (result.success) {
        // Track event action
        const eventType = formData.type === 'GAME' ? 'game' : 'practice';
        if (isEditMode) {
          trackEventAction('update', eventType, {});
        } else {
          trackEventAction('create', eventType, {
            hasOpponent: !!formData.opponent,
          });
        }

        // Redirect to event detail page after successful update, calendar after create
        router.push(isEditMode ? `/events/${eventId}` : "/calendar");
      } else {
        setError(result.error);
      }
    } catch (err) {
      console.error(
        `An unexpected error occurred during event ${isEditMode ? "update" : "creation"}:`,
        err
      );
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
        maxWidth: 600,
        width: "100%",
      }}
    >
      <Typography variant="h5" component="h2" gutterBottom>
        {isEditMode ? "Edit Event" : "Create Event"}
      </Typography>

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <FormControl fullWidth error={!!fieldErrors.type}>
        <InputLabel id="event-type-label">Event Type</InputLabel>
        <Select
          labelId="event-type-label"
          name="type"
          value={formData.type}
          onChange={handleSelectChange}
          label="Event Type"
          disabled={isSubmitting}
        >
          <MenuItem value="PRACTICE">Practice</MenuItem>
          <MenuItem value="GAME">Game</MenuItem>
        </Select>
        {fieldErrors.type && (
          <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.75 }}>
            {fieldErrors.type}
          </Typography>
        )}
      </FormControl>

      <TextField
        label="Title"
        name="title"
        value={formData.title}
        onChange={handleChange}
        required
        fullWidth
        disabled={isSubmitting}
        placeholder="e.g., Weekly Practice, vs Thunder FC"
        error={!!fieldErrors.title}
        helperText={fieldErrors.title}
      />

      <TextField
        label="Start Date & Time"
        name="startAt"
        type="datetime-local"
        value={formatDateTimeLocal(formData.startAt)}
        onChange={handleDateChange}
        required
        fullWidth
        disabled={isSubmitting}
        error={!!fieldErrors.startAt}
        helperText={fieldErrors.startAt || "Select the event start time"}
        slotProps={{ inputLabel: { shrink: true } }}
      />

      <TextField
        label="End Date & Time (optional)"
        name="endAt"
        type="datetime-local"
        value={formData.endAt ? formatDateTimeLocal(formData.endAt) : ""}
        onChange={handleDateChange}
        fullWidth
        disabled={isSubmitting}
        error={!!fieldErrors.endAt}
        helperText={fieldErrors.endAt || "Set an end time for ice time scheduling"}
        slotProps={{ inputLabel: { shrink: true } }}
      />

      <VenueSelector
        value={formData.venueId || ""}
        onChange={handleVenueChange}
        disabled={isSubmitting}
        error={!!fieldErrors.venueId}
        helperText={fieldErrors.venueId}
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
        helperText={fieldErrors.location || (formData.venueId ? "Auto-filled from venue" : "")}
      />

      {formData.type === "GAME" && (
        <TextField
          label="Opponent"
          name="opponent"
          value={formData.opponent}
          onChange={handleChange}
          required
          fullWidth
          disabled={isSubmitting}
          placeholder="e.g., Thunder FC, Eagles"
          error={!!fieldErrors.opponent}
          helperText={fieldErrors.opponent || "Required for games"}
        />
      )}

      <TextField
        label="Notes"
        name="notes"
        value={formData.notes}
        onChange={handleChange}
        fullWidth
        multiline
        rows={4}
        disabled={isSubmitting}
        placeholder="Additional information about the event..."
        error={!!fieldErrors.notes}
        helperText={fieldErrors.notes}
      />

      <Button
        type="submit"
        variant="contained"
        color="primary"
        size="large"
        disabled={isSubmitting}
        sx={{
          mt: 1,
          minHeight: 48,
        }}
      >
        {isSubmitting ? (
          <>
            <CircularProgress size={20} sx={{ mr: 1 }} color="inherit" />
            {isEditMode ? "Updating..." : "Creating..."}
          </>
        ) : isEditMode ? (
          "Update Event"
        ) : (
          "Create Event"
        )}
      </Button>
    </Box>
  );
}
