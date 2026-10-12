"use client";

/**
 * The session page's Practice equipment section (practice equipment spec R5):
 * the drills' lists rolled up with the practice's own items, and "Show by
 * drill". Collapsed to its item count until opened. Nothing renders when the
 * practice needs nothing.
 */
import { useMemo } from "react";
import type { EquipmentCountItem, SessionRow } from "@/types/practice-planner";
import { rollupEquipment, viewRowEquipment } from "@/lib/utils/practice-equipment";
import { EquipmentRollupList, PRACTICE_EQUIPMENT_HEADING } from "./EquipmentRollupList";
import { CollapsibleSection } from "./CollapsibleSection";

/** "3 items": the collapsed section's summary. */
export function equipmentItemsLabel(count: number): string {
    return `${count} item${count === 1 ? "" : "s"}`;
}

export function SessionEquipmentCard({ plays, equipment }: { plays: readonly SessionRow[]; equipment?: readonly EquipmentCountItem[] }) {
    const totals = useMemo(() => rollupEquipment(plays, viewRowEquipment, equipment ?? []), [plays, equipment]);
    if (totals.length === 0) return null;
    return (
        <CollapsibleSection title={PRACTICE_EQUIPMENT_HEADING} summary={equipmentItemsLabel(totals.length)}>
            <EquipmentRollupList totals={totals} />
        </CollapsibleSection>
    );
}
