/**
 * Display vocabulary for practice-board notation: labels and default colors.
 * Used by the toolbar, inspector, legend, and glyph renderers.
 */
import type { EquipmentKind, IceArea, IceAreaPreset, PlayerRole, StrokeAction, StrokeEnd } from "@/types/practice-planner";

export const BOARD_COLORS = {
    leagueBlue: "#0D47A1",
    actionBlue: "#1976D2",
    penaltyRed: "#D32F2F",
    scoreboardGreen: "#2E7D32",
    ink: "#212121",
} as const;

/**
 * Line-editing handle and snap-ring colours (line editing R6): the theme's
 * light-scheme Action Blue and League Blue, since the ice (ICE_COLOR) is
 * drawn light in both schemes. On the ice they are about 4.1:1 and 7.7:1.
 */
export const LINE_EDIT_COLORS = {
    handleFill: "#FFFFFF",
    handleStroke: BOARD_COLORS.actionBlue,
    snapRing: BOARD_COLORS.leagueBlue,
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

export const ICE_AREA_LABELS: Record<IceAreaPreset | "custom", string> = {
    full: "Full ice",
    "half-left": "Half ice (left)",
    "half-right": "Half ice (right)",
    "zone-left": "Left end zone",
    "zone-neutral": "Neutral zone",
    "zone-right": "Right end zone",
    "zone-left-top": "Left end – top",
    "zone-left-bottom": "Left end – bottom",
    "zone-neutral-top": "Neutral – top",
    "zone-neutral-bottom": "Neutral – bottom",
    "zone-right-top": "Right end – top",
    "zone-right-bottom": "Right end – bottom",
    custom: "Custom area",
};

/** The area picker's groups, in ICE_AREA_PRESETS order; every preset is in exactly one. */
export const ICE_AREA_GROUPS: ReadonlyArray<{ label: string; presets: readonly IceAreaPreset[] }> = [
    { label: "Full and halves", presets: ["full", "half-left", "half-right"] },
    { label: "Zones", presets: ["zone-left", "zone-neutral", "zone-right"] },
    {
        label: "Quarters",
        presets: ["zone-left-top", "zone-left-bottom", "zone-neutral-top", "zone-neutral-bottom", "zone-right-top", "zone-right-bottom"],
    },
];

/** Display label for a drill's ice area; a missing area is full ice. */
export function iceAreaLabel(area?: IceArea): string {
    return ICE_AREA_LABELS[area?.kind ?? "full"];
}
