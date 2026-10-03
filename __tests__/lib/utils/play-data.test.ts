import { describe, it, expect } from "vitest";
import {
    playDataSchema,
    upgradePlayData,
    parseStoredPlayData,
    createEmptyPlayData,
    strokeFromV1Type,
    simplifyPoints,
    PlayDataError,
    RINK_WIDTH_FT,
    RINK_HEIGHT_FT,
} from "@/lib/utils/play-data";
import { RINK_DIMENSIONS } from "@/lib/utils/canvas/rink-renderer";
import { VALIDATION_CONSTRAINTS } from "@/types/practice-planner";

// Shape of a play saved before this change (no version key, `type` on drawings).
const v1Play = {
    players: [{ id: "p1", position: { x: 20, y: 30 }, label: "D1", color: "#0000FF" }],
    drawings: [
        { id: "d1", type: "line", points: [{ x: 10, y: 10 }, { x: 15, y: 12 }, { x: 20, y: 10 }], color: "#800080", strokeWidth: 2 },
        { id: "d2", type: "arrow", points: [{ x: 30, y: 30 }, { x: 60, y: 30 }], color: "#000000", strokeWidth: 3 },
        { id: "d3", type: "curve", points: [{ x: 40, y: 40 }, { x: 50, y: 45 }, { x: 60, y: 40 }], color: "#FFA500", strokeWidth: 2 },
    ],
    annotations: [{ id: "a1", text: "Go hard", position: { x: 100, y: 20 }, fontSize: 8, color: "#000000" }],
};

describe("rink constants", () => {
    it("match the renderer", () => {
        expect(RINK_WIDTH_FT).toBe(RINK_DIMENSIONS.width);
        expect(RINK_HEIGHT_FT).toBe(RINK_DIMENSIONS.height);
    });
});

describe("strokeFromV1Type", () => {
    it("maps each v1 type per the spec table", () => {
        expect(strokeFromV1Type("line")).toEqual({ action: "line", path: "straight", end: "none" });
        expect(strokeFromV1Type("arrow")).toEqual({ action: "skate", path: "straight", end: "arrow" });
        expect(strokeFromV1Type("curve")).toEqual({ action: "skate", path: "freehand", end: "none" });
    });
});

describe("upgradePlayData", () => {
    it("upgrades a v1 play losslessly", () => {
        const v2 = upgradePlayData(v1Play);
        expect(v2.version).toBe(2);
        expect(v2.equipment).toEqual([]);
        expect(v2.players[0]).toEqual({ id: "p1", position: { x: 20, y: 30 }, role: "X", label: "D1", color: "#0000FF" });
        expect(v2.drawings.map((d) => [d.id, d.action, d.path, d.end])).toEqual([
            ["d1", "line", "straight", "none"],
            ["d2", "skate", "straight", "arrow"],
            ["d3", "skate", "freehand", "none"],
        ]);
        expect(v2.drawings[0].points).toEqual(v1Play.drawings[0].points);
        expect(v2.drawings[2].color).toBe("#FFA500");
        expect(v2.annotations).toEqual(v1Play.annotations);
        expect("type" in v2.drawings[0]).toBe(false);
    });

    it("is idempotent on v2 data", () => {
        const once = upgradePlayData(v1Play);
        expect(upgradePlayData(once)).toEqual(once);
    });

    it("clamps out-of-rink v1 coordinates instead of failing", () => {
        const v2 = upgradePlayData({
            ...v1Play,
            players: [{ id: "p1", position: { x: -4, y: 90 }, label: "A", color: "#000000" }],
        });
        expect(v2.players[0].position).toEqual({ x: 0, y: 85 });
    });

    it("caps very long v1 freehand strokes at MAX_STROKE_POINTS", () => {
        const points = Array.from({ length: 5000 }, (_, i) => ({ x: (i / 5000) * 200, y: 40 + Math.sin(i / 50) * 5 }));
        const v2 = upgradePlayData({
            players: [],
            annotations: [],
            drawings: [{ id: "long", type: "curve", points, color: "#000000", strokeWidth: 2 }],
        });
        const out = v2.drawings[0].points;
        expect(out.length).toBeLessThanOrEqual(VALIDATION_CONSTRAINTS.MAX_STROKE_POINTS);
        expect(out[0]).toEqual(points[0]);
        expect(out[out.length - 1]).toEqual(points[points.length - 1]);
    });

    it("throws PlayDataError for garbage", () => {
        expect(() => upgradePlayData("nope")).toThrow(PlayDataError);
        expect(() => upgradePlayData({ players: "x" })).toThrow(PlayDataError);
    });

    it("throws PlayDataError for an unknown future version", () => {
        expect(() => upgradePlayData({ ...createEmptyPlayData(), version: 3 })).toThrow(PlayDataError);
    });
});

describe("parseStoredPlayData", () => {
    it("returns ok for v1 and v2", () => {
        expect(parseStoredPlayData(v1Play).ok).toBe(true);
        expect(parseStoredPlayData(createEmptyPlayData()).ok).toBe(true);
    });

    it("returns an error result instead of throwing", () => {
        const result = parseStoredPlayData(null);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBeInstanceOf(PlayDataError);
    });
});

describe("playDataSchema", () => {
    const base = createEmptyPlayData();

    it("accepts an empty v2 play", () => {
        expect(playDataSchema.safeParse(base).success).toBe(true);
    });

    it("rejects v1 data on write", () => {
        expect(playDataSchema.safeParse(v1Play).success).toBe(false);
    });

    it("rejects positions outside the rink", () => {
        const bad = { ...base, equipment: [{ id: "c", kind: "cone", position: { x: 201, y: 10 }, rotation: 0 }] };
        expect(playDataSchema.safeParse(bad).success).toBe(false);
    });

    it("rejects strokes with fewer than two points", () => {
        const bad = {
            ...base,
            drawings: [{ id: "s", action: "pass", path: "straight", end: "arrow", points: [{ x: 1, y: 1 }], color: "#000000", strokeWidth: 2 }],
        };
        expect(playDataSchema.safeParse(bad).success).toBe(false);
    });

    it("rejects more than MAX_EQUIPMENT items", () => {
        const equipment = Array.from({ length: VALIDATION_CONSTRAINTS.MAX_EQUIPMENT + 1 }, (_, i) => ({
            id: `c${i}`, kind: "cone", position: { x: 10, y: 10 }, rotation: 0,
        }));
        expect(playDataSchema.safeParse({ ...base, equipment }).success).toBe(false);
    });

    it("enforces MAX_ELEMENTS_PER_PLAY across all collections", () => {
        const equipment = Array.from({ length: 50 }, (_, i) => ({ id: `e${i}`, kind: "puck", position: { x: 5, y: 5 }, rotation: 0 }));
        const players = Array.from({ length: 50 }, (_, i) => ({ id: `p${i}`, position: { x: 5, y: 5 }, role: "X", label: "", color: "#000000" }));
        const annotations = [{ id: "a", text: "x", position: { x: 5, y: 5 }, fontSize: 8, color: "#000000" }];
        expect(playDataSchema.safeParse({ ...base, equipment, players, annotations }).success).toBe(false);
    });

    it("allows an empty player label", () => {
        const ok = { ...base, players: [{ id: "p", position: { x: 5, y: 5 }, role: "O", label: "", color: "#D32F2F" }] };
        expect(playDataSchema.safeParse(ok).success).toBe(true);
    });
});

describe("simplifyPoints", () => {
    it("drops points closer than the minimum distance but keeps endpoints", () => {
        const pts = [{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0.2, y: 0 }, { x: 5, y: 0 }, { x: 5.1, y: 0 }];
        expect(simplifyPoints(pts, 0.5)).toEqual([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5.1, y: 0 }]);
    });

    it("never returns fewer than two points for a two-point input", () => {
        expect(simplifyPoints([{ x: 1, y: 1 }, { x: 1.1, y: 1 }], 0.5)).toHaveLength(2);
    });
});
