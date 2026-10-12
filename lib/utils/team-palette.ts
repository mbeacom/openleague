/**
 * Team colors in the practice planner: the palette the session header, the
 * bench sheet and its document exports paint with, and the opt-in "Team
 * colors" remap of diagram markers. Pure and portable (no React, server or
 * DOM imports), so both planners and the exports share it.
 *
 * Every team color is data, not a token, so each use is measured: text on
 * the band clears 4.5:1, and graphics on white paper or ice clear 3:1. A
 * header color that falls short is darkened a little; one that still falls
 * short gives way to League Blue and Action Blue. A marker color that falls
 * short keeps its default color instead.
 */
import { getContrastRatio } from "@mui/material/styles";
import { contrastInk } from "@/lib/utils/contrast-color";
import { BOARD_COLORS, ROLE_DEFAULT_COLORS } from "@/lib/utils/canvas/notation";
import { isDrillRow } from "@/lib/utils/session-rows";
import type { BlockKind, PlayData, PlayerRole, TeamMark } from "@/types/practice-planner";

/** WCAG SC 1.4.3, normal text. */
export const TEXT_CONTRAST = 4.5;
/** WCAG SC 1.4.11, graphics and UI parts. */
export const GRAPHIC_CONTRAST = 3;

const WHITE = "#FFFFFF";
const BLACK = "#000000";
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
/** A header color may be darkened to 60% of its channels and no further, so it still reads as the team's. */
const DARKEN_FLOOR = 0.6;
const DARKEN_STEP = 0.05;
/** How much of the band the light table-header fill carries. */
const TINT_AMOUNT = 0.1;
/** A team marker this close (RGB distance) to the opponent's red would read as an opponent: it keeps its default. */
const OPPONENT_MIN_DISTANCE = 80;

export interface TeamPalette {
    /** True when the band or accent came from the team's colors. */
    fromTeam: boolean;
    /** Header band, rules and solid fills: at least 3:1 on white. */
    band: string;
    /** Text on the band: at least 4.5:1. */
    onBand: string;
    /** Secondary rules and borders: at least 3:1 on white. */
    accent: string;
    /** Headings and table-header text on white or on `tint`: at least 4.5:1 on both. */
    ink: string;
    /** A light fill for table headers. */
    tint: string;
    /** The session header's top stripe. */
    gradient: string;
}

/** The Digital Playbook palette: what the planner painted before team colors. */
export const DEFAULT_TEAM_PALETTE: TeamPalette = {
    fromTeam: false,
    band: BOARD_COLORS.leagueBlue,
    onBand: WHITE,
    accent: BOARD_COLORS.actionBlue,
    ink: BOARD_COLORS.leagueBlue,
    tint: "#E3F2FD",
    gradient: "linear-gradient(90deg, #0D47A1 0%, #1976D2 50%, #42A5F5 100%)",
};

type Rgb = [number, number, number];

/** `#RGB` or `#RRGGBB` as uppercase `#RRGGBB`; anything else is null. */
function normalizeHex(value: string | null | undefined): string | null {
    if (typeof value !== "string" || !HEX.test(value.trim())) return null;
    const hex = value.trim().slice(1);
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    return `#${full.toUpperCase()}`;
}

function toRgb(hex: string): Rgb {
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

function toHex(rgb: Rgb): string {
    return `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function darken(hex: string, factor: number): string {
    return toHex(toRgb(hex).map((c) => c * factor) as Rgb);
}

/** `amount` of `hex` over white. */
function overWhite(hex: string, amount: number): string {
    return toHex(toRgb(hex).map((c) => 255 - (255 - c) * amount) as Rgb);
}

function distance(a: string, b: string): number {
    const [x, y] = [toRgb(a), toRgb(b)];
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** The color itself, else the lightest darkening (down to `floor`) that passes; null when none does. */
function firstPassing(hex: string, passes: (color: string) => boolean, floor: number): string | null {
    for (let factor = 1; factor >= floor - 1e-9; factor -= DARKEN_STEP) {
        const color = darken(hex, factor);
        if (passes(color)) return color;
    }
    return null;
}

const readsOnWhite = (color: string) => getContrastRatio(color, WHITE) >= GRAPHIC_CONTRAST;

/** A band: a graphic on white that also carries black or white text at 4.5:1. */
function bandFrom(hex: string | null): string | null {
    if (!hex) return null;
    return firstPassing(
        hex,
        (color) => readsOnWhite(color) && getContrastRatio(color, contrastInk(color) ?? WHITE) >= TEXT_CONTRAST,
        DARKEN_FLOOR,
    );
}

/** The palette for a team's mark; League Blue and Action Blue stand in for what it lacks. */
export function teamPalette(mark: Pick<TeamMark, "color" | "secondaryColor"> | null | undefined): TeamPalette {
    const primary = normalizeHex(mark?.color);
    const secondary = normalizeHex(mark?.secondaryColor);
    const band = bandFrom(primary) ?? (primary ? null : bandFrom(secondary));
    if (!band) return DEFAULT_TEAM_PALETTE;
    const accent = (primary && secondary ? firstPassing(secondary, readsOnWhite, DARKEN_FLOOR) : null) ?? band;
    const tint = overWhite(band, TINT_AMOUNT);
    // Darken as far as it takes: black always passes.
    const ink = firstPassing(band, (color) => getContrastRatio(color, tint) >= TEXT_CONTRAST && getContrastRatio(color, WHITE) >= TEXT_CONTRAST, 0) ?? BLACK;
    return {
        fromTeam: true,
        band,
        onBand: contrastInk(band) ?? WHITE,
        accent,
        ink,
        tint,
        gradient: `linear-gradient(90deg, ${band} 0%, ${accent} 100%)`,
    };
}

/** Marker colors by role. Roles not listed keep their default color. */
export type RoleColors = Partial<Record<PlayerRole, string>>;

/** A team color a marker can wear: on the ice at 3:1, and not mistakable for the opponent's red. */
function markerColor(value: string | null | undefined): string | null {
    const hex = normalizeHex(value);
    if (!hex || !readsOnWhite(hex)) return null;
    return distance(hex, ROLE_DEFAULT_COLORS.O) < OPPONENT_MIN_DISTANCE ? null : hex;
}

/**
 * The "Team colors" mapping: skaters and forwards wear the primary, defense
 * the secondary. The opponent, goalie and coach never change.
 */
export function teamRoleColors(mark: Pick<TeamMark, "color" | "secondaryColor"> | null | undefined): RoleColors {
    const primary = markerColor(mark?.color);
    const secondary = markerColor(mark?.secondaryColor);
    return {
        ...(primary ? { X: primary, F: primary } : {}),
        ...(secondary ? { D: secondary } : {}),
    };
}

/**
 * The diagram with team colors. Render-time only, like sessionForDisplay:
 * only markers still holding their role's default color change, so a color
 * the coach picked stays. Returns the same object when nothing changes.
 */
export function teamColorPlayData<T extends PlayData | null>(playData: T, colors: RoleColors): T {
    if (!playData) return playData;
    let changed = false;
    const players = playData.players.map((player) => {
        const color = colors[player.role];
        if (!color || player.color.toUpperCase() !== ROLE_DEFAULT_COLORS[player.role].toUpperCase()) return player;
        changed = true;
        return { ...player, color };
    });
    return changed ? ({ ...playData, players } as T) : playData;
}

interface ColorablePlay {
    kind?: "drill";
    play: { playData: PlayData | null };
}

/** The session with every drill's diagram passed through teamColorPlayData; block rows pass through. */
export function sessionWithTeamColors<S extends { plays: ReadonlyArray<ColorablePlay | { kind: BlockKind }> }>(session: S, colors: RoleColors): S {
    if (Object.keys(colors).length === 0) return session;
    let changed = false;
    const plays = session.plays.map((sp) => {
        if (!isDrillRow(sp)) return sp;
        const shown = teamColorPlayData(sp.play.playData, colors);
        if (shown === sp.play.playData) return sp;
        changed = true;
        return { ...sp, play: { ...sp.play, playData: shown } };
    });
    return changed ? ({ ...session, plays } as S) : session;
}
