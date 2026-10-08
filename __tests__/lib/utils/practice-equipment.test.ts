import { describe, expect, it } from "vitest";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { editorRowEquipment, rollupEquipment, rollupLine, viewRowEquipment, type EquipmentTotal } from "@/lib/utils/practice-equipment";
import type { EquipmentKind, EquipmentNeeds, PlayData, PlayInSession, SessionItem, SessionRow } from "@/types/practice-planner";

function board(kinds: EquipmentKind[], needs?: EquipmentNeeds): PlayData {
    return {
        ...createEmptyPlayData(),
        equipment: kinds.map((kind, i) => ({ id: `e${i}`, kind, position: { x: 10 + i, y: 10 }, rotation: 0 })),
        ...(needs ? { equipmentNeeds: needs } : {}),
    };
}

interface Row {
    sequence: number;
    duration: number;
    runsWithPrevious: boolean;
    kind?: "drill" | "break";
    name: string;
    playData: PlayData | null;
}

let seq = 0;
const drill = (name: string, playData: PlayData | null, runsWithPrevious = false): Row => ({ sequence: seq++, duration: 10, runsWithPrevious, name, playData });
const pause = (): Row => ({ sequence: seq++, duration: 2, runsWithPrevious: false, kind: "break", name: "Water break", playData: null });
const source = (row: Row) => (row.kind === "break" ? null : { name: row.name, playData: row.playData });
const totals = (items: EquipmentTotal[]) => items.map((item) => [item.name, item.count]);

describe("rollupEquipment", () => {
    it("takes the largest count across drills that run one after another", () => {
        seq = 0;
        const rows = [drill("Breakout", board(["cone", "cone", "cone", "net"])), pause(), drill("Shooting", board(["cone", "net", "net"]))];
        expect(totals(rollupEquipment(rows, source))).toEqual([["Cones", 3], ["Nets", 2]]);
    });

    it("sums stations that run at the same time, then takes the largest block", () => {
        seq = 0;
        const rows = [
            drill("Warm-up skate", board(["cone", "cone", "cone", "cone", "cone"])),
            drill("Station A", board(["cone", "cone", "net"])),
            drill("Station B", board(["cone", "cone", "puck"]), true),
            drill("Station C", board(["net", "tire"]), true),
        ];
        const result = rollupEquipment(rows, source);
        // Cones: max(5, 2 + 2) = 5. Nets: max(0, 1 + 1) = 2. Puck 1, tire 1.
        expect(totals(result)).toEqual([["Pucks", 1], ["Cones", 5], ["Nets", 2], ["Tires", 1]]);
        const nets = result.find((item) => item.kind === "net");
        expect(nets?.parts).toEqual([
            { name: "Station A", count: 1, block: 1, station: { position: 1, count: 3 } },
            { name: "Station C", count: 1, block: 1, station: { position: 3, count: 3 } },
        ]);
    });

    it("lets a station block need more than any single drill", () => {
        seq = 0;
        const rows = [drill("Solo", board(["cone", "cone", "cone"])), drill("A", board(["cone", "cone"])), drill("B", board(["cone", "cone"]), true)];
        expect(totals(rollupEquipment(rows, source))).toEqual([["Cones", 4]]);
    });

    it("applies each drill's overrides and lists typed items by first appearance", () => {
        seq = 0;
        const rows = [
            drill("One", board(["net"], { kinds: [{ kind: "net", delta: 0, removed: true }], custom: [{ name: "Tennis balls", count: 12 }] })),
            drill("Two", board([], { kinds: [{ kind: "puck", delta: 30, removed: false }], custom: [{ name: "Boards", count: 2 }, { name: "tennis balls", count: 6 }] })),
        ];
        expect(totals(rollupEquipment(rows, source))).toEqual([["Pucks", 30], ["Tennis balls", 12], ["Boards", 2]]);
    });

    it("adds the practice's own items, folding a kind's name into that kind", () => {
        seq = 0;
        const rows = [drill("Breakout", board(["puck", "puck"]))];
        const result = rollupEquipment(rows, source, [{ name: "Pucks", count: 30 }, { name: "Water bottles", count: 20 }]);
        expect(totals(result)).toEqual([["Pucks", 32], ["Water bottles", 20]]);
        expect(result[0]).toMatchObject({ practice: 30, parts: [{ name: "Breakout", count: 2 }] });
        expect(result[1]).toMatchObject({ kind: null, practice: 20, parts: [] });
    });

    it("skips blocks and drills whose diagram can't be read", () => {
        seq = 0;
        const rows = [pause(), drill("Unreadable", null), drill("Fine", board(["cone"]))];
        expect(totals(rollupEquipment(rows, source))).toEqual([["Cones", 1]]);
    });

    it("orders by sequence, not array order", () => {
        const rows: Row[] = [
            { sequence: 1, duration: 10, runsWithPrevious: true, name: "B", playData: board(["cone"]) },
            { sequence: 0, duration: 10, runsWithPrevious: false, name: "A", playData: board(["cone"]) },
        ];
        expect(totals(rollupEquipment(rows, source))).toEqual([["Cones", 2]]);
    });

    it("is empty with nothing to list", () => {
        expect(rollupEquipment([], source)).toEqual([]);
        expect(rollupLine([])).toBeNull();
    });

    it("prints a line with singular labels at 1", () => {
        seq = 0;
        expect(rollupLine(rollupEquipment([drill("A", board(["net", "cone", "cone"]))], source))).toBe("Cones ×2 · Net ×1");
    });
});

describe("row adapters", () => {
    it("reads a session view's rows", () => {
        const drillRow: SessionRow = {
            id: "r1", sequence: 0, duration: 10, instructions: null, runsWithPrevious: false,
            play: { id: "p1", name: "Breakout", description: null, thumbnail: null, playData: board(["cone"]) },
        };
        const block: SessionRow = { id: "r2", kind: "warmup", label: null, sequence: 1, duration: 5, instructions: null, runsWithPrevious: false };
        expect(viewRowEquipment(drillRow)).toEqual({ name: "Breakout", playData: board(["cone"]) });
        expect(viewRowEquipment(block)).toBeNull();
    });

    it("reads the editor's rows, treating an unreadable stand-in as unreadable", () => {
        const play: PlayInSession = {
            id: "k1", playId: "p1", name: "Breakout", sequence: 0, runsWithPrevious: false, duration: 10, instructions: "",
            playData: board(["cone"]),
        };
        expect(editorRowEquipment(play)).toEqual({ name: "Breakout", playData: board(["cone"]) });
        expect(editorRowEquipment({ ...play, playDataUnreadable: true })).toEqual({ name: "Breakout", playData: null });
        const block: SessionItem = { id: "b", kind: "break", label: "", sequence: 1, duration: 2, instructions: "", runsWithPrevious: false };
        expect(editorRowEquipment(block)).toBeNull();
    });
});
