"use client";

/**
 * The session editor's Practice equipment section (practice equipment spec
 * R3–R5): the drills' lists rolled up over the timeline (stations summed,
 * blocks maxed), "Show by drill", and the practice's own items. Each drill's
 * list is edited in its drill dialog, never here. Portable: props only.
 */
import { useId, useMemo } from "react";
import { Box, Paper, Stack, Typography } from "@mui/material";
import type { EquipmentCountItem, SessionItem } from "@/types/practice-planner";
import { editorRowEquipment, rollupEquipment } from "@/lib/utils/practice-equipment";
import { equipmentKindFor, EQUIPMENT_PLURAL_LABELS } from "@/lib/utils/equipment-needs";
import { AddEquipmentForm, EquipmentItemRow } from "./EquipmentControls";
import { ADDED_FOR_PRACTICE_LABEL, EquipmentRollupList, PRACTICE_EQUIPMENT_HEADING } from "./EquipmentRollupList";
import { ROW_SX } from "./DrillEquipmentField";

export { PRACTICE_EQUIPMENT_HEADING };

export interface SessionEquipmentSectionProps {
    plays: readonly SessionItem[];
    items: readonly EquipmentCountItem[];
    disabled?: boolean;
    onAdd: (name: string, count: number) => string | null;
    onCount: (index: number, count: number) => void;
    onRemove: (index: number) => void;
}

export function SessionEquipmentSection({ plays, items, disabled = false, onAdd, onCount, onRemove }: SessionEquipmentSectionProps) {
    const headingId = useId();
    const addedId = useId();
    const totals = useMemo(() => rollupEquipment(plays, editorRowEquipment, items), [plays, items]);

    return (
        <Paper elevation={2} sx={{ p: 2 }} component="section" aria-labelledby={headingId}>
            <Stack spacing={2}>
                <Typography id={headingId} variant="h6" component="h2">
                    {PRACTICE_EQUIPMENT_HEADING}
                </Typography>
                <EquipmentRollupList totals={totals} />
                <Box>
                    <Typography id={addedId} variant="subtitle2" component="h3" sx={{ mb: 0.5 }}>
                        {ADDED_FOR_PRACTICE_LABEL}
                    </Typography>
                    {items.length > 0 && (
                        <Box component="ul" aria-labelledby={addedId} sx={{ listStyle: "none", m: 0, mb: 1, p: 0 }}>
                            {items.map((item, index) => {
                                const kind = equipmentKindFor(item.name);
                                return (
                                    <Box component="li" key={`${item.name}-${index}`} sx={ROW_SX}>
                                        <EquipmentItemRow
                                            name={kind ? EQUIPMENT_PLURAL_LABELS[kind] : item.name}
                                            count={item.count}
                                            caption={kind ? "Added to the drills' total" : null}
                                            disabled={disabled}
                                            onCount={(count) => onCount(index, count)}
                                            onRemove={() => onRemove(index)}
                                        />
                                    </Box>
                                );
                            })}
                        </Box>
                    )}
                    <AddEquipmentForm disabled={disabled} onAdd={onAdd} />
                </Box>
            </Stack>
        </Paper>
    );
}
