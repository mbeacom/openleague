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

/**
 * Player icon placed on the rink board
 * Requirements: 1.2
 */
export interface PlayerIcon {
    id: string;
    position: Position;
    label: string;
    color: string;
}

/**
 * Drawing element types supported on the rink board
 * Requirements: 5.1, 5.2
 */
export type DrawingElementType = "line" | "curve" | "arrow";

/**
 * Drawing element (line, curve, or arrow) on the rink board
 * Requirements: 1.3, 5.1, 5.2
 */
export interface DrawingElement {
    id: string;
    type: DrawingElementType;
    points: Position[];
    color: string;
    strokeWidth: number;
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

/**
 * Complete play data structure containing all elements on the rink board
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */
export interface PlayData {
    players: PlayerIcon[];
    drawings: DrawingElement[];
    annotations: TextAnnotation[];
}

// ============================================================================
// Drawing Tool Types
// ============================================================================

/**
 * Available drawing tools in the practice planner
 * Requirements: 5.1, 5.2, 5.4
 */
export type DrawingTool =
    | "select"
    | "player"
    | "line"
    | "curve"
    | "arrow"
    | "text"
    | "eraser";

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
    createdAt: Date;
    updatedAt: Date;
}

// ============================================================================
// JSON Storage Schema Types
// ============================================================================

/**
 * Rink dimensions for the play data
 */
export interface RinkDimensions {
    width: number;
    height: number;
}

/**
 * Complete play data structure as stored in JSON
 * This matches the database JSON field structure
 * Requirements: 5.1, 5.2
 */
export interface PlayDataJSON {
    version: string;
    rinkDimensions: RinkDimensions;
    players: PlayerIcon[];
    drawings: DrawingElement[];
    annotations: TextAnnotation[];
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
} as const;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates a Position object
 */
export function isValidPosition(pos: unknown): pos is Position {
    return (
        typeof pos === "object" &&
        pos !== null &&
        "x" in pos &&
        "y" in pos &&
        typeof (pos as Position).x === "number" &&
        typeof (pos as Position).y === "number" &&
        !isNaN((pos as Position).x) &&
        !isNaN((pos as Position).y)
    );
}

/**
 * Validates a PlayerIcon object
 * Requirements: 1.2
 */
export function isValidPlayerIcon(player: unknown): player is PlayerIcon {
    if (typeof player !== "object" || player === null) return false;

    const p = player as PlayerIcon;
    return (
        typeof p.id === "string" &&
        p.id.length > 0 &&
        isValidPosition(p.position) &&
        typeof p.label === "string" &&
        p.label.trim().length > 0 &&
        typeof p.color === "string" &&
        /^#[0-9A-Fa-f]{6}$/.test(p.color)
    );
}

/**
 * Validates a DrawingElement object
 * Requirements: 1.3, 5.1, 5.2
 */
export function isValidDrawingElement(drawing: unknown): drawing is DrawingElement {
    if (typeof drawing !== "object" || drawing === null) return false;

    const d = drawing as DrawingElement;
    return (
        typeof d.id === "string" &&
        d.id.length > 0 &&
        (d.type === "line" || d.type === "curve" || d.type === "arrow") &&
        Array.isArray(d.points) &&
        d.points.length >= 2 &&
        d.points.every(isValidPosition) &&
        typeof d.color === "string" &&
        /^#[0-9A-Fa-f]{6}$/.test(d.color) &&
        typeof d.strokeWidth === "number" &&
        d.strokeWidth > 0
    );
}

/**
 * Validates a TextAnnotation object
 * Requirements: 1.4
 */
export function isValidTextAnnotation(annotation: unknown): annotation is TextAnnotation {
    if (typeof annotation !== "object" || annotation === null) return false;

    const a = annotation as TextAnnotation;
    return (
        typeof a.id === "string" &&
        a.id.length > 0 &&
        typeof a.text === "string" &&
        a.text.trim().length > 0 &&
        a.text.length <= VALIDATION_CONSTRAINTS.MAX_ANNOTATION_LENGTH &&
        isValidPosition(a.position) &&
        typeof a.fontSize === "number" &&
        a.fontSize > 0 &&
        typeof a.color === "string" &&
        /^#[0-9A-Fa-f]{6}$/.test(a.color)
    );
}

/**
 * Validates complete PlayData structure
 * Requirements: 1.5, 5.1, 5.2
 */
export function validatePlayData(data: unknown): ValidationResult {
    const errors: ValidationError[] = [];

    if (typeof data !== "object" || data === null) {
        return {
            valid: false,
            errors: [{ field: "playData", message: "Play data must be an object", code: "INVALID_TYPE" }],
        };
    }

    const playData = data as PlayData;

    // Validate players array
    if (!Array.isArray(playData.players)) {
        errors.push({ field: "players", message: "Players must be an array", code: "INVALID_TYPE" });
    } else {
        if (playData.players.length > VALIDATION_CONSTRAINTS.MAX_PLAYERS) {
            errors.push({
                field: "players",
                message: `Maximum ${VALIDATION_CONSTRAINTS.MAX_PLAYERS} players allowed`,
                code: "MAX_PLAYERS_EXCEEDED",
            });
        }
        playData.players.forEach((player, index) => {
            if (!isValidPlayerIcon(player)) {
                errors.push({
                    field: `players[${index}]`,
                    message: "Invalid player icon data",
                    code: "INVALID_PLAYER",
                });
            }
        });
    }

    // Validate drawings array
    if (!Array.isArray(playData.drawings)) {
        errors.push({ field: "drawings", message: "Drawings must be an array", code: "INVALID_TYPE" });
    } else {
        if (playData.drawings.length > VALIDATION_CONSTRAINTS.MAX_DRAWINGS) {
            errors.push({
                field: "drawings",
                message: `Maximum ${VALIDATION_CONSTRAINTS.MAX_DRAWINGS} drawings allowed`,
                code: "MAX_DRAWINGS_EXCEEDED",
            });
        }
        playData.drawings.forEach((drawing, index) => {
            if (!isValidDrawingElement(drawing)) {
                errors.push({
                    field: `drawings[${index}]`,
                    message: "Invalid drawing element data",
                    code: "INVALID_DRAWING",
                });
            }
        });
    }

    // Validate annotations array
    if (!Array.isArray(playData.annotations)) {
        errors.push({ field: "annotations", message: "Annotations must be an array", code: "INVALID_TYPE" });
    } else {
        if (playData.annotations.length > VALIDATION_CONSTRAINTS.MAX_ANNOTATIONS) {
            errors.push({
                field: "annotations",
                message: `Maximum ${VALIDATION_CONSTRAINTS.MAX_ANNOTATIONS} annotations allowed`,
                code: "MAX_ANNOTATIONS_EXCEEDED",
            });
        }
        playData.annotations.forEach((annotation, index) => {
            if (!isValidTextAnnotation(annotation)) {
                errors.push({
                    field: `annotations[${index}]`,
                    message: "Invalid text annotation data",
                    code: "INVALID_ANNOTATION",
                });
            }
        });
    }

    // Check total element count
    const totalElements =
        (playData.players?.length || 0) +
        (playData.drawings?.length || 0) +
        (playData.annotations?.length || 0);

    if (totalElements > VALIDATION_CONSTRAINTS.MAX_ELEMENTS_PER_PLAY) {
        errors.push({
            field: "playData",
            message: `Maximum ${VALIDATION_CONSTRAINTS.MAX_ELEMENTS_PER_PLAY} total elements allowed per play`,
            code: "MAX_ELEMENTS_EXCEEDED",
        });
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Validates PlayDataJSON structure (database format)
 * Requirements: 5.1, 5.2
 */
export function validatePlayDataJSON(data: unknown): ValidationResult {
    const errors: ValidationError[] = [];

    if (typeof data !== "object" || data === null) {
        return {
            valid: false,
            errors: [{ field: "playDataJSON", message: "Play data JSON must be an object", code: "INVALID_TYPE" }],
        };
    }

    const json = data as PlayDataJSON;

    // Validate version
    if (typeof json.version !== "string" || json.version.length === 0) {
        errors.push({ field: "version", message: "Version must be a non-empty string", code: "INVALID_VERSION" });
    }

    // Validate rink dimensions
    if (typeof json.rinkDimensions !== "object" || json.rinkDimensions === null) {
        errors.push({ field: "rinkDimensions", message: "Rink dimensions must be an object", code: "INVALID_TYPE" });
    } else {
        if (typeof json.rinkDimensions.width !== "number" || json.rinkDimensions.width <= 0) {
            errors.push({ field: "rinkDimensions.width", message: "Width must be a positive number", code: "INVALID_DIMENSION" });
        }
        if (typeof json.rinkDimensions.height !== "number" || json.rinkDimensions.height <= 0) {
            errors.push({ field: "rinkDimensions.height", message: "Height must be a positive number", code: "INVALID_DIMENSION" });
        }
    }

    // Validate play data
    const playDataResult = validatePlayData({
        players: json.players,
        drawings: json.drawings,
        annotations: json.annotations,
    });

    errors.push(...playDataResult.errors);

    return {
        valid: errors.length === 0,
        errors,
    };
}

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

/**
 * Validates practice session data
 * Requirements: 2.1, 2.3
 */
export function validatePracticeSessionData(data: unknown): ValidationResult {
    const errors: ValidationError[] = [];

    if (typeof data !== "object" || data === null) {
        return {
            valid: false,
            errors: [{ field: "sessionData", message: "Session data must be an object", code: "INVALID_TYPE" }],
        };
    }

    const session = data as PracticeSessionData;

    // Validate title
    if (typeof session.title !== "string" || session.title.trim().length === 0) {
        errors.push({ field: "title", message: "Title must be a non-empty string", code: "INVALID_TITLE" });
    }

    // Validate date
    if (!(session.date instanceof Date) || isNaN(session.date.getTime())) {
        errors.push({ field: "date", message: "Date must be a valid Date object", code: "INVALID_DATE" });
    }

    // Validate duration
    const durationResult = validateSessionDuration(session.duration);
    errors.push(...durationResult.errors);

    // Validate plays array
    if (!Array.isArray(session.plays)) {
        errors.push({ field: "plays", message: "Plays must be an array", code: "INVALID_TYPE" });
    } else {
        // Validate play durations
        const playDurationsResult = validatePlayDurations(session.plays, session.duration);
        errors.push(...playDurationsResult.errors);

        // Validate each play
        session.plays.forEach((play, index) => {
            if (typeof play.duration !== "number" || play.duration < VALIDATION_CONSTRAINTS.MIN_DURATION) {
                errors.push({
                    field: `plays[${index}].duration`,
                    message: `Play duration must be at least ${VALIDATION_CONSTRAINTS.MIN_DURATION} minute${VALIDATION_CONSTRAINTS.MIN_DURATION === 1 ? '' : 's'}`,
                    code: "INVALID_PLAY_DURATION",
                });
            }

            const playDataResult = validatePlayData(play.playData);
            playDataResult.errors.forEach((error) => {
                errors.push({
                    ...error,
                    field: `plays[${index}].${error.field}`,
                });
            });
        });
    }

    // Validate isShared
    if (typeof session.isShared !== "boolean") {
        errors.push({ field: "isShared", message: "isShared must be a boolean", code: "INVALID_TYPE" });
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}
