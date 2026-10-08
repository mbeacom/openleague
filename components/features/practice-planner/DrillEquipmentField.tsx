"use client";

/**
 * The drill editor's Equipment section (practice equipment spec R2, R5): the
 * list the diagram implies, with the coach's changes. Counts change relative
 * to the diagram, a removed diagram kind stays removed (and can be restored),
 * and typed items carry their own counts. The editor holds the changes outside
 * the board's undo history and merges them on save (PlayEditor).
 */
import { useId } from "react";
import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import type { EquipmentNeeds, PlayData } from "@/types/practice-planner";
import {
    EQUIPMENT_PLURAL_LABELS,
    addEquipmentItem,
    derivedEquipmentCounts,
    drillEquipment,
    removeEquipmentItem,
    removedEquipmentKinds,
    restoreEquipmentKind,
    setEquipmentCount,
} from "@/lib/utils/equipment-needs";
import { AddEquipmentForm, EquipmentItemRow } from "./EquipmentControls";

export const DRILL_EQUIPMENT_HEADING = "Equipment";
export const NO_DRILL_EQUIPMENT_TEXT = "No equipment yet. Place cones, nets or pucks on the diagram, or add an item.";
export const REMOVED_HEADING = "Removed";
export const diagramShowsText = (count: number) => `Diagram shows ${count}`;

/** A divider between rows, none after the last. */
export const ROW_SX = { borderBottom: 1, borderColor: "divider", "&:last-of-type": { borderBottom: 0 } } as const;

export interface DrillEquipmentFieldProps {
    /** The diagram with the current changes merged in (withEquipmentNeeds). */
    playData: PlayData;
    onChange: (needs: EquipmentNeeds | undefined) => void;
    disabled?: boolean;
}

export function DrillEquipmentField({ playData, onChange, disabled = false }: DrillEquipmentFieldProps) {
    const headingId = useId();
    const needs = playData.equipmentNeeds;
    const derived = derivedEquipmentCounts(playData);
    const items = drillEquipment(playData);
    const removed = removedEquipmentKinds(playData);

    return (
        <Paper elevation={2} sx={{ p: 2 }} component="section" aria-labelledby={headingId}>
            <Stack spacing={1.5}>
                <Typography id={headingId} variant="h6" component="h2">
                    {DRILL_EQUIPMENT_HEADING}
                </Typography>
                {items.length === 0 && removed.length === 0 && (
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                        {NO_DRILL_EQUIPMENT_TEXT}
                    </Typography>
                )}
                {items.length > 0 && (
                    <Box component="ul" aria-label="Drill equipment" sx={{ listStyle: "none", m: 0, p: 0 }}>
                        {items.map((item) => (
                            <Box component="li" key={item.key} sx={ROW_SX}>
                                <EquipmentItemRow
                                    name={item.name}
                                    count={item.count}
                                    caption={item.kind && item.changed ? diagramShowsText(item.derived) : null}
                                    disabled={disabled}
                                    onCount={(count) => onChange(setEquipmentCount(needs, derived, item.key, count))}
                                    onRemove={() => onChange(removeEquipmentItem(needs, derived, item.key))}
                                />
                            </Box>
                        ))}
                    </Box>
                )}
                {removed.length > 0 && (
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                            {REMOVED_HEADING}
                        </Typography>
                        {removed.map((kind) => (
                            <Button
                                key={kind}
                                size="small"
                                variant="text"
                                onClick={() => onChange(restoreEquipmentKind(needs, kind))}
                                disabled={disabled}
                                aria-label={`Restore ${EQUIPMENT_PLURAL_LABELS[kind]}`}
                                sx={{ minHeight: 44, textDecoration: "line-through" }}
                            >
                                {`${EQUIPMENT_PLURAL_LABELS[kind]} (${derived[kind]})`}
                            </Button>
                        ))}
                    </Stack>
                )}
                <AddEquipmentForm
                    disabled={disabled}
                    onAdd={(name, count) => {
                        const result = addEquipmentItem(needs, derived, name, count);
                        if (!result.ok) return result.error;
                        onChange(result.needs);
                        return null;
                    }}
                />
            </Stack>
        </Paper>
    );
}
