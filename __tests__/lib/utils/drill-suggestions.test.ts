import { describe, expect, it } from "vitest";
import { PLAY_DATA_VERSION, type PlayData, type PlayerRole } from "@/types/practice-planner";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import {
    MAX_SUGGESTIONS,
    impliedSkaterMinimum,
    mostStations,
    rankDrillSuggestions,
    suggestionCandidates,
    suggestionGoalies,
    type SuggestionCandidate,
    type SuggestionContext,
} from "@/lib/utils/drill-suggestions";

function board(roles: PlayerRole[]): PlayData {
    return {
        version: PLAY_DATA_VERSION,
        players: roles.map((role, index) => ({ id: `p${index}`, role, label: "", position: { x: 10 * index, y: 10 }, color: "#000" })),
        drawings: [],
        equipment: [],
        annotations: [],
    };
}

function drill(id: string, partial: Partial<SuggestionCandidate> = {}): SuggestionCandidate {
    return { id, source: "library", name: id, focus: "skaters", goalies: "none", ageGroups: [], playData: board(["F", "F"]), ...partial };
}

const context = (partial: Partial<SuggestionContext> = {}): SuggestionContext => ({ skaters: 7, goalies: 1, ageGroup: null, stations: 0, excludeNames: [], ...partial });

describe("impliedSkaterMinimum", () => {
    it("counts skater markers, not goalies or coaches", () => {
        expect(impliedSkaterMinimum(board(["F", "D", "X", "O", "G", "C"]))).toBe(4);
    });

    it("is unknown without a diagram or skater markers", () => {
        expect(impliedSkaterMinimum(null)).toBeNull();
        expect(impliedSkaterMinimum(board(["G", "C"]))).toBeNull();
    });

    it("knows every starter drill except pure goalie work", () => {
        for (const starter of STARTER_PLAYS) {
            if (starter.focus !== "goalies") expect(impliedSkaterMinimum(starter.playData), starter.id).not.toBeNull();
        }
    });
});

describe("rankDrillSuggestions exclusions", () => {
    it("returns nothing for an empty roster", () => {
        expect(rankDrillSuggestions([drill("a")], context({ skaters: 0, goalies: 0 }))).toEqual([]);
    });

    it("skips drills already in the practice, by name ignoring case", () => {
        expect(rankDrillSuggestions([drill("Weave")], context({ excludeNames: ["  weave "] }))).toEqual([]);
    });

    it("skips drills tagged for other ages, keeps untagged ones", () => {
        const result = rankDrillSuggestions([drill("older", { ageGroups: ["u12"] }), drill("any")], context({ ageGroup: "u8" }));
        expect(result.map((s) => s.candidate.id)).toEqual(["any"]);
    });

    it("skips drills that need more goalies than the roster has", () => {
        const needs = drill("needs", { goalies: "required", playData: board(["F", "G"]) });
        const needsTwo = drill("two", { goalies: "required", playData: board(["F", "G", "G"]) });
        expect(rankDrillSuggestions([needs, needsTwo], context({ goalies: 0 }))).toEqual([]);
        expect(rankDrillSuggestions([needs, needsTwo], context({ goalies: 1 })).map((s) => s.candidate.id)).toEqual(["needs"]);
    });

    it("skips drills that need more skaters than the roster has", () => {
        const five = drill("five", { playData: board(["F", "F", "F", "D", "D"]) });
        expect(rankDrillSuggestions([five], context({ skaters: 4 }))).toEqual([]);
    });
});

describe("rankDrillSuggestions scores and reasons", () => {
    it("gives a reason per rule", () => {
        const [made] = rankDrillSuggestions([drill("made", { ageGroups: ["u8"], goalies: "required", playData: board(["F", "F", "G"]) })], context({ ageGroup: "u8", skaters: 6 }));
        expect(made.reasons).toEqual(["Made for 8U", "Needs a goalie: you have 1", "Best with 2–6 skaters"]);
        expect(made.score).toBe(7);
    });

    it("words two goalies and optional goalies", () => {
        const [two] = rankDrillSuggestions([drill("two", { goalies: "required", playData: board(["F", "G", "G"]) })], context({ goalies: 2, skaters: 3 }));
        expect(two.reasons).toContain("Needs 2 goalies: you have 2");
        const [optional] = rankDrillSuggestions([drill("opt", { goalies: "optional" })], context());
        expect(optional.reasons).toContain("Uses your goalie");
        const [none] = rankDrillSuggestions([drill("none")], context({ goalies: 0 }));
        expect(none.reasons).toContain("No goalie needed");
    });

    it("suggests stations for a big group and a fit for the practice's stations", () => {
        const [big] = rankDrillSuggestions([drill("pair")], context({ skaters: 13 }));
        expect(big.reasons).toContain("Big group: run it as 3 stations");
        const [station] = rankDrillSuggestions([drill("pair")], context({ skaters: 8, stations: 4 }));
        expect(station.reasons).toContain("Fits a station of 2");
        const [small] = rankDrillSuggestions([drill("four", { playData: board(["F", "F", "F", "F"]) })], context({ skaters: 8, stations: 4 }));
        expect(small.reasons).not.toContain("Fits a station of 2");
    });

    it("caps the stations a big group splits into at 4", () => {
        const [big] = rankDrillSuggestions([drill("solo", { playData: board(["F"]) })], context({ skaters: 30 }));
        expect(big.reasons).toContain("Big group: run it as 4 stations");
    });

    it("gives no count reason when the count is unknown", () => {
        const [unknown] = rankDrillSuggestions([drill("own", { playData: null })], context());
        expect(unknown.reasons.some((reason) => /skaters|station/.test(reason))).toBe(false);
    });
});

describe("rankDrillSuggestions order", () => {
    it("sorts by score, then the compare seam, then library before starter, then name, then id", () => {
        const fits = drill("b-fit", { playData: board(["F", "F", "F"]) });
        const plainLib = drill("z-lib", { playData: null });
        const plainStarter = drill("a-starter", { source: "starter", playData: null });
        const sameName1 = drill("id-2", { name: "Same", playData: null });
        const sameName2 = drill("id-1", { name: "Same", playData: null });
        const ranked = rankDrillSuggestions([plainStarter, sameName1, plainLib, sameName2, fits], context({ goalies: 0 }), { limit: 10 });
        expect(ranked.map((s) => s.candidate.id)).toEqual(["b-fit", "id-1", "id-2", "z-lib", "a-starter"]);
    });

    it("lets a comparator (favorites, later) break score ties", () => {
        const a = drill("a", { playData: null });
        const b = drill("b", { playData: null });
        const favoriteB = (x: SuggestionCandidate, y: SuggestionCandidate) => Number(y.id === "b") - Number(x.id === "b");
        expect(rankDrillSuggestions([a, b], context(), { compare: favoriteB }).map((s) => s.candidate.id)).toEqual(["b", "a"]);
    });

    it("is the same for any input order and stops at the limit", () => {
        const many = Array.from({ length: 12 }, (_, i) => drill(`d${String(i).padStart(2, "0")}`, { playData: board(Array(1 + (i % 4)).fill("F")) }));
        const first = rankDrillSuggestions(many, context());
        const second = rankDrillSuggestions([...many].reverse(), context());
        expect(first.map((s) => s.candidate.id)).toEqual(second.map((s) => s.candidate.id));
        expect(first).toHaveLength(MAX_SUGGESTIONS);
    });
});

describe("suggestionCandidates", () => {
    it("lists library drills with a starter's diagram by name, then the starters not in the library", () => {
        const starter = STARTER_PLAYS[0];
        const candidates = suggestionCandidates(
            [
                { id: "lib-1", name: starter.name.toUpperCase(), focus: "team", goalies: "optional", ageGroups: [] },
                { id: "lib-2", name: "Coach's own", focus: "skaters", goalies: "none", ageGroups: ["u8"] },
            ],
            STARTER_PLAYS,
        );
        expect(candidates[0]).toMatchObject({ id: "lib-1", source: "library", playData: starter.playData });
        expect(candidates[1]).toMatchObject({ id: "lib-2", source: "library", playData: null });
        expect(candidates.filter((c) => c.source === "starter")).toHaveLength(STARTER_PLAYS.length - 1);
        expect(candidates.some((c) => c.id === starter.id)).toBe(false);
    });
});

describe("context helpers", () => {
    it("counts the most stations in one block", () => {
        const row = (runsWithPrevious: boolean, kind?: "warmup") => ({ runsWithPrevious, ...(kind && { kind }) });
        expect(mostStations([])).toBe(0);
        expect(mostStations([row(false), row(false)])).toBe(1);
        expect(mostStations([row(false), row(true), row(true), row(false, "warmup"), row(false), row(true)])).toBe(3);
    });

    it("reads goalies from the roster when it has players, else goalies attending (R14)", () => {
        expect(suggestionGoalies({ ageGroup: null, roles: ["S", "G"], players: [{ key: "a", name: "", number: "", role: "G" }] }, 3)).toBe(1);
        expect(suggestionGoalies({ ageGroup: null, roles: ["S", "G"], players: [] }, 2)).toBe(2);
        expect(suggestionGoalies(null, null)).toBe(0);
    });
});
