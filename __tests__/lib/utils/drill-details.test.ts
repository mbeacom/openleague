import { describe, expect, it } from "vitest";
import {
    DRILL_NAME_MAX,
    diagramEquipment,
    drillDiagramFileName,
    duplicateDrillName,
    equipmentCountLabel,
    libraryDrillRow,
    usedInLabel,
} from "@/lib/utils/drill-details";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { EquipmentItem } from "@/types/practice-planner";

const gear = (kind: EquipmentItem["kind"], id: string): EquipmentItem => ({ id, kind, position: { x: 10, y: 10 }, rotation: 0 });

describe("drill details helpers", () => {
    it("names a duplicate and keeps it inside the name limit", () => {
        expect(duplicateDrillName("Breakout")).toBe("Breakout (copy)");
        const long = duplicateDrillName("x".repeat(DRILL_NAME_MAX));
        expect(long.length).toBeLessThanOrEqual(DRILL_NAME_MAX);
        expect(long.endsWith(" (copy)")).toBe(true);
    });

    it("says how many practices use the drill", () => {
        expect(usedInLabel(0)).toBe("Not in any practice yet");
        expect(usedInLabel(1)).toBe("Used in 1 practice");
        expect(usedInLabel(4)).toBe("Used in 4 practices");
    });

    it("counts the diagram's gear by kind, in the toolbar's order", () => {
        const playData = { ...createEmptyPlayData(), equipment: [gear("cone", "a"), gear("puck", "b"), gear("cone", "c")] };
        const counts = diagramEquipment(playData);
        expect(counts).toEqual([
            { kind: "puck", label: "Puck", count: 1 },
            { kind: "cone", label: "Cone", count: 2 },
        ]);
        expect(counts.map(equipmentCountLabel)).toEqual(["Puck", "Cone ×2"]);
        expect(diagramEquipment(createEmptyPlayData())).toEqual([]);
        expect(diagramEquipment(null)).toEqual([]);
    });

    it("makes a file-safe diagram name", () => {
        expect(drillDiagramFileName("3-on-2 Rush / Regroup!")).toBe("3-on-2-rush-regroup-diagram.png");
        expect(drillDiagramFileName("***")).toBe("drill-diagram.png");
    });

    it("builds the editor row a library pick gets, without sharing the diagram object", () => {
        const playData = { ...createEmptyPlayData(), equipment: [gear("net", "n")] };
        const row = libraryDrillRow(
            { id: "p1", name: "Breakout", description: "Up the wall", thumbnail: null, playData, focus: "team", goalies: "required", ageGroups: ["u10"] },
            "k1",
        );
        expect(row).toMatchObject({
            id: "k1",
            playId: "p1",
            name: "Breakout",
            description: "Up the wall",
            instructions: "Up the wall",
            duration: 10,
            sequence: 0,
            runsWithPrevious: false,
            goalies: "required",
            ageGroups: ["u10"],
            thumbnail: "",
        });
        expect(row.playData).toEqual(playData);
        expect(row.playData).not.toBe(playData);
    });
});
