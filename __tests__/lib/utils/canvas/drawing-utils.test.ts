import { describe, it, expect, vi } from "vitest";
import { drawStroke } from "@/lib/utils/canvas/drawing-utils";
import { createTransformContext } from "@/lib/utils/canvas/rink-renderer";
import { STROKE_ACTIONS, STROKE_ENDS } from "@/types/practice-planner";

function mockCtx() {
    return {
        beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fill: vi.fn(), closePath: vi.fn(),
        strokeStyle: "", fillStyle: "", lineWidth: 1, lineCap: "", lineJoin: "",
    } as unknown as CanvasRenderingContext2D & Record<string, ReturnType<typeof vi.fn>>;
}

const transform = createTransformContext(800, 400);
const points = [{ x: 20, y: 40 }, { x: 120, y: 40 }];

describe("drawStroke", () => {
    it.each(STROKE_ACTIONS)("strokes %s without throwing", (action) => {
        const ctx = mockCtx();
        drawStroke(ctx, { action, path: "straight", end: "none", points, color: "#1976D2", strokeWidth: 2 }, transform);
        expect(ctx.stroke).toHaveBeenCalled();
        expect(ctx.strokeStyle).toBe("#1976D2");
    });

    it.each(STROKE_ENDS)("renders end cap %s", (end) => {
        const ctx = mockCtx();
        drawStroke(ctx, { action: "skate", path: "straight", end, points, color: "#000000", strokeWidth: 2 }, transform);
        if (end === "arrow") expect(ctx.fill).toHaveBeenCalledTimes(1);
        else expect(ctx.fill).not.toHaveBeenCalled();
    });
});
