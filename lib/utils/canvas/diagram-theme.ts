/**
 * Every color and font the rink renderer uses (rink diagram quality spec §3).
 * The board is drawn light in both color schemes, so this is a static object:
 * it never reads prefers-color-scheme. No server or Next imports.
 */
import { BOARD_COLORS } from "./notation";

export const DIAGRAM_THEME = {
    /** Canvas outside the rink */
    surround: "#FFFFFF",
    ice: "#E8F4F8",
    boards: "#000000",
    redLine: "#C8102E",
    blueLine: "#003087",
    creaseFill: "rgba(200, 16, 46, 0.1)",
    /** Ink for pucks, outlines and the default text color */
    ink: BOARD_COLORS.ink,
    /** Shading over ice outside a drill's area */
    areaMask: "rgba(33, 33, 33, 0.35)",
    selection: "#FFD700",
    selectionFill: "rgba(255, 215, 0, 0.3)",
    noteChip: "rgba(255, 255, 255, 0.8)",
    snapRingHalo: "#FFFFFF",
    cone: "#F57C00",
    net: BOARD_COLORS.penaltyRed,
    /** Marker label text on a light fill */
    labelOnLight: BOARD_COLORS.ink,
    /** Marker label text on a dark fill */
    labelOnDark: "#FFFFFF",
    /** The ring player's (opponent's) fill */
    ringFill: "#FFFFFF",
    /** Behind station-map labels */
    stationLabelBacking: "rgba(255, 255, 255, 0.85)",
    labelFont: `"Source Sans 3", system-ui, sans-serif`,
    noteFont: "Arial",
    /** Station-map labels and messages */
    uiFont: "sans-serif",
} as const;
