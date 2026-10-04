import { describe, expect, it } from "vitest";
import type { SegmentKind } from "@prisma/client";
import type { BlockKind, IceArea, PlayData, PlayFocus, PlayGoalies } from "@/types/practice-planner";
import {
    BLOCK_ROW_FIELDS_ERROR,
    BLOCK_STATION_ERROR,
    FIRST_DRILL_STATION_ERROR,
    MAX_STATIONS_PER_GROUP,
    ROTATION_PLACEMENT_ERROR,
    ROTATION_TOO_FEW_ERROR,
    SEGMENT_KIND_FIT_LABELS,
    STATION_GROUP_CAP_ERROR,
    STATION_OVERLAP_TOLERANCE_FT,
    STAYS_MARK,
    betweenBlocksLabel,
    blockMinutes,
    buildSchedule,
    canMove,
    canToggleRunsWithPrevious,
    defaultRotationMinutes,
    drillFootprint,
    goalieShortMessage,
    goalieShortSummary,
    goalieWarnings,
    goaliesUnusedMessage,
    groupRange,
    groupStations,
    moveItem,
    normalizeGroups,
    removeItem,
    rotatesEveryLabel,
    rotationBlockLabel,
    rotationGrid,
    rotationMinutes,
    rotationRoundLabel,
    rotationSummary,
    rotationTable,
    sessionRowsError,
    sessionWallMinutes,
    settleRotations,
    stationBlockLabel,
    stationGroupError,
    stationWarnings,
    staysSuffix,
    toggleRunsWithPrevious,
    type GoalieNeeds,
    type StationArea,
    type TimelinePlay,
} from "@/lib/utils/session-timeline";
import { createEmptyPlayData } from "@/lib/utils/play-data";

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

    it("throws a RangeError for an index outside the list, instead of a bogus range", () => {
        const plays = cards("a b+ c");
        expect(() => groupRange(plays, -1)).toThrow(RangeError);
        expect(() => groupRange(plays, 3)).toThrow(/out of range/);
        expect(() => groupRange(plays, 1.5)).toThrow(RangeError);
        expect(() => groupRange([], 0)).toThrow(RangeError);
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

describe("goalieWarnings", () => {
    const G: PlayData = {
        ...createEmptyPlayData(),
        players: [{ id: "g", role: "G", label: "G", position: { x: 14, y: 42.5 }, color: "#212121" }],
    };
    type Drill = TimelinePlay & GoalieNeeds;
    const drill = (sequence: number, goalies: PlayGoalies, runsWithPrevious = false, playData: PlayData | null = G, focus?: PlayFocus): Drill =>
        ({ sequence, duration: 10, runsWithPrevious, goalies, focus, playData });
    const warn = (plays: Drill[], attending: number | null) => goalieWarnings(groupStations(plays), attending);

    it("is silent when the count is not set", () => {
        expect(warn([drill(0, "required")], null)).toEqual({ short: [], unused: false });
    });

    it("flags a required drill when no goalie attends", () => {
        expect(warn([drill(0, "required"), drill(1, "optional")], 0)).toEqual({
            short: [{ groupIndex: 0, sequences: [0], needed: 1 }],
            unused: false,
        });
    });

    it("sums demand across stations that run together", () => {
        const plays = [drill(0, "required"), drill(1, "required", true), drill(2, "optional", true)];
        expect(warn(plays, 1).short).toEqual([{ groupIndex: 0, sequences: [0, 1], needed: 2 }]);
        expect(warn(plays, 2).short).toEqual([]);
    });

    it("counts a goalie-focus drill as needing a goalie even when tagged optional", () => {
        expect(warn([drill(0, "optional", false, G, "goalies")], 0).short).toHaveLength(1);
    });

    it("needs one goalie per G marker, and one for an unreadable diagram", () => {
        const two: PlayData = { ...G, players: [...G.players, { ...G.players[0], id: "g2", position: { x: 186, y: 42.5 } }] };
        expect(warn([drill(0, "required", false, two)], 1).short).toEqual([{ groupIndex: 0, sequences: [0], needed: 2 }]);
        expect(warn([drill(0, "required", false, null)], 0).short[0].needed).toBe(1);
    });

    it("notices goalies attending when no drill uses one", () => {
        expect(warn([drill(0, "none"), drill(1, "none")], 2)).toEqual({ short: [], unused: true });
        expect(warn([drill(0, "none"), drill(1, "optional")], 2).unused).toBe(false);
        expect(warn([drill(0, "none")], 0).unused).toBe(false);
        expect(warn([], 2).unused).toBe(false);
    });

    it("counts a goalie-focus drill as using a goalie even when tagged none", () => {
        expect(warn([drill(0, "none", false, G, "goalies")], 1)).toEqual({ short: [], unused: false });
    });

    it("words the drill, block, session and summary messages", () => {
        expect(goalieShortMessage(1, 0, false)).toBe("Needs a goalie — none attending");
        expect(goalieShortMessage(2, 1, false)).toBe("Needs 2 goalies — 1 attending");
        expect(goalieShortMessage(3, 2, true)).toBe("These stations need 3 goalies — 2 attending");
        expect(goalieShortMessage(1, 0, true)).toBe("These stations need 1 goalie — none attending");
        expect(goaliesUnusedMessage(1)).toBe("1 goalie attending, but no drill uses a goalie");
        expect(goaliesUnusedMessage(2)).toBe("2 goalies attending, but no drill uses a goalie");
        expect(goalieShortSummary(1, 0)).toBe("1 drill or station block needs a goalie, but none are attending");
        expect(goalieShortSummary(2, 1)).toBe("2 drills or station blocks need more goalies than the 1 attending");
    });
});

type Row = TimelinePlay & { id: string };

const solo = (id: string, sequence: number, duration = 10, extra: Partial<TimelinePlay> = {}): Row =>
    ({ id, sequence, duration, runsWithPrevious: false, ...extra });
const block = (id: string, sequence: number, kind: BlockKind, duration: number, extra: Partial<TimelinePlay> = {}): Row =>
    ({ id, sequence, duration, runsWithPrevious: false, kind, ...extra });
/** One station block starting at `start`: its first drill carries the rotation. */
function stations(start: number, specs: Array<{ id: string; duration?: number; stays?: boolean }>, rotateEveryMinutes: number | null = null): Row[] {
    return specs.map((spec, k) => ({
        id: spec.id,
        sequence: start + k,
        duration: spec.duration ?? 10,
        runsWithPrevious: k > 0,
        stays: spec.stays ?? false,
        rotateEveryMinutes: k === 0 ? rotateEveryMinutes : null,
    }));
}
const groupsOf = (grid: ReturnType<typeof rotationGrid<Row>>) => grid?.rounds.map((round) => round.stations.map((cell) => cell.group));

describe("blockMinutes and rotationGrid (spec R4)", () => {
    it("a lone row lasts its minutes; a block that doesn't rotate lasts its longest station", () => {
        expect(blockMinutes([solo("a", 0, 12)])).toBe(12);
        expect(blockMinutes([block("w", 0, "warmup", 8)])).toBe(8);
        expect(blockMinutes(stations(0, [{ id: "a", duration: 15 }, { id: "b", duration: 10 }]))).toBe(15);
        expect(rotationGrid(stations(0, [{ id: "a" }, { id: "b" }]))).toBeNull();
    });

    it("rotates 3 stations: M × 3, group g at station (g + r) mod 3", () => {
        const rows = stations(0, [{ id: "a" }, { id: "b" }, { id: "c" }], 5);
        expect(blockMinutes(rows)).toBe(15);
        const grid = rotationGrid(rows);
        expect(grid?.minutes).toBe(5);
        expect(grid?.groups).toEqual(["A", "B", "C"]);
        expect(grid?.rounds.map((round) => round.start)).toEqual([0, 5, 10]);
        expect(groupsOf(grid)).toEqual([["A", "B", "C"], ["C", "A", "B"], ["B", "C", "A"]]);
        expect(grid?.rounds[1].stations.map((cell) => cell.row.id)).toEqual(["a", "b", "c"]);
    });

    it("rotates 4 stations", () => {
        const rows = stations(0, [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }], 4);
        expect(blockMinutes(rows)).toBe(16);
        expect(groupsOf(rotationGrid(rows))?.[1]).toEqual(["D", "A", "B", "C"]);
    });

    it("keeps a stays station out of the rotation: it shows all in every round", () => {
        const rows = stations(0, [{ id: "g", stays: true }, { id: "b" }, { id: "c" }], 5);
        expect(blockMinutes(rows)).toBe(10);
        expect(rotationGrid(rows)?.groups).toEqual(["A", "B"]);
        expect(groupsOf(rotationGrid(rows))).toEqual([["all", "A", "B"], ["all", "B", "A"]]);
        const four = stations(0, [{ id: "g", stays: true }, { id: "a" }, { id: "b" }, { id: "c" }], 6);
        expect([blockMinutes(four), rotationGrid(four)?.groups.join("")]).toEqual([18, "ABC"]);
    });

    it("doesn't rotate with fewer than 2 rotating stations, or on a lone drill", () => {
        const rows = stations(0, [{ id: "g", stays: true, duration: 12 }, { id: "b", duration: 5 }], 5);
        expect(rotationMinutes(rows)).toBeNull();
        expect(blockMinutes(rows)).toBe(12);
        expect(rotationGrid([solo("a", 0, 10, { rotateEveryMinutes: 5 })])).toBeNull();
    });

    it("lays the grid out as a table: one column per station, one row per round", () => {
        const rows = stations(0, [{ id: "g", stays: true }, { id: "b" }, { id: "c" }], 5);
        const grid = rotationGrid(rows);
        expect(grid && rotationTable(grid, (row) => row.id.toUpperCase(), (start) => rotationRoundLabel(start, 5))).toEqual({
            columns: ["G", "B", "C"],
            rows: [
                { start: "0–5 min", cells: ["all", "A", "B"] },
                { start: "5–10 min", cells: ["all", "B", "A"] },
            ],
        });
    });
});

describe("groupStations, buildSchedule and sessionWallMinutes with blocks and gaps (spec R4)", () => {
    const START = new Date("2026-10-06T23:00:00.000Z");
    const rows = [
        block("w", 0, "warmup", 8),
        ...stations(1, [{ id: "a" }, { id: "b" }], 5),
        block("c", 3, "cooldown", 5),
    ];

    it("never joins a block row to a station block, even with a stray flag", () => {
        const groups = groupStations([solo("a", 0), block("w", 1, "warmup", 8, { runsWithPrevious: true }), solo("b", 2, 10, { runsWithPrevious: true })]);
        expect(groups.map((group) => group.stations.map((row) => row.id))).toEqual([["a"], ["w"], ["b"]]);
    });

    it("adds the gap between blocks, never after the last one", () => {
        expect(groupStations(rows, 2).map((group) => [group.startMinute, group.wallMinutes])).toEqual([[0, 8], [10, 10], [22, 5]]);
        expect(sessionWallMinutes(rows, 2)).toBe(27);
        expect(sessionWallMinutes(rows)).toBe(23);
        expect(sessionWallMinutes([], 3)).toBe(0);
    });

    it("schedules each block and each rotation round", () => {
        const minutes = (date: Date) => (date.getTime() - START.getTime()) / 60_000;
        const schedule = buildSchedule(rows, START, 2);
        expect(schedule.map((row) => [minutes(row.startsAt), minutes(row.endsAt)])).toEqual([[0, 8], [10, 20], [22, 27]]);
        expect(schedule.map((row) => row.roundStarts.map(minutes))).toEqual([[], [10, 15], []]);
    });
});

describe("normalizeGroups: row rules (spec R3)", () => {
    it("a block row never runs with, stays or rotates, and the drill after it starts a new block", () => {
        const [, w, b] = normalizeGroups([
            solo("a", 0),
            block("w", 1, "warmup", 8, { runsWithPrevious: true, stays: true, rotateEveryMinutes: 5 }),
            solo("b", 2, 10, { runsWithPrevious: true }),
        ]);
        expect([w.runsWithPrevious, w.stays, w.rotateEveryMinutes]).toEqual([false, false, null]);
        expect(b.runsWithPrevious).toBe(false);
    });

    it("keeps a rotation only on the first drill of a block of 2 or more", () => {
        expect(normalizeGroups([solo("a", 0, 10, { rotateEveryMinutes: 5 })])[0].rotateEveryMinutes).toBeNull();
        const rows = stations(0, [{ id: "a" }, { id: "b" }]);
        rows[1] = { ...rows[1], rotateEveryMinutes: 5 };
        expect(normalizeGroups(rows).map((row) => row.rotateEveryMinutes)).toEqual([null, null]);
    });

    it("clears stays outside a rotating block", () => {
        expect(normalizeGroups(stations(0, [{ id: "a" }, { id: "b", stays: true }]))[1].stays).toBe(false);
    });

    it("writes the minutes of a rotating block: M per rotating station, the block's length for a stays station", () => {
        const rows = normalizeGroups(stations(0, [{ id: "g", stays: true, duration: 7 }, { id: "a", duration: 7 }, { id: "b", duration: 9 }], 6));
        expect(rows.map((row) => row.duration)).toEqual([12, 6, 6]);
    });

    it("leaves a block that can't rotate as the coach set it, and unchanged rows as the same objects", () => {
        const cantRotate = stations(0, [{ id: "g", stays: true, duration: 12 }, { id: "a", duration: 5 }], 5);
        const normalized = normalizeGroups(cantRotate);
        expect(normalized[0]).toBe(cantRotate[0]);
        expect(normalized[1]).toBe(cantRotate[1]);
        // Normalized once over the whole list (an inner call would renumber the stations from 0).
        const valid = normalizeGroups([block("w", 0, "warmup", 8), ...stations(1, [{ id: "a" }, { id: "b" }], 5)]);
        normalizeGroups(valid).forEach((row, index) => expect(row).toBe(valid[index]));
    });
});

describe("settleRotations", () => {
    it("clears a rotation that can't run (fewer than 2 rotating stations) and its stays flags", () => {
        const rows = stations(0, [{ id: "g", stays: true }, { id: "a" }], 5);
        const settled = settleRotations(rows);
        expect(settled.map((row) => [row.rotateEveryMinutes, row.stays])).toEqual([[null, false], [null, false]]);
    });

    it("returns the list itself when every rotation can run", () => {
        const rows = normalizeGroups(stations(0, [{ id: "a" }, { id: "b" }], 5));
        expect(settleRotations(rows)).toBe(rows);
    });
});

describe("sessionRowsError (server, static store and importer)", () => {
    it("accepts blocks, rotation and stays where they belong, whatever the array order", () => {
        const rows = [block("w", 0, "warmup", 8), ...stations(1, [{ id: "g", stays: true }, { id: "a" }, { id: "b" }], 5)];
        expect(sessionRowsError([...rows].reverse())).toBeNull();
    });

    it("keeps the station rules", () => {
        expect(sessionRowsError([solo("a", 0, 10, { runsWithPrevious: true })])).toBe(FIRST_DRILL_STATION_ERROR);
    });

    it("rejects a block in a station block, before or after", () => {
        expect(sessionRowsError([solo("a", 0), block("w", 1, "warmup", 8, { runsWithPrevious: true })])).toBe(BLOCK_STATION_ERROR);
        expect(sessionRowsError([block("w", 0, "warmup", 8), solo("a", 1, 10, { runsWithPrevious: true })])).toBe(BLOCK_STATION_ERROR);
    });

    it("rejects a block that stays or rotates", () => {
        expect(sessionRowsError([block("w", 0, "warmup", 8, { stays: true })])).toBe(BLOCK_ROW_FIELDS_ERROR);
        expect(sessionRowsError([block("w", 0, "warmup", 8, { rotateEveryMinutes: 5 })])).toBe(BLOCK_ROW_FIELDS_ERROR);
    });

    it("rejects a rotation anywhere but the first drill of a block of 2 or more", () => {
        expect(sessionRowsError([solo("a", 0, 10, { rotateEveryMinutes: 5 })])).toBe(ROTATION_PLACEMENT_ERROR);
        const rows = stations(0, [{ id: "a" }, { id: "b" }]);
        rows[1] = { ...rows[1], rotateEveryMinutes: 5 };
        expect(sessionRowsError(rows)).toBe(ROTATION_PLACEMENT_ERROR);
    });

    it("rejects a rotation with fewer than 2 rotating stations, and ignores stays outside a rotation", () => {
        expect(sessionRowsError(stations(0, [{ id: "g", stays: true }, { id: "a" }], 5))).toBe(ROTATION_TOO_FEW_ERROR);
        expect(sessionRowsError(stations(0, [{ id: "a" }, { id: "b", stays: true }]))).toBeNull();
    });
});

describe("list edits around block rows", () => {
    it("a block can't join a station block, and a drill can't join a block", () => {
        const rows = [solo("a", 0), block("w", 1, "warmup", 8), solo("b", 2)];
        expect(canToggleRunsWithPrevious(rows, 1)).toBe(false);
        expect(canToggleRunsWithPrevious(rows, 2)).toBe(false);
        expect(toggleRunsWithPrevious(rows, 2)).toBe(rows);
    });

    it("a block moves as one unit over a whole station block", () => {
        const rows = [block("w", 0, "warmup", 8), ...stations(1, [{ id: "a" }, { id: "b" }])];
        expect(moveItem(rows, 0, 1).map((row) => `${row.id}${row.runsWithPrevious ? "+" : ""}`)).toEqual(["a", "b+", "w"]);
    });
});

describe("list edits keep a block's rotation on its first drill (ruling R4)", () => {
    const shape = (rows: Row[]) => rows.map((row) => [row.id, row.runsWithPrevious, row.rotateEveryMinutes, Boolean(row.stays)]);
    // g stays, a and b rotate every 5 minutes; g holds the rotation.
    const rotating = () => normalizeGroups(stations(0, [{ id: "g", stays: true }, { id: "a" }, { id: "b" }], 5));

    it("a station moved up to the top takes the rotation, and the stays tick stays", () => {
        expect(shape(moveItem(rotating(), 1, -1))).toEqual([
            ["a", false, 5, false],
            ["g", true, null, true],
            ["b", true, null, false],
        ]);
    });

    it("deleting the first drill hands the rotation to the next station", () => {
        expect(shape(removeItem(rotating(), 0))).toEqual([
            ["a", false, 5, false],
            ["b", true, null, false],
        ]);
    });

    it("a rotating block joined onto a drill gives the merged block its rotation", () => {
        const rows = normalizeGroups([solo("x", 0), ...stations(1, [{ id: "a" }, { id: "b" }], 5)]);
        expect(shape(toggleRunsWithPrevious(rows, 1))).toEqual([
            ["x", false, 5, false],
            ["a", true, null, false],
            ["b", true, null, false],
        ]);
    });

    it("splitting a block leaves the rotation on its first drill; the split-off station starts a block that doesn't rotate", () => {
        const rows = normalizeGroups(stations(0, [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d", stays: true }], 4));
        expect(shape(toggleRunsWithPrevious(rows, 3))).toEqual([
            ["a", false, 4, false],
            ["b", true, null, false],
            ["c", true, null, false],
            ["d", false, null, false],
        ]);
    });
});

describe("goalieWarnings with blocks and rotation", () => {
    const G: PlayData = {
        ...createEmptyPlayData(),
        players: [{ id: "g", role: "G", label: "G", position: { x: 14, y: 42.5 }, color: "#212121" }],
    };

    it("skips block rows", () => {
        const rows = [block("w", 0, "warmup", 8), { ...solo("a", 1), goalies: "required" as const, playData: G }];
        expect(goalieWarnings(groupStations(rows), 0).short).toEqual([{ groupIndex: 1, sequences: [1], needed: 1 }]);
        expect(goalieWarnings(groupStations([block("w", 0, "warmup", 8)]), 2)).toEqual({ short: [], unused: false });
    });

    it("counts a rotating block like any block: a stays goalie station plus each rotating station that needs one", () => {
        const [g, a, b] = stations(0, [{ id: "g", stays: true }, { id: "a" }, { id: "b" }], 5);
        const rows = [{ ...g, goalies: "required" as const, playData: G }, { ...a, goalies: "required" as const, playData: G }, { ...b, goalies: "optional" as const, playData: G }];
        expect(goalieWarnings(groupStations(rows), 1).short).toEqual([{ groupIndex: 0, sequences: [0, 1], needed: 2 }]);
    });
});

describe("rotation labels", () => {
    it("words the block header, the summary, the chip, the gap and a round", () => {
        expect(rotationBlockLabel(5, 15)).toBe("Stations · rotate every 5 min · 15 min");
        expect(rotationSummary(3, 5)).toBe("3 stations × 5 min = 15 min · groups A–C");
        expect(rotationSummary(2, 6)).toBe("2 stations × 6 min = 12 min · groups A–B");
        expect(rotatesEveryLabel(5)).toBe("Rotates every 5 min");
        expect(betweenBlocksLabel(1)).toBe("1 min between blocks");
        expect(rotationRoundLabel(5, 5)).toBe("5–10 min");
        expect([STAYS_MARK, staysSuffix(true), staysSuffix(false), staysSuffix(undefined)]).toEqual(["stays", " · stays", "", ""]);
    });

    it("suggests an interval that keeps the block about as long as it was", () => {
        const at = (...durations: number[]) => defaultRotationMinutes(durations.map((duration, k) => solo(`s${k}`, k, duration)));
        expect([at(15, 15, 15), at(10, 10), at(40, 10), at(90, 90), at(1, 1, 1)]).toEqual([5, 5, 20, 30, 1]);
    });
});
