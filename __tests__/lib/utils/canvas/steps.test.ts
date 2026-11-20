/** Authored playback steps (animated playback R6, R8): Steps mode's edits and badge layout. */
import { describe, expect, it } from "vitest";
import { PLAY_DATA_VERSION, VALIDATION_CONSTRAINTS, type DrawingElement, type PlayData } from "@/types/practice-planner";
import { STEP_BADGE_ALONG_FT, STEP_BADGE_OFFSET_FT, assignStep, clearSteps, hasAuthoredSteps, highestStep, numberInDrawingOrder, stepBadges } from "@/lib/utils/canvas/steps";

const stroke = (id: string, action: DrawingElement["action"], y: number, step?: number): DrawingElement => ({
    id,
    action,
    path: "straight",
    end: action === "line" ? "none" : "arrow",
    points: [{ x: 20, y }, { x: 60, y }],
    color: "#212121",
    strokeWidth: 3,
    ...(step === undefined ? {} : { step }),
});

const data = (...drawings: DrawingElement[]): PlayData => ({
    version: PLAY_DATA_VERSION,
    players: [
        { id: "a", role: "F", label: "A", position: { x: 18, y: 20 }, color: "#1976D2" },
        { id: "b", role: "F", label: "B", position: { x: 18, y: 50 }, color: "#1976D2" },
    ],
    drawings,
    equipment: [],
    annotations: [],
});

describe("assignStep", () => {
    it("gives a stroke the step, and takes it away on a second tap with the same step", () => {
        const d = data(stroke("s", "skate", 20));
        const once = assignStep(d, "s", 2);
        expect(once.drawings[0].step).toBe(2);
        expect(assignStep(once, "s", 3).drawings[0].step).toBe(3);
        expect("step" in assignStep(once, "s", 2).drawings[0]).toBe(false);
    });

    it("leaves plain lines, unknown ids and out-of-range steps alone", () => {
        const d = data(stroke("zone", "line", 5), stroke("s", "skate", 20));
        expect(assignStep(d, "zone", 1)).toBe(d);
        expect(assignStep(d, "nope", 1)).toBe(d);
        expect(assignStep(d, "s", 0)).toBe(d);
        expect(assignStep(d, "s", VALIDATION_CONSTRAINTS.MAX_STROKE_STEP + 1)).toBe(d);
        expect(assignStep(d, "s", 1.5)).toBe(d);
    });
});

describe("the shortcuts", () => {
    it("numbers every moving stroke in drawing order, skipping lines", () => {
        const d = data(stroke("s1", "skate", 20), stroke("zone", "line", 5), stroke("s2", "pass", 50, 7));
        const numbered = numberInDrawingOrder(d);
        expect(numbered.drawings.map((x) => x.step)).toEqual([1, undefined, 2]);
        expect(numberInDrawingOrder(numbered)).toBe(numbered);
    });

    it("returns to the automatic order", () => {
        const d = data(stroke("s1", "skate", 20, 2), stroke("s2", "pass", 50));
        const cleared = clearSteps(d);
        expect(cleared.drawings.every((x) => !("step" in x))).toBe(true);
        expect(clearSteps(cleared)).toBe(cleared);
        expect(hasAuthoredSteps(d)).toBe(true);
        expect(hasAuthoredSteps(cleared)).toBe(false);
        expect(highestStep(d)).toBe(2);
        expect(highestStep(cleared)).toBe(0);
    });
});

describe("stepBadges", () => {
    it("shows nothing on a still diagram without authored steps", () => {
        expect(stepBadges(data(stroke("s", "skate", 20)))).toEqual([]);
    });

    it("shows the automatic order in Steps mode, as outlined numbers", () => {
        const badges = stepBadges(data(stroke("s1", "skate", 20), stroke("s2", "skate", 50)), { includeAutomatic: true });
        expect(badges.map((b) => [b.strokeId, b.label, b.kind])).toEqual([
            ["s1", "1", "automatic"],
            ["s2", "1", "automatic"],
        ]);
    });

    it("shows authored steps compacted, and – for a stroke left without one only in Steps mode", () => {
        const d = data(stroke("s1", "skate", 20, 3), stroke("s2", "skate", 50, 9), stroke("s3", "pass", 70), stroke("zone", "line", 5));
        expect(stepBadges(d).map((b) => [b.strokeId, b.label, b.kind])).toEqual([
            ["s1", "1", "authored"],
            ["s2", "2", "authored"],
        ]);
        expect(stepBadges(d, { includeAutomatic: true }).map((b) => b.label)).toEqual(["1", "2", "–"]);
    });

    it("sits just past the marker the stroke leaves, beside the line, and on the ice", () => {
        const [badge] = stepBadges(data(stroke("s", "skate", 20, 1)));
        // Travelling +x, the left side is +y in rink feet.
        expect(badge.position.x).toBeCloseTo(20 + STEP_BADGE_ALONG_FT);
        expect(badge.position.y).toBeCloseTo(20 + STEP_BADGE_OFFSET_FT);
        const [short] = stepBadges(data({ ...stroke("t", "skate", 20, 1), points: [{ x: 20, y: 20 }, { x: 24, y: 20 }] }));
        expect(short.position.x).toBeCloseTo(22);
        const [edge] = stepBadges(data({ ...stroke("e", "skate", 84.5, 1), points: [{ x: 0, y: 84.5 }, { x: 0, y: 0 }] }));
        expect(edge.position.x).toBeGreaterThan(0);
        expect(edge.position.y).toBeLessThan(85);
    });
});
