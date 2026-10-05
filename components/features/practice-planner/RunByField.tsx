"use client";

/**
 * "Run by" on a row card (spec R8): 0–4 people from the practice's staff,
 * shown as chips. No control smaller than 44px: chips have no delete icon (a
 * person comes off by picking their option again, or with Backspace) and the
 * field has no popup arrow (the 44px field itself opens the list on focus).
 * Portable: no store, action or Next import.
 */
import { Autocomplete, Chip, TextField } from "@mui/material";
import { MAX_ROW_STAFF, type SessionStaffMember } from "@/types/practice-planner";
import { isNamedStaff } from "@/lib/utils/session-staff";

export const RUN_BY_LABEL = "Run by";
export const RUN_BY_FULL_HELP = `At most ${MAX_ROW_STAFF} people per row`;

/** What a row card needs to show Run by: the list, the row's keys, and where a change goes. */
export interface RowRunBy {
    staff: readonly SessionStaffMember[];
    value: readonly string[];
    onChange: (keys: string[]) => void;
}

export interface RunByFieldProps extends RowRunBy {
    /** The row's title, for the field's accessible name */
    title: string;
    disabled?: boolean;
}

export function RunByField({ staff, value, onChange, title, disabled = false }: RunByFieldProps) {
    // Only named people are offered; a key no longer on the list is skipped (spec R11).
    const named = staff.filter(isNamedStaff);
    const selected = value.flatMap((key) => named.filter((member) => member.id === key));
    const full = selected.length >= MAX_ROW_STAFF;
    return (
        <Autocomplete
            multiple
            size="small"
            options={named}
            value={selected}
            onChange={(_, next) => onChange(next.slice(0, MAX_ROW_STAFF).map((member) => member.id))}
            getOptionLabel={(member) => member.name}
            isOptionEqualToValue={(option, picked) => option.id === picked.id}
            getOptionDisabled={(member) => full && !value.includes(member.id)}
            disableCloseOnSelect
            disableClearable
            forcePopupIcon={false}
            openOnFocus
            disabled={disabled}
            renderValue={(members, getItemProps) =>
                members.map((member, index) => {
                    const { key, ...itemProps } = getItemProps({ index });
                    return <Chip key={key} {...itemProps} onDelete={undefined} size="small" label={member.name} sx={{ maxWidth: 160 }} />;
                })
            }
            renderInput={(params) => (
                <TextField
                    {...params}
                    label={RUN_BY_LABEL}
                    helperText={full ? RUN_BY_FULL_HELP : undefined}
                    inputProps={{ ...params.inputProps, "aria-label": `${RUN_BY_LABEL} for ${title}` }}
                    sx={{ "& .MuiInputBase-root": { minHeight: 44 } }}
                />
            )}
            slotProps={{ listbox: { sx: { "& .MuiAutocomplete-option": { minHeight: 44 } } } }}
            sx={{ minWidth: 0 }}
        />
    );
}
