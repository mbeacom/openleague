"use client";

/** The editor's "Session Details" card: title, date, length, goalies attending, the gap between blocks. */
import type { ChangeEvent } from "react";
import { Alert, Paper, Stack, TextField, Typography } from "@mui/material";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import { VALIDATION_CONSTRAINTS } from "@/types/practice-planner";
import { GoaliesAttendingField } from "./GoaliesAttendingField";
import { BetweenBlocksField } from "./BetweenBlocksField";

export interface SessionDetailsFieldsProps {
    title: string;
    onTitleChange: (event: ChangeEvent<HTMLInputElement>) => void;
    date: Date | null;
    onDateChange: (date: Date | null) => void;
    duration: number;
    onDurationChange: (event: ChangeEvent<HTMLInputElement>) => void;
    goaliesAttending: number | null;
    onGoaliesAttendingChange: (next: number | null) => void;
    /** Shown as 0 ("None") until loaded or picked */
    transitionMinutes: number;
    onTransitionMinutesChange: (next: number) => void;
    isShared: boolean;
    /** A create in flight: every field is locked. */
    creating: boolean;
    /** A reservation fixes the date and the length. */
    scheduleLocked: boolean;
    validationErrors: Record<string, string>;
}

export function SessionDetailsFields({
    title,
    onTitleChange,
    date,
    onDateChange,
    duration,
    onDurationChange,
    goaliesAttending,
    onGoaliesAttendingChange,
    transitionMinutes,
    onTransitionMinutesChange,
    isShared,
    creating,
    scheduleLocked,
    validationErrors,
}: SessionDetailsFieldsProps) {
    return (
        <Paper elevation={2} sx={{ p: 2 }}>
            <Stack spacing={2}>
                <Typography variant="h6" component="h2">
                    Session Details
                </Typography>
                <TextField
                    label="Session Title"
                    value={title}
                    onChange={onTitleChange}
                    fullWidth
                    required
                    disabled={creating}
                    placeholder="Enter session title"
                    inputProps={{ maxLength: 100 }}
                    helperText={validationErrors.title || `${title.length}/100 characters`}
                    error={!!validationErrors.title}
                />
                <DateTimePicker
                    label="Practice Date & Time"
                    value={date}
                    onChange={onDateChange}
                    disabled={creating || scheduleLocked}
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
                <TextField
                    label="Session Duration (minutes)"
                    type="number"
                    value={duration}
                    onChange={onDurationChange}
                    fullWidth
                    required
                    disabled={creating || scheduleLocked}
                    sx={{ "& .MuiInputBase-root": { minHeight: 44 } }}
                    inputProps={{ min: VALIDATION_CONSTRAINTS.MIN_DURATION, max: VALIDATION_CONSTRAINTS.MAX_DURATION }}
                    helperText={
                        validationErrors.duration ||
                        `Duration must be between ${VALIDATION_CONSTRAINTS.MIN_DURATION} and ${VALIDATION_CONSTRAINTS.MAX_DURATION} minutes`
                    }
                    error={!!validationErrors.duration}
                />
                <GoaliesAttendingField value={goaliesAttending} onChange={onGoaliesAttendingChange} disabled={creating} />
                <BetweenBlocksField value={transitionMinutes} onChange={onTransitionMinutesChange} disabled={creating} />
                {isShared && <Alert severity="info">This session is shared with your team members</Alert>}
            </Stack>
        </Paper>
    );
}
