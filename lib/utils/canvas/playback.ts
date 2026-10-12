/**
 * Animated drill playback (animated drill playback design R1–R5): the
 * animation is derived from the strokes already drawn, never authored.
 *
 * `compilePlayback` runs once per diagram: it resolves who moves and which
 * puck travels (R4), schedules every stroke in the automatic order (R3) at
 * the R5 speeds, and precomputes arc-length tables in rink feet. `poseAt`
 * then returns, for any time, an ordinary `PlayData` that the existing board
 * renderer draws unchanged.
 *
 * Pure: no DOM, no canvas, no clock. The same diagram and time always give
 * the same frame. A frame is for drawing only and is never saved.
 */
import type { DrawingElement, EquipmentItem, PlayData, Position, StrokeAction } from "@/types/practice-planner";
import { PLAYER_RADIUS_FT } from "./glyph-metrics";
import { SNAP_RADIUS_FT } from "./line-editing";
import { DIAGRAM_THEME } from "./diagram-theme";
import { ACTION_LABELS, ROLE_LABELS } from "./notation";
import { resampleByArcLength, strokeCenterline } from "./stroke-geometry";

// ============================================================================
// Constants (R3, R5)
// ============================================================================

/** A stroke this close to a player (centre to first point) belongs to that player: a marker's radius plus the snap radius. */
export const ATTACH_RADIUS_FT = PLAYER_RADIUS_FT + SNAP_RADIUS_FT;

export type AnimatedAction = Exclude<StrokeAction, "line">;

/** Rink feet per second at 1×, chosen to be followable by young players rather than realistic. */
export const PLAYBACK_SPEEDS_FT_PER_S: Readonly<Record<AnimatedAction, number>> = {
    skate: 12,
    carry: 10,
    lateral: 9,
    backskate: 8,
    pass: 30,
    shot: 45,
};

export const MIN_STROKE_MS = 600;
export const MAX_STROKE_MS = 10_000;
/** The pause before a stroke that waits for another to finish, so step boundaries are visible. */
export const STEP_BEAT_MS = 400;
/** How long a looping playback holds its last frame before restarting (used by the player). */
export const LOOP_HOLD_MS = 1500;
/** A carried puck rides this far ahead of its skater. */
export const CARRY_LEAD_FT = 2;
/** Spacing of the precomputed arc-length tables. */
export const SAMPLE_SPACING_FT = 0.5;
/** Upcoming strokes are drawn with their colour mixed this far toward the ice. */
export const GHOST_MIX = 0.7;
/** Ids of pucks the diagram doesn't contain carry this prefix (`playback-puck-<strokeId>`). */
export const PLAYBACK_ID_PREFIX = "playback-";

// ============================================================================
// Types
// ============================================================================

export interface PlaybackStep {
    startMs: number;
    endMs: number;
    strokeIds: string[];
}

export interface PlaybackStroke {
    startMs: number;
    endMs: number;
    /** The player who moves (movement strokes) or passes (pass, shot); null when none was found. */
    actorId: string | null;
    /** The puck that travels (pass, shot, carry); null for skating strokes. */
    puckId: string | null;
}

/** An arc-length table: evenly spaced samples and the cumulative length at each. */
interface ArcTable {
    samples: Position[];
    cum: number[];
    total: number;
}

type Easing = "inOut" | "linear";

interface CompiledStroke extends PlaybackStroke {
    id: string;
    action: AnimatedAction;
    easing: Easing;
    /** The drawn line (centerline), used to truncate the active stroke. */
    draw: ArcTable;
    /** What the actor (movement) or puck (pass, shot) follows: from its position at the start, then the centerline. */
    motion: ArcTable;
}

interface MotionSegment {
    strokeId: string;
    table: ArcTable;
    /** A carried puck rides ahead of the skater instead of sitting on the path. */
    lead: number;
}

interface PuckTrack {
    id: string;
    /** Null for a puck the diagram doesn't contain; it appears when its first stroke starts. */
    initial: Position | null;
    firstStrokeId: string | null;
    segments: MotionSegment[];
}

export interface Playback {
    durationMs: number;
    steps: PlaybackStep[];
    strokes: Map<string, PlaybackStroke>;
    /** @internal */
    readonly source: PlayData;
    /** @internal by stroke id */
    readonly compiled: Map<string, CompiledStroke>;
    /** @internal movement segments per player id, in time order */
    readonly playerSegments: Map<string, MotionSegment[]>;
    /** @internal every puck that moves, real or synthetic */
    readonly pucks: PuckTrack[];
}

export interface PlaybackFrame {
    /** What drawBoardScene draws. */
    data: PlayData;
    /** 0-based; -1 before the first stroke starts. */
    stepIndex: number;
    activeStrokeIds: string[];
    completedStrokeIds: string[];
}

export interface CompileOptions {
    speeds?: Partial<Record<AnimatedAction, number>>;
}

// ============================================================================
// Geometry helpers
// ============================================================================

const dist = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.y - b.y);

function arcTable(points: Position[]): ArcTable {
    const samples = points.length > 1 ? resampleByArcLength(points, SAMPLE_SPACING_FT) : points.map((p) => ({ ...p }));
    const cum = [0];
    for (let i = 1; i < samples.length; i++) cum.push(cum[i - 1] + dist(samples[i - 1], samples[i]));
    return { samples, cum, total: cum[cum.length - 1] };
}

/** Index of the last sample at or before arc length `s`. */
function sampleIndexAt(table: ArcTable, s: number): number {
    let lo = 0;
    let hi = table.cum.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (table.cum[mid] <= s) lo = mid;
        else hi = mid - 1;
    }
    return lo;
}

function pointAt(table: ArcTable, s: number): Position {
    const { samples, cum, total } = table;
    if (s <= 0 || samples.length === 1) return { ...samples[0] };
    if (s >= total) return { ...samples[samples.length - 1] };
    const i = sampleIndexAt(table, s);
    const a = samples[i];
    const b = samples[Math.min(i + 1, samples.length - 1)];
    const seg = cum[Math.min(i + 1, cum.length - 1)] - cum[i];
    const w = seg === 0 ? 0 : (s - cum[i]) / seg;
    return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w };
}

/** Unit direction of travel at arc length `s` (zero vector on a degenerate path). */
function tangentAt(table: ArcTable, s: number): Position {
    const { samples } = table;
    if (samples.length < 2) return { x: 0, y: 0 };
    const i = Math.min(sampleIndexAt(table, s), samples.length - 2);
    const a = samples[i];
    const b = samples[i + 1];
    const len = dist(a, b) || 1;
    return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
}

/** The table's samples up to arc length `s`, ending exactly at the point there. */
function truncate(table: ArcTable, s: number): Position[] {
    if (table.samples.length === 1) return [{ ...table.samples[0] }, { ...table.samples[0] }];
    const end = pointAt(table, s);
    const i = sampleIndexAt(table, s);
    const out = table.samples.slice(0, i + 1).map((p) => ({ ...p }));
    const last = out[out.length - 1];
    if (last.x !== end.x || last.y !== end.y) out.push(end);
    if (out.length === 1) out.push({ ...end });
    return out;
}

/** Arc length of the sample nearest `p`, and its distance. */
function nearestOnTable(table: ArcTable, p: Position): { s: number; d: number } {
    let best = { s: 0, d: Infinity };
    table.samples.forEach((q, i) => {
        const d = dist(p, q);
        if (d < best.d) best = { s: table.cum[i], d };
    });
    return best;
}

// ============================================================================
// Easing (closed-form inverse, for "when does the skater reach this point")
// ============================================================================

function ease(easing: Easing, x: number): number {
    const u = Math.min(1, Math.max(0, x));
    return easing === "linear" ? u : 0.5 - 0.5 * Math.cos(Math.PI * u);
}

function inverseEase(easing: Easing, f: number): number {
    const v = Math.min(1, Math.max(0, f));
    return easing === "linear" ? v : Math.acos(1 - 2 * v) / Math.PI;
}

// ============================================================================
// Colour
// ============================================================================

const HEX = /^#([0-9a-f]{6})$/i;

function hexToRgb(color: string): [number, number, number] | null {
    const m = HEX.exec(color);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `color` mixed `amount` (0..1) toward `toward`, as #RRGGBB; a colour that isn't #RRGGBB comes back unchanged. */
export function mixHex(color: string, toward: string, amount: number): string {
    const a = hexToRgb(color);
    const b = hexToRgb(toward);
    if (!a || !b) return color;
    const ch = (i: number) => Math.round(a[i] + (b[i] - a[i]) * amount).toString(16).padStart(2, "0");
    return `#${ch(0)}${ch(1)}${ch(2)}`.toUpperCase();
}

export const ghostColor = (color: string) => mixHex(color, DIAGRAM_THEME.ice, GHOST_MIX);

// ============================================================================
// Compile
// ============================================================================

const isAnimated = (d: DrawingElement): d is DrawingElement & { action: AnimatedAction } =>
    d.action !== "line" && d.points.length > 0;
const isMovement = (a: AnimatedAction) => a !== "pass" && a !== "shot";

/** True when the diagram has something to play: at least one stroke that isn't a plain line. */
export function hasPlayback(playData: PlayData): boolean {
    return playData.drawings.some(isAnimated);
}

/** The candidate nearest `p` within `radius`; ties go to the earlier candidate. */
function nearest<T>(candidates: T[], position: (c: T) => Position | null, p: Position, radius: number): T | null {
    let best: T | null = null;
    let bestD = Infinity;
    for (const c of candidates) {
        const at = position(c);
        if (!at) continue;
        const d = dist(at, p);
        if (d <= radius && d < bestD) {
            best = c;
            bestD = d;
        }
    }
    return best;
}

function strokeDuration(lengthFt: number, ftPerS: number): number {
    const ms = ftPerS > 0 ? (lengthFt / ftPerS) * 1000 : MAX_STROKE_MS;
    return Math.round(Math.min(MAX_STROKE_MS, Math.max(MIN_STROKE_MS, ms)));
}

/** The motion path: from `from` (when it isn't already the first point), then the centerline. */
function motionFrom(from: Position | null, line: Position[]): ArcTable {
    if (!from || dist(from, line[0]) < 1e-6) return arcTable(line);
    return arcTable([from, ...line]);
}

/**
 * Derives the animation for one diagram (R3–R5). Strokes are scheduled in
 * drawing order, and a stroke only ever waits for an earlier-drawn one, so
 * the schedule is acyclic and stable.
 */
export function compilePlayback(playData: PlayData, options: CompileOptions = {}): Playback {
    const speeds = { ...PLAYBACK_SPEEDS_FT_PER_S, ...options.speeds };
    const players = playData.players;

    // Where each player and puck is after the strokes scheduled so far, and when it is free.
    const playerAt = new Map<string, Position>(players.map((p) => [p.id, { ...p.position }]));
    const playerFreeAt = new Map<string, number>();
    const pucks: PuckTrack[] = playData.equipment
        .filter((e) => e.kind === "puck")
        .map((e) => ({ id: e.id, initial: { ...e.position }, firstStrokeId: null, segments: [] }));
    const puckAt = new Map<string, Position>(pucks.map((p) => [p.id, { ...(p.initial as Position) }]));
    const puckFreeAt = new Map<string, number>();
    const playerSegments = new Map<string, MotionSegment[]>();

    const compiled = new Map<string, CompiledStroke>();
    const order: CompiledStroke[] = [];

    const findPuck = (p: Position) => nearest(pucks, (t) => puckAt.get(t.id) ?? null, p, ATTACH_RADIUS_FT);
    const newPuck = (strokeId: string, at: Position): PuckTrack => {
        const track: PuckTrack = { id: `${PLAYBACK_ID_PREFIX}puck-${strokeId}`, initial: null, firstStrokeId: strokeId, segments: [] };
        pucks.push(track);
        puckAt.set(track.id, { ...at });
        return track;
    };
    const pushSegment = (playerId: string, segment: MotionSegment) => {
        const list = playerSegments.get(playerId) ?? [];
        list.push(segment);
        playerSegments.set(playerId, list);
    };

    for (const drawing of playData.drawings) {
        if (!isAnimated(drawing) || compiled.has(drawing.id)) continue;
        const action = drawing.action;
        const line = strokeCenterline(drawing);
        const draw = arcTable(line);
        const first = line[0];
        const duration = strokeDuration(draw.total, speeds[action]);
        const easing: Easing = isMovement(action) ? "inOut" : "linear";
        /** Earliest start: each dependency's time plus the beat. */
        const waits: number[] = [0];
        let actorId: string | null = null;
        let puck: PuckTrack | null = null;
        let motion: ArcTable = draw;
        let onTheMoveAt: number | null = null;

        if (isMovement(action)) {
            // R4 rule 3: the nearest player (where they are by now) within the attach radius.
            const atRest = nearest(players, (p) => playerAt.get(p.id) ?? null, first, ATTACH_RADIUS_FT);
            // R4 rule 4: the actor of an earlier route this one continues.
            const chained = nearest(
                order.filter((s) => isMovement(s.action)),
                (s) => s.draw.samples[s.draw.samples.length - 1],
                first,
                SNAP_RADIUS_FT
            );
            actorId = atRest?.id ?? chained?.actorId ?? null;
            if (actorId) {
                const at = playerAt.get(actorId) as Position;
                // R3 rule 1: one route at a time.
                const free = playerFreeAt.get(actorId);
                if (free !== undefined) waits.push(free + STEP_BEAT_MS);
                // R3 rule 2: receive before you go.
                for (const prior of order) {
                    if (prior.action !== "pass") continue;
                    const end = prior.draw.samples[prior.draw.samples.length - 1];
                    if (dist(end, at) <= ATTACH_RADIUS_FT) waits.push(prior.endMs + STEP_BEAT_MS);
                }
                motion = motionFrom(at, line);
            } else if (chained) {
                // A route with no skater still draws itself in order.
                waits.push(chained.endMs + STEP_BEAT_MS);
            }
            if (action === "carry") {
                puck = findPuck(first) ?? newPuck(drawing.id, first);
                const free = puckFreeAt.get(puck.id);
                if (free !== undefined) waits.push(free + STEP_BEAT_MS);
            }
        } else {
            // Pass or shot: from a resting player, else on the move (R3 rule 3), else from nowhere in particular.
            const atRest = nearest(players, (p) => playerAt.get(p.id) ?? null, first, ATTACH_RADIUS_FT);
            if (atRest) {
                actorId = atRest.id;
                const free = playerFreeAt.get(actorId);
                if (free !== undefined) waits.push(free + STEP_BEAT_MS);
            } else {
                let carrier: { stroke: CompiledStroke; s: number; d: number } | null = null;
                for (const prior of order) {
                    if (!isMovement(prior.action)) continue;
                    const hit = nearestOnTable(prior.motion, first);
                    if (hit.d <= ATTACH_RADIUS_FT && (!carrier || hit.d < carrier.d)) carrier = { stroke: prior, ...hit };
                }
                if (carrier) {
                    const { stroke, s } = carrier;
                    actorId = stroke.actorId;
                    const fraction = stroke.motion.total === 0 ? 0 : s / stroke.motion.total;
                    onTheMoveAt = Math.round(
                        stroke.startMs + inverseEase(stroke.easing, fraction) * (stroke.endMs - stroke.startMs)
                    );
                    waits.push(onTheMoveAt);
                }
            }
            puck = findPuck(first);
            if (puck) {
                const free = puckFreeAt.get(puck.id);
                if (free !== undefined) waits.push(free + STEP_BEAT_MS);
                motion = motionFrom(puckAt.get(puck.id) ?? null, line);
            } else {
                puck = newPuck(drawing.id, first);
            }
        }

        const startMs = Math.max(...waits);
        const stroke: CompiledStroke = {
            id: drawing.id,
            action,
            easing,
            draw,
            motion,
            startMs,
            endMs: startMs + duration,
            actorId,
            puckId: puck?.id ?? null,
        };
        compiled.set(stroke.id, stroke);
        order.push(stroke);

        // Book-keeping: where everyone is after this stroke, and when they're free.
        const lastPoint = line[line.length - 1];
        if (isMovement(action)) {
            if (actorId) {
                pushSegment(actorId, { strokeId: stroke.id, table: motion, lead: 0 });
                playerAt.set(actorId, { ...lastPoint });
                playerFreeAt.set(actorId, stroke.endMs);
            }
            if (puck) {
                if (actorId) {
                    const lead = CARRY_LEAD_FT;
                    puck.segments.push({ strokeId: stroke.id, table: motion, lead });
                    const t = tangentAt(motion, motion.total);
                    puckAt.set(puck.id, { x: lastPoint.x + t.x * lead, y: lastPoint.y + t.y * lead });
                } else {
                    puck.segments.push({ strokeId: stroke.id, table: draw, lead: 0 });
                    puckAt.set(puck.id, { ...lastPoint });
                }
                puckFreeAt.set(puck.id, stroke.endMs);
            }
        } else {
            if (puck) {
                puck.segments.push({ strokeId: stroke.id, table: motion, lead: 0 });
                puckAt.set(puck.id, { ...lastPoint });
                puckFreeAt.set(puck.id, stroke.endMs);
            }
            // A passer at rest may move off once the puck is away.
            if (actorId && onTheMoveAt === null) {
                playerFreeAt.set(actorId, Math.max(playerFreeAt.get(actorId) ?? 0, startMs));
            }
        }
    }

    // Steps: the distinct start times, in order.
    const byStart = new Map<number, CompiledStroke[]>();
    for (const s of order) byStart.set(s.startMs, [...(byStart.get(s.startMs) ?? []), s]);
    const steps: PlaybackStep[] = [...byStart.keys()]
        .sort((a, b) => a - b)
        .map((startMs) => {
            const group = byStart.get(startMs) as CompiledStroke[];
            return { startMs, endMs: Math.max(...group.map((s) => s.endMs)), strokeIds: group.map((s) => s.id) };
        });

    const strokes = new Map<string, PlaybackStroke>(
        order.map((s) => [s.id, { startMs: s.startMs, endMs: s.endMs, actorId: s.actorId, puckId: s.puckId }])
    );

    return {
        durationMs: order.length ? Math.max(...order.map((s) => s.endMs)) : 0,
        steps,
        strokes,
        source: playData,
        compiled,
        playerSegments,
        pucks,
    };
}

const cache = new WeakMap<PlayData, Playback>();

/** compilePlayback with default options, memoized on the PlayData reference. */
export function getPlayback(playData: PlayData): Playback {
    let playback = cache.get(playData);
    if (!playback) {
        playback = compilePlayback(playData);
        cache.set(playData, playback);
    }
    return playback;
}

// ============================================================================
// Pose
// ============================================================================

/** Each stroke's progress: "upcoming", or the eased fraction travelled (1 = complete). */
type Progress = (stroke: CompiledStroke) => "upcoming" | number;

function poseAlong(start: Position, segments: MotionSegment[], playback: Playback, progress: Progress): Position {
    let at = start;
    for (const seg of segments) {
        const stroke = playback.compiled.get(seg.strokeId) as CompiledStroke;
        const p = progress(stroke);
        if (p === "upcoming") break;
        const s = p * seg.table.total;
        const base = pointAt(seg.table, s);
        if (seg.lead) {
            const t = tangentAt(seg.table, s);
            at = { x: base.x + t.x * seg.lead, y: base.y + t.y * seg.lead };
        } else {
            at = base;
        }
        if (p < 1) break;
    }
    return at;
}

function composeFrame(playback: Playback, progress: Progress, stepIndex: number): PlaybackFrame {
    const source = playback.source;
    const activeStrokeIds: string[] = [];
    const completedStrokeIds: string[] = [];

    const drawings = source.drawings.map((d): DrawingElement => {
        const stroke = playback.compiled.get(d.id);
        if (!stroke) return d;
        const p = progress(stroke);
        if (p === "upcoming") return { ...d, color: ghostColor(d.color) };
        if (p >= 1) {
            completedStrokeIds.push(d.id);
            return d;
        }
        activeStrokeIds.push(d.id);
        // Already a centerline, so drawn as straight segments (smoothing isn't applied twice).
        return {
            ...d,
            path: "straight",
            points: truncate(stroke.draw, p * stroke.draw.total),
            end: d.end === "arrow" ? "arrow" : "none",
        };
    });

    const players = source.players.map((player) => {
        const segments = playback.playerSegments.get(player.id);
        if (!segments) return player;
        const position = poseAlong(player.position, segments, playback, progress);
        return position.x === player.position.x && position.y === player.position.y ? player : { ...player, position };
    });

    const tracks = new Map(playback.pucks.map((t) => [t.id, t]));
    const posePuck = (track: PuckTrack, initial: Position) => poseAlong(initial, track.segments, playback, progress);
    const equipment: EquipmentItem[] = source.equipment.map((item) => {
        const track = tracks.get(item.id);
        return track && track.segments.length ? { ...item, position: posePuck(track, item.position) } : item;
    });
    for (const track of playback.pucks) {
        if (track.initial || !track.firstStrokeId) continue;
        const first = playback.compiled.get(track.firstStrokeId) as CompiledStroke;
        // A puck the diagram doesn't contain appears when its first stroke starts.
        if (progress(first) === "upcoming") continue;
        equipment.push({ id: track.id, kind: "puck", position: posePuck(track, first.draw.samples[0]), rotation: 0 });
    }

    return { data: { ...source, drawings, players, equipment }, stepIndex, activeStrokeIds, completedStrokeIds };
}

/** The frame at `tMs` (clamped to [0, durationMs]). Strokes are upcoming until their start, complete from their end. */
export function poseAt(playback: Playback, tMs: number): PlaybackFrame {
    const t = Math.min(playback.durationMs, Math.max(0, Number.isFinite(tMs) ? tMs : 0));
    const progress: Progress = (s) => {
        if (t <= s.startMs) return "upcoming";
        if (t >= s.endMs) return 1;
        return ease(s.easing, (t - s.startMs) / (s.endMs - s.startMs));
    };
    const stepIndex = playback.steps.filter((step) => step.startMs < t).length - 1;
    return composeFrame(playback, progress, stepIndex);
}

/**
 * The end state of step `stepIndex` with no tweening (reduced motion, R9):
 * every stroke of that step and the ones before it complete, the rest upcoming.
 * -1 is the diagram before anything moves.
 */
export function poseStep(playback: Playback, stepIndex: number): PlaybackFrame {
    const last = Math.min(playback.steps.length - 1, Math.max(-1, Math.floor(stepIndex)));
    const done = new Set(playback.steps.slice(0, last + 1).flatMap((s) => s.strokeIds));
    return composeFrame(playback, (s) => (done.has(s.id) ? 1 : "upcoming"), last);
}

/** Convenience for tests and one-off frames. */
export function posePlayData(playData: PlayData, tMs: number): PlayData {
    return poseAt(getPlayback(playData), tMs).data;
}

// ============================================================================
// Captions (R9)
// ============================================================================

/** "LW: Puck carry · D1: Pass" for one step; "" for -1 or past the end. */
export function describeStep(playback: Playback, stepIndex: number): string {
    const step = playback.steps[stepIndex];
    if (!step) return "";
    const players = new Map(playback.source.players.map((p) => [p.id, p]));
    return step.strokeIds
        .map((id) => {
            const stroke = playback.compiled.get(id) as CompiledStroke;
            const actor = stroke.actorId ? players.get(stroke.actorId) : undefined;
            const action = ACTION_LABELS[stroke.action];
            if (!actor) return action;
            return `${actor.label.trim() || ROLE_LABELS[actor.role]}: ${action}`;
        })
        .join(" · ");
}
