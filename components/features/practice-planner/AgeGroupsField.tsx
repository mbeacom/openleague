"use client";

/**
 * The drill editor's Age groups field (age-group templates R4): one toggle
 * chip per group, any number chosen; none means the drill suits every age.
 */
import { Chip, FormControl, FormHelperText, FormLabel, Stack } from "@mui/material";
import {
    AGE_GROUPS,
    AGE_GROUP_LABELS,
    AGE_GROUPS_FIELD_LABEL,
    AGE_GROUPS_HELPER,
    toggleAgeGroup,
    type AgeGroup,
} from "@/lib/utils/age-groups";

export interface AgeGroupsFieldProps {
    value: readonly AgeGroup[];
    onChange: (next: AgeGroup[]) => void;
    disabled?: boolean;
}

export function AgeGroupsField({ value, onChange, disabled = false }: AgeGroupsFieldProps) {
    return (
        <FormControl component="fieldset" disabled={disabled} aria-describedby="drill-age-groups-helper">
            <FormLabel component="legend">{AGE_GROUPS_FIELD_LABEL}</FormLabel>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                {AGE_GROUPS.map((group) => {
                    const selected = value.includes(group);
                    return (
                        <Chip
                            key={group}
                            label={AGE_GROUP_LABELS[group]}
                            clickable
                            disabled={disabled}
                            color={selected ? "primary" : "default"}
                            variant={selected ? "filled" : "outlined"}
                            aria-pressed={selected}
                            onClick={() => onChange(toggleAgeGroup(value, group))}
                            sx={{ minHeight: 44, minWidth: 44 }}
                        />
                    );
                })}
            </Stack>
            <FormHelperText id="drill-age-groups-helper">{AGE_GROUPS_HELPER}</FormHelperText>
        </FormControl>
    );
}
