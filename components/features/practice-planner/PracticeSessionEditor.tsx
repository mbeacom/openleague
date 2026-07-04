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
    AlertTitle,
    MenuItem,
    Stack,
    Card,
    CardContent,
    CardMedia,
    CardActions,
    IconButton,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import {
    Save as SaveIcon,
    Share as ShareIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
} from "@mui/icons-material";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import Image from "next/image";
import {
    PracticeSessionData,
    PlayInSession,
    SavedPlay,
    validateSessionDuration,
    VALIDATION_CONSTRAINTS,
} from "@/types/practice-planner";
import type { BookingConflict } from "@/types/segments";
import {
    formatDateTimeInZone,
    formatDateTimeLocalInput,
    parseDateTimeLocalToUtc,
    resolveTimeZone,
} from "@/lib/utils/date";
import { PlayLibrary } from "./PlayLibrary";
import {
    Add as AddIcon,
    ArrowUpward as ArrowUpwardIcon,
    ArrowDownward as ArrowDownwardIcon,
} from "@mui/icons-material";

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
 * Optional venue attachment fields carried alongside the session data
 * on save (feature 006, FR-019). All null when the practice is unbooked.
 */
export interface PracticeVenueAttachment {
    venueId: string | null;
    surfaceId: string | null;
    segmentId: string | null;
    startAt: Date | null;
}

/** Full payload handed to onSave: session data + booking + override flag. */
export interface PracticeSessionSubmitData
    extends PracticeSessionData,
        PracticeVenueAttachment {
    overrideConflicts: boolean;
}

/**
 * Structured save outcome so the editor can distinguish venue booking
 * conflicts (warn + "Book anyway", FR-019/US5) from ordinary errors.
 */
export type PracticeSessionSaveResult =
    | { success: true }
    | { success: false; error: string; conflicts?: BookingConflict[] };

/**
 * Pull booking conflicts out of an ActionResult's `details` payload
 * (same shape season games return — details.conflicts).
 */
export function extractBookingConflicts(details: unknown): BookingConflict[] | undefined {
    if (details && typeof details === "object" && "conflicts" in details) {
        const conflicts = (details as { conflicts: unknown }).conflicts;
        if (Array.isArray(conflicts) && conflicts.length > 0) {
            return conflicts as BookingConflict[];
        }
    }
    return undefined;
}

/**
 * Props for the PracticeSessionEditor component
 */
export interface PracticeSessionEditorProps {
    sessionId?: string;
    teamId: string;
    initialData?: Partial<PracticeSessionData> & Partial<PracticeVenueAttachment>;
    /** Venues available for the optional ice booking (feature 006). */
    venues?: VenueBookingOption[];
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
 * Props for the PlayCard component
 */
interface PlayCardProps {
    play: PlayInSession;
    index: number;
    totalPlays: number;
    isEditing: boolean;
    onDelete: (playId: string) => void;
    onEdit: (playId: string) => void;
    onUpdate: (playId: string, updates: Partial<PlayInSession>) => void;
    onCancelEdit: () => void;
    onMoveUp: (index: number) => void;
    onMoveDown: (index: number) => void;
}

/**
 * PlayCard Component
 *
 * Individual play card showing thumbnail, duration, and instructions
 * Requirements: 2.2, 2.4, 2.5
 */
function PlayCard({
    play,
    index,
    totalPlays,
    isEditing,
    onDelete,
    onEdit,
    onUpdate,
    onCancelEdit,
    onMoveUp,
    onMoveDown,
}: PlayCardProps) {
    // Local state for editing
    const [editDuration, setEditDuration] = useState(play.duration);
    const [editInstructions, setEditInstructions] = useState(play.instructions);

    // Get thumbnail from play instance (copied from library play when added)
    const thumbnail = play.thumbnail || "";

    /**
     * Handle save edits
     * Requirements: 2.4 - Save inline edits
     */
    const handleSaveEdits = () => {
        onUpdate(play.id, {
            duration: editDuration,
            instructions: editInstructions,
        });
    };

    /**
     * Handle cancel edits
     */
    const handleCancelEdits = () => {
        setEditDuration(play.duration);
        setEditInstructions(play.instructions);
        onCancelEdit();
    };

    return (
        <Card
            sx={{
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                gap: 2,
            }}
        >
            {/* Thumbnail */}
            <CardMedia
                component="div"
                sx={{
                    width: { xs: "100%", sm: 200 },
                    height: { xs: 150, sm: 120 },
                    bgcolor: "grey.100",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                    flexShrink: 0,
                }}
            >
                {thumbnail ? (
                    <Image
                        src={thumbnail}
                        alt={`Play ${index + 1}`}
                        fill
                        style={{ objectFit: "contain" }}
                        unoptimized
                    />
                ) : (
                    <Typography variant="body2" color="text.secondary">
                        Play {index + 1}
                    </Typography>
                )}
                <Chip
                    label={`#${index + 1}`}
                    color="primary"
                    size="small"
                    sx={{
                        position: "absolute",
                        top: 8,
                        left: 8,
                    }}
                />
            </CardMedia>

            {/* Content */}
            <CardContent sx={{ flexGrow: 1, py: 1 }}>
                <Stack spacing={1}>
                    <Typography variant="h6" component="h3">
                        Play {index + 1}
                    </Typography>

                    {/* Duration - Editable */}
                    {/* Requirements: 2.4 - Duration input for each play */}
                    {isEditing ? (
                        <TextField
                            label="Duration (minutes)"
                            type="number"
                            value={editDuration}
                            onChange={(e) => setEditDuration(parseInt(e.target.value, 10) || 0)}
                            size="small"
                            inputProps={{
                                min: VALIDATION_CONSTRAINTS.MIN_DURATION,
                                max: VALIDATION_CONSTRAINTS.MAX_DURATION,
                            }}
                            fullWidth
                        />
                    ) : (
                        <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="body2" color="text.secondary">
                                Duration:
                            </Typography>
                            <Typography variant="body2" fontWeight="medium">
                                {play.duration} minutes
                            </Typography>
                        </Stack>
                    )}

                    {/* Instructions - Editable */}
                    {/* Requirements: 2.4 - Inline editor for play instructions */}
                    {isEditing ? (
                        <TextField
                            label="Instructions"
                            value={editInstructions}
                            onChange={(e) => setEditInstructions(e.target.value)}
                            multiline
                            rows={3}
                            size="small"
                            fullWidth
                            inputProps={{ maxLength: 500 }}
                            helperText={`${editInstructions.length}/500 characters`}
                        />
                    ) : (
                        play.instructions && (
                            <Box>
                                <Typography variant="body2" color="text.secondary" gutterBottom>
                                    Instructions:
                                </Typography>
                                <Typography
                                    variant="body2"
                                    sx={{
                                        display: "-webkit-box",
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: "vertical",
                                        overflow: "hidden",
                                    }}
                                >
                                    {play.instructions}
                                </Typography>
                            </Box>
                        )
                    )}

                    {/* Edit Actions */}
                    {isEditing && (
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Button size="small" onClick={handleCancelEdits}>
                                Cancel
                            </Button>
                            <Button
                                size="small"
                                variant="contained"
                                onClick={handleSaveEdits}
                            >
                                Save
                            </Button>
                        </Stack>
                    )}
                </Stack>
            </CardContent>

            {/* Actions */}
            {!isEditing && (
                <CardActions sx={{ flexDirection: "column", justifyContent: "center", p: 1, gap: 0.5 }}>
                    {/* Requirements: 2.5 - Reordering controls */}
                    <IconButton
                        size="small"
                        onClick={() => onMoveUp(index)}
                        disabled={index === 0}
                        aria-label={`Move play ${index + 1} up`}
                    >
                        <ArrowUpwardIcon />
                    </IconButton>
                    <IconButton
                        size="small"
                        onClick={() => onMoveDown(index)}
                        disabled={index === totalPlays - 1}
                        aria-label={`Move play ${index + 1} down`}
                    >
                        <ArrowDownwardIcon />
                    </IconButton>
                    <IconButton
                        size="small"
                        color="primary"
                        onClick={() => onEdit(play.id)}
                        aria-label={`Edit play ${index + 1}`}
                    >
                        <EditIcon />
                    </IconButton>
                    <IconButton
                        size="small"
                        color="error"
                        onClick={() => onDelete(play.id)}
                        aria-label={`Delete play ${index + 1}`}
                    >
                        <DeleteIcon />
                    </IconButton>
                </CardActions>
            )}
        </Card>
    );
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

    // Ice booking state (feature 006, FR-019): optional venue attachment.
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
    const handleSaveRef = useRef<((overrideConflicts?: boolean) => Promise<void>) | undefined>(undefined);

    // Timezone the booking start time is entered in (the venue's zone,
    // matching GameForm's wall-clock handling).
    const selectedVenueTimeZone = resolveTimeZone(
        venues.find((venue) => venue.id === venueId)?.timezone
    );

    /**
     * Validate form fields
     * Requirements: 2.1 - Form validation for required fields
     */
    const validateForm = useCallback((): boolean => {
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
        if (venueId && !startTime) {
            errors.startTime = "Start time is required when booking a venue";
        }

        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    }, [title, date, duration, venueId, startTime]);

    /**
     * Handle title change
     */
    const handleTitleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setTitle(event.target.value);
        setHasUnsavedChanges(true);
        setSaveSuccess(false);
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
        setHasUnsavedChanges(true);
        setSaveSuccess(false);
        // The booking slot follows the practice date — stale conflicts no longer apply.
        setBookingConflicts(null);
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
            setHasUnsavedChanges(true);
            setSaveSuccess(false);
            // The booking slot length follows the duration — stale conflicts no longer apply.
            setBookingConflicts(null);
            // Clear duration error when user changes duration
            if (validationErrors.duration) {
                setValidationErrors((prev) =>
                    Object.fromEntries(Object.entries(prev).filter(([key]) => key !== "duration"))
                );
            }
        }
    };

    /**
     * Ice booking handlers (feature 006, FR-019).
     * Changing the venue resets surface/segment (they belong to a venue —
     * stale selections would be rejected server-side, matching GameForm).
     */
    const handleVenueChange = (nextVenueId: string) => {
        setVenueId(nextVenueId);
        setSurfaceId("");
        setSegmentId("");
        setBookingConflicts(null);
        setHasUnsavedChanges(true);
        setSaveSuccess(false);
    };

    const handleSurfaceChange = (nextSurfaceId: string) => {
        setSurfaceId(nextSurfaceId);
        // Segments belong to a surface — reset on surface change.
        setSegmentId("");
        setBookingConflicts(null);
        setHasUnsavedChanges(true);
        setSaveSuccess(false);
    };

    const handleSegmentChange = (nextSegmentId: string) => {
        setSegmentId(nextSegmentId);
        setBookingConflicts(null);
        setHasUnsavedChanges(true);
        setSaveSuccess(false);
    };

    const handleStartTimeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setStartTime(event.target.value);
        setBookingConflicts(null);
        setHasUnsavedChanges(true);
        setSaveSuccess(false);
        if (validationErrors.startTime) {
            setValidationErrors((prev) =>
                Object.fromEntries(Object.entries(prev).filter(([key]) => key !== "startTime"))
            );
        }
    };

    /**
     * Detach the practice from the venue entirely: on save the practice
     * loses its availability footprint and behaves exactly as before.
     */
    const handleClearBooking = () => {
        setVenueId("");
        setSurfaceId("");
        setSegmentId("");
        setStartTime("");
        setBookingConflicts(null);
        setHasUnsavedChanges(true);
        setSaveSuccess(false);
        if (validationErrors.startTime) {
            setValidationErrors((prev) =>
                Object.fromEntries(Object.entries(prev).filter(([key]) => key !== "startTime"))
            );
        }
    };

    /**
     * Handle save action
     * Requirements: 2.1 - Save session metadata
     * FR-019: pass `overrideConflicts: true` (via "Book anyway") to save
     * despite venue booking conflicts.
     */
    const handleSave = useCallback(async (overrideConflicts: boolean = false) => {
        // Validate form (includes date validation)
        if (!validateForm()) {
            setSaveError("Please fix the validation errors");
            return;
        }

        // TypeScript narrowing: after validateForm() passes, date is guaranteed to be non-null
        if (!date) return;

        // Combine the practice date with the entered wall-clock start time in
        // the venue's timezone to form the booking instant (FR-019).
        let startAt: Date | null = null;
        if (venueId) {
            const pad = (value: number) => String(value).padStart(2, "0");
            const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
            startAt = parseDateTimeLocalToUtc(`${dateStr}T${startTime}`, selectedVenueTimeZone);
            if (!startAt) {
                setValidationErrors((prev) => ({
                    ...prev,
                    startTime: "Enter a valid start time",
                }));
                setSaveError("Please fix the validation errors");
                return;
            }
        }

        setIsSaving(true);
        setSaveError(null);
        setSaveSuccess(false);
        setBookingConflicts(null);

        try {
            // Create session data object (plus optional venue booking)
            const sessionData: PracticeSessionSubmitData = {
                id: sessionId,
                title: title.trim(),
                date,
                duration,
                plays,
                isShared,
                venueId: venueId || null,
                surfaceId: venueId ? surfaceId || null : null,
                segmentId: venueId && surfaceId ? segmentId || null : null,
                startAt,
                overrideConflicts,
            };

            // Call onSave callback if provided
            const result: PracticeSessionSaveResult = onSave
                ? await onSave(sessionData)
                : { success: true };

            if (!result.success) {
                if (result.conflicts && result.conflicts.length > 0) {
                    // FR-019/US5: warn and let the coach explicitly book anyway.
                    setBookingConflicts(result.conflicts);
                } else {
                    setSaveError(result.error);
                }
                return;
            }

            setHasUnsavedChanges(false);
            setSaveSuccess(true);

            // Clear success message after 3 seconds
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
        }
    }, [
        title,
        date,
        duration,
        plays,
        isShared,
        sessionId,
        venueId,
        surfaceId,
        segmentId,
        startTime,
        selectedVenueTimeZone,
        onSave,
        validateForm,
    ]);

    // Keep handleSaveRef updated with latest handleSave function
    useEffect(() => {
        handleSaveRef.current = handleSave;
    }, [handleSave]);

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
     * Calculate total play time
     * Requirements: 2.3 - Display total session time
     */
    const calculateTotalPlayTime = useCallback((): number => {
        return plays.reduce((sum, play) => sum + play.duration, 0);
    }, [plays]);

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
        setHasUnsavedChanges(true);
        setSaveSuccess(false);
    }, []);

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
            setHasUnsavedChanges(true);
            setSaveSuccess(false);
            setEditingPlayId(null);
        },
        []
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
            sequence: plays.length, // Requirements: 2.2 - Assign sequence number automatically (0-based)
            duration: 10, // Default duration
            instructions: savedPlay.description || "",
            playData: JSON.parse(JSON.stringify(savedPlay.playData)), // Deep copy to prevent library play mutation
            thumbnail: savedPlay.thumbnail || "", // Copy thumbnail from library play
        };

        setPlays((prevPlays) => [...prevPlays, playInstance]);
        setHasUnsavedChanges(true);
        setSaveSuccess(false);
        setShowLibrary(false); // Close library after adding
    }, [plays.length]);

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
        setHasUnsavedChanges(true);
        setSaveSuccess(false);
    }, []);

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
        setHasUnsavedChanges(true);
        setSaveSuccess(false);
    }, []);

    // Cleanup success timeout on unmount
    useEffect(() => {
        return () => {
            if (successTimeoutRef.current) {
                clearTimeout(successTimeoutRef.current);
            }
        };
    }, []);

    // Ice booking option lists for the currently selected venue/surface (006).
    const venueSurfaces = venueId ? (surfacesByVenue[venueId] ?? []) : [];
    const surfaceSegments = surfaceId ? (segmentsBySurface[surfaceId] ?? []) : [];
    const wholeSurfaceLabel = (surfaceId && wholeLabelBySurface[surfaceId]) || "Whole surface";

    return (
        <LocalizationProvider dateAdapter={AdapterDateFns}>
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
                            slotProps={{
                                textField: {
                                    fullWidth: true,
                                    required: true,
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

                {/* Ice Booking (feature 006, FR-019) */}
                {/* Optional venue attachment: venue → surface → segment + start time. */}
                {venues.length > 0 && (
                    <Paper elevation={2} sx={{ p: 2 }}>
                        <Stack spacing={2}>
                            <Stack
                                direction="row"
                                justifyContent="space-between"
                                alignItems="center"
                            >
                                <Typography variant="h6" component="h2">
                                    Ice Booking (optional)
                                </Typography>
                                {venueId && (
                                    <Button
                                        size="small"
                                        color="inherit"
                                        onClick={handleClearBooking}
                                        disabled={isSaving || isSharing}
                                    >
                                        Clear booking
                                    </Button>
                                )}
                            </Stack>
                            <Typography variant="body2" color="text.secondary">
                                Book a venue for this practice so it appears on the venue&apos;s
                                schedule and other bookings warn against it.
                            </Typography>
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                                <TextField
                                    select
                                    label="Venue"
                                    fullWidth
                                    value={venueId}
                                    onChange={(event) => handleVenueChange(event.target.value)}
                                >
                                    <MenuItem value="">No venue booking</MenuItem>
                                    {venues.map((venue) => (
                                        <MenuItem key={venue.id} value={venue.id}>
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
                        </Stack>
                    </Paper>
                )}

                {/* Play List Management */}
                {/* Requirements: 2.2, 2.3 - List view for plays in session */}
                <Paper elevation={2} sx={{ p: 2 }}>
                    <Stack spacing={2}>
                        <Stack
                            direction="row"
                            justifyContent="space-between"
                            alignItems="center"
                        >
                            <Typography variant="h6" component="h2">
                                Plays in Session
                            </Typography>
                            {/* Requirements: 4.3 - Add play button to open library */}
                            <Button
                                variant="outlined"
                                startIcon={<AddIcon />}
                                onClick={handleOpenLibrary}
                                disabled={isSaving || isSharing}
                            >
                                Add Play
                            </Button>
                        </Stack>

                        {/* Total Session Time */}
                        {/* Requirements: 2.3 - Display total session time with validation */}
                        {plays.length > 0 && (
                            <Box>
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <Typography variant="body2" color="text.secondary">
                                        Total Play Time: {calculateTotalPlayTime()} minutes
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Session Duration: {duration} minutes
                                    </Typography>
                                </Stack>
                                {/* Requirements: 2.3 - Show warning when total exceeds session duration */}
                                {calculateTotalPlayTime() > duration && (
                                    <Alert severity="warning" sx={{ mt: 1 }}>
                                        Total play time ({calculateTotalPlayTime()} min) exceeds
                                        session duration ({duration} min)
                                    </Alert>
                                )}
                            </Box>
                        )}

                        {/* Empty State */}
                        {plays.length === 0 && (
                            <Box
                                sx={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    minHeight: 200,
                                    textAlign: "center",
                                    p: 3,
                                }}
                            >
                                <Typography variant="h6" color="text.secondary" gutterBottom>
                                    No plays added yet
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Add plays from your library to build your practice session
                                </Typography>
                            </Box>
                        )}

                        {/* Play Cards */}
                        {/* Requirements: 2.2 - Play card showing thumbnail, duration, and instructions */}
                        {plays.length > 0 && (
                            <Stack spacing={2}>
                                {plays.map((play, index) => (
                                    <PlayCard
                                        key={play.id}
                                        play={play}
                                        index={index}
                                        totalPlays={plays.length}
                                        isEditing={editingPlayId === play.id}
                                        onDelete={handleDeletePlay}
                                        onEdit={handleEditPlay}
                                        onUpdate={handleUpdatePlayInSession}
                                        onCancelEdit={handleCancelEdit}
                                        onMoveUp={handleMovePlayUp}
                                        onMoveDown={handleMovePlayDown}
                                    />
                                ))}
                            </Stack>
                        )}
                    </Stack>
                </Paper>

                {/* Save Status and Actions */}
                <Paper elevation={2} sx={{ p: 2 }}>
                    <Stack spacing={2}>
                        {/* Error Message */}
                        {saveError && (
                            <Alert severity="error" onClose={() => setSaveError(null)}>
                                {saveError}
                            </Alert>
                        )}

                        {/* Venue booking conflicts (FR-019/US5): warn and allow an
                            explicit override that resubmits with overrideConflicts. */}
                        {bookingConflicts && (
                            <Alert
                                severity="warning"
                                action={
                                    <Button
                                        color="inherit"
                                        size="small"
                                        disabled={isSaving || isSharing}
                                        onClick={() => handleSave(true)}
                                    >
                                        Book anyway
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
                            </Alert>
                        )}

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
                                onClick={() => handleSave()}
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
                <Dialog
                    open={showShareDialog}
                    onClose={handleCloseShareDialog}
                    aria-labelledby="share-dialog-title"
                    aria-describedby="share-dialog-description"
                >
                    <DialogTitle id="share-dialog-title">
                        Share Practice Session?
                    </DialogTitle>
                    <DialogContent>
                        <DialogContentText id="share-dialog-description">
                            This will share the practice session with all team members. They
                            will receive an email notification with a link to view the
                            session.
                            {isShared && (
                                <>
                                    <br />
                                    <br />
                                    <strong>
                                        Note: This session is already shared. Sharing again will
                                        send update notifications to team members.
                                    </strong>
                                </>
                            )}
                        </DialogContentText>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleCloseShareDialog} disabled={isSharing}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleShare}
                            color="primary"
                            variant="contained"
                            disabled={isSharing}
                            startIcon={
                                isSharing ? (
                                    <CircularProgress size={20} color="inherit" />
                                ) : (
                                    <ShareIcon />
                                )
                            }
                        >
                            {isSharing ? "Sharing..." : "Share"}
                        </Button>
                    </DialogActions>
                </Dialog>
            </Box>
        </LocalizationProvider>
    );
}
