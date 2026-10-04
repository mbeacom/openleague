"use client";

import { FormControl, InputLabel, MenuItem, Select, Stack } from "@mui/material";
import { PLAY_FOCUS, PLAY_GOALIES, type PlayFocus, type PlayGoalies } from "@/types/practice-planner";
import { FOCUS_LABELS, GOALIES_LABELS } from "@/lib/utils/drill-tags";

export interface DrillTagValues {
    focus: PlayFocus;
    goalies: PlayGoalies;
}

/** The drill editor's Focus and Goalies selects (goaltender-aware drills, spec R14). */
export function DrillTagFields({ value, onChange, disabled = false }: { value: DrillTagValues; onChange: (next: DrillTagValues) => void; disabled?: boolean }) {
    return (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <FormControl sx={{ minWidth: 180 }} disabled={disabled}>
                <InputLabel id="drill-focus-label">Focus</InputLabel>
                <Select<PlayFocus>
                    labelId="drill-focus-label"
                    id="drill-focus"
                    label="Focus"
                    value={value.focus}
                    onChange={(event) => {
                        const focus = event.target.value as PlayFocus;
                        // A goalie drill needs a goalie; the coach can still change it back.
                        onChange({ focus, goalies: focus === "goalies" ? "required" : value.goalies });
                    }}
                >
                    {PLAY_FOCUS.map((focus) => (
                        <MenuItem key={focus} value={focus}>
                            {FOCUS_LABELS[focus]}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>
            <FormControl sx={{ minWidth: 200 }} disabled={disabled}>
                <InputLabel id="drill-goalies-label">Goalies</InputLabel>
                <Select<PlayGoalies>
                    labelId="drill-goalies-label"
                    id="drill-goalies"
                    label="Goalies"
                    value={value.goalies}
                    onChange={(event) => onChange({ ...value, goalies: event.target.value as PlayGoalies })}
                >
                    {PLAY_GOALIES.map((goalies) => (
                        <MenuItem key={goalies} value={goalies}>
                            {GOALIES_LABELS[goalies]}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>
        </Stack>
    );
}
