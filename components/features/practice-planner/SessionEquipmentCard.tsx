"use client";

/**
 * The session page's Practice equipment card (practice equipment spec R5):
 * the drills' lists rolled up with the practice's own items, and "Show by
 * drill". Nothing renders when the practice needs nothing.
 */
import { useMemo } from "react";
import { Paper, Typography } from "@mui/material";
import type { EquipmentCountItem, SessionRow } from "@/types/practice-planner";
import { rollupEquipment, viewRowEquipment } from "@/lib/utils/practice-equipment";
import { EquipmentRollupList, PRACTICE_EQUIPMENT_HEADING } from "./EquipmentRollupList";

export function SessionEquipmentCard({ plays, equipment }: { plays: readonly SessionRow[]; equipment?: readonly EquipmentCountItem[] }) {
    const totals = useMemo(() => rollupEquipment(plays, viewRowEquipment, equipment ?? []), [plays, equipment]);
    if (totals.length === 0) return null;
    return (
        <Paper component="section" aria-label={PRACTICE_EQUIPMENT_HEADING} sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="subtitle2" component="h2" color="text.secondary" sx={{ mb: 1, textTransform: "uppercase", letterSpacing: 1 }}>
                {PRACTICE_EQUIPMENT_HEADING}
            </Typography>
            <EquipmentRollupList totals={totals} />
        </Paper>
    );
}
