import { describe, expect, it } from "vitest";
import type { SegmentKind } from "@prisma/client";
import type { IceArea } from "@/types/practice-planner";
import {
    FIRST_DRILL_STATION_ERROR,
    MAX_STATIONS_PER_GROUP,
    SEGMENT_KIND_FIT_LABELS,
    STATION_GROUP_CAP_ERROR,
    STATION_OVERLAP_TOLERANCE_FT,
    canMove,
    canToggleRunsWithPrevious,
    drillFootprint,
    groupRange,
    groupStations,
    moveItem,
    normalizeGroups,
    removeItem,
    sessionWallMinutes,
    stationBlockLabel,
    stationGroupError,
    stationWarnings,
    toggleRunsWithPrevious,
    type StationArea,
    type TimelinePlay,
} from "@/lib/utils/session-timeline";

type Card = TimelinePlay & { id: string };

/**
 * Cards from a compact spec: "a b+ c+ d" is a, then b and c running with the
 * drill before them (one block of three), then d on its own. Sequence is the
 * position; durations default to 10.
 */
function cards(spec: string, durations: number[] = []): Card[] {
    return spec.split(" ").map((token, sequence) => ({
        id: token.replace("+", ""),
        sequence,
        duration: durations[sequence] ?? 10,
        runsWithPrevious: token.endsWith("+"),
    }));
}

/** The inverse of `cards`, ignoring durations. */
function show(plays: Card[]): string {
    return plays.map((play) => `${play.id}${play.runsWithPrevious ? "+" : ""}`).join(" ");
}

function expectNormalized(plays: Card[]) {
    expect(plays.map((play) => play.sequence)).toEqual(plays.map((_, index) => index));
    expect(plays[0]?.runsWithPrevious ?? false).toBe(false);
}

describe("stationBlockLabel", () => {
    it("formats the block header", () => {
        expect(stationBlockLabel(3, 15)).toBe("Stations · 3 · 15 min");
    });
});

describe("groupStations", () => {
    it("returns no groups for no drills", () => {
        expect(groupStations([])).toEqual([]);
    });

    it("gives every unflagged drill its own group with cumulative start minutes", () => {
        const groups = groupStations(cards("a b c", [10, 15, 5]));
        expect(groups.map((g) => [g.index, g.startMinute, g.wallMinutes, g.stations.length])).toEqual([
            [0, 0, 10, 1],
            [1, 10, 15, 1],
            [2, 25, 5, 1],
        ]);
    });

    it("times a station block by its longest drill", () => {
        const groups = groupStations(cards("a b+ c+ d", [10, 15, 5, 8]));
        expect(groups.map((g) => [g.startMinute, g.wallMinutes, g.stations.map((s) => s.id)])).toEqual([
            [0, 15, ["a", "b", "c"]],
            [15, 8, ["d"]],
        ]);
    });

    it("orders by sequence, not by array position", () => {
        const [a, b, c] = cards("a b+ c");
        expect(groupStations([c, b, a]).map((g) => g.stations.map((s) => s.id))).toEqual([["a", "b"], ["c"]]);
    });

    it("returns the caller's own objects", () => {
        const plays = cards("a b+");
        expect(groupStations(plays)[0].stations[1]).toBe(plays[1]);
    });

    it("starts a group at a flagged first drill instead of dropping it", () => {
        expect(groupStations(cards("a+ b+")).map((g) => g.stations.length)).toEqual([2]);
    });
});

describe("sessionWallMinutes", () => {
    it("equals the sum of durations when nothing is grouped (existing sessions)", () => {
        expect(sessionWallMinutes(cards("a b c", [15, 15, 15]))).toBe(45);
    });

    it("counts a station block once, for its longest drill", () => {
        expect(sessionWallMinutes(cards("a b+ c+", [15, 15, 15]))).toBe(15);
    });

    it("adds blocks and standalone drills", () => {
        expect(sessionWallMinutes(cards("a b c+ d", [10, 15, 20, 5]))).toBe(35);
    });
});

describe("stationGroupError", () => {
    it("accepts sequential drills and blocks of up to four", () => {
        expect(stationGroupError(cards("a b c"))).toBeNull();
        expect(stationGroupError(cards("a b+ c+ d+ e"))).toBeNull();
        expect(MAX_STATIONS_PER_GROUP).toBe(4);
    });

    it("rejects a first drill that runs with a previous one", () => {
        expect(stationGroupError(cards("a+ b"))).toBe(FIRST_DRILL_STATION_ERROR);
    });

    it("finds the first drill by sequence, not by array position", () => {
        const [a, b] = cards("a b+");
        expect(stationGroupError([b, a])).toBeNull();
        expect(stationGroupError([{ ...a, runsWithPrevious: true }, { ...b, runsWithPrevious: false }])).toBe(FIRST_DRILL_STATION_ERROR);
    });

    it("rejects a block of five", () => {
        expect(stationGroupError(cards("a b+ c+ d+ e+"))).toBe(STATION_GROUP_CAP_ERROR);
    });

    it("accepts no drills", () => {
        expect(stationGroupError([])).toBeNull();
    });
});

describe("normalizeGroups", () => {
    it("renumbers sequences to positions and clears the first drill's flag", () => {
        const plays = cards("a+ b+ c").map((play, index) => ({ ...play, sequence: index * 2 + 1 }));
        const normalized = normalizeGroups(plays);
        expectNormalized(normalized);
        expect(show(normalized)).toBe("a b+ c");
    });

    it("keeps an already-normal drill as the same object", () => {
        const plays = cards("a b+");
        const normalized = normalizeGroups(plays);
        expect(normalized[0]).toBe(plays[0]);
        expect(normalized[1]).toBe(plays[1]);
    });
});

describe("groupRange", () => {
    it("finds the block around any of its drills", () => {
        const plays = cards("x a b+ c+ y");
        expect(groupRange(plays, 0)).toEqual({ start: 0, end: 1 });
        expect(groupRange(plays, 1)).toEqual({ start: 1, end: 4 });
        expect(groupRange(plays, 3)).toEqual({ start: 1, end: 4 });
        expect(groupRange(plays, 4)).toEqual({ start: 4, end: 5 });
    });
});

describe("toggleRunsWithPrevious", () => {
    it("never flags the first drill", () => {
        const plays = cards("a b");
        expect(toggleRunsWithPrevious(plays, 0)).toBe(plays);
        expect(canToggleRunsWithPrevious(plays, 0)).toBe(false);
    });

    it("joins a drill to the drill before it", () => {
        expect(show(toggleRunsWithPrevious(cards("a b c"), 1))).toBe("a b+ c");
    });

    it("brings the drill's own stations along when it joins", () => {
        expect(show(toggleRunsWithPrevious(cards("a b c+"), 1))).toBe("a b+ c+");
    });

    it("splits a block when a station is turned off; later stations stay with it", () => {
        const toggled = toggleRunsWithPrevious(cards("a b+ c+"), 1);
        expect(show(toggled)).toBe("a b c+");
        expectNormalized(toggled);
    });

    it("refuses to make a fifth station, returning the input unchanged", () => {
        const four = cards("a b+ c+ d+ e");
        expect(toggleRunsWithPrevious(four, 4)).toBe(four);
        expect(canToggleRunsWithPrevious(four, 4)).toBe(false);
    });

    it("refuses to merge two blocks past the cap", () => {
        const plays = cards("a b+ c+ d e+");
        expect(toggleRunsWithPrevious(plays, 3)).toBe(plays);
    });

    it("allows a toggle that makes a block of exactly four", () => {
        const plays = cards("a b+ c+ d");
        expect(canToggleRunsWithPrevious(plays, 3)).toBe(true);
        expect(show(toggleRunsWithPrevious(plays, 3))).toBe("a b+ c+ d+");
    });

    it("always allows turning a station off", () => {
        expect(canToggleRunsWithPrevious(cards("a b+ c+ d+"), 3)).toBe(true);
    });

    it("ignores an index past the end", () => {
        const plays = cards("a b");
        expect(toggleRunsWithPrevious(plays, 5)).toBe(plays);
    });
});

describe("moveItem", () => {
    it("swaps two standalone drills", () => {
        const moved = moveItem(cards("a b c"), 0, 1);
        expect(show(moved)).toBe("b a c");
        expectNormalized(moved);
    });

    it("hops a standalone drill down over a whole block", () => {
        expect(show(moveItem(cards("s a b+"), 0, 1))).toBe("a b+ s");
    });

    it("hops a standalone drill up over a whole block", () => {
        expect(show(moveItem(cards("a b+ s"), 2, -1))).toBe("s a b+");
    });

    it("moves a whole block when its first drill moves", () => {
        expect(show(moveItem(cards("x a b+"), 1, -1))).toBe("a b+ x");
        expect(show(moveItem(cards("a b+ x"), 0, 1))).toBe("x a b+");
    });

    it("hops a block over another block", () => {
        expect(show(moveItem(cards("a b+ c d+ e+"), 0, 1))).toBe("c d+ e+ a b+");
    });

    it("reorders a station within its block", () => {
        expect(show(moveItem(cards("a b+ c+"), 2, -1))).toBe("a c+ b+");
    });

    it("makes the second drill the block's first when it moves up", () => {
        const moved = moveItem(cards("x a b+"), 2, -1);
        expect(show(moved)).toBe("x b a+");
        expectNormalized(moved);
    });

    it("does nothing when the last station of a block moves down", () => {
        const plays = cards("a b+ s");
        expect(moveItem(plays, 1, 1)).toBe(plays);
        expect(canMove(plays, 1, 1)).toBe(false);
    });

    it("does nothing past either end of the list", () => {
        const plays = cards("a b+ c");
        expect(moveItem(plays, 0, -1)).toBe(plays);
        expect(moveItem(plays, 2, 1)).toBe(plays);
        expect(moveItem(plays, 9, 1)).toBe(plays);
        expect(canMove(plays, 0, 1)).toBe(true);
    });
});

describe("removeItem", () => {
    it("removes a standalone drill and renumbers", () => {
        const removed = removeItem(cards("a b c"), 1);
        expect(show(removed)).toBe("a c");
        expectNormalized(removed);
    });

    it("makes the next station the head when a block's first drill is removed", () => {
        expect(show(removeItem(cards("a b+ c+"), 0))).toBe("b c+");
    });

    it("keeps the rest of a block together after a preceding block", () => {
        expect(show(removeItem(cards("x y+ a b+ c+"), 2))).toBe("x y+ b c+");
    });

    it("removes a station from the middle of a block", () => {
        expect(show(removeItem(cards("a b+ c+"), 1))).toBe("a c+");
    });

    it("leaves a following standalone drill alone", () => {
        expect(show(removeItem(cards("a b c"), 0))).toBe("b c");
    });

    it("returns the input for an index that isn't there", () => {
        const plays = cards("a b");
        expect(removeItem(plays, -1)).toBe(plays);
        expect(removeItem(plays, 2)).toBe(plays);
    });
});

describe("drillFootprint", () => {
    it.each([
        ["missing (full ice)", undefined, "full"],
        ["full", { kind: "full" }, "full"],
        ["half-left", { kind: "half-left" }, "half"],
        ["half-right", { kind: "half-right" }, "half"],
        ["zone-left", { kind: "zone-left" }, "zone"],
        ["zone-neutral", { kind: "zone-neutral" }, "zone"],
        ["zone-right", { kind: "zone-right" }, "zone"],
        ["custom 101 ft wide", { kind: "custom", rect: { x: 0, y: 0, w: 101, h: 20 } }, "full"],
        ["custom 100 ft wide", { kind: "custom", rect: { x: 0, y: 0, w: 100, h: 85 } }, "half"],
        ["custom 76 ft wide", { kind: "custom", rect: { x: 0, y: 0, w: 76, h: 40 } }, "half"],
        ["custom 75 ft wide", { kind: "custom", rect: { x: 0, y: 0, w: 75, h: 85 } }, "zone"],
    ] as Array<[string, IceArea | undefined, string]>)("classifies %s as %s", (_name, area, footprint) => {
        expect(drillFootprint(area)).toBe(footprint);
    });
});

describe("stationWarnings", () => {
    type Placed = TimelinePlay & StationArea;

    /** One drill per area; `flags` defaults to a single block holding all of them. */
    function placed(areas: Array<IceArea | undefined | null>, flags = areas.map((_, index) => index > 0)): Placed[] {
        return areas.map((area, sequence) => ({ sequence, duration: 10, runsWithPrevious: flags[sequence], area }));
    }

    function warn(plays: Placed[], kind: SegmentKind | null = null) {
        return stationWarnings(groupStations(plays), kind);
    }

    it("flags two stations whose areas overlap", () => {
        expect(warn(placed([{ kind: "half-left" }, { kind: "zone-neutral" }])).overlaps).toEqual([[0, 0, 1]]);
    });

    it("doesn't flag zones that only share a blue line", () => {
        expect(warn(placed([{ kind: "zone-left" }, { kind: "zone-neutral" }, { kind: "zone-right" }])).overlaps).toEqual([]);
    });

    it("treats a full-ice drill as overlapping every other station", () => {
        expect(warn(placed([undefined, { kind: "zone-right" }, { kind: "zone-left" }])).overlaps).toEqual([
            [0, 0, 1],
            [0, 0, 2],
        ]);
    });

    it("tolerates up to 1 ft of overlap", () => {
        expect(STATION_OVERLAP_TOLERANCE_FT).toBe(1);
        const touching: IceArea = { kind: "custom", rect: { x: 74, y: 0, w: 20, h: 20 } };
        const overlapping: IceArea = { kind: "custom", rect: { x: 73, y: 0, w: 20, h: 20 } };
        expect(warn(placed([{ kind: "zone-left" }, touching])).overlaps).toEqual([]);
        expect(warn(placed([{ kind: "zone-left" }, overlapping])).overlaps).toEqual([[0, 0, 1]]);
    });

    it("only compares drills in the same block, and reports the block's index", () => {
        const plays = placed([{ kind: "half-left" }, { kind: "half-left" }, { kind: "half-left" }, { kind: "zone-left" }], [false, false, false, true]);
        expect(warn(plays).overlaps).toEqual([[2, 2, 3]]);
    });

    it("skips an unreadable drill in both checks", () => {
        expect(warn(placed([null, { kind: "zone-left" }]), "CROSS")).toEqual({ overlaps: [], tooBig: [] });
    });

    const AREAS: Record<string, IceArea | undefined> = {
        "missing (full ice)": undefined,
        full: { kind: "full" },
        "half-left": { kind: "half-left" },
        "zone-left": { kind: "zone-left" },
        "zone-neutral": { kind: "zone-neutral" },
        "custom 150x85": { kind: "custom", rect: { x: 0, y: 0, w: 150, h: 85 } },
        "custom 90x40": { kind: "custom", rect: { x: 0, y: 0, w: 90, h: 40 } },
        "custom 60x85": { kind: "custom", rect: { x: 0, y: 0, w: 60, h: 85 } },
    };
    const TOO_BIG: Record<"whole" | SegmentKind, string[]> = {
        whole: [],
        HALF: ["missing (full ice)", "full", "custom 150x85"],
        CROSS: ["missing (full ice)", "full", "half-left", "custom 150x85", "custom 90x40"],
        CUSTOM: [],
    };

    it.each(Object.keys(TOO_BIG) as Array<keyof typeof TOO_BIG>)("flags the drills too big for a %s booking", (kind) => {
        const names = Object.keys(AREAS);
        // One drill per block, so only the size check can fire.
        const plays = placed(names.map((name) => AREAS[name]), names.map(() => false));
        const { tooBig, overlaps } = warn(plays, kind === "whole" ? null : kind);
        expect(tooBig.map((sequence) => names[sequence])).toEqual(TOO_BIG[kind]);
        expect(overlaps).toEqual([]);
    });

    it("names booked segment kinds for the fit warning", () => {
        expect(SEGMENT_KIND_FIT_LABELS).toEqual({ HALF: "half ice", CROSS: "cross ice", CUSTOM: "ice segment" });
    });
});

describe("immutability", () => {
    const snapshot = (plays: Card[]) => JSON.stringify(plays);

    it("moveItem, removeItem and toggleRunsWithPrevious leave their input untouched", () => {
        const plays = cards("a b+ c+ d e+");
        const before = snapshot(plays);
        const objects = [...plays];
        const ops: Array<() => Card[]> = [
            () => moveItem(plays, 2, -1),
            () => moveItem(plays, 0, 1),
            () => moveItem(plays, 3, -1),
            () => removeItem(plays, 0),
            () => removeItem(plays, 2),
            () => toggleRunsWithPrevious(plays, 1),
            () => toggleRunsWithPrevious(plays, 3),
        ];
        for (const op of ops) op();

        expect(snapshot(plays)).toBe(before);
        plays.forEach((play, i) => expect(play).toBe(objects[i]));
    });
});

describe("removeItem edge cases", () => {
    it("removes the last drill", () => {
        const removed = removeItem(cards("a b+ c"), 2);
        expect(show(removed)).toBe("a b+");
        expectNormalized(removed);
    });

    it("removes the only drill, leaving an empty list", () => {
        expect(removeItem(cards("a"), 0)).toEqual([]);
    });
});
