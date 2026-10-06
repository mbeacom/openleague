import { describe, it, expect, vi } from "vitest";
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
    sanitizePlayDataForWrite,
} from "@/lib/utils/play-data";
import { RINK_DIMENSIONS } from "@/lib/utils/canvas/rink-renderer";
import { VALIDATION_CONSTRAINTS, type IceArea } from "@/types/practice-planner";

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

    it("drops a blank stored v2 annotation instead of rejecting the whole play", () => {
        const stored = {
            ...createEmptyPlayData(),
            annotations: [
                { id: "blank", text: "", position: { x: 5, y: 5 }, fontSize: 8, color: "#000000" },
                { id: "ok", text: "Go", position: { x: 5, y: 5 }, fontSize: 8, color: "#000000" },
            ],
        };
        const parsed = parseStoredPlayData(stored);
        expect(parsed.ok).toBe(true);
        if (parsed.ok) expect(parsed.data.annotations.map((a) => a.id)).toEqual(["ok"]);
    });

    it("drops a v1 annotation that is blank once truncated", () => {
        const text = " ".repeat(600) + "x";
        const v2 = upgradePlayData({ ...v1Play, annotations: [...v1Play.annotations, { ...v1Play.annotations[0], id: "a2", text }] });
        expect(v2.annotations.map((a) => a.id)).toEqual(["a1"]);
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

    it("clamps an oversized v1 annotation fontSize to 200", () => {
        const v2 = upgradePlayData({
            ...v1Play,
            annotations: [{ id: "a1", text: "Hi", position: { x: 5, y: 5 }, fontSize: 500, color: "#000000" }],
        });
        expect(v2.annotations[0].fontSize).toBe(200);
    });

    it("replaces an over-long v1 id with a deterministic id of at most 100 characters", () => {
        const v2 = upgradePlayData({
            ...v1Play,
            players: [{ id: "x".repeat(150), position: { x: 5, y: 5 }, label: "A", color: "#000000" }],
        });
        expect(v2.players[0].id.length).toBeLessThanOrEqual(100);
        expect(v2.players[0].id).toBe("v1-player-0");
    });

    it("keeps two long v1 ids that share a 100-char prefix distinct", () => {
        const prefix = "y".repeat(100);
        const v2 = upgradePlayData({
            ...v1Play,
            players: [
                { id: `${prefix}A${"z".repeat(49)}`, position: { x: 5, y: 5 }, label: "A", color: "#000000" },
                { id: `${prefix}B${"z".repeat(49)}`, position: { x: 6, y: 6 }, label: "B", color: "#000000" },
            ],
        });
        expect(new Set(v2.players.map((p) => p.id)).size).toBe(2);
    });

    it("keeps short unique v1 ids unchanged and de-duplicates across kinds", () => {
        const v2 = upgradePlayData({
            players: [{ id: "p1", position: { x: 5, y: 5 }, label: "A", color: "#000000" }],
            drawings: [{ id: "d1", type: "line", points: [{ x: 1, y: 1 }, { x: 2, y: 2 }], color: "#000000", strokeWidth: 2 }],
            annotations: [{ id: "p1", text: "Hi", position: { x: 5, y: 5 }, fontSize: 12, color: "#000000" }],
        });
        expect(v2.players[0].id).toBe("p1");
        expect(v2.drawings[0].id).toBe("d1");
        const ids = [...v2.players, ...v2.drawings, ...v2.annotations].map((e) => e.id);
        expect(new Set(ids).size).toBe(3);
    });

    it("is idempotent for upgraded long ids", () => {
        const v2 = upgradePlayData({
            ...v1Play,
            players: [{ id: "x".repeat(150), position: { x: 5, y: 5 }, label: "A", color: "#000000" }],
        });
        expect(upgradePlayData(v2)).toEqual(v2);
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

    it("does not divide by zero when maxPoints is below 2", () => {
        const pts = [0, 1, 2, 3, 4].map((x) => ({ x: x * 10, y: 0 }));
        expect(simplifyPoints(pts, 0, 1)).toEqual([pts[0], pts[4]]);
    });
});

describe("sanitizePlayDataForWrite", () => {
    it("strips control characters from labels and annotation text", () => {
        const data = {
            ...createEmptyPlayData(),
            annotations: [{ id: "a", text: "Go\u0001", position: { x: 5, y: 5 }, fontSize: 8, color: "#000000" }],
        };
        const result = sanitizePlayDataForWrite(data);
        expect(result.ok && result.data.annotations[0].text).toBe("Go");
    });

    it("rejects data that sanitizes to blank", () => {
        const data = {
            ...createEmptyPlayData(),
            annotations: [{ id: "a", text: "\u0001", position: { x: 5, y: 5 }, fontSize: 8, color: "#000000" }],
        };
        expect(sanitizePlayDataForWrite(data).ok).toBe(false);
    });
});

describe("ice area", () => {
    const zone: IceArea = { kind: "zone-neutral" };
    const custom: IceArea = { kind: "custom", rect: { x: 100, y: 30, w: 20, h: 20 } };
    const invalidAreas: Array<[string, unknown]> = [
        ["outside the rink", { kind: "custom", rect: { x: 190, y: 0, w: 20, h: 20 } }],
        ["under 20 ft", { kind: "custom", rect: { x: 0, y: 0, w: 10, h: 85 } }],
        ["NaN", { kind: "custom", rect: { x: Number.NaN, y: 0, w: 20, h: 20 } }],
        ["negative", { kind: "custom", rect: { x: -5, y: 0, w: 20, h: 20 } }],
        ["an unknown kind", { kind: "middle" }],
        ["custom without a rect", { kind: "custom" }],
        ["null", null],
        ["a bare string", "zone-left"],
    ];

    it("round-trips a valid preset and custom area", () => {
        for (const area of [zone, custom]) {
            const stored = { ...createEmptyPlayData(), area };
            expect(upgradePlayData(stored)).toStrictEqual(stored);
            expect(playDataSchema.safeParse(stored).success).toBe(true);
        }
    });

    it("keeps a missing area missing", () => {
        const result = upgradePlayData(createEmptyPlayData());
        expect("area" in result).toBe(false);
        expect("area" in upgradePlayData(v1Play)).toBe(false);
    });

    it.each(invalidAreas)("drops and logs an area that is %s on read (v2)", (_label, area) => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const parsed = parseStoredPlayData({ ...createEmptyPlayData(), area });
        expect(parsed.ok).toBe(true);
        expect(parsed.ok && "area" in parsed.data).toBe(false);
        expect(errorSpy).toHaveBeenCalledWith("Dropping invalid ice area from play data:", area);
        errorSpy.mockRestore();
    });

    it.each(invalidAreas)("rejects an area that is %s on write", (_label, area) => {
        expect(playDataSchema.safeParse({ ...createEmptyPlayData(), area }).success).toBe(false);
    });

    it("drops an explicitly undefined area without logging", () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const result = upgradePlayData({ ...createEmptyPlayData(), area: undefined });
        expect("area" in result).toBe(false);
        expect(errorSpy).not.toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it("carries a valid area across the v1 upgrade and drops an invalid one", () => {
        expect(upgradePlayData({ ...v1Play, area: zone }).area).toEqual(zone);
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        expect("area" in upgradePlayData({ ...v1Play, area: { kind: "custom", rect: { x: 0, y: 0, w: 5, h: 5 } } })).toBe(false);
        expect(errorSpy).toHaveBeenCalledTimes(1);
        errorSpy.mockRestore();
    });

    it("is idempotent with an area", () => {
        const once = upgradePlayData({ ...createEmptyPlayData(), area: custom });
        expect(upgradePlayData(once)).toStrictEqual(once);
    });

    it("keeps the area through write sanitizing", () => {
        const result = sanitizePlayDataForWrite({ ...createEmptyPlayData(), area: custom });
        expect(result.ok && result.data.area).toEqual(custom);
    });
});

describe("the curve path (line editing R1)", () => {
    const withPath = (path: string) => ({
        ...createEmptyPlayData(),
        drawings: [{ id: "d", action: "skate", path, end: "arrow", points: [{ x: 10, y: 10 }, { x: 30, y: 30 }, { x: 50, y: 10 }], color: "#212121", strokeWidth: 2 }],
    });

    it("accepts a curve line at version 2 and still rejects an unknown path", () => {
        expect(playDataSchema.safeParse(withPath("curve")).success).toBe(true);
        expect(parseStoredPlayData(withPath("curve")).ok).toBe(true);
        expect(playDataSchema.safeParse(withPath("spline")).success).toBe(false);
    });
});
