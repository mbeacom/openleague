import { describe, expect, it } from "vitest";
import {
    FOCUS_LABELS,
    GOALIES_LABELS,
    displayPlayData,
    drillTags,
    goalieDemand,
    needsGoalie,
    goalieMarkerCount,
    hidesGoalieMarkers,
    sessionForDisplay,
    toGoaliesAttending,
    toPlayFocus,
    toPlayGoalies,
    withoutGoalies,
} from "@/lib/utils/drill-tags";
import { PLAY_FOCUS, PLAY_GOALIES, type PlayData } from "@/types/practice-planner";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const BOARD: PlayData = {
    ...createEmptyPlayData(),
    players: [
        { id: "g", role: "G", label: "G", position: { x: 14, y: 42.5 }, color: "#212121" },
        { id: "f", role: "F", label: "F1", position: { x: 40, y: 42.5 }, color: "#1976D2" },
    ],
    equipment: [{ id: "n", kind: "net", position: { x: 11, y: 42.5 }, rotation: 180 }],
};

describe("tag readers", () => {
    it("accept every known value and default anything else", () => {
        for (const focus of PLAY_FOCUS) expect(toPlayFocus(focus)).toBe(focus);
        for (const goalies of PLAY_GOALIES) expect(toPlayGoalies(goalies)).toBe(goalies);
        expect(toPlayFocus("keepers")).toBe("team");
        expect(toPlayFocus(undefined)).toBe("team");
        expect(toPlayGoalies(null)).toBe("optional");
        expect(drillTags({})).toEqual({ focus: "team", goalies: "optional" });
        expect(drillTags(null)).toEqual({ focus: "team", goalies: "optional" });
        expect(drillTags({ focus: "goalies", goalies: "required" })).toEqual({ focus: "goalies", goalies: "required" });
    });

    it("labels every value", () => {
        expect(Object.keys(FOCUS_LABELS)).toEqual([...PLAY_FOCUS]);
        expect(Object.keys(GOALIES_LABELS)).toEqual([...PLAY_GOALIES]);
    });

    it("reads a goalie count as a whole number from 0 to 10, else null", () => {
        expect([0, 1, 10].map(toGoaliesAttending)).toEqual([0, 1, 10]);
        expect([-1, 11, 1.5, "2", null, undefined, Number.NaN].map(toGoaliesAttending)).toEqual([null, null, null, null, null, null, null]);
    });
});

describe("goalie markers", () => {
    it("withoutGoalies drops only role-G players and leaves the input untouched", () => {
        const shown = withoutGoalies(BOARD);
        expect(shown.players.map((p) => p.id)).toEqual(["f"]);
        expect(shown.equipment).toBe(BOARD.equipment);
        expect(BOARD.players).toHaveLength(2);
    });

    it("hides markers only when 0 goalies attend an optional-goalie drill", () => {
        expect(hidesGoalieMarkers(0, "optional")).toBe(true);
        expect(hidesGoalieMarkers(0, undefined)).toBe(true); // untagged reads as optional
        expect(hidesGoalieMarkers(0, "required")).toBe(false);
        expect(hidesGoalieMarkers(0, "none")).toBe(false);
        expect(hidesGoalieMarkers(1, "optional")).toBe(false);
        expect(hidesGoalieMarkers(null, "optional")).toBe(false);
        expect(hidesGoalieMarkers(undefined, "optional")).toBe(false);
    });

    it("never hides the goalie on a goalie-focus drill", () => {
        expect(hidesGoalieMarkers(0, "optional", "goalies")).toBe(false);
        expect(hidesGoalieMarkers(0, "optional", "team")).toBe(true);
        expect(displayPlayData(BOARD, "optional", 0, "goalies")).toBe(BOARD);
        const session = { goaliesAttending: 0, plays: [{ play: { focus: "goalies" as const, goalies: "optional" as const, playData: BOARD } }] };
        expect(sessionForDisplay(session)).toBe(session);
    });

    it("displayPlayData returns the same object unless markers are hidden", () => {
        expect(displayPlayData(BOARD, "optional", 1)).toBe(BOARD);
        expect(displayPlayData(BOARD, "required", 0)).toBe(BOARD);
        expect(displayPlayData(null, "optional", 0)).toBeNull();
        const noGoalie = withoutGoalies(BOARD);
        expect(displayPlayData(noGoalie, "optional", 0)).toBe(noGoalie);
        expect(displayPlayData(BOARD, "optional", 0)?.players.map((p) => p.role)).toEqual(["F"]);
    });

    it("sessionForDisplay keeps the session object when nothing is hidden", () => {
        const session = { goaliesAttending: null, plays: [{ play: { goalies: "optional" as const, playData: BOARD } }] };
        expect(sessionForDisplay(session)).toBe(session);
        const zero = { ...session, goaliesAttending: 0 };
        const shown = sessionForDisplay(zero);
        expect(shown).not.toBe(zero);
        expect(shown.plays[0].play.playData?.players).toHaveLength(1);
        expect(zero.plays[0].play.playData.players).toHaveLength(2);
    });
});

describe("needsGoalie", () => {
    it("is true for a drill tagged required or goalie focused, false otherwise (untagged included)", () => {
        expect(needsGoalie({ goalies: "required" })).toBe(true);
        expect(needsGoalie({ focus: "goalies", goalies: "optional" })).toBe(true);
        expect(needsGoalie({ focus: "goalies", goalies: "none" })).toBe(true);
        expect(needsGoalie({ focus: "team", goalies: "optional" })).toBe(false);
        expect(needsGoalie({})).toBe(false);
    });
});

describe("goalieDemand", () => {
    it("is 0 unless the drill needs goalies, then one per G marker (at least one)", () => {
        expect(goalieDemand({ goalies: "optional", playData: BOARD })).toBe(0);
        expect(goalieDemand({ goalies: "none", playData: BOARD })).toBe(0);
        expect(goalieDemand({ goalies: "required", playData: createEmptyPlayData() })).toBe(1);
        expect(goalieDemand({ focus: "goalies", goalies: "optional", playData: BOARD })).toBe(1);
        const two = { ...BOARD, players: [...BOARD.players, { ...BOARD.players[0], id: "g2", position: { x: 186, y: 42.5 } }] };
        expect(goalieMarkerCount(two)).toBe(2);
        expect(goalieDemand({ goalies: "required", playData: two })).toBe(2);
        expect(goalieDemand({ goalies: "required", playData: null })).toBe(1);
    });
});
