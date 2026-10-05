"use client";

/** The editor's "Select Play from Library" dialog. Extracted from PracticeSessionEditor for its line budget. */
import { Button, Dialog, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import type { SavedPlay } from "@/types/practice-planner";
import { PlayLibrary } from "./PlayLibrary";

export interface PlayLibraryDialogProps {
    open: boolean;
    teamId: string;
    fullScreen: boolean;
    onClose: () => void;
    onSelectPlay: (play: SavedPlay) => void;
}

/** MUI Dialog for focus trapping, scroll locking and Escape (Requirements 4.3). */
export function PlayLibraryDialog({ open, teamId, fullScreen, onClose, onSelectPlay }: PlayLibraryDialogProps) {
    return (
        <Dialog open={open} onClose={onClose} fullScreen={fullScreen} maxWidth="lg" fullWidth aria-labelledby="play-library-dialog-title">
            <DialogTitle id="play-library-dialog-title">
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="h5" component="span">
                        Select Play from Library
                    </Typography>
                    <Button variant="outlined" onClick={onClose}>
                        Close
                    </Button>
                </Stack>
            </DialogTitle>
            <DialogContent dividers>
                <PlayLibrary teamId={teamId} onSelectPlay={onSelectPlay} mode="select" />
            </DialogContent>
        </Dialog>
    );
}
