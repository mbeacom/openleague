"use client";

/**
 * Full-screen editor for one drill's diagram inside a practice session
 * (practice planner 3a). Saves go through saveSessionDrill, so a library
 * drill is forked into a copy only this session owns; PlayEditor's own
 * autosave is off so each save is deliberate.
 */

import { useState } from "react";
import { Box, Checkbox, Dialog, FormControlLabel } from "@mui/material";
import type { PlayData, SavedPlay } from "@/types/practice-planner";
import type { SessionDrillPatch } from "@/lib/utils/session-drill-ids";
import { copySessionDrillToLibrary, saveSessionDrill } from "@/lib/actions/practice-session-drills";
import { PlayEditor } from "./PlayEditor";

export interface SessionDrillDialogDrill {
    clientKey: string;
    /** null for a brand-new drill. */
    playId: string | null;
    name: string;
    description: string;
    playData: PlayData;
    thumbnail: string;
}

export interface SessionDrillDialogProps {
    open: boolean;
    sessionId: string;
    teamId: string;
    drill: SessionDrillDialogDrill | null;
    /** Every successful save: the editor updates (or appends) the card. */
    onSaved: (clientKey: string, patch: SessionDrillPatch) => void;
    onClose: () => void;
}

export function SessionDrillDialog({ open, sessionId, teamId, drill, onSaved, onClose }: SessionDrillDialogProps) {
    const [playId, setPlayId] = useState<string | null>(drill?.playId ?? null);
    const [alsoAddToLibrary, setAlsoAddToLibrary] = useState(false);
    const [addedToLibrary, setAddedToLibrary] = useState(false);

    if (!drill) return null;

    const handleSave = async (saved: SavedPlay) => {
        const result = await saveSessionDrill({
            sessionId,
            teamId,
            playId: playId ?? undefined,
            name: saved.name,
            description: saved.description || undefined,
            thumbnail: saved.thumbnail || undefined,
            playData: saved.playData,
        });
        // PlayEditor catches this and shows it in its error alert; the dialog stays open.
        if (!result.success) throw new Error(result.error);

        setPlayId(result.data.playId);
        onSaved(drill.clientKey, {
            playId: result.data.playId,
            name: saved.name,
            description: saved.description,
            thumbnail: saved.thumbnail,
            playData: saved.playData,
        });

        if (alsoAddToLibrary && !addedToLibrary) {
            const copy = await copySessionDrillToLibrary({ playId: result.data.playId, teamId });
            if (!copy.success) {
                throw new Error(`Saved to this session, but not added to the library: ${copy.error}`);
            }
            setAddedToLibrary(true);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullScreen aria-label="Edit drill diagram">
            <Box sx={{ px: { xs: 2, md: 3 }, pt: 2 }}>
                <FormControlLabel
                    control={
                        <Checkbox
                            checked={alsoAddToLibrary}
                            onChange={(event) => setAlsoAddToLibrary(event.target.checked)}
                            disabled={addedToLibrary}
                        />
                    }
                    label="Also add to library"
                />
            </Box>
            <PlayEditor
                teamId={teamId}
                playId={playId ?? undefined}
                initialData={{
                    name: drill.name,
                    description: drill.description,
                    playData: drill.playData,
                    thumbnail: drill.thumbnail,
                    isTemplate: false,
                }}
                lockTemplate
                autoSave={false}
                onSave={handleSave}
                onCancel={onClose}
            />
        </Dialog>
    );
}
