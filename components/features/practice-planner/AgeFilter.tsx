"use client";

/**
 * The age filter (age-group templates R3): All ages, then one chip per age
 * group, single choice. Shared by the drill library, the session editor's
 * drill picker and the template picker; useAgeFilter remembers the choice.
 */
import { Button, Chip, Stack, Typography } from "@mui/material";
import {
    AGE_FILTER_GROUP_LABEL,
    AGE_GROUPS,
    AGE_GROUP_LABELS,
    ALL_AGES_LABEL,
    SHOW_ALL_AGES_LABEL,
    noAgeMatchMessage,
    type AgeGroup,
} from "@/lib/utils/age-groups";

export interface AgeFilterProps {
    /** null = All ages */
    value: AgeGroup | null;
    onChange: (next: AgeGroup | null) => void;
}

export function AgeFilter({ value, onChange }: AgeFilterProps) {
    const chip = (key: string, label: string, next: AgeGroup | null) => {
        const selected = value === next;
        return (
            <Chip
                key={key}
                label={label}
                clickable
                color={selected ? "primary" : "default"}
                variant={selected ? "filled" : "outlined"}
                aria-pressed={selected}
                onClick={() => onChange(next)}
                // A 44 x 44 px touch target everywhere.
                sx={{ minHeight: 44, minWidth: 44 }}
            />
        );
    };
    return (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap role="group" aria-label={AGE_FILTER_GROUP_LABEL}>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 800, minWidth: 64, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Age
            </Typography>
            {chip("all", ALL_AGES_LABEL, null)}
            {AGE_GROUPS.map((group) => chip(group, AGE_GROUP_LABELS[group], group))}
        </Stack>
    );
}

export interface AgeFilterEmptyProps {
    noun: "drills" | "templates";
    ageGroup: AgeGroup;
    onShowAll: () => void;
}

/** The empty state (R3): "No drills for 8U yet." and a link-styled "Show all ages". */
export function AgeFilterEmpty({ noun, ageGroup, onShowAll }: AgeFilterEmptyProps) {
    return (
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" flexWrap="wrap" useFlexGap role="status">
            <Typography variant="body2" color="text.secondary">
                {noAgeMatchMessage(noun, ageGroup)}
            </Typography>
            <Button variant="text" onClick={onShowAll} sx={{ minHeight: 44, textTransform: "none", textDecoration: "underline" }}>
                {SHOW_ALL_AGES_LABEL}
            </Button>
        </Stack>
    );
}
