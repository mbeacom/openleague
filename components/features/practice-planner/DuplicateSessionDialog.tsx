"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    Alert,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Stack,
} from "@mui/material";
import { DateTimeField } from "@/components/ui/date";
import { formatDateTimeValue, parseDateTimeValue } from "@/components/ui/date/internal";
import { duplicatePracticeSession } from "@/lib/actions/practice-session-drills";

export interface DuplicateSessionDialogProps {
    open: boolean;
    sessionId: string;
    teamId: string;
    /** The source session's date (ISO string). */
    sourceDate: string;
    onClose: () => void;
}

/** Same local wall-clock time, one week later. */
function aWeekLater(iso: string): string {
    const date = new Date(iso);
    date.setDate(date.getDate() + 7);
    return formatDateTimeValue(date);
}

export function DuplicateSessionDialog({ open, sessionId, teamId, sourceDate, onClose }: DuplicateSessionDialogProps) {
    const router = useRouter();
    const [value, setValue] = useState(() => aWeekLater(sourceDate));
    const [isDuplicating, setIsDuplicating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleDuplicate = async () => {
        const date = parseDateTimeValue(value);
        if (!date) {
            setError("Choose a date and time for the copy");
            return;
        }
        setIsDuplicating(true);
        setError(null);
        const result = await duplicatePracticeSession({ id: sessionId, teamId, date });
        if (!result.success) {
            setError(result.error);
            setIsDuplicating(false);
            return;
        }
        router.push(`/practice-planner/${result.data.id}/edit`);
    };

    return (
        <Dialog open={open} onClose={onClose} aria-labelledby="duplicate-session-title" fullWidth maxWidth="xs">
            <DialogTitle id="duplicate-session-title">Duplicate practice session</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <DialogContentText>
                        The copy has the same drills, durations, and instructions. It isn&apos;t shared
                        and has no ice booked.
                    </DialogContentText>
                    <DateTimeField label="Date & time" value={value} onChange={setValue} required />
                    {error && <Alert severity="error">{error}</Alert>}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={isDuplicating} sx={{ minHeight: 44 }}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    onClick={handleDuplicate}
                    disabled={isDuplicating}
                    startIcon={isDuplicating ? <CircularProgress size={18} color="inherit" /> : null}
                    sx={{ minHeight: 44 }}
                >
                    Duplicate
                </Button>
            </DialogActions>
        </Dialog>
    );
}
