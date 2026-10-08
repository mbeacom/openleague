/**
 * Data shaping for the Rankings tier chart ("Where does every team land?"):
 * ranked teams grouped into one lane per level, the RPI cut between
 * neighbouring levels, a deterministic dodge so dots never overlap, the few
 * teams that get a direct label, and the tier key colours. Pure, so each piece
 * is tested without rendering.
 */
import type { Movement, TeamRating } from "@/lib/ratings";
import type { ColorScheme } from "./display";

/** The RPI scale every chart in Rankings shares. */
export const RPI_MAX = 20;

/** One plotted team. `logo` is accepted for a later team-logo pass and unused for now. */
export interface TierChartTeam {
    number: string;
    name: string;
    rpi: number;
    rank: number;
    level: string | null;
    startingBracket: string | null;
    movement: Movement | null;
    wins: number;
    losses: number;
    ties: number;
    games: number;
    lowConfidence: boolean;
    logo?: string;
}

export interface TierLane {
    key: string;
    /** The level's name, or null for the lane past the last level. */
    level: string | null;
    /** Index in method.levels; null for the lane past the last level. */
    levelIndex: number | null;
    /** Strongest first. */
    teams: TierChartTeam[];
    /** Lowest and highest RPI in the lane; null when the lane is empty. */
    min: number | null;
    max: number | null;
}

/** The RPI that separates two neighbouring non-empty lanes: halfway between them. */
export interface TierCut {
    rpi: number;
    above: string;
    below: string;
}

export interface TierChartData {
    lanes: TierLane[];
    cuts: TierCut[];
    /** Teams with no rank (no games, or excluded): they can't be placed on the scale. */
    unplotted: Array<{ number: string; name: string }>;
    rankedCount: number;
}

export const BELOW_LANE_KEY = "below";

export function toTierTeam(row: TeamRating, logo?: string): TierChartTeam | null {
    if (row.rank === null || row.rpi === null) return null;
    return {
        number: row.number,
        name: row.name,
        rpi: row.rpi,
        rank: row.rank,
        level: row.level,
        startingBracket: row.startingBracket,
        movement: row.movement,
        wins: row.wins,
        losses: row.losses,
        ties: row.ties,
        games: row.games,
        lowConfidence: row.lowConfidence,
        ...(logo ? { logo } : {}),
    };
}

/**
 * One lane per level in method order (empty levels keep their lane, so the
 * shape of the levels stays honest), plus a lane for ranked teams past the last
 * level when there are any. Cuts sit between consecutive non-empty lanes.
 */
export function tierChartData(
    teams: readonly TeamRating[],
    levels: ReadonlyArray<{ name: string }>,
    logos: ReadonlyMap<string, string> = new Map(),
): TierChartData {
    const plotted: TierChartTeam[] = [];
    const unplotted: Array<{ number: string; name: string }> = [];
    for (const row of teams) {
        const team = toTierTeam(row, logos.get(row.number));
        if (team) plotted.push(team);
        else unplotted.push({ number: row.number, name: row.name });
    }
    plotted.sort((a, b) => a.rank - b.rank);

    const known = new Set(levels.map((level) => level.name));
    const lanes: TierLane[] = levels.map((level, levelIndex) =>
        lane(
            `level:${levelIndex}`,
            level.name,
            levelIndex,
            plotted.filter((t) => t.level === level.name),
        ),
    );
    const below = plotted.filter((t) => t.level === null || !known.has(t.level));
    if (below.length > 0) lanes.push(lane(BELOW_LANE_KEY, null, null, below));

    const cuts: TierCut[] = [];
    const filled = lanes.filter((l) => l.teams.length > 0);
    for (let i = 0; i + 1 < filled.length; i++) {
        const upper = filled[i];
        const lower = filled[i + 1];
        cuts.push({ rpi: (upper.min! + lower.max!) / 2, above: upper.key, below: lower.key });
    }
    return { lanes, cuts, unplotted, rankedCount: plotted.length };
}

function lane(key: string, level: string | null, levelIndex: number | null, teams: TierChartTeam[]): TierLane {
    const values = teams.map((t) => t.rpi);
    return {
        key,
        level,
        levelIndex,
        teams,
        min: values.length ? Math.min(...values) : null,
        max: values.length ? Math.max(...values) : null,
    };
}

/**
 * A greedy dodge (a one-sided beeswarm): points in x order, each into the
 * lowest row where it clears every point already there by `gap`. Returns the
 * row per input point, in input order. Deterministic: ties keep input order.
 */
export function dodgeRows(xs: readonly number[], gap: number): number[] {
    const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x || a.i - b.i);
    const lastInRow: number[] = [];
    const rows = new Array<number>(xs.length);
    for (const { x, i } of order) {
        let row = 0;
        while (row < lastInRow.length && x - lastInRow[row] < gap) row++;
        lastInRow[row] = x;
        rows[i] = row;
    }
    return rows;
}

/** Rows 0, 1, 2, 3, … as offsets from the lane's centre: 0, -1, +1, -2, +2, … */
export function rowOffset(row: number): number {
    return row === 0 ? 0 : row % 2 === 1 ? -(row + 1) / 2 : row / 2;
}

/**
 * The point nearest (px, py) within `maxDistance`, or null. The chart resolves
 * every pointer through this instead of per-dot hit circles, so neighbouring
 * dots never share a tap target and each still gets a 44px-wide reach.
 * Ties keep the earlier point.
 */
export function nearestPoint<T extends { x: number; y: number }>(points: readonly T[], px: number, py: number, maxDistance: number): T | null {
    let best: T | null = null;
    let bestDistance = maxDistance;
    for (const point of points) {
        const distance = Math.hypot(point.x - px, point.y - py);
        if (distance < bestDistance || (distance === bestDistance && best === null)) {
            best = point;
            bestDistance = distance;
        }
    }
    return best;
}

/** A conservative average advance for a 12px semibold label, so labels can be fitted without measuring text. */
export const LABEL_CHAR_PX = 7;

/**
 * `text` plus `suffix`, shortened with an ellipsis so it spans at most
 * `availablePx` at LABEL_CHAR_PX a character. The suffix is kept whole; at
 * least one character of the text always remains.
 */
export function fitLabel(text: string, availablePx: number, suffix = ""): string {
    const full = `${text}${suffix}`;
    const cap = Math.floor(availablePx / LABEL_CHAR_PX);
    if (full.length <= cap) return full;
    const keep = Math.max(1, cap - suffix.length - 1);
    return `${text.slice(0, keep).trimEnd()}…${suffix}`;
}

/** The teams that get a direct label: your team, the top team, and the last ranked team. */
export function labelledTeams(data: TierChartData, myTeam: string | null): Set<string> {
    const all = data.lanes.flatMap((l) => l.teams);
    const picks = new Set<string>();
    if (myTeam && all.some((t) => t.number === myTeam)) picks.add(myTeam);
    const first = all.find((t) => t.rank === 1);
    if (first) picks.add(first.number);
    const last = all.reduce<TierChartTeam | null>((worst, t) => (!worst || t.rank > worst.rank ? t : worst), null);
    if (last) picks.add(last.number);
    return picks;
}

/**
 * The tier key colours: one League Blue hue (OKLCH h 258, the same hue as the
 * band washes), stepped evenly in OKLCH lightness from the top level to the
 * bottom, with the faintest step still clearing 2:1 on the paper surface.
 * Light runs dark (top level) to light; dark mode flips the anchor so the top
 * level is the brightest against Night Rink. Validated with the dataviz palette
 * validator (--ordinal) at 7 levels in both schemes.
 *
 * Neighbouring levels are at least 0.06 apart only up to TIER_DISTINCT_LEVELS
 * levels: the ramp's range is fixed, so past that the step shrinks to
 * range / (count - 1) (about 0.02 at 20 levels). Colour is never the only cue:
 * every lane is named and in rank order, so a long ladder stays readable when
 * its neighbouring swatches are close.
 */
export const TIER_RAMP: Record<ColorScheme, { top: number; bottom: number; chroma: number }> = {
    light: { top: 0.39, bottom: 0.78, chroma: 0.15 },
    dark: { top: 0.88, bottom: 0.48, chroma: 0.13 },
};
const TIER_HUE = 258;

/** The most levels whose neighbouring tier colours stay at least 0.06 apart in lightness. */
export const TIER_DISTINCT_LEVELS = 7;

export function tierLightness(scheme: ColorScheme, index: number, count: number): number {
    const { top, bottom } = TIER_RAMP[scheme];
    const t = count <= 1 ? 0 : Math.min(Math.max(index / (count - 1), 0), 1);
    return top + (bottom - top) * t;
}

/** The tier colour for level `index` of `count`, as sRGB hex. */
export function tierColor(scheme: ColorScheme, index: number, count: number): string {
    return oklchToHex(tierLightness(scheme, index, count), TIER_RAMP[scheme].chroma, TIER_HUE);
}

/** OKLCH to sRGB hex, lowering chroma until the colour is in gamut. */
export function oklchToHex(lightness: number, chroma: number, hue: number): string {
    const h = (hue * Math.PI) / 180;
    for (let c = chroma; c >= 0; c -= 0.002) {
        const a = c * Math.cos(h);
        const b = c * Math.sin(h);
        const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
        const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
        const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
        const rgb = [
            4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
        ];
        if (rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4)) {
            return `#${rgb
                .map((v) => {
                    const linear = Math.min(1, Math.max(0, v));
                    const gamma = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
                    return Math.round(gamma * 255)
                        .toString(16)
                        .padStart(2, "0");
                })
                .join("")}`;
        }
    }
    return "#000000";
}

/**
 * The emphasis pair for dots: every team in a recessive slate, your team in
 * Action Blue (the theme's secondary token in each scheme). Validated for CVD
 * and normal-vision separation and 3:1 on the paper surface in both schemes.
 */
export const DOT_COLORS: Record<ColorScheme, { team: string }> = {
    light: { team: "#5A6573" },
    dark: { team: "#B8C4D1" },
};

/** A sentence that says what the chart shows, for the SVG's <desc>. */
export function describeTierChart(data: TierChartData, myTeam: string | null): string {
    const filled = data.lanes.filter((l) => l.teams.length > 0);
    if (filled.length === 0) return "No ranked teams yet.";
    const lanes = filled
        .map(
            (l) =>
                `${l.level ?? "Below the last level"}: ${l.teams.length} ${l.teams.length === 1 ? "team" : "teams"}, RPI ${l.min!.toFixed(1)} to ${l.max!.toFixed(1)}`,
        )
        .join("; ");
    const laneName = (key: string) => {
        const found = data.lanes.find((l) => l.key === key);
        return found?.level ?? "Below the last level";
    };
    const cuts = data.cuts.length
        ? ` Cuts: ${data.cuts.map((cut) => `${laneName(cut.above)} and ${laneName(cut.below)} at RPI ${cut.rpi.toFixed(1)}`).join("; ")}.`
        : "";
    const mine = myTeam ? filled.flatMap((l) => l.teams).find((t) => t.number === myTeam) : undefined;
    const you = mine
        ? ` Your team, ${mine.name}, is rank ${mine.rank} among ${data.rankedCount} with RPI ${mine.rpi.toFixed(1)}, in ${mine.level ?? "no level"}.`
        : "";
    return `${data.rankedCount} ranked teams on the 0–20 RPI scale. ${lanes}.${cuts}${you}`;
}
