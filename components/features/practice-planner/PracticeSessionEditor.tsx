"use client";

/**
 * PracticeSessionEditor Component
 *
 * Main editor for creating and organizing practice sessions.
 * Allows coaches to add plays, set durations, and share sessions with team members.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 4.3, 4.4
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
    Box,
    Paper,
    TextField,
    Typography,
    Button,
    CircularProgress,
    Alert,
    Stack,
    Dialog,
    DialogTitle,
    DialogContent,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { Save as SaveIcon, Share as ShareIcon } from "@mui/icons-material";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import {
    PracticeSessionData,
    PlayInSession,
    SavedPlay,
    validateSessionDuration,
    VALIDATION_CONSTRAINTS,
} from "@/types/practice-planner";
import type { BookingConflict } from "@/types/segments";
import { applySavedPlayIds, describeSaveError, type SavedDrillId } from "@/lib/utils/session-drill-ids";
import { PlayLibrary } from "./PlayLibrary";
import { useSingleFlightSave } from "./useSingleFlightSave";
import { SessionDrillList } from "./SessionDrillList";
import { SessionDrillDialog } from "./SessionDrillDialog";
import { useSessionDrillDialog } from "./useSessionDrillDialog";
import { ShareSessionDialog } from "./ShareSessionDialog";
import { BookingConflictAlert, VenueBookingFields } from "./VenueBookingFields";
import {
    useVenueBooking,
    type PracticeVenueAttachment,
    type VenueBookingOption,
    type VenueReservationBookingOption,
} from "./useVenueBooking";

export {
    extractBookingConflicts,
    type PracticeVenueAttachment,
    type VenueBookingOption,
    type VenueReservationBookingOption,
} from "./useVenueBooking";

/** Next free play sequence: max + 1 (robust to gaps), 0 for an empty list. */
export function nextPlaySequence(plays: ReadonlyArray<{ sequence: number }>): number {
    return plays.reduce((max, p) => Math.max(max, p.sequence), -1) + 1;
}

/** Full payload handed to onSave: session data + booking + override flag. */
export interface PracticeSessionSubmitData
    extends PracticeSessionData,
        PracticeVenueAttachment {
    overrideConflicts: boolean;
    overrideReason: string;
    /**
     * True only for an explicit Save click (not autosave); gates the
     * "practice plan updated" team notification on shared sessions.
     */
    notify: boolean;
}

/**
 * Structured save outcome so the editor can distinguish venue booking
 * conflicts (warn + "Book anyway", FR-019/US5) from ordinary errors.
 */
export type PracticeSessionSaveResult =
    | { success: true; plays?: SavedDrillId[] }
    | { success: false; error: string; conflicts?: BookingConflict[] };

/**
 * Props for the PracticeSessionEditor component
 */
export interface PracticeSessionEditorProps {
    sessionId?: string;
    teamId: string;
    initialData?: Partial<PracticeSessionData> & Partial<PracticeVenueAttachment>;
    /** Venues available for the optional ice booking (feature 006). */
    venues?: VenueBookingOption[];
    /** Confirmed, unassigned inventory eligible for this exact team. */
    reservations?: VenueReservationBookingOption[];
    /** Active surfaces per venue id. */
    surfacesByVenue?: Record<string, Array<{ id: string; name: string }>>;
    /** Active segments per surface id. */
    segmentsBySurface?: Record<string, Array<{ id: string; name: string }>>;
    /** Display name of the implicit whole-surface option per surface ("Full ice"). */
    wholeLabelBySurface?: Record<string, string>;
    onSave?: (session: PracticeSessionSubmitData) => Promise<PracticeSessionSaveResult>;
    onShare?: (sessionId: string) => Promise<void>;
    onCancel?: () => void;
}

/**
 * PracticeSessionEditor Component
 *
 * Requirements: 2.1 - Create form fields for title, date, and duration
 */
export function PracticeSessionEditor({
    sessionId,
    teamId,
    initialData,
    venues = [],
    reservations = [],
    surfacesByVenue = {},
    segmentsBySurface = {},
    wholeLabelBySurface = {},
    onSave,
    onShare,
    onCancel,
}: PracticeSessionEditorProps) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));

    // Session metadata state
    // Requirements: 2.1
    const [title, setTitle] = useState(initialData?.title || "");
    const [date, setDate] = useState<Date | null>(initialData?.date || new Date());
    const [duration, setDuration] = useState(initialData?.duration || 60);
    const [plays, setPlays] = useState<PlayInSession[]>(initialData?.plays || []);
    const [isShared, setIsShared] = useState(initialData?.isShared || false);

    // UI state
    const [isSaving, setIsSaving] = useState(false);
    const [isSharing, setIsSharing] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
    const [showLibrary, setShowLibrary] = useState(false);
    const [editingPlayId, setEditingPlayId] = useState<string | null>(null);
    const [showShareDialog, setShowShareDialog] = useState(false);

    // Auto-save state
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
    const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const handleSaveRef = useRef<((overrideConflicts?: boolean, notify?: boolean) => Promise<void>) | undefined>(undefined);

    // Single-flight saves: a save requested while one is running is queued
    // and runs once, after the running save's state has rendered.
    const saveFlight = useSingleFlightSave();

    const markDirty = useCallback(() => {
        saveFlight.markEdited();
        setHasUnsavedChanges(true);
        setSaveSuccess(false);
    }, [saveFlight]);

    const clearValidationError = useCallback((key: string) => {
        setValidationErrors((prev) =>
            key in prev
                ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key))
                : prev
        );
    }, []);

    // Edit a drill's diagram, or build a new drill, in the session (3a).
    const saveNow = useCallback(() => saveFlight.request({ overrideConflicts: false, notify: false }), [saveFlight]);
    const drillDialog = useSessionDrillDialog(plays, setPlays, markDirty, saveNow);

    // Optional ice booking (feature 006, FR-019).
    const booking = useVenueBooking({
        initialData,
        venues,
        reservations,
        surfacesByVenue,
        segmentsBySurface,
        wholeLabelBySurface,
        onDirty: markDirty,
        onReservationSchedule: (start, minutes) => {
            setDate(start);
            setDuration(minutes);
        },
        clearValidationError,
    });

    /**
     * Validate form fields
     * Requirements: 2.1 - Form validation for required fields
     */
    const validateForm = useCallback((requiresOverrideReason = false): boolean => {
        const errors: Record<string, string> = {};

        // Validate title
        if (!title.trim()) {
            errors.title = "Title is required";
        } else if (title.trim().length > 100) {
            errors.title = "Title must be 100 characters or less";
        }

        // Validate date
        if (!date) {
            errors.date = "Date is required";
        } else if (isNaN(date.getTime())) {
            errors.date = "Invalid date";
        }

        // Validate duration
        // Requirements: 2.1 - Duration validation (1-300 minutes)
        const durationValidation = validateSessionDuration(duration);
        if (!durationValidation.valid) {
            errors.duration = durationValidation.errors[0]?.message || "Invalid duration";
        }

        // Booking a venue requires a start time (FR-019): the slot is the
        // practice date + start time, running for the session duration.
        if (booking.venueId && !booking.startTime) {
            errors.startTime = "Start time is required when booking a venue";
        }
        if (requiresOverrideReason && !booking.overrideReason.trim()) {
            errors.overrideReason = "Explain why this conflict should be overridden";
        }

        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    }, [title, date, duration, booking.venueId, booking.startTime, booking.overrideReason]);

    /**
     * Handle title change
     */
    const handleTitleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setTitle(event.target.value);
        markDirty();
        // Clear title error when user starts typing
        if (validationErrors.title) {
            setValidationErrors((prev) =>
                Object.fromEntries(Object.entries(prev).filter(([key]) => key !== "title"))
            );
        }
    };

    /**
     * Handle date change
     */
    const handleDateChange = (newDate: Date | null) => {
        setDate(newDate);
        markDirty();
        // The booking slot follows the practice date — stale conflicts no longer apply.
        booking.setBookingConflicts(null);
        // Clear date error when user changes date
        if (validationErrors.date) {
            setValidationErrors((prev) =>
                Object.fromEntries(Object.entries(prev).filter(([key]) => key !== "date"))
            );
        }
    };

    /**
     * Handle duration change
     */
    const handleDurationChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(event.target.value, 10);
        if (!isNaN(value)) {
            setDuration(value);
            markDirty();
            // The booking slot length follows the duration — stale conflicts no longer apply.
            booking.setBookingConflicts(null);
            // Clear duration error when user changes duration
            if (validationErrors.duration) {
                setValidationErrors((prev) =>
                    Object.fromEntries(Object.entries(prev).filter(([key]) => key !== "duration"))
                );
            }
        }
    };

    /**
     * Handle save action
     * Requirements: 2.1 - Save session metadata
     * FR-019: pass `overrideConflicts: true` (via "Book anyway") to save
     * despite venue booking conflicts.
     */
    const handleSave = useCallback(async (overrideConflicts: boolean = false, notify: boolean = false) => {
        if (saveFlight.isRunning()) {
            // A create redirects to its edit page, which loads the saved state.
            if (sessionId) saveFlight.queue({ overrideConflicts, notify });
            return;
        }

        // Validate form (includes date validation)
        if (!validateForm(overrideConflicts)) {
            setSaveError("Please fix the validation errors");
            return;
        }

        // TypeScript narrowing: after validateForm() passes, date is guaranteed to be non-null
        if (!date) return;

        // The booking instant: the practice date + wall-clock start time in the venue's zone (FR-019).
        const resolvedStart = booking.resolveStartAt(date);
        if (!resolvedStart.ok) {
            setValidationErrors((prev) => ({
                ...prev,
                startTime: "Enter a valid start time",
            }));
            setSaveError("Please fix the validation errors");
            return;
        }

        const startedVersion = saveFlight.start();
        const sentPlayIds = new Map(plays.map((play) => [play.id, play.playId]));
        setIsSaving(true);
        setSaveError(null);
        setSaveSuccess(false);
        booking.setBookingConflicts(null);

        try {
            const sessionData: PracticeSessionSubmitData = {
                id: sessionId,
                title: title.trim(),
                date,
                duration,
                plays,
                isShared,
                ...booking.attachment(resolvedStart.startAt),
                overrideConflicts,
                overrideReason: overrideConflicts ? booking.overrideReason.trim() : "",
                notify,
            };

            const result: PracticeSessionSaveResult = onSave
                ? await onSave(sessionData)
                : { success: true };

            if (!result.success) {
                if (result.conflicts && result.conflicts.length > 0) {
                    // FR-019/US5: warn and let the coach explicitly book anyway.
                    booking.setBookingConflicts(result.conflicts);
                } else {
                    setSaveError(describeSaveError(result.error));
                }
                return;
            }

            setPlays((current) => applySavedPlayIds(current, sentPlayIds, result.plays));
            if (!saveFlight.editedSince(startedVersion)) {
                setHasUnsavedChanges(false);
            } else if (sessionId) {
                // Edited while saving: save again once this one settles.
                saveFlight.queue({ overrideConflicts: false, notify: false });
            }
            setSaveSuccess(true);

            if (successTimeoutRef.current) {
                clearTimeout(successTimeoutRef.current);
            }
            successTimeoutRef.current = setTimeout(() => {
                setSaveSuccess(false);
            }, 3000);
        } catch (error) {
            console.error("Error saving session:", error);
            setSaveError(
                error instanceof Error ? error.message : "Failed to save session"
            );
        } finally {
            setIsSaving(false);
            saveFlight.finish();
        }
    }, [title, date, duration, plays, isShared, sessionId, booking, onSave, validateForm, saveFlight]);

    // Keep handleSaveRef updated with latest handleSave function
    useEffect(() => {
        handleSaveRef.current = handleSave;
    }, [handleSave]);

    // Run a queued save after the previous save's state updates have rendered.
    const { followUp } = saveFlight;
    useEffect(() => {
        if (followUp) void handleSaveRef.current?.(followUp.overrideConflicts, followUp.notify);
    }, [followUp]);

    /**
     * Auto-save with debouncing
     * Requirements: 2.1 - Auto-save for session metadata
     */
    useEffect(() => {
        // Clear existing timer
        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
        }

        // Only auto-save if there are unsaved changes and we have a sessionId (editing existing session)
        if (hasUnsavedChanges && sessionId) {
            autoSaveTimerRef.current = setTimeout(() => {
                handleSaveRef.current?.();
            }, 2000); // 2 second debounce
        }

        return () => {
            if (autoSaveTimerRef.current) {
                clearTimeout(autoSaveTimerRef.current);
            }
        };
    }, [hasUnsavedChanges, sessionId]);

    /**
     * Handle open share dialog
     * Requirements: 3.1 - Share button with confirmation
     */
    const handleOpenShareDialog = useCallback(() => {
        if (!sessionId) {
            setSaveError("Please save the session before sharing");
            return;
        }
        if (hasUnsavedChanges) {
            setSaveError("Please save your changes before sharing");
            return;
        }
        setShowShareDialog(true);
    }, [sessionId, hasUnsavedChanges]);

    /**
     * Handle close share dialog
     */
    const handleCloseShareDialog = useCallback(() => {
        setShowShareDialog(false);
    }, []);

    /**
     * Handle share action
     * Requirements: 3.1 - Share session with team members
     */
    const handleShare = useCallback(async () => {
        if (!sessionId) {
            setSaveError("Please save the session before sharing");
            return;
        }

        setIsSharing(true);
        setSaveError(null);
        setShowShareDialog(false);

        try {
            if (onShare) {
                await onShare(sessionId);
            }
            setIsShared(true);
            setSaveSuccess(true);

            // Clear success message after 3 seconds
            if (successTimeoutRef.current) {
                clearTimeout(successTimeoutRef.current);
            }
            successTimeoutRef.current = setTimeout(() => {
                setSaveSuccess(false);
            }, 3000);
        } catch (error) {
            console.error("Error sharing session:", error);
            setSaveError(
                error instanceof Error ? error.message : "Failed to share session"
            );
        } finally {
            setIsSharing(false);
        }
    }, [sessionId, onShare]);

    /**
     * Handle delete play
     * Requirements: 2.2 - Remove plays from session
     */
    const handleDeletePlay = useCallback((playId: string) => {
        setPlays((prevPlays) =>
            prevPlays
                .filter((p) => p.id !== playId)
                .map((play, idx) => ({ ...play, sequence: idx }))
        );
        markDirty();
    }, [markDirty]);

    /**
     * Handle edit play
     * Requirements: 2.4 - Edit play in session
     */
    const handleEditPlay = useCallback((playId: string) => {
        setEditingPlayId(playId);
    }, []);

    /**
     * Handle update play in session
     * Requirements: 2.4, 4.4 - Ensure edits don't affect library play
     */
    const handleUpdatePlayInSession = useCallback(
        (playId: string, updates: Partial<PlayInSession>) => {
            setPlays((prevPlays) =>
                prevPlays.map((play) =>
                    play.id === playId ? { ...play, ...updates } : play
                )
            );
            markDirty();
            setEditingPlayId(null);
        },
        [markDirty]
    );

    /**
     * Handle cancel edit
     */
    const handleCancelEdit = useCallback(() => {
        setEditingPlayId(null);
    }, []);

    /**
     * Handle add play from library
     * Requirements: 4.3, 4.4 - Add play from library, create copy
     */
    const handleAddPlayFromLibrary = useCallback((savedPlay: SavedPlay) => {
        // Requirements: 4.4 - Create copy of library play when adding to session
        // Generate unique ID for this play instance
        // Use JSON.parse(JSON.stringify()) for deep copy to prevent mutations affecting library play
        const playInstance: PlayInSession = {
            id: `play-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            playId: savedPlay.id,
            name: savedPlay.name,
            description: savedPlay.description || "",
            sequence: 0, // Assigned below from the current list (max + 1) so gaps cannot collide
            duration: 10, // Default duration
            instructions: savedPlay.description || "",
            playData: JSON.parse(JSON.stringify(savedPlay.playData)), // Deep copy to prevent library play mutation
            thumbnail: savedPlay.thumbnail || "", // Copy thumbnail from library play
        };

        setPlays((prevPlays) => [
            ...prevPlays,
            { ...playInstance, sequence: nextPlaySequence(prevPlays) },
        ]);
        markDirty();
        setShowLibrary(false); // Close library after adding
    }, [markDirty]);

    /**
     * Handle open library
     * Requirements: 4.3 - Implement add play button to open library
     */
    const handleOpenLibrary = useCallback(() => {
        setShowLibrary(true);
    }, []);

    /**
     * Handle close library
     */
    const handleCloseLibrary = useCallback(() => {
        setShowLibrary(false);
    }, []);

    /**
     * Handle move play up
     * Requirements: 2.5 - Reorder plays, update sequence numbers
     */
    const handleMovePlayUp = useCallback((index: number) => {
        if (index === 0) return;

        setPlays((prevPlays) => {
            const newPlays = [...prevPlays];
            // Swap with previous play
            [newPlays[index - 1], newPlays[index]] = [newPlays[index], newPlays[index - 1]];
            // Update sequence numbers (0-based to match server validation)
            return newPlays.map((play, idx) => ({
                ...play,
                sequence: idx,
            }));
        });
        markDirty();
    }, [markDirty]);

    /**
     * Handle move play down
     * Requirements: 2.5 - Reorder plays, update sequence numbers
     */
    const handleMovePlayDown = useCallback((index: number) => {
        setPlays((prevPlays) => {
            if (index === prevPlays.length - 1) return prevPlays;

            const newPlays = [...prevPlays];
            // Swap with next play
            [newPlays[index], newPlays[index + 1]] = [newPlays[index + 1], newPlays[index]];
            // Update sequence numbers (0-based to match server validation)
            return newPlays.map((play, idx) => ({
                ...play,
                sequence: idx,
            }));
        });
        markDirty();
    }, [markDirty]);

    // Cleanup success timeout on unmount
    useEffect(() => {
        return () => {
            if (successTimeoutRef.current) {
                clearTimeout(successTimeoutRef.current);
            }
        };
    }, []);

    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                p: isMobile ? 2 : 3,
                maxWidth: "1400px",
                margin: "0 auto",
            }}
        >
            {/* Header */}
            <Typography variant="h4" component="h1">
                {sessionId ? "Edit Practice Session" : "Create New Practice Session"}
            </Typography>

            {/* Session Metadata Form */}
            {/* Requirements: 2.1 - Form fields for title, date, and duration */}
            <Paper elevation={2} sx={{ p: 2 }}>
                <Stack spacing={2}>
                    <Typography variant="h6" component="h2">
                        Session Details
                    </Typography>

                    {/* Title Field */}
                    <TextField
                        label="Session Title"
                        value={title}
                        onChange={handleTitleChange}
                        fullWidth
                        required
                        placeholder="Enter session title"
                        inputProps={{ maxLength: 100 }}
                        helperText={
                            validationErrors.title ||
                            `${title.length}/100 characters`
                        }
                        error={!!validationErrors.title}
                    />

                    {/* Date Field */}
                    <DateTimePicker
                        label="Practice Date & Time"
                        value={date}
                        onChange={handleDateChange}
                        disabled={Boolean(booking.selectedReservation)}
                        slotProps={{
                            textField: {
                                fullWidth: true,
                                required: true,
                                sx: { "& .MuiInputBase-root": { minHeight: 44 } },
                                error: !!validationErrors.date,
                                helperText: validationErrors.date,
                            },
                        }}
                    />

                    {/* Duration Field */}
                    {/* Requirements: 2.1 - Duration validation (1-300 minutes) */}
                    <TextField
                        label="Session Duration (minutes)"
                        type="number"
                        value={duration}
                        onChange={handleDurationChange}
                        fullWidth
                        required
                        disabled={Boolean(booking.selectedReservation)}
                        sx={{ "& .MuiInputBase-root": { minHeight: 44 } }}
                        inputProps={{
                            min: VALIDATION_CONSTRAINTS.MIN_DURATION,
                            max: VALIDATION_CONSTRAINTS.MAX_DURATION,
                        }}
                        helperText={
                            validationErrors.duration ||
                            `Duration must be between ${VALIDATION_CONSTRAINTS.MIN_DURATION} and ${VALIDATION_CONSTRAINTS.MAX_DURATION} minutes`
                        }
                        error={!!validationErrors.duration}
                    />

                    {/* Shared Status Indicator */}
                    {/* Requirements: 3.1 - Show shared status indicator */}
                    {isShared && (
                        <Alert severity="info">
                            This session is shared with your team members
                        </Alert>
                    )}
                </Stack>
            </Paper>

            <VenueBookingFields
                booking={booking}
                venues={venues}
                reservations={reservations}
                initialVenueId={initialData?.venueId}
                duration={duration}
                validationErrors={validationErrors}
                disabled={isSaving || isSharing}
            />

            <SessionDrillList
                plays={plays}
                duration={duration}
                editingPlayId={editingPlayId}
                disabled={isSaving || isSharing}
                onOpenLibrary={handleOpenLibrary}
                onDelete={handleDeletePlay}
                onEdit={handleEditPlay}
                onUpdate={handleUpdatePlayInSession}
                onCancelEdit={handleCancelEdit}
                onMoveUp={handleMovePlayUp}
                onMoveDown={handleMovePlayDown}
                canEditDiagram={Boolean(sessionId)}
                onEditDiagram={drillDialog.editDiagram}
                onNewDrill={drillDialog.newDrill}
            />

            {/* Save Status and Actions */}
            <Paper elevation={2} sx={{ p: 2 }}>
                <Stack spacing={2}>
                    {/* Error Message */}
                    {saveError && (
                        <Alert severity="error" onClose={() => setSaveError(null)}>
                            {saveError}
                        </Alert>
                    )}

                    <BookingConflictAlert
                        booking={booking}
                        validationErrors={validationErrors}
                        clearValidationError={clearValidationError}
                        disabled={isSaving || isSharing}
                        onOverride={() => handleSave(true, true)}
                    />

                    {/* Success Message */}
                    {saveSuccess && (
                        <Alert severity="success" onClose={() => setSaveSuccess(false)}>
                            {isShared
                                ? "Session shared successfully!"
                                : "Session saved successfully!"}
                        </Alert>
                    )}

                    {/* Save Status Indicator */}
                    {isSaving && (
                        <Stack direction="row" spacing={1} alignItems="center">
                            <CircularProgress size={16} />
                            <Typography variant="body2" color="text.secondary">
                                Saving...
                            </Typography>
                        </Stack>
                    )}
                    {hasUnsavedChanges && !isSaving && (
                        <Typography variant="body2" color="text.secondary">
                            Unsaved changes
                        </Typography>
                    )}

                    {/* Action Buttons */}
                    <Stack direction="row" spacing={2} justifyContent="flex-end">
                        {onCancel && (
                            <Button
                                variant="outlined"
                                onClick={onCancel}
                                disabled={isSaving || isSharing}
                            >
                                Cancel
                            </Button>
                        )}

                        <Button
                            variant="contained"
                            color="primary"
                            onClick={() => handleSave(false, true)}
                            disabled={isSaving || isSharing || !title.trim()}
                            startIcon={
                                isSaving ? (
                                    <CircularProgress size={20} color="inherit" />
                                ) : (
                                    <SaveIcon />
                                )
                            }
                        >
                            {isSaving ? "Saving..." : "Save Session"}
                        </Button>

                        {/* Share Button */}
                        {/* Requirements: 3.1 - Share button with confirmation */}
                        {sessionId && (
                            <Button
                                variant="contained"
                                color="secondary"
                                onClick={handleOpenShareDialog}
                                disabled={isSaving || isSharing || hasUnsavedChanges}
                                startIcon={
                                    isSharing ? (
                                        <CircularProgress size={20} color="inherit" />
                                    ) : (
                                        <ShareIcon />
                                    )
                                }
                            >
                                {isSharing ? "Sharing..." : isShared ? "Shared" : "Share with Team"}
                            </Button>
                        )}
                    </Stack>
                </Stack>
            </Paper>

            {sessionId && (
                <SessionDrillDialog
                    key={drillDialog.drill?.clientKey ?? "closed"}
                    open={drillDialog.drill !== null}
                    sessionId={sessionId}
                    teamId={teamId}
                    drill={drillDialog.drill}
                    onSaved={drillDialog.onSaved}
                    onClose={drillDialog.close}
                />
            )}

            {/* Play Library Dialog */}
            {/* Requirements: 4.3 - Integrate PlayLibrary component in selection mode */}
            {/* Using MUI Dialog for accessibility: focus trapping, scroll locking, Escape key handling */}
            <Dialog
                open={showLibrary}
                onClose={handleCloseLibrary}
                fullScreen={isMobile}
                maxWidth="lg"
                fullWidth
                aria-labelledby="play-library-dialog-title"
            >
                <DialogTitle id="play-library-dialog-title">
                    <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                    >
                        <Typography variant="h5" component="span">
                            Select Play from Library
                        </Typography>
                        <Button variant="outlined" onClick={handleCloseLibrary}>
                            Close
                        </Button>
                    </Stack>
                </DialogTitle>
                <DialogContent dividers>
                    <PlayLibrary
                        teamId={teamId}
                        onSelectPlay={handleAddPlayFromLibrary}
                        mode="select"
                    />
                </DialogContent>
            </Dialog>

            {/* Share Confirmation Dialog */}
            {/* Requirements: 3.1 - Share button with confirmation */}
            <ShareSessionDialog
                open={showShareDialog}
                isShared={isShared}
                isSharing={isSharing}
                onClose={handleCloseShareDialog}
                onConfirm={handleShare}
            />
        </Box>
    );
}
