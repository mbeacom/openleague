/** Pure line-editing helpers (line editing spec R1, R3, R4, R5). Rink feet throughout. */
import { describe, expect, it } from "vitest";
import {
    DOUBLE_TAP_MS,
    MAX_EDIT_POINTS,
    MAX_LINE_BENDS,
    SNAP_RADIUS_FT,
    anchorPoints,
    findSnapTarget,
    hitTestLineHandle,
    insertBend,
    isDoubleTap,
    lineHandles,
    moveLine,
    moveLinePoint,
    removeBend,
    snapRadiusFt,
    straighten,
    type LineHandle,
    type TapRecord,
} from "@/lib/utils/canvas/line-editing";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { EQUIPMENT_RADIUS_FT, PLAYER_RADIUS_FT } from "@/lib/utils/canvas/glyph-metrics";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import type { DrawingElement, PlayData, Position, RinkRect, StrokePath } from "@/types/practice-planner";

const RINK: RinkRect = { x: 0, y: 0, w: 200, h: 85 };
const line = (points: Position[], path: StrokePath = "straight", id = "l"): DrawingElement => ({
    id, action: "skate", path, end: "arrow", points, color: "#212121", strokeWidth: 2,
});
/** n points along y = 40 + 8 sin(i / 4): a wavy freehand line. */
const wave = (n: number): Position[] => Array.from({ length: n }, (_, i) => ({ x: 40 + i * 2, y: 40 + 8 * Math.sin(i / 4) }));
/** A straight line with `bends` bends, zig-zagging so every bend is real. */
const zigzag = (bends: number): Position[] =>
    Array.from({ length: bends + 2 }, (_, i) => ({ x: 20 + i * 10, y: i % 2 === 0 ? 40 : 50 }));

describe("limits", () => {
    it("are 6 bends and 8 points", () => {
        expect([MAX_LINE_BENDS, MAX_EDIT_POINTS, SNAP_RADIUS_FT, DOUBLE_TAP_MS]).toEqual([6, 8, 3, 300]);
    });

    it("give every starter polyline a corner handle per interior point, and '+' handles only under 6 corners", () => {
        for (const play of STARTER_PLAYS) {
            for (const d of play.playData.drawings) {
                if (d.path !== "straight") continue;
                const handles = lineHandles(d);
                const corners = d.points.length - 2;
                expect(handles.filter((h) => h.kind === "corner")).toHaveLength(corners);
                expect(handles.filter((h) => h.kind === "add")).toHaveLength(corners < MAX_LINE_BENDS ? d.points.length - 1 : 0);
            }
        }
        // The 16-point figure-eight is the starter line with more points than an edit can make
        const eight = STARTER_PLAYS.flatMap((p) => p.playData.drawings).find((d) => d.id === "ec-figure-eight")!;
        expect(eight.points).toHaveLength(16);
        expect(insertBend(eight, 0, { x: 160, y: 30 }, RINK)).toBe(eight);
        expect(straighten(eight).points).toHaveLength(2);
    });
});

describe("anchorPoints", () => {
    it("keeps at most 8 points, always the first and last, all taken from the line", () => {
        const pts = wave(50);
        const anchors = anchorPoints(pts);
        expect(anchors.length).toBeLessThanOrEqual(MAX_EDIT_POINTS);
        expect(anchors.length).toBeGreaterThan(2);
        expect(anchors[0]).toEqual(pts[0]);
        expect(anchors[anchors.length - 1]).toEqual(pts[49]);
        for (const a of anchors) expect(pts).toContainEqual(a);
    });

    it("collapses collinear points to the two ends", () => {
        const pts = Array.from({ length: 20 }, (_, i) => ({ x: i * 3, y: 10 }));
        expect(anchorPoints(pts)).toEqual([{ x: 0, y: 10 }, { x: 57, y: 10 }]);
    });

    it("returns the same array when every point is kept", () => {
        const pts = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }, { x: 30, y: 10 }];
        expect(anchorPoints(pts)).toBe(pts);
        const two = [{ x: 0, y: 0 }, { x: 5, y: 5 }];
        expect(anchorPoints(two)).toBe(two);
    });
});

describe("anchorPoints idempotence", () => {
    const near: Position[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0.1 }, { x: 30, y: 0 }];

    it("keeps every point of a line already at or under the cap", () => {
        expect(anchorPoints(near)).toEqual(near);
        const anchored = anchorPoints(wave(50));
        expect(anchorPoints(anchored)).toEqual(anchored);
    });

    it("keeps all 4 handles of a nearly collinear 4-point freehand line", () => {
        const handles = lineHandles(line(near, "freehand"));
        expect(handles.filter((h) => h.kind === "end")).toHaveLength(2);
        expect(handles.filter((h) => h.kind === "anchor")).toHaveLength(2);
    });

    it("keeps the point count when an anchored line's point is dragged next to its neighbours", () => {
        const moved = moveLinePoint(line(near, "freehand"), 2, { x: 20, y: 0 }, RINK);
        expect(moved.points).toHaveLength(4);
        expect(moved.points[2]).toEqual({ x: 20, y: 0 });
    });
});

describe("lineHandles", () => {
    it("gives a 2-point line two ends and one '+' at its midpoint", () => {
        expect(lineHandles(line([{ x: 0, y: 0 }, { x: 100, y: 0 }]))).toEqual([
            { kind: "end", index: 0, position: { x: 0, y: 0 } },
            { kind: "end", index: 1, position: { x: 100, y: 0 } },
            { kind: "add", segment: 0, position: { x: 50, y: 0 } },
        ]);
    });

    it("gives a curve bend handles, with its '+' handles on the drawn curve", () => {
        const handles = lineHandles(line([{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }], "curve"));
        expect(handles.map((h) => h.kind)).toEqual(["end", "end", "bend", "add", "add"]);
        const adds = handles.filter((h) => h.kind === "add");
        expect(adds[0].position.x).toBeCloseTo(25, 6);
        expect(adds[0].position.y).toBeCloseTo(31.25, 6);
        expect(adds[1].position.x).toBeCloseTo(75, 6);
        expect(adds[1].position.y).toBeCloseTo(31.25, 6);
    });

    it("gives a straight polyline corner handles, with its '+' handles at the segment midpoints", () => {
        const handles = lineHandles(line([{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }]));
        expect(handles.map((h) => h.kind)).toEqual(["end", "end", "corner", "add", "add"]);
        expect(handles.filter((h) => h.kind === "add").map((h) => h.position)).toEqual([{ x: 25, y: 25 }, { x: 75, y: 25 }]);
    });

    it("shows no '+' once a line has 6 bends or corners", () => {
        const curve = lineHandles(line(zigzag(6), "curve"));
        expect(curve.filter((h) => h.kind === "bend")).toHaveLength(6);
        expect(curve.filter((h) => h.kind === "add")).toHaveLength(0);
        const polyline = lineHandles(line(zigzag(6)));
        expect(polyline.filter((h) => h.kind === "corner")).toHaveLength(6);
        expect(polyline.filter((h) => h.kind === "add")).toHaveLength(0);
    });

    it("gives an older polyline with more than 8 points a corner on every interior point and no '+'", () => {
        const handles = lineHandles(line(zigzag(8)));
        expect(handles.filter((h) => h.kind === "corner")).toHaveLength(8);
        expect(handles.filter((h) => h.kind === "add")).toHaveLength(0);
    });

    it("gives a freehand line its ends and up to 6 anchors, and no '+'", () => {
        const pts = wave(50);
        const anchors = anchorPoints(pts);
        const handles = lineHandles(line(pts, "freehand"));
        expect(handles.filter((h) => h.kind === "end").map((h) => h.position)).toEqual([anchors[0], anchors[anchors.length - 1]]);
        expect(handles.filter((h) => h.kind === "anchor").map((h) => h.position)).toEqual(anchors.slice(1, -1));
        expect(handles.filter((h) => h.kind === "anchor").length).toBeLessThanOrEqual(MAX_LINE_BENDS);
        expect(handles.some((h) => h.kind === "add")).toBe(false);
    });
});

describe("hitTestLineHandle", () => {
    const handles: LineHandle[] = [
        { kind: "end", index: 0, position: { x: 0, y: 0 } },
        { kind: "add", segment: 0, position: { x: 2, y: 0 } },
    ];

    it("picks the nearest handle inside the radius", () => {
        expect(hitTestLineHandle(handles, { x: 1.6, y: 0 }, 3)).toBe(handles[1]);
        expect(hitTestLineHandle(handles, { x: 0.2, y: 0 }, 3)).toBe(handles[0]);
    });

    it("lets the earlier handle (an end) win a tie", () => {
        expect(hitTestLineHandle(handles, { x: 1, y: 0 }, 3)).toBe(handles[0]);
    });

    it("misses outside the radius", () => {
        expect(hitTestLineHandle(handles, { x: 10, y: 0 }, 3)).toBeNull();
    });
});

describe("moveLinePoint", () => {
    const l = line([{ x: 10, y: 10 }, { x: 50, y: 10 }]);

    it("moves one point and leaves the others", () => {
        expect(moveLinePoint(l, 1, { x: 60, y: 30 }, RINK).points).toEqual([{ x: 10, y: 10 }, { x: 60, y: 30 }]);
    });

    it("keeps the point inside the area", () => {
        const area = { x: 0, y: 0, w: 55, h: 20 };
        expect(moveLinePoint(l, 1, { x: 80, y: 30 }, area).points[1]).toEqual({ x: 55, y: 20 });
    });

    it("returns the same line when nothing moves or the index is unknown", () => {
        expect(moveLinePoint(l, 1, { x: 50, y: 10 }, RINK)).toBe(l);
        expect(moveLinePoint(l, 5, { x: 1, y: 1 }, RINK)).toBe(l);
    });

    it("replaces a freehand line's points with its anchors on the first drag, and keeps it freehand", () => {
        const free = line(wave(50), "freehand");
        const anchors = anchorPoints(free.points);
        const moved = moveLinePoint(free, anchors.length - 1, { x: 150, y: 70 }, RINK);
        expect(moved.path).toBe("freehand");
        expect(moved.points.length).toBe(anchors.length);
        expect(moved.points[0]).toEqual(free.points[0]);
        expect(moved.points[moved.points.length - 1]).toEqual({ x: 150, y: 70 });
    });
});

describe("moveLine", () => {
    it("moves every point by the same amount", () => {
        const l = line([{ x: 10, y: 10 }, { x: 20, y: 30 }]);
        expect(moveLine(l, { x: 5, y: -5 }, RINK).points).toEqual([{ x: 15, y: 5 }, { x: 25, y: 25 }]);
    });

    it("clamps the move as a whole at the area's edge, so the shape is kept", () => {
        const l = line([{ x: 180, y: 10 }, { x: 195, y: 20 }]);
        expect(moveLine(l, { x: 20, y: 0 }, RINK).points).toEqual([{ x: 185, y: 10 }, { x: 200, y: 20 }]);
    });

    it("does not move a line along an axis on which it is longer than the area", () => {
        const area = { x: 100, y: 30, w: 20, h: 20 };
        const l = line([{ x: 90, y: 35 }, { x: 130, y: 40 }]);
        expect(moveLine(l, { x: 5, y: 3 }, area).points).toEqual([{ x: 90, y: 38 }, { x: 130, y: 43 }]);
    });

    it("never simplifies a freehand line", () => {
        const free = line(wave(50), "freehand");
        expect(moveLine(free, { x: 1, y: 1 }, RINK).points).toHaveLength(50);
    });

    it("returns the same line when the move comes to nothing", () => {
        const l = line([{ x: 190, y: 10 }, { x: 200, y: 20 }]);
        expect(moveLine(l, { x: 0, y: 0 }, RINK)).toBe(l);
        expect(moveLine(l, { x: 5, y: 0 }, RINK)).toBe(l);
    });
});

describe("insertBend and removeBend", () => {
    const l = line([{ x: 0, y: 0 }, { x: 100, y: 0 }]);

    it("bends a 2-point straight line into a curve, inside the area", () => {
        const bent = insertBend(l, 0, { x: 50, y: 20 }, RINK);
        expect(bent.path).toBe("curve");
        expect(bent.points).toEqual([{ x: 0, y: 0 }, { x: 50, y: 20 }, { x: 100, y: 0 }]);
        expect(insertBend(l, 0, { x: 50, y: -10 }, RINK).points[1]).toEqual({ x: 50, y: 0 });
    });

    it("adds a corner to a straight polyline and keeps it straight, and another bend to a curve", () => {
        const polyline = line([{ x: 0, y: 0 }, { x: 50, y: 20 }, { x: 100, y: 0 }]);
        const cornered = insertBend(polyline, 1, { x: 75, y: 30 }, RINK);
        expect(cornered.path).toBe("straight");
        expect(cornered.points).toEqual([{ x: 0, y: 0 }, { x: 50, y: 20 }, { x: 75, y: 30 }, { x: 100, y: 0 }]);
        const curve = line([{ x: 0, y: 0 }, { x: 50, y: 20 }, { x: 100, y: 0 }], "curve");
        expect(insertBend(curve, 0, { x: 25, y: 20 }, RINK).path).toBe("curve");
    });

    it("refuses a seventh bend or corner, a freehand line and an unknown segment", () => {
        const fullCurve = line(zigzag(6), "curve");
        expect(insertBend(fullCurve, 0, { x: 1, y: 1 }, RINK)).toBe(fullCurve);
        const fullPolyline = line(zigzag(6));
        expect(insertBend(fullPolyline, 0, { x: 1, y: 1 }, RINK)).toBe(fullPolyline);
        const free = line([{ x: 0, y: 0 }, { x: 100, y: 0 }], "freehand");
        expect(insertBend(free, 0, { x: 50, y: 20 }, RINK)).toBe(free);
        expect(insertBend(l, 1, { x: 50, y: 20 }, RINK)).toBe(l);
        expect(insertBend(l, -1, { x: 50, y: 20 }, RINK)).toBe(l);
        const legacy = line(zigzag(8));
        expect(insertBend(legacy, 0, { x: 1, y: 1 }, RINK)).toBe(legacy);
    });

    it("turns a curve left with 2 points back into a straight line", () => {
        const curve = line([{ x: 0, y: 0 }, { x: 50, y: 20 }, { x: 100, y: 0 }], "curve");
        const removed = removeBend(curve, 1);
        expect(removed.path).toBe("straight");
        expect(removed.points).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
        expect(removeBend(line(zigzag(2), "curve"), 1).path).toBe("curve");
    });

    it("removes a polyline's corner and keeps it straight", () => {
        const polyline = line(zigzag(2));
        const removed = removeBend(polyline, 1);
        expect(removed.path).toBe("straight");
        expect(removed.points).toEqual([{ x: 20, y: 40 }, { x: 40, y: 40 }, { x: 50, y: 50 }]);
    });

    it("never removes an end, or a freehand anchor", () => {
        const curve = line([{ x: 0, y: 0 }, { x: 50, y: 20 }, { x: 100, y: 0 }], "curve");
        expect(removeBend(curve, 0)).toBe(curve);
        expect(removeBend(curve, 2)).toBe(curve);
        const free = line(wave(10), "freehand");
        expect(removeBend(free, 3)).toBe(free);
        expect(removeBend(curve, 1.5)).toBe(curve);
        expect(removeBend(curve, NaN)).toBe(curve);
    });
});

describe("straighten", () => {
    it("keeps a curve's first and last points", () => {
        const s = straighten(line(zigzag(3), "curve"));
        expect(s.path).toBe("straight");
        expect(s.points).toEqual([{ x: 20, y: 40 }, { x: 60, y: 40 }]);
    });

    it("straightens a polyline, including an older one with more than 8 points", () => {
        expect(straighten(line(zigzag(3))).points).toEqual([{ x: 20, y: 40 }, { x: 60, y: 40 }]);
        expect(straighten(line(zigzag(8))).points).toHaveLength(2);
    });

    it("makes a freehand line straight between its ends", () => {
        const pts = wave(30);
        const s = straighten(line(pts, "freehand"));
        expect(s.path).toBe("straight");
        expect(s.points).toEqual([pts[0], pts[29]]);
    });

    it("returns the same line when it is already a 2-point straight line", () => {
        const l = line([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
        expect(straighten(l)).toBe(l);
    });
});

/** Where findSnapTarget puts the line end (null = no snap). */
const snapAt = (data: PlayData, point: Position, options: Parameters<typeof findSnapTarget>[2]) =>
    findSnapTarget(data, point, options)?.position ?? null;

describe("findSnapTarget", () => {
    const data: PlayData = {
        ...createEmptyPlayData(),
        players: [{ id: "p", position: { x: 50, y: 40 }, role: "X", label: "", color: "#1976D2" }],
        equipment: [{ id: "c", kind: "cone", position: { x: 52, y: 40 }, rotation: 0 }],
        drawings: [
            line([{ x: 100, y: 10 }, { x: 110, y: 20 }, { x: 120, y: 10 }], "straight", "other"),
            line([{ x: 150, y: 60 }, { x: 160, y: 60 }], "straight", "self"),
        ],
        annotations: [{ id: "a", text: "Here", position: { x: 80, y: 70 }, fontSize: 8, color: "#000000" }],
    };

    it("snaps to the nearest target inside the radius", () => {
        expect(snapAt(data, { x: 51.2, y: 40 }, { radiusFt: 3 })).toEqual({ x: 52, y: 40 });
        expect(snapAt(data, { x: 60, y: 40 }, { radiusFt: 3 })).toBeNull();
    });

    it("gives a tie to the earlier target: players, then equipment, then line ends", () => {
        expect(snapAt(data, { x: 51, y: 40 }, { radiusFt: 3 })).toEqual({ x: 50, y: 40 });
    });

    it("snaps to another line's first and last points, not its bends", () => {
        expect(snapAt(data, { x: 101, y: 11 }, { radiusFt: 3 })).toEqual({ x: 100, y: 10 });
        expect(snapAt(data, { x: 110, y: 19 }, { radiusFt: 3 })).toBeNull();
    });

    it("never snaps a line to itself", () => {
        expect(snapAt(data, { x: 151, y: 60 }, { radiusFt: 3 })).toEqual({ x: 150, y: 60 });
        expect(snapAt(data, { x: 151, y: 60 }, { radiusFt: 3, excludeId: "self" })).toBeNull();
    });

    it("ignores text, and skips everything when bypassed (Alt/Option)", () => {
        expect(snapAt(data, { x: 80, y: 70 }, { radiusFt: 3 })).toBeNull();
        expect(snapAt(data, { x: 50, y: 40 }, { radiusFt: 3, bypass: true })).toBeNull();
    });

    it("skips targets outside the drill's area", () => {
        expect(snapAt(data, { x: 51, y: 40 }, { radiusFt: 3, rect: { x: 51, y: 30, w: 20, h: 20 } })).toEqual({ x: 52, y: 40 });
    });

    it("returns a copy, never the target's own position object", () => {
        expect(snapAt(data, { x: 50, y: 40 }, { radiusFt: 3 })).not.toBe(data.players[0].position);
    });

    it("reports the target's drawn radius: a player's, an equipment item's, 0 for a line end", () => {
        expect(findSnapTarget(data, { x: 49, y: 40 }, { radiusFt: 3 })).toEqual({ position: { x: 50, y: 40 }, radiusFt: PLAYER_RADIUS_FT });
        expect(findSnapTarget(data, { x: 53, y: 40 }, { radiusFt: 3 })).toEqual({ position: { x: 52, y: 40 }, radiusFt: EQUIPMENT_RADIUS_FT.cone });
        expect(findSnapTarget(data, { x: 101, y: 11 }, { radiusFt: 3 })).toEqual({ position: { x: 100, y: 10 }, radiusFt: 0 });
    });

    it("skips every target at an excluded point (the other end of the line)", () => {
        const stacked: PlayData = { ...data, drawings: [line([{ x: 50, y: 40 }, { x: 70, y: 40 }], "straight", "on-player")] };
        expect(snapAt(stacked, { x: 51, y: 40 }, { radiusFt: 3, excludePoint: { x: 50, y: 40 } })).toEqual({ x: 52, y: 40 });
        expect(snapAt(stacked, { x: 49, y: 40 }, { radiusFt: 1.5, excludePoint: { x: 50, y: 40 } })).toBeNull();
    });

    it("uses the larger of 3 ft and the board's hit radius", () => {
        expect(snapRadiusFt(1.83)).toBe(3);
        expect(snapRadiusFt(5.79)).toBe(5.79);
    });
});

describe("isDoubleTap", () => {
    const first: TapRecord = { id: "l", index: 1, position: { x: 50, y: 20 }, time: 1000 };

    it("is two presses on the same bend within 300 ms and the radius", () => {
        expect(isDoubleTap(first, { ...first, position: { x: 51, y: 20 }, time: 1300 }, 3)).toBe(true);
    });

    it("is not a slow second press, another bend, another line, a far press or a first press", () => {
        expect(isDoubleTap(first, { ...first, time: 1301 }, 3)).toBe(false);
        expect(isDoubleTap(first, { ...first, index: 2, time: 1100 }, 3)).toBe(false);
        expect(isDoubleTap(first, { ...first, id: "m", time: 1100 }, 3)).toBe(false);
        expect(isDoubleTap(first, { ...first, position: { x: 60, y: 20 }, time: 1100 }, 3)).toBe(false);
        expect(isDoubleTap(null, first, 3)).toBe(false);
    });
});
