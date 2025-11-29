"use client";

/**
 * PlayEditor Component
 *
 * Main editor for creating and editing hockey plays.
 * Integrates RinkBoard, DrawingToolbar, and play metadata form.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 4.1
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
    Box,
    Paper,
    TextField,
    Typography,
    Button,
    CircularProgress,
    Alert,
    Checkbox,
    FormControlLabel,
    Stack,
    useTheme,
    useMediaQuery,
} from "@mui/material";
import { Save as SaveIcon } from "@mui/icons-material";
import { RinkBoard, RinkBoardHandle } from "./RinkBoard";
import { DrawingToolbar } from "./DrawingToolbar";
import { PlayData, DrawingTool, SavedPlay } from "@/types/practice-planner";
import { generateThumbnail } from "@/lib/utils/canvas/thumbnail-generator";

/**
 * Props for the PlayEditor component
 */
export interface PlayEditorProps {
    teamId: string;
    playId?: string;
    initialData?: Partial<SavedPlay>;
    onSave?: (play: SavedPlay) => Promise<void>;
    onCancel?: () => void;
}

/**
 * PlayEditor Component
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4 - Integrate RinkBoard and DrawingToolbar
 */
export function PlayEditor({
    teamId,
    playId,
    initialData,
    onSave,
    onCancel,
}: PlayEditorProps) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));
    const rinkBoardRef = useRef<RinkBoardHandle>(null);

    // Team ID reference for future server actions
    // Currently used to associate plays with teams when saving
    const teamIdRef = useRef(teamId);
    useEffect(() => {
        teamIdRef.current = teamId;
    }, [teamId]);

    // Play metadata state
    const [name, setName] = useState(initialData?.name || "");
    const [description, setDescription] = useState(initialData?.description || "");
    const [isTemplate, setIsTemplate] = useState(initialData?.isTemplate || false);

    // Play data state
    const [playData, setPlayData] = useState<PlayData>(
        initialData?.playData || {
            players: [],
            drawings: [],
            annotations: [],
        }
    );

    // Drawing tool state
    const [selectedTool, setSelectedTool] = useState<DrawingTool>("select");
    const [selectedColor, setSelectedColor] = useState("#000000");
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);

    // Save state
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Auto-save state
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

    /**
     * Handle play data changes
     * Requirements: 1.5 - Track changes for auto-save
     */
    const handlePlayDataChange = useCallback((newData: PlayData) => {
        setPlayData(newData);
        setHasUnsavedChanges(true);
        setSaveSuccess(false);
    }, []);

    /**
     * Handle undo/redo state changes
     * Requirements: 5.5
     */
    const handleUndoRedoStateChange = useCallback((undo: boolean, redo: boolean) => {
        setCanUndo(undo);
        setCanRedo(redo);
    }, []);

    /**
     * Handle undo action
     */
    const handleUndo = useCallback(() => {
        rinkBoardRef.current?.undo();
    }, []);

    /**
     * Handle redo action
     */
    const handleRedo = useCallback(() => {
        rinkBoardRef.current?.redo();
    }, []);

    /**
     * Handle clear action
     */
    const handleClear = useCallback(() => {
        rinkBoardRef.current?.clear();
    }, []);

    /**
     * Handle name change
     */
    const handleNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setName(event.target.value);
        setHasUnsavedChanges(true);
        setSaveSuccess(false);
    };

    /**
     * Handle description change
     */
    const handleDescriptionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setDescription(event.target.value);
        setHasUnsavedChanges(true);
        setSaveSuccess(false);
    };

    /**
     * Handle template checkbox change
     * Requirements: 4.1
     */
    const handleTemplateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setIsTemplate(event.target.checked);
        setHasUnsavedChanges(true);
        setSaveSuccess(false);
    };

    /**
     * Handle save action
     * Requirements: 1.5, 4.1, 4.2
     */
    const handleSave = useCallback(async () => {
        // Validate
        if (!name.trim()) {
            setSaveError("Play name is required");
            return;
        }

        if (name.trim().length > 100) {
            setSaveError("Play name must be 100 characters or less");
            return;
        }

        if (description.length > 500) {
            setSaveError("Description must be 500 characters or less");
            return;
        }

        setIsSaving(true);
        setSaveError(null);
        setSaveSuccess(false);

        try {
            // Generate thumbnail from play data
            // Requirements: 4.2
            let thumbnail = "";
            try {
                thumbnail = generateThumbnail(playData);
            } catch (thumbnailError) {
                console.error("Error generating thumbnail:", thumbnailError);
                // Continue with save even if thumbnail generation fails
            }

            // Create saved play object
            // Requirements: 4.1 - Include isTemplate flag for library saves
            const savedPlay: SavedPlay = {
                id: playId || "",
                name: name.trim(),
                description: description.trim(),
                thumbnail,
                playData,
                isTemplate,
                createdAt: initialData?.createdAt || new Date(),
                updatedAt: new Date(),
            };

            // Call onSave callback if provided
            if (onSave) {
                await onSave(savedPlay);
            }

            setHasUnsavedChanges(false);
            setSaveSuccess(true);

            // Clear success message after 3 seconds
            setTimeout(() => {
                setSaveSuccess(false);
            }, 3000);
        } catch (error) {
            console.error("Error saving play:", error);
            setSaveError(
                error instanceof Error ? error.message : "Failed to save play"
            );
        } finally {
            setIsSaving(false);
        }
    }, [name, description, playData, isTemplate, playId, initialData, onSave]);

    /**
     * Auto-save with debouncing
     * Requirements: 1.5, 4.1
     */
    useEffect(() => {
        // Clear existing timer
        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
        }

        // Only auto-save if there are unsaved changes and we have a playId (editing existing play)
        if (hasUnsavedChanges && playId) {
            autoSaveTimerRef.current = setTimeout(() => {
                handleSave();
            }, 2000); // 2 second debounce
        }

        return () => {
            if (autoSaveTimerRef.current) {
                clearTimeout(autoSaveTimerRef.current);
            }
        };
    }, [hasUnsavedChanges, playId, handleSave]);

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
                {playId ? "Edit Play" : "Create New Play"}
            </Typography>

            {/* Metadata Form */}
            <Paper elevation={2} sx={{ p: 2 }}>
                <Stack spacing={2}>
                    <TextField
                        label="Play Name"
                        value={name}
                        onChange={handleNameChange}
                        fullWidth
                        required
                        placeholder="Enter play name"
                        inputProps={{ maxLength: 100 }}
                        helperText={`${name.length}/100 characters`}
                    />

                    <TextField
                        label="Description"
                        value={description}
                        onChange={handleDescriptionChange}
                        fullWidth
                        multiline
                        rows={3}
                        placeholder="Enter play description (optional)"
                        inputProps={{ maxLength: 500 }}
                        helperText={`${description.length}/500 characters`}
                    />

                    {/* Save to Library Checkbox */}
                    {/* Requirements: 4.1 */}
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={isTemplate}
                                onChange={handleTemplateChange}
                            />
                        }
                        label="Save to play library (reusable template)"
                    />
                </Stack>
            </Paper>

            {/* Drawing Toolbar */}
            <Paper elevation={2} sx={{ p: 2 }}>
                <DrawingToolbar
                    selectedTool={selectedTool}
                    selectedColor={selectedColor}
                    onToolChange={setSelectedTool}
                    onColorChange={setSelectedColor}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    onClear={handleClear}
                    canUndo={canUndo}
                    canRedo={canRedo}
                />
            </Paper>

            {/* Rink Board */}
            {/* Requirements: 1.1, 1.2, 1.3, 1.4 */}
            <Paper elevation={2} sx={{ p: 2 }}>
                <RinkBoard
                    ref={rinkBoardRef}
                    mode="edit"
                    playData={playData}
                    onPlayDataChange={handlePlayDataChange}
                    selectedTool={selectedTool}
                    selectedColor={selectedColor}
                    onUndoRedoStateChange={handleUndoRedoStateChange}
                    height={isMobile ? 400 : 600}
                />
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

                    {/* Success Message */}
                    {saveSuccess && (
                        <Alert severity="success">
                            Play saved successfully!
                        </Alert>
                    )}

                    {/* Save Status Indicator */}
                    {/* Requirements: 1.5, 4.1 - Show save status feedback */}
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
                                disabled={isSaving}
                            >
                                Cancel
                            </Button>
                        )}

                        <Button
                            variant="contained"
                            color="primary"
                            onClick={handleSave}
                            disabled={isSaving || !name.trim()}
                            startIcon={
                                isSaving ? (
                                    <CircularProgress size={20} color="inherit" />
                                ) : (
                                    <SaveIcon />
                                )
                            }
                        >
                            {isSaving ? "Saving..." : "Save Play"}
                        </Button>
                    </Stack>
                </Stack>
            </Paper>
        </Box>
    );
}
