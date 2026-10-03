"use client";

import {
    Alert,
    AlertTitle,
    Button,
    MenuItem,
    Paper,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { formatDateTimeInZone } from "@/lib/utils/date";
import type {
    VenueBooking,
    VenueBookingOption,
    VenueReservationBookingOption,
} from "./useVenueBooking";

export interface VenueBookingFieldsProps {
    booking: VenueBooking;
    venues: VenueBookingOption[];
    reservations: VenueReservationBookingOption[];
    /** The saved practice had a legacy (unreserved) venue attachment. */
    initialVenueId: string | null | undefined;
    duration: number;
    validationErrors: Record<string, string>;
    disabled: boolean;
}

/** "Venue reservation" panel (feature 006, FR-019). Renders nothing without options. */
export function VenueBookingFields({
    booking,
    venues,
    reservations,
    initialVenueId,
    duration,
    validationErrors,
    disabled,
}: VenueBookingFieldsProps) {
    const {
        reservationId,
        venueId,
        surfaceId,
        segmentId,
        startTime,
        selectedReservation,
        selectedVenueTimeZone,
        venueSurfaces,
        surfaceSegments,
        wholeSurfaceLabel,
        handleVenueChange,
        handleReservationChange,
        handleSurfaceChange,
        handleSegmentChange,
        handleStartTimeChange,
        handleClearBooking,
    } = booking;

    if (reservations.length === 0 && venues.length === 0) return null;

    return (
            <Paper elevation={2} sx={{ p: 2 }}>
                <Stack spacing={2}>
                    <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                    >
                        <Typography variant="h6" component="h2">
                            Venue reservation
                        </Typography>
                        {(reservationId || venueId) && (
                            <Button
                                color="inherit"
                                onClick={handleClearBooking}
                                disabled={disabled}
                                sx={{ minHeight: 44 }}
                            >
                                Clear booking
                            </Button>
                        )}
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                        Select confirmed inventory. Its venue-local interval, surface,
                        and segment become the practice schedule.
                    </Typography>
                    {reservations.length > 0 && (
                        <TextField
                            select
                            label="Confirmed reservation"
                            fullWidth
                            value={reservationId}
                            onChange={(event) =>
                                handleReservationChange(event.target.value)
                            }
                            helperText="Only confirmed, unassigned inventory owned by this team or its league is shown"
                            sx={{ "& .MuiInputBase-root": { minHeight: 44 } }}
                        >
                            <MenuItem value="" sx={{ minHeight: 44 }}>
                                No reservation
                            </MenuItem>
                            {reservations.map((reservation) => (
                                <MenuItem
                                    key={reservation.id}
                                    value={reservation.id}
                                    sx={{ minHeight: 44 }}
                                >
                                    {reservation.venueName} ·{" "}
                                    {formatDateTimeInZone(
                                        reservation.startsAt,
                                        reservation.timezone,
                                    )}
                                    {" – "}
                                    {formatDateTimeInZone(
                                        reservation.endsAt,
                                        reservation.timezone,
                                    )}
                                </MenuItem>
                            ))}
                        </TextField>
                    )}
                    {selectedReservation && (
                        <Alert severity="info">
                            <AlertTitle>
                                {selectedReservation.venueName}
                                {selectedReservation.surfaceName
                                    ? ` · ${selectedReservation.surfaceName}`
                                    : ""}
                                {selectedReservation.segmentName
                                    ? ` · ${selectedReservation.segmentName}`
                                    : ""}
                            </AlertTitle>
                            {formatDateTimeInZone(
                                selectedReservation.startsAt,
                                selectedReservation.timezone,
                            )}
                            {" – "}
                            {formatDateTimeInZone(
                                selectedReservation.endsAt,
                                selectedReservation.timezone,
                            )}
                            {" "}
                            ({selectedReservation.timezone})
                        </Alert>
                    )}
                    {(reservations.length === 0
                        || (!reservationId && Boolean(initialVenueId))) && (
                        <>
                            {reservations.length > 0 && (
                                <Alert severity="warning">
                                    This is a legacy unreserved practice. Keep its venue
                                    details for compatibility, or select confirmed inventory.
                                </Alert>
                            )}
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                                <TextField
                                    select
                                    label="Venue"
                                    fullWidth
                                    value={venueId}
                                    onChange={(event) =>
                                        handleVenueChange(event.target.value)
                                    }
                                    sx={{ "& .MuiInputBase-root": { minHeight: 44 } }}
                                >
                                    <MenuItem value="" sx={{ minHeight: 44 }}>
                                        No venue booking
                                    </MenuItem>
                                    {venues.map((venue) => (
                                        <MenuItem
                                            key={venue.id}
                                            value={venue.id}
                                            sx={{ minHeight: 44 }}
                                        >
                                            {venue.name}
                                        </MenuItem>
                                    ))}
                                </TextField>
                                {venueId && (
                            <TextField
                                label="Start time"
                                type="time"
                                required
                                fullWidth
                                value={startTime}
                                onChange={handleStartTimeChange}
                                error={!!validationErrors.startTime}
                                helperText={
                                    validationErrors.startTime ||
                                    `On the practice date, in ${selectedVenueTimeZone} (the venue's timezone); runs ${duration} min`
                                }
                                slotProps={{ inputLabel: { shrink: true } }}
                                sx={{ "& .MuiInputBase-root": { minHeight: 44 } }}
                            />
                                )}
                            </Stack>
                    {venueId && venueSurfaces.length > 0 && (
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                            <TextField
                                select
                                label="Surface (optional)"
                                fullWidth
                                value={surfaceId}
                                onChange={(event) => handleSurfaceChange(event.target.value)}
                                sx={{ "& .MuiInputBase-root": { minHeight: 44 } }}
                            >
                                <MenuItem value="">Any surface</MenuItem>
                                {venueSurfaces.map((surface) => (
                                    <MenuItem key={surface.id} value={surface.id}>
                                        {surface.name}
                                    </MenuItem>
                                ))}
                            </TextField>
                            {surfaceId && surfaceSegments.length > 0 && (
                                <TextField
                                    select
                                    label="Segment (optional)"
                                    fullWidth
                                    value={segmentId}
                                    onChange={(event) => handleSegmentChange(event.target.value)}
                                    sx={{ "& .MuiInputBase-root": { minHeight: 44 } }}
                                >
                                    <MenuItem value="">{wholeSurfaceLabel}</MenuItem>
                                    {surfaceSegments.map((segment) => (
                                        <MenuItem key={segment.id} value={segment.id}>
                                            {segment.name}
                                        </MenuItem>
                                    ))}
                                </TextField>
                            )}
                        </Stack>
                    )}
                        </>
                    )}
                </Stack>
            </Paper>
    );
}

export interface BookingConflictAlertProps {
    booking: VenueBooking;
    validationErrors: Record<string, string>;
    clearValidationError: (key: string) => void;
    disabled: boolean;
    onOverride: () => void;
}

/**
 * Venue booking conflicts (FR-019/US5): warn and allow an explicit override
 * that resubmits with overrideConflicts and a required audit reason.
 */
export function BookingConflictAlert({
    booking,
    validationErrors,
    clearValidationError,
    disabled,
    onOverride,
}: BookingConflictAlertProps) {
    const { bookingConflicts, overrideReason, setOverrideReason, selectedVenueTimeZone } = booking;
    if (!bookingConflicts) return null;

    return (
        <Alert
            severity="warning"
            action={
                <Button
                    color="inherit"
                    disabled={disabled || !overrideReason.trim()}
                    onClick={onOverride}
                    sx={{ minHeight: 44 }}
                >
                    Override conflict
                </Button>
            }
        >
            <AlertTitle>
                This time overlaps {bookingConflicts.length} existing booking
                {bookingConflicts.length === 1 ? "" : "s"} at the venue
            </AlertTitle>
            {bookingConflicts.map((conflict, index) => (
                <Typography key={`${conflict.title}-${index}`} variant="body2">
                    {conflict.title} —{" "}
                    {formatDateTimeInZone(conflict.startAt, selectedVenueTimeZone)}
                    {conflict.endAt
                        ? ` – ${formatDateTimeInZone(conflict.endAt, selectedVenueTimeZone)}`
                        : ""}
                </Typography>
            ))}
            <TextField
                label="Override reason"
                value={overrideReason}
                onChange={(event) => {
                    setOverrideReason(event.target.value);
                    clearValidationError("overrideReason");
                }}
                required
                fullWidth
                multiline
                minRows={2}
                error={Boolean(validationErrors.overrideReason)}
                helperText={
                    validationErrors.overrideReason
                    || "Required for the audit trail"
                }
                sx={{ mt: 2, "& .MuiInputBase-root": { minHeight: 44 } }}
            />
        </Alert>
    );
}
