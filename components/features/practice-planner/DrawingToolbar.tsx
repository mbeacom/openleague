"use client";

/**
 * DrawingToolbar Component
 *
 * Provides tool selection and drawing options for the RinkBoard component.
 * Includes tool buttons, color picker, undo/redo, and clear canvas functionality.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import React, { useState } from "react";
import {
    Box,
    ToggleButtonGroup,
    ToggleButton,
    IconButton,
    Tooltip,
    Popover,
    Stack,
    useTheme,
    useMediaQuery,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
} from "@mui/material";
import {
    PanTool as SelectIcon,
    PersonAdd as PlayerIcon,
    Timeline as LineIcon,
    ShowChart as CurveIcon,
    ArrowForward as ArrowIcon,
    TextFields as TextIcon,
    Delete as EraserIcon,
    Undo as UndoIcon,
    Redo as RedoIcon,
    Clear as ClearIcon,
    Palette as PaletteIcon,
} from "@mui/icons-material";
import { DrawingTool } from "@/types/practice-planner";

/**
 * Props for the DrawingToolbar component
 */
export interface DrawingToolbarProps {
    selectedTool: DrawingTool;
    selectedColor: string;
    onToolChange: (tool: DrawingTool) => void;
    onColorChange: (color: string) => void;
    onUndo: () => void;
    onRedo: () => void;
    onClear: () => void;
    canUndo: boolean;
    canRedo: boolean;
}

/**
 * Predefined color palette for drawing
 * Requirements: 5.2
 */
const COLOR_PALETTE = [
    "#000000", // Black
    "#FF0000", // Red
    "#0000FF", // Blue
    "#00FF00", // Green
    "#FFFF00", // Yellow
    "#FF00FF", // Magenta
    "#00FFFF", // Cyan
    "#FFA500", // Orange
    "#800080", // Purple
    "#FFFFFF", // White
];

/**
 * DrawingToolbar Component
 *
 * Requirements: 5.1 - Tool selection for line and curve tools
 * Requirements: 5.2 - Color selection for drawings
 * Requirements: 5.3 - Clear canvas functionality
 * Requirements: 5.4 - Eraser tool
 * Requirements: 5.5 - Undo/redo functionality
 */
export function DrawingToolbar({
    selectedTool,
    selectedColor,
    onToolChange,
    onColorChange,
    onUndo,
    onRedo,
    onClear,
    canUndo,
    canRedo,
}: DrawingToolbarProps) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));

    // State for color picker popover
    const [colorAnchorEl, setColorAnchorEl] = useState<HTMLButtonElement | null>(null);
    const colorPickerOpen = Boolean(colorAnchorEl);

    // State for clear confirmation dialog
    // Requirements: 5.3
    const [clearDialogOpen, setClearDialogOpen] = useState(false);

    /**
     * Handle tool selection
     * Requirements: 5.1, 5.4
     */
    const handleToolChange = (
        _event: React.MouseEvent<HTMLElement>,
        newTool: DrawingTool | null
    ) => {
        if (newTool !== null) {
            onToolChange(newTool);
        }
    };

    /**
     * Handle color picker button click
     * Requirements: 5.2
     */
    const handleColorPickerClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        setColorAnchorEl(event.currentTarget);
    };

    /**
     * Handle color picker close
     */
    const handleColorPickerClose = () => {
        setColorAnchorEl(null);
    };

    /**
     * Handle color selection
     * Requirements: 5.2
     */
    const handleColorSelect = (color: string) => {
        onColorChange(color);
        handleColorPickerClose();
    };

    /**
     * Handle clear button click - show confirmation dialog
     * Requirements: 5.3
     */
    const handleClearClick = () => {
        setClearDialogOpen(true);
    };

    /**
     * Handle clear confirmation
     * Requirements: 5.3
     */
    const handleClearConfirm = () => {
        onClear();
        setClearDialogOpen(false);
    };

    /**
     * Handle clear cancellation
     */
    const handleClearCancel = () => {
        setClearDialogOpen(false);
    };

    return (
        <>
            <Box
                sx={{
                    display: "flex",
                    flexDirection: isMobile ? "column" : "row",
                    gap: 2,
                    padding: 2,
                    backgroundColor: theme.palette.background.paper,
                    borderRadius: 1,
                    boxShadow: 1,
                    flexWrap: "wrap",
                    alignItems: isMobile ? "stretch" : "center",
                }}
            >
                {/* Drawing Tools */}
                {/* Requirements: 5.1 - Tool selection buttons with active state */}
                <ToggleButtonGroup
                    value={selectedTool}
                    exclusive
                    onChange={handleToolChange}
                    aria-label="drawing tools"
                    size={isMobile ? "small" : "medium"}
                    sx={{
                        flexWrap: isMobile ? "wrap" : "nowrap",
                    }}
                >
                    <ToggleButton value="select" aria-label="select tool">
                        <Tooltip title="Select">
                            <SelectIcon />
                        </Tooltip>
                    </ToggleButton>
                    <ToggleButton value="player" aria-label="player tool">
                        <Tooltip title="Add Player">
                            <PlayerIcon />
                        </Tooltip>
                    </ToggleButton>
                    <ToggleButton value="line" aria-label="line tool">
                        <Tooltip title="Draw Line">
                            <LineIcon />
                        </Tooltip>
                    </ToggleButton>
                    <ToggleButton value="curve" aria-label="curve tool">
                        <Tooltip title="Draw Curve">
                            <CurveIcon />
                        </Tooltip>
                    </ToggleButton>
                    <ToggleButton value="arrow" aria-label="arrow tool">
                        <Tooltip title="Draw Arrow">
                            <ArrowIcon />
                        </Tooltip>
                    </ToggleButton>
                    <ToggleButton value="text" aria-label="text tool">
                        <Tooltip title="Add Text">
                            <TextIcon />
                        </Tooltip>
                    </ToggleButton>
                    <ToggleButton value="eraser" aria-label="eraser tool">
                        <Tooltip title="Eraser">
                            <EraserIcon />
                        </Tooltip>
                    </ToggleButton>
                </ToggleButtonGroup>

                {/* Color Picker */}
                {/* Requirements: 5.2 - Color picker for drawing colors */}
                <Tooltip title="Choose Color">
                    <IconButton
                        onClick={handleColorPickerClick}
                        aria-label="color picker"
                        sx={{
                            border: `2px solid ${selectedColor}`,
                            backgroundColor: selectedColor,
                            "&:hover": {
                                backgroundColor: selectedColor,
                                opacity: 0.8,
                            },
                        }}
                    >
                        <PaletteIcon
                            sx={{
                                color:
                                    selectedColor === "#FFFFFF" || selectedColor === "#FFFF00"
                                        ? "#000000"
                                        : "#FFFFFF",
                            }}
                        />
                    </IconButton>
                </Tooltip>

                {/* Undo/Redo Buttons */}
                {/* Requirements: 5.5 - Undo/redo buttons with disabled states */}
                <Stack direction="row" spacing={1}>
                    <Tooltip title="Undo (Ctrl+Z)">
                        <span>
                            <IconButton
                                onClick={onUndo}
                                disabled={!canUndo}
                                aria-label="undo"
                                size={isMobile ? "small" : "medium"}
                            >
                                <UndoIcon />
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Tooltip title="Redo (Ctrl+Shift+Z)">
                        <span>
                            <IconButton
                                onClick={onRedo}
                                disabled={!canRedo}
                                aria-label="redo"
                                size={isMobile ? "small" : "medium"}
                            >
                                <RedoIcon />
                            </IconButton>
                        </span>
                    </Tooltip>
                </Stack>

                {/* Clear Canvas Button */}
                {/* Requirements: 5.3 - Clear canvas button with confirmation */}
                <Tooltip title="Clear Canvas">
                    <IconButton
                        onClick={handleClearClick}
                        aria-label="clear canvas"
                        color="error"
                        size={isMobile ? "small" : "medium"}
                    >
                        <ClearIcon />
                    </IconButton>
                </Tooltip>
            </Box>

            {/* Color Picker Popover */}
            {/* Requirements: 5.2 - Color selection interface */}
            <Popover
                open={colorPickerOpen}
                anchorEl={colorAnchorEl}
                onClose={handleColorPickerClose}
                anchorOrigin={{
                    vertical: "bottom",
                    horizontal: "center",
                }}
                transformOrigin={{
                    vertical: "top",
                    horizontal: "center",
                }}
            >
                <Box sx={{ p: 2 }}>
                    <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ maxWidth: 200 }}>
                        {COLOR_PALETTE.map((color) => (
                            <IconButton
                                key={color}
                                onClick={() => handleColorSelect(color)}
                                sx={{
                                    width: 40,
                                    height: 40,
                                    backgroundColor: color,
                                    border:
                                        color === selectedColor
                                            ? "3px solid #000"
                                            : "1px solid #ccc",
                                    "&:hover": {
                                        backgroundColor: color,
                                        opacity: 0.8,
                                    },
                                }}
                                aria-label={`select color ${color}`}
                            />
                        ))}
                    </Stack>
                </Box>
            </Popover>

            {/* Clear Confirmation Dialog */}
            {/* Requirements: 5.3 - Confirmation dialog for clear action */}
            <Dialog
                open={clearDialogOpen}
                onClose={handleClearCancel}
                aria-labelledby="clear-dialog-title"
            >
                <DialogTitle id="clear-dialog-title">Clear Canvas?</DialogTitle>
                <DialogContent>
                    Are you sure you want to clear all drawings? This action cannot be undone.
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleClearCancel} color="primary">
                        Cancel
                    </Button>
                    <Button onClick={handleClearConfirm} color="error" variant="contained">
                        Clear
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
