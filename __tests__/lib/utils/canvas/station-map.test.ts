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

const texts = (calls: Call[]) => calls.filter((c) => c.name === "fillText").map((c) => c.args[0]);

describe("stationLabel", () => {
    it("numbers a station and names its drill", () => {
        expect(stationLabel(1, "Breakout")).toBe("1 · Breakout");
    });
});

describe("drawStationMap", () => {
    beforeEach(() => clearRinkCache());

    it("clips each station's drawing to its own area", () => {
        const calls = draw([{ name: "Breakout", playData: breakout }, { name: "Regroup", playData: regroup }]);

        expect(calls.filter((c) => c.name === "clip")).toHaveLength(2);
        const clipRects = calls.filter((c, i) => c.name === "rect" && calls[i + 1]?.name === "clip");
        const origin = rinkToCanvas({ x: 0, y: 0 }, t);
        expect(clipRects[0].args[0]).toBeCloseTo(origin.x, 9);
        expect(clipRects[0].args[2]).toBeCloseTo(rinkToCanvas({ x: 75, y: 0 }, t).x - origin.x, 9);
        expect(clipRects[1].args[0]).toBeCloseTo(rinkToCanvas({ x: 125, y: 0 }, t).x, 9);
    });

    it("draws a station's elements between its clip and the restore", () => {
        const calls = draw([{ name: "Breakout", playData: breakout }, { name: "Empty", playData: createEmptyPlayData() }]);
        const clips = calls.flatMap((c, i) => (c.name === "clip" ? [i] : []));
        const nextRestore = (from: number) => calls.findIndex((c, i) => i > from && c.name === "restore");

        expect(nextRestore(clips[0]) - clips[0]).toBeGreaterThan(1);
        expect(nextRestore(clips[1]) - clips[1]).toBe(1);
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

        expect(calls.filter((c) => c.name === "clip")).toHaveLength(2);
        expect(calls.filter((c) => c.name === "strokeRect")).toHaveLength(2);
        expect(texts(calls)).toEqual(expect.arrayContaining(["2 · Lost", PLAY_DATA_UNREADABLE_MESSAGE]));
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
