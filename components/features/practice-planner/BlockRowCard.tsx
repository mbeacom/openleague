"use client";

/**
 * A warm-up, water break, transition or cool-down in the session editor
 * (practice timing, spec R8): its kind icon, an editable label, a minutes
 * stepper, an optional note, and the move / delete controls. No diagram, no
 * station switch and no goalie badge. Edits apply as they are made.
 */
import { useId } from "react";
import { Box, Card, IconButton, Stack, TextField, Typography } from "@mui/material";
import {
    AcUnitOutlined,
    Add as AddIcon,
    ArrowDownward as ArrowDownwardIcon,
    ArrowUpward as ArrowUpwardIcon,
    Delete as DeleteIcon,
    DirectionsRunOutlined,
    LocalDrinkOutlined,
    Remove as RemoveIcon,
    SwapHorizOutlined,
    type SvgIconComponent,
} from "@mui/icons-material";
import { BLOCK_DEFAULTS, MAX_BLOCK_LABEL_LENGTH, VALIDATION_CONSTRAINTS, type BlockInSession, type BlockKind } from "@/types/practice-planner";
import { blockTitle, type RowEdit } from "@/lib/utils/session-rows";

/** One outline icon per block kind (the Add block menu uses them too). */
export const BLOCK_ICONS: Record<BlockKind, SvgIconComponent> = {
    warmup: DirectionsRunOutlined,
    break: LocalDrinkOutlined,
    transition: SwapHorizOutlined,
    cooldown: AcUnitOutlined,
};

const TARGET = { minWidth: 44, minHeight: 44 } as const;

export interface BlockRowCardProps {
    item: BlockInSession;
    /** Position in the whole session */
    index: number;
    canMoveUp: boolean;
    canMoveDown: boolean;
    /** The session is being created: nothing on the card may change. */
    locked?: boolean;
    onUpdate: (id: string, edit: RowEdit) => void;
    onDelete: (id: string) => void;
    onMoveUp: (index: number) => void;
    onMoveDown: (index: number) => void;
}

export function BlockRowCard({ item, index, canMoveUp, canMoveDown, locked = false, onUpdate, onDelete, onMoveUp, onMoveDown }: BlockRowCardProps) {
    const titleId = useId();
    const Icon = BLOCK_ICONS[item.kind];
    const title = blockTitle(item.kind, item.label);
    const setMinutes = (minutes: number) =>
        onUpdate(item.id, { duration: Math.min(VALIDATION_CONSTRAINTS.MAX_DURATION, Math.max(VALIDATION_CONSTRAINTS.MIN_DURATION, minutes)) });

    return (
        <Card
            variant="outlined"
            component="section"
            aria-labelledby={titleId}
            sx={{ borderLeft: 4, borderLeftColor: "secondary.main", bgcolor: "background.paper" }}
        >
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "stretch", sm: "center" }} sx={{ p: 2 }}>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
                    <Box
                        aria-hidden
                        sx={{
                            width: 44,
                            height: 44,
                            flexShrink: 0,
                            borderRadius: "50%",
                            display: "grid",
                            placeItems: "center",
                            bgcolor: "action.selected",
                            color: "secondary.main",
                        }}
                    >
                        <Icon />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography id={titleId} variant="subtitle1" component="h3" sx={{ fontWeight: 800 }} noWrap>
                            {title}
                        </Typography>
                        <TextField
                            label="Label"
                            size="small"
                            fullWidth
                            value={item.label}
                            placeholder={BLOCK_DEFAULTS[item.kind].label}
                            onChange={(event) => onUpdate(item.id, { label: event.target.value })}
                            disabled={locked}
                            slotProps={{ htmlInput: { maxLength: MAX_BLOCK_LABEL_LENGTH } }}
                            sx={{ mt: 1, "& .MuiInputBase-root": { minHeight: 44 } }}
                        />
                    </Box>
                </Stack>

                <Stack direction="row" alignItems="center" justifyContent="center" role="group" aria-label={`Minutes for ${title}`}>
                    <IconButton
                        aria-label={`Fewer minutes for ${title}`}
                        onClick={() => setMinutes(item.duration - 1)}
                        disabled={locked || item.duration <= VALIDATION_CONSTRAINTS.MIN_DURATION}
                        sx={TARGET}
                    >
                        <RemoveIcon />
                    </IconButton>
                    <Typography sx={{ minWidth: 64, textAlign: "center", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        {`${item.duration} min`}
                    </Typography>
                    <IconButton
                        aria-label={`More minutes for ${title}`}
                        onClick={() => setMinutes(item.duration + 1)}
                        disabled={locked || item.duration >= VALIDATION_CONSTRAINTS.MAX_DURATION}
                        sx={TARGET}
                    >
                        <AddIcon />
                    </IconButton>
                </Stack>

                <Stack direction="row" justifyContent={{ xs: "space-between", sm: "flex-end" }}>
                    <IconButton aria-label={`Move ${title} up`} onClick={() => onMoveUp(index)} disabled={locked || !canMoveUp} sx={TARGET}>
                        <ArrowUpwardIcon />
                    </IconButton>
                    <IconButton aria-label={`Move ${title} down`} onClick={() => onMoveDown(index)} disabled={locked || !canMoveDown} sx={TARGET}>
                        <ArrowDownwardIcon />
                    </IconButton>
                    <IconButton aria-label={`Delete ${title}`} color="error" onClick={() => onDelete(item.id)} disabled={locked} sx={TARGET}>
                        <DeleteIcon />
                    </IconButton>
                </Stack>
            </Stack>
            <Box sx={{ px: 2, pb: 2 }}>
                <TextField
                    label="Note"
                    size="small"
                    fullWidth
                    multiline
                    minRows={1}
                    value={item.instructions}
                    placeholder="Optional"
                    onChange={(event) => onUpdate(item.id, { instructions: event.target.value })}
                    disabled={locked}
                    slotProps={{ htmlInput: { maxLength: 2000 } }}
                    sx={{ "& .MuiInputBase-root": { minHeight: 44 } }}
                />
            </Box>
        </Card>
    );
}
