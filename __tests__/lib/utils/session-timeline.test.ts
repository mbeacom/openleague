import { describe, expect, it } from "vitest";
import {
    FIRST_DRILL_STATION_ERROR,
    MAX_STATIONS_PER_GROUP,
    STATION_GROUP_CAP_ERROR,
    canMove,
    canToggleRunsWithPrevious,
    groupRange,
    groupStations,
    moveItem,
    normalizeGroups,
    removeItem,
    sessionWallMinutes,
    stationBlockLabel,
    stationGroupError,
    toggleRunsWithPrevious,
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
