/**
 * Authored playback steps (animated drill playback R6, R8): the pure edits
 * Steps mode makes, and where each stroke's numbered badge goes. No canvas.
 */
import { VALIDATION_CONSTRAINTS, type DrawingElement, type PlayData, type Position } from "@/types/practice-planner";
import { RINK_HEIGHT_FT, RINK_WIDTH_FT } from "@/lib/utils/play-data";
import { displayStepNumbers, getPlayback } from "./playback";
import { strokeCenterline } from "./stroke-geometry";
import { hitTest } from "./interaction-utils";

/** How far a badge sits to the side of its stroke's first point, clear of the marker there. */
export const STEP_BADGE_OFFSET_FT = 4.5;

const isAnimated = (d: DrawingElement) => d.action !== "line" && d.points.length > 0;

function withoutStep(d: DrawingElement): DrawingElement {
    const { step: _step, ...rest } = d;
    void _step;
    return rest;
}

/** True when any stroke has an authored step. */
export function hasAuthoredSteps(data: PlayData): boolean {
    return data.drawings.some((d) => isAnimated(d) && typeof d.step === "number");
}

/** The highest authored step, or 0 when there is none. */
export function highestStep(data: PlayData): number {
    return Math.max(0, ...data.drawings.filter(isAnimated).map((d) => d.step ?? 0));
}

/**
 * A tap in Steps mode: gives the stroke step `step`, or removes its step when
 * it already has that one. Plain lines and unknown ids change nothing, and
 * neither does a step out of range; both return `data` itself.
 */
export function assignStep(data: PlayData, strokeId: string, step: number): PlayData {
    if (!Number.isInteger(step) || step < 1 || step > VALIDATION_CONSTRAINTS.MAX_STROKE_STEP) return data;
    const stroke = data.drawings.find((d) => d.id === strokeId);
    if (!stroke || !isAnimated(stroke)) return data;
    const next = stroke.step === step ? withoutStep(stroke) : { ...stroke, step };
    return { ...data, drawings: data.drawings.map((d) => (d.id === strokeId ? next : d)) };
}

/** Each stroke its own step, in drawing order (capped at the last step). */
export function numberInDrawingOrder(data: PlayData): PlayData {
    let n = 0;
    const drawings = data.drawings.map((d) => {
        if (!isAnimated(d)) return d;
        n = Math.min(VALIDATION_CONSTRAINTS.MAX_STROKE_STEP, n + 1);
        return d.step === n ? d : { ...d, step: n };
    });
    return drawings.every((d, i) => d === data.drawings[i]) ? data : { ...data, drawings };
}

/** Removes every step, so the drill plays in the automatic order again. */
export function clearSteps(data: PlayData): PlayData {
    if (!data.drawings.some((d) => d.step !== undefined)) return data;
    return { ...data, drawings: data.drawings.map((d) => (d.step === undefined ? d : withoutStep(d))) };
}

export type StepBadgeKind = "authored" | "automatic" | "unset";

export interface StepBadge {
    strokeId: string;
    /** Rink feet. */
    position: Position;
    /** "1", "2"…, or "–" for a stroke with no step in a drill that has some. */
    label: string;
    kind: StepBadgeKind;
}

/** Beside the stroke's first point, on its left as it travels, kept on the ice. */
function badgePosition(stroke: DrawingElement): Position {
    const line = strokeCenterline(stroke);
    const a = line[0];
    const b = line.find((p) => p.x !== a.x || p.y !== a.y) ?? { x: a.x + 1, y: a.y };
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = (a.y - b.y) / len;
    const ny = (b.x - a.x) / len;
    const r = STEP_BADGE_OFFSET_FT;
    return {
        x: Math.min(RINK_WIDTH_FT - r / 2, Math.max(r / 2, a.x + nx * r)),
        y: Math.min(RINK_HEIGHT_FT - r / 2, Math.max(r / 2, a.y + ny * r)),
    };
}

/**
 * The badges to draw (R8). Authored steps show compacted numbers. With
 * `includeAutomatic` (Steps mode), a drill with no steps shows each stroke's
 * automatic step, and a stroke left without a step in an authored drill shows
 * "–". Without it (still diagrams, print), only authored numbers appear.
 */
export function stepBadges(data: PlayData, { includeAutomatic = false }: { includeAutomatic?: boolean } = {}): StepBadge[] {
    const animated = data.drawings.filter(isAnimated);
    if (hasAuthoredSteps(data)) {
        const shown = displayStepNumbers(data.drawings);
        return animated.flatMap((d): StepBadge[] => {
            const n = shown.get(d.id);
            if (n !== undefined) return [{ strokeId: d.id, position: badgePosition(d), label: String(n), kind: "authored" }];
            return includeAutomatic ? [{ strokeId: d.id, position: badgePosition(d), label: "–", kind: "unset" }] : [];
        });
    }
    if (!includeAutomatic) return [];
    const playback = getPlayback(data);
    const stepOf = new Map(playback.steps.flatMap((step, i) => step.strokeIds.map((id) => [id, i + 1] as const)));
    return animated.flatMap((d): StepBadge[] => {
        const n = stepOf.get(d.id);
        return n === undefined ? [] : [{ strokeId: d.id, position: badgePosition(d), label: String(n), kind: "automatic" }];
    });
}

/** The moving stroke under `point` for a Steps-mode tap (players, items and notes never block it), or null. */
export function stepTapTarget(data: PlayData, point: Position, hitRadiusFt: number): string | null {
    const hit = hitTest(point, { ...data, players: [], equipment: [], annotations: [] }, hitRadiusFt);
    const stroke = hit.hit && hit.elementId ? data.drawings.find((d) => d.id === hit.elementId) : undefined;
    return stroke && isAnimated(stroke) ? stroke.id : null;
}
