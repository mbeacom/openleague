/**
 * Pins the geometry of every line that exists before line editing (line
 * editing spec R2, success criterion 7): 2-point straight lines, multi-point
 * straight lines (older polylines, such as the starter figure-eight) and
 * freehand lines. The snapshot was recorded from the code before curves
 * existed. Never update it with `-u`: a diff here means existing plays would
 * look different.
 */
import { describe, expect, it } from "vitest";
import { buildStrokeGeometry } from "@/lib/utils/canvas/stroke-geometry";
import { STROKE_ACTIONS, type Position, type StrokeAction, type StrokeEnd } from "@/types/practice-planner";

// Canvas px, as drawStroke passes them; 3.8 px/ft is an 800 × 400 board's scale.
const PX_PER_FT = 3.8;
const STRAIGHT: Position[] = [{ x: 139.7, y: 172.95 }, { x: 562.45, y: 90.3 }];
const FREEHAND: Position[] = [
    { x: 96, y: 248 },
    { x: 153, y: 217.6 },
    { x: 202.4, y: 251.8 },
    { x: 270.8, y: 187.2 },
    { x: 324, y: 210 },
];
/** The starter "ec-figure-eight" route's 16 points, copied here so the pin never moves with starter data. */
const POLYLINE: Position[] = [
    [157, 32.5], [152, 20.5], [157, 8.5], [169, 3.5], [181, 8.5], [186, 20.5], [181, 32.5], [169, 42.5],
    [157, 52.5], [152, 64.5], [157, 76.5], [169, 81.5], [181, 76.5], [186, 64.5], [181, 52.5], [172, 44],
].map(([x, y]) => ({ x: x * PX_PER_FT, y: y * PX_PER_FT }));

const geometry = (path: "straight" | "freehand", action: StrokeAction, end: StrokeEnd, points: Position[]) =>
    JSON.stringify(buildStrokeGeometry({ action, path, end, points, strokeWidth: 2 }, PX_PER_FT));

describe("geometry of lines that exist before line editing", () => {
    for (const action of STROKE_ACTIONS) {
        it(`straight ${action} with an arrow`, () => {
            expect(geometry("straight", action, "arrow", STRAIGHT)).toMatchSnapshot();
        });
        it(`freehand ${action} with an arrow`, () => {
            expect(geometry("freehand", action, "arrow", FREEHAND)).toMatchSnapshot();
        });
    }
    for (const end of ["stop", "none"] as const) {
        it(`straight skate with end ${end}`, () => {
            expect(geometry("straight", "skate", end, STRAIGHT)).toMatchSnapshot();
        });
    }
    for (const action of ["lateral", "skate", "pass"] as const) {
        it(`16-point straight polyline, ${action} with an arrow`, () => {
            expect(geometry("straight", action, "arrow", POLYLINE)).toMatchSnapshot();
        });
    }
});
