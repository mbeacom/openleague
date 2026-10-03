import { describe, it, expect } from "vitest";
import { findElement, updateElement, removeElement, moveElement, placePlayer, placeEquipment, finishStroke, limitMessage } from "@/lib/utils/canvas/element-ops";
import { ROLE_DEFAULT_COLORS } from "@/lib/utils/canvas/notation";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { VALIDATION_CONSTRAINTS, type PlayData } from "@/types/practice-planner";

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

    it("returns the same reference when the patch changes nothing", () => {
        expect(updateElement(data, "p", { role: "X" })).toBe(data);
        expect(updateElement(data, "d", { action: "skate", color: "#000000" })).toBe(data);
        expect(updateElement(data, "e", { kind: "net" })).toBe(data);
        expect(updateElement(data, "p", { label: "B" })).not.toBe(data);
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

describe("placement", () => {
    const empty = createEmptyPlayData();

    it("places a player with the role's default color and empty label", () => {
        expect(placePlayer(empty, { x: 5, y: 5 }, "D", "p").players[0]).toEqual({
            id: "p", position: { x: 5, y: 5 }, role: "D", label: "", color: ROLE_DEFAULT_COLORS.D,
        });
    });

    it("places equipment unrotated", () => {
        expect(placeEquipment(empty, { x: 5, y: 5 }, "net", "n").equipment[0]).toEqual({ id: "n", kind: "net", position: { x: 5, y: 5 }, rotation: 0 });
    });

    it("stores a straight stroke as its endpoints", () => {
        const raw = [{ x: 20, y: 20 }, { x: 40, y: 30 }, { x: 60, y: 20 }];
        const s = finishStroke(empty, raw, { action: "pass", path: "straight", end: "arrow" }, "#1976D2", "s").drawings[0];
        expect(s).toMatchObject({ action: "pass", path: "straight", end: "arrow", color: "#1976D2", strokeWidth: 2 });
        expect(s.points).toEqual([{ x: 20, y: 20 }, { x: 60, y: 20 }]);
    });

    it("simplifies freehand strokes", () => {
        const raw = Array.from({ length: 200 }, (_, i) => ({ x: 10 + i * 0.1, y: 10 }));
        const s = finishStroke(empty, raw, { action: "carry", path: "freehand", end: "arrow" }, "#000000", "s").drawings[0];
        expect(s.points.length).toBeLessThan(raw.length);
    });

    it("ignores taps shorter than 1 ft", () => {
        expect(finishStroke(empty, [{ x: 5, y: 5 }, { x: 5.4, y: 5 }], { action: "skate", path: "freehand", end: "arrow" }, "#000000", "s")).toBe(empty);
    });

    it("caps a 3000-point freehand stroke at MAX_STROKE_POINTS", () => {
        const raw = Array.from({ length: 3000 }, (_, i) => ({ x: i * 0.6, y: 20 + Math.sin(i / 7) * 10 }));
        const next = finishStroke(empty, raw, { action: "skate", path: "freehand", end: "arrow" }, "#212121", "s");
        expect(next.drawings).toHaveLength(1);
        expect(next.drawings[0].points.length).toBeLessThanOrEqual(VALIDATION_CONSTRAINTS.MAX_STROKE_POINTS);
    });

    it("ignores a single point", () => {
        expect(finishStroke(empty, [{ x: 5, y: 5 }], { action: "skate", path: "straight", end: "arrow" }, "#000000", "s")).toBe(empty);
    });
});

describe("limitMessage", () => {
    const cones = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, kind: "cone" as const, position: { x: 1, y: 1 }, rotation: 0 }));

    it("blocks the 51st equipment item", () => {
        expect(limitMessage({ ...createEmptyPlayData(), equipment: cones(50) }, "equipment")).toMatch(/50 equipment/);
        expect(limitMessage({ ...createEmptyPlayData(), equipment: cones(49) }, "equipment")).toBeNull();
    });

    it("blocks anything past the total element cap", () => {
        const players = Array.from({ length: 50 }, (_, i) => ({ id: `p${i}`, position: { x: 1, y: 1 }, role: "X" as const, label: "", color: "#000000" }));
        expect(limitMessage({ ...createEmptyPlayData(), players, equipment: cones(50) }, "annotation")).toMatch(/100/);
    });
});
