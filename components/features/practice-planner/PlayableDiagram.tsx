"use client";

/**
 * A drill's still diagram with a Play button that swaps it for the animated
 * board in the same place, and back (animated playback R10). Drills with
 * nothing to animate get the still diagram alone. Mount it with a `key` per
 * drill so moving to another drill returns to the still diagram. Focus follows
 * the swap: into the board on Play, back to Play on close.
 */
import { useEffect, useRef, useState } from "react";
import { Box, Button, type SxProps, type Theme } from "@mui/material";
import { PlayArrow as PlayIcon } from "@mui/icons-material";
import type { PlayData } from "@/types/practice-planner";
import { hasPlayback } from "@/lib/utils/canvas/playback";
import { PlayDiagram } from "./PlayDiagram";
import { PlaybackBoard } from "./PlaybackBoard";

export interface PlayableDiagramProps {
    playData: PlayData;
    /** The drill's name; the canvas is announced as "<label> diagram". */
    label: string;
    /** Styles the playback board (diagram, controls, caption) while it is open. */
    playbackSx?: SxProps<Theme>;
}

export function PlayableDiagram({ playData, label, playbackSx }: PlayableDiagramProps) {
    const [showPlayback, setShowPlayback] = useState(false);
    const playButtonRef = useRef<HTMLButtonElement>(null);
    // Set on close, so a drill's first render never steals focus.
    const returnFocus = useRef(false);

    useEffect(() => {
        if (showPlayback || !returnFocus.current) return;
        returnFocus.current = false;
        playButtonRef.current?.focus({ preventScroll: true });
    }, [showPlayback]);

    if (showPlayback) {
        const close = () => {
            returnFocus.current = true;
            setShowPlayback(false);
        };
        return <PlaybackBoard playData={playData} label={label} startPlaying autoFocus onClose={close} sx={playbackSx} />;
    }
    return (
        <Box sx={{ position: "relative", bgcolor: "common.white", borderRadius: 1, overflow: "hidden" }}>
            <PlayDiagram playData={playData} label={label} />
            {hasPlayback(playData) && (
                <Button
                    ref={playButtonRef}
                    variant="contained"
                    startIcon={<PlayIcon />}
                    onClick={() => setShowPlayback(true)}
                    aria-label={`Play the ${label} animation`}
                    sx={{ position: "absolute", right: 8, bottom: 8, minHeight: 44, minWidth: 44, displayPrint: "none" }}
                >
                    Play
                </Button>
            )}
        </Box>
    );
}
