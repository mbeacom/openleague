/** Station map (2b): each station's drawing clipped to its area, outlined, and labelled. */
import { beforeEach, describe, expect, it } from "vitest";
import { combinedLegendData, drawStationMap, stationLabel, type StationMapStation } from "@/lib/utils/canvas/station-map";
import { clearRinkCache, createTransformContext, rinkToCanvas } from "@/lib/utils/canvas/rink-renderer";
import { createEmptyPlayData, PLAY_DATA_UNREADABLE_MESSAGE } from "@/lib/utils/play-data";
import type { PlayData } from "@/types/practice-planner";

type Call = { name: string; args: unknown[] };

/** Records every method call in order; property writes are stored. */
function recordingCtx(calls: Call[]): CanvasRenderingContext2D {
    const target: Record<string, unknown> = {};
    return new Proxy(target, {
        get(t, prop) {
            if (typeof prop !== "string") return undefined;
            if (prop in t) return t[prop];
            return (...args: unknown[]) => {
                calls.push({ name: prop, args });
                return { width: 10 };
            };
        },
        set(t, prop, value) {
            if (typeof prop === "string") t[prop] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
}

const t = createTransformContext(960, 420, 12);

const breakout: PlayData = {
    ...createEmptyPlayData(),
    area: { kind: "zone-left" },
    players: [{ id: "p1", role: "F", label: "", color: "#1976D2", position: { x: 30, y: 40 } }],
};
const regroup: PlayData = {
    ...createEmptyPlayData(),
    area: { kind: "zone-right" },
    equipment: [{ id: "n1", kind: "net", position: { x: 180, y: 42 }, rotation: 0 }],
};

function draw(stations: StationMapStation[], activeIndex = 0): Call[] {
    const calls: Call[] = [];
    drawStationMap(recordingCtx(calls), t, stations, activeIndex);
    return calls;
}

/** Station clips are rectangles; the rink's own clip to its rounded outline is not one of them. */
const stationClipIndexes = (calls: Call[]) =>
    calls.flatMap((c, i) => (c.name === "clip" && calls[i - 1]?.name === "rect" ? [i] : []));

const texts = (calls: Call[]) => calls.filter((c) => c.name === "fillText").map((c) => c.args[0]);

describe("stationLabel", () => {
    it("numbers a station and names its drill", () => {
        expect(stationLabel(1, "Breakout")).toBe("1 · Breakout");
    });
});

describe("drawStationMap", () => {
    beforeEach(() => clearRinkCache());

    it("clips and outlines a quarter-ice station to its half of the zone", () => {
        const quarter: PlayData = { ...createEmptyPlayData(), area: { kind: "zone-right-bottom" } };
        const calls = draw([{ name: "Battle", playData: quarter }]);
        const clipRect = calls.find((c, i) => c.name === "rect" && calls[i + 1]?.name === "clip");
        const topLeft = rinkToCanvas({ x: 125, y: 42.5 }, t);
        const bottomRight = rinkToCanvas({ x: 200, y: 85 }, t);
        expect(clipRect?.args[0]).toBeCloseTo(topLeft.x, 9);
        expect(clipRect?.args[1]).toBeCloseTo(topLeft.y, 9);
        expect(clipRect?.args[2]).toBeCloseTo(bottomRight.x - topLeft.x, 9);
        expect(clipRect?.args[3]).toBeCloseTo(bottomRight.y - topLeft.y, 9);
    });

    it("clips each station's drawing to its own area", () => {
        const calls = draw([{ name: "Breakout", playData: breakout }, { name: "Regroup", playData: regroup }]);

        // Two clips per station: its drawing, then its label.
        expect(stationClipIndexes(calls)).toHaveLength(4);
        const clipRects = calls
            .filter((c, i) => c.name === "rect" && calls[i + 1]?.name === "clip")
            .filter((_, i) => i % 2 === 0);
        const origin = rinkToCanvas({ x: 0, y: 0 }, t);
        expect(clipRects[0].args[0]).toBeCloseTo(origin.x, 9);
        expect(clipRects[0].args[2]).toBeCloseTo(rinkToCanvas({ x: 75, y: 0 }, t).x - origin.x, 9);
        expect(clipRects[1].args[0]).toBeCloseTo(rinkToCanvas({ x: 125, y: 0 }, t).x, 9);
    });

    it("draws a station's elements between its clip and the restore", () => {
        const calls = draw([{ name: "Breakout", playData: breakout }, { name: "Empty", playData: createEmptyPlayData() }]);
        const clips = stationClipIndexes(calls).filter((_, i) => i % 2 === 0);
        const nextRestore = (from: number) => calls.findIndex((c, i) => i > from && c.name === "restore");

        expect(nextRestore(clips[0]) - clips[0]).toBeGreaterThan(1);
        expect(nextRestore(clips[1]) - clips[1]).toBe(1);
    });

    it("draws the rink once, its markings clipped to the rounded outline", () => {
        const calls = draw([{ name: "Breakout", playData: breakout }, { name: "Regroup", playData: regroup }]);
        const rinkClips = calls.flatMap((c, i) => (c.name === "clip" && calls[i - 1]?.name === "roundRect" ? [i] : []));
        expect(rinkClips).toHaveLength(1);
        // The rink's clip is released before the first station's own clip.
        const restore = calls.findIndex((c, i) => i > rinkClips[0] && c.name === "restore");
        expect(restore).toBeLessThan(stationClipIndexes(calls)[0]);
    });

    it("labels every station '<n> · <name>' and highlights the active one", () => {
        const calls = draw([{ name: "Breakout", playData: breakout }, { name: "Regroup", playData: regroup }], 1);

        expect(texts(calls)).toEqual(expect.arrayContaining(["1 · Breakout", "2 · Regroup"]));
        // The dash set just before each outline: dashed for the others, solid for the active station.
        const outlineDashes = calls.flatMap((c, i) => (c.name === "strokeRect" ? [calls[i - 1].args[0]] : []));
        expect(outlineDashes).toEqual([[8, 6], []]);
    });

    it("still outlines and labels an unreadable station, with the unreadable message", () => {
        const calls = draw([{ name: "Breakout", playData: breakout }, { name: "Lost", playData: null }]);

        expect(stationClipIndexes(calls)).toHaveLength(4);
        expect(calls.filter((c) => c.name === "strokeRect")).toHaveLength(2);
        expect(texts(calls)).toEqual(expect.arrayContaining(["2 · Lost", PLAY_DATA_UNREADABLE_MESSAGE]));
    });

    it("draws the active station's outline last, whichever station is active", () => {
        for (const active of [0, 1]) {
            const calls = draw([{ name: "Breakout", playData: breakout }, { name: "Regroup", playData: regroup }], active);
            const outlines = calls.flatMap((c, i) => (c.name === "strokeRect" ? [calls[i - 1].args[0]] : []));
            expect(outlines).toHaveLength(2);
            expect(outlines[1]).toEqual([]);
            expect(outlines[0]).toEqual([8, 6]);
        }
    });

    it("clips each label to its station's area", () => {
        const stations = [{ name: "A very long breakout drill name", playData: breakout }, { name: "Regroup", playData: regroup }];
        const calls = draw(stations);
        const origin = rinkToCanvas({ x: 0, y: 0 }, t);
        const rightZone = rinkToCanvas({ x: 125, y: 0 }, t);
        const labelIndexes = calls.flatMap((c, i) => (c.name === "fillText" && typeof c.args[0] === "string" && /^\d · /.test(c.args[0]) ? [i] : []));
        expect(labelIndexes).toHaveLength(2);

        const clipRectFor = (index: number) => {
            // The innermost open clip: the nearest earlier clip with no restore between it and the text.
            for (let i = index - 1; i >= 0; i--) {
                if (calls[i].name === "restore") return null;
                if (calls[i].name === "clip") return calls[i - 1].args as number[];
            }
            return null;
        };
        expect(clipRectFor(labelIndexes[0])?.[0]).toBeCloseTo(origin.x, 9);
        expect(clipRectFor(labelIndexes[1])?.[0]).toBeCloseTo(rightZone.x, 9);
    });

    it("clips the unreadable message to its station too", () => {
        const calls = draw([{ name: "Lost", playData: null }]);
        const i = calls.findIndex((c) => c.name === "fillText" && c.args[0] === PLAY_DATA_UNREADABLE_MESSAGE);
        let clipped = false;
        for (let j = i - 1; j >= 0; j--) {
            if (calls[j].name === "restore") break;
            if (calls[j].name === "clip") { clipped = true; break; }
        }
        expect(clipped).toBe(true);
    });

    it("stacks the labels of stations that share a corner", () => {
        const calls = draw([
            { name: "Full", playData: createEmptyPlayData() },
            { name: "Half", playData: { ...createEmptyPlayData(), area: { kind: "half-left" } } },
        ]);
        const ys = calls.filter((c) => c.name === "fillText").map((c) => c.args[2] as number);

        expect(ys).toHaveLength(2);
        expect(ys[1]).toBeGreaterThan(ys[0]);
    });
});

describe("drawStationMap label placement", () => {
    beforeEach(() => clearRinkCache());

    const custom = (x: number, y: number, w = 60, h = 40): PlayData => ({
        ...createEmptyPlayData(),
        area: { kind: "custom", rect: { x, y, w, h } },
    });

    /** Each label's backing box (the fillRect drawn just before its text), as [x, y, w, h]. */
    const labelBoxes = (calls: Call[]) =>
        calls.flatMap((c, i) => (c.name === "fillText" && calls[i - 1]?.name === "fillRect" ? [calls[i - 1].args as number[]] : []));
    const overlaps = (a: number[], b: number[]) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
    const expectNoOverlaps = (boxes: number[][]) => {
        for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j]), `labels ${i} and ${j}`).toBe(false);
        }
    };

    it("gives stations that share a top-left corner non-overlapping labels", () => {
        const calls = draw([
            { name: "Full", playData: createEmptyPlayData() },
            { name: "Half", playData: { ...createEmptyPlayData(), area: { kind: "half-left" } } },
            { name: "Zone", playData: breakout },
        ]);
        const boxes = labelBoxes(calls);
        expect(boxes).toHaveLength(3);
        expectNoOverlaps(boxes);
    });

    it("steps a label down when it would overlap one placed at a nearby, different corner", () => {
        const calls = draw([{ name: "Top", playData: custom(0, 0) }, { name: "Nudged", playData: custom(0, 2) }]);
        const boxes = labelBoxes(calls);
        expect(boxes).toHaveLength(2);
        expectNoOverlaps(boxes);
    });

    it("counts an unreadable station's two lines when stacking the next label", () => {
        const calls = draw([{ name: "Lost", playData: null }, { name: "Half", playData: { ...createEmptyPlayData(), area: { kind: "half-left" } } }]);
        expectNoOverlaps(labelBoxes(calls));
    });

    it("leaves labels at their corner when nothing collides", () => {
        const calls = draw([{ name: "Breakout", playData: breakout }, { name: "Regroup", playData: regroup }]);
        const ys = calls
            .filter((c) => c.name === "fillText" && /^\d · /.test(String(c.args[0])))
            .map((c) => c.args[2] as number);
        expect(ys).toHaveLength(2);
        expect(ys[0]).toBeCloseTo(rinkToCanvas({ x: 0, y: 0 }, t).y + 6, 9);
        expect(ys[1]).toBeCloseTo(rinkToCanvas({ x: 125, y: 0 }, t).y + 6, 9);
    });
});

describe("combinedLegendData", () => {
    it("merges every readable station's symbols, without an area", () => {
        const merged = combinedLegendData([
            { name: "Breakout", playData: breakout },
            { name: "Lost", playData: null },
            { name: "Regroup", playData: regroup },
        ]);

        expect(merged?.players).toEqual(breakout.players);
        expect(merged?.equipment).toEqual(regroup.equipment);
        expect(merged).not.toHaveProperty("area");
    });

    it("is null when no station can be read", () => {
        expect(combinedLegendData([{ name: "Lost", playData: null }])).toBeNull();
    });
});

describe("drawStationMap glyph size (scale model)", () => {
    it("draws equipment at its real size, not the board's 8 px minimum: nobody edits the station map", () => {
        const withPuck: PlayData = {
            ...createEmptyPlayData(),
            area: { kind: "zone-left" },
            equipment: [{ id: "p", kind: "puck", position: { x: 40, y: 30 }, rotation: 0 }],
        };
        const calls = draw([{ name: "Puck drill", playData: withPuck }]);
        const at = rinkToCanvas({ x: 40, y: 30 }, t);
        const puckArcs = calls.filter((c) => c.name === "arc" && Math.abs((c.args[0] as number) - at.x) < 0.01 && Math.abs((c.args[1] as number) - at.y) < 0.01);
        expect(puckArcs.length).toBeGreaterThan(0);
        // 0.75 ft · ~4.66 px/ft ≈ 3.5 px radius, drawn as a 0.6 r disc ≈ 2.1 px (the board minimum would give 4.8).
        expect(Math.max(...puckArcs.map((c) => c.args[2] as number))).toBeLessThan(3);
    });
});
