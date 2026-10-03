import { EQUIPMENT_KINDS, PLAYER_ROLES, STROKE_ACTIONS, type EquipmentKind, type PlayData, type PlayerRole, type StrokeAction } from "@/types/practice-planner";
import { ACTION_LABELS, END_LABELS, EQUIPMENT_LABELS, ROLE_LABELS } from "./notation";

export type LegendEntry = { key: string; label: string } & (
    | { type: "action"; action: StrokeAction }
    | { type: "end"; end: "stop" }
    | { type: "role"; role: PlayerRole }
    | { type: "equipment"; kind: EquipmentKind }
);

/** Symbols a drill actually uses, in a fixed order. `line` and the arrow end need no explanation. */
export function buildLegend(data: PlayData): LegendEntry[] {
    const actions = new Set(data.drawings.map((d) => d.action));
    const roles = new Set(data.players.map((p) => p.role));
    const kinds = new Set(data.equipment.map((e) => e.kind));
    const entries: LegendEntry[] = [];
    for (const action of STROKE_ACTIONS) {
        if (action !== "line" && actions.has(action)) entries.push({ key: `action-${action}`, label: ACTION_LABELS[action], type: "action", action });
    }
    if (data.drawings.some((d) => d.end === "stop")) entries.push({ key: "end-stop", label: END_LABELS.stop, type: "end", end: "stop" });
    for (const role of PLAYER_ROLES) {
        if (roles.has(role)) entries.push({ key: `role-${role}`, label: ROLE_LABELS[role], type: "role", role });
    }
    for (const kind of EQUIPMENT_KINDS) {
        if (kinds.has(kind)) entries.push({ key: `equipment-${kind}`, label: EQUIPMENT_LABELS[kind], type: "equipment", kind });
    }
    return entries;
}
