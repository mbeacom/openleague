"use client";

import { Chip, Stack, Typography } from "@mui/material";
import { PLAY_FOCUS, PLAY_GOALIES, type PlayFocus, type PlayGoalies } from "@/types/practice-planner";
import { FOCUS_LABELS, GOALIES_LABELS } from "@/lib/utils/drill-tags";

export interface DrillFilters {
    focus?: PlayFocus;
    goalies?: PlayGoalies;
}

interface ChipRowProps<T extends string> {
    label: string;
    allLabel: string;
    values: readonly T[];
    labels: Record<T, string>;
    value: T | undefined;
    onChange: (value: T | undefined) => void;
}

function ChipRow<T extends string>({ label, allLabel, values, labels, value, onChange }: ChipRowProps<T>) {
    const chip = (key: string, text: string, selected: boolean, next: T | undefined) => (
        <Chip
            key={key}
            label={text}
            clickable
            color={selected ? "primary" : "default"}
            variant={selected ? "filled" : "outlined"}
            aria-pressed={selected}
            onClick={() => onChange(next)}
            // A 44px touch target on phones.
            sx={{ minHeight: { xs: 44, sm: 32 } }}
        />
    );
    return (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap role="group" aria-label={label}>
            <Typography variant="body2" sx={{ fontWeight: 800, minWidth: 64, textTransform: "uppercase", letterSpacing: 0.5 }} color="text.secondary">
                {label}
            </Typography>
            {chip("all", allLabel, value === undefined, undefined)}
            {values.map((v) => chip(v, labels[v], value === v, v))}
        </Stack>
    );
}

/** Library filters by drill tag (spec R8): one single-select chip row each for Focus and Goalies. */
export function DrillFilterChips({ value, onChange }: { value: DrillFilters; onChange: (next: DrillFilters) => void }) {
    return (
        <Stack spacing={1}>
            <ChipRow label="Focus" allLabel="All" values={PLAY_FOCUS} labels={FOCUS_LABELS} value={value.focus} onChange={(focus) => onChange({ ...value, focus })} />
            <ChipRow label="Goalies" allLabel="Any" values={PLAY_GOALIES} labels={GOALIES_LABELS} value={value.goalies} onChange={(goalies) => onChange({ ...value, goalies })} />
        </Stack>
    );
}
