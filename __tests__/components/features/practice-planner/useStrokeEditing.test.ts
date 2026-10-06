/** The snap ring's state in useStrokeEditing (line editing spec R4). */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useStrokeEditing } from "@/components/features/practice-planner/useStrokeEditing";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayData } from "@/types/practice-planner";

const RINK = { x: 0, y: 0, w: 200, h: 85 };
const data: PlayData = {
    ...createEmptyPlayData(),
    players: [{ id: "p", position: { x: 50, y: 40 }, role: "X", label: "", color: "#1976D2" }],
    drawings: [{ id: "l", action: "skate", path: "straight", end: "arrow", points: [{ x: 10, y: 10 }, { x: 40, y: 30 }], color: "#212121", strokeWidth: 2 }],
};

function setup() {
    const commit = vi.fn();
    const { result } = renderHook(() => useStrokeEditing({ playDataRef: { current: data }, commit }));
    return { result, commit };
}

describe("useStrokeEditing snap ring", () => {
    it("rings the target while a line end snaps, and clears it", () => {
        const { result } = setup();
        let snapped: unknown;
        act(() => { snapped = result.current.snapLineEnd({ x: 52, y: 41 }, { radiusFt: 3 }); });
        expect(snapped).toEqual({ x: 50, y: 40 });
        expect(result.current.snapRing).toEqual({ x: 50, y: 40 });
        expect(result.current.currentSnap()).toEqual({ x: 50, y: 40 });
        act(() => { result.current.snapLineEnd({ x: 60, y: 41 }, { radiusFt: 3 }); });
        expect(result.current.snapRing).toBeNull();
        act(() => { result.current.snapLineEnd({ x: 52, y: 41 }, { radiusFt: 3, bypass: true }); });
        expect(result.current.snapRing).toBeNull();
        act(() => { result.current.snapLineEnd({ x: 52, y: 41 }, { radiusFt: 3 }); });
        act(() => result.current.clearSnap());
        expect(result.current.currentSnap()).toBeNull();
        expect(result.current.snapRing).toBeNull();
    });

    it("rings the target of a dragged end, commits the snapped end once, and clears the ring", () => {
        const { result, commit } = setup();
        act(() => { result.current.press({ selectedId: "l", point: { x: 40, y: 30 }, hitRadiusFt: 3, time: 0 }); });
        act(() => { result.current.move({ x: 51, y: 39 }, { area: RINK, thresholdFt: 1, snapRadiusFt: 3, bypassSnap: false }); });
        expect(result.current.snapRing).toEqual({ x: 50, y: 40 });
        act(() => result.current.release());
        expect(commit).toHaveBeenCalledTimes(1);
        expect(commit.mock.calls[0][0].drawings[0].points[1]).toEqual({ x: 50, y: 40 });
        expect(result.current.snapRing).toBeNull();
    });
});
