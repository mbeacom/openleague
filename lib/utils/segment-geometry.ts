/**
 * Segment geometry utilities — "geometry proposes, declarations decide" (research R1).
 *
 * This module only SUGGESTS coexistence relationships from drawn geometry.
 * Suggestions are advisory (FR-005): staff confirm or override them, and the
 * stored explicit `SegmentCoexistence` pair rows are the sole input to
 * conflict math. Nothing here is consulted at booking time.
 *
 * All coordinates are normalized (0-1) on the surface schematic. Rotation is
 * treated as snapping to the nearest 90 degrees; 90/270 swap width/height
 * around the rect center to produce an axis-aligned bounding box, then plain
 * AABB overlap with an epsilon tolerance is applied. Dependency-free and
 * deterministic.
 */

import type { SegmentGeometry, CoexistenceSuggestion } from "@/types/segments";

/** Default overlap tolerance: boundary-touching or <=1% overlap of either dimension counts as non-overlapping. */
export const DEFAULT_OVERLAP_EPSILON = 0.01;

/** Minimum normalized width/height enforced by {@link normalizeGeometry}. */
export const MIN_SEGMENT_DIMENSION = 0.05;

/** Axis-aligned bounding box in normalized coordinates. */
interface Aabb {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Wrap an angle in degrees into [0, 360). Non-finite input maps to 0. */
function wrapRotation(rotation: number): number {
  if (!Number.isFinite(rotation)) return 0;
  return ((rotation % 360) + 360) % 360;
}

/**
 * Convert a geometry to its axis-aligned bounding box after snapping rotation
 * to the nearest 90 degrees. For effective rotations of 90/270 the width and
 * height are swapped around the rect center.
 */
function toAabb(g: SegmentGeometry): Aabb {
  const quarterTurns = Math.round(wrapRotation(g.rotation) / 90) % 4;
  const swapped = quarterTurns === 1 || quarterTurns === 3;

  const cx = g.x + g.w / 2;
  const cy = g.y + g.h / 2;
  const w = swapped ? g.h : g.w;
  const h = swapped ? g.w : g.h;

  return {
    x1: cx - w / 2,
    y1: cy - h / 2,
    x2: cx + w / 2,
    y2: cy + h / 2,
  };
}

/**
 * True when the two normalized rects overlap with more than a touch (shared
 * area > epsilon in both dimensions).
 *
 * Rotation snaps to the nearest 90 degrees; 90/270 swap w/h around the rect
 * center before the axis-aligned comparison. Exactly touching edges, or a
 * sliver overlap of at most `epsilon` (default 1% of the normalized edge) in
 * either dimension, count as NOT overlapping.
 */
export function rectsOverlap(
  a: SegmentGeometry,
  b: SegmentGeometry,
  epsilon: number = DEFAULT_OVERLAP_EPSILON,
): boolean {
  const boxA = toAabb(a);
  const boxB = toAabb(b);

  const overlapX = Math.min(boxA.x2, boxB.x2) - Math.max(boxA.x1, boxB.x1);
  const overlapY = Math.min(boxA.y2, boxB.y2) - Math.max(boxA.y1, boxB.y1);

  return overlapX > epsilon && overlapY > epsilon;
}

/**
 * Suggested relationships for a candidate zone vs existing segments:
 * non-overlapping => `suggestedCoexist: true`.
 *
 * Advisory only (FR-005): output is presented to staff for confirmation or
 * override and is never written to storage or used for conflict math
 * directly. Result order mirrors the `existing` input order.
 */
export function suggestCoexistence(
  candidate: SegmentGeometry,
  existing: { id: string; name: string; geometry: SegmentGeometry }[],
): CoexistenceSuggestion[] {
  return existing.map((segment) => ({
    otherSegmentId: segment.id,
    otherSegmentName: segment.name,
    suggestedCoexist: !rectsOverlap(candidate, segment.geometry),
  }));
}

/**
 * Clamp/sanitize a geometry into valid normalized bounds (x/y/w/h into [0,1],
 * w/h min 0.05, rotation into [0,360)). Infinities clamp to the nearest valid
 * bound; NaN falls back to 0 for x/y/rotation and to the minimum dimension
 * for w/h. Returns a new object; the input is not mutated.
 */
export function normalizeGeometry(g: SegmentGeometry): SegmentGeometry {
  return {
    x: Number.isNaN(g.x) ? 0 : clamp(g.x, 0, 1),
    y: Number.isNaN(g.y) ? 0 : clamp(g.y, 0, 1),
    w: Number.isNaN(g.w) ? MIN_SEGMENT_DIMENSION : clamp(g.w, MIN_SEGMENT_DIMENSION, 1),
    h: Number.isNaN(g.h) ? MIN_SEGMENT_DIMENSION : clamp(g.h, MIN_SEGMENT_DIMENSION, 1),
    rotation: wrapRotation(g.rotation),
  };
}
