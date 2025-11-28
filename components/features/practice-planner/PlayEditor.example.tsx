"use client";

/**
 * Example PlayEditor Component
 *
 * This is a demonstration component showing how DrawingToolbar integrates
 * with RinkBoard. This will be replaced by the full PlayEditor in task 6.
 */

import React, { useState, useRef } from "react";
import { Box, Paper, Typography } from "@mui/material";
import { RinkBoard, RinkBoardHandle } from "./RinkBoard";
import { DrawingToolbar } from "./DrawingToolbar";
import { PlayData, DrawingTool } from "@/types/practice-planner";

/**
 * Example PlayEditor component demonstrating toolbar integration
 */
export function PlayEditorExample() {
    const rinkBoardRef = useRef<RinkBoardHandle>(null);

    const [playData, setPlayData] = useState<PlayData>({
        players: [],
        drawings: [],
        annotations: [],
    });

    const [selectedTool, setSelectedTool] = useState<DrawingTool>("select");
    const [selectedColor, setSelectedColor] = useState("#000000");
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);

    const handlePlayDataChange = (newData: PlayData) => {
        setPlayData(newData);
    };

    const handleUndo = () => {
        rinkBoardRef.current?.undo();
    };

    const handleRedo = () => {
        rinkBoardRef.current?.redo();
    };

    const handleClear = () => {
        rinkBoardRef.current?.clear();
    };

    const handleUndoRedoStateChange = (undo: boolean, redo: boolean) => {
        setCanUndo(undo);
        setCanRedo(redo);
    };

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h4" gutterBottom>
                Practice Play Editor (Example)
            </Typography>

            <Paper elevation={2} sx={{ p: 2, mb: 2 }}>
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

            <Paper elevation={2} sx={{ p: 2 }}>
                <RinkBoard
                    ref={rinkBoardRef}
                    mode="edit"
                    playData={playData}
                    onPlayDataChange={handlePlayDataChange}
                    selectedTool={selectedTool}
                    selectedColor={selectedColor}
                    onUndoRedoStateChange={handleUndoRedoStateChange}
                    height={500}
                />
            </Paper>
        </Box>
    );
}
