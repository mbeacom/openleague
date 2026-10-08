/**
 * Drill suggestions (roster and suggestions spec R13, R14): rank library and
 * starter drills for a practice roster's skater and goalie counts, its age
 * group and the practice's stations, with a reason per drill.
 *
 * Pure and deterministic: the same inputs give the same order whatever order
 * the candidates come in. Portable (ADR-0020): no React, server or DOM imports.
 *
 * Player counts are implied from each drill's diagram, never stored (R13):
 * a drill's minimum skaters is its skater markers, its best group that number
 * up to three times it (one group working, two waiting).
 */
import type { PlayData, PlayFocus, PlayGoalies } from "@/types/practice-planner";
import { AGE_GROUP_LABELS, type AgeGroup } from "@/lib/utils/age-groups";
import { goalieDemand, needsGoalie } from "@/lib/utils/drill-tags";
import { rosterCounts, type PracticeRoster } from "@/lib/utils/practice-roster";

/** The panel shows this many (R13). */
export const MAX_SUGGESTIONS = 6;
/** A big group splits into at most this many stations (the station block cap). */
const MAX_SPLIT_STATIONS = 4;
/** A drill's best group: its minimum skaters up to this many times it. */
const BEST_GROUP_FACTOR = 3;

/** Markers that stand for a skater on the ice: generic, forwards, defense and opponents (played by your skaters). */
const SKATER_MARKERS = new Set(["X", "O", "F", "D"]);

export interface SuggestionCandidate {
    /** A library play id, or a starter's slug */
    id: string;
    source: "library" | "starter";
    name: string;
    focus: PlayFocus;
    goalies: PlayGoalies;
    ageGroups: readonly AgeGroup[];
    /** The diagram the counts are read from; null = counts unknown. */
    playData: PlayData | null;
}

export interface SuggestionContext {
    skaters: number;
    goalies: number;
    ageGroup: AgeGroup | null;
    /** The most stations in one block of the practice (0 or 1 when none). */
    stations: number;
    /** Drill names already in the practice: never suggested again. */
    excludeNames: Iterable<string>;
}

export interface DrillSuggestion {
    candidate: SuggestionCandidate;
    score: number;
    reasons: string[];
}

export interface RankOptions {
    /**
     * Runs after the score and before the built-in tie-breaks. The seam for
     * favorites: a later change passes "favorites first". Must be deterministic.
     */
    compare?: (a: SuggestionCandidate, b: SuggestionCandidate) => number;
    limit?: number;
}

const nameKey = (name: string) => name.trim().toLowerCase();

/** Skater markers in the diagram, or null when there is no diagram or no skater on it. */
export function impliedSkaterMinimum(playData: PlayData | null | undefined): number | null {
    if (!playData) return null;
    const count = playData.players.filter((player) => SKATER_MARKERS.has(player.role)).length;
    return count > 0 ? count : null;
}

function goalieReason(drill: SuggestionCandidate, goalies: number): { score: number; reason: string | null } | null {
    if (needsGoalie(drill)) {
        const demand = goalieDemand(drill);
        if (goalies < demand) return null;
        const need = demand === 1 ? "Needs a goalie" : `Needs ${demand} goalies`;
        return { score: 2, reason: `${need}: you have ${goalies}` };
    }
    if (drill.goalies === "optional" && goalies > 0) return { score: 1, reason: "Uses your goalie" };
    if (drill.goalies === "none" && goalies === 0) return { score: 1, reason: "No goalie needed" };
    return { score: 0, reason: null };
}

function scoreDrill(drill: SuggestionCandidate, context: SuggestionContext, excluded: ReadonlySet<string>): DrillSuggestion | null {
    if (excluded.has(nameKey(drill.name))) return null;
    const reasons: string[] = [];
    let score = 0;

    if (context.ageGroup && drill.ageGroups.length > 0) {
        if (!drill.ageGroups.includes(context.ageGroup)) return null;
        score += 2;
        reasons.push(`Made for ${AGE_GROUP_LABELS[context.ageGroup]}`);
    }

    const goalie = goalieReason(drill, context.goalies);
    if (!goalie) return null;
    score += goalie.score;
    if (goalie.reason) reasons.push(goalie.reason);

    const minimum = impliedSkaterMinimum(drill.playData);
    if (minimum !== null) {
        if (context.skaters < minimum) return null;
        const best = minimum * BEST_GROUP_FACTOR;
        if (context.skaters <= best) {
            score += 3;
            reasons.push(minimum === best ? `Best with ${minimum} skaters` : `Best with ${minimum}–${best} skaters`);
        } else {
            score += 1;
            const split = Math.min(MAX_SPLIT_STATIONS, Math.ceil(context.skaters / best));
            reasons.push(`Big group: run it as ${split} stations`);
        }
        if (context.stations >= 2) {
            const share = Math.floor(context.skaters / context.stations);
            if (share >= minimum) {
                score += 1;
                reasons.push(`Fits a station of ${share}`);
            }
        }
    }
    return { candidate: drill, score, reasons };
}

const byName = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/**
 * The drills that fit, best first (R13): excluded when already in the
 * practice, tagged for another age, short of goalies or short of skaters;
 * then by score, `options.compare`, library before starter, name and id.
 */
export function rankDrillSuggestions(candidates: readonly SuggestionCandidate[], context: SuggestionContext, options: RankOptions = {}): DrillSuggestion[] {
    if (context.skaters + context.goalies <= 0) return [];
    const excluded = new Set(Array.from(context.excludeNames, nameKey));
    const scored = candidates.flatMap((drill) => {
        const suggestion = scoreDrill(drill, context, excluded);
        return suggestion ? [suggestion] : [];
    });
    scored.sort(
        (a, b) =>
            b.score - a.score ||
            (options.compare?.(a.candidate, b.candidate) ?? 0) ||
            Number(a.candidate.source === "starter") - Number(b.candidate.source === "starter") ||
            byName.compare(a.candidate.name, b.candidate.name) ||
            (a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0),
    );
    return scored.slice(0, options.limit ?? MAX_SUGGESTIONS);
}

/** A library drill as the store lists it (no diagram). */
export interface LibraryCandidateInput {
    id: string;
    name: string;
    focus?: PlayFocus;
    goalies?: PlayGoalies;
    ageGroups?: readonly AgeGroup[];
}

export interface StarterCandidateInput {
    id: string;
    name: string;
    focus: PlayFocus;
    goalies: PlayGoalies;
    ageGroups: readonly AgeGroup[];
    playData: PlayData;
}

/**
 * The pool (R13): library drills, each with the diagram of the starter of the
 * same name when there is one (counts unknown otherwise), then the starters
 * not already in the library.
 */
export function suggestionCandidates(library: readonly LibraryCandidateInput[], starters: readonly StarterCandidateInput[]): SuggestionCandidate[] {
    const startersByName = new Map(starters.map((starter) => [nameKey(starter.name), starter]));
    const inLibrary = new Set<string>();
    const fromLibrary = library.map((play): SuggestionCandidate => {
        inLibrary.add(nameKey(play.name));
        return {
            id: play.id,
            source: "library",
            name: play.name,
            focus: play.focus ?? "team",
            goalies: play.goalies ?? "optional",
            ageGroups: play.ageGroups ?? [],
            playData: startersByName.get(nameKey(play.name))?.playData ?? null,
        };
    });
    const fromStarters = starters
        .filter((starter) => !inLibrary.has(nameKey(starter.name)))
        .map((starter): SuggestionCandidate => ({ ...starter, source: "starter" }));
    return [...fromLibrary, ...fromStarters];
}

/** The most stations in one block: a drill and the drills that run with it. 0 for no rows. */
export function mostStations(rows: ReadonlyArray<{ kind?: string; runsWithPrevious: boolean }>): number {
    let most = 0;
    let current = 0;
    for (const row of rows) {
        const isDrill = row.kind === undefined || row.kind === "drill";
        current = isDrill && row.runsWithPrevious && current > 0 ? current + 1 : 1;
        most = Math.max(most, current);
    }
    return most;
}

/** R14: the roster's goalies when it has players, else goalies attending, else 0. */
export function suggestionGoalies(roster: PracticeRoster | null | undefined, goaliesAttending: number | null | undefined): number {
    const counts = rosterCounts(roster);
    if (counts.total > 0) return counts.goalies;
    return goaliesAttending ?? 0;
}
