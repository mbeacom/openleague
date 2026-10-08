/**
 * A practice's equipment list (practice equipment spec R4): every drill's list
 * (equipment-needs.ts) rolled up over the timeline, plus the practice's own
 * additions. Stations in one block run at the same time, so their items are
 * summed; blocks run one after another and reuse the same gear, so the
 * practice needs the largest block's count of each item. Pure: the editors,
 * the session page, the bench sheet, the exports and the import preview share it.
 */
import { EQUIPMENT_KINDS, type EquipmentCountItem, type EquipmentKind, type PlayData, type SessionItem, type SessionRow } from "@/types/practice-planner";
import { groupStations, type TimelinePlay } from "@/lib/utils/session-timeline";
import { isBlockRow } from "@/lib/utils/session-rows";
import { EQUIPMENT_PLURAL_LABELS, drillEquipment, equipmentKey, equipmentKindFor, equipmentLine } from "@/lib/utils/equipment-needs";

/** What the rollup reads from a drill row: its name and diagram (null = unreadable, contributes nothing). */
export interface EquipmentDrillSource {
    name: string;
    playData: PlayData | null;
}

/** One drill's share of a total. */
export interface EquipmentPart {
    name: string;
    count: number;
    /** 0-based block index on the timeline */
    block: number;
    /** The drill's place in a station block, or null for a lone drill */
    station: { position: number; count: number } | null;
}

export interface EquipmentTotal {
    /** equipmentKey */
    key: string;
    kind: EquipmentKind | null;
    /** A kind's plural label, or the typed name as first written */
    name: string;
    /** The largest block's sum, plus the practice's addition */
    count: number;
    /** Every drill that needs it, in schedule order */
    parts: EquipmentPart[];
    /** The practice's own addition (0 when none) */
    practice: number;
}

/**
 * The practice's list (spec R4): per block, the stations' items summed; across
 * blocks, the largest; then the practice's additions (a kind's name adds to
 * that kind). Kinds first in EQUIPMENT_KINDS order, then typed items by first
 * appearance. Rows are ordered by sequence; `drillOf` returns null for a block row.
 */
export function rollupEquipment<T extends TimelinePlay>(
    rows: readonly T[],
    drillOf: (row: T) => EquipmentDrillSource | null,
    practice: readonly EquipmentCountItem[] = [],
): EquipmentTotal[] {
    const totals = new Map<string, EquipmentTotal & { blockMax: number }>();
    const entry = (key: string, kind: EquipmentKind | null, name: string) => {
        let total = totals.get(key);
        if (!total) {
            total = { key, kind, name, count: 0, parts: [], practice: 0, blockMax: 0 };
            totals.set(key, total);
        }
        return total;
    };

    for (const group of groupStations(rows)) {
        // A block row is always alone in its group, so every station here is a drill.
        const stations = group.stations.filter((row) => !isBlockRow(row));
        const blockSums = new Map<string, number>();
        stations.forEach((row, index) => {
            const source = drillOf(row);
            if (!source) return;
            for (const item of drillEquipment(source.playData)) {
                const total = entry(item.key, item.kind, item.name);
                total.parts.push({
                    name: source.name,
                    count: item.count,
                    block: group.index,
                    station: stations.length > 1 ? { position: index + 1, count: stations.length } : null,
                });
                blockSums.set(item.key, (blockSums.get(item.key) ?? 0) + item.count);
            }
        });
        for (const [key, sum] of blockSums) {
            const total = totals.get(key);
            if (total) total.blockMax = Math.max(total.blockMax, sum);
        }
    }

    for (const item of practice) {
        const kind = equipmentKindFor(item.name);
        const total = entry(equipmentKey({ kind, name: item.name }), kind, kind ? EQUIPMENT_PLURAL_LABELS[kind] : item.name);
        total.practice += item.count;
    }

    const ordered = [...totals.values()].sort((a, b) => rank(a) - rank(b));
    return ordered.map(({ blockMax, ...total }) => ({ ...total, count: blockMax + total.practice }));
}

/** Kinds by EQUIPMENT_KINDS; typed items after, in insertion order (Array.prototype.sort is stable). */
function rank(total: { kind: EquipmentKind | null }): number {
    return total.kind ? EQUIPMENT_KINDS.indexOf(total.kind) : EQUIPMENT_KINDS.length;
}

/** "Cones ×12 · Nets ×2", or null when the practice needs nothing. */
export function rollupLine(totals: readonly EquipmentTotal[]): string | null {
    return equipmentLine(totals);
}

/** A session view's row (detail page, bench sheet, exports). */
export function viewRowEquipment(row: SessionRow): EquipmentDrillSource | null {
    return isBlockRow(row) ? null : { name: row.play.name, playData: row.play.playData };
}

/** An editor's or a plan preview's row; an unreadable diagram's empty stand-in counts as unreadable. */
export function editorRowEquipment(row: SessionItem | { kind?: string; name: string; playData: PlayData; playDataUnreadable?: boolean }): EquipmentDrillSource | null {
    if (row.kind !== undefined && row.kind !== "drill") return null;
    const drill = row as { name: string; playData: PlayData; playDataUnreadable?: boolean };
    return { name: drill.name, playData: drill.playDataUnreadable ? null : drill.playData };
}
