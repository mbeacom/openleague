/**
 * Play-data schema, versioning, and safe parsing for the practice planner.
 *
 * Every place that turns a stored `Play.playData` JSON value into `PlayData`
 * MUST go through `parseStoredPlayData` (or `upgradePlayData`): rows saved
 * before v2 still exist in the database and only upgrade when next saved.
 * Pure module: safe to import from Server Actions and Client Components.
 */

import { z } from "zod";
import {
    EQUIPMENT_KINDS,
    PLAY_DATA_VERSION,
    PLAYER_ROLES,
    STROKE_ACTIONS,
    STROKE_ENDS,
    STROKE_PATHS,
    VALIDATION_CONSTRAINTS as C,
    type PlayData,
    type Position,
    type StrokeOptions,
} from "@/types/practice-planner";

/** Mirrors RINK_DIMENSIONS in lib/utils/canvas/rink-renderer.ts (asserted in tests). */
export const RINK_WIDTH_FT = 200;
export const RINK_HEIGHT_FT = 85;

const MAX_STROKE_WIDTH = 20;
const MAX_FONT_SIZE = 200;
const MAX_ID_LENGTH = 100;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export class PlayDataError extends Error {
    constructor(message: string, cause?: unknown) {
        super(message, { cause });
        this.name = "PlayDataError";
    }
}

const idSchema = z.string().min(1).max(MAX_ID_LENGTH);
const colorSchema = z.string().regex(HEX_COLOR);
const positionSchema = z.object({
    x: z.number().min(0).max(RINK_WIDTH_FT),
    y: z.number().min(0).max(RINK_HEIGHT_FT),
});

const playerSchema = z.object({
    id: idSchema,
    position: positionSchema,
    role: z.enum(PLAYER_ROLES),
    label: z.string().max(C.MAX_PLAYER_LABEL_LENGTH),
    color: colorSchema,
});

const drawingSchema = z.object({
    id: idSchema,
    action: z.enum(STROKE_ACTIONS),
    path: z.enum(STROKE_PATHS),
    end: z.enum(STROKE_ENDS),
    points: z.array(positionSchema).min(2).max(C.MAX_STROKE_POINTS),
    color: colorSchema,
    strokeWidth: z.number().positive().max(MAX_STROKE_WIDTH),
});

const equipmentSchema = z.object({
    id: idSchema,
    kind: z.enum(EQUIPMENT_KINDS),
    position: positionSchema,
    rotation: z.number().min(0).lt(360),
});

const annotationSchema = z.object({
    id: idSchema,
    text: z.string().max(C.MAX_ANNOTATION_LENGTH).refine((t) => t.trim().length > 0, "Text is required"),
    position: positionSchema,
    fontSize: z.number().positive().max(MAX_FONT_SIZE),
    color: colorSchema,
});

export const playDataSchema = z
    .object({
        version: z.literal(PLAY_DATA_VERSION),
        players: z.array(playerSchema).max(C.MAX_PLAYERS),
        drawings: z.array(drawingSchema).max(C.MAX_DRAWINGS),
        equipment: z.array(equipmentSchema).max(C.MAX_EQUIPMENT),
        annotations: z.array(annotationSchema).max(C.MAX_ANNOTATIONS),
    })
    .refine(
        (d) => d.players.length + d.drawings.length + d.equipment.length + d.annotations.length <= C.MAX_ELEMENTS_PER_PLAY,
        { message: `Maximum ${C.MAX_ELEMENTS_PER_PLAY} total elements allowed per play`, path: ["playData"] }
    );

// ---------------------------------------------------------------------------
// v1 (no `version` key). Lenient: mirrors the old hand-written guards, which
// never bounds-checked coordinates or capped point counts.
// ---------------------------------------------------------------------------

const looseXY = z.object({ x: z.number(), y: z.number() });

const v1Schema = z.object({
    players: z.array(z.object({ id: z.string().min(1), position: looseXY, label: z.string(), color: colorSchema })),
    drawings: z.array(
        z.object({
            id: z.string().min(1),
            type: z.enum(["line", "curve", "arrow"]),
            points: z.array(looseXY).min(2),
            color: colorSchema,
            strokeWidth: z.number().positive(),
        })
    ),
    annotations: z.array(
        z.object({ id: z.string().min(1), text: z.string(), position: looseXY, fontSize: z.number().positive(), color: colorSchema })
    ),
});

export function strokeFromV1Type(type: "line" | "curve" | "arrow"): StrokeOptions {
    switch (type) {
        case "line":
            return { action: "line", path: "straight", end: "none" };
        case "arrow":
            return { action: "skate", path: "straight", end: "arrow" };
        case "curve":
            return { action: "skate", path: "freehand", end: "none" };
    }
}

function clampToRink(p: { x: number; y: number }): Position {
    return {
        x: Math.min(RINK_WIDTH_FT, Math.max(0, p.x)),
        y: Math.min(RINK_HEIGHT_FT, Math.max(0, p.y)),
    };
}

/**
 * Drops points closer than `minDistanceFt` to the last kept point (endpoints
 * always kept), then evenly decimates to at most `maxPoints`.
 */
export function simplifyPoints(
    points: Position[],
    minDistanceFt = 0.5,
    maxPoints: number = C.MAX_STROKE_POINTS
): Position[] {
    if (points.length <= 2) return points.map((p) => ({ ...p }));
    maxPoints = Math.max(2, maxPoints);
    const kept: Position[] = [{ ...points[0] }];
    for (let i = 1; i < points.length - 1; i++) {
        const last = kept[kept.length - 1];
        if (Math.hypot(points[i].x - last.x, points[i].y - last.y) >= minDistanceFt) kept.push({ ...points[i] });
    }
    kept.push({ ...points[points.length - 1] });
    if (kept.length <= maxPoints) return kept;
    const step = (kept.length - 1) / (maxPoints - 1);
    return Array.from({ length: maxPoints }, (_, i) => kept[Math.round(i * step)]);
}

export function createEmptyPlayData(): PlayData {
    return { version: PLAY_DATA_VERSION, players: [], drawings: [], equipment: [], annotations: [] };
}

function parseV2(raw: unknown): PlayData {
    const result = playDataSchema.safeParse(raw);
    if (!result.success) throw new PlayDataError("Play data failed validation", result.error);
    return result.data as PlayData;
}

/**
 * A blank label carries no meaning, so on read it is dropped rather than
 * allowed to make the whole drill unreadable. Non-string text is kept so the
 * strict parse still reports it.
 */
function isNotBlankAnnotation(a: unknown): boolean {
    const text = typeof a === "object" && a !== null ? (a as { text?: unknown }).text : undefined;
    return typeof text !== "string" || text.trim().length > 0;
}

/**
 * Returns a resolver for v1 element ids. Ids of at most MAX_ID_LENGTH that are
 * not yet taken are kept as is; over-long or duplicate ids get a deterministic
 * `v1-<kind>-<index>` id (suffixed until unique). The board selects, updates and
 * removes elements by id, so truncation (which can collide) is never used.
 */
function createV1IdResolver(allIds: string[]) {
    const reserved = new Set(allIds.filter((id) => id.length <= MAX_ID_LENGTH));
    const used = new Set<string>();
    return (id: string, kind: string, index: number): string => {
        if (id.length <= MAX_ID_LENGTH && !used.has(id)) {
            used.add(id);
            return id;
        }
        const base = `v1-${kind}-${index}`;
        let candidate = base;
        for (let n = 2; reserved.has(candidate) || used.has(candidate); n++) candidate = `${base}-${n}`;
        used.add(candidate);
        return candidate;
    };
}

/** Converts stored play data of any supported version to v2. Throws PlayDataError. */
export function upgradePlayData(raw: unknown): PlayData {
    if (typeof raw !== "object" || raw === null) throw new PlayDataError("Play data must be an object");

    if ("version" in raw) {
        if ((raw as { version: unknown }).version !== PLAY_DATA_VERSION) {
            throw new PlayDataError(`Unsupported play data version: ${String((raw as { version: unknown }).version)}`);
        }
        const annotations = (raw as { annotations?: unknown }).annotations;
        return parseV2(Array.isArray(annotations) ? { ...raw, annotations: annotations.filter(isNotBlankAnnotation) } : raw);
    }

    const v1 = v1Schema.safeParse(raw);
    if (!v1.success) throw new PlayDataError("Unrecognized play data", v1.error);

    const resolveId = createV1IdResolver([
        ...v1.data.players.map((p) => p.id),
        ...v1.data.drawings.map((d) => d.id),
        ...v1.data.annotations.map((a) => a.id),
    ]);

    return parseV2({
        version: PLAY_DATA_VERSION,
        players: v1.data.players.map((p, i) => ({
            id: resolveId(p.id, "player", i),
            position: clampToRink(p.position),
            role: "X",
            label: p.label.slice(0, C.MAX_PLAYER_LABEL_LENGTH),
            color: p.color,
        })),
        drawings: v1.data.drawings.map((d, i) => ({
            id: resolveId(d.id, "drawing", i),
            ...strokeFromV1Type(d.type),
            points: simplifyPoints(d.points.map(clampToRink), 0),
            color: d.color,
            strokeWidth: Math.min(MAX_STROKE_WIDTH, d.strokeWidth),
        })),
        equipment: [],
        annotations: v1.data.annotations
            .map((a, i) => ({
                ...a,
                id: resolveId(a.id, "annotation", i),
                text: a.text.slice(0, C.MAX_ANNOTATION_LENGTH),
                fontSize: Math.min(MAX_FONT_SIZE, a.fontSize),
                position: clampToRink(a.position),
            }))
            .filter(isNotBlankAnnotation),
    });
}

export const PLAY_DATA_UNREADABLE_MESSAGE = "This play's diagram couldn't be read.";
export const PLAY_DATA_UNREADABLE_CODE = "PLAY_DATA_UNREADABLE";

export type ParsedPlayData = { ok: true; data: PlayData } | { ok: false; error: PlayDataError };

/** Non-throwing wrapper for read sites. */
export function parseStoredPlayData(raw: unknown): ParsedPlayData {
    try {
        return { ok: true, data: upgradePlayData(raw) };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof PlayDataError ? error : new PlayDataError("Unreadable play data", error),
        };
    }
}

/**
 * For session read paths where plays' playData is display/carry-only and is
 * never written back: an unreadable play becomes an empty board, logged.
 */
export function playDataOrEmpty(raw: unknown, context: string): PlayData {
    const parsed = parseStoredPlayData(raw);
    if (parsed.ok) return parsed.data;
    console.error(`Unreadable playData (${context}):`, parsed.error);
    return createEmptyPlayData();
}
