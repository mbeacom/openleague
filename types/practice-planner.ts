/**
 * Type definitions for the Hockey Practice Planner feature
 *
 * This file contains all TypeScript interfaces and types for:
 * - Play data structures (players, drawings, annotations)
 * - Practice session data
 * - Drawing tools and UI state
 * - Validation schemas
 */

import type { SegmentKind } from "@/types/segments";
import type { AgeGroup } from "@/lib/utils/age-groups";

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

/**
 * straight = polyline through stored points, unsmoothed; freehand = smoothed;
 * curve = a smooth curve through stored points (a line bent by editing; line
 * editing R1). Every value a stored line may have.
 */
export const STROKE_PATHS = ["straight", "freehand", "curve"] as const;
export type StrokePath = (typeof STROKE_PATHS)[number];

/** The paths the drawing toolbar offers: a curve comes only from editing a line. */
export const DRAWN_STROKE_PATHS = ["straight", "freehand"] as const satisfies readonly StrokePath[];
export type DrawnStrokePath = (typeof DRAWN_STROKE_PATHS)[number];

export const STROKE_ENDS = ["arrow", "stop", "none"] as const;
export type StrokeEnd = (typeof STROKE_ENDS)[number];

export const EQUIPMENT_KINDS = ["puck", "puckPile", "cone", "net", "tire", "pylon"] as const;
export type EquipmentKind = (typeof EQUIPMENT_KINDS)[number];

// ============================================================================
// Drill tags and goalie count (goaltender-aware drills)
// ============================================================================

export const PLAY_FOCUS = ["team", "skaters", "goalies"] as const;
/** What a drill trains: team play, skater skills, or goaltending. */
export type PlayFocus = (typeof PLAY_FOCUS)[number];

export const PLAY_GOALIES = ["none", "optional", "required"] as const;
/** Whether a drill needs a goalie in net. */
export type PlayGoalies = (typeof PLAY_GOALIES)[number];

/** What an untagged drill (every drill saved before tags existed) reads as. */
export const DEFAULT_PLAY_FOCUS: PlayFocus = "team";
export const DEFAULT_PLAY_GOALIES: PlayGoalies = "optional";

/** A session's goalie count is a whole number from 0 to this, or null (not set). */
export const MAX_GOALIES_ATTENDING = 10;

// ============================================================================
// Session rows: drills and blocks (practice timing)
// ============================================================================

export const SESSION_ROW_KINDS = ["drill", "warmup", "break", "transition", "cooldown"] as const;
/** What a row on the practice timeline is: a drill, or a block of non-drill time (spec R1). */
export type SessionRowKind = (typeof SESSION_ROW_KINDS)[number];

export const BLOCK_KINDS = ["warmup", "break", "transition", "cooldown"] as const;
/** A row with no drill and no diagram. */
export type BlockKind = (typeof BLOCK_KINDS)[number];

/** Each block kind's label when the coach leaves it empty, and its starting minutes. */
export const BLOCK_DEFAULTS: Record<BlockKind, { label: string; minutes: number }> = {
    warmup: { label: "Warm-up", minutes: 8 },
    break: { label: "Water break", minutes: 2 },
    transition: { label: "Transition", minutes: 2 },
    cooldown: { label: "Cool-down", minutes: 5 },
};

export const MAX_BLOCK_LABEL_LENGTH = 60;
/** A station block rotates groups every 1–30 minutes. */
export const MIN_ROTATE_MINUTES = 1;
export const MAX_ROTATE_MINUTES = 30;
/** The gap between blocks: 0–5 minutes. */
export const MAX_TRANSITION_MINUTES = 5;

// ============================================================================
// Practice staff: who runs each row
// ============================================================================

/** A practice lists at most this many staff (spec R2). */
export const MAX_SESSION_STAFF = 12;
/** A row is run by at most this many of them. */
export const MAX_ROW_STAFF = 4;
/** A staff name is 1–60 characters once cleaned. */
export const STAFF_NAME_MAX = 60;

/**
 * One person on a practice's staff. `id` is the stored id, or the editor's key
 * for someone not saved yet. Hosted only: linked to a team official or a team
 * admin, never both; a typed name has neither. Never carries an email (spec R4).
 */
export interface SessionStaffMember {
    id: string;
    name: string;
    teamOfficialId?: string | null;
    userId?: string | null;
}

/** A team official or team admin the hosted picker offers (spec R4). No email, ever. */
export interface StaffOption {
    kind: "official" | "admin";
    /** The TeamOfficial id, or the admin's User id */
    id: string;
    name: string;
    /** "Head Coach", "Assistant Coach"…, or "Team admin" */
    roleLabel: string;
}

/**
 * A logo ready for a bench sheet or an export (practice logo spec R2): a PNG
 * data URL that fits 512×512 and is at most 200 KB (isLogoImage).
 */
export interface LogoImage {
    dataUrl: string;
    width: number;
    height: number;
}

/**
 * The team identity a practice shows (spec R5). Hosted: the team. Static: the
 * device's "Your team" profile. `id` seeds the Crest's fallback color.
 */
export interface TeamMark {
    id: string;
    name: string;
    /** What the on-screen Crest draws: a hosted blob URL, or the static profile's PNG data URL. */
    logoUrl: string | null;
    /** The owner's brand color; null = the Crest's derived color. */
    color: string | null;
    /** Export-ready logo when the platform already holds one (static). Absent: hosted fetches it (getPracticeLogoImage). */
    logoImage?: LogoImage | null;
}

/** The static planner's device-wide "Your team" (spec R4). Plan files never carry it. */
export interface TeamProfile {
    name: string;
    logo: LogoImage | null;
    primaryColor: string | null;
    secondaryColor: string | null;
}

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

// ============================================================================
// Ice area (practice planner 2a)
// ============================================================================

/** Full ice, halves, zones, then the six quarters (a zone's top or bottom half). */
export const ICE_AREA_PRESETS = [
    "full",
    "half-left",
    "half-right",
    "zone-left",
    "zone-neutral",
    "zone-right",
    "zone-left-top",
    "zone-left-bottom",
    "zone-neutral-top",
    "zone-neutral-bottom",
    "zone-right-top",
    "zone-right-bottom",
] as const;
export type IceAreaPreset = (typeof ICE_AREA_PRESETS)[number];

/** Axis-aligned rectangle in rink feet. */
export interface RinkRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export type IceArea = { kind: IceAreaPreset } | { kind: "custom"; rect: RinkRect };

/** Smallest custom-area side in feet (schema and area tool). */
export const MIN_AREA_FT = 20;
/** Grid the area tool snaps custom rectangles to, in feet. UI only: the server does not require it. */
export const AREA_SNAP_FT = 5;

export interface PlayData {
    version: typeof PLAY_DATA_VERSION;
    players: PlayerIcon[];
    drawings: DrawingElement[];
    equipment: EquipmentItem[];
    annotations: TextAnnotation[];
    /** Where on the ice the drill runs. Absent = full ice. */
    area?: IceArea;
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
    /** Stable client-side key for this card; sent to the server as clientKey. */
    id: string;
    playId: string;
    /** Drill name (the session's own copy once saved). */
    name: string;
    description?: string;
    sequence: number;
    /** Runs at the same time as the previous drill: a station (2b). */
    runsWithPrevious: boolean;
    /** Absent = a drill: every row saved before practice timing. */
    kind?: "drill";
    /** In a rotating station block: this station's group doesn't rotate (spec R3). */
    stays?: boolean;
    /** On the first drill of a station block: groups rotate every this many minutes. */
    rotateEveryMinutes?: number | null;
    /** Staff keys running this row, in order (spec R3). Sent only with the session's staff list. */
    staff?: string[];
    duration: number; // minutes
    instructions: string;
    playData: PlayData;
    focus?: PlayFocus;
    goalies?: PlayGoalies;
    /** Age groups (age-group templates R2); absent or [] = every age. */
    ageGroups?: AgeGroup[];
    /**
     * The stored diagram couldn't be read, so `playData` is an empty board
     * stand-in. Station warnings skip such a drill rather than treating its
     * missing area as full ice (2b). Cleared when the drill dialog saves a
     * fresh diagram.
     */
    playDataUnreadable?: boolean;
    thumbnail?: string; // base64 PNG thumbnail
}

/**
 * A warm-up, water break, transition or cool-down in the session editor
 * (spec R1, R8). No drill, no diagram; `instructions` is its note.
 */
export interface BlockInSession {
    /** Stable client-side key; sent to the server as clientKey. */
    id: string;
    kind: BlockKind;
    /** "" = the kind's default label. */
    label: string;
    sequence: number;
    duration: number; // minutes
    instructions: string;
    /** Always false: a block never runs as a station (spec R3). */
    runsWithPrevious: boolean;
    /** Staff keys running this row, in order (spec R3). Sent only with the session's staff list. */
    staff?: string[];
}

/** One row in the session editor. Narrow with isDrillRow before reading drill fields. */
export type SessionItem = PlayInSession | BlockInSession;

/**
 * Complete practice session data
 * Requirements: 2.1, 2.2, 2.3, 2.5
 */
export interface PracticeSessionData {
    id?: string;
    title: string;
    date: Date;
    duration: number; // minutes
    plays: SessionItem[];
    isShared: boolean;
    /** Goalies expected at this practice; null or absent = not set (spec R6, R7). */
    goaliesAttending?: number | null;
    /** Minutes between blocks (0–5). Absent = unchanged on save; reads as 0. */
    transitionMinutes?: number;
    /** The practice's staff. Absent = unchanged on save (spec R3); reads as none. */
    staff?: SessionStaffMember[];
}

/**
 * One drill row on the read-only session views (the detail page and the bench sheet).
 * playData is null when the stored diagram can't be read.
 */
export interface PracticeSessionViewPlay {
    id: string;
    sequence: number;
    duration: number;
    instructions: string | null;
    runsWithPrevious: boolean;
    kind?: "drill";
    stays?: boolean;
    rotateEveryMinutes?: number | null;
    /** Staff ids running this row, in order; names come from the session's list (spec R11). */
    staff?: string[];
    play: {
        id: string;
        name: string;
        description: string | null;
        thumbnail: string | null;
        playData: PlayData | null;
        focus?: PlayFocus;
        goalies?: PlayGoalies;
        ageGroups?: AgeGroup[];
    };
}

/** A block row on the read-only session views: a label and minutes, no drill. */
export interface PracticeSessionViewBlock {
    id: string;
    kind: BlockKind;
    /** null = the kind's default label */
    label: string | null;
    sequence: number;
    duration: number;
    /** The block's note */
    instructions: string | null;
    runsWithPrevious: boolean;
    /** Staff ids running this row, in order; names come from the session's list (spec R11). */
    staff?: string[];
}

export type DrillRow = PracticeSessionViewPlay;
export type BlockRow = PracticeSessionViewBlock;
/** One row on the read-only views. A BlockRow has no `play`: narrow on `kind` first. */
export type SessionRow = DrillRow | BlockRow;

/**
 * A session as the detail page and the bench sheet show it. The venue fields
 * are absent or null for an unbooked practice (feature 006, FR-019).
 */
export interface PracticeSessionView {
    id: string;
    title: string;
    date: string;
    duration: number;
    isShared: boolean;
    createdByName: string;
    teamId: string;
    teamName: string;
    /** The team's mark (spec R5); absent or null shows none. */
    teamMark?: TeamMark | null;
    venueId?: string | null;
    venueName?: string | null;
    venueTimezone?: string | null;
    surfaceId?: string | null;
    surfaceName?: string | null;
    segmentId?: string | null;
    segmentName?: string | null;
    segmentKind?: SegmentKind | null;
    startAt?: string | null;
    goaliesAttending?: number | null;
    /** Minutes between blocks (0–5); absent reads as 0. */
    transitionMinutes?: number;
    /** The practice's staff, in list order; absent reads as none. */
    staff?: SessionStaffMember[];
    plays: SessionRow[];
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
    focus?: PlayFocus;
    goalies?: PlayGoalies;
    ageGroups?: AgeGroup[];
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
