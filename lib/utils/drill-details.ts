/**
 * Pure helpers for a library drill's details view (hosted and static):
 * labels, the diagram's equipment summary, the duplicate's name and the
 * first row of a practice started from the drill. No React, server or DOM
 * imports, so both deployables and the server pages share it.
 */
import { EQUIPMENT_KINDS, type EquipmentKind, type PlayData, type PlayFocus, type PlayGoalies, type PlayInSession } from "@/types/practice-planner";
import type { AgeGroup } from "@/lib/utils/age-groups";
import { EQUIPMENT_LABELS } from "@/lib/utils/canvas/notation";

/** createPlaySchema's name limit. */
export const DRILL_NAME_MAX = 100;
const COPY_SUFFIX = " (copy)";

/** "Breakout (copy)", shortened so the result still fits the name limit. */
export function duplicateDrillName(name: string): string {
    const base = name.trim().slice(0, DRILL_NAME_MAX - COPY_SUFFIX.length).trimEnd();
    return `${base}${COPY_SUFFIX}`;
}

/** "Not in any practice yet", "Used in 1 practice", "Used in 3 practices". */
export function usedInLabel(count: number): string {
    if (count <= 0) return "Not in any practice yet";
    return `Used in ${count} practice${count === 1 ? "" : "s"}`;
}

export interface EquipmentCount {
    kind: EquipmentKind;
    label: string;
    count: number;
}

/** The gear drawn on the diagram, counted by kind in the toolbar's order. Empty when there is none. */
export function diagramEquipment(playData: Pick<PlayData, "equipment"> | null | undefined): EquipmentCount[] {
    const counts = new Map<EquipmentKind, number>();
    for (const item of playData?.equipment ?? []) {
        counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
    }
    return EQUIPMENT_KINDS.filter((kind) => counts.has(kind)).map((kind) => ({
        kind,
        label: EQUIPMENT_LABELS[kind],
        count: counts.get(kind) ?? 0,
    }));
}

/** "Puck pile ×2" or "Net". */
export function equipmentCountLabel({ label, count }: EquipmentCount): string {
    return count > 1 ? `${label} ×${count}` : label;
}

/** A file-safe name for the downloaded diagram: "breakout-diagram.png". */
export function drillDiagramFileName(name: string): string {
    const slug = name
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60)
        .replace(/-+$/g, "");
    return `${slug || "drill"}-diagram.png`;
}

/** What libraryDrillRow reads: a library drill as either store returns it. */
export interface LibraryDrillSource {
    id: string;
    name: string;
    description?: string | null;
    thumbnail?: string | null;
    playData: PlayData;
    focus?: PlayFocus;
    goalies?: PlayGoalies;
    ageGroups?: AgeGroup[];
}

/**
 * The editor row for a library drill, exactly as the session editor's
 * "Add from library" builds one: a 10-minute drill on its own, carrying a deep
 * copy of the diagram so the library play is never mutated.
 */
export function libraryDrillRow(play: LibraryDrillSource, key: string): PlayInSession {
    return {
        id: key,
        playId: play.id,
        name: play.name,
        description: play.description || "",
        sequence: 0,
        runsWithPrevious: false,
        duration: 10,
        instructions: play.description || "",
        playData: structuredClone(play.playData),
        focus: play.focus,
        goalies: play.goalies,
        ageGroups: play.ageGroups,
        thumbnail: play.thumbnail || "",
    };
}
