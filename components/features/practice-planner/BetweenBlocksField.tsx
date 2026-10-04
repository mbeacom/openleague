"use client";

import { MenuItem, TextField } from "@mui/material";
import { MAX_TRANSITION_MINUTES } from "@/types/practice-planner";

/** "Between blocks": None, or 1–5 minutes to change drills between top-level blocks (spec R8). */
export function BetweenBlocksField({ value, onChange, disabled = false }: { value: number; onChange: (next: number) => void; disabled?: boolean }) {
    return (
        <TextField
            select
            fullWidth
            label="Between blocks"
            value={String(value)}
            onChange={(event) => onChange(Number(event.target.value))}
            disabled={disabled}
            helperText="Time to change drills between blocks. Not added inside a station block or after the last block."
            slotProps={{ inputLabel: { shrink: true } }}
            // Same fix as GoaliesAttendingField: the theme's select min-height would make this field 81px tall.
            sx={{ "& .MuiSelect-select.MuiInputBase-input": { minHeight: "1.4375em" } }}
        >
            {Array.from({ length: MAX_TRANSITION_MINUTES + 1 }, (_, minutes) => (
                <MenuItem key={minutes} value={String(minutes)} sx={{ minHeight: 44 }}>
                    {minutes === 0 ? "None" : `${minutes} min`}
                </MenuItem>
            ))}
        </TextField>
    );
}
