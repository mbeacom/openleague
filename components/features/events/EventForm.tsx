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
import {
  createEvent,
  updateEvent,
  type CreateEventInput,
} from "@/lib/actions/events";
import { createEventSchema, updateEventSchema } from "@/lib/actions/events";

interface EventFormProps {
  teamId: string;
  eventId?: string;
  initialData?: {
    type: "GAME" | "PRACTICE";
    title: string;
    startAt: Date;
    location: string;
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
    location: initialData?.location || "",
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
    const { value } = e.target;
    setFormData((prev) => ({ ...prev, startAt: new Date(value) }));
    setError(null);
    setFieldErrors((prev) => ({ ...prev, startAt: undefined }));
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

  // Format date for datetime-local input
  const formatDateTimeLocal = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
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
        label="Date & Time"
        name="startAt"
        type="datetime-local"
        value={formatDateTimeLocal(formData.startAt)}
        onChange={handleDateChange}
        required
        fullWidth
        disabled={isSubmitting}
        error={!!fieldErrors.startAt}
        helperText={fieldErrors.startAt || "Select the event date and time"}
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
