"use client";

/**
 * "Run by" on a row card (spec R8): 0–4 people from the practice's staff,
 * shown as chips. No control smaller than 44px: chips have no delete icon (a
 * person comes off by picking their option again, or with Backspace) and the
 * field has no popup arrow (the 44px field itself opens the list on focus).
 * The open list checks the people picked, says how to take one off, and, once
 * the row is full, says why the others are disabled.
 * Portable: no store, action or Next import.
 */
import { useId } from "react";
import { Autocomplete, Box, Checkbox, Chip, ListSubheader, TextField, Typography } from "@mui/material";
import { MAX_ROW_STAFF, type SessionStaffMember } from "@/types/practice-planner";
import { isNamedStaff, runByLabel } from "@/lib/utils/session-staff";

export const RUN_BY_LABEL = "Run by";
export const RUN_BY_FULL_HELP = `At most ${MAX_ROW_STAFF} people per row`;
export const RUN_BY_REMOVE_HELP = "Tap a name again to remove";
/** Read to screen readers when the row has nobody. */
export const RUN_BY_NOBODY = "Nobody assigned";

/** Hidden from sight but read by screen readers (the standard clip pattern). */
const VISUALLY_HIDDEN = {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: 0,
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    border: 0,
} as const;

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
    const summaryId = useId();
    // Only named people are offered; a key no longer on the list is skipped (spec R11).
    const named = staff.filter(isNamedStaff);
    const selected = value.flatMap((key) => named.filter((member) => member.id === key));
    const full = selected.length >= MAX_ROW_STAFF;
    return (
        // One box, so a card's Stack spacing sees one child.
        <Box sx={{ minWidth: 0 }}>
            <Box component="span" id={summaryId} sx={VISUALLY_HIDDEN}>
                {runByLabel(selected.map((member) => member.name)) ?? RUN_BY_NOBODY}
            </Box>
            <Autocomplete
                multiple
                size="small"
                options={named}
                value={selected}
                onChange={(_, next) => onChange(next.slice(0, MAX_ROW_STAFF).map((member) => member.id))}
                getOptionLabel={(member) => member.name}
                isOptionEqualToValue={(option, picked) => option.id === picked.id}
                getOptionDisabled={(member) => full && !value.includes(member.id)}
                // One group, so the open list carries a header: how to remove, and why the rest are disabled.
                groupBy={() => "staff"}
                renderGroup={({ key, children }) => (
                    <li key={key}>
                        <ListSubheader component="div" sx={{ lineHeight: 1.5, py: 1 }}>
                            {full && (
                                <Typography variant="body2" sx={{ fontWeight: 700, color: "text.primary" }}>
                                    {RUN_BY_FULL_HELP}
                                </Typography>
                            )}
                            <Typography variant="body2" sx={{ color: "text.secondary" }}>
                                {RUN_BY_REMOVE_HELP}
                            </Typography>
                        </ListSubheader>
                        <Box component="ul" sx={{ p: 0 }}>
                            {children}
                        </Box>
                    </li>
                )}
                renderOption={(props, member, { selected: picked }) => {
                    const { key, ...optionProps } = props;
                    return (
                        <li key={key} {...optionProps}>
                            {/* Decorative: the option's aria-selected is what assistive tech reads. */}
                            <Checkbox
                                aria-hidden
                                checked={picked}
                                tabIndex={-1}
                                disableRipple
                                size="small"
                                sx={{ p: 0, mr: 1.5, pointerEvents: "none" }}
                            />
                            {member.name}
                        </li>
                    );
                }}
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
                renderInput={({ inputProps, ...params }) => (
                    <TextField
                        {...params}
                        label={RUN_BY_LABEL}
                        helperText={full ? RUN_BY_FULL_HELP : undefined}
                        slotProps={{
                            htmlInput: {
                                ...inputProps,
                                "aria-label": `${RUN_BY_LABEL} for ${title}`,
                                "aria-describedby": full ? `${summaryId} ${params.id}-helper-text` : summaryId,
                            },
                        }}
                        sx={{ "& .MuiInputBase-root": { minHeight: 44 } }}
                    />
                )}
                slotProps={{ listbox: { sx: { "& .MuiAutocomplete-option": { minHeight: 44 } } } }}
                sx={{ minWidth: 0 }}
            />
        </Box>
    );
}
