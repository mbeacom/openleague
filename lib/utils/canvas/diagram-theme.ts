/**
 * Every color and font the rink renderer uses (rink diagram quality spec §3).
 * The board is drawn light in both color schemes, so this is a static object:
 * it never reads prefers-color-scheme. No server or Next imports.
 */
import { BOARD_COLORS } from "./notation";
import { DIAGRAM_FONT_FAMILY } from "./diagram-fonts";

export const DIAGRAM_THEME = {
    /** Canvas outside the rink */
    surround: "#FFFFFF",
    ice: "#F4F9FC",
    /** The radial lightening toward center ice */
    iceCenter: "#FFFFFF",
    /** Inner shadow along the boards, 1.5 ft wide */
    iceEdgeShadow: "rgba(13, 71, 161, 0.08)",
    boards: BOARD_COLORS.leagueBlue,
    /** The lighter inner kick plate inside the boards line */
    kickPlate: "#B3C7E6",
    redLine: "#C8102E",
    blueLine: BOARD_COLORS.leagueBlue,
    creaseFill: "rgba(155, 198, 232, 0.6)",
    /** Ink for pucks, outlines, legend strokes and inactive station outlines */
    ink: BOARD_COLORS.ink,
    /** The accent for a drill's area outline and the active station */
    accent: BOARD_COLORS.actionBlue,
    /** Shading over ice outside a drill's area */
    areaMask: "rgba(33, 33, 33, 0.22)",
    selection: "#FFD700",
    selectionFill: "rgba(255, 215, 0, 0.3)",
    noteChip: "rgba(255, 255, 255, 0.9)",
    snapRingHalo: "#FFFFFF",
    cone: "#F57C00",
    /** The lit half of a cone */
    coneShade: "#FFB74D",
    net: BOARD_COLORS.penaltyRed,
    netMesh: "rgba(211, 47, 47, 0.35)",
    puckRim: "#616161",
    /** The white inner ring on a filled marker */
    markerRing: "#FFFFFF",
    /** A marker's soft drop shadow */
    markerShadow: "rgba(26, 36, 51, 0.2)",
    /** Marker label text on a light fill */
    labelOnLight: BOARD_COLORS.ink,
    /** Marker label text on a dark fill */
    labelOnDark: "#FFFFFF",
    /** The ring player's (opponent's) fill */
    ringFill: "#FFFFFF",
    /** Behind station-map labels */
    stationLabelBacking: "rgba(255, 255, 255, 0.85)",
    /** Labels, notes and station-map text (spec §3: Cabinet Grotesk) */
    font: DIAGRAM_FONT_FAMILY,
} as const;
