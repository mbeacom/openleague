/**
 * Drill tags (focus, goalies) and the session goalie count (goaltender-aware
 * drills): labels, readers that fill in the defaults, and the render-time
 * goalie-marker rule. Pure: no React, server or DOM imports, so both
 * deployables, the server actions and the plan document share it.
 */
import {
    DEFAULT_PLAY_FOCUS,
    DEFAULT_PLAY_GOALIES,
    MAX_GOALIES_ATTENDING,
    PLAY_FOCUS,
    PLAY_GOALIES,
    type PlayData,
    type PlayFocus,
    type PlayGoalies,
} from "@/types/practice-planner";

export const FOCUS_LABELS: Record<PlayFocus, string> = {
    team: "Team",
    skaters: "Skaters",
    goalies: "Goalies",
};

export const GOALIES_LABELS: Record<PlayGoalies, string> = {
    none: "No goalie",
    optional: "Goalie optional",
    required: "Needs goalie",
};

export const GOALIES_ATTENDING_MESSAGE = `Goalies attending must be a whole number from 0 to ${MAX_GOALIES_ATTENDING}`;

/** A known focus, else the default (a database string, a legacy record, a plan file). */
export function toPlayFocus(value: unknown): PlayFocus {
    return (PLAY_FOCUS as readonly unknown[]).includes(value) ? (value as PlayFocus) : DEFAULT_PLAY_FOCUS;
}

/** A known goalies value, else the default. */
export function toPlayGoalies(value: unknown): PlayGoalies {
    return (PLAY_GOALIES as readonly unknown[]).includes(value) ? (value as PlayGoalies) : DEFAULT_PLAY_GOALIES;
}

/** Both tags with the defaults filled in. */
export function drillTags(source: { focus?: unknown; goalies?: unknown } | null | undefined): { focus: PlayFocus; goalies: PlayGoalies } {
    return { focus: toPlayFocus(source?.focus), goalies: toPlayGoalies(source?.goalies) };
}

/** A whole number from 0 to MAX_GOALIES_ATTENDING, else null (not set). */
export function toGoaliesAttending(value: unknown): number | null {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_GOALIES_ATTENDING ? value : null;
}

export function goalieMarkerCount(playData: PlayData): number {
    return playData.players.filter((player) => player.role === "G").length;
}

/** The diagram without its role-G players. Strokes, nets and notes stay. Never mutates. */
export function withoutGoalies(playData: PlayData): PlayData {
    return { ...playData, players: playData.players.filter((player) => player.role !== "G") };
}

/**
 * Goalie markers are hidden only when the coach said no goalies are coming and
 * the drill doesn't need one. A goalie-focus drill always keeps its goalie.
 */
export function hidesGoalieMarkers(
    goaliesAttending: number | null | undefined,
    goalies: PlayGoalies | undefined,
    focus?: PlayFocus,
): boolean {
    return goaliesAttending === 0 && toPlayGoalies(goalies) === "optional" && toPlayFocus(focus) !== "goalies";
}

/** The diagram as the session views draw it. The same object unless markers are actually hidden. */
export function displayPlayData<T extends PlayData | null>(
    playData: T,
    goalies: PlayGoalies | undefined,
    goaliesAttending: number | null | undefined,
    focus?: PlayFocus,
): T {
    if (!playData || !hidesGoalieMarkers(goaliesAttending, goalies, focus) || goalieMarkerCount(playData) === 0) return playData;
    return withoutGoalies(playData) as T;
}

interface DisplayablePlay {
    play: { focus?: PlayFocus; goalies?: PlayGoalies; playData: PlayData | null };
}

/**
 * The session with every drill's diagram passed through displayPlayData.
 * Render-time only (spec R7): never stored, never exported as plan JSON.
 * Returns the session itself when nothing is hidden, so memos stay stable.
 */
export function sessionForDisplay<S extends { goaliesAttending?: number | null; plays: readonly DisplayablePlay[] }>(session: S): S {
    let changed = false;
    const plays = session.plays.map((sp) => {
        const shown = displayPlayData(sp.play.playData, sp.play.goalies, session.goaliesAttending, sp.play.focus);
        if (shown === sp.play.playData) return sp;
        changed = true;
        return { ...sp, play: { ...sp.play, playData: shown } };
    });
    return changed ? ({ ...session, plays } as S) : session;
}

/** A drill needs a goalie in net when it is tagged required or is goalie focused (the badge and the warnings). */
export function needsGoalie(drill: { focus?: unknown; goalies?: unknown }): boolean {
    const { focus, goalies } = drillTags(drill);
    return goalies === "required" || focus === "goalies";
}

/**
 * Goalies a drill needs in net: 0 unless it needs a goalie (needsGoalie);
 * then one per G marker (at least one), and one when unreadable.
 */
export function goalieDemand(drill: { focus?: PlayFocus; goalies?: PlayGoalies; playData: PlayData | null }): number {
    if (!needsGoalie(drill)) return 0;
    return drill.playData ? Math.max(1, goalieMarkerCount(drill.playData)) : 1;
}
