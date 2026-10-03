import { describe, it, expect } from "vitest";
import { findElement, updateElement, removeElement, moveElement } from "@/lib/utils/canvas/element-ops";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayData } from "@/types/practice-planner";

const data: PlayData = {
    ...createEmptyPlayData(),
    players: [{ id: "p", position: { x: 10, y: 10 }, role: "X", label: "A", color: "#1976D2" }],
    drawings: [{ id: "d", action: "skate", path: "straight", end: "arrow", points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], color: "#000000", strokeWidth: 2 }],
    equipment: [{ id: "e", kind: "net", position: { x: 50, y: 40 }, rotation: 0 }],
    annotations: [{ id: "a", text: "hi", position: { x: 1, y: 1 }, fontSize: 8, color: "#000000" }],
};

describe("element-ops", () => {
    it("finds each kind", () => {
        expect(findElement(data, "p")?.kind).toBe("player");
        expect(findElement(data, "d")?.kind).toBe("drawing");
        expect(findElement(data, "e")?.kind).toBe("equipment");
        expect(findElement(data, "a")?.kind).toBe("annotation");
        expect(findElement(data, "zzz")).toBeNull();
    });

    it("updates a stroke's action and end without touching points", () => {
        const next = updateElement(data, "d", { action: "pass", end: "stop" });
        expect(next.drawings[0]).toMatchObject({ action: "pass", end: "stop", points: data.drawings[0].points });
        expect(data.drawings[0].action).toBe("skate"); // not mutated
    });

    it("ignores fields that don't apply to the element kind", () => {
        const next = updateElement(data, "e", { rotation: 90, label: "nope" } as never);
        expect(next.equipment[0]).toEqual({ ...data.equipment[0], rotation: 90 });
    });

    it("returns the same reference for an unknown id", () => {
        expect(updateElement(data, "zzz", { color: "#000000" })).toBe(data);
    });

    it("removes from whichever collection holds the id", () => {
        expect(removeElement(data, "e").equipment).toEqual([]);
        expect(removeElement(data, "p").players).toEqual([]);
    });

    it("moves equipment, players, annotations", () => {
        expect(moveElement(data, "e", { x: 1, y: 2 }).equipment[0].position).toEqual({ x: 1, y: 2 });
        expect(moveElement(data, "d", { x: 1, y: 2 })).toEqual(data);
    });
});
