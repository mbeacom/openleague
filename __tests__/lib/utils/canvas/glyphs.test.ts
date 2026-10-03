import { describe, it, expect, vi } from "vitest";
import { drawPlayerGlyph, drawEquipmentGlyph, PLAYER_GLYPH_SHAPE } from "@/lib/utils/canvas/glyphs";
import { glyphRadiusPx, PLAYER_RADIUS_FT, MIN_GLYPH_RADIUS_PX } from "@/lib/utils/canvas/glyph-metrics";
import { drawAllElements } from "@/lib/utils/canvas/drawing-utils";
import { createTransformContext } from "@/lib/utils/canvas/rink-renderer";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { EQUIPMENT_KINDS, PLAYER_ROLES } from "@/types/practice-planner";

function mockCtx(measure: (t: string) => number = () => 10) {
    const calls: string[] = [];
    const events: string[] = [];
    const ctx: Record<string, unknown> = {
        strokeStyle: "", fillStyle: "", lineWidth: 1, font: "", textAlign: "", textBaseline: "",
        lineCap: "", lineJoin: "",
    };
    const fn = (name: string, extra?: (...a: unknown[]) => void) =>
        vi.fn((...a: unknown[]) => { calls.push(name); extra?.(...a); });
    Object.assign(ctx, {
        beginPath: fn("beginPath"), moveTo: fn("moveTo"), lineTo: fn("lineTo"), arc: fn("arc"),
        closePath: fn("closePath"),
        fill: fn("fill", () => events.push(`fill:${ctx.fillStyle}`)),
        stroke: fn("stroke", () => events.push(`stroke:${ctx.strokeStyle}`)),
        fillText: fn("fillText", (t) => events.push(`text:${t}`)),
        fillRect: fn("fillRect"), strokeRect: fn("strokeRect"), save: fn("save"), restore: fn("restore"),
        translate: fn("translate"), rotate: fn("rotate"),
        setLineDash: vi.fn(), scale: vi.fn(), quadraticCurveTo: vi.fn(),
        measureText: vi.fn((t: string) => ({ width: measure(t) })),
        calls, events,
    });
    return ctx as unknown as CanvasRenderingContext2D & {
        calls: string[]; events: string[]; fillText: ReturnType<typeof vi.fn>;
    };
}

const P = { x: 0, y: 0 };
const player = (role: (typeof PLAYER_ROLES)[number], color = "#1976D2", label = "") =>
    ({ id: "p", role, label, color, position: P });

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

    it("O is a hollow ring: white backing fill, player-colored stroke", () => {
        const ctx = mockCtx();
        drawPlayerGlyph(ctx, player("O", "#D32F2F"), P, 20, false);
        expect(ctx.events.filter((e) => e.startsWith("fill:"))).toEqual(["fill:#FFFFFF"]);
        expect(ctx.events).toContain("stroke:#D32F2F");
        expect(ctx.fillText).toHaveBeenCalledWith("O", 0, expect.any(Number));
    });

    it("disc roles fill with the player color", () => {
        const ctx = mockCtx();
        drawPlayerGlyph(ctx, player("F", "#123456"), P, 20, false);
        expect(ctx.events[0]).toBe("fill:#123456");
    });

    it.each(["X", "F", "D"] as const)("%s is a disc: arc, no goalie bar, no triangle", (role) => {
        const ctx = mockCtx();
        drawPlayerGlyph(ctx, player(role), P, 20, false);
        expect(ctx.calls).toContain("arc");
        expect(ctx.calls).not.toContain("fillRect");
        expect(ctx.calls).not.toContain("closePath");
    });

    it("G draws a disc plus the goalie bar", () => {
        const ctx = mockCtx();
        drawPlayerGlyph(ctx, player("G", "#212121"), P, 20, false);
        expect(ctx.calls).toContain("arc");
        expect(ctx.calls).toContain("fillRect");
    });

    it("C draws a triangle (closed path, no arc)", () => {
        const ctx = mockCtx();
        drawPlayerGlyph(ctx, player("C", "#2E7D32"), P, 20, false);
        expect(ctx.calls).toContain("closePath");
        expect(ctx.calls).not.toContain("arc");
    });

    it("truncates an overlong label with an ellipsis", () => {
        const ctx = mockCtx((t) => 10 * t.length);
        drawPlayerGlyph(ctx, player("X", "#1976D2", "A".repeat(50)), P, 20, false);
        const drawn = ctx.fillText.mock.calls[0][0] as string;
        expect(drawn.endsWith("\u2026")).toBe(true);
        expect(drawn.length).toBeLessThan(50);
        expect(10 * drawn.length).toBeLessThanOrEqual(20 * 1.6);
    });

    it("leaves a short label untouched", () => {
        const ctx = mockCtx((t) => 10 * t.length);
        drawPlayerGlyph(ctx, player("X", "#1976D2", "LW"), P, 20, false);
        expect(ctx.fillText.mock.calls[0][0]).toBe("LW");
    });
});

describe("drawEquipmentGlyph", () => {
    const draw = (kind: (typeof EQUIPMENT_KINDS)[number], rotation = 0) => {
        const ctx = mockCtx();
        drawEquipmentGlyph(ctx, { kind, rotation }, { x: 10, y: 10 }, 12, false);
        return ctx;
    };

    it.each(EQUIPMENT_KINDS)("draws %s", (kind) => {
        expect(draw(kind).calls.length).toBeGreaterThan(0);
    });

    it.each(["cone", "pylon"] as const)("%s fills orange as a closed triangle", (kind) => {
        const ctx = draw(kind);
        expect(ctx.events).toContain("fill:#F57C00");
        expect(ctx.calls).toContain("closePath");
    });

    it("puck fills a single dot", () => {
        const ctx = draw("puck");
        expect(ctx.events.filter((e) => e.startsWith("fill:"))).toHaveLength(1);
        expect(ctx.calls.filter((c) => c === "arc")).toHaveLength(1);
    });

    it("puckPile fills three pucks", () => {
        expect(draw("puckPile").events.filter((e) => e.startsWith("fill:"))).toHaveLength(3);
    });

    it("tire strokes a ring and never fills", () => {
        const ctx = draw("tire");
        expect(ctx.calls).toContain("stroke");
        expect(ctx.calls).not.toContain("fill");
    });

    it("rotates nets inside save/restore, in order", () => {
        const ctx = draw("net", 90);
        const order = ctx.calls.filter((c) => ["save", "translate", "rotate", "stroke", "restore"].includes(c));
        expect(order).toEqual(["save", "translate", "rotate", "stroke", "restore"]);
    });
});

describe("drawAllElements", () => {
    it("paints drawings, then equipment, then players, then annotations", () => {
        const ctx = mockCtx();
        const data = {
            ...createEmptyPlayData(),
            drawings: [{
                id: "s", action: "skate" as const, path: "straight" as const, end: "arrow" as const,
                points: [{ x: 20, y: 20 }, { x: 80, y: 20 }], color: "#AA0001", strokeWidth: 2,
            }],
            equipment: [{ id: "c", kind: "cone" as const, position: { x: 50, y: 40 }, rotation: 0 }],
            players: [{ id: "p", role: "F" as const, label: "", color: "#BB0002", position: { x: 60, y: 40 } }],
            annotations: [{ id: "a", text: "NOTE", position: { x: 70, y: 40 }, fontSize: 12, color: "#CC0003" }],
        };
        drawAllElements(ctx, data, createTransformContext(800, 400));
        const idx = (e: string) => ctx.events.indexOf(e);
        const order = [idx("stroke:#AA0001"), idx("fill:#F57C00"), idx("fill:#BB0002"), idx("text:NOTE")];
        expect(order.every((i) => i >= 0)).toBe(true);
        expect([...order].sort((x, y) => x - y)).toEqual(order);
    });
});
