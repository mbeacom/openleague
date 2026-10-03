import { describe, it, expect } from "vitest";
import {
    AREA_EDIT_MARGIN_FT,
    areaMaskRect,
    areaRect,
    countElementsOutside,
    editViewport,
    isFullIce,
    rectContains,
    sameArea,
    withArea,
} from "@/lib/utils/ice-area";
import { BLUE_LINES, FULL_RINK, RINK_DIMENSIONS } from "@/lib/utils/canvas/rink-renderer";
import { ICE_AREA_LABELS, iceAreaLabel } from "@/lib/utils/canvas/notation";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { ICE_AREA_PRESETS, MIN_AREA_FT, type IceArea, type PlayData } from "@/types/practice-planner";

describe("BLUE_LINES / FULL_RINK", () => {
    it("derive from the renderer's zone widths", () => {
        expect(BLUE_LINES).toEqual({ left: 75, right: 125 });
        expect(FULL_RINK).toEqual({ x: 0, y: 0, w: RINK_DIMENSIONS.width, h: RINK_DIMENSIONS.height });
        expect(MIN_AREA_FT).toBe(20);
        expect(AREA_EDIT_MARGIN_FT).toBe(5);
    });
});

describe("areaRect", () => {
    it.each([
        ["full", 0, 200],
        ["half-left", 0, 100],
        ["half-right", 100, 200],
        ["zone-left", 0, 75],
        ["zone-neutral", 75, 125],
        ["zone-right", 125, 200],
    ] as const)("%s spans x %d-%d over the full height", (kind, x0, x1) => {
        expect(areaRect({ kind })).toEqual({ x: x0, y: 0, w: x1 - x0, h: 85 });
    });

    it("uses the renderer's blue lines for the zones", () => {
        expect(areaRect({ kind: "zone-left" }).w).toBe(BLUE_LINES.left);
        expect(areaRect({ kind: "zone-neutral" })).toMatchObject({ x: BLUE_LINES.left, w: BLUE_LINES.right - BLUE_LINES.left });
        expect(areaRect({ kind: "zone-right" }).x).toBe(BLUE_LINES.right);
    });

    it("treats a missing area as full ice", () => {
        expect(areaRect(undefined)).toEqual(FULL_RINK);
        expect(isFullIce(undefined)).toBe(true);
        expect(isFullIce({ kind: "full" })).toBe(true);
        expect(isFullIce({ kind: "zone-left" })).toBe(false);
    });

    it("returns a copy of a custom rectangle", () => {
        const area: IceArea = { kind: "custom", rect: { x: 100, y: 30, w: 20, h: 20 } };
        const rect = areaRect(area);
        rect.x = 0;
        expect(area.rect.x).toBe(100);
    });
});

describe("editViewport", () => {
    it("is the whole rink for full ice", () => {
        expect(editViewport(undefined)).toEqual(FULL_RINK);
        expect(editViewport({ kind: "full" })).toEqual(FULL_RINK);
    });

    it("adds a 5 ft margin clamped to the rink", () => {
        expect(editViewport({ kind: "zone-left" })).toEqual({ x: 0, y: 0, w: 80, h: 85 });
        expect(editViewport({ kind: "zone-neutral" })).toEqual({ x: 70, y: 0, w: 60, h: 85 });
        expect(editViewport({ kind: "half-right" })).toEqual({ x: 95, y: 0, w: 105, h: 85 });
        expect(editViewport({ kind: "custom", rect: { x: 100, y: 30, w: 20, h: 20 } })).toEqual({ x: 95, y: 25, w: 30, h: 30 });
    });
});

describe("countElementsOutside", () => {
    const data: PlayData = {
        ...createEmptyPlayData(),
        players: [
            { id: "in", position: { x: 75, y: 40 }, role: "X", label: "", color: "#1976D2" },
            { id: "out", position: { x: 150, y: 40 }, role: "X", label: "", color: "#1976D2" },
        ],
        drawings: [
            { id: "cross", action: "skate", path: "straight", end: "arrow", points: [{ x: 60, y: 40 }, { x: 90, y: 40 }], color: "#212121", strokeWidth: 2 },
            { id: "inside", action: "pass", path: "straight", end: "arrow", points: [{ x: 10, y: 10 }, { x: 70, y: 70 }], color: "#212121", strokeWidth: 2 },
        ],
        equipment: [{ id: "net", kind: "net", position: { x: 189, y: 42.5 }, rotation: 0 }],
        annotations: [{ id: "a", text: "Go", position: { x: 20, y: 20 }, fontSize: 8, color: "#000000" }],
    };

    it("counts positions outside and strokes with any point outside; edges are inside", () => {
        expect(countElementsOutside(data, areaRect({ kind: "zone-left" }))).toBe(3);
        expect(countElementsOutside(data, FULL_RINK)).toBe(0);
        expect(rectContains(areaRect({ kind: "zone-left" }), { x: 75, y: 85 })).toBe(true);
    });
});

describe("withArea / sameArea", () => {
    it("sets an area as a copy", () => {
        const rect = { x: 100, y: 30, w: 20, h: 20 };
        const next = withArea(createEmptyPlayData(), { kind: "custom", rect });
        expect(next.area).toEqual({ kind: "custom", rect });
        rect.x = 0;
        expect(next.area).toEqual({ kind: "custom", rect: { x: 100, y: 30, w: 20, h: 20 } });
    });

    it("removes the key for full ice and keeps the reference when nothing changes", () => {
        const zoned = withArea(createEmptyPlayData(), { kind: "zone-left" });
        const cleared = withArea(zoned, undefined);
        expect("area" in cleared).toBe(false);
        expect("area" in withArea(zoned, { kind: "full" })).toBe(false);
        expect(withArea(zoned, { kind: "zone-left" })).toBe(zoned);
        const empty = createEmptyPlayData();
        expect(withArea(empty, undefined)).toBe(empty);
    });

    it("normalizes an explicit full area away (no area key)", () => {
        const explicit: PlayData = { ...createEmptyPlayData(), area: { kind: "full" } };
        expect("area" in withArea(explicit, undefined)).toBe(false);
        expect("area" in withArea(explicit, { kind: "full" })).toBe(false);
    });

    it("compares custom rectangles by value", () => {
        const a: IceArea = { kind: "custom", rect: { x: 0, y: 0, w: 20, h: 20 } };
        expect(sameArea(a, { kind: "custom", rect: { x: 0, y: 0, w: 20, h: 20 } })).toBe(true);
        expect(sameArea(a, { kind: "custom", rect: { x: 5, y: 0, w: 20, h: 20 } })).toBe(false);
        expect(sameArea(undefined, { kind: "full" })).toBe(true);
        expect(sameArea({ kind: "zone-left" }, { kind: "zone-right" })).toBe(false);
    });
});

describe("ICE_AREA_LABELS", () => {
    it("labels every preset and custom", () => {
        expect(ICE_AREA_PRESETS.map((p) => ICE_AREA_LABELS[p])).toEqual([
            "Full ice", "Half ice (left)", "Half ice (right)", "Left end zone", "Neutral zone", "Right end zone",
        ]);
        expect(ICE_AREA_LABELS.custom).toBe("Custom area");
        expect(iceAreaLabel(undefined)).toBe("Full ice");
        expect(iceAreaLabel({ kind: "zone-neutral" })).toBe("Neutral zone");
    });
});

describe("areaMaskRect", () => {
    const area = { kind: "zone-left" as const };
    it("falls back to the stored area for no drag or a bare click", () => {
        expect(areaMaskRect(null, area)).toEqual(areaRect(area));
        const p = { x: 40, y: 40 };
        expect(areaMaskRect({ start: p, end: p }, area)).toEqual(areaRect(area));
        expect(areaMaskRect({ start: p, end: { x: 40.5, y: 40.4 } }, undefined)).toEqual(areaRect(undefined));
    });
    it("previews the snapped rectangle once the drag is past a click", () => {
        expect(areaMaskRect({ start: { x: 40, y: 10 }, end: { x: 70, y: 40 } }, area)).toEqual({ x: 40, y: 10, w: 30, h: 30 });
    });
});
