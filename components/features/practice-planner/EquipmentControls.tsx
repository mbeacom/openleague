"use client";

/**
 * The equipment list's shared controls (practice equipment spec R5): one
 * item's 44 px row (label, count with − and +, remove) and the Add item form
 * (a free-text name that suggests the diagram kinds, a count, Add). The drill
 * editor's Equipment section and the session editor's Practice equipment
 * section both use them. Portable: everything comes in as props.
 */
import { useId, useState, type FormEvent } from "react";
import { Autocomplete, Box, Button, IconButton, Stack, TextField, Typography } from "@mui/material";
import { AddCircleOutline, DeleteOutline, RemoveCircleOutline } from "@mui/icons-material";
import { EQUIPMENT_KINDS, EQUIPMENT_NAME_MAX, MAX_EQUIPMENT_COUNT } from "@/types/practice-planner";
import { EQUIPMENT_PLURAL_LABELS } from "@/lib/utils/equipment-needs";

export const ADD_ITEM_LABEL = "Add item";
export const ITEM_FIELD_LABEL = "Item";
export const COUNT_FIELD_LABEL = "Count";

const TARGET = { minWidth: 44, minHeight: 44 } as const;
const KIND_SUGGESTIONS = EQUIPMENT_KINDS.map((kind) => EQUIPMENT_PLURAL_LABELS[kind]);

export interface EquipmentItemRowProps {
    /** A kind's plural label, or the typed name */
    name: string;
    count: number;
    /** Secondary text, e.g. "Diagram shows 4" */
    caption?: string | null;
    disabled?: boolean;
    onCount: (count: number) => void;
    onRemove: () => void;
}

export function EquipmentItemRow({ name, count, caption, disabled = false, onCount, onRemove }: EquipmentItemRowProps) {
    return (
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minHeight: 44 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>{name}</Typography>
                {caption && (
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        {caption}
                    </Typography>
                )}
            </Box>
            <IconButton aria-label={`Fewer ${name}`} onClick={() => onCount(count - 1)} disabled={disabled || count <= 1} sx={TARGET}>
                <RemoveCircleOutline />
            </IconButton>
            <Typography
                aria-label={`${name}: ${count}`}
                sx={{ minWidth: 36, textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}
            >
                {count}
            </Typography>
            <IconButton aria-label={`More ${name}`} onClick={() => onCount(count + 1)} disabled={disabled || count >= MAX_EQUIPMENT_COUNT} sx={TARGET}>
                <AddCircleOutline />
            </IconButton>
            <IconButton aria-label={`Remove ${name}`} onClick={onRemove} disabled={disabled} sx={TARGET}>
                <DeleteOutline />
            </IconButton>
        </Stack>
    );
}

export interface AddEquipmentFormProps {
    disabled?: boolean;
    /** Returns an error to show, or null when the item was added. */
    onAdd: (name: string, count: number) => string | null;
}

/** A name (suggesting the diagram kinds, free text allowed), a count, and Add item. */
export function AddEquipmentForm({ disabled = false, onAdd }: AddEquipmentFormProps) {
    const id = useId();
    const [name, setName] = useState("");
    const [count, setCount] = useState("1");
    const [error, setError] = useState<string | null>(null);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        const problem = onAdd(name, Number(count));
        setError(problem);
        if (!problem) {
            setName("");
            setCount("1");
        }
    };

    return (
        <Box component="form" onSubmit={submit} noValidate aria-label={ADD_ITEM_LABEL}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "flex-start" }}>
                <Autocomplete
                    freeSolo
                    options={KIND_SUGGESTIONS}
                    inputValue={name}
                    onInputChange={(_, value) => {
                        setName(value);
                        setError(null);
                    }}
                    disabled={disabled}
                    sx={{ flex: 1, minWidth: 0, "& .MuiInputBase-root": { minHeight: 44 } }}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            id={`${id}-name`}
                            label={ITEM_FIELD_LABEL}
                            error={Boolean(error)}
                            helperText={error ?? " "}
                            slotProps={{ htmlInput: { ...params.inputProps, maxLength: EQUIPMENT_NAME_MAX } }}
                        />
                    )}
                />
                <TextField
                    id={`${id}-count`}
                    label={COUNT_FIELD_LABEL}
                    type="number"
                    value={count}
                    onChange={(event) => {
                        setCount(event.target.value);
                        setError(null);
                    }}
                    disabled={disabled}
                    sx={{ width: { xs: "100%", sm: 104 }, "& .MuiInputBase-root": { minHeight: 44 } }}
                    slotProps={{ htmlInput: { min: 1, max: MAX_EQUIPMENT_COUNT, step: 1, inputMode: "numeric" } }}
                />
                <Button type="submit" variant="outlined" disabled={disabled || !name.trim()} sx={{ minHeight: 44, whiteSpace: "nowrap" }}>
                    {ADD_ITEM_LABEL}
                </Button>
            </Stack>
        </Box>
    );
}
