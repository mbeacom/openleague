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
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import {
    PanTool as SelectIcon,
    PersonAdd as PlayerIcon,
    Timeline as MovementIcon,
    SportsHockey as EquipmentIcon,
    TextFields as TextIcon,
    Delete as EraserIcon,
    Undo as UndoIcon,
    Redo as RedoIcon,
    Clear as ClearIcon,
    Palette as PaletteIcon,
} from "@mui/icons-material";
import {
    DrawingTool,
    PLAYER_ROLES,
    STROKE_ACTIONS,
    STROKE_PATHS,
    STROKE_ENDS,
    EQUIPMENT_KINDS,
    PlayerRole,
    EquipmentKind,
    StrokeOptions,
} from "@/types/practice-planner";
import {
    ROLE_LABELS,
    ACTION_LABELS,
    END_LABELS,
    EQUIPMENT_LABELS,
    DEFAULT_END_FOR_ACTION,
} from "@/lib/utils/canvas/notation";
import { OptionGroup, OPTION_SX, TOUCH_TARGET_SX, FOCUS_RING_SX } from "./OptionGroup";

export { OPTION_SX, TOUCH_TARGET_SX };

/** Tool and action buttons: 44px touch target plus the shared focus ring. */
const TOOL_BUTTON_SX = { ...TOUCH_TARGET_SX, ...FOCUS_RING_SX } as const;

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
    playerRole: PlayerRole;
    onPlayerRoleChange: (role: PlayerRole) => void;
    strokeOptions: StrokeOptions;
    onStrokeOptionsChange: (options: StrokeOptions) => void;
    equipmentKind: EquipmentKind;
    onEquipmentKindChange: (kind: EquipmentKind) => void;
}

/**
 * Calculate relative luminance of a color for contrast decisions
 * Uses WCAG 2.0 formula: https://www.w3.org/TR/WCAG20/#relativeluminancedef
 * @param hexColor - Hex color string (e.g., "#FFFFFF")
 * @returns Relative luminance value between 0 (black) and 1 (white)
 */
function getRelativeLuminance(hexColor: string): number {
    // Remove # if present
    const hex = hexColor.replace("#", "");

    // Parse RGB components
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    // Apply gamma correction
    const toLinear = (c: number) =>
        c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

    const rLinear = toLinear(r);
    const gLinear = toLinear(g);
    const bLinear = toLinear(b);

    // Calculate relative luminance
    return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

/**
 * Get contrasting text color (black or white) based on background luminance
 * @param backgroundColor - Hex color of the background
 * @returns "#000000" for light backgrounds, "#FFFFFF" for dark backgrounds
 */
function getContrastingColor(backgroundColor: string): string {
    const luminance = getRelativeLuminance(backgroundColor);
    // Use 0.5 as threshold (midpoint between black=0 and white=1)
    return luminance > 0.5 ? "#000000" : "#FFFFFF";
}

/**
 * Predefined color palette for drawing
 * Requirements: 5.2
 */
const COLOR_PALETTE = [
    "#212121",
    "#0D47A1",
    "#1976D2",
    "#D32F2F",
    "#2E7D32",
    "#F57C00",
    "#6A1B9A",
    "#FFFFFF",
];

/**
 * DrawingToolbar Component
 *
 * Requirements: 5.1 - Tool selection for players, strokes, equipment, and text
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
    playerRole,
    onPlayerRoleChange,
    strokeOptions,
    onStrokeOptionsChange,
    equipmentKind,
    onEquipmentKindChange,
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
                    // A token, not theme.palette.background.paper: under
                    // cssVariables the JS palette always holds the LIGHT
                    // literal (#FFFFFF), which painted a white box behind the
                    // dark scheme's white icons.
                    bgcolor: "background.paper",
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
                    <Tooltip title="Select">
                        <ToggleButton value="select" aria-label="select tool" sx={TOOL_BUTTON_SX}>
                            <SelectIcon />
                        </ToggleButton>
                    </Tooltip>
                    <Tooltip title="Add Player">
                        <ToggleButton value="player" aria-label="player tool" sx={TOOL_BUTTON_SX}>
                            <PlayerIcon />
                        </ToggleButton>
                    </Tooltip>
                    <Tooltip title="Movement">
                        <ToggleButton value="stroke" aria-label="movement tool" sx={TOOL_BUTTON_SX}>
                            <MovementIcon />
                        </ToggleButton>
                    </Tooltip>
                    <Tooltip title="Equipment">
                        <ToggleButton value="equipment" aria-label="equipment tool" sx={TOOL_BUTTON_SX}>
                            <EquipmentIcon />
                        </ToggleButton>
                    </Tooltip>
                    <Tooltip title="Add Text">
                        <ToggleButton value="text" aria-label="text tool" sx={TOOL_BUTTON_SX}>
                            <TextIcon />
                        </ToggleButton>
                    </Tooltip>
                    <Tooltip title="Eraser">
                        <ToggleButton value="eraser" aria-label="eraser tool" sx={TOOL_BUTTON_SX}>
                            <EraserIcon />
                        </ToggleButton>
                    </Tooltip>
                </ToggleButtonGroup>

                {/* Color Picker */}
                {/* Requirements: 5.2 - Color picker for drawing colors */}
                <Tooltip title="Choose Color">
                    <IconButton
                        onClick={handleColorPickerClick}
                        aria-label="color picker"
                        sx={{
                            ...TOOL_BUTTON_SX,
                            // The swatch fill alone can vanish into the paper
                            // (#212121 on dark, #FFFFFF on light); the ring
                            // keeps the control's edge at >=3:1 in both.
                            border: "2px solid",
                            borderColor: "text.secondary",
                            backgroundColor: selectedColor,
                            "&:hover": {
                                backgroundColor: selectedColor,
                                opacity: 0.8,
                            },
                        }}
                    >
                        <PaletteIcon
                            sx={{
                                color: getContrastingColor(selectedColor),
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
                                sx={TOOL_BUTTON_SX}
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
                                sx={TOOL_BUTTON_SX}
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
                        sx={TOOL_BUTTON_SX}
                    >
                        <ClearIcon />
                    </IconButton>
                </Tooltip>
            </Box>

            {selectedTool === "player" && (
                <Box sx={{ mt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
                    <OptionGroup label="player role" value={playerRole} options={PLAYER_ROLES} labels={ROLE_LABELS} onChange={onPlayerRoleChange} />
                </Box>
            )}
            {selectedTool === "stroke" && (
                <Box sx={{ mt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
                    <OptionGroup
                        label="stroke action"
                        value={strokeOptions.action}
                        options={STROKE_ACTIONS}
                        labels={ACTION_LABELS}
                        onChange={(action) => onStrokeOptionsChange({ ...strokeOptions, action, end: DEFAULT_END_FOR_ACTION[action] })}
                    />
                    <OptionGroup
                        label="stroke path"
                        value={strokeOptions.path}
                        options={STROKE_PATHS}
                        labels={{ straight: "Straight", freehand: "Freehand" }}
                        onChange={(path) => onStrokeOptionsChange({ ...strokeOptions, path })}
                    />
                    <OptionGroup
                        label="stroke end"
                        value={strokeOptions.end}
                        options={STROKE_ENDS}
                        labels={END_LABELS}
                        onChange={(end) => onStrokeOptionsChange({ ...strokeOptions, end })}
                    />
                </Box>
            )}
            {selectedTool === "equipment" && (
                <Box sx={{ mt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
                    <OptionGroup label="equipment kind" value={equipmentKind} options={EQUIPMENT_KINDS} labels={EQUIPMENT_LABELS} onChange={onEquipmentKindChange} />
                </Box>
            )}

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
                                    border: color === selectedColor ? "3px solid" : "1px solid",
                                    borderColor: color === selectedColor ? "text.primary" : "text.secondary",
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
