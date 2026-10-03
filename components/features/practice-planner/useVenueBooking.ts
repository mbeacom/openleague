"use client";

/**
 * Optional venue booking for a practice session (feature 006, FR-019):
 * reservation / venue / surface / segment / start-time state, the handlers
 * that keep them consistent, and the conflict-override state.
 * Extracted from PracticeSessionEditor without behavior change.
 */

import { useState, type ChangeEvent } from "react";
import type { BookingConflict, SegmentKind } from "@/types/segments";
import {
    formatDateTimeLocalInput,
    parseDateTimeLocalToUtc,
    resolveTimeZone,
} from "@/lib/utils/date";

/**
 * A venue the coach can book ice at (feature 006, FR-019).
 * Loaded server-side by the new/edit pages via getVenueBookingOptions.
 */
export interface VenueBookingOption {
    id: string;
    name: string;
    timezone: string;
}

/**
 * A bookable segment of a surface. `kind` feeds the drills' advisory fit
 * check (2b); when it is absent the check treats the segment as unknown.
 */
export interface SegmentBookingOption {
    id: string;
    name: string;
    kind?: SegmentKind;
}

export interface VenueReservationBookingOption {
    id: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    venueId: string;
    venueName: string;
    surfaceId: string | null;
    surfaceName: string | null;
    segmentId: string | null;
    segmentName: string | null;
    segmentKind?: SegmentKind | null;
    ownerType: "league" | "team";
}

/**
 * Optional venue attachment fields carried alongside the session data
 * on save (feature 006, FR-019). All null when the practice is unbooked.
 */
export interface PracticeVenueAttachment {
    reservationId: string | null;
    venueId: string | null;
    surfaceId: string | null;
    segmentId: string | null;
    startAt: Date | null;
}

/**
 * Pull booking conflicts out of an ActionResult's `details` payload
 * (same shape season games return — details.conflicts).
 */
export function extractBookingConflicts(details: unknown): BookingConflict[] | undefined {
    if (details && typeof details === "object" && "conflicts" in details) {
        const conflicts = (details as { conflicts: unknown }).conflicts;
        if (Array.isArray(conflicts) && conflicts.length > 0) {
            return conflicts.map((conflict): BookingConflict => {
                const item = conflict as Partial<BookingConflict> & {
                    startsAt?: Date | string;
                    endsAt?: Date | string | null;
                };
                return {
                    source: item.source ?? "venueReservation",
                    title: item.title ?? "Existing venue reservation",
                    startAt: new Date(item.startsAt ?? 0),
                    endAt: item.endsAt ? new Date(item.endsAt) : null,
                    surfaceId: item.surfaceId ?? null,
                    segmentId: item.segmentId ?? null,
                    segmentName: item.segmentName ?? null,
                };
            });
        }
    }
    return undefined;
}

export interface UseVenueBookingOptions {
    initialData?: Partial<PracticeVenueAttachment>;
    venues: VenueBookingOption[];
    reservations: VenueReservationBookingOption[];
    surfacesByVenue: Record<string, Array<{ id: string; name: string }>>;
    segmentsBySurface: Record<string, SegmentBookingOption[]>;
    wholeLabelBySurface: Record<string, string>;
    /** Any booking edit: the editor marks the session dirty. */
    onDirty: () => void;
    /** A reservation was picked: the practice adopts its start and length. */
    onReservationSchedule: (date: Date, durationMinutes: number) => void;
    /** Removes one key from the editor's validation errors. */
    clearValidationError: (key: string) => void;
}

export function useVenueBooking({
    initialData,
    venues,
    reservations,
    surfacesByVenue,
    segmentsBySurface,
    wholeLabelBySurface,
    onDirty,
    onReservationSchedule,
    clearValidationError,
}: UseVenueBookingOptions) {
    const [reservationId, setReservationId] = useState(initialData?.reservationId ?? "");
    const [overrideReason, setOverrideReason] = useState("");
    // startTime is a wall-clock HH:MM interpreted in the venue's timezone.
    const [venueId, setVenueId] = useState(initialData?.venueId ?? "");
    const [surfaceId, setSurfaceId] = useState(initialData?.surfaceId ?? "");
    const [segmentId, setSegmentId] = useState(initialData?.segmentId ?? "");
    const [startTime, setStartTime] = useState(() => {
        if (!initialData?.startAt) return "";
        const initialZone = resolveTimeZone(
            venues.find((venue) => venue.id === initialData.venueId)?.timezone
        );
        // formatDateTimeLocalInput returns YYYY-MM-DDTHH:MM — keep the time part.
        return formatDateTimeLocalInput(initialData.startAt, initialZone).slice(11, 16);
    });
    const [bookingConflicts, setBookingConflicts] = useState<BookingConflict[] | null>(null);

    // Timezone the booking start time is entered in (the venue's zone,
    // matching GameForm's wall-clock handling).
    const selectedReservation = reservations.find(
        (reservation) => reservation.id === reservationId,
    );
    const selectedVenueTimeZone = resolveTimeZone(
        selectedReservation?.timezone
        ?? venues.find((venue) => venue.id === venueId)?.timezone
    );

    /**
     * Changing the venue resets surface/segment (they belong to a venue —
     * stale selections would be rejected server-side, matching GameForm).
     */
    const handleVenueChange = (nextVenueId: string) => {
        setReservationId("");
        setVenueId(nextVenueId);
        setSurfaceId("");
        setSegmentId("");
        setBookingConflicts(null);
        onDirty();
    };

    const handleReservationChange = (nextReservationId: string) => {
        setReservationId(nextReservationId);
        setBookingConflicts(null);
        setOverrideReason("");
        onDirty();
        const reservation = reservations.find(
            (option) => option.id === nextReservationId,
        );
        if (!reservation) {
            setVenueId("");
            setSurfaceId("");
            setSegmentId("");
            setStartTime("");
            return;
        }

        const startsAt = new Date(reservation.startsAt);
        const endsAt = new Date(reservation.endsAt);
        onReservationSchedule(
            startsAt,
            Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000),
        );
        setVenueId(reservation.venueId);
        setSurfaceId(reservation.surfaceId ?? "");
        setSegmentId(reservation.segmentId ?? "");
        setStartTime(
            formatDateTimeLocalInput(startsAt, reservation.timezone).slice(11, 16),
        );
    };

    const handleSurfaceChange = (nextSurfaceId: string) => {
        setSurfaceId(nextSurfaceId);
        // Segments belong to a surface — reset on surface change.
        setSegmentId("");
        setBookingConflicts(null);
        onDirty();
    };

    const handleSegmentChange = (nextSegmentId: string) => {
        setSegmentId(nextSegmentId);
        setBookingConflicts(null);
        onDirty();
    };

    const handleStartTimeChange = (event: ChangeEvent<HTMLInputElement>) => {
        setStartTime(event.target.value);
        setBookingConflicts(null);
        onDirty();
        clearValidationError("startTime");
    };

    /**
     * Detach the practice from the venue entirely: on save the practice
     * loses its availability footprint and behaves exactly as before.
     */
    const handleClearBooking = () => {
        setReservationId("");
        setVenueId("");
        setSurfaceId("");
        setSegmentId("");
        setStartTime("");
        setBookingConflicts(null);
        setOverrideReason("");
        onDirty();
        clearValidationError("startTime");
    };

    /**
     * Combine the practice date with the entered wall-clock start time in the
     * venue's timezone. The booking day is derived in the venue's zone — not
     * via browser-local getters — so it doesn't shift across midnight.
     */
    const resolveStartAt = (date: Date): { ok: true; startAt: Date | null } | { ok: false } => {
        if (selectedReservation) {
            return { ok: true, startAt: new Date(selectedReservation.startsAt) };
        }
        if (!venueId) return { ok: true, startAt: null };
        const dateStr = formatDateTimeLocalInput(date, selectedVenueTimeZone).slice(0, 10);
        const startAt = parseDateTimeLocalToUtc(`${dateStr}T${startTime}`, selectedVenueTimeZone);
        return startAt ? { ok: true, startAt } : { ok: false };
    };

    const attachment = (startAt: Date | null): PracticeVenueAttachment => ({
        reservationId: reservationId || null,
        venueId: venueId || null,
        surfaceId: venueId ? surfaceId || null : null,
        segmentId: venueId && surfaceId ? segmentId || null : null,
        startAt,
    });

    // Option lists for the currently selected venue/surface (006).
    const venueSurfaces = venueId ? (surfacesByVenue[venueId] ?? []) : [];
    const surfaceSegments = surfaceId ? (segmentsBySurface[surfaceId] ?? []) : [];
    const wholeSurfaceLabel = (surfaceId && wholeLabelBySurface[surfaceId]) || "Whole surface";

    // The booked segment's kind for the drills' fit warning (2b). null means
    // unbooked, the whole surface, or a segment whose kind wasn't loaded.
    const segmentKind: SegmentKind | null = !venueId
        ? null
        : selectedReservation
            ? selectedReservation.segmentKind ?? null
            : surfaceSegments.find((segment) => segment.id === segmentId)?.kind ?? null;

    return {
        reservationId,
        venueId,
        surfaceId,
        segmentId,
        startTime,
        overrideReason,
        setOverrideReason,
        bookingConflicts,
        setBookingConflicts,
        selectedReservation,
        selectedVenueTimeZone,
        venueSurfaces,
        surfaceSegments,
        wholeSurfaceLabel,
        segmentKind,
        handleVenueChange,
        handleReservationChange,
        handleSurfaceChange,
        handleSegmentChange,
        handleStartTimeChange,
        handleClearBooking,
        resolveStartAt,
        attachment,
    };
}

export type VenueBooking = ReturnType<typeof useVenueBooking>;
