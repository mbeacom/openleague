"use client";

import { MenuItem, TextField } from "@mui/material";
import { MAX_GOALIES_ATTENDING } from "@/types/practice-planner";

const NOT_SET = "";

/** "Goalies attending": Not set, or 0–10. Advisory only: it drives warnings and, at 0, hides optional goalie markers. */
export function GoaliesAttendingField({
    value,
    onChange,
    disabled = false,
}: {
    value: number | null;
    onChange: (next: number | null) => void;
    disabled?: boolean;
}) {
    return (
        <TextField
            select
            fullWidth
            label="Goalies attending"
            value={value === null ? NOT_SET : String(value)}
            onChange={(event) => onChange(event.target.value === NOT_SET ? null : Number(event.target.value))}
            disabled={disabled}
            helperText="Optional. Used for goalie warnings; at 0, goalies are hidden on drills that don't need one."
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            sx={{ "& .MuiInputBase-root": { minHeight: 44 } }}
        >
            <MenuItem value={NOT_SET}>Not set</MenuItem>
            {Array.from({ length: MAX_GOALIES_ATTENDING + 1 }, (_, count) => (
                <MenuItem key={count} value={String(count)}>
                    {count}
                </MenuItem>
            ))}
        </TextField>
    );
}
