import { describe, it, expect, vi } from "vitest";
import { drawPlayerGlyph, drawEquipmentGlyph, PLAYER_GLYPH_SHAPE } from "@/lib/utils/canvas/glyphs";
import { DIAGRAM_THEME } from "@/lib/utils/canvas/diagram-theme";
import { glyphRadiusPx, PLAYER_RADIUS_FT, MIN_GLYPH_RADIUS_PX, EQUIPMENT_RADIUS_FT } from "@/lib/utils/canvas/glyph-metrics";
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
        fillRect: fn("fillRect"), roundRect: fn("roundRect"), strokeRect: fn("strokeRect"), save: fn("save"), restore: fn("restore"),
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
    it("enforces the minimum on screen, not in zoomed user space", () => {
        expect(glyphRadiusPx(0.75, 1, 0.5)).toBe(16);
        expect(glyphRadiusPx(6, 4, 2)).toBe(24);
    });
});

describe("drawPlayerGlyph", () => {
    it("falls back to the role letter for a whitespace-only label", () => {
        const ctx = mockCtx();
        drawPlayerGlyph(ctx, player("F", "#1976D2", "   "), P, 10, false);
        expect(ctx.events).toContain("text:F");
    });
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
        // After the drop shadow (spec §3), the ring's only fill is its white backing.
        expect(ctx.events.filter((e) => e.startsWith("fill:") && e !== `fill:${DIAGRAM_THEME.markerShadow}`)).toEqual(["fill:#FFFFFF"]);
        expect(ctx.events).toContain("stroke:#D32F2F");
        expect(ctx.fillText).toHaveBeenCalledWith("O", 0, expect.any(Number));
    });

    it("disc roles fill with the player color", () => {
        const ctx = mockCtx();
        drawPlayerGlyph(ctx, player("F", "#123456"), P, 20, false);
        // The drop shadow (spec §3) comes first, then the player's color.
        expect(ctx.events.slice(0, 2)).toEqual([`fill:${DIAGRAM_THEME.markerShadow}`, "fill:#123456"]);
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
        // The frame and the three mesh lines (spec §3) are all stroked inside the rotation.
        expect(order).toEqual(["save", "translate", "rotate", "stroke", "stroke", "stroke", "stroke", "restore"]);
    });
});

describe("drawAllElements", () => {
    it("scales the minimum glyph radius up when zoomed out", () => {
        const data = {
            ...createEmptyPlayData(),
            equipment: [{ id: "pk", kind: "puck" as const, position: { x: 50, y: 40 }, rotation: 0 }],
        };
        const radii = (zoom?: number) => {
            const ctx = mockCtx();
            drawAllElements(ctx, data, createTransformContext(800, 400), undefined, zoom);
            return (ctx.arc as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[2] as number);
        };
        // The puck's body arc is 0.6 of the glyph radius: 0.6 * 16 user px at zoom 0.5 (8 screen px).
        const zoomedOut = Math.max(...radii(0.5));
        expect(zoomedOut).toBeCloseTo(0.6 * 16);
        expect(zoomedOut).toBeCloseTo(2 * Math.max(...radii()));
    });

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

function recordingGlyphCtx() {
    const lineWidths: number[] = [];
    const fonts: string[] = [];
    const ctx = {
        lineWidths,
        fonts,
        beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
        fillRect: vi.fn(), fillText: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), rect: vi.fn(),
        measureText: (text: string) => ({ width: text.length * 4 }),
        set lineWidth(v: number) { lineWidths.push(v); },
        get lineWidth() { return lineWidths.at(-1) ?? 1; },
        set font(v: string) { fonts.push(v); },
        get font() { return fonts.at(-1) ?? ""; },
        fillStyle: "", strokeStyle: "", textAlign: "", textBaseline: "",
    };
    return ctx as unknown as CanvasRenderingContext2D & { lineWidths: number[]; fonts: string[] };
}

describe("glyph outlines and labels (scale model)", () => {
    const player = { id: "p", role: "F" as const, label: "F1", color: "#1976D2", position: { x: 0, y: 0 } };

    it("keeps today's outline on the reference board", () => {
        const ctx = recordingGlyphCtx();
        drawPlayerGlyph(ctx, player, { x: 50, y: 50 }, 22.8, false, 1);
        expect(ctx.lineWidths[0]).toBeCloseTo(22.8 * 0.12);
    });

    it("scales the outline floor with the diagram, down to 1 px", () => {
        const ctx = recordingGlyphCtx();
        // A 300 px thumbnail: r = 6 ft · 1.4 = 8.4 px; 8.4 · 0.12 ≈ 1.0, and the old 1.5 px floor no longer applies.
        drawPlayerGlyph(ctx, player, { x: 50, y: 50 }, 8.4, false, 1.4 / 3.8);
        expect(ctx.lineWidths[0]).toBeCloseTo(1.008, 2);
    });

    it("sizes the label from the radius without rounding it down to a whole pixel", () => {
        const ctx = recordingGlyphCtx();
        drawPlayerGlyph(ctx, player, { x: 50, y: 50 }, 10, false, 1);
        expect(ctx.fonts[0]).toContain("10.5px");
    });
});

describe("glyph minimum radius (scale model)", () => {
    it("keeps the 8 px minimum on the board, and uses the given minimum elsewhere", () => {
        expect(glyphRadiusPx(EQUIPMENT_RADIUS_FT.puck, 1.4)).toBe(8);
        expect(glyphRadiusPx(EQUIPMENT_RADIUS_FT.puck, 1.4, 1, 1.5)).toBe(1.5);
        expect(glyphRadiusPx(PLAYER_RADIUS_FT, 1.4, 1, 1.5)).toBeCloseTo(8.4);
    });
});

type StyleCall = { name: string; args: unknown[]; state: Record<string, unknown> };

/** Records each call with the fill/stroke/width state in effect. */
function recordingStyleCtx() {
    const calls: StyleCall[] = [];
    const state: Record<string, unknown> = { lineWidth: 1 };
    const ctx = new Proxy({} as Record<string, unknown>, {
        get: (_t, prop) => {
            if (typeof prop !== "string") return undefined;
            if (prop === "measureText") return (text: string) => ({ width: text.length * 4 });
            if (prop in state) return state[prop];
            return (...args: unknown[]) => { calls.push({ name: prop, args, state: { ...state } }); return undefined; };
        },
        set: (_t, prop, value) => { if (typeof prop === "string") state[prop] = value; return true; },
    }) as unknown as CanvasRenderingContext2D;
    return { ctx, calls };
}

describe("playbook markers (spec §3)", () => {
    const at = { x: 100, y: 100 };
    const player = (color: string) => ({ id: "p", role: "F" as const, label: "F1", color, position: { x: 0, y: 0 } });

    it("draws a soft shadow below and offset from the marker, before the marker", () => {
        const { ctx, calls } = recordingStyleCtx();
        drawPlayerGlyph(ctx, player("#1976D2"), at, 20, false, 1);
        const shadow = calls.findIndex((c) => c.name === "fill" && c.state.fillStyle === DIAGRAM_THEME.markerShadow);
        const body = calls.findIndex((c) => c.name === "fill" && c.state.fillStyle === "#1976D2");
        expect(shadow).toBeGreaterThanOrEqual(0);
        expect(shadow).toBeLessThan(body);
        const shadowArc = calls.slice(0, shadow).reverse().find((c) => c.name === "arc")!;
        expect(shadowArc.args[0] as number).toBeGreaterThan(at.x);
        expect(shadowArc.args[1] as number).toBeGreaterThan(at.y);
    });

    it("rings a filled marker in white inside its outline, keeping a custom color visible", () => {
        const { ctx, calls } = recordingStyleCtx();
        drawPlayerGlyph(ctx, player("#7B1FA2"), at, 20, false, 1);
        expect(calls.some((c) => c.name === "fill" && c.state.fillStyle === "#7B1FA2")).toBe(true);
        const ring = calls.find((c) => c.name === "stroke" && c.state.strokeStyle === DIAGRAM_THEME.markerRing);
        expect(ring).toBeDefined();
        expect(ring!.state.lineWidth).toBeCloseTo(20 * 0.08);
    });

    it("leaves the white ring off the goalie, whose glove bar is its mark", () => {
        const { ctx, calls } = recordingStyleCtx();
        drawPlayerGlyph(ctx, { id: "g", role: "G", label: "G", color: "#212121", position: { x: 0, y: 0 } }, at, 20, false, 1);
        expect(calls.some((c) => c.name === "stroke" && c.state.strokeStyle === DIAGRAM_THEME.markerRing)).toBe(false);
    });

    it("keeps the label readable on a custom color", () => {
        const { ctx, calls } = recordingStyleCtx();
        drawPlayerGlyph(ctx, player("#FFEB3B"), at, 20, false, 1); // a light fill
        expect(calls.find((c) => c.name === "fillText")!.state.fillStyle).toBe(DIAGRAM_THEME.labelOnLight);
    });

    it("draws a net as a frame with a mesh, rotated with the net", () => {
        for (const rotation of [0, 90, 180, 270]) {
            const { ctx, calls } = recordingStyleCtx();
            drawEquipmentGlyph(ctx, { kind: "net", rotation }, at, 12, false, 1);
            expect(calls.find((c) => c.name === "rotate")!.args[0]).toBeCloseTo((rotation * Math.PI) / 180);
            expect(calls.some((c) => c.name === "stroke" && c.state.strokeStyle === DIAGRAM_THEME.net)).toBe(true);
            expect(calls.filter((c) => c.name === "stroke" && c.state.strokeStyle === DIAGRAM_THEME.netMesh).length).toBeGreaterThanOrEqual(3);
        }
    });

    it("shades a cone and rims a puck", () => {
        const cone = recordingStyleCtx();
        drawEquipmentGlyph(cone.ctx, { kind: "cone", rotation: 0 }, at, 12, false, 1);
        expect(cone.calls.some((c) => c.name === "fill" && c.state.fillStyle === DIAGRAM_THEME.coneShade)).toBe(true);
        const puck = recordingStyleCtx();
        drawEquipmentGlyph(puck.ctx, { kind: "puck", rotation: 0 }, at, 12, false, 1);
        expect(puck.calls.some((c) => c.name === "stroke" && c.state.strokeStyle === DIAGRAM_THEME.puckRim)).toBe(true);
    });
});
