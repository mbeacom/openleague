/**
 * Display vocabulary for practice-board notation: labels and default colors.
 * Used by the toolbar, inspector, legend, and glyph renderers.
 */
import type { EquipmentKind, PlayerRole, StrokeAction, StrokeEnd } from "@/types/practice-planner";

export const BOARD_COLORS = {
    leagueBlue: "#0D47A1",
    actionBlue: "#1976D2",
    penaltyRed: "#D32F2F",
    scoreboardGreen: "#2E7D32",
    ink: "#212121",
} as const;

export const ROLE_LABELS: Record<PlayerRole, string> = {
    X: "Skater",
    O: "Opponent",
    F: "Forward",
    D: "Defense",
    G: "Goalie",
    C: "Coach",
};

export const ROLE_DEFAULT_COLORS: Record<PlayerRole, string> = {
    X: BOARD_COLORS.actionBlue,
    O: BOARD_COLORS.penaltyRed,
    F: BOARD_COLORS.actionBlue,
    D: BOARD_COLORS.leagueBlue,
    G: BOARD_COLORS.ink,
    C: BOARD_COLORS.scoreboardGreen,
};

export const ACTION_LABELS: Record<StrokeAction, string> = {
    skate: "Skate",
    backskate: "Backward skate",
    carry: "Puck carry",
    pass: "Pass",
    shot: "Shot",
    lateral: "Lateral / crossovers",
    line: "Line",
};

export const END_LABELS: Record<StrokeEnd, string> = {
    arrow: "Arrow",
    stop: "Stop",
    none: "No end",
};

export const EQUIPMENT_LABELS: Record<EquipmentKind, string> = {
    puck: "Puck",
    puckPile: "Puck pile",
    cone: "Cone",
    net: "Net",
    tire: "Tire",
    pylon: "Pylon",
};

export const DEFAULT_END_FOR_ACTION: Record<StrokeAction, StrokeEnd> = {
    skate: "arrow",
    backskate: "arrow",
    carry: "arrow",
    pass: "arrow",
    shot: "arrow",
    lateral: "arrow",
    line: "none",
};
