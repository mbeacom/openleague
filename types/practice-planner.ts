/**
 * Type definitions for the Hockey Practice Planner feature
 *
 * This file contains all TypeScript interfaces and types for:
 * - Play data structures (players, drawings, annotations)
 * - Practice session data
 * - Drawing tools and UI state
 * - Validation schemas
 */

// ============================================================================
// Core Play Data Types
// ============================================================================

/**
 * Position on the rink board canvas
 */
export interface Position {
    x: number;
    y: number;
}

/** Current stored play-data schema version. v1 = object without a `version` key. */
export const PLAY_DATA_VERSION = 2 as const;

export const PLAYER_ROLES = ["X", "O", "F", "D", "G", "C"] as const;
/** X/O generic skaters (us/them), F forward, D defense, G goalie, C coach */
export type PlayerRole = (typeof PLAYER_ROLES)[number];

export const STROKE_ACTIONS = ["skate", "backskate", "carry", "pass", "shot", "lateral", "line"] as const;
export type StrokeAction = (typeof STROKE_ACTIONS)[number];

/** straight = polyline through stored points, unsmoothed; freehand = smoothed */
export const STROKE_PATHS = ["straight", "freehand"] as const;
export type StrokePath = (typeof STROKE_PATHS)[number];

export const STROKE_ENDS = ["arrow", "stop", "none"] as const;
export type StrokeEnd = (typeof STROKE_ENDS)[number];

export const EQUIPMENT_KINDS = ["puck", "puckPile", "cone", "net", "tire", "pylon"] as const;
export type EquipmentKind = (typeof EQUIPMENT_KINDS)[number];

export interface PlayerIcon {
    id: string;
    position: Position;
    role: PlayerRole;
    /** Short text shown in the marker; "" falls back to the role letter */
    label: string;
    color: string;
}

export interface DrawingElement {
    id: string;
    action: StrokeAction;
    path: StrokePath;
    end: StrokeEnd;
    points: Position[];
    color: string;
    strokeWidth: number;
}

export type StrokeOptions = Pick<DrawingElement, "action" | "path" | "end">;

export interface EquipmentItem {
    id: string;
    kind: EquipmentKind;
    position: Position;
    /** Degrees in [0, 360); only meaningful for nets */
    rotation: number;
}

/**
 * Text annotation placed on the rink board
 * Requirements: 1.4
 */
export interface TextAnnotation {
    id: string;
    text: string;
    position: Position;
    fontSize: number;
    color: string;
}

export interface PlayData {
    version: typeof PLAY_DATA_VERSION;
    players: PlayerIcon[];
    drawings: DrawingElement[];
    equipment: EquipmentItem[];
    annotations: TextAnnotation[];
}

// ============================================================================
// Drawing Tool Types
// ============================================================================

/**
 * Available drawing tools in the practice planner
 * Requirements: 5.1, 5.2, 5.4
 */
export type DrawingTool = "select" | "player" | "stroke" | "equipment" | "text" | "eraser";

// ============================================================================
// Practice Session Types
// ============================================================================

/**
 * Play instance within a practice session
 * Requirements: 2.2, 2.4
 */
export interface PlayInSession {
    id: string;
    playId: string;
    sequence: number;
    duration: number; // minutes
    instructions: string;
    playData: PlayData;
    thumbnail?: string; // base64 PNG thumbnail from library play
}

/**
 * Complete practice session data
 * Requirements: 2.1, 2.2, 2.3, 2.5
 */
export interface PracticeSessionData {
    id?: string;
    title: string;
    date: Date;
    duration: number; // minutes
    plays: PlayInSession[];
    isShared: boolean;
}

/**
 * Saved play in the library
 * Requirements: 4.1, 4.2
 */
export interface SavedPlay {
    id: string;
    name: string;
    description: string;
    thumbnail: string; // base64 PNG
    playData: PlayData;
    isTemplate: boolean; // Whether this play is saved to the library
    createdAt: Date;
    updatedAt: Date;
}

// ============================================================================
// Validation Schema Types
// ============================================================================

/**
 * Validation result for play data
 */
export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
}

/**
 * Validation error details
 */
export interface ValidationError {
    field: string;
    message: string;
    code: string;
}

/**
 * Validation constraints for play data
 * Requirements: 1.5
 */
export const VALIDATION_CONSTRAINTS = {
    MAX_ELEMENTS_PER_PLAY: 100,
    MAX_ANNOTATION_LENGTH: 500,
    MIN_DURATION: 1,
    MAX_DURATION: 300,
    MAX_PLAYERS: 50,
    MAX_DRAWINGS: 100,
    MAX_ANNOTATIONS: 20,
    MAX_EQUIPMENT: 50,
    MAX_PLAYER_LABEL_LENGTH: 50,
    MAX_STROKE_POINTS: 1000,
} as const;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates practice session duration
 * Requirements: 2.3
 */
export function validateSessionDuration(duration: number): ValidationResult {
    const errors: ValidationError[] = [];

    if (typeof duration !== "number" || isNaN(duration)) {
        errors.push({ field: "duration", message: "Duration must be a number", code: "INVALID_TYPE" });
    } else if (duration < VALIDATION_CONSTRAINTS.MIN_DURATION) {
        errors.push({
            field: "duration",
            message: `Duration must be at least ${VALIDATION_CONSTRAINTS.MIN_DURATION} minute${VALIDATION_CONSTRAINTS.MIN_DURATION === 1 ? '' : 's'}`,
            code: "DURATION_TOO_SHORT",
        });
    } else if (duration > VALIDATION_CONSTRAINTS.MAX_DURATION) {
        errors.push({
            field: "duration",
            message: `Duration must not exceed ${VALIDATION_CONSTRAINTS.MAX_DURATION} minutes`,
            code: "DURATION_TOO_LONG",
        });
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Validates that total play durations don't exceed session duration
 * Requirements: 2.3
 */
export function validatePlayDurations(
    plays: PlayInSession[],
    sessionDuration: number
): ValidationResult {
    const errors: ValidationError[] = [];

    const totalPlayDuration = plays.reduce((sum, play) => sum + play.duration, 0);

    if (totalPlayDuration > sessionDuration) {
        errors.push({
            field: "plays",
            message: `Total play duration (${totalPlayDuration} min) exceeds session duration (${sessionDuration} min)`,
            code: "PLAY_DURATION_EXCEEDS_SESSION",
        });
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}
