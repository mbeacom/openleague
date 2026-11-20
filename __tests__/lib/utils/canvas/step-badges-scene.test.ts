/** Step badges in the shared board scene (animated playback R8): opt-in, so stored thumbnails never carry them. */
import { describe, expect, it, vi } from "vitest";
import { drawBoardScene } from "@/lib/utils/canvas/drawing-utils";
import { createTransformContext } from "@/lib/utils/canvas/rink-renderer";
import { PLAY_DATA_VERSION, type DrawingElement, type PlayData } from "@/types/practice-planner";

function recordingContext() {
    const fillText = vi.fn();
    const ctx = new Proxy({ fillText } as Record<string, unknown>, {
        get(t, prop) {
            if (typeof prop !== "string") return undefined;
            if (!(prop in t)) t[prop] = vi.fn(() => ({ width: 10, addColorStop: vi.fn() }));
            return t[prop];
        },
        set(t, prop, value) {
            if (typeof prop === "string") t[prop] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
    return { ctx, labels: () => fillText.mock.calls.map((c) => c[0]) };
}

const stroke = (id: string, y: number, step?: number): DrawingElement => ({
    id,
    action: "skate",
    path: "straight",
    end: "arrow",
    points: [{ x: 20, y }, { x: 80, y }],
    color: "#212121",
    strokeWidth: 3,
    ...(step === undefined ? {} : { step }),
});
const data = (...drawings: DrawingElement[]): PlayData => ({ version: PLAY_DATA_VERSION, players: [], drawings, equipment: [], annotations: [] });
const transform = createTransformContext(800, 340, 20);

describe("drawBoardScene step badges", () => {
    it("draws none unless asked", () => {
        const { ctx, labels } = recordingContext();
        drawBoardScene(ctx, transform, data(stroke("a", 20, 1)), { cachedRink: false });
        expect(labels()).toEqual([]);
    });

    it("draws authored steps only on a still diagram", () => {
        const stepped = recordingContext();
        drawBoardScene(stepped.ctx, transform, data(stroke("a", 20, 4), stroke("b", 50, 9), stroke("c", 70)), { cachedRink: false, stepBadges: "authored" });
        expect(stepped.labels()).toEqual(["1", "2"]);
        const automatic = recordingContext();
        drawBoardScene(automatic.ctx, transform, data(stroke("a", 20)), { cachedRink: false, stepBadges: "authored" });
        expect(automatic.labels()).toEqual([]);
    });

    it("adds the automatic order and unset strokes in Steps mode", () => {
        const { ctx, labels } = recordingContext();
        drawBoardScene(ctx, transform, data(stroke("a", 20, 2), stroke("c", 70)), { cachedRink: false, stepBadges: "all" });
        expect(labels()).toEqual(["1", "–"]);
    });
});
