import { describe, it, expect, vi } from "vitest";
import { drawPlayerGlyph, drawEquipmentGlyph, PLAYER_GLYPH_SHAPE } from "@/lib/utils/canvas/glyphs";
import { glyphRadiusPx, PLAYER_RADIUS_FT, MIN_GLYPH_RADIUS_PX } from "@/lib/utils/canvas/glyph-metrics";
import { drawAllElements } from "@/lib/utils/canvas/drawing-utils";
import { createTransformContext } from "@/lib/utils/canvas/rink-renderer";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { EQUIPMENT_KINDS, PLAYER_ROLES } from "@/types/practice-planner";

function mockCtx() {
    const calls: string[] = [];
    const fn = (name: string) => vi.fn(() => { calls.push(name); });
    return Object.assign(
        {
            beginPath: fn("beginPath"), moveTo: fn("moveTo"), lineTo: fn("lineTo"), arc: fn("arc"),
            closePath: fn("closePath"), fill: fn("fill"), stroke: fn("stroke"), fillText: vi.fn(),
            fillRect: fn("fillRect"), strokeRect: fn("strokeRect"), save: fn("save"), restore: fn("restore"),
            translate: fn("translate"), rotate: fn("rotate"), measureText: vi.fn(() => ({ width: 10 })),
            strokeStyle: "", fillStyle: "", lineWidth: 1, font: "", textAlign: "", textBaseline: "",
        },
        { calls }
    ) as unknown as CanvasRenderingContext2D & { calls: string[]; fillText: ReturnType<typeof vi.fn> };
}

describe("glyph metrics", () => {
    it("player radius is 6 ft", () => expect(PLAYER_RADIUS_FT).toBe(6));
    it("never renders below the minimum on-screen size", () => {
        expect(glyphRadiusPx(0.75, 1)).toBe(MIN_GLYPH_RADIUS_PX);
        expect(glyphRadiusPx(6, 4)).toBe(24);
    });
});

describe("drawPlayerGlyph", () => {
    it("has a shape for every role", () => {
        for (const role of PLAYER_ROLES) expect(PLAYER_GLYPH_SHAPE[role]).toBeDefined();
    });

    it.each(PLAYER_ROLES)("draws role %s", (role) => {
        const ctx = mockCtx();
        drawPlayerGlyph(ctx, { id: "p", role, label: "", color: "#1976D2", position: { x: 0, y: 0 } }, { x: 50, y: 50 }, 20, false);
        expect(ctx.calls.length).toBeGreaterThan(0);
    });

    it("shows the label, falling back to the role letter", () => {
        const ctx = mockCtx();
        drawPlayerGlyph(ctx, { id: "p", role: "D", label: "", color: "#0D47A1", position: { x: 0, y: 0 } }, { x: 0, y: 0 }, 20, false);
        expect(ctx.fillText).toHaveBeenCalledWith("D", 0, expect.any(Number));
        const ctx2 = mockCtx();
        drawPlayerGlyph(ctx2, { id: "p", role: "X", label: "LW", color: "#1976D2", position: { x: 0, y: 0 } }, { x: 0, y: 0 }, 20, false);
        expect(ctx2.fillText).toHaveBeenCalledWith("LW", 0, expect.any(Number));
    });

    it("O is a hollow ring (stroked, not filled)", () => {
        const ctx = mockCtx();
        drawPlayerGlyph(ctx, { id: "p", role: "O", label: "", color: "#D32F2F", position: { x: 0, y: 0 } }, { x: 0, y: 0 }, 20, false);
        expect(ctx.calls).toContain("stroke");
        expect(ctx.calls.filter((c) => c === "fill")).toHaveLength(1); // only the white backing disc
    });
});

describe("drawEquipmentGlyph", () => {
    it.each(EQUIPMENT_KINDS)("draws %s", (kind) => {
        const ctx = mockCtx();
        drawEquipmentGlyph(ctx, { kind, rotation: 0 }, { x: 10, y: 10 }, 12, false);
        expect(ctx.calls.length).toBeGreaterThan(0);
    });

    it("rotates nets", () => {
        const ctx = mockCtx();
        drawEquipmentGlyph(ctx, { kind: "net", rotation: 90 }, { x: 10, y: 10 }, 12, false);
        expect(ctx.calls).toContain("rotate");
    });
});

describe("drawAllElements", () => {
    it("paints equipment along with the other layers", () => {
        const ctx = mockCtx();
        const data = { ...createEmptyPlayData(), equipment: [{ id: "c", kind: "cone" as const, position: { x: 50, y: 40 }, rotation: 0 }] };
        drawAllElements(ctx, data, createTransformContext(800, 400));
        expect(ctx.calls).toContain("fill");
    });
});
