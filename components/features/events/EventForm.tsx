"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  AlertTitle,
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
import {
  formatDateTimeInZone,
  formatDateTimeLocalInput,
  parseDateTimeLocalToUtc,
  resolveTimeZone,
  isValidTimeZone,
} from "@/lib/utils/date";
import { trackEventAction } from "@/lib/analytics/umami";
import VenueSelector from "@/components/features/venues/VenueSelector";
import { DateTimeField } from "@/components/ui/date";
import type { BookingConflict } from "@/types/segments";

interface EventFormProps {
  teamId: string;
  eventId?: string;
  reservations?: EventReservationOption[];
  initialData?: {
    type: "GAME" | "PRACTICE";
    title: string;
    startAt: Date;
    endAt?: Date;
    timezone?: string;
    location: string;
    venueId?: string;
    reservationId?: string;
    opponent: string;
    notes: string;
  };
}

export interface EventReservationOption {
  id: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  venueId: string;
  venueName: string;
  surfaceName: string | null;
  segmentName: string | null;
}

function extractConflicts(details: unknown): BookingConflict[] | null {
  if (details && typeof details === "object" && "conflicts" in details) {
    const conflicts = (details as { conflicts: unknown }).conflicts;
    if (Array.isArray(conflicts) && conflicts.length > 0) {
      return conflicts as BookingConflict[];
    }
  }
  return null;
}

export default function EventForm({
  teamId,
  eventId,
  initialData,
  reservations = [],
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
    reservationId: initialData?.reservationId,
    opponent: initialData?.opponent || "",
    notes: initialData?.notes || "",
    teamId,
    overrideConflicts: false,
  });
  const [error, setError] = useState<string | null>(null);
  // Venue booking conflicts returned by the server (006 FR-010/011): shown as
  // a warning with an explicit "Schedule anyway" override that the server
  // records; the payload is kept so the override resubmits the same event.
  const [conflicts, setConflicts] = useState<BookingConflict[] | null>(null);
  const [pendingPayload, setPendingPayload] = useState<CreateEventInput | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof CreateEventInput, string>>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Timezone the wall-clock times are entered in. Defaults to the event's stored
  // zone (edit), else the selected venue's zone, else the organizer's local zone.
  // datetime-local values are kept as wall-clock strings and only converted to a
  // UTC instant on submit, parsed against this zone.
  const initialTimeZone = resolveTimeZone(initialData?.timezone);
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [startAtLocal, setStartAtLocal] = useState(() =>
    formatDateTimeLocalInput(initialData?.startAt ?? new Date(), initialTimeZone)
  );
  const [endAtLocal, setEndAtLocal] = useState(() =>
    initialData?.endAt ? formatDateTimeLocalInput(initialData.endAt, initialTimeZone) : ""
  );
  const selectedReservation = reservations.find(
    (reservation) => reservation.id === formData.reservationId,
  );

  // Any edit invalidates a pending conflict override: "Schedule anyway"
  // must resubmit exactly the payload that was warned about.
  const clearConflicts = () => {
    setConflicts(null);
    setPendingPayload(null);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
    clearConflicts();
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSelectChange = (e: SelectChangeEvent) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
    clearConflicts();
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleDateChange = (name: "startAt" | "endAt") => (value: string) => {
    if (name === "endAt") {
      setEndAtLocal(value);
      setFieldErrors((prev) => ({ ...prev, endAt: undefined }));
    } else {
      setStartAtLocal(value);
      setFieldErrors((prev) => ({ ...prev, startAt: undefined }));
    }
    setFormData((previous) => ({ ...previous, reservationId: undefined }));
    setError(null);
    clearConflicts();
  };

  const handleVenueChange = (
    venueId: string,
    venueName: string,
    venueTimeZone?: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      venueId: venueId || "",
      location: venueName || prev.location,
      reservationId: undefined,
    }));
    // Adopt the venue's zone so wall-clock times are interpreted at the venue;
    // revert to the initial zone when the venue is cleared.
    if (isValidTimeZone(venueTimeZone)) {
      setTimeZone(venueTimeZone);
    } else {
      setTimeZone(initialTimeZone);
    }
    setError(null);
    clearConflicts();
    setFieldErrors((prev) => ({
      ...prev,
      venueId: undefined,
      endAt: venueId ? prev.endAt : undefined,
    }));
  };

  const handleReservationChange = (reservationId: string) => {
    const reservation = reservations.find((option) => option.id === reservationId);
    if (!reservation) {
      setFormData((previous) => ({ ...previous, reservationId: undefined }));
      return;
    }
    setFormData((previous) => ({
      ...previous,
      reservationId: reservation.id,
      venueId: reservation.venueId,
      location: reservation.venueName,
    }));
    setTimeZone(resolveTimeZone(reservation.timezone));
    setStartAtLocal(formatDateTimeLocalInput(reservation.startsAt, reservation.timezone));
    setEndAtLocal(formatDateTimeLocalInput(reservation.endsAt, reservation.timezone));
    setError(null);
    clearConflicts();
    setFieldErrors((previous) => ({
      ...previous,
      reservationId: undefined,
      venueId: undefined,
      startAt: undefined,
      endAt: undefined,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // Client-side validation
    const startAt = parseDateTimeLocalToUtc(startAtLocal, timeZone);
    const endAt = endAtLocal ? parseDateTimeLocalToUtc(endAtLocal, timeZone) : undefined;

    if (!startAt) {
      setFieldErrors((prev) => ({ ...prev, startAt: "Valid date and time is required" }));
      setError("Please fix the errors below.");
      return;
    }
    if (endAtLocal && !endAt) {
      setFieldErrors((prev) => ({ ...prev, endAt: "Valid end date and time is required" }));
      setError("Please fix the errors below.");
      return;
    }

    const payload: CreateEventInput = {
      ...formData,
      startAt,
      endAt: endAt ?? undefined,
      timezone: timeZone,
    };

    const validationSchema = isEditMode ? updateEventSchema : createEventSchema;
    const dataToValidate = isEditMode
      ? { ...payload, id: eventId! }
      : payload;

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

    await submitEvent(payload);
  };

  const submitEvent = async (payload: CreateEventInput) => {
    setIsSubmitting(true);

    try {
      const result = isEditMode
        ? await updateEvent({ ...payload, id: eventId! })
        : await createEvent(payload);

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
        // Venue booking conflicts warn instead of blocking (006 FR-010/011):
        // keep the payload so "Schedule anyway" resubmits the exact same
        // event with an explicit recorded override.
        const detectedConflicts = extractConflicts(result.details);
        if (detectedConflicts) {
          setConflicts(detectedConflicts);
          setPendingPayload(payload);
          return;
        }
        clearConflicts();
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

      {conflicts && (
        <Alert
          severity="warning"
          action={
            <Button
              color="inherit"
              size="small"
              disabled={isSubmitting || !pendingPayload}
              onClick={() =>
                pendingPayload &&
                submitEvent({ ...pendingPayload, overrideConflicts: true })
              }
            >
              Schedule anyway
            </Button>
          }
        >
          <AlertTitle>
            This time overlaps {conflicts.length} existing booking
            {conflicts.length === 1 ? "" : "s"} at the venue
          </AlertTitle>
          {conflicts.map((conflict, index) => (
            <Typography key={`${conflict.title}-${index}`} variant="body2">
              {conflict.title} — {formatDateTimeInZone(conflict.startAt, timeZone)}
              {conflict.endAt
                ? ` – ${formatDateTimeInZone(conflict.endAt, timeZone)}`
                : ""}
            </Typography>
          ))}
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

      <DateTimeField
        label="Start Date & Time"
        name="startAt"
        value={startAtLocal}
        onChange={handleDateChange("startAt")}
        required
        fullWidth
        disabled={isSubmitting}
        error={!!fieldErrors.startAt}
        helperText={fieldErrors.startAt || `Times are in ${timeZone}`}
      />

      <DateTimeField
        label={`End Date & Time${formData.venueId ? "" : " (optional)"}`}
        name="endAt"
        value={endAtLocal}
        onChange={handleDateChange("endAt")}
        required={Boolean(formData.venueId)}
        fullWidth
        disabled={isSubmitting}
        error={!!fieldErrors.endAt}
        helperText={
          fieldErrors.endAt
          || (formData.venueId
            ? `Required for venue events. Times are in ${timeZone}`
            : `Times are in ${timeZone}`)
        }
      />

      <VenueSelector
        value={formData.venueId || ""}
        onChange={handleVenueChange}
        disabled={isSubmitting}
        error={!!fieldErrors.venueId}
        helperText={fieldErrors.venueId}
      />

      {reservations.length > 0 ? (
        <TextField
          select
          label="Confirmed reservation"
          value={formData.reservationId ?? ""}
          onChange={(event) => handleReservationChange(event.target.value)}
          disabled={isSubmitting}
          error={!!fieldErrors.reservationId}
          helperText={
            fieldErrors.reservationId
            || "Only confirmed, unassigned inventory available to this team is shown"
          }
        >
          <MenuItem value="">No reservation</MenuItem>
          {reservations.map((reservation) => (
            <MenuItem key={reservation.id} value={reservation.id}>
              {reservation.venueName} ·{" "}
              {formatDateTimeInZone(reservation.startsAt, reservation.timezone)}
              {" – "}
              {formatDateTimeInZone(reservation.endsAt, reservation.timezone)}
            </MenuItem>
          ))}
        </TextField>
      ) : formData.venueId && endAtLocal ? (
        <Alert severity="warning">
          No confirmed unassigned reservation inventory is available for this team.
        </Alert>
      ) : null}

      {selectedReservation ? (
        <Alert severity="info">
          <AlertTitle>
            {selectedReservation.venueName}
            {selectedReservation.surfaceName ? ` · ${selectedReservation.surfaceName}` : ""}
            {selectedReservation.segmentName ? ` · ${selectedReservation.segmentName}` : ""}
          </AlertTitle>
          This confirmed reservation supplies the event venue and time.
        </Alert>
      ) : null}

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
