"use client";

/**
 * A practice's equipment totals (practice equipment spec R4, R5), with an
 * optional "Show by drill" breakdown: which drills need each item, and what
 * the practice adds. Used by the session editor and the session page.
 * Portable: the totals come in as props (rollupEquipment).
 */
import { useId, useState } from "react";
import { Box, FormControlLabel, Stack, Switch, Typography } from "@mui/material";
import type { EquipmentTotal } from "@/lib/utils/practice-equipment";
import { equipmentLabel } from "@/lib/utils/equipment-needs";
import { stationTag } from "./print/BenchSheetDrill";

export const PRACTICE_EQUIPMENT_HEADING = "Practice equipment";
export const SHOW_BY_DRILL_LABEL = "Show by drill";
export const ADDED_FOR_PRACTICE_LABEL = "Added for the practice";
export const NO_PRACTICE_EQUIPMENT_TEXT = "No equipment yet. It fills in from the drills' diagrams.";
export const ROLLUP_RULE_TEXT = "Stations that run at the same time add up; drills that run one after another share.";

/** "Breakout ×4", "Station A · Station 1 of 2 ×2", "Added for the practice ×20". */
export function equipmentPartLines(total: EquipmentTotal): string[] {
    const parts = total.parts.map((part) => `${part.name}${part.station ? ` · ${stationTag(part.station.position, part.station.count)}` : ""} ×${part.count}`);
    return total.practice > 0 ? [...parts, `${ADDED_FOR_PRACTICE_LABEL} ×${total.practice}`] : parts;
}

export function EquipmentRollupList({ totals }: { totals: readonly EquipmentTotal[] }) {
    const switchId = useId();
    const [byDrill, setByDrill] = useState(false);

    if (totals.length === 0) {
        return (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {NO_PRACTICE_EQUIPMENT_TEXT}
            </Typography>
        );
    }

    return (
        <Stack spacing={1}>
            <Box
                component="ul"
                aria-label="Practice equipment totals"
                sx={{
                    listStyle: "none",
                    m: 0,
                    p: 0,
                    display: "grid",
                    gap: 1,
                    gridTemplateColumns: byDrill ? "1fr" : { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(3, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" },
                }}
            >
                {totals.map((total) => (
                    <Box
                        component="li"
                        key={total.key}
                        sx={{ border: 1, borderColor: "divider", borderRadius: 1, px: 1.5, py: 1, bgcolor: "background.paper" }}
                    >
                        <Typography sx={{ fontWeight: 700, overflowWrap: "anywhere" }}>{equipmentLabel(total, total.count)}</Typography>
                        {byDrill && (
                            <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                                {equipmentPartLines(total).map((line, index) => (
                                    <Typography key={index} component="li" variant="body2" sx={{ color: "text.secondary" }}>
                                        {line}
                                    </Typography>
                                ))}
                            </Box>
                        )}
                    </Box>
                ))}
            </Box>
            <FormControlLabel
                control={<Switch id={switchId} checked={byDrill} onChange={(event) => setByDrill(event.target.checked)} />}
                label={SHOW_BY_DRILL_LABEL}
                sx={{ minHeight: 44, alignSelf: "flex-start" }}
            />
            {byDrill && (
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {ROLLUP_RULE_TEXT}
                </Typography>
            )}
        </Stack>
    );
}
