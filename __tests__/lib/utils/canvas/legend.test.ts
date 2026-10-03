import { describe, it, expect } from "vitest";
import { buildLegend } from "@/lib/utils/canvas/legend";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const s = (id: string, action: "pass" | "carry" | "line" | "skate", end: "arrow" | "stop" | "none" = "arrow") =>
    ({ id, action, path: "straight" as const, end, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "#000000", strokeWidth: 2 });

describe("buildLegend", () => {
    it("is empty for an empty play", () => {
        expect(buildLegend(createEmptyPlayData())).toEqual([]);
    });

    it("lists each used symbol once, in a stable order, omitting self-explanatory ones", () => {
        const data = {
            ...createEmptyPlayData(),
            drawings: [s("1", "pass"), s("2", "carry"), s("3", "pass"), s("4", "line"), s("5", "skate", "stop")],
            players: [
                { id: "p1", role: "O" as const, label: "", color: "#D32F2F", position: { x: 1, y: 1 } },
                { id: "p2", role: "D" as const, label: "", color: "#0D47A1", position: { x: 1, y: 1 } },
            ],
            equipment: [{ id: "e", kind: "cone" as const, position: { x: 1, y: 1 }, rotation: 0 }],
        };
        expect(buildLegend(data).map((e) => e.label)).toEqual([
            "Skate", "Puck carry", "Pass", "Stop", "Opponent", "Defense", "Cone",
        ]);
    });
});
