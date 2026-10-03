/** Pure, immutable edits on PlayData elements by id. */
import type { DrawingElement, EquipmentItem, PlayData, PlayerIcon, Position, TextAnnotation } from "@/types/practice-planner";

export type ElementKind = "player" | "drawing" | "equipment" | "annotation";

export type SelectedElement =
    | { kind: "player"; element: PlayerIcon }
    | { kind: "drawing"; element: DrawingElement }
    | { kind: "equipment"; element: EquipmentItem }
    | { kind: "annotation"; element: TextAnnotation };

export type ElementPatch = Partial<Pick<PlayerIcon, "role" | "label" | "color">> &
    Partial<Pick<DrawingElement, "action" | "end" | "color">> &
    Partial<Pick<EquipmentItem, "kind" | "rotation">> &
    Partial<Pick<TextAnnotation, "text" | "color">>;

const ALLOWED: Record<ElementKind, readonly (keyof ElementPatch)[]> = {
    player: ["role", "label", "color"],
    drawing: ["action", "end", "color"],
    equipment: ["kind", "rotation"],
    annotation: ["text", "color"],
};

export function findElement(data: PlayData, id: string): SelectedElement | null {
    const p = data.players.find((e) => e.id === id);
    if (p) return { kind: "player", element: p };
    const d = data.drawings.find((e) => e.id === id);
    if (d) return { kind: "drawing", element: d };
    const q = data.equipment.find((e) => e.id === id);
    if (q) return { kind: "equipment", element: q };
    const a = data.annotations.find((e) => e.id === id);
    if (a) return { kind: "annotation", element: a };
    return null;
}

function pick(patch: ElementPatch, kind: ElementKind): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of ALLOWED[kind]) if (patch[key] !== undefined) out[key] = patch[key];
    return out;
}

export function updateElement(data: PlayData, id: string, patch: ElementPatch): PlayData {
    const found = findElement(data, id);
    if (!found) return data;
    const fields = pick(patch, found.kind);
    const apply = <T extends { id: string }>(list: T[]) => list.map((e) => (e.id === id ? { ...e, ...fields } : e));
    switch (found.kind) {
        case "player":
            return { ...data, players: apply(data.players) };
        case "drawing":
            return { ...data, drawings: apply(data.drawings) };
        case "equipment":
            return { ...data, equipment: apply(data.equipment) };
        case "annotation":
            return { ...data, annotations: apply(data.annotations) };
    }
}

export function removeElement(data: PlayData, id: string): PlayData {
    return {
        ...data,
        players: data.players.filter((e) => e.id !== id),
        drawings: data.drawings.filter((e) => e.id !== id),
        equipment: data.equipment.filter((e) => e.id !== id),
        annotations: data.annotations.filter((e) => e.id !== id),
    };
}

export function moveElement(data: PlayData, id: string, position: Position): PlayData {
    const move = <T extends { id: string; position: Position }>(list: T[]) =>
        list.map((e) => (e.id === id ? { ...e, position: { ...position } } : e));
    return { ...data, players: move(data.players), equipment: move(data.equipment), annotations: move(data.annotations) };
}
